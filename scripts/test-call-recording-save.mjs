import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";

// Exercise the actual Evaluate handlers, persistence helpers and Case Detail
// markup. Storage and HTTP boundaries are fixtures; no production writes.
function declarations(file, names, bindings = {}) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const available = new Map();
  function collect(node) {
    if (ts.isFunctionDeclaration(node) && node.name) available.set(node.name.text, { node, text: node.getText().replace(/^export\s+/, "") });
    ts.forEachChild(node, collect);
  }
  collect(tree);
  for (const node of tree.statements) if (ts.isVariableStatement(node)) for (const variable of node.declarationList.declarations) {
    if (ts.isIdentifier(variable.name)) available.set(variable.name.text, { node: variable, text: `const ${variable.getText()};` });
  }
  const selected = new Map();
  function include(name) {
    if (selected.has(name) || Object.hasOwn(bindings, name) || !available.has(name)) return;
    const declaration = available.get(name); selected.set(name, declaration.text);
    function visit(node) { if (ts.isIdentifier(node)) include(node.text); ts.forEachChild(node, visit); }
    visit(declaration.node);
  }
  names.forEach(include);
  const js = ts.transpileModule([...selected.values()].join("\n") + `\nreturn {${names.join(",")}};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None },
  }).outputText;
  return Function(...Object.keys(bindings), js)(...Object.values(bindings));
}

function gate() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = () => new Promise((resolve) => setImmediate(resolve));
const originalFetch = globalThis.fetch;
const originalReader = globalThis.FileReader;
const originalWindow = globalThis.window;
globalThis.FileReader = class {
  readAsDataURL(file) { file.arrayBuffer().then((bytes) => { this.result = `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`; this.onload?.(); }, () => this.onerror?.()); }
};
const storage = new Map();
const databaseValues = new Map();
const database = {
  close() {}, objectStoreNames: { contains: () => true },
  transaction() {
    const transaction = { objectStore: () => ({
      get(key) { const request = {}; queueMicrotask(() => { request.result = databaseValues.get(key); request.onsuccess?.(); }); return request; },
      put(value, key) { queueMicrotask(() => { databaseValues.set(key, structuredClone(value)); transaction.oncomplete?.(); }); },
    }) }; return transaction;
  },
};
globalThis.window = {
  localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
  indexedDB: { open() { const request = {}; queueMicrotask(() => { request.result = database; request.onsuccess?.(); }); return request; } },
  alert() {}, dispatchEvent() {},
};
const audioState = declarations("../src/callRecordingState.ts", ["callLogsForDraft", "callLogsForSubmit", "restoreDraftCallLogs"]);
const drive = declarations("../src/googleDriveUpload.ts", ["uploadEvidenceFileToDrive"]);
const drafts = declarations("../src/lib/evaluation/draftPersistence.ts", ["readDraftQueue", "writeDraftQueue"]);
const fixtureFile = (name, marker = 7, size = 32) => new File([new Uint8Array(size).fill(marker)], name, { type: "audio/wav", lastModified: 1234 });
const fileOne = fixtureFile("first.wav", 11);
const fileTwo = fixtureFile("second.wav", 22);
const setter = (state, key) => (next) => { state[key] = typeof next === "function" ? next(state[key]) : next; };

function form(primary) {
  const state = { callLogs: [], uploads: { current: new Map() }, submitLock: { current: false }, message: "", preview: null, saved: [], primaryCalls: [], history: [], drafts: [] };
  function handlers() {
    const bindings = {
      ...audioState, ...drive, ...drafts, callLogs: state.callLogs, callRecordingUploads: state.uploads,
      callRecordingSaveInProgressRef: state.submitLock, setCallLogs: setter(state, "callLogs"),
      setDraftMessage: setter(state, "message"), setSubmitPreview: setter(state, "preview"),
      setDraftInbox: setter(state, "drafts"), submitPreview: state.preview, submitInProgress: false,
      prepareVoiceRecordingForBrowser: async (file) => ({ file, converted: false }), readAudioDuration: async () => "02:06",
      async uploadCallRecordingFile(file, caseId, progress) { state.primaryCalls.push(file.name); progress?.(15); return primary(file, caseId); },
      validateAgentSelected: () => true, missingScoreTopics: [], missingScoreText: "", noCaseForMonth: false,
      caseId: "AA900080", agentName: "Agent Fixture", auditDate: "2026-10-06", selectedMonthKey: "2026-10",
      selectedAgentOption: { username: "fixture", displayName: "Agent Fixture", agentName: "Agent Fixture", role: "Agent" },
      fetchStoredEvaluations: async () => [], loadRawDataReportRecords: async () => [],
      currentUser: { username: "qa-fixture" }, evaluatorName: "QA Fixture", canonicalizeAgentName: (value) => String(value || ""),
      activeDraftId: "", activeSubmittedRecordId: "", draftQueueLoading: false,
      topics: [{ code: "1", title: "Process", max: 100 }], topicState: { "1": { score: 87, reason: "Saved comment", issueTags: ["เกิน SLA"], deductions: [] } },
      scoreOf: () => 87, activeRubric: { code: "QA-2026-08", name: "QA" }, rubricPeriod: "2026", finalScore: 87, grade: "B", criticalError: false,
      waitingTime: "", serviceTime: "", caseUrl: "", inquiry: "Inquiry", caseDescription: "Description", processReference: "", evidenceUrl: "", evidencePreviewValue: "", previewColumns: {},
      completedTopics: 1, isTestCase: true, isTestCaseEvaluation: (record) => Boolean(record.isTestCase), evaluationSubmittedAt: "",
      evaluationHistory: state.history, persistHistory: setter(state, "history"), resetEvaluationForm() {},
      onSubmitEvaluation: async (record) => state.saved.push(JSON.parse(JSON.stringify(record))),
    };
    for (const key of ["ActiveDraftId", "ActiveSubmittedRecordId", "EvaluationStartedAt", "EvaluationSubmittedAt", "EvaluationStatus", "DraftSavedAt", "WorkspaceView", "SubmitInProgress", "AgentName", "AuditDate", "WaitingTime", "ServiceTime", "CaseId", "CaseUrl", "Inquiry", "CaseDescription", "ProcessReference", "EvidenceUrl", "NoCaseForMonth", "IsTestCase", "CriticalError", "TopicState"]) bindings["set" + key] = () => {};
    return declarations("../src/CreateEvaluationMockup.tsx", ["handleNewCallRecordingFiles", "handleCallRecordingFile", "startCallRecordingUpload", "submitEvaluation", "confirmSubmitEvaluation", "saveDraft", "loadDraftIntoForm", "removeCallLog"], bindings);
  }
  return { state, handlers };
}

try {
  const one = gate(), two = gate();
  const success = form((file) => file.name === fileOne.name ? one.promise : two.promise);
  await success.handlers().handleNewCallRecordingFiles([fileOne, fileTwo]);
  assert.equal(success.state.callLogs.length, 2, "both Call logs appear while uploads run independently");
  one.resolve("https://audio.test/first.wav"); await tick();
  let submitted = false;
  const pendingSubmit = success.handlers().submitEvaluation().then(() => { submitted = true; });
  await tick(); assert.equal(submitted, false, success.state.message); assert.equal(success.state.preview, null, "one completed voice cannot submit the incomplete second voice");
  assert.deepEqual(success.state.primaryCalls, ["first.wav", "second.wav"], "Submit reuses in-flight uploads instead of duplicating them");
  two.resolve("https://audio.test/second.wav"); await pendingSubmit;
  await success.handlers().confirmSubmitEvaluation();
  assert.equal(success.state.saved.length, 1);
  const savedCase = success.state.saved[0];
  assert.deepEqual(savedCase.callLogs.map((call) => call.recordingUrl), ["https://audio.test/first.wav", "https://audio.test/second.wav"]);
  assert.equal(savedCase.finalScore, 87); assert.deepEqual(savedCase.topics[0].issueTags, ["เกิน SLA"]);
  assert.ok(savedCase.callLogs.every((call) => !call.recordingFile && !call.localPreviewUrl && !call.uploadStatus));
  console.log("PASS real Submit and confirm wait for both voices, preserve URLs and leave score/Tags unchanged");

  let requests = [];
  globalThis.fetch = async (url, init) => {
    const payload = JSON.parse(init.body); requests.push({ url, payload, bytes: Buffer.byteLength(init.body) });
    return { ok: true, status: 200, json: async () => ({ webViewLink: `https://drive.google.com/file/d/${payload.fileName.startsWith("first") ? "voice_one" : "voice_two"}/view` }) };
  };
  const fallback = form(async () => { throw new Error("Firebase stalled"); });
  await fallback.handlers().handleNewCallRecordingFiles([fixtureFile("first.wav", 1, 2_016_044), fixtureFile("second.wav", 2, 2_016_044)]);
  await tick(); await tick();
  await fallback.handlers().submitEvaluation();
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ payload, bytes }) => !Object.hasOwn(payload, "base64") && bytes < 4_500_000), "a 2:06 PCM recording no longer becomes a 5.4 MB request");
  assert.deepEqual(fallback.state.preview.record.callLogs.map((call) => call.recordingUrl.split("&")[0]), ["/api/google-drive-download?id=voice_one", "/api/google-drive-download?id=voice_two"]);
  console.log("PASS both 2:06 voices use independent Drive requests with one Base64 copy, below the payload limit");

  globalThis.fetch = async () => ({ ok: false, status: 413, json: async () => { throw new Error("HTML error response"); } });
  const partial = form(async (file) => { if (file.name === "first.wav") return "https://audio.test/first.wav"; throw new Error("stalled"); });
  await partial.handlers().handleNewCallRecordingFiles([fileOne, fileTwo]); await tick(); await tick();
  await partial.handlers().submitEvaluation();
  assert.equal(partial.state.preview, null); assert.equal(partial.state.saved.length, 0);
  assert.match(partial.state.message, /Call #2 \(second.wav\)/);
  assert.equal(partial.state.callLogs[1].recordingFile, fileTwo, "failed second attachment stays in the form");
  await partial.handlers().saveDraft();
  const savedDraft = (await drafts.readDraftQueue())[0];
  assert.equal(savedDraft.callLogs[0].recordingUrl, "https://audio.test/first.wav");
  assert.ok(savedDraft.callLogs[1].pendingRecording.dataUrl, "Draft retains the failed second voice's bytes");
  partial.state.callLogs = []; partial.handlers().loadDraftIntoForm(savedDraft);
  assert.deepEqual(Buffer.from(await partial.state.callLogs[1].recordingFile.arrayBuffer()), Buffer.from(await fileTwo.arrayBuffer()));
  console.log("PASS a failed second voice blocks Submit, identifies Call #2 and survives saving/reopening Draft");

  const bothFailed = form(async () => { throw new Error("offline"); });
  await bothFailed.handlers().handleNewCallRecordingFiles([fileOne, fileTwo]); await tick(); await tick();
  await bothFailed.handlers().saveDraft();
  const bothDraft = (await drafts.readDraftQueue())[0];
  assert.equal(bothDraft.callLogs.filter((call) => call.pendingRecording).length, 2);
  bothFailed.state.callLogs = []; bothFailed.handlers().loadDraftIntoForm(JSON.parse(JSON.stringify(bothDraft)));
  assert.deepEqual(await Promise.all(bothFailed.state.callLogs.map(async (call) => Buffer.from(await call.recordingFile.arrayBuffer()))), [Buffer.from(await fileOne.arrayBuffer()), Buffer.from(await fileTwo.arrayBuffer())]);
  globalThis.fetch = async (url, init) => ({ ok: true, status: 200, json: async () => ({ webViewLink: `https://drive.google.com/file/d/${JSON.parse(init.body).fileName.startsWith("first") ? "restored_one" : "restored_two"}/view` }) });
  await bothFailed.handlers().submitEvaluation(); await bothFailed.handlers().confirmSubmitEvaluation();
  assert.equal(bothFailed.state.saved[0].callLogs.length, 2);
  assert.ok(bothFailed.state.saved[0].callLogs.every((call) => call.recordingUrl.includes("restored_")));
  console.log("PASS both failed voices survive a browser-storage round trip and attach to the submitted case after retry");

  const old = gate(), replacement = gate();
  const race = form((file) => file.name === "first.wav" ? old.promise : replacement.promise);
  await race.handlers().handleNewCallRecordingFiles([fileOne]);
  const id = race.state.callLogs[0].id;
  const replace = race.handlers().handleCallRecordingFile(id, fileTwo);
  await tick(); old.resolve("https://audio.test/old.wav"); await tick();
  assert.equal(race.state.callLogs[0].recordingName, "second.wav");
  assert.equal(race.state.callLogs[0].recordingUrl, "", "late completion cannot attach the wrong old voice");
  replacement.resolve("https://audio.test/replacement.wav"); await replace;
  assert.equal(race.state.callLogs[0].recordingUrl, "https://audio.test/replacement.wav");
  console.log("PASS replacing a voice ignores late results from the previous file");

  await assert.rejects(audioState.callLogsForSubmit([{ id: "legacy", recordingName: "missing.wav", recordingUrl: "blob:expired" }], async () => ""), /Call #1/);
  assert.equal((await audioState.callLogsForSubmit([{ id: "manual", phoneNumber: "123", direction: "Outbound" }], async () => "")).length, 1, "Manual Calls require no audio");
  console.log("PASS local-only/expired voices cannot be submitted; Manual Calls remain supported");

  const dashboardBindings = {
    canonicalizeAgentName: (value) => String(value || ""), canonicalAgentIdentityKey: (value) => String(value || ""),
    getOriginalEvaluationTimestamp: (record) => record.auditTimestamp || record.submittedAt,
    getEvaluationLastUpdatedAt: (record) => record.updatedAt || record.submittedAt,
    getTopicMasterByMonth: () => [{ code: "1", label: "Process", max: 100 }],
    isTestCaseEvaluation: (record) => Boolean(record.isTestCase), scoreToGrade: () => "B",
  };
  const { mapStoredEvaluationsToCaseItems } = declarations("../src/DashboardMockup.tsx", ["mapStoredEvaluationsToCaseItems"], dashboardBindings);
  const caseItem = mapStoredEvaluationsToCaseItems([savedCase])[0];
  assert.deepEqual(caseItem.callLogs.map((call) => call.recordingUrl), savedCase.callLogs.map((call) => call.recordingUrl));
  const dashboardTree = ts.createSourceFile("Dashboard.tsx", fs.readFileSync(new URL("../src/DashboardMockup.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let voiceMarkup;
  function visit(node) { if (ts.isJsxExpression(node) && node.expression?.getText().startsWith("caseItem.callLogs?.length ?")) voiceMarkup = node.expression.getText(); ts.forEachChild(node, visit); }
  visit(dashboardTree); assert.ok(voiceMarkup);
  const viewCode = ts.transpileModule(`return (${voiceMarkup});`, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const html = renderToStaticMarkup(Function("React", "caseItem", viewCode)(React, caseItem));
  const dom = new JSDOM(html);
  assert.deepEqual([...dom.window.document.querySelectorAll("audio")].map((node) => node.getAttribute("src")), ["https://audio.test/first.wav", "https://audio.test/second.wav"]);
  console.log("PASS reopening the serialized case through the real Dashboard mapper renders both Case Detail players");

  const originalTimeout = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  try {
    let clock = 0, nextTimer = 0; const timers = new Map();
    globalThis.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: clock + delay }); return id; };
    globalThis.clearTimeout = (id) => timers.delete(id);
    const advance = (ms) => { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock) { timers.delete(id); timer.callback(); } };
    let task;
    const { uploadCallRecordingFile } = declarations("../src/evaluationStore.ts", ["uploadCallRecordingFile"], {
      getFirebaseEvaluationStorage: () => ({}), storageRef: (_, path) => ({ path }), getDownloadURL: async () => "https://audio.test/progress.wav",
      uploadBytesResumable: (ref, file) => {
        const result = gate();
        task = { snapshot: { ref }, canceled: false, unsubscribed: false, then: result.promise.then.bind(result.promise),
          on(event, callback) { this.progress = callback; return () => { this.unsubscribed = true; }; },
          cancel() { this.canceled = true; result.reject(new Error("canceled")); }, finish() { result.resolve(this.snapshot); },
        }; return task;
      },
    });
    const progress = []; const active = uploadCallRecordingFile(fileOne, "case", (value) => progress.push(value));
    advance(15_000); task.progress({ bytesTransferred: 10, totalBytes: 32 });
    advance(15_000); task.progress({ bytesTransferred: 20, totalBytes: 32 });
    assert.equal(task.canceled, false, "an active upload continues beyond the old 20-second total cutoff");
    advance(10_000); task.finish(); assert.equal(await active, "https://audio.test/progress.wav");
    assert.equal(progress.at(-1), 100); assert.equal(task.unsubscribed, true); assert.equal(timers.size, 0);
    const stalled = uploadCallRecordingFile(fileOne, "case"); advance(20_000);
    await assert.rejects(stalled, /20 วินาที/); assert.equal(task.canceled, true); assert.equal(task.unsubscribed, true);
    console.log("PASS Firebase reports real progress, allows active uploads beyond 20 seconds and cancels stalled uploads");
  } finally { globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear; }
} finally {
  globalThis.fetch = originalFetch; globalThis.FileReader = originalReader; globalThis.window = originalWindow;
}
