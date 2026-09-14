import fs from "node:fs";

const file = "src/caseDetailOfficialPdf.ts";
let source = fs.readFileSync(file, "utf8");
const marker = "// evaluation-last-updated-v87-pdf";

if (source.includes(marker)) {
  console.log("Evaluation Last Updated PDF fallback already applied");
  process.exit(0);
}

const importAnchor = 'import { parseRichTextRuns, richTextToPlainText, type RichTextRun } from "./richText";\n';
if (!source.includes(importAnchor)) {
  throw new Error("Evaluation Last Updated PDF fallback: import anchor not found");
}
source = source.replace(importAnchor, importAnchor + marker + "\n");

const rowAnchor = "    y += secondSelectionRowH;\n";
if (!source.includes(rowAnchor)) {
  throw new Error("Evaluation Last Updated PDF fallback: main header row anchor not found");
}

source = source.replace(
  rowAnchor,
  `    y += secondSelectionRowH;\n\n    const lastUpdatedText = safeText(caseItem.lastUpdatedAt, "");\n    if (lastUpdatedText) {\n      addPageIfNeeded(8);\n      label(0, y, 1, 8, "Last Updated");\n      value(1, y, 7, 8, lastUpdatedText, LIGHT_PURPLE, { align: "left", valign: "middle", maxLines: 2, size: 6.4 });\n      y += 8;\n    }\n`
);

fs.writeFileSync(file, source, "utf8");
console.log("Applied Last Updated to the merged Case Detail PDF header");
