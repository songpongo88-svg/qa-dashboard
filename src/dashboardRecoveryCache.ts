// Store only fully loaded dashboard snapshots in the current browser tab.
// A recovery snapshot is account-scoped and never sent back to Firestore.
const PREFIX = "qa-dashboard:recovery-snapshot:v1:";
const MAX_AGE_MS = 12 * 60 * 60_000;
const MAX_JSON_LENGTH = 3_500_000;

export type DashboardRecoverySnapshot<C, N> = {
  cachedAt: number;
  cases: C[];
  noCaseEvaluations: N[];
  appealMergeCount: number;
};

function storageKey(accountScope: string): string {
  return PREFIX + encodeURIComponent(accountScope.trim().toLowerCase());
}

export function readDashboardRecoverySnapshot<C, N>(accountScope: string): DashboardRecoverySnapshot<C, N> | null {
  if (!accountScope.trim() || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(accountScope));
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as DashboardRecoverySnapshot<C, N>;
    if (!snapshot || !Array.isArray(snapshot.cases) || !Array.isArray(snapshot.noCaseEvaluations) ||
        !Number.isFinite(snapshot.cachedAt) || snapshot.cachedAt <= 0 ||
        Date.now() < snapshot.cachedAt || Date.now() - snapshot.cachedAt > MAX_AGE_MS) {
      window.sessionStorage.removeItem(storageKey(accountScope));
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function saveDashboardRecoverySnapshot<C, N>(accountScope: string, data: DashboardRecoverySnapshot<C, N>): void {
  if (!accountScope.trim() || typeof window === "undefined" || !data.cases.length) return;
  try {
    const raw = JSON.stringify(data);
    if (raw.length > MAX_JSON_LENGTH) return; // Do not exhaust browser storage.
    window.sessionStorage.setItem(storageKey(accountScope), raw);
  } catch {
    // Storage is optional (e.g., private browsing or quota reached).
  }
}
