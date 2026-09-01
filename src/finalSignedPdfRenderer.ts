import { jsPDF } from "jspdf";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";

export type FinalSignedRole = "QA" | "Supervisor" | "Senior" | "Agent";

export type FinalSignedEntry = {
  role: FinalSignedRole;
  signerName?: string;
  signedBy?: string;
  signedAt?: string;
  status?: "Signed" | "Pending" | "Waived" | string;
  signatureDataUrl?: string;
  waiverReason?: string;
};

export type FinalSignedTopic = {
  code?: string;
  title?: string;
  label?: string;
  score?: number;
  max?: number;
};

export type FinalSignedCase = {
  caseId?: string;
  auditDate?: string;
  inquiry?: string;
  finalScore?: number;
  grade?: string;
  topics?: FinalSignedTopic[];
};

export type FinalSignedDocumentData = {
  monthKey: string;
  monthLabel: string;
  agentName: string;
  teamName?: string;
  caseCount: number;
  averageScore: number;
  grade: string;
  cases: FinalSignedCase[];
};

export type FinalSignedIncentive = {
  cash?: number;
  promo?: number;
  label?: string;
};

const SIGNATURE_FLOW: FinalSignedRole[] = ["QA", "Supervisor", "Senior", "Agent"];
const CASE_TARGET = 10;

function normalizeText(value: unknown) {
  return String(value ?? "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeKey(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function formatBahtAmount(value: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function getSignedEntry(entries: FinalSignedEntry[], role: FinalSignedRole) {
  return entries.find((entry) => entry.role === role && entry.status === "Signed");
}

function getWaivedEntry(entries: FinalSignedEntry[], role: FinalSignedRole) {
  return entries.find((entry) => entry.role === role && entry.status === "Waived");
}

function getCompletedEntry(entries: FinalSignedEntry[], role: FinalSignedRole) {
  return getSignedEntry(entries, role) || getWaivedEntry(entries, role);
}

async function normalizeSignatureDataUrl(dataUrl: string) {
  if (!dataUrl || typeof window === "undefined") return dataUrl;

  return new Promise<string>((resolve) => {
    let resolved = false;
    let timeoutId = 0;
    const finish = (value: string) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeoutId);
      resolve(value);
    };
    timeoutId = window.setTimeout(() => finish(dataUrl), 2500);
    const image = new Image();
    image.onload = () => {
      try {
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = image.naturalWidth || image.width;
        sourceCanvas.height = image.naturalHeight || image.height;
        const sourceContext = sourceCanvas.getContext("2d");
        if (!sourceContext || !sourceCanvas.width || !sourceCanvas.height) {
          finish(dataUrl);
          return;
        }

        sourceContext.drawImage(image, 0, 0);
        const imageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        let minX = sourceCanvas.width;
        let minY = sourceCanvas.height;
        let maxX = 0;
        let maxY = 0;
        let hasInk = false;

        for (let y = 0; y < sourceCanvas.height; y += 1) {
          for (let x = 0; x < sourceCanvas.width; x += 1) {
            const index = (y * sourceCanvas.width + x) * 4;
            const alpha = imageData.data[index + 3];
            const red = imageData.data[index];
            const green = imageData.data[index + 1];
            const blue = imageData.data[index + 2];
            const isInk = alpha > 24 && (red < 244 || green < 244 || blue < 244);
            if (!isInk) continue;
            hasInk = true;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }

        if (!hasInk) {
          finish(dataUrl);
          return;
        }

        const padding = 18;
        const cropX = Math.max(0, minX - padding);
        const cropY = Math.max(0, minY - padding);
        const cropW = Math.min(sourceCanvas.width - cropX, maxX - minX + 1 + padding * 2);
        const cropH = Math.min(sourceCanvas.height - cropY, maxY - minY + 1 + padding * 2);
        const outputCanvas = document.createElement("canvas");
        outputCanvas.width = cropW;
        outputCanvas.height = cropH;
        const outputContext = outputCanvas.getContext("2d");
        if (!outputContext) {
          finish(dataUrl);
          return;
        }

        outputContext.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        finish(outputCanvas.toDataURL("image/png"));
      } catch {
        finish(dataUrl);
      }
    };
    image.onerror = () => finish(dataUrl);
    image.src = dataUrl;
  });
}

export async function renderFinalSignedPdf({
  document: selectedDocument,
  entries,
  incentive: individualIncentive,
  documentRef: pdfDocumentRef,
  roleSignerNames,
  pdfDoc,
  appendPage = false,
  generatedAt = new Date().toISOString(),
}: {
  document: FinalSignedDocumentData;
  entries: FinalSignedEntry[];
  incentive: FinalSignedIncentive;
  documentRef: string;
  roleSignerNames: Record<FinalSignedRole, string>;
  pdfDoc?: jsPDF;
  appendPage?: boolean;
  generatedAt?: string;
}) {
  const pdf = pdfDoc || new jsPDF({ unit: "mm", format: "a4" });
  if (appendPage) pdf.addPage();

  try {
    registerTHSarabunNew(pdf);
    pdf.setFont("THSarabunNew", "normal");
  } catch {}

  const pageH = 297;
  const left = 10;
  const tableW = 186;
  const bottom = 289;
  const purple: [number, number, number] = [112, 48, 160];
  const lightPurple: [number, number, number] = [204, 193, 218];
  const palePurple: [number, number, number] = [248, 242, 251];
  const border: [number, number, number] = [184, 184, 184];
  const black: [number, number, number] = [18, 24, 38];
  const muted: [number, number, number] = [71, 85, 105];
  const good: [number, number, number] = [5, 150, 105];
  const warn: [number, number, number] = [180, 83, 9];
  const templateWidths = [15.36, 35.36, 12.27, 34.73, 19.91, 24.09, 30.36, 8, 25.36, 25.91];
  const widthScale = tableW / templateWidths.reduce((sum, value) => sum + value, 0);
  const colX = templateWidths.reduce<number[]>((acc, width) => {
    acc.push(acc[acc.length - 1] + width * widthScale);
    return acc;
  }, [left]);
  let y = 10;

  const setTemplateFont = (size: number, bold = false, color: [number, number, number] = black) => {
    try {
      pdf.setFont("THSarabunNew", bold ? "bold" : "normal");
    } catch {}
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };

  const columnX = (startCol: number) => colX[Math.max(0, Math.min(startCol, colX.length - 1))];
  const columnW = (startCol: number, endColExclusive: number) =>
    colX[Math.max(0, Math.min(endColExclusive, colX.length - 1))] - columnX(startCol);

  const fitLines = (value: unknown, width: number, fontSize: number, maxLines: number) => {
    setTemplateFont(fontSize);
    const rawLines = pdf.splitTextToSize(String(value ?? "-"), Math.max(4, width - 3));
    if (rawLines.length <= maxLines) return rawLines;
    const lines = rawLines.slice(0, maxLines);
    const last = String(lines[lines.length - 1] || "");
    lines[lines.length - 1] = last.length > 2 ? `${last.slice(0, Math.max(1, last.length - 2))}...` : "...";
    return lines;
  };

  const drawCell = (
    x: number,
    cellY: number,
    w: number,
    h: number,
    value: unknown,
    fill: [number, number, number],
    options: {
      bold?: boolean;
      color?: [number, number, number];
      size?: number;
      align?: "left" | "center" | "right";
      valign?: "top" | "middle";
      maxLines?: number;
      lineHeight?: number;
    } = {}
  ) => {
    const size = options.size ?? 8;
    const align = options.align ?? "left";
    const color = options.color ?? black;
    const maxLines = options.maxLines ?? 2;
    const lineHeight = options.lineHeight ?? size * 0.42 + 1.35;
    pdf.setLineWidth(0.15);
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.rect(x, cellY, w, h, "FD");
    const lines = fitLines(value, w, size, maxLines);
    setTemplateFont(size, options.bold ?? false, color);
    const textX = align === "center" ? x + w / 2 : align === "right" ? x + w - 2 : x + 2;
    const textY = options.valign === "top"
      ? cellY + 4.2
      : cellY + h / 2 - ((lines.length - 1) * lineHeight) / 2 + size * 0.22;
    lines.forEach((lineText: string, index: number) => {
      pdf.text(lineText, textX, textY + index * lineHeight, { align });
    });
  };

  const drawCellCols = (
    startCol: number,
    endColExclusive: number,
    cellY: number,
    h: number,
    value: unknown,
    fill: [number, number, number],
    options: Parameters<typeof drawCell>[6] = {}
  ) => drawCell(columnX(startCol), cellY, columnW(startCol, endColExclusive), h, value, fill, options);

  const drawCellsByWidth = (
    startX: number,
    cellY: number,
    h: number,
    cells: Array<{
      value: unknown;
      width: number;
      fill: [number, number, number];
      options?: Parameters<typeof drawCell>[6];
    }>
  ) => {
    let cursorX = startX;
    cells.forEach((cell) => {
      drawCell(cursorX, cellY, cell.width, h, cell.value, cell.fill, cell.options);
      cursorX += cell.width;
    });
  };

  const drawHeader = (title: string, subtitle: string) => {
    drawCell(left, y, tableW, 9.2, title, purple, {
      bold: true,
      color: [255, 255, 255],
      size: 15.6,
      align: "left",
      maxLines: 1,
    });
    y += 9.2;
    drawCell(left, y, tableW, 7.0, subtitle, purple, {
      bold: true,
      color: [255, 255, 255],
      size: 9.0,
      align: "left",
      maxLines: 1,
    });
    y += 8.2;
  };

  const drawSection = (title: string) => {
    if (y + 10 > bottom) {
      pdf.addPage();
      y = 10;
    }
    drawCell(left, y, tableW, 7.2, title, purple, {
      bold: true,
      color: [255, 255, 255],
      size: 10.0,
      align: "left",
      maxLines: 1,
    });
    y += 8.0;
  };

  const drawLabelValue = (
    labelStart: number,
    labelEnd: number,
    valueStart: number,
    valueEnd: number,
    label: string,
    value: unknown,
    rowY: number,
    h: number,
    valueOptions: Parameters<typeof drawCell>[6] = {}
  ) => {
    drawCellCols(labelStart, labelEnd, rowY, h, label, purple, {
      bold: true,
      color: [255, 255, 255],
      size: 8.4,
      align: "center",
      maxLines: 2,
    });
    drawCellCols(valueStart, valueEnd, rowY, h, value, lightPurple, {
      bold: true,
      size: 8.8,
      align: "center",
      maxLines: 2,
      ...valueOptions,
    });
  };

  const topicMap = new Map<string, {
    code: string;
    title: string;
    scoreSum: number;
    maxSum: number;
    count: number;
    maxValues: Set<number>;
  }>();

  selectedDocument.cases.forEach((item) => {
    (item.topics || []).forEach((topic) => {
      const code = normalizeText(topic.code);
      const title = normalizeText(topic.title || topic.label);
      const score = Number(topic.score || 0);
      const max = Number(topic.max || 0);
      if (!code || !title || !Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return;
      const key = code || normalizeKey(title);
      const current = topicMap.get(key) || {
        code,
        title,
        scoreSum: 0,
        maxSum: 0,
        count: 0,
        maxValues: new Set<number>(),
      };
      current.title = current.title || title;
      current.scoreSum += score;
      current.maxSum += max;
      current.count += 1;
      current.maxValues.add(max);
      topicMap.set(key, current);
    });
  });

  const topicStats = Array.from(topicMap.values())
    .map((item) => {
      const avgScore = item.count ? item.scoreSum / item.count : null;
      const avgMax = item.count ? item.maxSum / item.count : 0;
      const max = item.maxValues.size === 1 ? Array.from(item.maxValues)[0] : avgMax;
      const avgPercent = avgScore !== null && avgMax > 0 ? (avgScore / avgMax) * 100 : null;
      return { code: item.code, title: item.title, avgScore, max, avgPercent };
    })
    .sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" }) ||
      a.title.localeCompare(b.title, "th")
    );

  const topicRowsWithScore = topicStats.filter((item) => item.avgPercent !== null);
  const bestTopic = topicRowsWithScore.length
    ? [...topicRowsWithScore].sort((a, b) => Number(b.avgPercent) - Number(a.avgPercent))[0]
    : null;
  const lowestTopic = topicRowsWithScore.length
    ? [...topicRowsWithScore].sort((a, b) => Number(a.avgPercent) - Number(b.avgPercent))[0]
    : null;

  const signedRoles = SIGNATURE_FLOW.filter((role) => Boolean(getCompletedEntry(entries, role))).length;
  const isComplete = signedRoles === SIGNATURE_FLOW.length;
  const criticalCases = 0;
  const documentStatus = isComplete ? "Completed Signature" : "Incomplete Signature";
  const needMoreToTarget = Math.max(CASE_TARGET - selectedDocument.caseCount, 0);
  const incentiveText = Number(individualIncentive.promo || 0) > 0
    ? `${individualIncentive.label || "No Incentive"}\nCash ${formatBahtAmount(individualIncentive.cash || 0)} / Promo ${formatBahtAmount(individualIncentive.promo || 0)}`
    : `${individualIncentive.label || `${formatBahtAmount(individualIncentive.cash || 0)} THB`}`;

  drawHeader(
    "Monthly QA Dashboard",
    "Monthly dashboard for the selected Agent and selected Month. Values are generated from the current QA system."
  );

  drawSection("Current View");
  drawLabelValue(0, 1, 1, 3, "Agent", selectedDocument.agentName, y, 10.0, { maxLines: 2 });
  drawLabelValue(3, 4, 4, 6, "Month", selectedDocument.monthLabel, y, 10.0);
  drawLabelValue(6, 7, 7, 8, "Reviewed Cases", selectedDocument.caseCount, y, 10.0);
  drawLabelValue(8, 9, 9, 10, "Critical Cases", criticalCases, y, 10.0);
  y += 11.0;

  drawCellCols(0, 3, y, 7.4, "Cases Reviewed", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });
  drawCellCols(3, 6, y, 7.4, "Need More to 10", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });
  drawCellCols(6, 9, y, 7.4, "Average Score", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });
  drawCellCols(9, 10, y, 7.4, "Monthly Grade", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center", maxLines: 2 });
  y += 7.4;
  drawCellCols(0, 3, y, 10.8, `${selectedDocument.caseCount}/${CASE_TARGET}`, lightPurple, { bold: true, size: 13, align: "center", maxLines: 1 });
  drawCellCols(3, 6, y, 10.8, needMoreToTarget, lightPurple, { bold: true, size: 13, align: "center", maxLines: 1 });
  drawCellCols(6, 9, y, 10.8, selectedDocument.averageScore.toFixed(2), lightPurple, { bold: true, size: 13, align: "center", color: selectedDocument.averageScore >= 80 ? good : warn, maxLines: 1 });
  drawCellCols(9, 10, y, 10.8, selectedDocument.grade, lightPurple, { bold: true, size: 13, align: "center", maxLines: 1 });
  y += 13;

  drawSection("Incentive Summary");
  drawCellCols(0, 3, y, 7.4, "Incentive", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });
  drawCellCols(3, 6, y, 7.4, "Best Topic", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });
  drawCellCols(6, 10, y, 7.4, "Lowest Topic", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });
  y += 7.4;
  drawCellCols(0, 3, y, 12, incentiveText, lightPurple, { bold: true, size: 8.8, align: "center", maxLines: 2 });
  drawCellCols(3, 6, y, 12, bestTopic ? `${bestTopic.title}\n${Number(bestTopic.avgPercent).toFixed(2)}%` : "-", lightPurple, { bold: true, size: 8.3, align: "center", maxLines: 2 });
  drawCellCols(6, 10, y, 12, lowestTopic ? `${lowestTopic.title}\n${Number(lowestTopic.avgPercent).toFixed(2)}%` : "-", lightPurple, { bold: true, size: 8.3, align: "center", maxLines: 2 });
  y += 14;

  drawSection("Monthly Case List");
  const caseColWidths = [10, 23, 24, 96, 16, 8, 9];
  drawCellsByWidth(left, y, 7.4, ["Seq", "Case Date", "Case ID", "Inquiry", "Score", "Grade", "Critical"].map((label, index) => ({
    value: label,
    width: caseColWidths[index],
    fill: purple,
    options: { bold: true, color: [255,255,255] as [number,number,number], size: 7.8, align: "center" as const, maxLines: 1 },
  })));
  y += 7.4;

  for (let index = 0; index < CASE_TARGET; index += 1) {
    const item = selectedDocument.cases[index];
    const rowH = 8.4;
    const fill: [number, number, number] = index % 2 === 0 ? [255,255,255] : [250,247,253];
    drawCellsByWidth(left, y, rowH, [
      { value: index + 1, width: caseColWidths[0], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },
      { value: item?.auditDate || "-", width: caseColWidths[1], fill, options: { size: 7.1, align: "center", bold: true, maxLines: 1 } },
      { value: item?.caseId || "-", width: caseColWidths[2], fill, options: { size: 7.1, align: "center", bold: true, maxLines: 1 } },
      { value: item?.inquiry || "-", width: caseColWidths[3], fill, options: { size: 7.0, align: "left", bold: true, maxLines: 2, lineHeight: 3.55 } },
      { value: item ? Number(item.finalScore || 0).toFixed(2) : "-", width: caseColWidths[4], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },
      { value: item?.grade || "-", width: caseColWidths[5], fill, options: { size: 7.5, align: "center", bold: true, maxLines: 1 } },
      { value: "NO", width: caseColWidths[6], fill, options: { size: 7.0, align: "center", bold: true, maxLines: 1 } },
    ] as any);
    y += rowH;
  }

  y += 3;
  drawSection("Monthly Topic Performance");
  const drawTopicHeader = () => {
    [
      [0, 1, "Topic"],
      [1, 4, "Description"],
      [4, 6, "Avg Score"],
      [6, 7, "Max"],
      [7, 10, "Avg %"],
    ].forEach(([start, end, label]) => {
      drawCellCols(Number(start), Number(end), y, 7.4, String(label), purple, {
        bold: true,
        color: [255,255,255],
        size: 8.0,
        align: "center",
        maxLines: 1,
      });
    });
    y += 7.4;
  };
  const formatMetric = (value: number | null) => value === null || !Number.isFinite(value) ? "-" : value.toFixed(2);
  const formatTopicMax = (value: number) => Number.isFinite(value) ? (Number.isInteger(value) ? String(value) : value.toFixed(2)) : "-";

  drawTopicHeader();
  if (!topicStats.length) {
    drawCell(left, y, tableW, 8.8, "No topic score data for this document", [250,247,253], { size: 8.2, align: "center", bold: true, color: muted, maxLines: 1 });
    y += 8.8;
  } else {
    topicStats.forEach((item, index) => {
      const topicRowH = 8.0;
      if (y + topicRowH > bottom - 4) {
        pdf.addPage();
        y = 10;
        drawSection("Monthly Topic Performance (continued)");
        drawTopicHeader();
      }
      const fill: [number, number, number] = index % 2 === 0 ? [255,255,255] : [250,247,253];
      drawCellCols(0, 1, y, topicRowH, item.code, fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });
      drawCellCols(1, 4, y, topicRowH, item.title, fill, { size: 7.4, align: "left", bold: true, maxLines: 1 });
      drawCellCols(4, 6, y, topicRowH, formatMetric(item.avgScore), fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });
      drawCellCols(6, 7, y, topicRowH, formatTopicMax(item.max), fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });
      drawCellCols(7, 10, y, topicRowH, item.avgPercent === null ? "-" : `${item.avgPercent.toFixed(2)}%`, fill, { size: 7.8, align: "center", bold: true, maxLines: 1 });
      y += topicRowH;
    });
  }

  y += 3;
  drawSection("Acknowledgement / Signature");
  drawCell(left, y, tableW, 5.4, "รับทราบผลการประเมินประจำเดือน โดยลงนามตามตำแหน่งด้านล่าง", [255,255,255], { size: 7.2, align: "left", color: muted, maxLines: 1 });
  y += 6.2;

  const signerName = (role: FinalSignedRole) => {
    const signed = getSignedEntry(entries, role);
    return roleSignerNames[role] || signed?.signerName || signed?.signedBy || "-";
  };
  const signerDate = (role: FinalSignedRole) => {
    const signed = getSignedEntry(entries, role);
    return signed ? formatDateTime(String(signed.signedAt || "")) : "";
  };
  const signatureData = (role: FinalSignedRole) => getSignedEntry(entries, role)?.signatureDataUrl || "";
  const normalizedSignatures = new Map<FinalSignedRole, string>();
  for (const role of SIGNATURE_FLOW) {
    const signature = signatureData(role);
    normalizedSignatures.set(role, signature ? await normalizeSignatureDataUrl(signature) : "");
  }

  const signatureBlockHeight = 74;
  if (y + signatureBlockHeight > bottom - 5) {
    pdf.addPage();
    y = 12;
  }

  const drawDottedLine = (x1: number, lineY: number, x2: number) => {
    pdf.setDrawColor(108, 96, 128);
    pdf.setLineWidth(0.12);
    const dashedPdf = pdf as jsPDF & { setLineDashPattern?: (dashArray: number[], dashPhase: number) => jsPDF };
    dashedPdf.setLineDashPattern?.([0.55, 0.65], 0);
    pdf.line(x1, lineY, x2, lineY);
    dashedPdf.setLineDashPattern?.([], 0);
  };

  const drawSignedLine = (label: string, centerX: number, lineY: number, value = "") => {
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

  const drawSignaturePanel = (x: number, panelY: number, w: number, role: FinalSignedRole, roleTitle: string) => {
    drawCell(x, panelY, w, 5.2, roleTitle, purple, { bold: true, color: [255,255,255], size: 7.0, align: "center", maxLines: 1 });
    const signatureAreaY = panelY + 5.2;
    const signatureAreaH = 14.2;
    const signLineY = signatureAreaY + 9.9;
    const centerX = x + w / 2;
    drawCell(x, signatureAreaY, w, signatureAreaH, "", palePurple, { size: 6, align: "center" });
    drawSignedLine("ลงชื่อ", centerX, signLineY);
    const signature = normalizedSignatures.get(role) || "";
    if (signature) {
      try {
        const imageProps = pdf.getImageProperties(signature);
        const ratio = imageProps.width && imageProps.height ? imageProps.width / imageProps.height : 4;
        const maxImageW = Math.min(w - 38, 46);
        const maxImageH = 9.6;
        let imageW = maxImageW;
        let imageH = imageW / ratio;
        if (imageH > maxImageH) {
          imageH = maxImageH;
          imageW = imageH * ratio;
        }
        pdf.addImage(signature, "PNG", centerX - imageW / 2, signLineY - imageH + 0.9, imageW, imageH);
      } catch {
        setTemplateFont(6.0, false, muted);
        pdf.text("Signature image unavailable", centerX, signLineY - 1.5, { align: "center" });
      }
    }
    drawCell(x, panelY + 19.4, w, 4.2, signerName(role), [255,255,255], { bold: true, size: 6.4, align: "center", maxLines: 1 });
    drawCell(x, panelY + 23.6, w, 3.8, roleTitle, [255,255,255], { size: 5.8, align: "center", maxLines: 1 });
    drawCell(x, panelY + 27.4, w, 4.6, "", [255,255,255], { size: 5.8, align: "center" });
    drawSignedLine("วันที่", centerX, panelY + 30.3, signerDate(role));
  };

  const halfW = tableW / 2 - 3;
  drawSignaturePanel(left, y, halfW, "Agent", "Agent ผู้ถูกประเมิน");
  drawSignaturePanel(left + halfW + 6, y, halfW, "Senior", "Senior หัวหน้าทีมผู้ถูกประเมิน");
  y += 35.5;
  drawSignaturePanel(left, y, halfW, "Supervisor", "Supervisor หัวหน้าแผนก");
  drawSignaturePanel(left + halfW + 6, y, halfW, "QA", "QA ผู้ตรวจสอบ");

  setTemplateFont(7.0, false, muted);
  pdf.text(
    `Document Ref. ${pdfDocumentRef} | Generated: ${formatDateTime(generatedAt)} | ${documentStatus} | Signed: ${signedRoles}/${SIGNATURE_FLOW.length}`,
    left + tableW,
    pageH - 5.4,
    { align: "right" }
  );

  const safeAgentFileName = selectedDocument.agentName.replace(/[^a-zA-Z0-9ก-๙]+/g, "_").replace(/^_+|_+$/g, "") || "Agent";
  const fileName = `QA Score Monthly ${selectedDocument.monthLabel}_${safeAgentFileName}_${pdfDocumentRef}.pdf`;
  return { pdf, fileName, documentRef: pdfDocumentRef };
}
