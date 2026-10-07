import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

// Load the real case mapper, merge and topic view without starting Firebase or
// the whole Dashboard. Follow their local helper declarations from the source.
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

function assertTagsAtEndOfOriginalComment(container, comment, tags) {
  const heading = [...container.querySelectorAll("div")].find((node) => node.textContent === "Original Comment");
  assert.ok(heading, "the Original Comment heading exists");
  const card = heading.parentElement;
  const tagRow = card.lastElementChild;
  assert.ok(tagRow.textContent.startsWith("Tag ที่พบปัญหา :"), "the Tag row is at the end of the same Original Comment card");
  assert.ok(tagRow.previousElementSibling.textContent.includes(comment), "saved comment and deduction text remain before the Tag row");
  assert.deepEqual([...tagRow.children].slice(1).map((node) => node.textContent), tags, "selected Tag names follow the label in the same row");
  assert.ok(!container.textContent.includes("Tag ประเด็นที่พบ"), "the separate Tag heading has been removed");
}

const dom = new JSDOM("<div id='root'></div>", { url: "https://qa.test" });
const globals = ["window", "document", "HTMLElement", "Event", "MouseEvent"];
const originals = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
globals.forEach((key) => { globalThis[key] = dom.window[key]; });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = createRoot(document.getElementById("root"));
try {
  const identity = loadDeclarations("../src/lib/agentIdentity.ts", ["canonicalizeAgentName", "canonicalAgentIdentityKey"]);
  const timestamps = loadDeclarations("../src/evaluationStore.ts", ["getOriginalEvaluationTimestamp", "getEvaluationLastUpdatedAt"]);
  const scope = loadDeclarations("../src/lib/evaluationScope.ts", ["isTestCaseEvaluation"]);
  const appealReview = loadDeclarations("../src/appealReview.ts", ["getAppealTopicDecision"]);
  const policy = loadDeclarations("../src/lib/scoreIncentivePolicy.ts", ["scoreToGrade"]);
  const richText = loadDeclarations("../src/richText.tsx", ["RichTextContent", "richTextToPlainText"], { React });
  const { mapStoredEvaluationsToCaseItems, mergeRawAndStoredEvaluationCases, normalizeCaseIssueTags, CaseDetailTopicTable } = loadDeclarations(
    "../src/DashboardMockup.tsx",
    ["mapStoredEvaluationsToCaseItems", "mergeRawAndStoredEvaluationCases", "normalizeCaseIssueTags", "CaseDetailTopicTable"],
    { React, useState, ...identity, ...timestamps, ...scope, ...policy, ...richText, ...appealReview },
  );
  const firstTag = "ความถูกต้องของสถานะ ยอดเงิน และระยะเวลา";
  const secondTag = "ข้อมูลไม่ครบ";
  const record = JSON.parse(JSON.stringify({
    id: "tag-case", caseId: "AA900021", agentName: "Agent A", auditDate: "2026-10-06", finalScore: 86,
    submittedAt: "2026-10-06T06:00:00Z", evidenceUrls: [], qaScheme: "QA-2026-08",
    topics: [{ code: "2", title: "Answer Quality", max: 20, score: 6, comment: "เหตุผลเดิม\nจุดที่หักคือ: ข้อมูลไม่ครบ\nหัก 14 คะแนน", issueTags: [firstTag, secondTag], deductions: [] }],
  }));
  const stored = mapStoredEvaluationsToCaseItems([record])[0];
  assert.deepEqual(stored.topics.find((topic) => topic.code === "2").issueTags, [firstTag, secondTag]);
  assert.equal(stored.finalScore, 86);
  assert.equal(stored.topics.find((topic) => topic.code === "2").score, 6);
  console.log("PASS serialized saved case Tags reach the real Dashboard mapper with unchanged scores");

  const raw = structuredClone(stored);
  raw.rawDataFileName = "QA_RawData_October2026.xlsx";
  raw.topics.forEach((topic) => { delete topic.issueTags; });
  const merged = mergeRawAndStoredEvaluationCases([raw], [stored])[0];
  assert.deepEqual(merged.topics.find((topic) => topic.code === "2").issueTags, [firstTag, secondTag]);
  const mismatch = structuredClone(stored);
  mismatch.topics.find((topic) => topic.code === "2").score = 7;
  assert.equal(mergeRawAndStoredEvaluationCases([raw], [mismatch])[0].topics.find((topic) => topic.code === "2").issueTags, undefined);
  console.log("PASS workbook merge retains saved Tags only for a matching topic assessment");

  await act(async () => root.render(React.createElement(CaseDetailTopicTable, { topics: merged.topics })));
  const details = [...document.querySelectorAll("details")].find((node) => node.querySelector("summary").textContent.includes("Answer Quality"));
  await act(async () => details.querySelector("summary").dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.ok(details.open);
  assert.ok(details.textContent.includes(firstTag));
  assert.ok(details.textContent.includes(secondTag));
  assert.ok(details.textContent.includes("6 / 20"));
  assert.ok(!details.textContent.includes("รอซิงก์"));
  assert.ok(!details.textContent.includes("สถานะหัวข้อย่อย"));
  assert.ok(!details.textContent.includes("ไม่มีข้อมูลจุดที่หัก"));
  assert.equal(document.querySelectorAll("[class*='border-amber-300']").length, 2);
  assertTagsAtEndOfOriginalComment(details, "หัก 14 คะแนน", [firstTag, secondTag]);
  console.log("PASS opening the real Case Detail topic shows inline Tags after deduction text inside Original Comment");

  const revisedTopic = { ...merged.topics.find((topic) => topic.code === "2"), score: 10, comment: "เหตุผลหลังอุทธรณ์" };
  delete revisedTopic.issueTags;
  await act(async () => root.render(React.createElement(CaseDetailTopicTable, { topics: merged.topics, reviewStatus: "Revised", revisedTopics: [revisedTopic], displayRevisedTopicCodes: ["2"] })));
  assert.ok(document.body.textContent.includes(firstTag), "an appeal with no replacement Tags retains the saved case selections");
  assertTagsAtEndOfOriginalComment(details, revisedTopic.comment, [firstTag, secondTag]);
  for (const appealStatus of ["Approved", "Rejected"]) {
    await act(async () => root.render(React.createElement(CaseDetailTopicTable, {
      topics: merged.topics, reviewStatus: "Revised", revisedTopics: [revisedTopic], displayRevisedTopicCodes: ["2"], appealStatus,
      appealReviewedTopics: [{ code: "2", appealReason: "ขอตรวจข้อมูล", comment: revisedTopic.comment }],
    })));
    assertTagsAtEndOfOriginalComment(details, "หัก 14 คะแนน", [firstTag, secondTag]);
    assert.ok(document.body.textContent.includes("Appeal Reason"), "the appeal explanation remains available");
  }
  console.log("PASS approved and rejected appeals keep saved Tags inside their Original Comment card");
  const empty = structuredClone(merged.topics);
  empty.forEach((topic) => { delete topic.issueTags; });
  await act(async () => root.render(React.createElement(CaseDetailTopicTable, { topics: empty })));
  assert.ok(!document.body.textContent.includes("Tag ที่พบปัญหา :"), "historical cases without selected Tags show no invented or empty Tag row");
  assert.equal(document.querySelectorAll("[class*='border-amber-300']").length, 0);
  assert.deepEqual(normalizeCaseIssueTags("เกิน SLA | ข้อมูลไม่ครบ | เกิน SLA"), ["เกิน SLA", "ข้อมูลไม่ครบ"]);
  console.log("PASS appeal fallback, empty historical cases and explicitly exported Tag names remain accurate");
} finally {
  await act(async () => root.unmount());
  dom.window.close();
  for (const key of globals) {
    if (originals.get(key)) Object.defineProperty(globalThis, key, originals.get(key));
    else delete globalThis[key];
  }
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
}
