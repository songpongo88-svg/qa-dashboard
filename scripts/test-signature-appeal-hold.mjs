import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import viteConfig from "../vite.config.js";

const temporary = await mkdtemp(resolve(".signature-appeal-test-"));
const NativeDate = globalThis.Date;
const now = NativeDate.parse("2026-10-12T03:00:00Z");
let clock = now;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [clock])); }
  static now() { return clock; }
};
const dom = new JSDOM('<div id="root"></div>', {
  url: "https://qa.test/?month=2026-09&doc=2026-09%3A%3AFixture%20Agent%20A",
});
const previous = new Map();
for (const key of ["window", "document", "navigator", "HTMLElement", "Event", "MouseEvent", "CustomEvent"]) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = function() {};
const fixture = globalThis.__signatureAppealFixture = {
  logs: [], writes: [], reads: [], alerts: [], stored: [], failed: false, exports: [], pdfText: [], coachingReads: [], coachingFailed: false,
};
const originalWarn = console.warn;
const originalError = console.error;
const expectedFailure = args => args.some(value => value?.constructor?.name === "SignatureAppealHoldError" || value?.message === "offline fixture" ||
  /^(ยังไม่มี Agent ที่ลงนาม|ตรวจผล Coaching \/ QA Review ล่าสุดไม่สำเร็จ)/.test(value?.message || ''));
console.warn = (...args) => { if (!expectedFailure(args)) originalWarn(...args); };
console.error = (...args) => { if (!expectedFailure(args)) originalError(...args); };
window.alert = message => fixture.alerts.push(String(message));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response("", { status: 404 });
const { createRoot } = await import("react-dom/client");
let root;
const agent = "Fixture Agent A";
const caseId = "AA991000";
const topic = { code: "1", label: "Process", max: 100, score: 90, wantsAppeal: true, appealReason: "ตรวจหลักฐาน" };
const at = hours => new Date(now + hours * 3600000).toISOString();
const event = (event_type, hours, details = {}) => ({ event_type, created_at: at(hours), case_id: caseId,
  target_agent: agent, details: { requestId: "fixture-appeal", ...details } });
const submission = event("appeal_request_submitted", -100, { finalScore: 90, auditDate: "2026-09-20", topics: [topic] });
const reviewed = event("appeal_request_reviewed", -90, { reviewId: "first-review", reviewedAt: at(-90),
  decision: "Rejected", topics: [{ ...topic, decision: "Rejected", rejectReason: "คงผลเดิม" }] });
const access = event("appeal_additional_access_requested", -2, { accessId: "access-1", topicCodes: ["1"], requestedAt: at(-2) });
const approved = event("appeal_additional_access_decided", -1, { accessId: "access-1", approved: true, decidedAt: at(-1) });
const opened = event("appeal_additional_round_opened", -1, { roundId: "round-1", openedAt: at(-1), expiresAt: at(71), topics: [topic] });
const additional = event("appeal_additional_evidence_submitted", -0.5, { roundId: "round-1", submittedAt: at(-0.5), topics: [topic] });
const oldResult = [submission, reviewed];
const pendingAdditional = [...oldResult, access, approved, opened, additional];
const complete = [...pendingAdditional, event("appeal_request_reviewed", 0, { roundId: "round-1", reviewId: "second-review",
  reviewedAt: at(0), decision: "Approved", topics: [{ ...topic, decision: "Approved", revisedScore: 100 }] })];
const names = { Agent: agent, Senior: "Fixture Senior", Supervisor: "Phrommarin Thaithorn", QA: "Songpon Phothong" };
const account = name => ({ username: name, displayName: name, agentName: name, role: "Admin Live Chat",
  teamName: "Fixture Team", teamLead: names.Senior, status: "Active" });
const accounts = [account(agent), account("Fixture Agent B")];
fixture.evaluations = [agent, "Fixture Agent B"].flatMap((name, owner) => Array.from({ length: 10 }, (_, i) => ({
  id: `fixture-${owner}-${i}`, caseId: `AA99${owner + 1}${String(i).padStart(3, "0")}`, agentName: name,
  auditDate: "2026-09-20", auditTimestamp: "2026-09-20T03:00:00Z", finalScore: 90,
  evaluatorName: names.QA, inquiry: "ข้อมูลทดสอบ", topics: [topic],
})));
const signed = role => ({ role, signerName: names[role], signedBy: names[role], status: "Signed", signedAt: at(-1) });
const coaching = name => ({ id: `coaching-${name}`, agent: name, agentId: name, monthKey: '2026-09',
  status: 'Follow-up Next Month', updatedAt: at(-1), qaReviewedAt: at(-1), qaReviewedBy: names.QA,
  qaSummary: 'QA recommends Process', recommendedTopics: ['Process'], qaReviewComment: 'Reviewed and accepted',
  actualCoaching: { date: '2026-10-11', startTime: '14:00', endTime: '15:00', topics: ['Process'], finalNote: 'Coached Process', noPlanReason: '' },
  actions: [{ topic: 'Process', plan: 'Check Process each case', owner: name, dueDate: '2026-10-20' }] });
fixture.coaching = [coaching(agent), coaching('Fixture Agent B')];
const storeMock = `
  export async function fetchAppealEvents(types,options){const f=globalThis.__signatureAppealFixture;
    f.reads.push({types,options});if(f.failed)throw new Error('offline fixture');
    return f.logs.filter(event=>!types||types.includes(event.event_type));}
  export async function fetchAdditionalAppealReasonOptions(){return []}
  export async function fetchAssignedAppealRequestIds(){return []}
  export async function fetchAppealDiscussionEvents(){return []}
  export async function writeAppealEvent(){return true}
  export async function writeAdditionalAppealAccessDecision(){return true}
`;
try {
  const output = resolve(temporary, "signature.mjs");
  await build({ entryPoints: ["src/SignatureCenterMockup.tsx"], outfile: output, bundle: true,
    platform: "node", format: "esm", packages: "external", define: { "import.meta.env": "{}" }, logLevel: "silent",
    plugins: [{ name: "signature-appeal-boundaries", setup(builder) {
      builder.onResolve({filter:/^xlsx$/},()=>({path:'xlsx',namespace:'payment-workbook-fixture'}));
      builder.onLoad({filter:/.*/,namespace:'payment-workbook-fixture'},()=>({loader:'js',contents:`
        import {createRequire} from 'node:module';const xlsx=createRequire(import.meta.url)('xlsx');
        export const utils=xlsx.utils,SSF=xlsx.SSF,read=xlsx.read,write=xlsx.write;
        export function writeFile(book,fileName){globalThis.__signatureAppealFixture.workbook=book;globalThis.__signatureAppealFixture.exports.push({fileName,bytes:xlsx.write(book,{type:'array',bookType:'xlsx'})});}
      `}));
      const mocks = {
        "./appealStore": storeMock,
        "./signatureStore": `
          export async function fetchStoredSignatureDocuments(){return globalThis.__signatureAppealFixture.stored}
          export async function fetchStoredSignatureLibraryEntry(){return ''}
          export async function saveStoredSignatureLibraryEntry(){}
          export async function deleteStoredSignatureLibraryEntry(){}
          export async function saveStoredSignatureDocument(...args){globalThis.__signatureAppealFixture.writes.push(['sign',...args])}
          export async function saveStoredSignatureConfirm(...args){globalThis.__signatureAppealFixture.writes.push(['confirm',...args])}
          export async function clearStoredSignatureConfirm(){}
        `,
        "./paymentCarryOverStore": "export async function fetchPaymentCarryOverStates(){return {}};export async function markPaymentCarryOverExported(input){return input}",
        "./coachingStore": `export async function fetchStoredCoachingRecords(options){const f=globalThis.__signatureAppealFixture;f.coachingReads.push(options);if(f.coachingFailed)throw new Error('offline fixture');return structuredClone(f.coaching)}`,
        "./evaluationStore": "export async function fetchStoredEvaluations(){return globalThis.__signatureAppealFixture.evaluations};export async function fetchStoredEvaluationsForCases(){return globalThis.__signatureAppealFixture.evaluations};export const getStoredEvaluationMonthKey=record=>record.auditDate?.slice(0,7)||'';export const excludeTestEvaluations=records=>records.filter(record=>!record.isTestCase)",
        "./userRoleStore": "export async function fetchStoredUserProfiles(){return []}",
        "./PageHero": "export default function Hero(){return null}",
      };
      builder.onResolve({ filter: /^\.\/(appealStore|signatureStore|paymentCarryOverStore|coachingStore|evaluationStore|userRoleStore|PageHero)$/ },
        args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: mocks[args.path] }));
      builder.onLoad({ filter: /\/SignatureCenterMockup\.tsx$/ }, async args => {
        let source = await readFile(args.path, "utf8");
        for (const plugin of viteConfig.plugins.flat().filter(plugin => /signature-payment/.test(plugin.name))) {
          const transformed = await plugin.transform(source, args.path);
          if (transformed) source = typeof transformed === 'string' ? transformed : transformed.code;
        }
        const paymentStart = source.indexOf('function generatePaymentPdfFile(');
        const paymentEnd = source.indexOf('\nfunction SignaturePill', paymentStart);
        let paymentSource = source.slice(paymentStart, paymentEnd);
        paymentSource = paymentSource.replace(/(const pdf = new jsPDF\([^\n]+;)/, `$1
          const originalText = pdf.text.bind(pdf);
          pdf.text = (value, ...args) => { globalThis.__signatureAppealFixture.pdfText.push(String(value)); return originalText(value, ...args); };`);
        source = source.slice(0, paymentStart) + paymentSource + source.slice(paymentEnd);
        source = source.replace(/(function savePdfFile\([^)]*\) \{)/, `$1 globalThis.__signatureAppealFixture.exports.push({fileName, bytes:pdf.output('arraybuffer')}); return;`);
        source = source.replace(/(function downloadBlob\([^)]*\) \{)/, `$1 globalThis.__signatureAppealFixture.exports.push({fileName, blob}); return;`);
        source = source.replace("  if (loading) {", `
          globalThis.__signatureAppealFixture.actions={confirmPreview,signRole,saveDrawnSignature,generatePaymentExcel,generatePaymentPdf,openWorkspaceDetail,setSelectedMonth};
          globalThis.__signatureAppealFixture.view={hasPendingAppeal,confirmAvailable,workflowReadyToSign,selectedDocument,selectedMonthPaymentExportDocs,appealStatusVerified,coachingStatusVerified,paymentMessage};
          if (loading) {`);
        const carryOverExport = source.includes('function getCarryOverPaymentCycle(') ? ',getCarryOverPaymentCycle' : '';
        return { loader: "tsx", contents: source + `\nexport {buildPendingSignatureAppealCaseMap,isPaymentReadyDocument,isLateSignedDocument${carryOverExport}};` };
      });
    } }],
  });
  const { default: SignatureCenter, buildPendingSignatureAppealCaseMap, isPaymentReadyDocument, isLateSignedDocument, getCarryOverPaymentCycle } = await import(pathToFileURL(output).href);
  const doc = { monthKey: "2026-09", agentName: agent, agentId: agent, cases: [{ caseId }], eligibleByScore: true };
  const allSigned = Object.keys(names).map(signed);
  for (const [label, logs, held] of [
    ["initial pending", [submission], true], ["withdrawn for editing", [submission, event("appeal_submission_edit_started", -1, { topics: [topic] })], true], ["reviewed", oldResult, false],
    ["permission requested", [...oldResult, access], true],
    ["approved access awaiting opening", [...oldResult, access, approved], true],
    ["awaiting submission", [...oldResult, access, approved, opened], true],
    ["additional submitted", pendingAdditional, true], ["additional reviewed", complete, false],
    ["additional cancelled", [...pendingAdditional, event("appeal_additional_round_cancelled", 0, { roundId: "round-1" })], false],
    ["additional expired", [...oldResult, { ...opened, created_at: at(-74), details: { ...opened.details, openedAt: at(-74), expiresAt: at(-2) } }], false],
  ]) {
    const map = buildPendingSignatureAppealCaseMap(logs);
    assert.equal(map.has(caseId), held, label);
    assert.equal(isPaymentReadyDocument(doc, allSigned, map, fixture.coaching), !held, `${label}: payment eligibility`);
    assert.equal(isPaymentReadyDocument({ ...doc, cases: [{ caseId: "AA992000" }] }, allSigned, map, fixture.coaching), true, "another agent's document stays eligible");
    assert.equal(isLateSignedDocument(doc, allSigned.map(entry => ({ ...entry, signedAt: "2026-10-16T03:00:00Z" })), map, fixture.coaching), !held, `${label}: late payment eligibility`);
  }
  assert.equal(buildPendingSignatureAppealCaseMap(pendingAdditional).get(caseId).status, "Pending (Additional)");
  const afterDeadline = [...pendingAdditional, { ...opened, created_at: at(-100), details: { ...opened.details, openedAt: at(-100), expiresAt: at(-28) } },
    { ...additional, created_at: at(-29), details: { ...additional.details, submittedAt: at(-29) } }].filter(item => item !== opened && item !== additional);
  assert.equal(buildPendingSignatureAppealCaseMap(afterDeadline).has(caseId), true, "timely submitted appeals remain pending after the submission window expires");
  console.log("PASS initial/additional lifecycle, cancellation, expiry, document scope and current/late payment holds");

  const settle = async predicate => {
    for (let i = 0; i < 80; i++) {
      await act(async () => { await new Promise(done => setTimeout(done, 5)); });
      if (predicate()) return;
    }
    assert.fail("Signature fixture did not settle: " + document.body.textContent.slice(0, 200));
  };
  const mount = async (role, logs, entries = [], failed = false) => {
    if (root) await act(async () => root.unmount());
    window.localStorage.clear(); window.sessionStorage.clear();
    fixture.logs = logs; fixture.writes = []; fixture.reads = []; fixture.alerts = []; fixture.failed = failed; fixture.exports = []; fixture.pdfText = [];
    fixture.stored = [...(entries.length ? [{ docId: "2026-09::" + agent, entries, confirmedAt: at(-1) }] : []), ...(fixture.extraStored || [])];
    fixture.view = null;
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(SignatureCenter, { accounts,
      currentUser: { username: names[role], displayName: names[role], agentName: names[role], role: role === "QA" ? "Quality Assurance" : role } })));
    await settle(() => fixture.view?.selectedDocument && !document.body.textContent.includes("กำลังโหลด Signature Center") && fixture.reads.length >= 2 && (fixture.view.coachingStatusVerified || fixture.coachingFailed));
    await act(async () => fixture.actions.openWorkspaceDetail("2026-09::" + agent));
  };
  for (const logs of [[...oldResult, access], [...oldResult, access, approved, opened], pendingAdditional]) for (const role of Object.keys(names)) {
    await mount(role, logs);
    assert.equal(fixture.view.hasPendingAppeal, true, `${role}: additional hold`);
    assert.equal(fixture.view.workflowReadyToSign, false, `${role}: no signing workflow`);
    const confirm = [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "ยืนยันรับทราบข้อมูล");
    assert.ok(confirm?.disabled, `${role}: acknowledgement button disabled`);
    await act(async () => {
      await fixture.actions.confirmPreview();
      assert.equal(await fixture.actions.signRole(role, "fixture-ink"), false);
      assert.equal(await fixture.actions.saveDrawnSignature(role, "fixture-ink"), false);
    });
    assert.equal(fixture.writes.length, 0, `${role}: no signature or confirmation persisted`);
  }
  console.log("PASS all four roles blocked in the rendered UI and actual acknowledgement/signature handlers");
  for (const changedLogs of [[...oldResult, access], [...oldResult, access, approved, opened], pendingAdditional]) for (const [role, action, entries] of [
    ["Agent", "confirm", []], ["QA", "sign", []], ["QA", "ink", [signed("QA")]],
    ["QA", "excel", allSigned], ["QA", "pdf", allSigned],
  ]) {
    await mount(role, oldResult, entries);
    assert.equal(fixture.view.hasPendingAppeal, false);
    fixture.logs = changedLogs;
    await act(async () => {
      if (action === "confirm") await fixture.actions.confirmPreview();
      if (action === "sign") assert.equal(await fixture.actions.signRole(role, "fixture-ink"), false);
      if (action === "ink") assert.equal(await fixture.actions.saveDrawnSignature(role, "fixture-ink"), false);
      if (action === "excel") await fixture.actions.generatePaymentExcel();
      if (action === "pdf") await fixture.actions.generatePaymentPdf();
    });
    assert.equal(fixture.writes.length, 0, `${action}: an appeal submitted in another page blocks the stale page`);
    assert.equal(fixture.view.hasPendingAppeal, true, `${action}: fresh hold reaches UI`);
    assert.ok(fixture.reads.at(-1).options.forceRefresh, `${action}: forced fresh read`);
  }
  console.log("PASS stale open pages cannot acknowledge, sign, add ink or export current/late payments after additional submission");
  await mount("QA", oldResult);
  fixture.failed = true;
  await act(async () => assert.equal(await fixture.actions.signRole("QA", "fixture-ink"), false));
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.view.appealStatusVerified, false);
  assert.equal(fixture.view.hasPendingAppeal, true);
  await mount("Agent", oldResult, [], true);
  assert.equal(fixture.view.confirmAvailable, false);
  assert.equal(fixture.view.selectedMonthPaymentExportDocs.length, 0);
  console.log("PASS failed appeal reads keep acknowledgement, signing and payment exports locked");
  await mount("QA", oldResult);
  fixture.logs = complete;
  await act(async () => assert.equal(await fixture.actions.signRole("QA", "fixture-ink"), false));
  assert.equal(fixture.writes.length, 0, "new review cannot sign stale scores");
  assert.ok(fixture.alerts.some(message => message.includes("คะแนนล่าสุด")));
  await mount("QA", complete);
  await act(async () => assert.equal(await fixture.actions.signRole("QA", "fixture-ink"), true));
  assert.equal(fixture.writes.length, 1, "reviewed additional round releases signing");
  await mount("Agent", [...oldResult, access, approved, opened]);
  await act(async () => fixture.actions.confirmPreview());
  assert.equal(fixture.writes.length, 0, "approved additional window blocks signing before the Admin submits");
  await mount("Agent", [...oldResult, { ...opened, details: { ...opened.details, openedAt: at(-73), expiresAt: at(-1) }, created_at: at(-73) }]);
  await act(async () => fixture.actions.confirmPreview());
  assert.equal(fixture.writes.length, 1, "an unsubmitted 72-hour window expires and releases acknowledgement");
  const schedule = window.setTimeout.bind(window);
  let expireWindow;
  window.setTimeout = (callback, delay, ...args) => delay > 60_000 ? (expireWindow = callback, 0) : schedule(callback, delay, ...args);
  await mount('Agent', [...oldResult, access, approved, opened]);
  assert.ok(expireWindow);
  clock = now + 72 * 3600000;
  await act(async () => expireWindow());
  assert.equal(fixture.view.hasPendingAppeal, false, 'the open Signature page releases an unsubmitted round automatically at the deadline');
  window.setTimeout = schedule;
  clock = now;
  console.log("PASS approved additional window blocks all roles; expiry without submission and final QA decision unlock signing; changed reviews require fresh scores");

  const accepted = coaching(agent);
  for (const [label, changed] of [
    ['missing Coaching', []], ['another month', [{ ...accepted, monthKey: '2026-10' }]],
    ['another Agent ID', [{ ...accepted, agentId: 'different-user' }]],
    ['missing QA summary', [{ ...accepted, qaSummary: '' }]], ['missing topics', [{ ...accepted, recommendedTopics: [] }]],
    ['missing result', [{ ...accepted, actualCoaching: undefined }]], ['missing Action Plan', [{ ...accepted, actions: [] }]],
    ['missing QA Review', [{ ...accepted, qaReviewComment: '' }]], ['returned plan', [{ ...accepted, status: 'QA Reviewed' }]],
    ['pending QA Review', [{ ...accepted, status: 'Action Plan Submitted' }]],
    ['late QA Review', [{ ...accepted, qaReviewedAt: '2026-10-15T17:00:00Z' }]],
  ]) {
    assert.equal(isPaymentReadyDocument(doc, allSigned, new Map(), changed), false, label);
  }
  assert.equal(isPaymentReadyDocument(doc, allSigned, new Map(), [{ ...accepted, qaReviewedAt: '2026-10-15T16:59:59.999Z' }]), true, 'Bangkok deadline includes the last millisecond of day 15');
  assert.equal(isPaymentReadyDocument({ ...doc, monthKey: '2026-08' }, allSigned.map(entry => ({...entry, signedAt:'2026-09-12T03:00:00Z'})), new Map(), []), true, 'historical paid periods do not require retrospective Coaching');
  fixture.coaching = [];
  fixture.extraStored = [{ docId:'2026-09::Fixture Agent B', entries:allSigned.map(entry=>entry.role==='Agent'?{...entry,signerName:'Fixture Agent B',signedBy:'Fixture Agent B'}:entry), confirmedAt:at(-1) }];
  await mount('QA', oldResult, allSigned);
  assert.equal(fixture.view.selectedMonthPaymentExportDocs.length, 0);
  await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent.startsWith('Tracking (')).click());
  await act(async () => fixture.actions.openWorkspaceDetail('2026-09::'+agent));
  assert.ok(document.body.textContent.includes('ยังไม่มี Coaching ของเดือนนี้'));
  assert.ok([...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === 'Monthly Payment PDF').disabled);
  fixture.coaching = [accepted];
  await act(async () => window.dispatchEvent(new Event('qa-coaching-refresh')));
  await settle(() => fixture.view.selectedMonthPaymentExportDocs.length === 1);
  await act(async () => fixture.actions.generatePaymentPdf());
  assert.equal(fixture.exports.length, 1);
  const pdfBytes = fixture.exports[0].bytes || await fixture.exports[0].blob.arrayBuffer();
  assert.equal(new TextDecoder().decode(new Uint8Array(pdfBytes).slice(0, 4)), '%PDF');
  assert.ok(fixture.pdfText.some(text => text.includes(agent)), 'the production PDF includes the qualified Agent');
  assert.ok(!fixture.pdfText.some(text => text.includes('Fixture Agent B')), 'an Agent without completed Coaching is absent from the PDF');
  const freshReadCount = fixture.coachingReads.length;
  fixture.coaching = [];
  await act(async () => fixture.actions.generatePaymentPdf());
  assert.equal(fixture.exports.length, 1, 'stale ready UI cannot export after Coaching is removed or changed');
  assert.ok(fixture.coachingReads.length > freshReadCount);
  assert.deepEqual(fixture.coachingReads.at(-1), {allowCache:false,forceRefresh:true});
  assert.equal(fixture.view.selectedMonthPaymentExportDocs.length, 0);
  fixture.coaching = [accepted];
  await mount('QA', oldResult, allSigned);
  fixture.coachingFailed = true;
  await act(async () => fixture.actions.generatePaymentExcel());
  assert.equal(fixture.exports.length, 0);
  assert.equal(fixture.view.coachingStatusVerified, false);
  assert.ok(fixture.view.paymentMessage.includes('ตรวจผล Coaching'));
  fixture.coachingFailed = false;
  console.log('PASS same Agent/month Coaching, summary, Action Plan, accepted QA Review and Bangkok day-15 cutoff gate real production PDF names; stale and failed reads cannot export');
  if (getCarryOverPaymentCycle) {
    const lateSignatures = allSigned.map(entry => ({ ...entry, signedAt: '2026-10-16T03:00:00Z' }));
    assert.equal(getCarryOverPaymentCycle(doc, lateSignatures, []), '', 'carry-over cannot bypass missing Coaching');
    assert.equal(getCarryOverPaymentCycle(doc, lateSignatures, [accepted]), '2026-10');
    const lateReview = { ...accepted, qaReviewedAt: '2026-10-16T03:00:00Z' };
    assert.equal(getCarryOverPaymentCycle(doc, allSigned, [lateReview]), '2026-10', 'a late QA Review does not enter the original payment cycle');
    fixture.coaching = [accepted];
    fixture.extraStored = [];
    await mount('QA', oldResult, lateSignatures);
    await act(async () => fixture.actions.setSelectedMonth('2026-10'));
    await settle(() => fixture.view.selectedMonthPaymentExportDocs.length === 1);
    assert.equal(fixture.view.selectedMonthPaymentExportDocs[0].carryOverFrom, '2026-09');
    await act(async () => fixture.actions.generatePaymentPdf());
    assert.equal(fixture.exports.length, 1, 'eligible carry-over remains in the actual payment PDF');
    fixture.coaching = [];
    await act(async () => fixture.actions.generatePaymentPdf());
    assert.equal(fixture.exports.length, 1, 'fresh Coaching verification also protects carry-over PDF names');
    console.log('PASS production prebuild preserves carry-over payment selection and fresh Coaching/QA Review gates');
  }
  fixture.coaching = [accepted,coaching('Fixture Agent B')];
  fixture.evaluations = fixture.evaluations.map(record=>record.agentName==='Fixture Agent B'
    ? {...record,rawDataPreview:{Supervisor:'Other Supervisor'}} : record);
  fixture.extraStored = [{docId:'2026-09::Fixture Agent B',entries:allSigned.map(entry=>entry.role==='Agent'
    ? {...entry,signerName:'Fixture Agent B',signedBy:'Fixture Agent B'}
    : entry.role==='Supervisor'?{...entry,signerName:'Other Supervisor',signedBy:'Other Supervisor'}:entry),confirmedAt:at(-1)}];
  await mount('Supervisor',oldResult,allSigned);
  assert.deepEqual(fixture.view.selectedMonthPaymentExportDocs.map(doc=>doc.agentName),[agent],'Supervisor sees only assigned ready payment documents');
  for (const [label,expectedCount,signature] of [['Monthly Payment PDF',1,'%PDF'],['Monthly Payment Excel',2,'PK']]) {
    const downloadButton=document.querySelector(`button[aria-label="${label}"]`);
    assert.ok(downloadButton&&!downloadButton.disabled,'Supervisor '+label+' is enabled');
    await act(async()=>downloadButton.click());
    await settle(()=>fixture.exports.length===expectedCount);
    const file=fixture.exports.at(-1),bytes=file.bytes||await file.blob.arrayBuffer();
    assert.ok(new TextDecoder().decode(new Uint8Array(bytes).slice(0,4)).startsWith(signature),'real '+label+' bytes downloaded');
  }
  assert.ok(!fixture.pdfText.some(text=>text.includes('Fixture Agent B')),'other Supervisor agent is absent from PDF payment rows');
  const exportedRows=fixture.workbook.Sheets.Payment_Cycle_Detail||fixture.workbook.Sheets.Monthly_Team_Summary;
  assert.ok(!JSON.stringify(exportedRows).includes('Fixture Agent B'),'other Supervisor agent is absent from Excel payment rows');
  fixture.coaching=[];
  await act(async()=>fixture.actions.generatePaymentPdf());
  assert.equal(fixture.exports.length,2,'Supervisor cannot export stale Coaching data');
  fixture.coaching=[accepted];
  for (const role of ['Agent','Senior']) {
    await mount(role,oldResult,allSigned);
    for (const label of ['Monthly Payment PDF','Monthly Payment Excel']) assert.ok(document.querySelector(`button[aria-label="${label}"]`).disabled,role+' payment button is disabled');
    await act(async()=>fixture.actions.generatePaymentPdf());
    assert.equal(fixture.exports.length,0,role+' cannot call the payment action directly');
    assert.ok(fixture.alerts.some(message=>message.includes('Quality Assurance')),'denied action explains permission');
  }
  console.log('PASS real Supervisor buttons download PDF/Excel, respect assigned-document scope and fresh Coaching gates; Agent/Senior controls stay locked');
} finally {
  if (root) await act(async () => root.unmount());
  dom.window.close();
  globalThis.Date = NativeDate;
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
  console.error = originalError;
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
  delete globalThis.__signatureAppealFixture;
  await rm(temporary, { recursive: true, force: true });
}
