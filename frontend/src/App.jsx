import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import MainNav from "./components/MainNav.jsx";
import RoleRoute from "./components/RoleRoute.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { CartProvider } from "./context/CartContext.jsx";
import AdminDashboardPage from "./pages/AdminDashboardPage.jsx";
import CartPage from "./pages/CartPage.jsx";
import CustomerDashboardPage from "./pages/CustomerDashboardPage.jsx";
import DriverDashboardPage from "./pages/DriverDashboardPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import PaymentPage from "./pages/PaymentPage.jsx";
import ProductDetailPage from "./pages/ProductDetailPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import RoleLoginPage from "./pages/RoleLoginPage.jsx";
import SupplierDashboardPage from "./pages/SupplierDashboardPage.jsx";
import SupplierCalculatorPage from "./pages/SupplierCalculatorPage.jsx";
import SupplierScanPage from "./pages/SupplierScanPage.jsx";
import ScheduleTaskPage from "./pages/ScheduleTaskPage.jsx";

function AppLayout() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem("theme-mode") || "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("theme-mode", theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <MainNav theme={theme} onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))} />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}

function RootRedirect() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/home" replace />;
  if (user?.role === "admin") return <Navigate to="/admin/dashboard" replace />;
  if (user?.role === "supplier") return <Navigate to="/supplier/dashboard" replace />;
  if (user?.role === "driver") return <Navigate to="/driver/dashboard" replace />;
  return <Navigate to="/customer/dashboard" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/search" element={<HomePage />} />
        <Route path="/filter" element={<HomePage />} />
        <Route path="/category" element={<HomePage />} />
        <Route path="/login" element={<RoleLoginPage role="customer" />} />
        <Route path="/admin/login" element={<RoleLoginPage role="admin" />} />
        <Route path="/supplier/login" element={<RoleLoginPage role="supplier" />} />
        <Route path="/driver/login" element={<RoleLoginPage role="driver" />} />
        <Route path="/register" element={<RegisterPage mode="customer" />} />
        <Route path="/admin/register" element={<RegisterPage mode="admin" />} />

        <Route
          path="/products/:id"
          element={
            <RoleRoute roles={["customer", "admin", "supplier", "driver"]}>
              <ProductDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="/cart"
          element={
            <RoleRoute roles={["customer"]}>
              <CartPage />
            </RoleRoute>
          }
        />
        <Route
          path="/payment"
          element={
            <RoleRoute roles={["customer"]}>
              <PaymentPage />
            </RoleRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <RoleRoute roles={["customer", "admin", "supplier", "driver"]}>
              <ProfilePage />
            </RoleRoute>
          }
        />
        <Route
          path="/customer/dashboard"
          element={
            <RoleRoute roles={["customer"]}>
              <CustomerDashboardPage />
            </RoleRoute>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <RoleRoute roles={["admin"]}>
              <AdminDashboardPage />
            </RoleRoute>
          }
        />
        <Route
          path="/schedule-task"
          element={
            <RoleRoute roles={["admin"]}>
              <ScheduleTaskPage />
            </RoleRoute>
          }
        />
        <Route
          path="/supplier/dashboard"
          element={
            <RoleRoute roles={["supplier"]}>
              <SupplierDashboardPage />
            </RoleRoute>
          }
        />
        <Route
          path="/supplier/dashboard/scan"
          element={
            <RoleRoute roles={["supplier"]}>
              <SupplierScanPage />
            </RoleRoute>
          }
        />
        <Route
          path="/supplier/calculator"
          element={
            <RoleRoute roles={["supplier"]}>
              <SupplierCalculatorPage />
            </RoleRoute>
          }
        />
        <Route
          path="/driver/dashboard"
          element={
            <RoleRoute roles={["driver"]}>
              <DriverDashboardPage />
            </RoleRoute>
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;
