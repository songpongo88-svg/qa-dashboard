import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signatureCenterPath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");
const marker = "signature-resigned-carry-forward-v19";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

let source = fs.readFileSync(signatureCenterPath, "utf8");
if (!source.includes(marker)) {
  source = replaceOnce(
    source,
    'const AUTO_RESIGNED_WAIVER_SIGNER = "System – User Sync";',
    'const AUTO_RESIGNED_WAIVER_SIGNER = "System – User Sync";\nconst RESIGNED_SIGNATURE_CARRY_FORWARD_AGENT = "Supakrit Promkhamnoi";\nconst RESIGNED_SIGNATURE_CARRY_FORWARD_MONTH = "2026-08";\n// signature-resigned-carry-forward-v19',
    "carry-forward constants"
  );

  source = replaceOnce(
    source,
    '      for (const document of documents) {\n        if (isHistoricalPaidPeriod(document.monthKey) || !isAfterAppealPeriod(document.monthKey)) continue;',
    '      for (const document of documents) {\n        const autoCarryForwardResignedAgent =\n          document.monthKey === RESIGNED_SIGNATURE_CARRY_FORWARD_MONTH &&\n          isSamePerson(document.agentName, RESIGNED_SIGNATURE_CARRY_FORWARD_AGENT);\n        if (\n          isHistoricalPaidPeriod(document.monthKey) ||\n          (!autoCarryForwardResignedAgent && !isAfterAppealPeriod(document.monthKey))\n        ) continue;',
    "resigned sync eligibility"
  );

  const oldAgentBlock = `        const entries = effectiveEntriesForDoc(document, signatures);\n        if (getSignedEntry(entries, "Agent")) continue;\n        if (!( ["QA", "Supervisor", "Senior"] as SignRole[]).every((role) => Boolean(getSignedEntry(entries, role)))) continue;\n\n        const resignationDate = getAccountSuspensionDate(account);\n        const existingWaiver = getWaivedEntry(entries, "Agent");`;

  const newAgentBlock = `        const entries = effectiveEntriesForDoc(document, signatures);\n        if (getSignedEntry(entries, "Agent")) continue;\n\n        const resignationDate = getAccountSuspensionDate(account);\n\n        if (autoCarryForwardResignedAgent) {\n          const [yearValue, monthValue] = document.monthKey.split("-").map(Number);\n          const previousMonthDate = new Date(yearValue, monthValue - 2, 1);\n          const previousMonthKey = \`${'${previousMonthDate.getFullYear()}'}-${'${String(previousMonthDate.getMonth() + 1).padStart(2, "0")}'}\`;\n          const previousDocument = documents.find((candidate) =>\n            candidate.monthKey === previousMonthKey &&\n            isSamePerson(candidate.agentName, document.agentName)\n          );\n          const previousAgentSignature = previousDocument\n            ? getSignedEntry(effectiveEntriesForDoc(previousDocument, signatures), "Agent")\n            : undefined;\n\n          if (previousAgentSignature?.signatureDataUrl) {\n            const carriedForwardEntry: SignatureEntry = {\n              ...previousAgentSignature,\n              role: "Agent",\n              signerName: document.agentName,\n              status: "Signed",\n              signedBy: previousAgentSignature.signedBy || previousAgentSignature.signerName || document.agentName,\n              signedAt: previousAgentSignature.signedAt,\n              note: \`Auto carried forward from ${'${previousMonthKey}'} for resigned Agent; original signing date preserved\`,\n              resignationDate,\n            };\n            const nextEntries = [...entries.filter((entry) => entry.role !== "Agent"), carriedForwardEntry];\n            try {\n              await persistDocumentSignatures(document.id, nextEntries, confirmedDocs[document.id] || "");\n              updates.set(document.id, nextEntries);\n              continue;\n            } catch (error) {\n              console.warn(\`Auto carry-forward resigned signature failed for ${'${document.agentName}'}\`, error);\n            }\n          }\n        }\n\n        if (!( ["QA", "Supervisor", "Senior"] as SignRole[]).every((role) => Boolean(getSignedEntry(entries, role)))) continue;\n\n        const existingWaiver = getWaivedEntry(entries, "Agent");`;

  source = replaceOnce(source, oldAgentBlock, newAgentBlock, "resigned Agent signature block");

  fs.writeFileSync(signatureCenterPath, source, "utf8");
}

console.log("Patched Signature Center: Supakrit Promkhamnoi August 2026 automatically carries the signed Agent signature from July 2026, preserving the original signing date.");
