import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bulkPath = path.resolve(__dirname, "../src/bulkCaseDetailPdf.ts");
const dashboardPath = path.resolve(__dirname, "../src/DashboardMockup.tsx");
const marker = "bulk-case-pdf-final-signed-v8";

function patchBulk() {
  let source = fs.readFileSync(bulkPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("case-pdf-page-numbers-v7")) {
    throw new Error("Page-number patch v7 must run before Final Signed bulk patch v8");
  }

  const importAnchor = 'import { addOfficialPdfPageNumbers, generateOfficialCaseDetailPdf } from "./caseDetailOfficialPdf";';
  if (!source.includes(importAnchor)) throw new Error("Missing bulk PDF official import anchor");
  source = source.replace(
    importAnchor,
    `${importAnchor}\nimport { appendFinalSignedReportForAgent, isFinalSignedDocument, loadFinalSignedDocumentIndex } from "./finalSignedCasePdf";\n// ${marker}`
  );

  const loopStart = '  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });';
  const monthAnchor = '  const monthLabel = orderedCases.find((item) => String(item?.monthLabel || "").trim())?.monthLabel || monthKey;';
  const startIndex = source.indexOf(loopStart);
  const monthIndex = source.indexOf(monthAnchor);
  if (startIndex < 0 || monthIndex < 0 || monthIndex <= startIndex) {
    throw new Error("Missing bulk PDF render loop anchors");
  }

  const newBlock = `  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });\n  const { index: finalSignedIndex, allMonthRows } = await loadFinalSignedDocumentIndex(monthKey).catch((error) => {\n    console.warn("Load Final Signed PDF data failed", error);\n    return { index: new Map(), allMonthRows: [] };\n  });\n  const missingSignedAgents: string[] = [];\n\n  const agentGroups = new Map<string, { agentName: string; cases: any[] }>();\n  orderedCases.forEach((item) => {\n    const agentName = String(item?.agent || "").trim() || "Unknown Agent";\n    const key = agentName.toLowerCase().replace(/\\s+/g, " ");\n    const group = agentGroups.get(key) || { agentName, cases: [] };\n    group.cases.push(item);\n    agentGroups.set(key, group);\n  });\n  const groups = [...agentGroups.values()].sort((a, b) => a.agentName.localeCompare(b.agentName, "th"));\n\n  let hasWrittenContent = false;\n  let completedCases = 0;\n  for (const group of groups) {\n    const normalizedAgent = group.agentName.toLowerCase().replace(/\\s+/g, " ");\n    let storedDocument = finalSignedIndex.get(normalizedAgent);\n    if (!storedDocument) {\n      storedDocument = [...finalSignedIndex.entries()]\n        .find(([key]) => key === normalizedAgent || key.includes(normalizedAgent) || normalizedAgent.includes(key))?.[1];\n    }\n\n    if (storedDocument && isFinalSignedDocument(storedDocument)) {\n      const appended = await appendFinalSignedReportForAgent({\n        doc,\n        cases: group.cases,\n        monthKey,\n        agentName: group.agentName,\n        storedDocument,\n        allMonthRows,\n        appendPage: hasWrittenContent,\n      });\n      if (appended) hasWrittenContent = true;\n    } else {\n      missingSignedAgents.push(group.agentName);\n    }\n\n    const groupCases = [...group.cases].sort((left, right) => {\n      const dateDiff = caseDateValue(left) - caseDateValue(right);\n      if (dateDiff) return dateDiff;\n      return normalizeCaseId(left?.caseId).localeCompare(normalizeCaseId(right?.caseId));\n    });\n\n    for (const sourceCase of groupCases) {\n      const useAppeal = hasAppeal(sourceCase);\n      const caseItem = useAppeal ? prepareLatestAppealCase(sourceCase) : sourceCase;\n\n      await generateOfficialCaseDetailPdf({\n        caseItem,\n        currentUser,\n        pdfVariant: useAppeal ? "appeal" : "original",\n        pdfDoc: doc,\n        appendPage: hasWrittenContent,\n        suppressOutput: true,\n      });\n\n      hasWrittenContent = true;\n      completedCases += 1;\n      onProgress?.(completedCases, orderedCases.length);\n      if (completedCases % 8 === 0) {\n        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));\n      }\n    }\n  }\n\n`;

  source = source.slice(0, startIndex) + newBlock + source.slice(monthIndex);

  const returnAnchor = '    caseCount: orderedCases.length,\n  };';
  if (!source.includes(returnAnchor)) throw new Error("Missing bulk PDF return anchor");
  source = source.replace(
    returnAnchor,
    '    caseCount: orderedCases.length,\n    missingSignedAgents,\n  };'
  );

  fs.writeFileSync(bulkPath, source, "utf8");
}

function patchDashboard() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("case-pdf-agent-center-filename-v6")) {
    throw new Error("Agent filename patch v6 must run before Final Signed bulk patch v8");
  }

  const progressAnchor = '      setBulkCasePdfProgress(`${result.caseCount}/${result.caseCount}`);';
  if (!source.includes(progressAnchor)) throw new Error("Missing Dashboard bulk PDF completion anchor");
  source = source.replace(
    progressAnchor,
    `${progressAnchor}\n      // ${marker}\n      if (Array.isArray(result.missingSignedAgents) && result.missingSignedAgents.length) {\n        window.alert(\`Gen PDF สำเร็จ แต่ไม่พบ FINAL Final Signed PDF ที่ลงนามครบสำหรับ: \\n- \${result.missingSignedAgents.join("\\n- ")}\\n\\nระบบข้ามเฉพาะ Signed PDF และยังรวม Case ของ Agent เหล่านี้ตามปกติ\`);\n      }`
  );
  fs.writeFileSync(dashboardPath, source, "utf8");
}

patchBulk();
patchDashboard();
console.log("Patched bulk Case PDF with one Final Signed report before each Agent group.");
