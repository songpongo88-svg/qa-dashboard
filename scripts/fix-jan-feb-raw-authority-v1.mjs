import fs from "node:fs";

const target = "src/DashboardMockup.tsx";
let source = fs.readFileSync(target, "utf8");

const marker = "// jan-feb-rawdata-authority-v2";
if (source.includes(marker)) {
  console.log("Jan-Feb RawData authority v2 fix already installed.");
  process.exit(0);
}

const typeAnchor = `  rawDataSourceName?: string;\n`;
if (!source.includes("rawDataFileName?: string;")) {
  if (!source.includes(typeAnchor)) {
    throw new Error("CaseItem rawDataSourceName anchor not found");
  }
  source = source.replace(
    typeAnchor,
    `  rawDataSourceName?: string;\n  rawDataFileName?: string;\n`
  );
}

const storedAnchor = `        caseId: record.caseId,\n        rawDataSourceName: "QA Evaluation Form",\n`;
if (!source.includes('rawDataFileName: "QA Evaluation Form"')) {
  if (!source.includes(storedAnchor)) {
    throw new Error("Stored evaluation RawData source anchor not found");
  }
  source = source.replace(
    storedAnchor,
    `        caseId: record.caseId,\n        rawDataSourceName: "QA Evaluation Form",\n        rawDataFileName: "QA Evaluation Form",\n`
  );
}

const v8Anchor = `                  caseId,\n                  rawDataSourceName,\n                  caseUrl:`;
if (!source.includes("rawDataFileName: V8_EFFECTIVE_FILE_NAME")) {
  if (!source.includes(v8Anchor)) {
    throw new Error("V8 RawData source anchor not found");
  }
  source = source.replace(
    v8Anchor,
    `                  caseId,\n                  rawDataSourceName,\n                  rawDataFileName: V8_EFFECTIVE_FILE_NAME,\n                  caseUrl:`
  );
}

const rawAnchor = `              caseId,\n              rawDataSourceName,\n              caseUrl:`;
if (!source.includes("rawDataFileName: source.fileName")) {
  if (!source.includes(rawAnchor)) {
    throw new Error("RawData physical source anchor not found");
  }
  source = source.replace(
    rawAnchor,
    `              caseId,\n              rawDataSourceName,\n              rawDataFileName: source.fileName,\n              caseUrl:`
  );
}

const mergeStart = source.indexOf("function mergeRawAndStoredEvaluationCases(rawCases: CaseItem[], storedCases: CaseItem[]) {");
const mergeEnd = source.indexOf("\nfunction LogoHeaderBox()", mergeStart);
if (mergeStart < 0 || mergeEnd < 0) {
  throw new Error("mergeRawAndStoredEvaluationCases block not found");
}

const replacement = `function mergeRawAndStoredEvaluationCases(rawCases: CaseItem[], storedCases: CaseItem[]) {
  // jan-feb-rawdata-authority-v2
  // January-February 2026 is a closed historical dataset. Authority must use
  // the physical workbook that supplied the row, not a display/source label
  // embedded inside the workbook.
  const isAuthoritativeHistoricalMonth = (monthKey: string) =>
    monthKey === "2026-01" || monthKey === "2026-02";

  const authoritativeHistoricalRawCases = rawCases.filter((item) =>
    String(item.rawDataFileName || "").trim() === RAW_DATA_JAN_FEB_FILE_NAME &&
    isAuthoritativeHistoricalMonth(item.monthKey)
  );
  const authoritativeHistoricalMonthKeys = new Set(
    authoritativeHistoricalRawCases.map((item) => item.monthKey)
  );

  // When the Jan-Feb workbook is present for a month, rows for that month from
  // every other raw workbook are ignored. This prevents historical duplicates
  // from being appended before the stored-evaluation merge even starts.
  const canonicalRawCases = rawCases.filter((item) => {
    if (!authoritativeHistoricalMonthKeys.has(item.monthKey)) return true;
    return String(item.rawDataFileName || "").trim() === RAW_DATA_JAN_FEB_FILE_NAME;
  });

  const rawMonthKeys = new Set(canonicalRawCases.map((item) => item.monthKey).filter(Boolean));
  const merged = new Map<string, CaseItem>();

  canonicalRawCases
    .filter((item) => item.agent && item.caseId && item.auditDateObj)
    .forEach((item) => {
      merged.set(buildCaseMergeKey(item), item);
    });

  storedCases
    .filter((item) => item.agent && item.caseId && item.auditDateObj)
    .forEach((item) => {
      // Jan-Feb must come only from the authoritative historical workbook.
      if (authoritativeHistoricalMonthKeys.has(item.monthKey)) return;

      const key = buildCaseMergeKey(item);

      if (rawMonthKeys.has(item.monthKey)) {
        if (!merged.has(key)) {
          merged.set(key, item);
        } else {
          const existing = merged.get(key);
          if (existing) {
            merged.set(key, {
              ...existing,
              targetUsername: existing.targetUsername || item.targetUsername,
              evaluatorName: existing.evaluatorName || item.evaluatorName,
              processReference: existing.processReference || item.processReference,
            });
          }
        }
        return;
      }

      if (!merged.has(key)) {
        merged.set(key, item);
        return;
      }

      const existing = merged.get(key);
      if (existing && !rawMonthKeys.has(existing.monthKey)) {
        merged.set(key, item);
      }
    });

  // Re-apply authoritative historical rows last as an additional guard against
  // a Case ID collision with any non-historical source.
  authoritativeHistoricalRawCases.forEach((item) => {
    merged.set(buildCaseMergeKey(item), item);
  });

  return [...merged.values()];
}`;

source = source.slice(0, mergeStart) + replacement + source.slice(mergeEnd);

fs.writeFileSync(target, source);
console.log("Installed Jan-Feb RawData authority v2 fix.");
