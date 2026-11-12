import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=readFileSync(new URL("../src/SummaryMockup.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/index.css",import.meta.url),"utf8");
const anchor=src.indexOf('data-analytics-agent-incentive-v92="true"');
assert.ok(anchor>=0,"Agent Performance Ranking exists");
const ranking=src.slice(anchor,anchor+12000);
const tokens=[
 'data-agent-ranking-rank-cell="true"',
 'data-agent-ranking-name-cell="true"',
 'data-agent-ranking-name-button="true"',
 'data-agent-ranking-avatar="true"',
 'data-agent-ranking-name-container="true"',
 'data-agent-ranking-name-text="true"'
];
for(const token of tokens)assert.ok(ranking.includes(token),"missing "+token);
assert.match(ranking,/\{row\.initials\}/,"initials must remain");
assert.match(ranking,/\{buildSuspendedAgentLabel\(row\.agent, accountProfiles\)\}/,"agent names must remain");
assert.match(ranking,/onClick=\{\(\) => onSelectAgent\(row\.agent\)\}/,"agent selection remains");
assert.match(css,/\[data-analytics-agent-incentive-v92\] \[data-agent-ranking-name-button\] > :not\(\[data-agent-ranking-avatar\]\):not\(\[data-agent-ranking-name-container\]\)/,"block foreign siblings only");
assert.match(css,/\[data-analytics-agent-incentive-v92\] \[data-agent-ranking-name-button\]::before/,"block injected pseudo badges");
assert.doesNotMatch(css,/\[data-agent-ranking-name-button\]\s*\{\s*display:\s*none/i,"must not hide the profile button itself");
console.log("PASS Agent Ranking: rank, initials, name and selection retained; stray injected children and pseudo-elements isolated");
