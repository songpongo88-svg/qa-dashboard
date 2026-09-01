import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererPath = path.resolve(__dirname, "../src/finalSignedPdfRenderer.ts");
const marker = "final-signed-current-kpi-tight-layout-v15";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

let source = fs.readFileSync(rendererPath, "utf8");
if (!source.includes(marker)) {
  if (!source.includes("final-signed-kpi-status-v14")) {
    throw new Error("KPI Status patch v14 must run before v15");
  }

  source = replaceOnce(
    source,
    'const KPI_TARGET = 85;\n// final-signed-kpi-status-v14',
    'const KPI_TARGET = 85;\n// final-signed-kpi-status-v14\n// final-signed-current-kpi-tight-layout-v15',
    "v15 marker"
  );

  // Remove the white gap below the main subtitle and below every purple section header.
  source = replaceOnce(
    source,
    '    y += 8.2;\n  };',
    '    y += 7.0;\n  };',
    "header spacing"
  );
  source = replaceOnce(
    source,
    '    y += 8.0;\n  };',
    '    y += 7.2;\n  };',
    "section spacing"
  );

  // Tighten the first Current View information row against the KPI summary row.
  source = replaceOnce(
    source,
    '  y += 11.0;\n\n  drawCellCols(0, 3, y, 7.4, "Cases Reviewed"',
    '  y += 10.0;\n\n  drawCellCols(0, 3, y, 7.4, "Cases Reviewed"',
    "Current View top-row spacing"
  );

  const oldCurrentMetrics = `  drawCellCols(0, 3, y, 7.4, "Cases Reviewed", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });\n  drawCellCols(3, 6, y, 7.4, "Need More to 10", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });\n  drawCellCols(6, 9, y, 7.4, "Average Score", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });\n  drawCellCols(9, 10, y, 7.4, "Monthly Grade", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center", maxLines: 2 });\n  y += 7.4;\n  drawCellCols(0, 3, y, 10.8, \`\${selectedDocument.caseCount}/\${CASE_TARGET}\`, lightPurple, { bold: true, size: 13, align: "center", maxLines: 1 });\n  drawCellCols(3, 6, y, 10.8, needMoreToTarget, lightPurple, { bold: true, size: 13, align: "center", maxLines: 1 });\n  drawCellCols(6, 9, y, 10.8, selectedDocument.averageScore.toFixed(2), lightPurple, { bold: true, size: 13, align: "center", color: selectedDocument.averageScore >= 80 ? good : warn, maxLines: 1 });\n  drawCellCols(9, 10, y, 10.8, selectedDocument.grade, lightPurple, { bold: true, size: 13, align: "center", maxLines: 1 });\n  y += 13;`;

  const newCurrentMetrics = `  const monthlyKpiPassed = Number(selectedDocument.averageScore || 0) >= KPI_TARGET;\n  const currentMetricWidths = [38, 38, 43, 27, 40];\n  drawCellsByWidth(left, y, 7.4, ["Cases Reviewed", "Need More to 10", "Average Score", "Monthly Grade", "KPI Status"].map((label, index) => ({\n    value: label,\n    width: currentMetricWidths[index],\n    fill: purple,\n    options: { bold: true, color: [255,255,255] as [number,number,number], size: index === 4 ? 7.8 : 8.4, align: "center" as const, maxLines: 1 },\n  })));\n  y += 7.4;\n  drawCellsByWidth(left, y, 10.8, [\n    { value: \`\${selectedDocument.caseCount}/\${CASE_TARGET}\`, width: currentMetricWidths[0], fill: lightPurple, options: { bold: true, size: 12.5, align: "center", maxLines: 1 } },\n    { value: needMoreToTarget, width: currentMetricWidths[1], fill: lightPurple, options: { bold: true, size: 12.5, align: "center", maxLines: 1 } },\n    { value: selectedDocument.averageScore.toFixed(2), width: currentMetricWidths[2], fill: monthlyKpiPassed ? lightPurple : kpiFailFill, options: { bold: true, size: 12.5, align: "center", color: monthlyKpiPassed ? good : kpiFailText, maxLines: 1 } },\n    { value: selectedDocument.grade, width: currentMetricWidths[3], fill: monthlyKpiPassed ? lightPurple : kpiFailFill, options: { bold: true, size: 12.5, align: "center", color: monthlyKpiPassed ? black : kpiFailText, maxLines: 1 } },\n    { value: monthlyKpiPassed ? "Passed" : "Not Passed", width: currentMetricWidths[4], fill: monthlyKpiPassed ? lightPurple : kpiFailFill, options: { bold: true, size: 8.2, align: "center", color: monthlyKpiPassed ? good : kpiFailText, maxLines: 1 } },\n  ] as any);\n  y += 10.8;`;

  source = replaceOnce(source, oldCurrentMetrics, newCurrentMetrics, "Current View KPI summary");

  // Remove white strips between the remaining blocks.
  source = replaceOnce(
    source,
    '  y += 14;\n\n  drawSection("Monthly Case List");',
    '  y += 12;\n\n  drawSection("Monthly Case List");',
    "Incentive-to-case spacing"
  );
  source = replaceOnce(
    source,
    '  y += 3;\n  drawSection("Monthly Topic Performance");',
    '  drawSection("Monthly Topic Performance");',
    "Case-to-topic spacing"
  );
  source = replaceOnce(
    source,
    '  y += 3;\n  drawSection("Acknowledgement / Signature");',
    '  drawSection("Acknowledgement / Signature");',
    "Topic-to-signature spacing"
  );

  fs.writeFileSync(rendererPath, source, "utf8");
}

console.log("Patched Final Signed Current View KPI status, 85% coloring, and tight section spacing.");
