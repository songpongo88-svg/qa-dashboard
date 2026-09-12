import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { canonicalizeAgentName } from "./lib/agentIdentity";

const SIGNATURE_DOCUMENT_COLLECTION = "qa_signature_documents";

export type PaymentCarryOverStatus = "Carry Over" | "Exported";

export type PaymentCarryOverState = {
  docId: string;
  performanceMonth: string;
  paymentCycle: string;
  signatureCompletedAt: string;
  status: PaymentCarryOverStatus;
  exportedAt?: string;
  exportedBy?: string;
};

function normalizeDocIdentity(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function canonicalSignatureDocumentId(value: string) {
  const text = normalizeDocIdentity(value);
  if (!text) return "";
  const [monthKey, ...agentParts] = text.split("::");
  if (!agentParts.length) return text;
  const canonicalAgent = canonicalizeAgentName(agentParts.join("::"));
  return `${normalizeDocIdentity(monthKey)}::${normalizeDocIdentity(canonicalAgent)}`;
}

function safeDocId(value: string) {
  return encodeURIComponent(canonicalSignatureDocumentId(value));
}

function normalizeCarryOverState(value: any): PaymentCarryOverState | null {
  if (!value || typeof value !== "object") return null;
  const docId = canonicalSignatureDocumentId(String(value.docId || ""));
  const performanceMonth = String(value.performanceMonth || "").trim();
  const paymentCycle = String(value.paymentCycle || "").trim();
  const signatureCompletedAt = String(value.signatureCompletedAt || "").trim();
  const status = value.status === "Exported" ? "Exported" : "Carry Over";
  if (!docId || !performanceMonth || !paymentCycle) return null;
  return {
    docId,
    performanceMonth,
    paymentCycle,
    signatureCompletedAt,
    status,
    exportedAt: String(value.exportedAt || "").trim() || undefined,
    exportedBy: String(value.exportedBy || "").trim() || undefined,
  };
}

export async function fetchPaymentCarryOverStates(): Promise<Record<string, PaymentCarryOverState>> {
  const snapshot = await getDocs(collection(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION));
  const states: Record<string, PaymentCarryOverState> = {};
  snapshot.docs.forEach((snapshotDoc) => {
    const data = snapshotDoc.data() as any;
    const state = normalizeCarryOverState(data.paymentCarryOver);
    if (!state) return;
    states[state.docId] = state;
  });
  return states;
}

export async function savePaymentCarryOverState(state: PaymentCarryOverState) {
  const canonicalDocId = canonicalSignatureDocumentId(state.docId);
  if (!canonicalDocId) throw new Error("Missing signature document id");
  const next: PaymentCarryOverState = {
    ...state,
    docId: canonicalDocId,
  };
  await setDoc(
    doc(firebaseDb, SIGNATURE_DOCUMENT_COLLECTION, safeDocId(canonicalDocId)),
    {
      docId: canonicalDocId,
      paymentCarryOver: next,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  return next;
}

export async function markPaymentCarryOverExported(input: {
  docId: string;
  performanceMonth: string;
  paymentCycle: string;
  signatureCompletedAt: string;
  exportedBy?: string;
}) {
  return savePaymentCarryOverState({
    docId: input.docId,
    performanceMonth: input.performanceMonth,
    paymentCycle: input.paymentCycle,
    signatureCompletedAt: input.signatureCompletedAt,
    status: "Exported",
    exportedAt: new Date().toISOString(),
    exportedBy: String(input.exportedBy || "").trim() || undefined,
  });
}
