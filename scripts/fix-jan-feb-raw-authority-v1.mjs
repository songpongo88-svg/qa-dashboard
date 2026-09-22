import fs from "node:fs";

const target = "src/DashboardMockup.tsx";
let source = fs.readFileSync(target, "utf8");

const marker = "// jan-feb-rawdata-authority-v1";
if (source.includes(marker)) {
  console.log("Jan-Feb RawData authority fix already installed.");
  process.exit(0);
}

const startAnchor = `function mergeRawAndStoredEvaluationCases(rawCases: CaseItem[], storedCases: CaseItem[]) {\n  const rawMonthKeys = new Set(rawCases.map((item) => item.monthKey).filter(Boolean));\n  const merged = new Map<string, CaseItem>();`;

const startReplacement = `function mergeRawAndStoredEvaluationCases(rawCases: CaseItem[], storedCases: CaseItem[]) {\n  const rawMonthKeys = new Set(rawCases.map((item) => item.monthKey).filter(Boolean));\n  // jan-feb-rawdata-authority-v1\n  // January-February 2026 is a closed historical dataset. The workbook is the\n  // canonical source for those two reporting months, so live/stored evaluations\n  // must not add extra cases or move a historical case into another month.\n  const authoritativeHistoricalRawCases = rawCases.filter((item) =>\n    String(item.rawDataSourceName || \"\").trim() === RAW_DATA_JAN_FEB_FILE_NAME &&\n    (item.monthKey === \"2026-01\" || item.monthKey === \"2026-02\")\n  );\n  const authoritativeHistoricalMonthKeys = new Set(\n    authoritativeHistoricalRawCases.map((item) => item.monthKey)\n  );\n  const merged = new Map<string, CaseItem>();`;

if (!source.includes(startAnchor)) {
  throw new Error("mergeRawAndStoredEvaluationCases start anchor not found");
}
source = source.replace(startAnchor, startReplacement);

const storedAnchor = `  storedCases\n    .filter((item) => item.agent && item.caseId && item.auditDateObj)\n    .forEach((item) => {\n      const key = buildCaseMergeKey(item);`;
const storedReplacement = `  storedCases\n    .filter((item) => item.agent && item.caseId && item.auditDateObj)\n    .forEach((item) => {\n      // The Jan-Feb workbook contains the complete 10-case historical set for\n      // each included Agent. Do not append Firestore/stored rows for those months.\n      if (authoritativeHistoricalMonthKeys.has(item.monthKey)) return;\n\n      const key = buildCaseMergeKey(item);`;

if (!source.includes(storedAnchor)) {
  throw new Error("storedCases merge anchor not found");
}
source = source.replace(storedAnchor, storedReplacement);

const returnAnchor = `\n  return [...merged.values()];\n}`;
const returnReplacement = `\n  // Re-apply the historical rows last so a stored evaluation with a mismatched\n  // audit month cannot overwrite a Jan-Feb workbook case with the same Case ID.\n  authoritativeHistoricalRawCases.forEach((item) => {\n    merged.set(buildCaseMergeKey(item), item);\n  });\n\n  return [...merged.values()];\n}`;

const mergeStart = source.indexOf("function mergeRawAndStoredEvaluationCases");
const returnIndex = source.indexOf(returnAnchor, mergeStart);
if (mergeStart < 0 || returnIndex < 0) {
  throw new Error("mergeRawAndStoredEvaluationCases return anchor not found");
}
source = source.slice(0, returnIndex) + returnReplacement + source.slice(returnIndex + returnAnchor.length);

fs.writeFileSync(target, source);
console.log("Installed Jan-Feb RawData authority fix.");
