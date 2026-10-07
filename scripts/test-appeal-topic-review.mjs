import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import React, { act, useState } from "react";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

function loadDeclarations(file, names, bindings = {}) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  for (const node of tree.statements) {
    if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, { node, text: node.getText().replace(/^export\s+/, "") });
    if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text, { node: declaration, text: `const ${declaration.getText()};` });
    }
  }
  const selected = new Map();
  function include(name) {
    if (selected.has(name) || Object.hasOwn(bindings, name)) return;
    const declaration = declarations.get(name);
    if (!declaration) return;
    selected.set(name, declaration.text);
    function visit(node) {
      if (ts.isIdentifier(node) && declarations.has(node.text)) include(node.text);
      ts.forEachChild(node, visit);
    }
    visit(declaration.node);
  }
  names.forEach(include);
  names.forEach((name) => assert.ok(selected.has(name), `real ${name} exists`));
  const compiled = ts.transpileModule([...selected.values()].join("\n") + `\nreturn {${names.join(",")}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None },
  }).outputText;
  return Function(...Object.keys(bindings), compiled)(...Object.values(bindings));
}

const helper = loadDeclarations("../src/appealReview.ts", ["getAppealTopicDecision", "summarizeAppealDecisions", "appealScoreAfterReview", "prepareAppealReview"]);
const requestFunctions = loadDeclarations("../src/AppealRequestsMockup.tsx", ["buildAppealRequests", "exportAppealRows"], {
  ...helper, XLSX: { utils: { json_to_sheet: rows => rows, book_new: () => ({}), book_append_sheet: (_book, sheet) => { globalThis.__exportedAppeals = sheet; } }, writeFile() {} },
});
const topics = [
  { code: "1", label: "Process", score: 29, max: 35, comment: "Original process", wantsAppeal: true, appealReason: "Check process", evidenceImages: [{ id: "image_1", url: "/api/google-drive-download?inline=1&id=image_1", name: "proof.jpg", size: 100, width: 10, height: 10 }] },
  { code: "2", label: "Answer", score: 16, max: 20, comment: "Original answer", wantsAppeal: true, appealReason: "Check answer" },
  { code: "3", label: "Follow-up", score: 20, max: 25, comment: "Original follow-up", wantsAppeal: true, appealReason: "Check follow-up" },
  { code: "4", label: "Communication", score: 17, max: 20, comment: "Original communication", wantsAppeal: false, appealReason: "ไม่อุทธรณ์หัวข้อนี้" },
];
const submission = { id: "submit-fixture", event_type: "appeal_request_submitted", case_id: "AA990070", target_agent: "Test Agent", created_at: "2026-10-07T02:00:00Z", details: {
  requestId: "fixture-1791338400000", topics, finalScore: 82, grade: "C", auditDate: "2026-10-06", submittedBy: "Test Agent", submittedByUsername: "test-agent",
} };
const pending = requestFunctions.buildAppealRequests([submission])[0];
assert.equal(pending.status, "Pending");
assert.equal(pending.topics.length, 3);
assert.ok(pending.topics.every(topic => topic.decision === undefined));
assert.throws(() => helper.prepareAppealReview(pending.topics, 82), /ครบทุกหัวข้อ/);
const choices = pending.topics.map((topic, index) => ({ ...topic, decision: index === 1 ? "Rejected" : "Approved", revisedScore: index === 1 ? 20 : topic.score + 2, revisedComment: `Revised ${topic.code}`, rejectReason: index === 1 ? "Keep answer assessment" : "" }));
const result = helper.prepareAppealReview(choices, 82);
assert.equal(result.decision, "Partially Approved");
assert.equal(result.finalScore, 86);
assert.ok(!Object.hasOwn(result.topics[1], "revisedScore"));
assert.ok(!Object.hasOwn(result.topics[1], "revisedComment"));
assert.throws(() => helper.prepareAppealReview(choices.map(topic => ({ ...topic, rejectReason: "" })), 82), /Reject Reason.*2/);
assert.throws(() => helper.prepareAppealReview(choices.map(topic => ({ ...topic, revisedComment: "" })), 82), /Revised Comment.*1/);
assert.throws(() => helper.prepareAppealReview([{ ...choices[0], revisedScore: 36 }], 82), /0 ถึง 35/);
console.log("PASS independent choices require each appealed topic's decision, valid score and own reason; rejected stale scores never affect totals");
const reviewEvent = { id: "review-fixture", event_type: "appeal_request_reviewed", case_id: submission.case_id, created_at: "2026-10-07T02:10:00Z", details: { requestId: submission.details.requestId, decision: result.decision, topics: result.topics, reviewedBy: "Test Reviewer", reviewSummary: "Reviewed each topic" } };
const logs = JSON.parse(JSON.stringify([reviewEvent, submission]));
const reviewed = requestFunctions.buildAppealRequests(logs)[0];
assert.equal(reviewed.status, "Partially Approved");
assert.deepEqual(reviewed.topics.map(topic => topic.decision), ["Approved", "Rejected", "Approved"]);
assert.deepEqual(reviewed.topics[0].evidenceImages, topics[0].evidenceImages);
for (const decision of ["Approved", "Rejected"]) {
  const legacy = requestFunctions.buildAppealRequests([{ ...reviewEvent, details: { ...reviewEvent.details, decision, topics: choices.map(({ decision: _decision, ...topic }) => topic) } }, submission])[0];
  assert.equal(legacy.status, decision);
  assert.ok(legacy.topics.every(topic => topic.decision === decision));
}
const reset = { event_type: "appeal_request_reset", created_at: "2026-10-07T02:20:00Z", details: { requestId: submission.details.requestId } };
assert.equal(requestFunctions.buildAppealRequests([reset, ...logs])[0].status, "Reset");
requestFunctions.exportAppealRows([reviewed]);
assert.equal(globalThis.__exportedAppeals[0]["Final Score"], 86);
assert.equal(globalThis.__exportedAppeals[0].Grade, "B");
assert.equal(globalThis.__exportedAppeals[0]["2 Decision"], "Rejected");
assert.equal(globalThis.__exportedAppeals[0]["2 Revised Score"], "");
console.log("PASS saved mixed decisions, evidence, old all-approved/all-rejected reviews, Reset and per-topic row export remain consistent");

const policy = loadDeclarations("../src/lib/scoreIncentivePolicy.ts", ["scoreToGrade"]);
const richText = loadDeclarations("../src/richText.tsx", ["RichTextContent", "richTextToPlainText"], { React });
const dashboard = loadDeclarations("../src/DashboardMockup.tsx", ["buildApprovedAppealMergeMap", "buildAppealOutcomeMap", "applyAppealMapsToCaseItems", "CaseDetailTopicTable"], {
  ...helper, ...requestFunctions, ...policy, React, useState,
  ...richText,
  canonicalizeAgentName: value => String(value || ""),
});
const monthMap = new Map([[submission.case_id, "2026-10"]]);
const mergeMap = dashboard.buildApprovedAppealMergeMap(logs, monthMap);
const outcomeMap = dashboard.buildAppealOutcomeMap(logs, monthMap);
assert.equal(mergeMap.get(submission.case_id).finalScore, 86);
assert.deepEqual(mergeMap.get(submission.case_id).revisedTopics.map(topic => topic.code), ["1", "3"]);
assert.equal(outcomeMap.get(submission.case_id).reviewedTopics[1].decision, "Rejected");
assert.equal(outcomeMap.get(submission.case_id).reviewedTopics[1].comment, "Keep answer assessment");
const baseCase = { caseId: submission.case_id, agent: "Test Agent", monthKey: "2026-10", finalScore: 82, grade: "C", topics: topics.map(topic => ({ ...topic, pct: topic.score / topic.max * 100, issueTags: ["เกิน SLA"] })) };
const merged = dashboard.applyAppealMapsToCaseItems([baseCase], mergeMap, outcomeMap)[0];
assert.equal(merged.finalScore, 86);
assert.equal(merged.grade, "B");
assert.equal(merged.appealStatus, "Partially Approved");
assert.deepEqual(baseCase.topics.map(topic => topic.score), [29, 16, 20, 17]);
console.log("PASS real Dashboard event merge updates only approved topics and crosses KPI 85 using the existing grade policy");

const dom = new JSDOM("<div id='root'></div>", { url: "https://qa.test" });
const keys = ["window", "document", "HTMLElement", "Event", "MouseEvent", "HTMLTextAreaElement", "HTMLSelectElement", "CustomEvent"];
const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
keys.forEach(key => { globalThis[key] = dom.window[key]; });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.alert = message => { globalThis.__appealAlert = message; };
window.confirm = () => true;
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.getElementById("root"));
const temp = await mkdtemp(resolve(fileURLToPath(new URL("../", import.meta.url)), ".appeal-review-test-"));
try {
  await act(async () => root.render(React.createElement(dashboard.CaseDetailTopicTable, merged)));
  assert.ok(document.body.textContent.includes("Keep answer assessment"));
  assert.ok(document.body.textContent.includes("Reject Reason"));
  assert.ok(document.body.textContent.includes("Revised 1"));
  assert.ok(document.body.textContent.includes("Revised 3"));
  console.log("PASS Case Detail renders each topic's decision and correct approval/rejection comment");

  globalThis.__appealFixtureLogs = [submission];
  globalThis.__appealFixtureWrites = [];
  const output = resolve(temp, "review.mjs");
  await build({ entryPoints: ["src/AppealRequestsMockup.tsx"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "fixture-storage-boundary", setup(builder) {
    builder.onResolve({ filter: /^\.\/appealStore$/ }, () => ({ path: "store", namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\/PageHero$/ }, () => ({ path: "hero", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path === "hero" ? "export default function Hero(){return null}" : `
      export async function fetchAppealEvents(){return globalThis.__appealFixtureLogs}
      export async function writeAppealEvent(user,event_type,payload){
        if(globalThis.__appealFixtureFailure === 'before'){globalThis.__appealFixtureFailure='';throw new Error('offline')}
        const event={...payload,event_type,created_at:new Date().toISOString()};
        globalThis.__appealFixtureWrites.push(event);globalThis.__appealFixtureLogs.unshift(event);
        if(globalThis.__appealFixtureFailure === 'after'){globalThis.__appealFixtureFailure='';throw new Error('acknowledgement lost')}
        return true;
      }` }));
  } }] });
  const { default: ReviewComponent } = await import(pathToFileURL(output).href);
  await act(async () => root.render(React.createElement(ReviewComponent, { currentUser: { username: "fixture-qa", displayName: "Test Reviewer" }, externalRequestId: submission.details.requestId })));
  const click = async element => { assert.ok(element, "UI element exists"); await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true }))); };
  if (!document.querySelector('[role="group"]')) await click([...document.querySelectorAll("button")].find(button => button.textContent.includes(submission.case_id)));
  const groups = () => [...document.querySelectorAll('[role="group"]')].filter(node => node.getAttribute("aria-label").startsWith("ผลพิจารณาหัวข้อ"));
  assert.equal(groups().length, 3);
  const setText = async (id, value) => { const element = document.getElementById(id); assert.ok(element, id); await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true }));
  }); };
  await click(groups()[0].querySelectorAll("button")[0]);
  await click(groups()[1].querySelectorAll("button")[1]);
  await click(groups()[2].querySelectorAll("button")[0]);
  const setScore = async (group, value) => {
    const select = group.parentElement.querySelector("select");
    assert.ok(select);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, String(value));
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  await setScore(groups()[0], 31);
  await setScore(groups()[2], 22);
  await setText("revised-comment-1", "New process explanation");
  await setText("reject-reason-2", "Original answer is correct");
  await setText("revised-comment-3", "New follow-up explanation");
  await setText("appeal-review-summary", "Mixed review summary");
  await click([...document.querySelectorAll("button")].find(button => button.textContent === "Save Review"));
  assert.equal(globalThis.__appealFixtureWrites.length, 0, "confirmation opens before any write");
  assert.ok(document.querySelector("dialog").textContent.includes("82.00 → 86.00"));
  assert.ok(document.querySelector("dialog").textContent.includes("Grade B"));
  await click([...document.querySelectorAll("dialog button")].find(button => button.textContent === "ยืนยันบันทึก"));
  assert.equal(globalThis.__appealFixtureWrites.length, 1, globalThis.__appealAlert);
  const saved = globalThis.__appealFixtureWrites[0];
  assert.equal(saved.details.decision, "Partially Approved");
  assert.deepEqual(saved.details.topics.map(topic => topic.decision), ["Approved", "Rejected", "Approved"]);
  assert.equal(saved.details.topics[0].revisedScore, 31);
  assert.equal(saved.details.topics[2].revisedScore, 22);
  assert.equal(helper.appealScoreAfterReview(saved.details.topics, 82), 86);
  assert.ok(!Object.hasOwn(saved.details.topics[1], "revisedScore"));
  assert.equal(saved.details.reviewedBy, "Test Reviewer");
  assert.equal(requestFunctions.buildAppealRequests(globalThis.__appealFixtureLogs)[0].status, "Partially Approved");
  console.log("PASS real Appeal Review UI independently selects three decisions and saves one complete mixed review with reviewer identity");
  const button = text => [...document.querySelectorAll("button")].find(node => node.textContent === text);
  assert.ok(document.querySelector("dialog").textContent.includes("บันทึกผลอุทธรณ์เรียบร้อย"));
  await click(button("รับทราบ"));
  assert.ok(groups().every(group => [...group.querySelectorAll("button")].every(node => node.disabled)));
  await click(button("แก้ไขผลอุทธรณ์"));
  await setText("appeal-review-summary", "Unsaved cancellation");
  await click(button("ยกเลิกการแก้ไข"));
  assert.equal(document.getElementById("appeal-review-summary").value, "Mixed review summary");
  assert.equal(globalThis.__appealFixtureWrites.length, 1);
  await click(button("แก้ไขผลอุทธรณ์"));
  await click(groups()[0].querySelectorAll("button")[1]);
  await click(groups()[1].querySelectorAll("button")[0]);
  await click(groups()[2].querySelectorAll("button")[1]);
  await setScore(groups()[1], 19);
  await setText("reject-reason-1", "Keep original process score");
  await setText("revised-comment-2", "Reconsidered answer score");
  await setText("reject-reason-3", "Keep original follow-up score");
  await setText("appeal-review-summary", "Corrected mixed review");
  await click(button("Save Review"));
  assert.ok(document.querySelector("dialog").textContent.includes("86.00 → 85.00"));
  await click(button("กลับไปแก้ไข"));
  assert.equal(document.querySelector("dialog"), null);
  assert.equal(document.getElementById("appeal-review-summary").value, "Corrected mixed review");
  await click(button("Save Review"));
  globalThis.__appealFixtureFailure = "before";
  await click(button("ยืนยันบันทึก"));
  assert.ok(document.querySelector('[role="alertdialog"]').textContent.includes("ผลที่กรอกยังอยู่"));
  assert.equal(globalThis.__appealFixtureWrites.length, 1);
  await click(button("กลับไปตรวจสอบ"));
  await act(async () => {
    const confirm = button("ยืนยันบันทึก");
    confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.equal(globalThis.__appealFixtureWrites.length, 2, "double click creates one revision");
  const edited = globalThis.__appealFixtureWrites[1];
  assert.equal(edited.details.requestId, submission.details.requestId);
  assert.equal(edited.details.previousReviewId, saved.details.reviewId);
  assert.equal(edited.details.reviewAction, "edited");
  assert.equal(edited.details.reviewVersion, 2);
  assert.notEqual(edited.details.reviewId, saved.details.reviewId);
  assert.deepEqual(edited.details.topics.map(topic => topic.decision), ["Rejected", "Approved", "Rejected"]);
  assert.equal(helper.appealScoreAfterReview(edited.details.topics, 82), 85);
  const current = requestFunctions.buildAppealRequests([saved, submission, edited])[0];
  assert.equal(current.reviewSummary, "Corrected mixed review");
  assert.equal(current.reviewHistory.length, 2);
  assert.equal(current.reviewHistory[1].reviewSummary, "Mixed review summary");
  requestFunctions.exportAppealRows([current]);
  assert.equal(globalThis.__exportedAppeals[0]["Final Score"], 85);
  assert.equal(globalThis.__exportedAppeals[0]["1 Revised Score"], "");
  const revisedMap = dashboard.buildApprovedAppealMergeMap([saved, submission, edited], monthMap);
  const revisedOutcome = dashboard.buildAppealOutcomeMap([saved, submission, edited], monthMap);
  const updated = dashboard.applyAppealMapsToCaseItems([baseCase], revisedMap, revisedOutcome)[0];
  assert.equal(updated.finalScore, 85, "recalculate against original 82, not previous 86");
  assert.equal(updated.grade, "B");
  assert.deepEqual(updated.topics.map(topic => topic.score), [29, 16, 20, 17], "original topic scores remain intact");
  assert.deepEqual(revisedMap.get(submission.case_id).revisedTopics.map(topic => [topic.code, topic.score]), [["2", 19]]);
  await click(button("รับทราบ"));
  assert.ok(document.body.textContent.includes("ประวัติการพิจารณา (2 ครั้ง)"));
  console.log("PASS edit prefill, cancel, before/after preview, offline retry, double-click protection, preserved history and latest Dashboard/export score 86 → 85");

  await click(button("แก้ไขผลอุทธรณ์"));
  await click(groups()[1].querySelectorAll("button")[1]);
  await setText("reject-reason-2", "Keep all original scores");
  await setText("appeal-review-summary", "All topics rejected after correction");
  await click(button("Save Review"));
  assert.ok(document.querySelector("dialog").textContent.includes("85.00 → 82.00"));
  assert.ok(document.querySelector("dialog").textContent.includes("ไม่ผ่าน KPI"));
  globalThis.__appealFixtureFailure = "after";
  await click(button("ยืนยันบันทึก"));
  assert.equal(globalThis.__appealFixtureWrites.length, 3);
  await click(button("กลับไปตรวจสอบ"));
  await click(button("ยืนยันบันทึก"));
  assert.equal(globalThis.__appealFixtureWrites.length, 3, "acknowledgement retry detects already saved revision");
  assert.ok(document.querySelector("dialog").textContent.includes("แก้ไขผลอุทธรณ์เรียบร้อย"));
  const rejected = requestFunctions.buildAppealRequests(globalThis.__appealFixtureLogs)[0];
  assert.equal(rejected.status, "Rejected");
  assert.equal(rejected.reviewHistory.length, 3);
  assert.equal(dashboard.applyAppealMapsToCaseItems([baseCase], dashboard.buildApprovedAppealMergeMap(globalThis.__appealFixtureLogs, monthMap), dashboard.buildAppealOutcomeMap(globalThis.__appealFixtureLogs, monthMap))[0].finalScore, 82);
  await click(button("รับทราบ"));
  await click(button("แก้ไขผลอุทธรณ์"));
  await setText("appeal-review-summary", "");
  await click(button("Save Review"));
  assert.ok(document.querySelector('[role="alertdialog"]').textContent.includes("กรุณากรอก Review Summary"));
  await click(button("กลับไปตรวจสอบ"));
  await setText("appeal-review-summary", "Ready for another correction");
  await click(button("Save Review"));
  const external = { ...globalThis.__appealFixtureWrites[2], id: "external-review", created_at: new Date(Date.now()+1000).toISOString(), details: {
    ...globalThis.__appealFixtureWrites[2].details, reviewId: "external-review", reviewVersion: 4, reviewSummary: "Changed in another tab",
  } };
  globalThis.__appealFixtureLogs.unshift(external);
  await click(button("ยืนยันบันทึก"));
  assert.ok(document.querySelector('[role="alertdialog"]').textContent.includes("คำขอนี้มีการเปลี่ยนแปลง"));
  assert.equal(globalThis.__appealFixtureWrites.length, 3);
  await click(button("กลับไปตรวจสอบ"));
  await click(button("แก้ไขผลอุทธรณ์"));
  await click(button("Save Review"));
  globalThis.__appealFixtureLogs.unshift({ ...reset, created_at: new Date(Date.now()+2000).toISOString() });
  await click(button("ยืนยันบันทึก"));
  assert.equal(globalThis.__appealFixtureWrites.length, 3, "Reset cannot be revived by saving a stale edit");
  assert.ok(document.querySelector('[role="alertdialog"]').textContent.includes("Reset"));
  console.log("PASS rejecting a previously approved topic restores original scores; saved-but-unacknowledged retry is idempotent; validation, newer reviews and Reset block stale saves");

  globalThis.__appealStoredDocs = new Map([["qa_appeal_events/legacy-submission", submission], ["qa_appeal_events/legacy-review", reviewEvent]]);
  const storeOutput = resolve(temp, "store.mjs");
  await build({ entryPoints: ["src/appealStore.ts"], outfile: storeOutput, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", plugins: [{ name: "fixture-firestore-boundary", setup(builder) {
    builder.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: "firestore", namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\/firebaseClient$/ }, () => ({ path: "client", namespace: "fixture" }));
    builder.onResolve({ filter: /^\.\/lib\/agentIdentity$/ }, () => ({ path: "identity", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path === "client" ? "export const firebaseDb={}" : args.path === "identity" ? "export const canonicalizeAgentName=value=>String(value||'')" : `
      export const collection=(_db,name)=>name;
      export const doc=(_db,name,id)=>name+'/'+id;
      export const query=(...values)=>values;
      export const limit=value=>value;
      export const orderBy=(...values)=>values;
      export async function setDoc(path,data){globalThis.__appealStoredDocs.set(path,structuredClone(data))}
      export async function getDocs(){return {docs:[...globalThis.__appealStoredDocs.entries()].sort((a,b)=>b[1].created_at.localeCompare(a[1].created_at)).map(([path,data])=>({id:path.split('/').pop(),data:()=>structuredClone(data)}))}}
    ` }));
  } }] });
  const store = await import(pathToFileURL(storeOutput).href);
  const user = { username: "fixture-qa", displayName: "Test Reviewer" };
  await store.writeAppealEvent(user, "appeal_request_reviewed", edited);
  assert.equal(globalThis.__appealStoredDocs.size, 3, "new review retains legacy review document");
  await store.writeAppealEvent(user, "appeal_request_reviewed", edited);
  assert.equal(globalThis.__appealStoredDocs.size, 3, "same review ID updates only its own retry document");
  assert.deepEqual(globalThis.__appealStoredDocs.get("qa_appeal_events/legacy-review"), reviewEvent);
  const persisted = requestFunctions.buildAppealRequests(await store.fetchAppealEvents(undefined, {forceRefresh:true,limit:2000}))[0];
  assert.equal(persisted.reviewHistory.length, 2);
  assert.equal(persisted.reviewId, edited.details.reviewId);
  assert.equal(persisted.reviewSummary, "Corrected mixed review");
  assert.equal(helper.appealScoreAfterReview(persisted.topics, 82), 85);
  console.log("PASS real appealStore writes append review revisions, keeps legacy records, reuses retry IDs and reads the latest persisted result");
} finally {
  await act(async () => root.unmount());
  await rm(temp, { recursive: true, force: true });
  dom.window.close();
  for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  delete globalThis.__appealStoredDocs;
  delete globalThis.__appealFixtureFailure;
}
