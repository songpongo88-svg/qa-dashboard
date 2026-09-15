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

// Keep all table headers on one typography scale.
block = block.replace(
  /drawColText\(label, cx, y \+ 5\.6, width, 7\.6, true,/g,
  'drawColText(label, cx, y + 5.6, width, 7.6, true,'
);

// Ranking table body: Status must not be smaller than neighboring body cells.
block = block.replace(
  /drawColText\(value, cx, y \+ 5\.4, width, label === "Status" \? 6\.8 : 7\.3,/g,
  'drawColText(value, cx, y + 5.4, width, 7.3,'
);

// Topic table body: Description must use the same body size as the rest of the row.
block = block.replace(
  /drawColText\(value, cx, y \+ 5\.4, width, label === "Description" \? 6\.8 : 7\.1,/g,
  'drawColText(value, cx, y + 5.4, width, 7.1,'
);

// Corporate renderer variants sometimes shrink a cell with fitCellText. Do not allow
// table body text to fall below the normal readable body scale.
block = block.replace(
  /fitCellText\(([^;\n]+?),\s*5\.4\)/g,
  'fitCellText($1, 6.8)'
);
block = block.replace(
  /fitCellText\(([^;\n]+?),\s*5\.6\)/g,
  'fitCellText($1, 6.8)'
);

// If the corporate Topic Performance renderer is present, prefer a readable two-line
// status over shrinking long text such as "Improvement Needed".
block = block.replace(
  /const\s+statusText\s*=\s*String\(value\s*\?\?\s*""\);\s*const\s+fittedStatus\s*=\s*fitCellText\(statusText,\s*([^,]+),\s*([^,]+),\s*([^\)]+)\);/g,
  'const statusText = String(value ?? ""); const fittedStatus = { text: statusText, size: 7.1 };'
);

if (block === originalBlock) {
  console.log(`${PATCH}: no legacy size-specific pattern found; emitting generator diagnostics`);
}

// Build log diagnostics are intentionally concise and help keep this late patch compatible
// with the production renderer assembled by earlier build-time patches.
for (const needle of ["Improvement Needed", "TEAM TOPIC PERFORMANCE", "fitCellText", "drawTableHeader", 'label === "Status"']) {
  const index = block.indexOf(needle);
  if (index >= 0) {
    const excerpt = block.slice(Math.max(0, index - 350), Math.min(block.length, index + 900)).replace(/\s+/g, " ");
    console.log(`${PATCH}: diagnostic ${needle}: ${excerpt}`);
  }
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
console.log(`${PATCH}: standardized Monthly Payment PDF header/body typography without changing document data`);
