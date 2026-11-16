import type { CoachingActivityEvent, StoredCoachingRecord } from "./coachingStore";

// Legacy Coaching records have timestamps, but no historical status-transition log.
// Display only source-backed milestones and never infer when a button was clicked.
export type CoachingTimelineDisplayEvent = CoachingActivityEvent & {
  legacySource?: string;
};

function validTimestamp(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function actualCoachingEnd(record: StoredCoachingRecord) {
  const meeting = record.actualCoaching;
  if (!meeting || !/^\d{4}-\d{2}-\d{2}$/.test(meeting.date || "") ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(meeting.endTime || "")) return "";
  return validTimestamp(`${meeting.date}T${meeting.endTime}:00+07:00`);
}

export function coachingTimelineEvents(record?: StoredCoachingRecord): CoachingTimelineDisplayEvent[] {
  if (!record) return [];
  const recorded: CoachingTimelineDisplayEvent[] = (record.activityTimeline || [])
    .filter(e => Boolean(validTimestamp(e.occurredAt)) && e.action)
    .map(e => ({ ...e, occurredAt: validTimestamp(e.occurredAt) }));
  const firstRecordedTime = recorded.length
    ? Math.min(...recorded.map(e => Date.parse(e.occurredAt)))
    : Number.POSITIVE_INFINITY;
  const legacy: CoachingTimelineDisplayEvent[] = [];

  const addLegacy = (source: string, action: string, timeValue: string, note: string, actorName = "") => {
    const when = validTimestamp(timeValue);
    if (!when || Date.parse(when) >= firstRecordedTime ||
        recorded.some(e => e.occurredAt === when)) return;
    legacy.push({
      id: `legacy:${source}:${when}`,
      action, occurredAt: when,
      actorId: "", actorName, actorRole: "",
      fromStatus: "", toStatus: "", revision: 0,
      note, legacySource: source,
    });
  };

  addLegacy("createdAt", "Coaching Record Created", record.createdAt,
    "วันเวลาสร้างรายการที่บันทึกไว้เดิม ไม่ใช่เวลาที่กดส่งให้ Senior");
  addLegacy("actualCoaching", "Actual Coaching End", actualCoachingEnd(record),
    "เวลาสิ้นสุดการ Coaching จริงตามข้อมูลที่ Senior กรอก ไม่ใช่เวลา Submit Action Plan");
  addLegacy("qaReviewedAt", "QA Accepted (Saved Timestamp)", record.qaReviewedAt || "",
    "เวลารับรอง QA ที่บันทึกไว้เดิม ไม่สามารถแยกเวลา Accept ทุกครั้งได้",
    record.qaReviewedBy || "");
  addLegacy("qaClosedAt", "QA Closed (Saved Timestamp)", record.qaClosedAt || "",
    "เวลาปิด Coaching ที่ระบบมีบันทึกไว้", record.qaClosedBy || "");
  if (!recorded.length) {
    const updatedTime = validTimestamp(record.updatedAt);
    if (updatedTime && !legacy.some(e => e.occurredAt === updatedTime)) {
      addLegacy("updatedAt", "Coaching Record Last Updated", record.updatedAt,
        "เวลาบันทึกแก้ไขล่าสุด ไม่สามารถยืนยันว่าเป็นเวลาที่กด Request Revision หรือ Submit");
    }
  }
  return [...legacy, ...recorded].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
}
