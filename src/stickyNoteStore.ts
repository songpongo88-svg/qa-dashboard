import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const STICKY_NOTE_COLLECTION = "qa_user_sticky_notes";
const STICKY_NOTE_CACHE_PREFIX = "qa-dashboard:create-evaluation:sticky-note:user:";
const LEGACY_STICKY_NOTE_STORAGE_KEY = "qa-dashboard:create-evaluation:sticky-note";

export type StoredStickyNote = {
  username: string;
  note: string;
  updatedAt: string;
};

function safeDocId(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\\/#?\[\]]/g, "_")
    .replace(/\s+/g, "-")
    .slice(0, 180) || "unknown";
}

function cacheKey(username: string) {
  return `${STICKY_NOTE_CACHE_PREFIX}${safeDocId(username)}`;
}

export function readCachedStickyNote(username: string) {
  if (typeof window === "undefined") return "";
  try {
    const accountNote = window.localStorage.getItem(cacheKey(username));
    if (accountNote !== null) return accountNote;

    const legacyNote = window.localStorage.getItem(LEGACY_STICKY_NOTE_STORAGE_KEY) || "";
    if (legacyNote) {
      window.localStorage.setItem(cacheKey(username), legacyNote);
    }
    return legacyNote;
  } catch {
    return "";
  }
}

export function cacheStickyNote(username: string, note: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(username), note);
    window.localStorage.setItem(LEGACY_STICKY_NOTE_STORAGE_KEY, note);
  } catch {
    // Firebase remains the cross-device backup when the browser cache is unavailable.
  }
}

export async function fetchStoredStickyNote(username: string) {
  const normalizedUsername = String(username || "").trim();
  if (!normalizedUsername) return readCachedStickyNote("anonymous");

  const cached = readCachedStickyNote(normalizedUsername);
  if (cached) return cached;

  try {
    const snapshot = await getDoc(doc(firebaseDb, STICKY_NOTE_COLLECTION, safeDocId(normalizedUsername)));
    if (!snapshot.exists()) return "";
    const note = String(snapshot.data()?.note || "");
    cacheStickyNote(normalizedUsername, note);
    return note;
  } catch {
    return cached;
  }
}

export async function saveStoredStickyNote(username: string, note: string) {
  const normalizedUsername = String(username || "").trim() || "anonymous";
  const updatedAt = new Date().toISOString();
  cacheStickyNote(normalizedUsername, note);

  try {
    await setDoc(
      doc(firebaseDb, STICKY_NOTE_COLLECTION, safeDocId(normalizedUsername)),
      {
        username: normalizedUsername,
        note,
        updatedAt,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.warn("Sticky note could not be backed up to Firebase", error);
    return false;
  }
}
