import { API_BASE_URL } from "../config/apiBaseUrl.js";

export function toMediaUrl(path) {
  if (!path) return null;
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export function applyImageFallback(event) {
  const fallbackSrc = event.currentTarget.dataset.fallbackSrc;
  if (!fallbackSrc || event.currentTarget.src === fallbackSrc) return;
  event.currentTarget.src = fallbackSrc;
}
