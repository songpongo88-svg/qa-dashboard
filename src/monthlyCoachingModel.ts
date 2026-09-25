import { canonicalAgentIdentityKey } from './lib/agentIdentity';
import type { StoredCoachingRecord, CoachingRecordStatus } from './coachingStore';

export type CoachingAccount = { username: string; displayName: string; agentName: string; role: string; teamName?: string; teamLead?: string; status?: string };
export type CoachingAction = { id: string; topic: string; issue: string; plan: string; owner: string; dueDate: string; expectedResult: string; followUpNote: string; status: 'Not Started' | 'In Progress' | 'Completed' | 'Not Achieved' };
export type CoachingAttachment = { name: string; url: string; path: string; uploadedBy: string; uploadedAt: string };
export type CoachingAppointment = { date: string; startTime: string; duration: number; method: string; url: string; other: string; participants: string[]; agenda: string[]; note: string };
export type CoachingResult = { date: string; startTime: string; endTime: string; topics: string[]; note: string; finalNote: string; noPlanReason: string };
export type CoachingForm = { summary: string; topics: string[]; appointment: CoachingAppointment; result: CoachingResult; actions: CoachingAction[]; review: string; attachments: CoachingAttachment[] };
export const COACHING_STATUSES: CoachingRecordStatus[] = ['Draft', 'Waiting Appointment', 'Appointment Scheduled', 'Waiting Senior', 'Coaching In Progress', 'Action Plan Submitted', 'QA Reviewed', 'Follow-up Next Month', 'Closed', 'No Coaching Required'];
const preparation: CoachingRecordStatus[] = ['Draft', 'Waiting Appointment', 'Appointment Scheduled'];
const seniorEditing: CoachingRecordStatus[] = ['Waiting Senior', 'Coaching In Progress', 'QA Reviewed'];
export const sameIdentity = (a: unknown, b: unknown) => Boolean(canonicalAgentIdentityKey(a) && canonicalAgentIdentityKey(a) === canonicalAgentIdentityKey(b));
export const belongsToAgent = (account: CoachingAccount, id: unknown, name: unknown) => String(id || '').trim() ? String(id).trim().toLowerCase() === account.username.trim().toLowerCase() : [account.agentName, account.displayName, account.username].some(value => sameIdentity(value, name));
export function seniorFor(accounts: CoachingAccount[], agent: CoachingAccount) {
  const matches = accounts.filter(a => a.role === 'Senior' && a.status !== 'Suspended' && [a.username, a.displayName, a.agentName].some(value => sameIdentity(value, agent.teamLead)));
  return matches.length === 1 ? matches[0] : null;
}
export function visibleCoachingAgents(accounts: CoachingAccount[], currentUser?: CoachingAccount | null) {
  if (!currentUser) return [];
  const actor = accounts.find(a => a.username.toLowerCase() === currentUser.username.toLowerCase() && a.status !== 'Suspended');
  if (!actor || actor.role !== currentUser.role || !['Quality Assurance', 'Senior'].includes(actor.role)) return [];
  return accounts.filter(a => a.status !== 'Suspended' && ['Admin Live Chat', 'Virtual Rider'].includes(a.role) && (actor.role === 'Quality Assurance' || seniorFor(accounts, a)?.username === actor.username));
}
export const monthlyCoachingId = (username: string, month: string) => `coaching-${encodeURIComponent(username.trim().toLowerCase())}-${month}`;
export const currentCoachingMonth = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).format(new Date());
export function blankCoachingForm(): CoachingForm {
  return { summary: '', topics: [], appointment: { date: '', startTime: '', duration: 60, method: 'Face to Face', url: '', other: '', participants: [], agenda: [''], note: '' }, result: { date: '', startTime: '', endTime: '', topics: [], note: '', finalNote: '', noPlanReason: '' }, actions: [], review: '', attachments: [] };
}
export function formFromRecord(record?: StoredCoachingRecord | null): CoachingForm {
  const empty = blankCoachingForm();
  if (!record) return empty;
  return { summary: record.qaSummary || record.generalFeedback || record.mainIssues || '', topics: record.recommendedTopics || [], appointment: { ...empty.appointment, ...record.appointment }, result: { ...empty.result, ...record.actualCoaching }, actions: record.actions || [], review: record.qaReviewComment || '', attachments: record.attachments || [] };
}
export function allowedCoachingStatuses(role: string, record?: StoredCoachingRecord | null): CoachingRecordStatus[] {
  if (role === 'Senior') return record && seniorEditing.includes(record.status) ? ['Coaching In Progress', 'Action Plan Submitted'] : [];
  if (role !== 'Quality Assurance') return [];
  if (!record || preparation.includes(record.status)) return [...preparation, 'Waiting Senior', 'No Coaching Required'];
  if (record.status === 'Action Plan Submitted') return ['Follow-up Next Month', 'QA Reviewed'];
  if (['Follow-up Next Month', 'Coached', 'Completed'].includes(record.status)) return ['Closed'];
  return [];
}
export function restoreCoachingForm(record: StoredCoachingRecord | undefined, draft: CoachingForm | null, role: string) {
  const saved = formFromRecord(record);
  if (!draft) return saved;
  const allowed = allowedCoachingStatuses(role, record);
  if (role === 'Quality Assurance') return { ...saved, ...(allowed.includes('Draft') ? { summary: draft.summary ?? saved.summary, topics: draft.topics || saved.topics, appointment: { ...saved.appointment, ...draft.appointment }, attachments: draft.attachments || saved.attachments } : {}), ...(allowed.includes('QA Reviewed') ? { review: draft.review ?? saved.review } : {}) };
  return allowed.includes('Coaching In Progress') ? { ...saved, result: { ...saved.result, ...draft.result }, actions: draft.actions || saved.actions, attachments: draft.attachments || saved.attachments } : saved;
}
export function mergeMonthlyCoachingSave(previous: StoredCoachingRecord | null, next: StoredCoachingRecord, role: string): StoredCoachingRecord {
  if (!previous) return next;
  const merged = { ...previous, agentId: previous.agentId || next.agentId, seniorId: previous.seniorId || next.seniorId, seniorName: previous.seniorName || previous.coachedBy || next.seniorName, teamId: previous.teamId || previous.team || next.teamId, status: next.status, updatedAt: next.updatedAt };
  if (role === 'Senior') return { ...merged, actualCoaching: next.actualCoaching, actions: next.actions, coachingDate: next.actualCoaching?.date || previous.coachingDate, attachments: next.attachments };
  if (preparation.includes(previous.status)) return { ...merged, qaSummary: next.qaSummary, recommendedTopics: next.recommendedTopics, appointment: next.appointment, attachments: next.attachments, evaluatedCases: next.evaluatedCases, averageScore: next.averageScore, grade: next.grade, criticalErrors: next.criticalErrors, caseReferences: next.caseReferences, topicSnapshot: next.topicSnapshot };
  return { ...merged, qaReviewComment: next.qaReviewComment };
}
export function coachingSaveError(role: string, previous: StoredCoachingRecord | null, next: StoredCoachingRecord) {
  if (!allowedCoachingStatuses(role, previous).includes(next.status)) return 'สถานะเปลี่ยนแล้ว หรือบัญชีนี้ไม่มีสิทธิ์ทำรายการ กรุณาโหลดข้อมูลล่าสุด';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(next.monthKey)) return 'กรุณาเลือกเดือนและปี';
  if (next.status === 'Waiting Senior' && (!next.qaSummary?.trim() || !next.recommendedTopics?.length || !next.seniorId)) return 'กรุณาระบุ QA Summary หัวข้อ Coaching และ Senior ผู้ดูแลก่อนส่ง';
  if (['Appointment Scheduled', 'Waiting Senior'].includes(next.status)) {
    const meeting = next.appointment;
    if (!meeting?.date || !meeting.startTime || !Number.isFinite(meeting.duration) || meeting.duration <= 0 || meeting.duration > 1440) return 'กรุณาระบุวัน เวลา และระยะเวลานัดหมายให้ครบ';
    if (meeting.method === 'MS Teams') { try { if (new URL(meeting.url).protocol !== 'https:') return 'กรุณาระบุลิงก์ประชุมแบบ https'; } catch { return 'กรุณาระบุลิงก์ประชุม MS Teams'; } }
    if (meeting.method === 'Other' && !meeting.other.trim()) return 'กรุณาระบุรายละเอียดช่องทางนัดหมาย';
  }
  if (next.status === 'QA Reviewed' && !next.qaReviewComment?.trim()) return 'กรุณาระบุเหตุผลที่ส่งคืน Senior';
  if (next.status === 'Action Plan Submitted') {
    const result = next.actualCoaching;
    if (!result?.date || !result.startTime || !result.endTime || result.endTime <= result.startTime || !result.finalNote.trim()) return 'กรุณาระบุวันที่ เวลาเริ่ม–สิ้นสุด และ Senior Final Note ให้ครบ';
    const topics = previous?.recommendedTopics || [];
    const actions = next.actions || [];
    if (actions.some(a => !topics.includes(a.topic) || !a.plan.trim() || !a.owner.trim() || !a.dueDate)) return 'กรุณากรอกหัวข้อ แผน ผู้รับผิดชอบ และกำหนดส่งให้ครบ';
    if (topics.some(topic => !actions.some(a => a.topic === topic)) && !result.noPlanReason.trim()) return 'กรุณากรอก Action Plan ทุกหัวข้อ หรือระบุเหตุผลที่ไม่ต้องทำแผน';
    if (!result.topics.length && !result.noPlanReason.trim()) return 'กรุณาเลือกหัวข้อที่คุยจริง';
  }
  return '';
}
export function coachingEndTime(start: string, duration: number) {
  if (!start || !Number.isFinite(duration)) return '';
  const [h, m] = start.split(':').map(Number); const total = h * 60 + m + duration;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}${total >= 1440 ? ' (+1 วัน)' : ''}`;
}
export function followUpLabel(current: { percentage: number; deductedCases: number }, previous?: { percentage: number }, hadPlan?: boolean) {
  if (!hadPlan) return current.deductedCases ? 'New Issue' : '';
  if (previous && current.percentage > previous.percentage + 0.5) return 'Improved';
  if (current.deductedCases) return 'Still Needs Improvement';
  return 'No Change';
}
