import React, { useEffect, useMemo, useState } from "react";
import {
  assignQaTypingChallenge,
  clearQaTypingChallenge,
  removeQaTypingChallenge,
  subscribeQaTypingChallengeQueue,
  type QaTypingChallenge,
  type QaTypingChallengeMode,
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

const QA_TYPING_STANDARD_WPM = 30;
const QA_TYPING_STANDARD_ACCURACY = 95;
const QA_TYPING_MIN_TIME_SECONDS = 30;
const STANDARD_CHARACTERS_PER_WORD = 5;

function clampRepeatCount(value: unknown) {
  return Math.max(1, Math.min(500, Math.floor(Number(value) || 1)));
}

function detectChallengeMode(value: string): QaTypingChallengeMode {
  return /\s/.test(String(value || "").trim()) ? "sentence" : "word";
}

function calculateAllowedMistakes(repeatCount: number) {
  const safeRepeat = clampRepeatCount(repeatCount);
  return Math.floor(safeRepeat * ((100 - QA_TYPING_STANDARD_ACCURACY) / 100));
}

function calculateTimeLimitSeconds(text: string, repeatCount: number, mode: QaTypingChallengeMode) {
  const safeRepeat = clampRepeatCount(repeatCount);
  let calculatedSeconds = 0;

  if (mode === "sentence") {
    const charactersPerMinute = QA_TYPING_STANDARD_WPM * STANDARD_CHARACTERS_PER_WORD;
    const totalCharacters = Math.max(1, Array.from(String(text || "").trim()).length) * safeRepeat;
    calculatedSeconds = Math.ceil((totalCharacters / charactersPerMinute) * 60);
  } else {
    calculatedSeconds = Math.ceil((safeRepeat / QA_TYPING_STANDARD_WPM) * 60);
  }

  return Math.max(QA_TYPING_MIN_TIME_SECONDS, Math.min(3600, calculatedSeconds));
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

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
  const [queue, setQueue] = useState<QaTypingChallenge[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setMessage("");
    setError("");
    setQueue([]);
    setWord("อนุญาต");
    setRepeatCount(100);
    if (!username) return;

    return subscribeQaTypingChallengeQueue(
      username,
      (nextQueue) => setQueue(nextQueue),
      () => setError("ไม่สามารถตรวจสอบ QA Access Check Queue ของ Agent นี้ได้")
    );
  }, [username]);

  const cleanWord = useMemo(() => word.trim(), [word]);
  const mode = useMemo(() => detectChallengeMode(cleanWord), [cleanWord]);
  const isSentence = mode === "sentence";
  const safeRepeatCount = useMemo(() => clampRepeatCount(repeatCount), [repeatCount]);
  const autoAllowedMistakes = useMemo(
    () => calculateAllowedMistakes(safeRepeatCount),
    [safeRepeatCount]
  );
  const autoTimeLimitSeconds = useMemo(
    () => calculateTimeLimitSeconds(cleanWord, safeRepeatCount, mode),
    [cleanWord, safeRepeatCount, mode]
  );
  const requiredCorrectUnits = Math.max(0, safeRepeatCount - autoAllowedMistakes);
  const unitLabel = isSentence ? "รอบ" : "คำ";

  if (!agent || !username) return null;

  const assignChallenge = async () => {
    setMessage("");
    setError("");
    if (!cleanWord) {
      setError("กรุณากำหนดคำหรือประโยคที่ต้องการให้พิมพ์");
      return;
    }

    const safeRepeat = clampRepeatCount(repeatCount);
    const safeAllowed = calculateAllowedMistakes(safeRepeat);
    const safeTimeLimitSeconds = calculateTimeLimitSeconds(cleanWord, safeRepeat, mode);
    const nextPosition = queue.length + 1;
    setBusy(true);
    try {
      await assignQaTypingChallenge({
        username,
        displayName: agentName,
        word: cleanWord,
        mode,
        repeatCount: safeRepeat,
        allowedMistakes: safeAllowed,
        timeLimitSeconds: safeTimeLimitSeconds,
        assignedAt: new Date().toISOString(),
        assignedBy: String(currentUser?.username || currentUser?.displayName || "QA").trim(),
      });
      setRepeatCount(safeRepeat);
      setMessage(
        queue.length
          ? `เพิ่ม “${cleanWord}” เป็นลำดับ ${nextPosition} ใน Queue ของ ${agentName} แล้ว`
          : `ส่ง QA Access Check “${cleanWord}” ให้ ${agentName} แล้ว`
      );
      setWord("");
    } catch (assignError) {
      console.warn("Assign QA typing challenge failed", assignError);
      const detail = assignError instanceof Error ? assignError.message : "";
      setError(detail.includes("queue limit") ? "Queue ของ Agent นี้เต็มแล้ว (สูงสุด 50 รายการ)" : "ส่ง QA Access Check ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  const removeChallenge = async (challenge: QaTypingChallenge) => {
    setMessage("");
    setError("");
    setBusy(true);
    try {
      await removeQaTypingChallenge(username, challenge.id);
      setMessage(`นำ “${challenge.word}” ออกจาก Queue ของ ${agentName} แล้ว`);
    } catch (removeError) {
      console.warn("Remove QA typing challenge failed", removeError);
      setError("นำรายการออกจาก Queue ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  const clearQueue = async () => {
    setMessage("");
    setError("");
    setBusy(true);
    try {
      await clearQaTypingChallenge(username);
      setMessage(`ยกเลิก QA Access Check Queue ของ ${agentName} ทั้งหมดแล้ว`);
    } catch (clearError) {
      console.warn("Clear QA typing challenge queue failed", clearError);
      setError("ยกเลิก QA Access Check Queue ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
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
          <div className="mt-1 text-xs font-bold text-slate-700">
            รองรับทั้งคำและประโยค ระบบตรวจจับโหมดอัตโนมัติและเรียงหลายรายการเป็น Queue
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${queue.length ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
          {queue.length ? `ACTIVE · ${queue.length} QUEUED` : "NOT ASSIGNED"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[1.5fr_.7fr_.8fr_.9fr]">
        <label className="block sm:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">คำ / ประโยคที่ให้พิมพ์</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${isSentence ? "bg-fuchsia-100 text-fuchsia-700" : "bg-violet-100 text-violet-700"}`}>
              {isSentence ? "Sentence Mode" : "Word Mode"}
            </span>
          </div>
          <textarea
            value={word}
            onChange={(event) => setWord(event.target.value.replace(/\r?\n/g, " "))}
            placeholder="เช่น อนุญาต หรือ พี่ไรเดอร์มีเสื้อ Robinhood แล้วหรือยังคะ"
            rows={2}
            className="mt-1.5 w-full resize-none rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
        </label>

        <label className="block">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{isSentence ? "จำนวนรอบ" : "จำนวนคำ"}</span>
          <input
            type="number"
            min={1}
            max={500}
            value={repeatCount}
            onChange={(event) => setRepeatCount(Number(event.target.value))}
            className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          />
        </label>

        <div className="block">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">ยอมให้ผิดได้</span>
          <div className="mt-1.5 flex min-h-[38px] items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
            <span>{autoAllowedMistakes} {unitLabel}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700">Auto</span>
          </div>
        </div>

        <div className="block">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">เวลา</span>
          <div className="mt-1.5 flex min-h-[38px] items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-black text-sky-800">
            <span>{formatDuration(autoTimeLimitSeconds)}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-sky-700">Auto</span>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-violet-100 bg-white/80 px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Typing Standard</div>
          <div className="mt-0.5 text-xs font-black text-slate-700">{QA_TYPING_STANDARD_WPM} WPM · 5 chars/word</div>
        </div>
        <div className="rounded-xl border border-violet-100 bg-white/80 px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Accuracy Standard</div>
          <div className="mt-0.5 text-xs font-black text-slate-700">{QA_TYPING_STANDARD_ACCURACY}%</div>
        </div>
        <div className="rounded-xl border border-violet-100 bg-white/80 px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">ต้องถูกอย่างน้อย</div>
          <div className="mt-0.5 text-xs font-black text-slate-700">{requiredCorrectUnits} / {safeRepeatCount} {unitLabel}</div>
        </div>
      </div>

      <div className="mt-2 rounded-xl border border-slate-100 bg-white/70 px-3 py-2 text-[10px] font-semibold leading-5 text-slate-500">
        {isSentence
          ? "Sentence Mode: Agent ต้องพิมพ์ประโยคเต็มตามข้อความที่กำหนด และกด Enter เพื่อแยกแต่ละรอบ • ระบบตรวจตัวอักษรและการเว้นวรรคภายในประโยค • เวลา Auto จากความยาวข้อความ"
          : "Word Mode: Agent พิมพ์คำเดิมซ้ำตามจำนวนคำ • เวลา Auto จากมาตรฐาน 30 คำ/นาที"}
        {" • "}ความถูกต้อง 95% • เวลาขั้นต่ำ 30 วินาที • รายการใหม่ต่อท้าย Queue โดยไม่ทับรายการเดิม
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void assignChallenge()}
          disabled={busy || !cleanWord}
          className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "กำลังดำเนินการ..." : queue.length ? "+ เพิ่มเข้าคิว" : "ส่ง QA Access Check"}
        </button>
        {queue.length ? (
          <button
            type="button"
            onClick={() => void clearQueue()}
            disabled={busy}
            className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-black text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
          >
            ยกเลิกทั้งหมด
          </button>
        ) : null}
        <span className="text-[10px] font-semibold text-slate-500">Agent: {agentName}</span>
      </div>

      {queue.length ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-violet-100 bg-white">
          <div className="flex items-center justify-between border-b border-violet-100 bg-violet-50 px-3 py-2.5">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-600">Pending Queue</div>
              <div className="text-xs font-black text-slate-800">ต้องทำตามลำดับ {queue.length} รายการ</div>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-violet-700">{queue.length} ITEMS</span>
          </div>
          <div className="divide-y divide-slate-100">
            {queue.map((item, index) => {
              const itemSentence = item.mode === "sentence";
              const itemUnitLabel = itemSentence ? "รอบ" : "คำ";
              return (
                <div key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black ${index === 0 ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"}`}>
                    {index + 1}
                  </div>
                  <div className="min-w-[150px] flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="max-w-full truncate text-sm font-black text-slate-900" title={item.word}>{item.word}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${itemSentence ? "bg-fuchsia-100 text-fuchsia-700" : "bg-violet-100 text-violet-700"}`}>
                        {itemSentence ? "Sentence" : "Word"}
                      </span>
                      {index === 0 ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700">Current</span> : null}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      {item.repeatCount} {itemUnitLabel} · ผิดได้ {item.allowedMistakes} {itemUnitLabel} · เวลา {formatDuration(item.timeLimitSeconds)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeChallenge(item)}
                    disabled={busy}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  >
                    นำออก
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {message ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{message}</div> : null}
      {error ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</div> : null}
    </section>
  );
}
