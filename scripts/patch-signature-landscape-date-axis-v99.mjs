import fs from "node:fs";

const file = "src/SignatureCenterMockup.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "signature-landscape-date-axis-v99";

if (source.includes(marker)) {
  console.log("Signature landscape date axis v99 already applied");
  process.exit(0);
}

if (!source.includes("signature-four-column-landscape-v98")) {
  throw new Error("Signature v99: four-column landscape v98 must run first");
}

const centerAnchor = `        const lineCenter = (lineStart + lineEnd) / 2;\n        setTemplateFont(5.8, false, muted);`;
const centerReplacement = `        const lineCenter = (lineStart + lineEnd) / 2;\n        // Date/time must sit on the exact panel center axis. Keep the label and\n        // the dotted line outer geometry unchanged; only center the value/gap.\n        const valueCenter = label === "วันที่" ? x + w / 2 : lineCenter;\n        // signature-landscape-date-axis-v99\n        setTemplateFont(5.8, false, muted);`;

if (!source.includes(centerAnchor)) {
  throw new Error("Signature v99: compact signed-line center anchor not found");
}
source = source.replace(centerAnchor, centerReplacement);

const valueAnchor = `          drawSignatureDottedLine(lineStart, lineY, lineCenter - valueGapHalf);\n          drawSignatureDottedLine(lineCenter + valueGapHalf, lineY, lineEnd);\n          setTemplateFont(5.7, true, black);\n          pdf.text(value, lineCenter, lineY - 0.35, { align: "center" });`;
const valueReplacement = `          drawSignatureDottedLine(lineStart, lineY, valueCenter - valueGapHalf);\n          drawSignatureDottedLine(valueCenter + valueGapHalf, lineY, lineEnd);\n          setTemplateFont(5.7, true, black);\n          pdf.text(value, valueCenter, lineY - 0.35, { align: "center" });`;

if (!source.includes(valueAnchor)) {
  throw new Error("Signature v99: date value placement anchor not found");
}
source = source.replace(valueAnchor, valueReplacement);

fs.writeFileSync(file, source, "utf8");
console.log("Patched landscape Signature PDF: date/time values align to each panel center axis without moving labels or line endpoints.");
