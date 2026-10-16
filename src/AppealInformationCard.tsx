import React from "react";

function DateTime({ value }: { value: string }) {
  const [date, ...time] = String(value || "-").replace(",", "").trim().split(/\s+/);
  return <span className="block font-medium tabular-nums text-slate-800"><span className="block">{date || "-"}</span>{time.length > 0 && <span className="block">{time.join(" ")}</span>}</span>;
}

export default function AppealInformationCard({ request, teamName, workflowLabel, workflowTone, currentScore, currentGrade, topics, workflow, formatDateTime, onOpenReview }: {
  request: { caseId: string; agent: string; submittedBy: string; submittedByUsername?: string; auditDate: string; auditTimestamp?: string; submittedAt: string; reviewedAt?: string; finalScore: number; inquiry: string; additionalHistory?: Array<{ openedAt: string; submittedAt: string; reviewedAt: string }> };
  teamName: string; workflowLabel: string; workflowTone: string; currentScore: number; currentGrade: string;
  topics: string[]; workflow: React.ReactNode; formatDateTime: (value?: string) => string; onOpenReview: () => void;
}) {
  return <section data-appeal-review-information="appeal-review-information-plain-v57" data-appeal-information-compact="true" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="flex items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
      <div className="min-w-0"><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Information</div><h2 className="mt-1 break-words text-xl font-semibold text-violet-800">{request.caseId}</h2><div className="mt-2 break-words text-sm font-medium text-slate-900">{request.agent || "-"}</div><div className="mt-0.5 break-words text-xs text-slate-500">{teamName || "-"}</div></div>
      <span className={`max-w-[45%] shrink-0 rounded-lg border px-2.5 py-1 text-center text-[11px] font-medium ${workflowTone}`}>{workflowLabel}</span>
    </header>
    <div className="mx-4 mb-3 grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-200 bg-slate-50 sm:mx-5">
      <div className="min-w-0 px-3 py-2.5"><div className="text-[11px] text-slate-500">Original Score</div><div className="mt-1 text-xl font-semibold tabular-nums text-slate-600">{request.finalScore.toFixed(2)}</div></div>
      <div className="min-w-0 px-3 py-2.5"><div className="text-[11px] text-slate-500">Current Score</div><div className={`mt-1 text-xl font-semibold tabular-nums ${currentScore >= 85 ? "text-emerald-700" : "text-rose-700"}`}>{currentScore.toFixed(2)}</div></div>
      <div className="min-w-0 px-3 py-2.5"><div className="text-[11px] text-slate-500">Grade / KPI</div><div className="mt-1 text-xl font-semibold text-slate-800">{currentGrade || "-"}</div><div className={`text-[11px] font-medium ${currentScore >= 85 ? "text-emerald-700" : "text-rose-700"}`}>{currentScore >= 85 ? "Passed" : "Not Passed"}</div></div>
    </div>
    <div className="px-4 sm:px-5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 py-3 text-xs">
        <div><dt className="mb-1 text-[11px] text-slate-500">Case Date</dt><dd><DateTime value={request.auditDate} /></dd></div>
        <div><dt className="mb-1 text-[11px] text-slate-500">Audit Date</dt><dd><DateTime value={request.auditTimestamp || request.auditDate} /></dd></div>
        <div><dt className="mb-1 text-[11px] text-slate-500">Original Appeal Submit</dt><dd><DateTime value={formatDateTime(request.submittedAt)} /></dd></div>
        <div><dt className="mb-1 text-[11px] text-slate-500">Reviewed Date &amp; Time</dt><dd><DateTime value={formatDateTime(request.reviewedAt)} /></dd></div>
      </dl>
      <div className="border-t border-slate-100 py-3"><div className="mb-1 text-[11px] text-slate-500">Intent</div><p className="break-words text-xs leading-6 text-slate-800">{request.inquiry || "-"}</p></div>
      <div className="border-t border-slate-100 py-3"><div className="mb-2 flex items-center justify-between gap-2 text-xs"><h3 className="font-medium text-slate-900">Appealed Topics</h3><span className="text-slate-500">{topics.length} Topics</span></div><div className="space-y-1.5">{topics.length ? topics.map((topic, index) => <p key={index} className="break-words text-xs leading-5 text-slate-600">{topic}</p>) : <span className="text-xs text-slate-500">-</span>}</div></div>
      <details className="border-t border-slate-100 py-3"><summary className="cursor-pointer text-xs font-medium text-violet-700">ผู้ยื่น / ประวัติอุทธรณ์เพิ่มเติม</summary><div className="mt-3 space-y-2 text-xs text-slate-600"><p><span className="font-medium">Submitted By: </span>{request.submittedByUsername || request.submittedBy || "-"}</p>{request.additionalHistory?.length ? request.additionalHistory.map((round, index) => <dl key={index} className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-2"><div><dt>Additional Round Opened</dt><dd><DateTime value={formatDateTime(round.openedAt)} /></dd></div><div><dt>Additional Appeal Submit</dt><dd><DateTime value={round.submittedAt ? formatDateTime(round.submittedAt) : "ยังไม่ได้ยื่น"} /></dd></div><div><dt>Additional Appeal Reviewed</dt><dd><DateTime value={formatDateTime(round.reviewedAt)} /></dd></div></dl>) : <p>ยังไม่มีรอบอุทธรณ์เพิ่มเติม</p>}</div></details>
      {workflow}
    </div>
    <footer className="border-t border-slate-200 px-4 py-3 sm:px-5"><button type="button" onClick={onOpenReview} className="w-full rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-violet-800">เปิดรายละเอียดอุทธรณ์ ↗</button></footer>
  </section>;
}
