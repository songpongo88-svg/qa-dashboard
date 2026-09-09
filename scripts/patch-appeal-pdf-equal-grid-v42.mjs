import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");
const marker = "appeal-pdf-equal-grid-v42";

let source = fs.readFileSync(pdfPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  const drawStartToken = `  const drawAppealTop = () => {`;
  const drawStart = source.indexOf(drawStartToken);
  const topicStart = drawStart >= 0 ? source.indexOf(`  const drawTopicTitle = () => {`, drawStart) : -1;

  if (drawStart < 0 || topicStart < 0) {
    throw new Error("Appeal PDF equal-grid v42: drawAppealTop block not found.");
  }

  let block = source.slice(drawStart, topicStart);
  const currentSelectionAnchor = `    purpleRow(y, 5, "Current Selection");\n    y += 8;`;
  const selectionAnchorIndex = block.indexOf(currentSelectionAnchor);
  const remarkAnchor = `    const remarkText =`;
  const remarkIndex = block.indexOf(remarkAnchor);

  if (selectionAnchorIndex < 0 || remarkIndex < 0 || remarkIndex <= selectionAnchorIndex) {
    throw new Error("Appeal PDF equal-grid v42: Current Selection / Remark anchors not found.");
  }

  const beforeGridEnd = selectionAnchorIndex + currentSelectionAnchor.length;
  const beforeGrid = block.slice(0, beforeGridEnd);
  const afterGrid = block.slice(remarkIndex);

  const gridBlock = `\n\n    // ${marker}\n    // Match the final Case Detail PDF header: four equal label/value blocks per row.\n    const appealHeaderWidths = [14, 34.75, 14, 34.75, 14, 34.75, 14, 34.75];\n    setWidths(appealHeaderWidths);\n    const appealHeaderRowH = 10.5;\n    const appealHeaderLabelSize = 6.35;\n    const appealHeaderValueSize = 6.65;\n\n    const appealTeam =\n      caseItem.teamName ||\n      caseItem.team ||\n      caseItem.teamLabel ||\n      caseItem.agentTeam ||\n      "-";\n    const appealAuditText = caseItem.auditTimestamp || caseItem.auditDate || "-";\n    const appealCaseDateText =\n      caseItem.caseDate ||\n      caseItem.createdAt ||\n      caseItem.caseCreatedAt ||\n      caseItem.auditDate ||\n      caseItem.auditTimestamp ||\n      "-";\n    const appealStatusText = caseItem.appealStatus || caseItem.decision || "Approved";\n    const appealKpiPassed = reportScore >= 85;\n    const appealReportVersion =\n      caseItem.reviewStatus === "Revised" || appealStatusText !== "-"\n        ? "Appeal / Revised"\n        : "Original Evaluation";\n\n    // Row 1: Agent | Team | Month | Case ID\n    label(0, y, 1, appealHeaderRowH, "Agent");\n    value(1, y, 1, appealHeaderRowH, caseItem.agent, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: appealHeaderValueSize });\n    label(2, y, 1, appealHeaderRowH, "Team");\n    value(3, y, 1, appealHeaderRowH, appealTeam, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: appealHeaderValueSize });\n    label(4, y, 1, appealHeaderRowH, "Month");\n    value(5, y, 1, appealHeaderRowH, caseItem.monthLabel || caseItem.monthKey, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: appealHeaderValueSize });\n    label(6, y, 1, appealHeaderRowH, "Case ID");\n    value(7, y, 1, appealHeaderRowH, caseItem.caseId, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 7.0 });\n    y += appealHeaderRowH;\n\n    // Row 2: Audit Date | Case Date | Final Score | Case Grade\n    label(0, y, 1, appealHeaderRowH, "Audit Date");\n    value(1, y, 1, appealHeaderRowH, appealAuditText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.2 });\n    label(2, y, 1, appealHeaderRowH, "Case Date");\n    value(3, y, 1, appealHeaderRowH, appealCaseDateText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.2 });\n    label(4, y, 1, appealHeaderRowH, "Final Score");\n    value(5, y, 1, appealHeaderRowH, reportScore.toFixed(2), LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 8.0, color: appealKpiPassed ? [5, 150, 105] : [220, 38, 38] });\n    label(6, y, 1, appealHeaderRowH, "Case Grade");\n    value(7, y, 1, appealHeaderRowH, grade, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 8.0, color: appealKpiPassed ? [5, 150, 105] : [220, 38, 38] });\n    y += appealHeaderRowH;\n\n    // Row 3: KPI Status | KPI Target | Appeal Status | Report Version\n    label(0, y, 1, appealHeaderRowH, "KPI Status");\n    value(1, y, 1, appealHeaderRowH, appealKpiPassed ? "Passed" : "Not Passed", LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: appealHeaderValueSize, color: appealKpiPassed ? [5, 150, 105] : [220, 38, 38] });\n    label(2, y, 1, appealHeaderRowH, "KPI Target");\n    value(3, y, 1, appealHeaderRowH, "85 / 100", LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: appealHeaderValueSize });\n    label(4, y, 1, appealHeaderRowH, "Appeal Status");\n    value(5, y, 1, appealHeaderRowH, appealStatusText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: appealHeaderValueSize });\n    label(6, y, 1, appealHeaderRowH, "Report Version");\n    value(7, y, 1, appealHeaderRowH, appealReportVersion, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: appealHeaderValueSize });\n    y += appealHeaderRowH;`;

  block = beforeGrid + gridBlock + `\n\n` + afterGrid;
  source = source.slice(0, drawStart) + block + source.slice(topicStart);
  fs.writeFileSync(pdfPath, source, "utf8");
}

console.log("Patched Appeal PDF Current Selection into the same four-column equal-box grid as Case Detail PDF, without changing the rest of the legacy Appeal report.");
