import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bulkPath = path.resolve(__dirname, "../src/bulkCaseDetailPdf.ts");
const marker = "bulk-case-pdf-signature-fallback-v10";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

let source = fs.readFileSync(bulkPath, "utf8");
if (!source.includes(marker)) {
  if (!source.includes("bulk-case-pdf-final-signed-any-status-v9")) {
    throw new Error("Final Signed any-status patch v9 must run before v10");
  }

  const before = `    if (storedDocument) {\n      const appended = await appendFinalSignedReportForAgent({\n        doc,\n        cases: group.cases,\n        monthKey,\n        agentName: group.agentName,\n        storedDocument,\n        allMonthRows,\n        appendPage: hasWrittenContent,\n      });\n      if (appended) hasWrittenContent = true;\n    } else {\n      missingSignedAgents.push(group.agentName);\n    }`;

  const after = `    // ${marker}\n    // Signature Center documents are generated from monthly Agent data even before\n    // anyone signs. Firestore may therefore have no stored signature row yet.\n    // Build a synthetic empty signature document in that case so every Agent still\n    // gets the Signature/Final Signed cover before their Case Detail pages.\n    const signatureDocument = storedDocument || {\n      docId: \`${'${monthKey}'}::${'${group.agentName}'}\`,\n      entries: [],\n      confirmedAt: \"\",\n      updatedAt: \"\",\n    };\n    const referenceMonthRows = storedDocument\n      ? allMonthRows\n      : [...allMonthRows, signatureDocument];\n    const appended = await appendFinalSignedReportForAgent({\n      doc,\n      cases: group.cases,\n      monthKey,\n      agentName: group.agentName,\n      storedDocument: signatureDocument,\n      allMonthRows: referenceMonthRows,\n      appendPage: hasWrittenContent,\n    });\n    if (appended) hasWrittenContent = true;`;

  source = replaceOnce(source, before, after, "Signature fallback block");
  fs.writeFileSync(bulkPath, source, "utf8");
}

console.log("Patched bulk Case PDF to always prepend a Signature page for each Agent, even before any signature is stored.");
