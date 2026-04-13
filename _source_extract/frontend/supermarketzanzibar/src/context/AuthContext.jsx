import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { http } from "../api/http.jsx";
import { API_BASE_URL } from "../config/apiBaseUrl.js";
import { clearTokens, getAccessToken, setTokens } from "../lib/storage.jsx";

const AuthContext = createContext(null);
const authHttp = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
});
const SCHEDULED_ACCESS_ROLES = new Set(["supplier", "driver"]);
const AUTH_RETRY_DELAY_MS = 1500;

async function authPostWithRetry(path, payload, config) {
  try {
    return await authHttp.post(path, payload, config);
  } catch (error) {
    if (error?.response || error?.code === "ERR_CANCELED") {
      throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, AUTH_RETRY_DELAY_MS));
    return authHttp.post(path, payload, config);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const isAuthenticated = Boolean(user);

  const loadMe = useCallback(async () => {
    try {
      const response = await http.get("/api/auth/me/");
      setUser(response.data);
    } catch {
      clearTokens();
      setUser(null);
    }
  }, []);

  const loginByPath = useCallback(async (path, credentials) => {
    clearTokens();
    const loginRes = await authPostWithRetry(path, credentials);
    setTokens({
      access: loginRes.data.access,
      refresh: loginRes.data.refresh,
    });
    try {
      const meRes = await http.get("/api/auth/me/");
      setUser(meRes.data);
      return meRes.data;
    } catch (error) {
      clearTokens();
      setUser(null);
      throw error;
    }
  }, []);

  const loginCustomer = useCallback((credentials) => loginByPath("/api/auth/login/", credentials), [loginByPath]);
  const loginAdmin = useCallback((credentials) => loginByPath("/api/auth/admin/login/", credentials), [loginByPath]);
  const loginSupplier = useCallback((credentials) => loginByPath("/api/auth/supplier/login/", credentials), [loginByPath]);
  const loginDriver = useCallback((credentials) => loginByPath("/api/auth/driver/login/", credentials), [loginByPath]);

  const startGoogleLogin = useCallback(async (credential) => {
    const response = await authPostWithRetry("/api/auth/google/", { credential });
    setTokens({
      access: response.data.access,
      refresh: response.data.refresh,
    });
    setUser(response.data.user);
    return response.data.user;
  }, []);

  const registerCustomer = useCallback(async (payload) => {
    await authHttp.post("/api/auth/register/", payload);
  }, []);

  const registerAdmin = useCallback(async (payload) => {
    await authHttp.post("/api/auth/admin/register/", payload);
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const response = await http.patch("/api/auth/me/", payload, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setUser(response.data);
    return response.data;
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  useEffect(() => {
    const init = async () => {
      if (!getAccessToken()) {
        setLoading(false);
        return;
      }
      await loadMe();
      setLoading(false);
    };
    init();
  }, [loadMe]);

  useEffect(() => {
    if (!user || !SCHEDULED_ACCESS_ROLES.has(user.role)) return undefined;
    if (!user.has_active_scheduled_access || !user.access_window_end) {
      logout();
      return undefined;
    }

    const logoutAt = new Date(user.access_window_end).getTime();
    const delay = logoutAt - Date.now();
    if (delay <= 0) {
      logout();
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      logout();
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [logout, user]);

  useEffect(() => {
    if (!user || !SCHEDULED_ACCESS_ROLES.has(user.role)) return undefined;

    const intervalId = window.setInterval(() => {
      loadMe();
    }, 30000);
    const handleFocus = () => loadMe();

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadMe, user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated,
      loginCustomer,
      loginAdmin,
      loginSupplier,
      loginDriver,
      startGoogleLogin,
      registerCustomer,
      registerAdmin,
      logout,
      reloadUser: loadMe,
      updateProfile,
    }),
    [
      user,
      loading,
      isAuthenticated,
      loginCustomer,
      loginAdmin,
      loginSupplier,
      loginDriver,
      startGoogleLogin,
      registerCustomer,
      registerAdmin,
      logout,
      loadMe,
      updateProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
