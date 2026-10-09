import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";

const temporary = await mkdtemp(resolve(".signature-appeal-test-"));
const NativeDate = globalThis.Date;
const now = NativeDate.parse("2026-10-12T03:00:00Z");
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
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
  logs: [], writes: [], reads: [], alerts: [], stored: [], failed: false, exports: 0,
};
const originalWarn = console.warn;
const originalError = console.error;
const expectedFailure = args => args.some(value => value?.constructor?.name === "SignatureAppealHoldError" || value?.message === "offline fixture");
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
        "./evaluationStore": "export async function fetchStoredEvaluations(){return globalThis.__signatureAppealFixture.evaluations};export async function fetchStoredEvaluationsForCases(){return globalThis.__signatureAppealFixture.evaluations};export const getStoredEvaluationMonthKey=record=>record.auditDate?.slice(0,7)||'';export const excludeTestEvaluations=records=>records.filter(record=>!record.isTestCase)",
        "./userRoleStore": "export async function fetchStoredUserProfiles(){return []}",
        "./PageHero": "export default function Hero(){return null}",
      };
      builder.onResolve({ filter: /^\.\/(appealStore|signatureStore|paymentCarryOverStore|evaluationStore|userRoleStore|PageHero)$/ },
        args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: mocks[args.path] }));
      builder.onLoad({ filter: /\/SignatureCenterMockup\.tsx$/ }, async args => {
        let source = await readFile(args.path, "utf8");
        source = source.replace("  if (loading) {", `
          globalThis.__signatureAppealFixture.actions={confirmPreview,signRole,saveDrawnSignature,generatePaymentExcel,generatePaymentPdf,openWorkspaceDetail};
          globalThis.__signatureAppealFixture.view={hasPendingAppeal,confirmAvailable,workflowReadyToSign,selectedDocument,selectedMonthPaymentExportDocs,appealStatusVerified};
          if (loading) {`);
        return { loader: "tsx", contents: source + "\nexport {buildPendingSignatureAppealCaseMap,isPaymentReadyDocument,isLateSignedDocument};" };
      });
    } }],
  });
  const { default: SignatureCenter, buildPendingSignatureAppealCaseMap, isPaymentReadyDocument, isLateSignedDocument } = await import(pathToFileURL(output).href);
  const doc = { monthKey: "2026-09", cases: [{ caseId }], eligibleByScore: true };
  const allSigned = Object.keys(names).map(signed);
  for (const [label, logs, held] of [
    ["initial pending", [submission], true], ["reviewed", oldResult, false],
    ["permission requested", [...oldResult, access], false],
    ["awaiting submission", [...oldResult, access, approved, opened], false],
    ["additional submitted", pendingAdditional, true], ["additional reviewed", complete, false],
    ["additional cancelled", [...pendingAdditional, event("appeal_additional_round_cancelled", 0, { roundId: "round-1" })], false],
    ["additional expired", [...oldResult, { ...opened, created_at: at(-74), details: { ...opened.details, openedAt: at(-74), expiresAt: at(-2) } }], false],
  ]) {
    const map = buildPendingSignatureAppealCaseMap(logs);
    assert.equal(map.has(caseId), held, label);
    assert.equal(isPaymentReadyDocument(doc, allSigned, map), !held, `${label}: payment eligibility`);
    assert.equal(isPaymentReadyDocument({ ...doc, cases: [{ caseId: "AA992000" }] }, allSigned, map), true, "another agent's document stays eligible");
    assert.equal(isLateSignedDocument(doc, allSigned.map(entry => ({ ...entry, signedAt: "2026-10-16T03:00:00Z" })), map), !held, `${label}: late payment eligibility`);
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
    fixture.logs = logs; fixture.writes = []; fixture.reads = []; fixture.alerts = []; fixture.failed = failed;
    fixture.stored = entries.length ? [{ docId: "2026-09::" + agent, entries, confirmedAt: at(-1) }] : [];
    fixture.view = null;
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(SignatureCenter, { accounts,
      currentUser: { username: names[role], displayName: names[role], agentName: names[role], role: role === "QA" ? "Quality Assurance" : role } })));
    await settle(() => fixture.view?.selectedDocument && !document.body.textContent.includes("กำลังโหลด Signature Center") && fixture.reads.length >= 2);
    await act(async () => fixture.actions.openWorkspaceDetail("2026-09::" + agent));
  };
  for (const role of Object.keys(names)) {
    await mount(role, pendingAdditional);
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
  for (const [role, action, entries] of [
    ["Agent", "confirm", []], ["QA", "sign", []], ["QA", "ink", [signed("QA")]],
    ["QA", "excel", allSigned], ["QA", "pdf", allSigned],
  ]) {
    await mount(role, oldResult, entries);
    assert.equal(fixture.view.hasPendingAppeal, false);
    fixture.logs = pendingAdditional;
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
  assert.equal(fixture.writes.length, 1, "permission-only stage preserves signing against the reviewed result");
  console.log("PASS final review unlocks signing; changed reviews require refreshed scores; permission-only stages remain usable");
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
