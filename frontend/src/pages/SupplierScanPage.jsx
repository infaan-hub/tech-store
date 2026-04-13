import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { http } from "../api/http.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getApiErrorMessage } from "../lib/apiErrors.js";

const DETECTOR_FORMATS = [
  "qr_code",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "data_matrix",
  "pdf417",
];

function normalizeCode(value) {
  return String(value || "").trim().toLowerCase();
}

function codeCandidates(value) {
  const raw = String(value || "").trim();
  const candidates = new Set([raw]);

  try {
    const url = new URL(raw);
    const productMatch = url.pathname.match(/\/products\/([^/]+)/i);
    if (productMatch?.[1]) candidates.add(productMatch[1]);
    const barcode = url.searchParams.get("barcode");
    if (barcode) candidates.add(barcode);
    const productId = url.searchParams.get("product");
    if (productId) candidates.add(productId);
  } catch {
    const productMatch = raw.match(/\/products\/([^/?#]+)/i);
    if (productMatch?.[1]) candidates.add(productMatch[1]);
  }

  return Array.from(candidates).map(normalizeCode).filter(Boolean);
}

function matchProduct(products, scannedValue) {
  const candidates = codeCandidates(scannedValue);
  return products.find((product) => {
    const knownValues = [
      product.barcode,
      product.slug,
      product.id,
      product.name,
      `/products/${product.id}`,
      `/products/${product.slug}`,
    ].map(normalizeCode);
    return candidates.some((candidate) => knownValues.includes(candidate));
  });
}

function getBarcodeDetector() {
  if (!("BarcodeDetector" in window)) return null;
  try {
    return new window.BarcodeDetector({ formats: DETECTOR_FORMATS });
  } catch {
    return new window.BarcodeDetector();
  }
}

async function createZxingReader() {
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  return new BrowserMultiFormatReader();
}

function SupplierScanPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const scanTimerRef = useRef(null);
  const streamRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const zxingReaderRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const detectorSupported = typeof window !== "undefined" && "BarcodeDetector" in window;
  const scannerEngine = detectorSupported ? "BarcodeDetector" : "ZXing fallback";

  const productCount = products.length;

  const setScanResult = useCallback((value, source) => {
    const product = matchProduct(products, value);
    setResult({
      source,
      value,
      product,
      matched: Boolean(product),
    });
    setStatus(product ? "Product matched to your supplier products." : "Code scanned, but it does not match your assigned products.");
  }, [products]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await http.get("/api/supplier/dashboard/");
      setProducts(Array.isArray(response.data?.products) ? response.data.products : []);
    } catch (err) {
      if ([401, 403].includes(err.response?.status)) {
        logout();
        navigate("/supplier/login", { replace: true });
        return;
      }
      setError(getApiErrorMessage(err, "Cannot load supplier products for scanner."));
    } finally {
      setLoading(false);
    }
  }, [logout, navigate]);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  const scanVideoFrame = useCallback(async (detector) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      scanTimerRef.current = window.setTimeout(() => scanVideoFrame(detector), 350);
      return;
    }

    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        setScanResult(codes[0].rawValue, "Camera scan");
        stopCamera();
        return;
      }
    } catch {
      setError("Camera scan failed. Try better lighting or enter the code manually.");
    }
    scanTimerRef.current = window.setTimeout(() => scanVideoFrame(detector), 450);
  }, [setScanResult, stopCamera]);

  const startCamera = async () => {
    setError("");
    setStatus("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot open the camera. Please use HTTPS, allow camera permission, or upload a receipt image.");
      return;
    }

    try {
      if (!detectorSupported) {
        if (!zxingReaderRef.current) zxingReaderRef.current = await createZxingReader();
        setCameraActive(true);
        setStatus("Camera permission requested. Scanning with ZXing fallback.");
        zxingControlsRef.current = await zxingReaderRef.current.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (scanResult) => {
            if (!scanResult) return;
            setScanResult(scanResult.getText(), "Camera scan");
            stopCamera();
          }
        );
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraActive(true);
      const detector = getBarcodeDetector();
      if (!detector) {
        setError("Camera opened, but barcode scanning could not start.");
        stopCamera();
        return;
      }
      scanVideoFrame(detector);
    } catch {
      setError("Camera could not open. Please allow camera permission and try again.");
    }
  };

  const scanReceiptImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setStatus("");
    setReceiptPreview(URL.createObjectURL(file));

    if (!detectorSupported) {
      try {
        if (!zxingReaderRef.current) zxingReaderRef.current = await createZxingReader();
        const imageUrl = URL.createObjectURL(file);
        const code = await zxingReaderRef.current.decodeFromImageUrl(imageUrl);
        setScanResult(code.getText(), "Receipt image");
      } catch {
        setError("No QR/barcode found in the receipt image. Try a clearer image or enter the code manually.");
      }
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const detector = getBarcodeDetector();
      if (!detector) {
        setError("This browser cannot scan barcodes from images. Enter the receipt/product code manually.");
        return;
      }
      const codes = await detector.detect(bitmap);
      if (!codes.length) {
        setError("No QR/barcode found in the receipt image. Try a clearer image or enter the code manually.");
        return;
      }
      setScanResult(codes[0].rawValue, "Receipt image");
    } catch {
      setError("Receipt image scan failed. Try another image or enter the code manually.");
    }
  };

  const submitManualCode = (event) => {
    event.preventDefault();
    if (!manualCode.trim()) return;
    setScanResult(manualCode, "Manual entry");
  };

  useEffect(() => {
    loadProducts();
    return () => stopCamera();
  }, [loadProducts, stopCamera]);

  const matchedProductDetails = useMemo(() => {
    if (!result?.product) return null;
    return [
      ["Name", result.product.name],
      ["Barcode", result.product.barcode || "No barcode"],
      ["Price", `TZS ${result.product.price}`],
      ["Stock", result.product.quantity],
      ["Category", result.product.category_name || "General"],
    ];
  }, [result]);

  return (
    <section className="page-wrap scanner-page">
      <div className="panel scanner-hero-panel">
        <div>
          <p className="sidebar-kicker">Supplier Scanner</p>
          <h2>Scan assigned product</h2>
          <p className="muted">
            Scan a real product barcode/QR code or upload a receipt image. The scanner checks the code against products assigned to your supplier account.
          </p>
        </div>
        <Link className="ghost-btn" to="/supplier/dashboard">
          Back to Dashboard
        </Link>
      </div>

      <div className="scanner-grid">
        <article className="panel scanner-card">
          <h3>Real Product Camera Scan</h3>
          <p className="muted">Open the camera and point it at the product barcode or QR code.</p>
          <video ref={videoRef} className="scanner-video" muted playsInline />
          <div className="row">
            <button type="button" className="primary-btn" onClick={startCamera} disabled={cameraActive || loading}>
              {cameraActive ? "Scanning..." : "Open Camera"}
            </button>
            <button type="button" className="ghost-btn" onClick={stopCamera} disabled={!cameraActive}>
              Stop Camera
            </button>
          </div>
        </article>

        <article className="panel scanner-card">
          <h3>Receipt Image Scan</h3>
          <p className="muted">Upload a receipt image that contains a barcode or QR code.</p>
          <input name="receipt_image" type="file" accept="image/*" onChange={scanReceiptImage} />
          {receiptPreview ? <img className="receipt-preview" src={receiptPreview} alt="Receipt preview" /> : null}
        </article>

        <article className="panel scanner-card">
          <h3>Manual Code Check</h3>
          <p className="muted">Use this when the browser cannot scan the receipt/product image.</p>
          <form onSubmit={submitManualCode}>
            <input
              name="manual_code"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="Enter barcode, QR text, product ID, or product URL"
            />
            <button type="submit" className="primary-btn">
              Check Code
            </button>
          </form>
        </article>

        <article className="panel scanner-card">
          <h3>Scan Result</h3>
          <p className="muted">Assigned products loaded: {loading ? "Loading..." : productCount}</p>
          <p className="muted">Scanner engine: {scannerEngine}</p>
          {status ? <p className={result?.matched ? "ok" : "pending"}>{status}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {result ? (
            <div className={`scan-result ${result.matched ? "matched" : "unmatched"}`}>
              <p><strong>Source:</strong> {result.source}</p>
              <p><strong>Scanned:</strong> {result.value}</p>
              {matchedProductDetails ? (
                <div className="scan-match-list">
                  {matchedProductDetails.map(([label, value]) => (
                    <p key={label}><strong>{label}:</strong> {value}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="muted">No scan yet.</p>
          )}
        </article>
      </div>
    </section>
  );
}

export default SupplierScanPage;
