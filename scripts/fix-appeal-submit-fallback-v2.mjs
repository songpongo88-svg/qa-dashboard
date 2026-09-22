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

// Keep the direct Firebase event fallback already present. This patch restores the
// legacy Appeal ROWDATA / E-Mail timestamp aliases that existed in the older parser.
if (!text.includes('"Appeal Result",') || !text.includes('"Appeal Created Date & Time",')) {
  throw new Error("Legacy Appeal timestamp aliases were not installed");
}

fs.writeFileSync(path, text);
console.log("Applied unified legacy + Firebase Appeal Submit/Result timestamp resolver.");
