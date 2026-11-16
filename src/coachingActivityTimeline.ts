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

function explicitSavedQaEvent(
  record: StoredCoachingRecord, action: "QA Accepted" | "Closed",
  timestamp: unknown, actor: unknown, field: "qaReviewedAt" | "qaClosedAt",
  alreadyLogged: CoachingActivityEvent[]
): CoachingActivityEvent | null {
  // Unlike generic updatedAt or meeting times, these fields are written when
  // QA accepts/closes a Coaching record. They are reliable partial history.
  if (typeof timestamp !== "string" || !timestamp.includes("T") ||
      typeof actor !== "string" || !actor.trim()) return null;
  const parsedTime = Date.parse(timestamp);
  if (!Number.isFinite(parsedTime)) return null;
  const occurredAt = new Date(parsedTime).toISOString();
  if (alreadyLogged.some(event =>
    Math.abs(Date.parse(event.occurredAt) - parsedTime) < 2_000 &&
    (event.action === action ||
      (action === "QA Accepted" &&
        (event.action === "QA Review Updated" || event.action === "Closed")))
  )) return null;
  return {
    id: `saved-field:${field}:${occurredAt}`,
    action, occurredAt, actorId: "", actorName: actor.trim(), actorRole: "QA",
    fromStatus: "", toStatus: "", revision: 0, note: "",
    changes: [],
  };
}

export function coachingTimelineEvents(record?: StoredCoachingRecord): CoachingActivityEvent[] {
  if (!record) return [];
  // Primary source: append-only audit entries written by successful saves.
  const recorded = Array.isArray(record.activityTimeline) ? record.activityTimeline : [];
  const events = recorded.filter(event => {
    if (!event || !event.actorName?.trim() || !event.action || !event.occurredAt) return false;
    if (!Number.isFinite(Date.parse(event.occurredAt))) return false;
    const hasChanges = Boolean(event.changes?.some(change => change.section && change.detail));
    const statusChanged = Boolean(event.fromStatus && event.toStatus && event.fromStatus !== event.toStatus);
    return hasChanges || statusChanged || event.action === "QA Review Updated";
  });
  // Earlier records contain exact QA approval/close time and reviewer, even
  // before activityTimeline existed. Restore ONLY these explicit milestones.
  const accepted = explicitSavedQaEvent(record, "QA Accepted",
    record.qaReviewedAt, record.qaReviewedBy, "qaReviewedAt", events);
  const closed = explicitSavedQaEvent(record, "Closed",
    record.qaClosedAt, record.qaClosedBy, "qaClosedAt", events);
  if (accepted) events.push(accepted);
  if (closed) events.push(closed);
  // Do NOT infer a submit, appointment save, revision, or Close from generic
  // createdAt/updatedAt, status, Coaching meeting dates, or review text.
  // Stored events are append-only; retain that insertion order for equal timestamps
  // instead of lexically comparing numeric event IDs (e.g. 10 vs 9).
  return events.map((event,index) => ({event,index}))
    .sort((a,b) => Date.parse(b.event.occurredAt) - Date.parse(a.event.occurredAt) || b.index - a.index)
    .map(item => item.event);
}
