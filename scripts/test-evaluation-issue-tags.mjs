import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

// Exercise the real Tag store and Evaluate handler. Firebase is stubbed at its
// read/transaction boundary; these tests cannot write to the production project.
const source = fs.readFileSync(new URL("../src/evaluationTagStore.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const cacheKey = "qa-dashboard:evaluation-issue-tags:v1";
const pendingPrefix = "qa-dashboard:evaluation-issue-tags:pending:v1:";
const input = (name = "Test", topicCode = "1") => ({ name, topicCode, rubricCode: "QA-2026-08", topicTitle: "Process", createdBy: "Test QA" });
const error = (code) => Object.assign(new Error(code === "resource-exhausted" ? "Quota exceeded." : code), { code });
const pendingKeys = () => [...storage.keys()].filter((key) => key.startsWith(pendingPrefix));
let storage, fixture, timers, events, clock, storageFull;
const originalNow = Date.now;
const originalWindow = globalThis.window;
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
Date.now = () => clock;

function reset(tags = []) {
  storage = new Map(); timers = new Map(); events = new Map(); clock = 2_000_000_000_000; storageFull = false;
  fixture = { tags: structuredClone(tags), reads: 0, transactions: 0, writes: 0, failure: null, commitFailure: null };
  Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true });
  globalThis.window = {
    localStorage: {
      get length() { return storage.size; }, key: (index) => [...storage.keys()][index] ?? null,
      getItem: (key) => storage.get(key) ?? null, removeItem: (key) => storage.delete(key),
      setItem(key, value) { if (storageFull) throw new DOMException("Quota exceeded", "QuotaExceededError"); storage.set(key, value); },
    },
    setTimeout(callback, delay) { const id = Symbol("timer"); timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    addEventListener(type, callback) { if (!events.has(type)) events.set(type, []); events.get(type).push(callback); },
  };
}

function loadStore() {
  const snapshot = () => ({ exists: () => fixture.tags.length > 0, data: () => ({ tags: structuredClone(fixture.tags) }) });
  const firestore = {
    doc: () => ({ path: "qa_system_settings/evaluation_issue_tags" }), serverTimestamp: () => "test-timestamp",
    async getDoc() { fixture.reads++; if (fixture.failure) throw fixture.failure; return snapshot(); },
    async runTransaction(db, callback) {
      fixture.transactions++;
      if (fixture.failure) throw fixture.failure;
      let write;
      const result = await callback({
        async get() { fixture.reads++; return snapshot(); },
        set(ref, value) { write = structuredClone(value); },
      });
      if (fixture.commitFailure) throw fixture.commitFailure;
      if (write) { fixture.tags = write.tags; fixture.writes++; }
      return result;
    },
  };
  const exports = {};
  Function("exports", "require", js)(exports, (path) => {
    if (path === "firebase/firestore") return firestore;
    if (path === "./firebaseClient") return { firebaseDb: {} };
    throw new Error(`Unexpected dependency: ${path}`);
  });
  return exports;
}

const uiSource = fs.readFileSync(new URL("../src/CreateEvaluationMockup.tsx", import.meta.url), "utf8");
const uiTree = ts.createSourceFile("Evaluate.tsx", uiSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let addHandler;
function findHandler(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "addIssueTag") addHandler = node;
  ts.forEachChild(node, findHandler);
}
findHandler(uiTree);
assert.ok(addHandler);
const handlerJs = ts.transpileModule(`${addHandler.getText()}\nexport { addIssueTag };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

async function exerciseEvaluate(store) {
  const state = {
    catalog: [], drafts: { "QA-2026-08:1": "Test" }, messages: {}, saving: {},
    topics: { "1": { score: 20, reason: "Existing assessment", deductions: [{ subtopic: "Process", points: 10 }], issueTags: [] } },
  };
  const setter = (key) => (next) => { state[key] = typeof next === "function" ? next(state[key]) : next; };
  const bindings = {
    activeRubric: { code: "QA-2026-08" }, currentUser: { username: "Test QA" },
    issueTagCatalog: state.catalog, issueTagDrafts: state.drafts, issueTagSaving: state.saving,
    setIssueTagCatalog: setter("catalog"), setIssueTagDrafts: setter("drafts"),
    setIssueTagMessages: setter("messages"), setIssueTagSaving: setter("saving"), setTopicState: setter("topics"),
    createEvaluationIssueTag: store.createEvaluationIssueTag,
    normalizeEvaluationIssueTagName: store.normalizeEvaluationIssueTagName,
  };
  const exports = {};
  Function("exports", ...Object.keys(bindings), handlerJs)(exports, ...Object.values(bindings));
  await exports.addIssueTag({ code: "1", title: "Process" });
  assert.deepEqual(state.topics["1"].issueTags, ["Test"], "the Tag is actually selected in the case despite quota exhaustion");
  assert.equal(state.topics["1"].score, 20, "Tag creation never changes the assessment score");
  assert.deepEqual(state.topics["1"].deductions, [{ subtopic: "Process", points: 10 }]);
  assert.equal(state.topics["1"].reason, "Existing assessment");
  assert.equal(state.saving["QA-2026-08:1"], false);
  assert.equal(state.drafts["QA-2026-08:1"], "");
  assert.match(state.messages["QA-2026-08:1"], /รอซิงก์/);
  assert.ok(!state.messages["QA-2026-08:1"].includes("Quota exceeded"));
  return state;
}

try {
  reset();
  let store = loadStore();
  await Promise.all([store.fetchEvaluationIssueTags(), store.fetchEvaluationIssueTags()]);
  await store.fetchEvaluationIssueTags();
  assert.equal(fixture.reads, 1, "mounts and concurrent catalog reads share one request");
  const results = await Promise.all([store.createEvaluationIssueTag(input("  Test  ")), store.createEvaluationIssueTag(input("TEST"))]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(fixture.transactions, 1, "concurrent duplicate additions are idempotent");
  assert.equal(fixture.tags.length, 1);
  assert.equal(pendingKeys().length, 0);
  await assert.rejects(store.createEvaluationIssueTag(input("test", "2")), /Topic 1/);
  console.log("PASS online Tag save, normalization, duplicate scope and read deduplication");

  reset(); store = loadStore(); fixture.failure = error("resource-exhausted");
  let latest;
  let unsubscribe = store.subscribeEvaluationIssueTags((snapshot) => { latest = snapshot; });
  await store.fetchEvaluationIssueTags();
  const state = await exerciseEvaluate(store);
  assert.equal(fixture.transactions, 0, "the failed catalog read prevents repeated quota-consuming transactions");
  assert.equal(pendingKeys().length, 1);
  assert.equal(latest.tags[0].syncStatus, "pending");
  assert.equal(timers.size, 1, "only one background retry is scheduled");
  const queuedId = state.catalog[0].id;
  const again = await store.createEvaluationIssueTag(input("test"));
  assert.equal(again.id, queuedId);
  assert.equal(pendingKeys().length, 1);
  await assert.rejects(store.createEvaluationIssueTag(input("Test", "2")), /Topic 1/);
  unsubscribe(); assert.equal(timers.size, 0);
  store = loadStore();
  unsubscribe = store.subscribeEvaluationIssueTags((snapshot) => { latest = snapshot; });
  const afterReload = await store.fetchEvaluationIssueTags();
  assert.equal(afterReload[0].id, queuedId, "pending Tag identity and creator survive a page reload");
  assert.equal(afterReload[0].createdBy, "Test QA");
  clock += 60_001; fixture.failure = null;
  await store.createEvaluationIssueTag(input("Another"));
  assert.equal(fixture.writes, 1, "recovery sends queued and new Tags in one transaction");
  assert.equal(pendingKeys().length, 0);
  assert.equal(fixture.tags.length, 2);
  assert.ok(fixture.tags.every((tag) => !tag.syncStatus && !tag.syncError), "local sync metadata is never published as catalog data");
  assert.ok(latest.tags.every((tag) => !tag.syncStatus));
  assert.equal(timers.size, 0, "a completed queue must not keep spending reads on a retry timer");
  unsubscribe();
  console.log("PASS quota failure, actual Evaluate selection, unchanged score, durable queue and recovery");

  reset(); store = loadStore(); fixture.failure = error("resource-exhausted");
  await store.createEvaluationIssueTag(input());
  clock += 60_001; fixture.failure = null; fixture.commitFailure = error("resource-exhausted");
  await store.fetchEvaluationIssueTags();
  assert.equal(pendingKeys().length, 1, "a failed commit must not clear the queue");
  assert.equal(fixture.tags.length, 0);
  clock += 120_001; fixture.commitFailure = null;
  await store.fetchEvaluationIssueTags();
  assert.equal(pendingKeys().length, 0);
  assert.equal(fixture.tags.length, 1);
  console.log("PASS commit failures retain queued Tags until a successful shared save");

  reset(); store = loadStore(); navigator.onLine = false;
  await store.createEvaluationIssueTag(input());
  assert.equal(fixture.transactions, 0);
  let recovered;
  unsubscribe = store.subscribeEvaluationIssueTags((snapshot) => { recovered = snapshot; });
  navigator.onLine = true;
  for (const callback of events.get("online")) callback();
  await store.fetchEvaluationIssueTags();
  assert.equal(pendingKeys().length, 0);
  assert.equal(recovered.tags[0].name, "Test");
  unsubscribe();
  console.log("PASS offline creation and automatic retry when connectivity returns");

  reset(); store = loadStore(); fixture.failure = error("resource-exhausted");
  await store.createEvaluationIssueTag(input());
  fixture.failure = null; clock += 60_001;
  fixture.tags = [{ ...input("TEST", "2"), id: "other-topic", normalizedName: "test", active: true, createdAt: "" }];
  let conflict;
  unsubscribe = store.subscribeEvaluationIssueTags((snapshot) => { conflict = snapshot; });
  await store.fetchEvaluationIssueTags();
  assert.equal(fixture.writes, 0, "a conflicting Tag must never overwrite the shared assignment");
  assert.equal(conflict.conflicts.length, 1);
  assert.match(conflict.conflicts[0].syncError, /Topic 2/);
  assert.equal(JSON.parse(storage.get(pendingKeys()[0])).syncStatus, "conflict");
  unsubscribe();
  console.log("PASS deferred duplicate conflicts preserve the shared Tag and show the affected Topic");

  reset(); store = loadStore(); fixture.failure = error("permission-denied");
  await assert.rejects(store.createEvaluationIssueTag(input()), /permission-denied/);
  assert.equal(pendingKeys().length, 0, "authorization errors cannot become a queued success");
  reset(); store = loadStore(); fixture.failure = error("resource-exhausted"); storageFull = true;
  await assert.rejects(store.createEvaluationIssueTag(input()), /ยังเก็บ Tag ที่รอซิงก์ไม่ได้/);
  assert.equal(pendingKeys().length, 0, "a non-durable queue must never be presented as saved");
  console.log("PASS permission and full browser storage errors stay explicit failures");

  const evaluationSource = fs.readFileSync(new URL("../src/evaluationStore.ts", import.meta.url), "utf8");
  const evaluationTree = ts.createSourceFile("store.ts", evaluationSource, ts.ScriptTarget.Latest, true);
  const parser = evaluationTree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "toTopics");
  const parserJs = ts.transpileModule(`${parser.getText()}\nexport { toTopics };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const parsed = {}; Function("exports", parserJs)(parsed);
  const restored = parsed.toTopics(JSON.parse(JSON.stringify([{ code: "1", max: 30, ...state.topics["1"] }])));
  assert.deepEqual(restored[0].issueTags, ["Test"], "the selected Tag survives the actual saved-case parser");
  assert.equal(restored[0].score, 20);
  console.log("PASS Tag and score survive saved-case serialization and reload");
} finally {
  Date.now = originalNow;
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else delete globalThis.navigator;
}
