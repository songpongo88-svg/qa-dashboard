import { getAppealTopicDecision, summarizeAppealDecisions, appealScoreAfterReview, prepareAppealReview, type AppealTopicDecision } from "./appealReview";
import { AppealEvidenceGallery, AppealEvidencePicker, type AppealEvidenceImage } from "./AppealEvidence";
import { appealEvidenceStartIndex } from "./appealEvidenceNaming";
import AppealReviewDialog, { type AppealReviewSavePreview, type AppealReviewNotice } from "./AppealReviewDialog";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { type UsageLogEvent } from "./usageLog";
import { fetchAdditionalAppealReasonOptions, fetchAssignedAppealRequestIds, fetchAppealDiscussionEvents, fetchAppealEvents, writeAppealEvent, writeAdditionalAppealAccessDecision } from "./appealStore";
import { APPEAL_WORKFLOW_STATUSES, appealWorkflowStatus, appealWorkflowLabel, appealWorkflowTone, appealWorkflowActivityAt, scopeAppealRequests } from "./appealWorkflow";
import PageHero from "./PageHero";
import AppealWorkflowNotice from "./AppealWorkflowNotice";
import { resolveCaseAgentTeam, type CaseAgentDirectoryEntry } from "./lib/caseAgentTeam";
import { scoreToGrade } from "./lib/scoreIncentivePolicy"; // appeal-review-information-newtab-v56
import { findUnavailableAppealForRoute } from "./appealCaseAvailability";
import AppealActionTimeline, { AppealActionReviewHistory } from "./AppealActionTimeline";
import { buildAppealActionHistory, type AppealAction } from "./appealActionHistory";
import { RichTextContent } from "./richText";

type AppealTopic = {
  evidenceImages?: AppealEvidenceImage[];
  qaEvidenceImages?: AppealEvidenceImage[];
  code: string;
  decision?: AppealTopicDecision;
  label: string;
  score: number;
  originalScore?: number;
  retainedComment?: string;
  max: number;
  comment?: string;
  wantsAppeal?: boolean;
  appealReason: string;
  revisedScore?: number | string;
  revisedComment?: string;
  rejectReason?: string;
};

const DEFAULT_ADDITIONAL_APPEAL_REASONS = [
  "ได้รับหลักฐานเพิ่มเติมหลังพิจารณา",
  "ขอให้ตรวจสอบหัวข้อเดิมอีกครั้ง",
  "พบหัวข้อที่ยังไม่เคยยื่นอุทธรณ์",
  "ตรวจพบข้อมูลหรือคะแนนที่อาจคลาดเคลื่อน",
  "ได้รับคำขอตรวจสอบเพิ่มเติมจาก Senior / Supervisor",
] as const;
export const ADDITIONAL_APPEAL_WINDOW_MS = 72 * 60 * 60 * 1000;
export function appealAdditionalDeadline(openedAt: string): string {
  const opened = Date.parse(String(openedAt || ""));
  return Number.isFinite(opened) ? new Date(opened + ADDITIONAL_APPEAL_WINDOW_MS).toISOString() : "";
}
export function isAdditionalAppealExpired(openedAt: string, asOf = Date.now()): boolean {
  const deadline = Date.parse(appealAdditionalDeadline(openedAt));
  return Number.isFinite(deadline) && asOf >= deadline;
}
const NO_APPEAL_TEXT = "ไม่อุทธรณ์หัวข้อนี้";
const LEGACY_NO_APPEAL_TEXT = "เนเธกเนเธญเธธเธ—เธเธฃเธ“เนเธซเธฑเธงเธเนเธญเธเธตเน";

// data-analytics-appeal-notify-v20
const QA_ANALYTICS_REFRESH_STORAGE_KEY = "qa-dashboard-data-refresh-key";

function notifyQaAnalyticsDataChanged() {
  if (typeof window === "undefined") return;
  const nextKey = Date.now();
  window.localStorage.setItem(QA_ANALYTICS_REFRESH_STORAGE_KEY, String(nextKey));
  window.dispatchEvent(new CustomEvent("qa-dashboard-data-refresh", { detail: nextKey }));
}

type AppealRequest = {
  requestId: string;
  caseId: string;
  agent: string;
  targetUsername?: string;
  auditDate: string;
  auditTimestamp?: string;
  // appeal-pdf-final-v47-requests
  weekLabel: string;
  submittedBy: string;
  submittedAt: string;
  finalScore: number;
  grade: string;
  inquiry: string;
  caseDescription: string;
  caseUrl: string;
  rawDataSourceName: string;
  status: "Pending" | "Approved" | "Rejected" | "Partially Approved" | "Reset";
  reviewSummary?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByUsername?: string;
  submittedByUsername?: string;
  reviewId?: string;
  reviewVersion?: number;
  reviewHistory: AppealReviewHistoryItem[];
  actionHistory: AppealAction[];
  editingDraft?: boolean;
  activeEditTopics?: AppealTopic[];
  additionalAccessRequest?: { requestId: string; reason: string; topics: string[]; requestedAt: string; status: "Pending" | "Approved" | "Rejected"; decidedAt?: string; decisionReason?: string } | null;
  lastAdditionalStatus?: "Pending (Additional)" | "Cancelled (Additional)" | "Expired (Additional)" | "";
  additionalHistory?: { roundId: string; openedAt: string; submittedAt: string; reviewedAt: string; closedStatus: string }[];
  cancelledAdditionalRounds?: {
    roundId: string;
    reason: string;
    cancelledBy: string;
    cancelledAt: string;
  }[];
  topics: AppealTopic[];
  additionalRound?: {
    roundId: string;
    openedAt: string;
    expiresAt: string;
    openedBy: string;
    note: string;
    topics: AppealTopic[];
    submitted: boolean;
    submittedAt: string;
  } | null;
};

type AppealReviewHistoryItem = {
  reviewId: string;
  reviewedAt: string;
  reviewedBy: string;
  decision: string;
  reviewSummary: string;
  topics: AppealTopic[];
};

type AppealResetHistoryItem = {
  requestId: string;
  caseId: string;
  agent: string;
  resetAt: string;
  resetBy: string;
  reason: string;
};

function getRequestId(log: UsageLogEvent) {
  return String(log.details?.requestId || log.id || "");
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${getPart("day")}/${getPart("month")}/${getPart("year")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
}

function firstStoredAppealDateTime(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text || text === "-" || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") continue;
    return text;
  }
  return "";
}

function appealSubmittedAtFromRequestId(value: unknown) {
  const match = String(value ?? "").trim().match(/-(\d{13})$/);
  if (!match) return "";
  const epochMs = Number(match[1]);
  if (!Number.isFinite(epochMs)) return "";
  const date = new Date(epochMs);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function parseAppealReviewSubmittedTime(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const ddmmyyyy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ddmmyyyy) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = ddmmyyyy;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}


function normalizeAppealReason(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isNoAppealReason(value: unknown) {
  const normalized = normalizeAppealReason(value).toLowerCase();
  if (!normalized) return false;
  return (
    normalized === NO_APPEAL_TEXT.toLowerCase() ||
    normalized === LEGACY_NO_APPEAL_TEXT ||
    normalized === "not appeal" ||
    normalized === "no appeal" ||
    normalized.includes("ไม่อุทธรณ์") ||
    normalized.includes("เนเธกเนเธญเธธเธ—เธเธฃเธ“เน")
  );
}

function isAppealedTopic(topic?: AppealTopic | null) {
  if (!topic) return false;
  const reason = normalizeAppealReason(topic.appealReason);
  return topic.wantsAppeal === true || Boolean(reason && !isNoAppealReason(reason));
}

const APPEAL_REVIEW_BILINGUAL_TOPICS: Record<string, [string, string]> = {
  "1": ["การปฏิบัติตามกระบวนการและนโยบาย", "Process & Policy Compliance"],
  "2": ["คุณภาพคำตอบและการวิเคราะห์ปัญหา", "Answer Quality & Problem Analysis"],
  "3": ["การจัดการเคสและการติดตามผล", "Case Handling & Follow-up"],
  "4": ["ทักษะการสื่อสาร", "Communication Skills"],
  "1.1": ["มาตรฐานการทักทายและปิดการสนทนา", "Greeting & Closing Standard"],
  "1.2": ["การปฏิบัติตาม PDPA / Policy / ข้อกำหนด", "PDPA & Policy Compliance"],
  "1.3": ["การปฏิบัติตามกระบวนการและ SLA", "Process & SLA Compliance"],
  "2.1": ["ความถูกต้องของคำตอบ", "Answer Accuracy"],
  "2.2": ["ความครบถ้วนของคำตอบ", "Answer Completeness"],
  "2.3": ["ความชัดเจนของขั้นตอนและแหล่งอ้างอิง", "Clear Steps & Official Sources"],
  "3.1": ["การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด", "Problem Analysis & Resolution"],
  "3.2": ["Ownership และการแจ้ง Next Step", "Ownership & Next Step"],
  "4.1": ["โครงสร้างข้อความและความอ่านง่าย", "Message Structure & Readability"],
  "4.2": ["ความกระชับและความถูกต้องของภาษา", "Conciseness & Language Accuracy"],
  "4.3": ["น้ำเสียงและความเหมาะสมตามสถานการณ์", "Tone & Context Appropriateness"],
};

function splitAppealReviewCaseIds(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return ["-"];
  const parts = raw.split(/\s*,\s*|\n+/g).map((item) => item.trim()).filter(Boolean);
  return parts.length ? parts : [raw];
}

// appeal-review-reviewed-time-caseid-v60

function appealReviewFixedDateTimeParts(value: unknown) {
  const formatted = formatDateTime(value);
  const parts = String(formatted || "-").trim().split(/\s+/g);
  return {
    datePart: parts[0] || "-",
    timePart: parts.slice(1).join(" "),
  };
}

// appeal-review-fixed-datetime-v63

function appealReviewTopicLine(topic: AppealTopic, index: number) {
  const code = String(topic.code || "-").trim();
  const mapped = APPEAL_REVIEW_BILINGUAL_TOPICS[code];
  const description = mapped
    ? mapped[0] + " (" + mapped[1] + ")"
    : String(topic.label || "-").trim();
  return String(index + 1) + ". Topic " + code + " " + description;
}

// appeal-review-information-plain-v57
function appealFinalScoreFromTopics(topics: AppealTopic[], originalFinalScore: number) {
  return appealScoreAfterReview(topics, originalFinalScore);
}

function appealGradeFromScore(score: number) {
  return score >= 90 ? "A" : score >= 85 ? "B" : score >= 80 ? "C" : "D";
}
function scoreOptions(max: number) {
  const safeMax = Math.max(0, Math.floor(Number(max) || 0));
  return Array.from({ length: safeMax + 1 }, (_, index) => index);
}

export function buildAppealRequests(logs: UsageLogEvent[], asOf = Date.now()) {
  logs = logs.filter(log => !log.source_case_unavailable);
  const reviews = new Map<string, UsageLogEvent[]>();
  const resets = new Map<string, UsageLogEvent>();
  const openedRounds = new Map<string, UsageLogEvent[]>();
  const cancelledRounds = new Map<string, UsageLogEvent[]>();
  const expiredRounds = new Map<string, UsageLogEvent[]>();
  const submittedEvidence = new Map<string, UsageLogEvent[]>();
  const editEvents = new Map<string, UsageLogEvent[]>();
  const additionalAccessEvents = new Map<string, UsageLogEvent[]>();
  const eventTime = (log: UsageLogEvent) => {
    const parsed = new Date(String(log.created_at || log.details?.reviewedAt || log.details?.resetAt || "")).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  logs.forEach((log) => {
    const requestId = getRequestId(log);
    if (log.event_type === "appeal_additional_round_opened" && requestId) {
      const history = openedRounds.get(requestId) || [];
      history.push(log);
      openedRounds.set(requestId, history);
    }
    if (log.event_type === "appeal_additional_round_cancelled" && requestId) {
      const history = cancelledRounds.get(requestId) || [];
      history.push(log);
      cancelledRounds.set(requestId, history);
    }
    if (log.event_type === "appeal_additional_round_expired" && requestId) {
      const history = expiredRounds.get(requestId) || [];
      history.push(log);
      expiredRounds.set(requestId, history);
    }
    if (["appeal_submission_edit_started", "appeal_submission_draft_saved", "appeal_submission_resubmitted"].includes(log.event_type) && requestId) {
      const events = editEvents.get(requestId) || [];
      events.push(log);
      editEvents.set(requestId, events);
    }
    if (["appeal_additional_access_requested", "appeal_additional_access_decided"].includes(log.event_type) && requestId) {
      const events = additionalAccessEvents.get(requestId) || [];
      events.push(log);
      additionalAccessEvents.set(requestId, events);
    }
    if ((log.event_type === "appeal_additional_evidence_submitted" || (log.event_type === "appeal_submission_resubmitted" && Boolean(log.details?.roundId))) && requestId) {
      const history = submittedEvidence.get(requestId) || [];
      history.push(log);
      submittedEvidence.set(requestId, history);
    }
    if (log.event_type === "appeal_request_reviewed" && requestId) {
      const history = reviews.get(requestId) || [];
      history.push(log);
      reviews.set(requestId, history);
    }
    if (log.event_type === "appeal_request_reset" && requestId &&
        (!resets.has(requestId) || eventTime(log) > eventTime(resets.get(requestId)!))) {
      resets.set(requestId, log);
    }
  });
  reviews.forEach(history => history.sort((a, b) => eventTime(b) - eventTime(a) ||
    toNumber(b.details?.reviewVersion) - toNumber(a.details?.reviewVersion)));

  return logs
    .filter((log) => log.event_type === "appeal_request_submitted")
    .map((log): AppealRequest => {
      const requestId = getRequestId(log);
      const history = reviews.get(requestId) || [];
      const review = history[0];
      const latestEditEvent = [...(editEvents.get(requestId) || [])].sort((a,b)=>eventTime(b)-eventTime(a))[0];
      const editingDraft = Boolean(latestEditEvent && latestEditEvent.event_type !== "appeal_submission_resubmitted" && (!review || eventTime(latestEditEvent)>eventTime(review)));
      const activeEditTopics = Array.isArray(latestEditEvent?.details?.topics) ? latestEditEvent.details.topics as AppealTopic[] : [];
      const accessEvents = [...(additionalAccessEvents.get(requestId) || [])].sort((a,b)=>eventTime(a)-eventTime(b));
      const latestAccessRequest = [...accessEvents].reverse().find(event=>event.event_type==="appeal_additional_access_requested");
      const latestAccessDecision = latestAccessRequest && [...accessEvents].reverse().find(event=>event.event_type==="appeal_additional_access_decided" && eventTime(event)>=eventTime(latestAccessRequest) && String(event.details?.accessId||"")===String(latestAccessRequest.details?.accessId||""));
      const additionalAccessRequest = latestAccessRequest ? {
        requestId: String(latestAccessRequest.details?.accessId || ""),
        reason: String(latestAccessRequest.details?.reason || ""),
        topics: Array.isArray(latestAccessRequest.details?.topicCodes) ? latestAccessRequest.details.topicCodes as string[] : [],
        requestedAt: String(latestAccessRequest.details?.requestedAt || latestAccessRequest.created_at || ""),
        status: (latestAccessDecision ? (latestAccessDecision.details?.approved ? "Approved" : "Rejected") : "Pending") as "Pending" | "Approved" | "Rejected",
        decidedAt: String(latestAccessDecision?.details?.decidedAt || latestAccessDecision?.created_at || ""),
        decisionReason: String(latestAccessDecision?.details?.reason || ""),
      } : null;
      const reset = resets.get(requestId);
      const latestRound = [...(openedRounds.get(requestId) || [])].sort((a,b) => eventTime(b)-eventTime(a))[0];
      const latestRoundId = String(latestRound?.details?.roundId || "");
      const roundWasCancelled = Boolean(latestRoundId) &&
        (cancelledRounds.get(requestId) || []).some(item =>
          String(item.details?.roundId || "") === latestRoundId &&
          eventTime(item) >= eventTime(latestRound!)
        );
      const roundAlreadyReviewed = Boolean(latestRoundId) &&
        history.some(item => String(item.details?.roundId || "") === latestRoundId);
      const latestOpenedAt = String(latestRound?.details?.openedAt || latestRound?.created_at || "");
      const latestExpiresAt = String(latestRound?.details?.expiresAt || appealAdditionalDeadline(latestOpenedAt));
      const latestExpiryMs = Date.parse(latestExpiresAt);
      const roundSubmissions = latestRoundId ? (submittedEvidence.get(requestId) || []).filter(item =>
        String(item.details?.roundId || "") === latestRoundId && eventTime(item) >= eventTime(latestRound!)) : [];
      const timelySubmission = roundSubmissions.some(item =>
        !Number.isFinite(latestExpiryMs) || eventTime(item) < latestExpiryMs);
      const additionalSubmission = timelySubmission
        ? [...roundSubmissions].sort((a, b) => eventTime(b) - eventTime(a))[0] : undefined;
      const roundWasExpired = Boolean(latestRoundId) && !additionalSubmission && !roundAlreadyReviewed &&
        ((Number.isFinite(latestExpiryMs) && asOf >= latestExpiryMs) ||
          (expiredRounds.get(requestId) || []).some(item => String(item.details?.roundId || "") === latestRoundId));
      const lastAdditionalStatus: AppealRequest["lastAdditionalStatus"] = !latestRoundId || roundAlreadyReviewed
        ? ""
        : roundWasCancelled ? "Cancelled (Additional)"
        : roundWasExpired ? "Expired (Additional)"
        : additionalSubmission ? "Pending (Additional)" : "";
      const openTopics = Array.isArray(latestRound?.details?.topics)
        ? latestRound.details.topics as AppealTopic[] : [];
      const submittedTopics = Array.isArray(additionalSubmission?.details?.topics)
        ? additionalSubmission.details.topics as AppealTopic[] : [];
      const additionalRound = !roundAlreadyReviewed && !roundWasCancelled && !roundWasExpired && latestRoundId && history.length && !reset
        ? {
            roundId: latestRoundId,
            openedAt: latestOpenedAt,
            expiresAt: latestExpiresAt,
            openedBy: String(latestRound?.details?.openedBy || latestRound?.display_name || ""),
            note: String(latestRound?.details?.note || ""),
            submitted: Boolean(additionalSubmission),
            submittedAt: String(additionalSubmission?.details?.submittedAt || additionalSubmission?.created_at || ""),
            topics: (additionalSubmission ? submittedTopics.filter(topic => openTopics.some(allowed => allowed.code === topic.code)) : openTopics).map(topic => ({
              ...topic,
              ...(submittedTopics.find(row => row.code === topic.code) || {}),
              decision: undefined,
              revisedScore: undefined,
              revisedComment: "",
              rejectReason: "",
            })),
          }
        : null;
      const reviewTopics = Array.isArray(review?.details?.topics) ? (review?.details?.topics as AppealTopic[]) : null;
      const baseTopics = activeEditTopics.length && latestEditEvent?.event_type === "appeal_submission_resubmitted" && !latestEditEvent.details?.roundId
        ? activeEditTopics : Array.isArray(log.details?.topics) ? (log.details?.topics as AppealTopic[]) : [];
      const reviewDecision = String(review?.details?.decision || "");
      // A reviewed additional round may include a topic absent from the original
      // submission. Merge by code instead of dropping new topics or doubling deltas.
      const sourceTopics = baseTopics.length
        ? [
            ...baseTopics.map(original => ({
              ...original,
              ...(reviewTopics?.find(topic => topic.code === original.code) || {}),
            })),
            ...(reviewTopics || []).filter(topic => !baseTopics.some(original => original.code === topic.code)),
          ]
        : reviewTopics || [];
      const appealedTopics = sourceTopics
        .filter(isAppealedTopic)
        .map((topic) => {
          const original = baseTopics.find(item => item.code === topic.code);
          topic = {
            ...topic,
            evidenceImages: topic.evidenceImages?.length ? topic.evidenceImages : original?.evidenceImages || [],
            qaEvidenceImages: topic.qaEvidenceImages || [],
          };
          const decision = review ? getAppealTopicDecision(topic, reviewDecision) : undefined;
          topic = { ...topic, decision };
          if (decision !== "Rejected") return topic;
          return {
            ...topic,
            revisedScore: undefined,
            revisedComment: "",
            rejectReason: String(topic.rejectReason || topic.revisedComment || "").trim(),
          };
        });
      const submittedAtTime = new Date(log.created_at || String(log.details?.submittedAt || "")).getTime();
      const reviewedAtTime = new Date(review?.created_at || String(review?.details?.reviewedAt || "")).getTime();
      const resetAtTime = new Date(reset?.created_at || String(reset?.details?.resetAt || "")).getTime();
      const isResetAfterSubmit =
        Boolean(reset) &&
        !Number.isNaN(resetAtTime) &&
        (Number.isNaN(submittedAtTime) || resetAtTime > submittedAtTime) &&
        (Number.isNaN(reviewedAtTime) || resetAtTime > reviewedAtTime);
      const status = isResetAfterSubmit
        ? "Reset"
        : review ? summarizeAppealDecisions(appealedTopics) : "Pending";

      return {
        requestId,
        editingDraft,
        activeEditTopics,
        additionalAccessRequest,
        caseId: String(log.case_id || log.details?.caseId || ""),
        agent: String(log.target_agent || log.details?.agent || ""),
        targetUsername: String(log.details?.targetUsername || log.details?.agentUsername || ""),
        auditDate: String(log.details?.auditDate || ""),
        auditTimestamp: String(
          log.details?.auditTimestamp ||
          log.details?.evaluationAuditDate ||
          log.details?.auditDate ||
          ""
        ),
        weekLabel: String(log.details?.weekLabel || ""),
        submittedBy: String(log.details?.submittedBy || log.display_name || ""),
        submittedAt: firstStoredAppealDateTime(
          latestEditEvent?.event_type === "appeal_submission_resubmitted" && !latestEditEvent.details?.roundId
            ? latestEditEvent.details?.submittedAt || latestEditEvent.created_at : "",
          log.details?.submittedAt,
          log.created_at,
          appealSubmittedAtFromRequestId(requestId)
        ),
        finalScore: toNumber(log.details?.finalScore),
        grade: String(log.details?.grade || ""),
        inquiry: String(log.details?.inquiry || ""),
        caseDescription: String(log.details?.caseDescription || ""),
        caseUrl: String(log.details?.caseUrl || ""),
        rawDataSourceName: String(log.details?.rawDataSourceName || ""),
        status,
        reviewSummary: String(review?.details?.reviewSummary || ""),
        reviewedAt: firstStoredAppealDateTime(review?.details?.reviewedAt, review?.created_at),
        reviewedBy: String(
          review?.details?.reviewedBy ||
          review?.agent_name ||
          review?.display_name ||
          ""
        ).trim(),
        reviewedByUsername: String(
          review?.details?.reviewedByUsername ||
          review?.username ||
          ""
        ).trim(),
        submittedByUsername: String(log.details?.submittedByUsername || log.username || ""),
        reviewId: String(review?.details?.reviewId || review?.id || ""),
        reviewVersion: toNumber(review?.details?.reviewVersion, history.length),
        actionHistory: buildAppealActionHistory(logs, requestId, asOf),
        additionalRound,
        lastAdditionalStatus: isResetAfterSubmit ? "" : lastAdditionalStatus,
        additionalHistory: [...(openedRounds.get(requestId) || [])].sort((a, b) => eventTime(b) - eventTime(a)).map(opened => {
          const roundId = String(opened.details?.roundId || "");
          const submission = (submittedEvidence.get(requestId) || [])
            .find(event => String(event.details?.roundId || "") === roundId);
          const reviewed = history.find(event => String(event.details?.roundId || "") === roundId);
          const cancelled = (cancelledRounds.get(requestId) || []).find(event => String(event.details?.roundId || "") === roundId);
          const expired = (expiredRounds.get(requestId) || []).find(event => String(event.details?.roundId || "") === roundId);
          return {
            roundId,
            openedAt: String(opened.details?.openedAt || opened.created_at || ""),
            submittedAt: String(submission?.details?.submittedAt || submission?.created_at || ""),
            reviewedAt: String(reviewed?.details?.reviewedAt || reviewed?.created_at || ""),
            closedStatus: reviewed ? String(reviewed.details?.decision || "Reviewed") :
              cancelled ? "Cancelled (Additional)" : expired ? "Expired (Additional)" :
              (roundId === latestRoundId && roundWasExpired) ? "Expired (Additional)" :
              submission ? "Pending (Additional)" : "Opened",
          };
        }),
        cancelledAdditionalRounds: (cancelledRounds.get(requestId) || [])
          .slice()
          .sort((a, b) => eventTime(b) - eventTime(a))
          .map(item => ({
            roundId: String(item.details?.roundId || ""),
            reason: String(item.details?.reason || ""),
            cancelledBy: String(item.details?.cancelledBy || item.display_name || ""),
            cancelledAt: String(item.details?.cancelledAt || item.created_at || ""),
          })),
        reviewHistory: history.map(item => ({
          reviewId: String(item.details?.reviewId || item.id || item.created_at || ""),
          reviewedAt: firstStoredAppealDateTime(item.details?.reviewedAt, item.created_at),
          reviewedBy: String(item.details?.reviewedBy || item.agent_name || item.display_name || item.username || ""),
          decision: String(item.details?.decision || ""),
          reviewSummary: String(item.details?.reviewSummary || ""),
          topics: (Array.isArray(item.details?.topics) ? item.details.topics as AppealTopic[] : [])
            .filter(isAppealedTopic)
            .map(topic => ({ ...topic, decision: getAppealTopicDecision(topic, item.details?.decision) })),
        })),
        topics: appealedTopics,
      };
    }).sort((a, b) => {
      const submittedTime = (value: string) => Date.parse(value) || Number.MAX_SAFE_INTEGER;
      return submittedTime(a.submittedAt) - submittedTime(b.submittedAt) || a.requestId.localeCompare(b.requestId);
    });
}

function buildAppealResetHistory(logs: UsageLogEvent[]) {
  return logs
    .filter((log) => log.event_type === "appeal_request_reset")
    .map((log): AppealResetHistoryItem => ({
      requestId: getRequestId(log),
      caseId: String(log.case_id || log.details?.caseId || ""),
      agent: String(log.target_agent || log.details?.agent || ""),
      resetAt: String(log.details?.resetAt || log.created_at || ""),
      resetBy: String(log.details?.resetBy || log.display_name || ""),
      reason: String(log.details?.reason || ""),
    }));
}

function exportAppealRows(requests: AppealRequest[]) {
  const reviewed = requests.filter((item) => item.status === "Approved" || item.status === "Rejected" || item.status === "Partially Approved");
  const topicCodes = Array.from(
    new Set(reviewed.flatMap((item) => item.topics.filter(isAppealedTopic).map((topic) => topic.code)))
  ).sort((a, b) => Number(a) - Number(b));

  const baseHeaders = [
    "Case ID",
    "Agent Name",
    "Audit Date",
    "Week Label",
    "Final Score",
    "Grade",
    "Appeal Decision",
    "Appeal Version",
    "Appeal Submit Date & Time",
    "Appeal Result Date & Time",
    "Appeal Channel",
    "Appeal Review Summary",
    "RawData File",
    "Customer Inquiry",
    "Case URL",
  ];
  const topicHeaders = topicCodes.flatMap((code) => [
    `${code} Decision`,
    `${code} Score`,
    `${code} Revised Score`,
    `${code} Comment`,
    `${code} Revised Comment`,
    `${code} Reject Reason`,
    `${code} Appeal Reason`,
  ]);

  const rows = reviewed.map((item) => {
    const appealTopics = item.topics.filter(isAppealedTopic);
    const topicMap = new Map(appealTopics.map((topic) => [topic.code, topic]));
    const approvedFinalScore = appealFinalScoreFromTopics(appealTopics, item.finalScore);
    const row: Record<string, unknown> = {
      "Case ID": item.caseId,
      "Agent Name": item.agent,
      "Audit Date": item.auditDate,
      "Week Label": item.weekLabel,
      "Final Score": approvedFinalScore,
      Grade: appealGradeFromScore(approvedFinalScore),
      "Appeal Decision": item.status,
      "Appeal Version": "Revised 1",
      "Appeal Submit Date & Time": formatDateTime(item.submittedAt),
      "Appeal Result Date & Time": formatDateTime(item.reviewedAt),
      "Appeal Channel": "Dashboard Case Detail",
      "Appeal Review Summary": item.reviewSummary,
      "RawData File": item.rawDataSourceName,
      "Customer Inquiry": item.inquiry,
      "Case URL": item.caseUrl,
    };

    topicCodes.forEach((code) => {
      const topic = topicMap.get(code);
      row[`${code} Decision`] = topic?.decision ?? "";
      row[`${code} Score`] = topic?.score ?? "";
      row[`${code} Revised Score`] = topic?.decision === "Approved" ? topic?.revisedScore ?? topic?.score ?? "" : "";
      row[`${code} Comment`] = topic?.comment ?? "";
      row[`${code} Revised Comment`] = topic?.decision === "Approved" ? topic?.revisedComment ?? "" : "";
      row[`${code} Reject Reason`] = topic?.decision === "Rejected" ? topic?.rejectReason ?? "" : "";
      row[`${code} Appeal Reason`] = isAppealedTopic(topic) ? topic?.appealReason ?? "" : "";
    });

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...baseHeaders, ...topicHeaders] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Appeal_Data");
  XLSX.writeFile(workbook, `Appeal_ROWDATA_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function normalizeAppealReviewCaseId(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").trim().toUpperCase();
}

function normalizeAppealReviewAgent(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function mergeRequestWithCaseDetail(
  request: AppealRequest,
  externalCaseDetailCases: readonly any[]
): AppealRequest {
  const caseId = normalizeAppealReviewCaseId(request.caseId);
  const candidates = externalCaseDetailCases.filter((item) =>
    normalizeAppealReviewCaseId(item?.caseId) === caseId
  );
  const agent = normalizeAppealReviewAgent(request.agent);
  const sourceCase = candidates.find((item) =>
    normalizeAppealReviewAgent(item?.agent) === agent
  ) || candidates[0];
  if (!sourceCase) return request;
  const sourceValue = (...values: unknown[]) =>
    values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
  return {
    ...request,
    targetUsername: sourceValue(sourceCase.targetUsername, request.targetUsername),
    auditDate: sourceValue(sourceCase.caseDate, sourceCase.auditDate, request.auditDate),
    auditTimestamp: sourceValue(
      sourceCase.evaluationAuditDate, sourceCase.auditTimestamp, request.auditTimestamp
    ),
    submittedAt: sourceValue(request.submittedAt, sourceCase.appealSubmittedAt),
    reviewedAt: sourceValue(request.reviewedAt, sourceCase.appealReviewedAt),
  };
}

function getAppealReviewMonthKey(request: AppealRequest) {
  for (const value of [request.auditDate, request.auditTimestamp, request.submittedAt]) {
    const text = String(value || "").trim();
    const thaiDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (thaiDate) return thaiDate[3] + "-" + thaiDate[2].padStart(2, "0");
    const isoDate = text.match(/^(\d{4})-(\d{2})-/);
    if (isoDate) return isoDate[1] + "-" + isoDate[2];
  }
  return "unknown";
}

function formatAppealReviewMonth(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "Unknown Month";
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(
    new Date(Number(match[1]), Number(match[2]) - 1, 1)
  );
}

// appeal-review-table-v54

function openCaseDetailTab(request: AppealRequest) {
  const params = new URLSearchParams({
    tab: "dashboard",
    subTab: "case-detail",
    caseId: request.caseId,
  });
  if (request.agent) params.set("agent", request.agent);
  params.set("workspace", `case:${encodeURIComponent(request.caseId.trim())}|${encodeURIComponent((request.agent || "").trim())}`);
  window.open(`${window.location.origin}${window.location.pathname}?${params.toString()}`, "_blank", "noopener,noreferrer");
}

export default function AppealRequestsMockup({
  currentUser,
  agentDirectory = [],
  externalCaseDetailCases = [],
  externalRequestId,
  onOpenRequestWorkspace,
  allowReview: reviewPermission = false,
  allowedAgentNames = null,
  seniorOptions = [],
  additionalCaseTopics = [],
  onTasksChanged,
}: {
  currentUser: any;
  agentDirectory?: CaseAgentDirectoryEntry[];
  externalCaseDetailCases?: any[];
  externalRequestId?: string;
  onOpenRequestWorkspace?: (requestId: string, caseId: string) => void;
  allowReview?: boolean;
  // appeal-review-workspace-tabs-v59-review
  allowedAgentNames?: string[] | null;
  seniorOptions?: { username: string; displayName: string; role?: string }[];
  additionalCaseTopics?: any[];
  onTasksChanged?: () => void;
}) {
  const allowReview = reviewPermission && currentUser?.role === "Quality Assurance";
  const canDiscuss = ["Quality Assurance", "Senior", "Supervisor"].includes(String(currentUser?.role || ""));
  const [logs, setLogs] = useState<UsageLogEvent[]>([]);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [discussionLogs, setDiscussionLogs] = useState<UsageLogEvent[]>([]);
  const [assignedRequestIds, setAssignedRequestIds] = useState<string[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [detailRequestId, setDetailRequestId] = useState("");
  const [draftTopics, setDraftTopics] = useState<AppealTopic[]>([]);
  const decision = summarizeAppealDecisions(draftTopics.filter(isAppealedTopic));
  const [reviewSummary, setReviewSummary] = useState("");
  const [message, setMessage] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [qaImageUploads, setQaImageUploads] = useState(0);
  const [discussionImages, setDiscussionImages] = useState<AppealEvidenceImage[]>([]);
  const [discussionText, setDiscussionText] = useState("");
  const [discussionTopic, setDiscussionTopic] = useState("");
  const [discussionRecipient, setDiscussionRecipient] = useState("");
  const [discussionUploads, setDiscussionUploads] = useState(0);
  const [discussionBusy, setDiscussionBusy] = useState(false);
  const [discussionMessage, setDiscussionMessage] = useState("");
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const [additionalCodes, setAdditionalCodes] = useState<string[]>([]);
  const [additionalNote, setAdditionalNote] = useState("");
  const [additionalReason, setAdditionalReason] = useState("");
  const [savedAdditionalReasons, setSavedAdditionalReasons] = useState<string[]>([]);
  const [addingReason, setAddingReason] = useState(false);
  const [newReason, setNewReason] = useState("");
  const [reasonSaving, setReasonSaving] = useState(false);
  const [reasonNotice, setReasonNotice] = useState("");
  const [editingReview, setEditingReview] = useState(false);
  const [savePreview, setSavePreview] = useState<AppealReviewSavePreview | null>(null);
  const [notice, setNotice] = useState<AppealReviewNotice | null>(null);
  const savingRef = useRef(false);
  const standaloneRequestId = String(externalRequestId || "").trim();
  const [selectedAgentFilter, setSelectedAgentFilter] = useState("");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState("all");
  const [searchCaseId, setSearchCaseId] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [accessDecision, setAccessDecision] = useState<"approve" | "reject" | null>(null);
  const [accessDecisionReason, setAccessDecisionReason] = useState("");
  const accessSavingRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);
  const requests = useMemo(() => {
    const all = buildAppealRequests(logs).map(request => mergeRequestWithCaseDetail(request, externalCaseDetailCases || []));
    return scopeAppealRequests(all, currentUser, allowedAgentNames, assignedRequestIds);
  }, [logs, currentUser?.username, currentUser?.role, currentUser?.agentName, currentUser?.displayName, allowedAgentNames, assignedRequestIds, nowTick, externalCaseDetailCases]);

  useEffect(() => {
    if (!["Senior", "Supervisor"].includes(String(currentUser?.role || ""))) return;
    let cancelled = false;
    void fetchAssignedAppealRequestIds(String(currentUser?.username || ""))
      .then(ids => { if (!cancelled) setAssignedRequestIds(ids); })
      .catch(error => console.warn("Unable to load assigned appeal discussions", error));
    return () => { cancelled = true; };
  }, [currentUser?.role, currentUser?.username]);
  const discussionEvents = useMemo(() => (canDiscuss ? discussionLogs : [])
    .filter(log => log.event_type === "appeal_internal_message" &&
      String(log.details?.requestId || "") === selectedRequestId &&
      !log.source_case_unavailable)
    .filter(log => !["Senior", "Supervisor"].includes(String(currentUser?.role || "")) ||
      [String(log.details?.seniorUsername || "").toLowerCase(), String(log.username || "").toLowerCase()]
        .includes(String(currentUser.username || "").toLowerCase()))
    .sort((a, b) => Date.parse(String(a.created_at || "")) - Date.parse(String(b.created_at || ""))),
    [discussionLogs, selectedRequestId, canDiscuss, currentUser?.role, currentUser?.username]
  );
  const unavailableSelectedRequest = findUnavailableAppealForRoute(logs, selectedRequestId, window.location.search);
  const resetHistory = useMemo(() => {
    const permittedIds = new Set(requests.map(request => request.requestId));
    return buildAppealResetHistory(logs).filter(item => permittedIds.has(item.requestId));
  }, [logs, requests]);
  const selectedRequest = requests.find((item) => item.requestId === selectedRequestId && !item.editingDraft) || null;
  useEffect(() => {
    if (!standaloneRequestId) return;
    setSelectedRequestId(requests.some(item => item.requestId === standaloneRequestId && !item.editingDraft) ? standaloneRequestId : "");
  }, [standaloneRequestId, requests]);
  const isReviewDetailOpen = Boolean(selectedRequest && (
    detailRequestId === selectedRequest.requestId ||
    (standaloneRequestId && selectedRequest.requestId === standaloneRequestId)
  ));
  const selectedAppealedTopics = selectedRequest?.topics.filter(isAppealedTopic) || [];
  const selectedCurrentScore = (selectedRequest?.status === "Approved" || selectedRequest?.status === "Partially Approved" || selectedRequest?.status === "Rejected")
    ? appealFinalScoreFromTopics(selectedAppealedTopics, selectedRequest.finalScore)
    : selectedRequest?.finalScore || 0;
  const selectedCurrentGrade = selectedRequest
    ? scoreToGrade(selectedCurrentScore, getAppealReviewMonthKey(selectedRequest))
    : "-";
  const selectedAgentTeam = resolveCaseAgentTeam(selectedRequest, agentDirectory || []);
  const eligibleSeniorOptions = seniorOptions;
  const availableAppealTopics = useMemo(() => {
    const result = new Map<string, AppealTopic>();
    const selected = selectedRequest;
    if (!selected) return [] as AppealTopic[];
    const targetCase = additionalCaseTopics.find(row =>
      String(row?.caseId || "").replace(/\s+/g, "").toUpperCase() ===
      String(selected.caseId || "").replace(/\s+/g, "").toUpperCase()
    );
    if (Array.isArray(targetCase?.topics)) {
      for (const row of targetCase.topics) {
        if (!row?.code) continue;
        result.set(String(row.code), {
          code: String(row.code),
          label: String(row.label || ""),
          score: toNumber(row.score),
          max: toNumber(row.max),
          comment: String(row.comment || ""),
          wantsAppeal: true,
          appealReason: "",
        });
      }
    }
    // Preserve the original baseline of already reviewed topics even if
    // the dashboard currently shows their adjusted score.
    selected.topics.forEach(topic => result.set(topic.code, { ...topic }));
    return [...result.values()].sort((a, b) =>
      String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  }, [additionalCaseTopics, selectedRequest?.requestId, selectedRequest?.reviewId, selectedRequest?.caseId]);

  const draftForRequest = (request: AppealRequest) => {
    if (!request.additionalRound) return request.topics.map(topic => ({
      ...topic,
      revisedScore: topic.decision === "Rejected" ? undefined : topic.revisedScore ?? topic.score,
      rejectReason: topic.rejectReason || "",
    }));
    const latestRound = request.additionalRound;
    const codes = new Set(latestRound.topics.map(topic => topic.code));
    const priorTopics = request.topics.filter(topic => !codes.has(topic.code));
    const selectedTopics = latestRound.topics.map(topic => {
      const original = request.topics.find(item => item.code === topic.code);
      const latestScore = original?.decision === "Approved" && String(original.revisedScore ?? "").trim() !== ""
        ? toNumber(original.revisedScore, original.score)
        : original?.score ?? topic.score;
      return {
        ...(original || topic),
        ...topic,
        originalScore: original?.originalScore ?? original?.score ?? topic.score,
        score: latestScore,
        retainedComment: original?.decision === "Approved"
          ? original.revisedComment || original.comment || ""
          : original?.retainedComment || original?.comment || topic.comment || "",
        decision: undefined,
        revisedScore: latestScore,
        revisedComment: "",
        rejectReason: "",
        wantsAppeal: true,
      };
    });
    return [...priorTopics, ...selectedTopics];
  };

  const additionalReasonOptions = useMemo(() => {
    const byName = new Map<string, string>();
    for (const reason of [...DEFAULT_ADDITIONAL_APPEAL_REASONS, ...savedAdditionalReasons]) {
      const clean = String(reason || "").trim();
      if (clean && !byName.has(clean.toLocaleLowerCase("th"))) byName.set(clean.toLocaleLowerCase("th"), clean);
    }
    return [...byName.values()];
  }, [savedAdditionalReasons]);

  useEffect(() => {
    let cancelled = false;
    if (!allowReview) return;
    void fetchAdditionalAppealReasonOptions()
      .then(options => { if (!cancelled) setSavedAdditionalReasons(options); })
      .catch(error => {
        console.warn("Could not load custom additional appeal reasons", error);
        if (!cancelled) setReasonNotice("โหลดเหตุผลที่เพิ่มไว้ไม่สำเร็จ กรุณาลองใหม่");
      });
    return () => { cancelled = true; };
  }, [allowReview]);

  const latestRequestsByCase = [...requests].sort((a,b) => (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0))
    .filter((item,index,all) => all.findIndex(other => other.caseId.trim().toLowerCase() === item.caseId.trim().toLowerCase() && other.agent === item.agent) === index)
    .filter(item => !item.editingDraft)
    .sort((a,b) => (Date.parse(appealWorkflowActivityAt(a)) || 0) - (Date.parse(appealWorkflowActivityAt(b)) || 0));
  const pendingRequests = latestRequestsByCase.filter(item => ["Pending", "Pending (Additional)"].includes(appealWorkflowStatus(item)));
  const reviewedRequests = latestRequestsByCase.filter(item =>
    ["Approved", "Rejected", "Partially Approved"].includes(appealWorkflowStatus(item)));
  const resetRequests = latestRequestsByCase.filter((item) => item.status === "Reset");
  const workflowRequests = latestRequestsByCase.filter(item => appealWorkflowStatus(item) === "Request Additional Appeal");
  // Preserve the latest submitted/reviewed round for all-status history; drafts are excluded only while editing.
  const agentOptions = [...new Set(requests.map(item => item.agent).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const monthOptions = [...new Set(requests.map(getAppealReviewMonthKey).filter(item=>item!=="unknown"))].sort((a,b)=>b.localeCompare(a));
  const visibleRequestsUnfiltered = statusFilter === "All" ? latestRequestsByCase :
    latestRequestsByCase.filter(item => appealWorkflowStatus(item) === statusFilter);
  const visibleRequests = visibleRequestsUnfiltered.filter(item => (!selectedAgentFilter || item.agent===selectedAgentFilter) && (selectedMonthFilter==="all" || getAppealReviewMonthKey(item)===selectedMonthFilter) && (!searchCaseId.trim() || item.caseId.toUpperCase().includes(searchCaseId.trim().toUpperCase())));
  const isReviewed = selectedRequest?.status === "Approved" || selectedRequest?.status === "Rejected" || selectedRequest?.status === "Partially Approved";
  const selectedWorkflowStatus = selectedRequest ? appealWorkflowStatus(selectedRequest) : "";
  const isPermissionTask = ["Request Additional Appeal", "Approved (Access)"].includes(selectedWorkflowStatus);
  // An approved/rejected review closes internal messaging until QA explicitly
  // opens an additional round; older messages remain visible as audit history.
  const canSendDiscussion = canDiscuss && Boolean(selectedRequest) && (
    selectedRequest?.status === "Pending" || Boolean(selectedRequest?.additionalRound)
  );
  const canReview = allowReview && (
    selectedRequest?.status === "Pending" ||
    Boolean(selectedRequest?.additionalRound?.submitted) ||
    (isReviewed && editingReview && !selectedRequest?.additionalRound && !isPermissionTask)
  );
  const currentAction = selectedRequest?.additionalRound
    ? selectedRequest.actionHistory.find(action => action.roundId === selectedRequest.additionalRound?.roundId)
    : selectedRequest?.actionHistory.find(action => action.reviews.some(review => review.reviewId === selectedRequest.reviewId)) || selectedRequest?.actionHistory[0];
  const canReviewTopic = (code: string) => canReview && (!(selectedRequest?.additionalRound || editingReview) || Boolean(currentAction?.topics.some(topic => topic.code === code)));
  const displayTopics = [...new Map([
    ...(selectedRequest?.actionHistory.flatMap(action => action.topics) || []), ...draftTopics,
  ].map(topic => [topic.code, topic])).values()].filter(topic => isAppealedTopic(topic) || selectedRequest?.actionHistory.some(action => action.topics.some(item => item.code === topic.code)))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const loadRequests = async () => {
    try {
      setHistoryLoading(true);
      setHistoryError("");
      setMessage("");
      setLogs(await fetchAppealEvents([
        "appeal_request_submitted",
        "appeal_request_reviewed",
        "appeal_request_reset",
        "appeal_additional_round_opened",
        "appeal_additional_round_cancelled",
        "appeal_additional_round_expired",
        "appeal_additional_evidence_submitted",
        "appeal_additional_access_requested", "appeal_additional_access_decided",
        "appeal_submission_edit_started", "appeal_submission_draft_saved", "appeal_submission_resubmitted",
      ], { limit: 2000, forceRefresh: true }) as UsageLogEvent[]);
      return true;
    } catch (error) {
      console.warn("Load appeal requests failed", error);
      setHistoryError("โหลดประวัติอุทธรณ์ไม่สำเร็จ กรุณากด Refresh อีกครั้ง");
      setMessage("โหลดคำขออุทธรณ์ไม่สำเร็จ กรุณาลองโหลดข้อมูลอีกครั้ง");
      return false;
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
    const reload = () => { if (!accessSavingRef.current) void loadRequests(); };
    window.addEventListener("qa-dashboard-data-refresh", reload);
    return () => window.removeEventListener("qa-dashboard-data-refresh", reload);
  }, []);

  useEffect(() => {
    if (!selectedRequest) {
      setDetailRequestId("");
      return;
    }
    setSelectedRequestId(selectedRequest.requestId);
    setDraftTopics(draftForRequest(selectedRequest));
    setReviewSummary(selectedRequest.additionalRound ? "" : selectedRequest.reviewSummary || "");
    setEditingReview(false);
    setDiscussionImages([]);
    setDiscussionText("");
    setDiscussionTopic("");
    setDiscussionRecipient("");
    setDiscussionMessage("");
    setAdditionalOpen(false);
    setAdditionalCodes([]);
    setAdditionalNote("");
    setAdditionalReason("");
    setAddingReason(false);
    setNewReason("");
    setReasonNotice("");
  }, [selectedRequest?.requestId, selectedRequest?.submittedAt, selectedRequest?.reviewId, selectedRequest?.reviewedAt, selectedRequest?.additionalRound?.roundId, selectedRequest?.additionalRound?.submittedAt]);

  useEffect(() => {
    let cancelled = false;
    setDiscussionLogs([]);
    if (selectedRequestId && canDiscuss) {
      void fetchAppealDiscussionEvents(selectedRequestId)
        .then(events => { if (!cancelled) setDiscussionLogs(events as UsageLogEvent[]); })
        .catch(error => { if (!cancelled) console.warn("Load private appeal discussion failed", error); });
    }
    return () => { cancelled = true; };
  }, [selectedRequestId, canDiscuss]);

  const saveAdditionalAppealReason = async () => {
    if (!allowReview || reasonSaving || busy) return;
    const clean = newReason.trim().replace(/\s+/g, " ");
    if (!clean || clean.length > 180) {
      setReasonNotice("กรุณากรอกเหตุผลไม่เกิน 180 ตัวอักษร");
      return;
    }
    const matched = additionalReasonOptions.find(
      option => option.toLocaleLowerCase("th") === clean.toLocaleLowerCase("th")
    );
    if (matched) {
      setAdditionalReason(matched);
      setNewReason("");
      setAddingReason(false);
      setReasonNotice("เหตุผลนี้มีในรายการแล้ว");
      return;
    }
    setReasonSaving(true);
    setReasonNotice("");
    try {
      const added = await writeAppealEvent(currentUser, "appeal_additional_reason_option_added", {
        tab: "appeal-requests",
        details: {
          reason: clean,
          optionId: crypto.randomUUID(),
          createdBy: String(currentUser?.username || ""),
          createdAt: new Date().toISOString(),
        },
      });
      if (!added) throw new Error("QA permission required");
      const refreshed = await fetchAdditionalAppealReasonOptions();
      setSavedAdditionalReasons(refreshed);
      setAdditionalReason(clean);
      setNewReason("");
      setAddingReason(false);
      setReasonNotice("เพิ่มเหตุผลลงรายการกลางเรียบร้อยแล้ว");
    } catch (error) {
      console.error("Save additional appeal reason failed", error);
      setReasonNotice("เพิ่มเหตุผลไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setReasonSaving(false);
    }
  };

  const openAdditionalAppealRound = async () => {
    if (!allowReview || !selectedRequest || !isReviewed || selectedRequest.additionalRound || isPermissionTask ||
        busy || reasonSaving || !additionalCodes.length || !additionalReason ||
        !additionalReasonOptions.includes(additionalReason)) return;
    const selected = availableAppealTopics.filter(row => additionalCodes.includes(row.code));
    if (selected.length !== additionalCodes.length || !selected.length) {
      setMessage("ไม่พบหัวข้อที่เลือกในข้อมูลประเมินของเคสนี้");
      return;
    }
    const current = selectedRequest;
    setBusy(true);
    try {
      const freshLogs = await fetchAppealEvents([
        "appeal_request_submitted", "appeal_request_reviewed", "appeal_request_reset",
        "appeal_additional_round_opened", "appeal_additional_round_cancelled", "appeal_additional_round_expired", "appeal_additional_evidence_submitted",
        "appeal_submission_edit_started", "appeal_submission_draft_saved", "appeal_submission_resubmitted",
      ], { limit: 2000, forceRefresh: true }) as UsageLogEvent[];
      const fresh = buildAppealRequests(freshLogs).find(row => row.requestId === current.requestId);
      if (!fresh || fresh.status === "Reset" || fresh.additionalRound ||
          fresh.reviewId !== current.reviewId) {
        setLogs(freshLogs);
        setMessage("เคสมีการเปลี่ยนแปลง กรุณา Refresh และตรวจสอบก่อนเปิดรอบใหม่");
        return;
      }
      const roundId = crypto.randomUUID();
      const openedAt = new Date().toISOString();
      const saved = await writeAppealEvent(currentUser, "appeal_additional_round_opened", {
        tab: "appeal-requests",
        case_id: current.caseId,
        target_agent: current.agent,
        details: {
          requestId: current.requestId,
          roundId,
          previousReviewId: current.reviewId,
          openedAt,
          expiresAt: appealAdditionalDeadline(openedAt),
          openedBy: String(currentUser?.agentName || currentUser?.displayName || currentUser?.username || ""),
          reason: additionalReason,
          note: additionalNote.trim()
            ? `${additionalReason} — ${additionalNote.trim()}`
            : additionalReason,
          topics: selected.map(row => ({
            code: row.code, label: row.label, score: row.score, max: row.max,
            comment: row.comment || "",
            wantsAppeal: true,
            appealReason: "",
            evidenceImages: [],
          })),
        },
      });
      if (!saved) throw new Error("เพิ่มเติมไม่ได้");
      setAdditionalOpen(false);
      setAdditionalCodes([]);
      setAdditionalNote("");
      setAdditionalReason("");
      setMessage("เปิดรอบอุทธรณ์เพิ่มเติมแล้ว รอเจ้าของเคสส่งเหตุผลและหลักฐานจาก Case Detail");
      await loadRequests();
      onTasksChanged?.();
      notifyQaAnalyticsDataChanged();
    } catch (error) {
      console.error("Open additional appeal round failed", error);
      setMessage("ไม่สามารถเปิดรอบเพิ่มเติมได้ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  const decideAdditionalAccess = async (approved: boolean) => {
    const selected = selectedRequest;
    const access = selected?.additionalAccessRequest;
    const repair = approved && access?.status === "Approved" && !selected?.additionalRound;
    if (!allowReview || !selected || !access || (access.status !== "Pending" && !repair) || busy || accessSavingRef.current) return;
    const decisionReason = accessDecisionReason.trim();
    if (!decisionReason) return;
    const allowedTopics = availableAppealTopics.filter(topic => access.topics.includes(topic.code));
    if (approved && (!allowedTopics.length || allowedTopics.length !== new Set(access.topics).size)) {
      setMessage("หัวข้อที่ขอไม่ครบ กรุณาตรวจสอบข้อมูลเคสก่อนอนุญาต");
      return;
    }
    accessSavingRef.current = true;
    setBusy(true);
    try {
      const freshLogs = await fetchAppealEvents([
        "appeal_request_submitted", "appeal_request_reviewed", "appeal_request_reset",
        "appeal_additional_access_requested", "appeal_additional_access_decided",
        "appeal_additional_round_opened", "appeal_additional_round_cancelled",
        "appeal_additional_round_expired", "appeal_additional_evidence_submitted",
        "appeal_submission_edit_started", "appeal_submission_draft_saved", "appeal_submission_resubmitted",
      ], { limit: 250, requestId: selected.requestId, forceRefresh: true }) as UsageLogEvent[];
      const latest = buildAppealRequests(freshLogs).find(row => row.requestId === selected.requestId);
      if (!latest || latest.status === "Reset" || latest.editingDraft || latest.additionalRound ||
          latest.reviewId !== selected.reviewId ||
          latest.additionalAccessRequest?.requestId !== access.requestId ||
          latest.additionalAccessRequest.status !== access.status) {
        setLogs(previous => [
          ...previous.filter(item => String(item.details?.requestId || "") !== selected.requestId),
          ...freshLogs,
        ]);
        setAccessDecision(null);
        setMessage("คำขอมีการเปลี่ยนแปลง กรุณาตรวจสอบสถานะล่าสุด");
        return;
      }
      // Repair old partial approvals using their original approval time. Opening
      // a missing round must not silently grant another three days.
      const openedAt = repair ? access.decidedAt || "" : new Date().toISOString();
      if (!Number.isFinite(Date.parse(openedAt))) throw new Error("Approval time is missing");
      const payload = { tab: "appeal-requests", case_id: selected.caseId, target_agent: selected.agent };
      const decisionPayload = {
        ...payload, details: {
          requestId: selected.requestId, accessId: access.requestId, approved,
          reason: decisionReason, decidedAt: openedAt, workflowId: access.requestId,
        },
      };
      const roundPayload = approved ? {
        ...payload, details: {
          requestId: selected.requestId, roundId: access.requestId,
          previousReviewId: selected.reviewId || "", accessId: access.requestId,
          openedAt, expiresAt: appealAdditionalDeadline(openedAt),
          openedBy: String(currentUser?.agentName || currentUser?.displayName || currentUser?.username || ""),
          reason: decisionReason, note: access.reason,
          topics: allowedTopics.map(topic => ({ code: topic.code, label: topic.label,
            score: topic.score, max: topic.max, comment: topic.comment || "",
            wantsAppeal: true, appealReason: "", evidenceImages: [],
          })),
        },
      } : undefined;
      const saved = await writeAdditionalAppealAccessDecision(currentUser, decisionPayload, roundPayload);
      if (!saved) throw new Error("QA permission required");
      // The atomic commit has succeeded. Project the committed decision without
      // another 2,000-document fetch that may hit the read quota after writing.
      const savedAt = new Date().toISOString();
      setLogs(previous => [
        ...previous,
        { ...decisionPayload, event_type: "appeal_additional_access_decided", created_at: savedAt },
        ...(roundPayload ? [{ ...roundPayload, event_type: "appeal_additional_round_opened", created_at: savedAt }] : []),
      ]);
      setAccessDecision(null);
      setMessage(approved ? "เปิดสิทธิ์แล้ว Admin ยื่นเพิ่มจาก Case Detail ได้ภายใน 3 วันหลังอนุมัติ" : "บันทึกผลไม่อนุญาตให้ยื่นเพิ่มแล้ว");
      onTasksChanged?.();
      notifyQaAnalyticsDataChanged();
    } catch (error) {
      console.error("Additional appeal access decision failed", error);
      const errorCode = String((error as { code?: string })?.code || "");
      const errorText = String((error as Error)?.message || "");
      setMessage(errorCode.includes("resource-exhausted")
        ? "Firestore ใช้ทรัพยากรหรือโควตาถึงขีดจำกัดแล้ว ยังไม่ได้อนุมัติสิทธิ์ กรุณาตรวจสอบ Usage ใน Firebase และรอให้โควตากลับมาใช้งานได้"
        : errorText.includes("เคสต้นทางถูกลบ")
        ? "ไม่สามารถอนุมัติได้ เนื่องจากไม่พบเคสต้นทาง กรุณาตรวจสอบข้อมูลเคส"
        : errorCode.includes("permission-denied")
          ? "Firebase ปฏิเสธสิทธิ์บันทึกข้อมูล (permission-denied) กรุณาตรวจสอบสิทธิ์เขียน qa_appeal_events คำขอยังไม่เปลี่ยนสถานะ"
          : errorCode.includes("unavailable") || errorCode.includes("deadline-exceeded")
            ? "เชื่อมต่อฐานข้อมูลไม่สำเร็จ กรุณาตรวจสอบเครือข่ายแล้วลองใหม่ คำขอยังไม่เปลี่ยนสถานะ"
            : `บันทึกไม่สำเร็จ คำขอยังไม่เปลี่ยนสถานะ (${errorCode || errorText.slice(0, 90) || "ไม่ทราบสาเหตุ"})`);
    } finally { accessSavingRef.current = false; setBusy(false); }
  };

  const cancelReviewEdit = () => {
    if (!selectedRequest || busy) return;
    setDraftTopics(draftForRequest(selectedRequest));
    setReviewSummary(selectedRequest.reviewSummary || "");
    setEditingReview(false);
  };

  const sendDiscussion = async () => {
    if (!selectedRequest || !canSendDiscussion || discussionBusy || discussionUploads || busy) return;
    if (!allowReview && !["Senior", "Supervisor"].includes(String(currentUser?.role || ""))) return;
    const text = discussionText.trim();
    if (!text && !discussionImages.length) {
      setDiscussionMessage("กรุณาระบุข้อความหรือแนบรูปภาพก่อนส่ง");
      return;
    }
    const seniorUsername = ["Senior", "Supervisor"].includes(String(currentUser?.role || ""))
      ? String(currentUser.username || "")
      : discussionRecipient;
    if (!seniorUsername || (allowReview && !eligibleSeniorOptions.some(senior => senior.username === seniorUsername))) {
      setDiscussionMessage("กรุณาเลือกผู้รับ Role Senior หรือ Supervisor");
      return;
    }
    setDiscussionBusy(true);
    setDiscussionMessage("");
    const sentAt = new Date().toISOString();
    const messageId = crypto.randomUUID();
    try {
      const saved = await writeAppealEvent(currentUser, "appeal_internal_message", {
        tab: "appeal-requests",
        case_id: selectedRequest.caseId,
        target_agent: selectedRequest.agent,
        details: {
          requestId: selectedRequest.requestId,
          messageId,
          sentAt,
          seniorUsername,
          topicCode: discussionTopic,
          message: text,
          evidenceImages: [...discussionImages],
          senderName: String(currentUser?.agentName || currentUser?.displayName || currentUser?.username || ""),
          senderRole: String(currentUser?.role || ""),
        },
      });
      if (!saved) throw new Error("User does not have internal appeal messaging permission");
      setDiscussionText("");
      setDiscussionImages([]);
      setDiscussionMessage("ส่งข้อความและรูปหลักฐานเรียบร้อยแล้ว");
      setDiscussionLogs(await fetchAppealDiscussionEvents(selectedRequest.requestId) as UsageLogEvent[]);
    } catch (error) {
      console.error("Save appeal discussion failed:", error);
      setDiscussionMessage("ส่งข้อความไม่สำเร็จ ข้อความและภาพที่แนบยังอยู่ กรุณาลองใหม่");
    } finally {
      setDiscussionBusy(false);
    }
  };

  const submitReview = () => {
    if (!selectedRequest || !canReview || busy || qaImageUploads > 0) return;
    if (selectedRequest.additionalRound && !selectedRequest.additionalRound.submitted) {
      setMessage("ต้องรอ Agent ส่งเหตุผลและหลักฐานเพิ่มเติมก่อนจึงจะพิจารณาได้");
      return;
    }
    if (!reviewSummary.trim()) {
      setNotice({ kind: "validation", title: "ยังบันทึกผลไม่ได้", caseId: selectedRequest.caseId,
        message: "กรุณากรอก Review Summary เพื่อสรุปเหตุผลการพิจารณาอุทธรณ์ก่อนบันทึก" });
      return;
    }
    let review;
    try {
      review = prepareAppealReview(draftTopics.filter(isAppealedTopic), selectedRequest.finalScore);
    } catch (error) {
      setNotice({ kind: "validation", title: "กรุณาตรวจสอบผลแต่ละข้อ", caseId: selectedRequest.caseId,
        message: error instanceof Error ? error.message : "กรุณาตรวจผลทบทวนแต่ละหัวข้อ" });
      return;
    }
    setSavePreview({
      requestId: selectedRequest.requestId, caseId: selectedRequest.caseId, agent: selectedRequest.agent,
      isEdit: Boolean(isReviewed && !selectedRequest.additionalRound), previousReviewId: selectedRequest.reviewId || "",
      previousReviewedAt: selectedRequest.reviewedAt,
      reviewId: crypto.randomUUID(), reviewVersion: (selectedRequest.reviewVersion || 0) + 1,
      beforeScore: isReviewed ? appealFinalScoreFromTopics(selectedRequest.topics, selectedRequest.finalScore) : selectedRequest.finalScore,
      reviewSummary: reviewSummary.trim(), review,
      topicRows: review.topics.map(topic => {
        const previous = selectedRequest.topics.find(item => item.code === topic.code);
        return { code: topic.code, label: topic.label || "", decision: topic.decision!,
          beforeScore: previous?.decision === "Approved" ? toNumber(previous.revisedScore, previous.score) : topic.score,
          afterScore: topic.decision === "Approved" ? toNumber(topic.revisedScore, topic.score) : topic.score,
          max: topic.max, feedback: String(topic.decision === "Approved" ? topic.revisedComment : topic.rejectReason) };
      }),
    });
  };

  const confirmReview = async () => {
    if (!allowReview || !savePreview || !selectedRequest || busy || savingRef.current) return;
    const preview = savePreview;
    const review = preview.review;
    const topicsForReview = review.topics.map(topic => ({
      code: topic.code, label: topic.label, score: topic.score, max: topic.max,
      ...(topic.originalScore !== undefined ? { originalScore: topic.originalScore, retainedComment: topic.retainedComment || "" } : {}),
      comment: String(topic.comment || ""), wantsAppeal: true,
      appealReason: String(topic.appealReason || ""), decision: topic.decision,
      evidenceImages: Array.isArray(topic.evidenceImages) ? topic.evidenceImages : [],
      qaEvidenceImages: Array.isArray(topic.qaEvidenceImages) ? topic.qaEvidenceImages : [],
      ...(topic.decision === "Approved"
        ? { revisedScore: topic.revisedScore, revisedComment: topic.revisedComment, rejectReason: "" }
        : { rejectReason: topic.rejectReason }),
    }));
    savingRef.current = true;
    setBusy(true);
    try {
      const latestLogs = await fetchAppealEvents([
        "appeal_request_submitted", "appeal_request_reviewed", "appeal_request_reset",
        "appeal_additional_round_opened", "appeal_additional_round_cancelled", "appeal_additional_round_expired", "appeal_additional_evidence_submitted",
        "appeal_additional_access_requested", "appeal_additional_access_decided",
        "appeal_submission_edit_started", "appeal_submission_draft_saved", "appeal_submission_resubmitted",
      ], { limit: 2000, forceRefresh: true }) as UsageLogEvent[];
      const latest = buildAppealRequests(latestLogs).find(item => item.requestId === preview.requestId);
      if (latestLogs.some(log => log.source_case_unavailable && String(log.details?.requestId || "") === preview.requestId)) {
        setLogs(latestLogs);
        setSavePreview(null);
        setEditingReview(false);
        setNotice({ kind: "validation", title: "เคสต้นทางถูกลบแล้ว", caseId: preview.caseId,
          message: "คำขอนี้ถูกนำออกจากรายการรอพิจารณาและไม่พักคะแนน ไม่สามารถบันทึกผลอุทธรณ์ได้" });
        onTasksChanged?.();
      notifyQaAnalyticsDataChanged();
        return;
      }
      if (!latest || latest.editingDraft || latest.status === "Reset" ||
          ["Request Additional Appeal", "Approved (Access)", "Awaiting Additional Submission"].includes(appealWorkflowStatus(latest)) ||
          latest.submittedAt !== selectedRequest.submittedAt ||
          (latest.additionalRound?.submittedAt || "") !== (selectedRequest.additionalRound?.submittedAt || "") ||
          (selectedRequest.additionalRound?.roundId || "") !== (latest.additionalRound?.roundId || "") ||
          (selectedRequest.additionalRound && !latest.additionalRound?.submitted) ||
          (latest.reviewId !== preview.reviewId &&
            ((latest.reviewId || "") !== preview.previousReviewId || latest.reviewedAt !== preview.previousReviewedAt))) {
        setLogs(latestLogs);
        setSavePreview(null);
        setEditingReview(false);
        setNotice({ kind: "validation", title: "คำขอนี้มีการเปลี่ยนแปลง", caseId: preview.caseId,
          message: "มีการแก้ผลหรือ Reset คำขอนี้ระหว่างที่คุณเปิดอยู่ กรุณาตรวจผลล่าสุดแล้วเปิดแก้ไขอีกครั้งก่อนบันทึก" });
        return;
      }
      const reviewedAt = new Date().toISOString();
      const payload = {
        tab: "appeal-requests",
        case_id: preview.caseId,
        target_agent: preview.agent,
        details: {
          requestId: preview.requestId,
          reviewId: preview.reviewId,
          reviewVersion: preview.reviewVersion,
          previousReviewId: preview.previousReviewId,
          reviewAction: selectedRequest.additionalRound ? "additional_round" : preview.isEdit ? "edited" : "created",
          ...(currentAction?.roundId ? { roundId: currentAction.roundId } : {}),
          actionTopicCodes: currentAction?.topics.map(topic => topic.code) || topicsForReview.map(topic => topic.code),
          decision: review.decision,
          reviewSummary: preview.reviewSummary,
          reviewedAt,
          // Persist reviewer metadata with the review itself. This is the
          // authoritative source used by Dashboard / Case Detail / PDF.
          reviewedBy:
            currentUser?.agentName ||
            currentUser?.displayName ||
            currentUser?.username ||
            "",
          reviewedByUsername: currentUser?.username || "",
          // appeal-reviewer-loading-fix-v64-requests
          topics: topicsForReview,
          submittedBy: selectedRequest.submittedBy,
          submittedByUsername: selectedRequest.submittedByUsername,
          notificationTarget: selectedRequest.submittedByUsername || selectedRequest.submittedBy || selectedRequest.agent,
          notificationTemplate: {
            subject: `${preview.isEdit ? "แก้ไขผลอุทธรณ์" : "ผลอุทธรณ์"} เคส ${preview.caseId}`,
            body: `ผลอุทธรณ์เคส ${preview.caseId}: ${review.decision}. ` +
              topicsForReview.map(topic => `หัวข้อ ${topic.code}: ${topic.decision}`).join(" • "),
          },
        },
      };
      if (latest.reviewId !== preview.reviewId) {
        const reviewSaved = await writeAppealEvent(currentUser, "appeal_request_reviewed", payload);
        if (!reviewSaved) throw new Error("review-save-failed");
        setLogs([{ ...payload, event_type: "appeal_request_reviewed", created_at: reviewedAt },
          ...latestLogs.filter(event => event.details?.reviewId !== preview.reviewId)]);
      } else {
        setLogs(latestLogs);
      }
      setEditingReview(false);
      setSavePreview(null);
      setNotice({ kind: "success", title: preview.isEdit ? "แก้ไขผลอุทธรณ์เรียบร้อย" : "บันทึกผลอุทธรณ์เรียบร้อย",
        caseId: preview.caseId, decision: review.decision, finalScore: review.finalScore,
        message: preview.isEdit ? "คำขอเดิมใช้ผลที่แก้ไขล่าสุดแล้ว ผลก่อนหน้ายังอยู่ในประวัติการพิจารณา" : "บันทึกผลรายข้อแล้ว หากต้องแก้ผล ให้เปิดรายละเอียดคำขอเดิมแล้วกดแก้ไขผลอุทธรณ์" });
      try {
        onTasksChanged?.();
      notifyQaAnalyticsDataChanged();
      } catch (error) { console.warn("Refresh appeal tasks failed", error); }
    } catch (error) {
      const code = String((error as { code?: string })?.code || "");
      setNotice({ kind: "error", title: "บันทึกผลอุทธรณ์ไม่สำเร็จ", caseId: preview.caseId,
        message: code.includes("permission-denied")
          ? "บัญชีนี้ไม่มีสิทธิ์บันทึกผลอุทธรณ์ กรุณาตรวจสิทธิ์กับผู้ดูแลระบบ ผลที่กรอกยังอยู่"
          : "เชื่อมต่อหรือบันทึกข้อมูลไม่สำเร็จ ผลที่กรอกยังอยู่ กรุณาตรวจอินเทอร์เน็ตแล้วลองยืนยันบันทึกอีกครั้ง" });
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  };

  const cancelAdditionalRound = async () => {
    if (!allowReview || !selectedRequest?.additionalRound || busy) return;
    const target = selectedRequest;
    const round = target.additionalRound;
    const reason = window.prompt(
      `ยกเลิกรอบอุทธรณ์เพิ่มเติมของเคส ${target.caseId} เท่านั้น (ไม่ Reset ผลรอบเดิม)\nระบุเหตุผล:`,
      "ยกเลิกรอบทดสอบระบบ"
    );
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setMessage("กรุณาระบุเหตุผลที่ยกเลิก");
      return;
    }
    if (!window.confirm(
      `ยืนยันยกเลิกรอบเพิ่มเติมของเคส ${target.caseId}?\nผล Approved / Rejected เดิม คะแนน และประวัติจะคงอยู่`
    )) return;

    setBusy(true);
    try {
      const latestLogs = await fetchAppealEvents([
        "appeal_request_submitted", "appeal_request_reviewed", "appeal_request_reset",
        "appeal_additional_round_opened", "appeal_additional_round_cancelled",
        "appeal_additional_evidence_submitted",
      ], { limit: 2000, forceRefresh: true }) as UsageLogEvent[];
      const current = buildAppealRequests(latestLogs).find(item => item.requestId === target.requestId);
      if (!current?.additionalRound || current.additionalRound.roundId !== round.roundId ||
          current.reviewId !== target.reviewId) {
        setLogs(latestLogs);
        setMessage("รอบอุทธรณ์มีการเปลี่ยนแปลง กรุณาตรวจสอบข้อมูลล่าสุดก่อนยกเลิก");
        return;
      }
      const saved = await writeAppealEvent(currentUser, "appeal_additional_round_cancelled", {
        tab: "appeal-requests",
        case_id: target.caseId,
        target_agent: target.agent,
        details: {
          requestId: target.requestId,
          roundId: round.roundId,
          caseId: target.caseId,
          cancelledAt: new Date().toISOString(),
          cancelledBy: String(currentUser?.displayName || currentUser?.username || ""),
          reason: trimmedReason,
          previousReviewId: target.reviewId || "",
        },
      });
      if (!saved) throw new Error("QA cannot cancel additional appeal round");
      await loadRequests();
      setMessage(`ยกเลิกเฉพาะรอบเพิ่มเติมของ ${target.caseId} แล้ว ผลพิจารณาและคะแนนเดิมคงอยู่`);
      onTasksChanged?.();
      notifyQaAnalyticsDataChanged();
    } catch (error) {
      console.error("Cancel additional appeal round failed", error);
      setMessage("ยกเลิกรอบเพิ่มเติมไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  const resetRequest = async () => {
    if (!allowReview || !selectedRequest || busy) return;
    const confirmed = window.confirm(`Reset appeal request for ${selectedRequest.caseId}? This will allow the case owner to submit a new appeal request again.`);
    if (!confirmed) return;

    setBusy(true);
    try {
      const resetSaved = await writeAppealEvent(currentUser, "appeal_request_reset", {
        tab: "appeal-requests",
        case_id: selectedRequest.caseId,
        target_agent: selectedRequest.agent,
        details: {
          requestId: selectedRequest.requestId,
          caseId: selectedRequest.caseId,
          resetAt: new Date().toISOString(),
          resetBy: currentUser?.displayName || currentUser?.username || "",
          reason: "Reset by Songpon to allow the case owner to submit again.",
          clearAppealWatermark: true,
        },
      });
      if (!resetSaved) {
        setMessage("Reset request เนเธกเนเธชเธณเน€เธฃเนเธ เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเนเธญเธตเธเธเธฃเธฑเนเธ");
        return;
      }

      setSelectedRequestId("");
      setDetailRequestId("");
      setDraftTopics([]);
      setReviewSummary("");
      setMessage(`Reset ${selectedRequest.caseId}. APPEAL watermark was removed and the case owner can submit again while the appeal window is open.`);
      await loadRequests();
      onTasksChanged?.();
      notifyQaAnalyticsDataChanged();
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = pendingRequests.length;
  const reviewedCount = reviewedRequests.length;
  const resetCount = resetRequests.length;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5 lg:px-6 2xl:px-8">
      <div className="rounded-[32px] border border-violet-100 bg-white shadow-[0_22px_60px_rgba(80,36,140,0.10)]">
        <PageHero
          eyebrow="Appeals"
          title="Appeal Review"
          subtitle="ตรวจคำขออุทธรณ์และบันทึกผลอนุมัติหรือปฏิเสธ"
        />
        {selectedRequest?.topics.some(topic => topic.evidenceImages?.length) ? (
          <section className="border-b border-violet-100 p-5" aria-label="รูปภาพหลักฐานคำขออุทธรณ์">
            <div className="text-sm font-bold text-violet-700">รูปภาพหลักฐาน · {selectedRequest.caseId}</div>
            {selectedRequest.topics.filter(topic => topic.evidenceImages?.length).map(topic => (
              <div key={topic.code} className="mt-3"><div className="text-xs font-semibold">{topic.code} {topic.label}</div><AppealEvidenceGallery images={topic.evidenceImages || []} caseId={selectedRequest.caseId} startIndex={appealEvidenceStartIndex(selectedRequest.topics, topic.code)} /></div>
            ))}
          </section>
        ) : null}


        <div
          className={standaloneRequestId
            ? "grid min-h-[640px] grid-cols-1 gap-0"
            : "grid min-h-[640px] gap-0 xl:grid-cols-[minmax(0,1.42fr)_minmax(520px,0.98fr)]"
          }
          data-appeal-review-layout="appeal-review-layout-v58"
        >
          <div className={standaloneRequestId ? "hidden" : "min-w-0 border-r border-violet-100 p-5"}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">Appeal Cases</div>
                <div className="mt-1 text-sm text-slate-600">เลือกเคสจากตารางเพื่อเปิดรายละเอียดและพิจารณา</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={loadRequests} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50">Refresh</button>
                {allowReview && <button type="button" onClick={() => exportAppealRows(requests)} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800">Export Appeal ROWDATA</button>}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Agent</label>
                <select value={selectedAgentFilter} onChange={(event) => { setSelectedAgentFilter(event.target.value); setSelectedRequestId(""); setDetailRequestId(""); }} className="w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-400">
                  <option value="">All Agents</option>
                  {agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Month</label>
                <select value={selectedMonthFilter} onChange={(event) => { setSelectedMonthFilter(event.target.value); setSelectedRequestId(""); setDetailRequestId(""); }} className="w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-400">
                  <option value="all">All Months</option>
                  {monthOptions.map((month) => <option key={month} value={month}>{formatAppealReviewMonth(month)}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</label>
                <select aria-label="Status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setSelectedRequestId(""); setDetailRequestId(""); }} className="w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-400">
                  <option value="All">ทุกสถานะ</option>
                  {APPEAL_WORKFLOW_STATUSES.map(status => <option key={status} value={status}>{appealWorkflowLabel(status)} ({latestRequestsByCase.filter(item => appealWorkflowStatus(item) === status).length})</option>)}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search Case ID</label>
                <input value={searchCaseId} onChange={(event) => setSearchCaseId(event.target.value)} placeholder="เช่น AA207397" className="w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-400" />
              </div>
            </div>

            <div className="my-4 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-violet-900">
              <span className="font-semibold">{selectedMonthFilter === "all" ? "All Months" : formatAppealReviewMonth(selectedMonthFilter)}</span>
              <span className="text-slate-500"> • {visibleRequests.length} case(s)</span>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
              <div className="max-h-[650px] overflow-y-auto overflow-x-hidden">
                <table className="w-full table-fixed border-collapse text-left">
                  <colgroup>
                    <col className="w-[12%]" />
                    <col className="w-[16%]" />
                    <col className="w-[11%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[18%]" />
                    <col className="w-[6%]" />
                    <col className="w-[4%]" />
                    <col className="w-[5%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Case ID</th>
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Agent</th>
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Case Date</th>
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Updated</th>
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Reviewed</th>
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Status</th>
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Original</th>
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Grade</th>
                      <th className="py-3 pl-3 pr-5 text-center text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Topics</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!visibleRequests.length ? (
                      <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-slate-500">ไม่พบข้อมูลเคส</td></tr>
                    ) : visibleRequests.map((item) => (
                      <tr key={item.requestId} onClick={() => { setSelectedRequestId(item.requestId); setDetailRequestId(""); }} className={"cursor-pointer transition " + (selectedRequest?.requestId === item.requestId ? "bg-sky-50 ring-1 ring-inset ring-sky-400" : "bg-white hover:bg-slate-50")}>
                        <td className="px-2 py-3 text-[11px] font-extrabold text-slate-950">
                          <button
                            type="button"
                            title="Open Appeal Review workspace tab"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenRequestWorkspace?.(item.requestId, item.caseId);
                            }}
                            className="inline-flex max-w-full items-start gap-1 text-left font-extrabold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
                          >
                            <span className="min-w-0 leading-4">
                              {splitAppealReviewCaseIds(item.caseId).map((caseIdPart, index) => (
                                <span key={caseIdPart + index} className="block whitespace-nowrap">{caseIdPart}</span>
                              ))}
                            </span>
                            <span aria-hidden="true" className="mt-0.5 shrink-0 text-[10px]">↗</span>
                          </button>
                        </td>
                        <td title={item.agent || "-"} className="truncate px-2 py-3 text-[11px] font-semibold text-slate-800">{item.agent || "-"}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-[10px] text-slate-600">{item.auditDate || "-"}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-[10px] tabular-nums text-slate-600" style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1' }}>{formatDateTime(appealWorkflowActivityAt(item))}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-[10px] tabular-nums text-slate-600" style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1' }}>{formatDateTime(item.reviewedAt)}</td>
                        <td className="px-2 py-3"><span className={"inline-flex max-w-full rounded-xl border px-2 py-1 text-[9px] font-extrabold leading-4 " + appealWorkflowTone(appealWorkflowStatus(item))}>{appealWorkflowLabel(appealWorkflowStatus(item))}</span></td>
                        <td className="px-2 py-3 text-[10px] font-bold text-slate-800">{item.finalScore.toFixed(2)}</td>
                        <td className="px-2 py-3 text-[10px] font-extrabold text-violet-800">{item.grade || "-"}</td>
                        <td className="py-3 pl-3 pr-5 text-center text-[10px] font-bold text-slate-700">{item.topics.filter(isAppealedTopic).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-500">
                <span>Showing {visibleRequests.length} appeal review case(s)</span>
                <span className="font-semibold text-slate-700">Select a row for Information • Click Case ID to open a workspace tab</span>
              </div>
            </div>
          </div>

          <div className={standaloneRequestId ? "p-5" : "p-5 xl:pt-[210px]"}>
            {!selectedRequest ? (
              <div className="flex h-full min-h-[520px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-violet-50/50 p-8 text-center">
                <div>
                  {unavailableSelectedRequest ? <>
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">เคสต้นทางถูกลบแล้ว</div>
                    <div className="mt-2 text-2xl font-extrabold text-slate-950">{unavailableSelectedRequest.case_id}</div>
                    <div className="mt-2 max-w-md text-sm leading-6 text-slate-600">คำขออุทธรณ์ของเคสนี้ถูกนำออกจากรายการรอพิจารณาและไม่พักคะแนน</div>
                  </> : <>
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">Information</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-950">Select a case from Appeal Cases</div>
                  <div className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                    เลือกแถวเพื่อดูข้อมูลสรุปของเคส หรือคลิก Case ID เพื่อเปิดรายละเอียดอุทธรณ์
                  </div>
                  </>}
                </div>
              </div>
            ) : !isReviewDetailOpen ? (
              <section className="min-h-[520px] min-w-0" data-appeal-review-information="appeal-review-information-plain-v57">
                {/* // appeal-review-information-visual-v61 */}
                {/* // appeal-review-datetime-color-v62 */}
                <div className="border-b border-slate-200 pb-4">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">Information</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-950">{selectedRequest.caseId}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">ข้อมูลคำขออุทธรณ์ของเคสที่เลือก</div>
                </div>

                {selectedRequest ? <AppealWorkflowNotice request={selectedRequest} canReview={allowReview}
                  isOwner={scopeAppealRequests([selectedRequest], { ...currentUser, role: "Admin" }).length > 0}
                  busy={busy} onCaseDetail={() => openCaseDetailTab(selectedRequest)}
                  onDecision={approved => { setAccessDecision(approved ? "approve" : "reject"); setAccessDecisionReason(approved ? selectedRequest.additionalAccessRequest?.decisionReason || "อนุญาตให้ยื่นอุทธรณ์เพิ่มเติม" : ""); }}
                  onReview={() => setDetailRequestId(selectedRequest.requestId)} /> : null}
                <div className="divide-y divide-slate-100">
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Case ID</div><div className="font-extrabold text-purple-700">{selectedRequest.caseId || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Agent</div><div className="font-semibold text-slate-950">{selectedRequest.agent || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Team</div><div className="font-semibold text-slate-800">{selectedAgentTeam.teamName || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Status</div><div className="font-extrabold">{appealWorkflowLabel(selectedWorkflowStatus)}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Case Date</div><div className="font-extrabold tabular-nums text-sky-700">{selectedRequest.auditDate || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Audit Date</div><div className="font-extrabold tabular-nums text-sky-700">{selectedRequest.auditTimestamp || selectedRequest.auditDate || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Submitted By</div><div className="font-semibold text-purple-700">{selectedRequest.submittedByUsername || selectedRequest.submittedBy || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Original Appeal Submit</div><div className="font-extrabold text-purple-700">
                      {(() => {
                        const { datePart, timePart } = appealReviewFixedDateTimeParts(selectedRequest.submittedAt);
                        return (
                          <span className="inline-grid grid-cols-[80px_64px] items-center gap-2 whitespace-nowrap text-left text-[14px] leading-5">
                            <span className="inline-flex">
                              {datePart.split("").map((char, index) => <span key={"submitted-date-" + index} className="inline-block w-[8px] text-center">{char}</span>)}
                            </span>
                            <span className="inline-flex">
                              {timePart.split("").map((char, index) => <span key={"submitted-time-" + index} className="inline-block w-[8px] text-center">{char}</span>)}
                            </span>
                          </span>
                        );
                      })()}
                    </div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Reviewed Date & Time</div><div className={"font-extrabold " + (selectedRequest.status === "Approved" ? "text-emerald-700" : selectedRequest.status === "Rejected" ? "text-rose-700" : selectedRequest.status === "Reset" ? "text-sky-700" : "text-slate-400")}>
                      {(() => {
                        const { datePart, timePart } = appealReviewFixedDateTimeParts(selectedRequest.reviewedAt);
                        return (
                          <span className="inline-grid grid-cols-[80px_64px] items-center gap-2 whitespace-nowrap text-left text-[14px] leading-5">
                            <span className="inline-flex">
                              {datePart.split("").map((char, index) => <span key={"reviewed-date-" + index} className="inline-block w-[8px] text-center">{char}</span>)}
                            </span>
                            <span className="inline-flex">
                              {timePart.split("").map((char, index) => <span key={"reviewed-time-" + index} className="inline-block w-[8px] text-center">{char}</span>)}
                            </span>
                          </span>
                        );
                      })()}
                    </div></div>
                  {selectedRequest.additionalHistory?.length ? (
                    <>
                      <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Additional Round Opened</div><div className="font-semibold text-slate-900">{formatDateTime(selectedRequest.additionalHistory[0].openedAt)}</div></div>
                      <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Additional Appeal Submit</div><div className="font-semibold text-slate-900">{selectedRequest.additionalHistory[0].submittedAt ? formatDateTime(selectedRequest.additionalHistory[0].submittedAt) : "ยังไม่ได้ยื่น"}</div></div>
                      <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Additional Appeal Reviewed</div><div className="font-semibold text-slate-900">{selectedRequest.additionalHistory[0].reviewedAt ? formatDateTime(selectedRequest.additionalHistory[0].reviewedAt) : "-"}</div></div>
                    </>
                  ) : null}
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Intent</div><div className="min-w-0 font-semibold leading-6 text-slate-950">{selectedRequest.inquiry || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Original Score</div><div className="font-extrabold tabular-nums text-slate-600">{selectedRequest.finalScore.toFixed(2)}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Current Score</div><div className={"font-extrabold tabular-nums " + (selectedCurrentScore >= 85 ? "text-emerald-700" : "text-rose-700")}>{selectedCurrentScore.toFixed(2)}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Current Grade</div><div className={"font-extrabold " + (selectedCurrentGrade === "A" ? "text-emerald-700" : selectedCurrentGrade === "B" ? "text-sky-700" : selectedCurrentGrade === "C" ? "text-amber-700" : selectedCurrentGrade === "D" ? "text-orange-700" : selectedCurrentGrade === "F" ? "text-rose-700" : "text-slate-700")}>{selectedCurrentGrade || "-"}</div></div>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <div className="text-sm font-extrabold text-slate-950">Appealed Topics: {selectedAppealedTopics.length} Topics</div>
                  <div className="mt-2 overflow-x-auto pb-2">
                    <div className="min-w-max space-y-1.5">
                      {selectedAppealedTopics.length ? selectedAppealedTopics.map((topic, index) => (
                        <div key={topic.code} className="whitespace-nowrap text-[11px] font-semibold leading-5 text-slate-700 xl:text-xs">
                          {appealReviewTopicLine(topic, index)}
                        </div>
                      )) : (
                        <div className="whitespace-nowrap text-[11px] font-semibold text-slate-500">-</div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <div className="space-y-5">
                {selectedRequest ? <AppealWorkflowNotice request={selectedRequest} canReview={allowReview}
                  isOwner={scopeAppealRequests([selectedRequest], { ...currentUser, role: "Admin" }).length > 0}
                  busy={busy} onCaseDetail={() => openCaseDetailTab(selectedRequest)}
                  onDecision={approved => { setAccessDecision(approved ? "approve" : "reject"); setAccessDecisionReason(approved ? selectedRequest.additionalAccessRequest?.decisionReason || "อนุญาตให้ยื่นอุทธรณ์เพิ่มเติม" : ""); }}
                  onReview={() => setDetailRequestId(selectedRequest.requestId)} /> : null}
                {/* appeal-review-information-action-v55 */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setDetailRequestId("")}
                    className="rounded-xl border border-violet-200 bg-white px-4 py-2 text-xs font-extrabold text-violet-700 hover:bg-violet-100"
                  >
                    ← Back to Information
                  </button>
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Appeal Detail</div>
                    <div className="text-sm font-extrabold text-slate-900">{selectedRequest.caseId}</div>
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Review Case</div>
                      <div className="mt-2 text-2xl font-extrabold text-slate-950">{selectedRequest.caseId}</div>
                      <div className="mt-1 text-sm text-slate-600">{selectedRequest.agent} / Case Date {selectedRequest.auditDate || "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">Audit Date {selectedRequest.auditTimestamp || selectedRequest.auditDate || "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">Submitted by {selectedRequest.submittedBy || "-"} at {formatDateTime(selectedRequest.submittedAt)}</div>
                      <button
                        type="button"
                        onClick={() => openCaseDetailTab(selectedRequest)}
                        className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-black text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
                      >
                        Open Case Detail
                      </button>
                    </div>
                    <div className="rounded-2xl border border-white bg-white px-4 py-3 text-right shadow-sm">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Original Score</div>
                      <div className="mt-1 text-2xl font-extrabold text-slate-950">{selectedRequest.finalScore.toFixed(2)}</div>
                      <div className="text-xs font-bold text-violet-700">Grade {selectedRequest.grade}</div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">{selectedRequest.inquiry || "-"}</div>
                </div>

                <section aria-label="Appeal Actions" className="space-y-4">
                  <div className="text-base font-extrabold text-slate-950">Appeal Actions — ประวัติอุทธรณ์แต่ละรอบ</div>
                  <div aria-label="รอบอุทธรณ์ของเคส" className="flex flex-wrap gap-3 text-xs text-slate-600">
                    {selectedRequest.actionHistory.map(action => <span key={action.actionId}>Action {action.actionNumber} · หัวข้อ {action.topics.map(topic => topic.code).join(", ") || "-"}</span>)}
                  </div>
                  {displayTopics.map(topic => <section key={topic.code} data-appeal-topic={topic.code} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-extrabold text-slate-950">Topic {topic.code} {topic.label}</h3>
                    <div className="mt-3 border-b border-dashed border-slate-200 pb-4 text-sm leading-6 text-slate-700">
                      <div className="mb-1 text-xs font-bold text-slate-500">Original Comment</div>
                      <RichTextContent value={topic.comment} decodeEntities className="break-words" />
                    </div>
                    <AppealActionTimeline actions={selectedRequest.actionHistory} topicCode={topic.code} caseId={selectedRequest.caseId} compact
                      excludeActionId={canReviewTopic(topic.code) ? currentAction?.actionId : undefined} />
                    {canReviewTopic(topic.code) && <section data-appeal-action={currentAction?.actionNumber || 1} aria-label={`พิจารณา Action ${currentAction?.actionNumber || 1} หัวข้อ ${topic.code}`} className="border-t border-dashed border-slate-200 pt-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-extrabold text-violet-800">Appeal Reason · Action {currentAction?.actionNumber || 1}</h4>
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{editingReview ? "กำลังแก้ไขผล QA" : "รอ QA พิจารณา"}</span>
                      </div>
                      <div className="mb-3 text-xs text-slate-600">ผู้ยื่น: {currentAction?.submittedBy || selectedRequest.submittedBy || "-"} · {formatDateTime(currentAction?.submittedAt || selectedRequest.submittedAt)}</div>
                      <RichTextContent value={topic.appealReason} className="whitespace-pre-wrap break-words text-sm leading-6" />
                      <AppealEvidenceGallery images={topic.evidenceImages || []} caseId={selectedRequest.caseId} startIndex={appealEvidenceStartIndex(selectedRequest.topics, topic.code)} />
                      {editingReview && Boolean(currentAction?.reviews.length) && <details className="mt-3 text-xs text-slate-600">
                        <summary className="cursor-pointer font-bold">ผล QA ที่บันทึกไว้ใน Action นี้ ({currentAction?.reviews.length})</summary>
                        <div className="mt-2"><AppealActionReviewHistory reviews={currentAction?.reviews || []} topicCode={topic.code} caseId={selectedRequest.caseId} /></div>
                      </details>}
                      <div className="mt-4 border-t border-dashed border-slate-200 pt-4">
                        <div className="mb-3 text-xs font-semibold text-violet-800">QA: {currentUser?.agentName || currentUser?.displayName || currentUser?.username || "-"} · {editingReview ? "แก้ไขผล" : "กำลังพิจารณา"} Action {currentAction?.actionNumber || 1}</div>
                        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label={`ผลพิจารณาหัวข้อ ${topic.code}`}>
                          {(["Approved", "Rejected"] as const).map(value => (
                            <button key={value} type="button" aria-pressed={topic.decision === value}
                              disabled={busy || !canReview}
                              onClick={() => setDraftTopics(current => current.map(item => item.code === topic.code ? {
                                ...item, decision: value,
                                ...(value === "Approved" ? { revisedScore: item.revisedScore ?? item.score } : {}),
                              } : item))}
                              className={`rounded-xl border px-4 py-2 text-sm font-bold transition disabled:opacity-60 ${topic.decision === value
                                ? value === "Approved" ? "border-emerald-600 bg-emerald-600 text-white" : "border-rose-600 bg-rose-600 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-violet-300"}`}>
                              {value === "Approved" ? "✓ Approved" : "× Reject"}
                            </button>
                          ))}
                          {!topic.decision && <span className="text-xs font-semibold text-amber-700">รอเลือกผลพิจารณา</span>}
                        </div>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-xs font-semibold text-slate-500">คะแนนก่อนรอบนี้ {topic.score}/{topic.max}</div>
                          </div>
                          {topic.decision === "Approved" ? (
                            <label className="w-44 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">
                              Revised Score
                              <select
                                value={topic.revisedScore ?? topic.score}
                                disabled={busy || !canReview}
                                onChange={(event) => {
                                  const value = Number(event.target.value);
                                  setDraftTopics((current) => current.map((item) => item.code === topic.code ? { ...item, revisedScore: value } : item));
                                }}
                                className="mt-1 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
                              >
                                {scoreOptions(topic.max).map((score) => (
                                  <option key={score} value={score}>
                                    {score} / {topic.max}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <div className="min-w-[176px] text-right">
                              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Score After Review</div>
                              <div className="mt-1 text-lg font-extrabold text-slate-950">{topic.score} / {topic.max}</div>
                              <div className="mt-1 text-[11px] font-bold text-slate-500">🔒 คงคะแนนก่อนรอบนี้</div>
                            </div>
                          )}
                        </div>
                        {topic.decision === "Approved" ? (
                          <div className="mt-4">
                            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700" htmlFor={`revised-comment-${topic.code}`}>
                              Revised Comment
                            </label>
                            <textarea
                              id={`revised-comment-${topic.code}`}
                              onPaste={(event) => {
                                requestAnimationFrame(() => {
                                  const target = event.currentTarget;
                                  target.style.height = "auto";
                                  target.style.height = `${target.scrollHeight}px`;
                                });
                              }}
                              onInput={(event) => {
                                const target = event.currentTarget;
                                target.style.height = "auto";
                                target.style.height = `${target.scrollHeight}px`;
                              }}
                              rows={3}
                              data-auto-resize-review="true"
                              value={topic.revisedComment || ""}
                              disabled={busy || !canReview}
                              onChange={(event) => {
                                const value = event.target.value;
                                setDraftTopics((current) => current.map((item) => item.code === topic.code ? { ...item, revisedComment: value } : item));
                              }}
                              className="mt-2 min-h-[92px] w-full resize-none overflow-hidden rounded-xl border border-violet-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
                              placeholder="ระบุ Comment หลังแก้ไขผลประเมิน"
                            />
                            <AppealEvidencePicker
                              caseId={selectedRequest.caseId}
                              topicCode={`qa-review-${topic.code}`}
                              images={topic.qaEvidenceImages || []}
                              totalCount={draftTopics.reduce((count, row) => count + (row.qaEvidenceImages?.length || 0), 0)}
                              startIndex={selectedRequest.topics.reduce((count, row) => count + (row.evidenceImages?.length || 0), 0) + appealEvidenceStartIndex(draftTopics.map(row => ({ code: row.code, evidenceImages: row.qaEvidenceImages || [] })), topic.code)}
                              disabled={busy || !canReview || qaImageUploads > 0}
                              onBusyChange={uploading => setQaImageUploads(count => Math.max(0, count + (uploading ? 1 : -1)))}
                              onAdd={image => setDraftTopics(items => items.map(item => item.code === topic.code ? { ...item, qaEvidenceImages: [...(item.qaEvidenceImages || []), image] } : item))}
                              onRemove={id => setDraftTopics(items => items.map(item => item.code === topic.code ? { ...item, qaEvidenceImages: (item.qaEvidenceImages || []).filter(image => image.id !== id) } : item))}
                            />
                            <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-5 text-emerald-800">
                              Approve ใช้คะแนนและความเห็นที่ปรับในรอบนี้
                            </div>
                          </div>
                        ) : topic.decision === "Rejected" ? (
                          <div className="mt-4">
                            <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-700" htmlFor={`reject-reason-${topic.code}`}>
                              Reject Reason <span className="text-rose-600">*</span>
                            </label>
                            <textarea
                              id={`reject-reason-${topic.code}`}
                              onPaste={(event) => {
                                requestAnimationFrame(() => {
                                  const target = event.currentTarget;
                                  target.style.height = "auto";
                                  target.style.height = `${target.scrollHeight}px`;
                                });
                              }}
                              onInput={(event) => {
                                const target = event.currentTarget;
                                target.style.height = "auto";
                                target.style.height = `${target.scrollHeight}px`;
                              }}
                              rows={3}
                              data-auto-resize-review="true"
                              value={topic.rejectReason || ""}
                              disabled={busy || !canReview}
                              onChange={(event) => {
                                const value = event.target.value;
                                setDraftTopics((current) => current.map((item) => item.code === topic.code ? { ...item, rejectReason: value } : item));
                              }}
                              className="mt-2 min-h-[92px] w-full resize-none overflow-hidden rounded-xl border border-rose-200 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100 disabled:bg-slate-100"
                              placeholder="ระบุเหตุผลที่ยืนยันผลประเมินและคะแนนเดิม"
                            />
                            <AppealEvidencePicker
                              caseId={selectedRequest.caseId}
                              topicCode={`qa-review-${topic.code}`}
                              images={topic.qaEvidenceImages || []}
                              totalCount={draftTopics.reduce((count, row) => count + (row.qaEvidenceImages?.length || 0), 0)}
                              startIndex={selectedRequest.topics.reduce((count, row) => count + (row.evidenceImages?.length || 0), 0) + appealEvidenceStartIndex(draftTopics.map(row => ({ code: row.code, evidenceImages: row.qaEvidenceImages || [] })), topic.code)}
                              disabled={busy || !canReview || qaImageUploads > 0}
                              onBusyChange={uploading => setQaImageUploads(count => Math.max(0, count + (uploading ? 1 : -1)))}
                              onAdd={image => setDraftTopics(items => items.map(item => item.code === topic.code ? { ...item, qaEvidenceImages: [...(item.qaEvidenceImages || []), image] } : item))}
                              onRemove={id => setDraftTopics(items => items.map(item => item.code === topic.code ? { ...item, qaEvidenceImages: (item.qaEvidenceImages || []).filter(image => image.id !== id) } : item))}
                            />
                            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-5 text-rose-800">
                              Reject คงคะแนนก่อนเริ่มรอบนี้ และบันทึกเหตุผลแยกจากผลรอบก่อน
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </section>}
                  </section>)}
                </section>

                {canDiscuss ? <section aria-label="QA and Senior internal appeal discussion" className="rounded-3xl border border-sky-200 bg-sky-50/70 p-5">
                  <div className="text-sm font-extrabold text-sky-900">QA ↔ Senior — คำถามและหลักฐานภายใน</div>
                  <p className="mt-1 text-xs leading-6 text-sky-700">
                    ข้อมูลนี้เก็บเฉพาะหน้า Appeal Review และไม่แสดงใน Case Detail หรือ PDF รายงาน
                  </p>
                  <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">
                    {discussionEvents.map((log) => {
                      const details = log.details || {};
                      const photos = Array.isArray(details.evidenceImages)
                        ? details.evidenceImages as AppealEvidenceImage[] : [];
                      return (
                        <div key={String(details.messageId || log.id || log.created_at)} className="rounded-2xl border border-sky-100 bg-white p-4">
                          <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold text-slate-600">
                            <span>{String(details.senderName || log.agent_name || log.display_name || log.username || "-")} · {String(details.senderRole || log.role || "-")}</span>
                            <span>{formatDateTime(String(details.sentAt || log.created_at || ""))}</span>
                          </div>
                          {details.topicCode ? <div className="mt-1 text-xs font-bold text-sky-700">Topic {String(details.topicCode)}</div> : null}
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{String(details.message || "")}</p>
                          {photos.length ? <AppealEvidenceGallery images={photos} caseId={selectedRequest.caseId} /> : null}
                        </div>
                      );
                    })}
                    {!discussionEvents.length ? <p className="rounded-xl bg-white p-4 text-sm text-slate-500">ยังไม่มีข้อความหรือรูปภาพที่ส่งระหว่าง QA กับ Senior</p> : null}
                  </div>
                  {(allowReview || ["Senior", "Supervisor"].includes(String(currentUser?.role || ""))) ? (
                    <div className="mt-4 space-y-3 border-t border-sky-200 pt-4">
                      {!canSendDiscussion ? (
                        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-600">
                          เคสนี้พิจารณาเสร็จแล้ว จึงปิดการเลือก Senior / Supervisor และการส่งข้อความใหม่
                          หากต้องตรวจสอบเพิ่มเติม QA สามารถเปิดรอบอุทธรณ์เพิ่มเติมได้
                        </div>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-bold text-sky-800">
                          หัวข้อที่ต้องการสอบถาม
                          <select
                            value={discussionTopic}
                            disabled={discussionBusy || !canSendDiscussion}
                            onChange={event => setDiscussionTopic(event.target.value)}
                            className="mt-1 block w-full rounded-xl border border-sky-200 bg-white p-2 text-sm text-slate-800"
                          >
                            <option value="">ทั้งเคส</option>
                            {selectedRequest.topics.map(topic => <option key={topic.code} value={topic.code}>{topic.code} {topic.label}</option>)}
                          </select>
                        </label>
                        {allowReview && (
                          <label className="text-xs font-bold text-sky-800">
                            ส่งถึง Senior / Supervisor
                            <select
                              value={discussionRecipient}
                              disabled={discussionBusy || !canSendDiscussion}
                              onChange={event => setDiscussionRecipient(event.target.value)}
                              className="mt-1 block w-full rounded-xl border border-sky-200 bg-white p-2 text-sm text-slate-800"
                            >
                              <option value="">เลือก Senior / Supervisor</option>
                              {eligibleSeniorOptions.map(senior => <option key={senior.username} value={senior.username}>{senior.displayName} ({senior.role || "Senior"})</option>)}
                            </select>
                            {!eligibleSeniorOptions.length ? <span className="mt-1 block text-xs text-rose-700">ไม่พบ User Role Senior หรือ Supervisor ใน User Directory</span> : null}
                          </label>
                        )}
                      </div>
                      <label className="block text-xs font-bold text-sky-800">
                        ข้อความ / คำถาม / คำตอบ
                        <textarea
                          rows={3}
                          value={discussionText}
                          disabled={discussionBusy || !canSendDiscussion}
                          onChange={event => setDiscussionText(event.target.value)}
                          placeholder="พิมพ์คำถามหรือคำตอบสำหรับ QA และ Senior เท่านั้น"
                          className="mt-1 block w-full resize-y rounded-xl border border-sky-200 bg-white p-3 text-sm leading-6 text-slate-800"
                        />
                      </label>
                      <AppealEvidencePicker
                        caseId={selectedRequest.caseId}
                        topicCode={`internal-${discussionTopic || "all"}`}
                        images={discussionImages}
                        totalCount={discussionImages.length}
                        disabled={discussionBusy || discussionUploads > 0 || !canSendDiscussion}
                        onBusyChange={uploading => setDiscussionUploads(count => Math.max(0, count + (uploading ? 1 : -1)))}
                        onAdd={image => setDiscussionImages(current => [...current, image])}
                        onRemove={id => setDiscussionImages(current => current.filter(image => image.id !== id))}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span role="status" className="text-xs font-semibold text-sky-800">{discussionMessage}</span>
                        <button type="button"
                          disabled={discussionBusy || discussionUploads > 0 || !canSendDiscussion || (!discussionText.trim() && !discussionImages.length)}
                          onClick={() => void sendDiscussion()}
                          className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >{discussionBusy ? "กำลังส่ง..." : "ส่งข้อความและหลักฐาน"}</button>
                      </div>
                    </div>
                  ) : null}
                </section> : null}

                <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5">
                  <div className="text-sm font-bold text-violet-700">สรุปผลรายหัวข้อ: {decision === "Pending" ? "ยังพิจารณาไม่ครบ" : decision}</div>
                  <div className="mt-2 text-sm text-slate-700">
                    Approved {draftTopics.filter(topic => topic.decision === "Approved").length} •
                    Reject {draftTopics.filter(topic => topic.decision === "Rejected").length} •
                    คะแนนหลังทบทวน {appealFinalScoreFromTopics(draftTopics, selectedRequest.finalScore).toFixed(2)} •
                    KPI {appealFinalScoreFromTopics(draftTopics, selectedRequest.finalScore) >= 85 ? "Passed" : "Not Passed"}
                  </div>
                  <div className="mt-4">
                    <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700" htmlFor="appeal-review-summary">
                      Review Summary <span className="text-rose-600">*</span>
                    </label>
                    <textarea
                      id="appeal-review-summary"
                      onPaste={(event) => {
                        requestAnimationFrame(() => {
                          const target = event.currentTarget;
                          target.style.height = "auto";
                          target.style.height = `${target.scrollHeight}px`;
                        });
                      }}
                      onInput={(event) => {
                        const target = event.currentTarget;
                        target.style.height = "auto";
                        target.style.height = `${target.scrollHeight}px`;
                      }}
                      rows={3}
                      data-auto-resize-review="true"
                      value={reviewSummary}
                      disabled={busy || !canReview}
                      onChange={(event) => setReviewSummary(event.target.value)}
                      className="mt-2 min-h-[88px] w-full resize-none overflow-hidden rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
                      placeholder="Appeal review summary"
                    />
                  </div>
                  {selectedRequest.lastAdditionalStatus === "Expired (Additional)" ? (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                      Expired (Additional) — ครบ 72 ชั่วโมงโดยไม่มีการยื่นเพิ่ม คะแนนและผลรอบก่อนยังคงเดิม
                    </div>
                  ) : selectedRequest.lastAdditionalStatus === "Cancelled (Additional)" ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">
                      Cancelled (Additional) — ยกเลิกเฉพาะรอบเพิ่มเติม ผลรอบก่อนยังคงเดิม
                    </div>
                  ) : null}
                  {selectedRequest.additionalRound ? (
                    <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                      <div className="text-sm font-extrabold text-sky-900">Appeal เพิ่มเติม — รอบที่ {selectedRequest.reviewHistory.length + 1}</div>
                      <div className="mt-1 text-xs text-sky-800">
                        เปิดโดย {selectedRequest.additionalRound.openedBy || "QA"} · {formatDateTime(selectedRequest.additionalRound.openedAt)}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-sky-950">{selectedRequest.additionalRound.note}</div>
                      <div className="mt-2 text-xs font-bold text-sky-900">
                        Topic {selectedRequest.additionalRound.topics.map(topic => topic.code).join(", ")}
                        {!selectedRequest.additionalRound.submitted ? (
                          <div className="mt-1 text-xs font-semibold text-sky-700">
                            หมดเขตยื่นเพิ่มเติม: {formatDateTime(selectedRequest.additionalRound.expiresAt)} (72 ชั่วโมงหลังเปิดสิทธิ์)
                          </div>
                        ) : null}
                      </div>
                      {allowReview ? (
                        <button type="button" disabled={busy}
                          onClick={() => void cancelAdditionalRound()}
                          className="mt-3 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
                          ยกเลิกรอบอุทธรณ์เพิ่มเติม
                        </button>
                      ) : null}
                      <div className="mt-3 rounded-xl bg-white p-3 text-sm font-semibold text-sky-800">
                        {selectedRequest.additionalRound.submitted
                          ? "ได้รับเหตุผลและหลักฐานเพิ่มเติมแล้ว QA สามารถพิจารณารอบนี้ได้"
                          : "รอ Agent ส่งข้อมูลเพิ่มเติมจากหน้า Case Detail คะแนนเดิมยังไม่เปลี่ยน"}
                      </div>
                    </div>
                  ) : null}
                  {allowReview && isReviewed && !selectedRequest.additionalRound && !isPermissionTask ? (
                    <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
                      {!additionalOpen ? (
                        <button type="button" disabled={busy} onClick={() => setAdditionalOpen(true)}
                          className="rounded-xl border border-violet-300 bg-white px-4 py-2 text-sm font-bold text-violet-800 hover:bg-violet-100 disabled:opacity-50">
                          + เปิดรอบอุทธรณ์เพิ่มเติม
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div className="text-sm font-extrabold text-violet-900">เปิดรอบอุทธรณ์ใหม่ — เฉพาะ QA</div>
                          <div className="text-xs leading-5 text-violet-800">
                            เลือกได้ทั้งหัวข้อเดิมหรือหัวข้อที่ยังไม่เคยยื่น โดยผลรอบก่อนและคะแนนที่อนุมัติไว้จะไม่เปลี่ยนจนกว่าจะพิจารณารอบใหม่
                          </div>
                          <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-violet-200 bg-white p-3">
                            {availableAppealTopics.map(topic => (
                              <label key={topic.code} className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                                <input type="checkbox" className="mt-1 accent-violet-700"
                                  disabled={busy}
                                  checked={additionalCodes.includes(topic.code)}
                                  onChange={event => setAdditionalCodes(current =>
                                    event.target.checked ? [...current, topic.code] : current.filter(code => code !== topic.code))} />
                                <span>
                                  <span className="font-bold">{topic.code} {topic.label}</span>
                                  <span className="ml-2 text-xs text-slate-500">
                                    {selectedRequest.topics.some(row => row.code === topic.code) ? "เคยอุทธรณ์แล้ว" : "ยังไม่เคยอุทธรณ์"}
                                  </span>
                                </span>
                              </label>
                            ))}
                            {!availableAppealTopics.length ? <p className="text-sm text-rose-700">ไม่พบรายการ Topic จากเคสต้นทาง</p> : null}
                          </div>
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-violet-800" htmlFor="additional-appeal-reason">
                              เหตุผลที่ QA อนุญาตให้เปิดรอบเพิ่มเติม <span className="text-rose-600">*</span>
                            </label>
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                id="additional-appeal-reason"
                                value={additionalReason}
                                disabled={busy || reasonSaving}
                                onChange={event => { setAdditionalReason(event.target.value); setReasonNotice(""); }}
                                className="min-w-[220px] flex-1 rounded-xl border border-violet-200 bg-white p-3 text-sm text-slate-800 disabled:bg-slate-100"
                              >
                                <option value="">เลือกเหตุผลเปิดรอบเพิ่มเติม</option>
                                {additionalReasonOptions.map(reason => (
                                  <option key={reason} value={reason}>{reason}</option>
                                ))}
                              </select>
                              <button type="button" disabled={busy || reasonSaving}
                                onClick={() => { setAddingReason(open => !open); setReasonNotice(""); }}
                                className="rounded-xl border border-violet-300 bg-white px-3 py-3 text-xs font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                                {addingReason ? "ปิด" : "+ เพิ่มเหตุผล"}
                              </button>
                            </div>
                            {addingReason ? (
                              <div className="rounded-xl border border-violet-200 bg-white p-3">
                                <label htmlFor="new-additional-appeal-reason" className="block text-xs font-bold text-violet-800">
                                  เพิ่มเหตุผลใหม่ให้ใช้ได้ในครั้งต่อไป
                                </label>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <input id="new-additional-appeal-reason" type="text"
                                    maxLength={180} value={newReason}
                                    disabled={busy || reasonSaving}
                                    onChange={event => setNewReason(event.target.value)}
                                    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void saveAdditionalAppealReason(); } }}
                                    placeholder="ระบุเหตุผลใหม่"
                                    className="min-w-[220px] flex-1 rounded-lg border border-violet-200 px-3 py-2 text-sm" />
                                  <button type="button"
                                    disabled={busy || reasonSaving || !newReason.trim()}
                                    onClick={() => void saveAdditionalAppealReason()}
                                    className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                                    {reasonSaving ? "กำลังบันทึก..." : "บันทึกเหตุผล"}
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            {reasonNotice ? <div role="status" className="text-xs font-semibold text-violet-700">{reasonNotice}</div> : null}
                            <label className="block text-xs font-bold text-violet-800">
                              รายละเอียดเพิ่มเติม (ถ้ามี)
                              <textarea rows={2} value={additionalNote} disabled={busy || reasonSaving}
                                onChange={event => setAdditionalNote(event.target.value)}
                                className="mt-1 block w-full rounded-xl border border-violet-200 bg-white p-3 text-sm"
                                placeholder="ระบุข้อมูลประกอบ เช่น หมายเลข Call Log หรือเหตุผลเฉพาะเคส" />
                            </label>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" disabled={busy} onClick={() => {
                              setAdditionalOpen(false); setAdditionalCodes([]); setAdditionalNote("");
                              setAdditionalReason(""); setAddingReason(false); setNewReason(""); setReasonNotice("");
                            }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold">ยกเลิก</button>
                            <button type="button" disabled={busy || reasonSaving || !additionalCodes.length || !additionalReason}
                              onClick={() => void openAdditionalAppealRound()}
                              className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
                              ยืนยันเปิดรอบเพิ่มเติม
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                  {selectedRequest.additionalHistory?.length ? (
                    <details className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                      <summary className="cursor-pointer text-xs font-bold text-slate-700">ประวัติรอบอุทธรณ์เพิ่มเติม ({selectedRequest.additionalHistory.length})</summary>
                      <div className="mt-2 space-y-2">
                        {selectedRequest.additionalHistory.map(item => (
                          <div key={item.roundId} className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-6">
                            <div>เปิดสิทธิ์: {formatDateTime(item.openedAt)}</div>
                            <div>ยื่นเพิ่มเติม: {item.submittedAt ? formatDateTime(item.submittedAt) : "ยังไม่ยื่น"}</div>
                            <div>พิจารณาเพิ่มเติม: {item.reviewedAt ? formatDateTime(item.reviewedAt) : "-"}</div>
                            <div className="font-semibold">{item.closedStatus}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {selectedRequest.cancelledAdditionalRounds?.length ? (
                    <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <summary className="cursor-pointer text-xs font-bold text-slate-700">
                        ประวัติยกเลิกรอบอุทธรณ์เพิ่มเติม ({selectedRequest.cancelledAdditionalRounds.length})
                      </summary>
                      <div className="mt-3 space-y-2">
                        {selectedRequest.cancelledAdditionalRounds.map(item => (
                          <div key={item.roundId} className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-6">
                            <div>ยกเลิกโดย {item.cancelledBy || "QA"} · {formatDateTime(item.cancelledAt)}</div>
                            <div className="whitespace-pre-wrap font-semibold">{item.reason || "-"}</div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {selectedRequest.reviewHistory.length > 0 && (
                    <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                      <summary className="cursor-pointer text-sm font-bold text-violet-700">ประวัติการพิจารณา ({selectedRequest.reviewHistory.length} ครั้ง)</summary>
                      <div className="mt-3 space-y-3">{selectedRequest.reviewHistory.map((item, index) => (
                        <div key={`${item.reviewId}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                          <div className="font-bold text-slate-800">ครั้งที่ {selectedRequest.reviewHistory.length - index}{index === 0 ? " · ผลล่าสุด" : ""} · {item.decision}</div>
                          <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.reviewedAt)} · {item.reviewedBy || "-"}</div>
                          <div className="mt-2 font-semibold">คะแนนรวม {appealFinalScoreFromTopics(item.topics, selectedRequest.finalScore).toFixed(2)} / 100</div>
                          {item.topics.map(topic => <div key={topic.code} className="mt-2 text-xs leading-6"><span className="font-bold">{topic.code} {topic.label} · {topic.decision === "Rejected" ? "Reject" : "Approved"}</span><div className="whitespace-pre-wrap break-words">{topic.decision === "Rejected" ? topic.rejectReason || topic.revisedComment || "-" : topic.revisedComment || "-"}</div></div>)}
                          <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-6">Review Summary: {item.reviewSummary || "-"}</p>
                        </div>
                      ))}</div>
                    </details>
                  )}
                  {draftTopics.some(topic => (topic.qaEvidenceImages?.length || 0) > 0) ? (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                      รูปของ QA จะบันทึกพร้อม Revised Comment / Reject Reason และแสดงใน Case Detail และ PDF หลังบันทึกผล
                    </div>
                  ) : null}
                  {editingReview && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">กำลังแก้ไขผลอุทธรณ์เดิม กรุณากด Save Review เพื่อบันทึกผลใหม่</p>}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-violet-700">{message}</div>
                    <div className="flex flex-wrap gap-2">
                      {allowReview && isReviewed && !selectedRequest.additionalRound && !isPermissionTask && !editingReview && <button type="button" disabled={busy} onClick={() => setEditingReview(true)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50">แก้ไขผลอุทธรณ์</button>}
                      {editingReview && <button type="button" disabled={busy} onClick={cancelReviewEdit} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิกการแก้ไข</button>}
                      {allowReview && <button
                        type="button"
                        disabled={busy || selectedRequest.status === "Reset"}
                        onClick={resetRequest}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Reset This Task
                      </button>}
                      {allowReview && <button
                        type="button"
                        disabled={busy || !canReview || qaImageUploads > 0}
                        onClick={submitReview}
                        className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {busy ? "Saving..." : "Save Review"}
                      </button>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {accessDecision && selectedRequest ? (
        <div role="dialog" aria-modal="true" aria-labelledby="appeal-access-decision-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h2 id="appeal-access-decision-title" className="text-lg font-extrabold text-violet-900">{accessDecision === "approve" ? "อนุญาตให้ยื่นอุทธรณ์เพิ่มเติม" : "ไม่อนุญาตให้ยื่นอุทธรณ์เพิ่มเติม"}</h2>
            <p className="mt-2 text-sm text-slate-600">เคส {selectedRequest.caseId} · หัวข้อ {selectedRequest.additionalAccessRequest?.topics.join(", ")}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{accessDecision === "approve" ? "เปิดให้เจ้าของเคสยื่นเหตุผลและหลักฐานภายใน 3 วันหลังอนุมัติ เมื่อยื่นแล้วจึงเข้าคิว QA พิจารณาผล" : "บันทึกเหตุผลเพื่อให้เจ้าของเคสตรวจสอบได้"}</p>
            <label htmlFor="appeal-access-decision-reason" className="mt-4 block text-sm font-bold">เหตุผล</label>
            <textarea id="appeal-access-decision-reason" autoFocus disabled={busy} value={accessDecisionReason} onChange={event => setAccessDecisionReason(event.target.value)} className="mt-2 min-h-[100px] w-full rounded-xl border border-violet-200 p-3 text-sm" />
            {message ? <p role="alert" className="mt-2 text-sm text-rose-700">{message}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setAccessDecision(null)} className="rounded-xl border px-4 py-2 text-sm font-bold">กลับ</button>
              <button type="button" disabled={busy || !accessDecisionReason.trim()} onClick={() => void decideAdditionalAccess(accessDecision === "approve")} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "กำลังบันทึก..." : "ยืนยันบันทึกสิทธิ์"}</button>
            </div>
          </div>
        </div>
      ) : null}
      <AppealReviewDialog preview={savePreview} notice={notice} busy={busy} onConfirm={() => void confirmReview()}
        onBack={() => setSavePreview(null)} onDismiss={() => setNotice(null)} />
    </div>
  );
}
