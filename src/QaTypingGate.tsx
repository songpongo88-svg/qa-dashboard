import React, { useEffect, useMemo, useState } from "react";
import { clearQaTypingChallenge, subscribeQaTypingChallenge, type QaTypingChallenge } from "./qaTypingChallengeStore";

type GateUser = {
  username?: string;
  displayName?: string;
};

function splitTypedWords(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function QaTypingGate({
  currentUser,
  enabled,
}: {
  currentUser?: GateUser | null;
  enabled: boolean;
}) {
  const username = String(currentUser?.username || "").trim();
  const [challenge, setChallenge] = useState<QaTypingChallenge | null>(null);
  const [typedText, setTypedText] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setChallenge(null);
    if (!username) return;
    return subscribeQaTypingChallenge(
      username,
      (next) => setChallenge(next),
      (error) => console.warn("QA typing gate subscribe failed", error)
    );
  }, [username]);

  useEffect(() => {
    setTypedText("");
    setSecondsLeft(60);
    setMessage("");
    setChecking(false);
  }, [challenge?.assignedAt, challenge?.word, challenge?.repeatCount, challenge?.allowedMistakes]);

  useEffect(() => {
    if (!enabled || !challenge || secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [enabled, challenge, secondsLeft > 0]);

  useEffect(() => {
    if (!challenge || secondsLeft !== 0) return;
    setMessage("หมดเวลา กรุณากดเริ่มใหม่และพิมพ์อีกครั้ง");
  }, [challenge, secondsLeft]);

  const typedWords = useMemo(() => splitTypedWords(typedText), [typedText]);
  const repeatCount = challenge?.repeatCount || 0;
  const progress = repeatCount ? Math.min(100, Math.round((typedWords.length / repeatCount) * 100)) : 0;
  const currentIndex = repeatCount ? Math.min(typedWords.length, repeatCount - 1) : 0;

  if (!enabled || !challenge) return null;

  const resetAttempt = () => {
    setTypedText("");
    setSecondsLeft(60);
    setMessage("");
  };

  const verify = async () => {
    if (checking) return;
    const words = splitTypedWords(typedText);
    if (words.length !== challenge.repeatCount) {
      setMessage(`ยังไม่ผ่าน — ต้องพิมพ์ให้ครบ ${challenge.repeatCount} คำ ปัจจุบันพิมพ์ ${words.length} คำ`);
      return;
    }

    let mistakes = 0;
    words.forEach((word) => {
      if (word !== challenge.word) mistakes += 1;
    });

    if (mistakes > challenge.allowedMistakes) {
      setMessage(`ยังไม่ผ่าน — พบคำที่ไม่ตรง ${mistakes} คำ เกินเกณฑ์ที่กำหนด กรุณาพิมพ์ใหม่อีกครั้ง`);
      setTypedText("");
      setSecondsLeft(60);
      return;
    }

    setChecking(true);
    setMessage("ผ่านการตรวจสอบ กำลังเปิดผล QA...");
    try {
      await clearQaTypingChallenge(username);
    } catch (error) {
      console.warn("QA typing challenge completion failed", error);
      setChecking(false);
      setMessage("ไม่สามารถปลดล็อกผล QA ได้ กรุณาลองตรวจสอบอีกครั้ง");
    }
  };

  const blockClipboardShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && ["c", "v", "x"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      setMessage("ห้าม Copy / Paste กรุณาพิมพ์ด้วยตนเอง");
    }
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/65 px-4 py-6 backdrop-blur-[3px]" style={{ fontFamily: "'Kanit', sans-serif" }}>
      <section className="w-full max-w-[980px] overflow-hidden rounded-[30px] border border-white/80 bg-white shadow-[0_35px_110px_rgba(15,23,42,0.38)]">
        <div className="h-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-indigo-500" />
        <div className="max-h-[calc(100vh-2rem)] overflow-y-auto p-5 sm:p-7 lg:p-9">
          <div className="mx-auto max-w-[860px]">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-xl bg-violet-100 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-violet-700">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white">⌨</span>
                QA ACCESS CHECK
              </div>
              <h2 className="mt-4 text-2xl font-black text-slate-950 sm:text-3xl">ตรวจสอบการพิมพ์ก่อนดูผล QA</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">กรุณาพิมพ์คำที่แสดงด้านล่างให้ตรงตามจำนวนที่กำหนด เพื่อเข้าสู่หน้าผลการประเมิน QA</p>
            </div>

            <div className="mt-5 grid gap-2 rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3 text-xs font-bold text-slate-700 sm:grid-cols-3 sm:divide-x sm:divide-violet-200">
              <div className="text-center">ผู้ประเมิน: <span className="font-black text-slate-950">{challenge.displayName || currentUser?.displayName || username}</span></div>
              <div className="text-center">จำนวนคำ: <span className="font-black text-slate-950">{challenge.repeatCount} คำ</span></div>
              <div className="text-center">ยอมให้ผิดได้: <span className="font-black text-slate-950">{challenge.allowedMistakes} คำ</span></div>
            </div>

            <div
              className="mt-5 max-h-[220px] select-none overflow-y-auto rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/70 via-white to-indigo-50/60 px-5 py-5 text-[25px] font-bold leading-[1.9] text-slate-700 sm:text-[30px]"
              onCopy={(event) => event.preventDefault()}
              onCut={(event) => event.preventDefault()}
              onContextMenu={(event) => event.preventDefault()}
            >
              {Array.from({ length: challenge.repeatCount }, (_, index) => (
                <span
                  key={index}
                  className={`mr-3 inline-block rounded-md px-1.5 transition ${index === currentIndex ? "bg-amber-300 text-slate-950 shadow-sm" : ""}`}
                >
                  {challenge.word}
                </span>
              ))}
            </div>

            <div className="mt-4 flex items-stretch gap-3">
              <textarea
                value={typedText}
                onChange={(event) => {
                  if (secondsLeft <= 0) return;
                  setTypedText(event.target.value);
                  if (message) setMessage("");
                }}
                onPaste={(event) => {
                  event.preventDefault();
                  setMessage("ห้าม Copy / Paste กรุณาพิมพ์ด้วยตนเอง");
                }}
                onCopy={(event) => event.preventDefault()}
                onCut={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  setMessage("ห้ามลากข้อความมาวาง กรุณาพิมพ์ด้วยตนเอง");
                }}
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={blockClipboardShortcut}
                disabled={secondsLeft <= 0 || checking}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                placeholder="พิมพ์คำที่แสดงด้านบนที่นี่"
                className="min-h-[90px] flex-1 resize-none rounded-2xl border-2 border-violet-400 bg-white px-4 py-3 text-lg font-bold text-slate-950 outline-none transition focus:border-violet-600 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
              />
              <div className="flex w-[112px] shrink-0 flex-col gap-2">
                <div className={`flex flex-1 items-center justify-center rounded-2xl px-3 text-2xl font-black text-white ${secondsLeft > 10 ? "bg-emerald-500" : secondsLeft > 0 ? "bg-amber-500" : "bg-rose-500"}`}>
                  0:{String(secondsLeft).padStart(2, "0")}
                </div>
                <button
                  type="button"
                  onClick={resetAttempt}
                  className="flex h-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-2xl font-black text-white shadow-sm transition hover:brightness-105"
                  aria-label="เริ่มพิมพ์ใหม่"
                >
                  ↻
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2 text-xs font-black text-rose-500">
              <span>⚠</span>
              ห้าม Copy / Paste • ต้องพิมพ์ด้วยตนเอง
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div className="min-w-[150px] text-sm font-bold text-slate-600">พิมพ์แล้ว {typedWords.length} / {challenge.repeatCount} คำ</div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="w-12 text-right text-sm font-black text-slate-600">{progress}%</div>
            </div>

            {message ? (
              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${message.startsWith("ผ่าน") ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                {message}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-xs font-semibold text-violet-700">
                ระบบจะตรวจจำนวนคำและการสะกดตามคำที่กำหนด โดยอนุญาตให้ผิดได้ไม่เกิน {challenge.allowedMistakes} คำ
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => void verify()}
                disabled={checking || secondsLeft <= 0 || typedWords.length < challenge.repeatCount}
                className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 text-sm font-black text-white shadow-[0_12px_30px_rgba(109,40,217,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {checking ? "กำลังตรวจสอบ..." : "✓ ตรวจสอบ"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
