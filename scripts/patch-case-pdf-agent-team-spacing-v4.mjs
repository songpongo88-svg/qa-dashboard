import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pdfPath = path.resolve(__dirname, "../src/caseDetailOfficialPdf.ts");
const marker = "case-pdf-agent-team-spacing-v4";

let source = fs.readFileSync(pdfPath, "utf8");
if (source.includes(marker)) {
  console.log("Case PDF Agent/Team spacing patch already applied.");
  process.exit(0);
}
if (!source.includes("bulk-case-pdf-filter-teamname-v3")) {
  throw new Error("Team-name PDF patch v3 must run before spacing patch v4");
}

const before = `  const agentValue = (col: number, yy: number, span: number, h: number, caseItemValue: any) => {\n    const x = xOf(col);\n    const w = wOf(col, span);\n    rect(x, yy, w, h, LIGHT_PURPLE);\n    const team = safeText(caseItemValue?.teamName || caseItemValue?.team || "", "");\n    if (!team) {\n      writeText(caseItemValue?.agent, x, yy, w, h, { bold: true, size: 6.8, align: "center", valign: "middle", maxLines: 2 });\n      return;\n    }\n    writeText(caseItemValue?.agent, x, yy + 0.4, w, Math.max(6, h * 0.57), { bold: true, size: 6.8, align: "center", valign: "middle", maxLines: 2 });\n    writeText(\`(\${team})\`, x, yy + h * 0.52, w, Math.max(4.5, h * 0.4), { bold: false, size: 5.4, color: [105, 105, 105], align: "center", valign: "middle", maxLines: 1 });\n  };`;

const after = `  // ${marker}\n  const agentValue = (col: number, yy: number, span: number, h: number, caseItemValue: any) => {\n    const x = xOf(col);\n    const w = wOf(col, span);\n    rect(x, yy, w, h, LIGHT_PURPLE);\n    const agent = safeText(caseItemValue?.agent);\n    const team = safeText(caseItemValue?.teamName || caseItemValue?.team || "", "");\n    if (!team) {\n      writeText(agent, x, yy, w, h, { bold: true, size: 6.8, align: "center", valign: "middle", maxLines: 2 });\n      return;\n    }\n\n    setFont("bold");\n    doc.setFontSize(6.8);\n    const agentLines = wrapPdfText(agent, Math.max(2, w - TEXT_INNER_PAD_X * 2)).slice(0, 2);\n    const agentLineH = 6.8 * 0.46;\n    const agentBlockH = Math.max(agentLineH, agentLines.length * agentLineH);\n\n    setFont("normal");\n    doc.setFontSize(5.4);\n    const teamLine = wrapPdfText(\`(\${team})\`, Math.max(2, w - TEXT_INNER_PAD_X * 2))[0] || \`(\${team})\`;\n    const teamLineH = 5.4 * 0.46;\n    const gap = 0.45;\n    const totalBlockH = agentBlockH + gap + teamLineH;\n    const blockTop = yy + Math.max(1.2, (h - totalBlockH) / 2);\n\n    setFont("bold");\n    doc.setFontSize(6.8);\n    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);\n    const agentStartY = blockTop + agentLineH * 0.82;\n    agentLines.forEach((line: string, index: number) => {\n      doc.text(line, x + w / 2, agentStartY + index * agentLineH, { align: "center" });\n    });\n\n    setFont("normal");\n    doc.setFontSize(5.4);\n    doc.setTextColor(105, 105, 105);\n    const teamY = blockTop + agentBlockH + gap + teamLineH * 0.82;\n    doc.text(teamLine, x + w / 2, teamY, { align: "center" });\n    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);\n  };`;

if (!source.includes(before)) throw new Error("Missing Agent/Team PDF renderer anchor");
source = source.replace(before, after);
fs.writeFileSync(pdfPath, source, "utf8");
console.log("Patched Agent/Team text to sit closer and vertically center as one block.");
