import axios from "axios";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "../lib/storage.jsx";
import { API_BASE_URL } from "../config/apiBaseUrl.js";

const GET_RETRY_DELAY_MS = 1200;
const FORCE_RELOGIN_PATTERNS = ["/api/supplier/", "/api/driver/", "/api/auth/me/"];

export const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
});

http.interceptors.request.use((config) => {
  const accessToken = getAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const isSafeGetRequest = String(originalRequest?.method || "").toLowerCase() === "get";
    const requestUrl = String(originalRequest?.url || "");
    const requiresFreshLogin = FORCE_RELOGIN_PATTERNS.some((pattern) => requestUrl.includes(pattern));

    if (!originalRequest?._networkRetry && !error.response && isSafeGetRequest) {
      originalRequest._networkRetry = true;
      await new Promise((resolve) => window.setTimeout(resolve, GET_RETRY_DELAY_MS));
      return http(originalRequest);
    }

    if ((status === 401 || status === 403) && requiresFreshLogin) {
      clearTokens();
      return Promise.reject(error);
    }

    if (
      status === 401 &&
      !originalRequest?._retry &&
      !originalRequest?.url?.includes("/api/auth/token/refresh/")
    ) {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        return Promise.reject(error);
      }

      originalRequest._retry = true;
      try {
        const refreshRes = await axios.post(`${API_BASE_URL}/api/auth/token/refresh/`, {
          refresh: refreshToken,
        });
        setTokens({
          access: refreshRes.data.access,
          refresh: refreshRes.data.refresh || refreshToken,
        });
        originalRequest.headers.Authorization = `Bearer ${refreshRes.data.access}`;
        return http(originalRequest);
      } catch (refreshError) {
        clearTokens();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);
