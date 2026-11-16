import { collection, doc, getDocs, getDocsFromServer, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { canonicalizeAgentName } from "./lib/agentIdentity";

import { belongsToAgent, isAssignedCoach, coachingSaveRole, isCoachingAccepted, coachingResultError, coachingDeadline, mergeMonthlyCoachingSave, coachingSaveError, type CoachingAccount, type CoachingAppointment, type CoachingResult, type CoachingAction, type CoachingAttachment } from './monthlyCoachingModel';
import { monthlyPaymentBatchReference } from './monthlyPaymentBatchStore';
import { changedCoachingFields, type CoachingFieldChange } from './coachingActivityChanges';

const COACHING_COLLECTION = "qa_coaching_records";
const COACHING_CACHE_KEY = "qa-dashboard:coaching-records-cache:v1";

export type CoachingRecordStatus = "Draft" | "Coached" | "Completed" | "Waiting Appointment" | "Appointment Scheduled" | "Waiting Senior" | "Coaching In Progress" | "Action Plan Submitted" | "QA Reviewed" | "Follow-up Next Month" | "Closed" | "No Coaching Required";
export type CoachingActivityEvent = {
  id: string;
  action: string;
  occurredAt: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  fromStatus: string;
  toStatus: string;
  revision: number;
  note: string;
  changes?: CoachingFieldChange[];
  paymentEffect?: "Normal Cycle" | "Next Cycle";
};
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
  coachId?: string;
  coachName?: string;
  teamId?: string;
  qaSummary?: string;
  recommendedTopics?: string[];
  appointment?: CoachingAppointment;
  actualCoaching?: CoachingResult;
  actions?: CoachingAction[];
  qaReviewComment?: string;
  qaReviewedAt?: string;
  qaReviewedBy?: string;
  qaClosedAt?: string;
  qaClosedBy?: string;
  qaPaymentOverrideApprovedAt?: string;
  priorExportVerifiedAt?: string;
  priorExportVerifiedBy?: string;
  activityTimeline?: CoachingActivityEvent[];
  qaOwnerId?: string;
  qaOwnerName?: string;
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

function normalizeCoachingTimeline(value: unknown): CoachingActivityEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item: any) => item && typeof item === "object" && item.occurredAt && item.action)
    .map((item: any) => ({
      id: String(item.id || ""),
      action: String(item.action),
      occurredAt: String(item.occurredAt),
      actorId: String(item.actorId || ""),
      actorName: String(item.actorName || ""),
      actorRole: String(item.actorRole || ""),
      fromStatus: String(item.fromStatus || ""),
      toStatus: String(item.toStatus || ""),
      revision: Number(item.revision || 0),
      note: String(item.note || ""),
      changes: Array.isArray(item.changes)
        ? item.changes.filter((change: any) => change && typeof change.section === "string" && typeof change.detail === "string")
            .map((change: any) => ({ section: String(change.section).slice(0,120), detail: String(change.detail).slice(0,240) }))
        : [],
      ...(item.paymentEffect === "Normal Cycle" || item.paymentEffect === "Next Cycle"
        ? { paymentEffect: item.paymentEffect } : {}),
    }));
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
    agentId: String(row?.agentId || ''), seniorId: String(row?.seniorId || ''), seniorName: String(row?.seniorName || ''), coachId: String(row?.coachId || row?.coach_id || ''), coachName: String(row?.coachName || row?.coach_name || ''), teamId: String(row?.teamId || ''),
    ...(typeof row?.qaSummary === 'string' ? { qaSummary: row.qaSummary } : {}), recommendedTopics: toStringArray(row?.recommendedTopics),
    ...(row?.appointment && typeof row.appointment === 'object' ? { appointment: row.appointment } : {}),
    ...(row?.actualCoaching && typeof row.actualCoaching === 'object' ? { actualCoaching: row.actualCoaching } : {}),
    actions: Array.isArray(row?.actions) ? row.actions : [], qaReviewComment: String(row?.qaReviewComment || ''), attachments: Array.isArray(row?.attachments) ? row.attachments : [],
    qaReviewedAt: String(row?.qaReviewedAt || ''), qaReviewedBy: String(row?.qaReviewedBy || ''),
    qaClosedAt: String(row?.qaClosedAt || ''), qaClosedBy: String(row?.qaClosedBy || ''),
    qaPaymentOverrideApprovedAt: String(row?.qaPaymentOverrideApprovedAt || ''),
    priorExportVerifiedAt: String(row?.priorExportVerifiedAt || ''),
    priorExportVerifiedBy: String(row?.priorExportVerifiedBy || ''),
    activityTimeline: normalizeCoachingTimeline(row?.activityTimeline),
    qaOwnerId: String(row?.qaOwnerId || ''), qaOwnerName: String(row?.qaOwnerName || ''),
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

// A loaded collection is reused for short-lived UI summaries and the Inbox.
// Explicit fresh reads still reach Firestore for editing / conflict checks.
const COACHING_READ_TTL_MS = 5 * 60_000;
let recentCoachingRecords: { rows: StoredCoachingRecord[]; expiresAt: number } | null = null;
let pendingCoachingRead: Promise<StoredCoachingRecord[]> | null = null;
let pendingCoachingForced = false;

function updateCoachingReadCache(rows: StoredCoachingRecord[]) {
  const sorted = sortRecords(rows);
  recentCoachingRecords = { rows: sorted, expiresAt: Date.now() + COACHING_READ_TTL_MS };
  writeCache(sorted);
}

export async function fetchStoredCoachingRecords(options: { allowCache?: boolean; forceRefresh?: boolean } = {}) {
  if (options.allowCache !== false && !options.forceRefresh && recentCoachingRecords && Date.now() < recentCoachingRecords.expiresAt) {
    return recentCoachingRecords.rows;
  }
  if (pendingCoachingRead && (!options.forceRefresh || pendingCoachingForced)) return pendingCoachingRead;
  const request = (async () => {
    try {
      const reference = collection(firebaseDb, COACHING_COLLECTION);
      const snapshot = await (options.forceRefresh ? getDocsFromServer(reference) : getDocs(reference));
      const rows = snapshot.docs
        .map((item) => toRecord(item.data(), item.id))
        .filter((item) => item.id && item.agent && item.monthKey);
      updateCoachingReadCache(rows);
      return recentCoachingRecords!.rows;
    } catch (error) {
      if (options.allowCache === false || options.forceRefresh) throw error;
      if (recentCoachingRecords?.rows.length) return recentCoachingRecords.rows;
      const cached = readCache();
      if (cached.length) return cached;
      throw error;
    }
  })();
  pendingCoachingRead = request;
  pendingCoachingForced = Boolean(options.forceRefresh);
  try { return await request; }
  finally { if (pendingCoachingRead === request) pendingCoachingRead = null; }
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
  updateCoachingReadCache([normalized, ...cached]);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("qa-coaching-refresh"));
  return normalized;
}

// Scoped application workflow. Database rules are managed separately by the existing app.
export async function saveMonthlyCoachingRecord(record: StoredCoachingRecord, actor: CoachingAccount, accounts: CoachingAccount[], expectedUpdatedAt: string | null, verifiedNoEarlierPaymentExport = false) {
  const target = accounts
    .filter(account => account.status !== 'Suspended' && (account.qaEvaluationTarget ?? ['Admin Live Chat', 'Virtual Rider'].includes(account.role)))
    .find(account => belongsToAgent(account, record.agentId, record.agent));
  if (!target) throw new Error('ไม่พบ Agent สำหรับ Coaching ที่เลือก');
  const reference = doc(firebaseDb, COACHING_COLLECTION, safeDocId(record.id));
  const saved = await runTransaction(firebaseDb, async transaction => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.exists() ? toRecord(snapshot.data(), snapshot.id) : null;
    const versionChanged = (previous?.updatedAt ?? null) !== expectedUpdatedAt;
    const recoverableQaSave =
      actor.role === 'Quality Assurance' &&
      Boolean(previous) &&
      (
        (
          ['Draft', 'Waiting Appointment', 'Appointment Scheduled'].includes(previous!.status) &&
          ['Draft', 'Waiting Appointment', 'Appointment Scheduled', 'Waiting Senior'].includes(record.status)
        ) ||
        (previous!.status === 'Waiting Senior' && record.status === 'Waiting Senior')
      );
    if (versionChanged && !recoverableQaSave) {
      throw new Error('Coaching นี้มีข้อมูลใหม่แล้ว กรุณากดโหลดข้อมูลล่าสุดก่อนบันทึก ข้อความที่กรอกยังอยู่ในฟอร์ม');
    }
    if (previous && (!belongsToAgent(target, previous.agentId, previous.agent) || previous.monthKey !== record.monthKey)) throw new Error('ไม่สามารถเปลี่ยน Admin หรือเดือนของ Coaching เดิม');

    const workflowRole = coachingSaveRole(previous || record, actor, record.status);
    if (workflowRole !== 'Quality Assurance' && workflowRole !== 'Assigned Coach') {
      throw new Error('บัญชีนี้ดูนัดหมายได้ แต่ไม่มีสิทธิ์แก้ผล Coaching');
    }

    const next = mergeMonthlyCoachingSave(previous, record, workflowRole);
    const error = coachingSaveError(workflowRole, previous, next); if (error) throw new Error(error);
    const now = new Date().toISOString();
    const accepted = workflowRole === 'Quality Assurance' && isCoachingAccepted(next.status);
    const previouslyAccepted = previous && isCoachingAccepted(previous.status) && previous.qaReviewComment?.trim() &&
      previous.qaSummary?.trim() && previous.recommendedTopics?.length && !coachingResultError(previous);
    const reviewMetadata = accepted ? {
      qaReviewedAt: previouslyAccepted ? previous!.qaReviewedAt || previous!.updatedAt : now,
      qaReviewedBy: previouslyAccepted && previous!.qaReviewedBy ? previous!.qaReviewedBy : actor.displayName || actor.username,
    } : { qaReviewedAt: previous?.qaReviewedAt || '', qaReviewedBy: previous?.qaReviewedBy || '' };
    const qaOwnerId = previous?.qaOwnerId || (workflowRole === 'Quality Assurance' ? actor.username : '');
    const qaOwnerName = previous?.qaOwnerName || (workflowRole === 'Quality Assurance' ? actor.displayName || actor.username : '');
    const firstClose = workflowRole === 'Quality Assurance' && next.status === 'Closed' && previous?.status !== 'Closed';
    const qaClosedAt = firstClose ? now : previous?.qaClosedAt || '';
    const qaClosedBy = firstClose ? actor.displayName || actor.username : previous?.qaClosedBy || '';
    let qaPaymentOverrideApprovedAt = previous?.qaPaymentOverrideApprovedAt || '';
    let paymentEffect: CoachingActivityEvent['paymentEffect'];
    let priorExportVerifiedAt = previous?.priorExportVerifiedAt || '';
    let priorExportVerifiedBy = previous?.priorExportVerifiedBy || '';
    if (firstClose) {
      const deadlineTime = Date.parse(coachingDeadline(next.monthKey));
      const reviewedTime = Date.parse(reviewMetadata.qaReviewedAt || '');
      const actualEnd = next.actualCoaching?.date && next.actualCoaching?.endTime
        ? Date.parse(`${next.actualCoaching.date}T${next.actualCoaching.endTime}:00+07:00`) : NaN;
      const completionTime = Math.max(reviewedTime, actualEnd);
      if (Number.isFinite(completionTime) && Number.isFinite(deadlineTime) && completionTime > deadlineTime) {
        // Read the payment-cycle export marker BEFORE writing the Coaching close.
        // QA may close late, but cannot add a new recipient to a batch already exported.
        const batch = await transaction.get(monthlyPaymentBatchReference(next.monthKey));
        if (batch.exists() && String(batch.data()?.exportedAt || '')) {
          paymentEffect = 'Next Cycle';
        } else {
          // Legacy payment exports made before audit tracking cannot be detected.
          // For those periods, an explicit QA attestation is required.
          if (next.monthKey <= '2026-10') {
            if (!verifiedNoEarlierPaymentExport) {
              throw new Error('รอบจ่ายก่อนเปิดระบบบันทึก Export: QA ต้องตรวจไฟล์จ่ายเงินเดิมและยืนยันว่าไม่เคยส่งออก ก่อนคืนสิทธิ์รอบปกติ');
            }
            priorExportVerifiedAt = now;
            priorExportVerifiedBy = actor.displayName || actor.username;
          }
          qaPaymentOverrideApprovedAt = now;
          paymentEffect = 'Normal Cycle';
        }
      }
    }
    const changes = changedCoachingFields(previous, next);
    if (previous && previous.status === next.status && changes.length === 0) {
      // No actual field change and no status transition: avoid a redundant write/event.
      return previous;
    }
    const previousEvents = previous?.activityTimeline || [];
    const revision = previousEvents.filter(event => event.action === 'Revision Requested').length +
      (next.status === 'QA Reviewed' && previous?.status !== 'QA Reviewed' ? 1 : 0);
    const eventAction = next.status === previous?.status
      ? (workflowRole === 'Quality Assurance' && next.qaReviewComment !== previous?.qaReviewComment ? 'QA Review Updated' : 'Details Updated')
      : next.status === 'QA Reviewed' ? 'Revision Requested'
      : next.status === 'Action Plan Submitted'
        ? (revision > 0 ? 'Action Plan Resubmitted' : 'Action Plan Submitted')
      : next.status === 'Follow-up Next Month' ? 'QA Accepted'
      : next.status === 'Closed' ? 'Closed'
      : next.status === 'Waiting Senior' ? 'QA Prepared / Sent to Coach'
      : next.status === 'Appointment Scheduled' ? 'Appointment Scheduled'
      : next.status === 'Coaching In Progress' ? 'Coaching Results Saved'
      : next.status === 'Draft' ? 'QA Prepared'
      : next.status;
    const eventNote = next.status === 'QA Reviewed' || next.status === 'Follow-up Next Month'
      ? String(next.qaReviewComment || '').trim()
      : paymentEffect === 'Normal Cycle'
        ? (priorExportVerifiedAt === now
          ? 'QA verified no earlier payment export · Normal-cycle eligibility restored, subject to remaining requirements'
          : 'QA Closed late · Normal payment-cycle eligibility restored, subject to remaining requirements')
      : paymentEffect === 'Next Cycle' ? 'QA Closed late · Monthly payment batch already exported; next payment cycle applies'
      : '';
    const event: CoachingActivityEvent = {
      id: `${now}:${actor.username}:${previousEvents.length + 1}`,
      action: eventAction, occurredAt: now,
      actorId: actor.username, actorName: actor.displayName || actor.agentName || actor.username,
      actorRole: actor.role === 'Quality Assurance' ? 'QA'
        : actor.role === 'Senior' ? 'Senior' : actor.role,
      fromStatus: previous?.status || 'Not Created',
      toStatus: next.status, revision, note: eventNote, changes,
      ...(paymentEffect ? { paymentEffect } : {}),
    };
    // The transaction appends to the server's most recent history, never a stale form copy.
    const activityTimeline = [...previousEvents, event];
    const normalized = JSON.parse(JSON.stringify({
      ...next, ...reviewMetadata, qaOwnerId, qaOwnerName,
      qaClosedAt, qaClosedBy, qaPaymentOverrideApprovedAt,
      priorExportVerifiedAt, priorExportVerifiedBy, activityTimeline,
      id: reference.id, updatedAt: now
    })) as StoredCoachingRecord;
    transaction.set(reference, { ...normalized, updatedAtServer: serverTimestamp() }, { merge: true });
    return normalized;
  });
  updateCoachingReadCache([saved, ...readCache().filter(row => row.id !== saved.id)]);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('qa-coaching-refresh'));
  return saved;
}
