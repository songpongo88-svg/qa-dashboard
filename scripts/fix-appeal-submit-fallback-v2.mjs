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

// Keep the direct Firebase event fallback already present. This patch restores the
// legacy Appeal ROWDATA / E-Mail timestamp aliases and prevents normalized Bangkok
// display timestamps from being reparsed as ambiguous browser dates.
if (!text.includes('"Appeal Result",') || !text.includes('"Appeal Created Date & Time",')) {
  throw new Error("Legacy Appeal timestamp aliases were not installed");
}
if (!text.includes("Appeal timestamps are normalized earlier as DD/MM/YYYY HH:mm:ss.")) {
  throw new Error("Appeal display timestamp formatter fix was not installed");
}

fs.writeFileSync(path, text);
console.log("Applied unified Appeal timestamp resolver + stable Bangkok display parser.");
