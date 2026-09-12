export function signatureFourColumnPdfPatch() {
  return {
    name: "signature-four-column-pdf-v100",
    enforce: "pre",
    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SignatureCenterMockup.tsx")) return null;

      // If the npm prebuild patch already ran, keep that result.
      if (code.includes("signature-four-column-landscape-v98")) return null;

      let next = code;

      const oldSignedLine = `      const drawSignedLine = (label: string, centerX: number, lineY: number, value = "") => {\n        const labelX = centerX - 20;\n        const lineStart = centerX - 18;\n        const lineEnd = centerX + 25;\n        setTemplateFont(6.0, false, muted);\n        pdf.text(label, labelX, lineY - 0.25, { align: "right" });\n        drawDottedLine(lineStart, lineY, lineEnd);\n        if (value) {\n          setTemplateFont(5.9, true, black);\n          pdf.text(value, (lineStart + lineEnd) / 2, lineY - 0.35, { align: "center" });\n        }\n      };`;

      const centeredSignedLine = `      const drawSignedLine = (label: string, centerX: number, lineY: number, value = "") => {\n        const lineStart = centerX - 21.5;\n        const lineEnd = centerX + 21.5;\n        const labelX = centerX - 23.5;\n        setTemplateFont(6.0, false, muted);\n        pdf.text(label, labelX, lineY - 0.25, { align: "right" });\n        if (value) {\n          setTemplateFont(5.9, true, black);\n          const valueWidth = pdf.getTextWidth(value);\n          const valueGapHalf = Math.max(7.2, valueWidth / 2 + 1.6);\n          drawDottedLine(lineStart, lineY, centerX - valueGapHalf);\n          drawDottedLine(centerX + valueGapHalf, lineY, lineEnd);\n          setTemplateFont(5.9, true, black);\n          pdf.text(value, centerX, lineY - 0.35, { align: "center" });\n        } else {\n          drawDottedLine(lineStart, lineY, lineEnd);\n        }\n      };`;

      if (next.includes(oldSignedLine)) {
        next = next.replace(oldSignedLine, centeredSignedLine);
      }

      const startMarker = `      const halfW = tableW / 2 - 3;`;
      const endMarker = `      const safeAgentFileName =`;
      const start = next.indexOf(startMarker);
      const end = start >= 0 ? next.indexOf(endMarker, start) : -1;
      if (start < 0 || end < 0) return null;

      const fourColumnBlock = `      // signature-four-column-vite-v100\n      pdf.addPage("a4", "landscape");\n      y = 12;\n      const signaturePageW = pdf.internal.pageSize.getWidth();\n      const signaturePageH = pdf.internal.pageSize.getHeight();\n      const signatureLeft = 10;\n      const signatureRight = signaturePageW - 10;\n      const signatureTableW = signatureRight - signatureLeft;\n      const signatureGap = 4;\n      const signaturePanelW = (signatureTableW - signatureGap * 3) / 4;\n\n      drawCell(signatureLeft, y, signatureTableW, 7.2, "Acknowledgement / Signature", purple, {\n        bold: true,\n        color: [255, 255, 255],\n        size: 9.6,\n        align: "left",\n        maxLines: 1,\n      });\n      y += 10;\n\n      drawSignaturePanel(signatureLeft, y, signaturePanelW, "Agent", "Agent ผู้ถูกประเมิน");\n      drawSignaturePanel(signatureLeft + (signaturePanelW + signatureGap), y, signaturePanelW, "Senior", "Senior หัวหน้าทีมผู้ถูกประเมิน");\n      drawSignaturePanel(signatureLeft + (signaturePanelW + signatureGap) * 2, y, signaturePanelW, "Supervisor", "Supervisor หัวหน้าแผนก");\n      drawSignaturePanel(signatureLeft + (signaturePanelW + signatureGap) * 3, y, signaturePanelW, "QA", "QA ผู้ตรวจสอบ");\n\n      setTemplateFont(7.0, false, muted);\n      pdf.text(\n        \`Document Ref. \${pdfDocumentRef} | Generated: \${formatDateTime(new Date().toISOString())} | \${documentStatus} | Signed: \${signedRoles}/\${SIGNATURE_FLOW.length}\`,\n        signatureRight,\n        signaturePageH - 5.4,\n        { align: "right" }\n      );\n\n`;

      next = next.slice(0, start) + fourColumnBlock + next.slice(end);
      return { code: next, map: null };
    },
  };
}
