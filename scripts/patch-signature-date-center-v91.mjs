import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signatureCenterPath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");
const marker = "signature-date-center-v91";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing ${label} anchor`);
  return source.replace(before, after);
}

let source = fs.readFileSync(signatureCenterPath, "utf8");
if (!source.includes(marker)) {
  source = replaceOnce(
    source,
    '          pdf.text(value, (lineStart + lineEnd) / 2, lineY - 0.35, { align: "center" });',
    '          const valueX = label === "วันที่" ? centerX : (lineStart + lineEnd) / 2;\n          pdf.text(value, valueX, lineY - 0.35, { align: "center" });\n          // signature-date-center-v91',
    "signature date value alignment"
  );

  fs.writeFileSync(signatureCenterPath, source, "utf8");
}

console.log("Patched Signature Center PDF: signing dates are centered on the true panel center.");
