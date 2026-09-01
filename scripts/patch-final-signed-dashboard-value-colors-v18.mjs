import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererPath = path.resolve(__dirname, "../src/finalSignedPdfRenderer.ts");
const marker = "final-signed-dashboard-value-colors-v18";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

let source = fs.readFileSync(rendererPath, "utf8");
if (!source.includes(marker)) {
  if (!source.includes("final-signed-current-kpi-restore-v17")) {
    throw new Error("Current View KPI restore v17 must run before v18");
  }

  source = replaceOnce(
    source,
    '// final-signed-current-kpi-restore-v17',
    '// final-signed-current-kpi-restore-v17\n// final-signed-dashboard-value-colors-v18',
    "v18 marker"
  );

  source = replaceOnce(
    source,
    '  const kpiFailText: [number, number, number] = [185, 28, 28];',
    `  const kpiFailText: [number, number, number] = [185, 28, 28];\n  const valueWhite: [number, number, number] = [255, 255, 255];\n  // Mirror Dashboard semantic backgrounds: strongest = emerald-50, coaching focus = rose-50.\n  const dashboardBestTopicFill: [number, number, number] = [236, 253, 245];\n  const dashboardLowestTopicFill: [number, number, number] = [255, 241, 242];\n  const dashboardGradeFill = (grade: string): [number, number, number] => {\n    switch (String(grade || \"\").toUpperCase()) {\n      case \"A\": return [236, 253, 245];\n      case \"B\": return [239, 246, 255];\n      case \"C\": return [255, 251, 235];\n      case \"D\": return [255, 237, 213];\n      default: return [255, 241, 242];\n    }\n  };`,
    "Dashboard semantic colors"
  );

  // Current View top values (Agent / Month / Reviewed Cases / Critical Cases) = white.
  source = replaceOnce(
    source,
    '    drawCellCols(valueStart, valueEnd, rowY, h, value, lightPurple, {',
    '    drawCellCols(valueStart, valueEnd, rowY, h, value, valueWhite, {',
    "Current View top value fill"
  );

  const oldCurrentValues = `  drawCellsByWidth(left, y, 10.8, [\n    { value: \`\${selectedDocument.caseCount}/\${CASE_TARGET}\`, width: currentMetricWidths[0], fill: lightPurple, options: { bold: true, size: 12.5, align: "center", maxLines: 1 } },\n    { value: needMoreToTarget, width: currentMetricWidths[1], fill: lightPurple, options: { bold: true, size: 12.5, align: "center", maxLines: 1 } },\n    { value: selectedDocument.averageScore.toFixed(2), width: currentMetricWidths[2], fill: lightPurple, options: { bold: true, size: 12.5, align: "center", color: monthlyKpiPassed ? good : kpiFailText, maxLines: 1 } },\n    { value: selectedDocument.grade, width: currentMetricWidths[3], fill: lightPurple, options: { bold: true, size: 12.5, align: "center", color: black, maxLines: 1 } },\n    { value: monthlyKpiPassed ? "Passed" : "Not Passed", width: currentMetricWidths[4], fill: lightPurple, options: { bold: true, size: 8.2, align: "center", color: monthlyKpiPassed ? good : kpiFailText, maxLines: 1 } },\n  ] as any);`;

  const newCurrentValues = `  drawCellsByWidth(left, y, 10.8, [\n    { value: \`\${selectedDocument.caseCount}/\${CASE_TARGET}\`, width: currentMetricWidths[0], fill: valueWhite, options: { bold: true, size: 12.5, align: "center", maxLines: 1 } },\n    { value: needMoreToTarget, width: currentMetricWidths[1], fill: valueWhite, options: { bold: true, size: 12.5, align: "center", maxLines: 1 } },\n    { value: selectedDocument.averageScore.toFixed(2), width: currentMetricWidths[2], fill: valueWhite, options: { bold: true, size: 12.5, align: "center", color: monthlyKpiPassed ? good : kpiFailText, maxLines: 1 } },\n    { value: selectedDocument.grade, width: currentMetricWidths[3], fill: dashboardGradeFill(selectedDocument.grade), options: { bold: true, size: 12.5, align: "center", color: black, maxLines: 1 } },\n    { value: monthlyKpiPassed ? "Passed" : "Not Passed", width: currentMetricWidths[4], fill: valueWhite, options: { bold: true, size: 8.2, align: "center", color: monthlyKpiPassed ? good : kpiFailText, maxLines: 1 } },\n  ] as any);`;
  source = replaceOnce(source, oldCurrentValues, newCurrentValues, "Current View value colors");

  const oldIncentiveValues = `  drawCellCols(0, 3, y, 12, incentiveText, lightPurple, { bold: true, size: 8.8, align: "center", maxLines: 2 });\n  drawCellCols(3, 6, y, 12, bestTopic ? \`\${bestTopic.title}\\n\${Number(bestTopic.avgPercent).toFixed(2)}%\` : "-", lightPurple, { bold: true, size: 8.3, align: "center", maxLines: 2 });\n  drawCellCols(6, 10, y, 12, lowestTopic ? \`\${lowestTopic.title}\\n\${Number(lowestTopic.avgPercent).toFixed(2)}%\` : "-", lightPurple, { bold: true, size: 8.3, align: "center", maxLines: 2 });`;

  const newIncentiveValues = `  drawCellCols(0, 3, y, 12, incentiveText, valueWhite, { bold: true, size: 8.8, align: "center", maxLines: 2 });\n  drawCellCols(3, 6, y, 12, bestTopic ? \`\${bestTopic.title}\\n\${Number(bestTopic.avgPercent).toFixed(2)}%\` : "-", dashboardBestTopicFill, { bold: true, size: 8.3, align: "center", maxLines: 2 });\n  drawCellCols(6, 10, y, 12, lowestTopic ? \`\${lowestTopic.title}\\n\${Number(lowestTopic.avgPercent).toFixed(2)}%\` : "-", dashboardLowestTopicFill, { bold: true, size: 8.3, align: "center", maxLines: 2 });`;
  source = replaceOnce(source, oldIncentiveValues, newIncentiveValues, "Incentive semantic value colors");

  fs.writeFileSync(rendererPath, source, "utf8");
}

console.log("Patched Final Signed value cells: white defaults; Best/Lowest Topic and Monthly Grade mirror Dashboard semantic backgrounds.");
