import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pdfPath = path.resolve(__dirname, "../src/caseDetailOfficialPdf.ts");
const dashboardPath = path.resolve(__dirname, "../src/DashboardMockup.tsx");
const marker = "case-pdf-agent-center-filename-v6";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

function patchPdfAgentCenter() {
  let source = fs.readFileSync(pdfPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("case-pdf-agent-team-tight-v5")) {
    throw new Error("Agent/Team tight spacing patch v5 must run before v6");
  }

  const before = `    const visualStackH = firstToLastAgent + teamBaselineGap + 2.15;\n    const firstAgentY = yy + h / 2 - visualStackH / 2 + 1.35;`;
  const after = `    const visualStackH = firstToLastAgent + teamBaselineGap + 2.15;\n    // ${marker}\n    // TH Sarabun glyphs sit visually above their baseline, so nudge the whole\n    // Agent + Team stack down slightly to align with the visual center of\n    // the purple Agent label cell beside it.\n    const visualCenterNudgeY = 0.8;\n    const firstAgentY = yy + h / 2 - visualStackH / 2 + 1.35 + visualCenterNudgeY;`;

  source = replaceOnce(source, before, after, "Agent visual center");
  fs.writeFileSync(pdfPath, source, "utf8");
}

function patchAgentFilename() {
  let source = fs.readFileSync(dashboardPath, "utf8");
  if (source.includes(marker)) return;
  if (!source.includes("bulk-case-pdf-role-scopes-v2")) {
    throw new Error("Bulk PDF role scopes v2 must run before filename patch v6");
  }

  const before = `      downloadGeneratedPdfFile(\n        mode === "my"\n          ? { ...result, fileName: result.fileName.replace(/_All_Cases\\.pdf$/i, "_My_Cases.pdf") }\n          : result\n      );`;

  const after = `      // ${marker}\n      const safeFilterFilePart = (value: unknown, fallback: string) => {\n        const text = String(value || "").trim() || fallback;\n        return text\n          .replace(/\\s*-\\s*/g, "_to_")\n          .replace(/\\//g, "-")\n          .replace(/[<>:\"/\\\\|?*\\u0000-\\u001f\\u007f]+/g, "_")\n          .replace(/\\s+/g, "_")\n          .replace(/_+/g, "_")\n          .replace(/^_+|_+$/g, "") || fallback;\n      };\n      const periodForFile = isWeeklyCasePdfView\n        ? safeFilterFilePart(selectedWeek, "Weekly")\n        : safeFilterFilePart(currentViewingMonthLabel || selectedMonthKey, selectedMonthKey || "Month");\n      const teamForFile =\n        bulkCasePdfSelectedTeam && bulkCasePdfSelectedTeam !== "all"\n          ? safeFilterFilePart(bulkCasePdfSelectedTeam, "Team")\n          : "All_Teams";\n      const agentNameForFile =\n        mode === "my"\n          ? ""\n          : selectedAgent && selectedAgent !== "all"\n            ? String(selectedAgent).trim()\n            : "";\n      const agentForFile = mode === "my"\n        ? "My_Cases"\n        : agentNameForFile\n          ? safeFilterFilePart(agentNameForFile, "Agent")\n          : "All_Agents";\n      const filterFileName = \`QA_Case_Detail_\${periodForFile}_\${teamForFile}_\${agentForFile}.pdf\`;\n      downloadGeneratedPdfFile({ ...result, fileName: filterFileName });`;

  source = replaceOnce(source, before, after, "Filter-aware PDF filename");
  fs.writeFileSync(dashboardPath, source, "utf8");
}

patchPdfAgentCenter();
patchAgentFilename();
console.log("Patched PDF Agent block and filter-aware Gen All filenames.");
