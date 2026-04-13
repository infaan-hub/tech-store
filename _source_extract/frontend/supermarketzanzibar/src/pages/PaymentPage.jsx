import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http } from "../api/http.jsx";
import amexLogo from "../assets/BEST SELLERS.jpg";
import mastercardLogo from "../assets/Beds - French Furniture Orlando.jpg";
import paypalLogo from "../assets/Paypal free icons designed by Roundicons.jpg";
import visaLogo from "../assets/Visa free icons designed by Roundicons.jpg";
import yasmixxLogo from "../assets/Yas Mixx Logo PNG Vector (EPS) Free Download.jpg";
import { useCart } from "../context/CartContext.jsx";
import { toMediaUrl } from "../lib/media.jsx";

const PAYMENT_GATEWAYS = [
  { key: "paypal", label: "PayPal", image: paypalLogo },
  { key: "visa", label: "Visa", image: visaLogo },
  { key: "mastercard", label: "Mastercard", image: mastercardLogo },
  { key: "amex", label: "American Express", image: amexLogo },
  { key: "yasmixx", label: "Yas Mixx", image: yasmixxLogo },
];

function formatCardNumber(value) {
  return value
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

function cardBrand(cardNumber) {
  const digits = cardNumber.replace(/\D/g, "");
  if (digits.startsWith("34") || digits.startsWith("37")) return "amex";
  if (digits.startsWith("5")) return "mastercard";
  return "visa";
}

function getGatewayMeta(gatewayKey) {
  return PAYMENT_GATEWAYS.find((item) => item.key === gatewayKey) || PAYMENT_GATEWAYS[1];
}

function GatewayLogo({ gatewayKey, className = "" }) {
  const gateway = getGatewayMeta(gatewayKey);
  return <img src={gateway.image} alt={gateway.label} className={className} />;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function downloadReceipt(receipt) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const [productImage, barcodeImage, gatewayImage] = await Promise.all([
    loadImage(receipt.productImageUrl).catch(() => null),
    loadImage(receipt.barcodeImageUrl).catch(() => null),
    loadImage(getGatewayMeta(receipt.gateway).image).catch(() => null),
  ]);

  ctx.fillStyle = "#f3f2ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cardX = 150;
  const cardY = 150;
  const cardWidth = 600;
  const cardHeight = 1060;
  const radius = 28;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(105, 96, 145, 0.16)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.beginPath();
  ctx.moveTo(cardX + radius, cardY);
  ctx.arcTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + cardHeight, radius);
  ctx.arcTo(cardX + cardWidth, cardY + cardHeight, cardX, cardY + cardHeight, radius);
  ctx.arcTo(cardX, cardY + cardHeight, cardX, cardY, radius);
  ctx.arcTo(cardX, cardY, cardX + cardWidth, cardY, radius);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 6; i += 1) {
    const notchX = cardX + 60 + (i * 96);
    ctx.beginPath();
    ctx.arc(notchX, cardY + cardHeight, 24, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = "#16a34a";
  ctx.beginPath();
  ctx.arc(450, 238, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(436, 238);
  ctx.lineTo(446, 250);
  ctx.lineTo(468, 224);
  ctx.stroke();

  ctx.fillStyle = "#17151d";
  ctx.font = "700 48px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Thank you!", 450, 332);
  ctx.fillStyle = "#8f8a99";
  ctx.font = "400 28px Arial";
  ctx.fillText("Your ticket has been issued", 450, 378);
  ctx.fillText("successfully", 450, 414);

  ctx.strokeStyle = "#d9d6e3";
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(210, 488);
  ctx.lineTo(690, 488);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = "left";
  ctx.fillStyle = "#aaa4b6";
  ctx.font = "700 20px Arial";
  ctx.fillText("TICKET ID", 200, 560);
  ctx.fillText("DATE & TIME", 200, 675);
  ctx.fillText("Amount", 560, 560);

  ctx.fillStyle = "#1e1a25";
  ctx.font = "700 34px Arial";
  ctx.fillText(receipt.ticketId, 200, 600);
  ctx.fillText(receipt.dateTime, 200, 715);
  ctx.fillText(`TZS ${receipt.total}`, 560, 600);

  ctx.fillStyle = "#f6f7ff";
  ctx.beginPath();
  ctx.roundRect(200, 770, 500, 86, 18);
  ctx.fill();
  ctx.fillStyle = "#1e1a25";
  ctx.font = "700 28px Arial";
  ctx.fillText(receipt.productName, 316, 815);
  ctx.fillStyle = "#8f8a99";
  ctx.font = "600 24px Arial";
  ctx.fillText("Supermarket Zanzibar", 316, 846);
  if (productImage) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(220, 788, 56, 56, 14);
    ctx.clip();
    ctx.drawImage(productImage, 220, 788, 56, 56);
    ctx.restore();
  }

  if (gatewayImage) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(540, 778, 138, 58, 16);
    ctx.clip();
    ctx.drawImage(gatewayImage, 540, 778, 138, 58);
    ctx.restore();
  }

  ctx.strokeStyle = "#ece9f5";
  ctx.beginPath();
  ctx.moveTo(200, 920);
  ctx.lineTo(700, 920);
  ctx.stroke();

  if (barcodeImage) {
    ctx.drawImage(barcodeImage, 255, 960, 390, 120);
  } else {
    ctx.fillStyle = "#111111";
    ctx.fillRect(255, 990, 390, 70);
  }
  ctx.fillStyle = "#8f8a99";
  ctx.font = "500 22px Arial";
  ctx.textAlign = "center";
  ctx.fillText(receipt.ticketId, 450, 1110);

  const url = canvas.toDataURL("image/jpeg", 0.94);
  const link = document.createElement("a");
  link.href = url;
  link.download = `receipt-${receipt.ticketId}.jpeg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function PaymentPage() {
  const { items, total, clearCart } = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    cardNumber: "",
    cardHolder: "",
    expiry: "",
    cvv: "",
    paypalEmail: "",
    mobileNumber: "",
    mobilePin: "",
    gateway: "visa",
    wantsDelivery: false,
    deliveryLocation: "",
  });
  const [paymentResult, setPaymentResult] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [autoDownloaded, setAutoDownloaded] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const inferredBrand = useMemo(() => cardBrand(form.cardNumber), [form.cardNumber]);
  const gateway = form.gateway === "paypal" || form.gateway === "yasmixx" ? form.gateway : (form.gateway || inferredBrand);
  const gatewayMeta = getGatewayMeta(gateway);
  const orderTotal = total.toFixed(2);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const chooseBrand = (nextBrand) => {
    setForm((current) => ({ ...current, gateway: nextBrand }));
  };

  const useCurrentLocation = async () => {
    if (!navigator.geolocation) {
      setError("This browser cannot access current location.");
      return;
    }
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        updateForm(
          "deliveryLocation",
          `Current location: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`
        );
        updateForm("wantsDelivery", true);
      },
      () => {
        setError("Current location could not be retrieved. Please allow location permission or enter the address manually.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    if (!receipt || autoDownloaded) return;
    downloadReceipt(receipt).finally(() => setAutoDownloaded(true));
  }, [autoDownloaded, receipt]);

  const submitPayment = async () => {
    if (!items.length) {
      setError("Your cart is empty.");
      return;
    }
    if (gateway === "paypal") {
      if (!form.paypalEmail || !form.cardHolder) {
        setError("Fill in your PayPal email and account name.");
        return;
      }
    } else if (gateway === "yasmixx") {
      if (!form.mobileNumber || !form.cardHolder || !form.mobilePin) {
        setError("Fill in your Yas Mixx number, account name, and PIN.");
        return;
      }
    } else if (!form.cardNumber || !form.cardHolder || !form.expiry || !form.cvv) {
      setError("Fill in all payment details for the selected gateway.");
      return;
    }
    if (form.wantsDelivery && !form.deliveryLocation.trim()) {
      setError("Enter a delivery location or use your current location.");
      return;
    }

    setLoading(true);
    setError("");
    const cartSnapshot = items.map((item) => ({ product: item.product, quantity: item.quantity }));
    const snapshotTotal = cartSnapshot.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
    try {
      const response = await http.post("/api/customer/checkout/", {
        items: cartSnapshot.map((item) => ({ product: item.product.id, quantity: item.quantity })),
        payment_method: gateway,
        delivery_location: form.wantsDelivery ? form.deliveryLocation.trim() : "",
        terms_accepted: true,
      });
      const firstProduct = cartSnapshot[0]?.product;
      const payment = response.data.payment || {};
      const sale = response.data.sale || {};
      const ticketId = payment.ticket_id || payment.control_number || String(sale.id || Date.now());
      setPaymentResult(response.data);
      setReceipt({
        ticketId,
        total: snapshotTotal.toFixed(2),
        dateTime: new Date(payment.created_at || sale.created_at || Date.now()).toLocaleString(),
        productName: firstProduct?.name || "Marketplace Product",
        productImageUrl: toMediaUrl(firstProduct?.image_url || firstProduct?.image),
        barcodeImageUrl: payment.barcode_image_url,
        gateway,
        gatewayLabel: gatewayMeta.label,
        gatewayAccount:
          gateway === "paypal"
            ? form.paypalEmail
            : gateway === "yasmixx"
              ? form.mobileNumber
              : form.cardNumber.slice(-4),
        receiptUrl: sale.receipt_url,
      });
      clearCart();
    } catch (err) {
      setError(err.response?.data?.detail || "Payment could not be completed right now.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <section className="booking-loading-page" aria-live="polite">
        <div className="booking-loader" aria-hidden="true" />
        <p>LOADING...</p>
        <small>Sending booking securely</small>
      </section>
    );
  }

  if (receipt) {
    return (
      <section className="receipt-page">
        <article className="ticket-receipt-card">
          <div className="receipt-check">✓</div>
          <h2>Thank you!</h2>
          <p className="muted">Your booking has been issued successfully</p>
          <div className="receipt-dash" />
          <div className="receipt-grid">
            <div>
              <span>Ticket ID</span>
              <strong>{receipt.ticketId}</strong>
            </div>
            <div>
              <span>Amount</span>
              <strong>TZS {receipt.total}</strong>
            </div>
            <div className="receipt-full">
              <span>Date & Time</span>
              <strong>{receipt.dateTime}</strong>
            </div>
          </div>
          <div className="receipt-product-row">
            {receipt.productImageUrl ? <img src={receipt.productImageUrl} alt={receipt.productName} /> : <span />}
            <div>
              <strong>{receipt.productName}</strong>
              <p>Supermarket Zanzibar</p>
            </div>
            <span className="receipt-gateway-logo-wrap">
              <GatewayLogo gatewayKey={receipt.gateway} className="receipt-gateway-logo" />
            </span>
          </div>
          <p className="payment-result-text">
            {receipt.gatewayLabel} {receipt.gateway === "paypal" ? receipt.gatewayAccount : receipt.gateway === "yasmixx" ? receipt.gatewayAccount : `Ending ${receipt.gatewayAccount || "----"}`}
          </p>
          <div className="receipt-barcode-wrap">
            {receipt.barcodeImageUrl ? (
              <img src={receipt.barcodeImageUrl} alt={`Scannable barcode ${receipt.ticketId}`} />
            ) : (
              <div className="barcode-fallback">{receipt.ticketId}</div>
            )}
            <p>{receipt.ticketId}</p>
          </div>
          {paymentResult ? (
            <p className="payment-result-text">
              Order #{paymentResult.sale?.id} created. Control Number: {paymentResult.payment?.control_number || "Pending"}.
            </p>
          ) : null}
          <div className="receipt-actions">
            <button type="button" className="ghost-btn" onClick={() => downloadReceipt(receipt)}>
              Download Receipt
            </button>
            <button type="button" className="primary-btn" onClick={() => navigate("/customer/dashboard")}>
              Return Dashboard
            </button>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="payment-page">
      <div className="payment-phone-card">
        <header className="payment-topbar">
          <button type="button" className="payment-icon-btn" onClick={() => navigate("/cart")} aria-label="Back to cart">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <h2>Payment Status</h2>
          <button type="button" className="payment-icon-btn" aria-label="Share payment">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5h5v5" />
              <path d="M10 14L19 5" />
              <path d="M19 13v5h-14v-14h5" />
            </svg>
          </button>
        </header>

        <div className="payment-invoice">
          <div className="invoice-printer" />
          <div className="invoice-paper">
            <p className="invoice-title">Order Invoice - Supermarket</p>
            <div className="invoice-row">
              <span>Total</span>
              <strong>TZS {orderTotal}</strong>
            </div>
            <div className="invoice-row">
              <span>Items</span>
              <strong>{items.reduce((sum, item) => sum + item.quantity, 0)}</strong>
            </div>

            <div className="payment-gateway-panel">
              <div className="gateway-heading">
                <span>Payment Gateway</span>
                <strong>{gatewayMeta.label}</strong>
              </div>
              <div className="gateway-card-brand-row" aria-label="Supported payment cards">
                {PAYMENT_GATEWAYS.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`gateway-brand ${gateway === entry.key ? "active" : ""}`}
                    onClick={() => chooseBrand(entry.key)}
                  >
                    <GatewayLogo gatewayKey={entry.key} className="card-brand-logo" />
                    <span>{entry.label}</span>
                  </button>
                ))}
              </div>
              {gateway === "paypal" ? (
                <label>
                  PayPal Email
                  <input
                    inputMode="email"
                    name="paypal_email"
                    placeholder="paypal@email.com"
                    value={form.paypalEmail}
                    onChange={(event) => updateForm("paypalEmail", event.target.value)}
                  />
                </label>
              ) : gateway === "yasmixx" ? (
                <label>
                  Yas Mixx Number
                  <input
                    inputMode="tel"
                    name="mobile_number"
                    placeholder="+255 7xx xxx xxx"
                    value={form.mobileNumber}
                    onChange={(event) => updateForm("mobileNumber", event.target.value)}
                  />
                </label>
              ) : (
                <label>
                  {gateway === "amex" ? "American Express Number" : "Card Number"}
                  <input
                    inputMode="numeric"
                    name="card_number"
                    placeholder={gateway === "amex" ? "3782 822463 10005" : "4242 4242 4242 4242"}
                    value={form.cardNumber}
                    onChange={(event) => {
                      const nextValue = formatCardNumber(event.target.value);
                      updateForm("cardNumber", nextValue);
                      const detectedBrand = cardBrand(nextValue);
                      if (gateway !== "paypal" && detectedBrand) updateForm("gateway", detectedBrand);
                    }}
                  />
                </label>
              )}
              <label>
                {gateway === "paypal" ? "PayPal Account Name" : gateway === "yasmixx" ? "Yas Mixx Account Name" : "Cardholder Name"}
                <input
                  name="card_holder"
                  placeholder="Full name"
                  value={form.cardHolder}
                  onChange={(event) => updateForm("cardHolder", event.target.value)}
                />
              </label>
              {gateway === "yasmixx" ? (
                <label>
                  Yas Mixx PIN
                  <input
                    inputMode="numeric"
                    name="mobile_pin"
                    placeholder="****"
                    value={form.mobilePin}
                    onChange={(event) => updateForm("mobilePin", event.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </label>
              ) : gateway !== "paypal" ? (
                <div className="gateway-form-grid">
                  <label>
                    Expiry
                    <input
                      name="card_expiry"
                      placeholder="MM/YY"
                      value={form.expiry}
                      onChange={(event) => updateForm("expiry", event.target.value.slice(0, 5))}
                    />
                  </label>
                  <label>
                    {gateway === "amex" ? "CID" : "CVV"}
                    <input
                      inputMode="numeric"
                      name="card_cvv"
                      placeholder={gateway === "amex" ? "1234" : "123"}
                      value={form.cvv}
                      onChange={(event) => updateForm("cvv", event.target.value.replace(/\D/g, "").slice(0, 4))}
                    />
                  </label>
                </div>
              ) : null}
              <div className="delivery-panel">
                <label className="delivery-toggle">
                  <input
                    type="checkbox"
                    name="wants_delivery"
                    checked={form.wantsDelivery}
                    onChange={(event) => updateForm("wantsDelivery", event.target.checked)}
                  />
                  <span>Need delivery?</span>
                </label>
                {form.wantsDelivery ? (
                  <div className="delivery-fields">
                    <div className="delivery-field-row">
                      <button type="button" className="ghost-btn" onClick={useCurrentLocation}>
                        Use Present Location
                      </button>
                      <span className="muted">Driver receives this delivery location automatically after payment.</span>
                    </div>
                    <label>
                      Delivery Location
                      <input
                        name="delivery_location"
                        placeholder="Enter address or landmark for delivery"
                        value={form.deliveryLocation}
                        onChange={(event) => updateForm("deliveryLocation", event.target.value)}
                      />
                    </label>
                  </div>
                ) : (
                  <p className="muted">Pickup is selected. Turn on delivery only if the driver should bring the order to you.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {error ? <p className="error payment-error">{error}</p> : null}
        <div className="payment-method-row">
          <span>Payment Method</span>
          <strong>
            {gatewayMeta.label}{" "}
            {gateway === "paypal"
              ? (form.paypalEmail || "Account")
              : gateway === "yasmixx"
                ? (form.mobileNumber || "Wallet")
                : `Ending ${form.cardNumber.slice(-4) || "----"}`}
          </strong>
          <span className={`card-logo-chip ${gateway}`}>
            <GatewayLogo gatewayKey={gateway} className="card-logo-chip-sprite" />
          </span>
        </div>
        <button type="button" className="payment-pay-btn" onClick={submitPayment}>
          Pay Now
        </button>
      </div>
    </section>
  );
}

export default PaymentPage;
