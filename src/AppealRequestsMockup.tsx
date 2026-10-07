import { getAppealTopicDecision, summarizeAppealDecisions, appealScoreAfterReview, prepareAppealReview, type AppealTopicDecision } from "./appealReview";
import { AppealEvidenceGallery, type AppealEvidenceImage } from "./AppealEvidence";
import AppealReviewDialog, { type AppealReviewSavePreview, type AppealReviewNotice } from "./AppealReviewDialog";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { type UsageLogEvent } from "./usageLog";
import { fetchAppealEvents, writeAppealEvent } from "./appealStore";
import PageHero from "./PageHero";

type AppealTopic = {
  evidenceImages?: AppealEvidenceImage[];
  code: string;
  decision?: AppealTopicDecision;
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

type AppealRequest = {
  requestId: string;
  caseId: string;
  agent: string;
  auditDate: string;
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
  topics: AppealTopic[];
};

type AppealReviewHistoryItem = {
  reviewId: string;
  reviewedAt: string;
  reviewedBy: string;
  decision: string;
  reviewSummary: string;
  topics: AppealTopic[];
};

type AppealListTab = "pending" | "reviewed" | "reset";

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

export function buildAppealRequests(logs: UsageLogEvent[]) {
  const reviews = new Map<string, UsageLogEvent[]>();
  const resets = new Map<string, UsageLogEvent>();
  const eventTime = (log: UsageLogEvent) => {
    const parsed = new Date(String(log.created_at || log.details?.reviewedAt || log.details?.resetAt || "")).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  logs.forEach((log) => {
    const requestId = getRequestId(log);
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
      const reset = resets.get(requestId);
      const reviewTopics = Array.isArray(review?.details?.topics) ? (review?.details?.topics as AppealTopic[]) : null;
      const baseTopics = Array.isArray(log.details?.topics) ? (log.details?.topics as AppealTopic[]) : [];
      const reviewDecision = String(review?.details?.decision || "");
      const appealedTopics = (baseTopics.length
        ? baseTopics.map(original => ({ ...original, ...(reviewTopics?.find(topic => topic.code === original.code) || {}) }))
        : reviewTopics || [])
        .filter(isAppealedTopic)
        .map((topic) => {
          const original = baseTopics.find(item => item.code === topic.code);
          topic = { ...topic, evidenceImages: original?.evidenceImages || topic.evidenceImages || [] };
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
        caseId: String(log.case_id || log.details?.caseId || ""),
        agent: String(log.target_agent || log.details?.agent || ""),
        auditDate: String(log.details?.auditDate || ""),
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
      Grade: item.status !== "Rejected" ? appealGradeFromScore(approvedFinalScore) : item.grade,
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
  onTasksChanged,
}: {
  currentUser: any;
  onTasksChanged?: () => void;
}) {
  const [logs, setLogs] = useState<UsageLogEvent[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [draftTopics, setDraftTopics] = useState<AppealTopic[]>([]);
  const decision = summarizeAppealDecisions(draftTopics.filter(isAppealedTopic));
  const [reviewSummary, setReviewSummary] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const [savePreview, setSavePreview] = useState<AppealReviewSavePreview | null>(null);
  const [notice, setNotice] = useState<AppealReviewNotice | null>(null);
  const savingRef = useRef(false);
  const [listTab, setListTab] = useState<AppealListTab>("pending");

  const requests = useMemo(() => buildAppealRequests(logs), [logs]);
  const resetHistory = useMemo(() => buildAppealResetHistory(logs), [logs]);
  const selectedRequest = requests.find((item) => item.requestId === selectedRequestId) || null;
  const pendingRequests = requests.filter((item) => item.status === "Pending");
  const reviewedRequests = requests.filter((item) => item.status === "Approved" || item.status === "Rejected" || item.status === "Partially Approved");
  const resetRequests = requests.filter((item) => item.status === "Reset");
  const visibleRequests =
    listTab === "pending" ? pendingRequests : listTab === "reviewed" ? reviewedRequests : resetRequests;
  const isReviewed = selectedRequest?.status === "Approved" || selectedRequest?.status === "Rejected" || selectedRequest?.status === "Partially Approved";
  const canReview = selectedRequest?.status === "Pending" || (isReviewed && editingReview);

  const loadRequests = async () => {
    try {
      setMessage("");
      setLogs(await fetchAppealEvents([
        "appeal_request_submitted",
        "appeal_request_reviewed",
        "appeal_request_reset",
      ], { limit: 2000, forceRefresh: true }) as UsageLogEvent[]);
      return true;
    } catch (error) {
      console.warn("Load appeal requests failed", error);
      setMessage("โหลดคำขออุทธรณ์ไม่สำเร็จ กรุณาลองโหลดข้อมูลอีกครั้ง");
      return false;
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  useEffect(() => {
    if (!selectedRequest) return;
    setSelectedRequestId(selectedRequest.requestId);
    setDraftTopics(selectedRequest.topics.map((topic) => ({
      ...topic,
      revisedScore: topic.decision === "Rejected" ? undefined : topic.revisedScore ?? topic.score,
      rejectReason: topic.rejectReason || "",
    })));
    setReviewSummary(selectedRequest.reviewSummary || "");
    setEditingReview(false);
  }, [selectedRequest?.requestId, selectedRequest?.reviewId, selectedRequest?.reviewedAt]);

  const cancelReviewEdit = () => {
    if (!selectedRequest || busy) return;
    setDraftTopics(selectedRequest.topics.map(topic => ({ ...topic,
      revisedScore: topic.decision === "Rejected" ? undefined : topic.revisedScore ?? topic.score,
    })));
    setReviewSummary(selectedRequest.reviewSummary || "");
    setEditingReview(false);
  };

  const submitReview = () => {
    if (!selectedRequest || !canReview || busy) return;
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
      isEdit: Boolean(isReviewed), previousReviewId: selectedRequest.reviewId || "",
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
    if (!savePreview || !selectedRequest || busy || savingRef.current) return;
    const preview = savePreview;
    const review = preview.review;
    const topicsForReview = review.topics.map(topic => ({
      code: topic.code, label: topic.label, score: topic.score, max: topic.max,
      comment: String(topic.comment || ""), wantsAppeal: true,
      appealReason: String(topic.appealReason || ""), decision: topic.decision,
      ...(topic.decision === "Approved"
        ? { revisedScore: topic.revisedScore, revisedComment: topic.revisedComment, rejectReason: "" }
        : { rejectReason: topic.rejectReason }),
    }));
    savingRef.current = true;
    setBusy(true);
    try {
      const latestLogs = await fetchAppealEvents([
        "appeal_request_submitted", "appeal_request_reviewed", "appeal_request_reset",
      ], { limit: 2000, forceRefresh: true }) as UsageLogEvent[];
      const latest = buildAppealRequests(latestLogs).find(item => item.requestId === preview.requestId);
      if (!latest || latest.status === "Reset" ||
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
          reviewAction: preview.isEdit ? "edited" : "created",
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
        },
      });
      if (!resetSaved) {
        setMessage("Reset request เนเธกเนเธชเธณเน€เธฃเนเธ เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธซเธกเนเธญเธตเธเธเธฃเธฑเนเธ");
        return;
      }

      setSelectedRequestId("");
      setDraftTopics([]);
      setReviewSummary("");
      setMessage(`Reset ${selectedRequest.caseId}. The case owner can submit this case again if the appeal window is still open.`);
      await loadRequests();
      onTasksChanged?.();
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
        {selectedRequest?.topics.some(topic => topic.evidenceImages?.length) ? (
          <section className="border-b border-violet-100 p-5" aria-label="รูปภาพหลักฐานคำขออุทธรณ์">
            <div className="text-sm font-bold text-violet-700">รูปภาพหลักฐาน · {selectedRequest.caseId}</div>
            {selectedRequest.topics.filter(topic => topic.evidenceImages?.length).map(topic => (
              <div key={topic.code} className="mt-3"><div className="text-xs font-semibold">{topic.code} {topic.label}</div><AppealEvidenceGallery images={topic.evidenceImages || []} /></div>
            ))}
          </section>
        ) : null}


        <div className="grid gap-4 border-b border-violet-100 p-5 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Total Requests</div>
            <div className="mt-2 text-3xl font-extrabold text-slate-950">{requests.length}</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">Pending</div>
            <div className="mt-2 text-3xl font-extrabold text-amber-700">{pendingCount}</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">Reviewed</div>
            <div className="mt-2 text-3xl font-extrabold text-emerald-700">{reviewedCount}</div>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">Reset History</div>
            <div className="mt-2 text-3xl font-extrabold text-sky-700">{resetHistory.length}</div>
          </div>
        </div>

        <div className="grid min-h-[640px] gap-0 lg:grid-cols-[430px_minmax(0,1fr)]">
          <div className="border-r border-violet-100 p-5">
            <div className="mb-3 flex gap-2">
              <button type="button" onClick={loadRequests} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50">Refresh</button>
              <button type="button" onClick={() => exportAppealRows(requests)} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800">Export Appeal ROWDATA</button>
            </div>
            <div className="mb-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-700">Task Inbox</div>
              <div className="mt-1 text-sm text-slate-600">Click a task subject to open and review details.</div>
            </div>
            <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
              {[
                { key: "pending" as const, label: "Pending", count: pendingCount },
                { key: "reviewed" as const, label: "Reviewed", count: reviewedCount },
                { key: "reset" as const, label: "Reset", count: resetCount },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setListTab(item.key);
                    setSelectedRequestId("");
                  }}
                  className={`rounded-xl px-3 py-2 text-xs font-black transition ${
                    listTab === item.key
                      ? "bg-violet-700 text-white shadow-sm"
                      : "bg-white text-slate-600 hover:bg-violet-50 hover:text-violet-700"
                  }`}
                >
                  {item.label} <span className="ml-1">{item.count}</span>
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {visibleRequests.map((item) => (
                <button
                  key={item.requestId}
                  type="button"
                  onClick={() => setSelectedRequestId(item.requestId)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedRequest?.requestId === item.requestId
                      ? "border-violet-400 bg-violet-50"
                      : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700">Appeal Review Task</div>
                      <div className="mt-1 text-sm font-extrabold text-slate-950">Appeal Request - {item.caseId}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.agent}</div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      item.status === "Pending"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : item.status === "Approved"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : item.status === "Reset"
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Submitted: {formatDateTime(item.submittedAt)}</div>
                  <div className="mt-2 text-xs font-semibold text-violet-700">
                    {item.topics.filter(isAppealedTopic).length} appealed topic(s)
                  </div>
                </button>
              ))}
              {!visibleRequests.length ? (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  No {listTab} appeal requests in this view. Try another tab.
                </div>
              ) : null}
            </div>
          </div>

          <div className="p-5">
            {!selectedRequest ? (
              <div className="flex h-full min-h-[520px] items-center justify-center rounded-3xl border border-dashed border-violet-200 bg-violet-50/50 p-8 text-center">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-violet-700">No Task Opened</div>
                  <div className="mt-2 text-2xl font-extrabold text-slate-950">Select a task from Inbox</div>
                  <div className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                    Choose an appeal task on the left to open the case details, review requested topics, and save the result.
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Review Case</div>
                      <div className="mt-2 text-2xl font-extrabold text-slate-950">{selectedRequest.caseId}</div>
                      <div className="mt-1 text-sm text-slate-600">{selectedRequest.agent} / Case Date {selectedRequest.auditDate || "-"}</div>
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
                            <div className="text-base font-extrabold text-slate-950">{topic.code} {topic.label}</div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">Original {topic.score}/{topic.max}</div>
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
                            <AppealEvidenceGallery images={topic.evidenceImages || []} />
                          </div>
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
                            <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold leading-5 text-emerald-800">
                              Approve จะนำ Revised Score และ Revised Comment ไปใช้คำนวณและแสดงใน Case Detail
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
                            <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-5 text-rose-800">
                              Reject Reason ใช้อธิบายผลการพิจารณาเท่านั้น ไม่ถือเป็น Revised Comment และไม่เปลี่ยนคะแนนเดิม
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                </div>

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
                  {editingReview && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">กำลังแก้ไขผลอุทธรณ์เดิม กรุณากด Save Review เพื่อบันทึกผลใหม่</p>}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-violet-700">{message}</div>
                    <div className="flex flex-wrap gap-2">
                      {isReviewed && !editingReview && <button type="button" disabled={busy} onClick={() => setEditingReview(true)} className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50">แก้ไขผลอุทธรณ์</button>}
                      {editingReview && <button type="button" disabled={busy} onClick={cancelReviewEdit} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิกการแก้ไข</button>}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={resetRequest}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Reset This Task
                      </button>
                      <button
                        type="button"
                        disabled={busy || !canReview}
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
      <AppealReviewDialog preview={savePreview} notice={notice} busy={busy} onConfirm={() => void confirmReview()}
        onBack={() => setSavePreview(null)} onDismiss={() => setNotice(null)} />
    </div>
  );
}
