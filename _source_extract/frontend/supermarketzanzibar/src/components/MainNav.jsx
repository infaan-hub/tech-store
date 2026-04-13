import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useCart } from "../context/CartContext.jsx";

function MainNav({ theme, onToggleTheme }) {
  const { user, logout, isAuthenticated } = useAuth();
  const { count } = useCart();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const onLogout = () => {
    logout();
    navigate("/home");
  };

  const navItems = [
    { to: "/home", label: "Home", show: true },
    { to: "/cart", label: `Cart (${count})`, show: user?.role === "customer" },
    { to: "/profile", label: "Profile", show: isAuthenticated },
    { to: "/customer/dashboard", label: "Dashboard", show: user?.role === "customer" },
    { to: "/admin/dashboard", label: "Admin Dashboard", show: user?.role === "admin" },
    { to: "/schedule-task", label: "Schedule Task", show: user?.role === "admin" },
    { to: "/supplier/dashboard", label: "Supplier Dashboard", show: user?.role === "supplier" },
    { to: "/supplier/dashboard/scan", label: "Supplier Scanner", show: user?.role === "supplier" },
    { to: "/supplier/calculator", label: "Supplier Calculator", show: user?.role === "supplier" },
    { to: "/driver/dashboard", label: "Driver Dashboard", show: user?.role === "driver" },
  ];

  const guestActions = [
    { to: "/login", label: "Customer Login" },
    {
      href: "https://supermarketzanzibar.vercel.app/register",
      label: "Customer Register",
    },
  ];

  return (
    <>
      <header className="topbar">
        <button
          type="button"
          className={`sidebar-toggle${sidebarOpen ? " active" : ""}`}
          aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <Link to="/home" className="brand">
          Supermarket
        </Link>
      </header>

      <div
        className={`sidebar-backdrop${sidebarOpen ? " visible" : ""}`}
        aria-hidden={!sidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar${sidebarOpen ? " open" : ""}`} aria-label="Main sidebar">
        <div className="sidebar-header">
          <button
            type="button"
            className="sidebar-toggle sidebar-toggle-inline active"
            aria-label="Close sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(false)}
          >
            <span />
            <span />
            <span />
          </button>
          <p className="sidebar-kicker">Control Panel</p>
          <h2>Navigation</h2>
          <p className="muted">All actions are moved here for the new layout.</p>
        </div>

        <nav className="sidebar-nav">
          {navItems
            .filter((item) => item.show)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link-pill${isActive ? " active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
        </nav>

        <div className="sidebar-actions">
          <button type="button" className="theme-switch" onClick={onToggleTheme}>
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </button>
          {!isAuthenticated
            ? guestActions.map((action) => (
                action.href ? (
                  <a
                    key={action.href}
                    href={action.href}
                    className="ghost-btn"
                    onClick={() => setSidebarOpen(false)}
                  >
                    {action.label}
                  </a>
                ) : (
                  <NavLink
                    key={action.to}
                    to={action.to}
                    className="ghost-btn"
                    onClick={() => setSidebarOpen(false)}
                  >
                    {action.label}
                  </NavLink>
                )
              ))
            : (
              <button type="button" className="ghost-btn" onClick={onLogout}>
                Logout
              </button>
            )}
        </div>
      </aside>
    </>
  );
}

export default MainNav;
