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
const weeklyMonthBoundaryMarker = "weekly-month-boundary-v30";

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

  // Never trust a persisted Week / Week Label column for Weekly reporting.
  // auditDateObj in these loaders is intentionally built from Case Date.
  replaceWeekAssignment(
    /^(\s*)weekLabel:\s*String\(v8Helper\.getValue\(row,\s*"Week(?: Label)?"\)\s*\|\|\s*v8Helper\.getValue\(row,\s*"Week(?: Label)?"\)\s*\|\|\s*"-"\)\.trim\(\),\s*$/gm
  );

  // RawData loader keeps a local weekLabel value from Excel; recompute it from Case Date instead.
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
  // Dashboard: V8/effective source + RawData source.
  patchWeeklyCaseDateSource(dashboardPath, "DashboardMockup.tsx", 2);
  // Summary / Compare / Ranking / Trend: V8/effective source.
  patchWeeklyCaseDateSource(summaryPath, "SummaryMockup.tsx", 1);
}

function patchMonthClippedWeeklyRanges(filePath, fileLabel) {
  let source = fs.readFileSync(filePath, "utf8");
  if (source.includes(`// ${weeklyMonthBoundaryMarker}`)) return;

  const oldHelper = `function getWeekLabelFromAuditDate(date: Date | null) {\n  if (!date) return "-";\n  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());\n  const day = start.getDay();\n  const mondayOffset = day === 0 ? -6 : 1 - day;\n  start.setDate(start.getDate() + mondayOffset);\n  const end = new Date(start);\n  end.setDate(start.getDate() + 6);\n  const format = (item: Date) =>\n    \`${String.raw`\${String(item.getDate()).padStart(2, "0")}/\${String(item.getMonth() + 1).padStart(2, "0")}/\${item.getFullYear()}`}\`;\n  return \`${String.raw`\${format(start)} - \${format(end)}`}\`;\n}`;

  const newHelper = `// ${weeklyMonthBoundaryMarker}\nfunction getWeekLabelFromAuditDate(date: Date | null) {\n  if (!date) return "-";\n\n  const caseDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());\n  const start = new Date(caseDate);\n  const day = start.getDay();\n  const mondayOffset = day === 0 ? -6 : 1 - day;\n  start.setDate(start.getDate() + mondayOffset);\n\n  const end = new Date(start);\n  end.setDate(start.getDate() + 6);\n\n  // Weekly reporting must never pull a Case Date from another month.\n  // Example: September Week 1 is 01/09-06/09, while 31/08 stays in August.\n  const monthStart = new Date(caseDate.getFullYear(), caseDate.getMonth(), 1);\n  const monthEnd = new Date(caseDate.getFullYear(), caseDate.getMonth() + 1, 0);\n  if (start.getTime() < monthStart.getTime()) start.setTime(monthStart.getTime());\n  if (end.getTime() > monthEnd.getTime()) end.setTime(monthEnd.getTime());\n\n  const format = (item: Date) =>\n    \`${String.raw`\${String(item.getDate()).padStart(2, "0")}/\${String(item.getMonth() + 1).padStart(2, "0")}/\${item.getFullYear()}`}\`;\n  return \`${String.raw`\${format(start)} - \${format(end)}`}\`;\n}`;

  if (!source.includes(oldHelper)) {
    throw new Error(`Weekly month-boundary v30 helper anchor not found in ${fileLabel}.`);
  }

  source = source.replace(oldHelper, newHelper);
  fs.writeFileSync(filePath, source, "utf8");
}

function patchWeeklyMonthBoundaries() {
  patchMonthClippedWeeklyRanges(dashboardPath, "DashboardMockup.tsx");
  patchMonthClippedWeeklyRanges(summaryPath, "SummaryMockup.tsx");
}

patchAppealAwareRenderer();
patchBulkRenderer();
patchWeeklyCaseDateLogic();
patchWeeklyMonthBoundaries();
console.log("Patched Weekly reporting to use Case Date and keep each week inside its reporting month.");
