import type { CoachingActivityEvent, StoredCoachingRecord } from "./coachingStore";

const STATUS_ACTIONS: Record<string,string> = {
  "QA Prepared": "QA สรุปและแนะนำหัวข้อการ Coaching — บันทึก",
  "QA Prepared / Sent to Coach": "ส่งข้อมูล Coaching ให้ Senior",
  "Appointment Scheduled": "นัดหมาย Coaching — ยืนยันนัดหมาย",
  "Coaching Results Saved": "ผล Coaching — บันทึก",
  "Action Plan Submitted": "Action Plan — Submitted",
  "Action Plan Resubmitted": "Action Plan — Resubmitted",
  "Revision Requested": "QA Review — Revision Required",
  "QA Accepted": "QA Review — Accepted",
  "Closed": "Closed",
  "No Coaching Required": "No Coaching Required",
  "QA Review Updated": "QA Review — Updated",
};

const SECTION_NAMES: Record<string, string> = {
  "QA Summary": "QA สรุปและแนะนำหัวข้อการ Coaching",
  "Coaching Topics": "QA สรุปและแนะนำหัวข้อการ Coaching",
  "Assigned Coach": "นัดหมาย Coaching",
  "Appointment": "นัดหมาย Coaching",
  "Coaching Results": "ผล Coaching โดยผู้ Coaching",
  "QA Review": "QA Review",
  "Attachments": "เอกสารประกอบ",
  "QA Score": "ข้อมูลคะแนน QA",
};

export function coachingHistorySection(section: string): string {
  return section.startsWith("Action Plan: ") ? section : SECTION_NAMES[section] || section;
}

export type CoachingHistoryGroup = { section: string; details: string[] };

export function coachingHistoryGroups(event: CoachingActivityEvent): CoachingHistoryGroup[] {
  const groups = new Map<string, string[]>();
  (event.changes || []).forEach(change => {
    if (!change?.section || !change?.detail) return;
    const section = coachingHistorySection(change.section);
    const details = groups.get(section) || [];
    if (!details.includes(change.detail)) details.push(change.detail);
    groups.set(section, details);
  });
  return Array.from(groups, ([section, details]) => ({section, details}));
}

export function coachingHistoryTitle(event: CoachingActivityEvent): string {
  if (STATUS_ACTIONS[event.action]) return STATUS_ACTIONS[event.action];
  const groups = coachingHistoryGroups(event);
  const namedGroups = [...new Set(groups.map(g =>
    g.section.startsWith("Action Plan: ") ? "Action Plan" : g.section
  ))];
  if (namedGroups.length === 1) {
    const name = namedGroups[0];
    return `${name} — ${event.fromStatus === "Not Created" ? "บันทึก" : "อัปเดต"}`;
  }
  if (namedGroups.length > 1) return "บันทึก/อัปเดตข้อมูล Coaching";
  // Historical server-side status transitions are valid actions even when
  // their older audit entries predate field-level diffs.
  return event.action || "Coaching Updated";
}

export function coachingTimelineEvents(record?: StoredCoachingRecord): CoachingActivityEvent[] {
  // Only append-only audit events written by successful Coaching save transactions.
  // createdAt/updatedAt, actual meeting dates and qaReviewedAt aren't click events.
  const events = Array.isArray(record?.activityTimeline) ? record.activityTimeline : [];
  return events.filter(event => {
    if (!event || !event.actorName?.trim() || !event.action || !event.occurredAt) return false;
    if (!Number.isFinite(Date.parse(event.occurredAt))) return false;
    const hasChanges = Boolean(event.changes?.some(change => change.section && change.detail));
    const statusChanged = Boolean(event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus);
    // Older QA Review edits were logged before detailed field diffs existed.
    return hasChanges || statusChanged || event.action === "QA Review Updated";
  }).sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
}
