import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  subscribeQaTypingChallengeHistory,
  type QaTypingChallengeHistoryRecord,
} from "./qaTypingChallengeHistoryStore";
import {
  subscribeQaTypingChallengeQueue,
  type QaTypingChallenge,
} from "./qaTypingChallengeStore";

function normalizeCaseId(value: unknown) {
  return String(value || "").replace(/\s+/g, "").trim().toUpperCase();
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", "");
}

export default function QaAccessCaseHistoryPopup({
  caseId,
  username,
}: {
  caseId?: string;
  username?: string;
}) {
  const normalizedCaseId = normalizeCaseId(caseId);
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<QaTypingChallengeHistoryRecord[]>([]);
  const [queue, setQueue] = useState<QaTypingChallenge[]>([]);

  useEffect(() => {
    if (!normalizedCaseId) {
      setHistory([]);
      return;
    }
    return subscribeQaTypingChallengeHistory(
      (records) => {
        setHistory(
          records.filter((record) =>
            (record.caseIds || []).some((item) => normalizeCaseId(item) === normalizedCaseId)
          )
        );
      },
      () => setHistory([])
    );
  }, [normalizedCaseId]);

  useEffect(() => {
    const targetUsername = String(username || "").trim();
    if (!targetUsername || !normalizedCaseId) {
      setQueue([]);
      return;
    }
    return subscribeQaTypingChallengeQueue(
      targetUsername,
      (items) => {
        setQueue(
          items.filter((item) =>
            (item.caseIds || []).some((linkedCaseId) => normalizeCaseId(linkedCaseId) === normalizedCaseId)
          )
        );
      },
      () => setQueue([])
    );
  }, [username, normalizedCaseId]);

  const topic4History = useMemo(
    () => history.filter((record) => String(record.topicCode || "4") === "4"),
    [history]
  );
  const topic4Queue = useMemo(
    () => queue.filter((item) => String(item.topicCode || "4") === "4"),
    [queue]
  );

  if (!normalizedCaseId || (!topic4History.length && !topic4Queue.length)) return null;

  const modal = open ? (
    <div className="fixed inset-0 z-[390] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <section className="max-h-[88vh] w-full max-w-[820px] overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-[0_34px_100px_rgba(15,23,42,0.35)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-5 py-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">QA Access Check · Topic 4</div>
            <h3 className="mt-1 text-xl font-black text-slate-950">Case {caseId}</h3>
            <div className="mt-1 text-xs font-semibold text-slate-500">ดูเฉพาะ QA Access Check ที่ผูกกับเคสนี้ และคำที่พิมพ์ผิด</div>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-500 hover:bg-slate-50">×</button>
        </div>

        <div className="max-h-[calc(88vh-92px)] overflow-y-auto p-5">
          {topic4Queue.length ? (
            <div className="mb-5">
              <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-amber-600">Pending</div>
              <div className="space-y-2">
                {topic4Queue.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-black text-slate-900">คำ/ประโยค: {item.word}</div>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-amber-700">WAITING</span>
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-600">จำนวน {item.repeatCount} · ผิดได้ {item.allowedMistakes} · ผูกเคส {(item.caseIds || []).join(", ")}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-violet-600">History</div>
            {topic4History.length ? (
              <div className="space-y-3">
                {topic4History.map((record) => {
                  const mistakes = record.mistakeDetails || [];
                  return (
                    <article key={record.id} className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-black text-slate-900">{record.displayName || record.username}</div>
                          <div className="mt-0.5 text-[11px] font-semibold text-slate-500">{formatDateTime(record.completedAt)}</div>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${record.result === "Pass" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : record.result === "Timeout" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>{record.result}</span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-xl bg-violet-50 px-3 py-2"><div className="text-[9px] font-black uppercase text-slate-400">Expected</div><div className="mt-1 font-black text-violet-700">{record.word}</div></div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[9px] font-black uppercase text-slate-400">Wrong</div><div className="mt-1 font-black text-rose-600">{record.mistakeCount}</div></div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[9px] font-black uppercase text-slate-400">Case</div><div className="mt-1 break-words font-black text-slate-800">{(record.caseIds || []).join(", ") || caseId}</div></div>
                      </div>
                      <div className="mt-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">ผิดคำไหนในข้อ 4</div>
                        {mistakes.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {mistakes.map((mistake, index) => (
                              <span key={`${record.id}-${index}`} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                                #{mistake.index + 1}: <span className="line-through opacity-70">{mistake.expected}</span> → {mistake.typed || "(ว่าง)"}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs font-semibold text-emerald-700">ไม่พบคำที่พิมพ์ผิด</div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-400">ยังไม่มีผลการทำ QA Access Check ของเคสนี้</div>
            )}
          </div>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-700 transition hover:bg-violet-100">
        ⌨ QA Access Check · ข้อ 4
        <span className="rounded-full bg-white px-2 py-0.5 text-[9px]">{topic4Queue.length + topic4History.length}</span>
      </button>
      {typeof document !== "undefined" && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
