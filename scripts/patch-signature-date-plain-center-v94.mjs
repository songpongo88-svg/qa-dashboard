import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signatureCenterPath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");
const marker = "signature-date-plain-centered-row-v94";

let source = fs.readFileSync(signatureCenterPath, "utf8");

if (!source.includes(marker)) {
  const before = `        drawCell(x, panelY + 27.4, w, 4.6, "", [255, 255, 255], { size: 5.8, align: "center" });
        drawSignedLine("วันที่", centerX, panelY + 30.3, signerDate(role));`;

  const after = `        drawCell(x, panelY + 27.4, w, 4.6, signerDate(role), [255, 255, 255], {
          bold: true,
          size: 5.9,
          align: "center",
          maxLines: 1,
        });
        // signature-date-plain-centered-row-v94`;

  if (!source.includes(before)) {
    throw new Error("Missing Signature Center date-row anchor for v94");
  }

  source = source.replace(before, after);
  fs.writeFileSync(signatureCenterPath, source, "utf8");
}

console.log("Patched Signature Center PDF: date/time is centered as the third signature detail row.");
