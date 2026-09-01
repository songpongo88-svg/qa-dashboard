import fs from "node:fs";

const summaryPath = "src/SummaryMockup.tsx";
const marker = "// data-analytics-appeal-parity-v22";
const requiredMarker = "// data-analytics-v8-appeal-merge-v21";

let source = fs.readFileSync(summaryPath, "utf8");
if (source.includes(marker)) {
  console.log("analytics appeal parity v22 already applied");
  process.exit(0);
}
if (!source.includes(requiredMarker)) {
  throw new Error("SummaryMockup v21 marker not found; run patch:analytics-v8-appeal-merge first");
}

const functionStart = source.indexOf("function buildApprovedAppealMergeMap(");
const functionEnd = source.indexOf("\ntype TopicSummary", functionStart);
if (functionStart < 0 || functionEnd < 0) {
  throw new Error("SummaryMockup approved appeal merge function block not found");
}

const replacement = `${marker}\nfunction normalizeAnalyticsAppealCaseId(value: unknown) {\n  return String(value ?? \"\")\n    .replace(/\\s+/g, \"\")\n    .trim()\n    .toUpperCase();\n}\n\nfunction splitAnalyticsAppealCaseIds(value: unknown) {\n  const text = String(value ?? \"\").trim();\n  if (!text) return [];\n  const matchedIds = text.match(/[A-Za-z]{1,6}\\d{3,}/g) || [];\n  const candidates = matchedIds.length ? matchedIds : text.split(/[,;|\\n]+/g);\n  return [...new Set(candidates.map((item) => normalizeAnalyticsAppealCaseId(item)).filter(Boolean))];\n}\n\nfunction getAnalyticsAppealRequestTime(request: any) {\n  const value = request?.reviewedAt || request?.submittedAt || \"\";\n  const timestamp = new Date(value).getTime();\n  return Number.isNaN(timestamp) ? 0 : timestamp;\n}\n\nfunction buildLatestAnalyticsAppealRequestMap(logs: UsageLogEvent[]) {\n  const latest = new Map<string, any>();\n  buildAppealRequests(logs)\n    .slice()\n    .sort((a, b) => getAnalyticsAppealRequestTime(a) - getAnalyticsAppealRequestTime(b))\n    .forEach((request) => {\n      splitAnalyticsAppealCaseIds(request.caseId).forEach((caseId) => {\n        latest.set(caseId, { ...request, caseId });\n      });\n    });\n  return latest;\n}\n\nfunction buildApprovedAppealMergeMap(\n  logs: UsageLogEvent[],\n  rawCaseMonthKeyMap: Map<string, string>\n) {\n  const map = new Map<string, AppealMergeItem>();\n  const normalizedMonthMap = new Map(\n    [...rawCaseMonthKeyMap.entries()].map(([caseId, monthKey]) => [\n      normalizeAnalyticsAppealCaseId(caseId),\n      monthKey,\n    ])\n  );\n  const latestRequests = buildLatestAnalyticsAppealRequestMap(logs);\n\n  latestRequests.forEach((request, caseId) => {\n    if (request.status !== \"Approved\") return;\n\n    const revisedTopics: Topic[] = [];\n    const displayRevisedTopicCodes: string[] = [];\n    const originalFinalScore = Number(request.finalScore || 0);\n    let scoreDelta = 0;\n    const monthKey =\n      normalizedMonthMap.get(caseId) ||\n      getMonthKey(excelDateToJSDate(request.auditDate));\n\n    (Array.isArray(request.topics) ? request.topics : []).forEach((matched: any) => {\n      const master = getTopicMasterByMonth(monthKey).find((item) => item.code === matched.code);\n      if (!master) return;\n\n      const originalScore = Number(matched.score ?? 0);\n      const hasRevisedScore =\n        matched.revisedScore !== null &&\n        matched.revisedScore !== undefined &&\n        matched.revisedScore !== \"\" &&\n        !Number.isNaN(Number(matched.revisedScore));\n      const revisedScore = hasRevisedScore ? Number(matched.revisedScore) : originalScore;\n\n      if (Number.isFinite(originalScore) && Number.isFinite(revisedScore)) {\n        scoreDelta += revisedScore - originalScore;\n      }\n\n      revisedTopics.push({\n        code: master.code,\n        label: master.label,\n        score: Number.isFinite(revisedScore) ? revisedScore : 0,\n        max: master.max,\n        pct: master.max > 0\n          ? Number((((Number.isFinite(revisedScore) ? revisedScore : 0) / master.max) * 100).toFixed(2))\n          : 0,\n        comment: String(matched.revisedComment || matched.comment || \"\").trim(),\n      });\n\n      if (isApprovedAppealTopicChanged(matched)) {\n        displayRevisedTopicCodes.push(master.code);\n      }\n    });\n\n    if (!revisedTopics.length) return;\n\n    map.set(caseId, {\n      caseId,\n      finalScore: Number((originalFinalScore + scoreDelta).toFixed(2)),\n      previousScore: originalFinalScore,\n      reviewStatus: \"Revised\",\n      revisedTopics,\n      displayRevisedTopicCodes,\n    });\n  });\n\n  return map;\n}\n`;

source = source.slice(0, functionStart) + replacement + source.slice(functionEnd);

source = source.replaceAll(
  "rawCaseMonthKeyMap.set(caseId, getMonthKey(monthDate));",
  "rawCaseMonthKeyMap.set(normalizeAnalyticsAppealCaseId(caseId), getMonthKey(monthDate));"
);

source = source.replaceAll(
  "appealMap.set(caseId, {",
  "appealMap.set(normalizeAnalyticsAppealCaseId(caseId), {"
);

source = source.replaceAll(
  "const mergedAppeal = appealMap.get(caseId);",
  "const mergedAppeal = appealMap.get(normalizeAnalyticsAppealCaseId(caseId)) || appealMap.get(caseId);"
);

fs.writeFileSync(summaryPath, source, "utf8");
console.log("analytics appeal parity v22 applied");
