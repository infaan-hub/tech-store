import cardBrandsImage from "../assets/Free Payment Method & Credit Card Icon Set.jpg";

const STORE_URL = (
  import.meta.env.VITE_PUBLIC_STORE_URL?.trim() ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:5173")
).replace(/\/+$/, "");
const QR_IMAGE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(STORE_URL)}`;

function StoreQrCard({ className = "" }) {
  return (
    <article className={`store-qr-card${className ? ` ${className}` : ""}`}>
      <div className="store-qr-copy">
        <p className="auth-eyebrow">Store QR</p>
        <h3>Scan To Open Tech store</h3>
        <p className="muted">Scanning this QR code opens the live Tech store storefront.</p>
        <div className="store-brand-row" aria-label="Accepted payment cards">
          <span className="store-brand-chip store-brand-chip-image">
            <img className="store-brand-logo store-brand-logo-image" src={cardBrandsImage} alt="Visa and Mastercard" />
          </span>
        </div>
      </div>
      <a className="store-qr-link" href={STORE_URL} target="_blank" rel="noreferrer" aria-label="Open Tech store website">
        <img className="store-qr-image" src={QR_IMAGE_URL} alt="QR code for Tech store website" />
      </a>
    </article>
  );
}

export default StoreQrCard;
