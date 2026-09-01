import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signaturePath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");
const finalPath = path.resolve(__dirname, "../src/finalSignedCasePdf.ts");
const marker = "final-signed-direct-source-v13";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

function patchSignatureCenterSource() {
  let source = fs.readFileSync(signaturePath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("final-signed-shared-renderer-v12")) {
    throw new Error("Shared Final Signed renderer v12 must run before v13");
  }

  const anchor = "function mergeSignatureDocuments(existing: SignatureDocument, incoming: SignatureDocument): SignatureDocument {";
  const helper = `// ${marker}\nexport async function loadSignatureCenterFinalSignedSource(\n  monthKey: string,\n  agentName: string,\n  accounts: UserAccountSnapshot[] = []\n) {\n  const loadedDocs: SignatureDocument[] = [];\n  const rawAppealMap = await fetchSignatureRawAppealMap().catch((error) => {\n    console.warn(\"Signature Center raw appeal merge skipped\", error);\n    return new Map<string, SignatureApprovedAppeal>();\n  });\n  let approvedAppealMap = rawAppealMap;\n\n  if (!approvedAppealMap.size) {\n    const approvedAppealLogs = await fetchAppealEvents(\n      [\n        \"appeal_request_submitted\",\n        \"appeal_request_reviewed\",\n        \"appeal_request_reset\",\n      ],\n      { limit: 2000, forceRefresh: true }\n    ).catch((error) => {\n      console.warn(\"Signature Center approved appeal merge skipped\", error);\n      return [] as UsageLogEvent[];\n    });\n    approvedAppealMap = buildSignatureApprovedAppealMap(approvedAppealLogs as UsageLogEvent[]);\n  }\n\n  for (const fileName of RAW_DATA_FILES) {\n    try {\n      const response = await fetch(fileName, { cache: \"no-store\" });\n      if (!response.ok) continue;\n      const buffer = await response.arrayBuffer();\n      const workbook = XLSX.read(buffer, { type: \"array\", cellDates: true });\n      const sheet = workbook.Sheets[\"Raw_Data\"] || workbook.Sheets[workbook.SheetNames[0]];\n      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });\n      loadedDocs.push(...buildDocuments(rows, accounts, approvedAppealMap));\n    } catch (error) {\n      console.warn(\`Signature Center Final Signed source skipped: \${fileName}\`, error);\n    }\n  }\n\n  const storedEvaluations = await fetchStoredEvaluations(1000).catch((error) => {\n    console.warn(\"Signature Center stored evaluations skipped\", error);\n    return [] as StoredEvaluation[];\n  });\n  const rawMonthKeys = new Set(loadedDocs.map((doc) => doc.monthKey).filter(Boolean));\n  loadedDocs.push(\n    ...buildDocumentsFromStoredEvaluations(storedEvaluations, accounts, approvedAppealMap).filter(\n      (doc) => !rawMonthKeys.has(doc.monthKey)\n    )\n  );\n\n  const docMap = new Map<string, SignatureDocument>();\n  loadedDocs.forEach((doc) => {\n    const existing = docMap.get(doc.id);\n    docMap.set(doc.id, existing ? mergeSignatureDocuments(existing, doc) : doc);\n  });\n\n  const canonicalDocMap = new Map<string, SignatureDocument>();\n  Array.from(docMap.values()).forEach((doc) => {\n    const canonicalName = canonicalAgentName(doc.agentName);\n    const canonicalId = \`${'${doc.monthKey}'}::${'${canonicalName}'}\`;\n    const normalizedDoc = sortSignatureDocumentCases({ ...doc, id: canonicalId, agentName: canonicalName });\n    const existing = canonicalDocMap.get(canonicalId);\n    canonicalDocMap.set(canonicalId, existing ? mergeSignatureDocuments(existing, normalizedDoc) : normalizedDoc);\n  });\n\n  const documents = Array.from(canonicalDocMap.values())\n    .map(sortSignatureDocumentCases)\n    .sort((a, b) => b.monthKey.localeCompare(a.monthKey) || a.agentName.localeCompare(b.agentName, \"th\"));\n\n  const targetKey = canonicalAgentIdentityKey(agentName);\n  const selectedDocument = documents.find((doc) =>\n    doc.monthKey === monthKey && canonicalAgentIdentityKey(doc.agentName) === targetKey\n  );\n  if (!selectedDocument) return null;\n\n  const storedDocs = await fetchStoredSignatureDocuments().catch((error) => {\n    console.warn(\"Signature Center stored signatures skipped\", error);\n    return [];\n  });\n  const storedDocument = storedDocs.find((row) => row.docId === selectedDocument.id);\n  const signatureMap: Record<string, SignatureEntry[]> = storedDocument?.entries?.length\n    ? { [selectedDocument.id]: storedDocument.entries as SignatureEntry[] }\n    : {};\n  const entries = effectiveEntriesForDoc(selectedDocument, signatureMap);\n\n  return {\n    document: selectedDocument,\n    entries,\n    incentive: getDocumentIncentive(selectedDocument),\n    documentRef: getMonthlyDocumentRef(selectedDocument, documents),\n    roleSignerNames: {\n      QA: getRoleSigner(selectedDocument, \"QA\"),\n      Supervisor: getRoleSigner(selectedDocument, \"Supervisor\"),\n      Senior: getRoleSigner(selectedDocument, \"Senior\"),\n      Agent: getRoleSigner(selectedDocument, \"Agent\"),\n    },\n  };\n}\n\n`;

  source = replaceOnce(source, anchor, helper + anchor, "Signature Center source helper");
  fs.writeFileSync(signaturePath, source, "utf8");
}

function patchBulkToUseDirectSource() {
  let source = fs.readFileSync(finalPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("final-signed-shared-renderer-v12")) {
    throw new Error("Shared Final Signed renderer v12 must run before v13");
  }

  const anchor = `}) {\n  // final-signed-shared-renderer-v12`;
  const direct = `}) {\n  // ${marker}\n  {\n    // Never rebuild Final Signed from Dashboard Case fields.\n    // Load the exact Signature Center document source, then render it with the\n    // same Final Signed renderer used by the Signature Center button.\n    const { loadSignatureCenterFinalSignedSource } = await import(\"./SignatureCenterMockup\");\n    const finalSource = await loadSignatureCenterFinalSignedSource(monthKey, agentName);\n    if (!finalSource) return false;\n\n    await renderFinalSignedPdf({\n      document: finalSource.document,\n      entries: finalSource.entries,\n      incentive: finalSource.incentive,\n      documentRef: finalSource.documentRef,\n      roleSignerNames: finalSource.roleSignerNames,\n      pdfDoc: doc,\n      appendPage,\n    });\n    return true;\n  }\n  // final-signed-shared-renderer-v12`;

  source = replaceOnce(source, anchor, direct, "Bulk Final Signed direct-source entry");
  fs.writeFileSync(finalPath, source, "utf8");
}

patchSignatureCenterSource();
patchBulkToUseDirectSource();
console.log("Patched bulk Case PDF to use the exact Signature Center Final Signed source instead of rebuilding from Dashboard cases.");
