import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { transform } from "esbuild";

const source = await fs.readFile(new URL("../src/coachingActivityTimeline.ts", import.meta.url), "utf8");
const transpiled = await transform(source, {loader:"ts", format:"esm", target:"es2022"});
const moduleUrl = "data:text/javascript;base64," + Buffer.from(transpiled.code).toString("base64");
const { coachingTimelineEvents } = await import(moduleUrl);
const sample = {
  createdAt: "2026-11-11T09:00:00Z",
  updatedAt: "2026-11-16T04:00:00Z",
  actualCoaching: {date:"2026-11-12",endTime:"14:15"},
  qaReviewedAt: "2026-11-14T03:00:00Z",
  qaReviewedBy: "QA Reviewer",
  status: "QA Reviewed",
  qaReviewComment: "Please revise",
  activityTimeline: [],
};
const oldEvents = coachingTimelineEvents(sample);
assert.deepEqual(oldEvents.map(e=>e.action), [
  "Coaching Record Created", "Actual Coaching End",
  "QA Accepted (Saved Timestamp)", "Coaching Record Last Updated"
]);
assert.equal(oldEvents.length, 4);
assert.equal(oldEvents[1].occurredAt,"2026-11-12T07:15:00.000Z");
assert.equal(oldEvents[2].actorName,"QA Reviewer");
assert.ok(oldEvents.every(e=>e.legacySource),"old data must be visibly labeled as historical");
assert.ok(!oldEvents.some(e=>/Revision Requested|Action Plan Submitted/.test(e.action)),
  "never fabricate exact historic Revision or Submit timestamps");
assert.deepEqual(coachingTimelineEvents({...sample,createdAt:"bad",updatedAt:"",qaReviewedAt:"",actualCoaching:{date:"2026-11-12",endTime:"99:00"}}),[]);
const withNew = coachingTimelineEvents({...sample,activityTimeline:[
  {id:"a",action:"Revision Requested",occurredAt:"2026-11-15T10:00:00Z",
   actorId:"qa",actorName:"QA",actorRole:"Quality Assurance",fromStatus:"Action Plan Submitted",
   toStatus:"QA Reviewed",revision:1,note:"Revise"}
]});
assert.equal(withNew.at(-1).action,"Revision Requested");
assert.equal(withNew.filter(e=>e.action==="Coaching Record Last Updated").length,0,
  "updatedAt should not duplicate known event history");
assert.equal(withNew.length,4,"three old milestones plus one logged transition");
const preexisting = coachingTimelineEvents({...sample,
  createdAt:"2026-11-15T10:00:00Z",
  qaReviewedAt:"2026-11-15T10:00:00Z",
  actualCoaching:{date:"2026-11-15",endTime:"17:00"},
  activityTimeline:[{
    id:"a",action:"QA Accepted",occurredAt:"2026-11-15T10:00:00Z",
    actorId:"qa",actorName:"QA",actorRole:"Quality Assurance",
    fromStatus:"Action Plan Submitted",toStatus:"Follow-up Next Month",revision:0,note:""
  }]
});
assert.equal(preexisting.filter(e=>e.occurredAt==="2026-11-15T10:00:00.000Z").length,1);
console.log("PASS Coaching timeline: accurate legacy timestamps, time-zone conversion, no invented Revision/Submit times, no duplicate new events");
