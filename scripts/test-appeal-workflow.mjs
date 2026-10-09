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
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement", "Event", "MouseEvent", "CustomEvent", "DOMParser", "Node"]) {
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
  export async function fetchAppealEvents(types,options){globalThis.__workflowFixture.lastAppealFetch=options;return globalThis.__workflowFixture.logs.filter(event=>(!types||types.includes(event.event_type))&&(!options?.requestId||event.details?.requestId===options.requestId))}
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
  await build({ jsx: "automatic", entryPoints: ["src/AppealRequestsMockup.tsx"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "isolated-workflow-boundaries", setup(builder) {
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
  assert.equal(fixture.lastAppealFetch.requestId, "appeal-AA990001-test", "approval reads only the selected appeal request");
  assert.ok(fixture.lastAppealFetch.limit <= 250, "approval never scans 2,000 appeal events");
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
  // Repeating the same topic appends an Action, while carried-forward topics
  // remain part of the score snapshot without appearing as a new submission.
  const repeatedId = "appeal-AA994444-test";
  const repeatedRound = "round-repeated";
  const originalTopic = { ...topic, score: 18, max: 30, appealReason: "Original appeal reason\nOriginal second line" };
  const otherTopic = { ...topic, code: "2", score: 14, max: 20, appealReason: "Other topic original reason" };
  const firstResult = [{ ...originalTopic, decision: "Approved", revisedScore: 20, revisedComment: "First QA comment" }, { ...otherTopic, decision: "Approved", revisedScore: 16, revisedComment: "Other QA comment" }];
  const repeatedEvent = (event_type, hours, details) => ({ event_type, created_at: at(hours), case_id: "AA994444", target_agent: "Alpha Agent", details: { requestId: repeatedId, ...details } });
  const repeatedPending = [
    repeatedEvent("appeal_request_submitted", -100, { topics: [originalTopic, otherTopic], finalScore: 80, auditDate: "2026-09-01", submittedBy: "Alpha Agent", submittedAt: at(-100) }),
    repeatedEvent("appeal_request_reviewed", -90, { topics: firstResult, reviewId: "review-first", reviewedBy: "First Reviewer", reviewedAt: at(-90), decision: "Approved", reviewSummary: "First review" }),
    repeatedEvent("appeal_additional_round_opened", -2, { roundId: repeatedRound, openedAt: at(-2), expiresAt: appealAdditionalDeadline(at(-2)), topics: [{ ...originalTopic, appealReason: "" }] }),
    repeatedEvent("appeal_additional_evidence_submitted", -1, { roundId: repeatedRound, submittedBy: "Alpha Agent", submittedAt: at(-1), topics: [{ ...originalTopic, appealReason: "New appeal reason\nNew second line" }] }),
  ];
  const unchanged = JSON.stringify(repeatedPending);
  const projectedPending = buildAppealRequests([...repeatedPending].reverse(), now)[0];
  assert.equal(projectedPending.actionHistory.length, 2);
  assert.equal(projectedPending.actionHistory[0].topics[0].appealReason, originalTopic.appealReason);
  assert.equal(projectedPending.actionHistory[0].topics[0].revisedComment, "First QA comment");
  assert.equal(projectedPending.actionHistory[1].topics[0].appealReason, "New appeal reason\nNew second line");
  assert.equal(projectedPending.actionHistory[1].topics[0].decision, undefined);
  assert.equal(JSON.stringify(repeatedPending), unchanged, "history projection never mutates old events");
  fixture.logs = structuredClone(repeatedPending);
  fixture.writes = [];
  await render(qa, { key: "repeated-action", externalRequestId: repeatedId });
  const firstAction = document.querySelector('[aria-label="Appeal Actions"] [data-appeal-action="1"]');
  assert.ok(firstAction.textContent.includes("Original appeal reason") && firstAction.textContent.includes("First QA comment"));
  assert.equal(firstAction.querySelector("textarea,select,button[aria-pressed]"), null, "old Action is read-only");
  assert.ok(document.body.textContent.includes("Appeal Reason · Action 2"));
  assert.equal(document.getElementById("appeal-review-summary").value, "", "additional QA summary starts fresh");
  const activeGroup = document.querySelector('[aria-label="ผลพิจารณาหัวข้อ 1"]');
  assert.equal(document.querySelector('[aria-label="ผลพิจารณาหัวข้อ 2"]'), null, "unrelated old topic cannot be re-reviewed in this round");
  await click([...activeGroup.querySelectorAll("button")].find(node => node.textContent.includes("Approved")));
  assert.equal(activeGroup.parentElement.querySelector("select").value, "20", "additional Revised Score starts from the latest saved approval, not the original 18");
  await select(activeGroup.parentElement.querySelector("select"), "22");
  for (const [id, value] of [["revised-comment-1", "Second QA comment"], ["appeal-review-summary", "Second review"]]) {
    await act(async () => { const input = document.getElementById(id); input.value = value; Simulate.change(input); });
  }
  await click(button("Save Review"));
  await click(button("ยืนยันบันทึก"));
  const secondResult = fixture.writes.at(-1);
  assert.equal(secondResult.details.roundId, repeatedRound);
  assert.deepEqual(secondResult.details.actionTopicCodes, ["1"]);
  assert.equal(secondResult.details.topics.find(topic => topic.code === "2").revisedComment, "Other QA comment");
  assert.equal(secondResult.details.topics.find(topic => topic.code === "1").appealReason, "New appeal reason\nNew second line");
  const afterSecond = buildAppealRequests(fixture.logs)[0];
  assert.equal(afterSecond.actionHistory[1].topics.length, 1, "carried results do not create fake appeals in Action 2");
  assert.equal(afterSecond.actionHistory[1].reviews[0].finalScore, 86);
  assert.equal(afterSecond.actionHistory[0].reviews[0].finalScore, 84);
  await click(button("รับทราบ"));
  await click(button("แก้ไขผลอุทธรณ์"));
  assert.equal(document.querySelector('[aria-label="ผลพิจารณาหัวข้อ 2"]'), null);
  await act(async () => { const input = document.getElementById("revised-comment-1"); input.value = "Corrected second QA comment"; Simulate.change(input); });
  await click(button("Save Review"));
  await click(button("ยืนยันบันทึก"));
  const corrected = buildAppealRequests(fixture.logs)[0];
  assert.equal(corrected.actionHistory.length, 2, "QA edit stays within the same Action");
  assert.equal(corrected.actionHistory[1].reviews.length, 2);
  assert.equal(corrected.actionHistory[1].reviews[0].topics[0].revisedComment, "Second QA comment");
  assert.equal(corrected.actionHistory[1].reviews[1].topics[0].revisedComment, "Corrected second QA comment");
  assert.equal(fixture.writes.at(-1).details.roundId, repeatedRound, "editing additional QA result retains its round identity");
  const legacyEdit = { ...fixture.writes.at(-1), details: { ...fixture.writes.at(-1).details, roundId: "" } };
  const legacyHistory = buildAppealRequests([...repeatedPending, secondResult, legacyEdit])[0].actionHistory;
  assert.equal(legacyHistory[1].reviews.length, 2, "legacy QA edit follows previousReviewId into the additional Action");
  const evidenceEdit = repeatedEvent("appeal_submission_resubmitted", -0.8, { roundId: repeatedRound, submittedAt: at(-0.8), submittedBy: "Alpha Agent", topics: [{ ...originalTopic, appealReason: "Edited new reason" }] });
  const submissionHistory = buildAppealRequests([...repeatedPending, evidenceEdit], now)[0].actionHistory;
  assert.equal(submissionHistory.length, 2);
  assert.equal(submissionHistory[1].submissions.length, 2);
  assert.equal(submissionHistory[1].submissions[0].topics[0].appealReason, "New appeal reason\nNew second line");
  assert.equal(submissionHistory[1].topics[0].appealReason, "Edited new reason");
  console.log("PASS repeated-topic Actions: old/new reasons and QA results, fresh summary, unchanged carried topic, cumulative score, QA edits, legacy edits and submission revisions");

  for (const [previousDecision, previousScore, expected] of [["Approved", 24, 24], ["Approved", 0, 0], ["Approved", "24", 24], ["Rejected", 30, 18]]) {
    fixture.logs = structuredClone(repeatedPending);
    fixture.logs[1].details.topics[0] = { ...fixture.logs[1].details.topics[0], decision: previousDecision, revisedScore: previousScore, rejectReason: "Previous rejected reason" };
    fixture.writes = [];
    await render(qa, { key: `latest-score-${previousDecision}-${typeof previousScore}-${previousScore}`, externalRequestId: repeatedId });
    const group = document.querySelector('[aria-label="ผลพิจารณาหัวข้อ 1"]');
    await click([...group.querySelectorAll("button")].find(node => node.textContent.includes("Approved")));
    assert.equal(group.parentElement.querySelector("select").value, String(expected), "prefill uses the latest effective score, including zero and numeric strings");
    for (const [id, value] of [["revised-comment-1", "Review keeps the latest score"], ["appeal-review-summary", "No score change in this round"]]) {
      await act(async () => { const input = document.getElementById(id); input.value = value; Simulate.change(input); });
    }
    await click(button("Save Review"));
    const total = 80 + expected - 18 + 16 - 14;
    assert.ok(document.querySelector('[role="dialog"]').textContent.includes(`คะแนนรวม ${total.toFixed(2)} → ${total.toFixed(2)} / 100`), "keeping the prefilled score neither loses nor double-counts prior score changes");
    assert.equal(fixture.writes.length, 0);
  }
  console.log("PASS additional Revised Score starts from the latest approved value (24, zero, numeric string), rejected stale values are ignored, and unchanged scores keep the same total");

  fixture.logs = structuredClone(repeatedPending);
  fixture.logs[1].details.topics[0].revisedScore = 24;
  fixture.writes = [];
  await render(qa, { key: "reject-additional-retains-score", externalRequestId: repeatedId });
  let topicCard = document.querySelector('[data-appeal-topic="1"]');
  let group = topicCard.querySelector('[aria-label="ผลพิจารณาหัวข้อ 1"]');
  assert.equal(topicCard.querySelectorAll('h3').length, 1, "one Topic title serves all rounds");
  assert.equal([...topicCard.querySelectorAll('div')].filter(node => node.textContent === "Original Comment").length, 1, "original comment is shown once per Topic");
  assert.deepEqual([...topicCard.querySelectorAll('[data-appeal-action]')].map(node => node.getAttribute('data-appeal-action')), ["1", "2"]);
  assert.ok(group.parentElement.textContent.includes("24 / 30"), "pending round starts at the latest score before any decision is clicked");
  await click([...group.querySelectorAll('button')].find(node => node.textContent.includes('Approved')));
  await select(group.parentElement.querySelector('select'), "26");
  await click([...group.querySelectorAll('button')].find(node => node.textContent.includes('Reject')));
  assert.ok(group.parentElement.textContent.includes("24 / 30"), "Reject ignores the unapproved 26 and preserves the prior approved 24");
  for (const [id, value] of [["reject-reason-1", "No further score change"], ["appeal-review-summary", "Keep the previously approved score"]]) {
    await act(async () => { const input = document.getElementById(id); input.value = value; Simulate.change(input); });
  }
  await click(button("Save Review"));
  assert.ok(document.querySelector('[role="dialog"]').textContent.includes("คะแนนรวม 88.00 → 88.00 / 100"));
  await click(button("ยืนยันบันทึก"));
  const retainedReview = fixture.writes.at(-1);
  const retainedTopic = retainedReview.details.topics.find(topic => topic.code === "1");
  assert.equal(retainedTopic.decision, "Rejected");
  assert.equal(retainedTopic.score, 24);
  assert.equal(retainedTopic.originalScore, 18);
  assert.equal(retainedTopic.retainedComment, "First QA comment");
  assert.ok(!Object.hasOwn(retainedTopic, "revisedScore"), "rejected score edits are not persisted");
  const retained = buildAppealRequests(fixture.logs)[0];
  assert.equal(retained.actionHistory[0].topics[0].revisedScore, 24, "prior approval remains unchanged");
  assert.equal(retained.actionHistory[1].topics[0].score, 24);
  assert.equal(retained.actionHistory[1].reviews[0].finalScore, 88);
  await click(button("รับทราบ"));
  await render(qa, { key: "retained-score-information" });
  await click([...document.querySelectorAll('tbody tr')].find(node => node.textContent.includes("AA994444")));
  const currentScoreLabel = [...document.querySelectorAll('div')].find(node => node.textContent === "Current Score");
  assert.equal(currentScoreLabel.nextElementSibling.textContent, "88.00", "case summary keeps the retained total after saved rejection");
  await render(qa, { key: "retained-score-edit", externalRequestId: repeatedId });
  await click(button("แก้ไขผลอุทธรณ์"));
  topicCard = document.querySelector('[data-appeal-topic="1"]');
  assert.deepEqual([...topicCard.querySelectorAll('[data-appeal-action]')].map(node => node.getAttribute('data-appeal-action')), ["1", "2"], "editing keeps each Action shown once");
  assert.ok(topicCard.textContent.includes("No further score change"), "saved QA result stays available while editing");
  group = topicCard.querySelector('[aria-label="ผลพิจารณาหัวข้อ 1"]');
  assert.equal(group.querySelectorAll('button').length, 2, "QA can still choose Approved or Reject when editing an Action");
  assert.ok(group.parentElement.textContent.includes("24 / 30"), "saved rejection reopens at the retained score");
  await click([...group.querySelectorAll('button')].find(node => node.textContent.includes('Approved')));
  assert.equal(group.parentElement.querySelector('select').value, "24");
  console.log("PASS one Topic card with consecutive Actions and one Original Comment; pending and rejected additional rounds retain 24, ignore unsaved 26, save total 88, and keep QA decision controls");

  // A later Action can appeal a different topic. Both rounds must remain
  // visible as consecutive case-level Actions, including for read-only roles.
  const differentId = "appeal-AA994445-test";
  const differentRound = "round-different-topic";
  const firstOnly = { ...originalTopic, comment: "&amp;lt;div&amp;gt;Original topic one&amp;lt;/div&amp;gt;" };
  const freshTopic = { ...otherTopic, label: "Answer Accuracy", wantsAppeal: false, appealReason: "ไม่อุทธรณ์หัวข้อนี้",
    comment: '<div>ตรวจสอบข้อมูล</div><div><br></div><div><span style="font-weight: bold;" onclick="bad()">จุดที่หักคือ</span><br>คำอธิบายเดิม<script>bad()</script></div>' };
  const newReason = "ขออนุญาตยื่นเพิ่มเติมค่ะ\nตรวจสอบหัวข้อใหม่";
  const differentEvent = (event_type, hours, details) => ({ event_type, created_at: at(hours), case_id: "AA994445", target_agent: "Alpha Agent", details: { requestId: differentId, ...details } });
  const differentPending = [
    differentEvent("appeal_request_submitted", -100, { topics: [firstOnly, freshTopic], finalScore: 80, auditDate: "2026-09-01", submittedBy: "Alpha Agent", submittedAt: at(-100) }),
    differentEvent("appeal_request_reviewed", -90, { topics: [{ ...firstOnly, decision: "Approved", revisedScore: 20, revisedComment: "First QA comment" }], reviewId: "review-different-first", reviewedBy: "First Reviewer", reviewedAt: at(-90), decision: "Approved", reviewSummary: "First review" }),
    differentEvent("appeal_additional_round_opened", -2, { roundId: differentRound, openedAt: at(-2), expiresAt: appealAdditionalDeadline(at(-2)), topics: [{ ...freshTopic, wantsAppeal: true, appealReason: "" }] }),
    differentEvent("appeal_additional_evidence_submitted", -1, { roundId: differentRound, submittedBy: "Alpha Agent", submittedAt: at(-1), topics: [{ ...freshTopic, wantsAppeal: true, appealReason: newReason }] }),
  ];
  const differentUnchanged = JSON.stringify(differentPending);
  for (const [role, canEdit] of [[qa, true], [{ username: "lead", agentName: "Team Lead", role: "Senior" }, false]]) {
    fixture.logs = structuredClone(differentPending);
    fixture.writes = [];
    await render(role, { key: `different-topic-${canEdit}`, externalRequestId: differentId, allowedAgentNames: ["Alpha Agent"] });
    const actions = document.querySelector('[aria-label="Appeal Actions"]');
    assert.deepEqual([...actions.querySelectorAll('[data-appeal-action]')].map(node => node.getAttribute('data-appeal-action')), ["1", "2"], "each case-level Action appears once in order, even for a new topic");
    const [first, second] = actions.querySelectorAll('[data-appeal-action]');
    assert.ok(first.textContent.includes("Original appeal reason") && first.textContent.includes("First QA comment"));
    assert.ok(!first.textContent.includes(newReason.split("\n")[0]), "new reason never overwrites or leaks into the previous Action");
    assert.ok(newReason.split("\n").every(line => second.textContent.includes(line)) && second.closest('[data-appeal-topic]').textContent.includes("Answer Accuracy"));
    assert.ok(!second.textContent.includes("Original appeal reason"), "new topic belongs only to its own Action");
    assert.ok(!actions.textContent.includes("<div>") && !actions.textContent.includes("&lt;div") && !actions.textContent.includes("<span"), "raw and multiply encoded HTML comments are rendered as readable content");
    assert.ok(first.closest('[data-appeal-topic]').textContent.includes("Original topic one"));
    assert.ok(second.closest('[data-appeal-topic]').textContent.includes("ตรวจสอบข้อมูล") && second.closest('[data-appeal-topic]').textContent.includes("คำอธิบายเดิม"));
    assert.ok(second.closest('[data-appeal-topic]').querySelector('span[style*="font-weight: bold"]'), "original emphasis is preserved");
    assert.equal(second.closest('[data-appeal-topic]').querySelector('script,[onclick]'), null, "HTML is sanitized after entity decoding");
    assert.equal(document.querySelector('[aria-label="ผลพิจารณาหัวข้อ 1"]'), null, "old topic is read-only");
    assert.equal(Boolean(document.querySelector('[aria-label="ผลพิจารณาหัวข้อ 2"]')), canEdit);
    assert.equal(fixture.writes.length, 0, "displaying Actions does not rewrite any stored event");
  }
  assert.equal(JSON.stringify(differentPending), differentUnchanged);
  console.log("PASS different-topic Actions remain consecutive for QA and Senior; raw/encoded original comments render safely without changing saved data");
  await act(async () => root.unmount());

  const storeOutput = resolve(temp, "store.mjs");
  await build({ jsx: "automatic", entryPoints: ["src/appealStore.ts"], outfile: storeOutput, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "transaction-boundary", setup(builder) {
    builder.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: "db", namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\/firebaseClient$/ }, () => ({ path: "client", namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\/appealCaseAvailability$/ }, () => ({ path: "available", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path === "client" ? "export const firebaseDb={}" : args.path === "available" ? "export async function checkAppealSourceCases(events){return events}" : `
      export const doc=(_db,name,id)=>name+'/'+id, collection=(_db,name)=>name, query=(...a)=>a, limit=a=>a, orderBy=(...a)=>a, where=(field,op,value)=>({field,op,value});
      export async function setDoc(path,data){globalThis.__workflowFixture.docs.set(path,structuredClone(data))}
      export async function getDocs(q){const condition=q.find(part=>part?.field==='details.accessId'||part?.field==='details.requestId');globalThis.__workflowFixture.lastDbQuery=q;return {docs:[...globalThis.__workflowFixture.docs.entries()].filter(([id,data])=>!condition||data.details?.[condition.field.split('.').at(-1)]===condition.value).map(([id,data])=>({id,data:()=>data}))}}
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
  const scoped = await store.fetchAppealEvents(["appeal_additional_access_decided", "appeal_additional_round_opened"], { requestId: "request-atomic", limit: 250, forceRefresh: true });
  assert.equal(scoped.length, 2, "request-scoped query returns only matching appeal events");
  assert.ok(fixture.lastDbQuery.some(part => part?.field === "details.requestId"), "request-scoped query is server-filtered");
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
