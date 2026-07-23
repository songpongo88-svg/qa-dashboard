import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

export type ExternalProfileHistoryChange = {
  field: string;
  before: string;
  after: string;
};

export type ExternalProfileHistoryEvent = {
  username: string;
  title: string;
  updatedBy: string;
  detail?: string;
  changes?: ExternalProfileHistoryChange[];
  createdAt?: string;
};

const PROFILE_COLLECTION =
  "qa_user_profiles";
const MAX_HISTORY_ITEMS = 80;

function normalizeUsername(
  value: unknown
) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function safeDocId(value: unknown) {
  return (
    String(value || "")
      .trim()
      .replace(/\//g, "__")
      .replace(/\s+/g, " ") ||
    "unknown"
  );
}

function emitProfileHistoryUpdated(
  username: string
) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      "qa-profile-history-updated",
      {
        detail: { username },
      }
    )
  );
}

export async function appendUserProfileHistory(
  event: ExternalProfileHistoryEvent
) {
  const username = String(
    event.username || ""
  ).trim();

  if (!username) return false;

  const createdAt =
    event.createdAt ||
    new Date().toISOString();
  const normalized =
    normalizeUsername(username);

  try {
    const snapshot = await getDocs(
      collection(
        firebaseDb,
        PROFILE_COLLECTION
      )
    );

    const matched =
      snapshot.docs.find((item) => {
        const data = item.data() as {
          username?: unknown;
        };

        return (
          normalizeUsername(
            data.username || item.id
          ) === normalized
        );
      }) || null;

    const targetId =
      matched?.id || safeDocId(username);
    const existingData =
      (matched?.data() || {}) as {
        history?: unknown;
        profileHistory?: unknown;
      };
    const existingHistory =
      Array.isArray(existingData.history)
        ? existingData.history
        : Array.isArray(
              existingData.profileHistory
            )
          ? existingData.profileHistory
          : [];

    const historyItem = {
      id: `history-external-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      title:
        String(event.title || "")
          .trim() ||
        "Profile Updated",
      category:
        String(event.title || "")
          .trim() ||
        "Profile Updated",
      detail:
        String(event.detail || "")
          .trim(),
      createdAt,
      updatedBy:
        String(event.updatedBy || "")
          .trim() ||
        username,
      changes: Array.isArray(
        event.changes
      )
        ? event.changes
        : [],
    };

    const nextHistory = [
      historyItem,
      ...existingHistory,
    ].slice(0, MAX_HISTORY_ITEMS);

    await setDoc(
      doc(
        firebaseDb,
        PROFILE_COLLECTION,
        targetId
      ),
      {
        username,
        history: nextHistory,
        profileHistory: nextHistory,
        updatedAt: createdAt,
        updatedAtServer:
          serverTimestamp(),
      },
      { merge: true }
    );

    emitProfileHistoryUpdated(
      username
    );

    return true;
  } catch (error) {
    console.warn(
      "Profile history append failed",
      error
    );
    return false;
  }
}
