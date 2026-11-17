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


// Multi-tab layout backed up in the existing per-user sticky-note document.
// The legacy "note" field remains compatible with older deployments, and
// a legacy single note is migrated into Note 1 without changing its HTML.
export type StickyNoteTab = { id: string; content: string };
export type StickyNoteTabs = { notes: StickyNoteTab[]; activeNoteId: string };
const STICKY_NOTE_TABS_CACHE_PREFIX = "qa-dashboard:create-evaluation:sticky-note-tabs:user:";

function tabsCacheKey(username: string) {
  return STICKY_NOTE_TABS_CACHE_PREFIX + safeDocId(username);
}

function normalizeStickyNoteTabs(raw: unknown, fallback = ""): StickyNoteTabs {
  if (!raw || typeof raw !== "object") {
    return {notes: [{id: "note-1", content: fallback}], activeNoteId: "note-1"};
  }
  const source = raw as {notes?: unknown; activeNoteId?: unknown};
  const used = new Set<string>();
  const notes: StickyNoteTab[] = [];
  if (Array.isArray(source.notes)) {
    source.notes.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const value = entry as {id?: unknown; content?: unknown};
      const id = String(value.id || "").trim();
      if (!/^note-[1-9]\d*$/.test(id) || used.has(id)) return;
      used.add(id);
      notes.push({id, content: String(value.content || "")});
    });
  }
  if (!notes.length) notes.push({id:"note-1", content:fallback});
  const selected = String(source.activeNoteId || "");
  return {notes, activeNoteId: notes.some(note => note.id === selected) ? selected : notes[0].id};
}

export function readCachedStickyNotes(username: string): StickyNoteTabs {
  if (typeof window !== "undefined") {
    try {
      const saved = window.localStorage.getItem(tabsCacheKey(username));
      if (saved) return normalizeStickyNoteTabs(JSON.parse(saved), readCachedStickyNote(username));
    } catch {
      // Fall back to the legacy single note when local data cannot be parsed.
    }
  }
  return normalizeStickyNoteTabs(null, readCachedStickyNote(username));
}

export function cacheStickyNotes(username: string, value: StickyNoteTabs) {
  const data = normalizeStickyNoteTabs(value);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(tabsCacheKey(username), JSON.stringify(data));
    // Keep Note 1 in the legacy account cache while preserving all other tabs.
    const first = data.notes.find(note => note.id === "note-1") || data.notes[0];
    window.localStorage.setItem(cacheKey(username), first.content);
  } catch {
    // Central backup is attempted even when browser storage is unavailable.
  }
}

export async function fetchStoredStickyNotes(username: string): Promise<StickyNoteTabs> {
  const account = String(username || "").trim() || "anonymous";
  const cached = readCachedStickyNotes(account);
  try {
    const snapshot = await getDoc(doc(firebaseDb, STICKY_NOTE_COLLECTION, safeDocId(account)));
    if (!snapshot.exists()) return cached;
    const data = snapshot.data();
    const remote = Array.isArray(data?.notes)
      ? normalizeStickyNoteTabs({notes:data.notes, activeNoteId:data.activeNoteId},String(data.note || ""))
      : normalizeStickyNoteTabs(null,String(data?.note || ""));
    // Do not replace a pending browser-only edit with a stale empty remote note.
    const hasCachedContent = cached.notes.some(note => Boolean(note.content.trim()));
    const hasRemoteContent = remote.notes.some(note => Boolean(note.content.trim()));
    const result = !hasRemoteContent && hasCachedContent ? cached : remote;
    cacheStickyNotes(account,result);
    return result;
  } catch {
    return cached;
  }
}

// Serialize central writes per account so a delayed save of an older tab does
// not overwrite a more recent switch, edit, or newly-created note.
const pendingStickyTabSaves = new Map<string, Promise<boolean>>();
export async function saveStoredStickyNotes(username: string, value: StickyNoteTabs): Promise<boolean> {
  const account = String(username || "").trim() || "anonymous";
  const data = normalizeStickyNoteTabs(value);
  cacheStickyNotes(account,data);
  const oldSave = pendingStickyTabSaves.get(account) || Promise.resolve(true);
  const save = oldSave.catch(() => false).then(async () => {
    try {
      const first = data.notes.find(note => note.id === "note-1") || data.notes[0];
      await setDoc(
        doc(firebaseDb, STICKY_NOTE_COLLECTION, safeDocId(account)),
        {
          username: account,
          note: first.content,
          notes: data.notes,
          activeNoteId: data.activeNoteId,
          updatedAt: new Date().toISOString(),
          updatedAtServer: serverTimestamp(),
        },
        { merge: true }
      );
      return true;
    } catch (error) {
      console.warn("Sticky note tabs could not be backed up to Firebase", error);
      return false;
    }
  });
  pendingStickyTabSaves.set(account,save);
  void save.finally(() => {
    if (pendingStickyTabSaves.get(account) === save) pendingStickyTabSaves.delete(account);
  });
  return save;
}
