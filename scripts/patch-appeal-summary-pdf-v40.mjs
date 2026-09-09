import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");
const marker = "appeal-pdf-header-status-parity-v41";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal PDF parity anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

let source = fs.readFileSync(pdfPath, "utf8");

if (!source.includes(`// ${marker}`)) {
  source = replaceOnce(
    source,
    `  const drawAppealTop = () => {\n    setWidths(topWidths);`,
    `  // ${marker}\n  const drawAppealTop = () => {\n    setWidths(topWidths);`,
    "marker"
  );

  const oldFirstRows = `    const appealSelectionRowH = autoRowHeight(\n      [\n        { value: caseItem.agent, w: wOf(1, 2), size: 6.8, padY: 4 },\n        { value: caseItem.monthLabel || caseItem.monthKey, w: wOf(4), size: 6.8, padY: 4 },\n        { value: caseItem.appealVersion || "REV1", w: wOf(6, 2), size: 7.2, padY: 4 },\n      ],\n      9,\n      13\n    );\n    label(0, y, 1, appealSelectionRowH, "Agent");\n    value(1, y, 2, appealSelectionRowH, caseItem.agent, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.8 });\n    label(3, y, 1, appealSelectionRowH, "Month");\n    value(4, y, 1, appealSelectionRowH, caseItem.monthLabel || caseItem.monthKey, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.8 });\n    label(5, y, 1, appealSelectionRowH, "Appeal Ver.");\n    value(6, y, 2, appealSelectionRowH, caseItem.appealVersion || "REV1", LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 7.2 });\n    y += appealSelectionRowH;\n\n    const appealAuditText = caseItem.auditTimestamp || caseItem.auditDate;\n    const appealSecondRowH = autoRowHeight(\n      [\n        { value: appealAuditText, w: wOf(1), size: 6.4, padY: 4 },\n        { value: caseItem.caseId, w: wOf(3), size: 7.2, padY: 4 },\n        { value: reportScore.toFixed(2), w: wOf(5), size: 8.4, padY: 4 },\n        { value: grade, w: wOf(7), size: 8.4, padY: 4 },\n      ],\n      10,\n      15\n    );\n    label(0, y, 1, appealSecondRowH, "Audit Date");\n    value(1, y, 1, appealSecondRowH, appealAuditText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 3, size: 6.4 });\n    label(2, y, 1, appealSecondRowH, "Case ID");\n    value(3, y, 1, appealSecondRowH, caseItem.caseId, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 7.2 });\n    label(4, y, 1, appealSecondRowH, "Final Score");\n    value(5, y, 1, appealSecondRowH, reportScore.toFixed(2), LIGHT_PURPLE, { align: "center", valign: "middle", size: 8.4, maxLines: 1 });\n    label(6, y, 1, appealSecondRowH, "Case Grade");\n    value(7, y, 1, appealSecondRowH, grade, LIGHT_PURPLE, { align: "center", valign: "middle", size: 8.4, maxLines: 1 });\n    y += appealSecondRowH;`;

  const newFirstRows = `    // Keep the Appeal PDF header grid identical to Case Detail PDF.\n    const appealSelectionRowH = autoRowHeight(\n      [\n        { value: caseItem.agent, w: wOf(1, 2), size: 6.8, padY: 4 },\n        { value: caseItem.monthLabel || caseItem.monthKey, w: wOf(4), size: 6.8, padY: 4 },\n        { value: caseItem.caseId, w: wOf(6, 2), size: 7.4, padY: 4 },\n      ],\n      9,\n      12\n    );\n    label(0, y, 1, appealSelectionRowH, "Agent");\n    value(1, y, 2, appealSelectionRowH, caseItem.agent, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.8 });\n    label(3, y, 1, appealSelectionRowH, "Month");\n    value(4, y, 1, appealSelectionRowH, caseItem.monthLabel || caseItem.monthKey, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 6.8 });\n    label(5, y, 1, appealSelectionRowH, "Case ID");\n    value(6, y, 2, appealSelectionRowH, caseItem.caseId, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 7.4 });\n    y += appealSelectionRowH;\n\n    const appealAuditText = caseItem.auditTimestamp || caseItem.auditDate;\n    const appealCaseDateText = caseItem.caseDate || caseItem.createdAt || caseItem.caseCreatedAt || caseItem.auditDate || caseItem.auditTimestamp || "-";\n    const appealSecondRowH = autoRowHeight(\n      [\n        { value: appealAuditText, w: wOf(1), size: 6.4, padY: 4 },\n        { value: appealCaseDateText, w: wOf(3), size: 6.4, padY: 4 },\n        { value: reportScore.toFixed(2), w: wOf(5), size: 8.2, padY: 4 },\n        { value: grade, w: wOf(7), size: 8.2, padY: 4 },\n      ],\n      10,\n      14\n    );\n    label(0, y, 1, appealSecondRowH, "Audit Date");\n    value(1, y, 1, appealSecondRowH, appealAuditText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.4 });\n    label(2, y, 1, appealSecondRowH, "Case Date");\n    value(3, y, 1, appealSecondRowH, appealCaseDateText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.4 });\n    label(4, y, 1, appealSecondRowH, "Final Score");\n    value(5, y, 1, appealSecondRowH, reportScore.toFixed(2), LIGHT_PURPLE, { align: "center", valign: "middle", size: 8.2, maxLines: 1 });\n    label(6, y, 1, appealSecondRowH, "Case Grade");\n    value(7, y, 1, appealSecondRowH, grade, LIGHT_PURPLE, { align: "center", valign: "middle", size: 8.2, maxLines: 1 });\n    y += appealSecondRowH;`;

  source = replaceOnce(source, oldFirstRows, newFirstRows, "Case Detail-aligned header rows");

  const oldStatusRow = `    label(0, y, 1, 8, "Appeal Status");\n    value(1, y, 1, 8, caseItem.appealStatus || "Approved", LIGHT_PURPLE, { align: "center", maxLines: 1 });\n    label(2, y, 1, 8, "Comment Status");\n    value(3, y, 1, 8, caseItem.commentStatus || "Approved", LIGHT_PURPLE, { align: "center", maxLines: 1 });\n    label(4, y, 1, 8, "Review Type");\n    value(5, y, 3, 8, "Revised", LIGHT_PURPLE, { align: "center", maxLines: 1 });\n    y += 8;`;

  const newStatusRow = `    label(0, y, 1, 8, "Appeal Status");\n    value(1, y, 1, 8, caseItem.appealStatus || "Approved", LIGHT_PURPLE, { align: "center", maxLines: 1 });\n    label(2, y, 1, 8, "Review Status");\n    value(3, y, 1, 8, caseItem.reviewStatus || "Revised", LIGHT_PURPLE, { align: "center", maxLines: 1 });\n    label(4, y, 1, 8, "Appeal Version");\n    value(5, y, 3, 8, caseItem.appealVersion || "REV1", LIGHT_PURPLE, { align: "center", maxLines: 1 });\n    y += 8;`;

  source = replaceOnce(source, oldStatusRow, newStatusRow, "status wording");

  fs.writeFileSync(pdfPath, source, "utf8");
}

console.log("Patched legacy Appeal PDF only: preserved the original purple report format, aligned the header grid with Case Detail PDF, and replaced Comment Status/Review Type with Appeal Status, Review Status, and Appeal Version.");
