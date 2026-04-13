import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

function loginPathForRoles(roles) {
  if (!Array.isArray(roles) || roles.length !== 1) return "/login";
  if (roles[0] === "admin") return "/admin/login";
  if (roles[0] === "supplier") return "/supplier/login";
  if (roles[0] === "driver") return "/driver/login";
  return "/login";
}

function RoleRoute({ roles, children }) {
  const { loading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (loading) return <div className="center-screen">Loading...</div>;
  if (!isAuthenticated) return <Navigate to={loginPathForRoles(roles)} replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user?.role)) return <Navigate to="/home" replace />;
  return children;
}

export default RoleRoute;
