import { collection, doc, documentId, getDocsFromServer, query, where, type DocumentReference, type Transaction } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { canonicalAgentIdentityKey, canonicalizeAgentName } from "./lib/agentIdentity";

export const SIGNATURE_DOCUMENT_COLLECTION = "qa_signature_documents";
export const MONTHLY_RESULT_LOCK_MESSAGE = "Agent ยืนยันรับทราบผลเดือนนี้แล้ว ไม่สามารถยื่นอุทธรณ์หรือแก้ไขเคสและคะแนนได้อีก";
export const MONTHLY_RESULT_LOCK_CHECK_MESSAGE = "ตรวจสอบการล็อกผลประจำเดือนไม่สำเร็จ กรุณาอัปเดตข้อมูลแล้วลองอีกครั้ง";

export type MonthlyResultScope = { agentName: string; monthKey: string };
export type MonthlyResultLock = MonthlyResultScope & { lockedAt: string; revision: string };
export type MonthlyResultReference = { scope: MonthlyResultScope; reference: DocumentReference; canonical: boolean; docId: string };

export class MonthlyResultLockedError extends Error {
  constructor() { super(MONTHLY_RESULT_LOCK_MESSAGE); this.name = "MonthlyResultLockedError"; }
}

export class MonthlyResultLockCheckError extends Error {
  constructor() { super(MONTHLY_RESULT_LOCK_CHECK_MESSAGE); this.name = "MonthlyResultLockCheckError"; }
}

export function monthlyResultScope(value: Record<string, any>): MonthlyResultScope | null {
  const details = value.details || {};
  const preview = value.rawDataPreview || value.raw_data_preview || {};
  const agentName = canonicalizeAgentName(value.agentName || value.agent_name || value.target_display_name ||
    value.agent || value.target_agent || details.agent);
  const monthKey = [value.evaluationMonthKey, value.evaluation_month_key, preview["Evaluation Month Key"],
    value.monthKey, details.monthKey, value.auditDate, value.audit_date, details.auditDate,
    value.auditTimestamp, value.audit_timestamp, details.auditTimestamp, value.submittedAt, value.submitted_at]
    .map(item => String(item || "").match(/^(\d{4}-(?:0[1-9]|1[0-2]))(?:$|[-T])/)).find(Boolean)?.[1] || "";
  return agentName && monthKey ? { agentName, monthKey } : null;
}

export function monthlyResultKey(scope: MonthlyResultScope) {
  return `${scope.monthKey}::${canonicalAgentIdentityKey(scope.agentName)}`;
}

export function canonicalSignatureDocId(value: unknown) {
  const text = String(value || "").trim();
  const index = text.indexOf("::");
  return index < 0 ? text : `${text.slice(0, index)}::${canonicalizeAgentName(text.slice(index + 2))}`;
}

export function signatureDocumentId(scope: MonthlyResultScope) {
  return `${scope.monthKey}::${canonicalizeAgentName(scope.agentName)}`;
}

export function signatureDocumentReference(docId: string) {
  return doc(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION, canonicalSignatureDocId(docId).replace(/\//g, "__"));
}

export function resultLockedAt(row: Record<string, any>) {
  return String(row.resultLockedAt || row.result_locked_at || row.confirmedAt || row.confirmed_at || "");
}

function scopeFromSignatureRow(row: Record<string, any>, fallback = "") {
  const docId = canonicalSignatureDocId(row.docId || row.doc_id || fallback);
  const index = docId.indexOf("::");
  return index < 0 ? null : monthlyResultScope({ monthKey: docId.slice(0, index), agentName: docId.slice(index + 2) });
}

// One month query also finds historical spelling/case variants of the same Agent.
// A fresh server read is required before writes; cached UI state never grants permission.
async function readMonth(monthKey: string) {
  return getDocsFromServer(query(collection(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION),
    where(documentId(), ">=", `${monthKey}::`), where(documentId(), "<", `${monthKey}::\uf8ff`)));
}

export async function fetchMonthlyResultLocks(monthKey: string): Promise<MonthlyResultLock[]> {
  try {
    const snapshot = await readMonth(monthKey);
    return snapshot.docs.flatMap(item => {
      const row = item.data();
      const scope = scopeFromSignatureRow(row, item.id);
      return scope ? [{ ...scope, lockedAt: resultLockedAt(row), revision: String(row.resultRevision || "") }] : [];
    });
  } catch { throw new MonthlyResultLockCheckError(); }
}

const lockReads = new Map<string, { expiresAt: number; refreshing: boolean; promise: Promise<MonthlyResultLock[]> }>();

export function fetchCachedMonthlyResultLocks(monthKey: string, refresh = false) {
  const current = lockReads.get(monthKey);
  if (refresh && current?.refreshing) return current.promise;
  if (!refresh && current && current.expiresAt > Date.now()) return current.promise;
  const promise = fetchMonthlyResultLocks(monthKey).catch(error => { lockReads.delete(monthKey); throw error; }).finally(() => {
    if (lockReads.get(monthKey)?.promise === promise) lockReads.get(monthKey)!.refreshing = false;
  });
  lockReads.set(monthKey, { expiresAt: Date.now() + 60_000, refreshing: refresh, promise });
  return promise;
}

export async function prepareMonthlyResultReferences(scopes: readonly MonthlyResultScope[], allowLocked = false) {
  const unique = [...new Map(scopes.map(scope => [monthlyResultKey(scope), scope])).values()];
  if (!unique.length) throw new MonthlyResultLockCheckError();
  const references = new Map<string, MonthlyResultReference>();
  try {
    const months = [...new Set(unique.map(scope => scope.monthKey))];
    const snapshots = await Promise.all(months.map(readMonth));
    unique.forEach(scope => {
      const reference = signatureDocumentReference(signatureDocumentId(scope));
      references.set(reference.path, { scope, reference, canonical: true, docId: signatureDocumentId(scope) });
    });
    snapshots.forEach(snapshot => snapshot.docs.forEach(item => {
      const row = item.data();
      const scope = scopeFromSignatureRow(row, item.id);
      const target = scope && unique.find(value => monthlyResultKey(value) === monthlyResultKey(scope));
      if (!target) return;
      if (!allowLocked && resultLockedAt(row)) throw new MonthlyResultLockedError();
      const reference = doc(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION, item.id);
      const existing = references.get(reference.path);
      references.set(reference.path, { scope: target, reference, canonical: existing?.canonical || false,
        docId: canonicalSignatureDocId(row.docId || row.doc_id || item.id) });
    }));
    return [...references.values()];
  } catch (error) {
    if (error instanceof MonthlyResultLockedError) throw error;
    throw new MonthlyResultLockCheckError();
  }
}

export async function readMonthlyResultReferences(transaction: Transaction, references: readonly MonthlyResultReference[], allowLocked = false) {
  const snapshots = await Promise.all(references.map(item => transaction.get(item.reference)));
  snapshots.forEach(snapshot => {
    if (!allowLocked && snapshot.exists() && resultLockedAt(snapshot.data())) throw new MonthlyResultLockedError();
  });
  return snapshots;
}

// Every case/appeal mutation changes the same revision used by acknowledgement.
// Firestore retries a conflicting transaction, so an open page cannot write past the lock.
export function touchMonthlyResults(transaction: Transaction, references: readonly MonthlyResultReference[]) {
  const revision = crypto.randomUUID();
  references.forEach(({ docId, reference }) => transaction.set(reference, {
    docId, resultRevision: revision, updatedAt: new Date().toISOString(),
  }, { merge: true }));
}

export function notifyMonthlyResultChanged() {
  lockReads.clear();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("qa-monthly-result-refresh"));
}
