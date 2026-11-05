// Display reads may share a short-lived snapshot. Writes and authorization
// transactions must continue to verify their state directly with the server.
type ReadEntry = { expiresAt: number; value?: unknown; pending?: Promise<unknown> };
const reads = new Map<string, ReadEntry>();
export const FIRESTORE_READ_COOLDOWN_MS = 5 * 60_000;
let limitedUntil = 0;

export function isFirestoreQuotaError(error: unknown): boolean {
  const value = error as { code?: string; status?: number; message?: string } | null;
  return value?.status === 429 || /resource[-_ ]exhausted|quota[-_ ]exceeded/i.test(
    String(value?.code || "") + " " + String(value?.message || "")
  );
}

export function noteFirestoreReadError(error: unknown): void {
  if (isFirestoreQuotaError(error)) limitedUntil = Date.now() + FIRESTORE_READ_COOLDOWN_MS;
}

export function firestoreReadWaitMs(): number {
  return Math.max(0, limitedUntil - Date.now());
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
