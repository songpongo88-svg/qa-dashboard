import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { transform } from "esbuild";

const source = await fs.readFile(new URL("../src/coachingActivityChanges.ts", import.meta.url), "utf8");
const code = (await transform(source, { loader: "ts", format: "esm", target: "es2022" })).code;
const { changedCoachingFields, coachingActorLabel } =
  await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

const action = {id:"a1",topic:"Process",issue:"",plan:"Follow SOP",owner:"Senior",
  dueDate:"2026-11-25",expectedResult:"",followUpNote:"",status:"Not Started"};
const prior = {qaSummary:"Investigate",recommendedTopics:["Process"],coachName:"Senior",
  appointment:{date:"2026-11-16",startTime:"09:00",duration:60,method:"Face to Face",participants:["Agent"],agenda:["Process"],note:""},
  actualCoaching:{date:"2026-11-16",startTime:"10:00",endTime:"11:00",topics:["Process"],note:"",finalNote:"Summary",noPlanReason:""},
  actions:[action],qaReviewComment:"",attachments:[],averageScore:89,evaluatedCases:10,criticalErrors:0};
const after = structuredClone(prior);
after.qaSummary = "Investigate and follow up";
after.appointment.date = "2026-11-18";
after.actions[0].plan = "Follow SOP and confirm actions";
after.actions[0].dueDate = "2026-11-30";
after.actions[0].status = "In Progress";
after.qaReviewComment = "Approved";
const changes = changedCoachingFields(prior,after);
assert.ok(changes.some(c=>c.section==="QA Summary" && /เพิ่มรายละเอียด/.test(c.detail)));
assert.ok(changes.some(c=>c.section==="Appointment" && /2026-11-16 → 2026-11-18/.test(c.detail)));
assert.ok(changes.some(c=>c.section==="Action Plan: Process" && /กำหนดส่ง/.test(c.detail)));
assert.ok(changes.some(c=>c.section==="Action Plan: Process" && /แนวทางดำเนินการ/.test(c.detail)));
assert.ok(changes.some(c=>c.section==="Action Plan: Process" && /สถานะแผน/.test(c.detail)));
assert.ok(changes.some(c=>c.section==="QA Review"));
assert.deepEqual(changedCoachingFields(prior,structuredClone(prior)),[]);
const withAdded = structuredClone(prior);
withAdded.actions.push({...action,id:"a2",topic:"SLA"});
assert.ok(changedCoachingFields(prior,withAdded).some(c=>c.section==="Action Plan: SLA" && /เพิ่ม Action Plan/.test(c.detail)));
const withRemoved = structuredClone(prior);
withRemoved.actions=[];
assert.ok(changedCoachingFields(prior,withRemoved).some(c=>/ลบ Action Plan/.test(c.detail)));
const withTopics = structuredClone(prior);
withTopics.recommendedTopics=["SLA"];
assert.ok(changedCoachingFields(prior,withTopics).some(c=>/เพิ่ม: SLA/.test(c.detail)&&/ลบ: Process/.test(c.detail)));
assert.equal(coachingActorLabel("Songpon Phothong","Quality Assurance"),"Songpon Phothong (QA)");
assert.equal(coachingActorLabel("Chachiya Thawiwong","Senior"),"Chachiya Thawiwong (Senior)");
assert.equal(coachingActorLabel("Unknown", "Assigned Coach"),"Unknown (Senior)");
assert.equal(coachingActorLabel("","Senior"),"ไม่พบข้อมูลผู้ดำเนินการ");
const store = await fs.readFile(new URL("../src/coachingStore.ts", import.meta.url),"utf8");
const ui = await fs.readFile(new URL("../src/MonthlyCoachingWorkspace.tsx", import.meta.url),"utf8");
assert.ok(store.includes("changedCoachingFields(previous, next)"));
assert.ok(store.includes("previous.status === next.status && changes.length === 0"));
assert.ok(store.includes("note: eventNote, changes,"));
assert.ok(ui.includes("Coaching Status History"));
assert.ok(ui.includes("events.slice(0, 7)"));
assert.ok(!ui.includes("if (!events.length) return null"));
assert.ok(ui.includes("Keep the history heading visible"));
assert.ok(ui.includes("{events.length} รายการ"));
assert.ok(!ui.includes("สถานะปัจจุบัน:"));
assert.ok(!ui.includes("ข้อมูลย้อนหลัง"));
assert.ok(!ui.includes("coachingHistoryGroups(event)"),"History contains statuses, not full long field summaries");
assert.ok(ui.includes("QA Action Plan review decisions"));
assert.ok(ui.includes("disabled={busy||blocked||!allowed.includes('QA Reviewed')}"));
assert.ok(ui.includes("disabled={busy||blocked||!allowed.includes('Follow-up Next Month')}"));
assert.ok(!ui.includes("savedSections.map(section => <li"));
assert.ok(!ui.includes("['Accept Action Plan','Follow-up Next Month'],['Request Plan Revision','QA Reviewed']"));
assert.ok(ui.includes("coachingHistoryTitle(event)"));
console.log("PASS Coaching Status History: actor roles, exact changed topics and dates, no-op saves, newest-first UI");
