import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signatureCenterPath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");
const marker = "signature-date-plain-centered-row-v94";

let source = fs.readFileSync(signatureCenterPath, "utf8");

const before = `        drawCell(x, panelY + 27.4, w, 4.6, "", [255, 255, 255], { size: 5.8, align: "center" });
        drawSignedLine("วันที่", centerX, panelY + 30.3, signerDate(role));`;

const after = `        drawCell(x, panelY + 27.4, w, 4.6, signerDate(role), [255, 255, 255], {
          bold: true,
          size: 5.9,
          align: "center",
          maxLines: 1,
        });
        // signature-date-plain-centered-row-v94`;

// SignatureCenterMockup currently contains more than one Signature PDF renderer.
// Patch every matching panel row, not only the first occurrence. The previous
// implementation used String.replace(), so one renderer stayed on the old
// asymmetric "วันที่ ..... value ....." geometry and was the one used by the
// exported page 2 PDF.
const matchCount = source.split(before).length - 1;
if (matchCount > 0) {
  source = source.split(before).join(after);
  fs.writeFileSync(signatureCenterPath, source, "utf8");
} else if (!source.includes(marker)) {
  throw new Error("Missing Signature Center date-row anchor for v94");
}

console.log(
  `Patched Signature Center PDF: centered plain date/time row applied to ${matchCount} renderer(s).`
);
