import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { transform } from "esbuild";

const source = await fs.readFile(new URL("../src/coachingActivityTimeline.ts", import.meta.url), "utf8");
const transpiled = await transform(source, {loader:"ts", format:"esm", target:"es2022"});
const moduleUrl = "data:text/javascript;base64," + Buffer.from(transpiled.code).toString("base64");
const {coachingTimelineEvents,coachingHistoryGroups,coachingHistoryTitle} = await import(moduleUrl);

// Timestamp fields predate the audit log and MUST NEVER appear as save history.
const legacy = {
  createdAt: "2026-11-04T10:00:00Z",
  updatedAt: "2026-11-16T03:48:33Z",
  qaReviewedAt: "2026-11-16T03:48:24Z",
  qaReviewedBy: "QA Reviewer",
  status: "Closed",
  actualCoaching: {date:"2026-11-05",endTime:"14:00"},
  activityTimeline: [],
};
assert.deepEqual(coachingTimelineEvents(legacy),[],
  "no synthetic Created/Last Updated/Coaching Completed/QA Accepted/Closed events");
const real = {
  id:"logged",action:"QA Accepted",occurredAt:"2026-11-16T03:48:24Z",
  actorId:"qa-1",actorName:"Songpon Phothong",actorRole:"QA",
  fromStatus:"Action Plan Submitted",toStatus:"Follow-up Next Month",
  note:"",revision:0,
  changes:[
    {section:"QA Review",detail:"ผลตรวจรับ/ข้อเสนอแนะ — เพิ่มข้อความ"},
    {section:"Action Plan: SLA",detail:"กำหนดส่ง — 16/11 → 20/11"},
  ],
};
const older = {...real,id:"older",action:"Action Plan Submitted",actorName:"Senior",
  fromStatus:"Coaching In Progress",toStatus:"Action Plan Submitted",
  changes:[],occurredAt:"2026-11-13T11:00:00Z"};
const sorted = coachingTimelineEvents({...legacy,activityTimeline:[older,real]});
assert.deepEqual(sorted.map(e=>e.id),["logged","older"],"newest first");
assert.equal(coachingHistoryTitle(real),"QA Review — Accepted");
assert.equal(coachingHistoryTitle(older),"Action Plan — Submitted");
assert.deepEqual(coachingHistoryGroups(real).map(x=>x.section),["QA Review","Action Plan: SLA"]);
assert.deepEqual(coachingTimelineEvents({...legacy,activityTimeline:[{
  ...real,id:"noop",action:"Details Updated",fromStatus:"Draft",toStatus:"Draft",changes:[]
}]}),[],"same-status event without recorded changes must not be shown");
assert.deepEqual(coachingTimelineEvents({...legacy,activityTimeline:[{
  ...real,id:"no-actor",actorName:""
}]}),[],"unknown historical actors are not invented");
console.log("PASS Coaching History: only persisted actions, no synthetic legacy events, real actors, newest first");
