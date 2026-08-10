import { collection, deleteField, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { canonicalizeAgentName } from "./lib/agentIdentity";

const SIGNATURE_DOCUMENT_COLLECTION = "qa_signature_documents";

export type StoredSignatureEntry = {
  role: "QA" | "Supervisor" | "Senior" | "Agent";
  signerName: string;
  signedBy: string;
  signedAt: string;
  status: "Signed" | "Pending";
  note?: string;
  signatureDataUrl?: string;
  resetBy?: string;
  resetAt?: string;
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
        status: entry.status === "Pending" ? "Pending" : "Signed",
        note: entry.note ? String(entry.note) : undefined,
        signatureDataUrl: entry.signatureDataUrl || entry.signature_data_url || undefined,
        resetBy: entry.resetBy || entry.reset_by ? canonicalizeAgentName(entry.resetBy || entry.reset_by) : undefined,
        resetAt: entry.resetAt || entry.reset_at ? String(entry.resetAt || entry.reset_at) : undefined,
      }))
      .filter((entry: StoredSignatureEntry) =>
        entry.role &&
        entry.signerName &&
        (entry.status === "Pending" || entry.signedAt)
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
    status: entry.status === "Pending" ? "Pending" : "Signed",
  };

  if (entry.note) cleanEntry.note = String(entry.note);
  if (entry.signatureDataUrl) cleanEntry.signatureDataUrl = String(entry.signatureDataUrl);
  if (entry.resetBy) cleanEntry.resetBy = canonicalizeAgentName(entry.resetBy);
  if (entry.resetAt) cleanEntry.resetAt = String(entry.resetAt);
  return cleanEntry;
}

function sanitizeEntries(entries: StoredSignatureEntry[] = []) {
  return entries
    .map(sanitizeEntry)
    .filter((entry) =>
      entry.role &&
      entry.signerName &&
      (entry.status === "Pending" || entry.signedAt)
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
