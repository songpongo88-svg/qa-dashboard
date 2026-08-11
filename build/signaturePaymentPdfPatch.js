const replacement = String.raw`function generatePaymentPdfFile(
  monthKey: string,
  readyDocs: SignatureDocument[],
  signatures: Record<string, SignatureEntry[]>,
  allMonthDocs: SignatureDocument[] = readyDocs
) {
  const sortedDocs = [...readyDocs].sort((a, b) => a.agentName.localeCompare(b.agentName, "th"));
  const sourceDocs = allMonthDocs.length ? allMonthDocs : sortedDocs;
  const dashboardSummary = getDashboardMonthSummaryForExport(monthKey, sourceDocs, sortedDocs);
  const totalCases = dashboardSummary.totalCases;
  const avgScore = dashboardSummary.avgScore;
  const totalCashAmount = sortedDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).cash, 0);
  const totalPromoAmount = sortedDocs.reduce((sum, doc) => sum + getDocumentIncentive(doc).promo, 0);
  const overallGrade = getOverallPdfGradeLabel(avgScore);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  try {
    registerTHSarabunNew(pdf);
    pdf.setFont("THSarabunNew", "normal");
  } catch {}

  const pageW = 210;
  const pageH = 297;
  const left = 13;
  const right = 197;
  const tableW = right - left;
  const bottom = 286;
  const purple: [number, number, number] = [95, 39, 159];
  const purple2: [number, number, number] = [112, 48, 160];
  const palePurple: [number, number, number] = [247, 242, 251];
  const palePurple2: [number, number, number] = [252, 249, 253];
  const border: [number, number, number] = [220, 210, 230];
  const black: [number, number, number] = [18, 24, 38];
  const muted: [number, number, number] = [100, 116, 139];
  const green: [number, number, number] = [5, 122, 85];
  const amber: [number, number, number] = [180, 83, 9];
  const red: [number, number, number] = [190, 24, 93];
  let y = 0;

  const setFont = (size: number, bold = false, color: [number, number, number] = black) => {
    try {
      pdf.setFont("THSarabunNew", bold ? "bold" : "normal");
    } catch {}
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };

  const text = (
    value: unknown,
    x: number,
    yy: number,
    size = 8,
    bold = false,
    color: [number, number, number] = black,
    options?: { align?: "left" | "center" | "right" }
  ) => {
    setFont(size, bold, color);
    pdf.text(String(value ?? ""), x, yy, options);
  };

  const splitText = (value: unknown, width: number, size = 7.2) => {
    setFont(size, false, black);
    return pdf.splitTextToSize(String(value ?? "-"), Math.max(4, width));
  };

  const shortDate = (value: unknown) => {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const drawHeader = () => {
    pdf.setFillColor(purple[0], purple[1], purple[2]);
    pdf.rect(0, 0, pageW, 22, "F");
    text("QA MONTHLY INCENTIVE PAYMENT AUTHORIZATION", left, 9, 14.5, true, [255, 255, 255]);
    text("Team Performance & Authorization", left, 16, 8.3, false, [242, 230, 255]);
    text(getMonthLabel(monthKey).toUpperCase(), right, 9, 9.5, true, [255, 255, 255], { align: "right" });
    y = 24;
  };

  const section = (title: string) => {
    if (y + 8 > bottom) {
      pdf.addPage("a4", "portrait");
      drawHeader();
    }
    pdf.setFillColor(purple2[0], purple2[1], purple2[2]);
    pdf.rect(left, y, tableW, 7, "F");
    text(title, left + 3, y + 4.9, 8.8, true, [255, 255, 255]);
    y += 7;
  };

  const ensureSpace = (height: number, continuedTitle?: string) => {
    if (y + height <= bottom) return;
    pdf.addPage("a4", "portrait");
    drawHeader();
    if (continuedTitle) section(continuedTitle);
  };

  const drawTableCell = (
    x: number,
    yy: number,
    w: number,
    h: number,
    value: unknown,
    options: {
      fill?: [number, number, number];
      color?: [number, number, number];
      size?: number;
      bold?: boolean;
      align?: "left" | "center" | "right";
      maxLines?: number;
    } = {}
  ) => {
    const fill = options.fill ?? [255, 255, 255];
    const align = options.align ?? "left";
    const size = options.size ?? 6.7;
    const maxLines = options.maxLines ?? 2;
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.rect(x, yy, w, h, "FD");
    const lines = splitText(value, w - 3, size).slice(0, maxLines);
    const gap = size * 0.36 + 1.1;
    const baseY = yy + h / 2 - ((lines.length - 1) * gap) / 2 + size * 0.22;
    const tx = align === "center" ? x + w / 2 : align === "right" ? x + w - 1.5 : x + 1.5;
    lines.forEach((lineText: string, index: number) => {
      text(lineText, tx, baseY + index * gap, size, options.bold ?? false, options.color ?? black, { align });
    });
  };

  const addSignatureContained = (dataUrl: string, x: number, yy: number, w: number, h: number) => {
    if (!dataUrl) return false;
    try {
      const format = /^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG";
      const props = pdf.getImageProperties(dataUrl);
      const imageW = Math.max(1, Number(props?.width) || 1);
      const imageH = Math.max(1, Number(props?.height) || 1);
      const imageRatio = imageW / imageH;
      const boxRatio = w / h;
      let drawW = w;
      let drawH = h;
      if (imageRatio > boxRatio) drawH = drawW / imageRatio;
      else drawW = drawH * imageRatio;
      pdf.addImage(
        dataUrl,
        format,
        x + (w - drawW) / 2,
        yy + (h - drawH) / 2,
        drawW,
        drawH,
        undefined,
        "FAST"
      );
      return true;
    } catch {
      return false;
    }
  };

  const collectLatestRoleSignatures = (role: SignRole, limit = 1) => {
    const rows: Array<{ doc: SignatureDocument; entry: SignatureEntry; time: number; signerKey: string }> = [];
    sortedDocs.forEach((doc) => {
      const entries = effectiveEntriesForDoc(doc, signatures);
      const signed = getSignedEntry(entries, role);
      if (!signed) return;
      const signerName = String(signed.signerName || getRoleSigner(doc, role) || signed.signedBy || "").trim();
      const time = new Date(signed.signedAt || "").getTime();
      rows.push({
        doc,
        entry: signed,
        time: Number.isFinite(time) ? time : 0,
        signerKey: signerName.toLowerCase(),
      });
    });
    const seen = new Set<string>();
    return rows
      .sort((a, b) => b.time - a.time)
      .filter((row) => {
        const key = row.signerKey || row.doc.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, Math.max(1, limit));
  };

  const latestRoleSignature = (role: SignRole) => collectLatestRoleSignatures(role, 1)[0] || null;

  drawHeader();

  section("1. PAYMENT SUMMARY");
  const summaryRows: Array<Array<{ label: string; value: unknown; color?: [number, number, number]; badge?: boolean }>> = [
    [
      { label: "Payment Period", value: getMonthLabel(monthKey), color: purple2 },
      { label: "Paid Agents", value: sortedDocs.length },
      { label: "Team Cases", value: totalCases },
    ],
    [
      { label: "Average QA", value: avgScore.toFixed(2) },
      { label: "Overall Grade", value: overallGrade, color: purple2 },
      { label: "Total Payment (THB)", value: formatBahtAmount(totalCashAmount), color: green },
    ],
    [
      { label: "Document Status", value: sortedDocs.length ? "READY TO EXPORT" : "HOLD", badge: true },
      { label: "Total Promo (THB)", value: formatBahtAmount(totalPromoAmount) },
    ],
  ];
  const summaryColW = tableW / 3;
  summaryRows.forEach((row) => {
    const rowH = 8.2;
    row.forEach((item, index) => {
      const x = left + summaryColW * index;
      text(item.label, x + 1.5, y + 3.1, 5.9, false, muted);
      if (item.badge) {
        const label = String(item.value || "-");
        setFont(5.6, true, green);
        const badgeW = Math.min(summaryColW - 5, Math.max(23, pdf.getTextWidth(label) + 6));
        pdf.setFillColor(220, 252, 231);
        pdf.roundedRect(x + 1.5, y + 4, badgeW, 4.5, 2.2, 2.2, "F");
        text(label, x + 1.5 + badgeW / 2, y + 7.1, 5.4, true, green, { align: "center" });
      } else {
        text(item.value, x + 1.5, y + 7.1, 7.8, true, item.color || black);
      }
    });
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setLineWidth(0.1);
    pdf.line(left, y + rowH, right, y + rowH);
    y += rowH;
  });
  y += 1.5;

  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");
  setFont(6.1, true, black);
  const measuredAgentW = sortedDocs.length
    ? Math.max(...sortedDocs.map((doc) => pdf.getTextWidth(String(doc.agentName || "")) + 4))
    : 24;
  setFont(5.5, true, black);
  const measuredRefW = sortedDocs.length
    ? Math.max(...sortedDocs.map((doc) => pdf.getTextWidth(getMonthlyDocumentRef(doc, sourceDocs)) + 4))
    : 19;
  const seqW = 7;
  const agentW = Math.min(34, Math.max(24, measuredAgentW));
  const refW = Math.min(24, Math.max(18, measuredRefW));
  const casesW = 10;
  const avgW = 11;
  const gradeW = 9;
  const incentiveW = 16;
  const statusW = 18;
  const signatureW = tableW - (seqW + agentW + refW + casesW + avgW + gradeW + incentiveW + statusW);
  const rankingHeaders: Array<[string, number]> = [
    ["Seq", seqW],
    ["Agent", agentW],
    ["Document Ref.", refW],
    ["Cases", casesW],
    ["Avg", avgW],
    ["Grade", gradeW],
    ["Incentive", incentiveW],
    ["Agent Signature", signatureW],
    ["Status", statusW],
  ];

  const drawRankingHeader = () => {
    let x = left;
    rankingHeaders.forEach(([label, width]) => {
      drawTableCell(x, y, width, 7, label, {
        fill: palePurple,
        color: purple2,
        size: label === "Agent Signature" || label === "Document Ref." ? 5.5 : 6.0,
        bold: true,
        align: "center",
        maxLines: 1,
      });
      x += width;
    });
    y += 7;
  };
  drawRankingHeader();

  sortedDocs.forEach((doc, index) => {
    const rowH = 15;
    ensureSpace(rowH, "2. AGENT MONTHLY RANKING & PAYMENT DETAILS (CONTINUED)");
    const entries = effectiveEntriesForDoc(doc, signatures);
    const agentSigned = getSignedEntry(entries, "Agent");
    const agentWaived = getWaivedEntry(entries, "Agent");
    const incentive = getDocumentIncentive(doc);
    const fill: [number, number, number] = index % 2 === 0 ? [255, 255, 255] : palePurple2;
    const values = [
      String(index + 1),
      doc.agentName,
      getMonthlyDocumentRef(doc, sourceDocs),
      String(doc.caseCount),
      doc.averageScore.toFixed(2),
      doc.grade,
      formatBahtAmount(incentive.cash),
    ];
    let x = left;
    values.forEach((value, colIndex) => {
      const width = rankingHeaders[colIndex][1];
      drawTableCell(x, y, width, rowH, value, {
        fill,
        size: colIndex === 1 ? 5.8 : colIndex === 2 ? 5.2 : 6.0,
        bold: colIndex === 1 || colIndex === 2 || colIndex === 6,
        align: colIndex === 1 ? "left" : "center",
        maxLines: colIndex === 1 ? 2 : 1,
      });
      x += width;
    });

    const agentSignatureW = rankingHeaders[7][1];
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.rect(x, y, agentSignatureW, rowH, "FD");
    if (agentWaived) {
      text("WAIVED - Resigned", x + agentSignatureW / 2, y + 6.2, 5.5, true, amber, { align: "center" });
      text(shortDate(agentWaived.waivedAt || agentWaived.resignationDate), x + agentSignatureW / 2, y + 11.5, 5.0, false, muted, { align: "center" });
    } else if (agentSigned) {
      const hasImage = addSignatureContained(agentSigned.signatureDataUrl || "", x + 2.5, y + 1, agentSignatureW - 5, 8.5);
      if (!hasImage) text("Signed", x + agentSignatureW / 2, y + 6.3, 5.8, true, green, { align: "center" });
      text("Signed: " + shortDate(agentSigned.signedAt), x + agentSignatureW / 2, y + 12.7, 5.0, false, muted, { align: "center" });
    } else {
      text("Pending", x + agentSignatureW / 2, y + 8.3, 5.6, true, amber, { align: "center" });
    }
    x += agentSignatureW;

    const rowStatus = agentWaived ? "Waived - Resigned" : agentSigned ? "Completed" : "Pending";
    drawTableCell(x, y, rankingHeaders[8][1], rowH, rowStatus, {
      fill,
      color: agentSigned ? green : agentWaived ? amber : muted,
      size: 5.2,
      bold: true,
      align: "center",
      maxLines: 2,
    });
    y += rowH;
  });

  pdf.addPage("a4", "portrait");
  drawHeader();

  section("3. TEAM TOPIC PERFORMANCE");
  const topicMap = new Map<string, { code: string; title: string; max: number; total: number; count: number }>();
  sourceDocs.forEach((doc) => {
    doc.cases.forEach((item) => {
      item.topics?.forEach((topic) => {
        if (!topic.code || topic.code === SIGNATURE_TOPIC_MISSING) return;
        const current = topicMap.get(topic.code) || {
          code: topic.code,
          title: topic.title || topic.code,
          max: Number(topic.max) || 0,
          total: 0,
          count: 0,
        };
        current.title = current.title || topic.title || topic.code;
        current.max = Math.max(current.max, Number(topic.max) || 0);
        current.total += Number(topic.score) || 0;
        current.count += 1;
        topicMap.set(topic.code, current);
      });
    });
  });
  const topicRows = Array.from(topicMap.values()).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const displayTopicRows = topicRows.length
    ? topicRows
    : SIGNATURE_JUNE_2026_TOPIC_MASTER.map((topic) => ({ code: topic.code, title: topic.label, max: topic.max, total: 0, count: 0 }));

  setFont(5.8, false, black);
  const measuredDescriptionW = displayTopicRows.length
    ? Math.max(...displayTopicRows.map((topic) => pdf.getTextWidth(String(topic.title || "")) + 6))
    : 66;
  const descriptionW = Math.min(86, Math.max(64, measuredDescriptionW));
  const topicWidths = {
    topic: 8,
    avg: 15,
    max: 10,
    pct: 14,
    status: 20,
  };
  const topicTableW = topicWidths.topic + descriptionW + topicWidths.avg + topicWidths.max + topicWidths.pct + topicWidths.status;
  const topicStartX = left + (tableW - topicTableW) / 2;
  const topicHeaders: Array<[string, number]> = [
    ["Topic", topicWidths.topic],
    ["Description", descriptionW],
    ["Avg Score", topicWidths.avg],
    ["Max", topicWidths.max],
    ["Avg %", topicWidths.pct],
    ["Dashboard Status", topicWidths.status],
  ];
  let topicX = topicStartX;
  topicHeaders.forEach(([label, width]) => {
    drawTableCell(topicX, y, width, 7, label, {
      fill: palePurple,
      color: purple2,
      size: label === "Dashboard Status" ? 5.2 : 5.8,
      bold: true,
      align: "center",
      maxLines: 1,
    });
    topicX += width;
  });
  y += 7;

  displayTopicRows.forEach((topic, index) => {
    const avgTopicScore = topic.count ? topic.total / topic.count : null;
    const avgPct = avgTopicScore !== null && topic.max > 0 ? (avgTopicScore / topic.max) * 100 : null;
    const status = avgPct === null ? "-" : avgPct >= 85 ? "Good" : avgPct >= 75 ? "Watch" : "Improve";
    const statusBg: [number, number, number] = status === "Good" ? [220, 252, 231] : status === "Watch" ? [254, 243, 199] : status === "Improve" ? [255, 228, 230] : palePurple2;
    const statusFg: [number, number, number] = status === "Good" ? green : status === "Watch" ? amber : status === "Improve" ? red : muted;
    const rowH = 13;
    ensureSpace(rowH, "3. TEAM TOPIC PERFORMANCE (CONTINUED)");
    const fill: [number, number, number] = index % 2 === 0 ? [255, 255, 255] : palePurple2;
    let x = topicStartX;
    const rowValues = [
      topic.code,
      topic.title,
      avgTopicScore === null ? "-" : avgTopicScore.toFixed(2),
      String(topic.max || "-"),
      avgPct === null ? "-" : avgPct.toFixed(1) + "%",
    ];
    rowValues.forEach((value, colIndex) => {
      const width = topicHeaders[colIndex][1];
      drawTableCell(x, y, width, rowH, value, {
        fill,
        size: colIndex === 1 ? 5.6 : 5.9,
        bold: colIndex === 0,
        align: colIndex === 1 ? "left" : "center",
        maxLines: colIndex === 1 ? 2 : 1,
      });
      x += width;
    });
    const statusW = topicHeaders[5][1];
    drawTableCell(x, y, statusW, rowH, "", { fill, align: "center" });
    if (status !== "-") {
      pdf.setFillColor(statusBg[0], statusBg[1], statusBg[2]);
      pdf.roundedRect(x + 2.5, y + 3.2, statusW - 5, 6.5, 3, 3, "F");
      text(status, x + statusW / 2, y + 7.8, 5.5, true, statusFg, { align: "center" });
    } else {
      text("-", x + statusW / 2, y + 7.6, 5.7, false, muted, { align: "center" });
    }
    y += rowH;
  });

  section("4. PAYMENT CERTIFICATION");
  const certH = 17;
  pdf.setDrawColor(border[0], border[1], border[2]);
  pdf.setFillColor(255, 255, 255);
  pdf.rect(left, y, tableW, certH, "FD");
  const certCol = tableW / 3;
  text("Payment Period", left + 2, y + 5.2, 5.9, false, muted);
  text(getMonthLabel(monthKey), left + 26, y + 5.2, 7.2, true, black);
  text("Total Paid Agents", left + certCol + 2, y + 5.2, 5.9, false, muted);
  text(sortedDocs.length, left + certCol + 34, y + 5.2, 7.2, true, black);
  text("Total Incentive", left + certCol * 2 + 2, y + 5.2, 5.9, false, muted);
  text("THB " + formatBahtAmount(totalCashAmount), right - 2, y + 5.2, 7.6, true, green, { align: "right" });
  text("Certification", left + 2, y + 12.5, 5.9, false, muted);
  text("Monthly QA incentive payment summary prepared for payment processing.", left + 26, y + 12.5, 6.2, false, black);
  if (totalPromoAmount > 0) {
    text("Promo THB " + formatBahtAmount(totalPromoAmount), right - 2, y + 12.5, 6.2, true, purple2, { align: "right" });
  }
  y += certH;

  section("5. AUTHORIZATION & SIGNATURE");
  const seniorApprovals = collectLatestRoleSignatures("Senior", 2);
  const authorizationSlots: Array<{
    role: SignRole;
    label: string;
    latest: { doc: SignatureDocument; entry: SignatureEntry; time: number; signerKey: string } | null;
  }> = [
    { role: "Supervisor", label: "Supervisor Review", latest: latestRoleSignature("Supervisor") },
    { role: "Senior", label: "Senior Approval", latest: seniorApprovals[0] || null },
    { role: "Senior", label: "Senior Approval", latest: seniorApprovals[1] || null },
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
    text(label, x + signatureBlockW / 2, y + 4.8, label === "Quality Assurance Approval" ? 5.0 : 5.6, true, purple2, { align: "center" });

    if (latest) {
      const signerName = latest.entry.signerName || getRoleSigner(latest.doc, role) || latest.entry.signedBy || "-";
      const hasImage = addSignatureContained(latest.entry.signatureDataUrl || "", x + 3, y + 8.5, signatureBlockW - 6, 14);
      if (!hasImage) text("Signed", x + signatureBlockW / 2, y + 17, 6.0, true, green, { align: "center" });
      const nameLines = splitText(signerName, signatureBlockW - 4, 5.6).slice(0, 2);
      nameLines.forEach((lineText: string, lineIndex: number) => {
        text(lineText, x + signatureBlockW / 2, y + 28.5 + lineIndex * 3, 5.6, true, black, { align: "center" });
      });
      text("Signed: " + shortDate(latest.entry.signedAt), x + signatureBlockW / 2, y + 38, 5.0, false, muted, { align: "center" });
    } else {
      text("No signed record", x + signatureBlockW / 2, y + 22, 5.6, false, muted, { align: "center" });
    }
  });
  y += signatureBlockH;

  const totalPages = pdf.getNumberOfPages();
  for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
    pdf.setPage(pageIndex);
    text("Page " + pageIndex + " of " + totalPages, right, pageH - 6, 6.2, false, muted, { align: "right" });
  }

  const fileName = makePaymentPdfFileName(monthKey);
  savePdfFile(pdf, fileName);
  return fileName;
}`;

export function signaturePaymentPdfPatch() {
  return {
    name: "signature-payment-pdf-official-layout",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/SignatureCenterMockup.tsx")) return null;
      const start = code.indexOf("function generatePaymentPdfFile(");
      const end = code.indexOf("\nfunction SignaturePill", start);
      if (start < 0 || end < 0) {
        throw new Error("Monthly Payment PDF patch target not found in SignatureCenterMockup.tsx");
      }
      return {
        code: code.slice(0, start) + replacement + code.slice(end),
        map: null,
      };
    },
  };
}
