export function signatureFourColumnPdfPatch() {
  return {
    name: "signature-four-column-pdf-v101",
    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SignatureCenterMockup.tsx")) return null;

      // Run after the legacy pre-transform patches and immediately before React.
      // If an earlier build step already produced the final renderer, keep it.
      if (code.includes("signature-four-column-final-v101") || code.includes("signature-four-column-landscape-v98")) {
        return null;
      }

      const startMarker = `      y += 3;\n      drawSection("Acknowledgement / Signature");`;
      const endMarker = `      const safeAgentFileName =`;
      const start = code.indexOf(startMarker);
      const end = start >= 0 ? code.indexOf(endMarker, start) : -1;

      if (start < 0 || end < 0) {
        throw new Error("Signature four-column v101: monthly signature renderer target not found");
      }

      const replacement = String.raw`      // signature-four-column-final-v101
      const signerName = (role: SignRole) => {
        const signed = getSignedEntry(entries, role);
        return getRoleSigner(selectedDocument, role) || signed?.signerName || signed?.signedBy || "-";
      };
      const signerDate = (role: SignRole) => {
        const signed = getSignedEntry(entries, role);
        return signed ? formatDateTime(signed.signedAt) : "";
      };
      const signatureData = (role: SignRole) => getSignedEntry(entries, role)?.signatureDataUrl || "";
      const normalizedSignatures = new Map<SignRole, string>();
      for (const role of SIGNATURE_FLOW) {
        const signature = signatureData(role);
        normalizedSignatures.set(role, signature ? await normalizeSignatureDataUrl(signature) : "");
      }

      // Page 1 stays portrait. The signature page is always a separate A4 landscape page.
      pdf.addPage("a4", "landscape");
      const signaturePageW = pdf.internal.pageSize.getWidth();
      const signaturePageH = pdf.internal.pageSize.getHeight();
      const signatureLeft = 10;
      const signatureRight = signaturePageW - 10;
      const signatureTableW = signatureRight - signatureLeft;
      let signatureY = 12;

      drawCell(signatureLeft, signatureY, signatureTableW, 8, "Acknowledgement / Signature", purple, {
        bold: true,
        color: [255, 255, 255],
        size: 10.5,
        align: "left",
        maxLines: 1,
      });
      signatureY += 8;
      drawCell(
        signatureLeft,
        signatureY,
        signatureTableW,
        7,
        "รับทราบผลการประเมินประจำเดือน โดยลงนามตามตำแหน่งด้านล่าง",
        [255, 255, 255],
        { size: 7.8, align: "left", color: muted, maxLines: 1 }
      );
      signatureY += 10;

      const drawSignatureDottedLine = (x1: number, lineY: number, x2: number) => {
        pdf.setDrawColor(108, 96, 128);
        pdf.setLineWidth(0.12);
        const dashedPdf = pdf as jsPDF & {
          setLineDashPattern?: (dashArray: number[], dashPhase: number) => jsPDF;
        };
        dashedPdf.setLineDashPattern?.([0.55, 0.65], 0);
        pdf.line(x1, lineY, x2, lineY);
        dashedPdf.setLineDashPattern?.([], 0);
      };

      const drawCompactSignedLine = (
        label: string,
        x: number,
        w: number,
        lineY: number,
        value = ""
      ) => {
        const labelX = x + 5.0;
        const lineStart = x + 15.5;
        const lineEnd = x + w - 5.0;
        const centerX = x + w / 2;
        setTemplateFont(5.8, false, muted);
        pdf.text(label, labelX, lineY - 0.25, { align: "left" });

        if (value) {
          setTemplateFont(5.7, true, black);
          const valueWidth = pdf.getTextWidth(value);
          const valueGapHalf = Math.min(
            Math.max(6.8, valueWidth / 2 + 1.4),
            Math.max(7, (lineEnd - lineStart) / 2 - 1.5)
          );
          drawSignatureDottedLine(lineStart, lineY, centerX - valueGapHalf);
          drawSignatureDottedLine(centerX + valueGapHalf, lineY, lineEnd);
          pdf.text(value, centerX, lineY - 0.35, { align: "center" });
        } else {
          drawSignatureDottedLine(lineStart, lineY, lineEnd);
        }
      };

      const drawLandscapeSignaturePanel = (
        x: number,
        panelY: number,
        w: number,
        role: SignRole,
        roleTitle: string
      ) => {
        const headerH = 7.2;
        const signatureAreaH = 31.0;
        const nameH = 7.2;
        const roleH = 6.4;
        const dateH = 8.8;

        drawCell(x, panelY, w, headerH, roleTitle, purple, {
          bold: true,
          color: [255, 255, 255],
          size: 6.5,
          align: "center",
          maxLines: 1,
        });

        const signatureAreaY = panelY + headerH;
        const signLineY = signatureAreaY + signatureAreaH - 6.0;
        const centerX = x + w / 2;
        drawCell(x, signatureAreaY, w, signatureAreaH, "", palePurple, { size: 6, align: "center" });
        drawCompactSignedLine("ลงชื่อ", x, w, signLineY);

        const signature = normalizedSignatures.get(role) || "";
        if (signature) {
          try {
            const imageProps = pdf.getImageProperties(signature);
            const ratio = imageProps.width && imageProps.height ? imageProps.width / imageProps.height : 4;
            const maxImageW = Math.min(w - 17, 42);
            const maxImageH = 18.0;
            let imageW = maxImageW;
            let imageH = imageW / ratio;
            if (imageH > maxImageH) {
              imageH = maxImageH;
              imageW = imageH * ratio;
            }
            pdf.addImage(signature, "PNG", centerX - imageW / 2, signLineY - imageH + 1.0, imageW, imageH);
          } catch {
            setTemplateFont(5.8, false, muted);
            pdf.text("Signature image unavailable", centerX, signLineY - 2, { align: "center" });
          }
        }

        const nameY = signatureAreaY + signatureAreaH;
        drawCell(x, nameY, w, nameH, signerName(role), [255, 255, 255], {
          bold: true,
          size: 6.3,
          align: "center",
          maxLines: 1,
        });
        const roleY = nameY + nameH;
        drawCell(x, roleY, w, roleH, roleTitle, [255, 255, 255], {
          size: 5.7,
          align: "center",
          maxLines: 1,
        });
        const dateY = roleY + roleH;
        drawCell(x, dateY, w, dateH, "", [255, 255, 255], { size: 5.7, align: "center" });
        drawCompactSignedLine("วันที่", x, w, dateY + dateH / 2 + 0.8, signerDate(role));
      };

      const signatureGap = 4;
      const signaturePanelW = (signatureTableW - signatureGap * 3) / 4;
      const signatureRoles: Array<{ role: SignRole; title: string }> = [
        { role: "Agent", title: "Agent ผู้ถูกประเมิน" },
        { role: "Senior", title: "Senior หัวหน้าทีมผู้ถูกประเมิน" },
        { role: "Supervisor", title: "Supervisor หัวหน้าแผนก" },
        { role: "QA", title: "QA ผู้ตรวจสอบ" },
      ];

      signatureRoles.forEach((item, index) => {
        const panelX = signatureLeft + index * (signaturePanelW + signatureGap);
        drawLandscapeSignaturePanel(panelX, signatureY, signaturePanelW, item.role, item.title);
      });

      setTemplateFont(7.0, false, muted);
      pdf.text(
        `Document Ref. ${pdfDocumentRef} | Generated: ${formatDateTime(new Date().toISOString())} | ${documentStatus} | Signed: ${signedRoles}/${SIGNATURE_FLOW.length}`,
        signatureRight,
        signaturePageH - 5.4,
        { align: "right" }
      );

`;

      const next = code.slice(0, start) + replacement + code.slice(end);
      if (!next.includes("signature-four-column-final-v101")) {
        throw new Error("Signature four-column v101: transform did not apply");
      }
      return { code: next, map: null };
    },
  };
}
