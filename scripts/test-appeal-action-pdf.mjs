import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const temp = await mkdtemp(resolve(".appeal-action-pdf-test-"));
globalThis.__actionPdfTexts = [];
try {
  const output = resolve(temp, "actions.mjs");
  await build({
    stdin: { contents: "export {buildAppealActionHistory} from './src/appealActionHistory'; export {generateOfficialCaseDetailPdf} from './src/caseDetailOfficialPdf'; export {generateCasePdfWithAppealHistory} from './src/caseAppealPdfAddon';", resolveDir: process.cwd(), loader: "ts" },
    outfile: output, bundle: true, jsx: "automatic", platform: "node", format: "esm", packages: "external", logLevel: "silent",
    plugins: [{ name: "observe-real-pdf-renderer", setup(builder) {
      builder.onResolve({ filter: /^jspdf$/ }, () => ({ path: "pdf", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents: `
        import {createRequire} from 'node:module';
        const {jsPDF:RealPdf}=createRequire(import.meta.url)('jspdf');
        export class jsPDF extends RealPdf {
          constructor(...args){super(...args);const text=this.text.bind(this);this.text=(value,...rest)=>{globalThis.__actionPdfTexts.push(value);return text(value,...rest)};globalThis.__actionPdfDoc=this;}
        }
      ` }));
    } }],
  });
  const { buildAppealActionHistory, generateOfficialCaseDetailPdf, generateCasePdfWithAppealHistory } = await import(pathToFileURL(output).href);
  const requestId = "appeal-AA304253-fixture";
  const at = hours => new Date(Date.parse("2026-10-09T00:00:00Z") + hours * 3600000).toISOString();
  const topic = { code: "1", label: "Process", score: 18, max: 30, comment: "ORIGINAL_EVALUATION", wantsAppeal: true, appealReason: "FIRST_APPEAL_REASON\nSecond line" };
  const event = (event_type, hours, details) => ({ event_type, created_at: at(hours), case_id: "AA304253", target_agent: "Fixture Agent", details: { requestId, ...details } });
  const firstReview = { ...topic, decision: "Approved", revisedScore: 20, revisedComment: "FIRST_QA_COMMENT" };
  const secondTopic = { ...topic, appealReason: "SECOND_APPEAL_REASON\n" + Array.from({ length: 90 }, (_, index) => `Evidence line ${index + 1}`).join("\n") + "\nFINAL_REASON_LINE" };
  const secondReview = { ...secondTopic, decision: "Approved", revisedScore: 23, revisedComment: "SECOND_QA_COMMENT" };
  const other = { code: "2", label: "Answer", score: 14, max: 20, comment: "OTHER_ORIGINAL", wantsAppeal: true, appealReason: "THIRD_ACTION_NEW_TOPIC" };
  const rows = [
    event("appeal_request_submitted", -100, { topics: [topic], finalScore: 88, submittedAt: at(-100), submittedBy: "First Submitter" }),
    event("appeal_request_reviewed", -90, { topics: [firstReview], reviewId: "review-first", decision: "Approved", reviewedAt: at(-90), reviewedBy: "First QA", reviewSummary: "FIRST_SUMMARY" }),
    event("appeal_additional_round_opened", -10, { roundId: "round-2", openedAt: at(-10), expiresAt: at(62), topics: [{ ...topic, appealReason: "" }] }),
    event("appeal_additional_evidence_submitted", -9, { roundId: "round-2", submittedAt: at(-9), submittedBy: "Second Submitter", topics: [secondTopic] }),
    event("appeal_request_reviewed", -8, { roundId: "round-2", topics: [secondReview], reviewId: "review-second", decision: "Approved", reviewedAt: at(-8), reviewedBy: "Second QA", reviewSummary: "SECOND_SUMMARY" }),
    event("appeal_request_reviewed", -7, { previousReviewId: "review-second", reviewId: "review-second-edit", topics: [{ ...secondReview, revisedScore: 24, revisedComment: "CORRECTED_SECOND_QA_COMMENT" }], decision: "Approved", reviewedAt: at(-7), reviewedBy: "Correction QA", reviewSummary: "CORRECTION_SUMMARY" }),
    event("appeal_additional_round_opened", -6, { roundId: "round-3", openedAt: at(-6), expiresAt: at(66), topics: [{ ...other, appealReason: "" }] }),
    event("appeal_additional_evidence_submitted", -5, { roundId: "round-3", submittedAt: at(-5), submittedBy: "Third Submitter", topics: [other] }),
    event("appeal_request_reviewed", -4, { roundId: "round-3", topics: [{ ...secondReview, revisedScore: 24, revisedComment: "CORRECTED_SECOND_QA_COMMENT" }, { ...other, decision: "Rejected", rejectReason: "THIRD_QA_REJECT_REASON" }], reviewId: "review-third", decision: "Partially Approved", reviewedAt: at(-4), reviewedBy: "Third QA", reviewSummary: "THIRD_SUMMARY" }),
    event("appeal_additional_round_opened", -3, { roundId: "round-4", openedAt: at(-3), expiresAt: at(69), topics: [{ ...topic, appealReason: "" }] }),
    event("appeal_additional_round_cancelled", -2, { roundId: "round-4", reason: "Cancelled" }),
    event("appeal_additional_round_opened", -1, { roundId: "round-5", openedAt: at(-1), expiresAt: at(71), topics: [{ ...topic, appealReason: "" }] }),
    event("appeal_internal_message", 0, { topics: [{ ...topic, appealReason: "PRIVATE_INTERNAL_MESSAGE" }], message: "PRIVATE_INTERNAL_MESSAGE" }),
  ];
  const unchanged = JSON.stringify(rows);
  const actions = buildAppealActionHistory([...rows].reverse(), requestId, Date.parse(at(80)));
  assert.deepEqual(actions.map(action => action.actionNumber), [1, 2, 3, 4, 5]);
  assert.deepEqual(actions[2].topics.map(topic => topic.code), ["2"], "old carried topic is excluded from a new-topic Action");
  assert.equal(actions[1].reviews.length, 2, "legacy QA edit stays in Action 2");
  assert.equal(actions[3].status, "Cancelled (Additional)");
  assert.equal(actions[4].status, "Expired (Additional)");
  assert.equal(actions[4].topics[0].appealReason, "", "permission does not copy an old appeal reason into a new Action");
  assert.equal(actions[2].reviews[0].finalScore, 94);
  assert.equal(JSON.stringify(rows), unchanged);

  const caseItem = { caseId: "AA304253", agent: "Fixture Agent", monthKey: "2026-09", auditDate: "09/10/2026", finalScore: 94, previousScore: 88, grade: "A", appealStatus: "Partially Approved", reviewStatus: "Revised", topics: [topic, other], revisedTopics: [{ ...topic, score: 24, comment: "CORRECTED_SECOND_QA_COMMENT" }], appealReviewedTopics: [{ ...topic, decision: "Approved", comment: "CORRECTED_SECOND_QA_COMMENT" }, { ...other, decision: "Rejected", comment: "THIRD_QA_REJECT_REASON" }], displayRevisedTopicCodes: ["1"], appealActionHistory: actions };
  for (const pdfVariant of ["original", "appeal"]) {
    globalThis.__actionPdfTexts.length = 0;
    const generated = await generateCasePdfWithAppealHistory({ caseItem, pdfVariant, fallback: generateOfficialCaseDetailPdf });
    assert.ok(generated.blob.size > 10000, "real PDF bytes generated");
    assert.ok(globalThis.__actionPdfDoc.getNumberOfPages() >= 3, "long reasons paginate");
    const text = globalThis.__actionPdfTexts.flat(Infinity).join(" ");
    for (const expected of ["Action 1", "Action 2", "Action 3", "Action 4", "Action 5", "FIRST_APPEAL_REASON", "SECOND_APPEAL_REASON", "FINAL_REASON_LINE", "FIRST_QA_COMMENT", "SECOND_QA_COMMENT", "CORRECTED_SECOND_QA_COMMENT", "THIRD_QA_REJECT_REASON", "94.00"]) {
      assert.ok(text.includes(expected), `${pdfVariant} PDF preserves ${expected}`);
    }
    assert.ok(!text.includes("PRIVATE_INTERNAL_MESSAGE"), "internal QA/Senior discussion never enters reports");
  }
  console.log("PASS real Main and Appeal PDF render all Actions, old/new reasons, QA revisions, rejected/new topics, long-text pagination and internal discussion exclusion");
  const retainedRows = [rows[0], { ...rows[1], details: { ...rows[1].details, topics: [{ ...firstReview, revisedScore: 24 }] } }, rows[2], rows[3],
    event("appeal_request_reviewed", -8, { roundId: "round-2", topics: [{ ...secondTopic, score: 24, originalScore: 18, retainedComment: "FIRST_QA_COMMENT", decision: "Rejected", rejectReason: "KEEP_PREVIOUS_APPROVED_SCORE" }], reviewId: "retained-reject", decision: "Rejected", reviewedAt: at(-8), reviewedBy: "Second QA", reviewSummary: "RETAINED_SUMMARY" }),
  ];
  const retainedActions = buildAppealActionHistory(retainedRows, requestId, Date.parse(at(80)));
  assert.equal(retainedActions[1].topics[0].score, 24);
  assert.equal(retainedActions[1].reviews[0].finalScore, 94);
  const retainedCase = { ...caseItem, topics: [topic], appealStatus: "Rejected", revisedTopics: [{ ...topic, score: 24, comment: "FIRST_QA_COMMENT" }], appealReviewedTopics: [{ ...topic, score: 24, decision: "Rejected", comment: "KEEP_PREVIOUS_APPROVED_SCORE" }], appealActionHistory: retainedActions };
  for (const pdfVariant of ["original", "appeal"]) {
    globalThis.__actionPdfTexts.length = 0;
    await generateCasePdfWithAppealHistory({ caseItem: retainedCase, pdfVariant, fallback: generateOfficialCaseDetailPdf });
    const text = globalThis.__actionPdfTexts.flat(Infinity).join(" ");
    assert.ok(text.includes("KEEP_PREVIOUS_APPROVED_SCORE") && /Score\s+24\s*\/\s*30/.test(text), `${pdfVariant} PDF shows rejection at the retained 24/30`);
    assert.ok(text.includes("FIRST_QA_COMMENT") && text.includes("94.00"));
  }
  console.log("PASS Main and Appeal PDFs preserve the previous approval and show the rejected additional Action at 24/30 with total 94");
} finally {
  await rm(temp, { recursive: true, force: true });
  delete globalThis.__actionPdfTexts;
  delete globalThis.__actionPdfDoc;
}
