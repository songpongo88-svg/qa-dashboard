import { canonicalAgentIdentityKey } from "./lib/agentIdentity";

export type AppealWorkflowRequest = {
  requestId: string;
  caseId: string;
  agent: string;
  status: string;
  submittedAt?: string;
  reviewedAt?: string;
  editingDraft?: boolean;
  lastAdditionalStatus?: string;
  additionalRound?: { openedAt: string; submitted: boolean; submittedAt: string; expiresAt?: string } | null;
  additionalHistory?: { openedAt: string; submittedAt: string; reviewedAt: string }[];
  additionalAccessRequest?: { status: string; requestedAt: string; decidedAt?: string } | null;
};

export const APPEAL_WORKFLOW_STATUSES = [
  "Pending", "Request Additional Appeal", "Awaiting Additional Submission",
  "Pending (Additional)", "Approved (Access)", "Additional Request Rejected",
  "Approved", "Rejected", "Partially Approved", "Cancelled (Additional)",
  "Expired (Additional)", "Reset",
] as const;

export function isAppealAwaitingReview(request: {
  status: string;
  editingDraft?: boolean;
  additionalRound?: { submitted: boolean } | null;
}): boolean {
  return !request.editingDraft &&
    (request.status === "Pending" || Boolean(request.additionalRound?.submitted));
}

export function appealWorkflowStatus(request: AppealWorkflowRequest): string {
  if (request.status === "Reset") return "Reset";
  if (request.editingDraft) return "Draft";
  if (request.additionalRound) return request.additionalRound.submitted
    ? "Pending (Additional)" : "Awaiting Additional Submission";
  const access = request.additionalAccessRequest;
  const lastOpenedAt = request.additionalHistory?.[0]?.openedAt || "";
  // An old permission request is complete once its round has opened. A later
  // request must take priority over that round's cancellation/expiry/result.
  if (access && (!lastOpenedAt || Date.parse(access.requestedAt) > Date.parse(lastOpenedAt))) {
    if (access.status === "Pending") return "Request Additional Appeal";
    if (access.status === "Rejected") return "Additional Request Rejected";
    if (access.status === "Approved") return "Approved (Access)";
  }
  return request.lastAdditionalStatus || request.status;
}

export function appealWorkflowLabel(status: string): string {
  const labels: Record<string, string> = {
    All: "ทุกสถานะ", Pending: "รอ QA พิจารณา", Draft: "ดึงกลับแก้ไข",
    "Request Additional Appeal": "รอ QA อนุมัติยื่นเพิ่ม",
    "Awaiting Additional Submission": "อนุมัติแล้ว · รอ Admin ยื่นเพิ่ม",
    "Pending (Additional)": "ยื่นเพิ่มแล้ว · รอ QA พิจารณา",
    "Approved (Access)": "อนุมัติแล้ว · รอเปิดสิทธิ์",
    "Additional Request Rejected": "ไม่อนุญาตให้ยื่นเพิ่ม",
    Approved: "อนุมัติผลอุทธรณ์", Rejected: "ไม่อนุมัติผลอุทธรณ์",
    "Partially Approved": "อนุมัติผลบางหัวข้อ",
    "Cancelled (Additional)": "ยกเลิกรอบเพิ่มเติม",
    "Expired (Additional)": "หมดเวลายื่นเพิ่มเติม", Reset: "รีเซ็ตอุทธรณ์",
  };
  return labels[status] || status;
}

export function appealWorkflowTone(status: string): string {
  if (["Pending", "Pending (Additional)", "Request Additional Appeal"].includes(status))
    return "border-amber-200 bg-amber-50 text-amber-800";
  if (["Awaiting Additional Submission", "Approved (Access)"].includes(status))
    return "border-violet-200 bg-violet-50 text-violet-800";
  if (status === "Approved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["Rejected", "Additional Request Rejected"].includes(status))
    return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function appealWorkflowActivityAt(request: AppealWorkflowRequest): string {
  const round = request.additionalRound || request.additionalHistory?.[0];
  return [request.submittedAt, request.reviewedAt, round?.openedAt, round?.submittedAt,
    request.additionalAccessRequest?.requestedAt, request.additionalAccessRequest?.decidedAt]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => (Date.parse(b) || 0) - (Date.parse(a) || 0))[0] || "";
}

export function scopeAppealRequests<T extends AppealWorkflowRequest>(requests: T[], user: {
  role?: string; agentName?: string; displayName?: string; username?: string;
} | null, allowedAgentNames: string[] | null = null, assignedRequestIds: string[] = []): T[] {
  if (!user) return [];
  if (user.role === "Quality Assurance") return requests;
  const own = canonicalAgentIdentityKey(user.agentName || user.displayName || user.username);
  const teamRole = ["Senior", "Supervisor"].includes(String(user.role || ""));
  const names = new Set((teamRole ? allowedAgentNames || [] : []).map(canonicalAgentIdentityKey));
  if (own) names.add(own);
  const assigned = new Set(teamRole ? assignedRequestIds : []);
  return requests.filter(request => names.has(canonicalAgentIdentityKey(request.agent)) || assigned.has(request.requestId));
}
