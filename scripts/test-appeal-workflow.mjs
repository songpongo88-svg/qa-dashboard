import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";

const temp = await mkdtemp(resolve(".appeal-workflow-test-"));
const dom = new JSDOM('<div id="root"></div>', { url: "https://qa.test/" });
const previous = new Map();
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "Event", "MouseEvent", "CustomEvent"]) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = globalThis.__workflowFixture = { logs: [], writes: [], assigned: [], fail: false, docs: new Map(), transactionFail: false };
window.open = url => { fixture.openedUrl = url; };
const { createRoot } = await import("react-dom/client");
const { Simulate } = await import("react-dom/test-utils");
const root = createRoot(document.getElementById("root"));
const storeMock = `
  export async function fetchAppealEvents(types){return globalThis.__workflowFixture.logs.filter(event=>!types||types.includes(event.event_type))}
  export async function fetchAdditionalAppealReasonOptions(){return []}
  export async function fetchAssignedAppealRequestIds(){return globalThis.__workflowFixture.assigned}
  export async function fetchAppealDiscussionEvents(){globalThis.__workflowFixture.discussionReads=(globalThis.__workflowFixture.discussionReads||0)+1;return []}
  export async function writeAppealEvent(user,event_type,payload){const event={...payload,event_type,created_at:new Date().toISOString()};globalThis.__workflowFixture.logs.push(event);globalThis.__workflowFixture.writes.push(event);return true}
  export async function writeAdditionalAppealAccessDecision(user,decision,round){
    const fixture=globalThis.__workflowFixture;if(fixture.fail){fixture.fail=false;throw new Error('offline')}
    const at=new Date().toISOString();const events=[{...decision,event_type:'appeal_additional_access_decided',created_at:at},...(round?[{...round,event_type:'appeal_additional_round_opened',created_at:at}]:[])];
    fixture.logs.push(...events);fixture.writes.push(...events);return true;
  }`;
try {
  const output = resolve(temp, "review.mjs");
  await build({ entryPoints: ["src/AppealRequestsMockup.tsx"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolated-workflow-boundaries", setup(builder) {
    builder.onResolve({ filter: /^\.\/appealStore$/ }, () => ({ path: "store", namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\/userRoleStore$/ }, () => ({ path: "profiles", namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\/PageHero$/ }, () => ({ path: "hero", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path === "store" ? storeMock : args.path === "profiles" ? "export async function fetchStoredUserProfiles(){return []}" : "export default function Hero(){return null}" }));
  } }] });
  const { default: Review, buildAppealRequests, appealAdditionalDeadline } = await import(pathToFileURL(output).href);
  const utilityOutput = resolve(temp, "workflow.mjs");
  await build({ stdin: { contents: "export * from './src/appealWorkflow'; export {withAppealScoreState} from './src/pendingAppealScore';", resolveDir: resolve("."), loader: "ts" }, outfile: utilityOutput, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
  const { appealWorkflowStatus, scopeAppealRequests, APPEAL_WORKFLOW_STATUSES, withAppealScoreState } = await import(pathToFileURL(utilityOutput).href);
  const now = Date.now();
  const at = hours => new Date(now + hours * 3600000).toISOString();
  const topic = { code: "1", label: "Process", score: 30, max: 35, wantsAppeal: true, appealReason: "ตรวจขั้นตอนเดิม", comment: "Original" };
  const reviewedTopic = { ...topic, decision: "Approved", revisedScore: 32, revisedComment: "Reviewed" };
  function events(caseId, stage, agent = "Alpha Agent") {
    const requestId = `appeal-${caseId}-test`; const roundId = `round-${caseId}`; const accessId = `access-${caseId}`;
    const event = (event_type, created_at, details = {}) => ({ event_type, created_at, case_id: caseId, target_agent: agent, details: { requestId, ...details } });
    const rows = [event("appeal_request_submitted", at(-100), { topics: [topic], submittedAt: at(-100), auditDate: "2026-09-01", finalScore: 85, grade: "B", submittedBy: agent })];
    if (stage === "Pending") return rows;
    rows.push(event("appeal_request_reviewed", at(-90), { topics: [reviewedTopic], decision: "Approved", reviewedAt: at(-90), reviewId: `review-${caseId}` }));
    if (["Approved", "Reset"].includes(stage)) {
      if (stage === "Reset") rows.push(event("appeal_request_reset", at(-1)));
      return rows;
    }
    if (!["Cancelled (Additional)", "Expired (Additional)"].includes(stage)) {
      rows.push(event("appeal_additional_access_requested", at(-2), { accessId, requestedAt: at(-2), topicCodes: ["1"], reason: "มีหลักฐานใหม่" }));
      if (stage === "Request Additional Appeal") return rows;
      rows.push(event("appeal_additional_access_decided", at(-1), { accessId, approved: stage !== "Additional Request Rejected", decidedAt: at(-1), reason: "QA ตรวจคำขอแล้ว" }));
      if (["Approved (Access)", "Additional Request Rejected"].includes(stage)) return rows;
    }
    const openedAt = stage === "Expired (Additional)" ? at(-73) : at(-1);
    rows.push(event("appeal_additional_round_opened", openedAt, { roundId, accessId, openedAt, expiresAt: appealAdditionalDeadline(openedAt), topics: [topic] }));
    if (stage === "Pending (Additional)") rows.push(event("appeal_additional_evidence_submitted", at(-0.5), { roundId, submittedAt: at(-0.5), topics: [{ ...topic, appealReason: "เหตุผลรอบใหม่" }] }));
    if (stage === "Cancelled (Additional)") rows.push(event("appeal_additional_round_cancelled", at(-0.5), { roundId, cancelledAt: at(-0.5), reason: "QA ยกเลิก" }));
    return rows;
  }
  const stages = APPEAL_WORKFLOW_STATUSES.filter(value => value !== "Partially Approved" && value !== "Rejected");
  fixture.logs = stages.flatMap((stage, index) => events(`AA990${String(index).padStart(3, "0")}`, stage));
  const projected = buildAppealRequests(fixture.logs, now);
  assert.deepEqual(projected.map(appealWorkflowStatus).sort(), [...stages].sort());
  assert.equal(projected.find(row => appealWorkflowStatus(row) === "Awaiting Additional Submission").status, "Approved", "permission never changes the scored review result");
  const submitted = projected.find(row => appealWorkflowStatus(row) === "Pending (Additional)");
  assert.equal(submitted.additionalRound.topics[0].appealReason, "เหตุผลรอบใหม่");
  const waiting = projected.find(row => appealWorkflowStatus(row) === "Awaiting Additional Submission");
  assert.equal(withAppealScoreState([{agent: submitted.agent, caseId: submitted.caseId, monthKey: "2026-09", finalScore: 85}], [submitted])[0].pendingAppealCaseCount, 1, "submitted additional appeals hold the score until QA reviews");
  assert.equal(withAppealScoreState([{agent: submitted.agent, caseId: submitted.caseId, monthKey: "2026-09", finalScore: 85}], [{...submitted, editingDraft: true}])[0].pendingAppealCaseCount, 0, "withdrawn drafts do not stay in the QA score hold");
  assert.equal(withAppealScoreState([{agent: waiting.agent, caseId: waiting.caseId, monthKey: "2026-09", finalScore: 85}], [waiting])[0].pendingAppealCaseCount, 0, "waiting for owner submission keeps the previous score available");
  const editedLogs = events("AA991111", "Pending (Additional)");
  const editedRequestId = editedLogs[0].details.requestId;
  editedLogs.push({ event_type: "appeal_submission_resubmitted", created_at: at(74), details: { requestId: editedRequestId, roundId: "round-AA991111", topics: [{ ...topic, appealReason: "แก้ไขหลังยื่นทันเวลา" }] } });
  assert.equal(buildAppealRequests(editedLogs, now + 75 * 3600000)[0].additionalRound.topics[0].appealReason, "แก้ไขหลังยื่นทันเวลา");
  const closedThenRequested = events("AA992222", "Cancelled (Additional)");
  closedThenRequested.push({ event_type: "appeal_additional_access_requested", created_at: at(-0.1), details: { requestId: closedThenRequested[0].details.requestId, accessId: "access-new", topicCodes: ["1"], reason: "ขออีกครั้ง" } });
  assert.equal(appealWorkflowStatus(buildAppealRequests(closedThenRequested, now)[0]), "Request Additional Appeal");
  console.log("PASS all workflow stages, old review preservation, current reasons, timely submissions and new requests after cancellation");

  fixture.logs.push(...events("AA993333", "Pending", "Bravo Agent"));
  const qa = { username: "qa", agentName: "QA Reviewer", role: "Quality Assurance" };
  const render = async (user, options = {}) => { await act(async () => root.render(React.createElement(Review, { key: `${user.role}-${options.externalRequestId || "list"}`, currentUser: user, allowReview: true, ...options }))); };
  const rows = () => [...document.querySelectorAll("tbody tr")].filter(row => /AA99/.test(row.textContent));
  const click = async element => { assert.ok(element, "expected UI control exists"); await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true }))); };
  const button = text => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === text);
  const select = async (element, value) => { await act(async () => { element.value = value; element.dispatchEvent(new Event("change", { bubbles: true })); }); };
  await render(qa);
  assert.equal(rows().length, stages.length + 1);
  const filter = document.querySelector('select[aria-label="Status"]');
  for (const stage of stages) {
    await select(filter, stage);
    assert.equal(rows().length, stage === "Pending" ? 2 : 1, `real Status dropdown filters ${stage}`);
  }
  await select(filter, "All");
  console.log("PASS actual production component Status control filters every stage using the displayed status");

  for (const role of ["Admin Live Chat", "Admin", "Agent", "Custom Role"]) {
    await render({ username: "alpha", agentName: "Alpha Agent", role });
    assert.ok(rows().length);
    assert.ok(rows().every(row => !row.textContent.includes("Bravo Agent")));
    await click(rows().find(row => row.textContent.includes("อนุมัติแล้ว · รอ Admin ยื่นเพิ่ม")));
    assert.ok(button("ยื่นอุทธรณ์เพิ่มเติม"));
    assert.equal(button("อนุญาตให้ยื่นเพิ่ม (3 วัน)"), undefined);
    assert.equal(document.querySelector('[aria-label="QA and Senior internal appeal discussion"]'), null);
    await click(button("ยื่นอุทธรณ์เพิ่มเติม"));
    assert.ok(fixture.openedUrl.includes("subTab=case-detail") && fixture.openedUrl.includes("caseId=AA990002"));
  }
  for (const role of ["Senior", "Supervisor"]) {
    await render({ username: "lead", agentName: "Team Lead", role }, { allowedAgentNames: ["Alpha Agent"] });
    assert.ok(rows().every(row => !row.textContent.includes("Bravo Agent")));
    await click(rows().find(row => row.textContent.includes("รอ QA อนุมัติยื่นเพิ่ม")));
    assert.equal(button("อนุญาตให้ยื่นเพิ่ม (3 วัน)"), undefined, `${role} cannot approve even when allowReview prop is true`);
  }
  const all = buildAppealRequests(fixture.logs, now);
  assert.equal(scopeAppealRequests(all, { ...qa, role: "Senior" }, []).length, 0, "missing team never widens scope");
  assert.equal(scopeAppealRequests(all, { ...qa, role: "Senior" }, [], ["appeal-AA993333-test"]).length, 1, "explicit internal assignment grants only that case");
  console.log("PASS QA, Admin Live Chat, Admin, Agent, custom role, Senior and Supervisor scope and action permissions");

  await render(qa);
  await click(rows().find(row => row.textContent.includes("รอ QA อนุมัติยื่นเพิ่ม")));
  await click(button("อนุญาตให้ยื่นเพิ่ม (3 วัน)"));
  fixture.fail = true;
  const originalError = console.error; console.error = () => {};
  await click(button("ยืนยันบันทึกสิทธิ์"));
  console.error = originalError;
  assert.equal(fixture.writes.length, 0, "offline approval saves neither half");
  await click(button("ยืนยันบันทึกสิทธิ์"));
  assert.equal(fixture.writes.length, 2);
  const opened = fixture.writes.find(row => row.event_type === "appeal_additional_round_opened");
  assert.equal(Date.parse(opened.details.expiresAt) - Date.parse(opened.details.openedAt), 72 * 3600000);
  assert.equal(appealWorkflowStatus(buildAppealRequests(fixture.logs)[stages.indexOf("Request Additional Appeal")]), "Awaiting Additional Submission");
  await render(qa, { externalRequestId: submitted.requestId });
  assert.ok(document.querySelector('[aria-label="ขั้นตอนอุทธรณ์ปัจจุบัน"]').textContent.includes("ยื่นเพิ่มแล้ว"), "deep link opens the actual selected request");
  const incomplete = projected.find(row => appealWorkflowStatus(row) === "Approved (Access)");
  await render(qa, { externalRequestId: incomplete.requestId });
  await click(button("เปิดสิทธิ์ที่อนุมัติค้าง"));
  await click(button("ยืนยันบันทึกสิทธิ์"));
  const recovered = fixture.writes.find(row => row.event_type === "appeal_additional_round_opened" && row.details.requestId === incomplete.requestId);
  assert.equal(recovered.details.openedAt, incomplete.additionalAccessRequest.decidedAt, "legacy partial approval recovery uses the original approval time");
  assert.equal(recovered.details.expiresAt, appealAdditionalDeadline(incomplete.additionalAccessRequest.decidedAt), "legacy recovery cannot extend the 72-hour window");
  console.log("PASS permission failure/retry, single approval plus usable round, 72-hour deadline and exact workspace deep link");
  const pending = projected.find(row => appealWorkflowStatus(row) === "Pending");
  await render(qa, { externalRequestId: pending.requestId });
  await click([...document.querySelectorAll('[role="group"] button')].find(node => node.textContent.trim().endsWith("Reject")));
  for (const id of ["reject-reason-1", "appeal-review-summary"]) {
    const input = document.getElementById(id);
    assert.ok(input);
    await act(async () => { input.value = "ตรวจสอบเหตุผลแล้ว"; Simulate.change(input); });
  }
  await click(button("Save Review"));
  fixture.logs.push({ event_type: "appeal_submission_edit_started", created_at: at(1), details: { requestId: pending.requestId } });
  const countBefore = fixture.writes.length;
  await click(button("ยืนยันบันทึก"));
  assert.equal(fixture.writes.length, countBefore, "QA cannot save a stale preview while the owner has pulled the appeal back for editing");
  assert.ok(document.querySelector('[role="alertdialog"]').textContent.includes("คำขอนี้มีการเปลี่ยนแปลง"));
  console.log("PASS fresh workflow check prevents QA saving a review after owner withdrawal");
  await act(async () => root.unmount());

  const storeOutput = resolve(temp, "store.mjs");
  await build({ entryPoints: ["src/appealStore.ts"], outfile: storeOutput, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "transaction-boundary", setup(builder) {
    builder.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: "db", namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\/firebaseClient$/ }, () => ({ path: "client", namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\/appealCaseAvailability$/ }, () => ({ path: "available", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path === "client" ? "export const firebaseDb={}" : args.path === "available" ? "export async function checkAppealSourceCases(events){return events}" : `
      export const doc=(_db,name,id)=>name+'/'+id, collection=(_db,name)=>name, query=(...a)=>a, limit=a=>a, orderBy=(...a)=>a, where=(field,op,value)=>({field,op,value});
      export async function setDoc(path,data){globalThis.__workflowFixture.docs.set(path,structuredClone(data))}
      export async function getDocs(q){const condition=q.find(part=>part?.field==='details.accessId');return {docs:[...globalThis.__workflowFixture.docs.entries()].filter(([id,data])=>!condition||data.details?.accessId===condition.value).map(([id,data])=>({id,data:()=>data}))}}
      export function writeBatch(){const writes=[];return {set:(path,data)=>writes.push([path,data]),commit:async()=>{const f=globalThis.__workflowFixture;if(f.batchFail)throw new Error('batch failed');for(const [path,data]of writes)f.docs.set(path,structuredClone(data));}}}
      export async function runTransaction(_db,callback){const f=globalThis.__workflowFixture;if(f.transactionReadDenied){const error=new Error('document get denied');error.code='permission-denied';throw error;}const writes=[];const value=await callback({get:async path=>({exists:()=>f.docs.has(path),data:()=>f.docs.get(path)}),set:(path,data)=>writes.push([path,data])});if(f.transactionFail){f.transactionFail=false;throw new Error('transaction failed')}for(const [path,data] of writes)f.docs.set(path,structuredClone(data));return value}
    ` }));
  } }] });
  const store = await import(pathToFileURL(storeOutput).href);
  const decision = { case_id: "AA999999", target_agent: "Alpha Agent", details: { requestId: "request-atomic", accessId: "access-atomic", workflowId: "access-atomic", approved: true, decidedAt: at(0), reason: "Approved" } };
  const round = { ...decision, details: { requestId: "request-atomic", accessId: "access-atomic", roundId: "access-atomic", openedAt: at(0), expiresAt: at(72), topics: [topic] } };
  fixture.transactionFail = true;
  await assert.rejects(store.writeAdditionalAppealAccessDecision(qa, decision, round), /transaction failed/);
  assert.equal(fixture.docs.size, 0);
  assert.equal(await store.writeAdditionalAppealAccessDecision(qa, decision, round), true);
  assert.equal(fixture.docs.size, 2);
  const saved = structuredClone([...fixture.docs.values()]);
  await store.writeAdditionalAppealAccessDecision(qa, decision, { ...round, details: { ...round.details, openedAt: at(10), expiresAt: at(82) } });
  assert.deepEqual([...fixture.docs.values()], saved, "retry does not renew deadline");
  await assert.rejects(store.writeAdditionalAppealAccessDecision(qa, { ...decision, details: { ...decision.details, approved: false } }), /already decided/);
  assert.equal(await store.writeAdditionalAppealAccessDecision({ ...qa, role: "Admin" }, decision, round), false);
  await assert.rejects(store.writeAdditionalAppealAccessDecision(qa, decision), /requires/);
  const fallbackDecision = { ...decision, details: { ...decision.details, requestId: "request-fallback", accessId: "access-fallback", workflowId: "access-fallback" } };
  const fallbackRound = { ...round, details: { ...round.details, requestId: "request-fallback", accessId: "access-fallback", roundId: "access-fallback" } };
  fixture.transactionReadDenied = true;
  const baselineCount = fixture.docs.size;
  assert.equal(await store.writeAdditionalAppealAccessDecision(qa, fallbackDecision, fallbackRound), true);
  assert.equal(fixture.docs.size, baselineCount + 2, "batch fallback atomically saves approval and its 72h round");
  const fallbackSaved = structuredClone([...fixture.docs.values()]);
  assert.equal(await store.writeAdditionalAppealAccessDecision(qa, fallbackDecision, {
    ...fallbackRound, details: { ...fallbackRound.details, openedAt: at(10), expiresAt: at(82) }
  }), true);
  assert.deepEqual([...fixture.docs.values()], fallbackSaved, "batch fallback retry cannot extend the deadline");
  await assert.rejects(store.writeAdditionalAppealAccessDecision(qa, {
    ...fallbackDecision, details: { ...fallbackDecision.details, approved: false }
  }), /already decided/);
  fixture.transactionReadDenied = false;
  console.log("PASS transaction, restricted-document-read atomic fallback, no deadline extension and conflict detection");
} finally {
  await rm(temp, { recursive: true, force: true });
  dom.window.close();
  for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  delete globalThis.__workflowFixture;
}
