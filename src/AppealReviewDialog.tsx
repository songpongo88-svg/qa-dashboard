import React, { useEffect, useRef } from "react";
import { type AppealTopicDecision, type AppealDecision } from "./appealReview";

export type AppealReviewSavePreview = {
  requestId: string;
  caseId: string;
  agent: string;
  isEdit: boolean;
  previousReviewId: string;
  previousReviewedAt?: string;
  reviewId: string;
  reviewVersion: number;
  beforeScore: number;
  reviewSummary: string;
  review: {
    decision: AppealDecision;
    finalScore: number;
    topics: {
      code: string; label?: string; score: number; max: number; decision?: AppealTopicDecision;
      originalScore?: number; retainedComment?: string;
      comment?: string; appealReason?: string; revisedScore?: number | string;
      revisedComment?: string; rejectReason?: string;
    }[];
  };
  topicRows: {
    code: string;
    label: string;
    decision: AppealTopicDecision;
    beforeScore: number;
    afterScore: number;
    max: number;
    feedback: string;
  }[];
};

export type AppealReviewNotice = {
  kind: "success" | "error" | "validation";
  title: string;
  message: string;
  caseId?: string;
  decision?: AppealDecision;
  finalScore?: number;
};

function decisionLabel(decision?: string) {
  return decision === "Approved" ? "อนุมัติทุกข้อ (Approved)"
    : decision === "Rejected" ? "ไม่อนุมัติทุกข้อ (Reject)"
    : decision === "Partially Approved" ? "อนุมัติบางข้อ (Partially Approved)" : "";
}

function gradeFromScore(score: number) {
  return score >= 90 ? "A" : score >= 85 ? "B" : score >= 80 ? "C" : "D";
}

export default function AppealReviewDialog({ preview, notice, busy, onConfirm, onBack, onDismiss }: {
  preview: AppealReviewSavePreview | null;
  notice: AppealReviewNotice | null;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = Boolean(preview || notice);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    dialog.querySelector<HTMLButtonElement>("[data-dialog-initial-focus]")?.focus();
  }, [open, notice, preview?.reviewId]);
  if (!open) return null;
  const success = notice?.kind === "success";
  const title = notice?.title || (preview?.isEdit ? "ยืนยันแก้ไขผลอุทธรณ์" : "ยืนยันบันทึกผลอุทธรณ์");
  return (
    <dialog ref={ref} aria-modal="true" aria-labelledby="appeal-review-dialog-title"
      aria-describedby="appeal-review-dialog-description" role={notice && !success ? "alertdialog" : "dialog"}
      onCancel={event => { event.preventDefault(); if (!busy) notice ? onDismiss() : onBack(); }}
      className="fixed inset-0 m-auto max-h-[85vh] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto rounded-3xl border border-violet-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/45">
      <div className="border-b border-violet-100 bg-violet-50 px-6 py-5">
        <h2 id="appeal-review-dialog-title" className="text-xl font-extrabold text-violet-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">เคส {notice?.caseId || preview?.caseId || "ที่เลือก"}{!notice && preview?.agent ? ` · ${preview.agent}` : ""}</p>
      </div>
      {notice ? (
        <div className="space-y-4 px-6 py-5">
          <p id="appeal-review-dialog-description" className="whitespace-pre-line text-sm leading-7">{notice.message}</p>
          {success && notice.finalScore !== undefined && (
            <div className={`rounded-2xl border p-4 ${notice.finalScore >= 85 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
              <div className="text-sm font-bold">{decisionLabel(notice.decision)}</div>
              <div className="mt-2 text-xl font-extrabold">คะแนนล่าสุด {notice.finalScore.toFixed(2)} / 100</div>
              <div className="mt-1 text-sm font-semibold">Grade {gradeFromScore(notice.finalScore)} · {notice.finalScore >= 85 ? "ผ่าน KPI" : "ไม่ผ่าน KPI"} (เกณฑ์ 85%)</div>
            </div>
          )}
        </div>
      ) : preview && (
        <div className="space-y-4 px-6 py-5">
          <p id="appeal-review-dialog-description" className="text-sm leading-6">ตรวจสอบผลแต่ละข้อก่อนบันทึก{preview.isEdit ? " ผลนี้จะเป็นผลล่าสุดของคำขอเดิม และเก็บผลก่อนหน้าไว้ในประวัติ" : " ระบบจะใช้คะแนนใหม่ในรายละเอียดเคสและเอกสาร"}</p>
          <div className="flex flex-wrap gap-2 text-sm font-bold">
            <span className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">Approved {preview.topicRows.filter(topic => topic.decision === "Approved").length} ข้อ</span>
            <span className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">Reject {preview.topicRows.filter(topic => topic.decision === "Rejected").length} ข้อ</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="p-3">หัวข้อ</th><th className="p-3">ผล</th><th className="p-3 text-right">คะแนนก่อน → หลัง</th></tr></thead>
              <tbody>{preview.topicRows.map(topic => (
                <React.Fragment key={topic.code}>
                  <tr className="border-t border-slate-200"><td className="p-3 font-bold">{topic.code} {topic.label}</td><td className={`p-3 font-bold ${topic.decision === "Approved" ? "text-emerald-700" : "text-rose-700"}`}>{topic.decision === "Approved" ? "Approved" : "Reject"}</td><td className="whitespace-nowrap p-3 text-right font-bold">{topic.beforeScore} → {topic.afterScore} / {topic.max}</td></tr>
                  <tr><td colSpan={3} className="break-words px-3 pb-3 text-xs leading-6 text-slate-600"><span className="font-bold">{topic.decision === "Approved" ? "ความเห็นหลังทบทวน: " : "เหตุผลที่ไม่อนุมัติ: "}</span>{topic.feedback}</td></tr>
                </React.Fragment>
              ))}</tbody>
            </table>
          </div>
          <div className={`rounded-2xl border p-4 ${preview.review.finalScore >= 85 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
            <div className="text-sm font-bold">{decisionLabel(preview.review.decision)}</div>
            <div className="mt-2 text-xl font-extrabold">คะแนนรวม {preview.beforeScore.toFixed(2)} → {preview.review.finalScore.toFixed(2)} / 100</div>
            <div className="mt-1 text-sm font-semibold">Grade {gradeFromScore(preview.review.finalScore)} · {preview.review.finalScore >= 85 ? "ผ่าน KPI" : "ไม่ผ่าน KPI"} (เกณฑ์ 85%)</div>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="text-sm font-bold text-violet-800">สรุปเหตุผลการพิจารณา</div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{preview.reviewSummary}</p></div>
        </div>
      )}
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-white px-6 py-4">
        {notice ? <button type="button" data-dialog-initial-focus onClick={onDismiss} className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-800">{success ? "รับทราบ" : "กลับไปตรวจสอบ"}</button> : <>
          <button type="button" data-dialog-initial-focus disabled={busy} onClick={onBack} className="rounded-xl border border-violet-200 px-4 py-2.5 text-sm font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50">กลับไปแก้ไข</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-800 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "ยืนยันบันทึก"}</button>
        </>}
      </div>
    </dialog>
  );
}
