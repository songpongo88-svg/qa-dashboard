import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signatureCenterPath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");
const marker = "signature-date-center-final-v93";

let source = fs.readFileSync(signatureCenterPath, "utf8");

if (!source.includes(marker)) {
  const startMarker = '      const drawSignedLine = (label: string, centerX: number, lineY: number, value = "") => {';
  const endMarker = "      const drawSignaturePanel = (";
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error("v93: drawSignedLine start anchor not found");
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error("v93: drawSignaturePanel anchor not found");

  const replacement = `      const drawSignedLine = (label: string, centerX: number, lineY: number, value = "") => {
        if (label === "วันที่") {
          // FINAL date-row geometry: the date text and dotted field use the exact
          // signature-panel center axis. Keep this patch last in prebuild so later
          // Signature Center transforms cannot restore the old +3.5 mm offset.
          const fieldHalfWidth = 21.5;
          const lineStart = centerX - fieldHalfWidth;
          const lineEnd = centerX + fieldHalfWidth;
          const labelX = lineStart - 2.0;

          setTemplateFont(6.0, false, muted);
          pdf.text(label, labelX, lineY - 0.25, { align: "right" });

          if (value) {
            setTemplateFont(5.9, true, black);
            const valueWidth = pdf.getTextWidth(value);
            const valueGapHalf = Math.max(7.2, valueWidth / 2 + 1.6);
            drawDottedLine(lineStart, lineY, centerX - valueGapHalf);
            drawDottedLine(centerX + valueGapHalf, lineY, lineEnd);
            pdf.text(value, centerX, lineY - 0.35, { align: "center" });
          } else {
            drawDottedLine(lineStart, lineY, lineEnd);
          }
          // signature-date-center-final-v93
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

`;

  source = source.slice(0, start) + replacement + source.slice(end);
  fs.writeFileSync(signatureCenterPath, source, "utf8");
}

console.log("Patched Signature Center FINAL: date text and dotted field are centered on each panel axis.");
