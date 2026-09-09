import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const addonPath = path.join(root, "src", "caseAppealPdfAddon.ts");
const bulkPath = path.join(root, "src", "bulkCaseDetailPdf.ts");
const dashboardPath = path.join(root, "src", "DashboardMockup.tsx");
const summaryPath = path.join(root, "src", "SummaryMockup.tsx");
const marker = "bulk-main-pdf-appeal-parity-v28";
const weeklyCaseDateMarker = "weekly-case-date-v29";
const periodMasterMarker = "period-master-filter-v31";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Bulk Main PDF parity v28 anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

function patchAppealAwareRenderer() {
  let source = fs.readFileSync(addonPath, "utf8");
  if (source.includes(marker)) return;

  source = replaceOnce(
    source,
    `type PdfGenerator = (input: {\n  caseItem: any;\n  currentUser?: any;\n  pdfVariant?: PdfVariant;\n}) => Promise<PdfResult>;`,
    `// ${marker}\ntype PdfGenerator = (input: {\n  caseItem: any;\n  currentUser?: any;\n  pdfVariant?: PdfVariant;\n  pdfDoc?: any;\n  appendPage?: boolean;\n  suppressOutput?: boolean;\n}) => Promise<PdfResult>;`,
    "PDF generator input"
  );

  source = replaceOnce(
    source,
    `type GenerateAppealAwarePdfInput = {\n  caseItem: any;\n  currentUser?: any;\n  pdfVariant?: PdfVariant;\n  fallback: PdfGenerator;\n};`,
    `type GenerateAppealAwarePdfInput = {\n  caseItem: any;\n  currentUser?: any;\n  pdfVariant?: PdfVariant;\n  fallback: PdfGenerator;\n  pdfDoc?: any;\n  appendPage?: boolean;\n  suppressOutput?: boolean;\n};`,
    "appeal-aware input"
  );

  source = replaceOnce(
    source,
    `export async function generateCasePdfWithAppealHistory({\n  caseItem,\n  currentUser,\n  pdfVariant = "original",\n  fallback,\n}: GenerateAppealAwarePdfInput): Promise<PdfResult> {\n  if (!hasResolvedAppeal(caseItem)) {\n    return fallback({ caseItem, currentUser, pdfVariant });\n  }`,
    `export async function generateCasePdfWithAppealHistory({\n  caseItem,\n  currentUser,\n  pdfVariant = "original",\n  fallback,\n  pdfDoc,\n  appendPage = false,\n  suppressOutput = false,\n}: GenerateAppealAwarePdfInput): Promise<PdfResult> {\n  if (!hasResolvedAppeal(caseItem)) {\n    return fallback({\n      caseItem,\n      currentUser,\n      pdfVariant,\n      pdfDoc,\n      appendPage,\n      suppressOutput,\n    });\n  }`,
    "appeal-aware function passthrough"
  );

  source = replaceOnce(
    source,
    `  return fallback({ caseItem: updatedCaseItem, currentUser, pdfVariant: "original" });`,
    `  return fallback({\n    caseItem: updatedCaseItem,\n    currentUser,\n    pdfVariant: "original",\n    pdfDoc,\n    appendPage,\n    suppressOutput,\n  });`,
    "appeal-aware final renderer passthrough"
  );

  fs.writeFileSync(addonPath, source, "utf8");
}

function patchBulkRenderer() {
  let source = fs.readFileSync(bulkPath, "utf8");
  if (source.includes(marker)) return;

  const officialImportMatch = source.match(/import \{[^\n]*generateOfficialCaseDetailPdf[^\n]*\} from "\.\/caseDetailOfficialPdf";/);
  if (!officialImportMatch) {
    throw new Error("Bulk Main PDF parity v28 official renderer import not found");
  }
  source = source.replace(
    officialImportMatch[0],
    `${officialImportMatch[0]}\nimport { generateCasePdfWithAppealHistory } from "./caseAppealPdfAddon";\n// ${marker}`
  );

  const renderCall = `      await generateOfficialCaseDetailPdf({\n        caseItem,\n        currentUser,\n        pdfVariant: useAppeal ? "appeal" : "original",\n        pdfDoc: doc,\n        appendPage: hasWrittenContent,\n        suppressOutput: true,\n      });`;
  const parityCall = `      // Generate the exact same current Main PDF content used by Case Detail.\n      // Appeal-aware transformation stays centralized in caseAppealPdfAddon.\n      await generateCasePdfWithAppealHistory({\n        caseItem: sourceCase,\n        currentUser,\n        pdfVariant: useAppeal ? "appeal" : "original",\n        fallback: generateOfficialCaseDetailPdf,\n        pdfDoc: doc,\n        appendPage: hasWrittenContent,\n        suppressOutput: true,\n      });`;

  source = replaceOnce(source, renderCall, parityCall, "bulk Case renderer call");

  fs.writeFileSync(bulkPath, source, "utf8");
}

function patchWeeklyCaseDateSource(filePath, fileLabel, expectedReplacements) {
  let source = fs.readFileSync(filePath, "utf8");
  if (source.includes(`// ${weeklyCaseDateMarker}`)) return;

  let replacementCount = 0;
  const replaceWeekAssignment = (pattern) => {
    source = source.replace(pattern, (_match, indent) => {
      replacementCount += 1;
      return `${indent}// ${weeklyCaseDateMarker}\n${indent}weekLabel: getWeekLabelFromAuditDate(auditDateObj),`;
    });
  };

  replaceWeekAssignment(
    /^(\s*)weekLabel:\s*String\(v8Helper\.getValue\(row,\s*"Week(?: Label)?"\)\s*\|\|\s*v8Helper\.getValue\(row,\s*"Week(?: Label)?"\)\s*\|\|\s*"-"\)\.trim\(\),\s*$/gm
  );

  replaceWeekAssignment(
    /^(\s*)weekLabel:\s*String\(weekLabel\s*\|\|\s*"-"\)\.trim\(\),\s*$/gm
  );

  if (replacementCount < expectedReplacements) {
    throw new Error(
      `Weekly Case Date v29 expected at least ${expectedReplacements} replacement(s) in ${fileLabel}, found ${replacementCount}.`
    );
  }

  fs.writeFileSync(filePath, source, "utf8");
}

function patchWeeklyCaseDateLogic() {
  patchWeeklyCaseDateSource(dashboardPath, "DashboardMockup.tsx", 2);
  patchWeeklyCaseDateSource(summaryPath, "SummaryMockup.tsx", 1);
}

function patchDashboardPeriodMasterFilter() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(`// ${periodMasterMarker}`)) return;

  source = replaceOnce(
    source,
    `  const dateFilteredCases = useMemo(() => {\n    if (selectedMonthKey && selectedMonthKey !== "all") {`,
    `  // ${periodMasterMarker}\n  const dateFilteredCases = useMemo(() => {\n    // A selected Week is the master Period. Do not pre-filter it by Month/Year/date range.\n    // This keeps cross-month weeks such as 31/08/2026 - 06/09/2026 complete.\n    if (selectedWeek !== "all") {\n      return agentCases;\n    }\n\n    if (selectedMonthKey && selectedMonthKey !== "all") {`,
    "Dashboard Period master start"
  );

  source = replaceOnce(
    source,
    `  }, [agentCases, dateFrom, dateTo, selectedMonthKey, selectedYear]);`,
    `  }, [agentCases, dateFrom, dateTo, selectedMonthKey, selectedYear, selectedWeek]);`,
    "Dashboard Period master dependencies"
  );

  fs.writeFileSync(dashboardPath, source, "utf8");
}

function patchSummaryPeriodMasterSync() {
  let source = fs.readFileSync(summaryPath, "utf8");
  if (source.includes(`// ${periodMasterMarker}`)) return;

  const oldWeeklySync = `    if (analysisMode === "weekly") {\n      const matchedCase = allCases.find((item) => item.weekLabel === activeUnifiedPeriodKey);\n      if (matchedCase?.monthKey) onSelectedMonthChange?.(matchedCase.monthKey);\n      if (matchedCase?.yearKey) onSelectedYearChange?.(matchedCase.yearKey);\n      onSelectedWeekChange?.(activeUnifiedPeriodKey);\n      return;\n    }`;

  const newWeeklySync = `    // ${periodMasterMarker}\n    if (analysisMode === "weekly") {\n      const matchedCase = allCases.find((item) => item.weekLabel === activeUnifiedPeriodKey);\n      // Weekly Period owns the scope. Clear Month so cross-month weeks are never cut down.\n      onSelectedMonthChange?.("all");\n      if (matchedCase?.yearKey) onSelectedYearChange?.(matchedCase.yearKey);\n      onSelectedWeekChange?.(activeUnifiedPeriodKey);\n      return;\n    }`;

  source = replaceOnce(source, oldWeeklySync, newWeeklySync, "Summary Weekly Period sync");
  fs.writeFileSync(summaryPath, source, "utf8");
}

function patchCurrentPeriodAsMaster() {
  patchDashboardPeriodMasterFilter();
  patchSummaryPeriodMasterSync();
}

patchAppealAwareRenderer();
patchBulkRenderer();
patchWeeklyCaseDateLogic();
patchCurrentPeriodAsMaster();
console.log("Patched Weekly Case Date and made the selected Time View Period the master filter for Dashboard, Agent Performance, Current View and Details.");
