import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { http } from "../api/http.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getApiErrorMessage } from "../lib/apiErrors.js";
import { STORE_LOCATION, STORE_NAME } from "../lib/storeInfo.js";

const STORE_ROUTE_ORIGIN = STORE_LOCATION;
const DRIVER_DASHBOARD_POLL_INTERVAL_MS = 10000;
const DRIVER_ALERTS_UPDATED_EVENT = "driver-alerts-updated";

function normalizeMapsLocation(value) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return "";
  return /zanzibar/i.test(text) ? text : `${text}, Zanzibar`;
}

function buildRouteDestination(sale) {
  const parts = [sale?.delivery_location, sale?.customer_address]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .filter((value, index, values) => values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);

  return normalizeMapsLocation(parts.join(", "));
}

function getRouteLabel(sale) {
  return [sale?.delivery_location, sale?.customer_address]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .filter((value, index, values) => values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
    .join(", ");
}

function buildGoogleMapsDirectionsUrl(destination) {
  const params = new URLSearchParams({
    api: "1",
    origin: STORE_ROUTE_ORIGIN,
    destination,
    travelmode: "driving",
    dir_action: "navigate",
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function formatStatus(status) {
  return String(status || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function DriverDashboardPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState({ active_deliveries: [] });
  const [error, setError] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState(null);
  const activeDeliveries = useMemo(
    () => (Array.isArray(data.active_deliveries) ? data.active_deliveries : []),
    [data.active_deliveries]
  );

  const loadDashboard = async () => {
    setError("");
    try {
      const response = await http.get("/api/driver/dashboard/");
      setData(response.data);
    } catch (err) {
      if ([401, 403].includes(err.response?.status)) {
        logout();
        navigate("/driver/login", { replace: true });
        return;
      }
      setError(getApiErrorMessage(err, "Unable to load driver dashboard."));
    }
  };

  useEffect(() => {
    loadDashboard();

    const intervalId = window.setInterval(loadDashboard, DRIVER_DASHBOARD_POLL_INTERVAL_MS);
    const handleWindowFocus = () => loadDashboard();
    const handleDriverAlertsUpdated = () => loadDashboard();

    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener(DRIVER_ALERTS_UPDATED_EVENT, handleDriverAlertsUpdated);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener(DRIVER_ALERTS_UPDATED_EVENT, handleDriverAlertsUpdated);
    };
  }, []);

  useEffect(() => {
    if (!activeDeliveries.length) {
      setSelectedSaleId(null);
      return;
    }

    const hasSelectedSale = activeDeliveries.some((sale) => sale.id === selectedSaleId);
    if (!hasSelectedSale) {
      setSelectedSaleId(activeDeliveries[0].id);
    }
  }, [activeDeliveries, selectedSaleId]);

  const updateStatus = async (saleId, status) => {
    setError("");
    try {
      await http.patch(`/api/driver/sales/${saleId}/status/`, { status });
      await loadDashboard();
      return true;
    } catch {
      const nextError = status === "delivered" ? "Failed to mark delivery as delivered." : "Status update failed.";
      setError(nextError);
      return false;
    }
  };

  const startRoute = async (sale) => {
    const destination = buildRouteDestination(sale);
    if (!destination) {
      setError("Add a delivery location or customer address before starting the Google Maps route.");
      return;
    }

    const mapsUrl = buildGoogleMapsDirectionsUrl(destination);
    const mapsWindow = window.open(mapsUrl, "_blank", "noopener,noreferrer");

    if (!mapsWindow) {
      window.location.assign(mapsUrl);
    }

    setSelectedSaleId(sale.id);
    if (sale.status !== "out_for_delivery") {
      const didUpdate = await updateStatus(sale.id, "out_for_delivery");
      if (!didUpdate) return;
    }
  };

  const selectedSale = activeDeliveries.find((sale) => sale.id === selectedSaleId) || null;
  const selectedDestination = selectedSale ? buildRouteDestination(selectedSale) : "";
  const selectedRouteLabel = selectedSale ? getRouteLabel(selectedSale) : "";
  const selectedMapsUrl = selectedDestination ? buildGoogleMapsDirectionsUrl(selectedDestination) : "";

  return (
    <section className="page-wrap">
      <div className="map-card driver-route-shell">
        <div className="driver-route-copy">
          <p className="auth-eyebrow">Google Maps Dispatch</p>
          <h2>{STORE_NAME} Driver Dashboard</h2>
          <p className="section-note">
            Routes now open in official Google Maps with driving directions from {STORE_LOCATION} to the selected delivery area.
          </p>
        </div>
        <div className="driver-route-grid">
          <article className="driver-route-panel">
            <span>Store origin</span>
            <strong>{STORE_LOCATION}</strong>
          </article>
          <article className="driver-route-panel">
            <span>Selected destination</span>
            <strong>{selectedRouteLabel || "Select a delivery to prepare the route."}</strong>
          </article>
          <article className="driver-route-panel">
            <span>Customer</span>
            <strong>{selectedSale?.customer_name || "No active delivery"}</strong>
          </article>
          <article className="driver-route-panel">
            <span>Phone</span>
            <strong>{selectedSale?.customer_phone || "Not provided"}</strong>
          </article>
        </div>
        <div className="row">
          <button
            className="accent-btn"
            type="button"
            onClick={() => selectedSale && startRoute(selectedSale)}
            disabled={!selectedSale || !selectedDestination}
          >
            Start Selected Route
          </button>
          <button className="ghost-btn" type="button" onClick={loadDashboard}>
            Refresh Deliveries
          </button>
          {selectedMapsUrl ? (
            <a className="ghost-btn driver-route-link" href={selectedMapsUrl} target="_blank" rel="noreferrer">
              Open in Google Maps
            </a>
          ) : null}
        </div>
        {selectedSale && !selectedDestination ? (
          <p className="driver-route-note">This delivery needs a destination or address before Google Maps can build the route.</p>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {activeDeliveries.length ? (
        <div className="order-list">
          {activeDeliveries.map((sale) => {
            const destination = buildRouteDestination(sale);
            const routeLabel = getRouteLabel(sale);
            const mapsUrl = destination ? buildGoogleMapsDirectionsUrl(destination) : "";
            const isSelected = sale.id === selectedSaleId;

            return (
              <article className={`order-card driver-delivery-card${isSelected ? " driver-delivery-card-active" : ""}`} key={sale.id}>
                <div className="driver-delivery-copy">
                  <p className="driver-delivery-kicker">{isSelected ? "Selected route" : "Assigned delivery"}</p>
                  <h4>Delivery #{sale.id}</h4>
                  <p>Status: {formatStatus(sale.status)}</p>
                  <p>Destination: {routeLabel || "No location provided"}</p>
                  <p>Customer address: {sale.customer_address || "Not provided"}</p>
                </div>
                <div className="row">
                  <button className="ghost-btn" type="button" onClick={() => setSelectedSaleId(sale.id)}>
                    Select Route
                  </button>
                  <button className="accent-btn" type="button" onClick={() => startRoute(sale)} disabled={!destination}>
                    Start Route
                  </button>
                  {mapsUrl ? (
                    <a className="ghost-btn driver-route-link" href={mapsUrl} target="_blank" rel="noreferrer">
                      Google Maps
                    </a>
                  ) : null}
                  <button className="primary-btn" type="button" onClick={() => updateStatus(sale.id, "delivered")}>
                    Mark Delivered
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <h3>No active deliveries</h3>
          <p className="muted">New assignments will appear here, and each route will open in Google Maps from Stone Town.</p>
        </div>
      )}
    </section>
  );
}

export default DriverDashboardPage;
