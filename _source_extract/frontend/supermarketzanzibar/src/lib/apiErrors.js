export function getApiErrorMessage(err, fallback = "Request failed.") {
  if (err?.code === "ECONNABORTED") {
    return "Request timed out. Backend may be waking up on Render. Please retry in a few seconds.";
  }
  if (!err?.response) {
    return "Unable to reach the server. Check that the backend is online and try again.";
  }
  const data = err.response.data;
  if (typeof data === "string" && data.trim()) return data;
  if (typeof data?.detail === "string" && data.detail.trim()) return data.detail;
  return fallback;
}
