import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function loadTypeScript(file) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  }}).outputText;
  const exports = {};
  Function('exports', js)(exports);
  return exports;
}

const { RUBRIC_VERSIONS } = loadTypeScript('../src/lib/rubricVersions.ts');
const { deductionOptions, deductionTotal, deductionError, deductionPointOptions, subtopicDeductionStatuses, topicScoreForDate, usesAutomaticDeductionScoring, buildDeductionAnalysis } = loadTypeScript('../src/lib/evaluation/deductionTags.ts');
const topic = RUBRIC_VERSIONS.find(item => item.code === 'QA-2026-08').topics[0];
const [process, ...otherOptions] = deductionOptions(topic);
assert.equal(otherOptions.length, 6);
const tags = [{ subtopic: process, points: 12 }, { subtopic: otherOptions[3], points: 6 }];
assert.equal(deductionTotal(tags), 18);
assert.equal(deductionError(topic, 12, tags), '');
assert.match(deductionError(topic, 13, tags), /18.*17/);
assert.match(deductionError(topic, 12, []), /18/);
assert.match(deductionError(topic, 12, [{ subtopic: process, points: 12 }, { subtopic: process, points: 6 }]), /ซ้ำ/);
assert.match(deductionError(topic, 12, [{ subtopic: process, points: 12 }, { subtopic: 'Unlisted', points: 6 }]), /เลือก/);
assert.match(deductionError(topic, 12, [{ subtopic: process, points: 12 }, { subtopic: otherOptions[3], points: null }]), /จำนวนเต็ม/);
assert.deepEqual(deductionOptions(RUBRIC_VERSIONS[0].topics[0]), [RUBRIC_VERSIONS[0].topics[0].title]);
assert.equal(usesAutomaticDeductionScoring('2026-09-30'), false, 'September retains manual scores');
assert.equal(usesAutomaticDeductionScoring('2026-10-01'), true, 'October starts deduction scoring');
assert.equal(topicScoreForDate(topic, 20, '2026-09-30'), 20);
assert.equal(topicScoreForDate(topic, null, '2026-10-01'), 30, 'no deduction gives full score');
assert.equal(topicScoreForDate(topic, 20, '2026-10-01', tags), 12, 'saved manual score is ignored once October deductions apply');
assert.equal(deductionPointOptions(topic, tags, 0).at(-1), 24, 'point dropdown only offers remaining points after other deductions');
assert.equal(deductionPointOptions(topic, [{ subtopic: process, points: 5 }], 0, 10).at(-1), 10, 'historical tagged edits respect manually selected deduction total');
assert.equal(deductionError(topic, 20, [], false), '', 'historical untagged scores stay editable');
assert.match(deductionError(topic, 20, [{ subtopic: process, points: 5 }], false), /5.*10/, 'optional historical tags must still reconcile with the manual score');
const taggedStatuses = subtopicDeductionStatuses(topic, 12, tags);
assert.equal(taggedStatuses.find(row => row.subtopic === process).status, 'deducted');
assert.equal(taggedStatuses.find(row => row.subtopic === process).points, 12);
assert.equal(taggedStatuses.find(row => row.subtopic === otherOptions[0]).status, 'not_deducted');
assert.ok(subtopicDeductionStatuses(topic, topic.max).every(row => row.status === 'not_deducted'));
assert.ok(subtopicDeductionStatuses(topic, 12).every(row => row.status === 'unknown'), 'missing historical tags do not mean zero deduction');
assert.equal(subtopicDeductionStatuses(topic, 12, [{ subtopic: process, points: 12 }]).find(row => row.subtopic === otherOptions[0]).status, 'unknown');

const rows = [
  { caseId: 'AA1', agentName: 'Agent A', auditDate: '2026-09-01', qaScheme: 'QA-2026-08', topics: [{ code: topic.code, title: topic.title, score: 12, max: 30, deductions: tags }] },
  { caseId: 'AA2', agentName: 'Agent B', auditDate: '2026-09-02', qaScheme: 'QA-2026-08', topics: [{ code: topic.code, title: topic.title, score: 18, max: 30, deductions: [{ subtopic: process, points: 12 }] }] },
  { caseId: 'AA3', agentName: 'Agent C', auditDate: '2026-09-03', qaScheme: 'QA-2026-08', topics: [{ code: topic.code, title: topic.title, score: 30, max: 30 }] },
  { caseId: 'AA5', agentName: 'Agent E', auditDate: '2026-09-05', qaScheme: 'QA-2026-08', topics: [{ code: topic.code, title: topic.title, score: 18, max: 30 }] },
  { caseId: '', agentName: 'Agent D', auditDate: '2026-09-04', qaScheme: 'QA-2026-08', evaluationType: 'no_case_month', topics: [{ code: topic.code, title: topic.title, deductions: tags }] },
];
const analysis = buildDeductionAnalysis(rows, RUBRIC_VERSIONS);
assert.equal(analysis.detailRows.length, 3);
assert.equal(analysis.summaryRows[0]['Deducted Points'], 24);
assert.equal(analysis.summaryRows[0]['Share of Tagged Deducted Points (%)'], 80);
assert.equal(analysis.summaryRows[0]['Cases With This Deduction (%)'], 66.67);
assert.equal(analysis.summaryRows[1]['Deducted Points'], 6);
assert.equal(analysis.summaryRows[1]['Share of Tagged Deducted Points (%)'], 20);
assert.equal(analysis.summaryRows[1]['Evaluated Cases'], 4);
assert.equal(analysis.summaryRows[1]['Known Status Cases'], 3);
assert.equal(analysis.summaryRows[1]['Not Deducted Cases'], 2);
assert.equal(analysis.statusRows.filter(row => row['Case ID'] === 'AA3' && row['Deduction Status'] === 'Not Deducted').length, 7);
assert.equal(analysis.statusRows.filter(row => row['Case ID'] === 'AA5' && row['Deduction Status'] === 'Unknown').length, 7);
const mixedRubric = buildDeductionAnalysis([...rows, {
  caseId: 'AA4', agentName: 'Agent D', auditDate: '2026-02-01', qaScheme: 'QA-2026-01-02',
  topics: [{ code: '1', title: 'Older opening criterion' }],
}], RUBRIC_VERSIONS);
assert.equal(mixedRubric.summaryRows[0]['Cases With This Deduction (%)'], 66.67, 'case percentages use eligible cases in the same rubric');
const storeSource = fs.readFileSync(new URL('../src/evaluationStore.ts', import.meta.url), 'utf8');
const syntaxTree = ts.createSourceFile('evaluationStore.ts', storeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const storeParser = syntaxTree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'toTopics');
assert.ok(storeParser, 'stored evaluations must parse their topic deductions');
const parserJs = ts.transpileModule(`${storeParser.getText()}\nexport { toTopics };`, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
}}).outputText;
const parsedExports = {};
Function('exports', parserJs)(parsedExports);
const restored = parsedExports.toTopics(JSON.parse(JSON.stringify([{ code: '1', max: 30, score: 12, deductions: tags }])));
assert.deepEqual(restored[0].deductions, tags);
assert.deepEqual(parsedExports.toTopics([{ code: '1', score: 15 }])[0].deductions, [], 'old records still open');
console.log('PASS deduction tags, score consistency and case/point percentages');
