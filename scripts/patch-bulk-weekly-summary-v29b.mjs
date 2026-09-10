import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bulkPath = path.resolve(__dirname, "../src/bulkCaseDetailPdf.ts");
const dashboardPath = path.resolve(__dirname, "../src/DashboardMockup.tsx");
const marker = "bulk-weekly-summary-v29b";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Weekly summary patch anchor missing: ${label}`);
  return source.replace(before, after);
}

function patchBulk() {
  let source = fs.readFileSync(bulkPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("bulk-main-pdf-appeal-parity-v28")) {
    throw new Error("Bulk Main PDF parity v28 must run before weekly summary patch");
  }

  const importAnchor = 'import { appendFinalSignedReportForAgent, loadFinalSignedDocumentIndex } from "./finalSignedCasePdf";';
  source = replaceOnce(
    source,
    importAnchor,
    `${importAnchor}\nimport { appendWeeklyCaseSummaryForAgent } from "./weeklyCaseSummaryPdf";\n// ${marker}`,
    "weekly summary import"
  );

  source = replaceOnce(
    source,
    `  monthKey: string;\n  onProgress?: (done: number, total: number) => void;`,
    `  monthKey: string;\n  weekLabel?: string;\n  onProgress?: (done: number, total: number) => void;`,
    "bulk input weekLabel"
  );

  source = replaceOnce(
    source,
    `  currentUser,\n  monthKey,\n  onProgress,`,
    `  currentUser,\n  monthKey,\n  weekLabel = "",\n  onProgress,`,
    "bulk destructured weekLabel"
  );

  const oldLoad = `  const { index: finalSignedIndex, allMonthRows } = await loadFinalSignedDocumentIndex(monthKey).catch((error) => {\n    console.warn("Load Final Signed PDF data failed", error);\n    return { index: new Map(), allMonthRows: [] };\n  });\n  const missingSignedAgents: string[] = [];`;
  const newLoad = `  const isWeeklyExport = Boolean(String(weekLabel || "").trim());\n  const { index: finalSignedIndex, allMonthRows } = isWeeklyExport\n    ? { index: new Map(), allMonthRows: [] }\n    : await loadFinalSignedDocumentIndex(monthKey).catch((error) => {\n        console.warn("Load Final Signed PDF data failed", error);\n        return { index: new Map(), allMonthRows: [] };\n      });\n  const missingSignedAgents: string[] = [];`;
  source = replaceOnce(source, oldLoad, newLoad, "skip Monthly Signature source for Weekly export");

  source = replaceOnce(
    source,
    `  for (const group of groups) {\n    // bulk-case-pdf-signature-match-v11`,
    `  for (const group of groups) {\n    if (isWeeklyExport) {\n      const appendedWeeklySummary = appendWeeklyCaseSummaryForAgent({\n        doc,\n        cases: group.cases,\n        monthKey,\n        weekLabel,\n        agentName: group.agentName,\n        appendPage: hasWrittenContent,\n      });\n      if (appendedWeeklySummary) hasWrittenContent = true;\n    }\n\n    // bulk-case-pdf-signature-match-v11`,
    "prepend Weekly summary per Agent"
  );

  const monthlySignatureBlock = `    // bulk-case-pdf-signature-fallback-v10\n    // Signature Center documents are generated from monthly Agent data even before\n    // anyone signs. Firestore may therefore have no stored signature row yet.\n    // Build a synthetic empty signature document in that case so every Agent still\n    // gets the Signature/Final Signed cover before their Case Detail pages.\n    const signatureDocument = storedDocument || {\n      docId: \`${'${monthKey}'}::${'${group.agentName}'}\`,\n      entries: [],\n      confirmedAt: "",\n      updatedAt: "",\n    };\n    const referenceMonthRows = storedDocument\n      ? allMonthRows\n      : [...allMonthRows, signatureDocument];\n    const appended = await appendFinalSignedReportForAgent({\n      doc,\n      cases: group.cases,\n      monthKey,\n      agentName: group.agentName,\n      storedDocument: signatureDocument,\n      allMonthRows: referenceMonthRows,\n      appendPage: hasWrittenContent,\n    });\n    if (appended) hasWrittenContent = true;`;

  const gatedMonthlySignatureBlock = `    if (!isWeeklyExport) {\n      // bulk-case-pdf-signature-fallback-v10\n      // Monthly exports keep the existing Signature/Final Signed cover.\n      const signatureDocument = storedDocument || {\n        docId: \`${'${monthKey}'}::${'${group.agentName}'}\`,\n        entries: [],\n        confirmedAt: "",\n        updatedAt: "",\n      };\n      const referenceMonthRows = storedDocument\n        ? allMonthRows\n        : [...allMonthRows, signatureDocument];\n      const appended = await appendFinalSignedReportForAgent({\n        doc,\n        cases: group.cases,\n        monthKey,\n        agentName: group.agentName,\n        storedDocument: signatureDocument,\n        allMonthRows: referenceMonthRows,\n        appendPage: hasWrittenContent,\n      });\n      if (appended) hasWrittenContent = true;\n    }`;

  source = replaceOnce(
    source,
    monthlySignatureBlock,
    gatedMonthlySignatureBlock,
    "gate Monthly Signature cover during Weekly export"
  );

  fs.writeFileSync(bulkPath, source, "utf8");
}

function patchDashboard() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("bulk-case-pdf-weekly-v4")) {
    throw new Error("Weekly Gen All Case PDF v4 must run before weekly summary patch");
  }

  source = replaceOnce(
    source,
    `        monthKey: bulkCasePdfExportMonthKey,\n        onProgress:`,
    `        monthKey: bulkCasePdfExportMonthKey,\n        weekLabel: isWeeklyCasePdfView ? selectedWeek : "",\n        onProgress:`,
    "pass selected Week to bulk PDF"
  );

  source = source.replace(
    `console.error(mode === "my" ? "Gen My Case PDF failed:" : "Gen All Case PDF failed:", error);`,
    `// ${marker}\n      console.error(mode === "my" ? "Gen My Case PDF failed:" : "Gen All Case PDF failed:", error);`
  );

  fs.writeFileSync(dashboardPath, source, "utf8");
}

patchBulk();
patchDashboard();
console.log("Patched Weekly Gen PDF to use Weekly QA Dashboard summaries instead of Monthly Final Signed pages.");
