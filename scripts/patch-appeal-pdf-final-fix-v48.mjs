import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const pdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");
const marker = "appeal-pdf-final-fix-v48";
const compactMarker = "appeal-pdf-date-stack-v49";
const scoreColumnMarker = "appeal-pdf-split-score-columns-v50";

function patchAuditTimestampSource() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${marker}-audit-source`)) return;

  const before = `            const auditTimestamp = formatDateTimeOrRaw(\n              request.auditTimestamp ||\n              (rawRow\n                ? getFirstNonEmptyValue(rawHelper, rawRow, [\n                    "Audit Timestamp",\n                    "Audit Date & Time",\n                    "Audit DateTime",\n                    "Audit Datetime",\n                    "Submitted At",\n                    "Created Date & Time",\n                  ])\n                : null) ||\n              auditRaw\n            );`;

  const after = `            // ${marker}-audit-source\n            const auditTimestampSource =\n              request.auditTimestamp ||\n              (rawRow\n                ? getFirstNonEmptyValue(rawHelper, rawRow, [\n                    "Audit Timestamp",\n                    "Audit Date & Time",\n                    "Audit DateTime",\n                    "Audit Datetime",\n                    "Submitted At",\n                    "Created Date & Time",\n                  ])\n                : null) ||\n              auditRaw;\n            const auditTimestamp = (() => {\n              const rawText = String(auditTimestampSource ?? "").trim();\n              if (/^\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\s+\\d{1,2}:\\d{2}:\\d{2}$/.test(rawText)) {\n                return rawText;\n              }\n              const parsed = parseExcelDate(auditTimestampSource);\n              if (parsed) {\n                const pad = (value) => String(value).padStart(2, "0");\n                return pad(parsed.getDate()) + "/" +\n                  pad(parsed.getMonth() + 1) + "/" +\n                  parsed.getFullYear() + " " +\n                  pad(parsed.getHours()) + ":" +\n                  pad(parsed.getMinutes()) + ":" +\n                  pad(parsed.getSeconds());\n              }\n              return formatDateTimeOrRaw(auditTimestampSource);\n            })();`;

  if (source.includes(before)) {
    source = source.replace(before, after);
  } else {
    console.warn("Appeal PDF v48: Firebase Audit Timestamp anchor not found; existing source kept.");
  }

  fs.writeFileSync(appealPath, source, "utf8");
}

function patchAppealDateTimeSeconds() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${compactMarker}-seconds`)) return;

  const before = [
    '  const min = `${dt.getMinutes()}`.padStart(2, "0");',
    '  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;',
  ].join("\n");
  const after = [
    `  // ${compactMarker}-seconds`,
    '  const min = `${dt.getMinutes()}`.padStart(2, "0");',
    '  const sec = `${dt.getSeconds()}`.padStart(2, "0");',
    '  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${sec}`;',
  ].join("\n");

  if (!source.includes(before)) {
    throw new Error("Appeal PDF v49: date-time formatter anchor not found.");
  }

  source = source.replace(before, after);
  fs.writeFileSync(appealPath, source, "utf8");
}

function disableOldInformation(source) {
  const oldMarker = `// appeal-nonappealed-information-v44-render`;
  const markerIndex = source.indexOf(oldMarker);
  if (markerIndex < 0) return source;

  const condition = `  if (includeAppeal) {`;
  const conditionIndex = source.indexOf(condition, markerIndex);
  if (conditionIndex < 0) return source;

  return source.slice(0, conditionIndex) +
    `  if (false && includeAppeal) {` +
    source.slice(conditionIndex + condition.length);
}

function patchAuditBlock(source) {
  if (source.includes(`// ${marker}-audit-box`)) return source;

  const startToken = `    // appeal-pdf-final-v47-audit-box`;
  const start = source.indexOf(startToken);
  if (start < 0) {
    console.warn("Appeal PDF v48: v47 Audit Date block not found.");
    return source;
  }

  const endToken = `    y += appealAuditRowH;`;
  const endStart = source.indexOf(endToken, start);
  if (endStart < 0) {
    console.warn("Appeal PDF v48: Audit Date block end not found.");
    return source;
  }
  const end = endStart + endToken.length;

  const replacement = `    // ${marker}-audit-box\n    // Audit Date and Updated Date stay inside the same compact label/value block.\n    const appealUpdatedDateText = safeText(\n      caseItem.appealUpdatedDate || caseItem.appealResultDateTime || "-",\n      "-"\n    );\n    const appealAuditDateText = safeText(appealAuditText, "-");\n    const appealAuditRowH = 11.2;\n    const appealAuditHalfH = appealAuditRowH / 2;\n\n    // One purple label cell containing both labels. Updated Date is forced onto one line.\n    rect(xOf(0), y, wOf(0), appealAuditRowH, PURPLE);\n    setFont("bold");\n    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);\n    doc.setFontSize(5.4);\n    doc.text("Audit Date", xOf(0) + wOf(0) / 2, y + 3.6, { align: "center" });\n    doc.setFontSize(4.7);\n    doc.text("Updated Date", xOf(0) + wOf(0) / 2, y + 8.2, { align: "center" });\n\n    // One value cell containing the corresponding two timestamps.\n    rect(xOf(1), y, wOf(1), appealAuditRowH, LIGHT_PURPLE);\n    writeText(appealAuditDateText, xOf(1), y, wOf(1), appealAuditHalfH, {\n      bold: true,\n      size: 5.6,\n      align: "center",\n      valign: "middle",\n      maxLines: 1,\n    });\n    writeText(appealUpdatedDateText, xOf(1), y + appealAuditHalfH, wOf(1), appealAuditHalfH, {\n      bold: true,\n      size: 5.6,\n      align: "center",\n      valign: "middle",\n      maxLines: 1,\n    });\n\n    label(2, y, 1, appealAuditRowH, "Case Date");\n    value(3, y, 1, appealAuditRowH, appealCaseDateText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.2 });\n    label(4, y, 1, appealAuditRowH, "Final Score");\n    value(5, y, 1, appealAuditRowH, reportScore.toFixed(2), LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 8.0, color: appealKpiPassed ? [5, 150, 105] : [220, 38, 38] });\n    label(6, y, 1, appealAuditRowH, "Case Grade");\n    value(7, y, 1, appealAuditRowH, grade, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 8.0, color: appealKpiPassed ? [5, 150, 105] : [220, 38, 38] });\n    y += appealAuditRowH;`;

  return source.slice(0, start) + replacement + source.slice(end);
}

function patchTightDateStack(source) {
  if (source.includes(`// ${compactMarker}-audit-stack`)) return source;

  const startToken = `    // ${marker}-audit-box`;
  const start = source.indexOf(startToken);
  const endToken = `    label(2, y, 1, appealAuditRowH, "Case Date");`;
  const end = source.indexOf(endToken, start);

  if (start < 0 || end < 0) {
    throw new Error("Appeal PDF v49: combined Audit/Updated Date block not found.");
  }

  const replacement = `    // ${marker}-audit-box\n    // ${compactMarker}-audit-stack\n    // Render the two date rows as one tightly stacked, vertically centered group.\n    const appealUpdatedDateText = safeText(\n      caseItem.appealUpdatedDate || caseItem.appealResultDateTime || "-",\n      "-"\n    );\n    const appealAuditDateText = safeText(appealAuditText, "-");\n    const appealAuditRowH = 10.5;\n    const appealAuditLineOneY = y + 4.1;\n    const appealAuditLineTwoY = y + 6.7;\n\n    rect(xOf(0), y, wOf(0), appealAuditRowH, PURPLE);\n    setFont("bold");\n    doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);\n    doc.setFontSize(5.2);\n    doc.text("Audit Date", xOf(0) + wOf(0) / 2, appealAuditLineOneY, { align: "center" });\n    doc.setFontSize(4.7);\n    doc.text("Updated Date", xOf(0) + wOf(0) / 2, appealAuditLineTwoY, { align: "center" });\n\n    rect(xOf(1), y, wOf(1), appealAuditRowH, LIGHT_PURPLE);\n    setFont("bold");\n    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);\n    doc.setFontSize(5.4);\n    doc.text(appealAuditDateText, xOf(1) + wOf(1) / 2, appealAuditLineOneY, { align: "center" });\n    doc.text(appealUpdatedDateText, xOf(1) + wOf(1) / 2, appealAuditLineTwoY, { align: "center" });\n\n`;

  return source.slice(0, start) + replacement + source.slice(end);
}

function patchSplitAppealScoreColumns(source) {
  if (source.includes(`// ${scoreColumnMarker}`)) return source;

  const widthBefore = `  const topicWidthsAppeal = [14, 44, 27, 16, 17, 20, 57];`;
  const widthAfter = `  // ${scoreColumnMarker}\n  const topicWidthsAppeal = [12, 40, 18, 18, 13, 15, 17, 62];`;
  if (!source.includes(widthBefore)) {
    throw new Error("Appeal PDF v50: appeal topic width anchor not found.");
  }
  source = source.replace(widthBefore, widthAfter);

  const headerStartToken = `  const drawTopicHeader = () => {`;
  const headerEndToken = `  const newTopicPage = () => {`;
  const headerStart = source.indexOf(headerStartToken);
  const headerEnd = source.indexOf(headerEndToken, headerStart);
  if (headerStart < 0 || headerEnd < 0) {
    throw new Error("Appeal PDF v50: topic header block not found.");
  }

  const headerReplacement = `  const drawTopicHeader = () => {\n    if (includeAppeal) {\n      setWidths(topicWidthsAppeal);\n      label(0, y, 1, 8, "Topic");\n      label(1, y, 1, 8, "Description");\n      label(2, y, 1, 8, "Original Score");\n      label(3, y, 1, 8, "New Score");\n      label(4, y, 1, 8, "Max");\n      label(5, y, 1, 8, "Score %");\n      label(6, y, 1, 8, "Status");\n      label(7, y, 1, 8, "Appeal Review Detail");\n    } else {\n      setWidths(topicWidthsOriginal);\n      label(0, y, 1, 8, "Topic");\n      label(1, y, 1, 8, "Description");\n      label(2, y, 1, 8, "Score");\n      label(3, y, 1, 8, "Max");\n      label(4, y, 1, 8, "Score %");\n      label(5, y, 1, 8, "Status");\n      label(6, y, 1, 8, "Evaluation Comment");\n    }\n    y += 8;\n  };\n\n`;
  source = source.slice(0, headerStart) + headerReplacement + source.slice(headerEnd);

  const topicStart = source.indexOf(`  const revisedMap = new Map(`);
  const topicEnd = source.indexOf(`  // ${marker}-information`, topicStart);
  if (topicStart < 0 || topicEnd < 0) {
    throw new Error("Appeal PDF v50: detailed topic rendering section not found.");
  }

  let topicSection = source.slice(topicStart, topicEnd);
  const loopAnchor = `  topics.forEach((topic: any) => {`;
  if (!topicSection.includes(loopAnchor)) {
    throw new Error("Appeal PDF v50: topic loop anchor not found.");
  }
  topicSection = topicSection.replace(
    loopAnchor,
    `  const topicDetailColumn = includeAppeal ? 7 : 6;\n\n${loopAnchor}`
  );
  topicSection = topicSection.replaceAll(`wOf(6)`, `wOf(topicDetailColumn)`);

  const scoreStart = topicSection.indexOf(`      cell(2, y, 1, rowH,`);
  const detailStart = topicSection.indexOf(
    `      if (includeAppeal) {\n        drawRichTextCell(6,`,
    scoreStart
  );
  if (scoreStart < 0 || detailStart < 0) {
    throw new Error("Appeal PDF v50: combined score row block not found.");
  }

  const scoreReplacement = `      if (includeAppeal) {\n        cell(2, y, 1, rowH, firstChunk ? originalTopicScore.toFixed(0) : "", WHITE, {\n          size: 6.8,\n          align: "center",\n          valign: "middle",\n          maxLines: 1,\n        });\n        cell(3, y, 1, rowH, firstChunk ? score.toFixed(0) : "", WHITE, {\n          size: 7.0,\n          bold: true,\n          align: "center",\n          valign: "middle",\n          maxLines: 1,\n        });\n        cell(4, y, 1, rowH, firstChunk ? max.toFixed(0) : "", SCORE_GREY, { size: 6.8, align: "center", valign: "middle" });\n        cell(5, y, 1, rowH, firstChunk ? formatPct(pct) : "", pctFill(pct), { size: 6.8, align: "center", valign: "middle" });\n        cell(6, y, 1, rowH, firstChunk ? statusByPct(pct) : "", WHITE, { size: 6.4, align: "center", valign: "middle", maxLines: 2 });\n      } else {\n        cell(2, y, 1, rowH, firstChunk ? score.toFixed(0) : "", WHITE, { size: 6.8, align: "center", valign: "middle", maxLines: 1 });\n        cell(3, y, 1, rowH, firstChunk ? max.toFixed(0) : "", SCORE_GREY, { size: 6.8, align: "center", valign: "middle" });\n        cell(4, y, 1, rowH, firstChunk ? formatPct(pct) : "", pctFill(pct), { size: 6.8, align: "center", valign: "middle" });\n        cell(5, y, 1, rowH, firstChunk ? statusByPct(pct) : "", WHITE, { size: 6.4, align: "center", valign: "middle", maxLines: 2 });\n      }\n\n`;
  topicSection =
    topicSection.slice(0, scoreStart) +
    scoreReplacement +
    topicSection.slice(detailStart);
  topicSection = topicSection.replace(
    `drawRichTextCell(6, y, 1, rowH, visibleAppeal`,
    `drawRichTextCell(7, y, 1, rowH, visibleAppeal`
  );

  return source.slice(0, topicStart) + topicSection + source.slice(topicEnd);
}

function patchGuaranteedInformation(source) {
  if (source.includes(`// ${marker}-information`)) return source;

  source = disableOldInformation(source);

  let insertionIndex = source.lastIndexOf(`  if (!suppressOutput) addOfficialPdfPageNumbers(doc);`);
  if (insertionIndex < 0) {
    insertionIndex = source.lastIndexOf(`\n  return {`);
  }
  if (insertionIndex < 0) {
    console.warn("Appeal PDF v48: final PDF anchor not found; Information skipped.");
    return source;
  }

  const block = `  // ${marker}-information\n  if (includeAppeal) {\n    const informationMonthKeyV48 = String(caseItem.monthKey || "");\n    const informationMasterV48 = informationMonthKeyV48 >= "2026-06"\n      ? [\n          { code: "1", th: "การปฏิบัติตามกระบวนการและนโยบาย", en: "Process & Policy Compliance" },\n          { code: "2", th: "คุณภาพคำตอบและการวิเคราะห์ปัญหา", en: "Answer Quality & Problem Analysis" },\n          { code: "3", th: "การจัดการเคสและการติดตามผล", en: "Case Handling & Follow-up" },\n          { code: "4", th: "ทักษะการสื่อสาร", en: "Communication Skills" },\n        ]\n      : informationMonthKeyV48 >= "2026-04"\n        ? [\n            { code: "1.1", th: "มาตรฐานการทักทายและปิดการสนทนา", en: "Greeting & Closing Standard" },\n            { code: "1.2", th: "การปฏิบัติตาม PDPA / Policy / ข้อกำหนด", en: "PDPA & Policy Compliance" },\n            { code: "1.3", th: "การปฏิบัติตามกระบวนการและ SLA", en: "Process & SLA Compliance" },\n            { code: "2.1", th: "ความถูกต้องของคำตอบ", en: "Answer Accuracy" },\n            { code: "2.2", th: "ความครบถ้วนของคำตอบ", en: "Answer Completeness" },\n            { code: "2.3", th: "ความชัดเจนของขั้นตอนและแหล่งอ้างอิง", en: "Clear Steps & Official Sources" },\n            { code: "3.1", th: "การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด", en: "Problem Analysis & Resolution" },\n            { code: "3.2", th: "Ownership และการแจ้ง Next Step", en: "Ownership & Next Step" },\n            { code: "4.1", th: "โครงสร้างข้อความและความอ่านง่าย", en: "Message Structure & Readability" },\n            { code: "4.2", th: "ความกระชับและความถูกต้องของภาษา", en: "Conciseness & Language Accuracy" },\n            { code: "4.3", th: "น้ำเสียงและความเหมาะสมตามสถานการณ์", en: "Tone & Context Appropriateness" },\n          ]\n        : (caseItem.topics || [])\n            .filter((topic: any) => num(topic.max) > 0)\n            .map((topic: any) => ({\n              code: String(topic.code || "").trim(),\n              th: safeText(topic.label),\n              en: "",\n            }));\n\n    const informationTopicsV48 = informationMasterV48.filter((topic: any) =>\n      topic.code && !revisedCodes.has(String(topic.code).trim())\n    );\n\n    if (informationTopicsV48.length) {\n      addPageIfNeeded(14);\n      y += 2;\n      setWidths(topWidths);\n      purpleRow(y, 5, "Information");\n      y += 5.6;\n\n      informationTopicsV48.forEach((topic: any) => {\n        const topicName = topic.en ? topic.th + " (" + topic.en + ")" : topic.th;\n        const infoText = "Topic " + topic.code + " " + topicName + " — ไม่อุทธรณ์หัวข้อนี้";\n        const infoH = Math.max(4.2, Math.min(10, measureTextHeight(infoText, fullW, 6.4, 0.38, 1.2)));\n\n        if (y + infoH > bottom) {\n          doc.addPage();\n          y = top;\n          setWidths(topWidths);\n          purpleRow(y, 5, "Information");\n          y += 5.6;\n        }\n\n        // Plain red text only: no cell, no border, no table.\n        writeText(infoText, left, y, fullW, infoH, {\n          size: 6.4,\n          color: [220, 38, 38],\n          valign: "middle",\n          maxLines: 3,\n          leading: 0.38,\n        });\n        y += infoH + 0.2;\n      });\n    }\n  }\n\n`;

  return source.slice(0, insertionIndex) + block + source.slice(insertionIndex);
}

function patchPdfRenderer() {
  let source = fs.readFileSync(pdfPath, "utf8");
  source = patchAuditBlock(source);
  source = patchTightDateStack(source);
  source = patchGuaranteedInformation(source);
  source = patchSplitAppealScoreColumns(source);
  fs.writeFileSync(pdfPath, source, "utf8");
}

patchAuditTimestampSource();
patchAppealDateTimeSeconds();
patchPdfRenderer();
console.log("Appeal PDF v50 applied: separate Original Score and New Score columns in Detailed Topic Scores.");
