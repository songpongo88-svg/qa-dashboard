import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {transform} from "esbuild";
const src=await readFile(new URL("../src/appealCaseEventsPartition.ts",import.meta.url),"utf8");
const js=await transform(src,{loader:"ts",format:"esm",target:"es2022"});
const {CASE_APPEAL_REQUEST_TYPES,CASE_APPEAL_OVERRIDE_TYPES,partitionCaseAppealEvents}
 =await import("data:text/javascript;base64,"+Buffer.from(js.code).toString("base64"));
assert.equal(CASE_APPEAL_REQUEST_TYPES.length,12);
assert.equal(CASE_APPEAL_OVERRIDE_TYPES.length,2);
assert.equal(new Set([...CASE_APPEAL_REQUEST_TYPES,...CASE_APPEAL_OVERRIDE_TYPES]).size,14);
const rows=[
 {id:"req",event_type:"appeal_request_submitted"},
 {id:"change",event_type:"appeal_case_override_added"},
 {id:"review",event_type:"appeal_request_reviewed"},
 {id:"removed",event_type:"appeal_case_override_removed"},
 {id:"comment",event_type:"appeal_internal_message"},
];
const {appealLogs,overrideLogs}=partitionCaseAppealEvents(rows);
assert.deepEqual(appealLogs.map(x=>x.id),["req","review"]);
assert.deepEqual(overrideLogs.map(x=>x.id),["change","removed"]);
assert.equal(appealLogs[0],rows[0]);
assert.equal(overrideLogs[0],rows[1]);
const dashboard=await readFile(new URL("../src/DashboardMockup.tsx",import.meta.url),"utf8");
const start=dashboard.indexOf("const checkAppealRequest = async () => {");
const end=dashboard.indexOf("const logs = [...appealLogs, ...overrideLogs]",start);
assert.ok(start>0&&end>start,"Selected-case check must still exist");
const block=dashboard.slice(start,end);
assert.equal(block.match(/fetchAppealEvents\(/g)?.length,1,
 "Selected case must perform only one server case query before splitting");
assert.ok(block.includes("forceRefresh: true"),"Never cache stale case authorization history");
assert.ok(block.includes("caseId: caseItem.caseId"),"Case reads must stay scoped");
assert.ok(block.includes("partitionCaseAppealEvents(caseEvents)"),"Projections must remain separate");
console.log("PASS selected case Appeal: one force-refreshed server snapshot, separate request and Late Appeal projections");
