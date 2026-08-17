import { deleteDoc, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const QA_TYPING_CHALLENGE_COLLECTION = "qa_typing_challenges";
const MAX_QUEUE_ITEMS = 50;

export type QaTypingChallengeMode = "word" | "sentence";

export type QaTypingChallenge = {
  id: string;
  username: string;
  displayName: string;
  word: string;
  mode: QaTypingChallengeMode;
  repeatCount: number;
  allowedMistakes: number;
  timeLimitSeconds: number;
  assignedAt: string;
  assignedBy: string;
};

export type NewQaTypingChallenge = Omit<QaTypingChallenge, "id" | "mode"> & {
  id?: string;
  mode?: QaTypingChallengeMode;
};

function safeDocId(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\//g, "__")
    .replace(/\s+/g, " ")
    .toLowerCase() || "unknown";
}

function detectChallengeMode(value: unknown): QaTypingChallengeMode {
  const text = String(value || "").trim();
  return /\s/.test(text) ? "sentence" : "word";
}

function createChallengeId(username: string, assignedAt: string, word: string) {
  const seed = `${username}|${assignedAt}|${word}|${Date.now()}|${Math.random().toString(36).slice(2, 8)}`;
  return seed.replace(/[^a-zA-Z0-9ก-๙_-]+/g, "-").slice(0, 180);
}

function legacyChallengeId(username: string, assignedAt: string, word: string) {
  return `legacy-${username}-${assignedAt || "unknown"}-${word}`
    .replace(/[^a-zA-Z0-9ก-๙_-]+/g, "-")
    .slice(0, 180);
}

function normalizeChallenge(username: string, row: any, fallbackId = ""): QaTypingChallenge | null {
  const word = String(row?.word || row?.text || "").trim();
  const repeatCount = Math.max(1, Math.min(500, Math.floor(Number(row?.repeatCount) || 0)));
  const allowedMistakes = Math.max(0, Math.min(repeatCount, Math.floor(Number(row?.allowedMistakes) || 0)));
  const timeLimitSeconds = Math.max(10, Math.min(3600, Math.floor(Number(row?.timeLimitSeconds) || 60)));
  const assignedAt = String(row?.assignedAt || "");
  if (!word || !repeatCount) return null;

  const mode: QaTypingChallengeMode = row?.mode === "sentence" || row?.mode === "word"
    ? row.mode
    : detectChallengeMode(word);

  return {
    id: String(row?.id || fallbackId || legacyChallengeId(username, assignedAt, word)).trim(),
    username: String(row?.username || username || "").trim(),
    displayName: String(row?.displayName || "").trim(),
    word,
    mode,
    repeatCount,
    allowedMistakes,
    timeLimitSeconds,
    assignedAt,
    assignedBy: String(row?.assignedBy || "").trim(),
  };
}

function normalizeQueue(username: string, row: any): QaTypingChallenge[] {
  if (Array.isArray(row?.queue)) {
    return row.queue
      .map((item: any, index: number) => normalizeChallenge(username, item, `queue-${index + 1}`))
      .filter((item: QaTypingChallenge | null): item is QaTypingChallenge => Boolean(item))
      .slice(0, MAX_QUEUE_ITEMS);
  }

  const legacy = normalizeChallenge(username, row);
  return legacy ? [legacy] : [];
}

function serializeChallenge(challenge: QaTypingChallenge) {
  return {
    id: challenge.id,
    username: challenge.username,
    displayName: challenge.displayName,
    word: challenge.word,
    mode: challenge.mode,
    repeatCount: challenge.repeatCount,
    allowedMistakes: challenge.allowedMistakes,
    timeLimitSeconds: challenge.timeLimitSeconds,
    assignedAt: challenge.assignedAt,
    assignedBy: challenge.assignedBy,
  };
}

export async function fetchQaTypingChallengeQueue(username: string) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return [];
  const snap = await getDoc(doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername)));
  if (!snap.exists()) return [];
  return normalizeQueue(normalizedUsername, snap.data());
}

export async function fetchQaTypingChallenge(username: string) {
  const queue = await fetchQaTypingChallengeQueue(username);
  return queue[0] || null;
}

export function subscribeQaTypingChallengeQueue(
  username: string,
  onChange: (queue: QaTypingChallenge[]) => void,
  onError?: (error: unknown) => void
) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) {
    onChange([]);
    return () => {};
  }

  return onSnapshot(
    doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername)),
    (snap) => {
      onChange(snap.exists() ? normalizeQueue(normalizedUsername, snap.data()) : []);
    },
    (error) => onError?.(error)
  );
}

export function subscribeQaTypingChallenge(
  username: string,
  onChange: (challenge: QaTypingChallenge | null) => void,
  onError?: (error: unknown) => void
) {
  return subscribeQaTypingChallengeQueue(
    username,
    (queue) => onChange(queue[0] || null),
    onError
  );
}

export async function assignQaTypingChallenge(challenge: NewQaTypingChallenge) {
  const username = String(challenge.username || "").trim();
  const word = String(challenge.word || "").trim();
  const mode: QaTypingChallengeMode = challenge.mode === "sentence" || challenge.mode === "word"
    ? challenge.mode
    : detectChallengeMode(word);
  const repeatCount = Math.max(1, Math.min(500, Math.floor(Number(challenge.repeatCount) || 1)));
  const allowedMistakes = Math.max(0, Math.min(repeatCount, Math.floor(Number(challenge.allowedMistakes) || 0)));
  const timeLimitSeconds = Math.max(10, Math.min(3600, Math.floor(Number(challenge.timeLimitSeconds) || 60)));
  const assignedAt = challenge.assignedAt || new Date().toISOString();
  if (!username) throw new Error("Missing target username");
  if (!word) throw new Error("Missing typing text");

  const challengeRef = doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(username));

  await runTransaction(firebaseDb, async (transaction) => {
    const snap = await transaction.get(challengeRef);
    const queue = snap.exists() ? normalizeQueue(username, snap.data()) : [];
    if (queue.length >= MAX_QUEUE_ITEMS) {
      throw new Error(`QA Access Check queue limit is ${MAX_QUEUE_ITEMS} items per agent`);
    }

    const nextChallenge: QaTypingChallenge = {
      id: String(challenge.id || createChallengeId(username, assignedAt, word)).trim(),
      username,
      displayName: String(challenge.displayName || "").trim(),
      word,
      mode,
      repeatCount,
      allowedMistakes,
      timeLimitSeconds,
      assignedAt,
      assignedBy: String(challenge.assignedBy || "").trim(),
    };

    const nextQueue = [...queue, nextChallenge];
    transaction.set(
      challengeRef,
      {
        username,
        displayName: nextChallenge.displayName || queue[0]?.displayName || "",
        queue: nextQueue.map(serializeChallenge),
        queueCount: nextQueue.length,
        updatedAtServer: serverTimestamp(),
      },
      { merge: false }
    );
  });
}

export async function removeQaTypingChallenge(username: string, challengeId: string) {
  const normalizedUsername = String(username || "").trim();
  const normalizedChallengeId = String(challengeId || "").trim();
  if (!normalizedUsername || !normalizedChallengeId) return;

  const challengeRef = doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername));
  await runTransaction(firebaseDb, async (transaction) => {
    const snap = await transaction.get(challengeRef);
    if (!snap.exists()) return;

    const queue = normalizeQueue(normalizedUsername, snap.data());
    const nextQueue = queue.filter((item) => item.id !== normalizedChallengeId);
    if (nextQueue.length === queue.length) return;

    if (!nextQueue.length) {
      transaction.delete(challengeRef);
      return;
    }

    transaction.set(
      challengeRef,
      {
        username: normalizedUsername,
        displayName: nextQueue[0]?.displayName || "",
        queue: nextQueue.map(serializeChallenge),
        queueCount: nextQueue.length,
        updatedAtServer: serverTimestamp(),
      },
      { merge: false }
    );
  });
}

export async function completeQaTypingChallenge(username: string, challengeId: string) {
  return removeQaTypingChallenge(username, challengeId);
}

export async function clearQaTypingChallenge(username: string) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return;
  await deleteDoc(doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername)));
}

export async function replaceQaTypingChallengeQueue(username: string, queue: QaTypingChallenge[]) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return;
  const challengeRef = doc(firebaseDb, QA_TYPING_CHALLENGE_COLLECTION, safeDocId(normalizedUsername));
  const safeQueue = queue.slice(0, MAX_QUEUE_ITEMS);
  if (!safeQueue.length) {
    await deleteDoc(challengeRef);
    return;
  }
  await setDoc(challengeRef, {
    username: normalizedUsername,
    displayName: safeQueue[0]?.displayName || "",
    queue: safeQueue.map(serializeChallenge),
    queueCount: safeQueue.length,
    updatedAtServer: serverTimestamp(),
  });
}
