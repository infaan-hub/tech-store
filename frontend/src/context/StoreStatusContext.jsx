import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { http } from "../api/http.jsx";

const StoreStatusContext = createContext(null);
const STORE_STATUS_REFRESH_MS = 30000;

export function StoreStatusProvider({ children }) {
  const [storeStatus, setStoreStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshStoreStatus = useCallback(async () => {
    const response = await http.get("/api/store-time/");
    setStoreStatus(response.data);
    return response.data;
  }, []);

  const updateStoreStatus = useCallback(async (payload) => {
    const response = await http.patch("/api/store-time/", payload);
    setStoreStatus(response.data);
    return response.data;
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const response = await http.get("/api/store-time/");
        if (mounted) {
          setStoreStatus(response.data);
        }
      } catch {
        if (mounted) {
          setStoreStatus(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();
    const intervalId = window.setInterval(() => {
      refreshStoreStatus().catch(() => {});
    }, STORE_STATUS_REFRESH_MS);
    const onFocus = () => {
      refreshStoreStatus().catch(() => {});
    };

    window.addEventListener("focus", onFocus);
    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshStoreStatus]);

  const value = useMemo(
    () => ({
      storeStatus,
      loading,
      refreshStoreStatus,
      updateStoreStatus,
    }),
    [storeStatus, loading, refreshStoreStatus, updateStoreStatus]
  );

  return <StoreStatusContext.Provider value={value}>{children}</StoreStatusContext.Provider>;
}

export function useStoreStatus() {
  const context = useContext(StoreStatusContext);
  if (!context) {
    throw new Error("useStoreStatus must be used inside StoreStatusProvider");
  }
  return context;
}
