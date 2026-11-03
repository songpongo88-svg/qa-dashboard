import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signaturePath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");
const finalPath = path.resolve(__dirname, "../src/finalSignedCasePdf.ts");
const marker = "final-signed-direct-source-v13";
const signerMarker = "final-signed-bulk-signer-name-v13b";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

function patchSignatureCenterSource() {
  let source = fs.readFileSync(signaturePath, "utf8");
  if (!source.includes("final-signed-shared-renderer-v12")) {
    throw new Error("Shared Final Signed renderer v12 must run before v13");
  }

  if (!source.includes(marker)) {
    const anchor = "function mergeSignatureDocuments(existing: SignatureDocument, incoming: SignatureDocument): SignatureDocument {";
    const helper = `// ${marker}\nexport async function loadSignatureCenterFinalSignedSource(\n  monthKey: string,\n  agentName: string,\n  accounts: UserAccountSnapshot[] = []\n) {\n  const documents = await loadCanonicalSignatureDocuments(accounts);\n\n  const targetKey = canonicalAgentIdentityKey(agentName);\n  const selectedDocument = documents.find((doc) =>\n    doc.monthKey === monthKey && canonicalAgentIdentityKey(doc.agentName) === targetKey\n  );\n  if (!selectedDocument) return null;\n\n  const storedDocs = await fetchStoredSignatureDocuments().catch((error) => {\n    console.warn(\"Signature Center stored signatures skipped\", error);\n    return [];\n  });\n  const storedDocument = storedDocs.find((row) => row.docId === selectedDocument.id);\n  const signatureMap: Record<string, SignatureEntry[]> = storedDocument?.entries?.length\n    ? { [selectedDocument.id]: storedDocument.entries as SignatureEntry[] }\n    : {};\n  const entries = effectiveEntriesForDoc(selectedDocument, signatureMap);\n\n  return {\n    document: selectedDocument,\n    entries,\n    incentive: getDocumentIncentive(selectedDocument),\n    documentRef: getMonthlyDocumentRef(selectedDocument, documents),\n    roleSignerNames: {\n      QA: getRoleSigner(selectedDocument, \"QA\"),\n      Supervisor: getRoleSigner(selectedDocument, \"Supervisor\"),\n      Senior: getRoleSigner(selectedDocument, \"Senior\"),\n      Agent: getRoleSigner(selectedDocument, \"Agent\"),\n    },\n  };\n}\n\n`;

    const snapshotHelper = replaceOnce(
      helper,
      "  accounts: UserAccountSnapshot[] = []\n",
      "  accounts: UserAccountSnapshot[] = [],\n  signatureDocuments?: StoredSignatureDocument[]\n",
      "signature snapshot argument"
    );
    const resolvedHelper = replaceOnce(
      snapshotHelper,
      `  const storedDocs = await fetchStoredSignatureDocuments().catch((error) => {\n    console.warn("Signature Center stored signatures skipped", error);\n    return [];\n  });\n  const storedDocument = storedDocs.find((row) => row.docId === selectedDocument.id);`,
      `  const storedDocs = signatureDocuments ?? await fetchStoredSignatureDocuments();\n  const storedDocument = resolveMonthlySignatureDocument(storedDocs, monthKey, selectedDocument.agentName);`,
      "canonical signature lookup"
    );
    source = replaceOnce(source, anchor, resolvedHelper + anchor, "Signature Center source helper");
  }

  if (!source.includes(signerMarker)) {
    const oldReturn = `  return {\n    document: selectedDocument,\n    entries,\n    incentive: getDocumentIncentive(selectedDocument),\n    documentRef: getMonthlyDocumentRef(selectedDocument, documents),\n    roleSignerNames: {\n      QA: getRoleSigner(selectedDocument, \"QA\"),\n      Supervisor: getRoleSigner(selectedDocument, \"Supervisor\"),\n      Senior: getRoleSigner(selectedDocument, \"Senior\"),\n      Agent: getRoleSigner(selectedDocument, \"Agent\"),\n    },\n  };`;
    const newReturn = `  const signedRoleName = (role: SignRole) => {\n    const signedEntry = entries.find((entry) => entry.role === role && entry.status === \"Signed\");\n    return normalizeText(signedEntry?.signerName || signedEntry?.signedBy) || getRoleSigner(selectedDocument, role);\n  };\n\n  // ${signerMarker}\n  // Gen All must print the same signer name as the stored signature image.\n  // Only fall back to the role-derived name when there is no completed signed entry.\n  return {\n    document: selectedDocument,\n    entries,\n    incentive: getDocumentIncentive(selectedDocument),\n    documentRef: getMonthlyDocumentRef(selectedDocument, documents),\n    roleSignerNames: {\n      QA: signedRoleName(\"QA\"),\n      Supervisor: signedRoleName(\"Supervisor\"),\n      Senior: signedRoleName(\"Senior\"),\n      Agent: signedRoleName(\"Agent\"),\n    },\n  };`;
    source = replaceOnce(source, oldReturn, newReturn, "bulk Final Signed signer-name source");
  }

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
console.log("Patched bulk Case PDF to use the exact Signature Center Final Signed source and stored signer names.");
