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

function plain(value: unknown, fallback = "-") {
  const text = richTextToPlainText(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  return text || fallback;
}

function pdfHtml(value: unknown, fallback = "-") {
  return plain(value, fallback)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
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

function scoreText(score: number) {
  return score.toFixed(2);
}

function kpiStatus(score: number) {
  return score >= KPI_TARGET ? "Passed" : "Not Passed";
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function hasResolvedAppeal(caseItem: any) {
  return (
    caseItem?.appealStatus === "Approved" ||
    caseItem?.appealStatus === "Rejected" ||
    caseItem?.reviewStatus === "Revised" ||
    Boolean(caseItem?.revisedTopics?.length) ||
    Boolean(caseItem?.appealReviewedTopics?.length)
  );
}

function changedTopic(original: any, revised: any) {
  if (!revised) return false;
  const scoreChanged = hasValue(revised.score) && numeric(revised.score) !== numeric(original?.score);
  const originalComment = plain(original?.comment, "");
  const revisedComment = plain(revised?.comment, "");
  return scoreChanged || Boolean(revisedComment && revisedComment !== originalComment);
}

export async function generateCasePdfWithAppealHistory({
  caseItem,
  currentUser,
  pdfVariant = "original",
  fallback,
}: GenerateAppealAwarePdfInput): Promise<PdfResult> {
  if (!hasResolvedAppeal(caseItem)) {
    return fallback({ caseItem, currentUser, pdfVariant });
  }

  const status = caseItem.appealStatus === "Rejected" ? "Rejected" : "Approved";
  const approved = status === "Approved";
  const originalTopics = Array.isArray(caseItem.topics) ? caseItem.topics : [];
  const revisedTopics = Array.isArray(caseItem.revisedTopics) ? caseItem.revisedTopics : [];
  const reviewedTopics = Array.isArray(caseItem.appealReviewedTopics) ? caseItem.appealReviewedTopics : [];
  const revisedMap = new Map(revisedTopics.map((topic: any) => [String(topic?.code), topic]));
  const reviewedMap = new Map(reviewedTopics.map((topic: any) => [String(topic?.code), topic]));
  const revisedCodes = new Set((caseItem.displayRevisedTopicCodes || []).map((code: unknown) => String(code)));

  const calculatedOriginal = topicTotal(originalTopics);
  const hasPreviousScore = hasValue(caseItem.previousScore) && Number.isFinite(Number(caseItem.previousScore));
  const originalFinalScore = hasPreviousScore
    ? Number(caseItem.previousScore)
    : calculatedOriginal || numeric(caseItem.finalScore);
  const revisedFinalScore = approved ? numeric(caseItem.finalScore, originalFinalScore) : originalFinalScore;
  const originalGrade = scoreToGrade(originalFinalScore, caseItem.monthKey);
  const revisedGrade = approved
    ? String(caseItem.grade || scoreToGrade(revisedFinalScore, caseItem.monthKey))
    : originalGrade;

  const updatedTopics = originalTopics.map((topic: any) => {
    const code = String(topic?.code);
    const revised = revisedMap.get(code) as any;
    const reviewed = reviewedMap.get(code) as any;
    const isAppealedTopic = Boolean(
      reviewed ||
      revisedCodes.has(code) ||
      changedTopic(topic, revised)
    );
    if (!isAppealedTopic) return topic;

    const originalTopicScore = numeric(topic?.score);
    const revisedTopicScore = approved && revised && hasValue(revised.score)
      ? numeric(revised.score, originalTopicScore)
      : originalTopicScore;
    const maxScore = numeric(revised?.max, numeric(topic?.max));
    const appealReason = plain(
      reviewed?.appealReason || revised?.appealReason,
      "ไม่พบ Appeal Reason"
    );
    const revisedComment = approved
      ? plain(revised?.comment || reviewed?.comment, "ไม่พบ Revised Comment")
      : plain(
          reviewed?.comment || caseItem.appealReviewSummary,
          "Appeal Rejected - คะแนนและผลการประเมินคงเดิม"
        );
    const revisedLabel = approved ? "Revised Comment" : "Revised Comment (Rejected)";
    const combinedComment = [
      `<div><strong>Original Score: ${scoreText(originalTopicScore)} / ${scoreText(numeric(topic?.max))}</strong></div>`,
      `<div><strong>Revised Score: ${scoreText(revisedTopicScore)} / ${scoreText(maxScore)}</strong></div>`,
      "<div><br></div>",
      "<div><strong>Original Comment</strong></div>",
      `<div>${pdfHtml(topic?.comment)}</div>`,
      "<hr>",
      `<div><span style="color:#dc2626"><strong>Appeal Reason</strong><br>${pdfHtml(appealReason)}</span></div>`,
      "<hr>",
      `<div><span style="color:#dc2626"><strong>${revisedLabel}</strong><br>${pdfHtml(revisedComment)}</span></div>`,
    ].join("");

    return {
      ...topic,
      score: revisedTopicScore,
      max: maxScore,
      pct: maxScore > 0 ? (revisedTopicScore / maxScore) * 100 : 0,
      comment: combinedComment,
    };
  });

  const reportKind = pdfVariant === "appeal" ? "Appeal PDF" : "Main PDF";
  const safeCaseId = safeFilePart(caseItem.caseId);
  const appealSummary = [
    caseItem.appealReviewedAt ? `Reviewed Date: ${plain(caseItem.appealReviewedAt)}` : "",
    caseItem.appealRequestId ? `Appeal Request ID: ${plain(caseItem.appealRequestId)}` : "",
    "",
    approved ? "Revised Comment" : "Revised Comment (Rejected)",
    plain(caseItem.appealReviewSummary, "ไม่พบ Review Summary"),
  ].filter((line) => line !== "").join("\n");

  const updatedCaseItem = {
    ...caseItem,
    topics: updatedTopics,
    grade: revisedGrade,
    pdfReportScoreOverride: revisedFinalScore,
    pdfReportGradeOverride: revisedGrade,
    pdfReportKpiStatus: kpiStatus(revisedFinalScore),
    pdfOriginalScore: originalFinalScore,
    pdfOriginalGrade: originalGrade,
    pdfOriginalKpiStatus: kpiStatus(originalFinalScore),
    pdfAppealStatus: status,
    pdfReportType: reportKind,
    pdfAppealSummary: appealSummary,
    pdfReportTitleOverride: `${caseItem.caseId} ${reportKind}`,
    pdfReportFileSuffixOverride: pdfVariant === "appeal" ? "case_detail_appeal" : "case_main_report",
    pdfReportFileNameOverride: pdfVariant === "appeal"
      ? `${safeCaseId}_Appeal_Report.pdf`
      : `${safeCaseId}_Case_Main_Report.pdf`,
  };

  // Keep the existing Original PDF renderer and inject appeal data into its
  // purple table. No separate report template is created.
  return fallback({ caseItem: updatedCaseItem, currentUser, pdfVariant: "original" });
}
