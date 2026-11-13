// Browser-only emergency recovery for an interrupted Evaluation form.
// This does NOT replace server-backed Save Draft or authorize a session takeover.
// Uses an independent key in the already-existing IndexedDB draft database so
// auto-save cannot overwrite the operator's explicitly saved Draft Queue.
const DB_NAME = "qa-dashboard-evaluation-drafts";
const STORE = "queues";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const FIELDS = [
  "agentName", "auditDate", "waitingTime", "serviceTime", "caseId",
  "caseUrl", "inquiry", "caseDescription", "processReference", "evidenceUrl",
  "noCaseForMonth", "isTestCase", "criticalError", "evaluationStatus",
  "topicState", "expandedGroups",
];
const keyFor = username => "evaluation-recovery:" + String(username || "").trim().toLowerCase();
function normalizeUser(username) {
  const id = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,64}$/.test(id)) throw Error("Invalid QA account");
  return id;
}
function dbOpen() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error("Draft database unavailable"));
    request.onblocked = () => reject(Error("Draft database blocked"));
  });
}
async function transaction(mode, key, value) {
  const db = await dbOpen();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const request = mode === "readonly" ? store.get(key) :
        value === undefined ? store.delete(key) : store.put(value, key);
      let returned;
      request.onsuccess = () => { returned = request.result; };
      tx.oncomplete = () => resolve(returned);
      tx.onerror = () => reject(tx.error || Error("Draft transaction failed"));
      tx.onabort = () => reject(tx.error || Error("Draft transaction aborted"));
    });
  } finally { db.close(); }
}
export function sanitizeRecoveryForm(form) {
  if (!form || typeof form !== "object" || Array.isArray(form)) throw Error("Invalid form");
  const copy = {};
  for (const field of FIELDS) {
    if (Object.prototype.hasOwnProperty.call(form, field)) copy[field] = form[field];
  }
  // This recovery intentionally excludes File/Blob/audio objects and local
  // blob: URLs: those attachments require explicit Save Draft and upload checks.
  const serialized = JSON.stringify(copy, (_key, value) => {
    if (typeof value === "string" && value.startsWith("blob:")) return "";
    return value;
  });
  if (serialized.length > 1024 * 1024) throw Error("Recovery exceeds 1MB");
  return JSON.parse(serialized);
}
export async function saveEvaluationRecovery(username, form) {
  const id = normalizeUser(username);
  const snapshot = sanitizeRecoveryForm(form);
  if (snapshot.evaluationStatus === "Submitted") return false;
  if (!String(snapshot.caseId || "").trim() &&
      !String(snapshot.caseDescription || "").trim() &&
      !String(snapshot.inquiry || "").trim()) return false;
  const savedAtMs = Date.now();
  await transaction("readwrite", keyFor(id), { version: 1, username: id, savedAtMs, snapshot });
  return true;
}
export async function readEvaluationRecovery(username) {
  const id = normalizeUser(username);
  const record = await transaction("readonly", keyFor(id));
  if (!record || record.version !== 1 || record.username !== id) return null;
  if (!Number.isFinite(record.savedAtMs) || Date.now() - record.savedAtMs > RETENTION_MS) return null;
  return { savedAtMs: record.savedAtMs, snapshot: sanitizeRecoveryForm(record.snapshot) };
}
export async function clearEvaluationRecovery(username) {
  const id = normalizeUser(username);
  await transaction("readwrite", keyFor(id), undefined);
}
