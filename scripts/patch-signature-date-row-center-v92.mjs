import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const signatureCenterPath = path.resolve(__dirname, "../src/SignatureCenterMockup.tsx");
const marker = "signature-date-row-center-v92";

let source = fs.readFileSync(signatureCenterPath, "utf8");

if (!source.includes(marker)) {
  const startMarker = "      const drawSignedLine = (label: string, centerX: number, lineY: number, value = \"\") => {";
  const endMarker = "      const drawSignaturePanel = (";
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error("Missing drawSignedLine start anchor for signature date row centering");
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error("Missing drawSignaturePanel end anchor for signature date row centering");

  const replacement = `      const drawSignedLine = (label: string, centerX: number, lineY: number, value = "") => {
        if (label === "วันที่") {
          // Keep the complete date row on the true panel axis. The old dotted field
          // was centered 3.5 mm to the right; move the label + line together and
          // keep signed/unsigned rows on exactly the same outer geometry.
          const lineStart = centerX - 21.5;
          const lineEnd = centerX + 21.5;
          const labelX = centerX - 23.5;

          setTemplateFont(6.0, false, muted);
          pdf.text(label, labelX, lineY - 0.25, { align: "right" });

          if (value) {
            setTemplateFont(5.9, true, black);
            const valueWidth = pdf.getTextWidth(value);
            const valueGapHalf = Math.max(7.2, valueWidth / 2 + 1.6);

            drawDottedLine(lineStart, lineY, centerX - valueGapHalf);
            drawDottedLine(centerX + valueGapHalf, lineY, lineEnd);
            setTemplateFont(5.9, true, black);
            pdf.text(value, centerX, lineY - 0.35, { align: "center" });
          } else {
            drawDottedLine(lineStart, lineY, lineEnd);
          }
          // signature-date-row-center-v92
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

console.log("Patched Signature Center PDF: full date row is centered on each signature panel axis with balanced dotted segments.");
