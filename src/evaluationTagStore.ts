import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const SYSTEM_SETTINGS_COLLECTION = "qa_system_settings";
const ISSUE_TAG_DOCUMENT = "evaluation_issue_tags";
const ISSUE_TAG_CACHE_KEY = "qa-dashboard:evaluation-issue-tags:v1";
const ISSUE_TAG_PENDING_PREFIX = "qa-dashboard:evaluation-issue-tags:pending:v1:";
const READ_CACHE_MS = 60_000;
const RETRY_BASE_MS = 60_000;
const CREATE_WAIT_MS = 1_500;

export type EvaluationIssueTag = {
  id: string;
  name: string;
  normalizedName: string;
  rubricCode: string;
  topicCode: string;
  topicTitle: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
  syncStatus?: "pending" | "conflict";
  syncError?: string;
  syncAction?: "create" | "archive" | "restore";
  syncRevision?: string;
};

export type EvaluationIssueTagSnapshot = {
  tags: EvaluationIssueTag[];
  conflicts: EvaluationIssueTag[];
};

let knownTags: EvaluationIssueTag[] | null = null;
let lastReadAt = 0;
let retryAt = 0;
let retryDelay = RETRY_BASE_MS;
let retryTimer: number | undefined;
let syncBlocked = false;
let browserListenersInstalled = false;
let operations = Promise.resolve();
let fetchInFlight: Promise<EvaluationIssueTag[]> | null = null;
const listeners = new Set<(snapshot: EvaluationIssueTagSnapshot) => void>();

function normalizeTagName(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function normalizeEvaluationIssueTagName(value: unknown) {
  return normalizeTagName(value).toLocaleLowerCase("th-TH");
}

function safeTagId(value: string) {
  const base = normalizeEvaluationIssueTagName(value)
    .replace(/[^a-z0-9ก-๙]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "tag";
  return `tag-${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStoredTag(value: any): EvaluationIssueTag | null {
  const name = normalizeTagName(value?.name);
  if (!name) return null;
  return {
    id: String(value?.id || safeTagId(name)), name,
    normalizedName: normalizeEvaluationIssueTagName(value?.normalizedName || name),
    rubricCode: String(value?.rubricCode || "").trim(),
    topicCode: String(value?.topicCode || "").trim(),
    topicTitle: String(value?.topicTitle || "").trim(),
    active: value?.active !== false,
    createdAt: String(value?.createdAt || ""),
    createdBy: String(value?.createdBy || ""),
    ...(value?.syncStatus === "pending" || value?.syncStatus === "conflict"
      ? {
          syncStatus: value.syncStatus, syncError: String(value.syncError || ""),
          syncAction: value.syncAction === "archive" || value.syncAction === "restore" ? value.syncAction : "create",
          syncRevision: String(value.syncRevision || ""),
        } : {}),
  };
}

function normalizeStoredTags(value: unknown): EvaluationIssueTag[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.map(normalizeStoredTag)
    .filter((tag): tag is EvaluationIssueTag => Boolean(tag))
    .filter((tag) => {
      if (seen.has(tag.normalizedName)) return false;
      seen.add(tag.normalizedName);
      return true;
    });
}

function readCachedIssueTags() {
  if (typeof window === "undefined") return [] as EvaluationIssueTag[];
  try {
    return normalizeStoredTags(JSON.parse(window.localStorage.getItem(ISSUE_TAG_CACHE_KEY) || "[]"));
  } catch { return []; }
}

function writeCachedIssueTags(tags: EvaluationIssueTag[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ISSUE_TAG_CACHE_KEY, JSON.stringify(normalizeStoredTags(tags))); }
  catch { /* The confirmed shared source remains authoritative. */ }
}

function readPendingTags(): EvaluationIssueTag[] {
  if (typeof window === "undefined") return [];
  try {
    const pending: EvaluationIssueTag[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(ISSUE_TAG_PENDING_PREFIX)) continue;
      const tag = normalizeStoredTag(JSON.parse(window.localStorage.getItem(key) || "null"));
      if (tag) pending.push(tag);
    }
    return pending;
  } catch { return []; }
}

function savePendingTag(tag: EvaluationIssueTag) {
  try {
    if (typeof window === "undefined") throw new Error("Browser storage unavailable");
    // One key per Tag prevents another tab's queue from being overwritten.
    window.localStorage.setItem(ISSUE_TAG_PENDING_PREFIX + tag.id, JSON.stringify(tag));
  } catch {
    throw new Error("ยังเก็บ Tag ที่รอซิงก์ไม่ได้ กรุณาตรวจพื้นที่จัดเก็บของเบราว์เซอร์แล้วลองอีกครั้ง");
  }
}

function tagSnapshot(): EvaluationIssueTagSnapshot {
  const pending = readPendingTags();
  const tags = new Map((knownTags ?? readCachedIssueTags()).map((tag) => [tag.normalizedName, tag]));
  // Local removal/restoration must override the last confirmed catalog while
  // waiting for Firebase. A stale creation must never revive a removed Tag.
  const changes = pending.filter((tag) => tag.syncStatus !== "conflict")
    .sort((left, right) => Number(left.syncAction !== "create") - Number(right.syncAction !== "create"));
  for (const tag of changes) {
    const current = tags.get(tag.normalizedName);
    if (current && (!sameTopic(current, tag) || tag.syncAction === "create")) continue;
    tags.set(tag.normalizedName, tag);
  }
  return {
    tags: [...tags.values()],
    conflicts: pending.filter((tag) => tag.syncStatus === "conflict"),
  };
}

function notifyTags() {
  const snapshot = tagSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation);
  operations = result.then(() => {}, () => {});
  return result;
}

function isTemporaryTagError(error: unknown) {
  const code = String((error as { code?: string })?.code || "").replace(/^firestore\//, "");
  return ["resource-exhausted", "unavailable", "deadline-exceeded", "aborted"].includes(code);
}

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function scheduleRetry() {
  if (typeof window === "undefined" || retryTimer !== undefined || !listeners.size || syncBlocked) return;
  if (!readPendingTags().some((tag) => tag.syncStatus !== "conflict")) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined;
    void fetchEvaluationIssueTags();
  }, Math.max(1_000, retryAt - Date.now(), RETRY_BASE_MS));
}

function deferSync(error: unknown) {
  retryAt = Date.now() + retryDelay;
  retryDelay = Math.min(retryDelay * 2, 5 * RETRY_BASE_MS);
  console.warn("Evaluation issue Tag sync deferred", {
    code: (error as { code?: string })?.code || "offline",
  });
  scheduleRetry();
}

function duplicateMessage(tag: EvaluationIssueTag) {
  const where = tag.topicCode
    ? `Topic ${tag.topicCode}${tag.topicTitle ? ` — ${tag.topicTitle}` : ""}` : "หัวข้ออื่น";
  return `Tag “${tag.name}” มีอยู่แล้วใน ${where} กรุณาใช้ชื่ออื่น`;
}

function sameTopic(left: EvaluationIssueTag, right: EvaluationIssueTag) {
  return left.rubricCode === right.rubricCode && left.topicCode === right.topicCode;
}

function sharedTag(tag: EvaluationIssueTag) {
  const { syncStatus, syncError, syncAction, syncRevision, ...shared } = tag;
  return shared;
}

function removedTagMessage(tag: EvaluationIssueTag) {
  return `Tag “${tag.name}” ถูกลบจากคลังแล้ว เปิด “จัดการ Tag” แล้วกด “คืน Tag” เพื่อใช้ชื่อเดิม`;
}

function queueForLocalUse(tag: EvaluationIssueTag, priorRevision?: string) {
  if (tag.syncAction && tag.syncAction !== "create") {
    const newer = readPendingTags().find((item) => item.id === tag.id && item.syncRevision !== tag.syncRevision);
    if (newer && newer.syncRevision !== priorRevision) return newer;
  }
  const duplicate = tagSnapshot().tags.find((item) => item.normalizedName === tag.normalizedName);
  if (duplicate) {
    if (!sameTopic(duplicate, tag)) throw new Error(duplicateMessage(duplicate));
    if (!tag.syncAction || tag.syncAction === "create") {
      if (!duplicate.active) throw new Error(removedTagMessage(duplicate));
      return duplicate;
    }
    if (duplicate.active === tag.active) return duplicate;
  }
  const pendingTag: EvaluationIssueTag = { ...tag, syncStatus: "pending" };
  savePendingTag(pendingTag); notifyTags(); scheduleRetry();
  return pendingTag;
}

function finishTagChangeWithoutBlocking(operation: Promise<EvaluationIssueTag>, tag: EvaluationIssueTag, priorRevision?: string) {
  if (typeof window === "undefined") return operation;
  return new Promise<EvaluationIssueTag>((resolve, reject) => {
    // Covers both a hung transaction and a catalog read ahead of it in the
    // operation queue. A late result must retain a newer change to this Tag.
    const timer = window.setTimeout(() => {
      console.warn("Evaluation issue Tag change still waiting; using local queue", { waitMs: CREATE_WAIT_MS });
      try { resolve(queueForLocalUse(tag, priorRevision)); } catch (error) { reject(error); }
    }, CREATE_WAIT_MS);
    operation.then((created) => {
      window.clearTimeout(timer); resolve(created);
    }, (error) => {
      window.clearTimeout(timer); reject(error);
    });
  });
}

async function syncTags(pending: EvaluationIssueTag[]) {
  const settingsRef = doc(firebaseDb, SYSTEM_SETTINGS_COLLECTION, ISSUE_TAG_DOCUMENT);
  const result = await runTransaction(firebaseDb, async (transaction) => {
    const snapshot = await transaction.get(settingsRef);
    const tags = snapshot.exists() ? normalizeStoredTags(snapshot.data()?.tags) : [];
    const resolved: EvaluationIssueTag[] = [];
    const conflicts: EvaluationIssueTag[] = [];
    let changed = false;
    for (const tag of [...pending].sort((left, right) => Number(Boolean(left.syncAction && left.syncAction !== "create")) - Number(Boolean(right.syncAction && right.syncAction !== "create")))) {
      const index = tags.findIndex((item) => item.normalizedName === tag.normalizedName);
      const duplicate = tags[index];
      if (duplicate && !sameTopic(duplicate, tag)) {
        conflicts.push({ ...tag, syncStatus: "conflict", syncError: duplicateMessage(duplicate) });
        continue;
      }
      if (duplicate && !duplicate.active && (!tag.syncAction || tag.syncAction === "create")) {
        conflicts.push({ ...tag, syncStatus: "conflict", syncError: removedTagMessage(duplicate) });
        continue;
      }
      if (!duplicate) { tags.push(sharedTag(tag)); changed = true; }
      else if (tag.syncAction && tag.syncAction !== "create" && duplicate.active !== tag.active) {
        tags[index] = { ...duplicate, active: tag.active }; changed = true;
      }
      resolved.push(tag);
    }
    if (changed) {
      transaction.set(settingsRef, {
        tags: tags.map(sharedTag),
        updatedAt: new Date().toISOString(), updatedAtServer: serverTimestamp(),
      }, { merge: true });
    }
    return { tags, resolved, conflicts };
  });
  // Only clear queued items after the whole transaction commits. Failed writes
  // retain every Tag across reloads, without claiming a shared save succeeded.
  knownTags = result.tags;
  writeCachedIssueTags(result.tags);
  for (const tag of result.resolved) {
    const queued = readPendingTags().find((item) => item.id === tag.id);
    if (queued && queued.syncRevision === tag.syncRevision) {
      try { window.localStorage.removeItem(ISSUE_TAG_PENDING_PREFIX + tag.id); } catch {}
    }
  }
  for (const tag of result.conflicts) {
    if (readPendingTags().some((item) => item.id === tag.id && item.syncRevision === tag.syncRevision)) savePendingTag(tag);
  }
  if (retryTimer !== undefined && !readPendingTags().some((tag) => tag.syncStatus !== "conflict")) {
    window.clearTimeout(retryTimer); retryTimer = undefined;
  }
  lastReadAt = Date.now(); retryAt = 0; retryDelay = RETRY_BASE_MS; syncBlocked = false;
  notifyTags();
  return result;
}

function retainFailedChange(tag: EvaluationIssueTag, error: unknown) {
  const queued = readPendingTags().find((item) => item.id === tag.id && item.syncRevision === tag.syncRevision && item.syncStatus === "pending");
  if (queued) {
    savePendingTag({ ...queued, syncStatus: "conflict", syncError: error instanceof Error ? error.message : "ไม่สามารถซิงก์ Tag เข้าคลังกลางได้" });
    notifyTags();
    console.warn("Evaluation issue Tag change rejected after local selection", { code: (error as { code?: string })?.code });
  }
}

export function subscribeEvaluationIssueTags(listener: (snapshot: EvaluationIssueTagSnapshot) => void) {
  listeners.add(listener);
  listener(tagSnapshot());
  if (typeof window !== "undefined" && !browserListenersInstalled) {
    browserListenersInstalled = true;
    window.addEventListener("online", () => {
      if (!listeners.size) return;
      retryAt = 0; syncBlocked = false;
      void fetchEvaluationIssueTags();
    });
    window.addEventListener("storage", (event) => {
      if (event.key !== ISSUE_TAG_CACHE_KEY && !event.key?.startsWith(ISSUE_TAG_PENDING_PREFIX)) return;
      knownTags = null;
      notifyTags(); scheduleRetry();
    });
  }
  scheduleRetry();
  return () => {
    listeners.delete(listener);
    if (!listeners.size && retryTimer !== undefined) {
      window.clearTimeout(retryTimer); retryTimer = undefined;
    }
  };
}

export function fetchEvaluationIssueTags(): Promise<EvaluationIssueTag[]> {
  if (fetchInFlight) return fetchInFlight;
  fetchInFlight = exclusive(async () => {
    if (isOffline() || Date.now() < retryAt) {
      scheduleRetry(); return tagSnapshot().tags;
    }
    const pending = readPendingTags().filter((tag) => tag.syncStatus !== "conflict");
    try {
      if (pending.length && !syncBlocked) {
        await syncTags(pending);
      } else if (Date.now() - lastReadAt >= READ_CACHE_MS) {
        const snapshot = await getDoc(doc(firebaseDb, SYSTEM_SETTINGS_COLLECTION, ISSUE_TAG_DOCUMENT));
        knownTags = snapshot.exists() ? normalizeStoredTags(snapshot.data()?.tags) : readCachedIssueTags();
        writeCachedIssueTags(knownTags); lastReadAt = Date.now(); notifyTags();
      }
    } catch (error) {
      if (isTemporaryTagError(error)) deferSync(error);
      else {
        syncBlocked = true;
        console.warn("Evaluation issue Tag catalog unavailable", { code: (error as { code?: string })?.code });
      }
    }
    scheduleRetry();
    return tagSnapshot().tags;
  }).finally(() => { fetchInFlight = null; });
  return fetchInFlight;
}

export async function createEvaluationIssueTag(input: {
  name: string; rubricCode: string; topicCode: string; topicTitle: string; createdBy: string;
}) {
  const name = normalizeTagName(input.name);
  if (!name) throw new Error("กรุณาระบุชื่อ Tag");
  const normalizedName = normalizeEvaluationIssueTagName(name);
  const createdTag: EvaluationIssueTag = {
    id: safeTagId(name), name, normalizedName,
    rubricCode: String(input.rubricCode || "").trim(),
    topicCode: String(input.topicCode || "").trim(),
    topicTitle: String(input.topicTitle || "").trim(),
    active: true, createdAt: new Date().toISOString(), createdBy: String(input.createdBy || "").trim(),
    syncAction: "create", syncRevision: safeTagId("change"),
  };
  const operation = exclusive(async () => {
    const duplicate = tagSnapshot().tags.find((tag) => tag.normalizedName === normalizedName);
    if (duplicate) {
      if (!sameTopic(duplicate, createdTag)) throw new Error(duplicateMessage(duplicate));
      if (!duplicate.active) throw new Error(removedTagMessage(duplicate));
      return duplicate;
    }
    if (!isOffline() && Date.now() >= retryAt) {
      try {
        const result = await syncTags([
          ...readPendingTags().filter((tag) => tag.syncStatus !== "conflict"), createdTag,
        ]);
        const conflict = result.conflicts.find((tag) => tag.id === createdTag.id);
        if (conflict) throw new Error(conflict.syncError);
        return result.tags.find((tag) => tag.normalizedName === normalizedName)!;
      } catch (error) {
        // Known authorization and duplicate errors stay errors. Temporary
        // failures use the same durable queue as the wait deadline.
        if (!isTemporaryTagError(error)) throw error;
        deferSync(error);
      }
    }
    return queueForLocalUse(createdTag);
  }).catch((error) => {
    retainFailedChange(createdTag, error);
    throw error;
  });
  return finishTagChangeWithoutBlocking(operation, createdTag);
}

export async function setEvaluationIssueTagActive(tag: EvaluationIssueTag, active: boolean) {
  const priorRevision = readPendingTags().find((item) => item.id === tag.id)?.syncRevision;
  const changedTag: EvaluationIssueTag = {
    ...sharedTag(tag), active, syncAction: active ? "restore" : "archive", syncRevision: safeTagId("change"),
  };
  const operation = exclusive(async () => {
    const duplicate = tagSnapshot().tags.find((item) => item.normalizedName === tag.normalizedName);
    if (duplicate && !sameTopic(duplicate, tag)) throw new Error(duplicateMessage(duplicate));
    const newer = readPendingTags().find((item) => item.id === tag.id && item.syncRevision !== changedTag.syncRevision);
    // Skip an older queued change after a later remove/restore has replaced it.
    // The record present before this call is still a valid target for the change.
    if (newer && newer.syncRevision !== priorRevision) return newer;
    if (!isOffline() && Date.now() >= retryAt) {
      try {
        const result = await syncTags([
          ...readPendingTags().filter((item) => item.syncStatus !== "conflict" && item.id !== tag.id), changedTag,
        ]);
        const conflict = result.conflicts.find((item) => item.id === tag.id);
        if (conflict) throw new Error(conflict.syncError);
        return result.tags.find((item) => item.normalizedName === tag.normalizedName)!;
      } catch (error) {
        if (!isTemporaryTagError(error)) throw error;
        deferSync(error);
      }
    }
    return queueForLocalUse(changedTag, priorRevision);
  }).catch((error) => {
    retainFailedChange(changedTag, error); throw error;
  });
  return finishTagChangeWithoutBlocking(operation, changedTag, priorRevision);
}
