import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PageHero from "./PageHero";
import { LoadingMascotPanel } from "./LoadingMascot";
import {
  fetchStoredEvaluations,
  type StoredEvaluation,
  type StoredEvaluationTopic,
} from "./evaluationStore";
import {
  fetchStoredCoachingRecords,
  upsertStoredCoachingRecord,
  type CoachingRecordResult,
  type CoachingRecordStatus,
  type CoachingTopicSnapshot,
  type StoredCoachingRecord,
} from "./coachingStore";
import { fetchHistoricalCoachingEvaluations } from "./coachingHistoricalStore";

type CoachingUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
  email?: string;
};

type CoachingMockupProps = {
  currentUser?: CoachingUser | null;
  externalSelectedAgent?: string;
  externalSelectedMonth?: string;
  externalSelectedWeek?: string;
  roleScopedAgentNames?: string[];
  onSelectedAgentChange?: (value: string) => void;
  onSelectedMonthChange?: (value: string) => void;
  onSelectedWeekChange?: (value: string) => void;
};

type TopicKey = "process" | "accuracy" | "handling" | "communication";
type WorkspaceTab = "feedback" | "evidence" | "record" | "history";

type TopicDefinition = {
  key: TopicKey;
  label: string;
  shortLabel: string;
  maxScore: number;
  observed: string;
  advice: string;
  steps: string[];
  target: string;
};

type TopicSummary = CoachingTopicSnapshot & {
  comments: string[];
  totalCases: number;
};

type CoachingPriority = {
  key: TopicKey;
  title: string;
  count: number;
  totalCases: number;
  percentage: number;
  caseIds: string[];
  observed: string;
  advice: string;
  steps: string[];
  target: string;
};

type CoachingDraft = {
  overview: string;
  strengths: string;
  mainIssues: string;
  repeatedIssues: string;
  recommendation: string;
  actionPlan: string;
  coachingDate: string;
  coachedBy: string;
  followUpDate: string;
  result: CoachingRecordResult;
  agentResponse: string;
  agreedActionPlan: string;
  additionalNote: string;
};

const TOPIC_DEFINITIONS: TopicDefinition[] = [
  {
    key: "process",
    label: "การดำเนินการตามขั้นตอนที่ถูกต้อง (Process Compliance)",
    shortLabel: "Process Compliance",
    maxScore: 30,
    observed:
      "พบว่ายังมีบางเคสที่ดำเนินการตาม Process หรือขั้นตอนหลังบ้านไม่ครบ ทำให้ผลลัพธ์ของเคสไม่สมบูรณ์",
    advice:
      "แนะนำให้ Agent เช็ก Process ล่าสุดและไล่ขั้นตอนหลังบ้านให้ครบก่อนแจ้งผลหรือปิดเคส โดยเน้นเฉพาะสิ่งที่ Process กำหนดจริง",
    steps: [
      "ตรวจสอบ Process ที่ตรงกับ Intent ของเคส",
      "เช็กการดำเนินการหลังบ้าน เช่น Case Note, Tag, Refund, Cancel หรือการส่งต่อ",
      "ก่อนปิดเคส ตรวจอีกครั้งว่าทำครบทุกขั้นตอนที่เกี่ยวข้องแล้ว",
    ],
    target:
      "ลดข้อผิดพลาดด้าน Process และไม่ให้เกิดข้อผิดพลาดลักษณะเดิมซ้ำในเดือนถัดไป",
  },
  {
    key: "accuracy",
    label:
      "ความถูกต้องของคำตอบและการตรวจสอบข้อมูล (Answer Accuracy & Verification)",
    shortLabel: "Answer Accuracy",
    maxScore: 20,
    observed:
      "พบว่าบางเคสยังตรวจสอบข้อมูลไม่ครบก่อนตอบ หรือสรุปข้อมูลไม่ตรงกับข้อเท็จจริงของเคส",
    advice:
      "แนะนำให้ Agent ตรวจสอบข้อมูลจากระบบหรือแหล่งอ้างอิงล่าสุดก่อนตอบ และเลือกแจ้งเฉพาะข้อมูลที่เกี่ยวข้องกับเคสนั้น เพื่อไม่ให้ผู้ติดต่อสับสน",
    steps: [
      "ตรวจสอบ Case ID, Order ID และสถานะล่าสุดให้ครบ",
      "เช็กเงื่อนไขหรือระยะเวลาจากแหล่งข้อมูลที่ถูกต้อง",
      "สรุปเฉพาะข้อมูลที่เกี่ยวข้องกับผู้ติดต่อและอ่านทวนก่อนส่ง",
    ],
    target:
      "ให้ข้อมูลถูกต้อง ตรวจสอบได้ และลดการแจ้งข้อมูลคลาดเคลื่อนในเคสถัดไป",
  },
  {
    key: "handling",
    label: "การดูแลเคสและติดตามผล (Case Handling & Follow-up)",
    shortLabel: "Case Handling",
    maxScore: 25,
    observed:
      "พบว่าบางเคสยังดูแลต่อเนื่องไม่ครบ หรือยังไม่ได้แจ้งขั้นตอนถัดไปให้ผู้ติดต่อเข้าใจชัดเจน",
    advice:
      "แนะนำให้ Agent บอกให้ชัดว่าแอดมินจะดำเนินการอะไรต่อ ผู้ติดต่อต้องรอหรือทำอะไร และเคสจะถือว่าจบเมื่อใด",
    steps: [
      "รับเรื่องและสรุปสิ่งที่จะดำเนินการต่อให้ชัด",
      "กรณีต้องรอหรือส่งต่อ ให้แจ้งเหตุผลและระยะเวลาที่เหมาะสม",
      "ติดตามผลและปิดเคสเมื่อมีข้อสรุปครบแล้ว",
    ],
    target:
      "ดูแลเคสตั้งแต่รับเรื่องจนมีข้อสรุป และทำให้ผู้ติดต่อทราบขั้นตอนถัดไปทุกครั้ง",
  },
  {
    key: "communication",
    label: "ทักษะการสื่อสาร (Communication Skills)",
    shortLabel: "Communication",
    maxScore: 25,
    observed:
      "พบว่าบางข้อความยังยาว เรียงลำดับไม่ชัด หรือใช้ถ้อยคำไม่เหมาะกับประเภทผู้ติดต่อ",
    advice:
      "แนะนำให้ Agent ใช้ประโยคสั้น เรียงข้อความเป็นลำดับ และเลือกคำให้เหมาะกับลูกค้า ไรเดอร์ หรือร้านค้า ก่อนส่งควรอ่านทวนอีกครั้ง",
    steps: [
      "เริ่มจากรับทราบปัญหาและสรุปสิ่งที่ผู้ติดต่อต้องการ",
      "แจ้งผลตรวจสอบหรือคำตอบแบบกระชับและตรงประเด็น",
      "ปิดท้ายด้วยขั้นตอนถัดไปและข้อความสุภาพที่เหมาะกับผู้ติดต่อ",
    ],
    target:
      "สื่อสารให้ชัด กระชับ สุภาพ และทำให้ผู้ติดต่อเข้าใจได้ในครั้งเดียว",
  },
];

const RESULT_OPTIONS: CoachingRecordResult[] = [
  "Pending Review",
  "Improved",
  "Partially Improved",
  "No Improvement",
];

const STATUS_OPTIONS: Array<
  "All" | CoachingRecordStatus | "Follow-up Due"
> = ["All", "Draft", "Coached", "Follow-up Due", "Completed"];

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactText(value: unknown) {
  return normalizeText(value).replace(/[^a-z0-9ก-๙]/g, "");
}

function titleCaseName(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((part) =>
      part
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : part
    )
    .join(" ");
}

function isSameAgent(a: string, b: string) {
  const left = compactText(a);
  const right = compactText(b);
  return Boolean(
    left &&
      right &&
      (left === right || left.includes(right) || right.includes(left))
  );
}

function parseEvaluationDate(value: unknown): Date | null {
  const text = String(value || "").trim();
  if (!text) return null;

  const slashMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (slashMatch) {
    let year = Number(slashMatch[3]);
    if (year > 2400) year -= 543;
    const date = new Date(
      year,
      Number(slashMatch[2]) - 1,
      Number(slashMatch[1]),
      Number(slashMatch[4] || 0),
      Number(slashMatch[5] || 0),
      Number(slashMatch[6] || 0)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    let year = Number(isoMatch[1]);
    if (year > 2400) year -= 543;
    const date = new Date(
      year,
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getEvaluationDate(item: StoredEvaluation) {
  return (
    parseEvaluationDate(item.auditTimestamp) ||
    parseEvaluationDate(item.auditDate) ||
    parseEvaluationDate(item.submittedAt) ||
    parseEvaluationDate(item.updatedAt) ||
    parseEvaluationDate(item.createdAt)
  );
}

function getMonthKey(date: Date | null) {
  if (!date) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

function getMonthLabel(monthKey: string) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey || "Unknown";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function previousMonthKey(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  return getMonthKey(new Date(Number(match[1]), Number(match[2]) - 2, 1));
}

function formatDateInput(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(value: string) {
  const date = parseEvaluationDate(value);
  if (!date) return value || "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function evaluationTimestamp(item: StoredEvaluation) {
  for (const value of [
    item.updatedAt,
    item.submittedAt,
    item.auditTimestamp,
    item.createdAt,
    item.auditDate,
  ]) {
    const date = parseEvaluationDate(value);
    if (date) return date.getTime();
  }
  return 0;
}

function dataSource(item: StoredEvaluation) {
  return String(
    item.rawDataPreview?.["Coaching Data Source"] || "Case Detail"
  );
}

function mergeEvaluationSources(
  historical: StoredEvaluation[],
  current: StoredEvaluation[]
) {
  const map = new Map<string, StoredEvaluation>();

  historical.forEach((item) => {
    const key = `${compactText(
      item.agentName || item.targetDisplayName
    )}::${compactText(item.caseId || item.id)}`;
    map.set(key, item);
  });

  current.forEach((item) => {
    const key = `${compactText(
      item.agentName || item.targetDisplayName
    )}::${compactText(item.caseId || item.id)}`;
    const existing = map.get(key);
    if (
      !existing ||
      dataSource(existing) === "Historical Data" ||
      evaluationTimestamp(item) >= evaluationTimestamp(existing)
    ) {
      map.set(key, {
        ...item,
        rawDataPreview: {
          ...(item.rawDataPreview || {}),
          "Coaching Data Source": "Case Detail",
        },
      });
    }
  });

  return [...map.values()];
}

function getTeamName(item: StoredEvaluation) {
  const preview = item.rawDataPreview || {};
  const candidates = [
    preview["Team"],
    preview["Team Name"],
    preview["TeamName"],
    preview["team"],
    preview["teamName"],
  ];
  const matched = candidates.find((value) =>
    String(value || "").trim()
  );
  return String(matched || item.targetRole || "Unassigned").trim();
}

function topicKeyFromTopic(
  topic: StoredEvaluationTopic
): TopicKey | null {
  const code = normalizeText(topic.code);
  const title = normalizeText(topic.title);
  const combined = `${code} ${title}`;

  if (
    /process|procedure|workflow|compliance|ขั้นตอน|หลังบ้าน|case note|tag|refund|cancel|logging|status accuracy/.test(
      combined
    )
  ) {
    return "process";
  }
  if (
    /accuracy|verification|correct|information|ข้อมูล|ตรวจสอบ|ถูกต้อง|สถานะ|ระยะเวลา|official source|completeness/.test(
      combined
    )
  ) {
    return "accuracy";
  }
  if (
    /handling|follow|ownership|root cause|resolution|next step|ดูแล|ติดตาม|รับผิดชอบ|ปิดเคส|ค้าง/.test(
      combined
    )
  ) {
    return "handling";
  }
  if (
    /communication|language|tone|empathy|structure|greeting|closing|adaptation|สื่อสาร|ภาษา|น้ำเสียง|ข้อความ/.test(
      combined
    )
  ) {
    return "communication";
  }

  if (code === "1" && Number(topic.max || 0) >= 20) return "process";
  if (code === "2" && Number(topic.max || 0) >= 15) return "accuracy";
  if (code === "3" && Number(topic.max || 0) >= 20) return "handling";
  if (code === "4" && Number(topic.max || 0) >= 20)
    return "communication";

  if (code.startsWith("5.")) return "process";
  if (code === "1.1") return "communication";
  if (code === "1.2" || code === "1.3") return "accuracy";
  if (code.startsWith("2.")) return "accuracy";
  if (code.startsWith("3.")) return "handling";
  if (code.startsWith("4.")) return "communication";
  return null;
}

function summarizeTopics(rows: StoredEvaluation[]): TopicSummary[] {
  return TOPIC_DEFINITIONS.map((definition) => {
    let scoreTotal = 0;
    let maxTotal = 0;
    const deductedCaseIds = new Set<string>();
    const comments: string[] = [];

    rows.forEach((evaluation) => {
      const matchingTopics = (evaluation.topics || []).filter(
        (topic) => topicKeyFromTopic(topic) === definition.key
      );
      if (!matchingTopics.length) return;

      const score = matchingTopics.reduce(
        (sum, topic) => sum + Number(topic.score || 0),
        0
      );
      const max = matchingTopics.reduce(
        (sum, topic) => sum + Number(topic.max || 0),
        0
      );

      scoreTotal += score;
      maxTotal += max;

      if (score < max) {
        deductedCaseIds.add(evaluation.caseId);
        matchingTopics.forEach((topic) => {
          const comment = String(topic.comment || "")
            .replace(/\s+/g, " ")
            .trim();
          if (comment) comments.push(comment);
        });
      }
    });

    const percentage =
      maxTotal > 0 ? (scoreTotal / maxTotal) * 100 : 0;
    const averageScore =
      maxTotal > 0
        ? (percentage / 100) * definition.maxScore
        : 0;

    return {
      key: definition.key,
      label: definition.label,
      averageScore: Number(averageScore.toFixed(2)),
      maxScore: definition.maxScore,
      percentage: Number(percentage.toFixed(2)),
      deductedCases: deductedCaseIds.size,
      caseIds: [...deductedCaseIds].filter(Boolean),
      comments: [...new Set(comments)].slice(0, 12),
      totalCases: rows.length,
    };
  });
}

function buildPriorities(
  topics: TopicSummary[]
): CoachingPriority[] {
  return topics
    .filter((topic) => topic.deductedCases > 0)
    .sort((a, b) => {
      if (b.deductedCases !== a.deductedCases) {
        return b.deductedCases - a.deductedCases;
      }
      return a.percentage - b.percentage;
    })
    .slice(0, 3)
    .map((topic) => {
      const definition = TOPIC_DEFINITIONS.find(
        (item) => item.key === topic.key
      )!;
      return {
        key: topic.key as TopicKey,
        title: definition.label,
        count: topic.deductedCases,
        totalCases: topic.totalCases,
        percentage: topic.percentage,
        caseIds: topic.caseIds,
        observed: definition.observed,
        advice: definition.advice,
        steps: definition.steps,
        target: definition.target,
      };
    });
}

function buildGrade(score: number) {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "B";
  if (score >= 80) return "C";
  if (score >= 70) return "D";
  return "F";
}

function buildDraft(
  agent: string,
  monthKey: string,
  rows: StoredEvaluation[],
  topics: TopicSummary[],
  priorities: CoachingPriority[],
  coachedBy: string
): CoachingDraft {
  const average =
    rows.reduce(
      (sum, item) => sum + Number(item.finalScore || 0),
      0
    ) / Math.max(rows.length, 1);
  const grade = buildGrade(average);
  const monthLabel = getMonthLabel(monthKey);
  const criticalCount = rows.filter(
    (item) => item.criticalError
  ).length;

  const strongest = [...topics]
    .filter((topic) => topic.percentage > 0)
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 3);

  const strengths = strongest.length
    ? strongest
        .map(
          (topic, index) =>
            `${index + 1}. ${topic.label.replace(
              /\s*\([^)]*\)\s*/g,
              ""
            )} ทำได้ค่อนข้างดี คะแนนเฉลี่ย ${topic.averageScore.toFixed(
              2
            )}/${topic.maxScore} ควรรักษามาตรฐานนี้ไว้ให้สม่ำเสมอ`
        )
        .join("\n")
    : "ยังไม่มีข้อมูลเพียงพอสำหรับสรุปจุดแข็งของเดือนนี้";

  const mainIssues = priorities.length
    ? priorities
        .map(
          (priority, index) =>
            `${index + 1}. ${priority.title.replace(
              /\s*\([^)]*\)\s*/g,
              ""
            )}\n${priority.observed}\nพบการหักคะแนน ${priority.count} จาก ${priority.totalCases} เคส`
        )
        .join("\n\n")
    : "เดือนนี้ไม่พบประเด็นที่ต้องเร่งปรับปรุงจากผลประเมิน";

  const repeated = priorities
    .filter((priority) => priority.count >= 2)
    .map(
      (priority, index) =>
        `${index + 1}. ${priority.title.replace(
          /\s*\([^)]*\)\s*/g,
          ""
        )} พบซ้ำ ${priority.count} เคส ควรกำหนดเป็นหัวข้อ Coaching หลัก`
    )
    .join("\n");

  const recommendation = priorities.length
    ? priorities
        .map(
          (priority, index) =>
            `${index + 1}. ${priority.advice}\nสิ่งที่ควรทำ: ${priority.steps.join(
              " → "
            )}`
        )
        .join("\n\n")
    : "ให้ชื่นชมสิ่งที่ทำได้ดีและย้ำให้รักษามาตรฐานเดิมในทุกเคส";

  const actionPlan = priorities.length
    ? [
        `1. ทบทวนประเด็นหลัก: ${priorities[0].title.replace(
          /\s*\([^)]*\)\s*/g,
          ""
        )}`,
        "2. ใช้ Checklist ก่อนตอบและก่อนปิดเคส",
        "3. เปิด Case Detail ตัวอย่าง 2–3 เคสเพื่อทบทวนสิ่งที่เกิดขึ้นจริง",
        "4. สุ่มติดตามเคสใหม่อย่างน้อย 3 เคสในเดือนถัดไป",
        `5. เป้าหมาย: ${priorities[0].target}`,
      ].join("\n")
    : [
        "1. รักษามาตรฐานในหัวข้อที่ทำได้ดี",
        "2. ใช้เคสคะแนนสูงเป็นตัวอย่าง",
        "3. สุ่มติดตามเคสใหม่อย่างน้อย 3 เคสในเดือนถัดไป",
      ].join("\n");

  return {
    overview: `${agent} มีผลประเมินเดือน ${monthLabel} จำนวน ${
      rows.length
    } เคส คะแนนเฉลี่ย ${average.toFixed(2)} ระดับ ${grade}${
      criticalCount
        ? ` และพบ Critical Error ${criticalCount} เคส`
        : ""
    } โดยประเด็น Coaching จะยึดจาก Case Detail จริงและเน้นเฉพาะเรื่องที่ควรปรับเป็นลำดับแรก`,
    strengths,
    mainIssues,
    repeatedIssues:
      repeated ||
      "ไม่พบข้อผิดพลาดประเภทเดียวกันตั้งแต่ 2 เคสขึ้นไปในเดือนนี้",
    recommendation,
    actionPlan,
    coachingDate: formatDateInput(),
    coachedBy,
    followUpDate: "",
    result: "Pending Review",
    agentResponse: "",
    agreedActionPlan: actionPlan,
    additionalNote: "",
  };
}

function recordDisplayStatus(record: StoredCoachingRecord) {
  if (
    record.status === "Coached" &&
    record.followUpDate &&
    record.result === "Pending Review"
  ) {
    const due = parseEvaluationDate(record.followUpDate);
    if (
      due &&
      due.getTime() < new Date().setHours(0, 0, 0, 0)
    ) {
      return "Follow-up Due";
    }
  }
  return record.status;
}

function statusTone(status: string) {
  if (status === "Completed")
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Coached")
    return "border-violet-200 bg-violet-50 text-violet-700";
  if (status === "Follow-up Due")
    return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function scoreTone(percentage: number) {
  if (percentage >= 90)
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (percentage >= 80)
    return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function AutoFitTextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "0px";
    ref.current.style.height = `${Math.max(
      ref.current.scrollHeight,
      120
    )}px`;
  }, [value]);

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
      />
    </label>
  );
}

function ReadCard({
  eyebrow,
  title,
  value,
  tone,
}: {
  eyebrow: string;
  title: string;
  value: string;
  tone: "green" | "rose" | "amber" | "violet";
}) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50/70 text-emerald-950",
    rose: "border-rose-200 bg-rose-50/70 text-rose-950",
    amber: "border-amber-200 bg-amber-50/70 text-amber-950",
    violet: "border-violet-200 bg-violet-50/70 text-violet-950",
  };
  return (
    <div className={`rounded-[26px] border p-5 ${tones[tone]}`}>
      <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-65">
        {eyebrow}
      </div>
      <div className="mt-1 text-lg font-black">{title}</div>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-7">
        {value}
      </div>
    </div>
  );
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div
        className={`max-h-[92vh] w-full overflow-hidden rounded-[30px] border border-white/60 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.35)] ${
          wide ? "max-w-6xl" : "max-w-3xl"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white">
          <div>
            <div className="text-xl font-black">{title}</div>
            {subtitle ? (
              <div className="mt-1 text-sm text-violet-100">
                {subtitle}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-black text-white transition hover:bg-white/20"
          >
            Close
          </button>
        </div>
        <div className="max-h-[calc(92vh-90px)] overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function CoachingMockup({
  currentUser,
  externalSelectedAgent,
  externalSelectedMonth,
  roleScopedAgentNames,
  onSelectedAgentChange,
  onSelectedMonthChange,
}: CoachingMockupProps) {
  const [evaluations, setEvaluations] = useState<
    StoredEvaluation[]
  >([]);
  const [records, setRecords] = useState<
    StoredCoachingRecord[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState(
    externalSelectedAgent || ""
  );
  const [selectedMonth, setSelectedMonth] = useState(
    externalSelectedMonth && externalSelectedMonth !== "all"
      ? externalSelectedMonth
      : ""
  );
  const [statusFilter, setStatusFilter] = useState<
    "All" | CoachingRecordStatus | "Follow-up Due"
  >("All");
  const [workspaceTab, setWorkspaceTab] =
    useState<WorkspaceTab>("feedback");
  const [draft, setDraft] =
    useState<CoachingDraft | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [activeRecord, setActiveRecord] =
    useState<StoredCoachingRecord | null>(null);
  const [selectedCase, setSelectedCase] =
    useState<StoredEvaluation | null>(null);
  const [showCoachedModal, setShowCoachedModal] =
    useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setIsLoading(true);
        setLoadError("");

        const [
          currentRows,
          historicalRows,
          coachingRows,
        ] = await Promise.all([
          fetchStoredEvaluations(1000),
          fetchHistoricalCoachingEvaluations().catch(() => []),
          fetchStoredCoachingRecords().catch(() => []),
        ]);

        if (cancelled) return;
        setEvaluations(
          mergeEvaluationSources(historicalRows, currentRows)
        );
        setRecords(coachingRows);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "ไม่สามารถโหลดข้อมูล Coaching ได้"
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const allowedAgents = useMemo(
    () =>
      (roleScopedAgentNames || [])
        .map((name) =>
          titleCaseName(String(name || ""))
        )
        .filter(Boolean),
    [roleScopedAgentNames]
  );

  const teamOptions = useMemo(() => {
    return [
      ...new Set(
        evaluations
          .filter(
            (item) =>
              !allowedAgents.length ||
              allowedAgents.some((name) =>
                isSameAgent(
                  name,
                  item.agentName ||
                    item.targetDisplayName
                )
              )
          )
          .map(getTeamName)
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b));
  }, [evaluations, allowedAgents]);

  const agentOptions = useMemo(() => {
    const rows = evaluations.filter(
      (item) =>
        selectedTeam === "all" ||
        getTeamName(item) === selectedTeam
    );
    const names = [
      ...new Set(
        rows
          .map((item) =>
            titleCaseName(
              item.agentName ||
                item.targetDisplayName
            )
          )
          .filter(Boolean)
      ),
    ].filter(
      (name) =>
        !allowedAgents.length ||
        allowedAgents.some((allowed) =>
          isSameAgent(allowed, name)
        )
    );
    return names.sort((a, b) =>
      a.localeCompare(b)
    );
  }, [evaluations, selectedTeam, allowedAgents]);

  useEffect(() => {
    if (
      externalSelectedAgent &&
      externalSelectedAgent !== selectedAgent
    ) {
      const exists = agentOptions.some((name) =>
        isSameAgent(name, externalSelectedAgent)
      );
      if (exists) setSelectedAgent(externalSelectedAgent);
    }
  }, [
    externalSelectedAgent,
    agentOptions,
    selectedAgent,
  ]);

  useEffect(() => {
    if (!agentOptions.length) {
      setSelectedAgent("");
      return;
    }
    if (
      !selectedAgent ||
      !agentOptions.some((name) =>
        isSameAgent(name, selectedAgent)
      )
    ) {
      const next = agentOptions[0];
      setSelectedAgent(next);
      onSelectedAgentChange?.(next);
    }
  }, [
    agentOptions,
    selectedAgent,
    onSelectedAgentChange,
  ]);

  const selectedAgentRows = useMemo(
    () =>
      evaluations.filter((item) =>
        isSameAgent(
          item.agentName ||
            item.targetDisplayName,
          selectedAgent
        )
      ),
    [evaluations, selectedAgent]
  );

  const monthOptions = useMemo(() => {
    return [
      ...new Set(
        selectedAgentRows
          .map((item) =>
            getMonthKey(getEvaluationDate(item))
          )
          .filter((key) => key !== "unknown")
      ),
    ].sort((a, b) => b.localeCompare(a));
  }, [selectedAgentRows]);

  useEffect(() => {
    if (!monthOptions.length) {
      setSelectedMonth("");
      return;
    }
    if (
      !selectedMonth ||
      !monthOptions.includes(selectedMonth)
    ) {
      const next = monthOptions[0];
      setSelectedMonth(next);
      onSelectedMonthChange?.(next);
    }
  }, [
    monthOptions,
    selectedMonth,
    onSelectedMonthChange,
  ]);

  const monthlyRows = useMemo(
    () =>
      selectedAgentRows
        .filter(
          (item) =>
            getMonthKey(getEvaluationDate(item)) ===
            selectedMonth
        )
        .sort(
          (a, b) =>
            evaluationTimestamp(b) -
            evaluationTimestamp(a)
        ),
    [selectedAgentRows, selectedMonth]
  );

  const selectedTeamName = monthlyRows[0]
    ? getTeamName(monthlyRows[0])
    : selectedTeam === "all"
    ? ""
    : selectedTeam;

  const topicSummaries = useMemo(
    () => summarizeTopics(monthlyRows),
    [monthlyRows]
  );
  const priorities = useMemo(
    () => buildPriorities(topicSummaries),
    [topicSummaries]
  );

  const averageScore =
    monthlyRows.reduce(
      (sum, item) =>
        sum + Number(item.finalScore || 0),
      0
    ) / Math.max(monthlyRows.length, 1);
  const criticalErrors = monthlyRows.filter(
    (item) => item.criticalError
  ).length;
  const caseReferences = monthlyRows
    .map((item) => item.caseId)
    .filter(Boolean);
  const grade = monthlyRows.length
    ? buildGrade(averageScore)
    : "-";

  const previousKey =
    previousMonthKey(selectedMonth);
  const previousRows = useMemo(
    () =>
      selectedAgentRows.filter(
        (item) =>
          getMonthKey(getEvaluationDate(item)) ===
          previousKey
      ),
    [selectedAgentRows, previousKey]
  );
  const previousAverage =
    previousRows.reduce(
      (sum, item) =>
        sum + Number(item.finalScore || 0),
      0
    ) / Math.max(previousRows.length, 1);
  const previousTopics = useMemo(
    () => summarizeTopics(previousRows),
    [previousRows]
  );

  const matchingRecord = useMemo(
    () =>
      records.find(
        (item) =>
          isSameAgent(
            item.agent,
            selectedAgent
          ) &&
          item.monthKey === selectedMonth
      ) || null,
    [records, selectedAgent, selectedMonth]
  );

  useEffect(() => {
    setActiveRecord(matchingRecord);
    if (matchingRecord) {
      setDraft({
        overview: `${matchingRecord.agent} มีผลประเมินเดือน ${matchingRecord.monthLabel} จำนวน ${matchingRecord.evaluatedCases} เคส คะแนนเฉลี่ย ${matchingRecord.averageScore.toFixed(
          2
        )} ระดับ ${matchingRecord.grade}`,
        strengths: matchingRecord.strengths,
        mainIssues: matchingRecord.mainIssues,
        repeatedIssues:
          matchingRecord.repeatedIssues,
        recommendation:
          matchingRecord.coachingRecommendation,
        actionPlan: matchingRecord.actionPlan,
        coachingDate:
          matchingRecord.coachingDate,
        coachedBy: matchingRecord.coachedBy,
        followUpDate:
          matchingRecord.followUpDate,
        result: matchingRecord.result,
        agentResponse:
          matchingRecord.agentResponse,
        agreedActionPlan:
          matchingRecord.agreedActionPlan ||
          matchingRecord.actionPlan,
        additionalNote:
          matchingRecord.additionalNote,
      });
      setEditMode(false);
    } else {
      setDraft(null);
      setEditMode(false);
    }
    setSaveMessage("");
  }, [
    matchingRecord?.id,
    selectedAgent,
    selectedMonth,
  ]);

  const generateCoaching = () => {
    if (
      !selectedAgent ||
      !selectedMonth ||
      !monthlyRows.length
    )
      return;

    setDraft(
      buildDraft(
        selectedAgent,
        selectedMonth,
        monthlyRows,
        topicSummaries,
        priorities,
        currentUser?.displayName ||
          currentUser?.agentName ||
          currentUser?.username ||
          ""
      )
    );
    setEditMode(false);
    setWorkspaceTab("feedback");
    setSaveMessage(
      "สร้าง Coaching Draft จาก Case Detail เรียบร้อยแล้ว"
    );
  };

  const buildRecord = (
    status: CoachingRecordStatus =
      activeRecord?.status || "Draft"
  ): StoredCoachingRecord | null => {
    if (
      !draft ||
      !selectedAgent ||
      !selectedMonth ||
      !monthlyRows.length
    )
      return null;

    const now = new Date().toISOString();
    const id =
      activeRecord?.id ||
      `coaching-${compactText(
        selectedAgent
      )}-${selectedMonth}`.replace(
        /[^a-z0-9ก-๙_-]/gi,
        "-"
      );

    return {
      id,
      coachingDate:
        draft.coachingDate || formatDateInput(),
      coachedBy:
        draft.coachedBy ||
        currentUser?.displayName ||
        currentUser?.agentName ||
        currentUser?.username ||
        "",
      agent: selectedAgent,
      team: selectedTeamName,
      monthKey: selectedMonth,
      monthLabel: getMonthLabel(selectedMonth),
      evaluatedCases: monthlyRows.length,
      averageScore: Number(
        averageScore.toFixed(2)
      ),
      grade,
      criticalErrors,
      strengths: draft.strengths,
      mainIssues: draft.mainIssues,
      repeatedIssues: draft.repeatedIssues,
      coachingRecommendation:
        draft.recommendation,
      actionPlan: draft.actionPlan,
      followUpDate: draft.followUpDate,
      result: draft.result,
      status,
      caseReferences,
      topicSnapshot: topicSummaries,
      agentResponse: draft.agentResponse,
      agreedActionPlan:
        draft.agreedActionPlan ||
        draft.actionPlan,
      additionalNote: draft.additionalNote,
      createdAt:
        activeRecord?.createdAt || now,
      updatedAt: now,
    };
  };

  const saveRecord = async (
    status?: CoachingRecordStatus
  ) => {
    const record = buildRecord(
      status ||
        activeRecord?.status ||
        "Draft"
    );
    if (!record) {
      setSaveMessage(
        "กรุณากด Generate Coaching ก่อนบันทึก"
      );
      return null;
    }

    setIsSaving(true);
    try {
      const saved =
        await upsertStoredCoachingRecord(record);
      setActiveRecord(saved);
      setRecords((previous) => [
        saved,
        ...previous.filter(
          (item) => item.id !== saved.id
        ),
      ]);
      setSaveMessage(
        saved.status === "Draft"
          ? "บันทึก Coaching Record เป็น Draft เรียบร้อยแล้ว"
          : `บันทึกสถานะ ${saved.status} เรียบร้อยแล้ว`
      );
      return saved;
    } catch (error) {
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถบันทึก Coaching Record ได้"
      );
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const markAsCoached = async () => {
    const saved = await saveRecord("Coached");
    if (saved) setShowCoachedModal(false);
  };

  const markCompleted = async () => {
    await saveRecord("Completed");
  };

  const exportPdf = () => {
    const record = buildRecord(
      activeRecord?.status || "Draft"
    );
    if (!record) {
      setSaveMessage(
        "กรุณากด Generate Coaching ก่อน Export PDF"
      );
      return;
    }

    const topicHtml = record.topicSnapshot
      .map(
        (topic) => `
          <tr>
            <td>${escapeHtml(topic.label)}</td>
            <td>${topic.averageScore.toFixed(
              2
            )} / ${topic.maxScore}</td>
            <td>${topic.percentage.toFixed(
              2
            )}%</td>
            <td>${topic.deductedCases}</td>
          </tr>`
      )
      .join("");

    const win = window.open("", "_blank");
    if (!win) {
      setSaveMessage(
        "Browser ปิดกั้นหน้าต่าง Export PDF กรุณาอนุญาต Pop-up"
      );
      return;
    }
    win.opener = null;

    win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Coaching Record - ${escapeHtml(
      record.agent
    )} - ${escapeHtml(record.monthLabel)}</title>
<style>
@page { size: A4; margin: 14mm; }
body { font-family: "Kanit", "Noto Sans Thai", Arial, sans-serif; color:#172033; font-size:12px; line-height:1.6; }
h1 { font-size:24px; margin:0 0 4px; color:#4c1d95; }
h2 { font-size:15px; margin:20px 0 8px; color:#5b21b6; border-bottom:1px solid #ddd6fe; padding-bottom:5px; }
.meta { display:grid; grid-template-columns:1fr 1fr; gap:6px 18px; background:#f5f3ff; padding:12px; border-radius:12px; }
.box { white-space:pre-wrap; border:1px solid #e2e8f0; border-radius:10px; padding:10px; }
table { width:100%; border-collapse:collapse; }
th,td { border:1px solid #e2e8f0; padding:7px; text-align:left; vertical-align:top; }
th { background:#f5f3ff; color:#4c1d95; }
</style>
</head>
<body>
<h1>Monthly Coaching Record</h1>
<div>${escapeHtml(record.agent)} • ${escapeHtml(
      record.monthLabel
    )}</div>
<div class="meta">
<div><strong>Coaching Date:</strong> ${escapeHtml(
      formatDisplayDate(record.coachingDate)
    )}</div>
<div><strong>Coached By:</strong> ${escapeHtml(
      record.coachedBy
    )}</div>
<div><strong>Agent:</strong> ${escapeHtml(
      record.agent
    )}</div>
<div><strong>Team:</strong> ${escapeHtml(
      record.team || "-"
    )}</div>
<div><strong>Evaluated Cases:</strong> ${
      record.evaluatedCases
    }</div>
<div><strong>Average Score:</strong> ${record.averageScore.toFixed(
      2
    )} (${escapeHtml(record.grade)})</div>
<div><strong>Follow-up Date:</strong> ${escapeHtml(
      formatDisplayDate(record.followUpDate)
    )}</div>
<div><strong>Result:</strong> ${escapeHtml(
      record.result
    )}</div>
</div>
<h2>Monthly Topic Summary</h2>
<table><thead><tr><th>Topic</th><th>Average</th><th>Percentage</th><th>Deducted Cases</th></tr></thead><tbody>${topicHtml}</tbody></table>
<h2>Strengths</h2><div class="box">${escapeHtml(
      record.strengths
    )}</div>
<h2>Main Issues</h2><div class="box">${escapeHtml(
      record.mainIssues
    )}</div>
<h2>Repeated Issues</h2><div class="box">${escapeHtml(
      record.repeatedIssues
    )}</div>
<h2>Coaching Recommendation</h2><div class="box">${escapeHtml(
      record.coachingRecommendation
    )}</div>
<h2>Action Plan</h2><div class="box">${escapeHtml(
      record.actionPlan
    )}</div>
<h2>Case References</h2><div class="box">${escapeHtml(
      record.caseReferences.join(", ")
    )}</div>
<script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
</body>
</html>`);
    win.document.close();
  };

  const filteredHistory = useMemo(
    () =>
      records.filter((record) => {
        if (
          selectedAgent &&
          !isSameAgent(
            record.agent,
            selectedAgent
          )
        )
          return false;
        const displayStatus =
          recordDisplayStatus(record);
        return (
          statusFilter === "All" ||
          displayStatus === statusFilter
        );
      }),
    [records, selectedAgent, statusFilter]
  );

  const dataSourceSummary = useMemo(() => {
    const caseDetail = monthlyRows.filter(
      (item) => dataSource(item) === "Case Detail"
    ).length;
    return {
      caseDetail,
      historical: monthlyRows.length - caseDetail,
    };
  }, [monthlyRows]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <LoadingMascotPanel
          message="กำลังโหลด Monthly Coaching..."
          subMessage="กำลังรวม Case Detail และข้อมูลย้อนหลัง"
        />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-[28px] border border-rose-200 bg-white p-6 text-rose-700 shadow-sm">
          <div className="text-xl font-black">
            โหลดข้อมูล Coaching ไม่สำเร็จ
          </div>
          <div className="mt-2 text-sm">
            {loadError}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-monthly-coaching-v2
      className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 pb-12"
    >
      <PageHero
        eyebrow="Quality"
        title="Coaching"
        subtitle="สรุป Feedback รายเดือน จุดแข็ง ประเด็นที่ต้องปรับ และประวัติการโค้ช"
      />

      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
        <section className="rounded-[30px] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(76,29,149,0.08)]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label>
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Team
              </span>
              <select
                value={selectedTeam}
                onChange={(event) => {
                  setSelectedTeam(event.target.value);
                  setSelectedAgent("");
                  setSelectedMonth("");
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              >
                <option value="all">All Teams</option>
                {teamOptions.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Agent
              </span>
              <select
                value={selectedAgent}
                onChange={(event) => {
                  setSelectedAgent(event.target.value);
                  setSelectedMonth("");
                  onSelectedAgentChange?.(
                    event.target.value
                  );
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              >
                {agentOptions.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Month
              </span>
              <select
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  onSelectedMonthChange?.(
                    event.target.value
                  );
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              >
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {getMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Coaching Status
              </span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value as
                      | "All"
                      | CoachingRecordStatus
                      | "Follow-up Due"
                  )
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={generateCoaching}
              disabled={!monthlyRows.length}
              className="rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Generate Coaching
            </button>
            <button
              type="button"
              onClick={() => void saveRecord("Draft")}
              disabled={!draft || isSaving}
              className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-50 disabled:opacity-40"
            >
              Save Coaching Record
            </button>
            <button
              type="button"
              onClick={() =>
                setShowCoachedModal(true)
              }
              disabled={!draft}
              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40"
            >
              Mark as Coached
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={!draft}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-900 disabled:opacity-40"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={() =>
                setWorkspaceTab("history")
              }
              className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
            >
              View Coaching History
            </button>
            {activeRecord?.status === "Coached" ? (
              <button
                type="button"
                onClick={() =>
                  void markCompleted()
                }
                className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-3 text-sm font-black text-sky-700"
              >
                Mark Completed
              </button>
            ) : null}
          </div>

          {saveMessage ? (
            <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">
              {saveMessage}
            </div>
          ) : null}
        </section>

        {!monthlyRows.length ? (
          <section className="rounded-[30px] border border-dashed border-violet-200 bg-white p-10 text-center shadow-sm">
            <div className="text-xl font-black text-slate-900">
              ไม่พบผลประเมินของ Agent ในเดือนที่เลือก
            </div>
            <div className="mt-2 text-sm text-slate-500">
              ระบบจะไม่สร้าง Feedback แบบคาดเดา
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              {[
                [
                  "Evaluated Cases",
                  String(monthlyRows.length),
                ],
                [
                  "Average Score",
                  averageScore.toFixed(2),
                ],
                ["Grade", grade],
                [
                  "Critical Errors",
                  String(criticalErrors),
                ],
                [
                  "Case Detail",
                  String(dataSourceSummary.caseDetail),
                ],
                [
                  "Historical Data",
                  String(dataSourceSummary.historical),
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[24px] border border-violet-100 bg-white p-5 shadow-[0_14px_36px_rgba(76,29,149,0.07)]"
                >
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                    {label}
                  </div>
                  <div className="mt-2 text-2xl font-black text-slate-950">
                    {value}
                  </div>
                </div>
              ))}
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {topicSummaries.map((topic) => (
                <div
                  key={topic.key}
                  className={`rounded-[26px] border p-5 shadow-sm ${scoreTone(
                    topic.percentage
                  )}`}
                >
                  <div className="text-xs font-black uppercase tracking-[0.12em] opacity-75">
                    {
                      TOPIC_DEFINITIONS.find(
                        (item) =>
                          item.key === topic.key
                      )?.shortLabel
                    }
                  </div>
                  <div className="mt-2 text-2xl font-black">
                    {topic.averageScore.toFixed(2)} /{" "}
                    {topic.maxScore}
                  </div>
                  <div className="mt-1 text-sm font-bold">
                    {topic.percentage.toFixed(2)}% •
                    ถูกหัก {topic.deductedCases} เคส
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-[30px] border border-violet-100 bg-white p-3 shadow-[0_18px_50px_rgba(76,29,149,0.08)]">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["feedback", "Monthly Feedback"],
                  ["evidence", "Case Evidence"],
                  ["record", "Coaching Record"],
                  ["history", "Coaching History"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      setWorkspaceTab(
                        value as WorkspaceTab
                      )
                    }
                    className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                      workspaceTab === value
                        ? "bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white shadow-lg"
                        : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {workspaceTab === "feedback" ? (
              <div className="space-y-6">
                {priorities.length ? (
                  <section className="grid gap-4 lg:grid-cols-3">
                    {priorities.map(
                      (priority, index) => (
                        <div
                          key={priority.key}
                          className="rounded-[28px] border border-rose-200 bg-gradient-to-br from-white to-rose-50 p-5 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="rounded-full bg-rose-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
                              Priority {index + 1}
                            </span>
                            {priority.count >= 2 ? (
                              <span className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[10px] font-black text-rose-700">
                                Repeated Issue
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-4 text-lg font-black text-slate-950">
                            {priority.title.replace(
                              /\s*\([^)]*\)\s*/g,
                              ""
                            )}
                          </div>
                          <div className="mt-2 text-sm font-bold text-rose-700">
                            พบ {priority.count} จาก{" "}
                            {priority.totalCases} เคส
                          </div>
                          <div className="mt-3 text-sm leading-7 text-slate-600">
                            {priority.observed}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {priority.caseIds
                              .slice(0, 3)
                              .map((caseId) => (
                                <button
                                  key={caseId}
                                  type="button"
                                  onClick={() =>
                                    setSelectedCase(
                                      monthlyRows.find(
                                        (item) =>
                                          item.caseId ===
                                          caseId
                                      ) || null
                                    )
                                  }
                                  className="rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-xs font-black text-violet-700"
                                >
                                  {caseId}
                                </button>
                              ))}
                            {priority.caseIds.length > 3 ? (
                              <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500">
                                +{priority.caseIds.length - 3}{" "}
                                เคส
                              </span>
                            ) : null}
                          </div>
                        </div>
                      )
                    )}
                  </section>
                ) : null}

                <section className="rounded-[30px] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(76,29,149,0.08)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">
                        Monthly Feedback
                      </div>
                      <div className="mt-1 text-2xl font-black text-slate-950">
                        คำแนะนำสำหรับ Coaching
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        สรุปเป็นภาษาที่ใช้พูดกับ Agent ได้ทันที โดยแยก Case ID ออกจากเนื้อหา
                      </div>
                    </div>
                    {draft ? (
                      <button
                        type="button"
                        onClick={() =>
                          setEditMode(
                            (previous) => !previous
                          )
                        }
                        className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-black text-violet-700"
                      >
                        {editMode
                          ? "Done Editing"
                          : "Edit Feedback"}
                      </button>
                    ) : null}
                  </div>

                  {!draft ? (
                    <div className="mt-6 rounded-[24px] border border-dashed border-violet-200 bg-violet-50/50 p-8 text-center">
                      <div className="text-lg font-black text-slate-900">
                        กด Generate Coaching เพื่อสร้าง Feedback
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        ระบบจะเลือกเฉพาะ 3 ประเด็นสำคัญและใช้ Case Detail เป็นหลักฐาน
                      </div>
                    </div>
                  ) : editMode ? (
                    <div className="mt-6 space-y-5">
                      <AutoFitTextArea
                        label="ภาพรวมผลงาน"
                        value={draft.overview}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            overview: value,
                          })
                        }
                      />
                      <AutoFitTextArea
                        label="สิ่งที่ทำได้ดี"
                        value={draft.strengths}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            strengths: value,
                          })
                        }
                      />
                      <AutoFitTextArea
                        label="สิ่งที่ต้องปรับปรุง"
                        value={draft.mainIssues}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            mainIssues: value,
                          })
                        }
                      />
                      <AutoFitTextArea
                        label="ข้อผิดพลาดที่เกิดซ้ำ"
                        value={draft.repeatedIssues}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            repeatedIssues: value,
                          })
                        }
                      />
                      <AutoFitTextArea
                        label="คำแนะนำสำหรับ Coaching"
                        value={draft.recommendation}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            recommendation: value,
                          })
                        }
                      />
                      <AutoFitTextArea
                        label="Action Plan"
                        value={draft.actionPlan}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            actionPlan: value,
                          })
                        }
                      />
                    </div>
                  ) : (
                    <div className="mt-6 grid gap-5 lg:grid-cols-2">
                      <ReadCard
                        eyebrow="Overview"
                        title="ภาพรวมผลงาน"
                        value={draft.overview}
                        tone="violet"
                      />
                      <ReadCard
                        eyebrow="Strengths"
                        title="สิ่งที่ทำได้ดี"
                        value={draft.strengths}
                        tone="green"
                      />
                      <ReadCard
                        eyebrow="Main Issues"
                        title="สิ่งที่ต้องปรับปรุง"
                        value={draft.mainIssues}
                        tone="rose"
                      />
                      <ReadCard
                        eyebrow="Repeated Issues"
                        title="ข้อผิดพลาดที่เกิดซ้ำ"
                        value={draft.repeatedIssues}
                        tone="amber"
                      />
                      <ReadCard
                        eyebrow="Recommendation"
                        title="คำแนะนำสำหรับ Coaching"
                        value={draft.recommendation}
                        tone="violet"
                      />
                      <ReadCard
                        eyebrow="Action Plan"
                        title="แผนติดตามเดือนถัดไป"
                        value={draft.actionPlan}
                        tone="violet"
                      />
                    </div>
                  )}
                </section>

                <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                    Monthly Comparison
                  </div>
                  <div className="mt-1 text-xl font-black text-slate-950">
                    {getMonthLabel(selectedMonth)} vs{" "}
                    {previousKey
                      ? getMonthLabel(previousKey)
                      : "-"}
                  </div>
                  {!previousRows.length ? (
                    <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                      ไม่พบข้อมูลเดือนก่อนหน้าสำหรับเปรียบเทียบ
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4 text-sm leading-7 text-violet-900">
                        คะแนนเฉลี่ย{" "}
                        {averageScore >= previousAverage
                          ? "เพิ่มขึ้น"
                          : "ลดลง"}{" "}
                        จาก {previousAverage.toFixed(2)} เป็น{" "}
                        {averageScore.toFixed(2)} คะแนน
                        {priorities[0]
                          ? ` โดยยังควรติดตามเรื่อง ${priorities[0].title.replace(
                              /\s*\([^)]*\)\s*/g,
                              ""
                            )} ต่อในเดือนถัดไป`
                          : " และไม่พบประเด็นที่ต้องเร่งติดตาม"}
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {topicSummaries.map((topic) => {
                          const previous =
                            previousTopics.find(
                              (item) =>
                                item.key === topic.key
                            );
                          return (
                            <div
                              key={topic.key}
                              className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold"
                            >
                              <span className="truncate">
                                {
                                  TOPIC_DEFINITIONS.find(
                                    (item) =>
                                      item.key ===
                                      topic.key
                                  )?.shortLabel
                                }
                              </span>
                              <span className="whitespace-nowrap">
                                {(
                                  previous?.averageScore || 0
                                ).toFixed(2)}{" "}
                                →{" "}
                                {topic.averageScore.toFixed(
                                  2
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </section>
              </div>
            ) : null}

            {workspaceTab === "evidence" ? (
              <section className="rounded-[30px] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(76,29,149,0.08)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">
                  Case Evidence
                </div>
                <div className="mt-1 text-2xl font-black text-slate-950">
                  Case Detail References
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {monthlyRows.map((item) => (
                    <button
                      key={item.id || item.caseId}
                      type="button"
                      onClick={() =>
                        setSelectedCase(item)
                      }
                      className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-left transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50 hover:shadow-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-black text-violet-700">
                            {item.caseId}
                          </div>
                          <div className="mt-1 text-xs font-bold text-slate-400">
                            {formatDisplayDate(
                              item.auditDate ||
                                item.auditTimestamp ||
                                item.submittedAt
                            )}
                          </div>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-1.5 text-sm font-black text-slate-900 shadow-sm">
                          {Number(
                            item.finalScore || 0
                          ).toFixed(2)}
                        </div>
                      </div>
                      <div className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                        {item.inquiry ||
                          item.caseDescription ||
                          "ไม่พบรายละเอียด Intent"}
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-black text-slate-500">
                          {dataSource(item)}
                        </span>
                        <span className="text-xs font-black text-violet-700">
                          Open Case Detail
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {workspaceTab === "record" ? (
              <section className="rounded-[30px] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(76,29,149,0.08)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">
                  Coaching Record
                </div>
                <div className="mt-1 text-2xl font-black text-slate-950">
                  บันทึกการ Coaching และติดตามผล
                </div>
                {!draft ? (
                  <div className="mt-6 rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                    กรุณากด Generate Coaching ก่อนบันทึกข้อมูล
                  </div>
                ) : (
                  <>
                    <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                      <label>
                        <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                          Coaching Date
                        </span>
                        <input
                          type="date"
                          value={draft.coachingDate}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              coachingDate:
                                event.target.value,
                            })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                        />
                      </label>
                      <label>
                        <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                          Coached By
                        </span>
                        <input
                          value={draft.coachedBy}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              coachedBy:
                                event.target.value,
                            })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                        />
                      </label>
                      <label>
                        <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                          Follow-up Date
                        </span>
                        <input
                          type="date"
                          value={draft.followUpDate}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              followUpDate:
                                event.target.value,
                            })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                        />
                      </label>
                      <label>
                        <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                          Result
                        </span>
                        <select
                          value={draft.result}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              result: event.target
                                .value as CoachingRecordResult,
                            })
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                        >
                          {RESULT_OPTIONS.map(
                            (result) => (
                              <option
                                key={result}
                                value={result}
                              >
                                {result}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                    </div>
                    <div className="mt-5 grid gap-5 lg:grid-cols-3">
                      <AutoFitTextArea
                        label="Agent Response"
                        value={draft.agentResponse}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            agentResponse: value,
                          })
                        }
                      />
                      <AutoFitTextArea
                        label="Agreed Action Plan"
                        value={draft.agreedActionPlan}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            agreedActionPlan: value,
                          })
                        }
                      />
                      <AutoFitTextArea
                        label="Additional Note"
                        value={draft.additionalNote}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            additionalNote: value,
                          })
                        }
                      />
                    </div>
                  </>
                )}
              </section>
            ) : null}

            {workspaceTab === "history" ? (
              <section className="rounded-[30px] border border-violet-100 bg-white p-6 shadow-[0_18px_50px_rgba(76,29,149,0.08)]">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-600">
                      Coaching History
                    </div>
                    <div className="mt-1 text-2xl font-black text-slate-950">
                      ประวัติ Coaching ย้อนหลัง
                    </div>
                  </div>
                  <div className="text-sm font-bold text-slate-500">
                    {filteredHistory.length} record(s)
                  </div>
                </div>
                <div className="mt-5 overflow-x-auto rounded-[24px] border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {[
                          "Month",
                          "Coaching Date",
                          "Coached By",
                          "Main Issues",
                          "Follow-up Date",
                          "Result",
                          "Status",
                          "Action",
                        ].map((label) => (
                          <th
                            key={label}
                            className="whitespace-nowrap px-4 py-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredHistory.map(
                        (record) => (
                          <tr key={record.id}>
                            <td className="whitespace-nowrap px-4 py-4 font-black text-slate-900">
                              {record.monthLabel}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              {formatDisplayDate(
                                record.coachingDate
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              {record.coachedBy || "-"}
                            </td>
                            <td className="max-w-[320px] px-4 py-4">
                              <div className="line-clamp-3 whitespace-pre-wrap text-slate-600">
                                {record.mainIssues ||
                                  "-"}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              {formatDisplayDate(
                                record.followUpDate
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              {record.result}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-black ${statusTone(
                                  recordDisplayStatus(
                                    record
                                  )
                                )}`}
                              >
                                {recordDisplayStatus(
                                  record
                                )}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTeam(
                                    record.team || "all"
                                  );
                                  setSelectedAgent(
                                    record.agent
                                  );
                                  setSelectedMonth(
                                    record.monthKey
                                  );
                                  setWorkspaceTab(
                                    "feedback"
                                  );
                                }}
                                className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700"
                              >
                                Open
                              </button>
                            </td>
                          </tr>
                        )
                      )}
                      {!filteredHistory.length ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-6 py-10 text-center text-slate-500"
                          >
                            ไม่พบ Coaching Record ตามตัวกรองที่เลือก
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>

      {selectedCase ? (
        <ModalShell
          title={`Case Detail: ${selectedCase.caseId}`}
          subtitle={`${selectedCase.agentName ||
            selectedCase.targetDisplayName} • ${formatDisplayDate(
            selectedCase.auditDate ||
              selectedCase.auditTimestamp ||
              selectedCase.submittedAt
          )} • ${dataSource(selectedCase)}`}
          onClose={() => setSelectedCase(null)}
          wide
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                "Final Score",
                Number(
                  selectedCase.finalScore || 0
                ).toFixed(2),
              ],
              [
                "Grade",
                selectedCase.grade ||
                  buildGrade(
                    selectedCase.finalScore || 0
                  ),
              ],
              [
                "Critical Error",
                selectedCase.criticalError
                  ? "Yes"
                  : "No",
              ],
              [
                "Source",
                dataSource(selectedCase),
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  {label}
                </div>
                <div className="mt-1 text-lg font-black text-slate-950">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 p-5">
              <div className="text-sm font-black text-slate-950">
                Intent / Inquiry
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {selectedCase.inquiry || "-"}
              </div>
            </div>
            <div className="rounded-[24px] border border-slate-200 p-5">
              <div className="text-sm font-black text-slate-950">
                Case Description
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {selectedCase.caseDescription ||
                  "-"}
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {(selectedCase.topics || []).map(
              (topic) => (
                <div
                  key={topic.code}
                  className="rounded-[22px] border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-black text-slate-950">
                      {topic.code} {topic.title}
                    </div>
                    <div className="rounded-xl bg-violet-50 px-3 py-1.5 text-sm font-black text-violet-700">
                      {Number(
                        topic.score || 0
                      ).toFixed(2)}{" "}
                      /{" "}
                      {Number(
                        topic.max || 0
                      ).toFixed(2)}
                    </div>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                    {topic.comment ||
                      "ไม่พบรายละเอียด Feedback"}
                  </div>
                </div>
              )
            )}
          </div>
        </ModalShell>
      ) : null}

      {showCoachedModal && draft ? (
        <ModalShell
          title="Mark as Coached"
          subtitle="บันทึกข้อมูลหลังพูดคุย Coaching กับ Agent"
          onClose={() =>
            setShowCoachedModal(false)
          }
        >
          <div className="grid gap-5 md:grid-cols-2">
            <label>
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Coaching Date
              </span>
              <input
                type="date"
                value={draft.coachingDate}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    coachingDate:
                      event.target.value,
                  })
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              />
            </label>
            <label>
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">
                Follow-up Date
              </span>
              <input
                type="date"
                value={draft.followUpDate}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    followUpDate:
                      event.target.value,
                  })
                }
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              />
            </label>
          </div>
          <div className="mt-5 space-y-5">
            <AutoFitTextArea
              label="Agent Response"
              value={draft.agentResponse}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  agentResponse: value,
                })
              }
            />
            <AutoFitTextArea
              label="Agreed Action Plan"
              value={draft.agreedActionPlan}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  agreedActionPlan: value,
                })
              }
            />
            <AutoFitTextArea
              label="Additional Note"
              value={draft.additionalNote}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  additionalNote: value,
                })
              }
            />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() =>
                setShowCoachedModal(false)
              }
              className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                void markAsCoached()
              }
              disabled={isSaving}
              className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-3 text-sm font-black text-white shadow-lg disabled:opacity-50"
            >
              Confirm Mark as Coached
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
