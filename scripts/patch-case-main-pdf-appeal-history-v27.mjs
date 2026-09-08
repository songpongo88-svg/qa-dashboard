import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dashboardPath = path.join(root, "src", "DashboardMockup.tsx");
const casePdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");

let source = fs.readFileSync(dashboardPath, "utf8");
const original = source;

const officialImport = 'import { generateOfficialCaseDetailPdf } from "./caseDetailOfficialPdf";';
const addonImport = 'import { generateCasePdfWithAppealHistory } from "./caseAppealPdfAddon";';

if (!source.includes(addonImport)) {
  if (!source.includes(officialImport)) {
    throw new Error("Case PDF import anchor was not found in DashboardMockup.tsx");
  }
  source = source.replace(officialImport, `${officialImport}\n${addonImport}`);
}

const oldGeneratorCall = `const officialPdf = await generateOfficialCaseDetailPdf({
        caseItem,
        currentUser,
        pdfVariant,
      });`;
const newGeneratorCall = `const officialPdf = await generateCasePdfWithAppealHistory({
        caseItem,
        currentUser,
        pdfVariant,
        fallback: generateOfficialCaseDetailPdf,
      });`;

if (!source.includes(newGeneratorCall)) {
  if (!source.includes(oldGeneratorCall)) {
    throw new Error("Case PDF generator call anchor was not found in DashboardMockup.tsx");
  }
  source = source.replace(oldGeneratorCall, newGeneratorCall);
}

if (!source.includes("const hasAppealReport = hasAppealCase;")) {
  const approvedReportBlock = /\n  const hasApprovedAppealReport =\n(?:    .*\n)+?    !!caseItem\.displayRevisedTopicCodes\?\.length;\n/;
  if (!approvedReportBlock.test(source)) {
    throw new Error("Appeal report visibility anchor was not found in DashboardMockup.tsx");
  }
  source = source.replace(approvedReportBlock, "\n  const hasAppealReport = hasAppealCase;\n");
}

source = source.replaceAll("hasApprovedAppealReport", "hasAppealReport");

const topicTypeAnchor = `  comment?: string;
};

type AppealReviewedTopic`;
const topicTypeWithReason = `  comment?: string;
  appealReason?: string;
};

type AppealReviewedTopic`;
if (!source.includes(topicTypeWithReason)) {
  if (!source.includes(topicTypeAnchor)) {
    throw new Error("Topic appealReason type anchor was not found in DashboardMockup.tsx");
  }
  source = source.replace(topicTypeAnchor, topicTypeWithReason);
}

const firebaseRevisedComment = `        comment: String(matched.revisedComment || matched.comment || "").trim(),
      });`;
const firebaseRevisedWithReason = `        comment: String(matched.revisedComment || matched.comment || "").trim(),
        appealReason: String(matched.appealReason || "").trim(),
      });`;
if (!source.includes(firebaseRevisedWithReason)) {
  if (!source.includes(firebaseRevisedComment)) {
    throw new Error("Firebase revised topic anchor was not found in DashboardMockup.tsx");
  }
  source = source.replace(firebaseRevisedComment, firebaseRevisedWithReason);
}

const excelRevisedComment = `              pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,
              comment,
            });`;
const excelRevisedWithReason = `              pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,
              comment,
              appealReason: String(appealReasonRaw ?? "").trim(),
            });`;
if (!source.includes(excelRevisedWithReason)) {
  if (!source.includes(excelRevisedComment)) {
    throw new Error("Appeal ROWDATA revised topic anchor was not found in DashboardMockup.tsx");
  }
  source = source.replace(excelRevisedComment, excelRevisedWithReason);
}

const originalPdfLabel = "                    Original PDF";
const mainPdfLabel = '                    {hasAppealCase ? "Main PDF" : "Original PDF"}';
if (!source.includes(mainPdfLabel)) {
  if (!source.includes(originalPdfLabel)) {
    throw new Error("Original PDF button label anchor was not found in DashboardMockup.tsx");
  }
  source = source.replace(originalPdfLabel, mainPdfLabel);
}

if (source !== original) {
  fs.writeFileSync(dashboardPath, source, "utf8");
  console.log("Applied Case Main PDF button patch.");
} else {
  console.log("Case Main PDF button patch already applied.");
}

let pdfSource = fs.readFileSync(casePdfPath, "utf8");
const pdfOriginal = pdfSource;
const pdfMarker = "// case-main-pdf-original-template-v34";

function replacePdfOnce(label, search, replacement) {
  if (!pdfSource.includes(search)) {
    throw new Error(`Case PDF anchor not found: ${label}`);
  }
  pdfSource = pdfSource.replace(search, replacement);
}

if (!pdfSource.includes(pdfMarker)) {
  replacePdfOnce(
    "report score and metadata",
    `  const reportScore = includeAppeal ? num(caseItem.finalScore) : originalScore(caseItem);
  const grade = safeText(caseItem.grade || scoreGrade(reportScore));
  const isTestCase = isTestCaseEvaluation(caseItem);
  const safeCaseId = caseIdForFileName(caseItem.caseId);
  const fileSuffix = includeAppeal ? "case_detail_appeal" : "original_pdf";
  const title = includeAppeal ? \`${"${caseItem.caseId}"} Appeal PDF\` : \`${"${caseItem.caseId}"} Original PDF\`;`,
    `${pdfMarker}
  const scoreOverride = Number(caseItem.pdfReportScoreOverride);
  const reportScore = Number.isFinite(scoreOverride)
    ? scoreOverride
    : includeAppeal
      ? num(caseItem.finalScore)
      : originalScore(caseItem);
  const grade = safeText(caseItem.pdfReportGradeOverride || caseItem.grade || scoreGrade(reportScore));
  const reportKpiStatus = safeText(
    caseItem.pdfReportKpiStatus,
    reportScore >= 85 ? "Passed" : "Not Passed"
  );
  const isTestCase = isTestCaseEvaluation(caseItem);
  const safeCaseId = caseIdForFileName(caseItem.caseId);
  const fileSuffix = safeText(
    caseItem.pdfReportFileSuffixOverride,
    includeAppeal ? "case_detail_appeal" : "original_pdf"
  );
  const title = safeText(
    caseItem.pdfReportTitleOverride,
    includeAppeal ? \`${"${caseItem.caseId}"} Appeal PDF\` : \`${"${caseItem.caseId}"} Original PDF\`
  );`
  );

  replacePdfOnce(
    "appeal metadata in original header row",
    `    const auditText = caseItem.auditTimestamp || caseItem.auditDate;
    const caseDateText = caseItem.caseDate || caseItem.createdAt || caseItem.caseCreatedAt || caseItem.auditDate || caseItem.auditTimestamp || "-";`,
    `    const hasAppealUpdate = Boolean(caseItem.pdfAppealStatus);
    const auditText = caseItem.auditTimestamp || caseItem.auditDate;
    const caseDateText = caseItem.caseDate || caseItem.createdAt || caseItem.caseCreatedAt || caseItem.auditDate || caseItem.auditTimestamp || "-";`
  );

  replacePdfOnce(
    "appeal status and reviewed date header cells",
    `    label(4, y, 1, secondSelectionRowH, "Final Score");
    value(5, y, 1, secondSelectionRowH, reportScore.toFixed(2), LIGHT_PURPLE, { align: "center", valign: "middle", size: 8.2, maxLines: 1 });
    label(6, y, 1, secondSelectionRowH, "Case Grade");
    value(7, y, 1, secondSelectionRowH, grade, LIGHT_PURPLE, { align: "center", valign: "middle", size: 8.2, maxLines: 1 });`,
    `    label(4, y, 1, secondSelectionRowH, hasAppealUpdate ? "Appeal Status" : "Final Score");
    value(5, y, 1, secondSelectionRowH, hasAppealUpdate ? caseItem.pdfAppealStatus : reportScore.toFixed(2), hasAppealUpdate ? (caseItem.pdfAppealStatus === "Approved" ? GREEN : RED) : LIGHT_PURPLE, { align: "center", valign: "middle", size: hasAppealUpdate ? 7.2 : 8.2, maxLines: 1 });
    label(6, y, 1, secondSelectionRowH, hasAppealUpdate ? "Reviewed Date" : "Case Grade");
    value(7, y, 1, secondSelectionRowH, hasAppealUpdate ? safeText(caseItem.pdfAppealReviewedAt, "-") : grade, LIGHT_PURPLE, { align: "center", valign: "middle", size: hasAppealUpdate ? 6.4 : 8.2, maxLines: hasAppealUpdate ? 2 : 1 });`
  );

  replacePdfOnce(
    "original KPI and appeal update rows",
    `    y += secondSelectionRowH;

    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";`,
    `    y += secondSelectionRowH;

    const comparisonRowH = 10;
    if (hasAppealUpdate) {
      const originalScoreText = num(caseItem.pdfOriginalScore).toFixed(2);
      const originalGradeText = safeText(caseItem.pdfOriginalGrade, grade);
      const originalKpiText = safeText(caseItem.pdfOriginalKpiStatus, reportKpiStatus);
      const appealApproved = caseItem.pdfAppealStatus === "Approved";
      addPageIfNeeded(comparisonRowH);
      label(0, y, 1, comparisonRowH, "Score");
      value(1, y, 2, comparisonRowH, originalScoreText + " -> " + reportScore.toFixed(2), appealApproved ? GREEN : LIGHT_PURPLE, { align: "center", valign: "middle", size: 7.6, maxLines: 1 });
      label(3, y, 1, comparisonRowH, "Grade");
      value(4, y, 1, comparisonRowH, originalGradeText + " -> " + grade, appealApproved ? GREEN : LIGHT_PURPLE, { align: "center", valign: "middle", size: 6.8, maxLines: 1 });
      label(5, y, 1, comparisonRowH, "KPI Status");
      value(6, y, 2, comparisonRowH, originalKpiText + " -> " + reportKpiStatus, reportKpiStatus === "Passed" ? GREEN : RED, { align: "center", valign: "middle", size: 7.2, maxLines: 1 });
      y += comparisonRowH;
    }

    if (!hasAppealUpdate) {
      const kpiRowH = 9;
      addPageIfNeeded(kpiRowH);
      label(0, y, 1, kpiRowH, "KPI Status");
      value(1, y, 1, kpiRowH, reportKpiStatus, reportScore >= 85 ? GREEN : RED, { align: "center", valign: "middle", size: 7.2, maxLines: 1 });
      label(2, y, 1, kpiRowH, "KPI Target");
      value(3, y, 1, kpiRowH, "85 / 100", reportScore >= 85 ? GREEN : RED, { align: "center", valign: "middle", size: 7.2, maxLines: 1 });
      label(4, y, 1, kpiRowH, "Appeal Status");
      value(5, y, 1, kpiRowH, "-", LIGHT_PURPLE, { align: "center", valign: "middle", size: 7.2, maxLines: 1 });
      label(6, y, 1, kpiRowH, "Report Type");
      value(7, y, 1, kpiRowH, "Original PDF", LIGHT_PURPLE, { align: "center", valign: "middle", size: 7.2, maxLines: 2 });
      y += kpiRowH;
    }

    if (safeMultiline(caseItem.pdfAppealSummary, "")) {
      drawWideRichTextRow({
        labelText: "Appealed\\nTopic",
        text: caseItem.pdfAppealSummary,
        size: CASE_DESCRIPTION_TEXT_SIZE,
        leading: CASE_DESCRIPTION_LINE_SPACING,
        minH: 12,
        padY: 5,
      });
    }

    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";`
  );

  replacePdfOnce(
    "output filename override",
    `    fileName: includeAppeal ? \`${"${safeCaseId}"}_case_detail_appeal_report.pdf\` : \`${"${safeCaseId}"}_Original_QA_Report.pdf\`,`,
    `    fileName: safeText(caseItem.pdfReportFileNameOverride, "") ||
      (includeAppeal ? \`${"${safeCaseId}"}_case_detail_appeal_report.pdf\` : \`${"${safeCaseId}"}_Original_QA_Report.pdf\`),`
  );
}

if (pdfSource !== pdfOriginal) {
  fs.writeFileSync(casePdfPath, pdfSource, "utf8");
  console.log("Applied appeal updates inside the existing Original PDF template.");
} else {
  console.log("Original PDF template appeal update already applied.");
}
