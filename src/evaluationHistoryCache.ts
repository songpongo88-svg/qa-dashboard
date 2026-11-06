// Browser-local, account-isolated copy of a completed Firestore history scan.
// Never use it to bypass a failed server verification in official reports.
const DATABASE = "qa-dashboard-verified-evaluation-history";
const STORE = "complete";
const VERSION = 1;
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60_000;

export type VerifiedEvaluationHistory<T> = {
  scannedAt: number;
  scanStartedAt: number;
  rawDocumentCount: number;
  invalidDocumentIds: string[];
  records: T[];
};

export function evaluationHistoryAccountScope(projectId: string, collectionName: string): string {
  if (typeof window === "undefined" || !projectId || !collectionName) return "";
  try {
    const current = JSON.parse(window.localStorage.getItem("qa_current_user") || "null");
    const username = String(current?.username || "").trim().toLowerCase();
    const role = String(current?.role || "").trim().toLowerCase();
    const team = String(current?.teamName || current?.team || "").trim().toLowerCase();
    return username && role ? [projectId, collectionName, username, role, team].join("|") : "";
  } catch { return ""; }
}

function validHistory<T>(value: unknown): value is VerifiedEvaluationHistory<T> {
  const history = value as VerifiedEvaluationHistory<T>;
  return Boolean(history && Number.isFinite(history.scannedAt) &&
    Number.isFinite(history.scanStartedAt) && history.scannedAt <= Date.now() &&
    history.scanStartedAt > 0 && Date.now() - history.scannedAt <= MAX_CACHE_AGE_MS &&
    Number.isInteger(history.rawDocumentCount) && history.rawDocumentCount >= 0 &&
    Array.isArray(history.records) && Array.isArray(history.invalidDocumentIds) &&
    history.records.length + history.invalidDocumentIds.length === history.rawDocumentCount);
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return null;
  return new Promise(resolve => {
    let done = false;
    const finish = (db: IDBDatabase | null) => {
      if (done) { db?.close(); return; }
      done = true;
      clearTimeout(timer);
      resolve(db);
    };
    const timer = setTimeout(() => finish(null), 2_000);
    try {
      const request = window.indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch { finish(null); }
  });
}

export async function readVerifiedEvaluationHistory<T>(scope: string): Promise<VerifiedEvaluationHistory<T> | null> {
  if (!scope) return null;
  const db = await openDatabase();
  if (!db) return null;
  try {
    const result = await new Promise<unknown>(resolve => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(scope);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return validHistory<T>(result) ? result : null;
  } catch { return null; }
  finally { db.close(); }
}

export async function saveVerifiedEvaluationHistory<T>(scope: string, history: VerifiedEvaluationHistory<T>): Promise<void> {
  if (!scope || !validHistory<T>(history)) return;
  const db = await openDatabase();
  if (!db) return;
  try {
    await new Promise<void>(resolve => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(history, scope);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  } catch { /* IndexedDB is a best-effort read optimization, never the authority. */ }
  finally { db.close(); }
}
