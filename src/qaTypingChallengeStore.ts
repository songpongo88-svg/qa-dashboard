import { deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const QA_TYPING_CHALLENGE_COLLECTION = "qa_typing_challenges";

export type QaTypingChallenge = {
  username: string;
  displayName: string;
  word: string;
  repeatCount: number;
  allowedMistakes: number;
  timeLimitSeconds: number;
  assignedAt: string;
  assignedBy: string;
};

function safeDocId(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\//g, "__")
    .replace(/\s+/g, " ")
    .toLowerCase() || "unknown";
}

function normalizeChallenge(username: string, row: any): QaTypingChallenge | null {
  const word = String(row?.word || "").trim();
  const repeatCount = Math.max(1, Math.min(500, Math.floor(Number(row?.repeatCount) || 0)));
  const allowedMistakes = Math.max(0, Math.min(repeatCount, Math.floor(Number(row?.allowedMistakes) || 0)));
  const timeLimitSeconds = Math.max(10, Math.min(3600, Math.floor(Number(row?.timeLimitSeconds) || 60)));
  if (!word || !repeatCount) return null;

  return {
    username: String(row?.username || username || "").trim(),
    displayName: String(row?.displayName || "").trim(),
    word,
    repeatCount,
    allowedMistakes,
    timeLimitSeconds,
    assignedAt: String(row?.assignedAt || ""),
    assignedBy: String(row?.assignedBy || "").trim(),
  };
}

export async function fetchQaTypingChallenge(username: string) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return null;
  const snap = await getDoc(doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername)));
  if (!snap.exists()) return null;
  return normalizeChallenge(normalizedUsername, snap.data());
}

export function subscribeQaTypingChallenge(
  username: string,
  onChange: (challenge: QaTypingChallenge | null) => void,
  onError?: (error: unknown) => void
) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) {
    onChange(null);
    return () => {};
  }

  return onSnapshot(
    doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername)),
    (snap) => {
      onChange(snap.exists() ? normalizeChallenge(normalizedUsername, snap.data()) : null);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function assignQaTypingChallenge(challenge: QaTypingChallenge) {
  const username = String(challenge.username || "").trim();
  const word = String(challenge.word || "").trim();
  const repeatCount = Math.max(1, Math.min(500, Math.floor(Number(challenge.repeatCount) || 1)));
  const allowedMistakes = Math.max(0, Math.min(repeatCount, Math.floor(Number(challenge.allowedMistakes) || 0)));
  const timeLimitSeconds = Math.max(10, Math.min(3600, Math.floor(Number(challenge.timeLimitSeconds) || 60)));
  if (!username) throw new Error("Missing target username");
  if (!word) throw new Error("Missing typing word");

  await setDoc(
    doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(username)),
    {
      username,
      displayName: String(challenge.displayName || "").trim(),
      word,
      repeatCount,
      allowedMistakes,
      timeLimitSeconds,
      assignedAt: challenge.assignedAt || new Date().toISOString(),
      assignedBy: String(challenge.assignedBy || "").trim(),
      updatedAtServer: serverTimestamp(),
    },
    { merge: false }
  );
}

export async function clearQaTypingChallenge(username: string) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return;
  await deleteDoc(doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername)));
}
