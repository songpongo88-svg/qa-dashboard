import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bulkPath = path.resolve(__dirname, "../src/bulkCaseDetailPdf.ts");
const marker = "bulk-case-pdf-signature-match-v11";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

let source = fs.readFileSync(bulkPath, "utf8");
if (!source.includes(marker)) {
  if (!source.includes("bulk-case-pdf-signature-fallback-v10")) {
    throw new Error("Signature fallback patch v10 must run before v11");
  }

  const finalImport = 'import { appendFinalSignedReportForAgent, loadFinalSignedDocumentIndex } from "./finalSignedCasePdf";';
  source = replaceOnce(
    source,
    finalImport,
    `${finalImport}\nimport { canonicalAgentIdentityKey } from "./lib/agentIdentity";\n// ${marker}`,
    "canonical identity import"
  );

  const oldLookup = `    const normalizedAgent = group.agentName.toLowerCase().replace(/\\s+/g, " ");\n    let storedDocument = finalSignedIndex.get(normalizedAgent);\n    if (!storedDocument) {\n      storedDocument = [...finalSignedIndex.entries()]\n        .find(([key]) => key === normalizedAgent || key.includes(normalizedAgent) || normalizedAgent.includes(key))?.[1];\n    }`;

  const newLookup = `    // ${marker}\n    // Signature Center stores documents under canonical Agent identities.\n    // Use the same canonical identity function here so historical signed rows\n    // (for example July 2026) resolve to the real stored signature document\n    // instead of falling through to an empty synthetic cover.\n    const rawNormalizedAgent = group.agentName.toLowerCase().replace(/\\s+/g, " ").trim();\n    const normalizedAgent = canonicalAgentIdentityKey(group.agentName) || rawNormalizedAgent;\n    const compactAgent = normalizedAgent.replace(/[^a-z0-9ก-๙]/gi, "");\n    let storedDocument = finalSignedIndex.get(normalizedAgent);\n    if (!storedDocument) {\n      storedDocument = [...finalSignedIndex.entries()]\n        .find(([key, value]) => {\n          const candidateDocId = String(value?.docId || "");\n          const separatorIndex = candidateDocId.indexOf("::");\n          const candidateName = separatorIndex >= 0 ? candidateDocId.slice(separatorIndex + 2) : key;\n          const candidateIdentity = canonicalAgentIdentityKey(candidateName) || String(key || "").toLowerCase().replace(/\\s+/g, " ").trim();\n          const candidateCompact = candidateIdentity.replace(/[^a-z0-9ก-๙]/gi, "");\n          return (\n            candidateIdentity === normalizedAgent ||\n            (compactAgent && candidateCompact === compactAgent) ||\n            candidateIdentity.includes(normalizedAgent) ||\n            normalizedAgent.includes(candidateIdentity)\n          );\n        })?.[1];\n    }`;

  source = replaceOnce(source, oldLookup, newLookup, "stored Signature Agent lookup");
  fs.writeFileSync(bulkPath, source, "utf8");
}

console.log("Patched bulk Case PDF to match stored Signature documents using the same canonical Agent identity as Signature Center.");
