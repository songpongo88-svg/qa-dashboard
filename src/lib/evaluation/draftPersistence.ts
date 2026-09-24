const DATABASE_NAME = "qa-dashboard-evaluation-drafts";
const STORE_NAME = "queues";
const QUEUE_KEY = "evaluation-drafts";
const LEGACY_KEY = "qa-dashboard:create-evaluation:drafts";
const OLDEST_KEY = "qa-dashboard:create-evaluation:draft";

type DraftRow = { draftId?: string; caseId?: string; auditDate?: string; savedAtMs?: number };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("IndexedDB unavailable"));
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Cannot open draft storage"));
    request.onblocked = () => reject(new Error("Draft storage is blocked by another tab"));
  });
}

async function readDatabase<T>(): Promise<T[]> {
  const db = await openDatabase();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(QUEUE_KEY);
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as T[] : []);
      request.onerror = () => reject(request.error || new Error("Cannot read drafts"));
    });
  } finally {
    db.close();
  }
}

async function writeDatabase<T>(drafts: T[]): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(drafts, QUEUE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Cannot save drafts"));
      transaction.onabort = () => reject(transaction.error || new Error("Draft save cancelled"));
    });
  } finally {
    db.close();
  }
}

function readLegacy<T>(): { drafts: T[]; oldKeys: string[]; authoritative: boolean } {
  const oldKeys: string[] = [];
  let drafts: T[] = [];
  let authoritative = false;
  for (const key of [LEGACY_KEY, OLDEST_KEY]) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    const parsed = JSON.parse(raw);
    if (key === LEGACY_KEY && parsed?.version === 2 && Array.isArray(parsed.drafts)) {
      drafts = parsed.drafts as T[];
      authoritative = true;
    } else if (Array.isArray(parsed)) {
      drafts = [...drafts, ...parsed as T[]];
    } else if (key === OLDEST_KEY && parsed && typeof parsed === "object") {
      drafts.push(parsed as T);
    } else {
      throw new Error("Saved draft data is invalid");
    }
    oldKeys.push(key);
  }
  return { drafts, oldKeys, authoritative };
}

function draftIdentity(draft: DraftRow): string {
  return draft.draftId || `${draft.caseId || ""}::${draft.auditDate || ""}`;
}

function mergeDrafts<T extends DraftRow>(stored: T[], legacy: T[]): T[] {
  const merged = new Map<string, T>();
  for (const draft of [...stored, ...legacy]) {
    const key = draftIdentity(draft);
    const previous = merged.get(key);
    if (!previous || Number(draft.savedAtMs || 0) >= Number(previous.savedAtMs || 0)) merged.set(key, draft);
  }
  return [...merged.values()];
}

export async function readDraftQueue<T extends DraftRow>(): Promise<T[]> {
  let legacy: { drafts: T[]; oldKeys: string[]; authoritative: boolean };
  try {
    legacy = readLegacy<T>();
  } catch (error) {
    // A corrupt legacy value must never overwrite drafts already in IndexedDB.
    return readDatabase<T>().catch(() => { throw error; });
  }
  let stored: T[];
  try {
    stored = await readDatabase<T>();
  } catch (error) {
    if (legacy.oldKeys.length) return legacy.drafts;
    throw error;
  }
  if (!legacy.oldKeys.length) return stored;
  const drafts = legacy.authoritative ? legacy.drafts : mergeDrafts(stored, legacy.drafts);
  try {
    await writeDatabase(drafts);
    for (const key of legacy.oldKeys) {
      try { window.localStorage.removeItem(key); } catch { /* IndexedDB already holds the drafts. */ }
    }
  } catch { /* Keep the legacy copy and show the merged queue without losing either source. */ }
  return drafts;
}

export async function writeDraftQueue<T extends DraftRow>(drafts: T[]): Promise<void> {
  try {
    await writeDatabase(drafts);
    // Remove the smaller legacy copy only after the IndexedDB transaction commits.
    for (const key of [LEGACY_KEY, OLDEST_KEY]) {
      try { window.localStorage.removeItem(key); } catch { /* Saved in IndexedDB. */ }
    }
  } catch (error) {
    // Older browsers without IndexedDB can still save if localStorage has room.
    try {
      window.localStorage.setItem(LEGACY_KEY, JSON.stringify({ version: 2, drafts }));
      window.localStorage.removeItem(OLDEST_KEY);
    } catch {
      throw error;
    }
  }
}
