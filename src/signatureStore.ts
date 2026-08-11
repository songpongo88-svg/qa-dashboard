import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { canonicalizeAgentName } from "./lib/agentIdentity";

const SIGNATURE_DOCUMENT_COLLECTION = "qa_signature_documents";
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
  updatedAt?: string;
};

function safeDocId(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\//g, "__")
    .replace(/\s+/g, " ")
    || "unknown";
}

function canonicalSignatureDocId(value: unknown) {
  const text = String(value || "").trim();
  const separatorIndex = text.indexOf("::");
  if (separatorIndex < 0) return text;
  const monthKey = text.slice(0, separatorIndex);
  const agentName = canonicalizeAgentName(text.slice(separatorIndex + 2));
  return `${monthKey}::${agentName}`;
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
  const snapshot = await getDocs(collection(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION));
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

export async function saveStoredSignatureConfirm(docId: string, confirmedAt: string) {
  const canonicalDocId = canonicalSignatureDocId(docId);
  const now = new Date().toISOString();
  await setDoc(
    doc(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION, safeDocId(canonicalDocId)),
    {
      docId: canonicalDocId,
      confirmedAt,
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function clearStoredSignatureConfirm(docId: string, entries: StoredSignatureEntry[] = []) {
  const canonicalDocId = canonicalSignatureDocId(docId);
  const now = new Date().toISOString();
  const cleanEntries = sanitizeEntries(entries);
  await setDoc(
    doc(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION, safeDocId(canonicalDocId)),
    {
      docId: canonicalDocId,
      entries: cleanEntries,
      confirmedAt: deleteField(),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
}
