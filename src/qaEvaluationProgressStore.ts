import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

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
    updatedAt,
    expiresAt,
    updatedAtServer: serverTimestamp(),
  };
  if (input.startedAt) payload.startedAt = input.startedAt;

  await setDoc(
    doc(firebaseDb, QA_EVALUATION_PROGRESS_COLLECTION, safeDocId(username)),
    payload,
    { merge: true }
  );
}

export async function clearQaEvaluationProgress(username: string, evaluatorUsername?: string) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return;

  const progressRef = doc(firebaseDb, QA_EVALUATION_PROGRESS_COLLECTION, safeDocId(normalizedUsername));
  if (evaluatorUsername) {
    const snap = await getDoc(progressRef);
    if (!snap.exists()) return;
    const currentEvaluator = String(snap.data()?.evaluatorUsername || "").trim().toLowerCase();
    if (currentEvaluator !== String(evaluatorUsername).trim().toLowerCase()) return;
  }
  await deleteDoc(progressRef);
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
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
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
