import { appealStatusLabel, workflowStatusTone } from "./workflowStatusLabels";
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

export function isAppealQaTask(request: AppealWorkflowRequest): boolean {
  return ["Pending", "Pending (Additional)", "Request Additional Appeal", "Approved (Access)"]
    .includes(appealWorkflowStatus(request));
}

export function appealWorkflowLabel(status: string): string { return appealStatusLabel(status); }

export function appealWorkflowTone(status: string): string { return workflowStatusTone(appealStatusLabel(status)); }

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
  const assigned = new Set(assignedRequestIds);
  return requests.filter(request => names.has(canonicalAgentIdentityKey(request.agent)) || assigned.has(request.requestId));
}
