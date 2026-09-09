import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealRequestsPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const pdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");
const marker = "appeal-pdf-final-v47";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    console.warn(`Appeal PDF v47 skipped missing anchor: ${label}`);
    return source;
  }
  return source.replace(before, after);
}

function patchAppealRequests() {
  let source = fs.readFileSync(appealRequestsPath, "utf8");
  if (source.includes(`// ${marker}-requests`)) return;

  source = replaceOnce(
    source,
    `  auditDate: string;\n  weekLabel: string;`,
    `  auditDate: string;\n  auditTimestamp?: string;\n  // ${marker}-requests\n  weekLabel: string;`,
    "AppealRequest auditTimestamp field"
  );

  source = replaceOnce(
    source,
    `        auditDate: String(log.details?.auditDate || ""),\n        weekLabel: String(log.details?.weekLabel || ""),`,
    `        auditDate: String(log.details?.auditDate || ""),\n        auditTimestamp: String(\n          log.details?.auditTimestamp ||\n          log.details?.evaluationAuditDate ||\n          log.details?.auditDate ||\n          ""\n        ),\n        weekLabel: String(log.details?.weekLabel || ""),`,
    "AppealRequest auditTimestamp mapping"
  );

  fs.writeFileSync(appealRequestsPath, source, "utf8");
}

function patchAppealMockup() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${marker}-mockup`)) return;

  source = replaceOnce(
    source,
    `  auditDate: string;\n  auditDateObj: Date | null;`,
    `  auditDate: string;\n  auditTimestamp?: string;\n  // ${marker}-mockup\n  auditDateObj: Date | null;`,
    "AppealCaseItem auditTimestamp field"
  );

  const firebaseAuditAnchor = `            const auditRaw = rawRow ? rawHelper.getValue(rawRow, "Audit Date") : request.auditDate;`;
  if (source.includes(firebaseAuditAnchor)) {
    source = source.replace(
      firebaseAuditAnchor,
      `${firebaseAuditAnchor}\n            const auditTimestamp = formatDateTimeOrRaw(\n              request.auditTimestamp ||\n              (rawRow\n                ? getFirstNonEmptyValue(rawHelper, rawRow, [\n                    "Audit Timestamp",\n                    "Audit Date & Time",\n                    "Audit DateTime",\n                    "Audit Datetime",\n                    "Submitted At",\n                    "Created Date & Time",\n                  ])\n                : null) ||\n              auditRaw\n            );`
    );
  } else {
    console.warn("Appeal PDF v47 skipped missing anchor: Firebase audit timestamp source");
  }

  const firebaseReturnStart = source.indexOf(`key: \`firebase-appeal-`);
  if (firebaseReturnStart >= 0) {
    const returnAnchor = `              auditDate,\n              auditDateObj,`;
    const returnIndex = source.indexOf(returnAnchor, firebaseReturnStart);
    if (returnIndex >= 0) {
      source =
        source.slice(0, returnIndex) +
        `              auditDate,\n              auditTimestamp,\n              auditDateObj,` +
        source.slice(returnIndex + returnAnchor.length);
    } else {
      console.warn("Appeal PDF v47 skipped missing anchor: Firebase auditTimestamp property");
    }
  }

  source = replaceOnce(
    source,
    `          auditTimestamp: selectedCase.auditDate,`,
    `          auditTimestamp: selectedCase.auditTimestamp || selectedCase.auditDate,`,
    "PDF auditTimestamp source"
  );

  const remarkAnchor = `          remark: selectedRevision.appealReviewSummary || "Approved Appeal",`;
  if (source.includes(remarkAnchor)) {
    source = source.replace(
      remarkAnchor,
      `${remarkAnchor}\n          appealSubmitDateTime: selectedRevision.appealSubmitDateTime || selectedCase.appealSubmitDateTime || "-",\n          appealResultDateTime: selectedRevision.appealResultDateTime || selectedCase.appealResultDateTime || "-",\n          appealUpdatedDate: selectedRevision.appealResultDateTime || selectedCase.appealResultDateTime || "-",`
    );
  } else {
    console.warn("Appeal PDF v47 skipped missing anchor: Appeal PDF timestamp context");
  }

  fs.writeFileSync(appealPath, source, "utf8");
}

function patchAuditBox(source) {
  if (source.includes(`// ${marker}-audit-box`)) return source;

  const startToken = `    // Row 2: Audit Date | Case Date | Final Score | Case Grade`;
  const start = source.indexOf(startToken);
  if (start < 0) {
    console.warn("Appeal PDF v47: Audit Date row not found.");
    return source;
  }

  const endToken = `    y += appealHeaderRowH;`;
  const endStart = source.indexOf(endToken, start);
  if (endStart < 0) {
    console.warn("Appeal PDF v47: Audit Date row end not found.");
    return source;
  }
  const end = endStart + endToken.length;

  const replacement = `    // ${marker}-audit-box\n    // Keep Audit Date and Updated Date in one block while preserving the equal header grid.\n    const appealUpdatedDateText = safeText(\n      caseItem.appealUpdatedDate || caseItem.appealResultDateTime || "-",\n      "-"\n    );\n    const appealAuditDateText = safeText(appealAuditText, "-");\n    const appealAuditBlockText =\n      appealAuditDateText + "\\nUpdated Date: " + appealUpdatedDateText;\n    const appealAuditRowH = 14.5;\n\n    label(0, y, 1, appealAuditRowH, "Audit Date");\n    value(1, y, 1, appealAuditRowH, appealAuditBlockText, LIGHT_PURPLE, {\n      align: "center",\n      valign: "middle",\n      maxLines: 2,\n      size: 5.0,\n      leading: 0.5,\n    });\n    label(2, y, 1, appealAuditRowH, "Case Date");\n    value(3, y, 1, appealAuditRowH, appealCaseDateText, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: 6.2 });\n    label(4, y, 1, appealAuditRowH, "Final Score");\n    value(5, y, 1, appealAuditRowH, reportScore.toFixed(2), LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 8.0, color: appealKpiPassed ? [5, 150, 105] : [220, 38, 38] });\n    label(6, y, 1, appealAuditRowH, "Case Grade");\n    value(7, y, 1, appealAuditRowH, grade, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 1, size: 8.0, color: appealKpiPassed ? [5, 150, 105] : [220, 38, 38] });\n    y += appealAuditRowH;`;

  return source.slice(0, start) + replacement + source.slice(end);
}

function patchReviewDetailTimes(source) {
  if (source.includes(`// ${marker}-review-times`)) return source;

  const evaluationAnchor = `    const evaluationComment = safeMultiline((revised && revised.rejectReason) || comment, "-");`;
  if (!source.includes(evaluationAnchor)) {
    console.warn("Appeal PDF v47: Evaluation Comment anchor not found.");
    return source;
  }

  source = source.replace(
    evaluationAnchor,
    `    // ${marker}-review-times\n    const appealSubmitDateText = safeText(\n      caseItem.appealSubmitDateTime || caseItem.appealSubmitDate || "-",\n      "-"\n    );\n    const appealResultDateText = safeText(\n      caseItem.appealResultDateTime || caseItem.appealUpdatedDate || "-",\n      "-"\n    );\n    const appealSubmitLines = includeAppeal\n      ? layoutRichTextLines(\`Appeal Submit: \${appealSubmitDateText}\`, wOf(6), SMALL_BODY_TEXT_SIZE).map((line) =>\n          line.map((run) => ({ ...run, bold: true, color: "#000000" }))\n        )\n      : [];\n    const appealResultLines = includeAppeal\n      ? layoutRichTextLines(\`Appeal Result: \${appealResultDateText}\`, wOf(6), SMALL_BODY_TEXT_SIZE).map((line) =>\n          line.map((run) => ({ ...run, bold: true, color: "#000000" }))\n        )\n      : [];\n    const evaluationComment = safeMultiline((revised && revised.rejectReason) || comment, "-");`
  );

  source = replaceOnce(
    source,
    `      ? appealAdminLines.concat(\n          [[{ text: "Appeal Reason", bold: true, color: "#000000" }]],`,
    `      ? appealAdminLines.concat(\n          appealSubmitLines,\n          [[{ text: "Appeal Reason", bold: true, color: "#000000" }]],`,
    "Appeal Submit line insertion"
  );

  source = replaceOnce(
    source,
    `          appealQaLines,\n          [[{ text: "Evaluation Comment", bold: true, color: "#dc2626" }]],`,
    `          appealQaLines,\n          appealResultLines,\n          [[{ text: "Evaluation Comment", bold: true, color: "#dc2626" }]],`,
    "Appeal Result line insertion"
  );

  return source;
}

function patchInformationStyle(source) {
  if (source.includes(`// ${marker}-information-style`)) return source;

  const markerIndex = source.indexOf(`// appeal-nonappealed-information-v44-render`);
  if (markerIndex < 0) {
    console.warn("Appeal PDF v47: Information block marker not found.");
    return source;
  }

  const returnIndex = source.indexOf(`\n\n  return {`, markerIndex);
  if (returnIndex < 0) {
    console.warn("Appeal PDF v47: Information block end not found.");
    return source;
  }

  let block = source.slice(markerIndex, returnIndex);
  block = block.replace(
    `        rect(left, y, fullW, infoH, WHITE);\n        writeText(infoText, left, y, fullW, infoH, {`,
    `        // ${marker}-information-style\n        writeText(infoText, left, y, fullW, infoH, {`
  );
  block = block.replace(
    `          leading: 0.42,\n        });\n        y += infoH;`,
    `          leading: 0.42,\n          color: [220, 38, 38],\n        });\n        y += infoH + 0.8;`
  );

  return source.slice(0, markerIndex) + block + source.slice(returnIndex);
}

function patchPdfRenderer() {
  let source = fs.readFileSync(pdfPath, "utf8");
  source = patchAuditBox(source);
  source = patchReviewDetailTimes(source);
  source = patchInformationStyle(source);
  fs.writeFileSync(pdfPath, source, "utf8");
}

patchAppealRequests();
patchAppealMockup();
patchPdfRenderer();
console.log("Appeal PDF v47 applied: real Audit timestamp, Appeal Submit/Result times, inline Updated Date, and red text-only Information.");
