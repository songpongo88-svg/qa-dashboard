import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signatureCenterPath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");

let source = fs.readFileSync(signatureCenterPath, "utf8");

// Normalize every drawSignedLine helper in SignatureCenterMockup. There are multiple
// PDF renderers in this file. For the date row, do not use the legacy label/dotted
// field at all: render only the date/time on the exact panel centerX axis.
const helperPattern = /      const drawSignedLine = \(label: string, centerX: number, lineY: number, value = ""\) => \{[\s\S]*?\n      \};\n\n      const drawSignaturePanel = \(/g;

const helperReplacement = `      const drawSignedLine = (label: string, centerX: number, lineY: number, value = "") => {
        if (label === "วันที่") {
          if (value) {
            setTemplateFont(5.9, true, black);
            pdf.text(value, centerX, lineY - 0.35, { align: "center" });
          }
          // signature-date-axis-v95: date/time uses the exact signature panel center.
          return;
        }

        const labelX = centerX - 20;
        const lineStart = centerX - 18;
        const lineEnd = centerX + 25;
        setTemplateFont(6.0, false, muted);
        pdf.text(label, labelX, lineY - 0.25, { align: "right" });
        drawDottedLine(lineStart, lineY, lineEnd);
        if (value) {
          setTemplateFont(5.9, true, black);
          pdf.text(value, (lineStart + lineEnd) / 2, lineY - 0.35, { align: "center" });
        }
      };

      const drawSignaturePanel = (`;

let helperCount = 0;
source = source.replace(helperPattern, () => {
  helperCount += 1;
  return helperReplacement;
});

// Also convert any remaining legacy date-row call directly into the same full-width
// centered detail row used by the signer name and role. This catches renderers whose
// surrounding helper was already transformed by an earlier patch.
const legacyDateRowPattern = /        drawCell\(x, panelY \+ 27\.4, w, 4\.6, "", \[255, 255, 255\], \{ size: 5\.8, align: "center" \}\);\n        drawSignedLine\("วันที่", centerX, panelY \+ 30\.3, signerDate\(role\)\);/g;
const centeredDateRow = `        drawCell(x, panelY + 27.4, w, 4.6, signerDate(role), [255, 255, 255], {
          bold: true,
          size: 5.9,
          align: "center",
          maxLines: 1,
        });
        // signature-date-row-exact-center-v95`;
let rowCount = 0;
source = source.replace(legacyDateRowPattern, () => {
  rowCount += 1;
  return centeredDateRow;
});

if (helperCount === 0 && rowCount === 0 && !source.includes("signature-date-axis-v95") && !source.includes("signature-date-row-exact-center-v95")) {
  throw new Error("v95: Signature PDF date-center anchors not found");
}

fs.writeFileSync(signatureCenterPath, source, "utf8");
console.log(`Patched Signature PDF exact date axis: ${helperCount} helper(s), ${rowCount} legacy row(s).`);
