import { useNavigate } from "react-router-dom";
import productPlaceholder from "../assets/product-placeholder.svg";
import { useCart } from "../context/CartContext.jsx";
import { applyImageFallback, toMediaUrl } from "../lib/media.jsx";

const PRODUCT_PLACEHOLDER = productPlaceholder;

function CartPage() {
  const { items, removeFromCart, incrementQuantity, decrementQuantity, total } = useCart();
  const navigate = useNavigate();

  return (
    <section className="page-wrap">
      <h2>Your Cart</h2>
      {!items.length ? <p>No items in cart.</p> : null}
      <div className="cart-product-list">
        {items.map((item) => (
          <article className="cart-product-card" key={item.product.id}>
            <div className="cart-product-image">
              <img
                src={toMediaUrl(item.product.image_url || item.product.image) || PRODUCT_PLACEHOLDER}
                alt={item.product.name}
                data-fallback-src={PRODUCT_PLACEHOLDER}
                onError={applyImageFallback}
              />
            </div>
            <div className="cart-product-info">
              <p className="cart-product-kicker">{item.product.category_name || "Product"}</p>
              <h3>{item.product.name}</h3>
              <p className="cart-product-description">
                {item.product.description || "Fresh marketplace product ready for your cart."}
              </p>
              <p className="cart-product-price">TZS {(Number(item.product.price) * item.quantity).toFixed(2)}</p>
            </div>
            <div className="cart-product-actions">
              <div className="quantity-stepper" aria-label={`Quantity for ${item.product.name}`}>
                <button type="button" onClick={() => decrementQuantity(item.product.id)} aria-label="Reduce quantity">
                  -
                </button>
                <span>{item.quantity}</span>
                <button type="button" onClick={() => incrementQuantity(item.product.id)} aria-label="Add quantity">
                  +
                </button>
              </div>
              <button type="button" className="cart-remove-btn" onClick={() => removeFromCart(item.product.id)}>
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="price">Total: TZS {total.toFixed(2)}</p>
      <div className="cart-footer-actions">
        <button type="button" className="ghost-btn" onClick={() => navigate("/customer/dashboard")}>
          Continue Shopping
        </button>
        <button type="button" className="primary-btn" onClick={() => navigate("/payment")} disabled={!items.length}>
          Payment
        </button>
      </div>
    </section>
  );
}

export default CartPage;
