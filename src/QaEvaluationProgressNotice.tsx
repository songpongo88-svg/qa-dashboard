import React, { useEffect, useMemo, useState } from "react";
import {
  subscribeQaEvaluationProgress,
  type QaEvaluationProgress,
} from "./qaEvaluationProgressStore";

type NoticeUser = {
  username?: string;
  displayName?: string;
};

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function QaEvaluationProgressNotice({
  currentUser,
}: {
  currentUser?: NoticeUser | null;
}) {
  const username = String(currentUser?.username || "").trim();
  const [progress, setProgress] = useState<QaEvaluationProgress | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    setProgress(null);
    if (!username) return;
    return subscribeQaEvaluationProgress(
      username,
      (nextProgress) => setProgress(nextProgress),
      (error) => console.warn("QA evaluation progress subscribe failed", error)
    );
  }, [username]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeProgress = useMemo(() => {
    if (!progress) return null;
    const expiresAt = new Date(progress.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= nowTick) return null;
    return progress;
  }, [progress, nowTick]);

  if (!activeProgress) return null;

  const completed = Math.max(0, activeProgress.completedCount);
  const target = Math.max(1, activeProgress.targetCount || 10);
  const remaining = Math.max(0, target - completed);
  const completion = Math.min(100, Math.round((completed / target) * 100));

  return (
    <aside
      className="fixed right-5 top-24 z-[225] w-[350px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[24px] border border-emerald-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
      style={{ fontFamily: "'Kanit', sans-serif" }}
      aria-live="polite"
    >
      <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500" />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-xl font-black text-emerald-700">
            QA
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
              QA In Progress
            </div>
            <div className="mt-1 text-base font-black text-slate-950">กำลังประเมินเคสของคุณ</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-500">
              ระบบจะแสดงเฉพาะสถานะระหว่างดำเนินการ โดยยังไม่เปิดคะแนน QA
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-slate-600">ความคืบหน้าเดือนนี้</span>
            <span className="text-sm font-black text-emerald-700">{completed}/{target} เคส</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all"
              style={{ width: `${completion}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span>{remaining > 0 ? `เหลืออีก ${remaining} เคส` : "ครบเป้าแล้ว"}</span>
            <span>{completion}%</span>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">ผู้ประเมิน</div>
            <div className="mt-0.5 truncate text-xs font-black text-slate-800">{activeProgress.evaluatorName}</div>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">อัปเดตล่าสุด</div>
            <div className="mt-0.5 text-xs font-black text-slate-800">{formatClock(activeProgress.updatedAt) || "กำลังดำเนินการ"}</div>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-emerald-600 px-3 py-2 text-center text-xs font-black text-white">
          Case in Progress
        </div>
      </div>
    </aside>
  );
}
