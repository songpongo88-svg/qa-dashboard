import type { StoredCoachingRecord } from "./coachingStore";

// These are fields still present in the saved Coaching document. They are NOT
// historical Save-button events or earlier revisions of those fields.
export type CoachingSavedField = { label: string; value: string };
export type CoachingSavedSection = { key: string; title: string; fields: CoachingSavedField[] };

const asText = (value: unknown): string =>
  typeof value === "string" ? value.trim() :
  typeof value === "number" && Number.isFinite(value) ? String(value) : "";

const joinTexts = (values: unknown): string =>
  Array.isArray(values) ? values.map(asText).filter(Boolean).join(" • ") : "";

const add = (fields: CoachingSavedField[], label: string, value: unknown) => {
  const text = asText(value);
  if (text) fields.push({ label, value: text });
};

// Display source dates exactly as recorded, without converting a meeting
// date or due date into a Save timestamp.
export function coachingSavedSections(record?: StoredCoachingRecord): CoachingSavedSection[] {
  if (!record) return [];
  const sections: CoachingSavedSection[] = [];
  const put = (key: string, title: string, fields: CoachingSavedField[]) => {
    if (fields.length) sections.push({ key, title, fields });
  };

  const summary: CoachingSavedField[] = [];
  add(summary, "QA Summary", typeof record.qaSummary === "string" ?
    record.qaSummary : record.generalFeedback);
  add(summary, "หัวข้อ Coaching ที่แนะนำ", joinTexts(record.recommendedTopics));
  add(summary, "ข้อเสนอแนะ QA เดิม", record.coachingRecommendation);
  put("qa-summary", "QA สรุปและแนะนำหัวข้อ Coaching", summary);

  const meeting = record.appointment;
  const appointment: CoachingSavedField[] = [];
  add(appointment, "วันที่นัดหมาย", meeting?.date);
  add(appointment, "เวลาเริ่มนัดหมาย", meeting?.startTime);
  if (meeting?.date && Number.isFinite(meeting.duration) && meeting.duration > 0)
    add(appointment, "ระยะเวลา", `${meeting.duration} นาที`);
  if (meeting?.date || meeting?.startTime) add(appointment, "ช่องทาง", meeting?.method);
  add(appointment, "ลิงก์ประชุม", meeting?.url);
  add(appointment, "รายละเอียดช่องทาง", meeting?.other);
  add(appointment, "ผู้ Coaching ที่เลือก", record.coachName || record.seniorName);
  add(appointment, "ผู้เข้าร่วมเพิ่มเติม", joinTexts(meeting?.participants));
  add(appointment, "Agenda", joinTexts(meeting?.agenda));
  add(appointment, "หมายเหตุนัดหมาย", meeting?.note);
  put("appointment", "นัดหมาย Coaching", appointment);

  const result = record.actualCoaching;
  const resultFields: CoachingSavedField[] = [];
  add(resultFields, "วันที่ Coaching จริง", result?.date);
  add(resultFields, "เวลาเริ่มจริง", result?.startTime);
  add(resultFields, "เวลาสิ้นสุดจริง", result?.endTime);
  add(resultFields, "หัวข้อที่พูดคุย", joinTexts(result?.topics));
  add(resultFields, "บันทึกการพูดคุย", result?.note);
  add(resultFields, "Final Coaching Note", result?.finalNote);
  add(resultFields, "เหตุผลที่ไม่มี Action Plan", result?.noPlanReason);
  add(resultFields, "บันทึกผล Coaching เดิม", record.additionalNote);
  put("coaching-result", "ผล Coaching โดยผู้ Coaching", resultFields);

  const actionFields: CoachingSavedField[] = [];
  const actions = Array.isArray(record.actions) ? record.actions : [];
  actions.forEach((action, index) => {
    const number = index + 1;
    add(actionFields, `หัวข้อแผน ${number}`, action.topic);
    add(actionFields, `ปัญหาที่พบ ${number}`, action.issue);
    add(actionFields, `Action Plan ${number}`, action.plan);
    add(actionFields, `ผู้รับผิดชอบ ${number}`, action.owner);
    add(actionFields, `กำหนดส่ง ${number}`, action.dueDate);
    add(actionFields, `ผลที่คาดหวัง ${number}`, action.expectedResult);
    add(actionFields, `บันทึกติดตาม ${number}`, action.followUpNote);
    add(actionFields, `สถานะแผน ${number}`, action.status);
  });
  // Older Coaching documents can have a free-text plan instead of actions[].
  if (!actions.length) {
    add(actionFields, "Action Plan เดิม", record.actionPlan);
    if (record.agreedActionPlan !== record.actionPlan)
      add(actionFields, "แผนที่ตกลงร่วมกัน", record.agreedActionPlan);
  }
  add(actionFields, "วันติดตามผล", record.followUpDate);
  put("action-plan", "Action Plan ที่บันทึกไว้", actionFields);

  const review: CoachingSavedField[] = [];
  add(review, "QA Review Comment", record.qaReviewComment);
  put("qa-review", "QA Review", review);

  return sections;
}
