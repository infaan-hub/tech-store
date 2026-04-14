import storeOpenSign from "../assets/store-open-sign.png";
import storeClosedSign from "../assets/store-closed-sign.png";
import { useStoreStatus } from "../context/StoreStatusContext.jsx";
import { formatStoreDateTime } from "../lib/storeStatus.js";

function StoreSignBoard() {
  const { storeStatus } = useStoreStatus();
  const isOpen = Boolean(storeStatus?.effective_is_open ?? storeStatus?.is_open ?? true);
  const nextChangeText = storeStatus?.next_change_at && storeStatus?.next_change_action
    ? `${storeStatus.next_change_action === "open" ? "Opens" : "Closes"} ${formatStoreDateTime(storeStatus.next_change_at)}`
    : "";

  return (
    <section className="store-sign-section" aria-label="Store status sign">
      <div className="store-sign-wrap">
        <img
          className={`store-sign-image${isOpen ? " open" : " closed"}`}
          src={isOpen ? storeOpenSign : storeClosedSign}
          alt={isOpen ? "Store open sign board" : "Store closed sign board"}
        />
      </div>
      <div className="store-sign-copy">
        <p className="auth-eyebrow">Store Time</p>
        <h3>{isOpen ? "TECH STORE IS OPEN" : "TECH STORE IS CLOSED"}</h3>
        <p className="muted">{nextChangeText || "Manual and automatic store time updates appear here instantly."}</p>
      </div>
    </section>
  );
}

export default StoreSignBoard;
