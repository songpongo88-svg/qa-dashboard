import fs from "node:fs";

const summaryPath = "src/SummaryMockup.tsx";
const appealRequestsPath = "src/AppealRequestsMockup.tsx";
const summaryMarker = "// data-analytics-appeal-source-refresh-v20";
const appealMarker = "// data-analytics-appeal-notify-v20";

function patchSummary() {
  let source = fs.readFileSync(summaryPath, "utf8");
  if (source.includes(summaryMarker)) return;

  const importAnchor = 'import { fetchUsageLogsByEventTypes, type UsageLogEvent } from "./usageLog";';
  if (!source.includes(importAnchor)) {
    throw new Error("SummaryMockup usageLog import anchor not found");
  }

  source = source.replace(
    importAnchor,
    `${summaryMarker}\nimport { type UsageLogEvent } from "./usageLog";\nimport { fetchAppealEvents } from "./appealStore";`
  );

  const oldFetch = `const reviewedLogs = await fetchUsageLogsByEventTypes([\n            "appeal_request_submitted",\n            "appeal_request_reviewed",\n            "appeal_request_reset",\n          ], 2000);`;
  const newFetch = `const reviewedLogs = await fetchAppealEvents([\n            "appeal_request_submitted",\n            "appeal_request_reviewed",\n            "appeal_request_reset",\n          ], { limit: 2000, forceRefresh: true }) as UsageLogEvent[];`;

  if (!source.includes(oldFetch)) {
    throw new Error("SummaryMockup approved appeal fetch anchor not found");
  }
  source = source.replace(oldFetch, newFetch);

  fs.writeFileSync(summaryPath, source, "utf8");
}

function patchAppealRequests() {
  let source = fs.readFileSync(appealRequestsPath, "utf8");
  if (source.includes(appealMarker)) return;

  const constantsAnchor = `const NO_APPEAL_TEXT = "ไม่อุทธรณ์หัวข้อนี้";\nconst LEGACY_NO_APPEAL_TEXT = "เนเธกเนเธญเธธเธ—เธเธฃเธ“เนเธซเธฑเธงเธเนเธญเธเธตเน";`;
  if (!source.includes(constantsAnchor)) {
    throw new Error("AppealRequests constants anchor not found");
  }

  source = source.replace(
    constantsAnchor,
    `${constantsAnchor}\n\n${appealMarker}\nconst QA_ANALYTICS_REFRESH_STORAGE_KEY = "qa-dashboard-data-refresh-key";\n\nfunction notifyQaAnalyticsDataChanged() {\n  if (typeof window === "undefined") return;\n  const nextKey = Date.now();\n  window.localStorage.setItem(QA_ANALYTICS_REFRESH_STORAGE_KEY, String(nextKey));\n  window.dispatchEvent(new CustomEvent("qa-dashboard-data-refresh", { detail: nextKey }));\n}`
  );

  const callbackAnchor = `      onTasksChanged?.();`;
  const callbackCount = source.split(callbackAnchor).length - 1;
  if (callbackCount < 2) {
    throw new Error(`Expected at least 2 AppealRequests refresh callbacks, found ${callbackCount}`);
  }

  source = source.replaceAll(
    callbackAnchor,
    `${callbackAnchor}\n      notifyQaAnalyticsDataChanged();`
  );

  fs.writeFileSync(appealRequestsPath, source, "utf8");
}

patchSummary();
patchAppealRequests();
console.log("analytics appeal source + live refresh v20 applied");
