import fs from "node:fs";

const path = "src/DashboardMockup.tsx";
let text = fs.readFileSync(path, "utf8");

const submitHeaders = [
  "Appeal Submit Date & Time",
  "Appeal Submit",
  "Appeal Submit Date",
  "Appeal Submitted At",
  "Submitted At",
  "Appeal Submitted Date & Time",
  "Appeal Submitted Date",
  "Submitted Date & Time",
  "Submitted Date",
  "Submission Date & Time",
  "Submission Date",
  "Submit Date & Time",
  "Submit Date",
  "Appeal Created Date & Time",
  "Appeal Created Date",
  "Created Date & Time",
  "Created Date",
  "Created",
  "File Created Date",
];

const resultHeaders = [
  "Appeal Result Date & Time",
  "Appeal Result",
  "Appeal Result Date",
  "Result Date & Time",
  "Result Date",
  "Appeal Reviewed At",
  "Reviewed At",
  "Review Date & Time",
  "Review Date",
  "Appeal Closed Date & Time",
  "Appeal Closed Date",
  "Closed Date & Time",
  "Closed Date",
  "Created Date & Time",
  "Created Date",
  "Created",
  "File Created Date",
];

const q = (value) => `      ${JSON.stringify(value)},`;
const submitList = submitHeaders.map(q).join("\n");
const resultList = resultHeaders.map(q).join("\n");

const rankPattern = /function getAppealTimestampRank\(helper: ReturnType<typeof buildHeaderHelpers>, row: any\[\]\) \{[\s\S]*?\n\}\n\nfunction getLatestAppealRows/;
const rankReplacement = `function getAppealTimestampRank(helper: ReturnType<typeof buildHeaderHelpers>, row: any[]) {
  const resultRaw = getFirstAvailableHeaderValue(helper, row, [
${resultList}
  ], "");
  const submitRaw = getFirstAvailableHeaderValue(helper, row, [
${submitList}
  ], "");
  const resultRank = excelDateToJSDate(resultRaw)?.getTime() ?? -1;
  const submitRank = excelDateToJSDate(submitRaw)?.getTime() ?? -1;
  return Math.max(resultRank, submitRank);
}

function getLatestAppealRows`;

if (!rankPattern.test(text)) {
  throw new Error("Appeal timestamp rank anchor not found");
}
text = text.replace(rankPattern, rankReplacement);

const submitPattern = /submittedAt:\s*formatCaseDetailDateTime\(getFirstAvailableHeaderValue\(appealHelper, row, \[[\s\S]*?\],\s*""\)\),/;
const submitReplacement = `submittedAt: formatCaseDetailDateTime(getFirstAvailableHeaderValue(appealHelper, row, [
${submitList}
            ], "")),`;
if (!submitPattern.test(text)) {
  throw new Error("Appeal Submit row parser anchor not found");
}
text = text.replace(submitPattern, submitReplacement);

const resultPattern = /reviewedAt:\s*formatCaseDetailDateTime\(getFirstAvailableHeaderValue\(appealHelper, row, \[[\s\S]*?\],\s*""\)\),/;
const resultReplacement = `reviewedAt: formatCaseDetailDateTime(getFirstAvailableHeaderValue(appealHelper, row, [
${resultList}
            ], "")),`;
if (!resultPattern.test(text)) {
  throw new Error("Appeal Result row parser anchor not found");
}
text = text.replace(resultPattern, resultReplacement);

const bangkokFormatterPattern = /function formatBangkokDateTime\(value: Date \| string \| null\) \{[\s\S]*?\n\}\n\nfunction parseMonthLabelDate/;
const bangkokFormatterReplacement = `function formatBangkokDateTime(value: Date | string | null) {
  if (!value) return "-";

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return "-";

    // Appeal timestamps are normalized earlier as DD/MM/YYYY HH:mm:ss.
    // Do not feed that display string back into new Date(), because browsers
    // parse DD/MM/YYYY inconsistently and can return Invalid Date (shown as "-").
    const localDateTime = raw.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?)?$/);
    if (localDateTime) {
      const [, day, month, year, hour = "00", minute = "00", second = "00"] = localDateTime;
      return day.padStart(2, "0") + "/" + month.padStart(2, "0") + "/" + year + " " +
        hour.padStart(2, "0") + ":" + minute + ":" + second;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
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

function parseMonthLabelDate`;
if (!bangkokFormatterPattern.test(text)) {
  throw new Error("Bangkok Appeal timestamp formatter anchor not found");
}
text = text.replace(bangkokFormatterPattern, bangkokFormatterReplacement);

const mergeTypePattern = /type AppealMergeItem = \{[\s\S]*?\n\};\n\ntype AppealOutcomeItem/;
const mergeTypeReplacement = `type AppealMergeItem = {
  caseId: string;
  finalScore?: number;
  previousScore?: number;
  reviewStatus?: ReviewStatus;
  revisedTopics: Topic[];
  displayRevisedTopicCodes: string[];
  submittedAt?: string;
  reviewedAt?: string;
  submittedBy?: string;
  reviewedBy?: string;
  reviewSummary?: string;
  status?: "Approved" | "Rejected";
  source?: "excel" | "firebase";
};

type AppealOutcomeItem`;
if (!mergeTypePattern.test(text)) {
  throw new Error("AppealMergeItem type anchor not found");
}
text = text.replace(mergeTypePattern, mergeTypeReplacement);

const excelMergePattern = /appealMap\.set\(caseId, \{\n\s*caseId,\n\s*finalScore,\n\s*previousScore,\n\s*reviewStatus: displayRevisedTopicCodes\.length \? "Revised" : "Original",\n\s*revisedTopics,\n\s*displayRevisedTopicCodes,\n\s*submittedAt:[\s\S]*?\n\s*reviewedAt:[\s\S]*?\n\s*source: "excel",\n\s*\}\);/;
const excelMergeReplacement = `appealMap.set(caseId, {
            caseId,
            finalScore,
            previousScore,
            reviewStatus: displayRevisedTopicCodes.length ? "Revised" : "Original",
            revisedTopics,
            displayRevisedTopicCodes,
            submittedAt: formatCaseDetailDateTime(getFirstAvailableHeaderValue(appealHelper, row, [
${submitList}
            ], "")),
            reviewedAt: formatCaseDetailDateTime(getFirstAvailableHeaderValue(appealHelper, row, [
${resultList}
            ], "")),
            submittedBy: (() => {
              const direct = String(getFirstAvailableHeaderValue(appealHelper, row, [
                "Appeal Submitted By",
                "Submitted By",
                "Admin Name",
                "Admin",
              ], "") ?? "").trim();
              if (direct) return direct;
              const channel = String(getFirstAvailableHeaderValue(appealHelper, row, ["Appeal Channel"], "") ?? "").trim();
              const match = channel.match(/(?:E-?Mail|Email)\\s*:\\s*(.+)$/i);
              return match?.[1]?.trim() || "";
            })(),
            reviewedBy: String(getFirstAvailableHeaderValue(appealHelper, row, [
              "Appeal Reviewed By",
              "Reviewed By",
              "QA Name",
              "Reviewer Name",
            ], "") ?? "").trim(),
            reviewSummary: String(getFirstAvailableHeaderValue(appealHelper, row, [
              "Appeal Review Summary",
              "Review Summary",
            ], "") ?? "").trim(),
            status: (() => {
              const rawStatus = String(getFirstAvailableHeaderValue(appealHelper, row, [
                "Appeal Decision",
                "Comment Status",
                "QA Scheme",
                "Status",
              ], "") ?? "").trim().toLowerCase();
              return rawStatus === "rejected" || rawStatus === "reject" ? "Rejected" : "Approved";
            })(),
            source: "excel",
          });`;
if (!excelMergePattern.test(text)) {
  throw new Error("Legacy Excel Appeal merge anchor not found");
}
text = text.replace(excelMergePattern, excelMergeReplacement);

const effectiveStatusPattern = /const excelAppealWins = Boolean\(mergedAppeal && mergedAppeal\.source !== "firebase"\);\n\s*const effectiveStatus = excelAppealWins\n\s*\? "Approved"\n\s*: loggedOutcome\?\.status;/;
const effectiveStatusReplacement = `const excelAppealWins = Boolean(mergedAppeal && mergedAppeal.source !== "firebase");
    const effectiveStatus = excelAppealWins
      ? mergedAppeal?.status || "Approved"
      : loggedOutcome?.status;`;
if (!effectiveStatusPattern.test(text)) {
  throw new Error("Legacy Excel Appeal status anchor not found");
}
text = text.replace(effectiveStatusPattern, effectiveStatusReplacement);

const nextItemPattern = /appealReviewSummary: loggedOutcome\?\.reviewSummary \|\| "",\n\s*appealSubmittedAt: appealTimeline\?\.submittedAt \|\| loggedOutcome\?\.submittedAt \|\| mergedAppeal\?\.submittedAt \|\| "",\n\s*appealReviewedAt: appealTimeline\?\.reviewedAt \|\| loggedOutcome\?\.reviewedAt \|\| mergedAppeal\?\.reviewedAt \|\| "",\n\s*appealSubmittedBy: loggedOutcome\?\.submittedBy \|\| item\.agent \|\| "",\n\s*appealReviewedBy: loggedOutcome\?\.reviewedBy \|\| "",\n\s*appealRequestId: loggedOutcome\?\.requestId \|\| "",\n\s*appealReviewedTopics: loggedOutcome\?\.reviewedTopics\?\.length\n\s*\? loggedOutcome\.reviewedTopics\n\s*: null,/;
const nextItemReplacement = `appealReviewSummary: loggedOutcome?.reviewSummary || mergedAppeal?.reviewSummary || "",
      appealSubmittedAt: appealTimeline?.submittedAt || loggedOutcome?.submittedAt || mergedAppeal?.submittedAt || "",
      appealReviewedAt: appealTimeline?.reviewedAt || loggedOutcome?.reviewedAt || mergedAppeal?.reviewedAt || "",
      appealSubmittedBy: loggedOutcome?.submittedBy || mergedAppeal?.submittedBy || item.agent || "",
      appealReviewedBy: loggedOutcome?.reviewedBy || mergedAppeal?.reviewedBy || "",
      appealRequestId: loggedOutcome?.requestId || "",
      appealReviewedTopics: loggedOutcome?.reviewedTopics?.length
        ? loggedOutcome.reviewedTopics
        : mergedAppeal?.revisedTopics?.filter((topic) => {
            const reason = String(topic.appealReason || "").trim();
            return Boolean(reason) && !isNoAppealReason(reason);
          }) || null,`;
if (!nextItemPattern.test(text)) {
  throw new Error("CaseItem legacy Appeal detail fallback anchor not found");
}
text = text.replace(nextItemPattern, nextItemReplacement);

// Keep the direct Firebase event fallback already present. Legacy Excel / E-Mail
// appeals must also populate the detail model used by the Case Detail UI, otherwise
// old cases have revised scores but the Original / Appeal Reason / Revised Comment
// cards are hidden because appealReviewedTopics is null.
if (!text.includes('"Appeal Result",') || !text.includes('"Appeal Created Date & Time",')) {
  throw new Error("Legacy Appeal timestamp aliases were not installed");
}
if (!text.includes("Appeal timestamps are normalized earlier as DD/MM/YYYY HH:mm:ss.")) {
  throw new Error("Appeal display timestamp formatter fix was not installed");
}
if (!text.includes("mergedAppeal?.revisedTopics?.filter((topic) =>")) {
  throw new Error("Legacy Excel Appeal detail fallback was not installed");
}

fs.writeFileSync(path, text);
console.log("Applied Appeal timestamp fixes + legacy Excel Appeal detail fallback.");
