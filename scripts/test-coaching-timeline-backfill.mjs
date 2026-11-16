import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { transform } from "esbuild";

const source = await fs.readFile(new URL("../src/coachingActivityTimeline.ts", import.meta.url), "utf8");
const transpiled = await transform(source, {loader:"ts", format:"esm", target:"es2022"});
const moduleUrl = "data:text/javascript;base64," + Buffer.from(transpiled.code).toString("base64");
const {coachingTimelineEvents,coachingHistoryGroups,coachingHistoryTitle} = await import(moduleUrl);

const old = {
  createdAt:"2026-11-04T10:00:00Z", updatedAt:"2026-11-16T03:48:33Z",
  actualCoaching:{date:"2026-11-05",endTime:"14:00"},
  status:"Closed", qaReviewedAt:"2026-11-16T03:48:24Z",
  qaReviewedBy:"Songpon Phothong", activityTimeline:[],
};
const recoverable = coachingTimelineEvents(old);
assert.equal(recoverable.length,1, "only explicit QA accepted metadata is recoverable");
assert.equal(recoverable[0].action,"QA Accepted");
assert.equal(recoverable[0].actorName,"Songpon Phothong");
assert.equal(recoverable[0].actorRole,"QA");
assert.equal(recoverable[0].occurredAt,"2026-11-16T03:48:24.000Z");
assert.equal(coachingHistoryTitle(recoverable[0]),"QA Review — Accepted");
assert.deepEqual(coachingHistoryGroups(recoverable[0]),[]);

const closed = coachingTimelineEvents({...old,
  qaClosedAt:"2026-11-16T03:48:30Z",qaClosedBy:"Songpon Phothong"});
assert.deepEqual(closed.map(e=>e.action),["Closed","QA Accepted"]);
assert.equal(closed[0].actorName,"Songpon Phothong");
assert.equal(closed[0].occurredAt,"2026-11-16T03:48:30.000Z");

assert.deepEqual(coachingTimelineEvents({...old,qaReviewedAt:"",qaReviewedBy:""}),[],
  "generic created/updated/meeting/status fields must not become invented events");
assert.deepEqual(coachingTimelineEvents({...old,qaReviewedBy:""}),[],
  "never infer an actor without saved QA reviewer");
assert.deepEqual(coachingTimelineEvents({...old,qaReviewedAt:"2026-11-16"}),[],
  "date-only values cannot establish exact button time");

const actual = {
  id:"logged",action:"QA Accepted",occurredAt:"2026-11-16T03:48:24Z",
  actorId:"qa-1",actorName:"Songpon Phothong",actorRole:"QA",
  fromStatus:"Action Plan Submitted",toStatus:"Follow-up Next Month",
  note:"",revision:0,
  changes:[{section:"QA Review",detail:"ผลตรวจรับ/ข้อเสนอแนะ — เพิ่มข้อความ"}],
};
const older = {...actual,id:"older",action:"Action Plan Submitted",actorName:"Senior",
  fromStatus:"Coaching In Progress",toStatus:"Action Plan Submitted",
  changes:[],occurredAt:"2026-11-13T11:00:00Z"};
const sorted = coachingTimelineEvents({...old,activityTimeline:[older,actual]});
assert.deepEqual(sorted.map(e=>e.id),["logged","older"],
  "exact saved QA timestamp is deduped against an actual event and list is newest-first");
assert.deepEqual(coachingHistoryGroups(actual).map(e=>e.section),["QA Review"]);
assert.deepEqual(coachingTimelineEvents({...old,qaReviewedAt:"",qaReviewedBy:"",
  activityTimeline:[{...actual,id:"noop",action:"Details Updated",fromStatus:"Draft",toStatus:"Draft",changes:[]}]}),[],
  "no-op saves must be suppressed");
console.log("PASS Coaching History: original QA Accepted/Closed metadata restored with exact actor and time, no invented legacy steps or duplicates");
