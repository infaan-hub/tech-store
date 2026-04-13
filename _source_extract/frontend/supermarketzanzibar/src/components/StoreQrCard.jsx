import cardBrandsImage from "../assets/Free Payment Method & Credit Card Icon Set.jpg";

const STORE_URL = "https://supermarketzanzibar.vercel.app/";
const QR_IMAGE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(STORE_URL)}`;

function StoreQrCard({ className = "" }) {
  return (
    <article className={`store-qr-card${className ? ` ${className}` : ""}`}>
      <div className="store-qr-copy">
        <p className="auth-eyebrow">Store QR</p>
        <h3>Scan To Open Supermarket</h3>
        <p className="muted">Scanning this QR code opens the live store at `supermarketzanzibar.vercel.app`.</p>
        <div className="store-brand-row" aria-label="Accepted payment cards">
          <span className="store-brand-chip store-brand-chip-image">
            <img className="store-brand-logo store-brand-logo-image" src={cardBrandsImage} alt="Visa and Mastercard" />
          </span>
        </div>
      </div>
      <a className="store-qr-link" href={STORE_URL} target="_blank" rel="noreferrer" aria-label="Open Supermarket store website">
        <img className="store-qr-image" src={QR_IMAGE_URL} alt="QR code for Supermarket store website" />
      </a>
    </article>
  );
}

export default StoreQrCard;
