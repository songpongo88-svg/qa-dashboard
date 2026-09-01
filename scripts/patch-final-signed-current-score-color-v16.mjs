import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererPath = path.resolve(__dirname, "../src/finalSignedPdfRenderer.ts");
const marker = "final-signed-current-score-color-v16";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

let source = fs.readFileSync(rendererPath, "utf8");
if (!source.includes(marker)) {
  if (!source.includes("final-signed-current-kpi-tight-layout-v15")) {
    throw new Error("Current View tight layout v15 must run before v16");
  }

  source = replaceOnce(
    source,
    '// final-signed-current-kpi-tight-layout-v15',
    '// final-signed-current-kpi-tight-layout-v15\n// final-signed-current-score-color-v16',
    "v16 marker"
  );

  const oldCurrentMetrics = `  const monthlyKpiPassed = Number(selectedDocument.averageScore || 0) >= KPI_TARGET;\n  const currentMetricWidths = [38, 38, 43, 27, 40];\n  drawCellsByWidth(left, y, 7.4, ["Cases Reviewed", "Need More to 10", "Average Score", "Monthly Grade", "KPI Status"].map((label, index) => ({\n    value: label,\n    width: currentMetricWidths[index],\n    fill: purple,\n    options: { bold: true, color: [255,255,255] as [number,number,number], size: index === 4 ? 7.8 : 8.4, align: "center" as const, maxLines: 1 },\n  })));\n  y += 7.4;\n  drawCellsByWidth(left, y, 10.8, [\n    { value: \`\${selectedDocument.caseCount}/\${CASE_TARGET}\`, width: currentMetricWidths[0], fill: lightPurple, options: { bold: true, size: 12.5, align: "center", maxLines: 1 } },\n    { value: needMoreToTarget, width: currentMetricWidths[1], fill: lightPurple, options: { bold: true, size: 12.5, align: "center", maxLines: 1 } },\n    { value: selectedDocument.averageScore.toFixed(2), width: currentMetricWidths[2], fill: monthlyKpiPassed ? lightPurple : kpiFailFill, options: { bold: true, size: 12.5, align: "center", color: monthlyKpiPassed ? good : kpiFailText, maxLines: 1 } },\n    { value: selectedDocument.grade, width: currentMetricWidths[3], fill: monthlyKpiPassed ? lightPurple : kpiFailFill, options: { bold: true, size: 12.5, align: "center", color: monthlyKpiPassed ? black : kpiFailText, maxLines: 1 } },\n    { value: monthlyKpiPassed ? "Passed" : "Not Passed", width: currentMetricWidths[4], fill: monthlyKpiPassed ? lightPurple : kpiFailFill, options: { bold: true, size: 8.2, align: "center", color: monthlyKpiPassed ? good : kpiFailText, maxLines: 1 } },\n  ] as any);\n  y += 10.8;`;

  const newCurrentMetrics = `  const monthlyKpiPassed = Number(selectedDocument.averageScore || 0) >= KPI_TARGET;\n  drawCellCols(0, 3, y, 7.4, "Cases Reviewed", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });\n  drawCellCols(3, 6, y, 7.4, "Need More to 10", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });\n  drawCellCols(6, 9, y, 7.4, "Average Score", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });\n  drawCellCols(9, 10, y, 7.4, "Monthly Grade", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center", maxLines: 2 });\n  y += 7.4;\n  drawCellCols(0, 3, y, 10.8, \`\${selectedDocument.caseCount}/\${CASE_TARGET}\`, lightPurple, { bold: true, size: 13, align: "center", maxLines: 1 });\n  drawCellCols(3, 6, y, 10.8, needMoreToTarget, lightPurple, { bold: true, size: 13, align: "center", maxLines: 1 });\n  drawCellCols(6, 9, y, 10.8, selectedDocument.averageScore.toFixed(2), lightPurple, { bold: true, size: 13, align: "center", color: monthlyKpiPassed ? good : kpiFailText, maxLines: 1 });\n  drawCellCols(9, 10, y, 10.8, selectedDocument.grade, lightPurple, { bold: true, size: 13, align: "center", maxLines: 1 });\n  y += 10.8;`;

  source = replaceOnce(source, oldCurrentMetrics, newCurrentMetrics, "Current View KPI status removal");
  fs.writeFileSync(rendererPath, source, "utf8");
}

console.log("Patched Final Signed Current View to keep only Average Score KPI text color: green >=85, red <85.");
