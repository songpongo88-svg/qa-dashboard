import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signaturePath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");
const finalPath = path.resolve(__dirname, "../src/finalSignedCasePdf.ts");
const marker = "final-signed-shared-renderer-v12";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

function patchSignatureCenter() {
  let source = fs.readFileSync(signaturePath, "utf8");
  if (source.includes(marker)) return;

  const importAnchor = 'import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";';
  source = replaceOnce(
    source,
    importAnchor,
    `${importAnchor}\nimport { renderFinalSignedPdf } from "./finalSignedPdfRenderer";\n// ${marker}`,
    "Signature Center renderer import"
  );

  const functionAnchor = `  const generatePdf = async () => {\n    if (!selectedDocument) return;\n    const entries = effectiveEntriesForDoc(selectedDocument, signatures);`;
  const functionReplacement = `  const generatePdf = async () => {\n    if (!selectedDocument) return;\n    {\n      // ${marker}\n      // Final Signed and Case bulk export intentionally use the exact same renderer.\n      const sharedEntries = effectiveEntriesForDoc(selectedDocument, signatures);\n      const sharedIncentive = getDocumentIncentive(selectedDocument);\n      const sharedDocumentRef = getMonthlyDocumentRef(selectedDocument, documents);\n      const sharedResult = await renderFinalSignedPdf({\n        document: selectedDocument,\n        entries: sharedEntries,\n        incentive: sharedIncentive,\n        documentRef: sharedDocumentRef,\n        roleSignerNames: {\n          QA: getRoleSigner(selectedDocument, \"QA\"),\n          Supervisor: getRoleSigner(selectedDocument, \"Supervisor\"),\n          Senior: getRoleSigner(selectedDocument, \"Senior\"),\n          Agent: getRoleSigner(selectedDocument, \"Agent\"),\n        },\n      });\n      downloadBlob(sharedResult.pdf.output(\"blob\"), sharedResult.fileName);\n      setPdfMessage(\`Generated \${sharedResult.fileName}\`);\n      window.setTimeout(() => setPdfMessage(\"\"), 3500);\n      return;\n    }\n    const entries = effectiveEntriesForDoc(selectedDocument, signatures);`;
  source = replaceOnce(source, functionAnchor, functionReplacement, "Signature Center generatePdf start");

  fs.writeFileSync(signaturePath, source, "utf8");
}

function patchBulkFinalRenderer() {
  let source = fs.readFileSync(finalPath, "utf8");
  if (source.includes(marker)) return;

  const importAnchor = 'import { getIncentiveByGrade, scoreToGrade } from "./lib/scoreIncentivePolicy";';
  source = replaceOnce(
    source,
    importAnchor,
    `${importAnchor}\nimport { renderFinalSignedPdf, type FinalSignedEntry, type FinalSignedRole } from "./finalSignedPdfRenderer";\n// ${marker}`,
    "Bulk Final Signed renderer import"
  );

  const start = source.indexOf("export async function appendFinalSignedReportForAgent({");
  if (start < 0) throw new Error("Missing appendFinalSignedReportForAgent function");
  const bodyOpen = source.indexOf("}) {", start);
  if (bodyOpen < 0) throw new Error("Missing appendFinalSignedReportForAgent body");
  const insertAt = bodyOpen + 4;

  const delegate = `\n  // ${marker}\n  {\n    // This is the same renderer used by the Signature Center Final Signed PDF button.\n    const sortedCases = [...cases].sort((a, b) => {\n      const da = new Date(a?.caseDate || a?.auditDate || a?.auditTimestamp || \"\").getTime() || 0;\n      const db = new Date(b?.caseDate || b?.auditDate || b?.auditTimestamp || \"\").getTime() || 0;\n      return da - db || String(a?.caseId || \"\").localeCompare(String(b?.caseId || \"\"));\n    });\n    const averageScore = sortedCases.length\n      ? sortedCases.reduce((sum, item) => sum + Number(item?.finalScore || 0), 0) / sortedCases.length\n      : 0;\n    const monthlyGrade = scoreToGrade(averageScore, monthKey) as any;\n    const monthlyIncentive = sortedCases.length >= 10\n      ? getIncentiveByGrade(monthlyGrade, monthKey) as any\n      : { cash: 0, promo: 0, label: \"0 THB / No Incentive\" };\n\n    const firstCase = sortedCases[0] || {};\n    const storedEntries = Array.isArray(storedDocument?.entries)\n      ? storedDocument.entries.map((entry) => ({ ...entry })) as FinalSignedEntry[]\n      : [];\n    const entryMap = new Map(storedEntries.map((entry) => [entry.role, entry]));\n    const defaultQaName = monthKey === \"2026-01\" || monthKey === \"2026-02\"\n      ? \"Phommarin Thaithom\"\n      : \"Songpon Phothong\";\n    const roleSignerNames: Record<FinalSignedRole, string> = {\n      Agent: String(entryMap.get(\"Agent\")?.signerName || agentName || \"-\"),\n      Senior: String(\n        entryMap.get(\"Senior\")?.signerName ||\n        firstCase?.seniorName || firstCase?.teamLeadName || firstCase?.leadName || firstCase?.teamLead || \"-\"\n      ),\n      Supervisor: String(\n        entryMap.get(\"Supervisor\")?.signerName || firstCase?.supervisorName || \"Phrommarin Thaithorn\"\n      ),\n      QA: String(entryMap.get(\"QA\")?.signerName || firstCase?.qaName || defaultQaName),\n    };\n\n    if (monthKey <= \"2026-04\") {\n      const match = monthKey.match(/^(\\d{4})-(\\d{2})$/);\n      const paidAt = match\n        ? new Date(Number(match[1]), Number(match[2]), 15, 23, 59, 0).toISOString()\n        : \"\";\n      ([\"QA\", \"Supervisor\", \"Senior\", \"Agent\"] as FinalSignedRole[]).forEach((role) => {\n        if (entryMap.has(role)) return;\n        const historicalEntry: FinalSignedEntry = {\n          role,\n          signerName: roleSignerNames[role],\n          signedBy: \"System Historical Paid\",\n          signedAt: paidAt,\n          status: \"Signed\",\n        };\n        storedEntries.push(historicalEntry);\n        entryMap.set(role, historicalEntry);\n      });\n    }\n\n    const sharedCases = sortedCases.map((item) => {\n      const th = String(item?.inquiryTh || \"\").trim();\n      const en = String(item?.inquiryEn || \"\").trim();\n      const inquiry = String(item?.inquiry || \"\").trim() || [th, en ? \`(\${en})\` : \"\"].filter(Boolean).join(\" \") || \"-\";\n      return {\n        caseId: String(item?.caseId || \"-\"),\n        auditDate: String(item?.auditDate || item?.caseDate || \"-\"),\n        inquiry,\n        finalScore: Number(item?.finalScore || 0),\n        grade: String(item?.grade || scoreToGrade(Number(item?.finalScore || 0), monthKey)),\n        topics: activeTopics(item).map((topic) => ({\n          code: String(topic?.code || \"\"),\n          title: String(topic?.title || topic?.label || topic?.code || \"\"),\n          score: Number(topic?.score || 0),\n          max: Number(topic?.max || 0),\n        })),\n      };\n    });\n\n    const ref = documentRef(monthKey, agentName, allMonthRows);\n    await renderFinalSignedPdf({\n      document: {\n        monthKey,\n        monthLabel: String(firstCase?.monthLabel || monthKey),\n        agentName,\n        teamName: String(firstCase?.teamName || \"-\"),\n        caseCount: sharedCases.length,\n        averageScore,\n        grade: String(monthlyGrade),\n        cases: sharedCases,\n      },\n      entries: storedEntries,\n      incentive: monthlyIncentive,\n      documentRef: ref,\n      roleSignerNames,\n      pdfDoc: doc,\n      appendPage,\n    });\n    return true;\n  }\n`;

  source = source.slice(0, insertAt) + delegate + source.slice(insertAt);
  fs.writeFileSync(finalPath, source, "utf8");
}

patchSignatureCenter();
patchBulkFinalRenderer();
console.log("Patched Signature Center and Case bulk PDF to use one shared Final Signed renderer.");
