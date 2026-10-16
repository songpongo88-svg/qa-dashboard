import React from "react";
import { appealIssueTagsBeforeReview, appealTopicIssueTags, appealIssueTagChanges, normalizeAppealIssueTags, type AppealIssueTagFields } from "./appealReview";

export function AppealIssueTagHistory({ topic }: { topic: AppealIssueTagFields }) {
  const before = appealIssueTagsBeforeReview(topic);
  const after = appealTopicIssueTags(topic);
  if (before === undefined || after === undefined) return null;
  const removed = appealIssueTagChanges(topic);
  return <div data-appeal-tag-history className="mt-3 space-y-1 text-xs leading-6 text-slate-600">
    <div><span className="font-semibold">Tag หลังทบทวน: </span>{after.length ? after.join(" · ") : "ไม่มี Tag ที่พบปัญหา"}</div>
    {removed.length > 0 && <div className="text-rose-700"><span className="font-semibold">นำออก: </span>{removed.join(" · ")}</div>}
  </div>;
}

export default function AppealIssueTagEditor({ topic, disabled, loading, error, onChange, onRetry }: {
  topic: AppealIssueTagFields & { code: string }; disabled: boolean; loading?: boolean; error?: boolean;
  onChange: (tags: string[]) => void; onRetry: () => void;
}) {
  const before = appealIssueTagsBeforeReview(topic);
  const editable = topic.decision === "Approved" && !disabled && before !== undefined;
  const selected = topic.decision === "Approved" ? normalizeAppealIssueTags(topic.revisedIssueTags ?? before) : before || [];
  const removed = (before || []).filter(tag => !selected.includes(tag));
  return <section data-appeal-tag-editor={topic.code} aria-label={`Tag หลังทบทวนหัวข้อ ${topic.code}`} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold text-slate-900">Tag ที่พบปัญหา</h4>{before !== undefined && <span className="text-xs text-slate-500" aria-live="polite">คงไว้ {selected.length} Tag</span>}</div>
    {before === undefined ? <div className="text-xs leading-6 text-slate-600">{loading ? "กำลังตรวจ Tag จากเคสต้นทาง…" : error ? <>ตรวจ Tag เดิมไม่สำเร็จ <button type="button" onClick={onRetry} disabled={disabled} className="rounded-lg border border-violet-200 bg-white px-2 py-1 font-semibold text-violet-700 disabled:opacity-50">ลองอีกครั้ง</button></> : "คำขอนี้ไม่มีข้อมูล Tag ในเคสต้นทาง"}</div> : <>
      <div className="flex flex-wrap gap-2">{selected.length ? selected.map(tag => <span key={tag} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 py-1 pl-3 pr-1 text-xs text-violet-800"><span className="min-w-0 break-words">{tag}</span>{editable && <button type="button" aria-label={`เอา Tag ${tag} ออกจากหัวข้อ ${topic.code}`} onClick={() => onChange(selected.filter(value => value !== tag))} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-lg hover:bg-violet-100">×</button>}</span>) : <span className="text-xs text-slate-600">ไม่มี Tag ที่ต้องคงไว้</span>}</div>
      {removed.length > 0 && topic.decision === "Approved" && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>นำออกแล้ว</span>{removed.map(tag => <button key={tag} type="button" disabled={!editable} onClick={() => onChange((before || []).filter(value => selected.includes(value) || value === tag))} className="max-w-full break-words rounded-lg border border-dashed border-slate-300 bg-white px-2 py-1.5 text-left text-violet-700 disabled:opacity-60">คืน Tag · {tag}</button>)}</div>}
      <p className="mt-3 text-xs leading-5 text-slate-500">{topic.decision === "Rejected" ? "Reject คง Tag ก่อนรอบนี้" : topic.decision === "Approved" ? "เอาออกเฉพาะ Tag ที่ผลทบทวนยืนยันว่าไม่พบปัญหา · คะแนนปรับผ่าน Revised Score" : "เลือก Approved เพื่อทบทวน Tag ของหัวข้อนี้"}</p>
    </>}
  </section>;
}
