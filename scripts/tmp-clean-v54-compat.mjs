import fs from "node:fs";

const file = "scripts/patch-appeal-review-reset-datetime-v54.mjs";
let source = fs.readFileSync(file, "utf8");

const startAnchor = '  if (source.includes("// appeal-review-reset-datetime-v54-dashboard")) return;\n';
const endAnchor = '  fs.writeFileSync(dashboardPath, source, "utf8");\n';
if (!source.includes(startAnchor) || !source.includes(endAnchor)) {
  throw new Error("v54 Dashboard function anchors not found");
}

const pre = [
  '',
  '  const caseDetailAppealMetadataCompat = source.includes("  appealSubmittedBy?: string;");',
  '  if (caseDetailAppealMetadataCompat) {',
  '    source = source.replace(',
  '      `  appealReviewSummary?: string;\\n  appealReviewedAt?: string;\\n  appealSubmittedBy?: string;\\n  appealSubmittedAt?: string;\\n  appealReviewedBy?: string;\\n  appealRequestId?: string;`,',
  '      `  appealReviewSummary?: string;\\n  appealReviewedAt?: string;\\n  appealRequestId?: string;`',
  '    );',
  '    source = source.replace(',
  '      `type AppealOutcomeItem = {\\n  caseId: string;\\n  status: "Approved" | "Rejected";\\n  reviewSummary: string;\\n  reviewedAt: string;\\n  submittedBy: string;\\n  submittedAt: string;\\n  reviewedBy: string;\\n  requestId: string;\\n  reviewedTopics: Topic[];\\n};`,',
  '      `type AppealOutcomeItem = {\\n  caseId: string;\\n  status: "Approved" | "Rejected";\\n  reviewSummary: string;\\n  reviewedAt: string;\\n  requestId: string;\\n  reviewedTopics: Topic[];\\n};`',
  '    );',
  '    source = source.replace(',
  '      `      reviewedAt: String(request.reviewedAt || "").trim(),\\n      submittedBy: String(\\n        submittedEvent?.agent_name ||\\n          submittedEvent?.display_name ||\\n          request.submittedBy ||\\n          request.agent ||\\n          ""\\n      ).trim(),\\n      submittedAt: String(\\n        request.submittedAt ||\\n          submittedEvent?.details?.submittedAt ||\\n          submittedEvent?.created_at ||\\n          ""\\n      ).trim(),\\n      reviewedBy: String(\\n        reviewedEvent?.agent_name ||\\n          reviewedEvent?.display_name ||\\n          ""\\n      ).trim(),\\n      requestId: String(request.requestId || "").trim(),`,',
  '      `      reviewedAt: String(request.reviewedAt || "").trim(),\\n      requestId: String(request.requestId || "").trim(),`',
  '    );',
  '    source = source.replace(',
  '      `      appealReviewSummary: loggedOutcome?.reviewSummary || "",\\n      appealReviewedAt: loggedOutcome?.reviewedAt || "",\\n      appealSubmittedBy: loggedOutcome?.submittedBy || item.agent || "",\\n      appealSubmittedAt: loggedOutcome?.submittedAt || "",\\n      appealReviewedBy: loggedOutcome?.reviewedBy || "",\\n      appealRequestId: loggedOutcome?.requestId || "",`,',
  '      `      appealReviewSummary: loggedOutcome?.reviewSummary || "",\\n      appealReviewedAt: loggedOutcome?.reviewedAt || "",\\n      appealRequestId: loggedOutcome?.requestId || "",`',
  '    );',
  '  }',
  ''
].join('\n');
source = source.replace(startAnchor, startAnchor + pre);

const post = [
  '',
  '  if (caseDetailAppealMetadataCompat) {',
  '    source = source.replace(',
  '      `  appealReviewSummary?: string;\\n  appealSubmittedAt?: string;\\n  appealReviewedAt?: string;\\n  // appeal-review-reset-datetime-v54-dashboard\\n  appealRequestId?: string;`,',
  '      `  appealReviewSummary?: string;\\n  appealSubmittedAt?: string;\\n  appealReviewedAt?: string;\\n  appealSubmittedBy?: string;\\n  appealReviewedBy?: string;\\n  // appeal-review-reset-datetime-v54-dashboard\\n  appealRequestId?: string;`',
  '    );',
  '    source = source.replace(',
  '      `type AppealOutcomeItem = {\\n  caseId: string;\\n  status: "Approved" | "Rejected";\\n  reviewSummary: string;\\n  submittedAt: string;\\n  reviewedAt: string;\\n  requestId: string;\\n  reviewedTopics: Topic[];\\n};`,',
  '      `type AppealOutcomeItem = {\\n  caseId: string;\\n  status: "Approved" | "Rejected";\\n  reviewSummary: string;\\n  submittedAt: string;\\n  reviewedAt: string;\\n  submittedBy: string;\\n  reviewedBy: string;\\n  requestId: string;\\n  reviewedTopics: Topic[];\\n};`',
  '    );',
  '    source = source.replace(',
  '      `      status: request.status,\\n      reviewSummary: String(request.reviewSummary || "").trim(),\\n      submittedAt: formatCaseDetailDateTime(request.submittedAt),\\n      reviewedAt: formatCaseDetailDateTime(request.reviewedAt),\\n      requestId: String(request.requestId || "").trim(),`,',
  '      `      status: request.status,\\n      reviewSummary: String(request.reviewSummary || "").trim(),\\n      submittedAt: formatCaseDetailDateTime(request.submittedAt),\\n      reviewedAt: formatCaseDetailDateTime(request.reviewedAt),\\n      submittedBy: String(\\n        submittedEvent?.agent_name ||\\n          submittedEvent?.display_name ||\\n          request.submittedBy ||\\n          request.agent ||\\n          ""\\n      ).trim(),\\n      reviewedBy: String(\\n        reviewedEvent?.agent_name ||\\n          reviewedEvent?.display_name ||\\n          ""\\n      ).trim(),\\n      requestId: String(request.requestId || "").trim(),`',
  '    );',
  '    source = source.replace(',
  '      `      appealReviewSummary: loggedOutcome?.reviewSummary || "",\\n      appealSubmittedAt: appealTimeline?.submittedAt || loggedOutcome?.submittedAt || mergedAppeal?.submittedAt || "",\\n      appealReviewedAt: appealTimeline?.reviewedAt || loggedOutcome?.reviewedAt || mergedAppeal?.reviewedAt || "",\\n      appealRequestId: loggedOutcome?.requestId || "",`,',
  '      `      appealReviewSummary: loggedOutcome?.reviewSummary || "",\\n      appealSubmittedAt: appealTimeline?.submittedAt || loggedOutcome?.submittedAt || mergedAppeal?.submittedAt || "",\\n      appealReviewedAt: appealTimeline?.reviewedAt || loggedOutcome?.reviewedAt || mergedAppeal?.reviewedAt || "",\\n      appealSubmittedBy: loggedOutcome?.submittedBy || item.agent || "",\\n      appealReviewedBy: loggedOutcome?.reviewedBy || "",\\n      appealRequestId: loggedOutcome?.requestId || "",`',
  '    );',
  '  }',
  ''
].join('\n');
source = source.replace(endAnchor, post + endAnchor);

fs.writeFileSync(file, source, "utf8");
console.log("Built clean v54 metadata compatibility patch.");
