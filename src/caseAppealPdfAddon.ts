import { jsPDF } from "jspdf";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { scoreToGrade } from "./lib/scoreIncentivePolicy";
import { richTextToPlainText } from "./richText";

type PdfVariant = "original" | "appeal";

type PdfResult = {
  blob: Blob;
  fileName: string;
  title: string;
  fileSuffix: string;
};

type PdfGenerator = (input: {
  caseItem: any;
  currentUser?: any;
  pdfVariant?: PdfVariant;
}) => Promise<PdfResult>;

type GenerateAppealAwarePdfInput = {
  caseItem: any;
  currentUser?: any;
  pdfVariant?: PdfVariant;
  fallback: PdfGenerator;
};

const KPI_TARGET = 85;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 12;
const TOP = 12;
const BOTTOM = 286;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const PURPLE: [number, number, number] = [91, 33, 139];
const VIOLET: [number, number, number] = [124, 58, 237];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const BORDER: [number, number, number] = [203, 213, 225];
const WHITE: [number, number, number] = [255, 255, 255];
const SLATE_BG: [number, number, number] = [248, 250, 252];
const VIOLET_BG: [number, number, number] = [245, 243, 255];
const GREEN: [number, number, number] = [4, 120, 87];
const GREEN_BG: [number, number, number] = [236, 253, 245];
const ROSE: [number, number, number] = [190, 18, 60];
const ROSE_BG: [number, number, number] = [255, 241, 242];
const AMBER: [number, number, number] = [180, 83, 9];
const AMBER_BG: [number, number, number] = [255, 251, 235];

function plain(value: unknown, fallback = "-") {
  const text = richTextToPlainText(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  return text || fallback;
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeFilePart(value: unknown) {
  return plain(value, "case")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/g, "_")
    .replace(/[. ]+$/g, "") || "case";
}

function topicTotal(topics: any[]) {
  return Math.round(
    topics.reduce((total, topic) => total + numeric(topic?.score), 0) * 100
  ) / 100;
}

function kpiStatus(score: number) {
  return score >= KPI_TARGET ? "PASS" : "BELOW TARGET";
}

function formatScore(score: number) {
  return score.toFixed(2);
}

function isResolvedAppeal(caseItem: any) {
  return (
    caseItem?.appealStatus === "Approved" ||
    caseItem?.appealStatus === "Rejected" ||
    caseItem?.reviewStatus === "Revised" ||
    Boolean(caseItem?.revisedTopics?.length) ||
    Boolean(caseItem?.appealReviewedTopics?.length)
  );
}

export async function generateCasePdfWithAppealHistory({
  caseItem,
  currentUser,
  pdfVariant = "original",
  fallback,
}: GenerateAppealAwarePdfInput): Promise<PdfResult> {
  if (!isResolvedAppeal(caseItem)) {
    return fallback({ caseItem, currentUser, pdfVariant });
  }

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  registerTHSarabunNew(doc as any);

  const setFont = (style: "normal" | "bold" = "normal", size = 9, color = INK) => {
    try {
      doc.setFont("THSarabunNew", style);
    } catch {
      doc.setFont("helvetica", style);
    }
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const appealStatus = caseItem.appealStatus === "Rejected" ? "Rejected" : "Approved";
  const approved = appealStatus === "Approved";
  const originalTopics = Array.isArray(caseItem.topics) ? caseItem.topics : [];
  const revisedTopics = Array.isArray(caseItem.revisedTopics) ? caseItem.revisedTopics : [];
  const reviewedTopics = Array.isArray(caseItem.appealReviewedTopics) ? caseItem.appealReviewedTopics : [];
  const calculatedOriginal = topicTotal(originalTopics);
  const hasPreviousScore =
    caseItem.previousScore !== null &&
    caseItem.previousScore !== undefined &&
    caseItem.previousScore !== "" &&
    Number.isFinite(Number(caseItem.previousScore));
  const originalScore = hasPreviousScore
    ? Number(caseItem.previousScore)
    : calculatedOriginal || numeric(caseItem.finalScore);
  const revisedScore = approved ? numeric(caseItem.finalScore, originalScore) : originalScore;
  const originalGrade = scoreToGrade(originalScore, caseItem.monthKey);
  const revisedGrade = approved
    ? String(caseItem.grade || scoreToGrade(revisedScore, caseItem.monthKey))
    : originalGrade;
  const isMainReport = pdfVariant === "original";
  const reportTitle = isMainReport ? "CASE MAIN REPORT" : "APPEAL REVIEW REPORT";
  const reportSubtitle = isMainReport
    ? "Original evaluation with complete appeal history"
    : "Appeal decision, score comparison and review comments";

  let y = TOP;
  let sectionIndex = 0;

  const addPageHeader = (continued = false) => {
    doc.setFillColor(...PURPLE);
    doc.rect(0, 0, PAGE_WIDTH, 9, "F");
    setFont("bold", 7, WHITE);
    doc.text(
      `${plain(caseItem.caseId, "Case")} · ${reportTitle}${continued ? " · CONTINUED" : ""}`,
      MARGIN_X,
      6
    );
    y = TOP;
  };

  const newPage = () => {
    doc.addPage();
    addPageHeader(true);
  };

  const ensureSpace = (height: number) => {
    if (y + height > BOTTOM) newPage();
  };

  const splitLines = (value: unknown, width: number, size = 8) => {
    setFont("normal", size, INK);
    const text = plain(value);
    const paragraphs = text.split("\n");
    const lines: string[] = [];
    paragraphs.forEach((paragraph, index) => {
      const wrapped = doc.splitTextToSize(paragraph || " ", Math.max(8, width));
      lines.push(...(Array.isArray(wrapped) ? wrapped : [String(wrapped)]));
      if (index < paragraphs.length - 1) lines.push(" ");
    });
    return lines.length ? lines : ["-"];
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(10);
    sectionIndex += 1;
    doc.setFillColor(...PURPLE);
    doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, 7, 1.4, 1.4, "F");
    setFont("bold", 8.5, WHITE);
    doc.text(`${sectionIndex}. ${title}`, MARGIN_X + 3, y + 4.8);
    y += 10;
  };

  const drawKeyValueGrid = (items: Array<{ label: string; value: unknown }>) => {
    const gap = 2;
    const cardWidth = (CONTENT_WIDTH - gap) / 2;
    for (let index = 0; index < items.length; index += 2) {
      const row = items.slice(index, index + 2);
      const lineGroups = row.map((item) => splitLines(item.value, cardWidth - 6, 8));
      const height = Math.max(13, ...lineGroups.map((lines) => 7.5 + lines.length * 3.7));
      ensureSpace(height + 2);
      row.forEach((item, column) => {
        const x = MARGIN_X + column * (cardWidth + gap);
        doc.setFillColor(...SLATE_BG);
        doc.setDrawColor(...BORDER);
        doc.roundedRect(x, y, cardWidth, height, 1.5, 1.5, "FD");
        setFont("bold", 6.8, MUTED);
        doc.text(item.label.toUpperCase(), x + 3, y + 4.2);
        setFont("bold", 8.5, INK);
        doc.text(lineGroups[column], x + 3, y + 8.7, { lineHeightFactor: 1.1 });
      });
      y += height + 2;
    }
  };

  const drawScoreCard = (
    x: number,
    width: number,
    label: string,
    value: string,
    tone: "neutral" | "approved" | "rejected"
  ) => {
    const fill = tone === "approved" ? GREEN_BG : tone === "rejected" ? ROSE_BG : SLATE_BG;
    const ink = tone === "approved" ? GREEN : tone === "rejected" ? ROSE : INK;
    doc.setFillColor(...fill);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, width, 17, 1.5, 1.5, "FD");
    setFont("bold", 6.6, MUTED);
    doc.text(label.toUpperCase(), x + 3, y + 4.5);
    setFont("bold", 12, ink);
    doc.text(value, x + 3, y + 12.5);
  };

  const drawScoreComparison = () => {
    const gap = 2;
    const width = (CONTENT_WIDTH - gap * 2) / 3;
    const revisedTone = approved ? "approved" : "rejected";
    const rows = [
      [
        { label: "Original Final Score", value: formatScore(originalScore), tone: "neutral" as const },
        { label: approved ? "Revised Final Score" : "Final Score (Unchanged)", value: formatScore(revisedScore), tone: revisedTone as "approved" | "rejected" },
        { label: "Score Change", value: approved ? `${formatScore(revisedScore - originalScore)}` : "0.00", tone: revisedTone as "approved" | "rejected" },
      ],
      [
        { label: "Original Case Grade", value: originalGrade, tone: "neutral" as const },
        { label: approved ? "Revised Case Grade" : "Case Grade (Unchanged)", value: revisedGrade, tone: revisedTone as "approved" | "rejected" },
        { label: "Appeal Decision", value: appealStatus, tone: revisedTone as "approved" | "rejected" },
      ],
      [
        { label: `Original KPI Status (Target ${KPI_TARGET})`, value: kpiStatus(originalScore), tone: "neutral" as const },
        { label: `Revised KPI Status (Target ${KPI_TARGET})`, value: kpiStatus(revisedScore), tone: revisedTone as "approved" | "rejected" },
        { label: "KPI Threshold", value: `${KPI_TARGET.toFixed(0)} / 100`, tone: "neutral" as const },
      ],
    ];

    rows.forEach((row) => {
      ensureSpace(19);
      row.forEach((item, column) => {
        drawScoreCard(MARGIN_X + column * (width + gap), width, item.label, item.value, item.tone);
      });
      y += 19;
    });
  };

  const drawTextBlock = (
    label: string,
    value: unknown,
    tone: "neutral" | "violet" | "approved" | "rejected" | "appeal" = "neutral"
  ) => {
    const fill = tone === "violet"
      ? VIOLET_BG
      : tone === "approved"
        ? GREEN_BG
        : tone === "rejected"
          ? ROSE_BG
          : tone === "appeal"
            ? AMBER_BG
            : SLATE_BG;
    const labelColor = tone === "approved"
      ? GREEN
      : tone === "rejected"
        ? ROSE
        : tone === "appeal"
          ? AMBER
          : tone === "violet"
            ? VIOLET
            : MUTED;
    const lines = splitLines(value, CONTENT_WIDTH - 8, 8);
    let offset = 0;

    while (offset < lines.length) {
      const available = BOTTOM - y;
      if (available < 18) newPage();
      const maxLines = Math.max(1, Math.floor((BOTTOM - y - 9) / 3.8));
      const chunk = lines.slice(offset, offset + maxLines);
      const height = 8 + chunk.length * 3.8;
      doc.setFillColor(...fill);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, height, 1.5, 1.5, "FD");
      setFont("bold", 7, labelColor);
      doc.text(`${label}${offset ? " (continued)" : ""}`, MARGIN_X + 3, y + 4.5);
      setFont("normal", 8, INK);
      doc.text(chunk, MARGIN_X + 3, y + 8.7, { lineHeightFactor: 1.12 });
      y += height + 2;
      offset += chunk.length;
      if (offset < lines.length) newPage();
    }
  };

  const drawTopic = (topic: any, index: number) => {
    const revised = revisedTopics.find((item: any) => String(item?.code) === String(topic?.code));
    const reviewed = reviewedTopics.find((item: any) => String(item?.code) === String(topic?.code));
    const reason = plain(reviewed?.appealReason || revised?.appealReason || "", "No appeal reason recorded");
    const originalTopicScore = numeric(topic?.score);
    const revisedTopicScore = approved && revised ? numeric(revised.score, originalTopicScore) : originalTopicScore;
    const revisedComment = approved
      ? revised?.comment || reviewed?.comment || topic?.comment
      : reviewed?.comment || caseItem.appealReviewSummary || "Appeal rejected; original result retained.";
    const hasAppealContext = Boolean(
      reviewed ||
      revised ||
      (Array.isArray(caseItem.displayRevisedTopicCodes) && caseItem.displayRevisedTopicCodes.includes(topic?.code))
    );

    ensureSpace(25);
    doc.setFillColor(...VIOLET_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, 9, 1.5, 1.5, "FD");
    setFont("bold", 9, PURPLE);
    doc.text(`${index + 1}. ${plain(topic?.code, "-")} · ${plain(topic?.label, "Topic")}`, MARGIN_X + 3, y + 5.8);
    y += 11;

    const gap = 2;
    const width = (CONTENT_WIDTH - gap) / 2;
    ensureSpace(15);
    doc.setFillColor(...SLATE_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(MARGIN_X, y, width, 13, 1.5, 1.5, "FD");
    setFont("bold", 6.8, MUTED);
    doc.text("ORIGINAL SCORE", MARGIN_X + 3, y + 4.2);
    setFont("bold", 10, INK);
    doc.text(`${formatScore(originalTopicScore)} / ${formatScore(numeric(topic?.max))}`, MARGIN_X + 3, y + 10);

    doc.setFillColor(...(approved ? GREEN_BG : ROSE_BG));
    doc.roundedRect(MARGIN_X + width + gap, y, width, 13, 1.5, 1.5, "FD");
    setFont("bold", 6.8, approved ? GREEN : ROSE);
    doc.text(approved ? "REVISED SCORE" : "REVISED SCORE (UNCHANGED)", MARGIN_X + width + gap + 3, y + 4.2);
    setFont("bold", 10, approved ? GREEN : ROSE);
    doc.text(`${formatScore(revisedTopicScore)} / ${formatScore(numeric(topic?.max))}`, MARGIN_X + width + gap + 3, y + 10);
    y += 15;

    drawTextBlock("Original Comment", topic?.comment, "neutral");
    if (hasAppealContext) drawTextBlock("Appeal Reason", reason, "appeal");
    if (hasAppealContext) {
      drawTextBlock(
        approved ? "Revised Comment" : "Revised Comment (Rejected)",
        revisedComment,
        approved ? "approved" : "rejected"
      );
    }
    y += 2;
  };

  addPageHeader();

  doc.setFillColor(...PURPLE);
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, 25, 2, 2, "F");
  setFont("bold", 18, WHITE);
  doc.text(reportTitle, MARGIN_X + 5, y + 9.5);
  setFont("normal", 8.5, WHITE);
  doc.text(reportSubtitle, MARGIN_X + 5, y + 15.5);
  setFont("bold", 9, WHITE);
  doc.text(`APPEAL ${appealStatus.toUpperCase()}`, PAGE_WIDTH - MARGIN_X - 5, y + 21, { align: "right" });
  y += 29;

  drawSectionTitle("Case identity");
  drawKeyValueGrid([
    { label: "Case ID", value: caseItem.caseId },
    { label: "Agent", value: caseItem.agent },
    { label: "Month", value: caseItem.monthLabel || caseItem.monthKey },
    { label: "Audit Date", value: caseItem.auditTimestamp || caseItem.auditDate },
    { label: "Evaluator", value: caseItem.evaluatorName || "Not recorded" },
    { label: "Appeal Request ID", value: caseItem.appealRequestId || "Not recorded" },
  ]);

  drawSectionTitle("Original and revised result");
  drawScoreComparison();

  drawSectionTitle("Appeal review trail");
  drawKeyValueGrid([
    { label: "Appeal Status", value: appealStatus },
    { label: "Reviewed Date", value: caseItem.appealReviewedAt || "Not recorded" },
  ]);
  drawTextBlock(
    approved ? "Review Summary / Revised Comment" : "Review Summary / Revised Comment (Rejected)",
    caseItem.appealReviewSummary || "No review summary recorded",
    approved ? "approved" : "rejected"
  );

  drawSectionTitle("Original case context");
  drawTextBlock("Customer Inquiry", caseItem.inquiryTh || caseItem.inquiryEn, "violet");
  drawTextBlock("Case Description", caseItem.caseDescription, "neutral");
  if (plain(caseItem.processReference, "")) {
    drawTextBlock("Process Reference", caseItem.processReference, "neutral");
  }
  if (plain(caseItem.caseUrl, "")) drawTextBlock("Case URL", caseItem.caseUrl, "neutral");
  if (plain(caseItem.caseImageUrl, "")) drawTextBlock("Case Image URL", caseItem.caseImageUrl, "neutral");

  drawSectionTitle("Topic score and comment history");
  if (originalTopics.length) {
    originalTopics.forEach(drawTopic);
  } else {
    drawTextBlock("Topic Detail", "No topic detail available", "neutral");
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN_X, 289, PAGE_WIDTH - MARGIN_X, 289);
    setFont("normal", 6.8, MUTED);
    doc.text(
      `${plain(caseItem.caseId, "Case")} · Page ${page} of ${pageCount} · KPI target ${KPI_TARGET}`,
      MARGIN_X,
      293
    );
    doc.text("QA Dashboard", PAGE_WIDTH - MARGIN_X, 293, { align: "right" });
  }

  const safeCaseId = safeFilePart(caseItem.caseId);
  return {
    blob: doc.output("blob"),
    fileName: isMainReport
      ? `${safeCaseId}_Case_Main_Report.pdf`
      : `${safeCaseId}_Appeal_Review_Report.pdf`,
    title: isMainReport
      ? `${plain(caseItem.caseId)} Case Main Report`
      : `${plain(caseItem.caseId)} Appeal Review Report`,
    fileSuffix: isMainReport ? "case_main_report" : "appeal_review_report",
  };
}
