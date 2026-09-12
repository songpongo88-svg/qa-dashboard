import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signatureCenterPath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");

let source = fs.readFileSync(signatureCenterPath, "utf8");

// Approved layout: keep the existing "วันที่" label, dotted line, signature,
// signer name, role, panel geometry and all other spacing exactly as-is.
// Move ONLY the date/time text onto the same centerX axis as the signature panel.

// v94 converted some date rows into a plain full-width cell. Restore those rows
// to the original date-line layout first so the label/dotted line stay unchanged.
const v94RowPattern = /        drawCell\(x, panelY \+ 27\.4, w, 4\.6, signerDate\(role\), \[255, 255, 255\], \{\n          bold: true,\n          size: 5\.9,\n          align: "center",\n          maxLines: 1,\n        \}\);\n        \/\/ signature-date-plain-centered-row-v94/g;

const restoredDateRow = `        drawCell(x, panelY + 27.4, w, 4.6, "", [255, 255, 255], { size: 5.8, align: "center" });
        drawSignedLine("วันที่", centerX, panelY + 30.3, signerDate(role));
        // signature-date-value-axis-v95`;

let restoredRowCount = 0;
source = source.replace(v94RowPattern, () => {
  restoredRowCount += 1;
  return restoredDateRow;
});

// In every legacy drawSignedLine helper, preserve the current label and dotted-line
// positions. Only the value coordinate changes for the date row:
//   other rows -> existing field midpoint
//   วันที่     -> exact panel centerX (same axis as signature/name/role)
const legacyValueLine = 'pdf.text(value, (lineStart + lineEnd) / 2, lineY - 0.35, { align: "center" });';
const centeredValueLine = 'pdf.text(value, label === "วันที่" ? centerX : (lineStart + lineEnd) / 2, lineY - 0.35, { align: "center" });';

const valueLineCount = source.split(legacyValueLine).length - 1;
if (valueLineCount > 0) {
  source = source.split(legacyValueLine).join(centeredValueLine);
}

// v93-style helpers already render the date value at centerX while retaining the
// label and dotted line. Leave those untouched; they already match the approved mockup.
const alreadyCenteredCount = (source.match(/pdf\.text\(value, centerX, lineY - 0\.35, \{ align: "center" \}\);/g) || []).length;

if (restoredRowCount === 0 && valueLineCount === 0 && alreadyCenteredCount === 0 && !source.includes("signature-date-value-axis-v95")) {
  throw new Error("v95: no Signature PDF date-axis anchors found");
}

fs.writeFileSync(signatureCenterPath, source, "utf8");
console.log(
  `Patched Signature PDF approved date axis: restored ${restoredRowCount} row(s), centered ${valueLineCount} legacy value line(s), ${alreadyCenteredCount} already centered helper(s).`
);
