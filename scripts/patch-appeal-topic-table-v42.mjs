import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const marker = "appeal-topic-table-parity-v42";

function replaceOptional(source, before, after, label) {
  if (!source.includes(before)) {
    console.warn(`Appeal PDF v42 skipped missing anchor: ${label}`);
    return source;
  }
  return source.replace(before, after);
}

function patchAppealCaseStatus() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${marker}-status`)) return;

  source = replaceOptional(
    source,
    `          grade: selectedRevision.grade,\n          reviewStatus: "Revised",\n          appealStatus: "Approved",\n          commentStatus: "Approved",`,
    `          grade: selectedRevision.grade,\n          // ${marker}-status\n          reviewStatus: selectedRevision.reviewStatus,\n          appealStatus: selectedRevision.appealDecision,\n          commentStatus: selectedRevision.appealDecision,`,
    "Appeal status source"
  );
  fs.writeFileSync(appealPath, source, "utf8");
}

function patchPdfTopicTable() {
  let source = fs.readFileSync(pdfPath, "utf8");
  if (source.includes(`// ${marker}`)) return;

  source = replaceOptional(
    source,
    `  const topicWidthsAppeal = [14, 38, 14, 17, 16, 18, 52, 26];`,
    `  // ${marker}\n  const topicWidthsAppeal = [14, 44, 27, 16, 17, 20, 57];`,
    "Appeal topic widths"
  );

  source = replaceOptional(
    source,
    `    if (includeAppeal) {\n      label(6, y, 1, 8, "Evaluation Comment");\n      label(7, y, 1, 8, "Appeal Reason");\n    } else {\n      label(6, y, 1, 8, "Evaluation Comment");\n    }`,
    `    if (includeAppeal) {\n      label(6, y, 1, 8, "Appeal Reason");\n    } else {\n      label(6, y, 1, 8, "Evaluation Comment");\n    }`,
    "Appeal topic header"
  );

  source = replaceOptional(
    source,
    `  const topics = (caseItem.topics || []).filter((topic: any) => num(topic.max) > 0);`,
    `  const allTopicRows = (caseItem.topics || []).filter((topic: any) => num(topic.max) > 0);\n  const topics = includeAppeal\n    ? allTopicRows.filter((topic: any) => revisedCodes.has(topic.code))\n    : allTopicRows;\n  const nonAppealedTopics = includeAppeal\n    ? allTopicRows.filter((topic: any) => !revisedCodes.has(topic.code))\n    : [];`,
    "Appealed topic filtering"
  );

  const helper = `  const bilingualAppealTopicDescription = (code: string, labelText: unknown) => {\n    const map: { [key: string]: [string, string] } = {\n      "1": ["การปฏิบัติตามกระบวนการและนโยบาย", "Process & Policy Compliance"],\n      "2": ["คุณภาพคำตอบและการวิเคราะห์ปัญหา", "Answer Quality & Problem Analysis"],\n      "3": ["การจัดการเคสและการติดตามผล", "Case Handling & Follow-up"],\n      "4": ["ทักษะการสื่อสาร", "Communication Skills"],\n      "1.1": ["มาตรฐานการทักทายและปิดการสนทนา", "Greeting & Closing Standard"],\n      "1.2": ["การปฏิบัติตาม PDPA / Policy / ข้อกำหนด", "PDPA & Policy Compliance"],\n      "1.3": ["การปฏิบัติตามกระบวนการและ SLA", "Process & SLA Compliance"],\n      "2.1": ["ความถูกต้องของคำตอบ", "Answer Accuracy"],\n      "2.2": ["ความครบถ้วนของคำตอบ", "Answer Completeness"],\n      "2.3": ["ความชัดเจนของขั้นตอนและแหล่งอ้างอิง", "Clear Steps & Official Sources"],\n      "3.1": ["การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด", "Problem Analysis & Resolution"],\n      "3.2": ["Ownership และการแจ้ง Next Step", "Ownership & Next Step"],\n      "4.1": ["โครงสร้างข้อความและความอ่านง่าย", "Message Structure & Readability"],\n      "4.2": ["ความกระชับและความถูกต้องของภาษา", "Conciseness & Language Accuracy"],\n      "4.3": ["น้ำเสียงและความเหมาะสมตามสถานการณ์", "Tone & Context Appropriateness"],\n    };\n    const mapped = map[String(code || "").trim()];\n    return mapped ? mapped[0] + "\\n" + mapped[1] : formatDescriptionText(labelText);\n  };\n\n`;

  source = replaceOptional(source, `  topics.forEach((topic: any) => {`, `${helper}  topics.forEach((topic: any) => {`, "Bilingual helper");

  source = replaceOptional(
    source,
    `    const score = num(active.score, num(topic.score));\n    const max = num(active.max, num(topic.max));`,
    `    const originalTopicScore = num(topic.score);\n    const score = num(active.score, originalTopicScore);\n    const max = num(active.max, num(topic.max));`,
    "Original and revised topic score"
  );

  source = replaceOptional(
    source,
    `    const description = formatDescriptionText(active.label || topic.label);`,
    `    const description = includeAppeal\n      ? bilingualAppealTopicDescription(String(active.code || topic.code || ""), active.label || topic.label)\n      : formatDescriptionText(active.label || topic.label);`,
    "Bilingual description"
  );

  source = replaceOptional(
    source,
    `    const commentLines = layoutRichTextLines(comment, wOf(6), SMALL_BODY_TEXT_SIZE);\n    const appealLines = includeAppeal ? layoutRichTextLines(appealReason, wOf(7), SMALL_BODY_TEXT_SIZE) : [];`,
    `    const commentLines = includeAppeal ? [] : layoutRichTextLines(comment, wOf(6), SMALL_BODY_TEXT_SIZE);\n    const appealReasonLines = includeAppeal ? layoutRichTextLines(appealReason, wOf(6), SMALL_BODY_TEXT_SIZE) : [];\n    const evaluationComment = safeMultiline((revised && revised.rejectReason) || comment, "-");\n    const evaluationLines = includeAppeal\n      ? layoutRichTextLines(evaluationComment, wOf(6), SMALL_BODY_TEXT_SIZE).map((line) =>\n          line.map((run) => ({ ...run, color: "#dc2626" }))\n        )\n      : [];\n    const appealLines = includeAppeal\n      ? appealReasonLines.concat(\n          [[{ text: "- - - - - - - - - - - - - - -", color: "#94a3b8" }]],\n          [[{ text: "Evaluation Comment", bold: true, color: "#dc2626" }]],\n          evaluationLines\n        )\n      : [];`,
    "Merged Appeal Reason and Evaluation Comment"
  );

  source = replaceOptional(
    source,
    `      cell(2, y, 1, rowH, firstChunk ? score.toFixed(0) : "", WHITE, { size: 6.8, align: "center", valign: "middle" });`,
    `      cell(2, y, 1, rowH, firstChunk ? (includeAppeal ? "เดิม " + originalTopicScore.toFixed(0) + " → ใหม่ " + score.toFixed(0) : score.toFixed(0)) : "", WHITE, { size: includeAppeal ? 6.2 : 6.8, bold: includeAppeal, align: "center", valign: "middle", maxLines: includeAppeal ? 3 : 1 });`,
    "Score display"
  );

  source = replaceOptional(
    source,
    `      drawRichTextCell(6, y, 1, rowH, visibleComment, WHITE, SMALL_BODY_TEXT_SIZE, TOPIC_BODY_LINE_SPACING, "middle");\n\n      if (includeAppeal) {\n        drawRichTextCell(7, y, 1, rowH, visibleAppeal, WHITE, SMALL_BODY_TEXT_SIZE, TOPIC_BODY_LINE_SPACING, "middle");\n      }`,
    `      if (includeAppeal) {\n        drawRichTextCell(6, y, 1, rowH, visibleAppeal, WHITE, SMALL_BODY_TEXT_SIZE, TOPIC_BODY_LINE_SPACING, "middle");\n      } else {\n        drawRichTextCell(6, y, 1, rowH, visibleComment, WHITE, SMALL_BODY_TEXT_SIZE, TOPIC_BODY_LINE_SPACING, "middle");\n      }`,
    "Merged Appeal detail cell"
  );

  source = replaceOptional(
    source,
    `  });\n\n  return {`,
    `  });\n\n  if (includeAppeal && nonAppealedTopics.length) {\n    addPageIfNeeded(14);\n    y += 4;\n    purpleRow(y, 5, "Information");\n    y += 7;\n    nonAppealedTopics.forEach((topic: any) => {\n      const infoText = "Topic " + topic.code + "  " + safeText(topic.label) + "  - ไม่อุทธรณ์หัวข้อนี้";\n      const infoH = Math.max(8, Math.min(14, measureTextHeight(infoText, fullW, 6.4, 0.42, 4)));\n      if (y + infoH > bottom) {\n        doc.addPage();\n        y = top;\n        purpleRow(y, 5, "Information");\n        y += 7;\n      }\n      rect(left, y, fullW, infoH, WHITE);\n      writeText(infoText, left, y, fullW, infoH, { size: 6.4, valign: "middle", maxLines: 3, leading: 0.42 });\n      y += infoH;\n    });\n  }\n\n  return {`,
    "Non-appealed information"
  );

  fs.writeFileSync(pdfPath, source, "utf8");
}

patchAppealCaseStatus();
patchPdfTopicTable();
console.log("Appeal PDF topic table v42 patch completed.");
