import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { fetchUsageLogs, logUsageEvent, UsageLogEvent } from "./usageLog";

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
};

const NO_APPEAL_TEXT = "ไม่อุทธรณ์หัวข้อนี้";

type AppealRequest = {
  requestId: string;
  caseId: string;
  agent: string;
  auditDate: string;
  submittedBy: string;
  submittedAt: string;
  finalScore: number;
  grade: string;
  inquiry: string;
  caseDescription: string;
  caseUrl: string;
  rawDataSourceName: string;
  status: "Pending" | "Approved" | "Rejected";
  reviewSummary?: string;
  reviewedAt?: string;
  topics: AppealTopic[];
};

function getRequestId(log: UsageLogEvent) {
  return String(log.details?.requestId || log.id || "");
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildAppealRequests(logs: UsageLogEvent[]) {
  const reviews = new Map<string, UsageLogEvent>();
  logs.forEach((log) => {
    if (log.event_type !== "appeal_request_reviewed") return;
    const requestId = getRequestId(log);
    if (requestId && !reviews.has(requestId)) reviews.set(requestId, log);
  });

  return logs
    .filter((log) => log.event_type === "appeal_request_submitted")
    .map((log): AppealRequest => {
      const requestId = getRequestId(log);
      const review = reviews.get(requestId);
      const reviewTopics = Array.isArray(review?.details?.topics) ? (review?.details?.topics as AppealTopic[]) : null;
      const baseTopics = Array.isArray(log.details?.topics) ? (log.details?.topics as AppealTopic[]) : [];
      const status = review?.details?.decision === "Rejected" ? "Rejected" : review ? "Approved" : "Pending";

      return {
        requestId,
        caseId: String(log.case_id || log.details?.caseId || ""),
        agent: String(log.target_agent || log.details?.agent || ""),
        auditDate: String(log.details?.auditDate || ""),
        submittedBy: String(log.details?.submittedBy || log.display_name || ""),
        submittedAt: String(log.details?.submittedAt || log.created_at || ""),
        finalScore: toNumber(log.details?.finalScore),
        grade: String(log.details?.grade || ""),
        inquiry: String(log.details?.inquiry || ""),
        caseDescription: String(log.details?.caseDescription || ""),
        caseUrl: String(log.details?.caseUrl || ""),
        rawDataSourceName: String(log.details?.rawDataSourceName || ""),
        status,
        reviewSummary: String(review?.details?.reviewSummary || ""),
        reviewedAt: String(review?.details?.reviewedAt || review?.created_at || ""),
        topics: reviewTopics || baseTopics,
      };
    });
}

function exportAppealRows(requests: AppealRequest[]) {
  const reviewed = requests.filter((item) => item.status !== "Pending");
  const topicCodes = Array.from(
    new Set(reviewed.flatMap((item) => item.topics.map((topic) => topic.code)))
  ).sort((a, b) => Number(a) - Number(b));

  const baseHeaders = [
    "Case ID",
    "Agent Name",
    "Audit Date",
    "Final Score",
    "Grade",
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
    `${code} Appeal Reason`,
  ]);

  const rows = reviewed.map((item) => {
    const topicMap = new Map(item.topics.map((topic) => [topic.code, topic]));
    const row: Record<string, unknown> = {
      "Case ID": item.caseId,
      "Agent Name": item.agent,
      "Audit Date": item.auditDate,
      "Final Score": item.finalScore,
      Grade: item.grade,
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
      row[`${code} Revised Score`] = item.status === "Approved" ? topic?.revisedScore ?? topic?.score ?? "" : topic?.score ?? "";
      row[`${code} Comment`] = topic?.comment ?? "";
      row[`${code} Revised Comment`] = item.status === "Approved" ? topic?.revisedComment ?? "" : "";
      row[`${code} Appeal Reason`] = topic?.wantsAppeal ? topic?.appealReason ?? "" : NO_APPEAL_TEXT;
    });

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...baseHeaders, ...topicHeaders] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Appeal_Data");
  XLSX.writeFile(workbook, `Appeal_ROWDATA_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function AppealRequestsMockup({ currentUser }: { currentUser: any }) {
  const [logs, setLogs] = useState<UsageLogEvent[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [draftTopics, setDraftTopics] = useState<AppealTopic[]>([]);
  const [decision, setDecision] = useState<"Approved" | "Rejected">("Approved");
  const [reviewSummary, setReviewSummary] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const requests = useMemo(() => buildAppealRequests(logs), [logs]);
  const selectedRequest = requests.find((item) => item.requestId === selectedRequestId) || requests[0] || null;

  const loadRequests = async () => {
    setLogs(await fetchUsageLogs(5000));
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  useEffect(() => {
    if (!selectedRequest) return;
    setSelectedRequestId(selectedRequest.requestId);
    setDraftTopics(selectedRequest.topics.map((topic) => ({ ...topic, revisedScore: topic.revisedScore ?? topic.score })));
    setReviewSummary(selectedRequest.reviewSummary || "");
  }, [selectedRequest?.requestId]);

  const submitReview = async () => {
    if (!selectedRequest || selectedRequest.status !== "Pending") return;
    setBusy(true);
    try {
      await logUsageEvent(currentUser, "appeal_request_reviewed", {
        tab: "appeal-requests",
        case_id: selectedRequest.caseId,
        target_agent: selectedRequest.agent,
        details: {
          requestId: selectedRequest.requestId,
          decision,
          reviewSummary,
          reviewedAt: new Date().toISOString(),
          topics: draftTopics,
        },
      });
      setMessage(`Saved review for ${selectedRequest.caseId}. Dashboard score is not updated until Appeal ROWDATA is uploaded.`);
      await loadRequests();
    } finally {
      setBusy(false);
    }
  };

  const pendingCount = requests.filter((item) => item.status === "Pending").length;
  const reviewedCount = requests.length - pendingCount;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5 lg:px-6 2xl:px-8">
      <div className="rounded-[32px] border border-violet-100 bg-white shadow-[0_22px_60px_rgba(80,36,140,0.10)]">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-violet-100">Appeal Requests</div>
          <div className="mt-2 text-2xl font-extrabold">Case Detail Appeal Review</div>
          <div className="mt-1 text-sm text-violet-100">Review submitted cases, then export results for Appeal ROWDATA.</div>
        </div>

        <div className="grid gap-4 border-b border-violet-100 p-5 md:grid-cols-3">
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
        </div>

        <div className="grid min-h-[640px] gap-0 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="border-r border-violet-100 p-5">
            <div className="mb-3 flex gap-2">
              <button type="button" onClick={loadRequests} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50">Refresh</button>
              <button type="button" onClick={() => exportAppealRows(requests)} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800">Export Appeal ROWDATA</button>
            </div>
            <div className="space-y-3">
              {requests.map((item) => (
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
                      <div className="text-sm font-extrabold text-slate-950">{item.caseId}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.agent}</div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      item.status === "Pending" ? "border-amber-200 bg-amber-50 text-amber-700" : item.status === "Approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">Submitted: {formatDateTime(item.submittedAt)}</div>
                  <div className="mt-2 text-xs font-semibold text-violet-700">{item.topics.length} topic(s)</div>
                </button>
              ))}
              {!requests.length ? <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">No appeal requests yet.</div> : null}
            </div>
          </div>

          <div className="p-5">
            {!selectedRequest ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Select a request to review.</div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">Review Case</div>
                      <div className="mt-2 text-2xl font-extrabold text-slate-950">{selectedRequest.caseId}</div>
                      <div className="mt-1 text-sm text-slate-600">{selectedRequest.agent} / Audit Date {selectedRequest.auditDate || "-"}</div>
                      <div className="mt-1 text-xs text-slate-500">Submitted by {selectedRequest.submittedBy || "-"} at {formatDateTime(selectedRequest.submittedAt)}</div>
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
                    .filter((topic) => topic.wantsAppeal || topic.appealReason !== NO_APPEAL_TEXT)
                    .map((topic) => (
                      <div key={topic.code} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="text-base font-extrabold text-slate-950">{topic.code} {topic.label}</div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">Original {topic.score}/{topic.max}</div>
                          </div>
                          <input
                            type="number"
                            min={0}
                            max={topic.max}
                            step="0.01"
                            value={topic.revisedScore ?? topic.score}
                            disabled={selectedRequest.status !== "Pending"}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraftTopics((current) => current.map((item) => item.code === topic.code ? { ...item, revisedScore: value } : item));
                            }}
                            className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
                          />
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
                        <textarea
                          value={topic.revisedComment || ""}
                          disabled={selectedRequest.status !== "Pending"}
                          onChange={(event) => {
                            const value = event.target.value;
                            setDraftTopics((current) => current.map((item) => item.code === topic.code ? { ...item, revisedComment: value } : item));
                          }}
                          className="mt-3 min-h-[92px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
                          placeholder="Revised comment / reason after review"
                        />
                      </div>
                    ))}
                </div>

                <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5">
                  <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
                    <select
                      value={decision}
                      disabled={selectedRequest.status !== "Pending"}
                      onChange={(event) => setDecision(event.target.value as "Approved" | "Rejected")}
                      className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold outline-none disabled:bg-slate-100"
                    >
                      <option value="Approved">Approve</option>
                      <option value="Rejected">Reject</option>
                    </select>
                    <textarea
                      value={reviewSummary}
                      disabled={selectedRequest.status !== "Pending"}
                      onChange={(event) => setReviewSummary(event.target.value)}
                      className="min-h-[88px] rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
                      placeholder="Appeal review summary"
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-violet-700">{message}</div>
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
