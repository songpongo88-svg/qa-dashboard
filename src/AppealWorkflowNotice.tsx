import React from "react";
import { appealWorkflowLabel, appealWorkflowStatus, appealWorkflowTone, type AppealWorkflowRequest } from "./appealWorkflow";

export default function AppealWorkflowNotice({ request, canReview, isOwner, busy, onCaseDetail, onDecision, onReview, compact = false, hideReviewAction = false }: {
  request: AppealWorkflowRequest & { additionalAccessRequest?: (AppealWorkflowRequest["additionalAccessRequest"] & { reason?: string; topics?: string[]; decisionReason?: string }) };
  canReview: boolean; isOwner: boolean; busy: boolean;
  onCaseDetail: () => void; onDecision: (approved: boolean) => void; onReview: () => void;
  compact?: boolean; hideReviewAction?: boolean;
}) {
  const status = appealWorkflowStatus(request);
  const guidance: Record<string, string> = {
    Pending: canReview ? "Review the submitted reasons and evidence, then save a decision for each topic." : "Appeal submitted. Awaiting QA Review.",
    "Request Additional Appeal": canReview ? "Review the requested topics and reasons, then approve or reject additional appeal access." : "Additional appeal access requested. Awaiting QA Approval.",
    "Awaiting Additional Submission": isOwner ? "Select Submit Additional Appeal to provide reasons and evidence within 3 days of QA approval." : "Awaiting Additional Submission from the case owner within 3 days of approval. QA review begins after submission.",
    "Pending (Additional)": canReview ? "Additional appeal submitted. Review this round’s reasons and evidence, then save the decision." : "Additional reasons and evidence submitted. Additional Appeal Under Review.",
    "Approved (Access)": canReview ? "Access Activation Pending. Activate the approved access; the 3-day window starts at the original approval time." : "Access Activation Pending. QA must activate the approved additional appeal access.",
    "Additional Request Rejected": "Additional Appeal Request Rejected. See the QA decision reason below.",
    "Cancelled (Additional)": "Additional Appeal Cancelled. Previous results and history remain available.",
    "Expired (Additional)": "Additional Appeal Expired. No additional submission was received within 3 days of approval.",
    Reset: "Appeal Reset. Open Case Detail to check appeal eligibility.",
  };
  const deadline = request.additionalRound?.expiresAt;
  return <section aria-label="Current Appeal Status" className={`${compact ? "mb-3 rounded-xl border p-3 text-xs [&_p]:text-xs [&_button]:text-xs [&_button]:px-3 [&_button]:py-2" : "my-4 rounded-2xl border p-4"} ${appealWorkflowTone(status)}`}>
    {!compact && <div className="text-sm font-extrabold">{appealWorkflowLabel(status)}</div>}
    <p className={`${compact ? "" : "mt-2 "}text-sm leading-6`}>{guidance[status] || "Review completed. Topic decisions and case history are available."}</p>
    {deadline && !request.additionalRound?.submitted ? <p className="mt-2 text-sm font-bold">Additional Submission Deadline: {new Date(deadline).toLocaleString("en-GB", { timeZone: "Asia/Bangkok", hour12: false }).replace(",", "")}</p> : null}
    {request.additionalAccessRequest?.reason && ["Request Additional Appeal", "Additional Request Rejected", "Approved (Access)"].includes(status) ? <div className="mt-2 whitespace-pre-wrap text-sm leading-6">Requested Topics: {request.additionalAccessRequest.topics?.join(", ") || "-"}<br />{request.additionalAccessRequest.reason}</div> : null}
    {status === "Additional Request Rejected" && request.additionalAccessRequest?.decisionReason ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6">QA Decision Reason: {request.additionalAccessRequest.decisionReason}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
      {canReview && status === "Request Additional Appeal" ? <>
        <button type="button" disabled={busy} onClick={() => onDecision(true)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Approve Additional Access (3 Days)</button>
        <button type="button" disabled={busy} onClick={() => onDecision(false)} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Reject Additional Access</button>
      </> : null}
      {canReview && status === "Approved (Access)" ? <button type="button" disabled={busy} onClick={() => onDecision(true)} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Activate Approved Access</button> : null}
      {canReview && !hideReviewAction && ["Pending", "Pending (Additional)"].includes(status) ? <button type="button" disabled={busy} onClick={onReview} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Review Appeal</button> : null}
      {isOwner && status === "Awaiting Additional Submission" ? <button type="button" disabled={busy} onClick={onCaseDetail} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Submit Additional Appeal</button> : null}
    </div>
  </section>;
}
