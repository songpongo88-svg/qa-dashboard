import { jsPDF } from "jspdf";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { richTextToPlainText } from "./richText";

type AppealSummaryTopic = {
  code: string;
  label: string;
  max: number;
  originalScore: number;
  finalScore: number;
  originalComment?: string;
  appealReason?: string;
  reviewComment?: string;
};

export type GenerateAppealSummaryPdfInput = {
  caseId: string;
  agent: string;
  monthLabel: string;
  caseDate: string;
  inquiry?: string;
  appealSubmitDateTime?: string;
  appealResultDateTime?: string;
  appealDecision: "Approved" | "Rejected";
  appealRound: number;
  reviewSummary?: string;
  previousScore: number;
  finalScore: number;
  originalGrade: string;
  finalGrade: string;
  appealedTopics: AppealSummaryTopic[];
};

type GeneratedAppealSummaryPdf = {
  blob: Blob;
  fileName: string;
};

const PURPLE: [number, number, number] = [91, 33, 145];
const LIGHT_PURPLE: [number, number, number] = [247, 244, 252];
const BORDER: [number, number, number] = [220, 214, 230];
const TEXT: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const WHITE: [number, number, number] = [255, 255, 255];
const GREEN_BG: [number, number, number] = [236, 253, 245];
const GREEN_TEXT: [number, number, number] = [4, 120, 87];
const RED_BG: [number, number, number] = [255, 241, 242];
const RED_TEXT: [number, number, number] = [190, 24, 93];
const BLUE_BG: [number, number, number] = [239, 246, 255];
const BLUE_TEXT: [number, number, number] = [3, 105, 161];

function plain(value: unknown, fallback = "-") {
  const text = richTextToPlainText(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return text || fallback;
}

function safeFilePart(value: unknown) {
  return plain(value, "Appeal")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, "_")
    .replace(/[. ]+$/g, "") || "Appeal";
}

function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function signed(value: number) {
  if (value > 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2);
}

export async function generateAppealSummaryPdf(input: GenerateAppealSummaryPdfInput): Promise<GeneratedAppealSummaryPdf> {
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
  const margin = 12;
  const contentW = pageW - margin * 2;
  const bottom = pageH - 13;
  let y = 12;

  const createSegmenter = (granularity: "word" | "grapheme") => {
    try {
      return typeof Intl.Segmenter === "function" ? new Intl.Segmenter("th", { granularity }) : null;
    } catch {
      return null;
    }
  };
  const wordSegmenter = createSegmenter("word");
  const graphemeSegmenter = createSegmenter("grapheme");

  const setTextColor = (rgb: [number, number, number]) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  const setFillColor = (rgb: [number, number, number]) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const setDrawColor = (rgb: [number, number, number]) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);

  const splitLongToken = (token: string, maxWidth: number) => {
    const graphemes = graphemeSegmenter
      ? Array.from(graphemeSegmenter.segment(token), (item) => item.segment)
      : Array.from(token);
    const chunks: string[] = [];
    let current = "";
    graphemes.forEach((grapheme) => {
      const candidate = current + grapheme;
      if (current && doc.getTextWidth(candidate) > maxWidth) {
        chunks.push(current);
        current = grapheme;
      } else {
        current = candidate;
      }
    });
    if (current) chunks.push(current);
    return chunks.length ? chunks : [token];
  };

  const wrapParagraph = (paragraph: string, maxWidth: number) => {
    if (!paragraph) return [""];
    const segments = wordSegmenter
      ? Array.from(wordSegmenter.segment(paragraph), (item) => item.segment)
      : paragraph.split(/(\s+)/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    const pushCurrent = () => {
      const clean = current.replace(/[ \t]+$/g, "");
      if (clean) lines.push(clean);
      current = "";
    };
    segments.forEach((segment) => {
      if (/^\s+$/.test(segment)) {
        if (current && !current.endsWith(" ")) current += " ";
        return;
      }
      const candidate = current + segment;
      if (!current || doc.getTextWidth(candidate) <= maxWidth) {
        current = candidate;
        return;
      }
      pushCurrent();
      if (doc.getTextWidth(segment) <= maxWidth) {
        current = segment;
        return;
      }
      const chunks = splitLongToken(segment, maxWidth);
      chunks.slice(0, -1).forEach((chunk) => lines.push(chunk));
      current = chunks[chunks.length - 1] || "";
    });
    pushCurrent();
    return lines.length ? lines : [""];
  };

  const wrapText = (value: unknown, maxWidth: number) => {
    return plain(value)
      .split("\n")
      .flatMap((paragraph) => wrapParagraph(paragraph, Math.max(4, maxWidth)));
  };

  const roundedBox = (
    x: number,
    yy: number,
    w: number,
    h: number,
    fillColor: [number, number, number] = WHITE,
    borderColor: [number, number, number] = BORDER,
    radius = 3
  ) => {
    setFillColor(fillColor);
    setDrawColor(borderColor);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, yy, w, h, radius, radius, "FD");
  };

  const drawFooter = () => {
    const pageNo = doc.getNumberOfPages();
    setFont("normal");
    doc.setFontSize(7);
    setTextColor(MUTED);
    doc.text(`Appeal Summary - ${input.caseId}`, margin, pageH - 7);
    doc.text(`Page ${pageNo}`, pageW - margin, pageH - 7, { align: "right" });
  };

  const newPage = () => {
    drawFooter();
    doc.addPage();
    y = 12;
  };

  const ensureSpace = (height: number) => {
    if (y + height > bottom) newPage();
  };

  const drawLabelValue = (x: number, yy: number, w: number, label: string, value: unknown) => {
    setFont("normal");
    doc.setFontSize(7.2);
    setTextColor(MUTED);
    doc.text(label, x, yy);
    setFont("bold");
    doc.setFontSize(9.2);
    setTextColor(TEXT);
    const lines = wrapText(value, w);
    lines.slice(0, 2).forEach((line, index) => doc.text(line, x, yy + 4.5 + index * 4));
  };

  // Header
  setFillColor(PURPLE);
  doc.roundedRect(margin, y, contentW, 22, 4, 4, "F");
  setFont("bold");
  doc.setFontSize(17);
  setTextColor(WHITE);
  doc.text("QA Appeal Summary Report", margin + 6, y + 8.5);
  setFont("normal");
  doc.setFontSize(8.5);
  doc.text("สรุปผลการอุทธรณ์ - แสดงเฉพาะหัวข้อที่ยื่นอุทธรณ์", margin + 6, y + 15.5);
  y += 27;

  // Case / appeal information
  roundedBox(margin, y, contentW, 47, LIGHT_PURPLE);
  const colW = (contentW - 16) / 2;
  const leftX = margin + 5;
  const rightX = margin + 9 + colW;
  drawLabelValue(leftX, y + 7, colW - 4, "Case ID", input.caseId);
  drawLabelValue(rightX, y + 7, colW - 4, "Agent", input.agent);
  drawLabelValue(leftX, y + 18, colW - 4, "Case Date", input.caseDate);
  drawLabelValue(rightX, y + 18, colW - 4, "Month / Period", input.monthLabel);
  drawLabelValue(leftX, y + 29, colW - 4, "Appeal Submit", input.appealSubmitDateTime || "-");
  drawLabelValue(rightX, y + 29, colW - 4, "Appeal Result", input.appealResultDateTime || "-");
  drawLabelValue(leftX, y + 40, colW - 4, "Decision", input.appealDecision);
  drawLabelValue(rightX, y + 40, colW - 4, "Appeal Round", String(input.appealRound || 1));
  y += 52;

  // Inquiry
  const inquiryLines = wrapText(input.inquiry || "-", contentW - 10);
  const inquiryH = Math.max(16, 10 + inquiryLines.length * 4.2);
  roundedBox(margin, y, contentW, inquiryH, WHITE);
  setFont("bold");
  doc.setFontSize(7.4);
  setTextColor(MUTED);
  doc.text("Customer Inquiry", margin + 5, y + 6);
  setFont("normal");
  doc.setFontSize(9);
  setTextColor(TEXT);
  inquiryLines.forEach((line, index) => doc.text(line, margin + 5, y + 11 + index * 4.2));
  y += inquiryH + 5;

  // Overall score flow
  const gap = 4;
  const cardW = (contentW - gap * 2) / 3;
  const scoreChange = safeNumber(input.finalScore) - safeNumber(input.previousScore);
  const scoreCards = [
    { label: "Original Score", value: safeNumber(input.previousScore).toFixed(2), sub: `Grade ${input.originalGrade}`, bg: WHITE, text: TEXT },
    { label: "Score Change", value: signed(scoreChange), sub: `${input.originalGrade} -> ${input.finalGrade}`, bg: BLUE_BG, text: scoreChange >= 0 ? GREEN_TEXT : RED_TEXT },
    { label: "Final Score", value: safeNumber(input.finalScore).toFixed(2), sub: `Grade ${input.finalGrade}`, bg: safeNumber(input.finalScore) >= 85 ? GREEN_BG : RED_BG, text: safeNumber(input.finalScore) >= 85 ? GREEN_TEXT : RED_TEXT },
  ];
  scoreCards.forEach((card, index) => {
    const x = margin + index * (cardW + gap);
    roundedBox(x, y, cardW, 26, card.bg);
    setFont("bold");
    doc.setFontSize(7);
    setTextColor(MUTED);
    doc.text(card.label, x + cardW / 2, y + 6, { align: "center" });
    doc.setFontSize(15);
    setTextColor(card.text);
    doc.text(card.value, x + cardW / 2, y + 14, { align: "center" });
    doc.setFontSize(8);
    doc.text(card.sub, x + cardW / 2, y + 21, { align: "center" });
  });
  y += 31;

  // Review summary
  const reviewLines = wrapText(input.reviewSummary || "-", contentW - 10);
  const reviewH = Math.max(18, 11 + reviewLines.length * 4.2);
  roundedBox(margin, y, contentW, reviewH, LIGHT_PURPLE);
  setFont("bold");
  doc.setFontSize(7.4);
  setTextColor(PURPLE);
  doc.text("Appeal Review Summary", margin + 5, y + 6);
  setFont("normal");
  doc.setFontSize(9);
  setTextColor(TEXT);
  reviewLines.forEach((line, index) => doc.text(line, margin + 5, y + 11 + index * 4.2));
  y += reviewH + 7;

  // Appealed topics only
  setFont("bold");
  doc.setFontSize(12);
  setTextColor(PURPLE);
  doc.text(`Appealed Topics (${input.appealedTopics.length})`, margin, y);
  y += 5;

  if (!input.appealedTopics.length) {
    roundedBox(margin, y, contentW, 18, WHITE);
    setFont("normal");
    doc.setFontSize(9);
    setTextColor(MUTED);
    doc.text("ไม่พบหัวข้อที่ยื่นอุทธรณ์", margin + 5, y + 10);
    y += 22;
  }

  input.appealedTopics.forEach((topic, index) => {
    const topicLabel = `${topic.code} ${plain(topic.label)}`;
    const appealReasonLines = wrapText(topic.appealReason || "-", contentW - 16);
    const originalCommentLines = wrapText(topic.originalComment || "-", contentW - 16);
    const reviewLabel = input.appealDecision === "Rejected" ? "Reject Reason" : "Revised Comment";
    const reviewCommentLines = wrapText(topic.reviewComment || "-", contentW - 16);

    const blockH =
      20 +
      (8 + appealReasonLines.length * 4) +
      (8 + originalCommentLines.length * 4) +
      (8 + reviewCommentLines.length * 4) +
      8;

    ensureSpace(Math.min(blockH, bottom - 12));

    roundedBox(margin, y, contentW, blockH, WHITE);
    setFont("bold");
    doc.setFontSize(10.5);
    setTextColor(TEXT);
    doc.text(`${index + 1}. ${topicLabel}`, margin + 5, y + 7);

    const badgeText = input.appealDecision;
    const badgeBg = input.appealDecision === "Approved" ? GREEN_BG : RED_BG;
    const badgeTextColor = input.appealDecision === "Approved" ? GREEN_TEXT : RED_TEXT;
    setFillColor(badgeBg);
    doc.roundedRect(pageW - margin - 28, y + 3, 23, 7, 3, 3, "F");
    setFont("bold");
    doc.setFontSize(7.3);
    setTextColor(badgeTextColor);
    doc.text(badgeText, pageW - margin - 16.5, y + 7.8, { align: "center" });

    setFont("bold");
    doc.setFontSize(8.2);
    setTextColor(PURPLE);
    const originalTopicScore = safeNumber(topic.originalScore);
    const finalTopicScore = input.appealDecision === "Rejected" ? originalTopicScore : safeNumber(topic.finalScore);
    doc.text(
      `Score: ${originalTopicScore.toFixed(2)}/${safeNumber(topic.max).toFixed(0)} -> ${finalTopicScore.toFixed(2)}/${safeNumber(topic.max).toFixed(0)}`,
      margin + 5,
      y + 14
    );

    let bodyY = y + 20;
    const drawTextSection = (
      label: string,
      lines: string[],
      labelColor: [number, number, number]
    ) => {
      setFont("bold");
      doc.setFontSize(7.4);
      setTextColor(labelColor);
      doc.text(label, margin + 6, bodyY);
      bodyY += 4;
      setFont("normal");
      doc.setFontSize(8.5);
      setTextColor(TEXT);
      lines.forEach((line) => {
        doc.text(line, margin + 6, bodyY);
        bodyY += 4;
      });
      bodyY += 4;
    };

    drawTextSection("Appeal Reason", appealReasonLines, PURPLE);
    drawTextSection("Original Comment", originalCommentLines, MUTED);
    drawTextSection(reviewLabel, reviewCommentLines, input.appealDecision === "Rejected" ? RED_TEXT : BLUE_TEXT);

    y += blockH + 5;
  });

  drawFooter();

  return {
    blob: doc.output("blob"),
    fileName: `${safeFilePart(input.caseId)}_Appeal_Report.pdf`,
  };
}
