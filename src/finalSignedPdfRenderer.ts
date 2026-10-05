import { jsPDF } from "jspdf";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { fetchStoredCoachingRecords, type StoredCoachingRecord } from "./coachingStore";
import { canonicalAgentIdentityKey } from "./lib/agentIdentity";

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

export type FinalSignedPdfSource = {
  document: FinalSignedDocumentData;
  entries: FinalSignedEntry[];
  incentive: FinalSignedIncentive;
  documentRef: string;
  roleSignerNames: Record<FinalSignedRole, string>;
};

const SIGNATURE_FLOW: FinalSignedRole[] = ["QA", "Supervisor", "Senior", "Agent"];
const CASE_TARGET = 10;
const KPI_TARGET = 85;
// final-signed-kpi-status-v14
// final-signed-current-kpi-tight-layout-v15
// final-signed-current-score-color-v16
// final-signed-current-kpi-restore-v17
// final-signed-dashboard-value-colors-v18

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

let coachingRecordCache: { loadedAt: number; rows: StoredCoachingRecord[] } | null = null;

async function getCoachingRecordsForPdf() {
  const now = Date.now();
  if (coachingRecordCache && now - coachingRecordCache.loadedAt < 60_000) {
    return coachingRecordCache.rows;
  }
  try {
    const rows = await fetchStoredCoachingRecords();
    coachingRecordCache = { loadedAt: now, rows };
    return rows;
  } catch (error) {
    console.warn("Final Signed PDF coaching data could not be loaded", error);
    return coachingRecordCache?.rows || [];
  }
}

function findMonthlyCoachingRecord(
  rows: StoredCoachingRecord[],
  monthKey: string,
  agentName: string
) {
  const agentKey = canonicalAgentIdentityKey(agentName);
  return rows
    .filter((row) => row.monthKey === monthKey)
    .filter((row) => {
      const rowKey = canonicalAgentIdentityKey(row.agent);
      return Boolean(agentKey && rowKey && agentKey === rowKey);
    })
    .sort(
      (left, right) =>
        new Date(right.updatedAt || right.createdAt || 0).getTime() -
        new Date(left.updatedAt || left.createdAt || 0).getTime()
    )[0] || null;
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
  const pdf = pdfDoc || new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  if (appendPage) pdf.addPage("a4", "portrait");

  const coachingEnabled = selectedDocument.monthKey >= "2026-09";
  const coachingRecord = coachingEnabled
    ? findMonthlyCoachingRecord(
        await getCoachingRecordsForPdf(),
        selectedDocument.monthKey,
        selectedDocument.agentName
      )
    : null;

  try {
    registerTHSarabunNew(pdf);
    pdf.setFont("THSarabunNew", "normal");
  } catch {}

  const pageH = 297;
  const left = 10;
  const tableW = 186;
  const bottom = 289;
  // Reference: four wide, shallow panels (~1.94:1), never tall cards.
  // Keep these dimensions fixed when the number of monthly topics changes.
  const signatureGap = 2;
  const signaturePanel = { header: 3.5, ink: 9, name: 3.2, role: 3.2, date: 4.3 };
  const signaturePanelH = Object.values(signaturePanel).reduce((sum, height) => sum + height, 0);
  const acknowledgementH = 7.2 + 6.2 + signaturePanelH;
  const purple: [number, number, number] = [112, 48, 160];
  const lightPurple: [number, number, number] = [204, 193, 218];
  const palePurple: [number, number, number] = [248, 242, 251];
  const border: [number, number, number] = [184, 184, 184];
  const black: [number, number, number] = [18, 24, 38];
  const muted: [number, number, number] = [71, 85, 105];
  const good: [number, number, number] = [5, 150, 105];
  const warn: [number, number, number] = [180, 83, 9];
  const kpiFailFill: [number, number, number] = [254, 226, 226];
  const kpiFailText: [number, number, number] = [185, 28, 28];
  const valueWhite: [number, number, number] = [255, 255, 255];
  // Mirror Dashboard semantic backgrounds: strongest = emerald-50, coaching focus = rose-50.
  const dashboardBestTopicFill: [number, number, number] = [236, 253, 245];
  const dashboardLowestTopicFill: [number, number, number] = [255, 241, 242];
  const dashboardGradeFill = (grade: string): [number, number, number] => {
    switch (String(grade || "").toUpperCase()) {
      case "A": return [236, 253, 245];
      case "B": return [239, 246, 255];
      case "C": return [255, 251, 235];
      case "D": return [255, 237, 213];
      default: return [255, 241, 242];
    }
  };
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
      baselineOffset?: number;
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
      : cellY + h / 2 - ((lines.length - 1) * lineHeight) / 2 + (options.baselineOffset ?? size * 0.22);
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
    y += 7.0;
  };

  const drawSection = (title: string) => {
    drawCell(left, y, tableW, 7.2, title, purple, {
      bold: true,
      color: [255, 255, 255],
      size: 10.0,
      align: "left",
      maxLines: 1,
    });
    y += 7.2;
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
    drawCellCols(valueStart, valueEnd, rowY, h, value, valueWhite, {
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
  y += 10.0;

  const monthlyKpiPassed = Number(selectedDocument.averageScore || 0) >= KPI_TARGET;
  const currentMetricWidths = [38, 38, 43, 27, 40];
  drawCellsByWidth(left, y, 7.4, ["Cases Reviewed", "Need More to 10", "Average Score", "Monthly Grade", "KPI Status"].map((label, index) => ({
    value: label,
    width: currentMetricWidths[index],
    fill: purple,
    options: { bold: true, color: [255,255,255] as [number,number,number], size: index === 4 ? 7.8 : 8.4, align: "center" as const, maxLines: 1 },
  })));
  y += 7.4;
  drawCellsByWidth(left, y, 10.8, [
    { value: `${selectedDocument.caseCount}/${CASE_TARGET}`, width: currentMetricWidths[0], fill: valueWhite, options: { bold: true, size: 12.5, align: "center", maxLines: 1 } },
    { value: needMoreToTarget, width: currentMetricWidths[1], fill: valueWhite, options: { bold: true, size: 12.5, align: "center", maxLines: 1 } },
    { value: selectedDocument.averageScore.toFixed(2), width: currentMetricWidths[2], fill: valueWhite, options: { bold: true, size: 12.5, align: "center", color: monthlyKpiPassed ? good : kpiFailText, maxLines: 1 } },
    { value: selectedDocument.grade, width: currentMetricWidths[3], fill: dashboardGradeFill(selectedDocument.grade), options: { bold: true, size: 12.5, align: "center", color: black, maxLines: 1 } },
    { value: monthlyKpiPassed ? "Passed" : "Not Passed", width: currentMetricWidths[4], fill: valueWhite, options: { bold: true, size: 8.2, align: "center", color: monthlyKpiPassed ? good : kpiFailText, maxLines: 1 } },
  ] as any);
  y += 10.8;

  drawSection("Incentive Summary");
  drawCellCols(0, 3, y, 7.4, "Incentive", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });
  drawCellCols(3, 6, y, 7.4, "Best Topic", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });
  drawCellCols(6, 10, y, 7.4, "Lowest Topic", purple, { bold: true, color: [255,255,255], size: 8.7, align: "center" });
  y += 7.4;
  drawCellCols(0, 3, y, 12, incentiveText, valueWhite, { bold: true, size: 8.8, align: "center", maxLines: 2 });
  drawCellCols(3, 6, y, 12, bestTopic ? `${bestTopic.title}\n${Number(bestTopic.avgPercent).toFixed(2)}%` : "-", dashboardBestTopicFill, { bold: true, size: 8.3, align: "center", maxLines: 2 });
  drawCellCols(6, 10, y, 12, lowestTopic ? `${lowestTopic.title}\n${Number(lowestTopic.avgPercent).toFixed(2)}%` : "-", dashboardLowestTopicFill, { bold: true, size: 8.3, align: "center", maxLines: 2 });
  y += 12;

  drawSection("Monthly Case List");
  const caseColWidths = [8, 20, 22, 82, 14, 8, 9, 23];
  drawCellsByWidth(left, y, 7.4, ["Seq", "Case Date", "Case ID", "Inquiry", "Score", "Grade", "Critical", "KPI Status"].map((label, index) => ({
    value: label,
    width: caseColWidths[index],
    fill: purple,
    options: { bold: true, color: [255,255,255] as [number,number,number], size: index === 7 ? 7.1 : 7.6, align: "center" as const, maxLines: 1 },
  })));
  y += 7.4;

  for (let index = 0; index < CASE_TARGET; index += 1) {
    const item = selectedDocument.cases[index];
    const rowH = 8.4;
    const score = item ? Number(item.finalScore || 0) : null;
    const isKpiFail = score !== null && Number.isFinite(score) && score < KPI_TARGET;
    const fill: [number, number, number] = isKpiFail
      ? kpiFailFill
      : index % 2 === 0 ? [255,255,255] : [250,247,253];
    const kpiStatus = !item ? "-" : isKpiFail ? "Not Passed" : "Passed";
    drawCellsByWidth(left, y, rowH, [
      { value: index + 1, width: caseColWidths[0], fill, options: { size: 7.3, align: "center", bold: true, maxLines: 1 } },
      { value: item?.auditDate || "-", width: caseColWidths[1], fill, options: { size: 7.0, align: "center", bold: true, maxLines: 1 } },
      { value: item?.caseId || "-", width: caseColWidths[2], fill, options: { size: 7.0, align: "center", bold: true, maxLines: 1 } },
      { value: item?.inquiry || "-", width: caseColWidths[3], fill, options: { size: 6.8, align: "left", bold: true, maxLines: 2, lineHeight: 3.45 } },
      { value: item ? Number(item.finalScore || 0).toFixed(2) : "-", width: caseColWidths[4], fill, options: { size: 7.3, align: "center", bold: true, maxLines: 1 } },
      { value: item?.grade || "-", width: caseColWidths[5], fill, options: { size: 7.3, align: "center", bold: true, maxLines: 1 } },
      { value: item ? "NO" : "-", width: caseColWidths[6], fill, options: { size: 6.8, align: "center", bold: true, maxLines: 1 } },
      { value: kpiStatus, width: caseColWidths[7], fill, options: { size: 7.0, align: "center", bold: true, maxLines: 1, color: isKpiFail ? kpiFailText : item ? good : muted } },
    ] as any);
    y += rowH;
  }

  // All sections stay in reading order on this one portrait page. Reserve the
  // compact acknowledgement block below the topics, not on an earlier page.
  drawSection("Monthly Topic Performance");
  const topicColWidths = [12, 77, 28, 18, 23, 28];
  const drawTopicHeader = () => {
    drawCellsByWidth(left, y, 7.4, ["Topic", "Description", "Avg Score", "Max", "Avg %", "KPI Status"].map((label, index) => ({
      value: label,
      width: topicColWidths[index],
      fill: purple,
      options: { bold: true, color: [255,255,255] as [number,number,number], size: index === 5 ? 7.2 : 7.8, align: "center" as const, maxLines: 1 },
    })));
    y += 7.4;
  };
  const formatMetric = (value: number | null) => value === null || !Number.isFinite(value) ? "-" : value.toFixed(2);
  const formatTopicMax = (value: number) => Number.isFinite(value) ? (Number.isInteger(value) ? String(value) : value.toFixed(2)) : "-";

  drawTopicHeader();
  const topicReserve = coachingEnabled ? 0 : acknowledgementH;
  const topicRowH = Math.min(8, (bottom - y - topicReserve) / Math.max(1, topicStats.length));
  const topicFontSize = Math.min(7.6, topicRowH * 1.45);
  if (!topicStats.length) {
    drawCell(left, y, tableW, topicRowH, "No topic score data for this document", [250,247,253], { size: 8.2, align: "center", bold: true, color: muted, maxLines: 1 });
    y += topicRowH;
  } else {
    topicStats.forEach((item, index) => {
      const isKpiFail = item.avgPercent !== null && Number(item.avgPercent) < KPI_TARGET;
      const fill: [number, number, number] = isKpiFail
        ? kpiFailFill
        : index % 2 === 0 ? [255,255,255] : [250,247,253];
      const kpiStatus = item.avgPercent === null ? "-" : isKpiFail ? "Not Passed" : "Passed";
      drawCellsByWidth(left, y, topicRowH, [
        { value: item.code, width: topicColWidths[0], fill, options: { size: topicFontSize, align: "center", bold: true, maxLines: 1 } },
        { value: item.title, width: topicColWidths[1], fill, options: { size: Math.min(7.2, topicFontSize), align: "left", bold: true, maxLines: 1 } },
        { value: formatMetric(item.avgScore), width: topicColWidths[2], fill, options: { size: topicFontSize, align: "center", bold: true, maxLines: 1 } },
        { value: formatTopicMax(item.max), width: topicColWidths[3], fill, options: { size: topicFontSize, align: "center", bold: true, maxLines: 1 } },
        { value: item.avgPercent === null ? "-" : `${item.avgPercent.toFixed(2)}%`, width: topicColWidths[4], fill, options: { size: topicFontSize, align: "center", bold: true, maxLines: 1 } },
        { value: kpiStatus, width: topicColWidths[5], fill, options: { size: Math.min(7.0, topicFontSize), align: "center", bold: true, maxLines: 1, color: isKpiFail ? kpiFailText : item.avgPercent === null ? muted : good } },
      ] as any);
      y += topicRowH;
    });
  }

  if (coachingEnabled) {
    const coachingSubtitle = `${selectedDocument.agentName} • ${selectedDocument.monthLabel}`;
    const coachingLineHeight = 4.2;

    const startCoachingPage = (continued = false) => {
      pdf.addPage("a4", "portrait");
      y = 10;
      drawHeader(
        continued ? "Monthly Coaching (continued)" : "Monthly Coaching",
        coachingSubtitle
      );
    };

    const cleanCoachingText = (value: unknown) =>
      String(value ?? "")
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    const formatCoachingDate = (value: unknown) => {
      const raw = cleanCoachingText(value);
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
    };

    const ensureCoachingSpace = (height: number) => {
      if (y + height <= bottom - 5) return;
      startCoachingPage(true);
    };

    const drawPlainHeading = (title: string) => {
      if (!cleanCoachingText(title)) return;
      ensureCoachingSpace(9);
      setTemplateFont(10.3, true, purple);
      pdf.text(title, left, y + 4.6);
      pdf.setDrawColor(purple[0], purple[1], purple[2]);
      pdf.setLineWidth(0.35);
      pdf.line(left, y + 6.1, left + tableW, y + 6.1);
      y += 9;
    };

    const drawPlainField = (label: string, value: unknown) => {
      const text = cleanCoachingText(value);
      if (!text) return;
      setTemplateFont(8.5, false, black);
      let lines = pdf.splitTextToSize(text, tableW - 38) as string[];
      let firstChunk = true;
      while (lines.length) {
        const available = bottom - 5 - y;
        const maxLines = Math.max(1, Math.floor((available - 2) / coachingLineHeight));
        if (available < 8) {
          startCoachingPage(true);
          continue;
        }
        const chunk = lines.slice(0, maxLines);
        lines = lines.slice(chunk.length);
        ensureCoachingSpace(Math.max(6.5, chunk.length * coachingLineHeight + 1));
        setTemplateFont(8.4, true, muted);
        pdf.text(firstChunk ? label : `${label} (ต่อ)`, left, y + 3.6);
        setTemplateFont(8.6, false, black);
        chunk.forEach((lineText, index) => {
          pdf.text(lineText, left + 37, y + 3.6 + index * coachingLineHeight);
        });
        y += Math.max(6.5, chunk.length * coachingLineHeight + 1);
        firstChunk = false;
        if (lines.length) startCoachingPage(true);
      }
    };

    const drawPlainList = (label: string, values: unknown[]) => {
      const cleaned = values.map(cleanCoachingText).filter(Boolean);
      if (!cleaned.length) return;
      drawPlainField(label, cleaned.map((item, index) => `${index + 1}. ${item}`).join("\n"));
    };

    startCoachingPage(false);

    if (!coachingRecord) {
      setTemplateFont(9.5, true, muted);
      pdf.text("ยังไม่มีข้อมูล Coaching ที่บันทึกไว้สำหรับ Agent และเดือนนี้", left, y + 6);
      y += 11;
    } else {
      const meeting = coachingRecord.appointment;
      const coachName = coachingRecord.coachName || coachingRecord.coachedBy || coachingRecord.seniorName || "";

      // Appointment is intentionally the first content immediately under Monthly Coaching.
      drawPlainHeading("นัดหมาย Coaching");
      if (meeting) {
        drawPlainField("วันที่นัดหมาย", formatCoachingDate(meeting.date) || "-");
        const appointmentTimeSummary = (() => {
          const start = String(meeting.startTime || "").trim();
          const duration = Number(meeting.duration || 0);
          let end = "";
          if (start && Number.isFinite(duration) && duration > 0) {
            const [h, m] = start.split(":").map(Number);
            if (Number.isFinite(h) && Number.isFinite(m)) {
              const total = h * 60 + m + duration;
              end = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
            }
          }
          const timeRange = start && end ? `${start}–${end}` : start || end || "-";
          const durationText = duration > 0 ? ` (${duration} นาที)` : "";
          const methodText = String(meeting.method || "").trim();
          return `${timeRange}${durationText}${methodText ? ` ${methodText}` : ""}`;
        })();
        drawPlainField("เวลา / ช่องทาง", appointmentTimeSummary);
        drawPlainField("ผู้ Coaching", coachName || "-");
        if (meeting.method === "MS Teams") drawPlainField("MS Teams", meeting.url);
        if (meeting.method === "Other") drawPlainField("รายละเอียดช่องทาง", meeting.other);
        drawPlainList("ผู้เข้าร่วม", meeting.participants || []);
        drawPlainList("Agenda / แผนที่จะคุย", (meeting.agenda || []).filter(Boolean));
        drawPlainField("หมายเหตุ", meeting.note);
      } else {
        drawPlainField("สถานะ", "ยังไม่มีข้อมูลนัดหมาย Coaching");
      }

      drawPlainHeading("QA สรุปและแนะนำหัวข้อการ Coaching");
      drawPlainField("สรุปภาพรวม", coachingRecord.qaSummary);
      drawPlainList("หัวข้อที่แนะนำ", coachingRecord.recommendedTopics || []);

      const actual = coachingRecord.actualCoaching;
      if (actual && (
        actual.date || actual.startTime || actual.endTime ||
        actual.topics?.length || actual.note || actual.finalNote || actual.noPlanReason
      )) {
        drawPlainHeading("ผล Coaching และ Action Plan โดยผู้ Coaching");
        drawPlainField("วันที่ Coaching จริง", formatCoachingDate(actual.date));
        drawPlainField("เวลา Coaching จริง", [actual.startTime, actual.endTime].filter(Boolean).join(" - "));
        drawPlainList("หัวข้อที่คุยจริง", actual.topics || []);
        drawPlainField("Coaching Note", actual.note);
        drawPlainField("Final Coaching Note", actual.finalNote);
        drawPlainField("เหตุผลที่ไม่ต้องทำ Action Plan", actual.noPlanReason);
      }

      if (coachingRecord.actions?.length) {
        drawPlainHeading("Action Plan");
        coachingRecord.actions.forEach((action, index) => {
          drawPlainField(
            `Action ${index + 1}`,
            [
              action.topic ? `หัวข้อ: ${action.topic}` : "",
              action.issue ? `ปัญหาที่พบ: ${action.issue}` : "",
              action.plan ? `Action Plan: ${action.plan}` : "",
              action.owner ? `ผู้รับผิดชอบ: ${action.owner}` : "",
              action.dueDate ? `กำหนดส่ง: ${formatCoachingDate(action.dueDate)}` : "",
              action.expectedResult ? `ผลที่คาดหวัง: ${action.expectedResult}` : "",
              action.followUpNote ? `บันทึกติดตาม: ${action.followUpNote}` : "",
              action.status ? `สถานะ: ${action.status}` : "",
            ].filter(Boolean).join("\n")
          );
        });
      } else {
        drawPlainField("Action Plan", coachingRecord.actionPlan);
      }

      if (
        coachingRecord.qaReviewComment ||
        coachingRecord.followUpDate ||
        coachingRecord.generalFeedback ||
        coachingRecord.agentResponse ||
        coachingRecord.agreedActionPlan ||
        coachingRecord.additionalNote
      ) {
        drawPlainHeading("QA Review / Follow-up");
        drawPlainField("QA Review Comment", coachingRecord.qaReviewComment);
        drawPlainField("Follow-up Date", formatCoachingDate(coachingRecord.followUpDate));
        drawPlainField("General Feedback", coachingRecord.generalFeedback);
        drawPlainField("Agent Response", coachingRecord.agentResponse);
        drawPlainField("Agreed Action Plan", coachingRecord.agreedActionPlan);
        drawPlainField("Additional Note", coachingRecord.additionalNote);
      }

      if (coachingRecord.attachments?.length) {
        drawPlainHeading("เอกสาร / ไฟล์ประกอบ");
        coachingRecord.attachments.forEach((attachment, index) => {
          drawPlainField(
            `${index + 1}. ${attachment.name || "Attachment"}`,
            [
              attachment.uploadedBy ? `Uploaded by: ${attachment.uploadedBy}` : "",
              attachment.uploadedAt ? `Uploaded at: ${formatDateTime(attachment.uploadedAt)}` : "",
              attachment.url ? `URL: ${attachment.url}` : "",
            ].filter(Boolean).join("\n")
          );
        });
      }
    }

    // Acknowledgement / Signature always starts after all Coaching content.
    pdf.addPage("a4", "portrait");
    y = 10;
  }

  // The acknowledgement is always the final section.
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

  const drawDottedLine = (x1: number, lineY: number, x2: number) => {
    pdf.setDrawColor(108, 96, 128);
    pdf.setLineWidth(0.12);
    const dashedPdf = pdf as jsPDF & { setLineDashPattern?: (dashArray: number[], dashPhase: number) => jsPDF };
    dashedPdf.setLineDashPattern?.([0.55, 0.65], 0);
    pdf.line(x1, lineY, x2, lineY);
    dashedPdf.setLineDashPattern?.([], 0);
  };

  const drawSignedLine = (
    label: string,
    panelLeft: number,
    panelWidth: number,
    lineY: number,
    value = ""
  ) => {
    const centerX = panelLeft + panelWidth / 2;
    const labelX = panelLeft + 9.5;
    const lineStart = panelLeft + 11;
    const lineEnd = panelLeft + panelWidth - 2;
    setTemplateFont(7.6, false, muted);
    pdf.text(label, labelX, lineY - 0.25, { align: "right" });
    // Keep the original dotted baseline continuous, with the value ABOVE it.
    // Its center is the panel/signature axis, not the label's remaining space.
    drawDottedLine(lineStart, lineY, lineEnd);
    if (value) {
      setTemplateFont(8.4, true, black);
      pdf.text(value, centerX, lineY - 0.5, { align: "center" });
    }
  };

  const drawSignaturePanel = (x: number, panelY: number, w: number, role: FinalSignedRole, roleTitle: string) => {
    const { header: headerH, ink: signatureAreaH, name: nameH, role: roleH, date: dateH } = signaturePanel;
    drawCell(x, panelY, w, headerH, roleTitle, purple, {
      bold: true,
      color: [255,255,255],
      // At 8 pt, THSarabunNew's Thai marks and lower vowels fit inside the
      // existing 3.5 mm header with at least 0.2 mm clearance on both sides.
      size: 8.0,
      align: "center",
      maxLines: 1,
      baselineOffset: 0.85,
    });
    const signatureAreaY = panelY + headerH;
    const signLineY = signatureAreaY + signatureAreaH - 2.0;
    const centerX = x + w / 2;
    drawCell(x, signatureAreaY, w, signatureAreaH, "", palePurple, { size: 6, align: "center" });
    drawSignedLine("ลงชื่อ", x, w, signLineY);
    const signature = normalizedSignatures.get(role) || "";
    if (signature) {
      try {
        const imageProps = pdf.getImageProperties(signature);
        const ratio = imageProps.width && imageProps.height ? imageProps.width / imageProps.height : 4;
        const maxImageW = w - 17;
        const maxImageH = signatureAreaH - 2.0;
        let imageW = maxImageW;
        let imageH = imageW / ratio;
        if (imageH > maxImageH) {
          imageH = maxImageH;
          imageW = imageH * ratio;
        }
        pdf.addImage(signature, "PNG", centerX - imageW / 2, signLineY - imageH + 0.5, imageW, imageH);
      } catch {
        setTemplateFont(5.8, false, muted);
        pdf.text("Signature image unavailable", centerX, signLineY - 2, { align: "center" });
      }
    }
    const nameY = signatureAreaY + signatureAreaH;
    drawCell(x, nameY, w, nameH, signerName(role), [255,255,255], {
      bold: true,
      size: 8.6,
      align: "center",
      maxLines: 1,
      baselineOffset: 0.7,
    });
    const roleY = nameY + nameH;
    drawCell(x, roleY, w, roleH, roleTitle, [255,255,255], {
      size: 7.6,
      align: "center",
      maxLines: 1,
      baselineOffset: 0.65,
    });
    const dateY = roleY + roleH;
    drawCell(x, dateY, w, dateH, "", [255,255,255], { size: 5.7, align: "center" });
    drawSignedLine("วันที่", x, w, dateY + dateH - 1.0, signerDate(role));
  };

  const signaturePanelW = (tableW - signatureGap * 3) / 4;
  const signatureRoles: Array<{ role: FinalSignedRole; title: string }> = [
    { role: "Agent", title: "Agent ผู้ถูกประเมิน" },
    { role: "Senior", title: "Senior หัวหน้าทีมผู้ถูกประเมิน" },
    { role: "Supervisor", title: "Supervisor หัวหน้าแผนก" },
    { role: "QA", title: "QA ผู้ตรวจสอบ" },
  ];
  signatureRoles.forEach((item, index) => {
    const panelX = left + index * (signaturePanelW + signatureGap);
    drawSignaturePanel(panelX, y, signaturePanelW, item.role, item.title);
  });

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
