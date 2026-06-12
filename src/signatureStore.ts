import { collection, deleteField, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const SIGNATURE_DOCUMENT_COLLECTION = "qa_signature_documents";

export type StoredSignatureEntry = {
  role: "QA" | "Supervisor" | "Senior" | "Agent";
  signerName: string;
  signedBy: string;
  signedAt: string;
  status: "Signed" | "Pending";
  note?: string;
  signatureDataUrl?: string;
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

function toStoredDocument(row: any, fallbackId = ""): StoredSignatureDocument {
  const entries = Array.isArray(row.entries) ? row.entries : [];
  return {
    docId: String(row.docId || row.doc_id || fallbackId || ""),
    entries: entries
      .map((entry: any) => ({
        role: entry.role,
        signerName: String(entry.signerName || entry.signer_name || ""),
        signedBy: String(entry.signedBy || entry.signed_by || ""),
        signedAt: String(entry.signedAt || entry.signed_at || ""),
        status: entry.status === "Pending" ? "Pending" : "Signed",
        note: entry.note ? String(entry.note) : undefined,
        signatureDataUrl: entry.signatureDataUrl || entry.signature_data_url || undefined,
      }))
      .filter((entry: StoredSignatureEntry) => entry.role && entry.signerName && entry.signedAt),
    confirmedAt: String(row.confirmedAt || row.confirmed_at || ""),
    updatedAt: String(row.updatedAt || row.updated_at || ""),
  };
}

export async function fetchStoredSignatureDocuments() {
  const snapshot = await getDocs(collection(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION));
  return snapshot.docs
    .map((item) => toStoredDocument(item.data(), item.id))
    .filter((item) => item.docId);
}

export async function saveStoredSignatureDocument(docId: string, entries: StoredSignatureEntry[], confirmedAt = "") {
  const now = new Date().toISOString();
  await setDoc(
    doc(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION, safeDocId(docId)),
    {
      docId,
      entries,
      ...(confirmedAt ? { confirmedAt } : {}),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveStoredSignatureConfirm(docId: string, confirmedAt: string) {
  const now = new Date().toISOString();
  await setDoc(
    doc(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION, safeDocId(docId)),
    {
      docId,
      confirmedAt,
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function clearStoredSignatureConfirm(docId: string, entries: StoredSignatureEntry[] = []) {
  const now = new Date().toISOString();
  await setDoc(
    doc(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION, safeDocId(docId)),
    {
      docId,
      entries,
      confirmedAt: deleteField(),
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
}
