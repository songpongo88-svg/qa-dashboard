import { useEffect, useRef } from "react";

export const DASHBOARD_REFRESH_INTERVAL_MS = 5 * 60_000;

// Refresh data only. Keeping the page mounted preserves filters, scroll position
// and work in other tabs. Background tabs do not perform periodic reads.
export function useDashboardAutoRefresh(active: boolean, refreshKey: number, refresh: () => void, readRevision?: () => Promise<string | null>, onChecked?: (at: number) => void) {
  const lastRequestedAt = useRef(refreshKey);
  const lastRevision = useRef<string | null>(null);
  lastRequestedAt.current = Math.max(lastRequestedAt.current, refreshKey || 0);

  useEffect(() => {
    if (!active) return;
    let checking = false;
    let disposed = false;
    const check = async (force = false) => {
      if (checking) return;
      if (document.visibilityState !== "visible" || navigator.onLine === false) return;
      const now = Date.now();
      if (!force && now - lastRequestedAt.current < DASHBOARD_REFRESH_INTERVAL_MS) return;
      lastRequestedAt.current = now;
      checking = true;
      try {
        const revision = readRevision ? await readRevision() : null;
        if (disposed || document.visibilityState !== "visible") return;
        if (revision !== null) onChecked?.(Date.now());
        if (force || revision === null || revision !== lastRevision.current) refresh();
        lastRevision.current = revision;
      } catch (error) {
        console.warn("Dashboard change check failed; retrying the data read", error);
        if (!disposed && document.visibilityState === "visible") refresh();
      } finally {
        checking = false;
      }
    };
    const onVisible = () => check();
    const onOnline = () => check(true);
    check();
    const timer = window.setInterval(onVisible, 30_000);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, refresh, readRevision, onChecked]);
}
