import fs from "node:fs";

const file = "scripts/patch-appeal-review-reset-datetime-v54.mjs";
let source = fs.readFileSync(file, "utf8");

function replaceCall(label, replacement) {
  const labelToken = `    "${label}"\n  );`;
  const labelIndex = source.indexOf(labelToken);
  if (labelIndex < 0) throw new Error(`Missing v54 label: ${label}`);
  const start = source.lastIndexOf("  source = replaceOnce(", labelIndex);
  if (start < 0) throw new Error(`Missing v54 call start: ${label}`);
  const end = labelIndex + labelToken.length;
  source = source.slice(0, start) + replacement + source.slice(end);
}

replaceCall("Case Detail appeal timestamp fields", String.raw`  const caseDetailAppealMetadataFields = \`  appealReviewSummary?: string;\n  appealReviewedAt?: string;\n  appealSubmittedBy?: string;\n  appealSubmittedAt?: string;\n  appealReviewedBy?: string;\`;
  if (source.includes(caseDetailAppealMetadataFields)) {
    source = replaceOnce(
      source,
      caseDetailAppealMetadataFields,
      \`\${caseDetailAppealMetadataFields}\n  // appeal-review-reset-datetime-v54-dashboard\`,
      "Case Detail appeal timestamp fields"
    );
  } else {
    source = replaceOnce(
      source,
      \`  appealReviewSummary?: string;\n  appealReviewedAt?: string;\`,
      \`  appealReviewSummary?: string;\n  appealSubmittedAt?: string;\n  appealReviewedAt?: string;\n  // appeal-review-reset-datetime-v54-dashboard\`,
      "Case Detail appeal timestamp fields"
    );
  }`);

replaceCall("Appeal outcome timestamp type", String.raw`  const appealOutcomeMetadataType = \`type AppealOutcomeItem = {\n  caseId: string;\n  status: "Approved" | "Rejected";\n  reviewSummary: string;\n  reviewedAt: string;\n  submittedBy: string;\n  submittedAt: string;\n  reviewedBy: string;\n  requestId: string;\n  reviewedTopics: Topic[];\n};\`;
  if (source.includes(appealOutcomeMetadataType)) {
    source = replaceOnce(
      source,
      appealOutcomeMetadataType,
      \`\${appealOutcomeMetadataType}\n\ntype AppealTimelineItem = {\n  caseId: string;\n  submittedAt: string;\n  reviewedAt: string;\n};\`,
      "Appeal outcome timestamp type"
    );
  } else {
    source = replaceOnce(
      source,
      \`type AppealOutcomeItem = {\n  caseId: string;\n  status: "Approved" | "Rejected";\n  reviewSummary: string;\n  reviewedAt: string;\n  requestId: string;\n  reviewedTopics: Topic[];\n};\`,
      \`type AppealOutcomeItem = {\n  caseId: string;\n  status: "Approved" | "Rejected";\n  reviewSummary: string;\n  submittedAt: string;\n  reviewedAt: string;\n  requestId: string;\n  reviewedTopics: Topic[];\n};\n\ntype AppealTimelineItem = {\n  caseId: string;\n  submittedAt: string;\n  reviewedAt: string;\n};\`,
      "Appeal outcome timestamp type"
    );
  }`);

replaceCall("Appeal outcome timestamps", String.raw`  const reviewedAtMetadataAnchor = \`      reviewedAt: String(request.reviewedAt || "").trim(),\n      submittedBy: String(\`;
  if (source.includes(reviewedAtMetadataAnchor)) {
    source = replaceOnce(
      source,
      \`      reviewedAt: String(request.reviewedAt || "").trim(),\`,
      \`      reviewedAt: formatCaseDetailDateTime(request.reviewedAt),\`,
      "Appeal outcome reviewed timestamp"
    );
    source = replaceOnce(
      source,
      \`      submittedAt: String(\n        request.submittedAt ||\n          submittedEvent?.details?.submittedAt ||\n          submittedEvent?.created_at ||\n          ""\n      ).trim(),\`,
      \`      submittedAt: formatCaseDetailDateTime(\n        request.submittedAt ||\n          submittedEvent?.details?.submittedAt ||\n          submittedEvent?.created_at ||\n          ""\n      ),\`,
      "Appeal outcome submitted timestamp"
    );
  } else {
    source = replaceOnce(
      source,
      \`      status: request.status,\n      reviewSummary: String(request.reviewSummary || "").trim(),\n      reviewedAt: String(request.reviewedAt || "").trim(),\`,
      \`      status: request.status,\n      reviewSummary: String(request.reviewSummary || "").trim(),\n      submittedAt: formatCaseDetailDateTime(request.submittedAt),\n      reviewedAt: formatCaseDetailDateTime(request.reviewedAt),\`,
      "Appeal outcome timestamps"
    );
  }`);

replaceCall("Case Detail Appeal timestamp projection", String.raw`  const caseDetailMetadataProjection = \`      hasAppealHistory: Boolean(item.hasAppealHistory || mergedAppeal || loggedOutcome ||\n        candidateCaseIds.some((caseId) => appealHistoryCaseIds.has(caseId))),\n      appealStatus: effectiveStatus,\n      appealReviewSummary: loggedOutcome?.reviewSummary || "",\n      appealReviewedAt: loggedOutcome?.reviewedAt || "",\n      appealSubmittedBy: loggedOutcome?.submittedBy || item.agent || "",\n      appealSubmittedAt: loggedOutcome?.submittedAt || "",\n      appealReviewedBy: loggedOutcome?.reviewedBy || "",\`;
  if (source.includes(caseDetailMetadataProjection)) {
    source = replaceOnce(
      source,
      caseDetailMetadataProjection,
      \`      hasAppealHistory: Boolean(mergedAppeal || loggedOutcome || appealTimeline ||\n        candidateCaseIds.some((caseId) => appealHistoryCaseIds.has(caseId))),\n      appealStatus: effectiveStatus,\n      appealReviewSummary: loggedOutcome?.reviewSummary || "",\n      appealReviewedAt: appealTimeline?.reviewedAt || loggedOutcome?.reviewedAt || mergedAppeal?.reviewedAt || "",\n      appealSubmittedBy: loggedOutcome?.submittedBy || item.agent || "",\n      appealSubmittedAt: appealTimeline?.submittedAt || loggedOutcome?.submittedAt || mergedAppeal?.submittedAt || "",\n      appealReviewedBy: loggedOutcome?.reviewedBy || "",\`,
      "Case Detail Appeal timestamp projection"
    );
  } else {
    source = replaceOnce(
      source,
      \`      hasAppealHistory: Boolean(item.hasAppealHistory || mergedAppeal || loggedOutcome ||\n        candidateCaseIds.some((caseId) => appealHistoryCaseIds.has(caseId))),\n      appealStatus: effectiveStatus,\n      appealReviewSummary: loggedOutcome?.reviewSummary || "",\n      appealReviewedAt: loggedOutcome?.reviewedAt || "",\`,
      \`      hasAppealHistory: Boolean(mergedAppeal || loggedOutcome || appealTimeline ||\n        candidateCaseIds.some((caseId) => appealHistoryCaseIds.has(caseId))),\n      appealStatus: effectiveStatus,\n      appealReviewSummary: loggedOutcome?.reviewSummary || "",\n      appealSubmittedAt: appealTimeline?.submittedAt || loggedOutcome?.submittedAt || mergedAppeal?.submittedAt || "",\n      appealReviewedAt: appealTimeline?.reviewedAt || loggedOutcome?.reviewedAt || mergedAppeal?.reviewedAt || "",\`,
      "Case Detail Appeal timestamp projection"
    );
  }`);

fs.writeFileSync(file, source, "utf8");
console.log("Updated appeal v54 for Case Detail metadata compatibility.");
