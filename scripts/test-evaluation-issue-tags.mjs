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
const tick = () => new Promise((resolve) => setImmediate(resolve));
function gate() {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
}
function expireCreationWait() {
  const entry = [...timers.entries()].find(([, timer]) => timer.delay <= 2_000);
  assert.ok(entry, "Tag creation must stop waiting when Firebase never responds");
  const [id, timer] = entry;
  timers.delete(id); clock += timer.delay; timer.callback();
}
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
    async getDoc() {
      fixture.reads++;
      if (fixture.readGate) await fixture.readGate.promise;
      if (fixture.failure) throw fixture.failure;
      return snapshot();
    },
    async runTransaction(db, callback) {
      fixture.transactions++;
      if (fixture.transactionGate) await fixture.transactionGate.promise;
      if (fixture.failure) throw fixture.failure;
      let write;
      const result = await callback({
        async get() { fixture.reads++; return snapshot(); },
        set(ref, value) { write = structuredClone(value); },
      });
      const commitGate = fixture.commitGate;
      if (commitGate) {
        await commitGate.promise;
        if (commitGate.failure) throw commitGate.failure;
      }
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
const managementHandlers = [];
function findHandler(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "addIssueTag") addHandler = node;
  if (ts.isFunctionDeclaration(node) && ["toggleIssueTag", "changeIssueTagAvailability", "resetEvaluationForm"].includes(node.name?.text)) managementHandlers.push(node);
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
  assert.equal(state.messages["QA-2026-08:1"], "เพิ่ม Tag “Test” แล้ว", "local completion is acknowledged without a sync badge");
  assert.ok(!state.messages["QA-2026-08:1"].includes("Quota exceeded"));
  return state;
}

function managementUi(store, catalog) {
  const state = {
    catalog, topics: { "1": { score: 20, reason: "Existing assessment", issueTags: [], deductions: [{ subtopic: "Process", points: 10 }] } },
    messages: {}, changing: {}, drafts: { "QA-2026-08:1": "Old input" }, managing: { "QA-2026-08:1": true },
  };
  const setter = (key) => (next) => { state[key] = typeof next === "function" ? next(state[key]) : next; };
  const bindings = {
    activeRubric: { code: "QA-2026-08" }, issueTagChanging: state.changing,
    setTopicState: setter("topics"), setIssueTagCatalog: setter("catalog"), setIssueTagMessages: setter("messages"),
    setIssueTagChanging: setter("changing"), setIssueTagDrafts: setter("drafts"), setIssueTagManaging: setter("managing"),
    setEvaluationIssueTagActive: store.setEvaluationIssueTagActive,
    normalizeEvaluationIssueTagName: store.normalizeEvaluationIssueTagName,
    clearEvaluateTabMemory() {}, todayInputValue: () => "2026-10-06", topics: [{ code: "1" }],
    buildInitialTopicState: () => ({ "1": { score: null, reason: "", issueTags: [], deductions: [] } }),
    setCallLogs: (fn) => fn([]), setEvidenceFiles: (fn) => fn([]),
  };
  const ignoredSetters = ["AgentName", "AuditDate", "WaitingTime", "ServiceTime", "CaseId", "CaseUrl", "Inquiry", "CaseDescription", "ProcessReference", "EvidenceUrl", "NoCaseForMonth", "IsTestCase", "CriticalError", "EvaluationStartedAt", "EvaluationSubmittedAt", "EvaluationStatus", "DraftSavedAt", "ActiveDraftId", "ActiveSubmittedRecordId"];
  ignoredSetters.forEach((name) => { bindings["set" + name] = () => {}; });
  const handlerSource = managementHandlers.map((node) => node.getText()).join("\n") + "\nexport { toggleIssueTag, changeIssueTagAvailability, resetEvaluationForm };";
  const handlerCode = ts.transpileModule(handlerSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const handlers = {};
  Function("exports", ...Object.keys(bindings), handlerCode)(handlers, ...Object.values(bindings));
  return { state, ...handlers };
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

  const reusable = fixture.tags[0];
  const reuseUi = managementUi(store, await store.fetchEvaluationIssueTags());
  const beforeReuseWrites = fixture.writes;
  reuseUi.toggleIssueTag("1", reusable.name);
  assert.deepEqual(reuseUi.state.topics["1"].issueTags, ["Test"]);
  reuseUi.toggleIssueTag("1", reusable.name);
  assert.deepEqual(reuseUi.state.topics["1"].issueTags, []);
  assert.equal(reuseUi.state.catalog[0].active, true, "deselecting a Tag never removes it from the shared catalog");
  reuseUi.resetEvaluationForm();
  assert.equal(reuseUi.state.catalog[0].id, reusable.id, "the actual new-case reset retains reusable Tags");
  assert.deepEqual(reuseUi.state.drafts, {});
  assert.deepEqual(reuseUi.state.messages, {});
  assert.deepEqual(reuseUi.state.managing, {});
  reuseUi.toggleIssueTag("1", reusable.name);
  assert.deepEqual(reuseUi.state.topics["1"].issueTags, ["Test"]);
  assert.equal(fixture.writes, beforeReuseWrites, "using a Tag in the next case needs no catalog write");
  console.log("PASS real case deselection, form reset and reuse retain the catalog without extra writes");

  const deleteUi = managementUi(store, await store.fetchEvaluationIssueTags());
  deleteUi.toggleIssueTag("1", reusable.name);
  const previousCase = structuredClone(deleteUi.state.topics);
  await deleteUi.changeIssueTagAvailability({ code: "1" }, reusable, false);
  assert.deepEqual(deleteUi.state.topics["1"].issueTags, []);
  assert.equal(deleteUi.state.topics["1"].score, 20);
  assert.equal(deleteUi.state.topics["1"].reason, "Existing assessment");
  assert.deepEqual(deleteUi.state.topics["1"].deductions, [{ subtopic: "Process", points: 10 }]);
  assert.deepEqual(previousCase["1"].issueTags, ["Test"], "previous case snapshots remain untouched");
  assert.equal(fixture.tags[0].active, false);
  assert.equal(deleteUi.state.changing[reusable.id], false);
  await assert.rejects(store.createEvaluationIssueTag(input()), /ถูกลบจากคลัง/);
  const restoredTag = await store.setEvaluationIssueTagActive(deleteUi.state.catalog[0], true);
  assert.equal(restoredTag.id, reusable.id);
  assert.equal(fixture.tags[0].active, true);
  assert.equal(fixture.tags.length, 1);
  assert.ok(fixture.tags.every((tag) => !tag.syncAction && !tag.syncRevision && !tag.syncStatus));
  console.log("PASS actual catalog removal clears only the current case selection, preserves scores/history and restores the same ID");

  reset(); store = loadStore(); navigator.onLine = false;
  const offlineTag = await store.createEvaluationIssueTag(input());
  const removedOffline = await store.setEvaluationIssueTagActive(offlineTag, false);
  assert.equal(removedOffline.active, false);
  assert.equal((await store.fetchEvaluationIssueTags()).filter((tag) => tag.active).length, 0);
  assert.equal(fixture.transactions, 0);
  store = loadStore();
  assert.equal((await store.fetchEvaluationIssueTags())[0].active, false, "removal survives a reload before syncing");
  navigator.onLine = true;
  await store.fetchEvaluationIssueTags();
  assert.equal(fixture.tags[0].active, false);
  assert.equal(pendingKeys().length, 0);
  await assert.rejects(store.createEvaluationIssueTag(input()), /ถูกลบจากคลัง/);
  await store.setEvaluationIssueTagActive(fixture.tags[0], true);
  assert.equal(fixture.tags[0].id, offlineTag.id);
  assert.equal(fixture.tags[0].active, true);
  console.log("PASS offline removal persists, syncs as a tombstone and requires an explicit restore");

  reset(); store = loadStore(); fixture.transactionGate = gate();
  const lateCreate = store.createEvaluationIssueTag(input());
  await tick(); expireCreationWait();
  const lateCreated = await lateCreate;
  const queuedDelete = store.setEvaluationIssueTagActive(lateCreated, false);
  await tick(); expireCreationWait();
  await queuedDelete;
  let lateDeleteSnapshot;
  const stopLateDelete = store.subscribeEvaluationIssueTags((snapshot) => { lateDeleteSnapshot = snapshot; });
  fixture.transactionGate.open();
  await store.fetchEvaluationIssueTags();
  assert.equal(fixture.tags.length, 1);
  assert.equal(fixture.tags[0].active, false, "a late create must never erase a later deletion");
  assert.ok(lateDeleteSnapshot.tags.every((tag) => !tag.active));
  assert.equal(pendingKeys().length, 0);
  stopLateDelete();
  console.log("PASS deleting during a hung creation remains deleted after the late commit");

  reset(); store = loadStore(); fixture.transactionGate = gate();
  const pendingCreate = store.createEvaluationIssueTag(input());
  await tick(); expireCreationWait();
  const pendingCreated = await pendingCreate;
  const pendingDelete = store.setEvaluationIssueTagActive(pendingCreated, false);
  await tick(); expireCreationWait();
  const pendingDeleted = await pendingDelete;
  const pendingRestore = store.setEvaluationIssueTagActive(pendingDeleted, true);
  await tick(); expireCreationWait();
  await pendingRestore;
  fixture.transactionGate.open();
  await store.fetchEvaluationIssueTags();
  assert.equal(fixture.tags.length, 1);
  assert.equal(fixture.tags[0].active, true, "the latest restore supersedes queued removal");
  assert.equal(pendingKeys().length, 0);
  console.log("PASS restore supersedes removal while an earlier transaction is still hung");

  for (const failureCode of [null, "resource-exhausted", "permission-denied"]) {
    reset(); store = loadStore();
    const confirmedTag = await store.createEvaluationIssueTag(input());
    const delayedCommit = gate();
    if (failureCode) delayedCommit.failure = error(failureCode);
    fixture.commitGate = delayedCommit;
    const delayedRemove = store.setEvaluationIssueTagActive(confirmedTag, false);
    await tick(); expireCreationWait();
    const locallyRemoved = await delayedRemove;
    const latestRestore = store.setEvaluationIssueTagActive(locallyRemoved, true);
    await tick(); expireCreationWait();
    await latestRestore;
    const restoreRevision = JSON.parse(storage.get(pendingKeys()[0])).syncRevision;
    const restoreSnapshots = [];
    const stopRestore = store.subscribeEvaluationIssueTags((snapshot) => restoreSnapshots.push(snapshot));
    fixture.commitGate = null; delayedCommit.open();
    await store.fetchEvaluationIssueTags();
    assert.ok(restoreSnapshots.every((snapshot) => snapshot.tags[0].active), "a stale removal must never hide the Tag again after restoration");
    const queued = pendingKeys().map((key) => JSON.parse(storage.get(key)));
    assert.ok(queued.every((tag) => tag.active && tag.syncRevision === restoreRevision), "a late removal result cannot replace the newer queued restore");
    clock += 60_000;
    await store.fetchEvaluationIssueTags();
    assert.equal(fixture.tags[0].active, true);
    assert.equal(pendingKeys().length, 0);
    stopRestore();
  }
  console.log("PASS late removal commits and quota/permission failures preserve the newer restore revision");

  reset(); store = loadStore(); navigator.onLine = false;
  const legacyTag = { id: "legacy-tag", ...input(), normalizedName: "test", active: true, createdAt: "2026-10-05T00:00:00.000Z", syncStatus: "pending" };
  storage.set(pendingPrefix + legacyTag.id, JSON.stringify(legacyTag));
  assert.equal((await store.fetchEvaluationIssueTags())[0].syncAction, "create");
  navigator.onLine = true;
  await store.fetchEvaluationIssueTags();
  assert.equal(pendingKeys().length, 0);
  assert.equal(fixture.tags[0].id, legacyTag.id);
  console.log("PASS Tags queued before management support still sync and clear their legacy queue records");

  reset(); store = loadStore();
  const protectedTag = await store.createEvaluationIssueTag(input());
  fixture.failure = error("permission-denied");
  await assert.rejects(store.setEvaluationIssueTagActive(protectedTag, false), /permission-denied/);
  assert.equal(fixture.tags[0].active, true);
  assert.equal(pendingKeys().length, 0);
  assert.equal((await store.fetchEvaluationIssueTags())[0].active, true);
  console.log("PASS removal permission failures leave the shared and local Tag active");

  reset(); store = loadStore(); fixture.readGate = gate();
  const hangingCatalog = store.fetchEvaluationIssueTags();
  await tick();
  const waitingForCatalog = exerciseEvaluate(store);
  await tick(); expireCreationWait();
  const catalogWaitState = await waitingForCatalog;
  assert.equal(fixture.writes, 0);
  assert.equal(pendingKeys().length, 1);
  const catalogWaitId = catalogWaitState.catalog[0].id;
  fixture.readGate.open();
  await hangingCatalog;
  await store.fetchEvaluationIssueTags();
  assert.equal(pendingKeys().length, 0);
  assert.equal(fixture.tags[0].id, catalogWaitId);
  console.log("PASS never-settling catalog read releases the real Add Tag button and preserves the Tag");

  reset(); store = loadStore(); fixture.transactionGate = gate();
  let settledSnapshot;
  const stopHangingSubscription = store.subscribeEvaluationIssueTags((snapshot) => { settledSnapshot = snapshot; });
  const waitingForCommit = exerciseEvaluate(store);
  await tick(); expireCreationWait();
  const commitWaitState = await waitingForCommit;
  const commitWaitId = commitWaitState.catalog[0].id;
  const secondWhileWaiting = store.createEvaluationIssueTag(input("Another"));
  await tick(); expireCreationWait();
  const secondQueuedTag = await secondWhileWaiting;
  assert.equal(pendingKeys().length, 2, "another Tag remains usable while the first transaction is hung");
  assert.equal(fixture.writes, 0, "local selection cannot be presented as a confirmed cloud save");
  fixture.transactionGate.open();
  await store.fetchEvaluationIssueTags();
  assert.equal(pendingKeys().length, 0);
  assert.equal(fixture.tags.length, 2);
  assert.equal(fixture.tags.find((tag) => tag.name === "Test").id, commitWaitId);
  assert.equal(fixture.tags.find((tag) => tag.name === "Another").id, secondQueuedTag.id);
  assert.ok(settledSnapshot.tags.every((tag) => !tag.syncStatus));
  assert.equal(timers.size, 0);
  stopHangingSubscription();
  console.log("PASS hung transactions release multiple additions and late commits clear only confirmed Tags");

  reset(); store = loadStore(); fixture.transactionGate = gate();
  let deniedSnapshot;
  const stopDeniedSubscription = store.subscribeEvaluationIssueTags((snapshot) => { deniedSnapshot = snapshot; });
  const lateDenied = exerciseEvaluate(store);
  await tick(); expireCreationWait();
  await lateDenied;
  fixture.failure = error("permission-denied"); fixture.transactionGate.open();
  await store.fetchEvaluationIssueTags();
  assert.equal(fixture.writes, 0);
  assert.equal(deniedSnapshot.conflicts.length, 1, "a late authorization rejection is shown instead of a shared-save success");
  assert.match(deniedSnapshot.conflicts[0].syncError, /permission-denied/);
  assert.equal(JSON.parse(storage.get(pendingKeys()[0])).syncStatus, "conflict");
  stopDeniedSubscription();
  console.log("PASS late permission failures remain visible and never become a shared save");

  reset(); store = loadStore(); fixture.readGate = gate();
  const delayedDuplicateRead = store.fetchEvaluationIssueTags();
  await tick();
  const delayedDuplicateCreate = exerciseEvaluate(store);
  await tick(); expireCreationWait();
  await delayedDuplicateCreate;
  fixture.tags = [{ ...input("TEST", "2"), id: "shared-other-topic", normalizedName: "test", active: true, createdAt: "" }];
  let lateDuplicateSnapshot;
  const stopLateDuplicate = store.subscribeEvaluationIssueTags((snapshot) => { lateDuplicateSnapshot = snapshot; });
  fixture.readGate.open();
  await delayedDuplicateRead;
  await store.fetchEvaluationIssueTags();
  assert.equal(fixture.writes, 0);
  assert.equal(lateDuplicateSnapshot.conflicts.length, 1);
  assert.match(lateDuplicateSnapshot.conflicts[0].syncError, /Topic 2/);
  stopLateDuplicate();
  console.log("PASS late catalog duplicates remain assigned to their original Topic and surface a conflict");

  reset(); store = loadStore(); fixture.readGate = gate();
  const fullStorageRead = store.fetchEvaluationIssueTags();
  await tick();
  storageFull = true;
  const fullStorageCreation = assert.rejects(store.createEvaluationIssueTag(input()), /ยังเก็บ Tag ที่รอซิงก์ไม่ได้/);
  await tick(); expireCreationWait();
  await fullStorageCreation;
  assert.equal(pendingKeys().length, 0);
  fixture.failure = error("resource-exhausted"); fixture.readGate.open();
  await fullStorageRead;
  await tick();
  assert.equal(fixture.writes, 0);
  console.log("PASS stalled requests with full browser storage never report a durable local save");

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
