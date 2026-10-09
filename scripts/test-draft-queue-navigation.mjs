import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { draftQueueIsolationPatch } from '../build/draftQueueIsolationPatch.js';

const path = new URL('../src/CreateEvaluationMockup.tsx', import.meta.url);
const source = fs.readFileSync(path, 'utf8');
// The workspace prebuild puts Submit Evaluation on one JSX line before Vite runs.
const afterPrebuild = source.replace(
  /onClick=\{submitEvaluation\}\s+disabled=\{Boolean\(missingScoreTopics\.length\)\}/,
  'onClick={submitEvaluation} disabled={Boolean(missingScoreTopics.length)}',
);
const transformed = draftQueueIsolationPatch().transform(afterPrebuild, path.pathname)?.code;
assert.ok(transformed, 'production transform must succeed');

const backLabel = transformed.indexOf('Back to Form', transformed.indexOf('Saved Draft Cases'));
const buttonStart = transformed.lastIndexOf('<button', backLabel);
const backButton = backLabel >= 0 && buttonStart >= 0 ? transformed.slice(buttonStart, transformed.indexOf('</button>', backLabel) + 9) : '';
assert.ok(backButton, 'Draft Queue Back to Form button must exist');
assert.match(backButton, /onClick=\{\(\) => setWorkspaceView\("form"\)\}/);
assert.doesNotMatch(backButton, /resetEvaluationForm|loadDraftIntoForm/, 'returning from Draft Queue must preserve unsaved text');
assert.match(transformed, /onClick=\{\(\) => \{ loadDraftIntoForm\(draft\); setWorkspaceView\("form"\); \}\}/, 'Open Draft may intentionally replace the form');
console.log('PASS Draft Queue Back to Form preserves unfinished form');

// Render the production Draft Queue JSX with the imports from the same module.
// The previous navigation-only check missed a missing scoring-helper import.
const syntax = ts.createSourceFile('CreateEvaluationMockup.tsx', transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let queue;
function findQueue(node) {
  if (ts.isConditionalExpression(node) && node.condition.getText(syntax) === 'workspaceView === "drafts"') queue = node.whenTrue;
  ts.forEachChild(node, findQueue);
}
findQueue(syntax);
assert.ok(queue, 'production Draft Queue JSX must be found');
const scoringImports = syntax.statements.filter(node => ts.isImportDeclaration(node) &&
  ['/lib/rubricVersions', '/lib/evaluation/deductionTags'].some(suffix => node.moduleSpecifier.text.endsWith(suffix)))
  .map(node => node.getText(syntax)).join('\n');
const temporary = await mkdtemp(resolve('.draft-queue-render-test-'));
try {
  const output = resolve(temporary, 'queue.mjs');
  await build({ stdin: { contents: `${scoringImports}
    export {getRubricForDate};
    const isTestCaseEvaluation=()=>false;
    const makeDraftId=(caseId,auditDate)=>caseId+'::'+auditDate;
    const setWorkspaceView=()=>{};
    const loadDraftIntoForm=()=>{};
    const deleteDraft=()=>{};
    export default function DraftQueueFixture({draftInbox,draftQueueLoading=false}) {
      return (${queue.getText(syntax)});
    }`, loader: 'tsx', resolveDir: resolve('src') }, outfile: output,
    bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', logLevel: 'silent' });
  const { default: DraftQueue, getRubricForDate } = await import(pathToFileURL(output).href);
  const draft = (caseId, auditDate, scores, deductions = {}) => ({ draftId: caseId, caseId, auditDate,
    agentName: 'Fixture Agent', savedAt: '09/10/2026 16:20:00', criticalError: false,
    topicState: Object.fromEntries(getRubricForDate(auditDate).topics.map((topic, i) => [topic.code,
      { score: scores[i] ?? null, comment: 'ข้อความฉบับร่างเดิม', deductions: deductions[i] || [] }])) });
  const september = draft('AA991001', '2026-09-30', [15, 10, 22, 20]);
  const october = draft('AA991002', '2026-10-01', [0, 0, 0, 0], {
    0: [{ subtopic: 'Fixture process', points: 12 }], 1: [{ subtopic: 'Fixture answer', points: 6 }],
  });
  const critical = { ...october, caseId: 'AA991003', draftId: 'AA991003', criticalError: true };
  const incomplete = draft('AA991004', '2026-09-30', []);
  const inbox = [september, october, critical, incomplete];
  const original = structuredClone(inbox);
  const markup = renderToStaticMarkup(React.createElement(DraftQueue, { draftInbox: inbox }));
  for (const [caseId, score] of [['AA991001', 67], ['AA991002', 82], ['AA991003', 0], ['AA991004', 0]]) {
    const card = markup.slice(markup.indexOf(caseId), markup.indexOf('Open Draft', markup.indexOf(caseId)));
    assert.ok(card.includes(`${score}/100`), `${caseId}: saved score is rendered without crashing`);
  }
  assert.deepEqual(inbox, original, 'reading Draft Queue must not change draft scores, notes or deductions');
  assert.ok(renderToStaticMarkup(React.createElement(DraftQueue, { draftInbox: [] })).includes('Saved Draft Cases'));
  console.log('PASS production Draft Queue cards render September manual scores, October deductions, Critical Error and incomplete drafts without modifying saved data');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
