import fs from "node:fs";

const path = "src/DashboardMockup.tsx";
let text = fs.readFileSync(path, "utf8");

const timelinePattern = /function buildAppealTimelineMap\(logs: UsageLogEvent\[\]\) \{[\s\S]*?\n\}\n\nfunction buildApprovedAppealMergeMap/;
const timelineReplacement = `function appealRequestIdTimestamp(value: unknown) {
  const match = String(value ?? "").trim().match(/-(\\d{13})(?:$|[^0-9])/);
  if (!match) return "";
  const epochMs = Number(match[1]);
  if (!Number.isFinite(epochMs)) return "";
  const date = new Date(epochMs);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function appealEventDateTime(log: UsageLogEvent, kind: "submitted" | "reviewed") {
  const details = (log.details || {}) as Record<string, unknown>;
  const requestId = details.requestId || log.id || "";
  const candidates = kind === "submitted"
    ? [
        details.submittedAt,
        details.appealSubmittedAt,
        details.appealSubmitAt,
        details.submitted_at,
        details.submitDateTime,
        details.submittedDateTime,
        log.created_at,
        appealRequestIdTimestamp(requestId),
      ]
    : [
        details.reviewedAt,
        details.appealReviewedAt,
        details.appealResultAt,
        details.reviewed_at,
        details.resultDateTime,
        log.created_at,
      ];

  for (const value of candidates) {
    const formatted = formatCaseDetailDateTime(value);
    if (formatted) return formatted;
  }
  return "";
}

function appealEventRank(log: UsageLogEvent, kind: "submitted" | "reviewed" | "reset") {
  const details = (log.details || {}) as Record<string, unknown>;
  const candidates = kind === "submitted"
    ? [details.submittedAt, log.created_at, appealRequestIdTimestamp(details.requestId || log.id || "")]
    : kind === "reviewed"
      ? [details.reviewedAt, log.created_at]
      : [details.resetAt, log.created_at];
  for (const value of candidates) {
    const parsed = new Date(String(value || "")).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function buildAppealTimelineMap(logs: UsageLogEvent[]) {
  const map = new Map<string, AppealTimelineItem>();
  buildLatestAppealRequestMap(logs).forEach((request, caseId) => {
    if (request.status === "Reset") return;
    map.set(caseId, {
      caseId,
      submittedAt: formatCaseDetailDateTime(request.submittedAt),
      reviewedAt: formatCaseDetailDateTime(request.reviewedAt),
    });
  });

  const direct = new Map<string, {
    submittedAt: string;
    reviewedAt: string;
    submittedRank: number;
    reviewedRank: number;
    resetRank: number;
  }>();

  logs.forEach((log) => {
    if (!["appeal_request_submitted", "appeal_request_reviewed", "appeal_request_reset"].includes(log.event_type)) return;
    const details = (log.details || {}) as Record<string, unknown>;
    const rawCaseId = log.case_id || details.caseId || details.case_id || "";
    const caseIds = splitAppealCaseIds(rawCaseId);
    if (!caseIds.length) return;

    caseIds.forEach((caseId) => {
      const current = direct.get(caseId) || {
        submittedAt: "",
        reviewedAt: "",
        submittedRank: 0,
        reviewedRank: 0,
        resetRank: 0,
      };

      if (log.event_type === "appeal_request_submitted") {
        const rank = appealEventRank(log, "submitted");
        if (rank >= current.submittedRank) {
          current.submittedRank = rank;
          current.submittedAt = appealEventDateTime(log, "submitted");
        }
      }

      if (log.event_type === "appeal_request_reviewed") {
        const rank = appealEventRank(log, "reviewed");
        if (rank >= current.reviewedRank) {
          current.reviewedRank = rank;
          current.reviewedAt = appealEventDateTime(log, "reviewed");
        }
        if (!current.submittedAt) {
          const requestIdIso = appealRequestIdTimestamp(details.requestId || log.id || "");
          const requestIdTime = formatCaseDetailDateTime(requestIdIso);
          if (requestIdTime) {
            current.submittedAt = requestIdTime;
            const requestIdRank = new Date(requestIdIso).getTime();
            current.submittedRank = Number.isNaN(requestIdRank) ? current.submittedRank : requestIdRank;
          }
        }
      }

      if (log.event_type === "appeal_request_reset") {
        current.resetRank = Math.max(current.resetRank, appealEventRank(log, "reset"));
      }

      direct.set(caseId, current);
    });
  });

  direct.forEach((timeline, caseId) => {
    const latestActivityRank = Math.max(timeline.submittedRank, timeline.reviewedRank);
    if (timeline.resetRank && timeline.resetRank >= latestActivityRank) return;
    const current = map.get(caseId);
    map.set(caseId, {
      caseId,
      submittedAt: current?.submittedAt || timeline.submittedAt,
      reviewedAt: current?.reviewedAt || timeline.reviewedAt,
    });
  });

  return map;
}

function buildApprovedAppealMergeMap`;

if (!timelinePattern.test(text)) {
  throw new Error("Appeal timeline anchor not found");
}
text = text.replace(timelinePattern, timelineReplacement);

const oldHeaders = `"Appeal Submit Date & Time", "Appeal Submit Date", "Appeal Submitted At", "Submitted At", "Appeal Submitted Date", "Appeal Date & Time", "Appeal Date", "Submit Date & Time", "Submit Date"`;
const newHeaders = `"Appeal Submit Date & Time", "Appeal Submit Date", "Appeal Submitted At", "Submitted At", "Appeal Submitted Date", "Appeal Submitted Date & Time", "Submitted Date & Time", "Submitted Date", "Submission Date & Time", "Submission Date", "Appeal Submit", "Appeal Date & Time", "Appeal Date", "Submit Date & Time", "Submit Date"`;
if (!text.includes(oldHeaders)) {
  throw new Error("Appeal Submit Excel header anchor not found");
}
text = text.replace(oldHeaders, newHeaders);

const oldFetch = `const appealLogs = await fetchAppealEvents([
          "appeal_request_submitted",
          "appeal_request_reviewed",
          "appeal_request_reset",
        ], { limit: 1000, forceRefresh: true });`;
const newFetch = `const appealLogs = await fetchAppealEvents([
          "appeal_request_submitted",
          "appeal_request_reviewed",
          "appeal_request_reset",
        ], { limit: 2000, forceRefresh: true });`;
if (!text.includes(oldFetch)) {
  throw new Error("Appeal event fetch anchor not found");
}
text = text.replace(oldFetch, newFetch);

fs.writeFileSync(path, text);
console.log("Applied targeted Appeal Submit historical timestamp fallback.");
