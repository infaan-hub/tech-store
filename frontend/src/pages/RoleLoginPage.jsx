import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import GoogleAuthPanel from "../components/GoogleAuthPanel.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getApiErrorMessage } from "../lib/apiErrors.js";

const ROLE_CONFIG = {
  customer: {
    title: "Customer Login",
    eyebrow: "Welcome back",
    description: "Sign in to continue shopping, manage your cart, and track your orders.",
    action: "loginCustomer",
    next: "/customer/dashboard",
  },
  admin: {
    title: "Admin Login",
    eyebrow: "System access",
    description: "Use your admin account to manage users, products, and payment approvals.",
    action: "loginAdmin",
    next: "/admin/dashboard",
  },
  supplier: {
    title: "Supplier Login",
    eyebrow: "Inventory access",
    description: "Open your supplier dashboard to add products and maintain stock details.",
    action: "loginSupplier",
    next: "/supplier/dashboard",
  },
  driver: {
    title: "Driver Login",
    eyebrow: "Delivery access",
    description: "Sign in to view assigned deliveries and update drop-off status.",
    action: "loginDriver",
    next: "/driver/dashboard",
  },
};

function RoleLoginPage({ role }) {
  const config = ROLE_CONFIG[role];
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await auth[config.action](form);
      const fromPath = typeof location.state?.from === "string" ? location.state.from : null;
      navigate(role === "customer" && fromPath ? fromPath : config.next, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Login failed."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="auth-section">
      <form className="auth-card auth-card-premium" onSubmit={onSubmit}>
        <div className="auth-copy">
          <p className="auth-eyebrow">{config.eyebrow}</p>
          <h2>{config.title}</h2>
          <p className="auth-description">{config.description}</p>
        </div>

        <div className="auth-field-list">
          <label className="auth-field">
            <span>Username</span>
            <input
              name="username"
              type="text"
              placeholder="Enter your username"
              value={form.username}
              onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
              required
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
          </label>
        </div>

        {error ? <p className="error auth-feedback">{error}</p> : null}
        <button className="primary-btn auth-submit" type="submit" disabled={loading}>
          {loading ? "Please wait..." : "Login"}
        </button>

        <GoogleAuthPanel enabled={role === "customer"} next={role === "customer" && typeof location.state?.from === "string" ? location.state.from : config.next} />

        {role === "customer" ? (
          <p className="auth-footnote">
            No account? <Link to="/register">Register</Link>
          </p>
        ) : null}
        {role === "admin" ? (
          <p className="auth-footnote">
            First admin? <Link to="/admin/register">Register admin</Link>
          </p>
        ) : null}
      </form>
    </section>
  );
}

export default RoleLoginPage;
