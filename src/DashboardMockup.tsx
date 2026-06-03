import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { fetchUsageLogs, fetchUsageLogsByEventTypes, logUsageEvent, type UsageLogEvent } from "./usageLog";
import { fetchStoredEvaluations, type StoredEvaluation } from "./evaluationStore";
import { buildAppealRequests } from "./AppealRequestsMockup";
import { buildAppealCaseOverrides } from "./AppealOverrideMockup";
import PageHero from "./PageHero";
import { fetchCachedStaticResponse } from "./staticFileCache";
import {
  getIncentivePolicyKey,
  getIncentiveByGrade,
  scoreToGrade,
  type Grade,
  type IncentiveResult,
} from "./lib/scoreIncentivePolicy";

type ReviewStatus = "Original" | "Revised";

type Topic = {
  code: string;
  label: string;
  score: number;
  max: number;
  pct: number;
  comment?: string;
};

type CaseItem = {
  key: string;
  evaluationKey: string;
  agent: string;
  auditDate: string;
  auditDateObj: Date | null;
  auditTimestamp: string;
  monthKey: string;
  monthLabel: string;
  weekLabel: string;
  caseId: string;
  rawDataSourceName?: string;
  caseUrl?: string;
  waitingTime?: string;
  serviceTime?: string;
  inquiryTh: string;
  inquiryEn: string;
  caseDescription?: string;
  caseImageUrl?: string;
  casePdfUrl?: string;
  casePdfOriginalUrl?: string;
  casePdfRevisedUrl?: string;
  finalScore: number;
  previousScore?: number;
  grade: Grade;
  reviewStatus: ReviewStatus;
  topics: Topic[];
  revisedTopics?: Topic[] | null;
  displayRevisedTopicCodes?: string[];
};

type AppealDraftTopic = {
  code: string;
  label: string;
  score: number;
  max: number;
  comment?: string;
  wantsAppeal: boolean;
  appealReason: string;
};

type TopicSummary = {
  code: string;
  label: string;
  avgScore: string;
  max: number;
  pct: string;
};

type Summary = {
  averageDisplay: string;
  gradeCounts: Record<Grade, number>;
  topicPerformance: TopicSummary[];
};

type AppealMergeItem = {
  caseId: string;
  finalScore?: number;
  previousScore?: number;
  reviewStatus?: ReviewStatus;
  revisedTopics: Topic[];
  displayRevisedTopicCodes: string[];
};

function isAppealTopicChanged(topic: { score?: number; revisedScore?: number | string; revisedComment?: string }) {
  const revisedScore =
    topic.revisedScore !== null &&
    topic.revisedScore !== "" &&
    !Number.isNaN(Number(topic.revisedScore))
      ? Number(topic.revisedScore)
      : undefined;
  const originalScore = Number(topic.score ?? 0);
  const scoreChanged = revisedScore !== undefined && Math.abs(revisedScore - originalScore) > 0.0001;
  const commentChanged = String(topic.revisedComment || "").trim() !== "";
  return scoreChanged || commentChanged;
}

function buildApprovedAppealMergeMap(
  logs: UsageLogEvent[],
  rawCaseMonthKeyMap: Map<string, string>
) {
  const approvedRequests = buildAppealRequests(logs)
    .filter((item) => item.status === "Approved")
    .sort(
      (a, b) =>
        new Date(a.reviewedAt || a.submittedAt || "").getTime() -
        new Date(b.reviewedAt || b.submittedAt || "").getTime()
    );
  const map = new Map<string, AppealMergeItem>();

  approvedRequests.forEach((request) => {
    const caseId = String(request.caseId || "").trim();
    if (!caseId) return;

    const topicMaster = getTopicMasterByMonth(
      rawCaseMonthKeyMap.get(caseId) || getMonthKey(excelDateToJSDate(request.auditDate))
    );
    const revisedTopics = topicMaster
      .map((master) => {
        const matched = request.topics.find((topic) => topic.code === master.code);
        if (!matched || !isAppealTopicChanged(matched)) return null;
        const revisedScore =
          matched.revisedScore !== null &&
          matched.revisedScore !== "" &&
          !Number.isNaN(Number(matched.revisedScore))
            ? Number(matched.revisedScore)
            : Number(matched.score || 0);
        return {
          code: master.code,
          label: master.label,
          score: revisedScore,
          max: master.max,
          pct: master.max > 0 ? Math.round((revisedScore / master.max) * 100) : 0,
          comment: String(matched.revisedComment || matched.comment || "").trim(),
        } as Topic;
      })
      .filter(Boolean) as Topic[];

    if (!revisedTopics.length) return;

    map.set(caseId, {
      caseId,
      previousScore: Number(request.finalScore || 0),
      reviewStatus: "Revised",
      revisedTopics,
      displayRevisedTopicCodes: revisedTopics.map((topic) => topic.code),
    });
  });

  return map;
}

const CASE_TARGET = 10;
const RAW_DATA_FILE_NAME = "QA_RawData1.xlsx";
const RAW_DATA_FILE_NAMES = [
  RAW_DATA_FILE_NAME,
  "QA_RawData11052026.xlsx",
  "QA_RawData12052026.xlsx",
  "QA_RawData13052026.xlsx",
  "QA_RawData20052026.xlsx",
];
const V8_EFFECTIVE_FILE_NAME = "__disabled_QA_Score_Dashboard_byDao_V8.xlsx";
const TODAY = new Date();
const SONGKRAN_THEME_END = new Date(2026, 4, 25, 23, 59, 59);
const NEW_POLICY_START_MONTH_KEY = "2026-04";
const JUNE_2026_POLICY_START_MONTH_KEY = "2026-06";

const LEGACY_TOPIC_MASTER = [
  { code: "1.1", label: "Greeting & Closing Standard", max: 10 },
  { code: "1.2", label: "Accuracy of Information", max: 5 },
  { code: "1.3", label: "PDPA & Policy", max: 5 },
  { code: "2.1", label: "Case Accuracy", max: 5 },
  { code: "2.2", label: "Completeness", max: 5 },
  { code: "2.3", label: "Clear Actionable Guidance", max: 5 },
  { code: "2.4", label: "Official Sources", max: 5 },
  { code: "3.1", label: "Root Cause & Resolution", max: 10 },
  { code: "3.2", label: "Case Ownership", max: 5 },
  { code: "3.3", label: "Clear Next Step Guidance", max: 5 },
  { code: "4.1", label: "Message Structure", max: 5 },
  { code: "4.2", label: "Language Quality", max: 5 },
  { code: "4.3", label: "Tone & Empathy", max: 5 },
  { code: "4.4", label: "Adaptation to Context", max: 5 },
  { code: "5.1", label: "Work Process Compliance", max: 10 },
  { code: "5.2", label: "SLA Compliance", max: 5 },
  { code: "5.3", label: "Case Logging / Status Accuracy", max: 5 },
] as const;

const APRIL_2026_TOPIC_MASTER = [
  { code: "1.1", label: "มาตรฐานการทักทายและปิดการสนทนา", max: 10 },
  { code: "1.2", label: "การปฏิบัติตาม PDPA / Policy / ข้อกำหนด", max: 10 },
  { code: "1.3", label: "การปฏิบัติตามกระบวนการและ SLA", max: 10 },
  { code: "2.1", label: "ความถูกต้องของคำตอบ", max: 10 },
  { code: "2.2", label: "ความครบถ้วนของคำตอบ", max: 10 },
  { code: "2.3", label: "ความชัดเจนของขั้นตอนและแหล่งอ้างอิง", max: 5 },
  { code: "3.1", label: "การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด", max: 15 },
  { code: "3.2", label: "Ownership และการแจ้ง Next Step", max: 10 },
  { code: "4.1", label: "โครงสร้างข้อความและความอ่านง่าย", max: 5 },
  { code: "4.2", label: "ความกระชับและความถูกต้องของภาษา", max: 5 },
  { code: "4.3", label: "น้ำเสียงและความเหมาะสมตามสถานการณ์", max: 10 },
] as const;

const JUNE_2026_TOPIC_MASTER = [
  { code: "1", label: "Process & Policy Compliance", max: 30 },
  { code: "2", label: "Answer Quality & Problem Analysis", max: 20 },
  { code: "3", label: "Case Handling & Follow-up", max: 25 },
  { code: "4", label: "Communication Skills", max: 25 },
] as const;

type TopicMasterItem = { code: string; label: string; max: number };

function getTopicMasterByMonth(monthKey: string): readonly TopicMasterItem[] {
  if (monthKey !== "unknown" && monthKey >= JUNE_2026_POLICY_START_MONTH_KEY) {
    return JUNE_2026_TOPIC_MASTER;
  }
  return isNewPolicyMonth(monthKey) ? APRIL_2026_TOPIC_MASTER : LEGACY_TOPIC_MASTER;
}

const AGENT_MASTER = [
  "Anucha Makundin",
  "Arisa Aiemrit",
  "Chatkonnaphat Bhusomya",
  "Jariyawadee Taboodda",
  "Jureeporn Piddum",
  "Krivut Vongkampan",
  "Natcha Chai-in",
  "Nattapol Suprom",
  "Sunijtra Siritip",
  "Supakrit Promkhamnoi",
  "Suphitcha Keawliam",
  "Wachiraporn Chailittichai",
  "Wassana Phothong",
].sort((a, b) => a.localeCompare(b));

const RESIGNED_AGENT_HIDE_AFTER: Record<string, string> = {
  "Arisa Aiemrit": "2026-04",
};

function isSongkranThemeActive() {
  return false;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactText(value: unknown) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function canonicalAgentKey(value: unknown) {
  return compactText(value);
}

function toTitleCaseName(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      if (part.includes("-")) {
        return part
          .split("-")
          .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p))
          .join("-");
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function isSameAgent(a: string, b: string) {
  if (!a || !b) return false;
  return canonicalAgentKey(a) === canonicalAgentKey(b);
}

function isCurrentUserCaseOwner(currentUser: any, caseAgent: string) {
  if (!currentUser || !caseAgent) return false;
  return [currentUser.agentName, currentUser.displayName, currentUser.username]
    .filter(Boolean)
    .some((name) => isSameAgent(String(name), caseAgent));
}

function dedupeAgentNames(names: string[]) {
  const map = new Map<string, string>();

  for (const rawName of names) {
    const cleaned = toTitleCaseName(String(rawName || "").trim());
    const key = canonicalAgentKey(cleaned);
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, cleaned);
    }
  }

  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

function shouldHideAgentByMonth(agentName: string, selectedMonthKey: string) {
  if (!selectedMonthKey || selectedMonthKey === "all") return false;

  const matchedEntry = Object.entries(RESIGNED_AGENT_HIDE_AFTER).find(([name]) =>
    isSameAgent(name, agentName)
  );

  if (!matchedEntry) return false;

  const [, hideFromMonth] = matchedEntry;
  return selectedMonthKey >= hideFromMonth;
}

function getEffectiveMonthKeyFromDateRange(dateFrom?: string, dateTo?: string) {
  const today = new Date();
  const fallback = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}`;

  if (dateTo) {
    const toDate = new Date(`${dateTo}T12:00:00`);
    if (!Number.isNaN(toDate.getTime())) {
      return `${toDate.getFullYear()}-${`${toDate.getMonth() + 1}`.padStart(2, "0")}`;
    }
  }

  if (dateFrom) {
    const fromDate = new Date(`${dateFrom}T12:00:00`);
    if (!Number.isNaN(fromDate.getTime())) {
      return `${fromDate.getFullYear()}-${`${fromDate.getMonth() + 1}`.padStart(2, "0")}`;
    }
  }

  return fallback;
}

function isNewPolicyMonth(monthKey: string) {
  return monthKey !== "unknown" && monthKey >= NEW_POLICY_START_MONTH_KEY;
}

function gradeTone(grade: Grade) {
  switch (grade) {
    case "A":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "B":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "C":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "D":
      return "border-orange-200 bg-orange-50 text-orange-700";
    default:
      return "border-rose-200 bg-rose-50 text-rose-700";
  }
}

function scoreBadgeTone(score: number) {
  if (score >= 90) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (score >= 85) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (score >= 80) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function currentGradeTone(value: string) {
  switch (value) {
    case "A":
      return {
        card: "from-emerald-50 via-white to-emerald-100/70 border-emerald-200",
        badge: "border-emerald-200 bg-emerald-100 text-emerald-700",
        level: "Excellent",
        levelText: "text-emerald-700",
      };
    case "B":
      return {
        card: "from-sky-50 via-white to-sky-100/70 border-sky-200",
        badge: "border-sky-200 bg-sky-100 text-sky-700",
        level: "Strong",
        levelText: "text-sky-700",
      };
    case "C":
      return {
        card: "from-amber-50 via-white to-amber-100/70 border-amber-200",
        badge: "border-amber-200 bg-amber-100 text-amber-700",
        level: "Standard",
        levelText: "text-amber-700",
      };
    case "D":
      return {
        card: "from-orange-50 via-white to-orange-100/70 border-orange-200",
        badge: "border-orange-200 bg-orange-100 text-orange-700",
        level: "Improvement Needed",
        levelText: "text-orange-700",
      };
    case "F":
      return {
        card: "from-rose-50 via-white to-rose-100/70 border-rose-200",
        badge: "border-rose-200 bg-rose-100 text-rose-700",
        level: "Unsatisfactory",
        levelText: "text-rose-700",
      };
    case "G":
      return {
        card: "from-red-50 via-white to-red-100/70 border-red-200",
        badge: "border-red-200 bg-red-100 text-red-700",
        level: "Written Warning",
        levelText: "text-rose-700",
      };
    default:
      return {
        card: "from-slate-50 via-white to-slate-100 border-slate-200",
        badge: "border-slate-200 bg-slate-100 text-slate-700",
        level: "Pending",
        levelText: "text-slate-600",
      };
  }
}

function reviewTone(reviewStatus: ReviewStatus) {
  return reviewStatus === "Revised"
    ? "border-violet-200 bg-violet-50 text-violet-700"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

function roundExcelLikeMinute(date: Date) {
  const rounded = new Date(date.getTime());
  const seconds = rounded.getSeconds();
  const milliseconds = rounded.getMilliseconds();

  if (seconds >= 30 || milliseconds >= 500) {
    rounded.setMinutes(rounded.getMinutes() + 1);
  }

  rounded.setSeconds(0, 0);
  return rounded;
}

function excelDateToJSDate(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return roundExcelLikeMinute(new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds()
    ));
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return roundExcelLikeMinute(new Date(
      parsed.y,
      parsed.m - 1,
      parsed.d,
      parsed.H || 0,
      parsed.M || 0,
      parsed.S || 0
    ));
  }

  const text = String(value).trim();
  if (!text) return null;

  const ddmmyyyyMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (ddmmyyyyMatch) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = ddmmyyyyMatch;
    return roundExcelLikeMinute(new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return roundExcelLikeMinute(new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      parsed.getHours(),
      parsed.getMinutes(),
      parsed.getSeconds()
    ));
  }

  return null;
}

function formatAuditDate(value: any): string {
  const dt = excelDateToJSDate(value);
  if (!dt) return String(value ?? "").trim();
  const dd = `${dt.getDate()}`.padStart(2, "0");
  const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatAuditTimestamp(value: any): string {
  const dt = excelDateToJSDate(value);
  if (!dt) return "-";
  const dd = `${dt.getDate()}`.padStart(2, "0");
  const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
  const yyyy = dt.getFullYear();
  const hh = `${dt.getHours()}`.padStart(2, "0");
  const min = `${dt.getMinutes()}`.padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function formatTimeOnly(value: any): string {
  if (value === null || value === undefined || value === "") return "-";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hh = `${value.getHours()}`.padStart(2, "0");
    const min = `${value.getMinutes()}`.padStart(2, "0");
    return `${hh}:${min}`;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const hh = `${parsed.H || 0}`.padStart(2, "0");
      const min = `${parsed.M || 0}`.padStart(2, "0");
      return `${hh}:${min}`;
    }
  }

  const text = String(value).trim();
  if (!text) return "-";

  const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (timeMatch) {
    const [, hh, min] = timeMatch;
    return `${hh.padStart(2, "0")}:${min}`;
  }

  const dt = excelDateToJSDate(value);
  if (!dt) return text;
  const hh = `${dt.getHours()}`.padStart(2, "0");
  const min = `${dt.getMinutes()}`.padStart(2, "0");
  return `${hh}:${min}`;
}

function parseClockMinutes(value?: string) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return null;

  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function formatWaitingServiceRange(waitingTime?: string, serviceTime?: string) {
  const start = String(waitingTime ?? "").trim();
  const end = String(serviceTime ?? "").trim();

  const safeStart = start && start !== "-" ? start : "";
  const safeEnd = end && end !== "-" ? end : "";

  if (!safeStart && !safeEnd) return "-";
  if (safeStart && !safeEnd) return safeStart;
  if (!safeStart && safeEnd) return safeEnd;

  const startMinutes = parseClockMinutes(safeStart);
  const endMinutes = parseClockMinutes(safeEnd);

  if (startMinutes === null || endMinutes === null) {
    return `${safeStart} - ${safeEnd}`;
  }

  let diff = endMinutes - startMinutes;
  if (diff < 0) diff += 24 * 60;

  return `${safeStart} - ${safeEnd} (${diff} นาที)`;
}



function compareCaseAuditDateAndWaitingTime(a: CaseItem, b: CaseItem) {
  const dateA = a.auditDateObj && !Number.isNaN(a.auditDateObj.getTime()) ? a.auditDateObj.getTime() : Number.MAX_SAFE_INTEGER;
  const dateB = b.auditDateObj && !Number.isNaN(b.auditDateObj.getTime()) ? b.auditDateObj.getTime() : Number.MAX_SAFE_INTEGER;
  if (dateA !== dateB) return dateA - dateB;

  const waitA = parseClockMinutes(a.waitingTime) ?? Number.MAX_SAFE_INTEGER;
  const waitB = parseClockMinutes(b.waitingTime) ?? Number.MAX_SAFE_INTEGER;
  if (waitA !== waitB) return waitA - waitB;

  return String(a.caseId || "").localeCompare(String(b.caseId || ""));
}

async function loadImageAsDataUrl(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function pdfGradeStyle(grade: Grade) {
  switch (grade) {
    case "A":
      return { fill: [236, 253, 245], text: [5, 150, 105], border: [167, 243, 208] };
    case "B":
      return { fill: [239, 246, 255], text: [3, 105, 161], border: [186, 230, 253] };
    case "C":
      return { fill: [255, 251, 235], text: [180, 83, 9], border: [253, 230, 138] };
    case "D":
      return { fill: [255, 237, 213], text: [194, 65, 12], border: [253, 186, 116] };
    default:
      return { fill: [255, 241, 242], text: [190, 24, 93], border: [253, 164, 175] };
  }
}

function pdfScoreStyle(score: number) {
  if (score >= 90) return { fill: [236, 253, 245], text: [5, 150, 105], border: [167, 243, 208] };
  if (score >= 80) return { fill: [239, 246, 255], text: [3, 105, 161], border: [186, 230, 253] };
  if (score >= 70) return { fill: [255, 251, 235], text: [180, 83, 9], border: [253, 230, 138] };
  return { fill: [255, 241, 242], text: [190, 24, 93], border: [253, 164, 175] };
}

function formatInputDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthKey(date: Date | null) {
  if (!date) return "unknown";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthLabel(date: Date | null) {
  if (!date) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function getWeekLabelFromAuditDate(date: Date | null) {
  if (!date) return "-";
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const format = (item: Date) =>
    `${String(item.getDate()).padStart(2, "0")}/${String(item.getMonth() + 1).padStart(2, "0")}/${item.getFullYear()}`;
  return `${format(start)} - ${format(end)}`;
}

function getAppealDeadline(auditDate: Date | null) {
  if (!auditDate) return null;
  return new Date(auditDate.getFullYear(), auditDate.getMonth() + 1, 10, 23, 59, 59, 999);
}

function isAppealWindowOpen(auditDate: Date | null, now = TODAY) {
  const deadline = getAppealDeadline(auditDate);
  return !!deadline && now.getTime() <= deadline.getTime();
}

function formatBangkokDateTime(value: Date | string | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function parseMonthLabelDate(value: any): Date | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const parsedDate = excelDateToJSDate(value);
  if (parsedDate) return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1);

  const match = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const monthIndex = new Date(`${match[1]} 1, ${match[2]}`).getMonth();
  if (Number.isNaN(monthIndex)) return null;
  return new Date(Number(match[2]), monthIndex, 1);
}

function getReportingMonthDate(monthStartRaw: any, monthLabelRaw: any, fallbackDate: Date | null) {
  return parseMonthLabelDate(monthLabelRaw) || excelDateToJSDate(monthStartRaw) || fallbackDate;
}

function getReportingMonthLabel(monthLabelRaw: any, monthDate: Date | null) {
  const label = String(monthLabelRaw ?? "").trim();
  return label || getMonthLabel(monthDate);
}

function formatAuditDateExact(value: any): string {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "string") {
    const text = value.trim();
    const direct = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (direct) {
      const [, d, m, y] = direct;
      return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
    }
  }

  return formatAuditDate(value);
}

function formatAuditDateForDisplay(value: any): string {
  const date = excelDateToJSDate(value);
  if (!date) return formatAuditDateExact(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

function mapStoredEvaluationsToCaseItems(records: StoredEvaluation[]): CaseItem[] {
  return records
    .map((record) => {
      const auditDateObj = record.auditDate ? new Date(`${record.auditDate}T00:00:00`) : null;
      const validAuditDate = auditDateObj && !Number.isNaN(auditDateObj.getTime()) ? auditDateObj : null;
      const monthKey = getMonthKey(validAuditDate);
      const monthDate = validAuditDate ? new Date(validAuditDate.getFullYear(), validAuditDate.getMonth(), 1) : null;
      const topicMaster = getTopicMasterByMonth(monthKey);
      const topics: Topic[] = topicMaster.map((master) => {
        const matched = record.topics.find((topic) => topic.code === master.code);
        const score = Number(matched?.score || 0);
        return {
          code: master.code,
          label: matched?.title || master.label,
          score: Number.isFinite(score) ? score : 0,
          max: master.max,
          pct: master.max > 0 ? Math.round(((Number.isFinite(score) ? score : 0) / master.max) * 100) : 0,
          comment: matched?.comment || "",
        };
      });
      const finalScoreVal = Number(record.finalScore || topics.reduce((sum, topic) => sum + topic.score, 0));
      const evaluationKey = record.evaluationKey || `web-eval|${record.caseId}|${record.agentName}|${record.auditDate}|${record.id}`;
      return {
        key: evaluationKey,
        evaluationKey,
        agent: toTitleCaseName(record.agentName || record.targetDisplayName || ""),
        auditDate: formatAuditDateForDisplay(record.auditDate),
        auditDateObj: validAuditDate,
        auditTimestamp: record.auditTimestamp || formatBangkokDateTime(record.submittedAt),
        monthKey,
        monthLabel: getMonthLabel(monthDate),
        weekLabel: getWeekLabelFromAuditDate(validAuditDate),
        caseId: record.caseId,
        rawDataSourceName: "QA Evaluation Form",
        caseUrl: record.caseUrl,
        waitingTime: record.waitingTime,
        serviceTime: record.serviceTime,
        inquiryTh: record.inquiry || "-",
        inquiryEn: record.inquiry || "-",
        caseDescription: record.caseDescription || "",
        caseImageUrl: record.evidenceUrls.filter((url) => !url.toLowerCase().endsWith(".pdf")).join("\n"),
        casePdfUrl: record.evidenceUrls.find((url) => url.toLowerCase().endsWith(".pdf")) || "",
        casePdfOriginalUrl: "",
        casePdfRevisedUrl: "",
        finalScore: finalScoreVal,
        previousScore: finalScoreVal,
        grade: scoreToGrade(finalScoreVal, monthKey),
        reviewStatus: "Original",
        topics,
        revisedTopics: null,
        displayRevisedTopicCodes: [],
      } as CaseItem;
    })
    .filter((item) => item.agent && item.caseId && item.auditDateObj);
}

function isWithinDateRange(dateObj: Date | null, from?: string, to?: string) {
  if (!dateObj) return false;

  const checkDate = new Date(
    dateObj.getFullYear(),
    dateObj.getMonth(),
    dateObj.getDate(),
    12,
    0,
    0,
    0
  );

  if (from) {
    const fromDate = new Date(`${from}T00:00:00`);
    if (checkDate < fromDate) return false;
  }

  if (to) {
    const toDate = new Date(`${to}T23:59:59`);
    if (checkDate > toDate) return false;
  }

  return true;
}

function formatCurrencyTHB(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function getIncentiveResult(caseCount: number, avg: number, monthKey: string): IncentiveResult {
  if (caseCount < CASE_TARGET) {
    return {
      total: 0,
      cash: 0,
      promo: 0,
      label: "0 THB",
      remark: "ยังประเมินไม่ครบ 10 เคส",
    };
  }

  const grade = scoreToGrade(avg, monthKey);
  return getIncentiveByGrade(grade, monthKey);
}



function getPolicyMonthKeyForCases(cases: CaseItem[]) {
  const validMonthKeys = cases
    .map((item) => item.monthKey)
    .filter((item) => item && item !== "unknown")
    .sort((a, b) => a.localeCompare(b));

  return validMonthKeys.length ? validMonthKeys[validMonthKeys.length - 1] : "unknown";
}

function roundTo(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor + 1e-7) / factor;
}

function formatFixed(value: number, decimals = 2) {
  return roundTo(value, decimals).toFixed(decimals);
}

function mergeTopicSet(topics: Topic[], revisedTopics?: Topic[] | null) {
  if (!revisedTopics?.length) return topics;
  const revisedMap = new Map(revisedTopics.map((topic) => [topic.code, topic]));
  return topics.map((topic) => revisedMap.get(topic.code) || topic);
}

function buildAgentSummary(cases: CaseItem[]): Summary {
  const average =
    cases.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(cases.length, 1);

  const gradeCounts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0, G: 0 };
  for (const item of cases) gradeCounts[item.grade] += 1;

  const topicPerformance = getTopicMasterByMonth(getPolicyMonthKeyForCases(cases)).map((master) => {
    const topics = cases
      .flatMap((item) =>
        item.reviewStatus === "Revised" && item.revisedTopics?.length
          ? mergeTopicSet(item.topics, item.revisedTopics)
          : item.topics
      )
      .filter((topic) => topic.code === master.code);

    if (!topics.length) {
      return {
        code: master.code,
        label: master.label,
        avgScore: "-",
        max: master.max,
        pct: "-",
      };
    }

    const avg = topics.reduce((sum, topic) => sum + topic.score, 0) / topics.length;
    const avgRounded = Number(formatFixed(avg, 2));
    return {
      code: master.code,
      label: master.label,
      avgScore: formatFixed(avgRounded, 2),
      max: master.max,
      pct: formatFixed((avgRounded / master.max) * 100, 2),
    };
  });

  return {
    averageDisplay: formatFixed(average, 2),
    gradeCounts,
    topicPerformance,
  };
}

function SongkranBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-[-40px] top-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="absolute right-0 top-12 h-36 w-36 rounded-full bg-fuchsia-300/20 blur-3xl" />
      <div className="absolute left-1/3 bottom-0 h-40 w-40 rounded-full bg-sky-300/15 blur-3xl" />
      <div className="absolute right-1/4 bottom-4 h-28 w-28 rounded-full bg-violet-300/15 blur-3xl" />
      <div className="absolute left-[10%] top-[20%] h-3 w-3 rounded-full bg-white/80" />
      <div className="absolute left-[18%] top-[12%] h-4 w-4 rounded-full bg-cyan-300/60" />
      <div className="absolute right-[12%] top-[18%] h-3 w-3 rounded-full bg-pink-300/50" />
    </div>
  );
}

function SongkranFlowerCorner({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={`pointer-events-none absolute ${className}`}>
      <div className="relative h-12 w-12">
        <span className="absolute left-4 top-0 h-4 w-4 rounded-full bg-pink-300/70" />
        <span className="absolute left-0 top-4 h-4 w-4 rounded-full bg-fuchsia-300/70" />
        <span className="absolute left-4 top-8 h-4 w-4 rounded-full bg-cyan-300/70" />
        <span className="absolute left-8 top-4 h-4 w-4 rounded-full bg-sky-300/70" />
        <span className="absolute left-4 top-4 h-4 w-4 rounded-full bg-white/85 shadow-sm" />
      </div>
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[30px] border border-violet-200/80 bg-white/95 shadow-[0_10px_35px_rgba(76,29,149,0.10)] backdrop-blur-sm ${className}`}
    >
      {isSongkranThemeActive() ? (
        <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-70" />
      ) : null}
      {children}
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const songkranTheme = isSongkranThemeActive();

  return (
    <div
      className={`border-b px-5 py-4 ${
        songkranTheme
          ? "border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-fuchsia-50"
          : "border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50"
      }`}
    >
      <div className="text-[17px] font-bold tracking-tight text-slate-900">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function PanelBody({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`p-5 lg:p-6 ${className}`}>{children}</div>;
}

function MetricCard({
  title,
  value,
  sub,
  accent = "from-white via-violet-50/40 to-fuchsia-50/60 border-violet-200/70",
  valueClassName = "text-slate-900",
  helper,
}: {
  title: string;
  value: string;
  sub: string;
  accent?: string;
  valueClassName?: string;
  helper?: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] border bg-gradient-to-br ${accent} shadow-[0_10px_30px_rgba(91,33,182,0.08)]`}
    >
      <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
      {isSongkranThemeActive() ? (
        <span className="pointer-events-none absolute right-3 top-3 h-3 w-3 rounded-full bg-cyan-300/70" />
      ) : null}
      <div className="p-5 lg:p-6">
        <div className="text-[13px] font-semibold tracking-wide text-slate-500">{title}</div>
        <div className={`mt-3 text-4xl font-extrabold tracking-tight lg:text-[42px] ${valueClassName}`}>
          {value}
        </div>
        {helper ? <div className="mt-3">{helper}</div> : null}
        <div className="mt-3 text-xs leading-5 text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function WeeklySnapshotCard({
  label,
  caseCount,
  averageDisplay,
  isActive,
  onClick,
}: {
  label: string;
  caseCount: number;
  averageDisplay: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const songkranTheme = isSongkranThemeActive();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-[22px] border px-4 py-4 text-left transition-all duration-200 ${
        isActive
          ? songkranTheme
            ? "border-cyan-300 bg-gradient-to-br from-cyan-100 to-fuchsia-100 shadow-[0_10px_24px_rgba(34,211,238,0.18)]"
            : "border-violet-400 bg-gradient-to-br from-violet-100 to-fuchsia-100 shadow-[0_10px_24px_rgba(109,40,217,0.18)]"
          : "border-violet-100 bg-white hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50/70 hover:shadow-[0_8px_18px_rgba(109,40,217,0.10)]"
      }`}
    >
      {songkranTheme && isActive ? (
        <span className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 rounded-full bg-cyan-300/80" />
      ) : null}

      <div className="font-semibold text-slate-900">{label}</div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-violet-100 bg-white/90 p-3">
          <div className="text-slate-500">Average Score</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{averageDisplay}</div>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-white/90 p-3">
          <div className="text-slate-500">Cases</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{caseCount}</div>
        </div>
      </div>
    </button>
  );
}

function CaseNavigatorCard({
  item,
  isSelected,
  onSelect,
}: {
  item: CaseItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const songkranTheme = isSongkranThemeActive();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`relative h-full cursor-pointer overflow-hidden rounded-[22px] border p-4 text-left transition-all duration-200 ${
        isSelected
          ? songkranTheme
            ? "border-cyan-300 bg-gradient-to-br from-cyan-100 to-fuchsia-100 shadow-[0_10px_24px_rgba(34,211,238,0.16)]"
            : "border-violet-400 bg-gradient-to-br from-violet-100 to-fuchsia-100 shadow-[0_10px_24px_rgba(109,40,217,0.16)]"
          : "border-violet-100 bg-white hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50/60 hover:shadow-[0_8px_18px_rgba(109,40,217,0.10)]"
      }`}
    >
      {songkranTheme ? (
        <span className="pointer-events-none absolute right-2 top-2 h-3 w-3 rounded-full bg-cyan-300/70" />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{item.caseId}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{item.auditDate}</div>
          <div className="mt-1 truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-500">
            RawData: {item.rawDataSourceName || RAW_DATA_FILE_NAME}
          </div>
          <div className="mt-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold shadow-sm ${scoreBadgeTone(
                item.finalScore
              )}`}
            >
              Score {item.finalScore.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${gradeTone(
              item.grade
            )}`}
          >
            {item.grade}
          </span>

          {item.reviewStatus === "Revised" ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
              Revised
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 min-h-[2.75rem] text-[12px] font-medium leading-5 text-slate-800">
        {item.inquiryTh}
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
        <span>{item.weekLabel}</span>
        {item.reviewStatus === "Revised" && typeof item.previousScore === "number" ? (
          <span className="font-semibold text-violet-700">
            {item.previousScore.toFixed(0)} → {item.finalScore.toFixed(0)}
          </span>
        ) : (
          <span>{item.reviewStatus}</span>
        )}
      </div>
    </div>
  );
}

function ReviewStatusBadge({ item }: { item: CaseItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${reviewTone(
          item.reviewStatus
        )}`}
      >
        {item.reviewStatus}
      </span>
      {item.reviewStatus === "Revised" && typeof item.previousScore === "number" ? (
        <span className="text-xs font-medium text-violet-700">
          {Math.round(item.previousScore)} → {Math.round(item.finalScore)}
        </span>
      ) : null}
    </div>
  );
}

function TopicPerformanceTable({ items }: { items: TopicSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[860px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-3 py-3">Topic</th>
            <th className="px-3 py-3 text-left">Description</th>
            <th className="px-3 py-3">Avg Score</th>
            <th className="px-3 py-3">Max</th>
            <th className="px-3 py-3">Avg %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.code} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.code}</td>
              <td className="border-t border-slate-200 px-3 py-3">{entry.label}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.avgScore}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.max}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">
                {entry.pct === "-" ? "-" : `${entry.pct}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getOriginalTopicMap(topics: Topic[]) {
  return new Map(topics.map((topic) => [topic.code, topic]));
}

function normalizeCommentForCompare(value?: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeAppealReason(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isNoAppealReason(value: unknown) {
  const text = normalizeAppealReason(value);
  if (!text) return false;
  const normalized = text.toLowerCase();
  return (
    normalized === "ไม่อุทธรณ์หัวข้อนี้" ||
    normalized === "not appeal" ||
    normalized === "no appeal" ||
    normalized.includes("ไม่อุทธรณ์")
  );
}

function hasMeaningfulTextChange(originalValue?: string, revisedValue?: string) {
  const original = normalizeCommentForCompare(originalValue);
  const revised = normalizeCommentForCompare(revisedValue);

  if (!revised) return false;
  if (!original) return revised.length > 0;

  return original !== revised;
}

function hasRealTopicChange(
  originalScore: unknown,
  revisedScore: unknown,
  originalComment: unknown,
  revisedComment: unknown
) {
  const originalScoreNum =
    originalScore !== null && originalScore !== "" && !Number.isNaN(Number(originalScore))
      ? Number(originalScore)
      : null;

  const revisedScoreNum =
    revisedScore !== null && revisedScore !== "" && !Number.isNaN(Number(revisedScore))
      ? Number(revisedScore)
      : null;

  const originalCommentText = normalizeCommentForCompare(String(originalComment ?? ""));
  const revisedCommentText = normalizeCommentForCompare(String(revisedComment ?? ""));

  const scoreChanged =
    originalScoreNum !== null &&
    revisedScoreNum !== null &&
    originalScoreNum !== revisedScoreNum;

  const commentChanged = revisedCommentText !== "" && revisedCommentText !== originalCommentText;

  return scoreChanged || commentChanged;
}

function isTopicChanged(originalTopic: Topic | undefined, revisedTopic: Topic) {
  if (!originalTopic) return false;

  const scoreChanged = Number(originalTopic.score) !== Number(revisedTopic.score);
  const commentChanged = hasMeaningfulTextChange(originalTopic.comment, revisedTopic.comment);

  return scoreChanged || commentChanged;
}

function CaseDetailTopicTable({
  topics,
  revisedTopics,
  reviewStatus,
  displayRevisedTopicCodes = [],
}: {
  topics: Topic[];
  revisedTopics?: Topic[] | null;
  reviewStatus?: ReviewStatus;
  displayRevisedTopicCodes?: string[];
}) {
  const displayCodeSet = new Set(displayRevisedTopicCodes);

  const rows = topics
    .map((originalTopic) => {
      const revisedTopic =
        reviewStatus === "Revised" && revisedTopics?.length
          ? revisedTopics.find((item) => item.code === originalTopic.code)
          : undefined;
      const allowedToShowRevised = displayCodeSet.has(originalTopic.code);
      const changed =
        reviewStatus === "Revised" &&
        allowedToShowRevised &&
        !!revisedTopic &&
        isTopicChanged(originalTopic, revisedTopic);
      const shownTopic = changed && revisedTopic ? revisedTopic : originalTopic;
      if (!shownTopic || shownTopic.max <= 0) return null;
      const pct = Number(shownTopic.pct || 0);
      let statusLabel = "Need Improvement";
      let statusClass = "text-rose-700";
      if (pct >= 90) {
        statusLabel = "Excellent";
        statusClass = "text-emerald-700";
      } else if (pct >= 80) {
        statusLabel = "Good";
        statusClass = "text-sky-700";
      } else if (pct >= 60) {
        statusLabel = "Fair";
        statusClass = "text-amber-700";
      }

      return {
        originalTopic,
        revisedTopic,
        shownTopic,
        changed,
        pct,
        statusLabel,
        statusClass,
      };
    })
    .filter(Boolean) as Array<{
      originalTopic: Topic;
      revisedTopic?: Topic;
      shownTopic: Topic;
      changed: boolean;
      pct: number;
      statusLabel: string;
      statusClass: string;
    }>;

  return (
    <div className="rounded-[28px] border border-violet-200/80 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(109,40,217,0.08)]">
      <div className="space-y-8">
        {rows.length ? rows.map((row, index) => (
          <div
            key={`${row.shownTopic.code}-${index}`}
            className="border-b border-violet-100 pb-8 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-[20px] font-bold tracking-tight text-slate-900">
                  {row.shownTopic.code} {row.shownTopic.label}
                </div>
                {row.changed && row.revisedTopic ? (
                  <div className="mt-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                    Revised topic review
                  </div>
                ) : null}
              </div>

              <div className="shrink-0 text-left lg:min-w-[280px] lg:text-right">
                <div className={`text-sm font-bold ${row.statusClass}`}>{row.statusLabel}</div>
                {row.changed && row.revisedTopic ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 lg:justify-end">
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-700">
                      Original {row.originalTopic.score}/{row.originalTopic.max} · {Number(row.originalTopic.pct || 0).toFixed(1)}%
                    </span>
                    <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[12px] font-semibold text-violet-700">
                      Revised {row.revisedTopic.score}/{row.revisedTopic.max} · {Number(row.revisedTopic.pct || 0).toFixed(1)}%
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-slate-600">
                    {row.shownTopic.score}/{row.shownTopic.max} ({row.pct.toFixed(1)}%)
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-x-8 gap-y-3 text-sm lg:grid-cols-[170px_minmax(0,1fr)]">
              <div className="font-semibold text-slate-500">Score</div>
              <div className="text-slate-900">
                {row.changed && row.revisedTopic ? (
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-semibold text-slate-700">
                      Original {row.originalTopic.score}/{row.originalTopic.max} ({Number(row.originalTopic.pct || 0).toFixed(1)}%)
                    </span>
                    <span className="inline-flex rounded-2xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-[12px] font-semibold text-violet-700">
                      Revised {row.revisedTopic.score}/{row.revisedTopic.max} ({Number(row.revisedTopic.pct || 0).toFixed(1)}%)
                    </span>
                  </div>
                ) : (
                  <span>{row.shownTopic.score}/{row.shownTopic.max} ({row.pct.toFixed(1)}%)</span>
                )}
              </div>

              <div className="font-semibold text-slate-500">Max Score</div>
              <div className="text-slate-900">{row.shownTopic.max}</div>

              <div className="font-semibold text-slate-500">Status</div>
              <div className={`font-semibold ${row.statusClass}`}>{row.statusLabel}</div>
            </div>

            <div className="mt-6 space-y-4">
              {row.changed && row.revisedTopic ? (
                <>
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-[13px] font-semibold text-slate-600">Original Comment</div>
                    <div className="mt-4 whitespace-pre-line leading-7 text-slate-800">
                      {row.originalTopic.comment || "ยังไม่มี Evaluation Comment"}
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-violet-200 bg-violet-50 px-4 py-4">
                    <div className="text-[13px] font-semibold text-violet-700">Revised Comment</div>
                    <div className="mt-4 whitespace-pre-line leading-7 text-violet-700">
                      {row.revisedTopic.comment || "ยังไม่มี Revised Comment"}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-[13px] font-semibold text-slate-600">Original Comment</div>
                  <div className="mt-4 whitespace-pre-line leading-7 text-slate-800">
                    {row.shownTopic.comment || "ยังไม่มี Evaluation Comment"}
                  </div>
                </div>
              )}
            </div>
          </div>
        )) : (
          <div className="py-10 text-center text-sm text-slate-500">No topic detail available</div>
        )}
      </div>
    </div>
  );
}

function GradeMix({ gradeCounts }: { gradeCounts: Record<Grade, number> }) {
  return (
    <div className="space-y-3">
      {(Object.keys(gradeCounts) as Grade[]).map((grade) => (
        <div
          key={grade}
          className="relative flex items-center justify-between rounded-2xl border border-violet-100 bg-white px-4 py-3"
        >
          {isSongkranThemeActive() ? (
            <span className="pointer-events-none absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-cyan-300/70" />
          ) : null}
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(grade)}`}
          >
            {grade}
          </span>
          <span className="text-sm font-semibold text-slate-900">{gradeCounts[grade]} Case(s)</span>
        </div>
      ))}
    </div>
  );
}

function DataHealthChecks({
  caseCount,
  agentCount,
  appealCount,
}: {
  caseCount: number;
  agentCount: number;
  appealCount: number;
}) {
  const tests = [
    { name: "Raw data loaded", pass: caseCount > 0 },
    { name: "Agent list built", pass: agentCount > 0 },
    { name: "Appeal merge loaded", pass: appealCount > 0 },
    { name: "Case URL available", pass: true },
  ];

  return (
    <div className="space-y-2">
      {tests.map((test) => (
        <div
          key={test.name}
          className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
            test.pass
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span>{test.name}</span>
          <span className="font-semibold">{test.pass ? "PASS" : "FAIL"}</span>
        </div>
      ))}
    </div>
  );
}

function buildHeaderHelpers(headerRow: any[]) {
  const normalizedHeaders = headerRow.map((h) => normalizeText(h));

  const colIndexes = (name: string) => {
    const target = normalizeText(name);
    return normalizedHeaders
      .map((h, idx) => (h === target ? idx : -1))
      .filter((idx) => idx >= 0);
  };

  const getValue = (row: any[], name: string, occurrence = 0) => {
    const indexes = colIndexes(name);
    const idx = indexes[occurrence];
    return idx >= 0 ? row[idx] : null;
  };

  const getLastValue = (row: any[], name: string) => {
    const indexes = colIndexes(name);
    if (!indexes.length) return null;
    return row[indexes[indexes.length - 1]];
  };

  return { getValue, getLastValue };
}

function getAppealVersionRank(value: any) {
  const matches = String(value ?? "").match(/\d+/g);
  return matches?.length ? Number(matches[matches.length - 1]) : -1;
}

function getAppealTimestampRank(helper: ReturnType<typeof buildHeaderHelpers>, row: any[]) {
  const raw =
    getFirstAvailableHeaderValue(helper, row, [
      "Appeal Result Date & Time",
      "Appeal Result Date",
      "Timestamp",
      "Created Date & Time",
      "Created Date",
    ]) ?? null;
  return excelDateToJSDate(raw)?.getTime() ?? -1;
}

function getLatestAppealRows(appealDataRows: any[][], helper: ReturnType<typeof buildHeaderHelpers>) {
  const latest = new Map<
    string,
    { row: any[]; index: number; versionRank: number; timestampRank: number }
  >();

  appealDataRows.forEach((row, index) => {
    const caseId = String(helper.getValue(row, "Case ID") ?? "").trim();
    if (!caseId) return;

    const candidate = {
      row,
      index,
      versionRank: Math.max(
        getAppealVersionRank(helper.getValue(row, "Appeal Version")),
        getAppealVersionRank(helper.getValue(row, "Version"))
      ),
      timestampRank: getAppealTimestampRank(helper, row),
    };

    const current = latest.get(caseId);
    if (
      !current ||
      candidate.versionRank > current.versionRank ||
      (candidate.versionRank === current.versionRank &&
        candidate.timestampRank > current.timestampRank) ||
      (candidate.versionRank === current.versionRank &&
        candidate.timestampRank === current.timestampRank &&
        candidate.index > current.index)
    ) {
      latest.set(caseId, candidate);
    }
  });

  return [...latest.values()].sort((a, b) => a.index - b.index).map((item) => item.row);
}

function extractGoogleDriveId(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  return (
    value.match(/[?&]id=([^&#]+)/i)?.[1] ||
    value.match(/\/file\/d\/([^\/]+)/i)?.[1] ||
    value.match(/[?&]export=view&id=([^&#]+)/i)?.[1] ||
    value.match(/[?&]export=download&id=([^&#]+)/i)?.[1] ||
    ""
  );
}

function normalizeAssetUrl(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return "";

  const driveId = extractGoogleDriveId(value);
  if (driveId) {
    return `https://drive.google.com/uc?export=view&id=${driveId}`;
  }

  return value;
}

function getGoogleDriveImagePreviewUrl(raw: unknown) {
  const driveId = extractGoogleDriveId(raw);
  if (!driveId) return "";
  return `https://drive.google.com/thumbnail?id=${driveId}&sz=w2000`;
}

function getGoogleDrivePdfViewerUrl(raw: unknown) {
  const driveId = extractGoogleDriveId(raw);
  if (!driveId) return "";
  return `https://drive.google.com/file/d/${driveId}/preview`;
}

function splitAssetUrls(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return [];

  const dataMatches = value.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g) || [];
  const valueWithoutData = dataMatches.reduce((next, dataUrl) => next.replace(dataUrl, "\n"), value);
  const urlMatches = valueWithoutData.match(/https?:\/\/[^\s,|;]+/g) || [];
  const parts = valueWithoutData
    .split(/[\n,|;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !item.startsWith("http://") && !item.startsWith("https://"));

  return [...new Set([...dataMatches, ...urlMatches, ...parts])];
}

function isGoogleDriveAssetUrl(url: string) {
  const value = String(url || "").toLowerCase();
  return (
    value.includes("drive.google.com/uc?") ||
    value.includes("drive.google.com/open?") ||
    value.includes("drive.google.com/file/d/") ||
    value.includes("drive.google.com/thumbnail?") ||
    value.includes("googleusercontent.com")
  );
}

function hasImageAssetExtension(url: string) {
  const value = String(url || "").toLowerCase().split("#")[0].split("?")[0];
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg", ".avif"].some((ext) =>
    value.endsWith(ext)
  );
}

function isLikelyGoogleDrivePdf(url: string) {
  const lower = String(url || "").toLowerCase();
  if (!lower) return false;
  if (!isGoogleDriveAssetUrl(lower)) return false;
  if (lower.includes("thumbnail?")) return false;
  if (hasImageAssetExtension(lower)) return false;
  return true;
}

function isPdfAssetUrl(url: string) {
  const original = String(url || "").toLowerCase();
  const value = original.split("#")[0].split("?")[0];
  return value.endsWith('.pdf') || original.includes('application/pdf') || isLikelyGoogleDrivePdf(original);
}

function getCasePdfActionLabel(url: string, caseId: string) {
  const lower = String(url || '').toLowerCase();
  const revisedRoundMatch = lower.match(/-revised[_-](\d+)\.pdf(?:$|[?#])/);
  if (revisedRoundMatch) return `${caseId} Revised PDF ${revisedRoundMatch[1]}`;
  if (lower.includes('-revised.pdf')) return `${caseId} Revised PDF`;
  if (lower.includes('-original.pdf')) return `${caseId} Original PDF`;
  if (lower.endsWith('.pdf')) return `${caseId} PDF`;
  return caseId;
}

async function urlExists(url: string) {
  if (!url) return false;

  if (url.startsWith("data:image/")) {
    return true;
  }

  if (isGoogleDriveAssetUrl(url)) {
    return true;
  }

  try {
    const response = await fetch(url, { method: "HEAD" });
    if (response.ok) return true;
  } catch {}

  try {
    const response = await fetch(url, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

function getFirstAvailableHeaderValue(
  helper: ReturnType<typeof buildHeaderHelpers>,
  row: any[],
  headers: string[],
  fallback: any = ""
) {
  for (const header of headers) {
    const value = helper.getValue(row, header);
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

function calcMergedFinalScore(baseTopics: Topic[], revisedTopics: Topic[]) {
  const revisedMap = new Map(revisedTopics.map((t) => [t.code, t]));
  const total = baseTopics.reduce((sum, base) => {
    const active = revisedMap.get(base.code) || base;
    return sum + active.score;
  }, 0);
  return roundTo(total, 2);
}

function normalizeEvaluationKeyPart(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function formatEvaluationDateKey(value: any) {
  const dt = excelDateToJSDate(value);
  if (!dt) return normalizeEvaluationKeyPart(value);
  const yyyy = dt.getFullYear();
  const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
  const dd = `${dt.getDate()}`.padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function buildTopicScoreHash(topics: Topic[]) {
  return topics
    .map((topic) => `${topic.code}:${Number.isFinite(topic.score) ? Number(topic.score).toFixed(2) : "0.00"}`)
    .join("|");
}

function buildEvaluationKeyFromRow(
  helper: ReturnType<typeof buildHeaderHelpers>,
  row: any[],
  caseId: string,
  agent: string,
  auditRaw: any,
  finalScore: number,
  topics: Topic[]
) {
  const monthKeyRaw =
    helper.getValue(row, "Month Key") ??
    helper.getValue(row, "Evaluation Key") ??
    helper.getValue(row, "Assessment Key");
  const monthKey = normalizeEvaluationKeyPart(monthKeyRaw);
  if (monthKey) return `month-key:${monthKey}`;

  const scoreKey = Number.isFinite(finalScore) ? Number(finalScore).toFixed(2) : "0.00";
  return [
    "row",
    normalizeEvaluationKeyPart(caseId).toUpperCase(),
    normalizeEvaluationKeyPart(agent).toLowerCase(),
    formatEvaluationDateKey(auditRaw),
    scoreKey,
    buildTopicScoreHash(topics),
  ].join("|");
}

function LogoHeaderBox() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/20 bg-white/12 shadow-[0_12px_34px_rgba(0,0,0,0.18)] backdrop-blur-md lg:h-28 lg:w-28">
      {isSongkranThemeActive() ? (
        <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-80" />
      ) : null}
      <img
        src="/robinhood-logo.png"
        alt="Robinhood Logo"
        className="relative z-10 h-16 w-16 object-contain lg:h-20 lg:w-20"
      />
    </div>
  );
}

async function fetchFirstAvailable(urls: string[]) {
  for (const url of urls) {
    try {
      const response = await fetchCachedStaticResponse(url);
      if (response.ok) {
        return { response, matchedUrl: url };
      }
    } catch (error) {
      console.warn(`Static file fetch skipped: ${url}`, error);
    }
  }
  throw new Error(`ไม่พบไฟล์ใน public ตามชื่อเหล่านี้: ${urls.join(", ")}`);
}

function PremiumBarChart({
  title,
  subtitle,
  data,
  height = 240,
}: {
  title?: string;
  subtitle?: string;
  data: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="relative rounded-[28px] border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/40 to-fuchsia-50/50 p-5 shadow-[0_10px_30px_rgba(91,33,182,0.08)]">
      {isSongkranThemeActive() ? (
        <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-70" />
      ) : null}

      {title ? (
        <div className="mb-4">
          <div className="text-sm font-bold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
      ) : null}

      <div className="relative">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-7 pt-2">
          {[0, 1, 2, 3].map((line) => (
            <div key={line} className="border-t border-dashed border-violet-100" />
          ))}
        </div>

        <div className="relative flex items-end gap-4" style={{ height }}>
          {data.map((item) => {
            const barHeight = Math.max((item.value / max) * (height - 50), item.value > 0 ? 18 : 6);

            return (
              <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-2">
                <div className="text-xs font-bold text-slate-700">{item.value}</div>

                <div className="relative flex w-full items-end justify-center">
                  <div
                    className={`w-full rounded-t-[18px] shadow-[0_12px_24px_rgba(124,58,237,0.22)] transition-all duration-300 ${
                      isSongkranThemeActive()
                        ? "bg-gradient-to-t from-sky-600 via-cyan-500 to-fuchsia-400"
                        : "bg-gradient-to-t from-violet-800 via-violet-600 to-fuchsia-400"
                    }`}
                    style={{ height: barHeight }}
                  >
                    <div className="h-3 w-full rounded-t-[18px] bg-white/20" />
                  </div>
                </div>

                <div className="text-center text-[11px] font-medium leading-4 text-slate-500">
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PremiumReviewMixCard({
  title,
  subtitle,
  data,
}: {
  title?: string;
  subtitle?: string;
  data: { label: string; value: number; tone: string }[];
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const first = data[0]?.value || 0;
  const firstPct = total > 0 ? (first / total) * 100 : 0;

  return (
    <div className="relative rounded-[28px] border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/30 to-fuchsia-50/50 p-5 shadow-[0_10px_30px_rgba(91,33,182,0.08)]">
      {isSongkranThemeActive() ? (
        <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-70" />
      ) : null}

      {title ? (
        <div className="mb-4">
          <div className="text-sm font-bold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
        <div className="flex items-center justify-center">
          <div
            className="relative h-40 w-40 rounded-full"
            style={{
              background: `conic-gradient(#94a3b8 0% ${firstPct}%, ${
                isSongkranThemeActive() ? "#06b6d4" : "#7c3aed"
              } ${firstPct}% 100%)`,
            }}
          >
            <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total
              </div>
              <div className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
                {total}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">cases</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {data.map((item) => {
            const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";

            return (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-3.5 w-3.5 rounded-full ${item.tone}`} />
                    <span className="text-sm font-semibold text-slate-800">{item.label}</span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {item.value}
                    <span className="ml-1 text-slate-400">({pct}%)</span>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${item.tone}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PremiumLineChart({
  title,
  subtitle,
  data,
  height = 240,
}: {
  title?: string;
  subtitle?: string;
  data: { label: string; value: number }[];
  height?: number;
}) {
  const width = 640;
  const padding = 28;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  const points = data.map((item, index) => {
    const x =
      data.length === 1
        ? width / 2
        : padding + (index * (width - padding * 2)) / (data.length - 1);
    const y = padding + ((max - item.value) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const gradientStrokeId = isSongkranThemeActive()
    ? "lineStrokeSongkran"
    : "lineStrokePremium";

  return (
    <div className="relative rounded-[28px] border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/30 to-fuchsia-50/50 p-5 shadow-[0_10px_30px_rgba(91,33,182,0.08)]">
      {isSongkranThemeActive() ? (
        <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-70" />
      ) : null}

      {title ? (
        <div className="mb-4">
          <div className="text-sm font-bold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[640px] w-full">
          {[0, 1, 2, 3].map((line) => {
            const y = padding + (line * (height - padding * 2)) / 3;
            return (
              <line
                key={line}
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                stroke="#e9d5ff"
                strokeDasharray="4 6"
              />
            );
          })}

          <defs>
            <linearGradient id="lineFillPremium" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(124,58,237,0.25)" />
              <stop offset="100%" stopColor="rgba(124,58,237,0.02)" />
            </linearGradient>
            <linearGradient id="lineStrokePremium" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
            <linearGradient id="lineStrokeSongkran" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="50%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
          </defs>

          {points.length > 1 ? (
            <>
              <polygon
                points={`${points.join(" ")} ${width - padding},${height - padding} ${padding},${height - padding}`}
                fill="url(#lineFillPremium)"
              />
              <polyline
                fill="none"
                stroke={`url(#${gradientStrokeId})`}
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points.join(" ")}
              />
            </>
          ) : null}

          {data.map((item, index) => {
            const x =
              data.length === 1
                ? width / 2
                : padding + (index * (width - padding * 2)) / (data.length - 1);
            const y = padding + ((max - item.value) / range) * (height - padding * 2);

            return (
              <g key={item.label}>
                <circle cx={x} cy={y} r="6" fill={isSongkranThemeActive() ? "#06b6d4" : "#7c3aed"} />
                <circle cx={x} cy={y} r="12" fill="rgba(124,58,237,0.12)" />
                <text
                  x={x}
                  y={y - 14}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#475569"
                  fontWeight="700"
                >
                  {item.value.toFixed(1)}
                </text>
                <text x={x} y={height - 8} textAnchor="middle" fontSize="11" fill="#64748b">
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function QuickCaseSearchCard({
  item,
  onOpen,
}: {
  item: CaseItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative w-full overflow-hidden rounded-2xl border border-violet-100 bg-white px-4 py-3 text-left transition hover:border-violet-300 hover:bg-violet-50"
    >
      {isSongkranThemeActive() ? (
        <span className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-cyan-300/70" />
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-900">{item.caseId}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {item.agent} · {item.auditDate}
          </div>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${gradeTone(
            item.grade
          )}`}
        >
          {item.grade}
        </span>
      </div>

      <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-700">{item.inquiryTh}</div>

      <div className="mt-3 text-[11px] font-semibold text-violet-700">Open in Case Detail</div>
    </button>
  );
}

function SlideOverCaseDetail({
  open,
  caseItem,
  currentUser,
  onClose,
  onOpenAppealCase,
  onGeneratePdf,
  onShareCaseDetail,
}: {
  open: boolean;
  caseItem: CaseItem | null;
  currentUser: any;
  onClose: () => void;
  onOpenAppealCase?: (caseId: string, agentName?: string) => void;
  onGeneratePdf?: (caseId: string, agentName?: string, pdfType?: string) => void;
  onShareCaseDetail?: (caseId: string, agentName?: string) => void;
}) {
  if (!open || !caseItem) return null;

  const hasAppealCase =
    caseItem.reviewStatus === "Revised" ||
    !!caseItem.revisedTopics?.length ||
    !!caseItem.displayRevisedTopicCodes?.length;

  const resolvedPdfLinks = {
    original: normalizeAssetUrl(
      String(caseItem.casePdfOriginalUrl || "").trim() ||
        String(caseItem.casePdfUrl || "").trim() ||
        (caseItem.caseId ? `/case-pdfs/${caseItem.caseId}-original.pdf` : "") ||
        (caseItem.caseId ? `/case-pdfs/${caseItem.caseId}.pdf` : "")
    ),
    revised: normalizeAssetUrl(
      String(caseItem.casePdfRevisedUrl || "").trim() ||
        (caseItem.caseId ? `/case-pdfs/${caseItem.caseId}-revised.pdf` : "")
    ),
  };
  const revisedPdfRoundLinks = caseItem.caseId
    ? [2, 3, 4, 5].map((round) => normalizeAssetUrl(`/case-pdfs/${caseItem.caseId}-revised_${round}.pdf`))
    : [];

  const rawImageUrls = splitAssetUrls(caseItem.caseImageUrl || "");
  const normalizedImageUrls = rawImageUrls.map((url) => normalizeAssetUrl(url)).filter(Boolean);
  const imageAssetCandidates = normalizedImageUrls.map((url, index) => {
    const rawUrl = rawImageUrls[index] || url;
    const isPdf = isPdfAssetUrl(rawUrl) || isPdfAssetUrl(url);
    return {
      rawUrl,
      url,
      isPdf,
      previewUrl: isPdf ? url : (getGoogleDriveImagePreviewUrl(rawUrl) || url),
    };
  });
  const [availablePdfUrls, setAvailablePdfUrls] = useState<{ label: string; url: string; tone: string }[]>([]);
  const [verifiedImageUrls, setVerifiedImageUrls] = useState<string[]>([]);
  const [verifiedImagePdfUrls, setVerifiedImagePdfUrls] = useState<{ rawUrl: string; url: string; label: string }[]>([]);
  const [appealRequestExists, setAppealRequestExists] = useState(false);
  const [appealOverrideAllowed, setAppealOverrideAllowed] = useState(false);
  const [appealSubmitOpen, setAppealSubmitOpen] = useState(false);
  const [appealDraftTopics, setAppealDraftTopics] = useState<AppealDraftTopic[]>([]);
  const [appealSubmitMessage, setAppealSubmitMessage] = useState("");
  const [appealSubmitBusy, setAppealSubmitBusy] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<{
    type: "image" | "pdf";
    url: string;
    title: string;
    downloadUrl?: string;
    items?: string[];
    index?: number;
  } | null>(null);

  const appealDeadline = getAppealDeadline(caseItem.auditDateObj);
  const isOwnAppealCase = isCurrentUserCaseOwner(currentUser, caseItem.agent);
  const canSubmitAppeal =
    isOwnAppealCase &&
    (isAppealWindowOpen(caseItem.auditDateObj) || appealOverrideAllowed) &&
    !appealRequestExists;
  useEffect(() => {
    let cancelled = false;

    const checkAppealRequest = async () => {
      try {
        const logs = await fetchUsageLogs(3000);
        if (cancelled) return;
        setAppealRequestExists(
          buildAppealRequests(logs).some(
            (item) =>
              item.status !== "Reset" &&
              String(item.caseId || "").trim().toLowerCase() === caseItem.caseId.trim().toLowerCase()
          )
        );
        setAppealOverrideAllowed(
          buildAppealCaseOverrides(logs).some(
            (item) => String(item.caseId || "").trim().toLowerCase() === caseItem.caseId.trim().toLowerCase()
          )
        );
      } catch {
        if (!cancelled) {
          setAppealRequestExists(false);
          setAppealOverrideAllowed(false);
        }
      }
    };

    setAppealSubmitOpen(false);
    setAppealDraftTopics([]);
    setAppealSubmitMessage("");
    void checkAppealRequest();

    return () => {
      cancelled = true;
    };
  }, [caseItem.caseId]);

  const openAppealSubmitForm = () => {
    setAppealDraftTopics(
      caseItem.topics.map((topic) => ({
        code: topic.code,
        label: topic.label,
        score: topic.score,
        max: topic.max,
        comment: topic.comment,
        wantsAppeal: false,
        appealReason: "ไม่อุทธรณ์หัวข้อนี้",
      }))
    );
    setAppealSubmitMessage("");
    setAppealSubmitOpen(true);
  };

  const submitAppealRequest = async () => {
    if (!currentUser || appealSubmitBusy) return;
    if (!isOwnAppealCase) {
      setAppealSubmitMessage("Only the case owner can submit an appeal for this case.");
      return;
    }

    if (!canSubmitAppeal) {
      setAppealSubmitMessage("This case is not available for appeal submission.");
      return;
    }

    const hasAppealedTopic = appealDraftTopics.some((topic) => topic.wantsAppeal && topic.appealReason.trim() && topic.appealReason.trim() !== "ไม่อุทธรณ์หัวข้อนี้");
    if (!hasAppealedTopic) {
      setAppealSubmitMessage("Please enter an appeal reason for at least one topic.");
      return;
    }

    const topicsForExport = appealDraftTopics.map((topic) => ({
      ...topic,
      appealReason: topic.wantsAppeal ? topic.appealReason.trim() : "ไม่อุทธรณ์หัวข้อนี้",
    }));

    setAppealSubmitBusy(true);
    try {
      await logUsageEvent(currentUser, "appeal_request_submitted", {
        tab: "dashboard",
        case_id: caseItem.caseId,
        target_agent: caseItem.agent,
        details: {
          requestId: `appeal-${caseItem.caseId}-${Date.now()}`,
          caseId: caseItem.caseId,
          agent: caseItem.agent,
          auditDate: caseItem.auditDate,
          auditTimestamp: caseItem.auditTimestamp,
          monthKey: caseItem.monthKey,
          monthLabel: caseItem.monthLabel,
          weekLabel: caseItem.weekLabel,
          rawDataSourceName: caseItem.rawDataSourceName || RAW_DATA_FILE_NAME,
          finalScore: caseItem.finalScore,
          grade: caseItem.grade,
          inquiry: caseItem.inquiryTh || caseItem.inquiryEn || "",
          caseDescription: caseItem.caseDescription || "",
          caseUrl: caseItem.caseUrl || "",
          submittedBy: currentUser.displayName || currentUser.username || "",
          submittedByUsername: currentUser.username || "",
          submittedAt: new Date().toISOString(),
          deadlineAt: appealDeadline?.toISOString() || "",
          topics: topicsForExport,
        },
      });
      setAppealRequestExists(true);
      setAppealSubmitOpen(false);
      setAppealSubmitMessage("Appeal request submitted to Songpon for review.");
    } finally {
      setAppealSubmitBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const checkAssets = async () => {
      const pdfCandidates = [
        resolvedPdfLinks.original
          ? { label: getCasePdfActionLabel(resolvedPdfLinks.original, caseItem.caseId), url: resolvedPdfLinks.original, tone: "amber" }
          : null,
        resolvedPdfLinks.revised
          ? { label: getCasePdfActionLabel(resolvedPdfLinks.revised, caseItem.caseId), url: resolvedPdfLinks.revised, tone: "violet" }
          : null,
        ...revisedPdfRoundLinks.map((url) =>
          url ? { label: getCasePdfActionLabel(url, caseItem.caseId), url, tone: "violet" } : null
        ),
      ].filter(Boolean) as { label: string; url: string; tone: string }[];

      const checked = await Promise.all(
        pdfCandidates.map(async (item) => ((await urlExists(item.url)) ? item : null))
      );

      const checkedImages = await Promise.all(
        imageAssetCandidates.map(async (item, index) => {
          if (!item?.previewUrl && !item?.url) return null;

          const shouldUsePdfMode = item.isPdf || isLikelyGoogleDrivePdf(item.rawUrl) || isLikelyGoogleDrivePdf(item.url);

          if (shouldUsePdfMode) {
            const pdfTargetUrl = item.rawUrl || item.url;
            const pdfOk = isGoogleDriveAssetUrl(pdfTargetUrl) ? true : await urlExists(pdfTargetUrl);
            return pdfOk
              ? {
                  kind: "pdf" as const,
                  rawUrl: item.rawUrl,
                  url: getGoogleDrivePdfViewerUrl(pdfTargetUrl) || pdfTargetUrl,
                  downloadUrl: normalizeAssetUrl(pdfTargetUrl) || pdfTargetUrl,
                  label:
                    imageAssetCandidates.length > 1
                      ? `${caseItem.caseId} Image Attachment PDF ${index + 1}`
                      : `${caseItem.caseId} Image Attachment PDF`,
                }
              : null;
          }

          const imageOk = isGoogleDriveAssetUrl(item.previewUrl) ? true : await urlExists(item.previewUrl);
          return imageOk
            ? {
                kind: "image" as const,
                rawUrl: item.rawUrl,
                url: item.previewUrl,
              }
            : null;
        })
      );

      if (!cancelled) {
        const uniquePdfs = checked
          .filter(Boolean)
          .filter((item, index, arr) => arr.findIndex((entry) => entry?.url === item?.url) === index) as {
          label: string;
          url: string;
          tone: string;
        }[];
        setAvailablePdfUrls(uniquePdfs);
        setVerifiedImageUrls(
          checkedImages
            .filter((item): item is { kind: "image"; rawUrl: string; url: string } => !!item && item.kind === "image")
            .map((item) => item.url)
            .filter((item, index, arr) => arr.indexOf(item) === index)
        );
        setVerifiedImagePdfUrls(
          checkedImages
            .filter((item): item is { kind: "pdf"; rawUrl: string; url: string; downloadUrl: string; label: string } => !!item && item.kind === "pdf")
            .filter((item, index, arr) => arr.findIndex((entry) => entry.downloadUrl === item.downloadUrl) === index)
        );
      }
    };

    checkAssets();
    return () => {
      cancelled = true;
    };
  }, [caseItem.caseId, caseItem.caseImageUrl, resolvedPdfLinks.original, resolvedPdfLinks.revised]);


  const handleGenerateCaseDetailPdf = async (pdfVariant: "original" | "appeal" = "original") => {
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      registerTHSarabunNew(doc as any);

      const setPdfFont = (style: "normal" | "bold" = "normal") => {
        try {
          doc.setFont("THSarabunNew", style);
          return true;
        } catch {
          doc.setFont("helvetica", style);
          return false;
        }
      };

      const usingThaiFont = setPdfFont("normal");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 12;
      const contentWidth = pageWidth - margin * 2;
      const pageBottom = pageHeight - 12;
      const lineHeight = 4.9;
      const topicGap = 6.2;
      let y = 12;
      let pageNumber = 1;

      const color = {
        text: [15, 23, 42] as [number, number, number],
        subtext: [71, 85, 105] as [number, number, number],
        line: [226, 232, 240] as [number, number, number],
        soft: [248, 250, 252] as [number, number, number],
        softViolet: [245, 243, 255] as [number, number, number],
        violet: [109, 40, 217] as [number, number, number],
        scoreBg: [241, 245, 249] as [number, number, number],
      };

      const safeText = (value: unknown) => String(value ?? "-").trim() || "-";
      const includeAppealDetail = pdfVariant === "appeal" && caseItem.reviewStatus === "Revised";
      const originalFinalScore =
        typeof caseItem.previousScore === "number"
          ? caseItem.previousScore
          : Math.round(
              (caseItem.topics || []).reduce((sum, topic) => sum + Number(topic.score || 0), 0) * 100
            ) / 100;
      const reportFinalScore = includeAppealDetail ? Number(caseItem.finalScore || 0) : originalFinalScore;
      const reportGrade = scoreToGrade(reportFinalScore, caseItem.monthKey);
      const reportStatus = includeAppealDetail ? "Revised" : "Original";
      const reportTitle = includeAppealDetail ? "Case Detail Appeal Report" : "Case Detail Report";
      const generatedByDisplay = currentUser?.displayName || currentUser?.username || "-";
      const generatedByRole = currentUser?.role ? ` (${currentUser.role})` : "";
      const generatedAtDisplay = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Bangkok",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(new Date());
      const makeWrapFriendlyText = (value: unknown) =>
        safeText(value).replace(/https?:\/\/\S+/g, (url) => url.replace(/([/?=&_.-])/g, "$1 "));
      const split = (value: unknown, width: number) =>
        doc.splitTextToSize(makeWrapFriendlyText(value), width);

      const drawPageFrame = () => {
        doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, 8, contentWidth, pageHeight - 16, 4, 4);
      };

      const drawPageHeader = (continued = false) => {
        drawPageFrame();

        doc.setFillColor(255, 255, 255);
        doc.roundedRect(margin + 2, 10, contentWidth - 4, 19, 3, 3, "F");

        const logoDataUrl = (drawPageHeader as any)._logoDataUrl as string | null;
        if (logoDataUrl) {
          try {
            doc.addImage(logoDataUrl, "PNG", margin + 5, 13, 10, 10);
          } catch {}
        }

        setPdfFont("bold");
        doc.setFontSize(18);
        doc.setTextColor(color.text[0], color.text[1], color.text[2]);
        doc.text("Robinhood QA", margin + 18, 17);

        setPdfFont("normal");
        doc.setFontSize(11.5);
        doc.setTextColor(color.subtext[0], color.subtext[1], color.subtext[2]);
        doc.text(continued ? `${reportTitle} | Continued` : reportTitle, margin + 18, 22.5);

        setPdfFont("normal");
        doc.setFontSize(10.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Page ${pageNumber}`, pageWidth - margin - 8, 17, { align: "right" });

        doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
        doc.line(margin + 4, 31, pageWidth - margin - 4, 31);
        y = 36;
      };

      const ensureSpace = (needed = 16, continued = true) => {
        if (y + needed <= pageBottom) return;
        doc.addPage();
        pageNumber += 1;
        setPdfFont("normal");
        drawPageHeader(continued);
      };

      const startNewPage = (continued = true) => {
        doc.addPage();
        pageNumber += 1;
        setPdfFont("normal");
        drawPageHeader(continued);
      };

      const drawSectionHeader = (title: string, subtitle?: string) => {
        const blockHeight = subtitle ? 12 : 9;
        ensureSpace(blockHeight + 3);

        doc.setFillColor(color.softViolet[0], color.softViolet[1], color.softViolet[2]);
        doc.roundedRect(margin + 2, y, contentWidth - 4, blockHeight, 2.5, 2.5, "F");

        setPdfFont("bold");
        doc.setFontSize(15.5);
        doc.setTextColor(color.violet[0], color.violet[1], color.violet[2]);
        doc.text(title, margin + 6, y + 5.7);

        if (subtitle) {
          setPdfFont("normal");
          doc.setFontSize(10.5);
          doc.setTextColor(color.subtext[0], color.subtext[1], color.subtext[2]);
          doc.text(subtitle, margin + 6, y + 10);
        }

        y += blockHeight + 4;
      };

      const drawKeyValueCard = (items: Array<{ label: string; value: string }>, columns = 2) => {
        const colGap = 5;
        const innerPadX = 4;
        const innerPadY = 3.5;
        const labelHeight = 3.8;
        const valueOffset = 7.3;
        const valueFontSize = 12.2;
        const boxWidth = contentWidth - 4;
        const colWidth = (boxWidth - innerPadX * 2 - colGap * (columns - 1)) / columns;

        const rowHeights: number[] = [];
        for (let i = 0; i < items.length; i += columns) {
          const rowItems = items.slice(i, i + columns);
          const height = Math.max(
            ...rowItems.map((item) => {
              const valueLines = split(item.value, colWidth - 1);
              return labelHeight + 3.2 + valueLines.length * lineHeight + 1.8;
            })
          );
          rowHeights.push(height);
        }

        const totalHeight =
          rowHeights.reduce((sum, h) => sum + h, 0) +
          innerPadY * 2 +
          Math.max(0, rowHeights.length - 1) * 1.4;
        ensureSpace(totalHeight + 2);

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
        doc.roundedRect(margin + 2, y, contentWidth - 4, totalHeight, 3, 3, "FD");

        let cursorY = y + innerPadY;
        let rowIndex = 0;
        for (let i = 0; i < items.length; i += columns) {
          const rowItems = items.slice(i, i + columns);
          const rowHeight = rowHeights[rowIndex];

          rowItems.forEach((item, colIndex) => {
            const x = margin + 2 + innerPadX + colIndex * (colWidth + colGap);
            const valueLines = split(item.value, colWidth - 1);

            setPdfFont("bold");
            doc.setFontSize(10.2);
            doc.setTextColor(color.subtext[0], color.subtext[1], color.subtext[2]);
            doc.text(item.label, x, cursorY + labelHeight);

            setPdfFont("normal");
            doc.setFontSize(valueFontSize);
            doc.setTextColor(color.text[0], color.text[1], color.text[2]);
            doc.text(valueLines, x, cursorY + valueOffset);
          });

          cursorY += rowHeight + 1.4;
          rowIndex += 1;
        }

        y += totalHeight + 3.2;
      };

      const drawParagraphCard = (label: string, value: string) => {
        const lines = split(value, contentWidth - 18);
        const labelBlockHeight = 8.5;
        const topPad = 3.5;
        const bottomPad = 4.5;
        const afterGap = 4.2;
        const minLinesPerChunk = 2;
        const safeLines = lines.length ? lines : ["-"];
        let remainingLines = [...safeLines];
        let firstChunk = true;

        while (remainingLines.length) {
          ensureSpace(labelBlockHeight + topPad + lineHeight * minLinesPerChunk + bottomPad + 2, !firstChunk);

          const availableBodyHeight = pageBottom - y - labelBlockHeight - topPad - bottomPad;
          const linesPerPage = Math.max(minLinesPerChunk, Math.floor(availableBodyHeight / lineHeight));
          const chunk = remainingLines.slice(0, linesPerPage);
          remainingLines = remainingLines.slice(linesPerPage);
          const cardHeight = labelBlockHeight + topPad + chunk.length * lineHeight + bottomPad;
          const labelText = `${label}${firstChunk ? "" : " (continued)"}`;

          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
          doc.roundedRect(margin + 2, y, contentWidth - 4, cardHeight, 3, 3, "FD");

          doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
          doc.line(margin + 7, y + labelBlockHeight, pageWidth - margin - 7, y + labelBlockHeight);

          setPdfFont("bold");
          doc.setFontSize(10.1);
          doc.setTextColor(color.subtext[0], color.subtext[1], color.subtext[2]);
          doc.text(labelText, margin + 8, y + 5.4);

          setPdfFont("normal");
          doc.setFontSize(11.8);
          doc.setTextColor(color.text[0], color.text[1], color.text[2]);
          doc.text(chunk, margin + 8, y + labelBlockHeight + topPad + 1.6);

          y += cardHeight + afterGap;

          if (remainingLines.length) {
            startNewPage(true);
          }

          firstChunk = false;
        }
      };

      const drawScoreBand = () => {
        const hasPrevious = includeAppealDetail && typeof caseItem.previousScore === "number";
        const cells = hasPrevious ? 3 : 2;
        const gap = 5;
        const cellWidth = (contentWidth - 4 - gap * (cells - 1)) / cells;
        const boxHeight = 19;
        ensureSpace(boxHeight + 3);

        const gradeStyle = pdfGradeStyle(reportGrade);
        const scoreStyle = pdfScoreStyle(reportFinalScore);
        const previousStyle = hasPrevious ? pdfScoreStyle(Number(caseItem.previousScore || 0)) : null;

        const drawCell = (
          x: number,
          label: string,
          value: string,
          style: { fill: number[]; text: number[]; border: number[] }
        ) => {
          doc.setFillColor(style.fill[0], style.fill[1], style.fill[2]);
          doc.setDrawColor(style.border[0], style.border[1], style.border[2]);
          doc.roundedRect(x, y, cellWidth, boxHeight, 3, 3, "FD");

          setPdfFont("bold");
          doc.setFontSize(10.5);
          doc.setTextColor(color.subtext[0], color.subtext[1], color.subtext[2]);
          doc.text(label, x + 4, y + 5.2);

          setPdfFont("bold");
          doc.setFontSize(17);
          doc.setTextColor(style.text[0], style.text[1], style.text[2]);
          doc.text(value, x + 4, y + 12.8);
        };

        drawCell(margin + 2, "Grade", reportGrade || "-", gradeStyle);
        drawCell(margin + 2 + cellWidth + gap, "Final Score", Number(reportFinalScore || 0).toFixed(2), scoreStyle);
        if (hasPrevious && previousStyle) {
          drawCell(
            margin + 2 + (cellWidth + gap) * 2,
            "Original Score",
            Number(caseItem.previousScore || 0).toFixed(2),
            previousStyle
          );
        }

        y += boxHeight + 4;
      };

      const drawTopicBlock = (
        topic: Topic,
        revisedTopic?: Topic | null,
        showRevised = false
      ) => {
        const hasRevised = !!(showRevised && revisedTopic && caseItem.reviewStatus === "Revised");
        const titleLines = split(`${topic.code} ${topic.label}`, contentWidth - 24);
        const scoreText = `${Number(topic.score || 0).toFixed(2)} / ${Number(topic.max || 0).toFixed(2)} · ${Number(topic.pct || 0).toFixed(1)}%`;
        const revisedScoreText = hasRevised
          ? `${Number(revisedTopic!.score || 0).toFixed(2)} / ${Number(revisedTopic!.max || 0).toFixed(2)} · ${Number(revisedTopic!.pct || 0).toFixed(1)}%`
          : "";
        const originalLines = split(topic.comment || "-", contentWidth - 18);
        const revisedLines = hasRevised ? split(revisedTopic!.comment || "-", contentWidth - 18) : [];
        const headerBlockHeight = Math.max(16, 8 + Math.max(0, titleLines.length - 1) * 4.2);

        const drawTopicHeader = (continued = false) => {
          ensureSpace(headerBlockHeight + (hasRevised ? 18 : 11) + 8, continued);

          doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
          doc.setLineWidth(0.3);
          doc.line(margin + 2, y, pageWidth - margin - 2, y);
          y += 3.5;

          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
          doc.roundedRect(margin + 2, y, contentWidth - 4, headerBlockHeight, 2.6, 2.6, "FD");

          doc.setFillColor(color.violet[0], color.violet[1], color.violet[2]);
          doc.roundedRect(margin + 5, y + 3.5, 1.7, headerBlockHeight - 7, 0.8, 0.8, "F");

          setPdfFont("bold");
          doc.setFontSize(13.3);
          doc.setTextColor(color.text[0], color.text[1], color.text[2]);
          doc.text(titleLines, margin + 9.5, y + 6.4);

          if (continued) {
            setPdfFont("normal");
            doc.setFontSize(9.2);
            doc.setTextColor(color.subtext[0], color.subtext[1], color.subtext[2]);
            doc.text("continued", pageWidth - margin - 6, y + 6.2, { align: "right" });
          }

          const scoreStartY = y + headerBlockHeight + 4.8;

          setPdfFont("bold");
          doc.setFontSize(10.2);
          doc.setTextColor(color.subtext[0], color.subtext[1], color.subtext[2]);
          doc.text(hasRevised ? "Original Score" : "Score", margin + 6, scoreStartY);

          setPdfFont("normal");
          doc.setFontSize(11.3);
          doc.setTextColor(color.text[0], color.text[1], color.text[2]);
          doc.text(scoreText, margin + 34, scoreStartY);

          y = scoreStartY + 6.2;

          if (hasRevised) {
            setPdfFont("bold");
            doc.setFontSize(10.2);
            doc.setTextColor(color.violet[0], color.violet[1], color.violet[2]);
            doc.text("Revised Score", margin + 6, y);

            setPdfFont("normal");
            doc.setFontSize(11.3);
            doc.setTextColor(67, 56, 202);
            doc.text(revisedScoreText, margin + 34, y);
            y += 6.2;
          }

          y += 1.6;
        };

        const drawCommentFlow = (
          label: string,
          lines: string[],
          tone: "default" | "revised" = "default"
        ) => {
          let remaining = lines.length ? [...lines] : ["-"];
          let firstChunk = true;
          const labelColor = tone === "revised"
            ? [109, 40, 217]
            : [color.subtext[0], color.subtext[1], color.subtext[2]];
          const bodyColor = tone === "revised"
            ? [67, 56, 202]
            : [color.text[0], color.text[1], color.text[2]];

          while (remaining.length) {
            if (y + 14 + lineHeight * 2 > pageBottom) {
              startNewPage(true);
              drawTopicHeader(true);
            }

            const labelText = `${label}${firstChunk ? "" : " (continued)"}`;

            setPdfFont("bold");
            doc.setFontSize(10.2);
            doc.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
            doc.text(labelText, margin + 6, y + 4.6);

            doc.setDrawColor(labelColor[0], labelColor[1], labelColor[2]);
            doc.setLineWidth(0.22);
            doc.line(margin + 6, y + 6.4, pageWidth - margin - 6, y + 6.4);
            y += 11.2;

            const linesPerChunk = Math.max(2, Math.floor((pageBottom - y - 3) / lineHeight));
            const chunk = remaining.slice(0, linesPerChunk);
            remaining = remaining.slice(linesPerChunk);

            setPdfFont("normal");
            doc.setFontSize(11.4);
            doc.setTextColor(bodyColor[0], bodyColor[1], bodyColor[2]);
            doc.text(chunk, margin + 8, y);

            y += chunk.length * lineHeight + 5.2;

            if (!remaining.length) {
              y += 1.4;
              break;
            }

            startNewPage(true);
            drawTopicHeader(true);
            firstChunk = false;
          }
        };

        drawTopicHeader(false);
        drawCommentFlow("Original Comment", originalLines, "default");

        if (hasRevised) {
          drawCommentFlow("Revised Comment", revisedLines, "revised");
        }

        doc.setDrawColor(color.line[0], color.line[1], color.line[2]);
        doc.setLineWidth(0.25);
        doc.line(margin + 2, y, pageWidth - margin - 2, y);
        y += topicGap + 1.2;
      };

      const logoDataUrl = await loadImageAsDataUrl("/robinhood-logo.png");
      (drawPageHeader as any)._logoDataUrl = logoDataUrl;

      drawPageHeader(false);

      if (!usingThaiFont) {
        doc.setFillColor(254, 242, 242);
        doc.setDrawColor(252, 165, 165);
        doc.roundedRect(margin + 2, y, contentWidth - 4, 8, 2.5, 2.5, "FD");
        setPdfFont("normal");
        doc.setFontSize(10);
        doc.setTextColor(185, 28, 28);
        doc.text("TH Sarabun font fallback is active.", margin + 6, y + 5.2);
        y += 12;
      }

      drawSectionHeader("Case Overview", "Structured summary for audit review");
      drawKeyValueCard(
        [
          { label: "Case ID", value: caseItem.caseId || "-" },
          { label: "Case Agent", value: caseItem.agent || "-" },
          { label: "Generated By", value: `${generatedByDisplay}${generatedByRole}` },
          { label: "Generated At", value: generatedAtDisplay },
          { label: "Case Date", value: caseItem.auditDate || "-" },
          { label: "Case Timestamp", value: caseItem.auditTimestamp || "-" },
          { label: "RawData File", value: caseItem.rawDataSourceName || RAW_DATA_FILE_NAME },
          { label: "Month", value: caseItem.monthLabel || caseItem.monthKey || "-" },
          { label: "Week", value: caseItem.weekLabel || "-" },
          {
            label: "Waiting Time / Service Time",
            value: formatWaitingServiceRange(caseItem.waitingTime, caseItem.serviceTime),
          },
          { label: "Review Status", value: reportStatus },
          { label: "Case URL", value: caseItem.caseUrl || "-" },
        ],
        2
      );
      drawScoreBand();

      drawSectionHeader("Customer Inquiry");
      drawParagraphCard("Inquiry", caseItem.inquiryTh || caseItem.inquiryEn || "-");

      drawSectionHeader("Case Description");
      drawParagraphCard("Description", caseItem.caseDescription || "-");

      const revisedMap = new Map((caseItem.revisedTopics || []).map((topic) => [topic.code, topic]));
      const validTopics = (caseItem.topics || []).filter((topic) => topic && Number(topic.max || 0) > 0);

      if (y + 38 > pageBottom) {
        startNewPage(true);
      }
      drawSectionHeader(
        "Topic Detail",
        includeAppealDetail
          ? "Continuous report layout with original and revised observations"
          : "Continuous report layout for topic-by-topic evaluation"
      );

      const displayCodeSet = new Set(caseItem.displayRevisedTopicCodes || []);

      validTopics.forEach((topic) => {
        const revisedTopic = revisedMap.get(topic.code);
        const showRevised =
          includeAppealDetail &&
          !!revisedTopic &&
          displayCodeSet.has(topic.code) &&
          isTopicChanged(topic, revisedTopic);

        drawTopicBlock(topic, revisedTopic, showRevised);
      });

      const safeCaseId = (caseItem.caseId || "case-detail").replace(/[^a-zA-Z0-9_-]+/g, "_");
      const fileSuffix = includeAppealDetail ? "case_detail_appeal" : "case_detail";
      doc.save(`${safeCaseId}_${fileSuffix}_report.pdf`);
      onGeneratePdf?.(caseItem.caseId, caseItem.agent, fileSuffix);
    } catch (error) {
      console.error("Generate Case Detail PDF failed:", error);
      alert("Generate PDF ไม่สำเร็จ กรุณาเปิด Console เพื่อตรวจสอบ error");
    }
  };


  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/45">
      <div className="absolute inset-0" onClick={onClose} />

      {previewAsset ? (
        <div className="absolute inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 lg:p-6">
          <div className="absolute inset-0" onClick={() => setPreviewAsset(null)} />
          <div className="relative z-10 flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 lg:px-5">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-900">{previewAsset.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Preview mode · {previewAsset.type === "pdf" ? "PDF" : "Image"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewAsset.downloadUrl || previewAsset.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                download
                >
                  Download File
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAsset(null)}
                  className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close Preview
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-slate-100">
              {previewAsset.type === "pdf" ? (
                <iframe
                  key={previewAsset.url}
                  src={previewAsset.url}
                  title={previewAsset.title}
                  className="h-full w-full bg-white"
                  allow="autoplay"
                />
              ) : (
                <div className="relative flex h-full items-center justify-center overflow-hidden bg-slate-100 p-4">
                  {previewAsset.items && previewAsset.items.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewAsset((current) => {
                            if (!current || current.type !== "image" || !current.items?.length) return current;
                            const nextIndex =
                              ((current.index ?? 0) - 1 + current.items.length) % current.items.length;
                            return {
                              ...current,
                              url: current.items[nextIndex],
                              index: nextIndex,
                              title: `${caseItem.caseId} Image Attachment ${nextIndex + 1}/${current.items.length}`,
                            };
                          })
                        }
                        className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white/90 px-4 py-3 text-sm font-bold text-slate-700 shadow hover:bg-white"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewAsset((current) => {
                            if (!current || current.type !== "image" || !current.items?.length) return current;
                            const nextIndex = ((current.index ?? 0) + 1) % current.items.length;
                            return {
                              ...current,
                              url: current.items[nextIndex],
                              index: nextIndex,
                              title: `${caseItem.caseId} Image Attachment ${nextIndex + 1}/${current.items.length}`,
                            };
                          })
                        }
                        className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white/90 px-4 py-3 text-sm font-bold text-slate-700 shadow hover:bg-white"
                      >
                        ›
                      </button>
                    </>
                  ) : null}

                  <div className="flex h-full w-full items-center justify-center overflow-auto">
                    <img
                      src={previewAsset.url}
                      alt={previewAsset.title}
                      className="max-h-full max-w-full rounded-2xl object-contain shadow-lg"
                    />
                  </div>

                  {previewAsset.items && previewAsset.items.length > 1 ? (
                    <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-700 shadow">
                      Image {(previewAsset.index ?? 0) + 1} / {previewAsset.items.length}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {appealSubmitOpen ? (
        <div className="absolute inset-0 z-[130] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Submit Appeal</div>
              <div className="mt-1 text-xl font-extrabold text-slate-950">{caseItem.caseId}</div>
              <div className="mt-1 text-sm text-slate-500">
                Send selected topics to Songpon for review. Dashboard score will update automatically after QA approves the appeal.
              </div>
              <div className="mt-2 text-xs font-semibold text-slate-500">
                Deadline: {formatBangkokDateTime(appealDeadline)}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="space-y-3">
                {appealDraftTopics.map((topic, index) => (
                  <div key={topic.code} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-sm font-bold text-slate-950">
                          {topic.code} {topic.label}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          Original score: {topic.score}/{topic.max}
                        </div>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                        Topic {index + 1}
                      </div>
                    </div>
                    <div className="mt-3 whitespace-pre-line rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700">
                      {topic.comment || "-"}
                    </div>
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Appeal decision for this topic</div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() =>
                            setAppealDraftTopics((current) =>
                              current.map((item) =>
                                item.code === topic.code
                                  ? { ...item, wantsAppeal: false, appealReason: "ไม่อุทธรณ์หัวข้อนี้" }
                                  : item
                              )
                            )
                          }
                          className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                            !topic.wantsAppeal
                              ? "border-slate-400 bg-slate-900 text-white"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          ไม่อุทธรณ์หัวข้อนี้
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAppealDraftTopics((current) =>
                              current.map((item) =>
                                item.code === topic.code
                                  ? { ...item, wantsAppeal: true, appealReason: item.appealReason === "ไม่อุทธรณ์หัวข้อนี้" ? "" : item.appealReason }
                                  : item
                              )
                            )
                          }
                          className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
                            topic.wantsAppeal
                              ? "border-emerald-500 bg-emerald-600 text-white"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          }`}
                        >
                          ยื่นอุทธรณ์หัวข้อนี้
                        </button>
                      </div>

                      {!topic.wantsAppeal ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">
                          Export value: ไม่อุทธรณ์หัวข้อนี้
                        </div>
                      ) : (
                        <textarea
                          value={topic.appealReason}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setAppealDraftTopics((current) =>
                              current.map((item) => (item.code === topic.code ? { ...item, appealReason: nextValue } : item))
                            );
                          }}
                          className="mt-3 min-h-[92px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                          placeholder="Enter appeal reason for this topic only if you want to appeal it."
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white px-5 py-4">
              {appealSubmitMessage ? (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
                  {appealSubmitMessage}
                </div>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAppealSubmitOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitAppealRequest}
                  disabled={appealSubmitBusy}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {appealSubmitBusy ? "Submitting..." : "Submit to Songpon"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="relative z-10 flex h-screen w-screen flex-col overflow-hidden bg-[#f8f6ff] shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-violet-100 bg-white/95 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 px-5 py-4 lg:px-6">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">
                Case Detail
              </div>
              <div className="mt-1 truncate text-lg font-bold text-slate-900">{caseItem.caseId}</div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-6 p-5 lg:p-6">
          <Panel>
            <PanelHeader
              title="Case Information"
              subtitle="Selected case overview and review status"
            />
            <PanelBody className="space-y-5">
              <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)] lg:p-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_300px] xl:items-start">
                  <div className="rounded-[22px] border border-slate-200 bg-white/95 p-3 shadow-sm lg:p-4">
                    <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-slate-50">
                      {[
                        { label: "Agent", value: caseItem.agent || "-" },
                        { label: "Case Date", value: caseItem.auditDate || "-" },
                        { label: "Case Timestamp", value: caseItem.auditTimestamp || "-" },
                        { label: "RawData File", value: caseItem.rawDataSourceName || RAW_DATA_FILE_NAME },
                        {
                          label: "Waiting Time / Service Time",
                          value: formatWaitingServiceRange(caseItem.waitingTime, caseItem.serviceTime),
                        },
                        { label: "Week", value: caseItem.weekLabel || "-" },
                      ].map((entry, index, arr) => (
                        <div
                          key={entry.label}
                          className={`px-4 py-3 ${index !== arr.length - 1 ? "border-b border-slate-200" : ""}`}
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            {entry.label}
                          </div>
                          <div className="mt-1.5 text-[15px] font-bold tracking-tight text-slate-900 lg:text-[16px]">
                            {entry.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`rounded-[22px] border px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)] bg-gradient-to-br ${currentGradeTone(caseItem.grade).card}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Final Score</div>
                        <div className={`mt-2 text-[42px] font-extrabold leading-none tracking-tight ${currentGradeTone(caseItem.grade).levelText}`}>
                          {caseItem.finalScore.toFixed(2)}
                        </div>
                        <div className={`mt-2 text-[13px] font-semibold ${currentGradeTone(caseItem.grade).levelText}`}>
                          {currentGradeTone(caseItem.grade).level}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${currentGradeTone(caseItem.grade).badge}`}>
                          Grade {caseItem.grade}
                        </span>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${reviewTone(caseItem.reviewStatus)}`}>
                          {caseItem.reviewStatus}
                        </span>
                      </div>
                    </div>

                    {caseItem.reviewStatus === "Revised" && typeof caseItem.previousScore === "number" ? (
                      <div className="mt-3 rounded-[16px] border border-white/70 bg-white/80 px-3 py-2.5 text-[12px] text-slate-700 shadow-sm">
                        <span className="font-semibold text-slate-900">Score Change:</span>{" "}
                        Original {caseItem.previousScore.toFixed(2)} → Revised {caseItem.finalScore.toFixed(2)}
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-2.5">
                      {hasAppealCase ? (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenAppealCase?.(caseItem.caseId, caseItem.agent);
                            onClose();
                          }}
                          className="inline-flex w-full items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-[13px] font-semibold text-violet-700 transition hover:bg-violet-100"
                        >
                          Open Appeal Case
                        </button>
                      ) : null}

                      {caseItem.caseUrl ? (
                        <a
                          href={caseItem.caseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Open Case URL
                        </a>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => onShareCaseDetail?.(caseItem.caseId, caseItem.agent)}
                        className="inline-flex w-full items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[13px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                      >
                        Share Case Detail Link
                      </button>

                      {canSubmitAppeal ? (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={openAppealSubmitForm}
                            className="inline-flex w-full items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[13px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          >
                            Submit Appeal
                          </button>
                          {appealOverrideAllowed && !isAppealWindowOpen(caseItem.auditDateObj) ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[12px] font-semibold text-amber-700">
                              Appeal override enabled for this case.
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {appealRequestExists ? (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[12px] font-semibold text-slate-600">
                          Appeal request already submitted for this case.
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => handleGenerateCaseDetailPdf("original")}
                        className="inline-flex w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] font-semibold text-amber-700 transition hover:bg-amber-100"
                        title={`Generate ${caseItem.caseId} Original PDF`}
                      >
                        {caseItem.caseId} Original PDF
                      </button>
                      {hasAppealCase ? (
                        <button
                          type="button"
                          onClick={() => handleGenerateCaseDetailPdf("appeal")}
                          className="inline-flex w-full items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-[13px] font-semibold text-violet-700 transition hover:bg-violet-100"
                          title={`Generate ${caseItem.caseId} Appeal PDF`}
                        >
                          {caseItem.caseId} Appeal PDF
                        </button>
                      ) : null}
                      {(verifiedImagePdfUrls.length || verifiedImageUrls.length) ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (verifiedImagePdfUrls.length) {
                              setPreviewAsset({
                                type: "pdf",
                                url: verifiedImagePdfUrls[0].url,
                                title: verifiedImagePdfUrls[0].label,
                                downloadUrl: verifiedImagePdfUrls[0].url,
                              });
                              return;
                            }
                            if (verifiedImageUrls.length) {
                              setPreviewAsset({
                                type: "image",
                                url: verifiedImageUrls[0],
                                title: `${caseItem.caseId} Case Image`,
                                items: verifiedImageUrls,
                                index: 0,
                                downloadUrl: verifiedImageUrls[0],
                              });
                            }
                          }}
                          className="inline-flex w-full items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-[13px] font-semibold text-sky-700 transition hover:bg-sky-100"
                        >
                          Preview Case Image
                        </button>
                      ) : null}

                      {availablePdfUrls.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() =>
                            setPreviewAsset({
                              type: "pdf",
                              url: item.url,
                              title: item.label,
                              downloadUrl: item.url,
                            })
                          }
                          className="inline-flex w-full items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] font-semibold text-amber-700 transition hover:bg-amber-100"
                          title={`Open ${item.label}`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Topic Detail" subtitle="Premium topic review with highlighted revised score changes" />
            <PanelBody>
              <div className="mb-5 space-y-4">
                <div className="rounded-[22px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 px-4 py-4 shadow-[0_10px_24px_rgba(109,40,217,0.06)]">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-base text-violet-700 shadow-sm">💬</span>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-700">Customer Inquiry</div>
                      <div className="mt-1 text-xs text-slate-500">ข้อความหรือประเด็นที่ลูกค้าติดต่อเข้ามาในเคสนี้</div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-[16px] border border-violet-100 bg-white/95 px-4 py-3 shadow-sm">
                    <div className="whitespace-pre-line text-[14px] leading-6.5 text-slate-800">{caseItem.inquiryTh || "-"}</div>
                  </div>
                </div>

                <div className="rounded-[22px] border border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-white to-violet-50 px-4 py-4 shadow-[0_10px_24px_rgba(168,85,247,0.06)]">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-100 text-base text-fuchsia-700 shadow-sm">📝</span>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-700">Case Description</div>
                      <div className="mt-1 text-xs text-slate-500">รายละเอียดและบริบทเพิ่มเติมของเคสนี้</div>
                    </div>
                  </div>
                  <div className="mt-3 rounded-[16px] border border-fuchsia-100 bg-white/95 px-4 py-3 shadow-sm">
                    <div className="whitespace-pre-line text-[14px] leading-6.5 text-slate-800">{caseItem.caseDescription || "-"}</div>
                  </div>
                </div>
              </div>
              <CaseDetailTopicTable
                topics={caseItem.topics}
                revisedTopics={caseItem.revisedTopics}
                reviewStatus={caseItem.reviewStatus}
                displayRevisedTopicCodes={caseItem.displayRevisedTopicCodes || []}
              />
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function DashboardMockup({
  currentUser,
  dashboardSubTab,
  externalSelectedAgent,
  externalSelectedMonthKey,
  externalSelectedWeek,
  externalCaseIdSearch,
  roleScopedAgentNames,
  dataRefreshKey,
  onSelectedAgentChange,
  onSelectedMonthKeyChange,
  onSelectedWeekChange,
  onOpenCaseDetail,
  onOpenAppealCase,
  onGeneratePdf,
  onShareCaseDetail,
}: {
  currentUser: any;
  dashboardSubTab: "overview" | "case-detail";
  externalSelectedAgent?: string;
  externalSelectedMonthKey?: string;
  externalSelectedWeek?: string;
  externalCaseIdSearch?: string;
  roleScopedAgentNames?: string[];
  dataRefreshKey?: number;
  onSelectedAgentChange?: (agentName: string) => void;
  onSelectedMonthKeyChange?: (monthKey: string) => void;
  onSelectedWeekChange?: (week: string) => void;
  onOpenCaseDetail?: (caseId?: string, agentName?: string) => void;
  onOpenAppealCase?: (caseId: string, agentName?: string) => void;
  onGeneratePdf?: (caseId: string, agentName?: string, pdfType?: string) => void;
  onShareCaseDetail?: (caseId: string, agentName?: string) => void;
}) {
  const firstDayOfCurrentMonth = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>(externalSelectedAgent || "");
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(externalSelectedMonthKey || "all");
  const [selectedWeek, setSelectedWeek] = useState<string>(externalSelectedWeek || "all");
  const [selectedCaseKey, setSelectedCaseKey] = useState<string>("");
  const [caseIdSearch, setCaseIdSearch] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(formatInputDate(firstDayOfCurrentMonth));
  const [dateTo, setDateTo] = useState<string>(formatInputDate(TODAY));
  const [appealMergeCount, setAppealMergeCount] = useState(0);
  const [overviewMode, setOverviewMode] = useState<"all" | "originalOnly" | "revisedOnly">("all");
  const [slideOverOpen, setSlideOverOpen] = useState(false);

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);
  const roleScopedAgentList = useMemo(
    () => dedupeAgentNames((roleScopedAgentNames || []).map((name) => toTitleCaseName(String(name || "").trim())).filter(Boolean)),
    [roleScopedAgentNames]
  );

  const effectiveMonthKeyForAgentVisibility = useMemo(() => {
    if (selectedMonthKey && selectedMonthKey !== "all") return selectedMonthKey;
    return getEffectiveMonthKeyFromDateRange(dateFrom, dateTo);
  }, [selectedMonthKey, dateFrom, dateTo]);

  useEffect(() => {
    if (
      !roleScopedAgentList.length &&
      typeof externalSelectedAgent === "string" &&
      externalSelectedAgent !== selectedAgent
    ) {
      setSelectedAgent(externalSelectedAgent);
    }
  }, [externalSelectedAgent, selectedAgent, roleScopedAgentList.length]);

  useEffect(() => {
    if (
      typeof externalSelectedMonthKey === "string" &&
      externalSelectedMonthKey !== selectedMonthKey
    ) {
      setSelectedMonthKey(externalSelectedMonthKey);
    }
  }, [externalSelectedMonthKey, selectedMonthKey]);

  useEffect(() => {
    if (typeof externalSelectedWeek === "string" && externalSelectedWeek !== selectedWeek) {
      setSelectedWeek(externalSelectedWeek);
    }
  }, [externalSelectedWeek, selectedWeek]);

  useEffect(() => {
    if (typeof externalCaseIdSearch === "string" && externalCaseIdSearch && externalCaseIdSearch !== caseIdSearch) {
      setCaseIdSearch(externalCaseIdSearch);
    }
  }, [externalCaseIdSearch, caseIdSearch]);

  useEffect(() => {
    const loadWorkbook = async () => {
      let evaluationCases: CaseItem[] = [];
      try {
        setIsLoading(true);
        setLoadError("");

        try {
          evaluationCases = mapStoredEvaluationsToCaseItems(await fetchStoredEvaluations());
        } catch (error) {
          console.warn("Stored QA evaluations could not be loaded before RawData merge", error);
        }

        const v8Response = { ok: false } as Response;
        if (v8Response.ok) {
          const v8Buffer = await v8Response.arrayBuffer();
          const v8Workbook = XLSX.read(v8Buffer, { type: "array", cellDates: false });
          const v8Sheet = v8Workbook.Sheets["Effective_Data"] || v8Workbook.Sheets[v8Workbook.SheetNames[0]];
          const v8Rows = XLSX.utils.sheet_to_json<any[]>(v8Sheet, {
            header: 1,
            defval: null,
            raw: true,
          });

          const v8HeaderIndex = (() => {
            for (let i = 0; i < v8Rows.length; i++) {
              const row = (v8Rows[i] || []) as any[];
              const normalized = row.map((v) => normalizeText(v));
              if (normalized.includes("agent name") && normalized.includes("case id") && normalized.includes("final score")) return i;
            }
            return -1;
          })();

          if (v8HeaderIndex >= 0) {
            const v8HeaderRow = (v8Rows[v8HeaderIndex] || []) as any[];
            const v8DataRows = v8Rows.slice(v8HeaderIndex + 1);
            const v8Helper = buildHeaderHelpers(v8HeaderRow);

            const mapped: CaseItem[] = v8DataRows
              .map((row, rowOffset) => {
                const caseId = String(v8Helper.getValue(row, "Case ID") || "").trim();
                if (!caseId) return null;
                const agent = toTitleCaseName(String(v8Helper.getValue(row, "Agent Name") || "").trim());
                if (!agent) return null;

                const auditRaw = v8Helper.getValue(row, "Audit Date");
                const timestampRaw = getFirstAvailableHeaderValue(v8Helper, row, ["Timestamp", "Audit Timestamp"], auditRaw);
                const auditDateObj = excelDateToJSDate(auditRaw);
                const monthDate = getReportingMonthDate(
                  v8Helper.getValue(row, "Month Start"),
                  v8Helper.getValue(row, "Month Label"),
                  auditDateObj
                );
                const monthKey = getMonthKey(monthDate);
                const topicMaster = getTopicMasterByMonth(monthKey);

                const topics: Topic[] = topicMaster.map((topic) => {
                  const scoreRaw =
                    v8Helper.getValue(row, `${topic.code} Revised Score`) ??
                    v8Helper.getValue(row, `${topic.code} Score`) ??
                    v8Helper.getValue(row, topic.code) ??
                    0;
                  const score = Number(scoreRaw || 0);
                  return {
                    code: topic.code,
                    label: topic.label,
                    score: Number.isFinite(score) ? score : 0,
                    max: topic.max,
                    pct: topic.max > 0 ? Math.round(((Number.isFinite(score) ? score : 0) / topic.max) * 100) : 0,
                    comment: String(v8Helper.getValue(row, `${topic.code} Revised Comment`) || v8Helper.getValue(row, `${topic.code} Comment`) || "").trim(),
                  };
                });

                const finalScoreRaw = v8Helper.getLastValue(row, "Final Score");
                const previousScoreRaw = v8Helper.getValue(row, "Previous Score");
                const finalScore =
                  finalScoreRaw !== null && finalScoreRaw !== "" && !Number.isNaN(Number(finalScoreRaw))
                    ? Number(finalScoreRaw)
                    : topics.reduce((sum, topic) => sum + topic.score, 0);
                const previousScore =
                  previousScoreRaw !== null && previousScoreRaw !== "" && !Number.isNaN(Number(previousScoreRaw))
                    ? Number(previousScoreRaw)
                    : finalScore;

                const latestAppealStatus = String(v8Helper.getValue(row, "Latest Appeal Status") || "").toLowerCase();
                const changeRemark = String(v8Helper.getValue(row, "Change Remark") || "").toLowerCase();
                const dataSource = String(v8Helper.getValue(row, "Data Source") || "").toLowerCase();
                const isRevised =
                  latestAppealStatus.includes("approved") ||
                  changeRemark.includes("revis") ||
                  dataSource.includes("appeal") ||
                  Math.abs(finalScore - previousScore) > 0.0001;

                const caseUrl = getFirstAvailableHeaderValue(v8Helper, row, ["Case URL", "Case Url", "URL"], "");
                const rawDataSourceName = String(
                  getFirstAvailableHeaderValue(v8Helper, row, ["RawData File", "Raw Data File", "Data Source"], V8_EFFECTIVE_FILE_NAME)
                ).trim() || V8_EFFECTIVE_FILE_NAME;
                const inquiry = getFirstAvailableHeaderValue(v8Helper, row, ["Customer Inquiry", "Inquiry TH", "Inquiry"], "-");

                const evaluationKey = buildEvaluationKeyFromRow(
                  v8Helper,
                  row,
                  caseId,
                  agent,
                  auditRaw,
                  finalScore,
                  topics
                );

                return {
                  key: `v8-${evaluationKey}`,
                  evaluationKey,
                  agent,
                  auditDate: formatAuditDateForDisplay(auditRaw),
                  auditDateObj,
                  auditTimestamp: formatAuditTimestamp(timestampRaw),
                  monthKey,
                  monthLabel: getReportingMonthLabel(v8Helper.getValue(row, "Month Label"), monthDate),
                  weekLabel: String(v8Helper.getValue(row, "Week Label") || v8Helper.getValue(row, "Week") || "-").trim(),
                  caseId,
                  rawDataSourceName,
                  caseUrl: caseUrl ? String(caseUrl).trim() : "",
                  waitingTime: formatTimeOnly(getFirstAvailableHeaderValue(v8Helper, row, ["Waiting Time", "WaitingTime"], "")),
                  serviceTime: formatTimeOnly(getFirstAvailableHeaderValue(v8Helper, row, ["Service Time", "ServiceTime"], "")),
                  inquiryTh: String(inquiry || "-").trim(),
                  inquiryEn: String(inquiry || "-").trim(),
                  caseDescription: String(getFirstAvailableHeaderValue(v8Helper, row, ["Case Description", "Case Description / รายละเอียดเคส คำอธิบายเคส"], "") || "").trim(),
                  caseImageUrl: normalizeAssetUrl(getFirstAvailableHeaderValue(v8Helper, row, ["Case Image URL", "Case Image"], "")),
                  casePdfUrl: normalizeAssetUrl(getFirstAvailableHeaderValue(v8Helper, row, ["Case PDF URL", "Case PDF"], caseId ? `/case-pdfs/${caseId}.pdf` : "")),
                  casePdfOriginalUrl: normalizeAssetUrl(getFirstAvailableHeaderValue(v8Helper, row, ["Case PDF Original URL"], caseId ? `/case-pdfs/${caseId}-original.pdf` : "")),
                  casePdfRevisedUrl: normalizeAssetUrl(getFirstAvailableHeaderValue(v8Helper, row, ["Case PDF Revised URL"], caseId ? `/case-pdfs/${caseId}-revised.pdf` : "")),
                  finalScore,
                  previousScore,
                  grade: scoreToGrade(finalScore, monthKey),
                  reviewStatus: isRevised ? "Revised" : "Original",
                  topics,
                  revisedTopics: null,
                  displayRevisedTopicCodes: [],
                } as CaseItem;
              })
              .filter(Boolean) as CaseItem[];

            const validMappedCases = mapped.filter((item) => item.agent && item.caseId && item.auditDateObj);
            const latestByEvaluationKey = new Map<string, CaseItem>();
            [...validMappedCases, ...evaluationCases]
              .filter((item) => item.agent && item.caseId && item.auditDateObj)
              .forEach((item) => {
                latestByEvaluationKey.set(item.evaluationKey, item);
              });
            setAllCases([...latestByEvaluationKey.values()]);
            setAppealMergeCount(
              validMappedCases.filter((item) => item.reviewStatus === "Revised").length
            );
            setIsLoading(false);
            return;
          }
        }

        const rawResponses = await Promise.all(
          RAW_DATA_FILE_NAMES.map(async (fileName) => ({
            fileName,
            response: await fetchCachedStaticResponse(`/${fileName}`).catch((error) => {
              console.warn(`RawData fetch skipped: ${fileName}`, error);
              return new Response("", { status: 599, statusText: "Fetch failed" });
            }),
          }))
        );
        let appealResponse: Response | null = null;
        let matchedUrl = "";
        try {
          const appealMatch = await fetchFirstAvailable([
            "/Appleal ROWDATA.xlsx",
            "/Appeal ROWDATA.xlsx",
            "/Appeal_ROWDATA.xlsx",
          ]);
          appealResponse = appealMatch.response;
          matchedUrl = appealMatch.matchedUrl;
        } catch (error) {
          console.warn("Appeal ROWDATA is not available; continuing without appeal merge.", error);
        }

        const availableRawResponses = rawResponses.filter((item) => item.response.ok);
        if (!availableRawResponses.length) {
          if (evaluationCases.length) {
            setAllCases(evaluationCases);
            setAppealMergeCount(0);
            setIsLoading(false);
            return;
          }
          throw new Error(`ไม่พบไฟล์ RawData ในโฟลเดอร์ public: ${RAW_DATA_FILE_NAMES.join(", ")}`);
        }

        const rawSources = await Promise.all(
          availableRawResponses.map(async ({ fileName, response }) => {
            const rawBuffer = await response.arrayBuffer();
            const rawWorkbook = XLSX.read(rawBuffer, { type: "array", cellDates: true });
            const rawSheet =
              rawWorkbook.Sheets["Raw_Data"] || rawWorkbook.Sheets[rawWorkbook.SheetNames[0]];

            const rawRows = XLSX.utils.sheet_to_json<any[]>(rawSheet, {
              header: 1,
              defval: null,
              raw: true,
            });

            const rawHeaderIndex = (() => {
              for (let i = 0; i < rawRows.length; i++) {
                const row = (rawRows[i] || []) as any[];
                const normalized = row.map((v) => normalizeText(v));
                if (normalized.includes("agent name") && normalized.includes("case id")) return i;
              }
              return -1;
            })();

            if (rawHeaderIndex === -1) {
              throw new Error(`ไม่พบแถว Header ในไฟล์ ${fileName}`);
            }

            const rawHeaderRow = (rawRows[rawHeaderIndex] || []) as any[];
            const rawHelper = buildHeaderHelpers(rawHeaderRow);
            const auditDateColumnIndex = rawHeaderRow.findIndex(
              (header) => normalizeText(header) === "audit date"
            );

            return {
              fileName,
              rawRows,
              rawHeaderIndex,
              rawHeaderRow,
              rawDataRows: rawRows.slice(rawHeaderIndex + 1),
              rawHelper,
              auditDateColumnIndex,
            };
          })
        );

        const rawDataEntries = rawSources.flatMap((source) =>
          source.rawDataRows.map((row, rowOffset) => ({ row, rowOffset, source }))
        );

        const rawCaseMonthKeyMap = new Map<string, string>();
        rawDataEntries.forEach(({ row, source }) => {
          const rawHelper = source.rawHelper;
          const rawCaseId = String(rawHelper.getValue(row, "Case ID") ?? "").trim();
          if (!rawCaseId) return;
          const auditRaw = rawHelper.getValue(row, "Audit Date");
          const monthDate = getReportingMonthDate(
            rawHelper.getValue(row, "Month Start"),
            rawHelper.getValue(row, "Month Label"),
            excelDateToJSDate(auditRaw)
          );
          const monthKey = getMonthKey(monthDate);
          rawCaseMonthKeyMap.set(rawCaseId, monthKey);
        });

        let appealRows: any[][] = [];
        if (appealResponse) {
          const appealBuffer = await appealResponse.arrayBuffer();
          const appealWorkbook = XLSX.read(appealBuffer, { type: "array", cellDates: true });
          const appealSheet =
            appealWorkbook.Sheets["Appeal_Data"] || appealWorkbook.Sheets[appealWorkbook.SheetNames[0]];

          appealRows = XLSX.utils.sheet_to_json<any[]>(appealSheet, {
            header: 1,
            defval: null,
            raw: true,
          });
        }

        const appealHeaderIndex = (() => {
          for (let i = 0; i < appealRows.length; i++) {
            const row = (appealRows[i] || []) as any[];
            const normalized = row.map((v) => normalizeText(v));
            if (normalized.includes("case id")) return i;
          }
          return -1;
        })();

        if (appealRows.length && appealHeaderIndex === -1) {
          throw new Error(`ไม่พบแถว Header ในไฟล์ ${matchedUrl.replace("/", "")}`);
        }

        const appealHeaderRow = (appealRows[appealHeaderIndex] || []) as any[];
        const appealDataRows = appealRows.slice(appealHeaderIndex + 1);
        const appealHelper = buildHeaderHelpers(appealHeaderRow);

        const appealMap = new Map<string, AppealMergeItem>();

        getLatestAppealRows(appealDataRows, appealHelper).forEach((row) => {
          const caseId = String(appealHelper.getValue(row, "Case ID") ?? "").trim();
          if (!caseId) return;

          const revisedTopics: Topic[] = [];
          const displayRevisedTopicCodes: string[] = [];
          const appealAuditRaw = appealHelper.getValue(row, "Audit Date");
          const topicMaster = getTopicMasterByMonth(
            rawCaseMonthKeyMap.get(caseId) || getMonthKey(excelDateToJSDate(appealAuditRaw))
          );

          topicMaster.forEach((topic) => {
            const originalScoreRaw = appealHelper.getValue(row, `${topic.code} Score`);
            const revisedScoreRaw = appealHelper.getValue(row, `${topic.code} Revised Score`);
            const originalCommentRaw = appealHelper.getValue(row, `${topic.code} Comment`);
            const revisedCommentRaw = appealHelper.getValue(row, `${topic.code} Revised Comment`);
            const appealReasonRaw = appealHelper.getValue(row, `${topic.code} Appeal Reason`);

            const hasRevisedScore =
              revisedScoreRaw !== null &&
              revisedScoreRaw !== "" &&
              !Number.isNaN(Number(revisedScoreRaw));

            const hasRevisedComment =
              revisedCommentRaw !== null && String(revisedCommentRaw).trim() !== "";

            if (!hasRevisedScore && !hasRevisedComment) return;

            const score = hasRevisedScore ? Number(revisedScoreRaw) : Number(originalScoreRaw ?? 0);
            const comment = hasRevisedComment
              ? String(revisedCommentRaw).trim()
              : String(originalCommentRaw ?? "").trim();

            revisedTopics.push({
              code: topic.code,
              label: topic.label,
              score,
              max: topic.max,
              pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,
              comment,
            });

            const appealedThisTopic = !isNoAppealReason(appealReasonRaw);
            const changedThisTopic = hasRealTopicChange(
              originalScoreRaw,
              revisedScoreRaw,
              originalCommentRaw,
              revisedCommentRaw
            );

            if (appealedThisTopic && changedThisTopic) {
              displayRevisedTopicCodes.push(topic.code);
            }
          });

          const explicitFinalScore = appealHelper.getLastValue(row, "Final Score");
          const explicitOriginalFinalScore = appealHelper.getValue(row, "Final Score", 0);

          const finalScore =
            explicitFinalScore !== null &&
            explicitFinalScore !== "" &&
            !Number.isNaN(Number(explicitFinalScore))
              ? Number(explicitFinalScore)
              : undefined;

          const previousScore =
            explicitOriginalFinalScore !== null &&
            explicitOriginalFinalScore !== "" &&
            !Number.isNaN(Number(explicitOriginalFinalScore))
              ? Number(explicitOriginalFinalScore)
              : undefined;

          if (!revisedTopics.length && finalScore === undefined) return;

          appealMap.set(caseId, {
            caseId,
            finalScore,
            previousScore,
            reviewStatus: displayRevisedTopicCodes.length ? "Revised" : "Original",
            revisedTopics,
            displayRevisedTopicCodes,
          });
        });

        try {
          const reviewedLogs = await fetchUsageLogsByEventTypes([
            "appeal_request_submitted",
            "appeal_request_reviewed",
            "appeal_request_reset",
          ], 10000);
          buildApprovedAppealMergeMap(reviewedLogs, rawCaseMonthKeyMap).forEach((item, caseId) => {
            appealMap.set(caseId, item);
          });
        } catch (error) {
          console.warn("Approved appeal review merge skipped", error);
        }

        setAppealMergeCount(appealMap.size);

        const mapped: CaseItem[] = rawDataEntries
          .filter(
            ({ row, source }) =>
              row && source.rawHelper.getValue(row, "Agent Name") && source.rawHelper.getValue(row, "Case ID")
          )
          .map(({ row, rowOffset, source }, index) => {
            const rawHelper = source.rawHelper;
            const caseId = String(rawHelper.getValue(row, "Case ID")).trim();
            const mergedAppeal = appealMap.get(caseId);

            const auditRaw = rawHelper.getValue(row, "Audit Date");
            const timestampRaw =
              getFirstAvailableHeaderValue(rawHelper, row, ["Timestamp", "Audit Timestamp"], auditRaw);
            const auditDateObj = excelDateToJSDate(auditRaw);
            const monthDate = getReportingMonthDate(
              rawHelper.getValue(row, "Month Start"),
              rawHelper.getValue(row, "Month Label"),
              auditDateObj
            );
            const monthKey = getMonthKey(monthDate);
            const topicMaster = getTopicMasterByMonth(monthKey);

            const topics: Topic[] = topicMaster.map((topic) => {
              const scoreVal = Number(rawHelper.getValue(row, `${topic.code} Score`) || 0);
              const score = Number.isFinite(scoreVal) ? scoreVal : 0;
              const commentVal = rawHelper.getValue(row, `${topic.code} Comment`);

              return {
                code: topic.code,
                label: topic.label,
                score,
                max: topic.max,
                pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,
                comment: commentVal ? String(commentVal).trim() : "",
              };
            });

            const explicitRawFinalScore = rawHelper.getLastValue(row, "Final Score");
            const baseFinalScore =
              explicitRawFinalScore !== null &&
              explicitRawFinalScore !== "" &&
              !Number.isNaN(Number(explicitRawFinalScore))
                ? Number(explicitRawFinalScore)
                : topics.reduce((sum, topic) => sum + topic.score, 0);

            const finalScoreVal =
              mergedAppeal?.finalScore ??
              (mergedAppeal?.revisedTopics?.length
                ? calcMergedFinalScore(topics, mergedAppeal.revisedTopics)
                : baseFinalScore);

            const previousScoreVal = mergedAppeal?.previousScore ?? baseFinalScore;

            const inquiry =
              getFirstAvailableHeaderValue(rawHelper, row, [
                "Customer Inquiry",
                "Inquiry TH",
                "Inquiry",
                "หัวข้อที่ลูกค้าติดต่อ",
                "หัวข้อเคส",
              ]) ?? "-";

            const weekLabel = getFirstAvailableHeaderValue(rawHelper, row, [
              "Week Label",
              "Week",
              "Week label",
            ], "-");

            const caseUrl = getFirstAvailableHeaderValue(rawHelper, row, [
              "Case URL",
              "Case Url",
              "URL",
            ], "");

            const rawDataSourceName = String(
              getFirstAvailableHeaderValue(rawHelper, row, [
                "RawData File",
                "Raw Data File",
                "RawData Source",
                "Raw Data Source",
                "Source File",
                "Source Filename",
                "File Name",
              ], source.fileName)
            ).trim() || source.fileName;

            const waitingTime = formatTimeOnly(
              getFirstAvailableHeaderValue(rawHelper, row, ["Waiting Time", "WaitingTime"], "")
            );

            const serviceTime = formatTimeOnly(
              getFirstAvailableHeaderValue(rawHelper, row, ["Service Time", "ServiceTime"], "")
            );

            const rawCaseDescription = getFirstAvailableHeaderValue(rawHelper, row, [
              "Case Description / รายละเอียดเคส คำอธิบายเคส",
              "รายละเอียดเคส คำอธิบายเคส",
              "Case Description",
              "รายละเอียดเคส",
              "คำอธิบายเคส",
            ], "");

            const caseDescription = isNewPolicyMonth(monthKey)
              ? String(rawCaseDescription || "").trim()
              : "";

            const caseImageUrl = normalizeAssetUrl(
              getFirstAvailableHeaderValue(rawHelper, row, [
                "Case Image URL / ภาพประกอบเคส",
                "ภาพประกอบเคส",
                "Case Image URL",
                "Case Image",
                "Image URL",
                "Attachment URL",
                "Case Attachment",
                "Attachment",
                "Case Image Link",
                "Image Link",
                "Link ภาพประกอบเคส",
                "ภาพเคส",
                "รูปภาพเคส",
              ], "")
            );

            const casePdfOriginalUrl = normalizeAssetUrl(
              getFirstAvailableHeaderValue(rawHelper, row, [
                "Case PDF Original URL",
                "Case PDF Original",
                "PDF Original URL",
                "Original PDF URL",
              ], caseId ? `/case-pdfs/${caseId}-original.pdf` : "")
            );

            const casePdfRevisedUrl = normalizeAssetUrl(
              getFirstAvailableHeaderValue(rawHelper, row, [
                "Case PDF Revised URL",
                "Case PDF Revised",
                "PDF Revised URL",
                "Revised PDF URL",
              ], caseId ? `/case-pdfs/${caseId}-revised.pdf` : "")
            );

            const casePdfUrl = normalizeAssetUrl(
              getFirstAvailableHeaderValue(rawHelper, row, [
                "Case PDF URL",
                "Case PDF",
                "PDF URL",
              ], caseId ? `/case-pdfs/${caseId}.pdf` : "")
            );

            const reviewStatus: ReviewStatus =
              mergedAppeal?.displayRevisedTopicCodes?.length ? "Revised" : "Original";

            const auditDateDisplay = formatAuditDateForDisplay(auditRaw);

            const agent = toTitleCaseName(String(rawHelper.getValue(row, "Agent Name")).trim());
            const evaluationKey = buildEvaluationKeyFromRow(
              rawHelper,
              row,
              caseId,
              agent,
              auditRaw,
              finalScoreVal,
              topics
            );

            return {
              key: evaluationKey,
              evaluationKey,
              agent,
              auditDate: auditDateDisplay,
              auditDateObj,
              auditTimestamp: formatAuditTimestamp(timestampRaw),
              monthKey,
              monthLabel: getReportingMonthLabel(rawHelper.getValue(row, "Month Label"), monthDate),
              weekLabel: String(weekLabel || "-").trim(),
              caseId,
              rawDataSourceName,
              caseUrl: caseUrl ? String(caseUrl).trim() : "",
              waitingTime,
              serviceTime,
              inquiryTh: inquiry ? String(inquiry).trim() : "-",
              inquiryEn: inquiry ? String(inquiry).trim() : "-",
              caseDescription: String(caseDescription || "").trim(),
              caseImageUrl: caseImageUrl ? String(caseImageUrl).trim() : "",
              casePdfUrl,
              casePdfOriginalUrl,
              casePdfRevisedUrl,
              finalScore: finalScoreVal,
              previousScore: previousScoreVal,
              grade: scoreToGrade(finalScoreVal, monthKey),
              reviewStatus,
              topics,
              revisedTopics: mergedAppeal?.revisedTopics?.length ? mergedAppeal.revisedTopics : null,
              displayRevisedTopicCodes: mergedAppeal?.displayRevisedTopicCodes || [],
            };
          });

        const latestByEvaluationKey = new Map<string, CaseItem>();
        [...mapped, ...evaluationCases]
          .filter((item) => item.agent && item.caseId && item.auditDateObj)
          .forEach((item) => {
            latestByEvaluationKey.set(item.evaluationKey, item);
          });

        setAllCases([...latestByEvaluationKey.values()]);
      } catch (error: any) {
        console.error("Load Error:", error);
        if (evaluationCases.length) {
          setAllCases(evaluationCases);
          setAppealMergeCount(0);
          setLoadError("");
          return;
        }
        setLoadError(error?.message || "โหลดไฟล์ Excel ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, [dataRefreshKey]);

  const visibleAgentList = useMemo(() => {
    const agentsFromCases = allCases.map((item) => String(item.agent || "").trim()).filter(Boolean);

    const mergedAgents = dedupeAgentNames([...AGENT_MASTER, ...agentsFromCases]).filter(
      (name) => !shouldHideAgentByMonth(name, effectiveMonthKeyForAgentVisibility)
    );

    if (roleScopedAgentList.length) {
      return mergedAgents.filter((agent) => roleScopedAgentList.some((scopedAgent) => isSameAgent(agent, scopedAgent)));
    }

    return mergedAgents;
  }, [allCases, effectiveMonthKeyForAgentVisibility, roleScopedAgentList]);

  useEffect(() => {
    if (roleScopedAgentList.length) {
      const lockedAgent = roleScopedAgentList[0];
      if (lockedAgent && !isSameAgent(selectedAgent || "", lockedAgent)) {
        setSelectedAgent(lockedAgent);
      }
      onSelectedAgentChange?.(lockedAgent || "");
      return;
    }

    if (roleScopedAgentList.length && selectedAgent && !visibleAgentList.some((agent) => isSameAgent(agent, selectedAgent))) {
      setSelectedAgent("");
      onSelectedAgentChange?.("");
      return;
    }

    if (selectedAgent && !visibleAgentList.some((agent) => isSameAgent(agent, selectedAgent))) {
      setSelectedAgent("");
      onSelectedAgentChange?.("");
    }
  }, [visibleAgentList, selectedAgent, onSelectedAgentChange, roleScopedAgentList.length]);

  const effectiveSelectedAgent =
    roleScopedAgentList.length
      ? roleScopedAgentList[0]
      : String(selectedAgent || "").trim();

  const agentCases = useMemo(() => {
    const scopedCases = roleScopedAgentList.length
      ? allCases.filter((item) => roleScopedAgentList.some((agent) => isSameAgent(item.agent, agent)))
      : allCases;

    if (!effectiveSelectedAgent) {
      return scopedCases;
    }

    return scopedCases.filter((item) => isSameAgent(item.agent, effectiveSelectedAgent));
  }, [allCases, effectiveSelectedAgent, roleScopedAgentList]);

  const monthOptions = useMemo(() => {
    const sourceCases = agentCases;

    return Array.from(
      new Map(
        sourceCases
          .filter((item) => item.monthKey !== "unknown")
          .map((item) => [item.monthKey, item.monthLabel])
      ).entries()
    )
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => b.value.localeCompare(a.value));
  }, [agentCases]);

  useEffect(() => {
    if (selectedMonthKey !== "all" && !monthOptions.some((item) => item.value === selectedMonthKey)) {
      setSelectedMonthKey("all");
      onSelectedMonthKeyChange?.("all");
    }
  }, [selectedMonthKey, monthOptions, onSelectedMonthKeyChange]);

  useEffect(() => {
    if (selectedMonthKey === "all") {
      const firstDay = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
      setDateFrom(formatInputDate(firstDay));
      setDateTo(formatInputDate(TODAY));
      return;
    }

    const [year, month] = selectedMonthKey.split("-").map(Number);
    if (!year || !month) return;

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    setDateFrom(formatInputDate(firstDay));
    setDateTo(formatInputDate(lastDay));
  }, [selectedMonthKey]);

  const dateFilteredCases = useMemo(() => {
    return agentCases.filter((item) => isWithinDateRange(item.auditDateObj, dateFrom, dateTo));
  }, [agentCases, dateFrom, dateTo]);

  const searchScopedCases = useMemo(() => {
    const keyword = caseIdSearch.trim().toLowerCase();
    if (!keyword) return dateFilteredCases;
    return agentCases.filter((item) => String(item.caseId || "").toLowerCase().includes(keyword));
  }, [agentCases, dateFilteredCases, caseIdSearch]);

  const weekLabels = useMemo(() => {
    return [...new Set(searchScopedCases.map((item) => item.weekLabel).filter(Boolean))].sort();
  }, [searchScopedCases]);

  useEffect(() => {
    if (selectedWeek !== "all" && !weekLabels.includes(selectedWeek)) {
      setSelectedWeek("all");
      onSelectedWeekChange?.("all");
    }
  }, [selectedWeek, weekLabels, onSelectedWeekChange]);

  const dashboardCasesBase = useMemo(() => {
    if (selectedWeek === "all") return searchScopedCases;
    return searchScopedCases.filter((item) => item.weekLabel === selectedWeek);
  }, [searchScopedCases, selectedWeek]);

  const revisedCount = useMemo(
    () => dashboardCasesBase.filter((item) => item.reviewStatus === "Revised").length,
    [dashboardCasesBase]
  );

  const dashboardCases = useMemo(() => {
    let nextCases = dashboardCasesBase;
    if (overviewMode === "revisedOnly") {
      nextCases = dashboardCasesBase.filter((item) => item.reviewStatus === "Revised");
    } else if (overviewMode === "originalOnly") {
      nextCases = dashboardCasesBase.filter((item) => item.reviewStatus === "Original");
    }
    return [...nextCases].sort(compareCaseAuditDateAndWaitingTime);
  }, [dashboardCasesBase, overviewMode]);

  useEffect(() => {
    if (dashboardSubTab !== "case-detail" || !externalCaseIdSearch || !dashboardCases.length) return;
    const targetCaseId = String(externalCaseIdSearch || "").trim().toLowerCase();
    const targetCase = dashboardCases.find((item) => String(item.caseId || "").trim().toLowerCase() === targetCaseId);
    if (!targetCase) return;
    if (selectedCaseKey !== targetCase.key) {
      setSelectedCaseKey(targetCase.key);
    }
    if (!slideOverOpen) {
      setSlideOverOpen(true);
    }
  }, [dashboardCases, dashboardSubTab, externalCaseIdSearch, selectedCaseKey, slideOverOpen]);

  const activeSelectedCase = useMemo(() => {
    if (!selectedCaseKey) return null;
    return dashboardCases.find((item) => item.key === selectedCaseKey) || null;
  }, [dashboardCases, selectedCaseKey]);

  useEffect(() => {
    if (!dashboardCases.length) {
      if (selectedCaseKey !== "") setSelectedCaseKey("");
      if (slideOverOpen) setSlideOverOpen(false);
      return;
    }

    if (!selectedCaseKey) return;

    const stillExists = dashboardCases.some((item) => item.key === selectedCaseKey);
    if (!stillExists) {
      setSelectedCaseKey("");
      setSlideOverOpen(false);
    }
  }, [dashboardCases, selectedCaseKey, slideOverOpen]);

  const summary = useMemo(() => buildAgentSummary(dashboardCases), [dashboardCases]);

  const metricAverageDisplay = summary.averageDisplay;
  const metricCaseCount = dashboardCases.length;
  const isAllAgentsView = !effectiveSelectedAgent;
  const visibleTargetAgents = useMemo(() => {
    if (roleScopedAgentList.length) return roleScopedAgentList;
    return visibleAgentList;
  }, [roleScopedAgentList, visibleAgentList]);
  const evaluatedAgentNames = useMemo(() => {
    return dedupeAgentNames(dashboardCases.map((item) => item.agent).filter(Boolean));
  }, [dashboardCases]);
  const progressTarget = isAllAgentsView
    ? Math.max(visibleTargetAgents.length, 1) * CASE_TARGET
    : CASE_TARGET;
  const progressCompleted = metricCaseCount;
  const progressComplete = progressCompleted >= progressTarget;
  const progressSubText = isAllAgentsView
    ? `${visibleTargetAgents.length} agent(s) x ${CASE_TARGET} cases monthly target`
    : progressComplete
    ? "Target reached"
    : "Target not reached";

  const effectiveViewMonthKey =
    selectedMonthKey === "all"
      ? getMonthKey(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))
      : selectedMonthKey;

  const currentGradeDisplay =
    metricCaseCount === 0
      ? isNewPolicyMonth(effectiveViewMonthKey)
        ? "D"
        : "F"
      : !isAllAgentsView && metricCaseCount < CASE_TARGET
      ? "-"
      : scoreToGrade(Number(metricAverageDisplay), effectiveViewMonthKey);

  const currentGradeSub =
    metricCaseCount === 0
      ? "No evaluated case in selected month"
      : isAllAgentsView
      ? "Team grade calculated from current average score"
      : metricCaseCount < CASE_TARGET
      ? "Grade will appear when completed 10 cases"
      : isNewPolicyMonth(effectiveViewMonthKey)
      ? "Calculated from new criteria (effective Apr 2026 onward)"
      : "Calculated from previous criteria";

  const incentiveResult = getIncentiveResult(
    metricCaseCount,
    Number(metricAverageDisplay),
    effectiveViewMonthKey
  );
  const incentiveDisplay = formatCurrencyTHB(incentiveResult.total);
  const incentiveRemark = incentiveResult.remark;

  const overviewCaseSearchResults = useMemo(() => {
    const keyword = caseIdSearch.trim().toLowerCase();
    if (!keyword) return [];

    return agentCases
      .filter((item) => String(item.caseId || "").toLowerCase().includes(keyword))
      .slice(0, 8);
  }, [agentCases, caseIdSearch]);

  const scoreDistributionData = useMemo(() => {
    if (isNewPolicyMonth(effectiveViewMonthKey)) {
      const buckets = [
        { label: "90-100", value: 0 },
        { label: "85-89", value: 0 },
        { label: "80-84", value: 0 },
        { label: "<80", value: 0 },
      ];

      dashboardCases.forEach((item) => {
        const score = item.finalScore;
        if (score >= 90) buckets[0].value += 1;
        else if (score >= 85) buckets[1].value += 1;
        else if (score >= 80) buckets[2].value += 1;
        else buckets[3].value += 1;
      });

      return buckets;
    }

    const buckets = [
      { label: "90-100", value: 0 },
      { label: "80-89", value: 0 },
      { label: "70-79", value: 0 },
      { label: "60-69", value: 0 },
      { label: "<60", value: 0 },
    ];

    dashboardCases.forEach((item) => {
      const score = item.finalScore;
      if (score >= 90) buckets[0].value += 1;
      else if (score >= 80) buckets[1].value += 1;
      else if (score >= 70) buckets[2].value += 1;
      else if (score >= 60) buckets[3].value += 1;
      else buckets[4].value += 1;
    });

    return buckets;
  }, [dashboardCases, effectiveViewMonthKey]);

  const reviewMixChartData = useMemo(() => {
    const revised = dashboardCases.filter((item) => item.reviewStatus === "Revised").length;
    const original = dashboardCases.filter((item) => item.reviewStatus === "Original").length;

    return [
      { label: "Original", value: original, tone: "bg-slate-400" },
      { label: "Revised", value: revised, tone: songkranTheme ? "bg-cyan-500" : "bg-violet-600" },
    ];
  }, [dashboardCases, songkranTheme]);

  const weakestTopics = useMemo(() => {
    return summary.topicPerformance
      .filter((item) => item.pct !== "-")
      .sort((a, b) => Number(a.pct) - Number(b.pct))
      .slice(0, 3);
  }, [summary]);

  const strongestTopics = useMemo(() => {
    return summary.topicPerformance
      .filter((item) => item.pct !== "-")
      .sort((a, b) => Number(b.pct) - Number(a.pct))
      .slice(0, 3);
  }, [summary]);

  const weeklyTrendData = useMemo(() => {
    const weekMap = new Map<string, number[]>();

    searchScopedCases.forEach((item) => {
      const week = item.weekLabel || "Unknown";
      if (!weekMap.has(week)) weekMap.set(week, []);
      weekMap.get(week)!.push(item.finalScore);
    });

    return [...weekMap.entries()].map(([label, scores]) => ({
      label,
      value: scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1),
    }));
  }, [searchScopedCases]);

  const recentMonthlyAnalytics = useMemo(() => {
    const monthKeys = Array.from(new Set(agentCases.map((item) => item.monthKey).filter((key) => key && key !== "unknown")))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 3)
      .sort((a, b) => a.localeCompare(b));

    const currentScopeCases = agentCases.filter((item) => monthKeys.includes(item.monthKey));

    return monthKeys.map((monthKey) => {
      const monthCases = currentScopeCases.filter((item) => item.monthKey === monthKey);
      const monthScores = monthCases.map((item) => item.finalScore);
      const monthTarget = isAllAgentsView ? Math.max(visibleTargetAgents.length, 1) * CASE_TARGET : CASE_TARGET;
      return {
        monthKey,
        label: monthOptions.find((month) => month.value === monthKey)?.label || monthKey,
        shortLabel: monthOptions.find((month) => month.value === monthKey)?.label?.replace(" 2026", "") || monthKey,
        average: monthScores.length
          ? Number((monthScores.reduce((sum, score) => sum + score, 0) / monthScores.length).toFixed(2))
          : 0,
        cases: monthCases.length,
        completion: monthTarget ? Number(((monthCases.length / monthTarget) * 100).toFixed(1)) : 0,
      };
    });
  }, [agentCases, isAllAgentsView, monthOptions, visibleTargetAgents.length]);

  const recentMonthlyScoreChartData = useMemo(() => {
    return recentMonthlyAnalytics.map((item) => ({
      label: item.shortLabel,
      value: item.average,
    }));
  }, [recentMonthlyAnalytics]);

  const recentMonthlyCaseChartData = useMemo(() => {
    return recentMonthlyAnalytics.map((item) => ({
      label: item.shortLabel,
      value: item.cases,
    }));
  }, [recentMonthlyAnalytics]);

  const agentAverageChartData = useMemo(() => {
    const agentMap = new Map<string, number[]>();

    dashboardCases.forEach((item) => {
      const agent = item.agent || "Unknown";
      if (!agentMap.has(agent)) agentMap.set(agent, []);
      agentMap.get(agent)!.push(item.finalScore);
    });

    const allAgentNames = isAllAgentsView ? visibleTargetAgents : evaluatedAgentNames;

    return allAgentNames
      .map((agent) => {
        const scores = agentMap.get(agent) || [];
        return {
          label: agent.split(" ")[0] || agent,
          value: scores.length
            ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
            : 0,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [dashboardCases, evaluatedAgentNames, isAllAgentsView, visibleTargetAgents]);

  const agentCaseVolumeChartData = useMemo(() => {
    const countMap = new Map<string, number>();

    dashboardCases.forEach((item) => {
      const agent = item.agent || "Unknown";
      countMap.set(agent, (countMap.get(agent) || 0) + 1);
    });

    return (isAllAgentsView ? visibleTargetAgents : evaluatedAgentNames)
      .map((agent) => ({
        label: agent.split(" ")[0] || agent,
        value: countMap.get(agent) || 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [dashboardCases, evaluatedAgentNames, isAllAgentsView, visibleTargetAgents]);

  const agentCaseScoreTrendData = useMemo(() => {
    return dashboardCases
      .slice()
      .sort(compareCaseAuditDateAndWaitingTime)
      .map((item) => ({
        label: item.caseId,
        value: item.finalScore,
      }));
  }, [dashboardCases]);

  const currentViewingMonthLabel =
    selectedMonthKey === "all"
      ? getMonthLabel(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))
      : monthOptions.find((m) => m.value === selectedMonthKey)?.label || "-";

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-3xl border border-violet-200 bg-white px-6 py-5 text-slate-700 shadow-sm">
          กำลังโหลด QA_RawData1.xlsx + Appeal ROWDATA...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff] p-6">
        <div className="max-w-xl rounded-3xl border border-rose-200 bg-white px-6 py-5 text-rose-700 shadow-sm">
          <div className="text-lg font-semibold">โหลดไฟล์ไม่สำเร็จ</div>
          <div className="mt-2 text-sm">{loadError}</div>
          <div className="mt-3 text-sm text-slate-600">
            ตรวจสอบว่าไฟล์อยู่ที่ public/QA_RawData1.xlsx และไฟล์ appeal ใช้ชื่อใดชื่อหนึ่งใน:
            Appleal ROWDATA.xlsx / Appeal ROWDATA.xlsx / Appeal_ROWDATA.xlsx
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative min-h-screen ${
        songkranTheme
          ? "bg-gradient-to-br from-cyan-50 via-sky-50 to-fuchsia-50"
          : "bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff]"
      }`}
    >
      {songkranTheme ? <SongkranBackdrop /> : null}

      <PageHero
        eyebrow="QA Dashboard"
        title="Agent Performance Dashboard"
        subtitle="Dashboard / Case Detail พร้อมข้อมูล Original และ Revised จาก QA_RawData1 + Appeal ROWDATA"
      />
      {false ? (
      <div>
        {songkranTheme ? <SongkranBackdrop /> : null}

        <div className="mx-auto max-w-[1720px] px-6 py-8 lg:px-8 lg:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-4xl">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200">
                QA Dashboard
              </div>
              <div className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl">
                Agent Performance Dashboard
              </div>
              <div className="mt-3 max-w-3xl text-sm leading-6 text-violet-100/95">
                Dashboard / Case Detail พร้อมข้อมูล Original และ Revised จาก QA_RawData1 +
                Appleal ROWDATA
              </div>
              {songkranTheme ? (
                <div className="mt-4 inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/95 backdrop-blur-sm">
                  Songkran Festival Theme • Auto reset after 25 Apr 2026
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-4 rounded-[28px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <LogoHeaderBox />
              <div className="hidden sm:block">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200">
                  Robinhood QA
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  Quality Monitoring Workspace
                </div>
                <div className="mt-1 text-sm text-violet-100/90">
                  Corporate dashboard for audit tracking and case review
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      <div className="mx-auto max-w-[1720px] px-6 py-6 lg:px-8 lg:py-8">
        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel className="sticky top-4">
              <PanelHeader
                title="Quick Controls"
                subtitle="Filter by agent, month, case ID, date range and week"
              />
              <PanelBody className="space-y-5">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    Agent
                  </div>
                  {roleScopedAgentList.length ? (
                    <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3 text-sm font-semibold text-violet-800">
                      {effectiveSelectedAgent || "-"}
                    </div>
                  ) : (
                    <select
                      value={selectedAgent}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedAgent(value);
                        onSelectedAgentChange?.(value);
                        setSelectedWeek("all");
                        onSelectedWeekChange?.("all");
                        setSelectedCaseKey("");
                        setSlideOverOpen(false);
                      }}
                      className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    >
                      <option value="">All Agents</option>
                      {visibleAgentList.map((agent) => (
                        <option key={canonicalAgentKey(agent)} value={agent}>
                          {agent}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    Month
                  </div>
                  <select
                    value={selectedMonthKey}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedMonthKey(value);
                      onSelectedMonthKeyChange?.(value);
                      setSelectedCaseKey("");
                      setSlideOverOpen(false);
                    }}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  >
                    <option value="all">Current Month</option>
                    {monthOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    Search Case ID
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={caseIdSearch}
                      onChange={(e) => {
                        setCaseIdSearch(e.target.value);
                        setSelectedCaseKey("");
                        setSlideOverOpen(false);
                      }}
                      placeholder="ค้นหาเลขเคสได้ทันที โดยไม่ต้องเลือกเดือน"
                      className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 pr-10 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m21 21-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {caseIdSearch.trim() ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCaseIdSearch("");
                      setSelectedCaseKey("");
                      setSlideOverOpen(false);
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                  >
                    Clear Search
                  </button>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                      Date From
                    </div>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        setSelectedCaseKey("");
                        setSlideOverOpen(false);
                      }}
                      className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    />
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                      Date To
                    </div>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        setSelectedCaseKey("");
                        setSlideOverOpen(false);
                      }}
                      className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    Week
                  </div>
                  <select
                    value={selectedWeek}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedWeek(value);
                      onSelectedWeekChange?.(value);
                      setSelectedCaseKey("");
                      setSlideOverOpen(false);
                    }}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    disabled={!searchScopedCases.length}
                  >
                    <option value="all">All Weeks</option>
                    {weekLabels.map((week) => (
                      <option key={week} value={week}>
                        {week}
                      </option>
                    ))}
                  </select>
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Weekly Snapshot" subtitle="Quick summary of visible weeks" />
              <PanelBody className="space-y-3">
                {!searchScopedCases.length ? (
                  <div className="rounded-2xl border border-dashed border-violet-200 bg-white/80 p-4 text-sm text-slate-500">
                    ไม่พบข้อมูลในช่วงที่เลือก
                  </div>
                ) : (
                  <>
                    <WeeklySnapshotCard
                      label="All Weeks"
                      caseCount={searchScopedCases.length}
                      averageDisplay={buildAgentSummary(searchScopedCases).averageDisplay}
                      isActive={selectedWeek === "all"}
                      onClick={() => {
                        setSelectedWeek("all");
                        onSelectedWeekChange?.("all");
                      }}
                    />

                    {weekLabels.map((week) => {
                      const weekCases = searchScopedCases.filter((item) => item.weekLabel === week);
                      const weekSummary = buildAgentSummary(weekCases);

                      return (
                        <WeeklySnapshotCard
                          key={week}
                          label={week}
                          caseCount={weekCases.length}
                          averageDisplay={weekSummary.averageDisplay}
                          isActive={selectedWeek === week}
                          onClick={() => {
                            setSelectedWeek(week);
                            onSelectedWeekChange?.(week);
                          }}
                        />
                      );
                    })}
                  </>
                )}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Data Health Checks" subtitle="System and data validation status" />
              <PanelBody>
                <DataHealthChecks
                  caseCount={allCases.length}
                  agentCount={visibleAgentList.length}
                  appealCount={appealMergeCount}
                />
              </PanelBody>
            </Panel>
          </div>

          <div className="space-y-6">
            {dashboardCases.length > 0 || caseIdSearch.trim() || effectiveSelectedAgent ? (
              dashboardSubTab === "overview" ? (
                <>
                  <Panel>
                    <PanelHeader
                      title={isAllAgentsView ? "Team Overview Scope" : "Agent Overview Scope"}
                      subtitle={isAllAgentsView ? "Formal monthly view for all visible agents" : "Selected agent and period"}
                    />
                    <PanelBody>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                            Viewing Agent
                          </div>
                          <div className="mt-2 text-sm font-bold text-slate-900">
                            {effectiveSelectedAgent || "All Agents"}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                            Viewing Month
                          </div>
                          <div className="mt-2 text-sm font-bold text-slate-900">
                            {currentViewingMonthLabel}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                            Viewing Week
                          </div>
                          <div className="mt-2 text-sm font-bold text-slate-900">
                            {selectedWeek === "all" ? "All Weeks" : selectedWeek}
                          </div>
                        </div>
                      </div>
                    </PanelBody>
                  </Panel>

                  <div className={`grid gap-4 md:grid-cols-2 ${isAllAgentsView ? "xl:grid-cols-4" : "xl:grid-cols-5"}`}>
                    <MetricCard
                      title="Average Score"
                      value={metricAverageDisplay}
                      sub={`${metricCaseCount} case(s) in current view`}
                      accent={
                        songkranTheme
                          ? "from-white via-cyan-50/50 to-fuchsia-50/60 border-cyan-200/80"
                          : "from-white via-violet-50/50 to-fuchsia-50/60 border-violet-200/80"
                      }
                      valueClassName={songkranTheme ? "text-cyan-700" : "text-violet-900"}
                      helper={
                        <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                          {isAllAgentsView ? "Team Score" : "Agent Score"}
                        </span>
                      }
                    />

                    <MetricCard
                      title={isAllAgentsView ? "Current Team Grade" : "Current Grade"}
                      value={currentGradeDisplay}
                      sub={currentGradeSub}
                      accent={currentGradeTone(currentGradeDisplay).card}
                      valueClassName={currentGradeTone(currentGradeDisplay).levelText}
                      helper={
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${currentGradeTone(
                              currentGradeDisplay
                            ).badge}`}
                          >
                            Grade {currentGradeDisplay}
                          </span>
                          <span
                            className={`text-[12px] font-semibold ${currentGradeTone(currentGradeDisplay).levelText}`}
                          >
                            Status: {currentGradeTone(currentGradeDisplay).level}
                          </span>
                        </div>
                      }
                    />

                    <MetricCard
                      title="Evaluation Progress"
                      value={`${progressCompleted}/${progressTarget}`}
                      sub={progressSubText}
                      accent={
                        progressComplete
                          ? "from-emerald-50 via-white to-emerald-100/70 border-emerald-200"
                          : "from-amber-50 via-white to-amber-100/70 border-amber-200"
                      }
                      valueClassName={progressComplete ? "text-emerald-700" : "text-amber-700"}
                      helper={
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            progressComplete
                              ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                              : "border-amber-200 bg-amber-100 text-amber-700"
                          }`}
                        >
                          {progressComplete ? "Completed" : "In Progress"}
                        </span>
                      }
                    />

                    {isAllAgentsView ? (
                      <MetricCard
                        title="Reviewed Agents"
                        value={`${evaluatedAgentNames.length}/${visibleTargetAgents.length}`}
                        sub="Agent(s) with at least one evaluated case in current view"
                        accent="from-white via-sky-50/50 to-emerald-50/60 border-sky-200"
                        valueClassName="text-sky-700"
                        helper={
                          <span className="inline-flex rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                            Team Coverage
                          </span>
                        }
                      />
                    ) : (
                      <>
                        <MetricCard
                          title="Estimated Incentive"
                          value={incentiveDisplay}
                          sub={incentiveRemark}
                          accent={
                            songkranTheme
                              ? "from-white via-cyan-50/50 to-fuchsia-100/60 border-cyan-200"
                              : "from-white via-fuchsia-50/50 to-violet-100/60 border-fuchsia-200"
                          }
                          valueClassName={songkranTheme ? "text-cyan-700" : "text-fuchsia-700"}
                          helper={
                            <div className="flex flex-wrap gap-2">
                              <span className="inline-flex rounded-full border border-fuchsia-200 bg-fuchsia-100 px-2.5 py-1 text-[11px] font-semibold text-fuchsia-700">
                                Monthly Estimate
                              </span>
                              {incentiveResult.promo > 0 ? (
                                <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-100 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">
                                  Cash {formatCurrencyTHB(incentiveResult.cash)} + Promo{" "}
                                  {formatCurrencyTHB(incentiveResult.promo)}
                                </span>
                              ) : null}
                            </div>
                          }
                        />

                        <MetricCard
                          title="Review Mix"
                          value={`${revisedCount}`}
                          sub="Revised case(s) in current view"
                          accent="from-white via-sky-50/50 to-indigo-100/60 border-sky-200"
                          valueClassName="text-sky-700"
                          helper={
                            <span className="inline-flex rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                              Revised Cases
                            </span>
                          }
                        />
                      </>
                    )}
                  </div>

                  <Panel>
                    <PanelHeader
                      title={isAllAgentsView ? "Team Monthly Analytics" : "Agent Monthly Analytics"}
                      subtitle={
                        isAllAgentsView
                          ? "Last 3 months summary for all visible agents"
                          : "Last 3 months summary for the selected agent"
                      }
                    />
                    <PanelBody className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-3">
                        {recentMonthlyAnalytics.map((item) => (
                          <div key={item.monthKey} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-xl bg-violet-50 px-2 py-2">
                                <div className="text-[10px] font-bold text-violet-500">Avg</div>
                                <div className="text-sm font-black text-violet-900">{item.average || "-"}</div>
                              </div>
                              <div className="rounded-xl bg-sky-50 px-2 py-2">
                                <div className="text-[10px] font-bold text-sky-500">Cases</div>
                                <div className="text-sm font-black text-sky-900">{item.cases}</div>
                              </div>
                              <div className="rounded-xl bg-emerald-50 px-2 py-2">
                                <div className="text-[10px] font-bold text-emerald-500">Target</div>
                                <div className="text-sm font-black text-emerald-900">{item.completion}%</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="grid gap-6 xl:grid-cols-2">
                        <PremiumBarChart
                          title="Average Score by Month"
                          subtitle="Last 3 monthly average score"
                          data={recentMonthlyScoreChartData}
                          height={230}
                        />
                        <PremiumBarChart
                          title="Case Volume by Month"
                          subtitle="Last 3 monthly reviewed case count"
                          data={recentMonthlyCaseChartData}
                          height={230}
                        />
                      </div>
                    </PanelBody>
                  </Panel>

                  <Panel>
                    <PanelHeader
                      title="QA Grade & Incentive Guide"
                      subtitle={
                        getIncentivePolicyKey(effectiveViewMonthKey) === "JAN_FEB_2026"
                          ? "January-February 2026 uses the special 80/70/60 grading policy. Monthly incentive is calculated only when the agent has at least 10 reviewed cases."
                          : getIncentivePolicyKey(effectiveViewMonthKey) === "MAR_2026"
                            ? "March 2026 uses the March-only grading policy. Monthly incentive is calculated only when the agent has at least 10 reviewed cases."
                            : "April 2026 onward uses the current grading policy. Monthly incentive is calculated only when the agent has at least 10 reviewed cases."
                      }
                    />
                    <PanelBody className="space-y-6">
                      {getIncentivePolicyKey(effectiveViewMonthKey) === "APR_2026_ONWARD" ? (
                        <>
                          <div className="overflow-x-auto rounded-2xl border border-violet-100">
                            <table className="min-w-[860px] w-full text-sm">
                              <thead>
                                <tr className="bg-violet-950 text-[11px] text-white">
                                  <th className="px-4 py-3 text-left">Score Range</th>
                                  <th className="px-4 py-3 text-left">Level</th>
                                  <th className="px-4 py-3 text-center">Grade</th>
                                  <th className="px-4 py-3 text-left">Meaning</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="bg-white">
                                  <td className="border-t border-slate-200 px-4 py-3">90-100</td>
                                  <td className="border-t border-slate-200 px-4 py-3">Excellent</td>
                                  <td className="border-t border-slate-200 px-4 py-3 text-center">
                                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                      A
                                    </span>
                                  </td>
                                  <td className="border-t border-slate-200 px-4 py-3">
                                    Meets all key standards
                                  </td>
                                </tr>
                                <tr className="bg-white">
                                  <td className="border-t border-slate-200 px-4 py-3">85-89</td>
                                  <td className="border-t border-slate-200 px-4 py-3">Strong</td>
                                  <td className="border-t border-slate-200 px-4 py-3 text-center">
                                    <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                                      B
                                    </span>
                                  </td>
                                  <td className="border-t border-slate-200 px-4 py-3">
                                    Meets most standards
                                  </td>
                                </tr>
                                <tr className="bg-white">
                                  <td className="border-t border-slate-200 px-4 py-3">80-84</td>
                                  <td className="border-t border-slate-200 px-4 py-3">Standard</td>
                                  <td className="border-t border-slate-200 px-4 py-3 text-center">
                                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                      C
                                    </span>
                                  </td>
                                  <td className="border-t border-slate-200 px-4 py-3">
                                    Acceptable but still has gaps
                                  </td>
                                </tr>
                                <tr className="bg-white">
                                  <td className="border-t border-slate-200 px-4 py-3">&lt;80</td>
                                  <td className="border-t border-slate-200 px-4 py-3">
                                    Improvement Needed
                                  </td>
                                  <td className="border-t border-slate-200 px-4 py-3 text-center">
                                    <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                                      D
                                    </span>
                                  </td>
                                  <td className="border-t border-slate-200 px-4 py-3">
                                    Below company standard
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="grid gap-6 xl:grid-cols-2">
                            <div className="overflow-x-auto rounded-2xl border border-violet-100">
                              <table className="min-w-[420px] w-full text-sm">
                                <thead>
                                  <tr className="bg-slate-900 text-[11px] text-white">
                                    <th className="px-4 py-3 text-left">General Month</th>
                                    <th className="px-4 py-3 text-center">Grade</th>
                                    <th className="px-4 py-3 text-center">Incentive</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="bg-white">
                                    <td className="border-t border-slate-200 px-4 py-3">Excellent</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">A</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">1,000</td>
                                  </tr>
                                  <tr className="bg-white">
                                    <td className="border-t border-slate-200 px-4 py-3">Strong</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">B</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">700</td>
                                  </tr>
                                  <tr className="bg-white">
                                    <td className="border-t border-slate-200 px-4 py-3">Standard</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">C</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">500</td>
                                  </tr>
                                  <tr className="bg-white">
                                    <td className="border-t border-slate-200 px-4 py-3">
                                      Improvement Needed
                                    </td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">D</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">0</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            <div className="overflow-x-auto rounded-2xl border border-violet-100">
                              <table className="min-w-[520px] w-full text-sm">
                                <thead>
                                  <tr className="bg-fuchsia-700 text-[11px] text-white">
                                    <th className="px-4 py-3 text-left">January / April</th>
                                    <th className="px-4 py-3 text-center">Grade</th>
                                    <th className="px-4 py-3 text-center">Cash</th>
                                    <th className="px-4 py-3 text-center">RBH Promo</th>
                                    <th className="px-4 py-3 text-center">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="bg-white">
                                    <td className="border-t border-slate-200 px-4 py-3">Excellent</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">A</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">1,000</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">500</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">1,000</td>
                                  </tr>
                                  <tr className="bg-white">
                                    <td className="border-t border-slate-200 px-4 py-3">Strong</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">B</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">700</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">300</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">700</td>
                                  </tr>
                                  <tr className="bg-white">
                                    <td className="border-t border-slate-200 px-4 py-3">Standard</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">C</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">500</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">150</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">500</td>
                                  </tr>
                                  <tr className="bg-white">
                                    <td className="border-t border-slate-200 px-4 py-3">
                                      Improvement Needed
                                    </td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">D</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">0</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">0</td>
                                    <td className="border-t border-slate-200 px-4 py-3 text-center">0</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      ) : getIncentivePolicyKey(effectiveViewMonthKey) === "JAN_FEB_2026" ? (
                        <div className="overflow-x-auto rounded-2xl border border-violet-100">
                          <table className="min-w-[760px] w-full text-sm">
                            <thead>
                              <tr className="bg-violet-950 text-[11px] text-white">
                                <th className="px-4 py-3 text-left">Score Range</th>
                                <th className="px-4 py-3 text-left">Level</th>
                                <th className="px-4 py-3 text-center">Grade</th>
                                <th className="px-4 py-3 text-center">Incentive (THB)</th>
                                <th className="px-4 py-3 text-left">Remark</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[
                                ["80-100", "Excellent", "A", "1,000"],
                                ["70-79", "Strong", "B", "500"],
                                ["60-69", "Standard", "C", "300"],
                                ["<60", "Improvement Needed", "D", "0"],
                              ].map(([range, level, grade, incentive]) => (
                                <tr key={grade} className="bg-white">
                                  <td className="border-t border-slate-200 px-4 py-3">{range}</td>
                                  <td className="border-t border-slate-200 px-4 py-3">{level}</td>
                                  <td className="border-t border-slate-200 px-4 py-3 text-center">
                                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(grade as Grade)}`}>
                                      {grade}
                                    </span>
                                  </td>
                                  <td className="border-t border-slate-200 px-4 py-3 text-center">{incentive}</td>
                                  <td className="border-t border-slate-200 px-4 py-3">January-February 2026 only</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-[860px] w-full text-sm">
                            <thead>
                              <tr className="bg-violet-950 text-[11px] text-white">
                                <th className="px-4 py-3 text-left">Score Range</th>
                                <th className="px-4 py-3 text-left">Level</th>
                                <th className="px-4 py-3 text-center">Grade</th>
                                <th className="px-4 py-3 text-center">Incentive (THB)</th>
                                <th className="px-4 py-3 text-left">Meaning</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="bg-white">
                                <td className="border-t border-slate-200 px-4 py-3">90-100</td>
                                <td className="border-t border-slate-200 px-4 py-3">Excellent</td>
                                <td className="border-t border-slate-200 px-4 py-3 text-center">
                                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                    A
                                  </span>
                                </td>
                                <td className="border-t border-slate-200 px-4 py-3 text-center">1,000</td>
                                <td className="border-t border-slate-200 px-4 py-3">Meets all key standards</td>
                              </tr>
                              <tr className="bg-white">
                                <td className="border-t border-slate-200 px-4 py-3">80-89</td>
                                <td className="border-t border-slate-200 px-4 py-3">Strong</td>
                                <td className="border-t border-slate-200 px-4 py-3 text-center">
                                  <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                                    B
                                  </span>
                                </td>
                                <td className="border-t border-slate-200 px-4 py-3 text-center">700</td>
                                <td className="border-t border-slate-200 px-4 py-3">Meets most standards</td>
                              </tr>
                              <tr className="bg-white">
                                <td className="border-t border-slate-200 px-4 py-3">70-79</td>
                                <td className="border-t border-slate-200 px-4 py-3">Standard</td>
                                <td className="border-t border-slate-200 px-4 py-3 text-center">
                                  <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                    C
                                  </span>
                                </td>
                                <td className="border-t border-slate-200 px-4 py-3 text-center">300</td>
                                <td className="border-t border-slate-200 px-4 py-3">Minimum pass level</td>
                              </tr>
                              <tr className="bg-white">
                                <td className="border-t border-slate-200 px-4 py-3">60-69</td>
                                <td className="border-t border-slate-200 px-4 py-3">Improvement Needed</td>
                                <td className="border-t border-slate-200 px-4 py-3 text-center">
                                  <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                                    D
                                  </span>
                                </td>
                                <td className="border-t border-slate-200 px-4 py-3 text-center">0</td>
                                <td className="border-t border-slate-200 px-4 py-3">Below company standard</td>
                              </tr>
                              <tr className="bg-white">
                                <td className="border-t border-slate-200 px-4 py-3">&lt;60</td>
                                <td className="border-t border-slate-200 px-4 py-3">Unsatisfactory</td>
                                <td className="border-t border-slate-200 px-4 py-3 text-center">
                                  <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                                    F
                                  </span>
                                </td>
                                <td className="border-t border-slate-200 px-4 py-3 text-center">0</td>
                                <td className="border-t border-slate-200 px-4 py-3">Significant quality issue</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </PanelBody>
                  </Panel>

                  <Panel>
                    <PanelHeader title="Overview Filters" subtitle="Control which cases are shown in overview" />
                    <PanelBody className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setOverviewMode("all")}
                          className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                            overviewMode === "all"
                              ? songkranTheme
                                ? "border-cyan-300 bg-cyan-100 text-cyan-800"
                                : "border-violet-400 bg-violet-100 text-violet-800"
                              : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
                          }`}
                        >
                          All Cases
                        </button>

                        <button
                          type="button"
                          onClick={() => setOverviewMode("originalOnly")}
                          className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                            overviewMode === "originalOnly"
                              ? songkranTheme
                                ? "border-cyan-300 bg-cyan-100 text-cyan-800"
                                : "border-violet-400 bg-violet-100 text-violet-800"
                              : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
                          }`}
                        >
                          Original Only
                        </button>

                        <button
                          type="button"
                          onClick={() => setOverviewMode("revisedOnly")}
                          className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                            overviewMode === "revisedOnly"
                              ? songkranTheme
                                ? "border-cyan-300 bg-cyan-100 text-cyan-800"
                                : "border-violet-400 bg-violet-100 text-violet-800"
                              : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
                          }`}
                        >
                          Revised Only
                        </button>
                      </div>

                      {caseIdSearch.trim() ? (
                        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                          <div className="text-xs font-bold uppercase tracking-wide text-violet-700">
                            Quick Case Search Result
                          </div>

                          <div className="mt-3 space-y-3">
                            {overviewCaseSearchResults.length ? (
                              overviewCaseSearchResults.map((item) => (
                                <QuickCaseSearchCard
                                  key={item.key}
                                  item={item}
                                  onOpen={() => {
                                    setSelectedCaseKey(item.key);
                                    onOpenCaseDetail?.(item.caseId, item.agent);
                                    setSlideOverOpen(true);
                                  }}
                                />
                              ))
                            ) : (
                              <div className="rounded-xl border border-dashed border-violet-200 bg-white px-4 py-4 text-sm text-slate-500">
                                ไม่พบเลขเคสที่ค้นหา
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </PanelBody>
                  </Panel>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <PremiumBarChart
                      title="Score Distribution"
                      subtitle="Case count by score range"
                      data={scoreDistributionData}
                    />

                    <PremiumReviewMixCard
                      title="Review Status Mix"
                      subtitle="Original vs Revised in current view"
                      data={reviewMixChartData}
                    />
                  </div>

                  <PremiumLineChart
                    title="Weekly Score Trend"
                    subtitle="Average score by visible week"
                    data={weeklyTrendData}
                  />

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <Panel>
                      <PanelHeader title="Topic Performance" subtitle="Average topic score in current view" />
                      <PanelBody>
                        <TopicPerformanceTable items={summary.topicPerformance} />
                      </PanelBody>
                    </Panel>

                    <Panel>
                      <PanelHeader title="Grade Mix" subtitle="Current view grade distribution" />
                      <PanelBody>
                        <GradeMix gradeCounts={summary.gradeCounts} />
                      </PanelBody>
                    </Panel>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <Panel>
                      <PanelHeader title="Strongest Topics" subtitle="Top 3 topics in current view" />
                      <PanelBody className="space-y-3">
                        {strongestTopics.length ? (
                          strongestTopics.map((topic) => (
                            <div
                              key={topic.code}
                              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
                            >
                              <div className="text-sm font-bold text-slate-900">
                                {topic.code} {topic.label}
                              </div>
                              <div className="mt-1 text-xs text-emerald-700">{topic.pct}% average</div>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-slate-500">No data</div>
                        )}
                      </PanelBody>
                    </Panel>

                    <Panel>
                      <PanelHeader title="Coaching Focus" subtitle="Top 3 weakest topics in current view" />
                      <PanelBody className="space-y-3">
                        {weakestTopics.length ? (
                          weakestTopics.map((topic) => (
                            <div
                              key={topic.code}
                              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3"
                            >
                              <div className="text-sm font-bold text-slate-900">
                                {topic.code} {topic.label}
                              </div>
                              <div className="mt-1 text-xs text-rose-700">{topic.pct}% average</div>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-slate-500">No data</div>
                        )}
                      </PanelBody>
                    </Panel>
                  </div>
                </>
              ) : (
                <>
                  <Panel>
                    <PanelHeader title="Current Viewing Scope" subtitle="Selected agent and period" />
                    <PanelBody>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                            Viewing Agent
                          </div>
                          <div className="mt-2 text-sm font-bold text-slate-900">
                            {effectiveSelectedAgent || "All Agents"}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                            Viewing Month
                          </div>
                          <div className="mt-2 text-sm font-bold text-slate-900">
                            {currentViewingMonthLabel}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                            Viewing Week
                          </div>
                          <div className="mt-2 text-sm font-bold text-slate-900">
                            {selectedWeek === "all" ? "All Weeks" : selectedWeek}
                          </div>
                        </div>
                      </div>
                    </PanelBody>
                  </Panel>

                  <Panel>
                    <PanelHeader
                      title="Case Navigator"
                      subtitle="Select a case to open detailed topic scoring"
                    />
                    <PanelBody>
                      {!dashboardCases.length ? (
                        <div className="rounded-2xl border border-dashed border-violet-200 bg-white/80 p-8 text-center text-sm text-slate-500">
                          {effectiveSelectedAgent === "Anucha Makundin"
                            ? "เดือนนี้ไม่มีเคสประเมินของ Anucha • Score = 0.00 • Grade = F"
                            : "ไม่พบข้อมูลในช่วงที่เลือก"}
                        </div>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                          {dashboardCases.map((item) => (
                            <CaseNavigatorCard
                              key={item.key}
                              item={item}
                              isSelected={activeSelectedCase?.key === item.key}
                              onSelect={() => {
                                setSelectedCaseKey(item.key);
                                onOpenCaseDetail?.(item.caseId, item.agent);
                                setSlideOverOpen(true);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </PanelBody>
                  </Panel>

                  <SlideOverCaseDetail
                    open={slideOverOpen}
                    caseItem={activeSelectedCase}
                    currentUser={currentUser}
                    onClose={() => setSlideOverOpen(false)}
                    onOpenAppealCase={onOpenAppealCase}
                    onGeneratePdf={onGeneratePdf}
                    onShareCaseDetail={onShareCaseDetail}
                  />
                </>
              )
            ) : (
              <Panel>
                <PanelHeader title="Dashboard" />
                <PanelBody>
                  <div className="rounded-2xl border border-dashed border-violet-200 bg-white/80 p-8 text-center text-sm text-slate-500">
                    กรุณาเลือก Agent หรือค้นหา Case ID
                  </div>
                </PanelBody>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
