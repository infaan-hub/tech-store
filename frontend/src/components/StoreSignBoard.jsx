import { useEffect, useMemo, useState } from "react";
import storeOpenSign from "../assets/store-open-sign.png";
import storeClosedSign from "../assets/store-closed-sign.png";
import { useStoreStatus } from "../context/StoreStatusContext.jsx";
import { formatStoreDateTime } from "../lib/storeStatus.js";

function formatDigitalTimeParts(date, hourMode) {
  const rawHours = date.getHours();
  const hoursValue = hourMode === "12"
    ? ((rawHours % 12) || 12)
    : rawHours;
  return {
    hours: String(hoursValue).padStart(2, "0"),
    minutes: String(date.getMinutes()).padStart(2, "0"),
    seconds: String(date.getSeconds()).padStart(2, "0"),
    meridiem: hourMode === "12" ? (rawHours >= 12 ? "PM" : "AM") : "",
  };
}

function formatCountdownParts(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function StoreSignBoard({ compact = false }) {
  const { storeStatus } = useStoreStatus();
  const [now, setNow] = useState(() => new Date());
  const [hourMode, setHourMode] = useState("24");
  const isOpen = Boolean(storeStatus?.effective_is_open ?? storeStatus?.is_open ?? true);
  const nextChangeDate = useMemo(() => {
    if (!storeStatus?.next_change_at) return null;
    const parsed = new Date(storeStatus.next_change_at);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [storeStatus?.next_change_at]);
  const hasCountdown = Boolean(nextChangeDate && nextChangeDate.getTime() > now.getTime());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const displayParts = hasCountdown
    ? formatCountdownParts(nextChangeDate.getTime() - now.getTime())
    : formatDigitalTimeParts(now, hourMode);
  const metaTitle = hasCountdown
    ? `${storeStatus?.next_change_action === "open" ? "Open countdown" : "Close countdown"}`
    : "Current time";
  const statusLine = hasCountdown
    ? `${storeStatus?.next_change_action === "open" ? "Opens" : "Closes"} ${formatStoreDateTime(storeStatus?.next_change_at)}`
    : `${isOpen ? "Store open now" : "Store closed now"}`;
  const dateLine = hasCountdown && nextChangeDate ? formatLongDate(nextChangeDate) : formatLongDate(now);

  return (
    <section className={`store-sign-section${compact ? " compact" : ""}`} aria-label="Store status sign">
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
        <div className="store-clock-card" aria-label={metaTitle}>
          <div className="store-clock-header">
            <span>{hasCountdown ? "Countdown" : "Current"}</span>
            <div className="store-clock-controls">
              <span className="store-clock-chip">{hasCountdown ? (storeStatus?.next_change_action === "open" ? "Until Open" : "Until Close") : "Live Time"}</span>
              <div className="store-clock-toggle" aria-label="Hour format switch">
                <button
                  type="button"
                  className={hourMode === "12" ? "active" : ""}
                  onClick={() => setHourMode("12")}
                >
                  12h
                </button>
                <button
                  type="button"
                  className={hourMode === "24" ? "active" : ""}
                  onClick={() => setHourMode("24")}
                >
                  24h
                </button>
              </div>
            </div>
          </div>
          <div className="store-clock-digits" aria-live="polite">
            <span>{displayParts.hours}</span>
            <span className="store-clock-separator">:</span>
            <span>{displayParts.minutes}</span>
            <span className="store-clock-separator">:</span>
            <span>{displayParts.seconds}</span>
            {!hasCountdown && displayParts.meridiem ? <span className="store-clock-meridiem">{displayParts.meridiem}</span> : null}
          </div>
          <div className="store-clock-footer">
            <span>{statusLine}</span>
            <span>{dateLine}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default StoreSignBoard;
