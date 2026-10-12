import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const temp = await mkdtemp(resolve(".appeal-action-pdf-test-"));
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://pdf.test/' });
for (const key of ['document', 'DOMParser', 'Node']) globalThis[key] = dom.window[key];
globalThis.__actionPdfTexts = [];
globalThis.__actionPdfPositions = [];
globalThis.__actionPdfImages = [];
const productionTemplate = (await readFile(resolve('src/caseDetailOfficialPdf.ts'), 'utf8')).includes('case-main-pdf-original-template-v34');
try {
  const output = resolve(temp, "actions.mjs");
  await build({
    stdin: { contents: "export {buildAppealActionHistory, topicAppealActions, topicAppealActionNumber} from './src/appealActionHistory'; export {generateOfficialCaseDetailPdf} from './src/caseDetailOfficialPdf'; export {generateCasePdfWithAppealHistory} from './src/caseAppealPdfAddon';", resolveDir: process.cwd(), loader: "ts" },
    outfile: output, bundle: true, jsx: "automatic", platform: "node", format: "esm", packages: "external", logLevel: "silent",
    plugins: [{ name: "observe-real-pdf-renderer", setup(builder) {
      builder.onResolve({ filter: /^jspdf$/ }, () => ({ path: "pdf", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents: `
        import {createRequire} from 'node:module';
        const {jsPDF:RealPdf}=createRequire(import.meta.url)('jspdf');
        export class jsPDF extends RealPdf {
          constructor(...args){super(...args);const text=this.text.bind(this);this.text=(value,...rest)=>{globalThis.__actionPdfTexts.push(value);globalThis.__actionPdfPositions.push({value:String(value),x:rest[0],y:rest[1],page:this.getCurrentPageInfo().pageNumber});return text(value,...rest)};const addImage=this.addImage.bind(this);this.addImage=(...args)=>{globalThis.__actionPdfImages.push(args);return addImage(...args)};globalThis.__actionPdfDoc=this;}
        }
      ` }));
    } }],
  });
  const { buildAppealActionHistory, topicAppealActions, topicAppealActionNumber, generateOfficialCaseDetailPdf, generateCasePdfWithAppealHistory } = await import(pathToFileURL(output).href);
  const requestId = "appeal-AA304253-fixture";
  const at = hours => new Date(Date.parse("2026-10-09T00:00:00Z") + hours * 3600000).toISOString();
  const topic = { code: "1", label: "Process", score: 18, max: 30, comment: "ORIGINAL_EVALUATION ขั้นตอนการทำงานเดิม", wantsAppeal: true, appealReason: "FIRST_APPEAL_REASON\nเนื่องจากไรเดอร์ถามแค่งานไม่เข้า\nSecond line" };
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
  const unchangedActions = JSON.stringify(actions);
  assert.deepEqual(topicAppealActions(actions, "1").map(action => action.topicActionNumber), [1, 2, undefined, undefined], "cancelled and expired unsubmitted permissions do not consume a topic Action number");
  assert.deepEqual(topicAppealActions(actions, "2").map(action => action.topicActionNumber), [1], "a new topic begins at Action 1 after earlier rounds of other topics");
  assert.equal(topicAppealActionNumber(actions, "2", actions[2].actionId), 1);
  const mixedHistory = buildAppealActionHistory([...rows,
    event("appeal_additional_round_opened", 81, { roundId: "mixed-next", openedAt: at(81), expiresAt: at(153), topics: [topic, other] }),
    event("appeal_additional_evidence_submitted", 82, { roundId: "mixed-next", submittedAt: at(82), submittedBy: "Mixed Submitter", topics: [topic, other] }),
  ], requestId, Date.parse(at(83)));
  assert.equal(topicAppealActions(mixedHistory, "1").at(-1).topicActionNumber, 3, "a real submission follows two previous submissions despite cancelled or expired permissions");
  assert.equal(topicAppealActions(mixedHistory, "2").at(-1).topicActionNumber, 2, "the same mixed round has an independent number for the second topic");
  assert.equal(JSON.stringify(actions), unchangedActions, "display numbering never rewrites the original history, scores or round identifiers");

  const caseItem = { caseId: "AA304253", agent: "Fixture Agent", monthKey: "2026-09", auditDate: "09/10/2026", finalScore: 94, previousScore: 88, grade: "A", appealStatus: "Partially Approved", reviewStatus: "Revised", topics: [topic, other], revisedTopics: [{ ...topic, score: 24, comment: "CORRECTED_SECOND_QA_COMMENT" }], appealReviewedTopics: [{ ...topic, decision: "Approved", comment: "CORRECTED_SECOND_QA_COMMENT" }, { ...other, decision: "Rejected", comment: "THIRD_QA_REJECT_REASON" }], displayRevisedTopicCodes: ["1"], appealActionHistory: actions };
  for (const pdfVariant of ["original", "appeal"]) {
    globalThis.__actionPdfTexts.length = 0;
    globalThis.__actionPdfPositions.length = 0;
    let renderedCase;
    const generated = await generateCasePdfWithAppealHistory({ caseItem, pdfVariant, fallback: input => { renderedCase = input.caseItem;return generateOfficialCaseDetailPdf(input); } });
    assert.ok(generated.blob.size > 10000, "real PDF bytes generated");
    assert.ok(globalThis.__actionPdfDoc.getNumberOfPages() >= 2, "long reasons paginate with compact separators");
    const text = globalThis.__actionPdfTexts.flat(Infinity).join(" ");
    for (const expected of ["ORIGINAL_EVALUATION", "ขั้นตอนการทำงานเดิม", "เนื่องจากไรเดอร์ถามแค่งานไม่เข้า", "Action 1", "Action 2", "Cancelled (Additional)", "Expired (Additional)", "FIRST_APPEAL_REASON", "SECOND_APPEAL_REASON", "FINAL_REASON_LINE", "FIRST_QA_COMMENT", "SECOND_QA_COMMENT", "CORRECTED_SECOND_QA_COMMENT", "THIRD_QA_REJECT_REASON"]) {
      assert.ok(text.replace(/\s/g, '').includes(expected.replace(/\s/g, '')), `${pdfVariant} PDF preserves ${expected}`);
    }
    assert.equal(pdfVariant === 'original' ? renderedCase.pdfReportScoreOverride : renderedCase.finalScore, 94, 'latest review supplies the total score');
    if (productionTemplate || pdfVariant === 'appeal') assert.ok(text.includes('94.00'), 'production report header renders the latest total');
    assert.ok(!text.includes("PRIVATE_INTERNAL_MESSAGE"), "internal QA/Senior discussion never enters reports");
    assert.ok(!text.includes('Initial Appeal') && !text.includes('Additional Appeal') && !text.includes('Score after review'), 'no duplicate purple Action appendix');
    const actionLabels = globalThis.__actionPdfPositions.filter(row =>  /Action \d+\b/.test(row.value));
    assert.deepEqual(actionLabels.map(row => Number(row.value.match(/Action (\d+)/)[1])), [1, 2, 1], 'each topic starts at Action 1; actual submissions stay ordered and permissions have no Action number');
    assert.ok(actionLabels.every(row => row.x > globalThis.__actionPdfDoc.internal.pageSize.getWidth() / 2), 'Action headings render in the existing topic detail column');
    assert.equal((text.replace(/\s/g, '').match(/ORIGINAL_EVALUATION/g) || []).length, 1, 'original evaluation stays once in the topic');
    assert.equal((text.replace(/\s/g, '').match(/FIRST_APPEAL_REASON/g) || []).length, 1, 'old appeal reason appears once');
    assert.equal((text.replace(/\s/g, '').match(/SECOND_APPEAL_REASON/g) || []).length, 1, 'additional appeal reason appears once');
    for (let index = 1; index <= 90; index++) assert.ok(text.replace(/\s/g, '').includes(`Evidenceline${index}`), `long appeal line ${index} survives pagination`);
    if (process.env.ACTION_PDF_CHECK_DIR) {
      await mkdir(process.env.ACTION_PDF_CHECK_DIR, { recursive: true });
      await writeFile(resolve(process.env.ACTION_PDF_CHECK_DIR, `fixture-${pdfVariant}.pdf`), new Uint8Array(await generated.blob.arrayBuffer()));
    }
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
    let renderedCase;
    await generateCasePdfWithAppealHistory({ caseItem: retainedCase, pdfVariant, fallback: input => { renderedCase = input.caseItem;return generateOfficialCaseDetailPdf(input); } });
    const text = globalThis.__actionPdfTexts.flat(Infinity).join(" ");
    assert.ok(text.replace(/\s/g, '').includes('KEEP_PREVIOUS_APPROVED_SCORE') && /Score\s+24\s*\/\s*30/.test(text), `${pdfVariant} PDF shows rejection at the retained 24/30`);
    assert.ok(text.includes("FIRST_QA_COMMENT"));
    assert.equal(pdfVariant === 'original' ? renderedCase.pdfReportScoreOverride : renderedCase.finalScore, 94);
    if (productionTemplate || pdfVariant === 'appeal') assert.ok(text.includes('94.00'));
  }
  console.log("PASS Main and Appeal PDFs preserve the previous approval and show the rejected additional Action at 24/30 with total 94");
  const withEvidence = structuredClone(actions);
  const image = id => ({ id, width: 40, height: 40, name: `${id}.png` });
  withEvidence[0].submissions[0].topics[0].evidenceImages = [image('appeal_one')];
  withEvidence[1].submissions[0].topics[0].evidenceImages = [image('appeal_two')];
  withEvidence[1].submissions.unshift({ submittedBy: 'Earlier Submitter', submittedAt: at(-9.5), topics: [{ ...secondTopic, appealReason: 'EARLIER_SAVED_REASON', evidenceImages: [image('appeal_earlier')] }] });
  withEvidence[1].reviews[0].topics[0].qaEvidenceImages = [image('qa_two')];
  const actualFetch = globalThis.fetch;
  const imageBytes = await readFile(resolve('public/robinhood-logo.png'));
  globalThis.FileReader = dom.window.FileReader;
  try {
    for (const pdfVariant of ['original', 'appeal']) {
      const imageReads = [];
      globalThis.fetch = async url => { imageReads.push(new URL(url, 'https://pdf.test').searchParams.get('id'));return { ok: true, blob: async () => new dom.window.Blob([imageBytes], { type: 'image/png' }) }; };
      globalThis.__actionPdfTexts.length = 0;
      globalThis.__actionPdfImages.length = 0;
      await generateCasePdfWithAppealHistory({ caseItem: { ...caseItem, appealActionHistory: withEvidence }, pdfVariant, fallback: generateOfficialCaseDetailPdf });
      assert.deepEqual(imageReads, ['appeal_one', 'appeal_earlier', 'appeal_two', 'qa_two'], 'each saved submission and QA image is fetched once in its own Action');
      assert.equal(globalThis.__actionPdfImages.length, 4, 'all original, additional, earlier submission and QA evidence embeds in the real PDF');
      assert.ok(globalThis.__actionPdfTexts.flat(Infinity).join('').replace(/\s/g, '').includes('EARLIER_SAVED_REASON'), 'earlier saved submission text is retained inline');
    }
  } finally { globalThis.fetch = actualFetch;delete globalThis.FileReader; }
  console.log('PASS Main and Appeal PDFs retain every submitted and QA evidence image without duplicate text or missing saved submissions');
} finally {
  await rm(temp, { recursive: true, force: true });
  delete globalThis.__actionPdfTexts;
  delete globalThis.__actionPdfDoc;
  delete globalThis.__actionPdfPositions;
  delete globalThis.__actionPdfImages;
  dom.window.close();
  for (const key of ['document', 'DOMParser', 'Node']) delete globalThis[key];
}
