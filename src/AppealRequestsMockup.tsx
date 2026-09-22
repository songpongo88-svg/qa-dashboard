import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { type UsageLogEvent } from "./usageLog";
import { fetchAppealEvents, writeAppealEvent } from "./appealStore";
import PageHero from "./PageHero";
import { resolveCaseAgentTeam, type CaseAgentDirectoryEntry } from "./lib/caseAgentTeam";
import { scoreToGrade } from "./lib/scoreIncentivePolicy"; // appeal-review-information-newtab-v56

type AppealTopic = {
  code: string;
  label: string;
  score: number;
  max: number;
  comment?: string;
  wantsAppeal?: boolean;
  appealReason: string;
  revisedScore?: number | string;
  revisedComment?: string;
  rejectReason?: string;
};

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
  status: "Pending" | "Approved" | "Rejected" | "Reset";
  reviewSummary?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByUsername?: string;
  submittedByUsername?: string;
  // appeal-pdf-review-detail-v43-requests
  topics: AppealTopic[];
};

type AppealListTab = "all" | "pending" | "approved" | "rejected" | "reset";

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
  return topics.reduce((sum, topic) => {
    const revisedScore = toNumber(topic.revisedScore, Number.NaN);
    if (Number.isNaN(revisedScore)) return sum;
    return sum + (revisedScore - toNumber(topic.score));
  }, originalFinalScore);
}

function appealGradeFromScore(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
function scoreOptions(max: number) {
  const safeMax = Math.max(0, Math.floor(Number(max) || 0));
  return Array.from({ length: safeMax + 1 }, (_, index) => index);
}

export function buildAppealRequests(logs: UsageLogEvent[]) {
  const reviews = new Map<string, UsageLogEvent>();
  const resets = new Map<string, UsageLogEvent>();
  logs.forEach((log) => {
    const requestId = getRequestId(log);
    if (log.event_type === "appeal_request_reviewed" && requestId && !reviews.has(requestId)) {
      reviews.set(requestId, log);
    }
    if (log.event_type === "appeal_request_reset" && requestId && !resets.has(requestId)) {
      resets.set(requestId, log);
    }
  });

  return logs
    .filter((log) => log.event_type === "appeal_request_submitted")
    .map((log): AppealRequest => {
      const requestId = getRequestId(log);
      const review = reviews.get(requestId);
      const reset = resets.get(requestId);
      const reviewTopics = Array.isArray(review?.details?.topics) ? (review?.details?.topics as AppealTopic[]) : null;
      const baseTopics = Array.isArray(log.details?.topics) ? (log.details?.topics as AppealTopic[]) : [];
      const reviewDecision = String(review?.details?.decision || "");
      const appealedTopics = (reviewTopics || baseTopics)
        .filter(isAppealedTopic)
        .map((topic) => {
          if (reviewDecision !== "Rejected") return topic;
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
        : review?.details?.decision === "Rejected"
          ? "Rejected"
          : review
            ? "Approved"
            : "Pending";

      return {
        requestId,
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
        submittedByUsername: String(log.details?.submittedByUsername || ""),
        topics: appealedTopics,
      };
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
  const reviewed = requests.filter((item) => item.status === "Approved" || item.status === "Rejected");
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
    const approvedFinalScore = item.status === "Approved" ? appealFinalScoreFromTopics(appealTopics, item.finalScore) : item.finalScore;
    const row: Record<string, unknown> = {
      "Case ID": item.caseId,
      "Agent Name": item.agent,
      "Audit Date": item.auditDate,
      "Week Label": item.weekLabel,
      "Final Score": approvedFinalScore,
      Grade: item.status === "Approved" ? appealGradeFromScore(approvedFinalScore) : item.grade,
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
      row[`${code} Score`] = topic?.score ?? "";
      row[`${code} Revised Score`] = item.status === "Approved" ? topic?.revisedScore ?? topic?.score ?? "" : "";
      row[`${code} Comment`] = topic?.comment ?? "";
      row[`${code} Revised Comment`] = item.status === "Approved" ? topic?.revisedComment ?? "" : "";
      row[`${code} Reject Reason`] = item.status === "Rejected" ? topic?.rejectReason ?? "" : "";
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
    submittedAt: sourceValue(sourceCase.appealSubmittedAt, request.submittedAt),
    reviewedAt: sourceValue(sourceCase.appealReviewedAt, request.reviewedAt),
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

function appealReviewStatusTone(status: AppealRequest["status"]) {
  if (status === "Pending") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "Approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Reset") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

// appeal-review-table-v54

function openCaseDetailTab(request: AppealRequest) {
  const params = new URLSearchParams({
    tab: "dashboard",
    subTab: "case-detail",
    caseId: request.caseId,
  });
  if (request.agent) params.set("agent", request.agent);
  window.open(`${window.location.origin}${window.location.pathname}?${params.toString()}`, "_blank", "noopener,noreferrer");
}

function openAppealReviewTab(request: AppealRequest) {
  const params = new URLSearchParams({ tab: "appeal-requests", requestId: request.requestId });
  window.open(`${window.location.origin}${window.location.pathname}?${params.toString()}`, "_blank", "noopener,noreferrer");
}

export default function AppealRequestsMockup({
  currentUser,
  agentDirectory,
  externalCaseDetailCases,
  externalRequestId,
  onOpenRequestWorkspace,
  onTasksChanged,
}: {
  currentUser: any;
  agentDirectory?: CaseAgentDirectoryEntry[];
  externalCaseDetailCases?: any[];
  externalRequestId?: string;
  onOpenRequestWorkspace?: (requestId: string, caseId: string) => void;
  onTasksChanged?: () => void;
  // appeal-review-workspace-tabs-v59-review
}) {
  const [logs, setLogs] = useState<UsageLogEvent[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [detailRequestId, setDetailRequestId] = useState("");
  const [draftTopics, setDraftTopics] = useState<AppealTopic[]>([]);
  const [decision, setDecision] = useState<"Approved" | "Rejected">("Rejected");
  const [reviewSummary, setReviewSummary] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [listTab, setListTab] = useState<AppealListTab>("pending");
  const [selectedAgentFilter, setSelectedAgentFilter] = useState("");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState("all");
  const [searchCaseId, setSearchCaseId] = useState("");

  const requests = useMemo(
    () => buildAppealRequests(logs).map((request) =>
      mergeRequestWithCaseDetail(request, externalCaseDetailCases || [])
    ),
    [logs, externalCaseDetailCases]
  );
  const resetHistory = useMemo(() => buildAppealResetHistory(logs), [logs]);
  const standaloneRequestId = String(externalRequestId || "").trim();
  const selectedRequest = requests.find((item) => item.requestId === (standaloneRequestId || selectedRequestId)) || null;
  const isReviewDetailOpen = Boolean(standaloneRequestId || (selectedRequest && detailRequestId === selectedRequest.requestId));
  const selectedAppealedTopics = selectedRequest?.topics.filter(isAppealedTopic) || [];
  const selectedCurrentScore = selectedRequest?.status === "Approved"
    ? appealFinalScoreFromTopics(selectedAppealedTopics, selectedRequest.finalScore)
    : selectedRequest?.finalScore || 0;
  const selectedCurrentGrade = selectedRequest
    ? scoreToGrade(selectedCurrentScore, getAppealReviewMonthKey(selectedRequest))
    : "-";
  const selectedAgentTeam = resolveCaseAgentTeam(selectedRequest, agentDirectory || []);
  const pendingRequests = requests.filter((item) => item.status === "Pending");
  const reviewedRequests = requests.filter((item) => item.status === "Approved" || item.status === "Rejected");
  const resetRequests = requests.filter((item) => item.status === "Reset");
  const agentOptions = useMemo(
    () => [...new Set(requests.map((item) => item.agent).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [requests]
  );
  const monthOptions = useMemo(
    () => [...new Set(requests.map(getAppealReviewMonthKey).filter((item) => item !== "unknown"))].sort((a, b) => b.localeCompare(a)),
    [requests]
  );
  const visibleRequests = useMemo(() => {
    const keyword = searchCaseId.trim().toUpperCase();
    return requests
      .filter((item) => {
        if (listTab !== "all" && item.status.toLowerCase() !== listTab) return false;
        if (selectedAgentFilter && item.agent !== selectedAgentFilter) return false;
        if (selectedMonthFilter !== "all" && getAppealReviewMonthKey(item) !== selectedMonthFilter) return false;
        if (keyword && !item.caseId.toUpperCase().includes(keyword)) return false;
        return true;
      })
      .sort((a, b) =>
        parseAppealReviewSubmittedTime(b.submittedAt) -
        parseAppealReviewSubmittedTime(a.submittedAt)
      );
  }, [requests, listTab, searchCaseId, selectedAgentFilter, selectedMonthFilter]);

  const loadRequests = async () => {
    try {
      setMessage("");
      setLogs(await fetchAppealEvents([
        "appeal_request_submitted",
        "appeal_request_reviewed",
        "appeal_request_reset",
      ], { limit: 2000, forceRefresh: true }) as UsageLogEvent[]);
    } catch (error) {
      console.warn("Load appeal requests failed", error);
      setLogs([]);
      setMessage("Unable to load appeal requests from Firebase. Please refresh and try again.");
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  useEffect(() => {
    if (!selectedRequest) {
      setDetailRequestId("");
      return;
    }
    setSelectedRequestId(selectedRequest.requestId);
    setDraftTopics(selectedRequest.topics.map((topic) => ({
      ...topic,
      revisedScore: selectedRequest.status === "Rejected" ? undefined : topic.revisedScore ?? topic.score,
      rejectReason: topic.rejectReason || "",
    })));
    setDecision(selectedRequest.status === "Approved" ? "Approved" : "Rejected");
    setReviewSummary(selectedRequest.reviewSummary || "");
  }, [selectedRequest?.requestId]);

  const submitReview = async () => {
    if (!selectedRequest || selectedRequest.status !== "Pending") return;
    if (!reviewSummary.trim()) {
      window.alert("Please enter Review Summary before saving.");
      return;
    }
    if (decision === "Approved") {
      const invalidTopic = draftTopics.find((topic) => {
        const revisedScore = toNumber(topic.revisedScore, Number.NaN);
        return Number.isNaN(revisedScore) || revisedScore < 0 || revisedScore > topic.max;
      });
      if (invalidTopic) {
        window.alert(`Revised score for ${invalidTopic.code} must be between 0 and ${invalidTopic.max}.`);
        return;
      }
    } else {
      const missingReasonTopic = draftTopics.find((topic) => !String(topic.rejectReason || "").trim());
      if (missingReasonTopic) {
        window.alert(`Please enter Reject Reason for ${missingReasonTopic.code} before saving.`);
        return;
      }
    }

    const topicsForReview: AppealTopic[] = draftTopics.map((topic) => {
      if (decision === "Approved") {
        return {
          code: topic.code,
          label: topic.label,
          score: topic.score,
          max: topic.max,
          comment: String(topic.comment || ""),
          wantsAppeal: topic.wantsAppeal === true,
          appealReason: String(topic.appealReason || ""),
          revisedScore: topic.revisedScore ?? topic.score,
          revisedComment: String(topic.revisedComment || "").trim(),
          rejectReason: "",
        };
      }
      return {
        code: topic.code,
        label: topic.label,
        score: topic.score,
        max: topic.max,
        comment: String(topic.comment || ""),
        wantsAppeal: topic.wantsAppeal === true,
        appealReason: String(topic.appealReason || ""),
        rejectReason: String(topic.rejectReason || "").trim(),
      };
    });
    const confirmed = window.confirm(
      [
        `Confirm ${decision} for appeal case ${selectedRequest.caseId}?`,
        "",
        "After saving, this task will move out of Pending and the case owner will receive an Inbox notification.",
        decision === "Approved"
          ? "Approved revised scores will update Dashboard / Case Detail from Firebase appeal events after refresh."
          : "Rejected appeals will not change Dashboard or Summary scores.",
      ].join("\n")
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const reviewSaved = await writeAppealEvent(currentUser, "appeal_request_reviewed", {
        tab: "appeal-requests",
        case_id: selectedRequest.caseId,
        target_agent: selectedRequest.agent,
        details: {
          requestId: selectedRequest.requestId,
          decision,
          reviewSummary: reviewSummary.trim(),
          reviewedAt: new Date().toISOString(),
          reviewedBy: String(
            currentUser?.agentName || currentUser?.displayName || currentUser?.username || ""
          ).trim(),
          reviewedByUsername: String(currentUser?.username || "").trim(),
          // appeal-reviewer-loading-fix-v64-requests
          topics: topicsForReview,
          submittedBy: selectedRequest.submittedBy,
          submittedByUsername: selectedRequest.submittedByUsername,
          notificationTarget: selectedRequest.submittedByUsername || selectedRequest.submittedBy || selectedRequest.agent,
          notificationTemplate: {
            subject: `Appeal result for case ${selectedRequest.caseId}`,
            body:
              decision === "Approved"
                ? `Your appeal for case ${selectedRequest.caseId} has been approved. Dashboard / Case Detail will show the revised score after refresh.`
                : `Your appeal for case ${selectedRequest.caseId} has been rejected. Dashboard and Summary scores were not changed.`,
          },
        },
      });
      if (!reviewSaved) {
        setMessage("Save review เนเธกเนเธชเธณเน€เธฃเนเธ เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเนเธญเธตเธเธเธฃเธฑเนเธ");
        return;
      }

      setMessage(
        decision === "Approved"
          ? `Approved appeal for ${selectedRequest.caseId}. Revised score was saved and will show on Dashboard / Case Detail after refresh.`
          : `Rejected appeal for ${selectedRequest.caseId}. Result task was sent to the case owner and scores were not changed.`
      );
      await loadRequests();
      onTasksChanged?.();
      notifyQaAnalyticsDataChanged();
    } finally {
      setBusy(false);
    }
  };

  const resetRequest = async () => {
    if (!selectedRequest || busy) return;
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

  const pendingCount = requests.filter((item) => item.status === "Pending").length;
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
                <button type="button" onClick={() => exportAppealRows(requests)} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800">Export Appeal ROWDATA</button>
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
                <select value={listTab} onChange={(event) => { setListTab(event.target.value as AppealListTab); setSelectedRequestId(""); setDetailRequestId(""); }} className="w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-sm outline-none focus:border-violet-400">
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending ({pendingCount})</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="reset">Reset ({resetCount})</option>
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
                    <col className="w-[13%]" />
                    <col className="w-[19%]" />
                    <col className="w-[11%]" />
                    <col className="w-[14%]" />
                    <col className="w-[14%]" />
                    <col className="w-[9%]" />
                    <col className="w-[7%]" />
                    <col className="w-[5%]" />
                    <col className="w-[8%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr className="border-b border-slate-200">
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Case ID</th>
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Agent</th>
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Case Date</th>
                      <th className="px-2 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Submitted</th>
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
                        <td className="whitespace-nowrap px-2 py-3 text-[10px] tabular-nums text-slate-600" style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1' }}>{formatDateTime(item.submittedAt)}</td>
                        <td className="whitespace-nowrap px-2 py-3 text-[10px] tabular-nums text-slate-600" style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"tnum" 1' }}>{formatDateTime(item.reviewedAt)}</td>
                        <td className="px-2 py-3"><span className={"inline-flex max-w-full rounded-full border px-2 py-1 text-[9px] font-extrabold " + appealReviewStatusTone(item.status)}>{item.status}</span></td>
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
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">Information</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-950">Select a case from Appeal Cases</div>
                  <div className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                    เลือกแถวเพื่อดูข้อมูลสรุปของเคส แล้วใช้ปุ่มในคอลัมน์ Action เมื่อต้องการเข้า Detail
                  </div>
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

                <div className="divide-y divide-slate-100">
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Case ID</div><div className="font-extrabold text-purple-700">{selectedRequest.caseId || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Agent</div><div className="font-semibold text-slate-950">{selectedRequest.agent || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Team</div><div className="font-semibold text-slate-800">{selectedAgentTeam.teamName || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Status</div><div className={"font-extrabold " + (selectedRequest.status === "Approved" ? "text-emerald-700" : selectedRequest.status === "Pending" ? "text-amber-700" : selectedRequest.status === "Rejected" ? "text-rose-700" : selectedRequest.status === "Reset" ? "text-sky-700" : "text-slate-900")}>{selectedRequest.status || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Case Date</div><div className="font-extrabold tabular-nums text-sky-700">{selectedRequest.auditDate || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Audit Date</div><div className="font-extrabold tabular-nums text-sky-700">{selectedRequest.auditTimestamp || selectedRequest.auditDate || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Submitted By</div><div className="font-semibold text-purple-700">{selectedRequest.submittedByUsername || selectedRequest.submittedBy || "-"}</div></div>
                  <div className="grid grid-cols-[155px_minmax(0,1fr)] gap-4 py-3 text-sm"><div className="font-bold text-slate-500">Submitted Date & Time</div><div className="font-extrabold text-purple-700">
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

                <div className="space-y-3">
                  {draftTopics
                    .filter(isAppealedTopic)
                    .map((topic) => (
                      <div key={topic.code} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-base font-extrabold text-slate-950">{topic.code} {topic.label}</div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">Original {topic.score}/{topic.max}</div>
                          </div>
                          {decision === "Approved" ? (
                            <label className="w-44 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">
                              Revised Score
                              <select
                                value={topic.revisedScore ?? topic.score}
                                disabled={selectedRequest.status !== "Pending"}
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
                            <div className="min-w-[176px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Score After Review</div>
                              <div className="mt-1 text-lg font-extrabold text-slate-950">{topic.score} / {topic.max}</div>
                              <div className="mt-1 text-[11px] font-bold text-slate-500">🔒 Original Score</div>
                            </div>
                          )}
                        </div>
                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Original Comment</div>
                            {topic.comment || "-"}
                          </div>
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">Appeal Reason</div>
                            {topic.appealReason || "-"}
                          </div>
                        </div>
                        {decision === "Approved" ? (
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
                              disabled={selectedRequest.status !== "Pending"}
                              onChange={(event) => {
                                const value = event.target.value;
                                setDraftTopics((current) => current.map((item) => item.code === topic.code ? { ...item, revisedComment: value } : item));
                              }}
                              className="mt-2 min-h-[92px] w-full resize-none overflow-hidden rounded-xl border border-violet-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
                              placeholder="ระบุ Comment หลังแก้ไขผลประเมิน"
                            />
                            <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-5 text-emerald-800">
                              Approve จะนำ Revised Score และ Revised Comment ไปใช้คำนวณและแสดงใน Case Detail
                            </div>
                          </div>
                        ) : (
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
                              disabled={selectedRequest.status !== "Pending"}
                              onChange={(event) => {
                                const value = event.target.value;
                                setDraftTopics((current) => current.map((item) => item.code === topic.code ? { ...item, rejectReason: value } : item));
                              }}
                              className="mt-2 min-h-[92px] w-full resize-none overflow-hidden rounded-xl border border-rose-200 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-4 focus:ring-rose-100 disabled:bg-slate-100"
                              placeholder="ระบุเหตุผลที่ยืนยันผลประเมินและคะแนนเดิม"
                            />
                            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-5 text-rose-800">
                              Reject Reason ใช้อธิบายผลการพิจารณาเท่านั้น ไม่ถือเป็น Revised Comment และไม่เปลี่ยนคะแนนเดิม
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>

                <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">Review Decision</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={decision === "Approved"}
                      disabled={selectedRequest.status !== "Pending"}
                      onClick={() => setDecision("Approved")}
                      className={`rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                        decision === "Approved"
                          ? "border-emerald-400 bg-emerald-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                      }`}
                    >
                      <div className="text-sm font-extrabold">✓ Approve</div>
                      <div className={`mt-1 text-xs ${decision === "Approved" ? "text-emerald-50" : "text-slate-500"}`}>ปรับคะแนนและ Comment ตามผลทบทวน</div>
                    </button>
                    <button
                      type="button"
                      aria-pressed={decision === "Rejected"}
                      disabled={selectedRequest.status !== "Pending"}
                      onClick={() => setDecision("Rejected")}
                      className={`rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                        decision === "Rejected"
                          ? "border-rose-400 bg-rose-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:bg-rose-50"
                      }`}
                    >
                      <div className="text-sm font-extrabold">× Reject</div>
                      <div className={`mt-1 text-xs ${decision === "Rejected" ? "text-rose-50" : "text-slate-500"}`}>ยืนยันคะแนนและ Original Comment เดิม</div>
                    </button>
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
                      disabled={selectedRequest.status !== "Pending"}
                      onChange={(event) => setReviewSummary(event.target.value)}
                      className="mt-2 min-h-[88px] w-full resize-none overflow-hidden rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
                      placeholder="Appeal review summary"
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-violet-700">{message}</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || selectedRequest.status === "Reset"}
                        onClick={resetRequest}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Reset This Task
                      </button>
                      <button
                        type="button"
                        disabled={busy || selectedRequest.status !== "Pending"}
                        onClick={submitReview}
                        className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {busy ? "Saving..." : "Save Review"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
