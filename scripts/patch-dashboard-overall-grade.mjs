import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetPath = path.resolve(__dirname, "../src/DashboardMockup.tsx");

let source = fs.readFileSync(targetPath, "utf8");
const marker = "dashboard-overall-grade-all-agents-final-v156";

if (source.includes(marker)) {
  console.log("Dashboard Overall Grade patch already applied.");
  process.exit(0);
}

const overallGradeIndex = source.indexOf('label: "Overall Grade"');
if (overallGradeIndex < 0) {
  throw new Error("Overall Grade card was not found in DashboardMockup.tsx");
}

const blockStart = source.lastIndexOf("    {", overallGradeIndex);
const blockEnd = source.indexOf("\n    },", overallGradeIndex);
if (blockStart < 0 || blockEnd < 0) {
  throw new Error("Unable to isolate the Overall Grade card block.");
}

const originalBlock = source.slice(blockStart, blockEnd + 7);
let patchedBlock = originalBlock;

const valueBefore = `        : monthlyAgentCompleted && monthlyAgentGrade\n          ? monthlyAgentGrade\n          : "Pending",`;
const valueAfter = `        : isAllAgentsView\n          ? monthlyKpiQuotaReady && currentGradeDisplay !== "-"\n            ? currentGradeDisplay\n            : "Pending"\n          : monthlyAgentCompleted && monthlyAgentGrade\n            ? monthlyAgentGrade\n            : "Pending",`;

const noteBefore = `        : monthlyAgentCompleted\n          ? currentGradeTone(monthlyAgentGrade || currentGradeDisplay).level\n          : currentGradeDisplay && currentGradeDisplay !== "-"\n            ? \`Current score band: \${currentGradeDisplay} · Finalizes after \${dashboardEvaluationTarget} evaluated cases\`\n            : \`Finalizes after \${dashboardEvaluationTarget} evaluated cases\`,`;
const noteAfter = `        : isAllAgentsView && monthlyKpiQuotaReady && currentGradeDisplay !== "-"\n          ? \`Final monthly team grade · \${currentGradeTone(currentGradeDisplay).level}\`\n          : monthlyAgentCompleted\n            ? currentGradeTone(monthlyAgentGrade || currentGradeDisplay).level\n            : currentGradeDisplay && currentGradeDisplay !== "-"\n              ? \`Current score band: \${currentGradeDisplay} · Finalizes after \${dashboardEvaluationTarget} evaluated cases\`\n              : \`Finalizes after \${dashboardEvaluationTarget} evaluated cases\`,`;

const toneBefore = `        : monthlyAgentCompleted\n          ? currentGradeTone(monthlyAgentGrade || currentGradeDisplay).levelText\n          : "text-amber-700",`;
const toneAfter = `        : isAllAgentsView && monthlyKpiQuotaReady && currentGradeDisplay !== "-"\n          ? currentGradeTone(currentGradeDisplay).levelText\n          : monthlyAgentCompleted\n            ? currentGradeTone(monthlyAgentGrade || currentGradeDisplay).levelText\n            : "text-amber-700",`;

for (const [before, after, label] of [
  [valueBefore, valueAfter, "value"],
  [noteBefore, noteAfter, "note"],
  [toneBefore, toneAfter, "tone"],
]) {
  if (!patchedBlock.includes(before)) {
    throw new Error(`Expected Overall Grade ${label} fragment was not found.`);
  }
  patchedBlock = patchedBlock.replace(before, after);
}

patchedBlock = patchedBlock.replace(
  '      label: "Overall Grade",',
  `      // ${marker}\n      label: "Overall Grade",`
);

source = source.slice(0, blockStart) + patchedBlock + source.slice(blockEnd + 7);
fs.writeFileSync(targetPath, source, "utf8");
console.log("Patched Overall Grade: All Agents finalizes when every agent completes 10 monthly cases.");
