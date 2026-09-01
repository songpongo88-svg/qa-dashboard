import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererPath = path.resolve(__dirname, "../src/finalSignedPdfRenderer.ts");
const marker = "final-signed-kpi-status-v14";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

let source = fs.readFileSync(rendererPath, "utf8");
if (!source.includes(marker)) {
  source = replaceOnce(
    source,
    'const CASE_TARGET = 10;',
    `const CASE_TARGET = 10;\nconst KPI_TARGET = 85;\n// ${marker}`,
    "KPI target"
  );

  source = replaceOnce(
    source,
    '  const warn: [number, number, number] = [180, 83, 9];',
    `  const warn: [number, number, number] = [180, 83, 9];\n  const kpiFailFill: [number, number, number] = [254, 226, 226];\n  const kpiFailText: [number, number, number] = [185, 28, 28];`,
    "KPI colors"
  );

  const oldCaseHeader = `  drawSection("Monthly Case List");\n  const caseColWidths = [10, 23, 24, 96, 16, 8, 9];\n  drawCellsByWidth(left, y, 7.4, ["Seq", "Case Date", "Case ID", "Inquiry", "Score", "Grade", "Critical"].map((label, index) => ({\n    value: label,\n    width: caseColWidths[index],\n    fill: purple,\n    options: { bold: true, color: [255,255,255] as [number,number,number], size: 7.8, align: "center" as const, maxLines: 1 },\n  })));`;

  const newCaseHeader = `  drawSection("Monthly Case List");\n  const caseColWidths = [8, 20, 22, 82, 14, 8, 9, 23];\n  drawCellsByWidth(left, y, 7.4, ["Seq", "Case Date", "Case ID", "Inquiry", "Score", "Grade", "Critical", "KPI Status"].map((label, index) => ({\n    value: label,\n    width: caseColWidths[index],\n    fill: purple,\n    options: { bold: true, color: [255,255,255] as [number,number,number], size: index === 7 ? 7.1 : 7.6, align: "center" as const, maxLines: 1 },\n  })));`;
  source = replaceOnce(source, oldCaseHeader, newCaseHeader, "Monthly Case List header");

  const oldCaseLoop = `  for (let index = 0; index < CASE_TARGET; index += 1) {\n    const item = selectedDocument.cases[index];\n    const rowH = 8.4;\n    const fill: [number, number, number] = index % 2 === 0 ? [255,255,255] : [250,247,253];\n    drawCellsByWidth(left, y, rowH, [\n      { value: index + 1, width: caseColWidths[0], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },\n      { value: item?.auditDate || "-", width: caseColWidths[1], fill, options: { size: 7.1, align: "center", bold: true, maxLines: 1 } },\n      { value: item?.caseId || "-", width: caseColWidths[2], fill, options: { size: 7.1, align: "center", bold: true, maxLines: 1 } },\n      { value: item?.inquiry || "-", width: caseColWidths[3], fill, options: { size: 7.0, align: "left", bold: true, maxLines: 2, lineHeight: 3.55 } },\n      { value: item ? Number(item.finalScore || 0).toFixed(2) : "-", width: caseColWidths[4], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },\n      { value: item?.grade || "-", width: caseColWidths[5], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },\n      { value: "NO", width: caseColWidths[6], fill, options: { size: 7.0, align: "center", bold: true, maxLines: 1 } },\n    ] as any);\n    y += rowH;\n  }`;

  const newCaseLoop = `  for (let index = 0; index < CASE_TARGET; index += 1) {\n    const item = selectedDocument.cases[index];\n    const rowH = 8.4;\n    const score = item ? Number(item.finalScore || 0) : null;\n    const isKpiFail = score !== null && Number.isFinite(score) && score < KPI_TARGET;\n    const fill: [number, number, number] = isKpiFail\n      ? kpiFailFill\n      : index % 2 === 0 ? [255,255,255] : [250,247,253];\n    const kpiStatus = !item ? "-" : isKpiFail ? "Not Passed" : "Passed";\n    drawCellsByWidth(left, y, rowH, [\n      { value: index + 1, width: caseColWidths[0], fill, options: { size: 7.3, align: "center", bold: true, maxLines: 1 } },\n      { value: item?.auditDate || "-", width: caseColWidths[1], fill, options: { size: 7.0, align: "center", bold: true, maxLines: 1 } },\n      { value: item?.caseId || "-", width: caseColWidths[2], fill, options: { size: 7.0, align: "center", bold: true, maxLines: 1 } },\n      { value: item?.inquiry || "-", width: caseColWidths[3], fill, options: { size: 6.8, align: "left", bold: true, maxLines: 2, lineHeight: 3.45 } },\n      { value: item ? Number(item.finalScore || 0).toFixed(2) : "-", width: caseColWidths[4], fill, options: { size: 7.3, align: "center", bold: true, maxLines: 1 } },\n      { value: item?.grade || "-", width: caseColWidths[5], fill, options: { size: 7.3, align: "center", bold: true, maxLines: 1 } },\n      { value: item ? "NO" : "-", width: caseColWidths[6], fill, options: { size: 6.8, align: "center", bold: true, maxLines: 1 } },\n      { value: kpiStatus, width: caseColWidths[7], fill, options: { size: 7.0, align: "center", bold: true, maxLines: 1, color: isKpiFail ? kpiFailText : item ? good : muted } },\n    ] as any);\n    y += rowH;\n  }`;
  source = replaceOnce(source, oldCaseLoop, newCaseLoop, "Monthly Case List rows");

  const oldTopicHeader = `  const drawTopicHeader = () => {\n    [\n      [0, 1, "Topic"],\n      [1, 4, "Description"],\n      [4, 6, "Avg Score"],\n      [6, 7, "Max"],\n      [7, 10, "Avg %"],\n    ].forEach(([start, end, label]) => {\n      drawCellCols(Number(start), Number(end), y, 7.4, String(label), purple, {\n        bold: true,\n        color: [255,255,255],\n        size: 8.0,\n        align: "center",\n        maxLines: 1,\n      });\n    });\n    y += 7.4;\n  };`;

  const newTopicHeader = `  const topicColWidths = [12, 77, 28, 18, 23, 28];\n  const drawTopicHeader = () => {\n    drawCellsByWidth(left, y, 7.4, ["Topic", "Description", "Avg Score", "Max", "Avg %", "KPI Status"].map((label, index) => ({\n      value: label,\n      width: topicColWidths[index],\n      fill: purple,\n      options: { bold: true, color: [255,255,255] as [number,number,number], size: index === 5 ? 7.2 : 7.8, align: "center" as const, maxLines: 1 },\n    })));\n    y += 7.4;\n  };`;
  source = replaceOnce(source, oldTopicHeader, newTopicHeader, "Monthly Topic Performance header");

  const oldTopicRows = `      const fill: [number, number, number] = index % 2 === 0 ? [255,255,255] : [250,247,253];\n      drawCellCols(0, 1, y, topicRowH, item.code, fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });\n      drawCellCols(1, 4, y, topicRowH, item.title, fill, { size: 7.4, align: "left", bold: true, maxLines: 1 });\n      drawCellCols(4, 6, y, topicRowH, formatMetric(item.avgScore), fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });\n      drawCellCols(6, 7, y, topicRowH, formatTopicMax(item.max), fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });\n      drawCellCols(7, 10, y, topicRowH, item.avgPercent === null ? "-" : \`${'${item.avgPercent.toFixed(2)}'}%\`, fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });\n      y += topicRowH;`;

  const newTopicRows = `      const isKpiFail = item.avgPercent !== null && Number(item.avgPercent) < KPI_TARGET;\n      const fill: [number, number, number] = isKpiFail\n        ? kpiFailFill\n        : index % 2 === 0 ? [255,255,255] : [250,247,253];\n      const kpiStatus = item.avgPercent === null ? "-" : isKpiFail ? "Not Passed" : "Passed";\n      drawCellsByWidth(left, y, topicRowH, [\n        { value: item.code, width: topicColWidths[0], fill, options: { size: 7.6, align: "center", bold: true, maxLines: 1 } },\n        { value: item.title, width: topicColWidths[1], fill, options: { size: 7.2, align: "left", bold: true, maxLines: 1 } },\n        { value: formatMetric(item.avgScore), width: topicColWidths[2], fill, options: { size: 7.6, align: "center", bold: true, maxLines: 1 } },\n        { value: formatTopicMax(item.max), width: topicColWidths[3], fill, options: { size: 7.6, align: "center", bold: true, maxLines: 1 } },\n        { value: item.avgPercent === null ? "-" : \`${'${item.avgPercent.toFixed(2)}'}%\`, width: topicColWidths[4], fill, options: { size: 7.6, align: "center", bold: true, maxLines: 1 } },\n        { value: kpiStatus, width: topicColWidths[5], fill, options: { size: 7.0, align: "center", bold: true, maxLines: 1, color: isKpiFail ? kpiFailText : item.avgPercent === null ? muted : good } },\n      ] as any);\n      y += topicRowH;`;
  source = replaceOnce(source, oldTopicRows, newTopicRows, "Monthly Topic Performance rows");

  fs.writeFileSync(rendererPath, source, "utf8");
}

console.log("Patched Final Signed PDF with KPI Status columns and red highlighting for values below 85%.");
