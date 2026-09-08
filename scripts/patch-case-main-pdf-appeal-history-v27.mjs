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
    "fixed appeal header grid widths",
    `  const topWidths = [15, 38, 15, 24, 15, 24, 25, 39];`,
    `  const topWidths = [15, 38, 15, 24, 15, 24, 25, 39];
  const appealTopWidths = [14.5, 34.25, 14.5, 34.25, 14.5, 34.25, 14.5, 34.25];`
  );

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
    "appeal header grid selection",
    `  const drawOriginalTop = () => {
    setWidths(topWidths);`,
    `  const drawOriginalTop = () => {
    const hasAppealUpdate = Boolean(caseItem.pdfAppealStatus);
    setWidths(hasAppealUpdate ? appealTopWidths : topWidths);`
  );

  replacePdfOnce(
    "four aligned appeal header groups",
    `    const firstSelectionRowH = autoRowHeight(
      [
        { value: agentSelectionText(caseItem), w: wOf(1, 2), size: 6.8, padY: 5 },
        { value: caseItem.monthLabel || caseItem.monthKey, w: wOf(4), size: 6.8, padY: 4 },
        { value: caseItem.caseId, w: wOf(6, 2), size: 7.4, padY: 4 },
      ],
      9,
      12
    );
    label(0, y, 1, firstSelectionRowH, "Agent");
    agentValue(1, y, 2, firstSelectionRowH, caseItem);
    label(3, y, 1, firstSelectionRowH, "Month");
    value(4, y, 1, firstSelectionRowH, caseItem.monthLabel || caseItem.monthKey, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 6.8 });
    label(5, y, 1, firstSelectionRowH, "Case ID");
    value(6, y, 2, firstSelectionRowH, caseItem.caseId, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 7.4 });
    y += firstSelectionRowH;`,
    `    if (hasAppealUpdate) {
      const agentText = safeText(caseItem.agent);
      const teamText = safeText(caseItem.teamName || caseItem.team || "", "-");
      const firstSelectionRowH = autoRowHeight(
        [
          { value: agentText, w: wOf(1), size: 6.4, padY: 4.4 },
          { value: teamText, w: wOf(3), size: 6.4, padY: 4.4 },
          { value: caseItem.monthLabel || caseItem.monthKey, w: wOf(5), size: 6.4, padY: 4.4 },
          { value: caseItem.caseId, w: wOf(7), size: 6.6, padY: 4.4 },
        ],
        10,
        20
      );
      addPageIfNeeded(firstSelectionRowH);
      label(0, y, 1, firstSelectionRowH, "Agent");
      value(1, y, 1, firstSelectionRowH, agentText, LIGHT_PURPLE, { align: "center", valign: "middle", size: 6.4, maxLines: fitLinesForHeight(firstSelectionRowH, 6.4, 0.46, 4) });
      label(2, y, 1, firstSelectionRowH, "Team");
      value(3, y, 1, firstSelectionRowH, teamText, LIGHT_PURPLE, { align: "center", valign: "middle", size: 6.4, maxLines: fitLinesForHeight(firstSelectionRowH, 6.4, 0.46, 4) });
      label(4, y, 1, firstSelectionRowH, "Month");
      value(5, y, 1, firstSelectionRowH, caseItem.monthLabel || caseItem.monthKey, LIGHT_PURPLE, { align: "center", valign: "middle", size: 6.4, maxLines: fitLinesForHeight(firstSelectionRowH, 6.4, 0.46, 4) });
      label(6, y, 1, firstSelectionRowH, "Case ID");
      value(7, y, 1, firstSelectionRowH, caseItem.caseId, LIGHT_PURPLE, { align: "center", valign: "middle", size: 6.6, maxLines: fitLinesForHeight(firstSelectionRowH, 6.6, 0.46, 4) });
      y += firstSelectionRowH;
    } else {
      const firstSelectionRowH = autoRowHeight(
        [
          { value: agentSelectionText(caseItem), w: wOf(1, 2), size: 6.8, padY: 5 },
          { value: caseItem.monthLabel || caseItem.monthKey, w: wOf(4), size: 6.8, padY: 4 },
          { value: caseItem.caseId, w: wOf(6, 2), size: 7.4, padY: 4 },
        ],
        9,
        12
      );
      label(0, y, 1, firstSelectionRowH, "Agent");
      agentValue(1, y, 2, firstSelectionRowH, caseItem);
      label(3, y, 1, firstSelectionRowH, "Month");
      value(4, y, 1, firstSelectionRowH, caseItem.monthLabel || caseItem.monthKey, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 6.8 });
      label(5, y, 1, firstSelectionRowH, "Case ID");
      value(6, y, 2, firstSelectionRowH, caseItem.caseId, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 7.4 });
      y += firstSelectionRowH;
    }`
  );

  replacePdfOnce(
    "auto-height appeal date and status row",
    `    const secondSelectionRowH = autoRowHeight(
      [
        { value: auditText, w: wOf(1), size: 6.4, padY: 4 },
        { value: caseDateText, w: wOf(3), size: 6.4, padY: 4 },
        { value: reportScore.toFixed(2), w: wOf(5), size: 8.2, padY: 4 },
        { value: grade, w: wOf(7), size: 8.2, padY: 4 },
      ],
      10,
      14
    );`,
    `    const appealStatusText = hasAppealUpdate ? safeText(caseItem.pdfAppealStatus) : reportScore.toFixed(2);
    const reviewedDateText = hasAppealUpdate ? safeText(caseItem.pdfAppealReviewedAt, "-") : grade;
    const secondSelectionRowH = autoRowHeight(
      [
        { value: auditText, w: wOf(1), size: 6.2, padY: 4.4 },
        { value: caseDateText, w: wOf(3), size: 6.2, padY: 4.4 },
        { value: appealStatusText, w: wOf(5), size: hasAppealUpdate ? 6.5 : 8.2, padY: 4.4 },
        { value: reviewedDateText, w: wOf(7), size: hasAppealUpdate ? 5.8 : 8.2, padY: 4.4 },
      ],
      10,
      hasAppealUpdate ? 20 : 14
    );`
  );

  replacePdfOnce(
    "appeal status and reviewed date header cells",
    `    label(4, y, 1, secondSelectionRowH, "Final Score");
    value(5, y, 1, secondSelectionRowH, reportScore.toFixed(2), LIGHT_PURPLE, { align: "center", valign: "middle", size: 8.2, maxLines: 1 });
    label(6, y, 1, secondSelectionRowH, "Case Grade");
    value(7, y, 1, secondSelectionRowH, grade, LIGHT_PURPLE, { align: "center", valign: "middle", size: 8.2, maxLines: 1 });`,
    `    label(4, y, 1, secondSelectionRowH, hasAppealUpdate ? "Appeal Status" : "Final Score");
    value(5, y, 1, secondSelectionRowH, appealStatusText, LIGHT_PURPLE, { align: "center", valign: "middle", size: hasAppealUpdate ? 6.5 : 8.2, maxLines: fitLinesForHeight(secondSelectionRowH, hasAppealUpdate ? 6.5 : 8.2, 0.46, 4), color: hasAppealUpdate ? (caseItem.pdfAppealStatus === "Approved" ? [21, 128, 61] : [220, 38, 38]) : undefined });
    label(6, y, 1, secondSelectionRowH, hasAppealUpdate ? "Reviewed Date" : "Case Grade");
    value(7, y, 1, secondSelectionRowH, reviewedDateText, LIGHT_PURPLE, { align: "center", valign: "middle", size: hasAppealUpdate ? 5.8 : 8.2, maxLines: fitLinesForHeight(secondSelectionRowH, hasAppealUpdate ? 5.8 : 8.2, 0.46, 4) });`
  );

  replacePdfOnce(
    "original KPI and appeal update rows",
    `    y += secondSelectionRowH;

    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";
    const inquiryRowH = Math.max(12, Math.min(28, measureTextHeight(inquiryText, wOf(3, 5), BODY_TEXT_SIZE, BODY_LINE_SPACING, 5)));
    addPageIfNeeded(inquiryRowH);
    label(0, y, 1, inquiryRowH, "Critical Error");
    value(1, y, 1, inquiryRowH, "NO", LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 6.6 });
    label(2, y, 1, inquiryRowH, "Customer\\nInquiry");
    value(3, y, 5, inquiryRowH, inquiryText, LIGHT_PURPLE, {
      align: "left",
      size: BODY_TEXT_SIZE,
      valign: "middle",
      maxLines: fitLinesForHeight(inquiryRowH, BODY_TEXT_SIZE, BODY_LINE_SPACING, 6),
      leading: BODY_LINE_SPACING,
      bold: false,
    });
    y += inquiryRowH;`,
    `    y += secondSelectionRowH;

    const inquiryText = caseItem.inquiryTh || caseItem.inquiryEn || "-";
    if (hasAppealUpdate) {
      const originalScoreText = num(caseItem.pdfOriginalScore).toFixed(2);
      const originalGradeText = safeText(caseItem.pdfOriginalGrade, grade);
      const originalKpiText = safeText(caseItem.pdfOriginalKpiStatus, reportKpiStatus);
      const resultTextColor: [number, number, number] = reportKpiStatus === "Passed"
        ? [21, 128, 61]
        : [220, 38, 38];
      const comparisonRowH = autoRowHeight(
        [
          { value: originalScoreText + " -> " + reportScore.toFixed(2), w: wOf(1), size: 6.6, padY: 4.4 },
          { value: originalGradeText + " -> " + grade, w: wOf(3), size: 7.2, padY: 4.4 },
          { value: originalKpiText + " -> " + reportKpiStatus, w: wOf(5), size: 5.9, padY: 4.4 },
          { value: safeText(caseItem.pdfReportType, "Main PDF"), w: wOf(7), size: 6.4, padY: 4.4 },
        ],
        10,
        18
      );
      const drawChangeValue = (
        col: number,
        yy: number,
        span: number,
        h: number,
        originalValue: string,
        currentValue: string,
        size: number
      ) => {
        const x = xOf(col);
        const w = wOf(col, span);
        rect(x, yy, w, h, LIGHT_PURPLE);
        setFont("bold");
        doc.setFontSize(size);
        const parts: Array<{ text: string; color: [number, number, number] }> = [
          { text: originalValue, color: [92, 92, 100] },
          { text: " -> ", color: PURPLE },
          { text: currentValue, color: resultTextColor },
        ];
        const totalWidth = parts.reduce((sum, part) => sum + doc.getTextWidth(part.text), 0);
        let textX = x + Math.max(TEXT_INNER_PAD_X, (w - totalWidth) / 2);
        const lineH = size * 0.46;
        const textY = yy + Math.max(2.2, (h - lineH) / 2 + lineH * 0.78);
        parts.forEach((part) => {
          doc.setTextColor(part.color[0], part.color[1], part.color[2]);
          doc.text(part.text, textX, textY);
          textX += doc.getTextWidth(part.text);
        });
        doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
      };
      const drawAppealAutoRow = ({
        labelText,
        text,
        size,
        leading,
        minH,
        padY,
        color,
        bold,
      }: {
        labelText: string;
        text: unknown;
        size: number;
        leading: number;
        minH: number;
        padY: number;
        color: [number, number, number];
        bold: boolean;
      }) => {
        const lines = splitTextLines(text, wOf(1, 7), size);
        let index = 0;
        while (index < lines.length) {
          if (bottom - y < minH) {
            doc.addPage();
            y = top;
          }
          const fitCount = Math.max(1, fitLinesForHeight(bottom - y, size, leading, padY));
          const chunk = lines.slice(index, index + fitCount);
          const rowH = Math.max(minH, chunk.length * lineHeight(size, leading) + padY);
          label(0, y, 1, rowH, index === 0 ? labelText : labelText + "\\n(cont.)");
          value(1, y, 7, rowH, chunk.join("\\n"), LIGHT_PURPLE, {
            size,
            valign: "top",
            maxLines: chunk.length,
            leading,
            bold,
            color,
          });
          y += rowH;
          index += chunk.length;
          if (index < lines.length) {
            doc.addPage();
            y = top;
          }
        }
      };

      addPageIfNeeded(comparisonRowH);
      label(0, y, 1, comparisonRowH, "Score");
      drawChangeValue(1, y, 1, comparisonRowH, originalScoreText, reportScore.toFixed(2), 6.6);
      label(2, y, 1, comparisonRowH, "Grade");
      drawChangeValue(3, y, 1, comparisonRowH, originalGradeText, grade, 7.2);
      label(4, y, 1, comparisonRowH, "KPI Status");
      drawChangeValue(5, y, 1, comparisonRowH, originalKpiText, reportKpiStatus, 5.9);
      label(6, y, 1, comparisonRowH, "Report Type");
      value(7, y, 1, comparisonRowH, safeText(caseItem.pdfReportType, "Main PDF"), LIGHT_PURPLE, { align: "center", valign: "middle", size: 6.4, maxLines: fitLinesForHeight(comparisonRowH, 6.4, 0.46, 4) });
      y += comparisonRowH;

      drawAppealAutoRow({
        labelText: "Customer\\nInquiry",
        text: inquiryText,
        size: BODY_TEXT_SIZE,
        leading: BODY_LINE_SPACING,
        minH: 9,
        padY: 4.4,
        color: BLACK,
        bold: false,
      });

      if (safeMultiline(caseItem.pdfAppealSummary, "")) {
        drawAppealAutoRow({
          labelText: "Appealed\\nTopic",
          text: caseItem.pdfAppealSummary,
          size: CASE_DESCRIPTION_TEXT_SIZE,
          leading: CASE_DESCRIPTION_LINE_SPACING,
          minH: 9,
          padY: 4.4,
          color: [220, 38, 38],
          bold: true,
        });
      }

      const criticalErrorRowH = 9;
      addPageIfNeeded(criticalErrorRowH);
      label(0, y, 1, criticalErrorRowH, "Critical Error");
      value(1, y, 7, criticalErrorRowH, "NO", LIGHT_PURPLE, { align: "left", valign: "middle", maxLines: 1, size: 6.6 });
      y += criticalErrorRowH;
    } else {
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

      const inquiryRowH = Math.max(12, Math.min(28, measureTextHeight(inquiryText, wOf(3, 5), BODY_TEXT_SIZE, BODY_LINE_SPACING, 5)));
      addPageIfNeeded(inquiryRowH);
      label(0, y, 1, inquiryRowH, "Critical Error");
      value(1, y, 1, inquiryRowH, "NO", LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 6.6 });
      label(2, y, 1, inquiryRowH, "Customer\\nInquiry");
      value(3, y, 5, inquiryRowH, inquiryText, LIGHT_PURPLE, {
        align: "left",
        size: BODY_TEXT_SIZE,
        valign: "middle",
        maxLines: fitLinesForHeight(inquiryRowH, BODY_TEXT_SIZE, BODY_LINE_SPACING, 6),
        leading: BODY_LINE_SPACING,
        bold: false,
      });
      y += inquiryRowH;
    }
`
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
