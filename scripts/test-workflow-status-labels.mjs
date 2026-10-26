import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { qaEvaluationProgressPatch } from '../build/qaEvaluationProgressPatch.js';

function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
}
function load(file, deps = {}) {
  const exports = {};
  Function('require', 'exports', compile(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8')))(name => {
    if (name === 'react') return React;
    if (name in deps) return deps[name];
    throw Error('Unexpected dependency ' + name);
  }, exports);
  return exports;
}
const labels = load('src/workflowStatusLabels.ts');
const identity = load('src/lib/agentIdentity.ts');
const activityModel = load('src/evaluationActivity.ts', { './workflowStatusLabels': labels, './lib/agentIdentity': identity });
const activityContext = load('src/EvaluationActivityContext.tsx');
const workflow = load('src/appealWorkflow.ts', { './workflowStatusLabels': labels, './lib/agentIdentity': identity });
const english = value => assert.doesNotMatch(value, /[\u0e00-\u0e7f]/);
for (const status of workflow.APPEAL_WORKFLOW_STATUSES) {
  assert.ok(labels.APPEAL_STATUS_LABELS[status]);
  english(workflow.appealWorkflowLabel(status));
}
Object.values(labels.COACHING_STATUS_LABELS).forEach(english);
assert.equal(labels.appealStatusLabel('รอผลการพิจารณา'), 'Awaiting QA Review');
assert.equal(labels.appealStatusLabel('ยื่นเพิ่มแล้ว · รอ QA พิจารณา'), 'Additional Appeal Under Review');
assert.equal(labels.coachingStatusText('Coaching แล้ว'), 'Coaching Completed');
assert.equal(labels.coachingStatusText(), 'Not Created');
assert.equal(labels.evaluationStatusLabel('Draft', true), 'Editing in Progress');
assert.equal(labels.evaluationStatusLabel('Draft'), 'Draft');
assert.equal(labels.evaluationStatusLabel('Not Started', false, true), 'Evaluation in Progress');
assert.equal(labels.evaluationStatusLabel('Submitted', false, true), 'Submitted');
assert.notEqual(labels.appealStatusLabel('Additional Request Rejected'), labels.appealStatusLabel('Rejected'));
assert.equal(labels.formatCaseCount(1), '1 case');
assert.equal(labels.formatCaseCount(2), '2 cases');
for (const [status, tone] of [['Pending', 'amber'], ['Awaiting Additional Submission', 'violet'], ['Partially Approved', 'emerald']]) {
  assert.match(workflow.appealWorkflowTone(status), new RegExp('text-' + tone));
}
assert.match(labels.workflowStatusTone(labels.WORKFLOW_STATUS.verificationFailed), /text-rose/);
assert.match(labels.workflowStatusTone(labels.WORKFLOW_STATUS.editing), /text-sky/);
console.log('PASS canonical and legacy English labels, distinct workflow stages, counts and semantic colors');

const pending = load('src/pendingAppealScore.ts', { './workflowStatusLabels': labels, './lib/agentIdentity': identity, './appealWorkflow': workflow, './evaluationActivity': activityModel });
const cases = [
  { agent: 'Fixture Agent', caseId: 'QA123', monthKey: '2026-09', finalScore: 92 },
  { agent: 'Fixture Agent', caseId: 'QA124', monthKey: '2026-09', finalScore: 88 },
  { agent: 'Fixture Agent', caseId: 'QA125', monthKey: '2026-10', finalScore: 95 },
];
const held = pending.withAppealScoreState(cases, [{ agent: 'Fixture Agent', caseId: 'QA123', status: 'Pending', auditDate: '2026-09-12' }]);
assert.equal(pending.getAppealScoreHold(held.slice(0, 2)).label, 'Awaiting QA Review');
assert.match(pending.getAppealScoreHold(held.slice(0, 2)).message, /1 case pending/);
assert.equal(pending.getAppealScoreHold(held.slice(2)), null, 'another audit month remains available');
assert.deepEqual(held.map(row => row.finalScore), [92, 88, 95], 'display holds preserve the saved scores');
assert.equal(pending.getAppealScoreHold(pending.withAppealScoreState(cases, null)).label, 'Score Verification Failed');
const appSource = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const inboxStart = appSource.indexOf('      for (const item of appealRequests) {');
const inboxEnd = appSource.indexOf('      const v8CaseUploadTasks', inboxStart);
assert.ok(inboxStart >= 0 && inboxEnd > inboxStart);
const inboxFactory = `function inbox(appealRequests) {
  const currentUser={username:'agent-a',displayName:'Fixture Agent',agentName:'Fixture Agent'},readIds=[],nextTasks=[];
  ${appSource.slice(inboxStart, inboxEnd)}
  return nextTasks;
}`;
const inbox = Function('scopeAppealRequests', 'appealWorkflowStatus', 'appealWorkflowLabel', 'WORKFLOW_STATUS', 'formatInboxDateTime',
  compile(inboxFactory) + ';return inbox;')(workflow.scopeAppealRequests, workflow.appealWorkflowStatus, workflow.appealWorkflowLabel, labels.WORKFLOW_STATUS, value => value);
for (const [status, extra, expected] of [
  ['Rejected', { additionalAccessRequest: { requestId: 'access', status: 'Pending', requestedAt: '', topics: ['1'] } }, 'Awaiting QA Approval'],
  ['Rejected', { additionalAccessRequest: { requestId: 'access', status: 'Rejected', requestedAt: '', topics: ['1'], decisionReason: 'เหตุผลจาก QA' } }, 'Additional Appeal Request Rejected'],
  ['Rejected', { additionalRound: { roundId: 'round', openedAt: new Date().toISOString(), submitted: false, topics: [{ code: '1' }], expiresAt: new Date(Date.now() + 3600000).toISOString() } }, 'Awaiting Additional Submission'],
]) {
  const request = { requestId: 'fixture', caseId: 'QA123', agent: 'Fixture Agent', status, ...extra };
  const before = structuredClone(request);
  const [task] = inbox([request]);
  assert.equal(task.badge, expected); english(task.badge);
  if (task.mailTemplate) assert.equal(task.mailTemplate.status, expected);
  assert.deepEqual(request, before, 'Inbox only projects display labels');
}
console.log('PASS real month-scoped score holds and App Inbox projections with unchanged stored statuses/scores');

const dom = new JSDOM('<div id="root"></div>', { url: 'https://qa.test', pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'Event', 'CustomEvent']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const dashboardSource = fs.readFileSync(new URL('../src/DashboardMockup.tsx', import.meta.url), 'utf8');
const dashboardTree = ts.createSourceFile('DashboardMockup.tsx', dashboardSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const badgeDeclaration = dashboardTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'CaseAppealStatusBadge');
assert.ok(badgeDeclaration);
const CaseBadge = Function('React', 'WORKFLOW_STATUS', 'appealWorkflowLabel', 'workflowStatusTone', compile(badgeDeclaration.getText(dashboardTree)) + ';return CaseAppealStatusBadge;')(React, labels.WORKFLOW_STATUS, workflow.appealWorkflowLabel, labels.workflowStatusTone);
const rows = new Map(), listeners = new Map(), writes = [];
const snapshot = key => ({ exists: () => rows.has(key), data: () => rows.get(key) });
function emit(key) { for (const callback of listeners.get(key) || []) callback(snapshot(key)); for (const callback of listeners.get('*') || []) callback(); }
const firestore = {
  doc: (_db, ...parts) => parts.join('/'), serverTimestamp: () => '<server>',
  async setDoc(key, value) { rows.set(key, { ...rows.get(key), ...value }); writes.push(value); emit(key); },
  async getDoc(key) { return snapshot(key); },
  async deleteDoc(key) { rows.delete(key); emit(key); },
  async runTransaction(db,callback){return callback({get:async key=>snapshot(key),delete:key=>{rows.delete(key);emit(key)}})},
  onSnapshot(key, callback) {
    const callbacks = listeners.get(key) || new Set(); callbacks.add(callback); listeners.set(key, callbacks);
    callback(snapshot(key)); return () => callbacks.delete(callback);
  },
};
const store = load('src/qaEvaluationProgressStore.ts', { 'firebase/firestore': firestore, './firebaseClient': { firebaseDb: {} }, './evaluationActivity': activityModel });
const Notice = load('src/QaEvaluationProgressNotice.tsx', { './workflowStatusLabels': labels, './qaEvaluationProgressStore': store, './EvaluationActivityContext': activityContext, './evaluationActivity': activityModel }).default;
const AppealNotice = load('src/AppealWorkflowNotice.tsx', { './appealWorkflow': workflow }).default;
const root = createRoot(document.getElementById('root'));
try {
  for (const [props, expected] of [
    [{ status: 'Pending' }, 'Awaiting QA Review'],
    [{ status: 'Approved' }, 'Approved'],
    [{ status: 'Rejected', additional: { submitted: false } }, 'Awaiting Additional Submission'],
    [{ status: 'Rejected', additional: { submitted: true } }, 'Additional Appeal Under Review'],
  ]) {
    await act(async () => root.render(React.createElement(CaseBadge, props)));
    const badge = document.querySelector('[data-case-appeal-status]');
    assert.equal(badge.textContent, expected);
    assert.equal(badge.dataset.caseAppealStatus, props.additional ? 'additional' : props.status, 'DOM identity keeps raw workflow codes');
  }
  console.log('PASS actual Case Detail badge normalizes display while retaining raw decision props');
  for (const status of workflow.APPEAL_WORKFLOW_STATUSES) {
    const request = { requestId: 'fixture', caseId: 'QA123', agent: 'Fixture Agent', status,
      ...(status === 'Additional Request Rejected' ? { additionalAccessRequest: { status: 'Rejected', requestedAt: '', reason: 'เหตุผลอุทธรณ์ที่ผู้ใช้งานกรอก' } } : {}) };
    await act(async () => root.render(React.createElement(AppealNotice, { request, canReview: true, isOwner: true, busy: false, onCaseDetail() {}, onDecision() {}, onReview() {} })));
    const section = document.querySelector('[aria-label="Current Appeal Status"]');
    assert.equal(section.firstElementChild.textContent, workflow.appealWorkflowLabel(status));
    english(section.firstElementChild.textContent);
    if (status === 'Additional Request Rejected') assert.ok(section.textContent.includes('เหตุผลอุทธรณ์ที่ผู้ใช้งานกรอก'));
  }
  console.log('PASS real appeal status notices and unchanged user-entered reasons');

  let timerId = 0;
  const timers = new Map();
  window.setInterval = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; };
  window.clearInterval = id => timers.delete(id);
  const source = fs.readFileSync(new URL('../src/CreateEvaluationMockup.tsx', import.meta.url), 'utf8');
  const patched = qaEvaluationProgressPatch().transform.call({ error: message => { throw Error(message); } }, source, '/src/CreateEvaluationMockup.tsx').code;
  const start = patched.indexOf('  const qaEvaluationProgressContextRef =');
  const end = patched.indexOf('  useEffect(() => {\n    let cancelled = false;\n    setAgentQuotaLoading(true);', start);
  assert.ok(start >= 0 && end > start);
  const publisherSource = `function Publisher({editing=false}) {
    const {useEffect,useRef}=React;
    const selectedMonthKey='2026-10',monthlyResult={editable:true},workspaceView='form',evaluationStatus='Draft',isTestCase=false,caseId='AA123';
    const agentName='Fixture Agent',selectedAgentOption={username:'agent-a',agentName,displayName:agentName,role:'Admin Live Chat'},selectedAgentCaseCount=3;
    const agentQuotaStatus={text:'In Progress · 3/10 cases'},currentUser={username:'qa-fixture',displayName:'QA Fixture'},activeSubmittedRecordId=editing?'saved-case':'';
    ${patched.slice(start, end)}
    return null;
  }`;
  const Publisher = Function('React', 'setQaEvaluationProgress', 'clearQaEvaluationProgress', compile(publisherSource) + ';return Publisher;')(React, store.setQaEvaluationProgress, store.clearQaEvaluationProgress);
  const Harness = ({ editing = false, username = 'agent-a' }) => {
    const [revision,setRevision]=React.useState(0);
    React.useEffect(()=>{const callback=()=>setRevision(value=>value+1);const callbacks=listeners.get('*')||new Set();callbacks.add(callback);listeners.set('*',callbacks);callback();return()=>callbacks.delete(callback)},[]);
    const value={ready:true,error:false,now:Date.now(),records:[...rows].map(([id,row])=>activityModel.normalizeEvaluationActivity(row,id)).filter(Boolean)};
    return React.createElement(activityContext.EvaluationActivityContext.Provider,{value},React.createElement(Publisher,{editing}),React.createElement(Notice,{currentUser:{username}}));
  };
  await act(async () => root.render(React.createElement(Harness)));
  let key = [...rows.keys()].find(key=>key.startsWith('qa_evaluation_progress/active::'));
  assert.equal(rows.get(key).mode, 'evaluation');
  assert.ok(document.querySelector('[data-qa-evaluation-status="evaluating"]'));
  assert.match(document.querySelector('[role="status"]').textContent, /Evaluation in Progress/);
  await act(async () => root.render(React.createElement(Harness, { editing: true })));
  key = [...rows.keys()].find(key=>rows.get(key).mode==='edit');
  assert.equal(rows.get(key).mode, 'edit', 'same selected agent publishes the edit mode immediately');
  assert.match(document.querySelector('[role="status"]').textContent, /Editing in Progress/);
  english(document.querySelector('[role="status"]').textContent);
  const heartbeat = [...timers.values()].find(timer => timer.delay === 30_000);
  assert.ok(heartbeat);
  await act(async () => heartbeat.callback());
  assert.equal(writes.at(-1).mode, 'edit', 'heartbeat uses the latest edit state');
  await act(async () => root.render(React.createElement(Harness, { editing: true, username: 'other-agent' })));
  assert.equal(document.querySelector('[role="status"]'), null, 'progress does not bleed into another account');
  const legacy = { ...rows.get(key) }; delete legacy.mode; rows.set(key, legacy);
  await act(async () => root.render(React.createElement(Notice, { currentUser: { username: 'agent-a' } })));
  // Unmounting Publisher clears its progress. Restore a legacy document without mode.
  const legacyKey='qa_evaluation_progress/agent-a';rows.set(legacyKey, legacy);
  await act(async () => emit(legacyKey));
  assert.ok(document.querySelector('[data-qa-evaluation-status="evaluating"]'), 'legacy progress defaults to evaluation');
  await act(async () => root.unmount());
  assert.equal(timers.size, 0, 'all heartbeat and notice timers clean up');
  console.log('PASS actual injected publisher, Firestore progress store and notice: evaluation/edit transition, fresh heartbeat, legacy rows, account switch and cleanup');
} catch (error) {
  await act(async () => root.unmount());
  throw error;
}
