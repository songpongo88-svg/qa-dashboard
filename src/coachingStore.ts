import { collection, doc, getDocs, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { canonicalizeAgentName } from "./lib/agentIdentity";

import { belongsToAgent, visibleCoachingAgents, mergeMonthlyCoachingSave, coachingSaveError, type CoachingAccount, type CoachingAppointment, type CoachingResult, type CoachingAction, type CoachingAttachment } from './monthlyCoachingModel';

const COACHING_COLLECTION = "qa_coaching_records";
const COACHING_CACHE_KEY = "qa-dashboard:coaching-records-cache:v1";

export type CoachingRecordStatus = "Draft" | "Coached" | "Completed" | "Waiting Appointment" | "Appointment Scheduled" | "Waiting Senior" | "Coaching In Progress" | "Action Plan Submitted" | "QA Reviewed" | "Follow-up Next Month" | "Closed" | "No Coaching Required";
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

export type CoachingChecklistItem = {
  id: string;
  title: string;
  caseIds: string[];
  feedback: string;
  completed: boolean;
  examples?: string[];
  manual?: boolean;
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
  checklistItems: CoachingChecklistItem[];
  generalFeedback: string;
  agentResponse: string;
  agreedActionPlan: string;
  additionalNote: string;
  createdAt: string;
  updatedAt: string;
  agentId?: string;
  seniorId?: string;
  seniorName?: string;
  teamId?: string;
  qaSummary?: string;
  recommendedTopics?: string[];
  appointment?: CoachingAppointment;
  actualCoaching?: CoachingResult;
  actions?: CoachingAction[];
  qaReviewComment?: string;
  attachments?: CoachingAttachment[];
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
  const statuses: CoachingRecordStatus[] = ['Draft', 'Coached', 'Completed', 'Waiting Appointment', 'Appointment Scheduled', 'Waiting Senior', 'Coaching In Progress', 'Action Plan Submitted', 'QA Reviewed', 'Follow-up Next Month', 'Closed', 'No Coaching Required'];
  return statuses.includes(value as CoachingRecordStatus) ? value as CoachingRecordStatus : 'Draft';
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

function toChecklistItems(value: unknown): CoachingChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any, index) => ({
      id: String(item?.id || `checklist-${index + 1}`),
      title: String(item?.title || "").trim(),
      caseIds: toStringArray(item?.caseIds),
      feedback: String(item?.feedback || ""),
      completed: Boolean(item?.completed),
      examples: toStringArray(item?.examples),
      manual: Boolean(item?.manual),
    }))
    .filter((item) => item.title);
}

function toRecord(row: any, fallbackId = ""): StoredCoachingRecord {
  return {
    id: String(row?.id || fallbackId || ""),
    coachingDate: String(row?.coachingDate || row?.coaching_date || ""),
    coachedBy: canonicalizeAgentName(row?.coachedBy || row?.coached_by),
    agent: canonicalizeAgentName(row?.agent),
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
    checklistItems: toChecklistItems(row?.checklistItems || row?.checklist_items),
    generalFeedback: String(row?.generalFeedback || row?.general_feedback || ""),
    agentResponse: String(row?.agentResponse || row?.agent_response || ""),
    agreedActionPlan: String(
      row?.agreedActionPlan || row?.agreed_action_plan || ""
    ),
    additionalNote: String(row?.additionalNote || row?.additional_note || ""),
    createdAt: String(row?.createdAt || row?.created_at || ""),
    updatedAt: String(row?.updatedAt || row?.updated_at || ""),
    agentId: String(row?.agentId || ''), seniorId: String(row?.seniorId || ''), seniorName: String(row?.seniorName || ''), teamId: String(row?.teamId || ''),
    qaSummary: String(row?.qaSummary || ''), recommendedTopics: toStringArray(row?.recommendedTopics),
    ...(row?.appointment && typeof row.appointment === 'object' ? { appointment: row.appointment } : {}),
    ...(row?.actualCoaching && typeof row.actualCoaching === 'object' ? { actualCoaching: row.actualCoaching } : {}),
    actions: Array.isArray(row?.actions) ? row.actions : [], qaReviewComment: String(row?.qaReviewComment || ''), attachments: Array.isArray(row?.attachments) ? row.attachments : [],
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

export async function fetchStoredCoachingRecords(options: { allowCache?: boolean } = {}) {
  try {
    const snapshot = await getDocs(collection(firebaseDb, COACHING_COLLECTION));
    const rows = snapshot.docs
      .map((item) => toRecord(item.data(), item.id))
      .filter((item) => item.id && item.agent && item.monthKey);
    writeCache(rows);
    return sortRecords(rows);
  } catch (error) {
    if (options.allowCache === false) throw error;
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
    coachedBy: canonicalizeAgentName(record.coachedBy),
    agent: canonicalizeAgentName(record.agent),
    checklistItems: toChecklistItems(record.checklistItems),
    generalFeedback: String(record.generalFeedback || ""),
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

// Scoped application workflow. Database rules are managed separately by the existing app.
export async function saveMonthlyCoachingRecord(record: StoredCoachingRecord, actor: CoachingAccount, accounts: CoachingAccount[], expectedUpdatedAt: string | null) {
  const target = visibleCoachingAgents(accounts, actor).find(account => belongsToAgent(account, record.agentId, record.agent));
  if (!target) throw new Error('บัญชีนี้ไม่มีสิทธิ์แก้ Coaching ของ Admin ที่เลือก');
  const reference = doc(firebaseDb, COACHING_COLLECTION, safeDocId(record.id));
  const saved = await runTransaction(firebaseDb, async transaction => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.exists() ? toRecord(snapshot.data(), snapshot.id) : null;
    if ((previous?.updatedAt ?? null) !== expectedUpdatedAt) throw new Error('Coaching นี้มีข้อมูลใหม่แล้ว กรุณากดโหลดข้อมูลล่าสุดก่อนบันทึก ข้อความที่กรอกยังอยู่ในฟอร์ม');
    if (previous && (!belongsToAgent(target, previous.agentId, previous.agent) || previous.monthKey !== record.monthKey)) throw new Error('ไม่สามารถเปลี่ยน Admin หรือเดือนของ Coaching เดิม');
    const next = mergeMonthlyCoachingSave(previous, record, actor.role);
    const error = coachingSaveError(actor.role, previous, next); if (error) throw new Error(error);
    const normalized = JSON.parse(JSON.stringify({ ...next, id: reference.id, updatedAt: new Date().toISOString() })) as StoredCoachingRecord;
    transaction.set(reference, { ...normalized, updatedAtServer: serverTimestamp() }, { merge: true });
    return normalized;
  });
  writeCache([saved, ...readCache().filter(row => row.id !== saved.id)]);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('qa-coaching-refresh'));
  return saved;
}
