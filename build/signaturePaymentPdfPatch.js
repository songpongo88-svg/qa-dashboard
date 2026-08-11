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
    pdf.rect(left, y, tableW, 8, "F");
    text(title, left + 3, y + 5.5, 9.3, true, [255, 255, 255]);
    y += 8;
  };

  const ensureSpace = (height: number, continuedTitle?: string) => {
    if (y + height <= bottom) return;
    pdf.addPage("a4", "portrait");
    drawHeader();
    if (continuedTitle) section(continuedTitle);
  };

  const drawSummaryCell = (
    x: number,
    yy: number,
    w: number,
    h: number,
    label: string,
    value: unknown,
    options: { color?: [number, number, number]; valueSize?: number; badge?: boolean } = {}
  ) => {
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setFillColor(palePurple2[0], palePurple2[1], palePurple2[2]);
    pdf.rect(x, yy, w, h, "FD");
    text(label, x + 2.5, yy + 5, 6.8, false, muted);
    if (options.badge) {
      const labelText = String(value || "-");
      const badgeW = Math.min(w - 7, Math.max(24, labelText.length * 1.45));
      pdf.setFillColor(220, 252, 231);
      pdf.roundedRect(x + 2.5, yy + 7.5, badgeW, 7.5, 3.5, 3.5, "F");
      text(labelText, x + 2.5 + badgeW / 2, yy + 12.7, 6.6, true, green, { align: "center" });
    } else {
      text(value, x + 2.5, yy + h - 4.2, options.valueSize ?? 11.2, true, options.color ?? black);
    }
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
    setFont(size, options.bold ?? false, options.color ?? black);
    const lines = splitText(value, w - 3, size).slice(0, maxLines);
    const gap = size * 0.36 + 1.15;
    const baseY = yy + h / 2 - ((lines.length - 1) * gap) / 2 + size * 0.22;
    const tx = align === "center" ? x + w / 2 : align === "right" ? x + w - 1.5 : x + 1.5;
    lines.forEach((lineText: string, index: number) => {
      text(lineText, tx, baseY + index * gap, size, options.bold ?? false, options.color ?? black, { align });
    });
  };

  const addSignatureImage = (dataUrl: string, x: number, yy: number, w: number, h: number) => {
    if (!dataUrl) return false;
    try {
      const format = /^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG";
      pdf.addImage(dataUrl, format, x, yy, w, h, undefined, "FAST");
      return true;
    } catch {
      return false;
    }
  };

  const latestRoleSignature = (role: SignRole) => {
    let latest:
      | { doc: SignatureDocument; entry: SignatureEntry; time: number }
      | null = null;
    sortedDocs.forEach((doc) => {
      const entries = effectiveEntriesForDoc(doc, signatures);
      const signed = getSignedEntry(entries, role);
      if (!signed) return;
      const time = new Date(signed.signedAt || "").getTime();
      const safeTime = Number.isFinite(time) ? time : 0;
      if (!latest || safeTime >= latest.time) latest = { doc, entry: signed, time: safeTime };
    });
    return latest;
  };

  drawHeader();

  section("1. PAYMENT SUMMARY");
  const summaryW = tableW / 3;
  drawSummaryCell(left, y, summaryW, 17, "Payment Period", getMonthLabel(monthKey), { color: purple2 });
  drawSummaryCell(left + summaryW, y, summaryW, 17, "Paid Agents", sortedDocs.length);
  drawSummaryCell(left + summaryW * 2, y, summaryW, 17, "Team Cases", totalCases);
  y += 17;
  drawSummaryCell(left, y, summaryW, 17, "Average QA", avgScore.toFixed(2));
  drawSummaryCell(left + summaryW, y, summaryW, 17, "Overall Grade", overallGrade, { color: purple2 });
  drawSummaryCell(left + summaryW * 2, y, summaryW, 17, "Total Payment (THB)", formatBahtAmount(totalCashAmount), { color: green });
  y += 17;
  drawSummaryCell(left, y, tableW / 2, 14, "Document Status", sortedDocs.length ? "READY TO EXPORT" : "HOLD", { badge: true });
  drawSummaryCell(left + tableW / 2, y, tableW / 2, 14, "Total Promo (THB)", formatBahtAmount(totalPromoAmount), { valueSize: 9.5 });
  y += 14;

  section("2. AGENT MONTHLY RANKING & PAYMENT DETAILS");
  const rankingHeaders: Array<[string, number]> = [
    ["Seq", 8],
    ["Agent", 27],
    ["Document Ref.", 25],
    ["Cases", 11],
    ["Avg", 13],
    ["Grade", 10],
    ["Incentive", 20],
    ["Agent Signature", 48],
    ["Status", 22],
  ];
  const drawRankingHeader = () => {
    let x = left;
    rankingHeaders.forEach(([label, width]) => {
      drawTableCell(x, y, width, 8, label, {
        fill: palePurple,
        color: purple2,
        size: label === "Agent Signature" || label === "Document Ref." ? 6.1 : 6.6,
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
    const rowH = 19;
    ensureSpace(rowH, "2. AGENT MONTHLY RANKING & PAYMENT DETAILS (CONTINUED)");
    if (y === 32) drawRankingHeader();
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
        size: colIndex === 2 ? 5.6 : colIndex === 1 ? 6.3 : 6.6,
        bold: colIndex === 1 || colIndex === 2 || colIndex === 6,
        align: colIndex === 1 ? "left" : "center",
        maxLines: colIndex === 1 ? 2 : 1,
      });
      x += width;
    });

    const signatureW = rankingHeaders[7][1];
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.rect(x, y, signatureW, rowH, "FD");
    if (agentWaived) {
      text("WAIVED - Resigned", x + signatureW / 2, y + 8.2, 6.3, true, amber, { align: "center" });
      text(shortDate(agentWaived.waivedAt || agentWaived.resignationDate), x + signatureW / 2, y + 13.8, 5.7, false, muted, { align: "center" });
    } else if (agentSigned) {
      const signatureDrawn = addSignatureImage(agentSigned.signatureDataUrl || "", x + 9, y + 2, signatureW - 18, 9);
      if (!signatureDrawn) {
        text("Signed", x + signatureW / 2, y + 7, 6.2, true, green, { align: "center" });
      }
      text("Signed: " + shortDate(agentSigned.signedAt), x + signatureW / 2, y + 15.2, 5.6, false, muted, { align: "center" });
    } else {
      text("Pending", x + signatureW / 2, y + 10.8, 6.3, true, amber, { align: "center" });
    }
    x += signatureW;

    const statusW = rankingHeaders[8][1];
    const status = agentWaived ? "Waived - Resigned" : agentSigned ? "Completed" : "Pending";
    drawTableCell(x, y, statusW, rowH, status, {
      fill,
      color: agentSigned ? green : agentWaived ? amber : muted,
      size: 5.8,
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
    ["Topic", 10],
    ["Description", 96],
    ["Avg Score", 19],
    ["Max", 15],
    ["Avg %", 18],
    ["Dashboard Status", 26],
  ];
  let topicX = left;
  topicHeaders.forEach(([label, width]) => {
    drawTableCell(topicX, y, width, 8, label, {
      fill: palePurple,
      color: purple2,
      size: label === "Dashboard Status" ? 5.8 : 6.3,
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
        size: colIndex === 1 ? 5.9 : 6.4,
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
      pdf.roundedRect(x + 3, y + 4.2, statusW - 6, 7.5, 3.5, 3.5, "F");
      text(status, x + statusW / 2, y + 9.5, 6.0, true, statusFg, { align: "center" });
    } else {
      text("-", x + statusW / 2, y + 9.2, 6.2, false, muted, { align: "center" });
    }
    y += rowH;
  });

  section("4. PAYMENT CERTIFICATION");
  const certH = 24;
  pdf.setDrawColor(border[0], border[1], border[2]);
  pdf.setFillColor(255, 255, 255);
  pdf.rect(left, y, tableW, certH, "FD");
  const certCol = tableW / 3;
  text("Payment Period", left + 2.5, y + 5.5, 6.6, false, muted);
  text(getMonthLabel(monthKey), left + 29, y + 5.5, 8.0, true, black);
  text("Total Paid Agents", left + certCol + 2.5, y + 5.5, 6.6, false, muted);
  text(sortedDocs.length, left + certCol + 37, y + 5.5, 8.0, true, black);
  text("Total Incentive", left + certCol * 2 + 2.5, y + 5.5, 6.6, false, muted);
  text("THB " + formatBahtAmount(totalCashAmount), right - 2.5, y + 5.5, 8.5, true, green, { align: "right" });
  text("Certification", left + 2.5, y + 15, 6.6, false, muted);
  text("Monthly QA incentive payment summary prepared for payment processing.", left + 29, y + 15, 7.0, false, black);
  if (totalPromoAmount > 0) {
    text("Promo THB " + formatBahtAmount(totalPromoAmount), right - 2.5, y + 15, 6.8, true, purple2, { align: "right" });
  }
  y += certH;

  section("5. AUTHORIZATION & SIGNATURE");
  const authorizationRoles: Array<[SignRole, string]> = [
    ["Supervisor", "Supervisor Review"],
    ["Senior", "Senior Approval"],
    ["QA", "Quality Assurance Approval"],
  ];
  const signatureBlockW = tableW / authorizationRoles.length;
  const signatureBlockH = 48;
  ensureSpace(signatureBlockH);
  authorizationRoles.forEach(([role, label], index) => {
    const x = left + signatureBlockW * index;
    const latest = latestRoleSignature(role);
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x, y, signatureBlockW, signatureBlockH, "FD");
    pdf.setFillColor(palePurple[0], palePurple[1], palePurple[2]);
    pdf.rect(x, y, signatureBlockW, 8, "F");
    text(label, x + signatureBlockW / 2, y + 5.5, 6.4, true, purple2, { align: "center" });

    if (latest) {
      const signerName = latest.entry.signerName || getRoleSigner(latest.doc, role) || latest.entry.signedBy || "-";
      const hasImage = addSignatureImage(latest.entry.signatureDataUrl || "", x + 12, y + 11, signatureBlockW - 24, 14);
      if (!hasImage) {
        text("Signed", x + signatureBlockW / 2, y + 20.5, 7.2, true, green, { align: "center" });
      }
      text(signerName, x + signatureBlockW / 2, y + 31, 7.0, true, black, { align: "center" });
      text("Signed: " + shortDate(latest.entry.signedAt), x + signatureBlockW / 2, y + 38, 6.1, false, muted, { align: "center" });
    } else {
      text("No signed record", x + signatureBlockW / 2, y + 22, 6.6, false, muted, { align: "center" });
    }
  });
  y += signatureBlockH;

  const totalPages = pdf.getNumberOfPages();
  for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
    pdf.setPage(pageIndex);
    text("Page " + pageIndex + " of " + totalPages, right, pageH - 6, 6.6, false, muted, { align: "right" });
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
