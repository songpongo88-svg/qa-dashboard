import { collection, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

const COACHING_COLLECTION = "qa_coaching_records";
const COACHING_CACHE_KEY = "qa-dashboard:coaching-records-cache:v1";

export type CoachingRecordStatus = "Draft" | "Coached" | "Completed";
export type CoachingRecordResult =
  | "Pending Review"
  | "Improved"
  | "Partially Improved"
  | "No Improvement";

export type CoachingTopicSnapshot = {
  key: string;
  label: string;
  averageScore: number;
  maxScore: number;
  percentage: number;
  deductedCases: number;
  caseIds: string[];
};

export type StoredCoachingRecord = {
  id: string;
  coachingDate: string;
  coachedBy: string;
  agent: string;
  team: string;
  monthKey: string;
  monthLabel: string;
  evaluatedCases: number;
  averageScore: number;
  grade: string;
  criticalErrors: number;
  strengths: string;
  mainIssues: string;
  repeatedIssues: string;
  coachingRecommendation: string;
  actionPlan: string;
  followUpDate: string;
  result: CoachingRecordResult;
  status: CoachingRecordStatus;
  caseReferences: string[];
  topicSnapshot: CoachingTopicSnapshot[];
  agentResponse: string;
  agreedActionPlan: string;
  additionalNote: string;
  createdAt: string;
  updatedAt: string;
};

function safeDocId(value: unknown) {
  return (
    String(value || "")
      .trim()
      .replace(/[\\/#?\[\]]/g, "_")
      .replace(/\s+/g, "-")
      .slice(0, 180) || `coaching-${Date.now()}`
  );
}

function normalizeStatus(value: unknown): CoachingRecordStatus {
  return value === "Coached" || value === "Completed" ? value : "Draft";
}

function normalizeResult(value: unknown): CoachingRecordResult {
  if (
    value === "Improved" ||
    value === "Partially Improved" ||
    value === "No Improvement"
  ) {
    return value;
  }
  return "Pending Review";
}

function toStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function toTopicSnapshot(value: unknown): CoachingTopicSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    key: String(item?.key || ""),
    label: String(item?.label || ""),
    averageScore: Number(item?.averageScore || 0),
    maxScore: Number(item?.maxScore || 0),
    percentage: Number(item?.percentage || 0),
    deductedCases: Number(item?.deductedCases || 0),
    caseIds: toStringArray(item?.caseIds),
  }));
}

function toRecord(row: any, fallbackId = ""): StoredCoachingRecord {
  return {
    id: String(row?.id || fallbackId || ""),
    coachingDate: String(row?.coachingDate || row?.coaching_date || ""),
    coachedBy: String(row?.coachedBy || row?.coached_by || ""),
    agent: String(row?.agent || ""),
    team: String(row?.team || ""),
    monthKey: String(row?.monthKey || row?.month_key || ""),
    monthLabel: String(row?.monthLabel || row?.month_label || ""),
    evaluatedCases: Number(row?.evaluatedCases || row?.evaluated_cases || 0),
    averageScore: Number(row?.averageScore || row?.average_score || 0),
    grade: String(row?.grade || ""),
    criticalErrors: Number(row?.criticalErrors || row?.critical_errors || 0),
    strengths: String(row?.strengths || ""),
    mainIssues: String(row?.mainIssues || row?.main_issues || ""),
    repeatedIssues: String(row?.repeatedIssues || row?.repeated_issues || ""),
    coachingRecommendation: String(
      row?.coachingRecommendation || row?.coaching_recommendation || ""
    ),
    actionPlan: String(row?.actionPlan || row?.action_plan || ""),
    followUpDate: String(row?.followUpDate || row?.follow_up_date || ""),
    result: normalizeResult(row?.result),
    status: normalizeStatus(row?.status),
    caseReferences: toStringArray(row?.caseReferences || row?.case_references),
    topicSnapshot: toTopicSnapshot(row?.topicSnapshot || row?.topic_snapshot),
    agentResponse: String(row?.agentResponse || row?.agent_response || ""),
    agreedActionPlan: String(
      row?.agreedActionPlan || row?.agreed_action_plan || ""
    ),
    additionalNote: String(row?.additionalNote || row?.additional_note || ""),
    createdAt: String(row?.createdAt || row?.created_at || ""),
    updatedAt: String(row?.updatedAt || row?.updated_at || ""),
  };
}

function sortRecords(rows: StoredCoachingRecord[]) {
  return [...rows].sort((a, b) => {
    const monthCompare = String(b.monthKey || "").localeCompare(
      String(a.monthKey || "")
    );
    if (monthCompare !== 0) return monthCompare;
    return (
      new Date(b.updatedAt || 0).getTime() -
      new Date(a.updatedAt || 0).getTime()
    );
  });
}

function readCache(): StoredCoachingRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COACHING_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? sortRecords(parsed.map((item) => toRecord(item)).filter((item) => item.id))
      : [];
  } catch {
    return [];
  }
}

function writeCache(rows: StoredCoachingRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COACHING_CACHE_KEY,
      JSON.stringify(sortRecords(rows).slice(0, 500))
    );
  } catch {
    // Firestore remains the source of truth.
  }
}

export async function fetchStoredCoachingRecords() {
  try {
    const snapshot = await getDocs(collection(firebaseDb, COACHING_COLLECTION));
    const rows = snapshot.docs
      .map((item) => toRecord(item.data(), item.id))
      .filter((item) => item.id && item.agent && item.monthKey);
    writeCache(rows);
    return sortRecords(rows);
  } catch (error) {
    const cached = readCache();
    if (cached.length) return cached;
    throw error;
  }
}

export async function upsertStoredCoachingRecord(
  record: StoredCoachingRecord
) {
  const now = new Date().toISOString();
  const normalized: StoredCoachingRecord = {
    ...record,
    id: safeDocId(record.id),
    createdAt: record.createdAt || now,
    updatedAt: now,
  };

  await setDoc(
    doc(firebaseDb, COACHING_COLLECTION, normalized.id),
    {
      ...normalized,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  const cached = readCache().filter((item) => item.id !== normalized.id);
  writeCache([normalized, ...cached]);
  return normalized;
}
