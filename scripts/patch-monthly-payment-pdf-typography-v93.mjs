import fs from "node:fs";
import path from "node:path";

const PATCH = "monthly-payment-pdf-typography-v93";
const file = "src/SignatureCenterMockup.tsx";
let source = fs.readFileSync(file, "utf8");

if (!source.includes(`// ${PATCH}`)) {
  const start = source.indexOf("function generatePaymentPdfFile(");
  const altStart = source.indexOf("async function generatePaymentPdfFile(");
  const fnStart = start >= 0 ? start : altStart;
  const fnEnd = source.indexOf("\nfunction SignaturePill", fnStart);
  if (fnStart < 0 || fnEnd < 0) {
    throw new Error(`${PATCH}: Monthly Payment PDF generator not found`);
  }

  let block = source.slice(fnStart, fnEnd);
  const originalBlock = block;

  block = block.replace(
    /drawColText\(value, cx, y \+ 5\.4, width, label === "Status" \? 6\.8 : 7\.3,/g,
    'drawColText(value, cx, y + 5.4, width, 7.3,'
  );

  block = block.replace(
    /drawColText\(value, cx, y \+ 5\.4, width, label === "Description" \? 6\.8 : 7\.1,/g,
    'drawColText(value, cx, y + 5.4, width, 7.1,'
  );

  block = block.replace(
    /fitCellText\(([^;\n]+?),\s*5\.4\)/g,
    'fitCellText($1, 6.8)'
  );
  block = block.replace(
    /fitCellText\(([^;\n]+?),\s*5\.6\)/g,
    'fitCellText($1, 6.8)'
  );

  if (block === originalBlock) {
    console.log(`${PATCH}: legacy generator had no remaining size-specific pattern`);
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
  console.log(`${PATCH}: standardized legacy Monthly Payment PDF typography`);
}

// Trace the real post-patch production renderer. The user-facing corporate PDF is not
// the legacy Monthly Team Summary function, so inspect every final src file here.
const needles = [
  "QA MONTHLY INCENTIVE PAYMENT AUTHORIZATION",
  "PAYMENT CERTIFICATION",
  "TEAM TOPIC PERFORMANCE",
  "Team Performance & Payment Authorization",
  "Improvement Needed",
  "READY TO EXPORT",
  "fitCellText",
];

function walk(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...walk(full));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) output.push(full);
  }
  return output;
}

for (const srcFile of walk("src")) {
  const text = fs.readFileSync(srcFile, "utf8");
  for (const needle of needles) {
    const index = text.indexOf(needle);
    if (index < 0) continue;
    const excerpt = text
      .slice(Math.max(0, index - 650), Math.min(text.length, index + 1400))
      .replace(/\s+/g, " ");
    console.log(`${PATCH}: TRACE ${srcFile} :: ${needle} :: ${excerpt}`);
  }
}
