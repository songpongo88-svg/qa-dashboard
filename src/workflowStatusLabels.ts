// Display labels only. Persisted workflow codes remain compatible with older records.
export const WORKFLOW_STATUS = Object.freeze({
  notStarted: 'Not Started', draft: 'Draft', evaluating: 'Evaluation in Progress',
  editing: 'Editing in Progress', submitted: 'Submitted', awaitingReview: 'Awaiting QA Review',
  appealDraft: 'Appeal Draft', awaitingApproval: 'Awaiting QA Approval',
  activationPending: 'Access Activation Pending', awaitingAdditional: 'Awaiting Additional Submission',
  additionalReview: 'Additional Appeal Under Review', approved: 'Approved',
  partiallyApproved: 'Partially Approved', rejected: 'Rejected',
  additionalRejected: 'Additional Appeal Request Rejected', additionalCancelled: 'Additional Appeal Cancelled',
  additionalExpired: 'Additional Appeal Expired', appealExpired: 'Appeal Expired',
  appealInProgress: 'Appeal in Progress', appealReset: 'Appeal Reset',
  verificationFailed: 'Score Verification Failed', awaitingAcknowledgment: 'Awaiting Acknowledgment',
  awaitingSignatures: 'Awaiting Signatures', readyForPayment: 'Ready for Payment',
});
export const APPEAL_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  All: 'All Statuses', Pending: WORKFLOW_STATUS.awaitingReview, Draft: WORKFLOW_STATUS.appealDraft,
  'Request Additional Appeal': WORKFLOW_STATUS.awaitingApproval,
  'Awaiting Additional Submission': WORKFLOW_STATUS.awaitingAdditional,
  'Pending (Additional)': WORKFLOW_STATUS.additionalReview, 'Approved (Access)': WORKFLOW_STATUS.activationPending,
  'Additional Request Rejected': WORKFLOW_STATUS.additionalRejected,
  Approved: WORKFLOW_STATUS.approved, Rejected: WORKFLOW_STATUS.rejected,
  'Partially Approved': WORKFLOW_STATUS.partiallyApproved,
  'Cancelled (Additional)': WORKFLOW_STATUS.additionalCancelled,
  'Expired (Additional)': WORKFLOW_STATUS.additionalExpired, Reset: WORKFLOW_STATUS.appealReset,
});
export const COACHING_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  Draft: WORKFLOW_STATUS.draft, 'Waiting Appointment': 'Awaiting Appointment',
  'Appointment Scheduled': 'Appointment Scheduled', 'Waiting Senior': 'Awaiting Coach Feedback',
  'Coaching In Progress': 'Coaching in Progress', 'Action Plan Submitted': 'Awaiting QA Plan Review',
  'QA Reviewed': 'Action Plan Revision Required', 'Follow-up Next Month': 'Follow-up Next Month',
  Closed: 'Closed', 'No Coaching Required': 'No Coaching Required',
  'Coaching แล้ว': 'Coaching Completed', Coached: 'Coaching Completed', Completed: 'Completed',
});
const LEGACY_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'รอ QA พิจารณา': WORKFLOW_STATUS.awaitingReview, 'รอผลพิจารณา': WORKFLOW_STATUS.awaitingReview,
  'รอผลการพิจารณา': WORKFLOW_STATUS.awaitingReview, 'รอพิจารณา': WORKFLOW_STATUS.awaitingReview,
  'รอผลพิจารณาอุทธรณ์': WORKFLOW_STATUS.awaitingReview,
  'รอ QA อนุมัติยื่นเพิ่ม': WORKFLOW_STATUS.awaitingApproval, 'รอ QA อนุมัติสิทธิ์': WORKFLOW_STATUS.awaitingApproval,
  'อนุมัติแล้ว · รอเปิดสิทธิ์': WORKFLOW_STATUS.activationPending,
  'อนุมัติแล้ว · รอ Admin ยื่นเพิ่ม': WORKFLOW_STATUS.awaitingAdditional,
  'ยื่นเพิ่มแล้ว · รอ QA พิจารณา': WORKFLOW_STATUS.additionalReview,
  'ดึงกลับแก้ไข': WORKFLOW_STATUS.appealDraft, 'ฉบับร่าง': WORKFLOW_STATUS.draft,
  'อนุมัติผลอุทธรณ์': WORKFLOW_STATUS.approved, 'อนุมัติผลบางหัวข้อ': WORKFLOW_STATUS.partiallyApproved,
  'ไม่อนุมัติผลอุทธรณ์': WORKFLOW_STATUS.rejected, 'ไม่อนุญาตให้ยื่นเพิ่ม': WORKFLOW_STATUS.additionalRejected,
  'ยกเลิกรอบเพิ่มเติม': WORKFLOW_STATUS.additionalCancelled,
  'หมดเวลายื่นเพิ่มเติม': WORKFLOW_STATUS.additionalExpired, 'หมดเวลายื่นอุทธรณ์เพิ่มเติม': WORKFLOW_STATUS.additionalExpired,
  'หมดเวลาอุทธรณ์': WORKFLOW_STATUS.appealExpired, 'รีเซ็ตอุทธรณ์': WORKFLOW_STATUS.appealReset,
  'รอบอุทธรณ์ยังไม่สิ้นสุด': WORKFLOW_STATUS.appealInProgress,
  'ตรวจสอบผลอุทธรณ์ไม่สำเร็จ': WORKFLOW_STATUS.verificationFailed,
  'กำลังประเมิน': WORKFLOW_STATUS.evaluating, 'กำลังประเมินเคสของคุณ': WORKFLOW_STATUS.evaluating,
  'อยู่ระหว่างประเมินเคส': WORKFLOW_STATUS.evaluating,
  'กำลังแก้ไข': WORKFLOW_STATUS.editing, 'กำลังแก้ไขผล QA': WORKFLOW_STATUS.editing,
  'อยู่ระหว่างแก้ไขเคส': WORKFLOW_STATUS.editing,
  'รอยืนยันรับทราบผล': WORKFLOW_STATUS.awaitingAcknowledgment,
  'รอลงนาม': WORKFLOW_STATUS.awaitingSignatures, 'พร้อมจ่าย': WORKFLOW_STATUS.readyForPayment,
});
export function appealStatusLabel(status: string): string {
  return APPEAL_STATUS_LABELS[status] || LEGACY_STATUS_LABELS[status] || status;
}
export function coachingStatusText(status?: string): string {
  return COACHING_STATUS_LABELS[status || ''] || LEGACY_STATUS_LABELS[status || ''] || status || 'Not Created';
}
export function evaluationStatusLabel(status: string, editing = false, evaluating = false): string {
  if (editing) return WORKFLOW_STATUS.editing;
  if (evaluating && status !== 'Submitted') return WORKFLOW_STATUS.evaluating;
  return LEGACY_STATUS_LABELS[status] || status;
}
export function formatCaseCount(count: number): string {
  return `${count} ${count === 1 ? 'case' : 'cases'}`;
}
const STATUS_TONES: Readonly<Record<string, string>> = Object.freeze({
  [WORKFLOW_STATUS.evaluating]: 'sky', [WORKFLOW_STATUS.editing]: 'sky',
  [WORKFLOW_STATUS.awaitingReview]: 'amber', [WORKFLOW_STATUS.awaitingApproval]: 'amber',
  [WORKFLOW_STATUS.additionalReview]: 'amber', [WORKFLOW_STATUS.awaitingSignatures]: 'amber',
  [WORKFLOW_STATUS.awaitingAcknowledgment]: 'amber', [WORKFLOW_STATUS.appealInProgress]: 'amber',
  [WORKFLOW_STATUS.activationPending]: 'violet', [WORKFLOW_STATUS.awaitingAdditional]: 'violet',
  [WORKFLOW_STATUS.approved]: 'emerald', [WORKFLOW_STATUS.partiallyApproved]: 'emerald',
  [WORKFLOW_STATUS.submitted]: 'emerald', [WORKFLOW_STATUS.readyForPayment]: 'emerald',
  [WORKFLOW_STATUS.rejected]: 'rose', [WORKFLOW_STATUS.additionalRejected]: 'rose',
  [WORKFLOW_STATUS.verificationFailed]: 'rose',
});
const TONE_CLASSES: Readonly<Record<string, string>> = Object.freeze({
  sky: 'border-sky-200 bg-sky-50 text-sky-800', amber: 'border-amber-200 bg-amber-50 text-amber-800',
  violet: 'border-violet-200 bg-violet-50 text-violet-800', emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rose: 'border-rose-200 bg-rose-50 text-rose-800', slate: 'border-slate-200 bg-slate-50 text-slate-700',
});
const TEXT_CLASSES: Readonly<Record<string, string>> = Object.freeze({
  sky: 'text-sky-700', amber: 'text-amber-700', violet: 'text-violet-700',
  emerald: 'text-emerald-700', rose: 'text-rose-700', slate: 'text-slate-700',
});
export function workflowStatusTone(label: string): string { return TONE_CLASSES[STATUS_TONES[label] || 'slate']; }
export function workflowStatusTextTone(label: string): string { return TEXT_CLASSES[STATUS_TONES[label] || 'slate']; }
