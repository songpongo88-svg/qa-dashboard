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
        const event={...payload,event_type,created_at:new Date().toISOString()};
        globalThis.__appealFixtureWrites.push(event);globalThis.__appealFixtureLogs.unshift(event);return true;
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
} finally {
  await act(async () => root.unmount());
  await rm(temp, { recursive: true, force: true });
  dom.window.close();
  for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
}
