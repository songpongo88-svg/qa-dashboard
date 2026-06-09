import { jsPDF } from "jspdf";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";

type PdfVariant = "original" | "appeal";

type GenerateOfficialCaseDetailPdfInput = {
  caseItem: any;
  currentUser?: any;
  pdfVariant?: PdfVariant;
};

type GeneratedOfficialPdf = {
  blob: Blob;
  fileName: string;
  title: string;
  fileSuffix: string;
};

const PURPLE: [number, number, number] = [112, 48, 160];
const DARK_PURPLE: [number, number, number] = [86, 24, 137];
const LIGHT_PURPLE: [number, number, number] = [204, 192, 218];
const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];
const GRID: [number, number, number] = [185, 185, 185];
const SCORE_GREY: [number, number, number] = [244, 245, 247];
const GREEN: [number, number, number] = [226, 246, 234];
const YELLOW: [number, number, number] = [255, 242, 204];
const RED: [number, number, number] = [252, 226, 226];

type TextOptions = {
  bold?: boolean;
  size?: number;
  color?: [number, number, number];
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "auto";
  maxLines?: number;
  leading?: number;
};

function safeText(value: unknown, fallback = "-") {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function safeMultiline(value: unknown, fallback = "-") {
  const text = String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return text || fallback;
}

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function scoreGrade(score: number) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function statusByPct(pct: number) {
  if (pct >= 90) return "Excellent";
  if (pct >= 80) return "Good";
  if (pct >= 60) return "Fair";
  return "Need Improvement";
}

function pctFill(pct: number): [number, number, number] {
  if (pct >= 90) return GREEN;
  if (pct >= 60) return YELLOW;
  return RED;
}

function normalizePct(value: unknown, score: number, max: number) {
  const raw = num(value, max ? (score / max) * 100 : 0);
  if (raw > 0 && raw <= 1) return raw * 100;
  return raw;
}

function formatPct(pct: number) {
  return `${pct.toFixed(1)}%`;
}

function originalScore(caseItem: any) {
  if (typeof caseItem.previousScore === "number") return num(caseItem.previousScore);
  return Math.round((caseItem.topics || []).reduce((sum: number, topic: any) => sum + num(topic.score), 0) * 100) / 100;
}

function topicAppealReason(topic: any, revised: any, isRevised: boolean) {
  return safeMultiline(
    revised?.appealReason ||
      revised?.reason ||
      revised?.appealComment ||
      topic?.appealReason ||
      topic?.reason ||
      (isRevised ? "Revised" : "\u0e44\u0e21\u0e48\u0e2d\u0e38\u0e17\u0e18\u0e23\u0e13\u0e4c\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d\u0e19\u0e35\u0e49"),
    "-"
  );
}

export async function generateOfficialCaseDetailPdf({
  caseItem,
  currentUser,
  pdfVariant = "original",
}: GenerateOfficialCaseDetailPdfInput): Promise<GeneratedOfficialPdf> {
  void currentUser;

  const includeAppeal = pdfVariant === "appeal" && caseItem.reviewStatus === "Revised";
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  registerTHSarabunNew(doc as any);

  const setFont = (style: "normal" | "bold" = "normal") => {
    try {
      doc.setFont("THSarabunNew", style);
    } catch {
      doc.setFont("helvetica", style);
    }
  };

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 7.5;
  const top = 7;
  const bottom = pageH - 9;
  const fullW = pageW - left * 2;

  const topWidths = [15, 38, 15, 24, 15, 24, 25, 39];
  const topicWidthsOriginal = [15, 38, 15, 18, 17, 20, 72];
  const topicWidthsAppeal = [14, 38, 14, 17, 16, 18, 52, 26];
  let widths = topWidths;
  let y = top;

  const setWidths = (next: number[]) => {
    widths = next;
  };

  const xOf = (i: number) => left + widths.slice(0, i).reduce((a, b) => a + b, 0);
  const wOf = (i: number, span = 1) => widths.slice(i, i + span).reduce((a, b) => a + b, 0);

  const fill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

  const rect = (x: number, yy: number, w: number, h: number, bg: [number, number, number], border = GRID) => {
    fill(bg);
    stroke(border);
    doc.setLineWidth(0.16);
    doc.rect(x, yy, w, h, "FD");
  };

  const writeText = (value: unknown, x: number, yy: number, w: number, h: number, opts: TextOptions = {}) => {
    setFont(opts.bold ? "bold" : "normal");
    const size = opts.size ?? 7.2;
    const leading = opts.leading ?? 0.32;
    doc.setFontSize(size);
    const color = opts.color ?? BLACK;
    doc.setTextColor(color[0], color[1], color[2]);

    const lines = doc.splitTextToSize(safeMultiline(value), Math.max(2, w - 2.4));
    const shown = opts.maxLines ? lines.slice(0, opts.maxLines) : lines;
    const lineH = size * leading;
    const blockH = shown.length * lineH;
    const autoMiddle = opts.valign === "middle" || (opts.valign === "auto" && shown.length <= 2 && h >= 14);
    const startY = autoMiddle ? yy + Math.max(2.2, (h - blockH) / 2 + lineH * 0.78) : yy + 3.8;

    shown.forEach((line: string, index: number) => {
      const align = opts.align || "left";
      const tx = align === "center" ? x + w / 2 : align === "right" ? x + w - 1.2 : x + 1.2;
      doc.text(line, tx, startY + index * lineH, { align });
    });
  };

  const cell = (col: number, yy: number, span: number, h: number, value: unknown, bg: [number, number, number], opts: TextOptions = {}) => {
    const x = xOf(col);
    const w = wOf(col, span);
    rect(x, yy, w, h, bg);
    writeText(value, x, yy, w, h, opts);
  };

  const label = (col: number, yy: number, span: number, h: number, value: string) => {
    cell(col, yy, span, h, value, PURPLE, {
      bold: true,
      size: 6.8,
      color: WHITE,
      align: "center",
      valign: "middle",
      maxLines: 3,
    });
  };

  const value = (col: number, yy: number, span: number, h: number, val: unknown, bg = LIGHT_PURPLE, opts: TextOptions = {}) => {
    cell(col, yy, span, h, val, bg, {
      bold: opts.bold ?? true,
      size: opts.size ?? 7.2,
      valign: opts.valign ?? "auto",
      align: opts.align ?? "left",
      maxLines: opts.maxLines ?? Math.max(1, Math.floor((h - 3) / 2.4)),
      leading: opts.leading ?? 0.32,
    });
  };

  const purpleRow = (yy: number, h: number, title: string, size = 7.4) => {
    rect(left, yy, fullW, h, DARK_PURPLE, DARK_PURPLE);
    writeText(title, left, yy, fullW, h, {
      bold: true,
      size,
      color: WHITE,
      valign: "middle",
      maxLines: 1,
    });
  };


  const lineHeight = (size: number, leading = 0.34) => size * leading;

  const measureTextLines = (value: unknown, w: number, size = 7, pad = 2.6) => {
    setFont("normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(safeMultiline(value), Math.max(2, w - pad));
  };

  const measureTextHeight = (value: unknown, w: number, size = 7, leading = 0.34, padY = 5) => {
    const lines = measureTextLines(value, w, size);
    return Math.max(0, lines.length * lineHeight(size, leading) + padY);
  };

  const fitLinesForHeight = (h: number, size = 7, leading = 0.34, padY = 4) => {
    return Math.max(1, Math.floor((h - padY) / lineHeight(size, leading)));
  };

  const normalizeUrlForPdf = (value: unknown) => {
    const raw = safeText(value, "-");
    if (raw === "-") return raw;
    const compact = raw.length > 170 ? `${raw.slice(0, 112)} ... ${raw.slice(-42)}` : raw;
    return compact.replace(/([/?&=._#%-])/g, "$1 ").replace(/\s+/g, " ").trim();
  };

  const addPageIfNeeded = (neededHeight: number) => {
    if (y + neededHeight > bottom) {
      doc.addPage();
      y = top;
    }
  };

  const reportScore = includeAppeal ? num(caseItem.finalScore) : originalScore(caseItem);
  const grade = safeText(caseItem.grade || scoreGrade(reportScore));
  const safeCaseId = safeText(caseItem.caseId, "case-detail").replace(/[^a-zA-Z0-9_-]+/g, "_");
  const fileSuffix = includeAppeal ? "case_detail_appeal" : "original_pdf";
  const title = includeAppeal ? `${caseItem.caseId} Appeal PDF` : `${caseItem.caseId} Original PDF`;

  const drawOriginalTop = () => {
    setWidths(topWidths);
    purpleRow(y, 6, "Case Detail");
    y += 6;
    purpleRow(y, 6, "Select Case ID directly in Control_Panel. This page now shows the original evaluated case by Selected Case ID.", 5.8);
    y += 10;
    purpleRow(y, 5, "Current Selection");
    y += 8;

    label(0, y, 1, 12, "Agent");
    value(1, y, 2, 12, caseItem.agent, LIGHT_PURPLE, { align: "center", maxLines: 2, size: 6.8 });
    label(3, y, 1, 12, "Month");
    value(4, y, 1, 12, caseItem.monthLabel || caseItem.monthKey, LIGHT_PURPLE, { align: "center", maxLines: 1, size: 6.8 });
    label(5, y, 1, 12, "Case ID");
    value(6, y, 2, 12, caseItem.caseId, LIGHT_PURPLE, { align: "center", maxLines: 1, size: 7.4 });
    y += 12;

    label(0, y, 1, 14, "Audit Date");
    value(1, y, 1, 14, caseItem.auditTimestamp || caseItem.auditDate, LIGHT_PURPLE, { align: "center", maxLines: 2, size: 6.4 });
    label(2, y, 1, 14, "Case ID");
    value(3, y, 1, 14, caseItem.caseId, LIGHT_PURPLE, { align: "center", maxLines: 1, size: 7.2 });
    label(4, y, 1, 14, "Final Score");
    value(5, y, 1, 14, reportScore.toFixed(2), LIGHT_PURPLE, { align: "center", size: 8.2, maxLines: 1 });
    label(6, y, 1, 14, "Case Grade");
    value(7, y, 1, 14, grade, LIGHT_PURPLE, { align: "center", size: 8.2, maxLines: 1 });
    y += 14;

    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";
    const inquiryRowH = Math.max(16, Math.min(28, measureTextHeight(inquiryText, wOf(3, 5), 6.5, 0.34, 6)));
    addPageIfNeeded(inquiryRowH);
    label(0, y, 1, inquiryRowH, "Critical Error");
    value(1, y, 1, inquiryRowH, "NO", LIGHT_PURPLE, { align: "center", maxLines: 1, size: 6.6 });
    label(2, y, 1, inquiryRowH, "Customer\nInquiry");
    value(3, y, 5, inquiryRowH, inquiryText, LIGHT_PURPLE, {
      align: "left",
      size: 6.5,
      valign: "middle",
      maxLines: fitLinesForHeight(inquiryRowH, 6.5, 0.34, 5),
      leading: 0.34,
      bold: false,
    });
    y += inquiryRowH;

    const caseUrlText = normalizeUrlForPdf(caseItem.caseUrl || "-");
    const caseUrlRowH = Math.max(9, Math.min(16, measureTextHeight(caseUrlText, wOf(1, 7), 5.1, 0.33, 5)));
    addPageIfNeeded(caseUrlRowH);
    label(0, y, 1, caseUrlRowH, "Case URL");
    value(1, y, 7, caseUrlRowH, caseUrlText, LIGHT_PURPLE, {
      size: 5.1,
      valign: "middle",
      maxLines: fitLinesForHeight(caseUrlRowH, 5.1, 0.33, 5),
      leading: 0.33,
      bold: false,
    });
    y += caseUrlRowH;

    const descriptionText = caseItem.caseDescription || "-";
    const descriptionRowH = Math.max(24, Math.min(52, measureTextHeight(descriptionText, wOf(1, 7), 6.6, 0.34, 7)));
    addPageIfNeeded(descriptionRowH);
    label(0, y, 1, descriptionRowH, "Case\nDescription");
    value(1, y, 7, descriptionRowH, descriptionText, LIGHT_PURPLE, {
      size: 6.6,
      valign: "middle",
      maxLines: fitLinesForHeight(descriptionRowH, 6.6, 0.34, 6),
      leading: 0.34,
      bold: false,
    });
    y += descriptionRowH;

    const imageUrlText = normalizeUrlForPdf(caseItem.caseImageUrl || "-");
    const imageUrlRowH = Math.max(9, Math.min(15, measureTextHeight(imageUrlText, wOf(1, 7), 5.1, 0.33, 5)));
    addPageIfNeeded(imageUrlRowH);
    label(0, y, 1, imageUrlRowH, "Case Image\nURL");
    value(1, y, 7, imageUrlRowH, imageUrlText, LIGHT_PURPLE, {
      size: 5.1,
      valign: "middle",
      maxLines: fitLinesForHeight(imageUrlRowH, 5.1, 0.33, 5),
      leading: 0.33,
      bold: false,
    });
    y += imageUrlRowH + 3;
  };

  const drawAppealTop = () => {
    setWidths(topWidths);
    purpleRow(y, 6, "Case Detail - Appeal / Revised");
    y += 6;
    purpleRow(
      y,
      6,
      "This sheet matches Appeal_Data by Selected Case ID + Appeal Version. Keep original values untouched and use revised values when present.",
      5.5
    );
    y += 10;
    purpleRow(y, 5, "Current Selection");
    y += 8;

    label(0, y, 1, 13, "Agent");
    value(1, y, 2, 13, caseItem.agent, LIGHT_PURPLE, { align: "center", maxLines: 2 });
    label(3, y, 1, 13, "Month");
    value(4, y, 1, 13, caseItem.monthLabel || caseItem.monthKey, LIGHT_PURPLE, { align: "center", maxLines: 2 });
    label(5, y, 1, 13, "Appeal Ver.");
    value(6, y, 2, 13, caseItem.appealVersion || "REV1", LIGHT_PURPLE, { align: "center", maxLines: 2 });
    y += 13;

    label(0, y, 1, 15, "Audit Date");
    value(1, y, 1, 15, caseItem.auditTimestamp || caseItem.auditDate, LIGHT_PURPLE, { align: "center", maxLines: 3 });
    label(2, y, 1, 15, "Case ID");
    value(3, y, 1, 15, caseItem.caseId, LIGHT_PURPLE, { align: "center", maxLines: 2 });
    label(4, y, 1, 15, "Final Score");
    value(5, y, 1, 15, reportScore.toFixed(2), LIGHT_PURPLE, { align: "center", size: 8.4, maxLines: 1 });
    label(6, y, 1, 15, "Case Grade");
    value(7, y, 1, 15, grade, LIGHT_PURPLE, { align: "center", size: 8.4, maxLines: 1 });
    y += 15;

    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";
    const inquiryRowH = Math.max(18, Math.min(32, measureTextHeight(inquiryText, wOf(3, 5), 6.8, 0.34, 6)));
    addPageIfNeeded(inquiryRowH);
    label(0, y, 1, inquiryRowH, "Critical Error");
    value(1, y, 1, inquiryRowH, "NO", LIGHT_PURPLE, { align: "center", maxLines: 2 });
    label(2, y, 1, inquiryRowH, "Customer\nInquiry");
    value(3, y, 5, inquiryRowH, inquiryText, LIGHT_PURPLE, {
      align: "left",
      size: 6.8,
      valign: "top",
      maxLines: fitLinesForHeight(inquiryRowH, 6.8, 0.34, 5),
      leading: 0.34,
    });
    y += inquiryRowH;

    const caseUrlText = normalizeUrlForPdf(caseItem.caseUrl || "-");
    const caseUrlRowH = Math.max(10, Math.min(24, measureTextHeight(caseUrlText, wOf(1, 7), 5.4, 0.34, 5)));
    addPageIfNeeded(caseUrlRowH);
    label(0, y, 1, caseUrlRowH, "Case URL");
    value(1, y, 7, caseUrlRowH, caseUrlText, LIGHT_PURPLE, {
      size: 5.4,
      valign: "top",
      maxLines: fitLinesForHeight(caseUrlRowH, 5.4, 0.34, 5),
      leading: 0.34,
    });
    y += caseUrlRowH;

    label(0, y, 1, 8, "Appeal Status");
    value(1, y, 1, 8, caseItem.appealStatus || "Approved", LIGHT_PURPLE, { align: "center", maxLines: 1 });
    label(2, y, 1, 8, "Comment Status");
    value(3, y, 1, 8, caseItem.commentStatus || "Approved", LIGHT_PURPLE, { align: "center", maxLines: 1 });
    label(4, y, 1, 8, "Review Type");
    value(5, y, 3, 8, "Revised", LIGHT_PURPLE, { align: "center", maxLines: 1 });
    y += 8;

    const remarkText = caseItem.remark || "Rewrite / score unchanged";
    const remarkRowH = Math.max(20, Math.min(46, measureTextHeight(remarkText, wOf(1, 7), 7, 0.34, 7)));
    addPageIfNeeded(remarkRowH);
    label(0, y, 1, remarkRowH, "Remark");
    value(1, y, 7, remarkRowH, remarkText, LIGHT_PURPLE, {
      size: 7,
      valign: "top",
      maxLines: fitLinesForHeight(remarkRowH, 7, 0.34, 6),
      leading: 0.34,
    });
    y += remarkRowH;

    const descriptionText = caseItem.caseDescription || "Revised";
    const descriptionRowH = Math.max(24, Math.min(58, measureTextHeight(descriptionText, wOf(1, 7), 7, 0.34, 8)));
    addPageIfNeeded(descriptionRowH);
    label(0, y, 1, descriptionRowH, "Case\nDescription");
    value(1, y, 7, descriptionRowH, descriptionText, LIGHT_PURPLE, {
      size: 7,
      valign: "top",
      maxLines: fitLinesForHeight(descriptionRowH, 7, 0.34, 6),
      leading: 0.34,
    });
    y += descriptionRowH;

    const imageUrlText = normalizeUrlForPdf(caseItem.caseImageUrl || safeText(caseItem.appealVersion, "REV1"));
    const imageUrlRowH = Math.max(8, Math.min(18, measureTextHeight(imageUrlText, wOf(1, 7), 6.2, 0.34, 5)));
    addPageIfNeeded(imageUrlRowH);
    label(0, y, 1, imageUrlRowH, "Case Image\nURL");
    value(1, y, 7, imageUrlRowH, imageUrlText, LIGHT_PURPLE, {
      size: 6.2,
      valign: "top",
      maxLines: fitLinesForHeight(imageUrlRowH, 6.2, 0.34, 5),
      leading: 0.34,
    });
    y += imageUrlRowH + 3;
  };

  const drawTopicTitle = () => {
    purpleRow(y, 6, "Detailed Topic Scores");
    y += 8;
  };

  const drawTopicHeader = () => {
    setWidths(includeAppeal ? topicWidthsAppeal : topicWidthsOriginal);
    label(0, y, 1, 8, "Topic");
    label(1, y, 1, 8, "Description");
    label(2, y, 1, 8, "Score");
    label(3, y, 1, 8, "Max");
    label(4, y, 1, 8, "Score %");
    label(5, y, 1, 8, "Status");
    if (includeAppeal) {
      label(6, y, 1, 8, "Evaluation Comment");
      label(7, y, 1, 8, "Appeal Reason");
    } else {
      label(6, y, 1, 8, "Evaluation Comment");
    }
    y += 8;
  };

  const newTopicPage = () => {
    doc.addPage();
    y = top;
    drawTopicTitle();
    drawTopicHeader();
  };

  if (includeAppeal) drawAppealTop();
  else drawOriginalTop();

  drawTopicTitle();
  drawTopicHeader();

  const revisedMap = new Map((caseItem.revisedTopics || []).map((topic: any) => [topic.code, topic]));
  const revisedCodes = new Set(caseItem.displayRevisedTopicCodes || []);
  const topics = (caseItem.topics || []).filter((topic: any) => num(topic.max) > 0);

  topics.forEach((topic: any) => {
    const revised = revisedMap.get(topic.code) as any;
    const isRevised = Boolean(includeAppeal && revised && revisedCodes.has(topic.code));
    const active = isRevised ? revised : topic;
    const score = num(active.score, num(topic.score));
    const max = num(active.max, num(topic.max));
    const pct = normalizePct(active.pct, score, max);
    const description = safeText(active.label || topic.label);
    const comment = safeMultiline(active.comment || topic.comment || "-");
    const appealReason = topicAppealReason(topic, revised, isRevised);

    const commentW = wOf(6) - 2.4;
    const appealW = includeAppeal ? wOf(7) - 2.4 : 0;
    const descriptionLines = doc.splitTextToSize(description, Math.max(2, wOf(1) - 2.4));
    const commentLines = doc.splitTextToSize(comment, Math.max(2, commentW));
    const appealLines = includeAppeal ? doc.splitTextToSize(appealReason, Math.max(2, appealW)) : [];
    const baseRowH = includeAppeal ? 42 : 34;
    const neededH = Math.max(
      baseRowH,
      8 + descriptionLines.length * 2.25,
      8 + commentLines.length * 2.18,
      includeAppeal ? 8 + appealLines.length * 2.18 : 0
    );
    let rowH = Math.min(neededH, bottom - top - 22);

    if (y + rowH > bottom) newTopicPage();
    if (y + rowH > bottom) rowH = Math.max(34, bottom - y);

    const maxBodyLines = Math.max(2, Math.floor((rowH - 4) / 2.15));
    const shortDescription = descriptionLines.length <= 2;
    const shortComment = commentLines.length <= 2;
    const shortAppeal = appealLines.length <= 2;

    cell(0, y, 1, rowH, active.code || topic.code || "-", WHITE, {
      bold: true,
      size: 6.8,
      align: "center",
      valign: "middle",
      maxLines: 2,
    });
    cell(1, y, 1, rowH, description, WHITE, {
      size: 6.7,
      align: "center",
      valign: shortDescription ? "middle" : "top",
      maxLines: Math.max(2, Math.floor((rowH - 4) / 2.3)),
    });
    cell(2, y, 1, rowH, score.toFixed(0), WHITE, { size: 6.8, align: "center", valign: "middle" });
    cell(3, y, 1, rowH, max.toFixed(0), SCORE_GREY, { size: 6.8, align: "center", valign: "middle" });
    cell(4, y, 1, rowH, formatPct(pct), pctFill(pct), { size: 6.8, align: "center", valign: "middle" });
    cell(5, y, 1, rowH, statusByPct(pct), WHITE, { size: 6.4, align: "center", valign: "middle", maxLines: 2 });

    if (includeAppeal) {
      cell(6, y, 1, rowH, comment, WHITE, {
        size: commentLines.length > 18 ? 5.3 : 5.8,
        align: "left",
        valign: "middle",
        maxLines: maxBodyLines,
        leading: 0.34,
      });
      cell(7, y, 1, rowH, appealReason, WHITE, {
        size: appealLines.length > 18 ? 5.1 : 5.7,
        align: "left",
        valign: shortAppeal ? "middle" : "top",
        maxLines: maxBodyLines,
        leading: 0.34,
      });
    } else {
      cell(6, y, 1, rowH, comment, WHITE, {
        size: commentLines.length > 18 ? 5.4 : 6.05,
        align: "left",
        valign: "middle",
        maxLines: maxBodyLines,
        leading: 0.34,
      });
    }

    y += rowH;
  });

  return {
    blob: doc.output("blob"),
    fileName: includeAppeal ? `${safeCaseId}_case_detail_appeal_report.pdf` : `${safeCaseId}_Original_QA_Report.pdf`,
    title,
    fileSuffix,
  };
}
