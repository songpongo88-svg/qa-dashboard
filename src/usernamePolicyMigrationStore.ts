import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
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
const MIGRATION_COLLECTION = "qa_system_migrations";
const MIGRATION_ID = "username-title-case-policy-2026-08-18-v1";
const MIGRATION_STALE_MS = 5 * 60 * 1000;
const MIGRATION_WAIT_MS = 45 * 1000;

const env = (import.meta as any).env || {};
const EVALUATION_COLLECTION = String(
  env.VITE_FIREBASE_QA_EVALUATION_COLLECTION ||
    env.VITE_QA_EVALUATION_TABLE ||
    "qa_evaluations"
);

type MigrationMapItem = {
  oldUsername: string;
  newUsername: string;
  sourceId: string;
  sourceData: Record<string, any>;
};

type MigrationClaim = "owner" | "wait" | "done";

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

function desiredUsername(value: unknown) {
  const current = String(value || "").trim();
  if (!current) return "";

  const key = normalizeUsername(current);
  if (key === "chachiyathawiwong") return "Chachiya";
  if (key === "karnpitchaya") return "Karnpitchaya";
  if (key === "warunthon") return "Warunthon";

  return current.charAt(0).toUpperCase() + current.slice(1);
}

function assertValidUsername(username: string) {
  if (!username || username.length < 2 || username.length > 50) {
    throw new Error(`Invalid Username after migration: ${username || "(empty)"}`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(username)) {
    throw new Error(`Username contains unsupported characters: ${username}`);
  }
  if (/^[a-z]/.test(username)) {
    throw new Error(`Username must start with an uppercase letter: ${username}`);
  }
}

async function runInChunks<T>(
  items: T[],
  worker: (item: T) => Promise<unknown>,
  chunkSize = 60
) {
  for (let index = 0; index < items.length; index += chunkSize) {
    await Promise.all(items.slice(index, index + chunkSize).map(worker));
  }
}

async function claimMigration(): Promise<MigrationClaim> {
  const migrationRef = doc(firebaseDb, MIGRATION_COLLECTION, MIGRATION_ID);
  return runTransaction(firebaseDb, async (transaction) => {
    const snap = await transaction.get(migrationRef);
    const data = snap.exists() ? (snap.data() as Record<string, any>) : {};
    if (data.status === "done") return "done";

    const updatedAtMs = new Date(String(data.updatedAt || data.startedAt || "")).getTime();
    if (
      data.status === "running" &&
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs < MIGRATION_STALE_MS
    ) {
      return "wait";
    }

    const now = new Date().toISOString();
    transaction.set(
      migrationRef,
      {
        status: "running",
        startedAt: data.startedAt || now,
        updatedAt: now,
        error: "",
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
    return "owner";
  });
}

async function waitForMigration() {
  const migrationRef = doc(firebaseDb, MIGRATION_COLLECTION, MIGRATION_ID);
  const deadline = Date.now() + MIGRATION_WAIT_MS;

  while (Date.now() < deadline) {
    const snap = await getDoc(migrationRef);
    const data = snap.exists() ? (snap.data() as Record<string, any>) : {};
    if (data.status === "done") return;
    if (data.status === "failed") {
      throw new Error(String(data.error || "Username migration failed"));
    }
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }

  throw new Error("Username migration is still running. Please reload in a moment.");
}

function buildMigrationMap(
  docs: Array<{ id: string; data: () => any }>
) {
  const allProfiles = docs
    .map((item) => ({
      id: item.id,
      data: item.data() as Record<string, any>,
    }))
    .filter((item) => String(item.data.username || "").trim());

  const migrations = new Map<string, MigrationMapItem>();

  allProfiles.forEach((item) => {
    const oldUsername = String(item.data.username || item.id).trim();
    const newUsername = desiredUsername(oldUsername);
    if (!newUsername || newUsername === oldUsername) return;
    assertValidUsername(newUsername);

    migrations.set(normalizeUsername(oldUsername), {
      oldUsername,
      newUsername,
      sourceId: item.id,
      sourceData: item.data,
    });
  });

  allProfiles.forEach((item) => {
    const currentUsername = String(item.data.username || item.id).trim();
    const currentKey = normalizeUsername(currentUsername);

    migrations.forEach((migration, sourceKey) => {
      const targetKey = normalizeUsername(migration.newUsername);
      if (targetKey === sourceKey) return;
      if (currentKey === targetKey && currentKey !== sourceKey) {
        throw new Error(
          `Cannot migrate ${migration.oldUsername} to ${migration.newUsername}: target Username already exists.`
        );
      }
    });
  });

  return migrations;
}

function mappedUsername(value: unknown, migrations: Map<string, MigrationMapItem>) {
  const original = String(value || "").trim();
  if (!original) return original;
  return migrations.get(normalizeUsername(original))?.newUsername || original;
}

async function migrateSingleUsernameDocs(
  collectionName: string,
  migrations: Map<string, MigrationMapItem>,
  targetIdForUsername: (username: string) => string,
  transform?: (
    data: Record<string, any>,
    migration: MigrationMapItem,
    migrations: Map<string, MigrationMapItem>
  ) => Record<string, any>
) {
  const snapshot = await getDocs(collection(firebaseDb, collectionName));
  const matched = snapshot.docs
    .map((item) => {
      const data = item.data() as Record<string, any>;
      const migration = migrations.get(normalizeUsername(data.username));
      return migration ? { item, data, migration } : null;
    })
    .filter(Boolean) as Array<{
      item: (typeof snapshot.docs)[number];
      data: Record<string, any>;
      migration: MigrationMapItem;
    }>;

  await runInChunks(matched, async ({ item, data, migration }) => {
    const targetId = targetIdForUsername(migration.newUsername);
    const nextData = transform
      ? transform(data, migration, migrations)
      : { ...data, username: migration.newUsername };

    await setDoc(
      doc(firebaseDb, collectionName, targetId),
      {
        ...nextData,
        username: migration.newUsername,
        updatedAtServer: serverTimestamp(),
      },
      { merge: false }
    );

    if (item.id !== targetId) await deleteDoc(item.ref);
  });

  return matched.length;
}

async function updateRows(
  collectionName: string,
  updater: (data: Record<string, any>) => Record<string, any> | null
) {
  const snapshot = await getDocs(collection(firebaseDb, collectionName));
  const updates = snapshot.docs
    .map((item) => {
      const next = updater(item.data() as Record<string, any>);
      return next ? { item, next } : null;
    })
    .filter(Boolean) as Array<{
      item: (typeof snapshot.docs)[number];
      next: Record<string, any>;
    }>;

  await runInChunks(updates, async ({ item, next }) => {
    await setDoc(
      item.ref,
      { ...next, updatedAtServer: serverTimestamp() },
      { merge: true }
    );
  });

  return updates.length;
}

async function runUsernamePolicyMigration(updatedBy: string) {
  const profileSnapshot = await getDocs(collection(firebaseDb, PROFILE_COLLECTION));
  const migrations = buildMigrationMap(profileSnapshot.docs);
  if (!migrations.size) return { migratedUsers: 0, updatedRecords: 0 };

  let updatedRecords = 0;

  updatedRecords += await migrateSingleUsernameDocs(
    PROFILE_PHOTO_COLLECTION,
    migrations,
    profileDocId
  );

  updatedRecords += await migrateSingleUsernameDocs(
    TYPING_CHALLENGE_COLLECTION,
    migrations,
    lowerDocId,
    (data, migration) => ({
      ...data,
      username: migration.newUsername,
      queue: Array.isArray(data.queue)
        ? data.queue.map((item: any) => ({
            ...item,
            username: migration.newUsername,
          }))
        : data.queue,
    })
  );

  updatedRecords += await migrateSingleUsernameDocs(
    EVALUATION_PROGRESS_COLLECTION,
    migrations,
    lowerDocId,
    (data, migration, allMigrations) => ({
      ...data,
      username: migration.newUsername,
      evaluatorUsername: mappedUsername(data.evaluatorUsername, allMigrations),
    })
  );

  updatedRecords += await migrateSingleUsernameDocs(
    STICKY_NOTE_COLLECTION,
    migrations,
    stickyDocId
  );

  updatedRecords += await updateRows(TYPING_HISTORY_COLLECTION, (data) => {
    const nextUsername = mappedUsername(data.username, migrations);
    if (nextUsername === String(data.username || "").trim()) return null;
    return { username: nextUsername };
  });

  updatedRecords += await updateRows(PASSWORD_RESET_COLLECTION, (data) => {
    const nextUsername = mappedUsername(data.username, migrations);
    if (nextUsername === String(data.username || "").trim()) return null;
    return { username: nextUsername };
  });

  updatedRecords += await updateRows(EVALUATION_COLLECTION, (data) => {
    const targetSource = data.targetUsername ?? data.target_username;
    const evaluatorSource = data.evaluatorUsername ?? data.evaluator_username;
    const nextTarget = mappedUsername(targetSource, migrations);
    const nextEvaluator = mappedUsername(evaluatorSource, migrations);
    const targetChanged = nextTarget !== String(targetSource || "").trim();
    const evaluatorChanged = nextEvaluator !== String(evaluatorSource || "").trim();
    if (!targetChanged && !evaluatorChanged) return null;

    const next: Record<string, any> = {};
    if (targetChanged) {
      next.targetUsername = nextTarget;
      if (Object.prototype.hasOwnProperty.call(data, "target_username")) {
        next.target_username = nextTarget;
      }
    }
    if (evaluatorChanged) {
      next.evaluatorUsername = nextEvaluator;
      if (Object.prototype.hasOwnProperty.call(data, "evaluator_username")) {
        next.evaluator_username = nextEvaluator;
      }
    }
    return next;
  });

  updatedRecords += await updateRows(ANNOUNCEMENT_COLLECTION, (data) => {
    const currentTargets = Array.isArray(data.targetUsernames)
      ? data.targetUsernames
      : [];
    const nextTargets = currentTargets.map((item: unknown) =>
      mappedUsername(item, migrations)
    );
    const nextCreatedBy = mappedUsername(data.createdBy, migrations);
    const targetsChanged = nextTargets.some(
      (item: string, index: number) => item !== String(currentTargets[index] || "").trim()
    );
    const creatorChanged = nextCreatedBy !== String(data.createdBy || "").trim();
    if (!targetsChanged && !creatorChanged) return null;
    return {
      targetUsernames: nextTargets,
      createdBy: nextCreatedBy,
    };
  });

  const receiptSnapshot = await getDocs(
    collection(firebaseDb, ANNOUNCEMENT_RECEIPT_COLLECTION)
  );
  const matchingReceipts = receiptSnapshot.docs
    .map((item) => {
      const data = item.data() as Record<string, any>;
      const migration = migrations.get(normalizeUsername(data.username));
      return migration ? { item, data, migration } : null;
    })
    .filter(Boolean) as Array<{
      item: (typeof receiptSnapshot.docs)[number];
      data: Record<string, any>;
      migration: MigrationMapItem;
    }>;

  await runInChunks(matchingReceipts, async ({ item, data, migration }) => {
    const announcementId = String(data.announcementId || "").trim();
    const nextId = announcementReceiptId(
      announcementId || item.id.split("__")[0] || "announcement",
      migration.newUsername
    );
    await setDoc(
      doc(firebaseDb, ANNOUNCEMENT_RECEIPT_COLLECTION, nextId),
      {
        ...data,
        id: nextId,
        username: migration.newUsername,
        updatedAtServer: serverTimestamp(),
      },
      { merge: false }
    );
    if (item.id !== nextId) await deleteDoc(item.ref);
  });
  updatedRecords += matchingReceipts.length;

  const now = new Date().toISOString();
  const changedBy = String(updatedBy || "System Username Policy").trim();

  for (const migration of migrations.values()) {
    const existingHistory = Array.isArray(migration.sourceData.history)
      ? migration.sourceData.history
      : Array.isArray(migration.sourceData.profileHistory)
        ? migration.sourceData.profileHistory
        : [];
    const historyItem = {
      id: `history-username-policy-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: "Username Standardized",
      category: "Username Standardized",
      detail: `Username: ${migration.oldUsername} → ${migration.newUsername}`,
      createdAt: now,
      updatedBy: changedBy,
      changes: [
        {
          field: "Username",
          before: migration.oldUsername,
          after: migration.newUsername,
        },
      ],
    };
    const nextHistory = [historyItem, ...existingHistory].slice(0, 80);
    const targetId = profileDocId(migration.newUsername);

    await setDoc(
      doc(firebaseDb, PROFILE_COLLECTION, targetId),
      {
        ...migration.sourceData,
        username: migration.newUsername,
        history: nextHistory,
        profileHistory: nextHistory,
        previousUsername: migration.oldUsername,
        usernameStandardizedAt: now,
        usernameStandardizedBy: changedBy,
        updatedAt: now,
        updatedAtServer: serverTimestamp(),
      },
      { merge: false }
    );

    await setDoc(
      doc(firebaseDb, SESSION_CONTROL_COLLECTION, sessionDocId(migration.oldUsername)),
      {
        username: migration.oldUsername,
        revokedBefore: now,
        revokeReason: `username standardized to ${migration.newUsername}`,
        updatedAt: now,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );

    if (migration.sourceId !== targetId) {
      await deleteDoc(doc(firebaseDb, PROFILE_COLLECTION, migration.sourceId));
    }

    updatedRecords += 1;
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem("qa-dashboard:user-profiles-cache");
      window.localStorage.removeItem("qa-dashboard:password-reset-requests-cache");
      window.localStorage.removeItem("qa_remembered_username");
    } catch {
      // Best effort cache cleanup.
    }
  }

  return {
    migratedUsers: migrations.size,
    updatedRecords,
  };
}

export async function ensureUsernamePolicyMigration(
  updatedBy = "System Username Policy"
) {
  const claim = await claimMigration();
  if (claim === "done") return;
  if (claim === "wait") {
    await waitForMigration();
    return;
  }

  const migrationRef = doc(firebaseDb, MIGRATION_COLLECTION, MIGRATION_ID);

  try {
    const result = await runUsernamePolicyMigration(updatedBy);
    const now = new Date().toISOString();
    await setDoc(
      migrationRef,
      {
        status: "done",
        completedAt: now,
        updatedAt: now,
        migratedUsers: result.migratedUsers,
        updatedRecords: result.updatedRecords,
        error: "",
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await setDoc(
      migrationRef,
      {
        status: "failed",
        failedAt: now,
        updatedAt: now,
        error: message,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => undefined);
    throw error;
  }
}
