// Display reads may share a short-lived snapshot. Writes and authorization
// transactions must continue to verify their state directly with the server.
type ReadEntry = { expiresAt: number; value?: unknown; pending?: Promise<unknown> };
const reads = new Map<string, ReadEntry>();
export const FIRESTORE_READ_COOLDOWN_MS = 5 * 60_000;
const MAX_DISPLAY_BACKOFF_MS = 60 * 60_000;
const READ_BACKOFF_STORAGE_KEY = "qa-dashboard:firestore-display-read-backoff:v2";
type ReadBackoff = { until: number; failures: number; lastFailureAt: number };
let localBackoff: ReadBackoff = { until: 0, failures: 0, lastFailureAt: 0 };

// Only non-authoritative display reads share this quota guard. Authentication,
// account permissions, approvals, transactions and writes remain server-verified.
// Firestore quota is shared across signed-in users; a browser-wide cooldown
// prevents other tabs from immediately repeating expensive display queries.
function readBackoff(): ReadBackoff {
  let stored: ReadBackoff | null = null;
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(READ_BACKOFF_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Number.isFinite(parsed.until) && Number.isFinite(parsed.failures) &&
          Number.isFinite(parsed.lastFailureAt) && parsed.until <= Date.now() + MAX_DISPLAY_BACKOFF_MS)
        stored = parsed;
    }
  } catch { /* Storage can be full or disabled; keep the in-memory guard. */ }
  return stored && stored.lastFailureAt >= localBackoff.lastFailureAt ? stored : localBackoff;
}

function storeBackoff(value: ReadBackoff) {
  localBackoff = value;
  try {
    if (typeof window !== "undefined")
      window.localStorage.setItem(READ_BACKOFF_STORAGE_KEY, JSON.stringify(value));
  } catch { /* Never throw from quota handling. */ }
}

export function isFirestoreQuotaError(error: unknown): boolean {
  const value = error as { code?: string; status?: number; message?: string } | null;
  return value?.status === 429 || /resource[-_ ]exhausted|quota[-_ ]exceeded/i.test(
    String(value?.code || "") + " " + String(value?.message || "")
  );
}

export function noteFirestoreReadError(error: unknown): void {
  if (!isFirestoreQuotaError(error)) return;
  const now = Date.now();
  const previous = readBackoff();
  if (previous.until > now) return; // Do not extend the pause for duplicate callbacks.
  const consecutive = now - previous.lastFailureAt < 4 * 60 * 60_000
    ? Math.min(previous.failures + 1, 5) : 1;
  storeBackoff({
    until: now + Math.min(MAX_DISPLAY_BACKOFF_MS, FIRESTORE_READ_COOLDOWN_MS * 2 ** (consecutive - 1)),
    failures: consecutive,
    lastFailureAt: now,
  });
}

export function noteFirestoreDisplayReadSuccess(): void {
  // Called only when a fresh display query actually succeeds, not for cache hits.
  const previous = readBackoff();
  if (!previous.failures) return;
  storeBackoff({ until: 0, failures: 0, lastFailureAt: Date.now() });
}

export function firestoreReadWaitMs(): number {
  return Math.max(0, readBackoff().until - Date.now());
}

export function assertFirestoreReadAllowed(): void {
  if (firestoreReadWaitMs()) {
    throw Object.assign(new Error("Firestore จำกัดการอ่านข้อมูลชั่วคราว กรุณารอสักครู่แล้วลองอีกครั้ง"), {
      code: "resource-exhausted", status: 429,
    });
  }
}

export function invalidateFirestoreReads(prefix: string): void {
  for (const key of reads.keys()) if (key.startsWith(prefix)) reads.delete(key);
}

export function sharedFirestoreRead<T>(key: string, ttlMs: number, load: () => Promise<T>, force = false): Promise<T> {
  const previous = reads.get(key);
  if (previous?.pending) return previous.pending as Promise<T>;
  if (!force && previous && previous.expiresAt > Date.now()) return Promise.resolve(previous.value as T);
  try { assertFirestoreReadAllowed(); } catch (error) { return Promise.reject(error); }
  const entry: ReadEntry = { expiresAt: 0 };
  const pending = Promise.resolve().then(load).then(value => {
    noteFirestoreDisplayReadSuccess();
    if (reads.get(key) === entry) {
      entry.value = value;
      entry.expiresAt = Date.now() + Math.max(0, ttlMs);
      entry.pending = undefined;
    }
    return value;
  }, error => {
    noteFirestoreReadError(error);
    if (reads.get(key) === entry) reads.delete(key);
    throw error;
  });
  entry.pending = pending;
  reads.set(key, entry);
  if (reads.size > 200) {
    for (const [cachedKey, cached] of reads) {
      if (!cached.pending && cached.expiresAt <= Date.now()) reads.delete(cachedKey);
    }
  }
  return pending;
}


// Opt-in, browser-session diagnostics for displayed document counts. This is
// NOT Firebase billing telemetry (aggregation/index/listener reconnects can
// charge differently). No document IDs, content, usernames or secrets stored.
// Enable in DevTools: sessionStorage.setItem("qa:firestore-read-metrics", "on")
export function recordFirestoreSnapshotDocs(operation: string, documentCount: number): void {
  if (typeof window === "undefined") return;
  try {
    const storage = window.sessionStorage;
    if (storage.getItem("qa:firestore-read-metrics") !== "on") return;
    const key = "qa:firestore-read-metrics:summary";
    const existing = JSON.parse(storage.getItem(key) || "{}") as Record<string, { queries: number; returnedDocuments: number }>;
    const name = /^[a-z0-9:_-]{1,80}$/i.test(operation) ? operation : "other";
    const previous = existing[name] || { queries: 0, returnedDocuments: 0 };
    const count = Number.isFinite(documentCount) ? Math.max(0, Math.floor(documentCount)) : 0;
    existing[name] = { queries: previous.queries + 1, returnedDocuments: previous.returnedDocuments + count };
    if (Object.keys(existing).length <= 40) storage.setItem(key, JSON.stringify(existing));
  } catch {
    // Browsers can disable session storage; diagnostics must never affect QA.
  }
}


// Read-only, per-tab diagnostics. No account, case or document IDs are logged.
// This counts returned documents, not the official Firestore billing meter.
export function isFirestoreReadDiagnosticsEnabled(): boolean {
  try { return typeof window !== "undefined" && window.sessionStorage.getItem("qa:firestore-read-metrics") === "on"; }
  catch { return false; }
}
export function setFirestoreReadDiagnosticsEnabled(enabled: boolean): boolean {
  try {
    if (enabled) window.sessionStorage.setItem("qa:firestore-read-metrics", "on");
    else window.sessionStorage.removeItem("qa:firestore-read-metrics");
    return isFirestoreReadDiagnosticsEnabled() === enabled;
  } catch { return false; }
}
export function getFirestoreReadDiagnostics(): Record<string, { queries: number; returnedDocuments: number }> {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem("qa:firestore-read-metrics:summary") || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .filter(([key, value]) => /^[a-z0-9:_-]{1,80}$/i.test(key) &&
        Number.isFinite((value as any)?.queries) && Number.isFinite((value as any)?.returnedDocuments)));
  } catch { return {}; }
}
