import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const pdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");
const marker = "appeal-information-updated-date-v45";

function patchAppealContext() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${marker}-context`)) return;

  const anchor = `          remark: selectedRevision.appealReviewSummary || "Approved Appeal",`;
  if (!source.includes(anchor)) {
    throw new Error("Appeal PDF v45: PDF context anchor not found.");
  }

  source = source.replace(
    anchor,
    `${anchor}\n          // ${marker}-context\n          appealUpdatedDate: selectedRevision.appealResultDateTime || selectedCase.appealResultDateTime || "-",`
  );

  fs.writeFileSync(appealPath, source, "utf8");
}

function patchUpdatedDateRow(source) {
  if (source.includes(`// ${marker}-updated-date`)) return source;

  const anchor = `    label(6, y, 1, appealHeaderRowH, "Report Version");\n    value(7, y, 1, appealHeaderRowH, appealReportVersion, LIGHT_PURPLE, { align: "center", valign: "middle", maxLines: 2, size: appealHeaderValueSize });\n    y += appealHeaderRowH;`;

  if (!source.includes(anchor)) {
    throw new Error("Appeal PDF v45: equal-grid Report Version anchor not found.");
  }

  const replacement = `${anchor}\n\n    // ${marker}-updated-date\n    const appealUpdatedDateText = safeText(\n      caseItem.appealUpdatedDate || caseItem.appealResultDateTime || caseItem.updatedDate || "-",\n      "-"\n    );\n    const appealUpdatedRowH = 8.5;\n    label(0, y, 1, appealUpdatedRowH, "Updated Date");\n    value(1, y, 7, appealUpdatedRowH, appealUpdatedDateText, LIGHT_PURPLE, {\n      align: "left",\n      valign: "middle",\n      maxLines: 1,\n      size: 6.5,\n    });\n    y += appealUpdatedRowH;`;

  return source.replace(anchor, replacement);
}

function patchGuaranteedInformation(source) {
  if (source.includes(`// ${marker}-information`)) return source;

  const returnToken = `\n  return {\n    blob: doc.output("blob"),`;
  const returnIndex = source.lastIndexOf(returnToken);
  if (returnIndex < 0) {
    throw new Error("Appeal PDF v45: final PDF return anchor not found.");
  }

  // Remove the older optional Information block immediately before return, if present,
  // so the report can never show duplicated non-appealed topic information.
  const oldInfoStartToken = `\n  if (includeAppeal && nonAppealedTopics.length) {`;
  const oldInfoStart = source.lastIndexOf(oldInfoStartToken, returnIndex);
  let insertionIndex = returnIndex;
  if (oldInfoStart >= 0) {
    source = source.slice(0, oldInfoStart) + source.slice(returnIndex);
    insertionIndex = oldInfoStart;
  }

  const block = `\n\n  // ${marker}-information\n  if (includeAppeal) {\n    const explicitNonAppealedTopics = Array.isArray(caseItem.nonAppealedTopics)\n      ? caseItem.nonAppealedTopics\n      : [];\n    const informationTopics = explicitNonAppealedTopics.length\n      ? explicitNonAppealedTopics\n      : (caseItem.topics || []).filter((topic: any) =>\n          num(topic.max) > 0 && !revisedCodes.has(String(topic.code || "").trim())\n        );\n\n    if (informationTopics.length) {\n      const informationTopicNames: Record<string, [string, string]> = {\n        "1": ["การปฏิบัติตามกระบวนการและนโยบาย", "Process & Policy Compliance"],\n        "2": ["คุณภาพคำตอบและการวิเคราะห์ปัญหา", "Answer Quality & Problem Analysis"],\n        "3": ["การจัดการเคสและการติดตามผล", "Case Handling & Follow-up"],\n        "4": ["ทักษะการสื่อสาร", "Communication Skills"],\n        "1.1": ["มาตรฐานการทักทายและปิดการสนทนา", "Greeting & Closing Standard"],\n        "1.2": ["การปฏิบัติตาม PDPA / Policy / ข้อกำหนด", "PDPA & Policy Compliance"],\n        "1.3": ["การปฏิบัติตามกระบวนการและ SLA", "Process & SLA Compliance"],\n        "2.1": ["ความถูกต้องของคำตอบ", "Answer Accuracy"],\n        "2.2": ["ความครบถ้วนของคำตอบ", "Answer Completeness"],\n        "2.3": ["ความชัดเจนของขั้นตอนและแหล่งอ้างอิง", "Clear Steps & Official Sources"],\n        "3.1": ["การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด", "Problem Analysis & Resolution"],\n        "3.2": ["Ownership และการแจ้ง Next Step", "Ownership & Next Step"],\n        "4.1": ["โครงสร้างข้อความและความอ่านง่าย", "Message Structure & Readability"],\n        "4.2": ["ความกระชับและความถูกต้องของภาษา", "Conciseness & Language Accuracy"],\n        "4.3": ["น้ำเสียงและความเหมาะสมตามสถานการณ์", "Tone & Context Appropriateness"],\n      };\n\n      addPageIfNeeded(15);\n      y += 4;\n      purpleRow(y, 5, "Information");\n      y += 7;\n\n      informationTopics.forEach((topic: any) => {\n        const code = String(topic.code || "").trim();\n        const mapped = informationTopicNames[code];\n        const topicName = mapped\n          ? mapped[0] + " (" + mapped[1] + ")"\n          : safeText(topic.label);\n        const infoText = "Topic " + code + " " + topicName + " — ไม่อุทธรณ์หัวข้อนี้";\n        const infoH = Math.max(8.5, Math.min(14, measureTextHeight(infoText, fullW, 6.4, 0.42, 4)));\n\n        if (y + infoH > bottom) {\n          doc.addPage();\n          y = top;\n          purpleRow(y, 5, "Information");\n          y += 7;\n        }\n\n        rect(left, y, fullW, infoH, WHITE);\n        writeText(infoText, left, y, fullW, infoH, {\n          size: 6.4,\n          valign: "middle",\n          maxLines: 3,\n          leading: 0.42,\n        });\n        y += infoH;\n      });\n    }\n  }`;

  return source.slice(0, insertionIndex) + block + source.slice(insertionIndex);
}

function patchPdfRenderer() {
  let source = fs.readFileSync(pdfPath, "utf8");
  source = patchUpdatedDateRow(source);
  source = patchGuaranteedInformation(source);
  fs.writeFileSync(pdfPath, source, "utf8");
}

patchAppealContext();
patchPdfRenderer();
console.log("Appeal PDF v45: guaranteed non-appealed Information rows and Added Updated Date.");