import { useEffect, useState } from "react";
import { useStoreStatus } from "../context/StoreStatusContext.jsx";

function toLocalInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function toIsoValue(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function formatDateTime(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function StoreTimePage() {
  const { storeStatus, loading, updateStoreStatus, refreshStoreStatus } = useStoreStatus();
  const [scheduledOpenAt, setScheduledOpenAt] = useState(() => toLocalInputValue(storeStatus?.scheduled_open_at));
  const [scheduledCloseAt, setScheduledCloseAt] = useState(() => toLocalInputValue(storeStatus?.scheduled_close_at));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setScheduledOpenAt(toLocalInputValue(storeStatus?.scheduled_open_at));
    setScheduledCloseAt(toLocalInputValue(storeStatus?.scheduled_close_at));
  }, [storeStatus?.scheduled_open_at, storeStatus?.scheduled_close_at]);

  const setManualState = async (isOpen) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateStoreStatus({ is_open: isOpen });
      setNotice(isOpen ? "Store opened successfully." : "Store closed successfully.");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update store state.");
    } finally {
      setSaving(false);
    }
  };

  const saveSchedule = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateStoreStatus({
        scheduled_open_at: toIsoValue(scheduledOpenAt),
        scheduled_close_at: toIsoValue(scheduledCloseAt),
      });
      setNotice("Automatic store time saved.");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save automatic store time.");
    } finally {
      setSaving(false);
    }
  };

  const clearSchedule = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateStoreStatus({
        scheduled_open_at: null,
        scheduled_close_at: null,
      });
      setScheduledOpenAt("");
      setScheduledCloseAt("");
      setNotice("Automatic store time cleared.");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to clear automatic store time.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !storeStatus) {
    return <section className="page-wrap"><p>Loading store time...</p></section>;
  }

  return (
    <section className="page-wrap">
      <div className="panel">
        <p className="auth-eyebrow">Store Time</p>
        <h2>Open / Close Control</h2>
        <p className="muted">Admin and supplier can open or close the store immediately, then set automatic open and close times.</p>
        <div className="row">
          <button type="button" className="primary-btn" onClick={() => setManualState(true)} disabled={saving}>
            Open Store
          </button>
          <button type="button" className="ghost-btn" onClick={() => setManualState(false)} disabled={saving}>
            Close Store
          </button>
          <button type="button" className="ghost-btn" onClick={() => refreshStoreStatus().catch(() => {})} disabled={saving}>
            Refresh
          </button>
        </div>
        <p className="muted">Current status: {storeStatus?.effective_is_open ? "Open" : "Closed"}</p>
        <p className="muted">Current auto open: {formatDateTime(storeStatus?.scheduled_open_at)}</p>
        <p className="muted">Current auto close: {formatDateTime(storeStatus?.scheduled_close_at)}</p>
        <div className="store-time-grid">
          <label>
            <span>Automatic open time</span>
            <input type="datetime-local" value={scheduledOpenAt} onChange={(event) => setScheduledOpenAt(event.target.value)} />
          </label>
          <label>
            <span>Automatic close time</span>
            <input type="datetime-local" value={scheduledCloseAt} onChange={(event) => setScheduledCloseAt(event.target.value)} />
          </label>
        </div>
        <div className="row">
          <button type="button" className="primary-btn" onClick={saveSchedule} disabled={saving}>
            Save Automatic Time
          </button>
          <button type="button" className="ghost-btn" onClick={clearSchedule} disabled={saving}>
            Clear Automatic Time
          </button>
        </div>
        {notice ? <p className="ok">{notice}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </section>
  );
}

export default StoreTimePage;
