import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appealRequestsPath = path.join(root, "src", "AppealRequestsMockup.tsx");
const appealPath = path.join(root, "src", "AppealMockup.tsx");
const pdfPath = path.join(root, "src", "caseDetailOfficialPdf.ts");
const marker = "appeal-pdf-review-detail-v43";

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Appeal PDF v43 anchor not found: ${label}`);
  }
  return source.replace(before, after);
}

function patchAppealRequests() {
  let source = fs.readFileSync(appealRequestsPath, "utf8");
  if (source.includes(`// ${marker}-requests`)) return;

  source = replaceOnce(
    source,
    `  reviewSummary?: string;\n  reviewedAt?: string;\n  submittedByUsername?: string;`,
    `  reviewSummary?: string;\n  reviewedAt?: string;\n  reviewedBy?: string;\n  reviewedByUsername?: string;\n  submittedByUsername?: string;\n  // ${marker}-requests`,
    "AppealRequest reviewer fields"
  );

  source = replaceOnce(
    source,
    `        reviewSummary: String(review?.details?.reviewSummary || ""),\n        reviewedAt: String(review?.details?.reviewedAt || review?.created_at || ""),\n        submittedByUsername: String(log.details?.submittedByUsername || ""),\n        topics: appealedTopics,`,
    `        reviewSummary: String(review?.details?.reviewSummary || ""),\n        reviewedAt: String(review?.details?.reviewedAt || review?.created_at || ""),\n        reviewedBy: String(review?.details?.reviewedBy || review?.display_name || ""),\n        reviewedByUsername: String(review?.details?.reviewedByUsername || review?.username || ""),\n        submittedByUsername: String(log.details?.submittedByUsername || log.username || ""),\n        topics: appealedTopics,`,
    "buildAppealRequests reviewer identity"
  );

  fs.writeFileSync(appealRequestsPath, source, "utf8");
}

function patchAppealMockup() {
  let source = fs.readFileSync(appealPath, "utf8");
  if (source.includes(`// ${marker}-mockup`)) return;

  source = replaceOnce(
    source,
    `  agent: string;\n  auditDate: string;`,
    `  agent: string;\n  teamName?: string;\n  submittedByName?: string;\n  reviewedByName?: string;\n  // ${marker}-mockup\n  auditDate: string;`,
    "AppealCaseItem identity fields"
  );

  // Static/ROW_DATA mapping: enrich from the original evaluated row and any exported Appeal columns.
  const staticAgentAnchor = `            const agent = toTitleCaseName(rawAgent);\n\n            const inquiry = rawRow`;
  const staticAgentReplacement = `            const agent = toTitleCaseName(rawAgent);\n            const teamName = String(\n              rawRow\n                ? rawHelper.getValue(rawRow, "Team Name") ??\n                  rawHelper.getValue(rawRow, "Team") ??\n                  rawHelper.getValue(rawRow, "Agent Team") ??\n                  rawHelper.getValue(rawRow, "Team Label") ??\n                  ""\n                : appealHelper.getValue(row, "Team Name") ??\n                  appealHelper.getValue(row, "Team") ??\n                  appealHelper.getValue(row, "Agent Team") ??\n                  ""\n            ).trim();\n            const submittedByName = String(\n              getFirstNonEmptyValue(appealHelper, row, [\n                "Submitted By Username",\n                "Appeal Submitted By Username",\n                "Submitted By",\n                "Appeal Submitted By",\n                "Requester Username",\n                "Requester",\n              ]) ?? ""\n            ).trim();\n            const reviewedByName = String(\n              getFirstNonEmptyValue(appealHelper, row, [\n                "Reviewed By Username",\n                "Appeal Reviewed By Username",\n                "Reviewed By",\n                "Appeal Reviewed By",\n                "Reviewer Username",\n                "Reviewer",\n                "QA Reviewer",\n              ]) ?? ""\n            ).trim();\n\n            const inquiry = rawRow`;
  source = replaceOnce(source, staticAgentAnchor, staticAgentReplacement, "static Team/login names");

  const staticReturnAnchor = `              caseId,\n              agent,\n              auditDate,`;
  source = replaceOnce(
    source,
    staticReturnAnchor,
    `              caseId,\n              agent,\n              teamName,\n              submittedByName,\n              reviewedByName,\n              auditDate,`,
    "static mapped identity properties"
  );

  // Firebase mapping: use the original case row for Team and exact login usernames from appeal events.
  const firebaseAgentAnchor = `            const agent = toTitleCaseName(rawAgent);\n\n            const inquiry = rawRow`;
  const firebaseAgentIndex = source.indexOf(firebaseAgentAnchor, source.indexOf(staticAgentReplacement) + staticAgentReplacement.length);
  if (firebaseAgentIndex < 0) {
    throw new Error("Appeal PDF v43 anchor not found: Firebase Team/login names");
  }
  const firebaseAgentReplacement = `            const agent = toTitleCaseName(rawAgent);\n            const teamName = String(\n              rawRow\n                ? rawHelper.getValue(rawRow, "Team Name") ??\n                  rawHelper.getValue(rawRow, "Team") ??\n                  rawHelper.getValue(rawRow, "Agent Team") ??\n                  rawHelper.getValue(rawRow, "Team Label") ??\n                  ""\n                : request.teamName ?? request.team ?? ""\n            ).trim();\n            const submittedByName = String(\n              request.submittedByUsername || request.submittedBy || ""\n            ).trim();\n            const reviewedByName = String(\n              request.reviewedByUsername || request.reviewedBy || ""\n            ).trim();\n\n            const inquiry = rawRow`;
  source =
    source.slice(0, firebaseAgentIndex) +
    firebaseAgentReplacement +
    source.slice(firebaseAgentIndex + firebaseAgentAnchor.length);

  const firebaseReturnSearchStart = source.indexOf(`key: \`firebase-appeal-`);
  const firebaseReturnAnchor = `              caseId,\n              agent,\n              auditDate,`;
  const firebaseReturnIndex = source.indexOf(firebaseReturnAnchor, firebaseReturnSearchStart);
  if (firebaseReturnIndex < 0) {
    throw new Error("Appeal PDF v43 anchor not found: Firebase mapped identity properties");
  }
  const firebaseReturnReplacement = `              caseId,\n              agent,\n              teamName,\n              submittedByName,\n              reviewedByName,\n              auditDate,`;
  source =
    source.slice(0, firebaseReturnIndex) +
    firebaseReturnReplacement +
    source.slice(firebaseReturnIndex + firebaseReturnAnchor.length);

  // Pass all PDF-only context explicitly so Information, Team, Admin and QA names never depend on inferred fields.
  source = replaceOnce(
    source,
    `          caseDescription: selectedCase.inquiry,\n          topics: originalTopics,`,
    `          caseDescription: selectedCase.inquiry,\n          teamName: selectedCase.teamName || "",\n          appealSubmittedBy: selectedCase.submittedByName || "",\n          appealReviewedBy: selectedCase.reviewedByName || "",\n          topics: originalTopics,`,
    "PDF identity context"
  );

  source = replaceOnce(
    source,
    `          revisedTopics,\n          displayRevisedTopicCodes: revisedTopics.map((topic) => topic.code),`,
    `          revisedTopics,\n          displayRevisedTopicCodes: revisedTopics.map((topic) => topic.code),\n          nonAppealedTopics: originalTopics.filter(\n            (topic) => !revisedTopics.some((appealedTopic) => appealedTopic.code === topic.code)\n          ),`,
    "PDF non-appealed topics context"
  );

  fs.writeFileSync(appealPath, source, "utf8");
}

function patchPdfRenderer() {
  let source = fs.readFileSync(pdfPath, "utf8");
  if (source.includes(`// ${marker}-pdf`)) return;

  // System wording: this field is the actual Appeal Review Summary, not a generic Remark.
  source = replaceOnce(
    source,
    `    label(0, y, 1, remarkRowH, "Remark");`,
    `    // ${marker}-pdf\n    label(0, y, 1, remarkRowH, "Appeal Review\\nSummary");`,
    "Appeal Review Summary label"
  );

  // The column includes both the submission reason and QA review response.
  source = replaceOnce(
    source,
    `      label(6, y, 1, 8, "Appeal Reason");`,
    `      label(6, y, 1, 8, "Appeal Review Detail");`,
    "Appeal Review Detail header"
  );

  // Prefer the explicit non-appealed list passed by AppealMockup. This fixes cases where the
  // renderer only receives the appealed topic subset after an appeal revision is collapsed.
  source = replaceOnce(
    source,
    `  const nonAppealedTopics = includeAppeal\n    ? allTopicRows.filter((topic: any) => !revisedCodes.has(topic.code))\n    : [];`,
    `  const nonAppealedTopics = includeAppeal\n    ? (Array.isArray(caseItem.nonAppealedTopics) && caseItem.nonAppealedTopics.length\n        ? caseItem.nonAppealedTopics.filter((topic: any) => num(topic.max) > 0)\n        : allTopicRows.filter((topic: any) => !revisedCodes.has(topic.code)))\n    : [];`,
    "non-appealed topics source"
  );

  const oldMergedLines = `      const mergedLines: Array<{ text: string; color: [number, number, number]; bold?: boolean }> = [\n        ...wrapPdfText(appealReason, mergedWidth).map((text) => ({ text, color: BLACK as [number, number, number] })),\n        { text: "- - - - - - - - - - - - - - - - - -", color: [148, 163, 184] as [number, number, number] },\n        { text: "Evaluation Comment", color: [220, 38, 38] as [number, number, number], bold: true },\n        ...wrapPdfText(evaluationComment, mergedWidth).map((text) => ({ text, color: [220, 38, 38] as [number, number, number] })),\n      ];`;
  const newMergedLines = `      const appealAdminName = safeText(\n        caseItem.appealSubmittedBy || caseItem.submittedByName || caseItem.submittedBy || "-",\n        "-"\n      );\n      const appealQaName = safeText(\n        caseItem.appealReviewedBy ||\n          caseItem.reviewedByName ||\n          caseItem.reviewedBy ||\n          currentUser?.username ||\n          currentUser?.displayName ||\n          "-",\n        "-"\n      );\n      const mergedLines: Array<{ text: string; color: [number, number, number]; bold?: boolean }> = [\n        ...wrapPdfText(\`Admin: \${appealAdminName}\`, mergedWidth).map((text) => ({ text, color: BLACK as [number, number, number], bold: true })),\n        { text: "Appeal Reason", color: BLACK as [number, number, number], bold: true },\n        ...wrapPdfText(appealReason, mergedWidth).map((text) => ({ text, color: BLACK as [number, number, number] })),\n        { text: "- - - - - - - - - - - - - - - - - -", color: [148, 163, 184] as [number, number, number] },\n        ...wrapPdfText(\`QA: \${appealQaName}\`, mergedWidth).map((text) => ({ text, color: BLACK as [number, number, number], bold: true })),\n        { text: "Evaluation Comment", color: [220, 38, 38] as [number, number, number], bold: true },\n        ...wrapPdfText(evaluationComment, mergedWidth).map((text) => ({ text, color: [220, 38, 38] as [number, number, number] })),\n      ];`;
  source = replaceOnce(source, oldMergedLines, newMergedLines, "Admin/QA Appeal Review Detail content");

  // Make non-appealed topics explicit Information rows and retain bilingual topic names.
  source = replaceOnce(
    source,
    `        const infoText = \`Topic \${topic.code}  \${safeText(topic.label)}  - ไม่อุทธรณ์หัวข้อนี้\`;`,
    `        const infoDescription = bilingualAppealTopicDescription(\n          String(topic.code || ""),\n          topic.label\n        ).replace(/\\n+/g, " / ");\n        const infoText = \`Topic \${topic.code}  \${infoDescription}  - ไม่อุทธรณ์หัวข้อนี้\`;`,
    "Information bilingual topic text"
  );

  fs.writeFileSync(pdfPath, source, "utf8");
}

patchAppealRequests();
patchAppealMockup();
patchPdfRenderer();
console.log("Patched Appeal PDF review detail: real login usernames, Team from original case data, Appeal Review Summary wording, and explicit non-appealed topic Information rows.");
