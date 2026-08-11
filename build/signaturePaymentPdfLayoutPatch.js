function replaceRange(code, startMarker, endMarker, replacement, label) {
  const start = code.indexOf(startMarker);
  if (start < 0) throw new Error(`Signature payment layout patch: missing ${label} start marker`);
  const end = code.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Signature payment layout patch: missing ${label} end marker`);
  return code.slice(0, start) + replacement + code.slice(end);
}

export function signaturePaymentPdfLayoutPatch() {
  return {
    name: "signature-payment-pdf-compact-layout",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      if (!code.includes('QA MONTHLY INCENTIVE PAYMENT AUTHORIZATION')) return null;

      let next = code;

      next = replaceRange(
        next,
        "  const addSignatureImage =",
        "  drawHeader();",
        `  const addSignatureImage = (dataUrl: string, x: number, yy: number, w: number, h: number) => {
    if (!dataUrl) return false;
    try {
      const format = /^data:image\\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG";
      const props = pdf.getImageProperties(dataUrl) as { width?: number; height?: number };
      const imageW = Math.max(1, Number(props?.width) || 1);
      const imageH = Math.max(1, Number(props?.height) || 1);
      const imageRatio = imageW / imageH;
      const boxRatio = w / h;
      let drawW = w;
      let drawH = h;
      if (imageRatio > boxRatio) {
        drawH = drawW / imageRatio;
      } else {
        drawW = drawH * imageRatio;
      }
      const drawX = x + (w - drawW) / 2;
      const drawY = yy + (h - drawH) / 2;
      pdf.addImage(dataUrl, format, drawX, drawY, drawW, drawH, undefined, "FAST");
      return true;
    } catch {
      return false;
    }
  };

  const latestRoleSignatures = (role: SignRole, limit = 1) => {
    const rows: Array<{ doc: SignatureDocument; entry: SignatureEntry; time: number; signerKey: string }> = [];
    sortedDocs.forEach((doc) => {
      const entries = effectiveEntriesForDoc(doc, signatures);
      const signed = getSignedEntry(entries, role);
      if (!signed) return;
      const time = new Date(signed.signedAt || "").getTime();
      const signerName = String(
        signed.signerName || getRoleSigner(doc, role) || signed.signedBy || ""
      ).trim();
      rows.push({
        doc,
        entry: signed,
        time: Number.isFinite(time) ? time : 0,
        signerKey: signerName.toLocaleLowerCase("en"),
      });
    });

    const seen = new Set<string>();
    return rows
      .sort((a, b) => b.time - a.time)
      .filter((row) => {
        const key = row.signerKey || `${row.doc.id}::${role}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, Math.max(1, limit));
  };

  const latestRoleSignature = (role: SignRole) => latestRoleSignatures(role, 1)[0] || null;

`,
        "signature helpers"
      );

      next = replaceRange(
        next,
        '  section("1. PAYMENT SUMMARY");',
        '  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");',
        `  section("1. PAYMENT SUMMARY");
  const compactSummaryRows: Array<Array<{
    label: string;
    value: unknown;
    valueColor?: [number, number, number];
    badge?: boolean;
  }>> = [
    [
      { label: "Payment Period", value: getMonthLabel(monthKey), valueColor: purple2 },
      { label: "Paid Agents", value: sortedDocs.length },
      { label: "Team Cases", value: totalCases },
    ],
    [
      { label: "Average QA", value: avgScore.toFixed(2) },
      { label: "Overall Grade", value: overallGrade, valueColor: purple2 },
      { label: "Total Payment (THB)", value: formatBahtAmount(totalCashAmount), valueColor: green },
    ],
    [
      { label: "Document Status", value: sortedDocs.length ? "READY TO EXPORT" : "HOLD", badge: true },
      { label: "Total Promo (THB)", value: formatBahtAmount(totalPromoAmount) },
    ],
  ];
  const compactSummaryRowH = 8.6;
  compactSummaryRows.forEach((row, rowIndex) => {
    const colW = tableW / 3;
    row.forEach((item, index) => {
      const x = left + colW * index;
      text(item.label, x + 1.5, y + 3.2, 6.2, false, muted);
      if (item.badge) {
        const badgeText = String(item.value || "-");
        const badgeW = Math.min(colW - 5, Math.max(24, pdf.getTextWidth(badgeText) + 7));
        pdf.setFillColor(220, 252, 231);
        pdf.roundedRect(x + 1.5, y + 4.2, badgeW, 4.9, 2.4, 2.4, "F");
        text(badgeText, x + 1.5 + badgeW / 2, y + 7.6, 5.6, true, green, { align: "center" });
      } else {
        text(item.value, x + 1.5, y + 7.4, 8.4, true, item.valueColor || black);
      }
    });
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setLineWidth(0.12);
    pdf.line(left, y + compactSummaryRowH, right, y + compactSummaryRowH);
    y += compactSummaryRowH;
    if (rowIndex === compactSummaryRows.length - 1) y += 1.2;
  });

`,
        "payment summary"
      );

      next = replaceRange(
        next,
        '  const rankingHeaders: Array<[string, number]> = [',
        '  const drawRankingHeader = () => {',
        `  setFont(6.2, true, black);
  const measuredAgentW = sortedDocs.length
    ? Math.max(...sortedDocs.map((doc) => pdf.getTextWidth(String(doc.agentName || "")) + 4))
    : 24;
  setFont(5.7, true, black);
  const measuredRefW = sortedDocs.length
    ? Math.max(...sortedDocs.map((doc) => pdf.getTextWidth(getMonthlyDocumentRef(doc, sourceDocs)) + 4))
    : 20;
  const agentW = Math.min(34, Math.max(24, measuredAgentW));
  const documentRefW = Math.min(25, Math.max(19, measuredRefW));
  const seqW = 7;
  const casesW = 10;
  const avgW = 11;
  const gradeW = 9;
  const incentiveW = 16;
  const statusWAuto = 19;
  const signatureWAuto = Math.max(
    30,
    tableW - (seqW + agentW + documentRefW + casesW + avgW + gradeW + incentiveW + statusWAuto)
  );
  const rankingHeaders: Array<[string, number]> = [
    ["Seq", seqW],
    ["Agent", agentW],
    ["Document Ref.", documentRefW],
    ["Cases", casesW],
    ["Avg", avgW],
    ["Grade", gradeW],
    ["Incentive", incentiveW],
    ["Agent Signature", signatureWAuto],
    ["Status", statusWAuto],
  ];
`,
        "ranking widths"
      );

      next = next.replace('    const rowH = 19;', '    const rowH = 15;');
      next = next.replace(
        '      const signatureDrawn = addSignatureImage(agentSigned.signatureDataUrl || "", x + 9, y + 2, signatureW - 18, 9);',
        '      const signatureDrawn = addSignatureImage(agentSigned.signatureDataUrl || "", x + 2.5, y + 1.2, signatureW - 5, 8.5);'
      );
      next = next.replace('      text("Signed: " + shortDate(agentSigned.signedAt), x + signatureW / 2, y + 15.2, 5.6, false, muted, { align: "center" });', '      text("Signed: " + shortDate(agentSigned.signedAt), x + signatureW / 2, y + 13.0, 5.4, false, muted, { align: "center" });');
      next = next.replace('      text("WAIVED - Resigned", x + signatureW / 2, y + 8.2, 6.3, true, amber, { align: "center" });', '      text("WAIVED - Resigned", x + signatureW / 2, y + 6.5, 6.0, true, amber, { align: "center" });');
      next = next.replace('      text(shortDate(agentWaived.waivedAt || agentWaived.resignationDate), x + signatureW / 2, y + 13.8, 5.7, false, muted, { align: "center" });', '      text(shortDate(agentWaived.waivedAt || agentWaived.resignationDate), x + signatureW / 2, y + 11.6, 5.4, false, muted, { align: "center" });');
      next = next.replace('      text("Pending", x + signatureW / 2, y + 10.8, 6.3, true, amber, { align: "center" });', '      text("Pending", x + signatureW / 2, y + 8.4, 6.1, true, amber, { align: "center" });');

      next = replaceRange(
        next,
        '  const topicHeaders: Array<[string, number]> = [',
        '  topicHeaders.forEach(([label, width]) => {',
        `  setFont(6.2, false, black);
  const measuredDescriptionW = displayTopicRows.length
    ? Math.max(...displayTopicRows.map((topic) => pdf.getTextWidth(String(topic.title || "")) + 6))
    : 68;
  const topicDescriptionW = Math.min(88, Math.max(66, measuredDescriptionW));
  const topicFixedW = 8 + 16 + 10 + 14 + 21;
  const topicTableW = Math.min(tableW, topicDescriptionW + topicFixedW);
  const topicStartX = left + (tableW - topicTableW) / 2;
  const topicHeaders: Array<[string, number]> = [
    ["Topic", 8],
    ["Description", topicDescriptionW],
    ["Avg Score", 16],
    ["Max", 10],
    ["Avg %", 14],
    ["Dashboard Status", 21],
  ];
  let topicX = topicStartX;
`,
        "topic widths"
      );
      next = next.replace(/(displayTopicRows\.forEach\(\(topic, index\) => \{[\s\S]*?const fill:[\s\S]*?)    let x = left;/, '$1    let x = topicStartX;');

      next = replaceRange(
        next,
        '  section("5. AUTHORIZATION & SIGNATURE");',
        '  const totalPages = pdf.getNumberOfPages();',
        `  section("5. AUTHORIZATION & SIGNATURE");
  const latestSeniorApprovals = latestRoleSignatures("Senior", 2);
  const authorizationSlots: Array<{
    role: SignRole;
    label: string;
    latest: { doc: SignatureDocument; entry: SignatureEntry; time: number; signerKey?: string } | null;
  }> = [
    { role: "Supervisor", label: "Supervisor Review", latest: latestRoleSignature("Supervisor") },
    { role: "Senior", label: "Senior Approval", latest: latestSeniorApprovals[0] || null },
    { role: "Senior", label: "Senior Approval", latest: latestSeniorApprovals[1] || null },
    { role: "QA", label: "Quality Assurance Approval", latest: latestRoleSignature("QA") },
  ];
  const signatureBlockW = tableW / authorizationSlots.length;
  const signatureBlockH = 42;
  ensureSpace(signatureBlockH);
  authorizationSlots.forEach(({ role, label, latest }, index) => {
    const x = left + signatureBlockW * index;
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x, y, signatureBlockW, signatureBlockH, "FD");
    pdf.setFillColor(palePurple[0], palePurple[1], palePurple[2]);
    pdf.rect(x, y, signatureBlockW, 7, "F");
    text(label, x + signatureBlockW / 2, y + 4.9, label === "Quality Assurance Approval" ? 5.1 : 5.7, true, purple2, { align: "center" });

    if (latest) {
      const signerName = latest.entry.signerName || getRoleSigner(latest.doc, role) || latest.entry.signedBy || "-";
      const hasImage = addSignatureImage(latest.entry.signatureDataUrl || "", x + 3.5, y + 9, signatureBlockW - 7, 14);
      if (!hasImage) {
        text("Signed", x + signatureBlockW / 2, y + 17.5, 6.5, true, green, { align: "center" });
      }
      const signerLines = splitText(signerName, signatureBlockW - 5, 5.8).slice(0, 2);
      signerLines.forEach((lineText: string, lineIndex: number) => {
        text(lineText, x + signatureBlockW / 2, y + 29 + lineIndex * 3.1, 5.8, true, black, { align: "center" });
      });
      text("Signed: " + shortDate(latest.entry.signedAt), x + signatureBlockW / 2, y + 38.5, 5.2, false, muted, { align: "center" });
    } else {
      text("No signed record", x + signatureBlockW / 2, y + 22, 5.8, false, muted, { align: "center" });
    }
  });
  y += signatureBlockH;

`,
        "authorization"
      );

      return { code: next, map: null };
    },
  };
}
