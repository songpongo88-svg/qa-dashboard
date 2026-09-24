import assert from 'node:assert/strict';
import fs from 'node:fs';
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
