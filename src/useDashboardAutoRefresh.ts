import { useEffect, useRef } from "react";
import { firestoreReadWaitMs, isFirestoreQuotaError, noteFirestoreReadError } from "./firestoreReadPolicy";

// Only revision probes run periodically; a full evaluation/appeal reload is
// triggered ONLY by a confirmed change (or an explicit user action).
export const DASHBOARD_REFRESH_INTERVAL_MS = 15 * 60_000;

// The Dashboard performs its initial data fetch separately. Checking an
// unknown/null revision must never invalidate the entire application cache.
export function shouldRefreshDashboardRevision(previous: string | null, next: string | null): boolean {
  return previous !== null && next !== null && previous !== next;
}

// Keep filters, draft inputs, and unrelated tabs mounted while checking data.
export function useDashboardAutoRefresh(active: boolean, refreshKey: number, refresh: () => void, readRevision?: () => Promise<string | null>, onChecked?: (at: number) => void) {
  const lastRequestedAt = useRef(Date.now());
  const lastRevision = useRef<string | null>(null);
  const previousRefreshKey = useRef(refreshKey);
  if (previousRefreshKey.current !== refreshKey) {
    previousRefreshKey.current = refreshKey;
    // Explicit save/refresh already reloads the data. Establish a new
    // revision baseline instead of triggering the same full reload again.
    lastRevision.current = null;
  }
  lastRequestedAt.current = Math.max(lastRequestedAt.current, refreshKey || 0);

  useEffect(() => {
    if (!active || !readRevision) return;
    let checking = false;
    let disposed = false;
    const check = async () => {
      if (checking || disposed) return;
      if (document.visibilityState !== "visible" || navigator.onLine === false || firestoreReadWaitMs() > 0) return;
      const now = Date.now();
      if (now - lastRequestedAt.current < DASHBOARD_REFRESH_INTERVAL_MS) return;
      lastRequestedAt.current = now;
      checking = true;
      try {
        const revision = await readRevision();
        if (disposed || document.visibilityState !== "visible") return;
        if (revision === null) return; // No reliable revision: do NOT force a full scan.
        onChecked?.(Date.now());
        if (shouldRefreshDashboardRevision(lastRevision.current, revision)) refresh();
        lastRevision.current = revision; // First successful check establishes baseline.
      } catch (error) {
        noteFirestoreReadError(error);
        console.warn("Dashboard change check unavailable", error);
        // On a 429, transient error, or offline state, keep current data
        // visible. Never amplify the error with an expensive full reload.
        if (!isFirestoreQuotaError(error)) return;
      } finally {
        checking = false;
      }
    };
    const onVisible = () => { void check(); };
    const timer = window.setInterval(onVisible, 60_000);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, refresh, readRevision, onChecked]);
}
