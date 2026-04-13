const FALLBACK_DEV_API_BASE_URL = "http://127.0.0.1:8000";
const FALLBACK_PROD_API_BASE_URL = "https://supermarketzanzibar.onrender.com";

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = (
  configuredBaseUrl ||
  (import.meta.env.PROD ? FALLBACK_PROD_API_BASE_URL : FALLBACK_DEV_API_BASE_URL)
).replace(/\/+$/, "");
