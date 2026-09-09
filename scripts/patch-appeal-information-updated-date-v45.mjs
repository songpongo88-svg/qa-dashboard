import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const pdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");
const marker = "appeal-pdf-final-parity-v46";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    console.warn(`Appeal PDF v46 skipped missing anchor: ${label}`);
    return source;
  }
  return source.replace(before, after);
}

function replaceAllKnown(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (!count) {
    console.warn(`Appeal PDF v46 skipped missing anchor: ${label}`);
    return source;
  }
  return source.split(before).join(after);
}

function patchAppealContext() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${marker}-context`)) return;

  // Keep the real Audit Date timestamp instead of the date-only display value.
  source = replaceOnce(
    source,
    `  reviewedByName?: string;\n  // appeal-pdf-review-detail-v43-mockup\n  auditDate: string;`,
    `  reviewedByName?: string;\n  // appeal-pdf-review-detail-v43-mockup\n  auditDate: string;\n  auditDateTime?: string;\n  // ${marker}-context`,
    "AppealCaseItem auditDateTime field"
  );

  source = replaceAllKnown(
    source,
    `            const auditDate = formatDateOnly(auditRaw);`,
    `            const auditDate = formatDateOnly(auditRaw);\n            const auditDateTime = formatDateTimeOrRaw(auditRaw);`,
    "Audit Date timestamp mapping"
  );

  source = replaceAllKnown(
    source,
    `              reviewedByName,\n              auditDate,`,
    `              reviewedByName,\n              auditDate,\n              auditDateTime,`,
    "mapped auditDateTime property"
  );

  source = replaceOnce(
    source,
    `          auditTimestamp: selectedCase.auditDate,`,
    `          auditTimestamp: selectedCase.auditDateTime || selectedCase.auditDate,`,
    "PDF Audit Date timestamp context"
  );

  const remarkAnchor = `          remark: selectedRevision.appealReviewSummary || "Approved Appeal",`;
  if (source.includes(remarkAnchor)) {
    source = source.replace(
      remarkAnchor,
      `${remarkAnchor}\n          appealSubmitDateTime: selectedRevision.appealSubmitDateTime || selectedCase.appealSubmitDateTime || "-",\n          appealResultDateTime: selectedRevision.appealResultDateTime || selectedCase.appealResultDateTime || "-",\n          appealUpdatedDate: selectedRevision.appealResultDateTime || selectedCase.appealResultDateTime || "-",`
    );
  } else {
    console.warn("Appeal PDF v46 skipped missing anchor: PDF appeal timestamp context");
  }

  fs.writeFileSync(appealPath, source, "utf8");
}

function patchAuditAndUpdatedDateBlock(source) {
  if (source.includes(`// ${marker}-audit-updated`)) return source;

  const rowStartToken = `    // Row 2: Audit Date | Case Date | Final Score | Case Grade`;
  const rowStart = source.indexOf(rowStartToken);
  if (rowStart < 0) {
    console.warn("Appeal PDF v46: equal-grid Audit Date row not found.");
    return source;
  }

  const rowEndToken = `    y += appealHeaderRowH;`;
  const rowEndStart = source.indexOf(rowEndToken, rowStart);
  if (rowEndStart < 0) {
    console.warn("Appeal PDF v46: Audit Date row end not found.");
    return source;
  }
  const rowEnd = rowEndStart + rowEndToken.length;

  const replacement = `    // ${marker}-audit-updated\n    // Row 2: Audit Date + Updated Date share one equal header box.\n    const appealUpdatedDateText = safeText(\n      caseItem.appealUpdatedDate || caseItem.appealResultDateTime || "-",\n      "-"\n    );\n    const appealAuditDateText = safeText(appealAuditText, "-");\n    const appealAuditDateBlockText = appealAuditDateText + "\\n" + appealUpdatedDateText;\n    const appealAuditRowH = 14.5;\n\n    label(0, y, 1, appealAuditRowH, "Audit Date\\nUpdated Date");\n    value(1, y, 1, appealAuditRowH, appealAuditDateBlockText, LIGHT_PURPLE, {\n      align: "center",\n      valign: "middle",\n      maxLines: 2,\n      size: 5.9,\n      leading: 0.6,\n    });\n    label(2, y, 1, appealAuditRowH, "Case Date");\n    value(3, y, 1, appealAuditRowH, appealCaseDateText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.2 });\n    label(4, y, 1, appealAuditRowH, "Final Score");\n    value(5, y, 1, appealAuditRowH, reportScore.toFixed(2), LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 8.0, color: appealKpiPassed ? [5, 150, 105] : [220, 38, 38] });\n    label(6, y, 1, appealAuditRowH, "Case Grade");\n    value(7, y, 1, appealAuditRowH, grade, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 8.0, color: appealKpiPassed ? [5, 150, 105] : [220, 38, 38] });\n    y += appealAuditRowH;`;

  source = source.slice(0, rowStart) + replacement + source.slice(rowEnd);

  // Remove the older standalone Updated Date row if a previous patch inserted it in this build.
  const standaloneMarker = `    // appeal-information-updated-date-v45-updated-date`;
  const standaloneStart = source.indexOf(standaloneMarker);
  if (standaloneStart >= 0) {
    const remarkIndex = source.indexOf(`    const remarkText =`, standaloneStart);
    if (remarkIndex > standaloneStart) {
      source = source.slice(0, standaloneStart) + source.slice(remarkIndex);
    }
  }

  return source;
}

function patchAppealReviewDetailTimes(source) {
  if (source.includes(`// ${marker}-review-times`)) return source;

  const mergedStartToken = `      const mergedLines: Array<{ text: string; color: [number, number, number]; bold?: boolean }> = [`;
  const mergedStart = source.indexOf(mergedStartToken);
  if (mergedStart < 0) {
    console.warn("Appeal PDF v46: Appeal Review Detail merged-lines block not found.");
    return source;
  }

  const mergedEndToken = `      ];`;
  const mergedEndStart = source.indexOf(mergedEndToken, mergedStart);
  if (mergedEndStart < 0) {
    console.warn("Appeal PDF v46: Appeal Review Detail merged-lines end not found.");
    return source;
  }
  const mergedEnd = mergedEndStart + mergedEndToken.length;

  const replacement = `      // ${marker}-review-times\n      const appealSubmitDateText = safeText(\n        caseItem.appealSubmitDateTime || caseItem.appealSubmitDate || "-",\n        "-"\n      );\n      const appealResultDateText = safeText(\n        caseItem.appealResultDateTime || caseItem.appealUpdatedDate || "-",\n        "-"\n      );\n      const mergedLines: Array<{ text: string; color: [number, number, number]; bold?: boolean }> = [\n        ...wrapPdfText(\`Admin: \${appealAdminName}\`, mergedWidth).map((text) => ({ text, color: BLACK as [number, number, number], bold: true })),\n        ...wrapPdfText(\`Appeal Submit: \${appealSubmitDateText}\`, mergedWidth).map((text) => ({ text, color: BLACK as [number, number, number], bold: true })),\n        { text: "Appeal Reason", color: BLACK as [number, number, number], bold: true },\n        ...wrapPdfText(appealReason, mergedWidth).map((text) => ({ text, color: BLACK as [number, number, number] })),\n        { text: "- - - - - - - - - - - - - - - - - -", color: [148, 163, 184] as [number, number, number] },\n        ...wrapPdfText(\`QA: \${appealQaName}\`, mergedWidth).map((text) => ({ text, color: BLACK as [number, number, number], bold: true })),\n        ...wrapPdfText(\`Appeal Result: \${appealResultDateText}\`, mergedWidth).map((text) => ({ text, color: BLACK as [number, number, number], bold: true })),\n        { text: "Evaluation Comment", color: [220, 38, 38] as [number, number, number], bold: true },\n        ...wrapPdfText(evaluationComment, mergedWidth).map((text) => ({ text, color: [220, 38, 38] as [number, number, number] })),\n      ];`;

  return source.slice(0, mergedStart) + replacement + source.slice(mergedEnd);
}

function disableOlderInformationBlock(source) {
  const oldMarker = `  // appeal-nonappealed-information-v44-render`;
  const markerIndex = source.indexOf(oldMarker);
  if (markerIndex < 0) return source;

  const condition = `  if (includeAppeal) {`;
  const conditionIndex = source.indexOf(condition, markerIndex);
  if (conditionIndex < 0) return source;

  return source.slice(0, conditionIndex) + `  if (false && includeAppeal) {` + source.slice(conditionIndex + condition.length);
}

function patchGuaranteedInformation(source) {
  if (source.includes(`// ${marker}-information`)) return source;

  source = disableOlderInformationBlock(source);

  let insertionIndex = -1;
  const pageNumberAnchor = `  if (!suppressOutput) addOfficialPdfPageNumbers(doc);`;
  insertionIndex = source.lastIndexOf(pageNumberAnchor);

  if (insertionIndex < 0) {
    const returnAnchor = `\n  return {`;
    insertionIndex = source.lastIndexOf(returnAnchor);
  }

  if (insertionIndex < 0) {
    console.warn("Appeal PDF v46: final renderer anchor not found; Information skipped.");
    return source;
  }

  const block = `  // ${marker}-information\n  if (includeAppeal) {\n    const informationMonthKey = String(caseItem.monthKey || "");\n    const informationMaster = informationMonthKey >= "2026-06"\n      ? [\n          { code: "1", th: "การปฏิบัติตามกระบวนการและนโยบาย", en: "Process & Policy Compliance" },\n          { code: "2", th: "คุณภาพคำตอบและการวิเคราะห์ปัญหา", en: "Answer Quality & Problem Analysis" },\n          { code: "3", th: "การจัดการเคสและการติดตามผล", en: "Case Handling & Follow-up" },\n          { code: "4", th: "ทักษะการสื่อสาร", en: "Communication Skills" },\n        ]\n      : informationMonthKey >= "2026-04"\n        ? [\n            { code: "1.1", th: "มาตรฐานการทักทายและปิดการสนทนา", en: "Greeting & Closing Standard" },\n            { code: "1.2", th: "การปฏิบัติตาม PDPA / Policy / ข้อกำหนด", en: "PDPA & Policy Compliance" },\n            { code: "1.3", th: "การปฏิบัติตามกระบวนการและ SLA", en: "Process & SLA Compliance" },\n            { code: "2.1", th: "ความถูกต้องของคำตอบ", en: "Answer Accuracy" },\n            { code: "2.2", th: "ความครบถ้วนของคำตอบ", en: "Answer Completeness" },\n            { code: "2.3", th: "ความชัดเจนของขั้นตอนและแหล่งอ้างอิง", en: "Clear Steps & Official Sources" },\n            { code: "3.1", th: "การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด", en: "Problem Analysis & Resolution" },\n            { code: "3.2", th: "Ownership และการแจ้ง Next Step", en: "Ownership & Next Step" },\n            { code: "4.1", th: "โครงสร้างข้อความและความอ่านง่าย", en: "Message Structure & Readability" },\n            { code: "4.2", th: "ความกระชับและความถูกต้องของภาษา", en: "Conciseness & Language Accuracy" },\n            { code: "4.3", th: "น้ำเสียงและความเหมาะสมตามสถานการณ์", en: "Tone & Context Appropriateness" },\n          ]\n        : (caseItem.topics || [])\n            .filter((topic: any) => num(topic.max) > 0)\n            .map((topic: any) => ({\n              code: String(topic.code || "").trim(),\n              th: safeText(topic.label),\n              en: "",\n            }));\n\n    const informationTopicsV46 = informationMaster.filter((topic: any) =>\n      topic.code && !revisedCodes.has(String(topic.code).trim())\n    );\n\n    if (informationTopicsV46.length) {\n      addPageIfNeeded(15);\n      y += 4;\n      setWidths(topWidths);\n      purpleRow(y, 5, "Information");\n      y += 7;\n\n      informationTopicsV46.forEach((topic: any) => {\n        const topicName = topic.en ? topic.th + " (" + topic.en + ")" : topic.th;\n        const infoText = "Topic " + topic.code + " " + topicName + " — ไม่อุทธรณ์หัวข้อนี้";\n        const infoH = Math.max(8.5, Math.min(14, measureTextHeight(infoText, fullW, 6.4, 0.42, 4)));\n\n        if (y + infoH > bottom) {\n          doc.addPage();\n          y = top;\n          setWidths(topWidths);\n          purpleRow(y, 5, "Information");\n          y += 7;\n        }\n\n        rect(left, y, fullW, infoH, WHITE);\n        writeText(infoText, left, y, fullW, infoH, {\n          size: 6.4,\n          valign: "middle",\n          maxLines: 3,\n          leading: 0.42,\n        });\n        y += infoH;\n      });\n    }\n  }\n\n`;

  return source.slice(0, insertionIndex) + block + source.slice(insertionIndex);
}

function patchPdfRenderer() {
  let source = fs.readFileSync(pdfPath, "utf8");
  source = patchAuditAndUpdatedDateBlock(source);
  source = patchAppealReviewDetailTimes(source);
  source = patchGuaranteedInformation(source);
  fs.writeFileSync(pdfPath, source, "utf8");
}

patchAppealContext();
patchPdfRenderer();
console.log("Appeal PDF v46 applied: Audit Date with time + Updated Date in one box, Appeal submit/result timestamps, and guaranteed Information rows.");