import { addDoc, collection, limit, onSnapshot, query, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const QA_TYPING_CHALLENGE_HISTORY_COLLECTION = "qa_typing_challenge_history";

export type QaTypingChallengeHistoryResult = "Pass" | "Fail" | "Timeout";

export type QaTypingChallengeHistoryRecord = {
  id: string;
  username: string;
  displayName: string;
  word: string;
  repeatCount: number;
  typedCount: number;
  correctCount: number;
  mistakeCount: number;
  allowedMistakes: number;
  timeLimitSeconds: number;
  timeUsedSeconds: number;
  result: QaTypingChallengeHistoryResult;
  completedAt: string;
  assignedAt: string;
  assignedBy: string;
};

type NewQaTypingChallengeHistoryRecord = Omit<QaTypingChallengeHistoryRecord, "id">;

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function normalizeHistoryRecord(id: string, row: any): QaTypingChallengeHistoryRecord {
  const repeatCount = normalizeNumber(row?.repeatCount, 0);
  const typedCount = normalizeNumber(row?.typedCount, 0);
  const correctCount = Math.min(typedCount, normalizeNumber(row?.correctCount, 0));
  const mistakeCount = Math.min(typedCount, normalizeNumber(row?.mistakeCount, Math.max(0, typedCount - correctCount)));
  const result: QaTypingChallengeHistoryResult =
    row?.result === "Pass" || row?.result === "Timeout" ? row.result : "Fail";

  return {
    id,
    username: String(row?.username || "").trim(),
    displayName: String(row?.displayName || "").trim(),
    word: String(row?.word || "").trim(),
    repeatCount,
    typedCount,
    correctCount,
    mistakeCount,
    allowedMistakes: normalizeNumber(row?.allowedMistakes, 0),
    timeLimitSeconds: normalizeNumber(row?.timeLimitSeconds, 60) || 60,
    timeUsedSeconds: normalizeNumber(row?.timeUsedSeconds, 0),
    result,
    completedAt: String(row?.completedAt || ""),
    assignedAt: String(row?.assignedAt || ""),
    assignedBy: String(row?.assignedBy || "").trim(),
  };
}

export async function saveQaTypingChallengeHistory(record: NewQaTypingChallengeHistoryRecord) {
  await addDoc(collection(firebaseDb, QA_TYPING_CHALLENGE_HISTORY_COLLECTION), {
    username: String(record.username || "").trim(),
    displayName: String(record.displayName || "").trim(),
    word: String(record.word || "").trim(),
    repeatCount: normalizeNumber(record.repeatCount, 0),
    typedCount: normalizeNumber(record.typedCount, 0),
    correctCount: normalizeNumber(record.correctCount, 0),
    mistakeCount: normalizeNumber(record.mistakeCount, 0),
    allowedMistakes: normalizeNumber(record.allowedMistakes, 0),
    timeLimitSeconds: normalizeNumber(record.timeLimitSeconds, 60) || 60,
    timeUsedSeconds: normalizeNumber(record.timeUsedSeconds, 0),
    result: record.result,
    completedAt: record.completedAt || new Date().toISOString(),
    assignedAt: record.assignedAt || "",
    assignedBy: String(record.assignedBy || "").trim(),
    createdAtServer: serverTimestamp(),
  });
}

export function subscribeQaTypingChallengeHistory(
  onChange: (records: QaTypingChallengeHistoryRecord[]) => void,
  onError?: (error: unknown) => void
) {
  const historyQuery = query(collection(firebaseDb, QA_TYPING_CHALLENGE_HISTORY_COLLECTION), limit(1500));

  return onSnapshot(
    historyQuery,
    (snapshot) => {
      const records = snapshot.docs
        .map((item) => normalizeHistoryRecord(item.id, item.data()))
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
      onChange(records);
    },
    (error) => onError?.(error)
  );
}
