import { useEffect, useRef } from "react";

export const DASHBOARD_REFRESH_INTERVAL_MS = 5 * 60_000;

// Refresh data only. Keeping the page mounted preserves filters, scroll position
// and work in other tabs. Background tabs do not perform periodic reads.
export function useDashboardAutoRefresh(active: boolean, refreshKey: number, refresh: () => void) {
  const lastRequestedAt = useRef(refreshKey);
  lastRequestedAt.current = Math.max(lastRequestedAt.current, refreshKey || 0);

  useEffect(() => {
    if (!active) return;
    const check = (force = false) => {
      if (document.visibilityState !== "visible" || navigator.onLine === false) return;
      const now = Date.now();
      if (!force && now - lastRequestedAt.current < DASHBOARD_REFRESH_INTERVAL_MS) return;
      lastRequestedAt.current = now;
      refresh();
    };
    const onVisible = () => check();
    const onOnline = () => check(true);
    check();
    const timer = window.setInterval(onVisible, 30_000);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, refresh]);
}
