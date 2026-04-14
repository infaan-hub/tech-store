import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import productPlaceholder from "../assets/product-placeholder.svg";
import { http } from "../api/http.jsx";
import { useCart } from "../context/CartContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useStoreStatus } from "../context/StoreStatusContext.jsx";
import { getApiErrorMessage } from "../lib/apiErrors.js";
import { applyImageFallback, toMediaUrl } from "../lib/media.jsx";
import { buildStoreClosedMessage } from "../lib/storeStatus.js";

const PRODUCT_PLACEHOLDER = productPlaceholder;

function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [slowLoading, setSlowLoading] = useState(false);
  const [error, setError] = useState("");
  const { user } = useAuth();
  const { storeStatus } = useStoreStatus();
  const { addToCart, checkoutSingleProduct } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setSlowLoading(false);
      setError("");
      try {
        const response = await http.get(`/api/products/${id}/`);
        setProduct(response.data);
      } catch (err) {
        setError(getApiErrorMessage(err, "Failed to load product details."));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = window.setTimeout(() => setSlowLoading(true), 7000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const maxQty = Math.max(1, Number(product?.quantity) || 1);
  const selectedQty = Math.min(maxQty, Math.max(1, Number(qty) || 1));

  const reduceQty = () => {
    setQty((current) => Math.max(1, Number(current) - 1));
  };

  const addQty = () => {
    setQty((current) => Math.min(maxQty, Number(current) + 1));
  };

  const buyNow = () => {
    if (user?.role === "customer" && storeStatus && storeStatus.effective_is_open === false) {
      alert(buildStoreClosedMessage(storeStatus));
      return;
    }
    checkoutSingleProduct(product, selectedQty);
    navigate("/payment");
  };

  if (loading) return <p className="page-wrap">{slowLoading ? "Backend is waking up. Product will appear soon..." : "Loading product..."}</p>;
  if (!product) return <p className="page-wrap error">{error || "Product not found."}</p>;

  return (
    <section className="page-wrap">
      <div className="product-detail">
        <img
          src={product.image_data_url || toMediaUrl(product.image_url || product.image) || PRODUCT_PLACEHOLDER}
          alt={product.name}
          data-fallback-src={PRODUCT_PLACEHOLDER}
          onError={applyImageFallback}
        />
        <div className="product-detail-copy">
          <h2>{product.name}</h2>
          <div className="product-detail-meta">
            <p className="price">TZS {product.price}</p>
            <p className="product-detail-category">Category: {product.category_name || "Tech Essential"}</p>
            <p className="product-detail-stock">Available stock: {product.quantity}</p>
          </div>
          <p className="product-detail-description">{product.description || "No description available."}</p>
          <div className="product-detail-actions">
            <div className="quantity-stepper product-detail-stepper" aria-label={`Quantity for ${product.name}`}>
              <button type="button" onClick={reduceQty} disabled={selectedQty <= 1} aria-label="Reduce quantity">
                -
              </button>
              <span>{selectedQty}</span>
              <button type="button" onClick={addQty} disabled={selectedQty >= maxQty} aria-label="Add quantity">
                +
              </button>
            </div>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                if (user?.role === "customer" && storeStatus && storeStatus.effective_is_open === false) {
                  alert(buildStoreClosedMessage(storeStatus));
                  return;
                }
                addToCart(product, selectedQty);
                navigate("/cart");
              }}
            >
              Add to Cart
            </button>
            <button type="button" className="accent-btn" onClick={buyNow}>
              Buy Now
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>
    </section>
  );
}

export default ProductDetailPage;
