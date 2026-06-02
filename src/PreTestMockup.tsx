import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
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
const DEFAULT_SET_ID = "thai-help-plus-robinhood-2026";
const FORM_INPUT_CLASS = "h-[52px] w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50";

const DEFAULT_QUESTIONS: PreTestQuestion[] = [
  {
    id: "q1",
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
    id: "q2",
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
    id: "q3",
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
    id: "q4",
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
    id: "q5",
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
    id: "q6",
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
    id: "q7",
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
    id: "q8",
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
    id: "q9",
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
    id: "q10",
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

const DEFAULT_SET: PreTestSet = {
  id: DEFAULT_SET_ID,
  code: "PRE-THAI-HELP-PLUS-2026",
  title: "Scenario Based Pre-Test: ไทยช่วยไทย พลัส 60/40",
  description: "แบบทดสอบสถานการณ์สำหรับทีม Robinhood QA และ Admin Live Chat",
  passScore: 6,
  timeLimitSeconds: 90,
  active: true,
  questions: DEFAULT_QUESTIONS,
  updatedAt: "2026-06-03T00:00:00+07:00",
  updatedBy: "System",
};

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
  };
}

function mergeSets(localSets: PreTestSet[], logs: UsageLogEvent[]) {
  const map = new Map<string, PreTestSet>();
  map.set(DEFAULT_SET.id, DEFAULT_SET);
  localSets.forEach((set) => map.set(set.id, set));

  [...logs].reverse().forEach((log) => {
    if (log.event_type === "pretest_set_saved") {
      const set = normalizeSet(log.details?.set);
      if (set) map.set(set.id, set);
    }
    if (log.event_type === "pretest_set_deleted") {
      const setId = String(log.details?.setId || "");
      if (setId && setId !== DEFAULT_SET.id) map.delete(setId);
    }
  });

  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function mergeResults(localResults: PreTestResult[], logs: UsageLogEvent[]) {
  const map = new Map<string, PreTestResult>();
  localResults.forEach((result) => map.set(result.id, result));
  logs.forEach((log) => {
    const result = normalizeResult(log.details?.result);
    if (result) map.set(result.id, result);
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
  const currentQuestion = preparedQuestions[currentQuestionIndex];
  const answeredCount = Object.keys(answers).length;
  const inAttempt = Boolean(attemptId && preparedQuestions.length && !resultScreen);
  const progressPercent = preparedQuestions.length ? Math.round((answeredCount / preparedQuestions.length) * 100) : 0;
  const canSubmitAttempt = inAttempt && answeredCount === preparedQuestions.length;
  const historyRows = useMemo(() => {
    const search = historySearch.trim().toLowerCase();
    return results.filter((item) => {
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
  }, [historySearch, results]);

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
        const logs = await fetchUsageLogsByEventTypes(["pretest_set_saved", "pretest_set_deleted", "pretest_attempt_submitted"], 1000);
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
    if (remainingSeconds <= 0) {
      void finishAttempt("time-up");
      return;
    }
    const timer = window.setTimeout(() => setRemainingSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [inAttempt, remainingSeconds]);

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
    };
    const nextResults = [result, ...results.filter((item) => item.id !== result.id)];
    setResults(nextResults);
    writeLocal(RESULTS_STORAGE_KEY, nextResults);
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
    const nextSets = sets.filter((set) => set.id !== setId);
    setSets(nextSets);
    writeLocal(SETS_STORAGE_KEY, nextSets);
    if (selectedSetId === setId) setSelectedSetId(nextSets[0]?.id || DEFAULT_SET.id);
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
                    <button
                      type="button"
                      disabled={!canTakePreTest || !selectedSet.active}
                      onClick={startAttempt}
                      className="h-14 rounded-2xl bg-slate-950 px-8 text-sm font-black text-white shadow-[0_16px_40px_rgba(15,23,42,0.18)] transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      Start Test
                    </button>
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
                          <span className={`mr-3 inline-flex h-9 w-9 items-center justify-center rounded-2xl text-sm font-black ${
                            selected ? "bg-emerald-700 text-white" : "bg-slate-950 text-white"
                          }`}>
                            {choice.id}
                          </span>
                          <span className="text-sm font-bold leading-6 text-slate-800">{choice.text}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                className="w-full rounded-3xl bg-slate-950 px-5 py-4 text-left text-sm font-black text-white shadow-[0_18px_44px_rgba(15,23,42,0.18)] transition hover:bg-emerald-800"
              >
                Create New Question Set
              </button>
              {sets.map((set) => (
                <div key={set.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
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
                    <button type="button" onClick={() => editSet(set)} className="rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-sky-700">Edit</button>
                    <button type="button" onClick={() => void copyShareLink(set.id)} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Share</button>
                    <button type="button" onClick={() => void deleteSet(set.id)} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">Delete</button>
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
              ) : (
                <div className="flex min-h-[420px] items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50 text-center">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">No Set Opened</div>
                    <h2 className="mt-2 text-2xl font-black text-slate-950">Select a set to edit</h2>
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
              <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-950 p-5 text-white lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-100">Results History</div>
                  <h2 className="mt-2 text-2xl font-black">Pre-Test Attempts</h2>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder="Search user, set, result..."
                    className="h-12 rounded-2xl border border-white/15 bg-white px-4 text-sm font-bold text-slate-950 outline-none sm:w-80"
                  />
                  <button type="button" onClick={exportHistory} className="h-12 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white">
                    Export Results
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {historyRows.length ? historyRows.map((item) => (
                  <div key={item.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.5fr_1fr_1fr_130px] lg:items-center">
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
