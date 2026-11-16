import type { CoachingAction, CoachingAppointment, CoachingResult } from "./monthlyCoachingModel";
import type { StoredCoachingRecord } from "./coachingStore";

export type CoachingFieldChange = { section: string; detail: string };

type AuditRecord = Pick<StoredCoachingRecord,
  "qaSummary" | "recommendedTopics" | "coachId" | "coachName" | "appointment" |
  "actualCoaching" | "actions" | "qaReviewComment" | "attachments" |
  "averageScore" | "evaluatedCases" | "criticalErrors">;

const str = (value: unknown): string => String(value ?? "").trim();
const display = (value: unknown) => {
  const text = str(value).replace(/\s+/g, " ");
  return text ? (text.length > 80 ? text.slice(0, 77) + "..." : text) : "—";
};

function textChange(before: unknown, after: unknown): string {
  const oldText = str(before), newText = str(after);
  if (oldText === newText) return "";
  if (!oldText) return "เพิ่มข้อความ";
  if (!newText) return "ลบข้อความ";
  return newText.startsWith(oldText) ? "เพิ่มรายละเอียด" : "แก้ไขข้อความ";
}

function valueChange(before: unknown, after: unknown): string {
  const oldText = str(before), newText = str(after);
  if (oldText === newText) return "";
  if (!oldText) return `กำหนดเป็น ${display(newText)}`;
  if (!newText) return `ลบค่าเดิม (${display(oldText)})`;
  return `${display(oldText)} → ${display(newText)}`;
}

function listChange(before: unknown, after: unknown): string {
  const oldValues = Array.isArray(before) ? [...new Set(before.map(str).filter(Boolean))] : [];
  const newValues = Array.isArray(after) ? [...new Set(after.map(str).filter(Boolean))] : [];
  const add = newValues.filter(value => !oldValues.includes(value));
  const remove = oldValues.filter(value => !newValues.includes(value));
  const changes: string[] = [];
  if (add.length) changes.push(`เพิ่ม: ${add.map(display).join(", ")}`);
  if (remove.length) changes.push(`ลบ: ${remove.map(display).join(", ")}`);
  return changes.join(" · ");
}

export function changedCoachingFields(
  previous: AuditRecord | null | undefined, next: AuditRecord
): CoachingFieldChange[] {
  const changes: CoachingFieldChange[] = [];
  const add = (section: string, detail: string) => {
    if (detail) changes.push({ section, detail });
  };
  const field = (section: string, label: string, before: unknown, after: unknown, kind: "text" | "value" | "list" = "text") => {
    const detail = kind === "list" ? listChange(before, after)
      : kind === "value" ? valueChange(before, after) : textChange(before, after);
    add(section, `${label} — ${detail}`.replace(/ — $/, ""));
  };
  field("QA Summary", "สรุปผล QA", previous?.qaSummary, next.qaSummary);
  field("Coaching Topics", "หัวข้อที่แนะนำ", previous?.recommendedTopics, next.recommendedTopics, "list");
  field("Assigned Coach", "ผู้ Coaching", previous?.coachName || previous?.coachId,
    next.coachName || next.coachId, "value");

  const appointmentFields: { key: keyof CoachingAppointment; label: string; kind: "text" | "value" | "list" }[] = [
    { key: "date", label: "วันที่นัดหมาย", kind: "value" },
    { key: "startTime", label: "เวลาเริ่ม", kind: "value" },
    { key: "duration", label: "ระยะเวลา (นาที)", kind: "value" },
    { key: "method", label: "ช่องทางนัดหมาย", kind: "value" },
    { key: "url", label: "ลิงก์นัดหมาย", kind: "text" },
    { key: "other", label: "รายละเอียดช่องทาง", kind: "text" },
    { key: "participants", label: "ผู้เข้าร่วม", kind: "list" },
    { key: "agenda", label: "Agenda", kind: "list" },
    { key: "note", label: "บันทึกนัดหมาย", kind: "text" },
  ];
  for (const item of appointmentFields) {
    field("Appointment", item.label,
      previous?.appointment?.[item.key], next.appointment?.[item.key], item.kind);
  }

  const resultFields: { key: keyof CoachingResult; label: string; kind: "text" | "value" | "list" }[] = [
    { key: "date", label: "วันที่ Coaching จริง", kind: "value" },
    { key: "startTime", label: "เวลาเริ่มจริง", kind: "value" },
    { key: "endTime", label: "เวลาสิ้นสุดจริง", kind: "value" },
    { key: "topics", label: "หัวข้อที่คุยจริง", kind: "list" },
    { key: "note", label: "Coaching Note", kind: "text" },
    { key: "finalNote", label: "Final Coaching Note", kind: "text" },
    { key: "noPlanReason", label: "เหตุผลที่ไม่ต้องทำแผน", kind: "text" },
  ];
  for (const item of resultFields) {
    field("Coaching Results", item.label,
      previous?.actualCoaching?.[item.key], next.actualCoaching?.[item.key], item.kind);
  }

  const oldActions = new Map<string, CoachingAction>(
    (previous?.actions || []).map((item, index) => [str(item.id) || `old-${index}`, item]));
  const newActions = new Map<string, CoachingAction>(
    (next.actions || []).map((item, index) => [str(item.id) || `new-${index}`, item]));
  const actionFields: { key: keyof CoachingAction; label: string; kind: "text" | "value" }[] = [
    { key: "topic", label: "หัวข้อ", kind: "value" },
    { key: "issue", label: "ปัญหาที่พบ", kind: "text" },
    { key: "plan", label: "แนวทางดำเนินการ", kind: "text" },
    { key: "owner", label: "ผู้รับผิดชอบ", kind: "value" },
    { key: "dueDate", label: "กำหนดส่ง", kind: "value" },
    { key: "expectedResult", label: "ผลที่คาดหวัง", kind: "text" },
    { key: "followUpNote", label: "บันทึกติดตาม", kind: "text" },
    { key: "status", label: "สถานะแผน", kind: "value" },
  ];
  for (const [id, nextAction] of newActions) {
    const oldAction = oldActions.get(id);
    const section = `Action Plan: ${display(nextAction.topic || oldAction?.topic || "ไม่ระบุหัวข้อ")}`;
    if (!oldAction) {
      add(section, "เพิ่ม Action Plan");
      continue;
    }
    for (const item of actionFields) {
      field(section, item.label, oldAction[item.key], nextAction[item.key], item.kind);
    }
  }
  for (const [id, oldAction] of oldActions) {
    if (!newActions.has(id)) add(`Action Plan: ${display(oldAction.topic || "ไม่ระบุหัวข้อ")}`,
      "ลบ Action Plan");
  }

  field("QA Review", "ผลตรวจรับ/ข้อเสนอแนะ", previous?.qaReviewComment,
    next.qaReviewComment);

  const oldFiles = (previous?.attachments || []).map(file => file.path || file.name);
  const newFiles = (next.attachments || []).map(file => file.path || file.name);
  if (listChange(oldFiles, newFiles)) {
    const prev = previous?.attachments || [];
    const nextList = next.attachments || [];
    const oldSet = new Set(prev.map(file => file.path || file.name));
    const newSet = new Set(nextList.map(file => file.path || file.name));
    for (const file of nextList) {
      if (!oldSet.has(file.path || file.name)) add("Attachments", `เพิ่มไฟล์: ${display(file.name)}`);
    }
    for (const file of prev) {
      if (!newSet.has(file.path || file.name)) add("Attachments", `ลบไฟล์: ${display(file.name)}`);
    }
  }

  if (previous && previous.evaluatedCases !== next.evaluatedCases) {
    field("QA Score", "จำนวนเคส", previous.evaluatedCases, next.evaluatedCases, "value");
  }
  if (previous && previous.averageScore !== next.averageScore) {
    field("QA Score", "คะแนนเฉลี่ย", previous.averageScore, next.averageScore, "value");
  }
  if (previous && previous.criticalErrors !== next.criticalErrors) {
    field("QA Score", "Critical Error", previous.criticalErrors, next.criticalErrors, "value");
  }
  return changes;
}

export function coachingActorLabel(actorName: unknown, actorRole: unknown): string {
  const name = str(actorName);
  if (!name) return "ไม่พบข้อมูลผู้ดำเนินการ";
  const role = str(actorRole);
  const shortRole = role === "Quality Assurance" ? "QA"
    : role === "Assigned Coach" ? "Senior" : role;
  return shortRole ? `${name} (${shortRole})` : name;
}
