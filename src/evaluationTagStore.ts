import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const SYSTEM_SETTINGS_COLLECTION = "qa_system_settings";
const ISSUE_TAG_DOCUMENT = "evaluation_issue_tags";
const ISSUE_TAG_CACHE_KEY = "qa-dashboard:evaluation-issue-tags:v1";

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
};

function normalizeTagName(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeEvaluationIssueTagName(value: unknown) {
  return normalizeTagName(value).toLocaleLowerCase("th-TH");
}

function safeTagId(value: string) {
  const base = normalizeEvaluationIssueTagName(value)
    .replace(/[^a-z0-9ก-๙]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "tag";
  return `tag-${base}-${Date.now()}`;
}

function normalizeStoredTag(value: any): EvaluationIssueTag | null {
  const name = normalizeTagName(value?.name);
  if (!name) return null;
  const normalizedName = normalizeEvaluationIssueTagName(
    value?.normalizedName || name
  );
  return {
    id: String(value?.id || safeTagId(name)),
    name,
    normalizedName,
    rubricCode: String(value?.rubricCode || "").trim(),
    topicCode: String(value?.topicCode || "").trim(),
    topicTitle: String(value?.topicTitle || "").trim(),
    active: value?.active !== false,
    createdAt: String(value?.createdAt || ""),
    createdBy: String(value?.createdBy || ""),
  };
}

function normalizeStoredTags(value: unknown): EvaluationIssueTag[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map(normalizeStoredTag)
    .filter((item): item is EvaluationIssueTag => Boolean(item))
    .filter((item) => {
      if (seen.has(item.normalizedName)) return false;
      seen.add(item.normalizedName);
      return true;
    });
}

function readCachedIssueTags() {
  if (typeof window === "undefined") return [] as EvaluationIssueTag[];
  try {
    return normalizeStoredTags(
      JSON.parse(window.localStorage.getItem(ISSUE_TAG_CACHE_KEY) || "[]")
    );
  } catch {
    return [];
  }
}

function writeCachedIssueTags(tags: EvaluationIssueTag[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ISSUE_TAG_CACHE_KEY,
      JSON.stringify(normalizeStoredTags(tags))
    );
  } catch {
    // Firebase remains the shared source when local storage is unavailable.
  }
}

export async function fetchEvaluationIssueTags() {
  const cached = readCachedIssueTags();
  try {
    const snapshot = await getDoc(
      doc(firebaseDb, SYSTEM_SETTINGS_COLLECTION, ISSUE_TAG_DOCUMENT)
    );
    if (!snapshot.exists()) return cached;
    const tags = normalizeStoredTags(snapshot.data()?.tags);
    writeCachedIssueTags(tags);
    return tags;
  } catch {
    return cached;
  }
}

export async function createEvaluationIssueTag(input: {
  name: string;
  rubricCode: string;
  topicCode: string;
  topicTitle: string;
  createdBy: string;
}) {
  const name = normalizeTagName(input.name);
  if (!name) throw new Error("กรุณาระบุชื่อ Tag");

  const normalizedName = normalizeEvaluationIssueTagName(name);
  const settingsRef = doc(
    firebaseDb,
    SYSTEM_SETTINGS_COLLECTION,
    ISSUE_TAG_DOCUMENT
  );

  const createdAt = new Date().toISOString();
  let createdTag: EvaluationIssueTag | null = null;

  await runTransaction(firebaseDb, async (transaction) => {
    const snapshot = await transaction.get(settingsRef);
    const tags = snapshot.exists()
      ? normalizeStoredTags(snapshot.data()?.tags)
      : [];

    const duplicate = tags.find(
      (item) => item.normalizedName === normalizedName
    );
    if (duplicate) {
      const where = duplicate.topicCode
        ? `Topic ${duplicate.topicCode}${duplicate.topicTitle ? ` — ${duplicate.topicTitle}` : ""}`
        : "หัวข้ออื่น";
      throw new Error(`Tag “${duplicate.name}” มีอยู่แล้วใน ${where}`);
    }

    createdTag = {
      id: safeTagId(name),
      name,
      normalizedName,
      rubricCode: String(input.rubricCode || "").trim(),
      topicCode: String(input.topicCode || "").trim(),
      topicTitle: String(input.topicTitle || "").trim(),
      active: true,
      createdAt,
      createdBy: String(input.createdBy || "").trim(),
    };

    transaction.set(
      settingsRef,
      {
        tags: [...tags, createdTag],
        updatedAt: createdAt,
        updatedAtServer: serverTimestamp(),
      },
      { merge: true }
    );
  });

  if (!createdTag) throw new Error("ไม่สามารถสร้าง Tag ได้");

  const next = [
    ...readCachedIssueTags().filter(
      (item) => item.normalizedName !== normalizedName
    ),
    createdTag,
  ];
  writeCachedIssueTags(next);
  return createdTag;
}
