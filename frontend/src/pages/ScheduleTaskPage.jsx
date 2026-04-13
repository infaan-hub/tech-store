import { useEffect, useMemo, useState } from "react";
import { http } from "../api/http.jsx";

const ROLE_LABELS = {
  supplier: "Suppliers",
  driver: "Drivers",
};

const LOGIN_PATHS = {
  supplier: "/supplier/login",
  driver: "/driver/login",
};

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

function formatStatus(value) {
  return String(value || "not_scheduled")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ScheduleTaskPage() {
  const [users, setUsers] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadSchedules = async () => {
    setError("");
    try {
      const response = await http.get("/api/auth/schedule-task/");
      setUsers(response.data);
      setDrafts(
        Object.fromEntries(
          response.data.map((user) => [
            user.id,
            {
              access_window_start: toLocalInputValue(user.access_window_start),
              access_window_end: toLocalInputValue(user.access_window_end),
            },
          ])
        )
      );
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load scheduled users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const groupedUsers = useMemo(
    () => ({
      supplier: users.filter((user) => user.role === "supplier"),
      driver: users.filter((user) => user.role === "driver"),
    }),
    [users]
  );

  const updateDraft = (userId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] || {}),
        [field]: value,
      },
    }));
  };

  const saveSchedule = async (user) => {
    setSavingId(user.id);
    setError("");
    setNotice("");
    const draft = drafts[user.id] || {};

    try {
      await http.patch(`/api/auth/schedule-task/${user.id}/`, {
        access_window_start: toIsoValue(draft.access_window_start),
        access_window_end: toIsoValue(draft.access_window_end),
      });
      setNotice(`Schedule updated for ${user.full_name || user.username}.`);
      await loadSchedules();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update schedule.");
    } finally {
      setSavingId(null);
    }
  };

  const clearSchedule = async (user) => {
    setSavingId(user.id);
    setError("");
    setNotice("");

    try {
      await http.patch(`/api/auth/schedule-task/${user.id}/`, {
        access_window_start: null,
        access_window_end: null,
      });
      setNotice(`Schedule cleared for ${user.full_name || user.username}.`);
      await loadSchedules();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to clear schedule.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="page-wrap">
      <div className="panel">
        <p className="auth-eyebrow">Admin Schedule Control</p>
        <h2>Schedule Task Access</h2>
        <p className="muted">
          Set the allowed date and time for each supplier and driver. Outside that window they cannot log in, and active sessions are logged out when the time ends.
        </p>
        <div className="row">
          <button className="ghost-btn" type="button" onClick={loadSchedules}>
            Refresh List
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="ok">{notice}</p> : null}

      {loading ? (
        <div className="panel">
          <p className="muted">Loading schedule list...</p>
        </div>
      ) : (
        Object.entries(groupedUsers).map(([role, roleUsers]) => (
          <div className="panel" key={role}>
            <h3>{ROLE_LABELS[role]}</h3>
            <p className="muted">Login path: {LOGIN_PATHS[role]}</p>
            {!roleUsers.length ? <p className="muted">No {role}s found.</p> : null}
            <div className="order-list">
              {roleUsers.map((user) => {
                const draft = drafts[user.id] || {
                  access_window_start: "",
                  access_window_end: "",
                };
                const isSaving = savingId === user.id;

                return (
                  <article className="order-card schedule-user-card" key={user.id}>
                    <div className="schedule-user-meta">
                      <p className="schedule-user-kicker">{user.role}</p>
                      <h4>{user.full_name || user.username}</h4>
                      <p>Username: {user.username}</p>
                      <p>Email: {user.email || "Not provided"}</p>
                      <p>Phone: {user.phone || "Not provided"}</p>
                      <p>
                        Status:{" "}
                        <span className={`schedule-status-pill schedule-status-${user.schedule_status}`}>
                          {formatStatus(user.schedule_status)}
                        </span>
                      </p>
                      <p>Current start: {formatDateTime(user.access_window_start)}</p>
                      <p>Current end: {formatDateTime(user.access_window_end)}</p>
                    </div>

                    <div className="schedule-task-grid">
                      <label>
                        <span>Start date and time</span>
                        <input
                          type="datetime-local"
                          value={draft.access_window_start}
                          onChange={(event) => updateDraft(user.id, "access_window_start", event.target.value)}
                        />
                      </label>
                      <label>
                        <span>End date and time</span>
                        <input
                          type="datetime-local"
                          value={draft.access_window_end}
                          onChange={(event) => updateDraft(user.id, "access_window_end", event.target.value)}
                        />
                      </label>
                      <div className="row">
                        <button className="primary-btn" type="button" onClick={() => saveSchedule(user)} disabled={isSaving}>
                          {isSaving ? "Saving..." : "Save Schedule"}
                        </button>
                        <button className="ghost-btn" type="button" onClick={() => clearSchedule(user)} disabled={isSaving}>
                          Clear Schedule
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

export default ScheduleTaskPage;
