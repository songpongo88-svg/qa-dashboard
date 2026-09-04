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
    "original KPI and appeal update rows",
    `    y += secondSelectionRowH;

    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";`,
    `    y += secondSelectionRowH;

    const hasAppealUpdate = Boolean(caseItem.pdfAppealStatus);
    const comparisonRowH = 10;
    if (hasAppealUpdate) {
      addPageIfNeeded(comparisonRowH);
      label(0, y, 1, comparisonRowH, "Original\\nScore");
      value(1, y, 1, comparisonRowH, num(caseItem.pdfOriginalScore).toFixed(2), LIGHT_PURPLE, { align: "center", valign: "middle", size: 7.8, maxLines: 1 });
      label(2, y, 1, comparisonRowH, "Revised\\nScore");
      value(3, y, 1, comparisonRowH, reportScore.toFixed(2), reportScore >= num(caseItem.pdfOriginalScore) ? GREEN : RED, { align: "center", valign: "middle", size: 7.8, maxLines: 1 });
      label(4, y, 1, comparisonRowH, "Original\\nGrade");
      value(5, y, 1, comparisonRowH, caseItem.pdfOriginalGrade || grade, LIGHT_PURPLE, { align: "center", valign: "middle", size: 7.8, maxLines: 1 });
      label(6, y, 1, comparisonRowH, "Revised\\nGrade");
      value(7, y, 1, comparisonRowH, grade, LIGHT_PURPLE, { align: "center", valign: "middle", size: 7.8, maxLines: 1 });
      y += comparisonRowH;
    }

    const kpiRowH = 9;
    addPageIfNeeded(kpiRowH);
    label(0, y, 1, kpiRowH, hasAppealUpdate ? "Original KPI" : "KPI Status");
    value(1, y, 1, kpiRowH, hasAppealUpdate ? caseItem.pdfOriginalKpiStatus : reportKpiStatus, hasAppealUpdate ? LIGHT_PURPLE : reportScore >= 85 ? GREEN : RED, { align: "center", valign: "middle", size: 7.2, maxLines: 1 });
    label(2, y, 1, kpiRowH, hasAppealUpdate ? "Revised KPI" : "KPI Target");
    value(3, y, 1, kpiRowH, hasAppealUpdate ? reportKpiStatus : "85 / 100", reportScore >= 85 ? GREEN : RED, { align: "center", valign: "middle", size: 7.2, maxLines: 1 });
    label(4, y, 1, kpiRowH, "Appeal Status");
    value(5, y, 1, kpiRowH, caseItem.pdfAppealStatus || "-", LIGHT_PURPLE, { align: "center", valign: "middle", size: 7.2, maxLines: 1 });
    label(6, y, 1, kpiRowH, "Report Type");
    value(7, y, 1, kpiRowH, caseItem.pdfReportType || "Original PDF", LIGHT_PURPLE, { align: "center", valign: "middle", size: 7.2, maxLines: 2 });
    y += kpiRowH;

    if (safeMultiline(caseItem.pdfAppealSummary, "")) {
      drawWideRichTextRow({
        labelText: "Appeal\\nUpdate",
        text: caseItem.pdfAppealSummary,
        size: CASE_DESCRIPTION_TEXT_SIZE,
        leading: CASE_DESCRIPTION_LINE_SPACING,
        minH: 20,
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
