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
  importantTopic?: string;
};

type PreparedQuestion = PreTestQuestion & {
  shuffledChoices: Choice[];
};

type PreTestMockupProps = {
  currentUser?: CurrentUserLike | null;
};

const TEST_SECONDS = 90;
const PASS_SCORE = 11;

const QUESTIONS: PreTestQuestion[] = [
  {
    id: 1,
    prompt: 'ร้านค้าสอบถามว่า "ต้องใช้แอปอะไรในการรับชำระเงินจากโครงการ"',
    correctChoiceId: "C",
    importantTopic: "แอปเป๋าตัง / แอปถุงเงิน",
    choices: [
      { id: "A", text: "เป๋าตัง" },
      { id: "B", text: "Robinhood" },
      { id: "C", text: "ถุงเงิน" },
      { id: "D", text: "Krungthai NEXT" },
    ],
  },
  {
    id: 2,
    prompt: 'ลูกค้าสอบถามว่า "จะใช้สิทธิ์ไทยช่วยไทย พลัส ผ่านแอปอะไร"',
    correctChoiceId: "B",
    importantTopic: "แอปเป๋าตัง / แอปถุงเงิน",
    choices: [
      { id: "A", text: "ถุงเงิน" },
      { id: "B", text: "เป๋าตัง" },
      { id: "C", text: "Robinhood" },
      { id: "D", text: "Mobile Banking" },
    ],
  },
  {
    id: 3,
    prompt: "ร้านค้าแจ้งว่าเคยเข้าร่วมคนละครึ่ง พลัส มาก่อน และพบแบนเนอร์โครงการในแอปถุงเงิน\n\nแอดมินควรแนะนำอย่างไร",
    correctChoiceId: "B",
    importantTopic: "ร้านค้าเดิมต้องสมัครใหม่หรือไม่",
    choices: [
      { id: "A", text: "สมัครใหม่ทันที" },
      { id: "B", text: "กดรับสิทธิ์ผ่านแบนเนอร์ได้เลย" },
      { id: "C", text: "ติดต่อธนาคารกรุงไทยก่อน" },
      { id: "D", text: "รอ SMS ยืนยัน" },
    ],
  },
  {
    id: 4,
    prompt: "ร้านค้าแจ้งว่าเคยเข้าร่วมคนละครึ่ง พลัส แต่ไม่พบแบนเนอร์ในแอปถุงเงิน\n\nแอดมินควรแนะนำอย่างไร",
    correctChoiceId: "A",
    importantTopic: "ร้านค้าเดิมต้องสมัครใหม่หรือไม่",
    choices: [
      { id: "A", text: "สมัครเข้าร่วมโครงการใหม่" },
      { id: "B", text: "เปลี่ยนเบอร์โทรศัพท์" },
      { id: "C", text: "ลบแอปและติดตั้งใหม่เท่านั้น" },
      { id: "D", text: "รอระบบอนุมัติอัตโนมัติ" },
    ],
  },
  {
    id: 5,
    prompt: "ลูกค้าสอบถามว่าต้องการค้นหาร้านค้าที่เข้าร่วมโครงการ\n\nควรแนะนำช่องทางใด",
    correctChoiceId: "A",
    importantTopic: "แอปเป๋าตัง / แอปถุงเงิน",
    choices: [
      { id: "A", text: "แอปเป๋าตัง" },
      { id: "B", text: "แอปถุงเงิน" },
      { id: "C", text: "ATM กรุงไทย" },
      { id: "D", text: "เว็บไซต์สรรพากร" },
    ],
  },
  {
    id: 6,
    prompt: 'ร้านค้าสอบถามว่า "ประชาชนใช้แอปถุงเงินหรือไม่"',
    correctChoiceId: "B",
    importantTopic: "แอปเป๋าตัง / แอปถุงเงิน",
    choices: [
      { id: "A", text: "ใช่ ใช้ทั้งร้านค้าและประชาชน" },
      { id: "B", text: "ไม่ใช่ ประชาชนใช้แอปเป๋าตัง" },
      { id: "C", text: "ใช้เฉพาะผู้ส่งอาหาร" },
      { id: "D", text: "ใช้เฉพาะร้านค้าใหม่" },
    ],
  },
  {
    id: 7,
    prompt: 'ร้านค้าสอบถามว่า "หากจะเข้าร่วมโครงการ ต้องมีบัญชีธนาคารใด"',
    correctChoiceId: "B",
    choices: [
      { id: "A", text: "กสิกรไทย" },
      { id: "B", text: "กรุงไทย" },
      { id: "C", text: "กรุงเทพ" },
      { id: "D", text: "ออมสิน" },
    ],
  },
  {
    id: 8,
    prompt: "ลูกค้าต้องการใช้สิทธิ์สแกนจ่ายเวลา 22.00 น.\n\nสามารถใช้สิทธิ์ได้หรือไม่",
    correctChoiceId: "B",
    importantTopic: "ช่วงเวลาใช้สิทธิ์",
    choices: [
      { id: "A", text: "ไม่ได้ เพราะหมดเวลาตั้งแต่ 21.00 น." },
      { id: "B", text: "ได้ เพราะสิทธิ์สแกนจ่ายใช้ได้ถึง 23.00 น." },
      { id: "C", text: "ได้ตลอด 24 ชั่วโมง" },
      { id: "D", text: "ใช้ได้เฉพาะวันหยุด" },
    ],
  },
  {
    id: 9,
    prompt: "ลูกค้าต้องการสั่งอาหารผ่านฟู้ดเดลิเวอรีเวลา 22.00 น.\n\nแอดมินควรตอบอย่างไร",
    correctChoiceId: "B",
    importantTopic: "ช่วงเวลาใช้สิทธิ์",
    choices: [
      { id: "A", text: "ใช้สิทธิ์ได้ถึง 23.00 น." },
      { id: "B", text: "ใช้สิทธิ์ได้ถึง 21.00 น." },
      { id: "C", text: "ใช้ได้ตลอด 24 ชั่วโมง" },
      { id: "D", text: "ใช้ได้เฉพาะหน้าร้าน" },
    ],
  },
  {
    id: 10,
    prompt: "ร้านค้าแจ้งว่าเพิ่งสมัครร้านค้าใหม่ และต้องการทราบช่วงเวลารับสมัคร",
    correctChoiceId: "A",
    importantTopic: "วันเปิดรับสมัครโครงการ",
    choices: [
      { id: "A", text: "25 พ.ค. 69 - 31 ก.ค. 69" },
      { id: "B", text: "1 มิ.ย. 69 - 30 ก.ย. 69" },
      { id: "C", text: "15 มิ.ย. 69 - 30 ก.ย. 69" },
      { id: "D", text: "1 ก.ค. 69 - 31 ก.ค. 69" },
    ],
  },
  {
    id: 11,
    prompt: "ร้านค้าฟู้ดเดลิเวอรีสอบถามว่าสามารถสมัครเข้าร่วมโครงการได้ตั้งแต่เมื่อใด",
    correctChoiceId: "C",
    importantTopic: "วันเปิดรับสมัครโครงการ",
    choices: [
      { id: "A", text: "25 พ.ค. 69" },
      { id: "B", text: "1 มิ.ย. 69" },
      { id: "C", text: "10 มิ.ย. 69" },
      { id: "D", text: "15 มิ.ย. 69" },
    ],
  },
  {
    id: 12,
    prompt: "ลูกค้าสอบถามว่ารัฐช่วยออกค่าส่วนลดสูงสุดเท่าไร",
    correctChoiceId: "C",
    choices: [
      { id: "A", text: "40%" },
      { id: "B", text: "50%" },
      { id: "C", text: "60%" },
      { id: "D", text: "70%" },
    ],
  },
  {
    id: 13,
    prompt: "ร้านค้าแจ้งว่าเข้าร่วมโครงการแล้ว จะได้รับประโยชน์ด้านใดเพิ่มเติม",
    correctChoiceId: "B",
    choices: [
      { id: "A", text: "ลดภาษีทันที" },
      { id: "B", text: "เพิ่มช่องทางขายผ่านฟู้ดเดลิเวอรี" },
      { id: "C", text: "ได้รับเงินสนับสนุนพนักงาน" },
      { id: "D", text: "ได้รับสินเชื่อดอกเบี้ย 0%" },
    ],
  },
  {
    id: 14,
    prompt: 'ร้านค้าสอบถามว่า "ร้านขนส่งสาธารณะสามารถเข้าร่วมโครงการได้หรือไม่"',
    correctChoiceId: "C",
    choices: [
      { id: "A", text: "ได้ทุกกรณี" },
      { id: "B", text: "ได้เฉพาะร้านใหม่" },
      { id: "C", text: "ไม่สามารถเข้าร่วมได้" },
      { id: "D", text: "ได้เฉพาะช่วงโปรโมชั่น" },
    ],
  },
  {
    id: 15,
    prompt: 'ร้านค้าสอบถามว่า "ถุงเงินใช้ทำอะไรในโครงการ"',
    correctChoiceId: "B",
    importantTopic: "แอปเป๋าตัง / แอปถุงเงิน",
    choices: [
      { id: "A", text: "ใช้ค้นหาร้านค้า" },
      { id: "B", text: "ใช้รับชำระเงินของร้านค้า" },
      { id: "C", text: "ใช้สมัครสินเชื่อ" },
      { id: "D", text: "ใช้โอนเงินส่วนบุคคล" },
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
  if (score >= 13) {
    return {
      label: "Excellent",
      thaiLabel: "ผ่านระดับดีมาก",
      range: "13 - 15 คะแนน",
      detail: "มีความรู้และความเข้าใจโครงการ สามารถให้ข้อมูลได้ถูกต้อง",
      color: "emerald",
    };
  }
  if (score >= PASS_SCORE) {
    return {
      label: "Pass",
      thaiLabel: "ผ่าน",
      range: "11 - 12 คะแนน",
      detail: "มีความรู้เพียงพอในการให้บริการ แต่ควรทบทวนบางหัวข้อ",
      color: "sky",
    };
  }
  if (score >= 9) {
    return {
      label: "Conditional Pass",
      thaiLabel: "ผ่านแบบมีเงื่อนไข",
      range: "9 - 10 คะแนน",
      detail: "ต้องทบทวนเนื้อหาเพิ่มเติมและทำแบบทดสอบซ้ำ",
      color: "amber",
    };
  }
  return {
    label: "Fail",
    thaiLabel: "ไม่ผ่าน",
    range: "0 - 8 คะแนน",
    detail: "ต้องอบรมเพิ่มเติมก่อนให้บริการเกี่ยวกับโครงการ",
    color: "rose",
  };
}

export default function PreTestMockup({ currentUser }: PreTestMockupProps) {
  const userSeed = `${currentUser?.username || "guest"}|${currentUser?.displayName || ""}|thai-help-plus-pretest-v1`;
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
  const wrongImportantTopics = useMemo(() => {
    const topics = new Set<string>();
    QUESTIONS.forEach((question) => {
      if (question.importantTopic && answers[question.id] && answers[question.id] !== question.correctChoiceId) {
        topics.add(question.importantTopic);
      }
    });
    return Array.from(topics);
  }, [answers]);

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
                โครงการไทยช่วยไทย พลัส 60/40 · เลือกคำตอบที่ถูกต้องที่สุดเพียง 1 ข้อ
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
                <div className="mt-1 text-2xl font-black">{answeredCount}/15</div>
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
                    <article
                      key={question.id}
                      className={`rounded-[28px] border bg-white p-5 shadow-sm transition ${
                        completed && selectedChoice === question.correctChoiceId
                          ? "border-emerald-200 bg-emerald-50/40"
                          : completed && selectedChoice
                          ? "border-rose-200 bg-rose-50/30"
                          : "border-violet-100"
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-700 text-sm font-black text-white">
                            {displayIndex + 1}
                          </div>
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Scenario Question</div>
                            <div className="mt-1 whitespace-pre-line text-base font-black leading-7 text-slate-950">{question.prompt}</div>
                          </div>
                        </div>
                        {completed ? (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-black ${
                              selectedChoice === question.correctChoiceId
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {selectedChoice === question.correctChoiceId ? "Correct" : "Review"}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {question.shuffledChoices.map((choice) => {
                          const checked = selectedChoice === choice.id;
                          const isCorrect = completed && choice.id === question.correctChoiceId;
                          const isWrongSelected = completed && checked && choice.id !== question.correctChoiceId;
                          return (
                            <button
                              key={choice.id}
                              type="button"
                              disabled={completed}
                              onClick={() => setAnswers((current) => ({ ...current, [question.id]: choice.id }))}
                              className={`rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
                                isCorrect
                                  ? "border-emerald-300 bg-emerald-100 text-emerald-950"
                                  : isWrongSelected
                                  ? "border-rose-300 bg-rose-100 text-rose-950"
                                  : checked
                                  ? "border-violet-500 bg-violet-50 text-violet-950 shadow-[0_10px_24px_rgba(124,58,237,0.14)]"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50"
                              }`}
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
              <div className="bg-gradient-to-br from-emerald-700 to-sky-700 px-5 py-5 text-white">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100">Result Panel</div>
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <div className="text-5xl font-black">{completed ? score : "-"}</div>
                    <div className="text-sm font-black text-emerald-100">/ 15 คะแนน</div>
                  </div>
                  <div className="rounded-2xl border border-white/25 bg-white/15 px-4 py-2 text-right">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">Pass Mark</div>
                    <div className="text-xl font-black">11/15</div>
                  </div>
                </div>
              </div>
              <div className="space-y-4 p-5">
                {completed ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Assessment</div>
                    <div className="mt-2 text-xl font-black text-slate-950">{result.label}</div>
                    <div className="text-sm font-black text-violet-700">{result.thaiLabel}</div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{result.detail}</p>
                    <div className="mt-3 text-xs font-bold text-slate-500">Submitted at: {submittedAt}</div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50 p-4 text-sm font-bold leading-6 text-violet-900">
                    กด Start แล้วเลือกคำตอบให้ครบ ระบบจะแสดงคะแนนและผลผ่าน/ไม่ผ่านหลัง Submit หรือหมดเวลา
                  </div>
                )}

                {completed && wrongImportantTopics.length ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Important Review Topics</div>
                    <div className="mt-2 space-y-2">
                      {wrongImportantTopics.map((topic) => (
                        <div key={topic} className="rounded-xl bg-white px-3 py-2 text-sm font-black text-amber-900">
                          {topic}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

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
                  ["13-15", "Excellent", "ผ่านระดับดีมาก"],
                  ["11-12", "Pass", "ผ่าน"],
                  ["9-10", "Conditional Pass", "ผ่านแบบมีเงื่อนไข"],
                  ["0-8", "Fail", "ไม่ผ่าน"],
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
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
