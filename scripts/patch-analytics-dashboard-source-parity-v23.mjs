import fs from "node:fs";

const summaryPath = "src/SummaryMockup.tsx";
const marker = "// data-analytics-dashboard-source-parity-v23";
const requiredMarker = "// data-analytics-appeal-parity-v22";

let source = fs.readFileSync(summaryPath, "utf8");
if (source.includes(marker)) {
  console.log("analytics dashboard source parity v23 already applied");
  process.exit(0);
}
if (!source.includes(requiredMarker)) {
  throw new Error("SummaryMockup v22 marker not found; run patch:analytics-appeal-parity first");
}

// DashboardMockup intentionally disables the legacy V8 Effective_Data shortcut.
// Summary must do the same, otherwise Analytics can calculate from a stale source
// while the Dashboard calculates from RawData + Appeal ROWDATA + Firebase fallback.
const v8FetchAnchor = 'const v8Response = await fetchCachedStaticResponse(`/${V8_EFFECTIVE_FILE_NAME}`);';
if (!source.includes(v8FetchAnchor)) {
  throw new Error("SummaryMockup V8 fetch anchor not found");
}
source = source.replace(
  v8FetchAnchor,
  `${marker}\n        const v8Response = { ok: false } as Response;`
);

// Match DashboardMockup source priority exactly:
// Appeal ROWDATA is authoritative when a Case ID already exists there.
// Firebase Approved Appeal is only a fallback for cases not present in Appeal ROWDATA.
const firebaseOverlayAnchor = `          buildApprovedAppealMergeMap(reviewedLogs, rawCaseMonthKeyMap).forEach((item, caseId) => {\n            appealMap.set(caseId, item);\n          });`;
const firebaseOverlayReplacement = `          buildApprovedAppealMergeMap(reviewedLogs, rawCaseMonthKeyMap).forEach((item, caseId) => {\n            const normalizedCaseId = normalizeAnalyticsAppealCaseId(caseId);\n            if (!appealMap.has(normalizedCaseId) && !appealMap.has(caseId)) {\n              appealMap.set(normalizedCaseId || caseId, item);\n            }\n          });`;

if (!source.includes(firebaseOverlayAnchor)) {
  throw new Error("SummaryMockup Firebase appeal overlay anchor not found");
}
source = source.replace(firebaseOverlayAnchor, firebaseOverlayReplacement);

fs.writeFileSync(summaryPath, source, "utf8");
console.log("analytics dashboard source parity v23 applied");
