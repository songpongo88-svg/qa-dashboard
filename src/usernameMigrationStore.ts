import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const PROFILE_COLLECTION = "qa_user_profiles";
const PROFILE_PHOTO_COLLECTION = "qa_user_profile_photos";
const TYPING_CHALLENGE_COLLECTION = "qa_typing_challenges";
const TYPING_HISTORY_COLLECTION = "qa_typing_challenge_history";
const EVALUATION_PROGRESS_COLLECTION = "qa_evaluation_progress";
const STICKY_NOTE_COLLECTION = "qa_user_sticky_notes";
const SESSION_CONTROL_COLLECTION = "qa_user_session_controls";
const PASSWORD_RESET_COLLECTION = "qa_password_reset_requests";
const ANNOUNCEMENT_COLLECTION = "qa_announcements";
const ANNOUNCEMENT_RECEIPT_COLLECTION = "qa_announcement_receipts";
const USERNAME_ALIAS_COLLECTION = "qa_username_aliases";

const env = (import.meta as any).env || {};
const EVALUATION_COLLECTION = String(
  env.VITE_FIREBASE_QA_EVALUATION_COLLECTION ||
    env.VITE_QA_EVALUATION_TABLE ||
    "qa_evaluations"
);

export type UsernameMigrationInput = {
  oldUsername: string;
  newUsername: string;
  updatedBy: string;
};

export type UsernameMigrationResult = {
  oldUsername: string;
  newUsername: string;
  migratedCollections: string[];
  updatedRecords: number;
};

function normalizeUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function profileDocId(value: unknown) {
  return (
    String(value || "")
      .trim()
      .replace(/\//g, "__")
      .replace(/\s+/g, " ") || "unknown"
  );
}

function lowerDocId(value: unknown) {
  return (
    String(value || "")
      .trim()
      .replace(/\//g, "__")
      .replace(/\s+/g, " ")
      .toLowerCase() || "unknown"
  );
}

function stickyDocId(value: unknown) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\\/#?\[\]]/g, "_")
      .replace(/\s+/g, "-")
      .slice(0, 180) || "unknown"
  );
}

function sessionDocId(value: unknown) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\//g, "__")
      .replace(/\s+/g, "_") || "unknown"
  );
}

function announcementReceiptId(announcementId: string, username: string) {
  return `${announcementId}__${username.toLowerCase()}`.replace(/[^a-z0-9_-]/gi, "_");
}

function validateNewUsername(value: string) {
  const normalized = normalizeUsername(value);
  if (!normalized) throw new Error("กรุณาระบุ Username ใหม่");
  if (normalized.length < 3 || normalized.length > 50) {
    throw new Error("Username ต้องมีความยาว 3–50 ตัวอักษร");
  }
  if (!/^[a-z0-9._-]+$/.test(normalized)) {
    throw new Error("Username ใช้ได้เฉพาะ a-z, 0-9, จุด (.), ขีดล่าง (_) และขีดกลาง (-)");
  }
  if (normalized.startsWith("__")) {
    throw new Error("Username ไม่สามารถขึ้นต้นด้วย __ ได้");
  }
  return normalized;
}

async function runInChunks<T>(items: T[], worker: (item: T) => Promise<unknown>, chunkSize = 80) {
  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize);
    await Promise.all(chunk.map(worker));
  }
}

async function copySingleUsernameDocument(
  collectionName: string,
  oldUsername: string,
  newUsername: string,
  targetId: string,
  transform?: (data: Record<string, any>) => Record<string, any>
) {
  const oldKey = normalizeUsername(oldUsername);
  const snapshot = await getDocs(collection(firebaseDb, collectionName));
  const matched = snapshot.docs.find((item) => {
    const data = item.data() as Record<string, any>;
    return normalizeUsername(data.username || "") === oldKey;
  });
  if (!matched) return 0;

  const raw = matched.data() as Record<string, any>;
  const payload = transform
    ? transform({ ...raw, username: newUsername })
    : { ...raw, username: newUsername };

  await setDoc(
    doc(firebaseDb, collectionName, targetId),
    { ...payload, username: newUsername, updatedAtServer: serverTimestamp() },
    { merge: false }
  );
  if (matched.id !== targetId) await deleteDoc(matched.ref);
  return 1;
}

async function updateCollectionRows(
  collectionName: string,
  matcher: (data: Record<string, any>) => boolean,
  updater: (data: Record<string, any>) => Record<string, any>
) {
  const snapshot = await getDocs(collection(firebaseDb, collectionName));
  const matched = snapshot.docs.filter((item) => matcher(item.data() as Record<string, any>));
  await runInChunks(matched, async (item) => {
    await setDoc(
      item.ref,
      { ...updater(item.data() as Record<string, any>), updatedAtServer: serverTimestamp() },
      { merge: true }
    );
  });
  return matched.length;
}

export async function migrateUsernameReferences({
  oldUsername,
  newUsername,
  updatedBy,
}: UsernameMigrationInput): Promise<UsernameMigrationResult> {
  const oldValue = String(oldUsername || "").trim();
  const oldKey = normalizeUsername(oldValue);
  const nextUsername = validateNewUsername(newUsername);
  const changedBy = String(updatedBy || "System").trim() || "System";

  if (!oldKey) throw new Error("ไม่พบ Username เดิม");
  if (oldKey === nextUsername) throw new Error("Username ใหม่เหมือน Username เดิม");
  if (oldKey === "songpon") {
    throw new Error("บัญชีเจ้าของระบบ Songpon ไม่สามารถเปลี่ยน Username ได้");
  }

  const profileSnapshot = await getDocs(collection(firebaseDb, PROFILE_COLLECTION));
  const sourceProfile = profileSnapshot.docs.find((item) => {
    const data = item.data() as Record<string, any>;
    return normalizeUsername(data.username || item.id) === oldKey;
  });
  if (!sourceProfile) throw new Error(`ไม่พบข้อมูลบัญชี ${oldValue}`);

  const duplicateProfile = profileSnapshot.docs.find((item) => {
    if (item.id === sourceProfile.id) return false;
    const data = item.data() as Record<string, any>;
    return normalizeUsername(data.username || item.id) === nextUsername;
  });
  if (duplicateProfile) throw new Error(`Username ${nextUsername} มีผู้ใช้งานแล้ว`);

  const now = new Date().toISOString();
  const sourceData = sourceProfile.data() as Record<string, any>;
  const existingHistory = Array.isArray(sourceData.history)
    ? sourceData.history
    : Array.isArray(sourceData.profileHistory)
      ? sourceData.profileHistory
      : [];
  const historyItem = {
    id: `history-username-${Date.now()}`,
    title: "Username Changed",
    category: "Username Changed",
    detail: `Username: ${oldValue} → ${nextUsername}`,
    createdAt: now,
    updatedBy: changedBy,
    changes: [
      {
        field: "Username",
        before: oldValue,
        after: nextUsername,
      },
    ],
  };
  const nextHistory = [historyItem, ...existingHistory].slice(0, 80);
  const migratedCollections: string[] = [];
  let updatedRecords = 0;

  // Migrate supporting data first. The old account remains valid until all copies succeed.
  updatedRecords += await copySingleUsernameDocument(
    PROFILE_PHOTO_COLLECTION,
    oldValue,
    nextUsername,
    profileDocId(nextUsername)
  );
  migratedCollections.push(PROFILE_PHOTO_COLLECTION);

  updatedRecords += await copySingleUsernameDocument(
    TYPING_CHALLENGE_COLLECTION,
    oldValue,
    nextUsername,
    lowerDocId(nextUsername),
    (data) => ({
      ...data,
      username: nextUsername,
      queue: Array.isArray(data.queue)
        ? data.queue.map((item: any) => ({ ...item, username: nextUsername }))
        : data.queue,
    })
  );
  migratedCollections.push(TYPING_CHALLENGE_COLLECTION);

  updatedRecords += await copySingleUsernameDocument(
    EVALUATION_PROGRESS_COLLECTION,
    oldValue,
    nextUsername,
    lowerDocId(nextUsername)
  );
  migratedCollections.push(EVALUATION_PROGRESS_COLLECTION);

  updatedRecords += await copySingleUsernameDocument(
    STICKY_NOTE_COLLECTION,
    oldValue,
    nextUsername,
    stickyDocId(nextUsername)
  );
  migratedCollections.push(STICKY_NOTE_COLLECTION);

  updatedRecords += await updateCollectionRows(
    TYPING_HISTORY_COLLECTION,
    (data) => normalizeUsername(data.username) === oldKey,
    (data) => ({ ...data, username: nextUsername })
  );
  migratedCollections.push(TYPING_HISTORY_COLLECTION);

  updatedRecords += await updateCollectionRows(
    PASSWORD_RESET_COLLECTION,
    (data) => normalizeUsername(data.username) === oldKey,
    (data) => ({ ...data, username: nextUsername })
  );
  migratedCollections.push(PASSWORD_RESET_COLLECTION);

  updatedRecords += await updateCollectionRows(
    EVALUATION_PROGRESS_COLLECTION,
    (data) => normalizeUsername(data.evaluatorUsername) === oldKey,
    (data) => ({ ...data, evaluatorUsername: nextUsername })
  );

  updatedRecords += await updateCollectionRows(
    EVALUATION_COLLECTION,
    (data) =>
      normalizeUsername(data.targetUsername || data.target_username) === oldKey ||
      normalizeUsername(data.evaluatorUsername || data.evaluator_username) === oldKey,
    (data) => {
      const next: Record<string, any> = { ...data };
      if (normalizeUsername(data.targetUsername || data.target_username) === oldKey) {
        next.targetUsername = nextUsername;
        if (Object.prototype.hasOwnProperty.call(data, "target_username")) next.target_username = nextUsername;
      }
      if (normalizeUsername(data.evaluatorUsername || data.evaluator_username) === oldKey) {
        next.evaluatorUsername = nextUsername;
        if (Object.prototype.hasOwnProperty.call(data, "evaluator_username")) next.evaluator_username = nextUsername;
      }
      return next;
    }
  );
  migratedCollections.push(EVALUATION_COLLECTION);

  updatedRecords += await updateCollectionRows(
    ANNOUNCEMENT_COLLECTION,
    (data) => {
      const targets = Array.isArray(data.targetUsernames) ? data.targetUsernames : [];
      return (
        targets.some((item: unknown) => normalizeUsername(item) === oldKey) ||
        normalizeUsername(data.createdBy) === oldKey
      );
    },
    (data) => ({
      ...data,
      targetUsernames: Array.isArray(data.targetUsernames)
        ? data.targetUsernames.map((item: unknown) =>
            normalizeUsername(item) === oldKey ? nextUsername : item
          )
        : data.targetUsernames,
      createdBy: normalizeUsername(data.createdBy) === oldKey ? nextUsername : data.createdBy,
    })
  );
  migratedCollections.push(ANNOUNCEMENT_COLLECTION);

  const receiptSnapshot = await getDocs(collection(firebaseDb, ANNOUNCEMENT_RECEIPT_COLLECTION));
  const matchingReceipts = receiptSnapshot.docs.filter(
    (item) => normalizeUsername((item.data() as Record<string, any>).username) === oldKey
  );
  await runInChunks(matchingReceipts, async (item) => {
    const data = item.data() as Record<string, any>;
    const announcementId = String(data.announcementId || "").trim();
    const nextId = announcementReceiptId(announcementId || item.id.split("__")[0] || "announcement", nextUsername);
    await setDoc(
      doc(firebaseDb, ANNOUNCEMENT_RECEIPT_COLLECTION, nextId),
      { ...data, id: nextId, username: nextUsername, updatedAtServer: serverTimestamp() },
      { merge: false }
    );
    if (item.id !== nextId) await deleteDoc(item.ref);
  });
  updatedRecords += matchingReceipts.length;
  migratedCollections.push(ANNOUNCEMENT_RECEIPT_COLLECTION);

  // Create the new account only after linked data has been migrated successfully.
  const targetProfileRef = doc(firebaseDb, PROFILE_COLLECTION, profileDocId(nextUsername));
  await setDoc(
    targetProfileRef,
    {
      ...sourceData,
      username: nextUsername,
      history: nextHistory,
      profileHistory: nextHistory,
      previousUsername: oldValue,
      usernameChangedAt: now,
      usernameChangedBy: changedBy,
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: false }
  );
  migratedCollections.push(PROFILE_COLLECTION);
  updatedRecords += 1;

  await setDoc(
    doc(firebaseDb, USERNAME_ALIAS_COLLECTION, lowerDocId(oldValue)),
    {
      oldUsername: oldValue,
      newUsername: nextUsername,
      changedAt: now,
      changedBy,
      active: true,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
  migratedCollections.push(USERNAME_ALIAS_COLLECTION);

  // Revoke all sessions that still identify as the old username.
  await setDoc(
    doc(firebaseDb, SESSION_CONTROL_COLLECTION, sessionDocId(oldValue)),
    {
      username: oldValue,
      revokedBefore: now,
      revokeReason: `username changed to ${nextUsername}`,
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
  migratedCollections.push(SESSION_CONTROL_COLLECTION);

  if (sourceProfile.id !== targetProfileRef.id) {
    await deleteDoc(sourceProfile.ref);
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem("qa-dashboard:user-profiles-cache");
      window.localStorage.removeItem("qa-dashboard:password-reset-requests-cache");
    } catch {
      // Cache cleanup is best effort only.
    }
  }

  window.dispatchEvent(
    new CustomEvent("qa-username-changed", {
      detail: { oldUsername: oldValue, newUsername: nextUsername },
    })
  );

  return {
    oldUsername: oldValue,
    newUsername: nextUsername,
    migratedCollections: Array.from(new Set(migratedCollections)),
    updatedRecords,
  };
}
