import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { evaluationProgressDocId } from "./evaluationActivity";

const QA_EVALUATION_PROGRESS_COLLECTION = "qa_evaluation_progress";
export const QA_EVALUATION_PROGRESS_TTL_MS = 90 * 1000;

export type QaEvaluationProgress = {
  username: string;
  displayName: string;
  role: string;
  evaluatorUsername: string;
  evaluatorName: string;
  completedCount: number;
  targetCount: number;
  statusText: string;
  mode?: "evaluation" | "edit";
  monthKey?: string; evaluationId?: string; caseId?: string; contextId?: string; leaseToken?: string; isTestCase?: boolean;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type QaEvaluationProgressInput = Omit<QaEvaluationProgress, "updatedAt" | "expiresAt" | "startedAt"> & {
  startedAt?: string;
};

function safeDocId(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\//g, "__")
    .replace(/\s+/g, " ")
    .toLowerCase() || "unknown";
}

function normalizeProgress(row: any): QaEvaluationProgress | null {
  const username = String(row?.username || "").trim();
  const evaluatorUsername = String(row?.evaluatorUsername || "").trim();
  if (!username || !evaluatorUsername) return null;

  const targetCount = Math.max(1, Math.floor(Number(row?.targetCount) || 10));
  const completedCount = Math.max(0, Math.floor(Number(row?.completedCount) || 0));

  return {
    username,
    displayName: String(row?.displayName || username).trim(),
    role: String(row?.role || "Agent").trim(),
    evaluatorUsername,
    evaluatorName: String(row?.evaluatorName || evaluatorUsername).trim(),
    completedCount,
    targetCount,
    statusText: String(row?.statusText || "").trim(),
    mode: row?.mode === "edit" ? "edit" : "evaluation",
    monthKey: String(row?.monthKey || ""), evaluationId: String(row?.evaluationId || ""), caseId: String(row?.caseId || ""), contextId: String(row?.contextId || ""), leaseToken: String(row?.leaseToken || ""), isTestCase: row?.isTestCase === true,
    startedAt: String(row?.startedAt || row?.updatedAt || "").trim(),
    updatedAt: String(row?.updatedAt || "").trim(),
    expiresAt: String(row?.expiresAt || "").trim(),
  };
}

export async function setQaEvaluationProgress(input: QaEvaluationProgressInput) {
  const username = String(input.username || "").trim();
  const evaluatorUsername = String(input.evaluatorUsername || "").trim();
  if (!username || !evaluatorUsername) return;

  const now = new Date();
  const updatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + QA_EVALUATION_PROGRESS_TTL_MS).toISOString();
  const payload: Record<string, unknown> = {
    username,
    displayName: String(input.displayName || username).trim(),
    role: String(input.role || "Agent").trim(),
    evaluatorUsername,
    evaluatorName: String(input.evaluatorName || evaluatorUsername).trim(),
    completedCount: Math.max(0, Math.floor(Number(input.completedCount) || 0)),
    targetCount: Math.max(1, Math.floor(Number(input.targetCount) || 10)),
    statusText: String(input.statusText || "").trim(),
    mode: input.mode === "edit" ? "edit" : "evaluation",
    monthKey: String(input.monthKey || ""), evaluationId: String(input.evaluationId || ""), caseId: String(input.caseId || ""), contextId: String(input.contextId || ""), leaseToken: String(input.leaseToken || ""), isTestCase: Boolean(input.isTestCase),
    updatedAt,
    expiresAt,
    updatedAtServer: serverTimestamp(),
  };
  if (input.startedAt) payload.startedAt = input.startedAt;

  await setDoc(
    doc(firebaseDb, QA_EVALUATION_PROGRESS_COLLECTION, evaluationProgressDocId(username, evaluatorUsername, input.contextId)),
    payload,
    { merge: true }
  );
}

export async function clearQaEvaluationProgress(username: string, evaluatorUsername?: string, contextId = "", leaseToken = "") {
  const target = username.trim().toLowerCase();
  if (!target) return;
  const reference = doc(firebaseDb, QA_EVALUATION_PROGRESS_COLLECTION, evaluationProgressDocId(username, evaluatorUsername || "", contextId));
  await runTransaction(firebaseDb, async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const row = snapshot.data();
    if (row.workflowEdit || String(row.username || "").trim().toLowerCase() !== target) return;
    if (evaluatorUsername && String(row.evaluatorUsername || "").toLowerCase() !== evaluatorUsername.toLowerCase()) return;
    if (contextId && row.contextId !== contextId) return;
    if (leaseToken && row.leaseToken !== leaseToken) return;
    transaction.delete(reference);
  });
}

export async function clearQaEvaluationProgressByEvaluator(evaluatorUsername: string) {
  const normalizedEvaluator = String(evaluatorUsername || "").trim();
  if (!normalizedEvaluator) return;

  const snapshot = await getDocs(
    query(
      collection(firebaseDb, QA_EVALUATION_PROGRESS_COLLECTION),
      where("evaluatorUsername", "==", normalizedEvaluator)
    )
  );
  await Promise.all(snapshot.docs.map(item => { const row = item.data(); return clearQaEvaluationProgress(String(row.username || ""), normalizedEvaluator, String(row.contextId || ""), String(row.leaseToken || "")); }));
}

export function subscribeQaEvaluationProgress(
  username: string,
  onChange: (progress: QaEvaluationProgress | null) => void,
  onError?: (error: unknown) => void
) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) {
    onChange(null);
    return () => {};
  }

  return onSnapshot(
    doc(firebaseDb, QA_EVALUATION_PROGRESS_COLLECTION, safeDocId(normalizedUsername)),
    (snap) => onChange(snap.exists() ? normalizeProgress(snap.data()) : null),
    (error) => onError?.(error)
  );
}
