import { collection, deleteDoc, deleteField, doc, getDoc, getDocsFromServer, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { canonicalizeAgentName } from "./lib/agentIdentity";
import { canonicalSignatureDocId, monthlyResultScope, MonthlyResultLockCheckError, notifyMonthlyResultChanged, prepareMonthlyResultReferences, readMonthlyResultReferences, resultLockedAt, signatureDocumentReference, SIGNATURE_DOCUMENT_COLLECTION } from "./monthlyResultLockStore";
const SIGNATURE_LIBRARY_COLLECTION = "qa_signature_library";

export type StoredSignatureEntry = {
  role: "QA" | "Supervisor" | "Senior" | "Agent";
  signerName: string;
  signedBy: string;
  signedAt: string;
  status: "Signed" | "Pending" | "Waived";
  note?: string;
  signatureDataUrl?: string;
  resetBy?: string;
  resetAt?: string;
  waiverReason?: string;
  waivedBy?: string;
  waivedAt?: string;
  resignationDate?: string;
};

export type StoredSignatureDocument = {
  docId: string;
  entries: StoredSignatureEntry[];
  confirmedAt?: string;
  resultLockedAt?: string;
  resultRevision?: string;
  updatedAt?: string;
};

function safeDocId(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\//g, "__")
    .replace(/\s+/g, " ")
    || "unknown";
}

function toStoredDocument(row: any, fallbackId = ""): StoredSignatureDocument {
  const entries = Array.isArray(row.entries) ? row.entries : [];
  return {
    docId: canonicalSignatureDocId(row.docId || row.doc_id || fallbackId),
    entries: entries
      .map((entry: any) => ({
        role: entry.role,
        signerName: canonicalizeAgentName(entry.signerName || entry.signer_name),
        signedBy: canonicalizeAgentName(entry.signedBy || entry.signed_by),
        signedAt: String(entry.signedAt || entry.signed_at || ""),
        status: entry.status === "Waived" ? "Waived" : entry.status === "Pending" ? "Pending" : "Signed",
        note: entry.note ? String(entry.note) : undefined,
        signatureDataUrl: entry.signatureDataUrl || entry.signature_data_url || undefined,
        resetBy: entry.resetBy || entry.reset_by ? canonicalizeAgentName(entry.resetBy || entry.reset_by) : undefined,
        resetAt: entry.resetAt || entry.reset_at ? String(entry.resetAt || entry.reset_at) : undefined,
        waiverReason: entry.waiverReason || entry.waiver_reason ? String(entry.waiverReason || entry.waiver_reason) : undefined,
        waivedBy: entry.waivedBy || entry.waived_by ? canonicalizeAgentName(entry.waivedBy || entry.waived_by) : undefined,
        waivedAt: entry.waivedAt || entry.waived_at ? String(entry.waivedAt || entry.waived_at) : undefined,
        resignationDate: entry.resignationDate || entry.resignation_date ? String(entry.resignationDate || entry.resignation_date) : undefined,
      }))
      .filter((entry: StoredSignatureEntry) =>
        entry.role &&
        entry.signerName &&
        (entry.status === "Pending" || entry.status === "Waived" || entry.signedAt)
      ),
    confirmedAt: String(row.confirmedAt || row.confirmed_at || ""),
    resultLockedAt: resultLockedAt(row),
    resultRevision: String(row.resultRevision || ""),
    updatedAt: String(row.updatedAt || row.updated_at || ""),
  };
}

function sanitizeEntry(entry: StoredSignatureEntry) {
  const cleanEntry: StoredSignatureEntry = {
    role: entry.role,
    signerName: canonicalizeAgentName(entry.signerName),
    signedBy: canonicalizeAgentName(entry.signedBy),
    signedAt: String(entry.signedAt || ""),
    status: entry.status === "Waived" ? "Waived" : entry.status === "Pending" ? "Pending" : "Signed",
  };

  if (entry.note) cleanEntry.note = String(entry.note);
  if (entry.signatureDataUrl) cleanEntry.signatureDataUrl = String(entry.signatureDataUrl);
  if (entry.resetBy) cleanEntry.resetBy = canonicalizeAgentName(entry.resetBy);
  if (entry.resetAt) cleanEntry.resetAt = String(entry.resetAt);
  if (entry.waiverReason) cleanEntry.waiverReason = String(entry.waiverReason);
  if (entry.waivedBy) cleanEntry.waivedBy = canonicalizeAgentName(entry.waivedBy);
  if (entry.waivedAt) cleanEntry.waivedAt = String(entry.waivedAt);
  if (entry.resignationDate) cleanEntry.resignationDate = String(entry.resignationDate);
  return cleanEntry;
}

function sanitizeEntries(entries: StoredSignatureEntry[] = []) {
  return entries
    .map(sanitizeEntry)
    .filter((entry) =>
      entry.role &&
      entry.signerName &&
      (entry.status === "Pending" || entry.status === "Waived" || entry.signedAt)
    );
}

export async function fetchStoredSignatureDocuments() {
  const snapshot = await getDocsFromServer(collection(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION));
  const documents = snapshot.docs
    .map((item) => toStoredDocument(item.data(), item.id))
    .filter((item) => item.docId);
  const merged = new Map<string, StoredSignatureDocument>();
  documents
    .sort((a, b) => String(a.updatedAt || "").localeCompare(String(b.updatedAt || "")))
    .forEach((item) => {
      const current = merged.get(item.docId);
      if (!current) {
        merged.set(item.docId, item);
        return;
      }
      const entries = new Map(current.entries.map((entry) => [entry.role, entry]));
      item.entries.forEach((entry) => entries.set(entry.role, entry));
      merged.set(item.docId, {
        ...current,
        ...item,
        entries: [...entries.values()],
        confirmedAt: item.confirmedAt || current.confirmedAt,
        resultLockedAt: current.resultLockedAt || item.resultLockedAt,
        resultRevision: item.resultRevision || current.resultRevision,
      });
    });
  return [...merged.values()];
}

export async function fetchStoredSignatureLibraryEntry(libraryKey: string) {
  const snapshot = await getDoc(
    doc(firebaseDb, SIGNATURE_LIBRARY_COLLECTION, safeDocId(libraryKey))
  );
  if (!snapshot.exists()) return "";
  const row = snapshot.data();
  return String(row.signatureDataUrl || row.signature_data_url || "");
}

export async function saveStoredSignatureLibraryEntry(libraryKey: string, signatureDataUrl: string) {
  const now = new Date().toISOString();
  await setDoc(
    doc(firebaseDb, SIGNATURE_LIBRARY_COLLECTION, safeDocId(libraryKey)),
    {
      libraryKey,
      signatureDataUrl: String(signatureDataUrl || ""),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    }
  );
}

export async function deleteStoredSignatureLibraryEntry(libraryKey: string) {
  await deleteDoc(doc(firebaseDb, SIGNATURE_LIBRARY_COLLECTION, safeDocId(libraryKey)));
}

export async function saveStoredSignatureDocument(docId: string, entries: StoredSignatureEntry[], confirmedAt = "") {
  const canonicalDocId = canonicalSignatureDocId(docId);
  const now = new Date().toISOString();
  const cleanEntries = sanitizeEntries(entries);
  await setDoc(
    doc(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION, safeDocId(canonicalDocId)),
    {
      docId: canonicalDocId,
      entries: cleanEntries,
      ...(confirmedAt ? { confirmedAt } : {}),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveStoredSignatureConfirm(docId: string, confirmedAt: string, options: { expectedRevision: string; confirmedBy?: string }) {
  if (typeof options?.expectedRevision !== "string") throw new MonthlyResultLockCheckError();
  const canonicalDocId = canonicalSignatureDocId(docId);
  const separator = canonicalDocId.indexOf("::");
  const scope = monthlyResultScope({ monthKey: canonicalDocId.slice(0, separator), agentName: canonicalDocId.slice(separator + 2) });
  if (!scope) throw new Error("ไม่พบ Agent หรือเดือนของเอกสาร");
  const references = await prepareMonthlyResultReferences([scope], true);
  await runTransaction(firebaseDb, async transaction => {
    const snapshots = await readMonthlyResultReferences(transaction, references, true);
    const canonical = snapshots[references.findIndex(item => item.canonical)];
    const previous = (canonical?.exists() ? canonical : snapshots.find(snapshot => snapshot.exists()))?.data() || {};
    if (String(previous.resultRevision || "") !== options.expectedRevision) {
      throw new Error("ข้อมูลเคสหรืออุทธรณ์มีการเปลี่ยนแปลง กรุณาอัปเดตข้อมูลแล้วตรวจคะแนนล่าสุดก่อนยืนยันรับทราบ");
    }
    const lockedAt = snapshots.map(snapshot => snapshot.exists() ? resultLockedAt(snapshot.data()) : "").find(Boolean) || confirmedAt;
    transaction.set(signatureDocumentReference(canonicalDocId), {
      docId: canonicalDocId,
      confirmedAt,
      resultLockedAt: lockedAt,
      ...(previous.resultLockedBy || options.confirmedBy ? { resultLockedBy: previous.resultLockedBy || options.confirmedBy } : {}),
      updatedAt: new Date().toISOString(),
      updatedAtServer: serverTimestamp(),
    }, { merge: true });
  });
  notifyMonthlyResultChanged();
}

export async function clearStoredSignatureConfirm(docId: string, entries: StoredSignatureEntry[] = []) {
  const canonicalDocId = canonicalSignatureDocId(docId);
  const cleanEntries = sanitizeEntries(entries);
  // Reset affects signatures/acknowledgement only. Preserve the original result
  // lock, including documents confirmed before resultLockedAt was introduced.
  await runTransaction(firebaseDb, async transaction => {
    const reference = signatureDocumentReference(canonicalDocId);
    const snapshot = await transaction.get(reference);
    const lockedAt = snapshot.exists() ? resultLockedAt(snapshot.data()) : "";
    transaction.set(reference, {
      docId: canonicalDocId,
      entries: cleanEntries,
      confirmedAt: deleteField(),
      confirmed_at: deleteField(),
      ...(lockedAt ? { resultLockedAt: lockedAt } : {}),
      updatedAt: new Date().toISOString(),
      updatedAtServer: serverTimestamp(),
    }, { merge: true });
  });
  notifyMonthlyResultChanged();
}
