import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { transform } from "esbuild";

const path = new URL("../src/coachingSavedSnapshot.ts", import.meta.url);
const source = await fs.readFile(path, "utf8");
const code = (await transform(source, {loader: "ts", format: "esm", target: "es2022"})).code;
const {coachingSavedSections} = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
assert.deepEqual(coachingSavedSections(), []);
assert.deepEqual(coachingSavedSections({status:"Closed",activityTimeline:[],createdAt:"2026-11-01T10:00:00Z",updatedAt:"2026-11-15T10:00:00Z"}), [],
  "createdAt, updatedAt, status and empty form defaults are not legacy actions");
const historic = {
  id:"coaching-agent-2026-10",status:"Closed",
  qaSummary:"QA reviewed inaccurate identify",recommendedTopics:["Identify","SLA"],
  coachName:"Senior One",
  appointment:{date:"2026-11-05",startTime:"14:00",duration:60,method:"MS Teams",
    url:"https://teams.microsoft.com/example",participants:["Agent One"],agenda:["Identify"],note:"Confirm steps"},
  actualCoaching:{date:"2026-11-06",startTime:"10:00",endTime:"11:00",
    topics:["Identify"],note:"Talked through verification",finalNote:"Practice each case",noPlanReason:""},
  actions:[{id:"a1",topic:"Identify",issue:"Missing verification",plan:"Recheck",owner:"Senior One",
    dueDate:"2026-11-15",expectedResult:"Verify correctly",followUpNote:"Next month",status:"In Progress"}],
  qaReviewComment:"Accepted",
  qaReviewedAt:"2026-11-14T15:22:52Z",qaReviewedBy:"QA User",
  createdAt:"2026-11-01T10:00:00Z",updatedAt:"2026-11-15T10:00:00Z",
  activityTimeline:[],
};
const snapshot = coachingSavedSections(historic);
assert.deepEqual(snapshot.map(s=>s.key),
  ["qa-summary","appointment","coaching-result","action-plan","qa-review"]);
assert.ok(snapshot[0].fields.some(f=>f.label==="QA Summary"&&f.value.includes("identify")));
assert.ok(snapshot[1].fields.some(f=>f.label==="วันที่นัดหมาย"&&f.value==="2026-11-05"));
assert.ok(snapshot[2].fields.some(f=>f.label==="Final Coaching Note"));
assert.ok(snapshot[3].fields.some(f=>f.label==="Action Plan 1"&&f.value==="Recheck"));
assert.ok(snapshot[4].fields.some(f=>f.label==="QA Review Comment"));
assert.ok(snapshot.every(s=>s.fields.every(f=>!/(บันทึกเวลา|Save time|ผู้กด Save)/i.test(f.label))));
assert.ok(snapshot.every(s=>s.fields.every(f=>!f.value.includes("2026-11-14T15:22:52"))),
  "QA acceptance metadata belongs only to verified audit entries, not source sections");
const oldStyle = coachingSavedSections({
  generalFeedback:"Legacy manually saved note",coachingRecommendation:"Follow up",
  actionPlan:"Old plain-text action plan",agreedActionPlan:"Old approved plan",followUpDate:"2026-11-25",
});
assert.deepEqual(oldStyle.map(s=>s.key),["qa-summary","action-plan"]);
assert.ok(oldStyle[0].fields.some(f=>f.value==="Legacy manually saved note"));
assert.ok(oldStyle[1].fields.some(f=>f.value==="Old plain-text action plan"));
assert.deepEqual(coachingSavedSections({...historic,qaSummary:"",generalFeedback:"outdated legacy note"})[0].fields.find(f=>f.label==="QA Summary"),undefined,
  "an intentionally cleared QA Summary must not resurrect an old value");
const changed = {...historic,qaSummary:"Latest corrected text"};
assert.equal(coachingSavedSections(changed)[0].fields.find(f=>f.label==="QA Summary").value,
  "Latest corrected text","snapshot must show the currently saved value, not invent an earlier revision");
console.log("PASS Coaching saved sections: real Firestore values, legacy field fallback, dates are meeting/due dates not Save events");
