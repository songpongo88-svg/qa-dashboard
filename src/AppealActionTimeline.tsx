import React from "react";
import { AppealEvidenceGallery } from "./AppealEvidence";
import { appealEvidenceStartIndex } from "./appealEvidenceNaming";
import { RichTextContent } from "./richText";
import type { AppealAction, AppealActionReview } from "./appealActionHistory";

function dateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium", hour12: false,
  }).format(date);
}

function ReviewResult({ review, topicCode, caseId, compact = false }: { review: AppealActionReview; topicCode?: string; caseId?: string; compact?: boolean }) {
  const selected = review.topics.filter(topic => !topicCode || topic.code === topicCode);
  return <div className={compact ? "space-y-3 border-t border-dashed border-slate-200 pt-4" : "space-y-3 rounded-2xl border border-violet-200 bg-violet-50 p-4"}>
    <div className="text-xs font-semibold text-violet-800">QA: {review.reviewedBy || "-"} · {dateTime(review.reviewedAt)}</div>
    {selected.map(topic => <div key={topic.code}>
      {!topicCode && <div className="font-bold text-slate-800">Topic {topic.code} {topic.label}</div>}
      <div className={`text-sm font-bold ${topic.decision === "Rejected" ? "text-rose-700" : "text-emerald-700"}`}>
        {topic.decision || "รอ QA พิจารณา"} · คะแนน {topic.decision === "Approved" ? topic.revisedScore ?? topic.score : topic.score} / {topic.max}
      </div>
      <div className="mt-2 text-xs font-bold text-violet-700">{topic.decision === "Rejected" ? "Reject Reason" : "Revised Comment"}</div>
      <RichTextContent value={topic.decision === "Rejected" ? topic.rejectReason : topic.revisedComment} className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800" fallback="-" />
      <AppealEvidenceGallery images={topic.qaEvidenceImages || []} caseId={caseId} startIndex={review.topics.reduce((total, item) => total + (item.evidenceImages?.length || 0), 0) + appealEvidenceStartIndex(review.topics.map(item => ({ code: item.code, evidenceImages: item.qaEvidenceImages || [] })), topic.code)} />
    </div>)}
    <div className="border-t border-violet-200 pt-2 text-xs leading-6 text-violet-900">
      <div className="font-bold">คะแนนรวมหลังพิจารณา {review.finalScore.toFixed(2)} / 100</div>
      <div className="whitespace-pre-wrap break-words">Review Summary: {review.reviewSummary || "-"}</div>
    </div>
  </div>;
}

export function AppealActionReviewHistory({ reviews, topicCode, caseId }: { reviews: readonly AppealActionReview[]; topicCode: string; caseId?: string }) {
  return <div className="space-y-4">{reviews.map((review, index) => <ReviewResult key={`${review.reviewId}-${index}`} review={review} topicCode={topicCode} caseId={caseId} compact />)}</div>;
}

export default function AppealActionTimeline({ actions, topicCode, caseId, excludeActionId, showOriginalComment = false, compact = false }: {
  actions: readonly AppealAction[];
  topicCode?: string;
  caseId?: string;
  excludeActionId?: string;
  showOriginalComment?: boolean;
  compact?: boolean;
}) {
  const visible = actions.filter(action => action.actionId !== excludeActionId && (!topicCode || action.topics.some(topic => topic.code === topicCode)));
  if (!visible.length) return null;
  return <ol aria-label={topicCode ? `ประวัติ Action หัวข้อ ${topicCode}` : "ประวัติ Action อุทธรณ์"} className={compact ? "space-y-0" : "space-y-4"}>
    {visible.map(action => {
      const latestReview = action.reviews.at(-1);
      return <li key={action.actionId} data-appeal-action={action.actionNumber} className={compact ? "border-t border-dashed border-slate-200 py-4 first:border-t-0" : "rounded-2xl border border-slate-200 bg-white p-4"}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-extrabold text-slate-900">{compact ? `Appeal Reason · Action ${action.actionNumber}` : `Action ${action.actionNumber} — ${action.roundId ? `อุทธรณ์เพิ่มเติมครั้งที่ ${action.actionNumber - 1}` : "อุทธรณ์ครั้งแรก"}`}</h4>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{action.status === "Pending" ? "รอ QA พิจารณา" : action.status === "Awaiting Additional Submission" ? "รอยื่นเพิ่มเติม" : action.status}</span>
        </div>
        {action.submittedAt ? <div className="mb-3 text-xs text-slate-600">ผู้ยื่น: {action.submittedBy || "-"} · {dateTime(action.submittedAt)}</div> : <div className="mb-3 text-xs text-slate-600">เปิดสิทธิ์: {dateTime(action.openedAt)} · ยังไม่ได้ยื่นข้อความอุทธรณ์</div>}
        <div className="space-y-3">
          {action.topics.filter(topic => !topicCode || topic.code === topicCode).map(topic => <div key={topic.code} className="space-y-2">
            {!topicCode && <div className="mb-2 text-sm font-bold text-slate-800">Topic {topic.code} {topic.label}</div>}
            {showOriginalComment && <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold text-slate-500">Original Comment</div>
              <RichTextContent value={topic.comment} decodeEntities className="mt-2 break-words text-sm leading-6 text-slate-700" />
            </div>}
            <div className={compact ? "py-1" : "rounded-2xl border border-amber-200 bg-amber-50 p-4"}>
            {!compact && <div className="text-xs font-bold text-amber-700">Appeal Reason · Action {action.actionNumber}</div>}
            <RichTextContent value={topic.appealReason} className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-amber-950" fallback="ยังไม่ได้ยื่นข้อความอุทธรณ์" />
            <AppealEvidenceGallery images={topic.evidenceImages || []} caseId={caseId} startIndex={appealEvidenceStartIndex(action.topics, topic.code)} />
            </div>
          </div>)}
          {latestReview && <ReviewResult review={latestReview} topicCode={topicCode} caseId={caseId} compact={compact} />}
        </div>
        {action.submissions.length > 1 && <details className="mt-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-bold">ข้อความก่อนแก้ไขใน Action นี้ ({action.submissions.length - 1})</summary>
          {action.submissions.slice(0, -1).map((version, index) => <div key={`${version.submittedAt}-${index}`} className="mt-2 rounded-xl border border-slate-200 p-3">
            <div>{version.submittedBy || "-"} · {dateTime(version.submittedAt)}</div>
            {version.topics.filter(topic => !topicCode || topic.code === topicCode).map(topic => <div key={topic.code}><RichTextContent value={topic.appealReason} className="mt-2 whitespace-pre-wrap break-words text-sm leading-6" /><AppealEvidenceGallery images={topic.evidenceImages || []} caseId={caseId} /></div>)}
          </div>)}
        </details>}
        {action.reviews.length > 1 && <details className="mt-3 text-xs text-slate-600">
          <summary className="cursor-pointer font-bold">ผล QA ก่อนแก้ไขใน Action นี้ ({action.reviews.length - 1})</summary>
          <div className="mt-2 space-y-2">{action.reviews.slice(0, -1).map((review, index) => <ReviewResult key={`${review.reviewId}-${index}`} review={review} topicCode={topicCode} caseId={caseId} compact={compact} />)}</div>
        </details>}
      </li>;
    })}
  </ol>;
}
