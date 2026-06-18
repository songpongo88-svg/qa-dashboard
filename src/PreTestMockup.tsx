import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { THT_PLUS_2026_PRETEST_SET } from "./preTestThtPlus2026";
import { fetchUsageLogsByEventTypes, logUsageEvent, type UsageLogEvent } from "./usageLog";

type CurrentUserLike = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  loginAt?: string;
};

type QuestionChoice = {
  id: string;
  text: string;
};

type PreTestQuestion = {
  id: string;
  prompt: string;
  choices: QuestionChoice[];
  correctChoiceId: string;
  slideNote?: string;
};

type PreTestSet = {
  id: string;
  code: string;
  title: string;
  description: string;
  passScore: number;
  timeLimitSeconds: number;
  active: boolean;
  questions: PreTestQuestion[];
  updatedAt: string;
  updatedBy: string;
};

type PreparedQuestion = PreTestQuestion & {
  shuffledChoices: QuestionChoice[];
};

type PreTestResult = {
  id: string;
  setId: string;
  setCode: string;
  setTitle: string;
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  startedAt: string;
  submittedAt: string;
  score: number;
  total: number;
  passScore: number;
  result: "Pass" | "Fail";
  answers: Record<string, string>;
  questions?: PreTestQuestion[];
};

type AttemptSession = {
  attemptId: string;
  setId: string;
  username: string;
  startedAt: string;
  preparedQuestions: PreparedQuestion[];
  currentQuestionIndex: number;
  answers: Record<string, string>;
};

type PreTestMockupProps = {
  currentUser?: CurrentUserLike | null;
  canTakePreTest?: boolean;
  canManagePreTest?: boolean;
  canViewPreTestResults?: boolean;
};

type WorkspaceTab = "take" | "sets" | "history";

const SETS_STORAGE_KEY = "qa-dashboard:pre-test-sets";
const RESULTS_STORAGE_KEY = "qa-dashboard:pre-test-results";
const ACTIVE_ATTEMPT_STORAGE_KEY = "qa-dashboard:pre-test-active-attempt";
const DEFAULT_SET_ID = "thai-help-plus-robinhood-2026";
const RESULTS_HISTORY_BASELINE_AT = "2026-06-03T09:03:00+07:00";
const FORM_INPUT_CLASS = "h-[52px] w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50";

const DEFAULT_QUESTIONS: PreTestQuestion[] = [
  {
    id: "q1",
    correctChoiceId: "B",
    prompt: 'ร้านค้า Robinhood สอบถามว่าเคยเข้าร่วมคนละครึ่ง พลัส มาก่อน ต้องสมัครใหม่หรือไม่',
    choices: [
      { id: "A", text: "ต้องสมัครใหม่ทุกกรณี" },
      { id: "B", text: 'หากพบปุ่ม "ไทยช่วยไทย พลัส (60/40)" ในแอปถุงเงิน สามารถกดเข้าร่วมได้เลย' },
      { id: "C", text: "ต้องติดต่อ Robinhood ก่อน" },
      { id: "D", text: "ต้องติดต่อธนาคารก่อน" },
    ],
  },
  {
    id: "q2",
    correctChoiceId: "C",
    prompt: 'ร้านค้า Robinhood แจ้งว่าไม่พบปุ่ม "ไทยช่วยไทย พลัส (60/40)" ในแอปถุงเงิน แอดมินควรแนะนำอย่างไร',
    choices: [
      { id: "A", text: "รอระบบอัปเดต" },
      { id: "B", text: "เปลี่ยนเบอร์โทรศัพท์" },
      { id: "C", text: "สมัครเข้าร่วมโครงการใหม่" },
      { id: "D", text: "ลบแอปและติดตั้งใหม่" },
    ],
  },
  {
    id: "q3",
    correctChoiceId: "B",
    prompt: "ร้านค้าใหม่ที่ต้องการเข้าร่วมโครงการ สามารถสมัครได้ถึงวันใด",
    choices: [
      { id: "A", text: "30 มิ.ย. 69" },
      { id: "B", text: "31 ก.ค. 69" },
      { id: "C", text: "31 ส.ค. 69" },
      { id: "D", text: "30 ก.ย. 69" },
    ],
  },
  {
    id: "q4",
    correctChoiceId: "C",
    prompt: "ร้านค้าฟู้ดเดลิเวอรีแพลตฟอร์ม สามารถสมัครเข้าร่วมโครงการได้ตั้งแต่วันใด",
    choices: [
      { id: "A", text: "25 พ.ค. 69" },
      { id: "B", text: "1 มิ.ย. 69" },
      { id: "C", text: "10 มิ.ย. 69" },
      { id: "D", text: "15 มิ.ย. 69" },
    ],
  },
  {
    id: "q5",
    correctChoiceId: "C",
    prompt: "ลูกค้าต้องการใช้สิทธิ์ไทยช่วยไทย พลัส ผ่าน Robinhood Food สิทธิ์จะเริ่มใช้งานได้ตั้งแต่วันใด",
    choices: [
      { id: "A", text: "1 มิ.ย. 69" },
      { id: "B", text: "10 มิ.ย. 69" },
      { id: "C", text: "15 มิ.ย. 69" },
      { id: "D", text: "30 ก.ย. 69" },
    ],
  },
  {
    id: "q6",
    correctChoiceId: "B",
    prompt: "ลูกค้าต้องการใช้สิทธิ์ผ่าน Robinhood Food เวลา 22.00 น. สามารถใช้สิทธิ์ได้หรือไม่",
    choices: [
      { id: "A", text: "ได้" },
      { id: "B", text: "ไม่ได้ เพราะสิทธิ์ Food Delivery ใช้ได้ถึง 21.00 น." },
      { id: "C", text: "ได้เฉพาะวันหยุด" },
      { id: "D", text: "ได้เฉพาะร้านอาหารบางประเภท" },
    ],
  },
  {
    id: "q7",
    correctChoiceId: "B",
    prompt: "ร้านค้า Robinhood ต้องการเข้าร่วมโครงการไทยช่วยไทย พลัส ผ่าน Food Delivery ขั้นตอนแรกที่ต้องทำบนหน้า Robinhood Shop คืออะไร",
    choices: [
      { id: "A", text: "เปิดแอปถุงเงิน" },
      { id: "B", text: "กดเข้าร่วมร้านค้าไทยช่วยไทยพลัสบนหน้า App Robinhood" },
      { id: "C", text: "กรอก OTP" },
      { id: "D", text: "เลือกแพลตฟอร์ม Robinhood" },
    ],
  },
  {
    id: "q8",
    correctChoiceId: "C",
    prompt: "หลังจากกดเข้าร่วมร้านค้าไทยช่วยไทยพลัสบนหน้า Robinhood Shop แล้ว ขั้นตอนถัดไปคืออะไร",
    choices: [
      { id: "A", text: "กรอก OTP" },
      { id: "B", text: "เปิดแอปเป๋าตัง" },
      { id: "C", text: "คัดลอก Ref Code" },
      { id: "D", text: "รอ SMS" },
    ],
  },
  {
    id: "q9",
    correctChoiceId: "C",
    prompt: "ร้านค้า Robinhood ได้รับ Ref Code แล้ว ต้องนำ Ref Code ไปดำเนินการต่อที่ใด",
    choices: [
      { id: "A", text: "Robinhood Rider" },
      { id: "B", text: "เป๋าตัง" },
      { id: "C", text: "ถุงเงิน" },
      { id: "D", text: "Krungthai NEXT" },
    ],
  },
  {
    id: "q10",
    correctChoiceId: "B",
    prompt: "เมื่อเข้าสู่แอปถุงเงินแล้ว ร้านค้า Robinhood ต้องเลือกเมนูใดเพื่อดำเนินการสมัคร",
    choices: [
      { id: "A", text: "ประวัติรายการ" },
      { id: "B", text: "ฟู้ดเดลิเวอรีแพลตฟอร์ม" },
      { id: "C", text: "ตั้งค่า" },
      { id: "D", text: "โปรโมชัน" },
    ],
  },
  {
    id: "q11",
    correctChoiceId: "D",
    prompt: "ร้านค้า Robinhood ต้องเลือกแพลตฟอร์มใดในแอปถุงเงินเพื่อเชื่อมต่อการสมัคร",
    choices: [
      { id: "A", text: "Grab" },
      { id: "B", text: "LINE MAN" },
      { id: "C", text: "foodpanda" },
      { id: "D", text: "Robinhood" },
    ],
  },
  {
    id: "q12",
    correctChoiceId: "C",
    prompt: "ข้อใดเป็นเงื่อนไขสำคัญในการเลือกฟู้ดเดลิเวอรีแพลตฟอร์มเข้าร่วมโครงการ",
    choices: [
      { id: "A", text: "เลือกได้หลายแพลตฟอร์มพร้อมกัน" },
      { id: "B", text: "เลือกได้เฉพาะแพลตฟอร์มที่มี GP ต่ำสุด" },
      { id: "C", text: "เลือกได้เพียง 1 ฟู้ดเดลิเวอรีแพลตฟอร์มตลอดโครงการ" },
      { id: "D", text: "เลือกเปลี่ยนได้ทุก 7 วัน" },
    ],
  },
  {
    id: "q13",
    correctChoiceId: "C",
    prompt: "จากภาพประชาสัมพันธ์ Robinhood Shop ร้านค้าที่เข้าร่วมโครงการจะได้รับ GP เท่าใด",
    choices: [
      { id: "A", text: "8.5%" },
      { id: "B", text: "9.5%" },
      { id: "C", text: "10.5%" },
      { id: "D", text: "12.5%" },
    ],
  },
  {
    id: "q14",
    correctChoiceId: "B",
    prompt: "หลังจากกรอก Ref Code เรียบร้อยแล้ว ระบบจะส่งรหัสใดเพื่อยืนยันการสมัคร",
    choices: [
      { id: "A", text: "GP Code" },
      { id: "B", text: "OTP" },
      { id: "C", text: "PIN" },
      { id: "D", text: "Verification Code" },
    ],
  },
  {
    id: "q15",
    correctChoiceId: "C",
    prompt: "ร้านค้า Robinhood จะทราบได้อย่างไรว่าการสมัครเข้าร่วมโครงการสำเร็จ",
    choices: [
      { id: "A", text: "Robinhood โทรแจ้ง" },
      { id: "B", text: "ได้รับ Email" },
      { id: "C", text: "หน้าจอแสดงได้รับคำขอสมัครเข้าร่วมโครงการไทยช่วยไทยพลัส" },
      { id: "D", text: "ได้รับ SMS จากธนาคาร" },
    ],
  },
];

const DEFAULT_SET: PreTestSet = {
  id: DEFAULT_SET_ID,
  code: "PRE-THAI-HELP-PLUS-2026",
  title: "Scenario Based Pre-Test: ไทยช่วยไทย พลัส 60/40",
  description: "แบบทดสอบสถานการณ์สำหรับทีม Robinhood QA และ Admin Live Chat",
  passScore: 11,
  timeLimitSeconds: 90,
  active: true,
  questions: DEFAULT_QUESTIONS,
  updatedAt: "2026-06-03T02:30:00+07:00",
  updatedBy: "System",
};

const BUILT_IN_PRE_TEST_SETS: PreTestSet[] = [
  DEFAULT_SET,
  THT_PLUS_2026_PRETEST_SET,
];

function safeJsonArray<T>(value: string | null): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function readLocal<T>(key: string) {
  if (typeof window === "undefined") return [];
  return safeJsonArray<T>(window.localStorage.getItem(key));
}

function writeLocal<T>(key: string, rows: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Local cache is a fallback when central logging is unavailable.
  }
}

function readLocalObject<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeLocalObject<T>(key: string, value: T | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(key, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Local attempt cache is only used to keep timing honest after reloads.
  }
}

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

function formatDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

function getChoiceText(question: PreTestQuestion, choiceId?: string) {
  if (!choiceId) return "-";
  const choice = question.choices.find((item) => item.id === choiceId);
  return choice ? choice.text : choiceId;
}

function createBlankQuestion(index: number): PreTestQuestion {
  return {
    id: `q${Date.now()}-${index}`,
    prompt: "",
    correctChoiceId: "A",
    choices: [
      { id: "A", text: "" },
      { id: "B", text: "" },
      { id: "C", text: "" },
      { id: "D", text: "" },
    ],
  };
}

function normalizeSet(raw: unknown): PreTestSet | null {
  const item = raw as Partial<PreTestSet>;
  if (!item || typeof item !== "object") return null;
  if (!item.id || !item.title || !Array.isArray(item.questions)) return null;
  const questions = item.questions
    .map((question, index) => {
      const next = question as Partial<PreTestQuestion>;
      if (!next.prompt || !Array.isArray(next.choices)) return null;
      const choices = next.choices
        .map((choice) => ({ id: String(choice.id || ""), text: String(choice.text || "") }))
        .filter((choice) => choice.id && choice.text);
      if (!choices.length) return null;
      return {
        id: String(next.id || `q${index + 1}`),
        prompt: String(next.prompt),
        choices,
        correctChoiceId: String(next.correctChoiceId || choices[0]?.id || "A"),
        slideNote: String(next.slideNote || ""),
      };
    })
    .filter(Boolean) as PreTestQuestion[];
  if (!questions.length) return null;
  return {
    id: String(item.id),
    code: String(item.code || item.id),
    title: String(item.title),
    description: String(item.description || ""),
    passScore: Math.max(1, Number(item.passScore || 1)),
    timeLimitSeconds: Math.max(30, Number(item.timeLimitSeconds || 90)),
    active: item.active !== false,
    questions,
    updatedAt: String(item.updatedAt || new Date().toISOString()),
    updatedBy: String(item.updatedBy || "System"),
  };
}

function normalizeResult(raw: unknown): PreTestResult | null {
  const item = raw as Partial<PreTestResult>;
  if (!item || typeof item !== "object" || !item.id || !item.setId) return null;
  return {
    id: String(item.id),
    setId: String(item.setId),
    setCode: String(item.setCode || ""),
    setTitle: String(item.setTitle || ""),
    username: String(item.username || ""),
    displayName: String(item.displayName || ""),
    role: String(item.role || ""),
    agentName: String(item.agentName || ""),
    startedAt: String(item.startedAt || ""),
    submittedAt: String(item.submittedAt || ""),
    score: Number(item.score || 0),
    total: Number(item.total || 0),
    passScore: Number(item.passScore || 0),
    result: item.result === "Pass" ? "Pass" : "Fail",
    answers: (item.answers || {}) as Record<string, string>,
    questions: Array.isArray(item.questions) ? item.questions as PreTestQuestion[] : undefined,
  };
}

function mergeSets(localSets: PreTestSet[], logs: UsageLogEvent[]) {
  const map = new Map<string, PreTestSet>();
  const setLatest = (set: PreTestSet) => {
    if (set.id === DEFAULT_SET.id && set.questions.length < DEFAULT_SET.questions.length) {
      return;
    }
    const current = map.get(set.id);
    if (!current || new Date(set.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
      map.set(set.id, set);
    }
  };

  BUILT_IN_PRE_TEST_SETS.forEach(setLatest);
  localSets.forEach(setLatest);

  [...logs].reverse().forEach((log) => {
    if (log.event_type === "pretest_set_saved") {
      const set = normalizeSet(log.details?.set);
      if (set) setLatest(set);
    }
    if (log.event_type === "pretest_set_deleted") {
      const setId = String(log.details?.setId || "");
      if (setId && !BUILT_IN_PRE_TEST_SETS.some((set) => set.id === setId)) map.delete(setId);
    }
  });

  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function mergeResults(localResults: PreTestResult[], logs: UsageLogEvent[]) {
  const map = new Map<string, PreTestResult>();
  const baselineTime = new Date(RESULTS_HISTORY_BASELINE_AT).getTime();
  const isVisibleResult = (result: PreTestResult) => {
    const submittedTime = new Date(result.submittedAt).getTime();
    return Number.isNaN(submittedTime) || submittedTime >= baselineTime;
  };

  localResults.filter(isVisibleResult).forEach((result) => map.set(result.id, result));
  [...logs].reverse().forEach((log) => {
    if (log.event_type === "pretest_attempt_submitted") {
      const result = normalizeResult(log.details?.result);
      if (result && isVisibleResult(result)) map.set(result.id, result);
    }
    if (log.event_type === "pretest_attempt_reset") {
      const resultId = String(log.details?.resultId || "");
      const setId = String(log.details?.setId || "");
      const username = String(log.details?.username || "");
      if (resultId) {
        map.delete(resultId);
      } else if (setId && username) {
        [...map.values()].forEach((result) => {
          if (result.setId === setId && result.username === username) map.delete(result.id);
        });
      }
    }
    if (log.event_type === "pretest_history_cleared") {
      map.clear();
    }
  });
  return [...map.values()].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

function getDefaultTab(canManage: boolean, canViewResults: boolean): WorkspaceTab {
  if (canManage) return "sets";
  if (canViewResults) return "history";
  return "take";
}

export default function PreTestMockup({
  currentUser,
  canTakePreTest = true,
  canManagePreTest = false,
  canViewPreTestResults = false,
}: PreTestMockupProps) {
  const [sets, setSets] = useState<PreTestSet[]>(() => {
    const localSets = readLocal<PreTestSet>(SETS_STORAGE_KEY).map(normalizeSet).filter(Boolean) as PreTestSet[];
    return mergeSets(localSets, []);
  });
  const [results, setResults] = useState<PreTestResult[]>(() => {
    return readLocal<PreTestResult>(RESULTS_STORAGE_KEY).map(normalizeResult).filter(Boolean) as PreTestResult[];
  });
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(() => getDefaultTab(canManagePreTest, canViewPreTestResults));
  const [selectedSetId, setSelectedSetId] = useState(DEFAULT_SET_ID);
  const [editorSet, setEditorSet] = useState<PreTestSet | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyUserFilter, setHistoryUserFilter] = useState("all");
  const [historySetFilter, setHistorySetFilter] = useState("all");
  const [previewSetId, setPreviewSetId] = useState(DEFAULT_SET_ID);
  const [switchWarningCount, setSwitchWarningCount] = useState(0);

  const [attemptId, setAttemptId] = useState("");
  const [startedAt, setStartedAt] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [preparedQuestions, setPreparedQuestions] = useState<PreparedQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [resultScreen, setResultScreen] = useState<PreTestResult | null>(null);

  const activeSets = useMemo(() => sets.filter((set) => set.active), [sets]);
  const selectedSet = useMemo(() => {
    return sets.find((set) => set.id === selectedSetId) || activeSets[0] || sets[0] || DEFAULT_SET;
  }, [activeSets, selectedSetId, sets]);
  const previewSet = useMemo(() => {
    return sets.find((set) => set.id === previewSetId) || selectedSet;
  }, [previewSetId, selectedSet, sets]);
  const currentQuestion = preparedQuestions[currentQuestionIndex];
  const inAttempt = Boolean(attemptId && preparedQuestions.length && !resultScreen);
  const answeredCount = preparedQuestions.length
    ? preparedQuestions.filter((question) => Boolean(answers[question.id])).length
    : Object.keys(answers).length;
  const progressPercent = preparedQuestions.length ? Math.round((answeredCount / preparedQuestions.length) * 100) : 0;
  const canSubmitAttempt = inAttempt && preparedQuestions.every((question) => Boolean(answers[question.id]));
  const currentUsername = currentUser?.username || "guest";
  const hasCompletedSelectedSet = results.some((item) => item.setId === selectedSet.id && item.username === currentUsername);
  const historyUsers = useMemo(() => {
    const map = new Map<string, string>();
    results.forEach((item) => map.set(item.username, item.displayName || item.username));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [results]);
  const historySets = useMemo(() => {
    const map = new Map<string, string>();
    results.forEach((item) => map.set(item.setId, `${item.setCode} - ${item.setTitle}`));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [results]);
  const historyRows = useMemo(() => {
    const search = historySearch.trim().toLowerCase();
    return results.filter((item) => {
      if (historyUserFilter !== "all" && item.username !== historyUserFilter) return false;
      if (historySetFilter !== "all" && item.setId !== historySetFilter) return false;
      if (!search) return true;
      return [
        item.setTitle,
        item.setCode,
        item.displayName,
        item.username,
        item.agentName,
        item.role,
        item.result,
      ].some((value) => String(value || "").toLowerCase().includes(search));
    });
  }, [historySearch, historySetFilter, historyUserFilter, results]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedSetId = params.get("pretest");
    if (sharedSetId) {
      setSelectedSetId(sharedSetId);
      setWorkspaceTab("take");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadCentralData() {
      setSyncing(true);
      try {
        const logs = await fetchUsageLogsByEventTypes([
          "pretest_set_saved",
          "pretest_set_deleted",
          "pretest_attempt_submitted",
          "pretest_attempt_reset",
          "pretest_history_cleared",
        ], 1500);
        if (!alive) return;
        const localSets = readLocal<PreTestSet>(SETS_STORAGE_KEY).map(normalizeSet).filter(Boolean) as PreTestSet[];
        const localResults = readLocal<PreTestResult>(RESULTS_STORAGE_KEY).map(normalizeResult).filter(Boolean) as PreTestResult[];
        const nextSets = mergeSets(localSets, logs);
        const nextResults = mergeResults(localResults, logs);
        setSets(nextSets);
        setResults(nextResults);
        writeLocal(SETS_STORAGE_KEY, nextSets);
        writeLocal(RESULTS_STORAGE_KEY, nextResults);
      } catch {
        // Keep local fallback visible when Supabase is unavailable.
      } finally {
        if (alive) setSyncing(false);
      }
    }

    void loadCentralData();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!inAttempt) return;
    const startedTime = new Date(startedAt).getTime();
    const elapsedSeconds = Number.isNaN(startedTime) ? 0 : Math.floor((Date.now() - startedTime) / 1000);
    const nextRemaining = Math.max(0, selectedSet.timeLimitSeconds - elapsedSeconds);
    if (nextRemaining !== remainingSeconds) {
      setRemainingSeconds(nextRemaining);
    }
    if (nextRemaining <= 0) {
      void finishAttempt("time-up");
      return;
    }
    const timer = window.setTimeout(() => {
      const latestElapsed = Number.isNaN(startedTime) ? 0 : Math.floor((Date.now() - startedTime) / 1000);
      setRemainingSeconds(Math.max(0, selectedSet.timeLimitSeconds - latestElapsed));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [inAttempt, remainingSeconds, selectedSet.timeLimitSeconds, startedAt]);

  useEffect(() => {
    if (!attemptId) {
      writeLocalObject(ACTIVE_ATTEMPT_STORAGE_KEY, null);
      return;
    }
    writeLocalObject<AttemptSession>(ACTIVE_ATTEMPT_STORAGE_KEY, {
      attemptId,
      setId: selectedSet.id,
      username: currentUsername,
      startedAt,
      preparedQuestions,
      currentQuestionIndex,
      answers,
    });
  }, [answers, attemptId, currentQuestionIndex, currentUsername, preparedQuestions, selectedSet.id, startedAt]);

  useEffect(() => {
    if (attemptId || resultScreen || !sets.length) return;
    const session = readLocalObject<AttemptSession>(ACTIVE_ATTEMPT_STORAGE_KEY);
    if (!session || session.username !== currentUsername) return;
    const sessionSet = sets.find((set) => set.id === session.setId);
    if (!sessionSet || !session.preparedQuestions?.length) {
      writeLocalObject(ACTIVE_ATTEMPT_STORAGE_KEY, null);
      return;
    }
    const startedTime = new Date(session.startedAt).getTime();
    const elapsedSeconds = Number.isNaN(startedTime) ? 0 : Math.floor((Date.now() - startedTime) / 1000);
    const nextRemaining = Math.max(0, sessionSet.timeLimitSeconds - elapsedSeconds);
    setSelectedSetId(sessionSet.id);
    setAttemptId(session.attemptId);
    setStartedAt(session.startedAt);
    setPreparedQuestions(session.preparedQuestions);
    setCurrentQuestionIndex(Math.min(session.currentQuestionIndex || 0, session.preparedQuestions.length - 1));
    setAnswers(session.answers || {});
    setRemainingSeconds(nextRemaining);
    if (nextRemaining <= 0) {
      window.setTimeout(() => void finishAttempt("time-up"), 0);
    } else {
      showToast("Resumed active Pre-Test. Timer continued from the original start time.");
    }
  }, [attemptId, currentUsername, resultScreen, sets]);

  useEffect(() => {
    if (!inAttempt) return;
    const restartQuestions = () => {
      setAnswers({});
      setCurrentQuestionIndex(0);
      setSwitchWarningCount((count) => count + 1);
      showToast("Screen switched. Answers were reset, but timer is still running.");
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") restartQuestions();
    };
    const handleBlur = () => restartQuestions();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
    };
  }, [inAttempt]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }

  async function copyShareLink(setId: string) {
    const url = `${window.location.origin}${window.location.pathname}?tab=pre-test&pretest=${encodeURIComponent(setId)}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      showToast("Pre-Test link copied.");
    } catch {
      showToast(`Copy failed: ${url}`);
    }
  }

  function startAttempt() {
    if (!canTakePreTest || !selectedSet.active) return;
    if (hasCompletedSelectedSet) {
      showToast("This user has already completed this Pre-Test. Please request Reset Retake before trying again.");
      return;
    }
    const now = new Date();
    const nextAttemptId = `pretest-${selectedSet.id}-${currentUser?.username || "guest"}-${now.getTime()}`;
    const seed = `${currentUser?.username || "guest"}|${selectedSet.id}|${now.getTime()}`;
    const nextPrepared = shuffleWithSeed(selectedSet.questions, `${seed}|question-order`).map((question) => ({
      ...question,
      shuffledChoices: shuffleWithSeed(question.choices, `${seed}|choices|${question.id}`),
    }));
    setAttemptId(nextAttemptId);
    setStartedAt(now.toISOString());
    setRemainingSeconds(selectedSet.timeLimitSeconds);
    setPreparedQuestions(nextPrepared);
    setCurrentQuestionIndex(0);
    setAnswers({});
    setResultScreen(null);
    setSwitchWarningCount(0);
  }

  function chooseAnswer(questionId: string, choiceId: string) {
    if (!inAttempt) return;
    setAnswers((current) => ({ ...current, [questionId]: choiceId }));
    if (currentQuestionIndex < preparedQuestions.length - 1) {
      window.setTimeout(() => {
        setCurrentQuestionIndex((index) => Math.min(index + 1, preparedQuestions.length - 1));
      }, 180);
    }
  }

  async function finishAttempt(reason: "submit" | "time-up") {
    if (!attemptId) return;
    const score = selectedSet.questions.reduce((total, question) => {
      return total + (answers[question.id] === question.correctChoiceId ? 1 : 0);
    }, 0);
    const submittedAt = new Date().toISOString();
    const result: PreTestResult = {
      id: attemptId,
      setId: selectedSet.id,
      setCode: selectedSet.code,
      setTitle: selectedSet.title,
      username: currentUser?.username || "guest",
      displayName: currentUser?.displayName || "Guest",
      role: currentUser?.role || "",
      agentName: currentUser?.agentName || currentUser?.displayName || "",
      startedAt,
      submittedAt,
      score,
      total: selectedSet.questions.length,
      passScore: selectedSet.passScore,
      result: score >= selectedSet.passScore ? "Pass" : "Fail",
      answers,
      questions: selectedSet.questions,
    };
    const nextResults = [result, ...results.filter((item) => item.id !== result.id && !(item.setId === result.setId && item.username === result.username))];
    setResults(nextResults);
    writeLocal(RESULTS_STORAGE_KEY, nextResults);
    writeLocalObject(ACTIVE_ATTEMPT_STORAGE_KEY, null);
    setResultScreen(result);
    setAttemptId("");
    setPreparedQuestions([]);
    setCurrentQuestionIndex(0);
    setRemainingSeconds(0);
    await logUsageEvent(currentUser || null, "pretest_attempt_submitted", {
      tab: "pre-test",
      details: { result, reason },
    });
  }

  function resetAttempt() {
    writeLocalObject(ACTIVE_ATTEMPT_STORAGE_KEY, null);
    setAttemptId("");
    setStartedAt("");
    setRemainingSeconds(0);
    setPreparedQuestions([]);
    setCurrentQuestionIndex(0);
    setAnswers({});
    setResultScreen(null);
  }

  function startCreateSet() {
    const now = new Date().toISOString();
    setPreviewSetId("");
    setEditorSet({
      id: `pretest-${Date.now()}`,
      code: `PRE-${new Date().getFullYear()}-${String(sets.length + 1).padStart(2, "0")}`,
      title: "",
      description: "",
      passScore: 1,
      timeLimitSeconds: 90,
      active: true,
      questions: [createBlankQuestion(1)],
      updatedAt: now,
      updatedBy: currentUser?.displayName || "System",
    });
    setWorkspaceTab("sets");
  }

  function editSet(set: PreTestSet) {
    setPreviewSetId(set.id);
    setEditorSet(JSON.parse(JSON.stringify(set)) as PreTestSet);
    setWorkspaceTab("sets");
  }

  async function saveEditorSet() {
    if (!editorSet) return;
    const cleanQuestions = editorSet.questions
      .map((question, index) => ({
        ...question,
        id: question.id || `q${index + 1}`,
        prompt: question.prompt.trim(),
        slideNote: question.slideNote?.trim() || "",
        choices: question.choices.map((choice) => ({ ...choice, text: choice.text.trim() })),
      }))
      .filter((question) => question.prompt && question.choices.every((choice) => choice.text));

    if (!editorSet.title.trim()) {
      showToast("Please enter Pre-Test title.");
      return;
    }
    if (!cleanQuestions.length) {
      showToast("Please add at least one complete question.");
      return;
    }
    if (editorSet.passScore > cleanQuestions.length) {
      showToast("Pass score cannot exceed total questions.");
      return;
    }

    const savedSet: PreTestSet = {
      ...editorSet,
      code: editorSet.code.trim() || editorSet.id,
      title: editorSet.title.trim(),
      description: editorSet.description.trim(),
      passScore: Math.max(1, editorSet.passScore),
      timeLimitSeconds: Math.max(30, editorSet.timeLimitSeconds),
      questions: cleanQuestions,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.displayName || "System",
    };
    const nextSets = [savedSet, ...sets.filter((item) => item.id !== savedSet.id)].sort((a, b) => a.title.localeCompare(b.title));
    setSets(nextSets);
    writeLocal(SETS_STORAGE_KEY, nextSets);
    setSelectedSetId(savedSet.id);
    setPreviewSetId(savedSet.id);
    setEditorSet(null);
    showToast("Pre-Test set saved.");
    await logUsageEvent(currentUser || null, "pretest_set_saved", {
      tab: "pre-test",
      details: { set: savedSet },
    });
  }

  async function deleteSet(setId: string) {
    if (setId === DEFAULT_SET.id) {
      showToast("Default set cannot be deleted. You can disable it instead.");
      return;
    }
    if (BUILT_IN_PRE_TEST_SETS.some((set) => set.id === setId)) {
      showToast("Built-in set cannot be deleted. You can disable it instead.");
      return;
    }
    const nextSets = sets.filter((set) => set.id !== setId);
    setSets(nextSets);
    writeLocal(SETS_STORAGE_KEY, nextSets);
    if (selectedSetId === setId) setSelectedSetId(nextSets[0]?.id || DEFAULT_SET.id);
    if (previewSetId === setId) setPreviewSetId(nextSets[0]?.id || DEFAULT_SET.id);
    if (editorSet?.id === setId) setEditorSet(null);
    showToast("Pre-Test set deleted.");
    await logUsageEvent(currentUser || null, "pretest_set_deleted", {
      tab: "pre-test",
      details: { setId },
    });
  }

  function updateEditorQuestion(questionIndex: number, patch: Partial<PreTestQuestion>) {
    if (!editorSet) return;
    setEditorSet({
      ...editorSet,
      questions: editorSet.questions.map((question, index) => index === questionIndex ? { ...question, ...patch } : question),
    });
  }

  function updateEditorChoice(questionIndex: number, choiceId: string, text: string) {
    if (!editorSet) return;
    setEditorSet({
      ...editorSet,
      questions: editorSet.questions.map((question, index) => {
        if (index !== questionIndex) return question;
        return {
          ...question,
          choices: question.choices.map((choice) => choice.id === choiceId ? { ...choice, text } : choice),
        };
      }),
    });
  }

  async function resetRetake(result: PreTestResult) {
    const nextResults = results.filter((item) => item.id !== result.id && !(item.setId === result.setId && item.username === result.username));
    setResults(nextResults);
    writeLocal(RESULTS_STORAGE_KEY, nextResults);
    showToast(`Retake opened for ${result.displayName || result.username}.`);
    await logUsageEvent(currentUser || null, "pretest_attempt_reset", {
      tab: "pre-test",
      details: {
        resultId: result.id,
        setId: result.setId,
        username: result.username,
        resetBy: currentUser?.displayName || "System",
        resetAt: new Date().toISOString(),
      },
    });
  }

  function exportHistory() {
    const rows = historyRows.map((item) => ({
      "Submitted At": formatDateTime(item.submittedAt),
      "Started At": formatDateTime(item.startedAt),
      "Test Code": item.setCode,
      "Test Title": item.setTitle,
      Username: item.username,
      "Display Name": item.displayName,
      Role: item.role,
      Agent: item.agentName,
      Score: item.score,
      Total: item.total,
      "Pass Score": item.passScore,
      Result: item.result,
    }));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "PreTest_History");
    XLSX.writeFile(workbook, `pretest_history_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function generateResultsPdf() {
    if (!historyRows.length) {
      showToast("No results selected for PDF.");
      return;
    }

    try {
      showToast("Generating PDF download...");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      registerTHSarabunNew(doc);
      doc.setFont("THSarabunNew", "normal");

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const left = 12;
      const right = pageWidth - 12;
      const bottom = pageHeight - 12;
      const contentWidth = right - left;
      let y = 12;

      const colors = {
        ink: [15, 23, 42] as [number, number, number],
        muted: [71, 85, 105] as [number, number, number],
        line: [203, 213, 225] as [number, number, number],
        deep: [5, 46, 43] as [number, number, number],
        green: [4, 120, 87] as [number, number, number],
        red: [190, 18, 60] as [number, number, number],
        softGreen: [220, 252, 231] as [number, number, number],
        softRed: [255, 228, 230] as [number, number, number],
      };

      const setText = (color: [number, number, number]) => doc.setTextColor(color[0], color[1], color[2]);
      const setFill = (color: [number, number, number]) => doc.setFillColor(color[0], color[1], color[2]);
      const setDraw = (color: [number, number, number]) => doc.setDrawColor(color[0], color[1], color[2]);

      const addPageIfNeeded = (height = 10) => {
        if (y + height <= bottom) return;
        doc.addPage();
        y = 12;
      };

      const writeWrapped = (text: string, x: number, width: number, options?: { bold?: boolean; size?: number; color?: [number, number, number]; lineHeight?: number }) => {
        doc.setFont("THSarabunNew", options?.bold ? "bold" : "normal");
        doc.setFontSize(options?.size ?? 11);
        setText(options?.color ?? colors.ink);
        const lines = doc.splitTextToSize(text || "-", width) as string[];
        doc.text(lines, x, y, { baseline: "top" });
        return lines.length * (options?.lineHeight ?? 5);
      };

      const drawReportHeader = () => {
        setFill(colors.deep);
        doc.roundedRect(left, y, contentWidth, 24, 3, 3, "F");
        setText([255, 255, 255]);
        doc.setFont("THSarabunNew", "bold");
        doc.setFontSize(20);
        doc.text("Pre-Test Result Report", left + 6, y + 9, { baseline: "top" });
        doc.setFont("THSarabunNew", "normal");
        doc.setFontSize(11);
        doc.text(`Generated from Results History filters. Total records: ${historyRows.length}`, left + 6, y + 17, { baseline: "top" });
        doc.text(`Generated at: ${formatDateTime(new Date())}`, right - 58, y + 17, { baseline: "top" });
        y += 32;
      };

      const drawMetaBox = (label: string, value: string, x: number, width: number) => {
        setDraw(colors.line);
        doc.roundedRect(x, y, width, 13, 2, 2, "S");
        doc.setFont("THSarabunNew", "bold");
        doc.setFontSize(8);
        setText(colors.muted);
        doc.text(label.toUpperCase(), x + 3, y + 3, { baseline: "top" });
        doc.setFont("THSarabunNew", "bold");
        doc.setFontSize(11);
        setText(colors.ink);
        doc.text(doc.splitTextToSize(value || "-", width - 6) as string[], x + 3, y + 8, { baseline: "top" });
      };

      drawReportHeader();

      historyRows.forEach((result, resultIndex) => {
        const set = sets.find((item) => item.id === result.setId);
        const questions = result.questions || set?.questions || [];
        const cardStartY = y;

        addPageIfNeeded(48);
        setDraw(colors.line);
        doc.roundedRect(left, y, contentWidth, 30, 3, 3, "S");
        y += 5;
        doc.setFont("THSarabunNew", "bold");
        doc.setFontSize(8);
        setText(colors.muted);
        doc.text(`PRE-TEST RESULT ${resultIndex + 1}`, left + 5, y, { baseline: "top" });
        doc.setFontSize(15);
        setText(colors.ink);
        doc.text(doc.splitTextToSize(result.setTitle || "-", 180) as string[], left + 5, y + 6, { baseline: "top" });
        doc.setFont("THSarabunNew", "normal");
        doc.setFontSize(10);
        setText(colors.muted);
        doc.text(result.setCode || "-", left + 5, y + 18, { baseline: "top" });

        const scoreX = right - 42;
        setFill(result.result === "Pass" ? colors.softGreen : colors.softRed);
        setDraw(result.result === "Pass" ? [167, 243, 208] : [254, 205, 211]);
        doc.roundedRect(scoreX, cardStartY + 5, 36, 20, 3, 3, "FD");
        doc.setFont("THSarabunNew", "bold");
        doc.setFontSize(16);
        setText(result.result === "Pass" ? colors.green : colors.red);
        doc.text(`${result.score}/${result.total}`, scoreX + 18, cardStartY + 9, { align: "center", baseline: "top" });
        doc.setFontSize(10);
        doc.text(result.result, scoreX + 18, cardStartY + 17, { align: "center", baseline: "top" });
        y = cardStartY + 36;

        const boxWidth = (contentWidth - 8) / 4;
        drawMetaBox("Participant", result.displayName || result.username || "-", left, boxWidth);
        drawMetaBox("Role", result.role || "-", left + boxWidth + 2.6, boxWidth);
        drawMetaBox("Started At", formatDateTime(result.startedAt), left + (boxWidth + 2.6) * 2, boxWidth);
        drawMetaBox("Submitted At", formatDateTime(result.submittedAt), left + (boxWidth + 2.6) * 3, boxWidth);
        y += 19;

        if (!questions.length) {
          addPageIfNeeded(12);
          writeWrapped("Question set details not found.", left, contentWidth, { color: colors.muted });
          y += 8;
          return;
        }

        questions.forEach((question, questionIndex) => {
          const selectedChoiceId = result.answers?.[question.id] || "";
          const selectedText = getChoiceText(question, selectedChoiceId);
          const correctText = getChoiceText(question, question.correctChoiceId);
          const isCorrect = selectedChoiceId === question.correctChoiceId;
          const questionWidth = 116;
          const selectedWidth = 52;
          const correctWidth = 52;
          const statusWidth = 28;
          const promptLines = doc.splitTextToSize(question.prompt || "-", questionWidth) as string[];
          const selectedLines = doc.splitTextToSize(selectedText || "-", selectedWidth) as string[];
          const correctLines = doc.splitTextToSize(correctText || "-", correctWidth) as string[];
          const rowHeight = Math.max(18, promptLines.length * 5 + 8, selectedLines.length * 5 + 8, correctLines.length * 5 + 8);

          addPageIfNeeded(rowHeight + 8);
          if (questionIndex === 0 || y < 18) {
            setFill([15, 23, 42]);
            doc.roundedRect(left, y, contentWidth, 9, 2, 2, "F");
            setText([255, 255, 255]);
            doc.setFont("THSarabunNew", "bold");
            doc.setFontSize(9);
            doc.text("No.", left + 3, y + 2.5, { baseline: "top" });
            doc.text("Question", left + 17, y + 2.5, { baseline: "top" });
            doc.text("Selected Answer", left + 136, y + 2.5, { baseline: "top" });
            doc.text("Correct Answer", left + 190, y + 2.5, { baseline: "top" });
            doc.text("Status", right - statusWidth, y + 2.5, { baseline: "top" });
            y += 11;
            addPageIfNeeded(rowHeight + 4);
          }

          setDraw(colors.line);
          doc.line(left, y - 1.5, right, y - 1.5);
          doc.setFont("THSarabunNew", "bold");
          doc.setFontSize(10);
          setText(colors.ink);
          doc.text(String(questionIndex + 1), left + 3, y, { baseline: "top" });

          doc.setFont("THSarabunNew", "normal");
          doc.setFontSize(10);
          setText(colors.ink);
          doc.text(promptLines, left + 17, y, { baseline: "top" });
          setText(isCorrect ? colors.green : colors.red);
          doc.text(selectedLines, left + 136, y, { baseline: "top" });
          setText(colors.ink);
          doc.text(correctLines, left + 190, y, { baseline: "top" });
          setText(isCorrect ? colors.green : colors.red);
          doc.setFont("THSarabunNew", "bold");
          doc.text(isCorrect ? "Correct" : "Incorrect", right - statusWidth, y, { baseline: "top" });
          y += rowHeight;
        });

        y += 8;
      });

      const safeDate = new Date().toISOString().slice(0, 10);
      doc.save(`pretest_result_report_${safeDate}.pdf`);
      showToast("Pre-Test PDF downloaded.");
      await logUsageEvent(currentUser || null, "pretest_result_pdf_downloaded", {
        tab: "pre-test",
        details: {
          totalRecords: historyRows.length,
          userFilter: historyUserFilter,
          setFilter: historySetFilter,
          downloadedAt: new Date().toISOString(),
        },
      });
    } catch {
      showToast("PDF download failed. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f7fb] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-emerald-200 bg-white px-5 py-3 text-sm font-black text-emerald-700 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
          {toast}
        </div>
      ) : null}

      <div className="mx-auto max-w-[1540px] overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
        <section className="bg-gradient-to-r from-[#062f2b] via-[#0b745f] to-[#077ea8] px-6 py-8 text-white sm:px-9">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-100">Learning & Readiness Center</div>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Pre-Test Management</h1>
              <p className="mt-2 max-w-4xl text-sm font-semibold leading-7 text-emerald-50">
                สร้างชุดคำถาม ทำแบบทดสอบทีละข้อ แชร์ลิงก์ให้ผู้ใช้ และเก็บประวัติผลการทดสอบในรูปแบบพร้อมตรวจสอบสำหรับทีม QA
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[620px]">
              <MetricCard label="Active Sets" value={activeSets.length} tone="emerald" />
              <MetricCard label="Completed Tests" value={results.length} tone="sky" />
              <MetricCard label="Pass Rate" value={results.length ? `${Math.round((results.filter((item) => item.result === "Pass").length / results.length) * 100)}%` : "-"} tone="amber" />
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-center gap-3">
            {canTakePreTest ? (
              <TabButton active={workspaceTab === "take"} onClick={() => setWorkspaceTab("take")} label="Take Test" />
            ) : null}
            {canManagePreTest ? (
              <TabButton active={workspaceTab === "sets"} onClick={() => setWorkspaceTab("sets")} label="Question Sets" />
            ) : null}
            {canViewPreTestResults ? (
              <TabButton active={workspaceTab === "history"} onClick={() => setWorkspaceTab("history")} label="Results History" />
            ) : null}
            <div className="ml-auto text-xs font-bold text-slate-500">
              {syncing ? "Syncing central records..." : "Ready"}
            </div>
          </div>
        </section>

        {workspaceTab === "take" ? (
          <section className="grid gap-6 p-5 lg:grid-cols-[1fr_390px] lg:p-8">
            <main className="space-y-5">
              {!inAttempt && !resultScreen ? (
                <div className="rounded-[30px] border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 p-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">Select Pre-Test</div>
                      <h2 className="mt-2 text-2xl font-black text-slate-950">{selectedSet.title}</h2>
                      <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-slate-600">{selectedSet.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyShareLink(selectedSet.id)}
                      className="rounded-2xl border border-emerald-200 bg-white px-5 py-3 text-sm font-black text-emerald-700 shadow-sm transition hover:border-emerald-400"
                    >
                      Share Link
                    </button>
                  </div>
                  <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto]">
                    <select
                      value={selectedSet.id}
                      onChange={(event) => setSelectedSetId(event.target.value)}
                      className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-emerald-400"
                    >
                      {activeSets.map((set) => (
                        <option key={set.id} value={set.id}>{set.code} - {set.title}</option>
                      ))}
                    </select>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={!canTakePreTest || !selectedSet.active || hasCompletedSelectedSet}
                        onClick={startAttempt}
                        className="h-14 rounded-2xl bg-slate-950 px-8 text-sm font-black text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {hasCompletedSelectedSet ? "Completed" : "Start Test"}
                      </button>
                      {hasCompletedSelectedSet ? (
                        <div className="text-xs font-bold text-amber-700">This set was already completed. Reset Retake is required to test again.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {inAttempt && currentQuestion ? (
                <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">Question {currentQuestionIndex + 1} of {preparedQuestions.length}</div>
                      <h2 className="mt-2 max-w-4xl whitespace-pre-line text-2xl font-black leading-9 text-slate-950">{currentQuestion.prompt}</h2>
                    </div>
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-right">
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700">Time Left</div>
                      <div className="text-2xl font-black text-slate-950">{formatDuration(remainingSeconds)}</div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {currentQuestion.shuffledChoices.map((choice) => {
                      const selected = answers[currentQuestion.id] === choice.id;
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          onClick={() => chooseAnswer(currentQuestion.id, choice.id)}
                          className={`min-h-[86px] rounded-3xl border px-5 py-4 text-left transition ${
                            selected
                              ? "border-emerald-400 bg-emerald-50 shadow-[0_14px_34px_rgba(16,185,129,0.14)]"
                              : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/60"
                          }`}
                        >
                          <span className="text-sm font-bold leading-6 text-slate-800">{choice.text}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {switchWarningCount ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-black text-amber-700">
                        Screen switch detected {switchWarningCount} time(s). Answers were reset; timer continued.
                      </div>
                    ) : <div />}
                    <button
                      type="button"
                      disabled={currentQuestionIndex === 0}
                      onClick={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))}
                      className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Back
                    </button>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        disabled={currentQuestionIndex >= preparedQuestions.length - 1}
                        onClick={() => setCurrentQuestionIndex((index) => Math.min(preparedQuestions.length - 1, index + 1))}
                        className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-black text-sky-700 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        disabled={!canSubmitAttempt}
                        onClick={() => void finishAttempt("submit")}
                        className="rounded-2xl bg-emerald-700 px-6 py-3 text-sm font-black text-white shadow-[0_14px_34px_rgba(16,185,129,0.18)] transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Submit Test
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {resultScreen ? (
                <div className={`rounded-[34px] border p-8 text-center shadow-sm ${
                  resultScreen.result === "Pass" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
                }`}>
                  <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-3xl font-black text-white ${
                    resultScreen.result === "Pass" ? "bg-emerald-700" : "bg-rose-700"
                  }`}>
                    {resultScreen.result === "Pass" ? "P" : "F"}
                  </div>
                  <div className="mt-5 text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Pre-Test Completed</div>
                  <h2 className="mt-2 text-3xl font-black text-slate-950">
                    {resultScreen.result === "Pass" ? "ผ่านการทดสอบ" : "ไม่ผ่านการทดสอบ"}
                  </h2>
                  <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
                    ระบบบันทึกผลเรียบร้อยแล้ว รายละเอียดคะแนนจะอยู่ใน Results History สำหรับผู้มีสิทธิ์ตรวจสอบ
                  </p>
                  <button
                    type="button"
                    onClick={resetAttempt}
                    className="mt-6 rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white transition hover:bg-emerald-800"
                  >
                    Back to Pre-Test
                  </button>
                </div>
              ) : null}
            </main>

            <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
              <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_16px_46px_rgba(15,23,42,0.10)]">
                <div className="bg-gradient-to-br from-[#062f2b] to-[#087a88] p-5 text-white">
                  <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-100">Live Status</div>
                  <div className="mt-4 text-5xl font-black">{progressPercent}%</div>
                  <div className="mt-2 text-sm font-bold text-emerald-50">{answeredCount}/{preparedQuestions.length || selectedSet.questions.length} question(s) answered</div>
                </div>
                <div className="space-y-3 p-5">
                  <InfoRow label="Test Code" value={selectedSet.code} />
                  <InfoRow label="Pass Criteria" value={`${selectedSet.passScore}/${selectedSet.questions.length} question(s)`} />
                  <InfoRow label="Time Limit" value={formatDuration(selectedSet.timeLimitSeconds)} />
                  <InfoRow label="Current User" value={currentUser?.displayName || "Guest"} />
                </div>
              </div>
            </aside>
          </section>
        ) : null}

        {workspaceTab === "sets" && canManagePreTest ? (
          <section className="grid gap-6 p-5 xl:grid-cols-[430px_1fr] xl:p-8">
            <aside className="space-y-4">
              <button
                type="button"
                onClick={startCreateSet}
                className="w-full rounded-3xl bg-gradient-to-br from-emerald-700 via-teal-700 to-slate-950 px-5 py-5 text-left text-sm font-black text-white shadow-[0_18px_44px_rgba(15,23,42,0.18)] transition hover:scale-[1.01] hover:shadow-[0_22px_54px_rgba(15,118,110,0.24)]"
              >
                <span className="block text-[10px] uppercase tracking-[0.24em] text-emerald-100">Question Bank</span>
                <span className="mt-1 block text-lg">Add New Question Set</span>
              </button>
              {sets.map((set) => (
                <div
                  key={set.id}
                  onClick={() => {
                    setEditorSet(null);
                    setPreviewSetId(set.id);
                  }}
                  className={`cursor-pointer rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(15,23,42,0.10)] ${
                    previewSet.id === set.id && !editorSet ? "border-emerald-300 ring-4 ring-emerald-50" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">{set.code}</div>
                      <div className="mt-2 text-lg font-black text-slate-950">{set.title}</div>
                      <div className="mt-1 text-xs font-bold leading-5 text-slate-500">{set.questions.length} question(s) · pass {set.passScore}</div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${set.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {set.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <button type="button" onClick={(event) => { event.stopPropagation(); editSet(set); }} className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700">Edit</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); void copyShareLink(set.id); }} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Share</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); void deleteSet(set.id); }} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">Delete</button>
                  </div>
                </div>
              ))}
            </aside>

            <main className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              {editorSet ? (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">Question Set Builder</div>
                      <h2 className="mt-2 text-2xl font-black text-slate-950">Create / Edit Pre-Test</h2>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditorSet(null)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700">Cancel</button>
                      <button type="button" onClick={() => void saveEditorSet()} className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white">Save Set</button>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field label="Test Code">
                      <input value={editorSet.code} onChange={(event) => setEditorSet({ ...editorSet, code: event.target.value })} className={FORM_INPUT_CLASS} />
                    </Field>
                    <Field label="Title">
                      <input value={editorSet.title} onChange={(event) => setEditorSet({ ...editorSet, title: event.target.value })} className={FORM_INPUT_CLASS} />
                    </Field>
                    <Field label="Time Limit (seconds)">
                      <input type="number" min={30} value={editorSet.timeLimitSeconds} onChange={(event) => setEditorSet({ ...editorSet, timeLimitSeconds: Number(event.target.value) })} className={FORM_INPUT_CLASS} />
                    </Field>
                    <Field label="Pass Score">
                      <input type="number" min={1} max={editorSet.questions.length} value={editorSet.passScore} onChange={(event) => setEditorSet({ ...editorSet, passScore: Number(event.target.value) })} className={FORM_INPUT_CLASS} />
                    </Field>
                    <Field label="Status">
                      <select value={editorSet.active ? "Active" : "Inactive"} onChange={(event) => setEditorSet({ ...editorSet, active: event.target.value === "Active" })} className={FORM_INPUT_CLASS}>
                        <option>Active</option>
                        <option>Inactive</option>
                      </select>
                    </Field>
                    <Field label="Description">
                      <input value={editorSet.description} onChange={(event) => setEditorSet({ ...editorSet, description: event.target.value })} className={FORM_INPUT_CLASS} />
                    </Field>
                  </div>

                  <div className="space-y-4">
                    {editorSet.questions.map((question, questionIndex) => (
                      <div key={question.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-black text-slate-950">Question {questionIndex + 1}</div>
                          <button
                            type="button"
                            onClick={() => setEditorSet({ ...editorSet, questions: editorSet.questions.filter((_, index) => index !== questionIndex) })}
                            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700"
                          >
                            Remove
                          </button>
                        </div>
                        <textarea
                          value={question.prompt}
                          onChange={(event) => updateEditorQuestion(questionIndex, { prompt: event.target.value })}
                          rows={3}
                          placeholder="Question prompt"
                          className="mt-3 min-h-[98px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-emerald-400"
                        />
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {question.choices.map((choice) => (
                            <div key={choice.id} className="flex gap-2">
                              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-black text-white ${question.correctChoiceId === choice.id ? "bg-emerald-700" : "bg-slate-950"}`}>
                                {choice.id}
                              </div>
                              <input
                                value={choice.text}
                                onChange={(event) => updateEditorChoice(questionIndex, choice.id, event.target.value)}
                                className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-emerald-400"
                                placeholder={`Choice ${choice.id}`}
                              />
                            </div>
                          ))}
                        </div>
                        <div className="mt-3">
                          <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Correct Answer</label>
                          <select
                            value={question.correctChoiceId}
                            onChange={(event) => updateEditorQuestion(questionIndex, { correctChoiceId: event.target.value })}
                            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black outline-none focus:border-emerald-400 md:w-60"
                          >
                            {question.choices.map((choice) => (
                              <option key={choice.id} value={choice.id}>{choice.id}</option>
                            ))}
                          </select>
                        </div>
                        <div className="mt-3">
                          <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">หมายเหตุ (อ้างอิง Slide)</label>
                          <input
                            value={question.slideNote || ""}
                            onChange={(event) => updateEditorQuestion(questionIndex, { slideNote: event.target.value })}
                            className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-emerald-400"
                            placeholder="เช่น อ้างอิง Slide 2"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditorSet({ ...editorSet, questions: [...editorSet.questions, createBlankQuestion(editorSet.questions.length + 1)] })}
                    className="w-full rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700"
                  >
                    Add Question
                  </button>
                </div>
              ) : previewSet ? (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">Question Set Preview</div>
                      <h2 className="mt-2 text-2xl font-black text-slate-950">{previewSet.title}</h2>
                      <p className="mt-2 max-w-3xl text-sm font-semibold leading-7 text-slate-500">{previewSet.description || "No description"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => editSet(previewSet)} className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-black text-white">Edit Set</button>
                      <button type="button" onClick={() => void copyShareLink(previewSet.id)} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700">Share</button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <InfoRow label="Test Code" value={previewSet.code} />
                    <InfoRow label="Questions" value={`${previewSet.questions.length}`} />
                    <InfoRow label="Pass Criteria" value={`${previewSet.passScore}/${previewSet.questions.length}`} />
                    <InfoRow label="Time Limit" value={formatDuration(previewSet.timeLimitSeconds)} />
                  </div>
                  <div className="space-y-4">
                    {previewSet.questions.map((question, questionIndex) => (
                      <div key={question.id} className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">Question {questionIndex + 1}</div>
                            <div className="mt-2 text-base font-black leading-7 text-slate-950">{question.prompt}</div>
                          </div>
                          <div className="shrink-0 rounded-full bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700">
                            Correct: {question.correctChoiceId}
                          </div>
                        </div>
                        {question.slideNote ? (
                          <div className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-700">
                            {question.slideNote}
                          </div>
                        ) : null}
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          {question.choices.map((choice) => (
                            <div
                              key={choice.id}
                              className={`rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${
                                choice.id === question.correctChoiceId
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                  : "border-slate-200 bg-white text-slate-700"
                              }`}
                            >
                              <span className="mr-2 font-black">{choice.id}.</span>{choice.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50 text-center">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">No Set Selected</div>
                    <h2 className="mt-2 text-2xl font-black text-slate-950">Select a set to preview</h2>
                    <p className="mt-2 text-sm font-semibold text-slate-500">Choose a question set from the left, or create a new one.</p>
                  </div>
                </div>
              )}
            </main>
          </section>
        ) : null}

        {workspaceTab === "history" && canViewPreTestResults ? (
          <section className="p-5 lg:p-8">
            <div className="rounded-[32px] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-5 border-b border-slate-200 bg-slate-950 p-5 text-white">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-100">Results History</div>
                  <h2 className="mt-2 text-2xl font-black">Pre-Test Attempts</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-300">
                    Filter by user or question set, then generate a PDF report with questions, selected answers, and pass/fail result.
                  </p>
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_260px_300px_auto_auto]">
                  <input
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder="Search user, set, result..."
                    className="h-12 rounded-2xl border border-white/15 bg-white px-4 text-sm font-bold text-slate-950 outline-none"
                  />
                  <select
                    value={historyUserFilter}
                    onChange={(event) => setHistoryUserFilter(event.target.value)}
                    className="h-12 rounded-2xl border border-white/15 bg-white px-4 text-sm font-black text-slate-950 outline-none"
                  >
                    <option value="all">All Users</option>
                    {historyUsers.map(([username, displayName]) => (
                      <option key={username} value={username}>{displayName}</option>
                    ))}
                  </select>
                  <select
                    value={historySetFilter}
                    onChange={(event) => setHistorySetFilter(event.target.value)}
                    className="h-12 rounded-2xl border border-white/15 bg-white px-4 text-sm font-black text-slate-950 outline-none"
                  >
                    <option value="all">All Question Sets</option>
                    {historySets.map(([setId, title]) => (
                      <option key={setId} value={setId}>{title}</option>
                    ))}
                  </select>
                  <button type="button" onClick={generateResultsPdf} className="h-12 rounded-2xl bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-emerald-50">
                    Generate PDF
                  </button>
                  <button type="button" onClick={exportHistory} className="h-12 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white transition hover:bg-emerald-500">
                    Export Excel
                  </button>
                </div>
              </div>
              <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-bold text-slate-500">
                Showing {historyRows.length} result(s). Each user can complete each question set once; use Reset Retake when a retest is approved.
              </div>
              <div className="divide-y divide-slate-100">
                {historyRows.length ? historyRows.map((item) => (
                  <div key={item.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.35fr_1fr_1fr_130px_150px] lg:items-center">
                    <div>
                      <div className="text-sm font-black text-slate-950">{item.setTitle}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">{item.setCode}</div>
                    </div>
                    <div>
                      <div className="text-sm font-black text-slate-950">{item.displayName}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">{item.role}</div>
                    </div>
                    <div className="text-sm font-bold text-slate-600">
                      {formatDateTime(item.submittedAt)}
                    </div>
                    <div className="text-right">
                      <div className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${item.result === "Pass" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {item.result}
                      </div>
                      <div className="mt-1 text-xs font-black text-slate-500">{item.score}/{item.total}</div>
                    </div>
                    <div className="flex justify-end">
                      {canManagePreTest ? (
                        <button
                          type="button"
                          onClick={() => void resetRetake(item)}
                          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-700 transition hover:border-amber-300 hover:bg-amber-100"
                        >
                          Reset Retake
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-slate-400">Locked</span>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="p-10 text-center text-sm font-bold text-slate-500">No pre-test history found.</div>
                )}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string | number; tone: "emerald" | "sky" | "amber" }) {
  const toneClass = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  }[tone];
  return (
    <div className={`rounded-3xl border px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-5 py-3 text-sm font-black transition ${
        active ? "bg-slate-950 text-white shadow-[0_12px_28px_rgba(15,23,42,0.18)]" : "bg-white text-slate-600 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-950">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">{label}</div>
      {children}
    </label>
  );
}
