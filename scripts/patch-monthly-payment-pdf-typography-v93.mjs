import fs from "node:fs";

const PATCH = "monthly-payment-pdf-typography-v93";
const file = "src/SignatureCenterMockup.tsx";
let source = fs.readFileSync(file, "utf8");

if (source.includes(`// ${PATCH}`)) {
  console.log(`${PATCH}: already applied`);
  process.exit(0);
}

const start = source.indexOf("function generatePaymentPdfFile(");
const altStart = source.indexOf("async function generatePaymentPdfFile(");
const fnStart = start >= 0 ? start : altStart;
const fnEnd = source.indexOf("\nfunction SignaturePill", fnStart);
if (fnStart < 0 || fnEnd < 0) {
  throw new Error(`${PATCH}: Monthly Payment PDF generator not found`);
}

let block = source.slice(fnStart, fnEnd);
const originalBlock = block;

// Typography hierarchy for Monthly Payment PDF:
// section titles = 11.5, table headers = 7.6, all table body cells = 7.2.
// Long content gets space instead of a smaller font.
block = block.replace(
  /drawColText\(label, cx, y \+ 5\.6, width, 7\.6, true,/g,
  'drawColText(label, cx, y + 5.6, width, 7.6, true,'
);

// Agent Monthly Ranking: use one body size for every column, including Status.
block = block.replace(
  /drawColText\(value, cx, y \+ 5\.4, width, label === "Status" \? 6\.8 : 7\.3,/g,
  'drawColText(value, cx, y + 5.4, width, 7.2,'
);
block = block.replace(
  /drawColText\(value, cx, y \+ 5\.4, width, 7\.3,/g,
  'drawColText(value, cx, y + 5.4, width, 7.2,'
);

// Topic Performance: Description and Status use the same body size as numeric cells.
block = block.replace(
  /drawColText\(value, cx, y \+ 5\.4, width, label === "Description" \? 6\.8 : 7\.1,/g,
  'drawColText(value, cx, y + 5.4, width, 7.2,'
);
block = block.replace(
  /drawColText\(value, cx, y \+ 5\.4, width, 7\.1,/g,
  'drawColText(value, cx, y + 5.4, width, 7.2,'
);

// Give a long Topic Status more room without changing total table width.
block = block.replace(
  '["Description", 86],\n    ["Avg Score", 24],\n    ["Max", 18],\n    ["Avg %", 22],\n    ["Status", 22],',
  '["Description", 80],\n    ["Avg Score", 24],\n    ["Max", 18],\n    ["Avg %", 22],\n    ["Status", 28],'
);

// Corporate renderer variants sometimes shrink a cell with fitCellText. Keep the
// readable body floor aligned to the same hierarchy instead of allowing tiny status text.
block = block.replace(
  /fitCellText\(([^;\n]+?),\s*5\.4\)/g,
  'fitCellText($1, 7.2)'
);
block = block.replace(
  /fitCellText\(([^;\n]+?),\s*5\.6\)/g,
  'fitCellText($1, 7.2)'
);
block = block.replace(
  /fitCellText\(([^;\n]+?),\s*6\.8\)/g,
  'fitCellText($1, 7.2)'
);

// If a corporate Topic Performance variant has a dedicated fitted status object,
// keep its font at the normal body size instead of shrinking Improvement Needed.
block = block.replace(
  /const\s+statusText\s*=\s*String\(value\s*\?\?\s*""\);\s*const\s+fittedStatus\s*=\s*fitCellText\(statusText,\s*([^,]+),\s*([^,]+),\s*([^\)]+)\);/g,
  'const statusText = String(value ?? ""); const fittedStatus = { text: statusText, size: 7.2 };'
);

if (block === originalBlock) {
  throw new Error(`${PATCH}: no Monthly Payment PDF typography anchors changed`);
}

block = block.replace(
  /function generatePaymentPdfFile\(/,
  `// ${PATCH}\nfunction generatePaymentPdfFile(`
);
block = block.replace(
  /async function generatePaymentPdfFile\(/,
  `// ${PATCH}\nasync function generatePaymentPdfFile(`
);

source = source.slice(0, fnStart) + block + source.slice(fnEnd);
fs.writeFileSync(file, source, "utf8");
console.log(`${PATCH}: section/header/body typography standardized; Topic Status gets extra width and no tiny-font exception`);
