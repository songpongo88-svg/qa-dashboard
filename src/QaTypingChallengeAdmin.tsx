import React, { useEffect, useMemo, useState } from "react";
import {
  assignQaTypingChallenge,
  clearQaTypingChallenge,
  subscribeQaTypingChallenge,
  type QaTypingChallenge,
} from "./qaTypingChallengeStore";

type AgentOption = {
  username?: string;
  displayName?: string;
  agentName?: string;
  role?: string;
};

type CurrentUser = {
  username?: string;
  displayName?: string;
};

export default function QaTypingChallengeAdmin({
  agent,
  currentUser,
}: {
  agent?: AgentOption | null;
  currentUser?: CurrentUser | null;
}) {
  const username = String(agent?.username || "").trim();
  const agentName = String(agent?.agentName || agent?.displayName || username || "").trim();
  const [word, setWord] = useState("อนุญาต");
  const [repeatCount, setRepeatCount] = useState(100);
  const [allowedMistakes, setAllowedMistakes] = useState(0);
  const [activeChallenge, setActiveChallenge] = useState<QaTypingChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setMessage("");
    setError("");
    setActiveChallenge(null);
    if (!username) return;

    return subscribeQaTypingChallenge(
      username,
      (challenge) => {
        setActiveChallenge(challenge);
        if (challenge) {
          setWord(challenge.word);
          setRepeatCount(challenge.repeatCount);
          setAllowedMistakes(challenge.allowedMistakes);
        }
      },
      () => setError("ไม่สามารถตรวจสอบ QA Access Check ของ Agent นี้ได้")
    );
  }, [username]);

  const cleanWord = useMemo(() => word.trim(), [word]);
  if (!agent || !username) return null;

  const assignChallenge = async () => {
    setMessage("");
    setError("");
    if (!cleanWord) {
      setError("กรุณากำหนดคำที่ต้องการให้พิมพ์");
      return;
    }
    if (/\s/.test(cleanWord)) {
      setError("กรุณากำหนดเป็น 1 คำ เช่น อนุญาต");
      return;
    }

    const safeRepeat = Math.max(1, Math.min(500, Math.floor(Number(repeatCount) || 1)));
    const safeAllowed = Math.max(0, Math.min(safeRepeat, Math.floor(Number(allowedMistakes) || 0)));
    setBusy(true);
    try {
      await assignQaTypingChallenge({
        username,
        displayName: agentName,
        word: cleanWord,
        repeatCount: safeRepeat,
        allowedMistakes: safeAllowed,
        assignedAt: new Date().toISOString(),
        assignedBy: String(currentUser?.username || currentUser?.displayName || "QA").trim(),
      });
      setRepeatCount(safeRepeat);
      setAllowedMistakes(safeAllowed);
      setMessage(`ส่ง QA Access Check ให้ ${agentName} แล้ว`);
    } catch (assignError) {
      console.warn("Assign QA typing challenge failed", assignError);
      setError("ส่ง QA Access Check ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  const clearChallenge = async () => {
    setMessage("");
    setError("");
    setBusy(true);
    try {
      await clearQaTypingChallenge(username);
      setMessage(`ยกเลิก QA Access Check ของ ${agentName} แล้ว`);
    } catch (clearError) {
      console.warn("Clear QA typing challenge failed", clearError);
      setError("ยกเลิก QA Access Check ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-violet-700">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-600 text-xs text-white">⌨</span>
            QA Access Check
          </div>
          <div className="mt-1 text-xs font-bold text-slate-700">กำหนดคำที่ Agent ต้องพิมพ์ก่อนเข้าดูผล QA</div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${activeChallenge ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
          {activeChallenge ? "ACTIVE" : "NOT ASSIGNED"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1.4fr_.7fr_.8fr]">
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">คำที่ให้พิมพ์</span>
          <input
            value={word}
            onChange={(event) => setWord(event.target.value)}
            placeholder="เช่น อนุญาต"
            className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">จำนวนคำ</span>
          <input
            type="number"
            min={1}
            max={500}
            value={repeatCount}
            onChange={(event) => setRepeatCount(Number(event.target.value))}
            className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">ยอมให้ผิดได้</span>
          <input
            type="number"
            min={0}
            max={Math.max(0, Number(repeatCount) || 0)}
            value={allowedMistakes}
            onChange={(event) => setAllowedMistakes(Number(event.target.value))}
            className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void assignChallenge()}
          disabled={busy}
          className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "กำลังดำเนินการ..." : activeChallenge ? "อัปเดตโจทย์" : "ส่ง QA Access Check"}
        </button>
        {activeChallenge ? (
          <button
            type="button"
            onClick={() => void clearChallenge()}
            disabled={busy}
            className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-black text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
          >
            ยกเลิกการบังคับ
          </button>
        ) : null}
        <span className="text-[10px] font-semibold text-slate-500">Agent: {agentName}</span>
      </div>

      {message ? <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{message}</div> : null}
      {error ? <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</div> : null}
    </section>
  );
}
