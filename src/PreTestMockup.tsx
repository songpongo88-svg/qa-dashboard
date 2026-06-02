import React, { useEffect, useMemo, useState } from "react";

type CurrentUserLike = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
};

type Choice = {
  id: string;
  text: string;
};

type PreTestQuestion = {
  id: number;
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
};

type PreparedQuestion = PreTestQuestion & {
  shuffledChoices: Choice[];
};

type PreTestMockupProps = {
  currentUser?: CurrentUserLike | null;
};

const TEST_SECONDS = 90;
const PASS_SCORE = 6;
const TOTAL_SCORE = 10;

const QUESTIONS: PreTestQuestion[] = [
  {
    id: 1,
    prompt: 'ร้านค้าสอบถามว่า "ร้านบน Robinhood สามารถเข้าร่วมโครงการไทยช่วยไทย พลัส ได้หรือไม่"',
    correctChoiceId: "C",
    choices: [
      { id: "A", text: "ไม่สามารถเข้าร่วมได้" },
      { id: "B", text: "สามารถเข้าร่วมได้เฉพาะหน้าร้าน" },
      { id: "C", text: "สามารถเข้าร่วมได้ โดยสมัครตามเงื่อนไขโครงการ" },
      { id: "D", text: "เฉพาะร้านค้าที่จด VAT เท่านั้น" },
    ],
  },
  {
    id: 2,
    prompt: 'ร้านค้า Robinhood สอบถามว่า "หากเป็นร้านใหม่ ต้องสมัครเข้าร่วมโครงการช่วงใด"',
    correctChoiceId: "A",
    choices: [
      { id: "A", text: "25 พ.ค. 69 - 31 ก.ค. 69" },
      { id: "B", text: "1 มิ.ย. 69 - 31 ก.ค. 69" },
      { id: "C", text: "10 มิ.ย. 69 - 31 ก.ค. 69" },
      { id: "D", text: "1 ก.ค. 69 - 31 ก.ค. 69" },
    ],
  },
  {
    id: 3,
    prompt: "ร้านค้า Robinhood แจ้งว่าเคยเข้าร่วมคนละครึ่ง พลัส และพบแบนเนอร์ในแอปถุงเงิน แอดมินควรแนะนำอย่างไร",
    correctChoiceId: "B",
    choices: [
      { id: "A", text: "สมัครใหม่ทุกกรณี" },
      { id: "B", text: "กดรับสิทธิ์ผ่านแบนเนอร์ได้เลย" },
      { id: "C", text: "ติดต่อ Robinhood ก่อน" },
      { id: "D", text: "รอ SMS ยืนยัน" },
    ],
  },
  {
    id: 4,
    prompt: 'ร้านค้า Robinhood สอบถามว่า "ลูกค้าจะใช้สิทธิ์ผ่านแอปอะไร"',
    correctChoiceId: "C",
    choices: [
      { id: "A", text: "ถุงเงิน" },
      { id: "B", text: "Robinhood" },
      { id: "C", text: "เป๋าตัง" },
      { id: "D", text: "Krungthai NEXT" },
    ],
  },
  {
    id: 5,
    prompt: 'ร้านค้า Robinhood สอบถามว่า "ร้านค้าต้องใช้แอปอะไรในการรับชำระเงิน"',
    correctChoiceId: "D",
    choices: [
      { id: "A", text: "Robinhood Rider" },
      { id: "B", text: "Robinhood Merchant" },
      { id: "C", text: "เป๋าตัง" },
      { id: "D", text: "ถุงเงิน" },
    ],
  },
  {
    id: 6,
    prompt: "ลูกค้าสั่งอาหารผ่าน Robinhood เวลา 22.00 น. และต้องการใช้สิทธิ์ไทยช่วยไทย พลัส แอดมินควรตอบอย่างไร",
    correctChoiceId: "B",
    choices: [
      { id: "A", text: "สามารถใช้สิทธิ์ได้" },
      { id: "B", text: "ไม่สามารถใช้สิทธิ์ได้ เนื่องจากสิทธิ์ Food Delivery ใช้ได้ถึง 21.00 น." },
      { id: "C", text: "ใช้ได้เฉพาะวันหยุด" },
      { id: "D", text: "ใช้ได้เฉพาะหน้าร้าน" },
    ],
  },
  {
    id: 7,
    prompt: 'ร้านค้า Robinhood สอบถามว่า "สิทธิ์สแกนหน้าร้านใช้ได้ถึงกี่โมง"',
    correctChoiceId: "C",
    choices: [
      { id: "A", text: "21.00 น." },
      { id: "B", text: "22.00 น." },
      { id: "C", text: "23.00 น." },
      { id: "D", text: "24.00 น." },
    ],
  },
  {
    id: 8,
    prompt: "ร้านค้า Robinhood ต้องการเข้าร่วมโครงการ จำเป็นต้องมีบัญชีกับธนาคารใด",
    correctChoiceId: "C",
    choices: [
      { id: "A", text: "กรุงเทพ" },
      { id: "B", text: "กสิกรไทย" },
      { id: "C", text: "กรุงไทย" },
      { id: "D", text: "ออมสิน" },
    ],
  },
  {
    id: 9,
    prompt: 'ร้านค้า Robinhood สอบถามว่า "ร้านเดิมต้องสมัครใหม่ทุกครั้งหรือไม่"',
    correctChoiceId: "B",
    choices: [
      { id: "A", text: "ใช่ ต้องสมัครใหม่ทุกครั้ง" },
      { id: "B", text: "ไม่จำเป็น หากพบแบนเนอร์ในแอปถุงเงินสามารถกดรับสิทธิ์ได้" },
      { id: "C", text: "ต้องติดต่อ Robinhood ก่อนทุกครั้ง" },
      { id: "D", text: "ต้องเปิดบัญชีใหม่ก่อน" },
    ],
  },
  {
    id: 10,
    prompt: "ข้อใดเป็นประโยชน์ที่ร้านค้า Robinhood จะได้รับจากโครงการ",
    correctChoiceId: "A",
    choices: [
      { id: "A", text: "เพิ่มช่องทางการขายผ่าน Food Delivery" },
      { id: "B", text: "ลดค่าคอมมิชชัน Robinhood เป็น 0%" },
      { id: "C", text: "ได้รับเงินสนับสนุนค่าขนส่ง" },
      { id: "D", text: "ได้รับเงินกู้ดอกเบี้ย 0%" },
    ],
  },
];

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seedText: string) {
  const random = seededRandom(hashString(seedText));
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getResult(score: number) {
  if (score >= PASS_SCORE) {
    return {
      label: "Pass",
      thaiLabel: "ผ่าน",
      detail: "ผ่านเกณฑ์การทดสอบ สามารถให้ข้อมูลโครงการในประเด็นหลักได้",
      color: "emerald",
    };
  }

  return {
    label: "Fail",
    thaiLabel: "ไม่ผ่าน",
    detail: "ยังไม่ผ่านเกณฑ์ ควรทบทวนข้อมูลโครงการเพิ่มเติมก่อนให้บริการ",
    color: "rose",
  };
}

export default function PreTestMockup({ currentUser }: PreTestMockupProps) {
  const userSeed = `${currentUser?.username || "guest"}|${currentUser?.displayName || ""}|thai-help-plus-robinhood-pretest-v2`;
  const preparedQuestions = useMemo<PreparedQuestion[]>(() => {
    return shuffleWithSeed(QUESTIONS, `${userSeed}|questions`).map((question) => ({
      ...question,
      shuffledChoices: shuffleWithSeed(question.choices, `${userSeed}|answers|${question.id}`),
    }));
  }, [userSeed]);

  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(TEST_SECONDS);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submittedAt, setSubmittedAt] = useState("");

  const score = useMemo(() => {
    return QUESTIONS.reduce((total, question) => total + (answers[question.id] === question.correctChoiceId ? 1 : 0), 0);
  }, [answers]);
  const result = getResult(score);
  const answeredCount = Object.keys(answers).length;
  const passed = score >= PASS_SCORE;

  useEffect(() => {
    if (!started || completed) return;
    if (remainingSeconds <= 0) {
      setCompleted(true);
      setSubmittedAt(new Date().toLocaleString("th-TH", { hour12: false }));
      return;
    }
    const timer = window.setTimeout(() => setRemainingSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [completed, remainingSeconds, started]);

  function startTest() {
    setStarted(true);
    setCompleted(false);
    setRemainingSeconds(TEST_SECONDS);
    setAnswers({});
    setSubmittedAt("");
  }

  function submitTest() {
    setCompleted(true);
    setSubmittedAt(new Date().toLocaleString("th-TH", { hour12: false }));
  }

  function resetTest() {
    setStarted(false);
    setCompleted(false);
    setRemainingSeconds(TEST_SECONDS);
    setAnswers({});
    setSubmittedAt("");
  }

  return (
    <div className="min-h-screen bg-[#f7f4ff] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[34px] border border-violet-200 bg-white shadow-[0_24px_70px_rgba(76,29,149,0.14)]">
        <div className="bg-gradient-to-r from-slate-950 via-violet-950 to-fuchsia-700 px-6 py-8 text-white sm:px-9">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.28em] text-violet-100">Pre-Test Workspace</div>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">แบบทดสอบสถานการณ์</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-violet-100 sm:text-base">
                โครงการไทยช่วยไทย พลัส 60/40 สำหรับร้านค้า Robinhood · เลือกคำตอบที่ถูกต้องที่สุดเพียง 1 ข้อ
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[560px]">
              <div className="rounded-3xl border border-white/20 bg-white/10 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-100">User</div>
                <div className="mt-1 text-sm font-black">{currentUser?.displayName || "Guest"}</div>
                <div className="text-xs font-semibold text-violet-100">{currentUser?.role || "Pre-Test"}</div>
              </div>
              <div className="rounded-3xl border border-white/20 bg-white/10 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-100">Timer</div>
                <div className={`mt-1 text-2xl font-black ${remainingSeconds <= 15 && started && !completed ? "text-amber-200" : "text-white"}`}>
                  {formatDuration(remainingSeconds)}
                </div>
              </div>
              <div className="rounded-3xl border border-white/20 bg-white/10 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-100">Progress</div>
                <div className="mt-1 text-2xl font-black">{answeredCount}/{TOTAL_SCORE}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_360px] lg:p-8">
          <main className="space-y-5">
            {!started ? (
              <section className="rounded-[28px] border border-violet-100 bg-violet-50/70 p-6">
                <div className="text-[11px] font-black uppercase tracking-[0.24em] text-violet-700">Instruction</div>
                <h2 className="mt-2 text-2xl font-black">เริ่มทำแบบทดสอบเมื่อพร้อม</h2>
                <p className="mt-2 text-sm font-semibold leading-7 text-slate-600">
                  ระบบจะสลับลำดับคำถามและตัวเลือกตามผู้ใช้งานที่ล็อกอิน เพื่อช่วยลดการลอกกัน ระยะเวลาทำข้อสอบคือ 1 นาที 30 วินาที
                </p>
                <button
                  type="button"
                  onClick={startTest}
                  className="mt-5 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-[0_14px_34px_rgba(15,23,42,0.20)] transition hover:bg-violet-800"
                >
                  Start Pre-Test
                </button>
              </section>
            ) : null}

            {started ? (
              <section className="space-y-4">
                {preparedQuestions.map((question, displayIndex) => {
                  const selectedChoice = answers[question.id];
                  return (
                    <article key={question.id} className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm transition">
                      <div className="flex gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-700 text-sm font-black text-white">
                          {displayIndex + 1}
                        </div>
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Scenario Question</div>
                          <div className="mt-1 whitespace-pre-line text-base font-black leading-7 text-slate-950">{question.prompt}</div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {question.shuffledChoices.map((choice) => {
                          const checked = selectedChoice === choice.id;
                          return (
                            <button
                              key={choice.id}
                              type="button"
                              disabled={completed}
                              onClick={() => setAnswers((current) => ({ ...current, [question.id]: choice.id }))}
                              className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
                                checked
                                  ? "border-violet-500 bg-violet-50 text-violet-950 shadow-[0_10px_24px_rgba(124,58,237,0.14)]"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                              } ${completed ? "cursor-not-allowed opacity-80" : ""}`}
                            >
                              <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                                {choice.id}
                              </span>
                              {choice.text}
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </section>
            ) : null}
          </main>

          <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
            <section className="overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-[0_18px_48px_rgba(76,29,149,0.12)]">
              <div className={`px-5 py-5 text-white ${completed && !passed ? "bg-gradient-to-br from-rose-700 to-orange-600" : "bg-gradient-to-br from-emerald-700 to-sky-700"}`}>
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/80">Result Panel</div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <div className="text-5xl font-black">{completed ? score : "-"}</div>
                    <div className="text-sm font-black text-white/80">/ {TOTAL_SCORE} คะแนน</div>
                  </div>
                  <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-2 text-right">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/80">Pass Mark</div>
                    <div className="text-xl font-black">{PASS_SCORE}/{TOTAL_SCORE}</div>
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-5">
                {completed ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Assessment</div>
                    <div className="mt-2 text-xl font-black text-slate-950">{result.label}</div>
                    <div className={`text-sm font-black ${passed ? "text-emerald-700" : "text-rose-700"}`}>{result.thaiLabel}</div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{result.detail}</p>
                    <div className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-800">
                      ตอบถูก {score} จาก {TOTAL_SCORE} ข้อ
                    </div>
                    <div className="mt-3 text-xs font-bold text-slate-500">Submitted at: {submittedAt}</div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50 p-4 text-sm font-bold leading-6 text-violet-900">
                    กด Start แล้วเลือกคำตอบให้ครบ ระบบจะแสดงเฉพาะคะแนนรวมและผลผ่าน/ไม่ผ่านหลัง Submit หรือหมดเวลา
                  </div>
                )}

                <div className="grid gap-2">
                  {!started ? (
                    <button type="button" onClick={startTest} className="rounded-2xl bg-violet-700 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-800">
                      Start Pre-Test
                    </button>
                  ) : completed ? (
                    <button type="button" onClick={resetTest} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-800">
                      Restart Test
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={submitTest}
                      className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-800"
                    >
                      Submit Pre-Test
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Scoring Criteria</div>
              <div className="mt-3 space-y-2">
                {[
                  ["6-10", "Pass", "ผ่าน"],
                  ["0-5", "Fail", "ไม่ผ่าน"],
                ].map(([range, label, thaiLabel]) => (
                  <div key={range} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="text-sm font-black text-slate-950">{range}</div>
                    <div className="text-right">
                      <div className="text-xs font-black text-slate-900">{label}</div>
                      <div className="text-[11px] font-bold text-slate-500">{thaiLabel}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black leading-5 text-emerald-800">
                คะแนนขั้นต่ำที่ถือว่าผ่าน: {PASS_SCORE} คะแนน จาก {TOTAL_SCORE} คะแนน
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
