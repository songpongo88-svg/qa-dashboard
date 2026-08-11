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
  const bottom = 281;
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
    pdf.rect(0, 0, pageW, 7, "F");
    text("QA MONTHLY INCENTIVE PAYMENT AUTHORIZATION", left, 15.8, 15.2, true, purple);
    text(getMonthLabel(monthKey).toUpperCase(), right, 15.4, 10.4, true, purple, { align: "right" });
    text("Team Performance & Payment Authorization", left, 21.3, 8.2, false, muted);
    pdf.setDrawColor(purple[0], purple[1], purple[2]);
    pdf.setLineWidth(0.35);
    pdf.line(left, 24.5, right, 24.5);
    y = 27;
  };

  const section = (title: string) => {
    if (y + 10 > bottom) {
      pdf.addPage("a4", "portrait");
      drawHeader();
    }
    text(title, left, y + 4.8, 10.2, true, purple);
    pdf.setDrawColor(purple[0], purple[1], purple[2]);
    pdf.setLineWidth(0.32);
    pdf.line(left, y + 7.5, right, y + 7.5);
    y += 10;
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
    pdf.setLineWidth(0.14);
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

  const splitTopicTitle = (value: unknown) => {
    const raw = String(value || "-").trim();
    const match = raw.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    if (!match) return { primary: raw, secondary: "" };
    return { primary: match[1].trim(), secondary: match[2].trim() };
  };

  drawHeader();

  section("1. PAYMENT SUMMARY");
  const summaryItems: Array<{ label: string; value: unknown; color?: [number, number, number]; badge?: boolean }> = [
    { label: "Payment Period", value: getMonthLabel(monthKey), color: purple2 },
    { label: "Paid Agents", value: sortedDocs.length },
    { label: "Team Cases", value: totalCases },
    { label: "Average QA", value: avgScore.toFixed(2) },
    { label: "Overall Grade", value: overallGrade, color: purple2 },
    { label: "Total Payment (THB)", value: formatBahtAmount(totalCashAmount), color: green },
    { label: "Total Promo (THB)", value: formatBahtAmount(totalPromoAmount) },
    { label: "Document Status", value: sortedDocs.length ? "READY TO EXPORT" : "HOLD", badge: true },
  ];
  const summaryColW = tableW / 4;
  const summaryRowH = 12.4;
  summaryItems.forEach((item, index) => {
    const rowIndex = Math.floor(index / 4);
    const colIndex = index % 4;
    const x = left + summaryColW * colIndex;
    const yy = y + summaryRowH * rowIndex;
    text(item.label, x + 1.2, yy + 3.7, 6.0, false, muted);
    if (item.badge) {
      const label = String(item.value || "-");
      setFont(5.8, true, green);
      const badgeW = Math.min(summaryColW - 4, Math.max(27, pdf.getTextWidth(label) + 7));
      pdf.setFillColor(220, 252, 231);
      pdf.roundedRect(x + 1.2, yy + 5.5, badgeW, 5.8, 2.8, 2.8, "F");
      text(label, x + 1.2 + badgeW / 2, yy + 9.5, 5.6, true, green, { align: "center" });
    } else {
      text(item.value, x + 1.2, yy + 9.4, 8.9, true, item.color || black);
    }
  });
  pdf.setDrawColor(border[0], border[1], border[2]);
  pdf.setLineWidth(0.13);
  pdf.line(left, y + summaryRowH, right, y + summaryRowH);
  pdf.line(left, y + summaryRowH * 2, right, y + summaryRowH * 2);
  y += summaryRowH * 2 + 1.5;

  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");
  setFont(6.3, true, black);
  const measuredAgentW = sortedDocs.length
    ? Math.max(...sortedDocs.map((doc) => pdf.getTextWidth(String(doc.agentName || "")) + 5))
    : 31;
  const seqW = 7;
  const agentW = Math.min(34, Math.max(31, measuredAgentW));
  const refW = 25;
  const casesW = 11;
  const avgW = 12;
  const gradeW = 10;
  const incentiveW = 18;
  const statusW = 25;
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
      drawTableCell(x, y, width, 8, label, {
        fill: palePurple,
        color: purple2,
        size: label === "Document Ref." || label === "Agent Signature" ? 5.8 : 6.3,
        bold: true,
        align: "center",
        maxLines: 1,
      });
      x += width;
    });
    y += 8;
  };
  drawRankingHeader();

  sortedDocs.forEach((doc, index) => {
    const rowH = 16.5;
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
        size: colIndex === 1 ? 6.0 : colIndex === 2 ? 5.5 : 6.2,
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
      text("WAIVED - Resigned", x + agentSignatureW / 2, y + 7.2, 5.8, true, amber, { align: "center" });
      text(shortDate(agentWaived.waivedAt || agentWaived.resignationDate), x + agentSignatureW / 2, y + 12.9, 5.1, false, muted, { align: "center" });
    } else if (agentSigned) {
      const hasImage = addSignatureContained(agentSigned.signatureDataUrl || "", x + 3, y + 1.3, agentSignatureW - 6, 9.2);
      if (!hasImage) text("Signed", x + agentSignatureW / 2, y + 7.1, 5.9, true, green, { align: "center" });
      text("Signed: " + shortDate(agentSigned.signedAt), x + agentSignatureW / 2, y + 13.4, 5.1, false, muted, { align: "center" });
    } else {
      text("Pending", x + agentSignatureW / 2, y + 9.2, 5.8, true, amber, { align: "center" });
    }
    x += agentSignatureW;

    const rowStatus = agentWaived ? "Waived - Resigned" : agentSigned ? "Completed" : "Pending";
    drawTableCell(x, y, rankingHeaders[8][1], rowH, rowStatus, {
      fill,
      color: agentSigned ? green : agentWaived ? amber : muted,
      size: 5.5,
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

  const topicHeaders: Array<[string, number]> = [
    ["Topic", 9],
    ["Description", 103],
    ["Avg Score", 20],
    ["Max", 15],
    ["Avg %", 17],
    ["Dashboard Status", 20],
  ];
  let topicX = left;
  topicHeaders.forEach(([label, width]) => {
    drawTableCell(topicX, y, width, 8, label, {
      fill: palePurple,
      color: purple2,
      size: label === "Dashboard Status" ? 5.3 : 6.0,
      bold: true,
      align: "center",
      maxLines: 1,
    });
    topicX += width;
  });
  y += 8;

  displayTopicRows.forEach((topic, index) => {
    const avgTopicScore = topic.count ? topic.total / topic.count : null;
    const avgPct = avgTopicScore !== null && topic.max > 0 ? (avgTopicScore / topic.max) * 100 : null;
    const status = avgPct === null ? "-" : avgPct >= 85 ? "Good" : avgPct >= 75 ? "Watch" : "Improve";
    const statusBg: [number, number, number] = status === "Good" ? [220, 252, 231] : status === "Watch" ? [254, 243, 199] : status === "Improve" ? [255, 228, 230] : palePurple2;
    const statusFg: [number, number, number] = status === "Good" ? green : status === "Watch" ? amber : status === "Improve" ? red : muted;
    const rowH = 16;
    ensureSpace(rowH, "3. TEAM TOPIC PERFORMANCE (CONTINUED)");
    const fill: [number, number, number] = index % 2 === 0 ? [255, 255, 255] : palePurple2;
    let x = left;

    drawTableCell(x, y, topicHeaders[0][1], rowH, topic.code, {
      fill,
      size: 6.2,
      bold: true,
      align: "center",
      maxLines: 1,
    });
    x += topicHeaders[0][1];

    const descriptionW = topicHeaders[1][1];
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.rect(x, y, descriptionW, rowH, "FD");
    const topicLabel = splitTopicTitle(topic.title);
    const primaryLines = splitText(topicLabel.primary, descriptionW - 4, 6.2).slice(0, 1);
    primaryLines.forEach((lineText: string) => {
      text(lineText, x + 2, y + 6.0, 6.2, true, black);
    });
    if (topicLabel.secondary) {
      const secondaryLines = splitText(topicLabel.secondary, descriptionW - 4, 5.2).slice(0, 1);
      secondaryLines.forEach((lineText: string) => {
        text(lineText, x + 2, y + 11.2, 5.2, false, muted);
      });
    }
    x += descriptionW;

    const metricValues = [
      avgTopicScore === null ? "-" : avgTopicScore.toFixed(2),
      String(topic.max || "-"),
      avgPct === null ? "-" : avgPct.toFixed(1) + "%",
    ];
    metricValues.forEach((value, metricIndex) => {
      const width = topicHeaders[metricIndex + 2][1];
      drawTableCell(x, y, width, rowH, value, {
        fill,
        size: 6.1,
        bold: false,
        align: "center",
        maxLines: 1,
      });
      x += width;
    });

    const statusWCell = topicHeaders[5][1];
    drawTableCell(x, y, statusWCell, rowH, "", { fill, align: "center" });
    if (status !== "-") {
      pdf.setFillColor(statusBg[0], statusBg[1], statusBg[2]);
      pdf.roundedRect(x + 2.1, y + 4.5, statusWCell - 4.2, 7, 3.2, 3.2, "F");
      text(status, x + statusWCell / 2, y + 9.5, 5.8, true, statusFg, { align: "center" });
    } else {
      text("-", x + statusWCell / 2, y + 9.2, 5.8, false, muted, { align: "center" });
    }
    y += rowH;
  });

  section("4. PAYMENT CERTIFICATION");
  const certTopH = 12;
  const certColW = tableW / 3;
  const certItems: Array<{ label: string; value: unknown; color?: [number, number, number] }> = [
    { label: "Payment Period", value: getMonthLabel(monthKey) },
    { label: "Total Paid Agents", value: sortedDocs.length },
    { label: "Total Incentive", value: "THB " + formatBahtAmount(totalCashAmount), color: green },
  ];
  certItems.forEach((item, index) => {
    const x = left + certColW * index;
    text(item.label, x, y + 3.8, 6.1, false, muted);
    text(item.value, x, y + 9.2, 8.2, true, item.color || black);
  });
  pdf.setDrawColor(border[0], border[1], border[2]);
  pdf.setLineWidth(0.13);
  pdf.line(left, y + certTopH, right, y + certTopH);
  y += certTopH;
  text("Certification", left, y + 5.2, 6.2, false, muted);
  text("Monthly QA incentive payment summary prepared for payment processing.", left + 25, y + 5.2, 6.8, false, black);
  if (totalPromoAmount > 0) {
    text("Promo THB " + formatBahtAmount(totalPromoAmount), right, y + 5.2, 6.4, true, purple2, { align: "right" });
  }
  y += 9;

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
  const authHeaderH = 8;
  const authBodyH = 36;
  ensureSpace(authHeaderH + authBodyH);
  authorizationSlots.forEach(({ role, label, latest }, index) => {
    const x = left + signatureBlockW * index;
    drawTableCell(x, y, signatureBlockW, authHeaderH, label, {
      fill: palePurple,
      color: purple2,
      size: label === "Quality Assurance Approval" ? 5.4 : 5.9,
      bold: true,
      align: "center",
      maxLines: 1,
    });
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x, y + authHeaderH, signatureBlockW, authBodyH, "FD");

    if (latest) {
      const signerName = latest.entry.signerName || getRoleSigner(latest.doc, role) || latest.entry.signedBy || "-";
      const hasImage = addSignatureContained(latest.entry.signatureDataUrl || "", x + 5, y + authHeaderH + 3.5, signatureBlockW - 10, 10.5);
      if (!hasImage) text("Signed", x + signatureBlockW / 2, y + authHeaderH + 10.2, 6.2, true, green, { align: "center" });
      const nameLines = splitText(signerName, signatureBlockW - 6, 6.0).slice(0, 2);
      nameLines.forEach((lineText: string, lineIndex: number) => {
        text(lineText, x + signatureBlockW / 2, y + authHeaderH + 23 + lineIndex * 3.2, 6.0, true, black, { align: "center" });
      });
      text("Signed: " + shortDate(latest.entry.signedAt), x + signatureBlockW / 2, y + authHeaderH + 32.2, 5.2, false, muted, { align: "center" });
    } else {
      text("No signed record", x + signatureBlockW / 2, y + authHeaderH + 18.5, 5.8, false, muted, { align: "center" });
    }
  });
  y += authHeaderH + authBodyH;

  const totalPages = pdf.getNumberOfPages();
  for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
    pdf.setPage(pageIndex);
    text("Payment Authorization  |  Page " + pageIndex + " of " + totalPages, right, 21.3, 6.2, false, muted, { align: "right" });
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setLineWidth(0.12);
    pdf.line(left, pageH - 13, right, pageH - 13);
    text("QA Monthly Incentive Payment Authorization", left, pageH - 8, 6.0, false, muted);
    text("Page " + pageIndex + " of " + totalPages, right, pageH - 8, 6.0, false, muted, { align: "right" });
  }

  const fileName = makePaymentPdfFileName(monthKey);
  savePdfFile(pdf, fileName);
  return fileName;
}`;

export function signaturePaymentPdfPatch() {
  return {
    name: "signature-payment-pdf-preview-v4-layout",
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
