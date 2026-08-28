// Offline regression checks: execute the actual TS functions with in-memory data.
// No browser, credentials, network requests, or production writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
const parse = (file) => ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(file, predicate) {
  let result;
  function visit(node) {
    if (!result && predicate(node)) result = node;
    if (!result) ts.forEachChild(node, visit);
  }
  visit(parse(file));
  assert.ok(result, `Missing source anchor in ${file}`);
  return result;
}
function run(code, dependencies = {}) {
  const js = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports = {};
  return Function("exports", ...Object.keys(dependencies), `${js}\nreturn exports;`)(exports, ...Object.values(dependencies));
}
function functions(file, names, dependencies = {}) {
  const code = names.map((name) => find(file, (node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText()
    .replace(/^export\s+(default\s+)?/, "")).join("\n");
  return run(`${code}\nexport { ${names.join(",")} };`, dependencies);
}
function value(file, name, dependencies = {}) {
  const node = find(file, (node) => ts.isVariableDeclaration(node) && node.name.getText() === name);
  return run(`export const result = ${node.initializer.getText()};`, { useMemo: (fn) => fn(), ...dependencies }).result;
}
let checks = 0;
async function check(label, fn) { await fn(); checks++; console.log(`PASS ${label}`); }

const scope = functions("lib/evaluationScope.ts", ["isTestCaseEvaluation", "excludeTestEvaluations", "limitEvaluationScopes"]);
const { isTestCaseEvaluation, excludeTestEvaluations, limitEvaluationScopes } = scope;
const identity = run(source("lib/agentIdentity.ts"));
const names = functions("lib/userNames.ts", ["getUserFullName", "withConsistentUserNames", "getEvaluationAgentFullName"], identity);
await check("legacy default, remote/raw flags and explicit false precedence", () => {
  for (const record of [undefined, {}, { isTestCase: false }, { isTestCase: "NO" }, { isTestCase: false, rawDataPreview: { "Test Case": "YES" } }]) {
    assert.equal(isTestCaseEvaluation(record), false);
  }
  for (const record of [{ isTestCase: true }, { is_test_case: true }, { is_test_case: "true" }, { rawDataPreview: { "Test Case": "YES" } }, { raw_data_preview: { "Test Case": 1 } }, { rowData: { "Test Case": " yes " } }]) {
    assert.equal(isTestCaseEvaluation(record), true);
  }
});

const store = functions("evaluationStore.ts", [
  "toArray", "compactStoredText", "compactStoredUrl", "compactStoredRecord", "canonicalizeRawPreview", "toTopics",
  "normalizeEvaluationType", "monthKeyFromValue", "isNoCaseEvaluation", "getStoredEvaluationMonthKey", "isStoredEvaluationRecord",
  "toEvaluation", "normalizeLocalString", "localField", "localRawPreview", "toLocalEvaluation", "fromEvaluation", "toFirebaseEvaluation",
], { ...scope, ...identity, ...names });
function record(id, score, test = false, agent = "Agent A") {
  return store.toLocalEvaluation({ id, evaluationKey: id, caseId: id, isTestCase: test,
    agentName: agent, targetDisplayName: agent, auditDate: "2026-08-17", auditTimestamp: "2026-08-17T12:00:00Z",
    submittedAt: "2026-08-17T12:00:00Z", finalScore: score, grade: score >= 80 ? "B" : "F",
    topics: [{ code: "1", title: "Topic", max: 100, score, comment: "Keep this comment" }],
    evidenceUrls: ["https://example.com/evidence.pdf"], rawDataPreview: {}, evaluationType: "case",
  });
}
const real = [record("REAL-1", 80), record("REAL-2", 90)];
const testCase = record("TEST-1", 10, true, "Test-only Agent");
const mixed = [testCase, ...real];
await check("Firebase/cache/metadata round trips retain classification, scores and comments", () => {
  for (const original of mixed) {
    const remote = store.toFirebaseEvaluation(original);
    for (const restored of [store.toEvaluation(remote), store.toLocalEvaluation(JSON.parse(JSON.stringify(original))), store.toLocalEvaluation(remote)]) {
      assert.equal(restored.isTestCase, original.isTestCase);
      assert.equal(restored.finalScore, original.finalScore);
      assert.deepEqual(restored.topics, original.topics);
      assert.deepEqual(restored.evidenceUrls, original.evidenceUrls);
    }
    delete remote.is_test_case; // metadata-only legacy transport
    assert.equal(store.toEvaluation(remote).isTestCase, original.isTestCase);
  }
});
await check("separate read/cache limits do not evict real results", () => {
  assert.deepEqual(excludeTestEvaluations(limitEvaluationScopes(mixed, 2)), real);
  assert.deepEqual(limitEvaluationScopes([testCase], 2), [testCase]);
});

await check("Firestore pagination fills the real-result window past test records", async () => {
  const rows = [...Array.from({ length: 7 }, (_, index) => record(`TEST-${index}`, 10, true)), ...real];
  const docs = rows.map((row, index) => ({ id: row.id, index, data: () => store.toFirebaseEvaluation(row) }));
  let calls = 0;
  const api = functions("evaluationStore.ts", ["fetchStoredEvaluations"], {
    ...scope, ...store, DEFAULT_EVALUATION_LIMIT: 2, normalizeEvaluationLimit: (limit) => limit,
    readLocalEvaluationHistory: () => [], readRemoteEvaluationCache: () => [], readRecoveredLocalEvaluations: () => [],
    mergeEvaluationSources: (remote, local) => [...remote, ...local], isFirebaseEvaluationConfigured: () => true,
    cachedRemoteEvaluations: (_limit, request) => request(), getFirebaseEvaluationDb: () => ({}),
    collection: () => ({}), orderBy: () => ({}), startAfter: (cursor) => ({ start: cursor.index + 1 }),
    firestoreLimit: (limit) => ({ limit }), query: (...constraints) => Object.assign({}, ...constraints),
    getDocs: async ({ start = 0, limit }) => { calls++; return { docs: docs.slice(start, start + limit) }; },
    FIREBASE_EVALUATION_COLLECTION: "test-fixture", AUTO_SYNC_LOCAL_EVALUATIONS: false, writeRemoteEvaluationCache: () => {},
  });
  const result = await api.fetchStoredEvaluations(2);
  assert.deepEqual(excludeTestEvaluations(result).map((row) => row.caseId), real.map((row) => row.caseId));
  assert.equal(result.filter(isTestCaseEvaluation).length, 2);
  assert.ok(calls > 1 && calls <= docs.length);
});

const mapped = mixed.map((row) => ({ ...row, key: row.id, agent: row.agentName, monthKey: "2026-08", weekLabel: "Week 3",
  reviewStatus: "Original", auditDateObj: new Date(row.auditDate), topics: row.topics.map((topic) => ({ ...topic, pct: topic.score })) }));
const base = {
  ...scope, ...store, caseIdSearch: "", selectedWeek: "all", selectedTopicCode: "", overviewMode: "all",
  selectedMonthKey: "2026-08", selectedYear: "2026", isYearlyView: false, dateFrom: "", dateTo: "",
  isWithinDateRange: () => true, compareCaseAuditDateAndWaitingTime: (a, b) => a.caseId.localeCompare(b.caseId),
  getMonthLabel: () => "August 2026", getMonthKey: () => "2026-08",
  getTopicMasterByMonth: () => [{ code: "1", label: "Topic", max: 100 }],
  getPolicyMonthKeyForCases: () => "2026-08", formatFixed: (number, digits) => number.toFixed(digits),
};
await check("Dashboard totals, grade mix, topics and all trend modes ignore tests", () => {
  const compute = (rows) => {
    const dependencies = { ...base, dateFilteredCases: rows, agentCases: rows, searchScopedCases: rows };
    const caseExplorerCasesBase = value("DashboardMockup.tsx", "caseExplorerCasesBase", dependencies);
    const dashboardCasesBase = value("DashboardMockup.tsx", "dashboardCasesBase", { ...dependencies, caseExplorerCasesBase });
    const dashboardCases = value("DashboardMockup.tsx", "dashboardCases", { ...dependencies, dashboardCasesBase });
    const { buildAgentSummary } = functions("DashboardMockup.tsx", ["buildAgentSummary"], dependencies);
    return {
      count: dashboardCases.length, summary: buildAgentSummary(dashboardCases),
      kpi: value("DashboardMockup.tsx", "kpiPeriodCases", dependencies),
      weekly: value("DashboardMockup.tsx", "weeklyTrendData", dependencies),
      monthly: value("DashboardMockup.tsx", "monthlyTrendData", dependencies),
      yearly: value("DashboardMockup.tsx", "yearlyTrendData", dependencies),
    };
  };
  assert.deepEqual(compute(mapped), compute(mapped.filter((row) => !row.isTestCase)));
  assert.equal(compute(mapped).summary.averageDisplay, "85.00");
  assert.equal(compute([mapped[0]]).count, 0);
});
await check("Case Navigator lists and searches test cases without changing role scope", () => {
  const dependencies = { ...base, caseExplorerCasesBase: mapped, authorizedSearchCases: mapped };
  assert.equal(value("DashboardMockup.tsx", "caseExplorerCases", dependencies).length, 3);
  assert.equal(value("DashboardMockup.tsx", "caseExplorerCases", { ...dependencies, caseIdSearch: "TEST-1" })[0].isTestCase, true);
  assert.equal(value("DashboardMockup.tsx", "caseExplorerCases", { ...dependencies, authorizedSearchCases: mapped.slice(1), caseIdSearch: "TEST-1" }).length, 0);
  const authorized = value("DashboardMockup.tsx", "authorizedSearchCases", { ...base, allCases: mapped,
    overviewSelfOnly: true, overviewResolvedAgent: "Agent A", effectiveSelectedAgent: "Agent A", overviewAgentScopeList: [],
    isSameAgent: (left, right) => left === right });
  assert.deepEqual(authorized.map((row) => row.caseId), ["REAL-1", "REAL-2"]);
});
await check("test-only agents do not increase real chart/coverage targets", () => {
  const result = value("DashboardMockup.tsx", "visibleTargetAgents", { ...base, allCases: mapped,
    overviewAgentScopeList: [], visibleAgentList: ["Agent A", "Test-only Agent"], noCaseEvaluations: [],
    effectiveMonthKeyForAgentVisibility: "2026-08", isSameAgent: (a, b) => a === b });
  assert.deepEqual(result, ["Agent A"]);
});
await check("form monthly quota excludes tests", () => {
  const count = value("CreateEvaluationMockup.tsx", "selectedAgentCaseCount", { ...base, agentName: "Agent A",
    selectedAgentOption: null, selectedMonthKey: "2026-08", agentQuotaRecords: mixed,
    buildAgentMatchValues: () => new Set(["Agent A"]), getEvaluationMonthKey: (date) => date.slice(0, 7),
    storedEvaluationMatchesAgent: () => true, normalizeCaseId: (id) => id });
  assert.equal(count, 2);
});
await check("test submit persists full details and never removes an existing No Case result", async () => {
  let saves = 0;
  let deletes = 0;
  const noop = () => {};
  const dependencies = { ...base, submitPreview: { record: { ...testCase, recordId: testCase.id }, draftId: "draft" },
    submitInProgress: false, onSubmitEvaluation: async (row) => { saves++; assert.equal(row.finalScore, 10); },
    fetchStoredEvaluations: async () => { throw new Error("Test submission must not run No Case cleanup"); },
    deleteStoredEvaluation: () => { deletes++; }, draftInbox: [], evaluationHistory: [], persistDrafts: noop, persistHistory: noop,
    compactEvidenceForStorage: (urls) => urls, resetEvaluationForm: noop, window: { dispatchEvent: noop, alert: noop },
    CustomEvent: class {},
  };
  for (const name of ["setSubmitInProgress", "setDraftMessage", "setEvaluationStartedAt", "setEvaluationSubmittedAt", "setEvaluationStatus", "setActiveDraftId", "setDraftSavedAt", "setActiveSubmittedRecordId", "setSubmitPreview", "setWorkspaceView"]) dependencies[name] = noop;
  await functions("CreateEvaluationMockup.tsx", ["confirmSubmitEvaluation"], dependencies).confirmSubmitEvaluation();
  assert.equal(saves, 1);
  assert.equal(deletes, 0);
});
await check("application submission passes the persisted flag and separate test event", async () => {
  for (const payload of [testCase, real[0]]) {
    let saved;
    let event;
    const handle = value("App.tsx", "handleEvaluationSubmitted", { ...scope, currentUser: { username: "qa" },
      compactCentralEvidenceUrls: (urls) => urls, compactCentralRawPreview: (preview) => preview,
      compactCentralStoreText: (text) => text || "", upsertStoredEvaluation: async (row) => { saved = row; },
      logUsageEvent: async (_user, type) => { event = type; }, loadInboxTasks: async () => {}, notifyQaDataChanged: () => {},
    });
    await handle(payload);
    assert.equal(saved.isTestCase, payload.isTestCase);
    assert.equal(saved.finalScore, payload.finalScore);
    assert.equal(event, payload.isTestCase ? "qa_test_evaluation_submitted" : "qa_evaluation_submitted");
  }
});
await check("all real-report boundaries use test exclusion", () => {
  for (const file of ["SummaryMockup.tsx", "PresentationMockup.tsx", "CoachingMockup.tsx", "SignatureCenterMockup.tsx"]) {
    assert.match(source(file), /excludeTestEvaluations\(/, file);
  }
  assert.match(source("CreateEvaluationMockup.tsx"), /filterRecordsByReportDate\(excludeTestEvaluations\(submittedSource\)\)/);
  assert.match(source("CreateEvaluationMockup.tsx"), /filterRawRecordsByReportDate\(excludeTestEvaluations\(rawRecords\)\)/);
});
await check("test-only incentive documents are never generated", () => {
  const { buildDocumentsFromStoredEvaluations } = functions("SignatureCenterMockup.tsx", ["buildDocumentsFromStoredEvaluations"], scope);
  assert.deepEqual(buildDocumentsFromStoredEvaluations([testCase], []), []);
});
await check("draft/edit/reset preserve classification and submitted type is locked", () => {
  const form = source("CreateEvaluationMockup.tsx");
  assert.match(form, /setIsTestCase\(isTestCaseEvaluation\(normalizedDraft\)/);
  assert.match(form, /setIsTestCase\(isTestCaseEvaluation\(record\)\)/);
  assert.match(form, /setIsTestCase\(false\)/);
  assert.match(form, /disabled=\{noCaseForMonth \|\| Boolean\(activeSubmittedRecordId\)\}/);
  const draft = find("CreateEvaluationMockup.tsx", (node) => ts.isFunctionDeclaration(node) && node.name?.text === "buildCurrentDraft");
  assert.match(draft.getText(), /\bisTestCase,/);
});
await check("visible TEST badge renders and Case Detail/individual PDF retain the marker", () => {
  const { TestCaseBadge } = functions("TestCaseBadge.tsx", ["TestCaseBadge"], { React });
  assert.match(renderToStaticMarkup(React.createElement(TestCaseBadge)), /TEST — ไม่นับในผลประเมินจริง/);
  assert.match(source("DashboardMockup.tsx"), /isTestCaseEvaluation\(caseItem\) \? <TestCaseBadge/);
  assert.match(source("caseDetailOfficialPdf.ts"), /TEST Case Detail - Excluded from official results/);
});
const watermarks = functions("CaseWatermarks.tsx", ["getCaseWatermarkLabels", "CaseWatermarks"], { ...scope, React });
await check("horizontal case cards keep watermarks without the redundant TEST badge", () => {
  const rows = find("DashboardMockup.tsx", (node) => ts.isCallExpression(node)
    && node.expression.getText() === "caseExplorerCases.map").getText();
  assert.doesNotMatch(rows, /<TestCaseBadge/);
  assert.match(rows, /<CaseWatermarks item=\{item\}/);
  assert.match(rows, /\{item.caseId\}/);
  assert.match(rows, /onClick=/);
});
await check("watermarks distinguish normal, test and every appeal-history state", () => {
  const labels = watermarks.getCaseWatermarkLabels;
  assert.deepEqual(labels({}), []);
  assert.deepEqual(labels({ caseId: "TEST_APPEAL_123", reviewStatus: "Original" }), []);
  assert.deepEqual(labels({ isTestCase: true }), ["TEST"]);
  for (const appeal of [
    { hasAppealHistory: true }, { appealRequestId: "request-1" }, { reviewStatus: "Revised" },
    ...["Pending", "Approved", "Rejected", "Reset"].map((appealStatus) => ({ appealStatus })),
  ]) {
    assert.deepEqual(labels(appeal), ["APPEAL"]);
    assert.deepEqual(labels({ ...appeal, isTestCase: true }), ["TEST", "APPEAL"]);
  }
  assert.deepEqual(labels({ appealStatus: "Draft" }), []);
});
await check("watermarks render separate accessible stamps behind clickable card content", () => {
  const render = (item) => renderToStaticMarkup(React.createElement(watermarks.CaseWatermarks, { item }));
  assert.equal(render({}), "");
  const both = render({ isTestCase: true, hasAppealHistory: true });
  assert.match(both, /data-count="2"/);
  assert.match(both, /qa-case-watermark--test/);
  assert.match(both, /qa-case-watermark--appeal/);
  assert.match(both, /aria-label="เคสทดสอบ ไม่นับในผลประเมินจริง · เคสนี้เคยยื่นอุทธรณ์"/);
  assert.equal((both.match(/aria-hidden="true"/g) || []).length, 2);
  const css = source("index.css");
  assert.match(css, /\.qa-case-watermark-card\s*\{[^}]*isolation: isolate/s);
  assert.match(css, /\.qa-case-watermarks\s*\{[^}]*z-index: -1[^}]*pointer-events: none/s);
  assert.match(css, /\.qa-case-watermark\s*\{[^}]*transform: rotate\(-12deg\)/s);
  assert.match(css, /\.qa-case-watermarks\s*\{[^}]*flex-wrap: wrap/s);
});
const appealHistory = functions("DashboardMockup.tsx", [
  "normalizeAppealCaseId", "splitAppealCaseIds", "buildAppealHistoryCaseIds", "applyAppealMapsToCaseItems",
], {
  calcMergedFinalScore: () => { throw new Error("History must not recalculate scores"); },
  scoreToGrade: () => { throw new Error("History must not recalculate grades"); },
});
await check("submitted, reviewed and reset appeals retain history independently of scores", () => {
  const ids = appealHistory.buildAppealHistoryCaseIds([
    { event_type: "appeal_request_submitted", case_id: "aa291165, AA291166" },
    { event_type: "appeal_request_reviewed", details: { caseId: "Test Round 1_Dada", status: "Rejected" } },
    { event_type: "appeal_request_reset", case_id: "Test_ศักดา" },
    { event_type: "appeal_case_override", case_id: "AA999999" },
    { event_type: "appeal_request_draft", case_id: "AA888888" },
    { event_type: "appeal_request_submitted" },
  ]);
  assert.deepEqual([...ids].sort(), ["AA291165", "AA291166", "TESTROUND1_DADA", "TEST_ศักดา"].sort());
  const cases = [{ ...mapped[1], caseId: "AA291165" }, { ...mapped[0], caseId: "Test Round 1_Dada" }, mapped[2]];
  const baseline = appealHistory.applyAppealMapsToCaseItems(cases, new Map(), new Map());
  const stamped = appealHistory.applyAppealMapsToCaseItems(cases, new Map(), new Map(), ids);
  assert.deepEqual(stamped.map((item) => item.hasAppealHistory), [true, true, false]);
  for (let index = 0; index < cases.length; index++) {
    const { hasAppealHistory: ignored, ...actual } = stamped[index];
    const { hasAppealHistory: previous, ...expected } = baseline[index];
    assert.deepEqual(actual, expected);
    assert.equal(cases[index].hasAppealHistory, undefined);
  }
  assert.deepEqual(appealHistory.applyAppealMapsToCaseItems(stamped, new Map(), new Map()).map((item) => item.hasAppealHistory), [true, true, false]);
});
await check("successful appeal submission updates the matching card immediately", () => {
  let cases = [{ ...mapped[1], caseId: "AA291165" }, mapped[0], mapped[2]];
  const before = cases;
  value("DashboardMockup.tsx", "markCaseAppealSubmitted", {
    ...appealHistory, dashboardWorkbookCacheV155: {}, setAllCases: (update) => { cases = update(cases); },
  })("aa291165");
  assert.equal(cases[0].hasAppealHistory, true);
  assert.equal(cases[0].finalScore, before[0].finalScore);
  assert.equal(cases[1], before[1]);
  assert.equal(cases[2], before[2]);
  const dashboard = source("DashboardMockup.tsx");
  assert.equal((dashboard.match(/onAppealSubmitted=\{markCaseAppealSubmitted\}/g) || []).length, 3);
  assert.equal((dashboard.match(/<CaseWatermarks item=/g) || []).length, 4);
  assert.match(dashboard, /setAppealRequestExists\(true\);\s*onAppealSubmitted\?\.\(caseItem.caseId\)/);
});
const filenames = functions("caseDetailOfficialPdf.ts", ["safeText", "caseIdForFileName"], {
  richTextToPlainText: (text) => String(text ?? ""),
});
await check("PDF filenames use Case ID, preserve Thai and sanitize only unsafe characters", () => {
  for (const id of ["AA291165", "Test_ศักดา", "Test Round 1_Dada", "291165"]) {
    assert.equal(filenames.caseIdForFileName(id), id);
  }
  assert.equal(filenames.caseIdForFileName('Case/ไทย\\A:*?"<>|\u0001'), "Case_ไทย_A_");
  assert.equal(filenames.caseIdForFileName("Case...  "), "Case");
  assert.equal(filenames.caseIdForFileName(""), "case-detail");
  assert.equal(filenames.caseIdForFileName(undefined), "case-detail");
  const pdf = source("caseDetailOfficialPdf.ts");
  assert.match(pdf, /const safeCaseId = caseIdForFileName\(caseItem.caseId\)/);
  assert.match(pdf, /\$\{safeCaseId\}_Original_QA_Report.pdf/);
  assert.match(pdf, /\$\{safeCaseId\}_case_detail_appeal_report.pdf/);
  assert.doesNotMatch(pdf, /isTestCase \? "TEST_"/);
  assert.doesNotMatch(source("CreateEvaluationMockup.tsx"), /\? "TEST " : ""/);
  assert.match(pdf, /TEST Case Detail - Excluded from official results/);
});
await check("profile full name is shared without changing username, role or account state", () => {
  const original = { username: "Darunee", displayName: "  Darunee  Teparsa ", agentName: "Darunee",
    role: "Admin Live Chat", status: "Active", teamName: "Team A", password: "fixture-only", passwordKind: "temporary" };
  const normalized = names.withConsistentUserNames(original);
  assert.deepEqual(normalized, { ...original, displayName: "Darunee Teparsa", agentName: "Darunee Teparsa" });
  assert.equal(original.agentName, "Darunee");
  assert.equal(names.getUserFullName({ displayName: " ", agentName: "Agent Fullname", username: "agent" }), "Agent Fullname");
  assert.equal(names.getUserFullName({ display_name: "ชื่อ นามสกุล", agent_name: "ชื่อ" }), "ชื่อ นามสกุล");
  assert.equal(names.getUserFullName({ username: "legacy" }), "legacy");
  assert.equal(names.getUserFullName({}), "");
  assert.equal(names.getUserFullName({ displayName: "Jirapong Wongwaengnoi" }), "Jirapong Wongwangnoi");
});
await check("profile store and cached reads synchronize names while preserving all other fields", () => {
  const profiles = functions("userRoleStore.ts", ["toUserProfile", "fromUserProfile"], {
    ...names, normalizeRoleName: (role) => role, bangkokToday: () => "2026-08-28", serverTimestamp: () => "server-time",
  });
  const original = { username: "Darunee", displayName: "Darunee Teparsa", agentName: "Darunee", email: "fixture@example.com",
    role: "Admin Live Chat", status: "Active", teamLead: "Lead A", teamName: "Team A", suspendReason: "", workSim: "0812345678",
    password: "fixture-only", passwordKind: "temporary", passwordIssuedAt: "2026-08-27T00:00:00Z",
    passwordExpiresAt: "2026-09-10T00:00:00Z", createdAt: "2026-08-27T00:00:00Z", updatedAt: "2026-08-27T00:00:00Z" };
  const expected = { ...original, agentName: original.displayName };
  assert.deepEqual(profiles.toUserProfile(original), profiles.toUserProfile(expected));
  assert.deepEqual(profiles.fromUserProfile(original), profiles.fromUserProfile(expected));
  const encoded = profiles.fromUserProfile(original);
  for (const key of ["username", "role", "status", "email", "teamLead", "teamName", "password", "passwordKind", "passwordIssuedAt", "passwordExpiresAt"]) {
    assert.equal(encoded[key], original[key], key);
  }
});
await check("legacy evaluation names expand from the linked snapshot without changing keys or scores", () => {
  const original = { ...testCase, id: "Test_Dada-1787805937176", evaluationKey: "web-eval|TEST-ROUND-1_DADA|darunee|2026-08-27|123",
    caseId: "Test Round 1_Dada", agentName: "Darunee", targetDisplayName: "Darunee Teparsa", targetUsername: "Darunee" };
  for (const decoded of [store.toLocalEvaluation(original), store.toEvaluation({ ...store.toFirebaseEvaluation(original), agent_name: "Darunee" })]) {
    assert.equal(decoded.agentName, "Darunee Teparsa");
    for (const key of ["id", "evaluationKey", "caseId", "targetUsername", "isTestCase", "finalScore", "grade"]) assert.equal(decoded[key], original[key], key);
    assert.deepEqual(decoded.topics, original.topics);
    assert.deepEqual(decoded.evidenceUrls, original.evidenceUrls);
  }
  const noIds = { ...original, id: undefined, evaluationKey: undefined, recordId: undefined };
  const withoutSnapshot = { ...noIds, targetDisplayName: "Darunee" };
  assert.equal(store.toLocalEvaluation(noIds).id, store.toLocalEvaluation(withoutSnapshot).id);
  assert.equal(store.toLocalEvaluation(noIds).evaluationKey, store.toLocalEvaluation(withoutSnapshot).evaluationKey);
  assert.equal(names.getEvaluationAgentFullName({ agentName: "Legacy Agent", targetDisplayName: "Nickname" }), "Legacy Agent");
  assert.equal(names.getEvaluationAgentFullName({ agentName: "", targetUsername: "account-only" }), "");
});
await check("evaluation options use full names and old drafts resolve by exact username", () => {
  const agentOptions = [{ username: "Darunee", displayName: "Darunee Teparsa", agentName: "Darunee", role: "Admin Live Chat" },
    { username: "Darunee2", displayName: "Darunee Other", agentName: "Darunee Other", role: "Admin Live Chat" }];
  const options = value("CreateEvaluationMockup.tsx", "availableAgentOptions", { ...names, agentOptions });
  assert.equal(options.find((agent) => agent.username === "Darunee").agentName, "Darunee Teparsa");
  assert.equal(options.length, agentOptions.length);
  const select = (agentName) => value("CreateEvaluationMockup.tsx", "selectedAgentOption", { availableAgentOptions: options, agentName });
  assert.equal(select("Darunee").username, "Darunee");
  assert.equal(select("Darunee2").username, "Darunee2");
  assert.equal(select("Darunee Other").username, "Darunee2");
  assert.equal(select("Dar"), undefined);
  assert.equal(select(""), undefined);
});
await check("editing a full name synchronizes both fields but other profile edits stay isolated", () => {
  let draft = { username: "Darunee", displayName: "Darunee", agentName: "Darunee", role: "Admin Live Chat" };
  const update = value("CorporateUserDirectoryProfile.tsx", "updateAccount", { setAccountDraft: (fn) => { draft = fn(draft); } });
  update("displayName", "Darunee Teparsa");
  assert.deepEqual(draft, { username: "Darunee", displayName: "Darunee Teparsa", agentName: "Darunee Teparsa", role: "Admin Live Chat" });
  update("role", "Senior");
  assert.equal(draft.agentName, "Darunee Teparsa");
  assert.equal(draft.username, "Darunee");
  assert.equal(draft.role, "Senior");
  update("displayName", "");
  assert.equal(draft.displayName, "");
  assert.equal(draft.agentName, "");
});
await check("legacy profile logs and stored profiles agree on the same full name", () => {
  const app = functions("App.tsx", ["getProfileUpdateUsername", "buildUserProfileOverrides", "buildUserProfileOverridesFromStore", "buildEffectiveUserAccounts"], {
    ...names, normalizeRoleName: (role) => role, isUserRole: () => true, DEFAULT_TEAM_ASSIGNMENTS: {},
  });
  const profile = { username: "Darunee", displayName: "Darunee Teparsa", agentName: "Darunee", role: "Admin Live Chat", status: "Active" };
  const fromStore = app.buildUserProfileOverridesFromStore([profile]);
  const fromLog = app.buildUserProfileOverrides([{ event_type: "user_profile_saved", target_agent: "Darunee", details: profile }]);
  assert.deepEqual(fromLog, fromStore);
  const accounts = app.buildEffectiveUserAccounts([{ ...profile, password: "fixture-only" }], fromStore, {});
  assert.equal(accounts[0].agentName, "Darunee Teparsa");
  assert.equal(accounts[0].username, "Darunee");
  assert.equal(accounts[0].password, "fixture-only");
  assert.equal(accounts[0].role, "Admin Live Chat");
});
console.log(`\n${checks} identity, test-case isolation and watermark checks passed.`);
