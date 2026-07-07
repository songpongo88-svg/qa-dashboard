import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import PageHero from "./PageHero";
import LoadingMascot from "./LoadingMascot";
import { fetchStoredEvaluations } from "./evaluationStore";
import { buildAppealRequests } from "./AppealRequestsMockup";
import { fetchUsageLogsByEventTypes, type UsageLogEvent } from "./usageLog";
import { getIncentiveByScore, scoreToGrade, type Grade } from "./lib/scoreIncentivePolicy";
import { fetchCachedStaticResponse } from "./staticFileCache";

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
  monthKey: string;
  monthLabel: string;
  yearKey: string;
  weekLabel: string;
  caseId: string;
  inquiryTh: string;
  inquiryEn: string;
  finalScore: number;
  previousScore?: number;
  grade: Grade;
  reviewStatus: ReviewStatus;
  topics: Topic[];
  revisedTopics?: Topic[] | null;
  displayRevisedTopicCodes?: string[];
};

type AppealMergeItem = {
  caseId: string;
  finalScore?: number;
  previousScore?: number;
  reviewStatus?: ReviewStatus;
  revisedTopics: Topic[];
  displayRevisedTopicCodes: string[];
};

function isApprovedAppealTopicChanged(topic: {
  score?: number;
  revisedScore?: number | string;
  revisedComment?: string;
}) {
  const revisedScore =
    topic.revisedScore !== null &&
    topic.revisedScore !== "" &&
    !Number.isNaN(Number(topic.revisedScore))
      ? Number(topic.revisedScore)
      : undefined;
  const originalScore = Number(topic.score ?? 0);
  return (
    (revisedScore !== undefined && Math.abs(revisedScore - originalScore) > 0.0001) ||
    String(topic.revisedComment || "").trim() !== ""
  );
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

    const originalFinalScore = Number(request.finalScore || 0);
    let scoreDelta = 0;
    const revisedTopics = request.topics
      .map((matched) => {
        if (!matched || !isApprovedAppealTopicChanged(matched)) return null;
        const master = getTopicMasterByMonth(
          rawCaseMonthKeyMap.get(caseId) || getMonthKey(excelDateToJSDate(request.auditDate))
        ).find((item) => item.code === matched.code);
        if (!master) return null;
        const revisedScore =
          matched.revisedScore !== null &&
          matched.revisedScore !== "" &&
          !Number.isNaN(Number(matched.revisedScore))
            ? Number(matched.revisedScore)
            : Number(matched.score || 0);
        const originalScore = Number(matched.score || 0);
        if (Number.isFinite(originalScore) && Number.isFinite(revisedScore)) {
          scoreDelta += revisedScore - originalScore;
        }
        return {
          code: master.code,
          label: master.label,
          score: revisedScore,
          max: master.max,
          pct: Number(((revisedScore / master.max) * 100).toFixed(2)),
          comment: String(matched.revisedComment || matched.comment || "").trim(),
        } as Topic;
      })
      .filter(Boolean) as Topic[];

    if (!revisedTopics.length) return;

    map.set(caseId, {
      caseId,
      finalScore: Number((originalFinalScore + scoreDelta).toFixed(2)),
      previousScore: originalFinalScore,
      reviewStatus: "Revised",
      revisedTopics,
      displayRevisedTopicCodes: revisedTopics.map((topic) => topic.code),
    });
  });

  return map;
}

type TopicSummary = {
  code: string;
  label: string;
  avgScore: number;
  max: number;
  pct: number;
};

type SummaryView =
  | "weekly-dashboard"
  | "weekly-qa-by-agent"
  | "monthly-dashboard"
  | "monthly-team-summary"
  | "yearly-team-summary"
  | "yearly-by-agent";

type SummaryCards = {
  caseCount: number;
  avgScore: number;
  revisedCount: number;
  grade: Grade;
  incentive: number;
  policyMonthKey: string;
};

type PeriodRow = {
  label: string;
  caseCount: number;
  avgScore: number;
  revisedCount: number;
  grade: Grade;
  incentive: number;
};

const CASE_TARGET = 10;
const RAW_DATA_FILE_NAMES = [
  "QA_RawData_January-February2026.xlsx",
  "QA_RawData_March-May2026.xlsx",
];
const V8_EFFECTIVE_FILE_NAME = "__disabled_QA_Score_Dashboard_byDao_V8.xlsx";
const SONGKRAN_THEME_END = new Date(2026, 4, 25, 23, 59, 59);
const NEW_POLICY_START_MONTH_KEY = "2026-04";
const JUNE_2026_POLICY_START_MONTH_KEY = "2026-06";

const JAN_FEB_2026_TOPIC_MASTER = [
  { code: "1", label: "เปิด-ปิดการสนทนา", max: 10 },
  { code: "2", label: "วิเคราะห์/แก้ไข", max: 30 },
  { code: "3", label: "ปฏิบัติตามขั้นตอน", max: 20 },
  { code: "4", label: "ความสุภาพ", max: 10 },
  { code: "5", label: "ภาษา", max: 20 },
  { code: "6", label: "ระยะเวลา", max: 10 },
] as const;

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

  if (monthKey === "2026-01" || monthKey === "2026-02") {
    return JAN_FEB_2026_TOPIC_MASTER;
  }

  return isNewPolicyMonth(monthKey) ? APRIL_2026_TOPIC_MASTER : LEGACY_TOPIC_MASTER;
}

const ALL_TOPIC_MASTER = Array.from(
  new Map(
    [...JAN_FEB_2026_TOPIC_MASTER, ...LEGACY_TOPIC_MASTER, ...APRIL_2026_TOPIC_MASTER, ...JUNE_2026_TOPIC_MASTER].map((item) => [item.code, item])
  ).values()
);

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

function normalizeHeaderComparable(value: unknown) {
  return normalizeText(value)
    .replace(/\s*\(\s*\d+\s*(?:คะแนน|point|points)\s*\)\s*$/i, "")
    .trim();
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
  const na = normalizeText(a);
  const nb = normalizeText(b);
  const ca = compactText(a);
  const cb = compactText(b);

  return na === nb || ca === cb || na.includes(nb) || nb.includes(na) || ca.includes(cb) || cb.includes(ca);
}

function getUniqueNormalizedAgents(agentNames: string[]) {
  const result: string[] = [];

  agentNames
    .map((name) => toTitleCaseName(String(name || "").trim()))
    .filter(Boolean)
    .forEach((name) => {
      const exists = result.some((item) => isSameAgent(item, name));
      if (!exists) result.push(name);
    });

  return result.sort((a, b) => a.localeCompare(b));
}

function shouldHideAgentByMonth(agentName: string, selectedMonthKey: string) {
  if (!selectedMonthKey || selectedMonthKey === "all") return false;

  const matchedEntry = Object.entries(RESIGNED_AGENT_HIDE_AFTER).find(([name]) => isSameAgent(name, agentName));
  if (!matchedEntry) return false;
  const [, hideFromMonth] = matchedEntry;
  return selectedMonthKey >= hideFromMonth;
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
    return roundExcelLikeMinute(value);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return roundExcelLikeMinute(new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0));
  }

  const text = String(value).trim();
  if (!text) return null;

  const ddmmyyyyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ddmmyyyyMatch) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = ddmmyyyyMatch;
    return roundExcelLikeMinute(new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return roundExcelLikeMinute(new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), parsed.getHours(), parsed.getMinutes(), parsed.getSeconds()));
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

function getMonthKey(date: Date | null) {
  if (!date) return "unknown";
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

function getMonthLabel(date: Date | null) {
  if (!date) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
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
  return fallbackDate || parseMonthLabelDate(monthLabelRaw) || excelDateToJSDate(monthStartRaw);
}

function getReportingMonthLabel(monthLabelRaw: any, monthDate: Date | null) {
  const label = String(monthLabelRaw ?? "").trim();
  return monthDate ? getMonthLabel(monthDate) : label || "Unknown";
}

function getYearKey(date: Date | null) {
  if (!date) return "unknown";
  return String(date.getFullYear());
}

function isNewPolicyMonth(monthKey: string) {
  return monthKey !== "unknown" && monthKey >= NEW_POLICY_START_MONTH_KEY;
}

function getGradeTone(grade: Grade) {
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

function formatCurrencyTHB(value: number) {
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value || 0);
}

function getIncentiveValue(caseCount: number, avg: number, monthKey: string) {
  if (caseCount < CASE_TARGET) return 0;
  return getIncentiveByScore(avg, monthKey).total;
}

function getPolicyMonthKeyForCases(cases: CaseItem[]) {
  const valid = cases.map((item) => item.monthKey).filter((item) => item && item !== "unknown").sort((a, b) => a.localeCompare(b));
  return valid.length ? valid[valid.length - 1] : "unknown";
}

function buildHeaderHelpers(headerRow: any[]) {
  const normalizedHeaders = headerRow.map((h) => normalizeText(h));
  const normalizedHeaderBases = headerRow.map((h) => normalizeHeaderComparable(h));
  const findIndexes = (name: string) => {
    const target = normalizeText(name);
    return normalizedHeaders.map((h, idx) => ((h === target || normalizedHeaderBases[idx] === target) ? idx : -1)).filter((idx) => idx >= 0);
  };
  const getValue = (row: any[], name: string, occurrence = 0) => {
    const indexes = findIndexes(name);
    const idx = indexes[occurrence];
    return idx >= 0 ? row[idx] : null;
  };
  const getLastValue = (row: any[], name: string) => {
    const indexes = findIndexes(name);
    if (!indexes.length) return null;
    return row[indexes.length ? indexes[indexes.length - 1] : -1];
  };
  return { getValue, getLastValue };
}

function getCaseDateRawValue(helper: ReturnType<typeof buildHeaderHelpers>, row: any[]) {
  return (
    helper.getValue(row, "Case Date") ??
    helper.getValue(row, "Case date") ??
    helper.getValue(row, "Case_Date") ??
    helper.getValue(row, "Audit Date") ??
    helper.getValue(row, "AuditDate") ??
    helper.getValue(row, "Case Timestamp") ??
    helper.getValue(row, "Timestamp")
  );
}

function getAppealVersionRank(value: any) {
  const matches = String(value ?? "").match(/\d+/g);
  return matches?.length ? Number(matches[matches.length - 1]) : -1;
}

function getAppealTimestampRank(helper: ReturnType<typeof buildHeaderHelpers>, row: any[]) {
  const raw =
    helper.getValue(row, "Appeal Result Date & Time") ??
    helper.getValue(row, "Appeal Result Date") ??
    helper.getValue(row, "Timestamp") ??
    helper.getValue(row, "Created Date & Time") ??
    helper.getValue(row, "Created Date");
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

function mergeTopicSet(topics: Topic[], revisedTopics?: Topic[] | null) {
  if (!revisedTopics?.length) return topics;
  const revisedMap = new Map(revisedTopics.map((topic) => [topic.code, topic]));
  return topics.map((topic) => revisedMap.get(topic.code) || topic);
}

function roundToTwo(value: number) {
  return Math.round(value * 100 + 1e-7) / 100;
}

function calcMergedFinalScore(baseTopics: Topic[], revisedTopics: Topic[]) {
  const revisedMap = new Map(revisedTopics.map((t) => [t.code, t]));
  const total = baseTopics.reduce((sum, base) => {
    const active = revisedMap.get(base.code) || base;
    return sum + active.score;
  }, 0);
  return roundToTwo(total);
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

function buildCaseMergeKey(item: Pick<CaseItem, "caseId" | "agent" | "evaluationKey">) {
  const caseId = normalizeEvaluationKeyPart(item.caseId).toUpperCase();
  const agent = normalizeEvaluationKeyPart(item.agent).toLowerCase();
  if (caseId && agent) return ["case", caseId, agent].join("|");
  return item.evaluationKey;
}

function buildTopicSummary(cases: CaseItem[]): TopicSummary[] {
  const topicMaster = getTopicMasterByMonth(getPolicyMonthKeyForCases(cases));

  return topicMaster.map((master) => {
    const topics = cases
      .flatMap((item) =>
        item.reviewStatus === "Revised" && item.revisedTopics?.length
          ? mergeTopicSet(item.topics, item.revisedTopics)
          : item.topics
      )
      .filter((topic) => topic.code === master.code);

    if (!topics.length) {
      return { code: master.code, label: master.label, avgScore: 0, max: master.max, pct: 0 };
    }

    const avg = topics.reduce((sum, topic) => sum + topic.score, 0) / topics.length;
    const avgRounded = roundToTwo(avg);
    return {
      code: master.code,
      label: master.label,
      avgScore: avgRounded,
      max: master.max,
      pct: roundToTwo((avgRounded / master.max) * 100),
    };
  });
}

function summarizeCases(cases: CaseItem[]): SummaryCards {
  const caseCount = cases.length;
  const avgScore = caseCount ? roundToTwo(cases.reduce((sum, item) => sum + item.finalScore, 0) / caseCount) : 0;
  const revisedCount = cases.filter((item) => item.reviewStatus === "Revised").length;
  const policyMonthKey = getPolicyMonthKeyForCases(cases);
  return {
    caseCount,
    avgScore,
    revisedCount,
    grade: scoreToGrade(avgScore, policyMonthKey),
    incentive: getIncentiveValue(caseCount, avgScore, policyMonthKey),
    policyMonthKey,
  };
}

function getPeriodRowSortRank(label: string, groupBy: "week" | "month" | "year" | "agent") {
  const value = String(label || "").trim();

  if (groupBy === "week") {
    const dates = value.match(/\d{1,2}\/\d{1,2}\/\d{4}/g);
    const lastDate = dates?.[dates.length - 1];
    const parsed = excelDateToJSDate(lastDate);
    return parsed?.getTime() ?? 0;
  }

  if (groupBy === "month") {
    const parsed = parseMonthLabelDate(value);
    return parsed?.getTime() ?? 0;
  }

  if (groupBy === "year") {
    const year = Number(value);
    return Number.isFinite(year) ? year : 0;
  }

  return 0;
}

function sortPeriodRows(rows: PeriodRow[], groupBy: "week" | "month" | "year" | "agent") {
  if (groupBy === "agent") {
    return rows.sort((a, b) => a.label.localeCompare(b.label));
  }

  return rows.sort((a, b) => {
    const rankDiff = getPeriodRowSortRank(b.label, groupBy) - getPeriodRowSortRank(a.label, groupBy);
    if (rankDiff !== 0) return rankDiff;
    return b.label.localeCompare(a.label);
  });
}

function groupCases(cases: CaseItem[], groupBy: "week" | "month" | "year" | "agent"): PeriodRow[] {
  const map = new Map<string, CaseItem[]>();
  cases.forEach((item) => {
    let key = "-";
    if (groupBy === "week") key = item.weekLabel || "-";
    if (groupBy === "month") key = item.monthLabel || "-";
    if (groupBy === "year") key = item.yearKey || "-";
    if (groupBy === "agent") key = item.agent || "-";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  });

  return [...map.entries()]
    .map(([label, grouped]) => {
      const summary = summarizeCases(grouped);
      return {
        label,
        caseCount: summary.caseCount,
        avgScore: summary.avgScore,
        revisedCount: summary.revisedCount,
        grade: summary.grade,
        incentive: summary.incentive,
      };
    })
    .sort((a, b) => {
      const rankDiff = getPeriodRowSortRank(b.label, groupBy) - getPeriodRowSortRank(a.label, groupBy);
      if (rankDiff !== 0) return rankDiff;
      return groupBy === "agent" ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label);
    });
}

function buildAgentRowsWithMaster(
  agentNames: string[],
  cases: CaseItem[],
  fallbackMonthKey: string
): PeriodRow[] {
  return agentNames
    .map((agentName) => {
      const grouped = cases.filter((item) => isSameAgent(item.agent, agentName));

      if (!grouped.length) {
        return {
          label: agentName,
          caseCount: 0,
          avgScore: 0,
          revisedCount: 0,
          grade: scoreToGrade(0, fallbackMonthKey),
          incentive: 0,
        };
      }

      const summary = summarizeCases(grouped);
      return {
        label: agentName,
        caseCount: summary.caseCount,
        avgScore: summary.avgScore,
        revisedCount: summary.revisedCount,
        grade: summary.grade,
        incentive: summary.incentive,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

function getLatestMonthKey(cases: CaseItem[]) {
  const keys = [...new Set(cases.map((item) => item.monthKey).filter(Boolean))].sort();
  return keys[keys.length - 1] || "unknown";
}

function shiftMonthKey(monthKey: string, monthOffset: number) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + monthOffset, 1);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

function buildRecentMonthKeys(baseMonthKey: string, count = 3) {
  if (!String(baseMonthKey || "").match(/^\d{4}-\d{2}$/)) return [];
  return Array.from({ length: count }, (_, index) => shiftMonthKey(baseMonthKey, index - (count - 1)));
}

function getMonthLabelForKey(monthKey: string, cases: CaseItem[]) {
  const fromCase = cases.find((item) => item.monthKey === monthKey)?.monthLabel;
  if (fromCase) return fromCase;
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey || "-";
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function SongkranBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-cyan-200/15 via-fuchsia-200/10 to-sky-200/15" />
      <div className="absolute left-[-40px] top-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="absolute right-0 top-12 h-36 w-36 rounded-full bg-fuchsia-300/20 blur-3xl" />
      <div className="absolute left-1/3 bottom-0 h-40 w-40 rounded-full bg-sky-300/15 blur-3xl" />
      <div className="absolute right-1/4 bottom-4 h-28 w-28 rounded-full bg-violet-300/15 blur-3xl" />
      <div className="absolute left-[10%] top-[20%] h-3 w-3 rounded-full bg-white/80" />
      <div className="absolute left-[18%] top-[12%] h-4 w-4 rounded-full bg-cyan-300/60" />
      <div className="absolute right-[12%] top-[18%] h-3 w-3 rounded-full bg-pink-300/50" />
      <div className="absolute left-5 bottom-4 hidden rounded-[24px] border border-white/20 bg-white/10 px-3 py-2 text-2xl backdrop-blur md:flex">🔫💦</div>
      <div className="absolute right-5 top-4 hidden rounded-[24px] border border-white/20 bg-white/10 px-3 py-2 text-2xl backdrop-blur md:flex">🪣🌸</div>
    </div>
  );
}

function SongkranFlowerCorner({ className = "" }: { className?: string }) {
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

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[30px] border border-violet-200/80 bg-white/95 shadow-[0_10px_35px_rgba(76,29,149,0.10)] backdrop-blur-sm ${className}`}>
      {isSongkranThemeActive() ? <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-70" /> : null}
      {children}
    </div>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const songkranTheme = isSongkranThemeActive();
  return (
    <div className={`border-b px-5 py-4 ${songkranTheme ? "border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-fuchsia-50" : "border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50"}`}>
      <div className="text-[17px] font-bold tracking-tight text-slate-900">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function PanelBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-5 lg:p-6 ${className}`}>{children}</div>;
}

function MetricCard({ title, value, sub, accent = "from-white via-violet-50/40 to-fuchsia-50/60 border-violet-200/70", valueClassName = "text-slate-900" }: { title: string; value: string; sub: string; accent?: string; valueClassName?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[28px] border bg-gradient-to-br ${accent} shadow-[0_10px_30px_rgba(91,33,182,0.08)]`}>
      <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
      <div className="p-5 lg:p-6">
        <div className="text-[13px] font-semibold tracking-wide text-slate-500">{title}</div>
        <div className={`mt-3 text-4xl font-extrabold tracking-tight lg:text-[42px] ${valueClassName}`}>{value}</div>
        <div className="mt-3 text-xs leading-5 text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function LogoHeaderBox() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/20 bg-white/12 shadow-[0_12px_34px_rgba(0,0,0,0.18)] backdrop-blur-md lg:h-28 lg:w-28">
      <img src="/robinhood-logo.png" alt="Robinhood Logo" className="relative z-10 h-16 w-16 object-contain lg:h-20 lg:w-20" />
    </div>
  );
}

function ViewButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  const songkranTheme = isSongkranThemeActive();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${active ? (songkranTheme ? "border border-cyan-300 bg-gradient-to-r from-cyan-100 via-sky-100 to-fuchsia-100 text-cyan-800" : "border border-violet-300 bg-violet-100 text-violet-800") : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      {label}
    </button>
  );
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">{children}</div>;
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-violet-400">
      {options.map((option) => (
        <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function SummaryTable({
  rows,
  firstColLabel,
  showIncentive = false,
}: {
  rows: PeriodRow[];
  firstColLabel: string;
  showIncentive?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className={`${showIncentive ? "min-w-[880px]" : "min-w-[760px]"} w-full text-sm`}>
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-4 py-3 text-left">{firstColLabel}</th>
            <th className="px-4 py-3 text-center">Cases</th>
            <th className="px-4 py-3 text-center">Average Score</th>
            <th className="px-4 py-3 text-center">Grade</th>
            <th className="px-4 py-3 text-center">Revised</th>
            {showIncentive ? <th className="px-4 py-3 text-center">Incentive</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={row.label} className="bg-white">
              <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">{row.label}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{row.caseCount}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{row.avgScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(row.grade)}`}>{row.grade}</span></td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{row.revisedCount}</td>
              {showIncentive ? <td className="border-t border-slate-200 px-4 py-3 text-center">{formatCurrencyTHB(row.incentive)}</td> : null}
            </tr>
          )) : (
            <tr><td colSpan={showIncentive ? 6 : 5} className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No data found</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AgentMonthlyAnalyticsTable({
  rows,
  firstColLabel,
}: {
  rows: PeriodRow[];
  firstColLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-violet-50/40 to-sky-50/40">
      <div className="grid gap-3 p-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-500">Visible Rows</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{rows.length}</div>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-500">Total Cases</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{rows.reduce((sum, row) => sum + row.caseCount, 0)}</div>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-500">Zero Case Rows</div>
          <div className="mt-2 text-2xl font-black text-slate-950">{rows.filter((row) => row.caseCount === 0).length}</div>
        </div>
      </div>
      <div className="overflow-x-auto border-t border-violet-100 bg-white">
        <table className="min-w-[780px] w-full text-sm">
          <thead>
            <tr className="bg-slate-950 text-[11px] uppercase tracking-[0.16em] text-white">
              <th className="px-4 py-3 text-left">{firstColLabel}</th>
              <th className="px-4 py-3 text-center">Cases</th>
              <th className="px-4 py-3 text-center">Average</th>
              <th className="px-4 py-3 text-center">Grade</th>
              <th className="px-4 py-3 text-left">Progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => {
                const completion = Math.min(100, Math.round((row.caseCount / CASE_TARGET) * 100));
                return (
                  <tr key={`${firstColLabel}-${row.label}`} className={row.caseCount ? "bg-white" : "bg-rose-50/35"}>
                    <td className="border-t border-slate-100 px-4 py-3 font-bold text-slate-950">{row.label}</td>
                    <td className="border-t border-slate-100 px-4 py-3 text-center font-semibold">{row.caseCount}</td>
                    <td className="border-t border-slate-100 px-4 py-3 text-center font-semibold">{row.avgScore.toFixed(2)}</td>
                    <td className="border-t border-slate-100 px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${getGradeTone(row.grade)}`}>{row.grade}</span>
                    </td>
                    <td className="border-t border-slate-100 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-500" style={{ width: `${completion}%` }} />
                        </div>
                        <div className="w-14 text-right text-xs font-bold text-slate-500">{row.caseCount}/{CASE_TARGET}</div>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-500">
                  No monthly analytics data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopicTable({ topics }: { topics: TopicSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[860px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-3 py-3 text-center">Topic</th>
            <th className="px-3 py-3 text-left">Description</th>
            <th className="px-3 py-3 text-center">Avg Score</th>
            <th className="px-3 py-3 text-center">Max</th>
            <th className="px-3 py-3 text-center">Avg %</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((topic) => (
            <tr key={topic.code} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 text-center">{topic.code}</td>
              <td className="border-t border-slate-200 px-3 py-3">{topic.label}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{topic.avgScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{topic.max}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{topic.pct.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getViewLabel(viewMode: SummaryView) {
  switch (viewMode) {
    case "weekly-dashboard":
      return "Weekly Dashboard";
    case "weekly-qa-by-agent":
      return "Weekly QA by Agent";
    case "monthly-dashboard":
      return "Monthly Dashboard";
    case "monthly-team-summary":
      return "Monthly Team Summary";
    case "yearly-team-summary":
      return "Yearly Team Summary";
    case "yearly-by-agent":
      return "Yearly by Agent";
    default:
      return "Summary";
  }
}

export default function SummaryMockup({
  currentUser,
  externalSelectedAgent,
  externalSelectedMonth,
  externalSelectedWeek,
  roleScopedAgentNames,
  dataRefreshKey,
  onSelectedAgentChange,
  onSelectedMonthChange,
  onSelectedWeekChange,
}: {
  currentUser: any;
  externalSelectedAgent?: string;
  externalSelectedMonth?: string;
  externalSelectedWeek?: string;
  roleScopedAgentNames?: string[];
  dataRefreshKey?: number;
  onSelectedAgentChange?: (agent: string) => void;
  onSelectedMonthChange?: (month: string) => void;
  onSelectedWeekChange?: (week: string) => void;
}) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [appealMergeCount, setAppealMergeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [viewMode, setViewMode] = useState<SummaryView>("weekly-dashboard");
  const [selectedAgent, setSelectedAgent] = useState<string>(externalSelectedAgent || "all");
  const [selectedMonth, setSelectedMonth] = useState<string>(externalSelectedMonth || "all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>(externalSelectedWeek || "all");
  const [reportPdfDialogOpen, setReportPdfDialogOpen] = useState(false);
  const [reportPdfView, setReportPdfView] = useState<SummaryView>("weekly-dashboard");

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);
  const roleScopedAgentList = useMemo(
    () => getUniqueNormalizedAgents((roleScopedAgentNames || []).map((name) => toTitleCaseName(String(name || "").trim())).filter(Boolean)),
    [roleScopedAgentNames]
  );

  useEffect(() => {
    if (
      typeof externalSelectedAgent === "string" &&
      externalSelectedAgent !== selectedAgent &&
      !roleScopedAgentList.length
    ) {
      setSelectedAgent(externalSelectedAgent);
    }
  }, [externalSelectedAgent, selectedAgent, roleScopedAgentList.length]);

  useEffect(() => {
    if (typeof externalSelectedMonth === "string" && externalSelectedMonth !== selectedMonth) {
      setSelectedMonth(externalSelectedMonth);
    }
  }, [externalSelectedMonth, selectedMonth]);

  useEffect(() => {
    if (typeof externalSelectedWeek === "string" && externalSelectedWeek !== selectedWeek) {
      setSelectedWeek(externalSelectedWeek);
    }
  }, [externalSelectedWeek, selectedWeek]);

  useEffect(() => {
    const loadWorkbook = async () => {
      try {
        setIsLoading(true);
        setLoadError("");

        const v8Response = await fetchCachedStaticResponse(`/${V8_EFFECTIVE_FILE_NAME}`);
        if (v8Response.ok) {
          const v8Buffer = await v8Response.arrayBuffer();
          const v8Workbook = XLSX.read(v8Buffer, { type: "array", cellDates: false });
          const v8Sheet = v8Workbook.Sheets["Effective_Data"] || v8Workbook.Sheets[v8Workbook.SheetNames[0]];
          const v8Rows = XLSX.utils.sheet_to_json<any[]>(v8Sheet, { header: 1, defval: null, raw: true });

          const v8HeaderIndex = v8Rows.findIndex((row: any[]) => {
            const normalized = (row || []).map((v: any) => normalizeText(v));
            return normalized.includes("agent name") && normalized.includes("case id") && normalized.includes("final score");
          });

          if (v8HeaderIndex >= 0) {
            const v8HeaderRow = (v8Rows[v8HeaderIndex] || []) as any[];
            const v8DataRows = v8Rows.slice(v8HeaderIndex + 1);
            const v8Helper = buildHeaderHelpers(v8HeaderRow);

            const mappedCases: CaseItem[] = v8DataRows
              .map((row, rowIndex) => {
                const caseId = String(v8Helper.getValue(row, "Case ID") || "").trim();
                if (!caseId) return null;

                const agent = toTitleCaseName(String(v8Helper.getValue(row, "Agent Name") || "").trim());
                if (!agent) return null;

                const auditRaw = getCaseDateRawValue(v8Helper, row);
                const auditDateObj = excelDateToJSDate(auditRaw);
                const monthDate = getReportingMonthDate(
                  v8Helper.getValue(row, "Month Start"),
                  v8Helper.getValue(row, "Month Label"),
                  auditDateObj
                );
                const monthKey = getMonthKey(monthDate);
                const topicMaster = getTopicMasterByMonth(monthKey);
                const topics: Topic[] = topicMaster.map((master) => {
                  const scoreRaw =
                    v8Helper.getValue(row, `${master.code} Revised Score`) ??
                    v8Helper.getValue(row, `${master.code} Score`) ??
                    v8Helper.getValue(row, master.code) ??
                    0;
                  const score = Number(scoreRaw || 0);
                  return {
                    code: master.code,
                    label: master.label,
                    score: Number.isFinite(score) ? score : 0,
                    max: master.max,
                    pct: Number((((Number.isFinite(score) ? score : 0) / master.max) * 100).toFixed(2)),
                  };
                });

                const finalScoreRaw = v8Helper.getLastValue(row, "Final Score");
                const previousScoreRaw = v8Helper.getValue(row, "Previous Score");
                const finalScore = finalScoreRaw !== null && finalScoreRaw !== "" && !Number.isNaN(Number(finalScoreRaw))
                  ? Number(finalScoreRaw)
                  : Number(topics.reduce((sum, topic) => sum + topic.score, 0).toFixed(2));
                const previousScore = previousScoreRaw !== null && previousScoreRaw !== "" && !Number.isNaN(Number(previousScoreRaw))
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
                  auditDate: formatAuditDate(auditRaw),
                  auditDateObj,
                  monthKey,
                  monthLabel: getReportingMonthLabel(v8Helper.getValue(row, "Month Label"), monthDate),
                  yearKey: getYearKey(auditDateObj),
                  weekLabel: String(v8Helper.getValue(row, "Week") || v8Helper.getValue(row, "Week Label") || "-").trim(),
                  caseId,
                  inquiryTh: String(v8Helper.getValue(row, "Inquiry") || v8Helper.getValue(row, "Customer Inquiry") || "-").trim(),
                  inquiryEn: String(v8Helper.getValue(row, "Inquiry") || v8Helper.getValue(row, "Customer Inquiry") || "-").trim(),
                  finalScore: Number(finalScore.toFixed(2)),
                  previousScore: Number(previousScore.toFixed(2)),
                  grade: scoreToGrade(finalScore, monthKey),
                  reviewStatus: isRevised ? "Revised" : "Original",
                  topics,
                  revisedTopics: null,
                  displayRevisedTopicCodes: [],
                } as CaseItem;
              })
              .filter(Boolean) as CaseItem[];

            setAllCases(mappedCases);
            setAppealMergeCount(
              mappedCases.filter((item) => item.reviewStatus === "Revised").length
            );
            setIsLoading(false);
            return;
          }
        }

        const rawResponses = await Promise.all(
          RAW_DATA_FILE_NAMES.map(async (fileName) => ({
            fileName,
            response: await fetchCachedStaticResponse(`/${fileName}`),
          }))
        );
        const appealResponse = await fetchCachedStaticResponse("/Appleal ROWDATA.xlsx");

        const availableRawResponses = rawResponses.filter((item) => item.response.ok);
        if (!availableRawResponses.length) {
          throw new Error(`ไม่พบไฟล์ RawData ในโฟลเดอร์ public: ${RAW_DATA_FILE_NAMES.join(", ")}`);
        }
        if (!appealResponse.ok) throw new Error("ไม่พบไฟล์ Appleal ROWDATA.xlsx ในโฟลเดอร์ public");

        const rawSources = await Promise.all(
          availableRawResponses.map(async ({ fileName, response }) => {
            const rawBuffer = await response.arrayBuffer();
            const rawWorkbook = XLSX.read(rawBuffer, { type: "array", cellDates: false });
            const rawSheet = rawWorkbook.Sheets["Raw_Data"] || rawWorkbook.Sheets[rawWorkbook.SheetNames[0]];
            const rawRows = XLSX.utils.sheet_to_json<any[]>(rawSheet, { header: 1, defval: null, raw: true });

            const rawHeaderIndex = rawRows.findIndex((row: any[]) => {
              const normalized = (row || []).map((v: any) => normalizeText(v));
              return normalized.includes("agent name") && normalized.includes("case id");
            });
            if (rawHeaderIndex === -1) throw new Error(`ไม่พบแถว Header ในไฟล์ ${fileName}`);

            const rawHeaderRow = (rawRows[rawHeaderIndex] || []) as any[];
            return {
              fileName,
              rawDataRows: rawRows.slice(rawHeaderIndex + 1),
              rawHelper: buildHeaderHelpers(rawHeaderRow),
            };
          })
        );

        const rawDataEntries = rawSources.flatMap((source) =>
          source.rawDataRows.map((row, rowIndex) => ({ row, rowIndex, source }))
        );
        const rawCaseMonthKeyMap = new Map<string, string>();
        rawDataEntries.forEach(({ row, source }) => {
          const rawHelper = source.rawHelper;
          const caseId = String(rawHelper.getValue(row, "Case ID") || "").trim();
          if (!caseId) return;
          const auditRaw = getCaseDateRawValue(rawHelper, row);
          const auditDateObj = excelDateToJSDate(auditRaw);
          const monthDate = getReportingMonthDate(
            rawHelper.getValue(row, "Month Start"),
            rawHelper.getValue(row, "Month Label"),
            auditDateObj
          );
          rawCaseMonthKeyMap.set(caseId, getMonthKey(monthDate));
        });

        const appealBuffer = await appealResponse.arrayBuffer();
        const appealWorkbook = XLSX.read(appealBuffer, { type: "array", cellDates: false });
        const appealSheet = appealWorkbook.Sheets["Appeal_Data"] || appealWorkbook.Sheets[appealWorkbook.SheetNames[0]];
        const appealRows = XLSX.utils.sheet_to_json<any[]>(appealSheet, { header: 1, defval: null, raw: true });

        const appealHeaderIndex = appealRows.findIndex((row: any[]) => {
          const normalized = (row || []).map((v: any) => normalizeText(v));
          return normalized.includes("case id");
        });

        const appealMap = new Map<string, AppealMergeItem>();
        if (appealHeaderIndex >= 0) {
          const appealHeaderRow = (appealRows[appealHeaderIndex] || []) as any[];
          const appealDataRows = appealRows.slice(appealHeaderIndex + 1);
          const appealHelper = buildHeaderHelpers(appealHeaderRow);

          getLatestAppealRows(appealDataRows, appealHelper).forEach((row: any[]) => {
            const caseId = String(appealHelper.getValue(row, "Case ID") || "").trim();
            if (!caseId) return;

            const revisedTopics: Topic[] = [];
            const appealAuditRaw = getCaseDateRawValue(appealHelper, row);
            const topicMaster = getTopicMasterByMonth(
              rawCaseMonthKeyMap.get(caseId) || getMonthKey(excelDateToJSDate(appealAuditRaw))
            );
            topicMaster.forEach((master) => {
              const scoreRaw = appealHelper.getValue(row, `${master.code} Revised Score`) ?? appealHelper.getValue(row, `${master.code} score`) ?? appealHelper.getValue(row, master.code);
              if (scoreRaw === null || scoreRaw === "" || Number.isNaN(Number(scoreRaw))) return;
              const score = Number(scoreRaw);
              revisedTopics.push({ code: master.code, label: master.label, score, max: master.max, pct: Number(((score / master.max) * 100).toFixed(2)) });
            });

            const finalScoreRaw = appealHelper.getLastValue(row, "Final Score");
            const previousScoreRaw = appealHelper.getValue(row, "Previous Score");

            appealMap.set(caseId, {
              caseId,
              finalScore: finalScoreRaw !== null && finalScoreRaw !== "" && !Number.isNaN(Number(finalScoreRaw)) ? Number(finalScoreRaw) : undefined,
              previousScore: previousScoreRaw !== null && previousScoreRaw !== "" && !Number.isNaN(Number(previousScoreRaw)) ? Number(previousScoreRaw) : undefined,
              reviewStatus: revisedTopics.length ? "Revised" : "Original",
              revisedTopics,
              displayRevisedTopicCodes: revisedTopics.map((topic) => topic.code),
            });
          });
        }

        try {
          const reviewedLogs = await fetchUsageLogsByEventTypes([
            "appeal_request_submitted",
            "appeal_request_reviewed",
            "appeal_request_reset",
          ], 2000);
          buildApprovedAppealMergeMap(reviewedLogs, rawCaseMonthKeyMap).forEach((item, caseId) => {
            appealMap.set(caseId, item);
          });
        } catch (error) {
          console.warn("Approved appeal review merge skipped", error);
        }

        const mappedCases: CaseItem[] = rawDataEntries.map(({ row, rowIndex, source }) => {
          const rawHelper = source.rawHelper;
          const caseId = String(rawHelper.getValue(row, "Case ID") || "").trim();
          if (!caseId) return null as any;

          const auditRaw = getCaseDateRawValue(rawHelper, row);
          const auditDateObj = excelDateToJSDate(auditRaw);
          const monthDate = getReportingMonthDate(
            rawHelper.getValue(row, "Month Start"),
            rawHelper.getValue(row, "Month Label"),
            auditDateObj
          );
          const monthKey = getMonthKey(monthDate);
          const monthLabel = getReportingMonthLabel(rawHelper.getValue(row, "Month Label"), monthDate);
          const yearKey = getYearKey(auditDateObj);
          const weekLabel = String(rawHelper.getValue(row, "Week") || rawHelper.getValue(row, "Week Label") || "-").trim();
          const inquiry = String(rawHelper.getValue(row, "Inquiry") || rawHelper.getValue(row, "Customer Inquiry") || "-").trim();
          const agent = toTitleCaseName(String(rawHelper.getValue(row, "Agent Name") || "").trim());
          const mergedAppeal = appealMap.get(caseId);
          const topicMaster = getTopicMasterByMonth(monthKey);

          const topics: Topic[] = topicMaster.map((master) => {
            const scoreRaw =
              rawHelper.getValue(row, `${master.code} Score`) ?? rawHelper.getValue(row, master.code) ?? 0;
            const score =
              scoreRaw !== null && scoreRaw !== "" && !Number.isNaN(Number(scoreRaw))
                ? Number(scoreRaw)
                : 0;
            return {
              code: master.code,
              label: master.label,
              score,
              max: master.max,
              pct: Number(((score / master.max) * 100).toFixed(2)),
            };
          });

          const normalizedRevisedTopics =
            mergedAppeal?.revisedTopics?.length
              ? topicMaster
                  .map((master) => {
                    const matchedTopic = mergedAppeal.revisedTopics.find((topic) => topic.code === master.code);
                    if (!matchedTopic) return null;
                    return {
                      code: master.code,
                      label: master.label,
                      score: matchedTopic.score,
                      max: master.max,
                      pct: Number(((matchedTopic.score / master.max) * 100).toFixed(2)),
                    } as Topic;
                  })
                  .filter(Boolean) as Topic[]
              : null;

          const finalScoreRaw = rawHelper.getLastValue(row, "Final Score");
          const baseFinalScore =
            finalScoreRaw !== null && finalScoreRaw !== "" && !Number.isNaN(Number(finalScoreRaw))
              ? Number(finalScoreRaw)
              : Number(topics.reduce((sum, topic) => sum + topic.score, 0).toFixed(2));
          const finalScoreVal =
            mergedAppeal?.finalScore ??
            (normalizedRevisedTopics?.length ? calcMergedFinalScore(topics, normalizedRevisedTopics) : baseFinalScore);
          const previousScoreVal = mergedAppeal?.previousScore ?? baseFinalScore;
          const reviewStatus: ReviewStatus = normalizedRevisedTopics?.length ? "Revised" : "Original";

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
            auditDate: formatAuditDate(auditRaw),
            auditDateObj,
            monthKey,
            monthLabel,
            yearKey,
            weekLabel,
            caseId,
            inquiryTh: inquiry,
            inquiryEn: inquiry,
            finalScore: Number(finalScoreVal.toFixed(2)),
            previousScore: Number(previousScoreVal.toFixed(2)),
            grade: scoreToGrade(finalScoreVal, monthKey),
            reviewStatus,
            topics,
            revisedTopics: normalizedRevisedTopics?.length ? normalizedRevisedTopics : null,
            displayRevisedTopicCodes: normalizedRevisedTopics?.map((topic) => topic.code) || [],
          } as CaseItem;
        }).filter(Boolean) as CaseItem[];

        const storedEvaluations = await fetchStoredEvaluations(300);
        const evaluationCases: CaseItem[] = storedEvaluations
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
                pct: Number((((Number.isFinite(score) ? score : 0) / master.max) * 100).toFixed(2)),
                comment: matched?.comment || "",
              };
            });
            const finalScore = Number(record.finalScore || topics.reduce((sum, topic) => sum + topic.score, 0));
            const evaluationKey = record.evaluationKey || `web-eval|${record.caseId}|${record.agentName}|${record.auditDate}|${record.id}`;
            return {
              key: evaluationKey,
              evaluationKey,
              agent: toTitleCaseName(record.agentName || record.targetDisplayName || ""),
              auditDate: formatAuditDate(record.auditDate),
              auditDateObj: validAuditDate,
              monthKey,
              monthLabel: getMonthLabel(monthDate),
              yearKey: getYearKey(validAuditDate),
              weekLabel: getWeekLabelFromAuditDate(validAuditDate),
              caseId: record.caseId,
              inquiryTh: record.inquiry || "-",
              inquiryEn: record.inquiry || "-",
              finalScore: Number(finalScore.toFixed(2)),
              previousScore: Number(finalScore.toFixed(2)),
              grade: scoreToGrade(finalScore, monthKey),
              reviewStatus: "Original",
              topics,
              revisedTopics: null,
              displayRevisedTopicCodes: [],
            } as CaseItem;
          })
            .filter((item) => item.agent && item.caseId && item.auditDateObj);

        const latestByEvaluationKey = new Map<string, CaseItem>();
        const rawMonthKeys = new Set(mappedCases.map((item) => item.monthKey).filter(Boolean));
        const evaluationCasesForMerge = evaluationCases.filter((item) => !rawMonthKeys.has(item.monthKey));
        [...evaluationCasesForMerge, ...mappedCases].forEach((item) => {
          latestByEvaluationKey.set(buildCaseMergeKey(item), item);
        });
        setAllCases([...latestByEvaluationKey.values()]);
        setAppealMergeCount(appealMap.size);
      } catch (error: any) {
        setLoadError(error?.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, [dataRefreshKey]);

  const availableAgents = useMemo(() => {
    const names = getUniqueNormalizedAgents([...AGENT_MASTER, ...allCases.map((item) => item.agent)]).filter(
      (name) => (selectedMonth === "all" ? true : !shouldHideAgentByMonth(name, selectedMonth))
    );

    if (roleScopedAgentList.length) {
      return names.filter((name) => roleScopedAgentList.some((scopedAgent) => isSameAgent(name, scopedAgent)));
    }

    return names;
  }, [allCases, selectedMonth, roleScopedAgentList]);

  useEffect(() => {
    if (roleScopedAgentList.length) {
      const lockedAgent = roleScopedAgentList[0];
      if (lockedAgent && !isSameAgent(selectedAgent || "", lockedAgent)) {
        setSelectedAgent(lockedAgent);
      }
      onSelectedAgentChange?.(lockedAgent || "all");
      return;
    }

    if (roleScopedAgentList.length && selectedAgent !== "all" && !availableAgents.some((agent) => isSameAgent(agent, selectedAgent))) {
      setSelectedAgent("all");
      onSelectedAgentChange?.("all");
    }
  }, [selectedAgent, onSelectedAgentChange, roleScopedAgentList.length, availableAgents]);

  useEffect(() => {
    if (roleScopedAgentList.length && viewMode === "weekly-qa-by-agent") {
      setViewMode("weekly-dashboard");
    }
  }, [roleScopedAgentList.length, viewMode]);

  const monthOptions = useMemo(() => {
    const keys = [...new Set(allCases.map((item) => item.monthKey).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    return [{ value: "all", label: "All Months" }].concat(keys.map((key) => ({ value: key, label: allCases.find((item) => item.monthKey === key)?.monthLabel || key })));
  }, [allCases]);

  const weekOptions = useMemo(() => {
    const filtered = selectedMonth === "all" ? allCases : allCases.filter((item) => item.monthKey === selectedMonth);
    const labels = [...new Set(filtered.map((item) => item.weekLabel).filter(Boolean))]
      .sort((a, b) => getPeriodRowSortRank(b, "week") - getPeriodRowSortRank(a, "week"));
    return [{ value: "all", label: "All Weeks" }].concat(labels.map((label) => ({ value: label, label })));
  }, [allCases, selectedMonth]);

  const yearOptions = useMemo(() => {
    const keys = [...new Set(allCases.map((item) => item.yearKey).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    return [{ value: "all", label: "All Years" }].concat(keys.map((key) => ({ value: key, label: key })));
  }, [allCases]);

  const effectiveSelectedAgent =
    roleScopedAgentList.length
      ? roleScopedAgentList[0]
      : selectedAgent;

  const filteredCases = useMemo(() => {
    return allCases.filter((item) => {
      if (roleScopedAgentList.length && !roleScopedAgentList.some((agent) => isSameAgent(item.agent, agent))) return false;
      if (effectiveSelectedAgent !== "all" && !isSameAgent(item.agent, effectiveSelectedAgent)) return false;
      if (selectedMonth !== "all" && item.monthKey !== selectedMonth) return false;
      if (selectedWeek !== "all" && item.weekLabel !== selectedWeek) return false;
      if (selectedYear !== "all" && item.yearKey !== selectedYear) return false;
      return true;
    });
  }, [allCases, effectiveSelectedAgent, selectedMonth, selectedWeek, selectedYear, roleScopedAgentList]);

  const summaryCards = useMemo(() => summarizeCases(filteredCases), [filteredCases]);
  const topicSummary = useMemo(() => buildTopicSummary(filteredCases), [filteredCases]);

  const analyticsMonthKey = useMemo(() => {
    if (selectedMonth !== "all") return selectedMonth;
    return getLatestMonthKey(filteredCases.length ? filteredCases : allCases);
  }, [allCases, filteredCases, selectedMonth]);

  const agentMonthlyAnalyticsRows = useMemo(() => {
    if (!analyticsMonthKey || analyticsMonthKey === "unknown") return [];

    if (effectiveSelectedAgent !== "all") {
      return buildRecentMonthKeys(analyticsMonthKey, 3).reverse().map((monthKey) => {
        const scopedCases = allCases.filter((item) => {
          if (!isSameAgent(item.agent, effectiveSelectedAgent)) return false;
          if (roleScopedAgentList.length && !roleScopedAgentList.some((agent) => isSameAgent(item.agent, agent))) return false;
          return item.monthKey === monthKey;
        });

        if (!scopedCases.length) {
          return {
            label: getMonthLabelForKey(monthKey, allCases),
            caseCount: 0,
            avgScore: 0,
            revisedCount: 0,
            grade: scoreToGrade(0, monthKey),
            incentive: 0,
          };
        }

        const summary = summarizeCases(scopedCases);
        return {
          label: getMonthLabelForKey(monthKey, allCases),
          caseCount: summary.caseCount,
          avgScore: summary.avgScore,
          revisedCount: summary.revisedCount,
          grade: summary.grade,
          incentive: summary.incentive,
        };
      });
    }

    const monthlyCases = allCases.filter((item) => {
      if (roleScopedAgentList.length && !roleScopedAgentList.some((agent) => isSameAgent(item.agent, agent))) return false;
      return item.monthKey === analyticsMonthKey;
    });

    return buildAgentRowsWithMaster(availableAgents, monthlyCases, analyticsMonthKey);
  }, [allCases, analyticsMonthKey, availableAgents, effectiveSelectedAgent, roleScopedAgentList]);

  const agentMonthlyAnalyticsTitle =
    effectiveSelectedAgent === "all" ? "Agent Monthly Analytics" : `${effectiveSelectedAgent} Monthly Analytics`;
  const agentMonthlyAnalyticsSubtitle =
    effectiveSelectedAgent === "all"
      ? `Agent coverage for ${getMonthLabelForKey(analyticsMonthKey, allCases)}. Agents with no cases remain visible as 0 cases / Grade F where the month policy applies.`
      : `Last 3 months for ${effectiveSelectedAgent}. Months with no cases remain visible for tracking.`;
  const agentMonthlyAnalyticsFirstCol = effectiveSelectedAgent === "all" ? "Agent" : "Month";

  const summaryRows = useMemo(() => {
    switch (viewMode) {
      case "weekly-dashboard":
      case "weekly-qa-by-agent":
        return groupCases(filteredCases, "week");
      case "monthly-dashboard":
        return groupCases(filteredCases, "month");
      case "monthly-team-summary": {
        const fallbackMonthKey =
          selectedMonth !== "all"
            ? selectedMonth
            : getPolicyMonthKeyForCases(filteredCases);
        return buildAgentRowsWithMaster(availableAgents, filteredCases, fallbackMonthKey);
      }
      case "yearly-by-agent":
        return groupCases(filteredCases, "agent");
      case "yearly-team-summary":
        return groupCases(filteredCases, "year");
      default:
        return [];
    }
  }, [filteredCases, viewMode, availableAgents, selectedMonth]);

  const summaryTableShowIncentive = viewMode === "monthly-team-summary";

  const firstColLabel = useMemo(() => {
    switch (viewMode) {
      case "weekly-dashboard":
      case "weekly-qa-by-agent":
        return "Week";
      case "monthly-dashboard":
        return "Month";
      case "monthly-team-summary":
      case "yearly-by-agent":
        return "Agent";
      case "yearly-team-summary":
        return "Year";
      default:
        return "Group";
    }
  }, [viewMode]);


  const reportPdfOptions: { value: SummaryView; label: string }[] = useMemo(() => {
    const options: { value: SummaryView; label: string }[] = [
      { value: "weekly-dashboard", label: "Weekly Dashboard" },
      { value: "weekly-qa-by-agent", label: "Weekly QA by Agent" },
      { value: "monthly-dashboard", label: "Monthly Dashboard" },
      { value: "monthly-team-summary", label: "Monthly Team Summary" },
      { value: "yearly-team-summary", label: "Yearly Team Summary" },
      { value: "yearly-by-agent", label: "Yearly by Agent" },
    ];

    return roleScopedAgentList.length
      ? options.filter((item) => item.value !== "weekly-qa-by-agent")
      : options;
  }, [roleScopedAgentList.length]);

  const getSummaryRowsForReport = (targetView: SummaryView) => {
    switch (targetView) {
      case "weekly-dashboard":
      case "weekly-qa-by-agent":
        return {
          title: getViewLabel(targetView),
          firstColLabel: "Week",
          rows: groupCases(filteredCases, "week"),
        };
      case "monthly-dashboard":
        return {
          title: getViewLabel(targetView),
          firstColLabel: "Month",
          rows: groupCases(filteredCases, "month"),
        };
      case "monthly-team-summary": {
        const fallbackMonthKey =
          selectedMonth !== "all"
            ? selectedMonth
            : getPolicyMonthKeyForCases(filteredCases);

        return {
          title: getViewLabel(targetView),
          firstColLabel: "Agent",
          rows: buildAgentRowsWithMaster(availableAgents, filteredCases, fallbackMonthKey),
        };
      }
      case "yearly-team-summary":
        return {
          title: getViewLabel(targetView),
          firstColLabel: "Year",
          rows: groupCases(filteredCases, "year"),
        };
      case "yearly-by-agent":
        return {
          title: getViewLabel(targetView),
          firstColLabel: "Agent",
          rows: groupCases(filteredCases, "agent"),
        };
      default:
        return {
          title: "Summary Report",
          firstColLabel: "Group",
          rows: [],
        };
    }
  };

  function generateSummaryReportPdf() {
    const report = getSummaryRowsForReport(reportPdfView);
    const reportSummary = summarizeCases(filteredCases);

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const safe = (value: unknown) =>
      String(value ?? "-")
        .replace(/\s+/g, " ")
        .trim();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const footerSpace = 12;
    const tableWidth = pageWidth - margin * 2;
    const colWidths = [Math.max(66, tableWidth - 104), 22, 36, 20, 26];
    const columns = [report.firstColLabel, "Cases", "Average Score", "Grade", "Revised"];

    const monthLabel = monthOptions.find((item) => item.value === selectedMonth)?.label || "All Months";
    const agentLabel = effectiveSelectedAgent === "all" ? "All Agents" : effectiveSelectedAgent;
    const weekLabel = selectedWeek === "all" ? "All Weeks" : selectedWeek;
    const yearLabel = selectedYear === "all" ? "All Years" : selectedYear;
    const generatedByName = safe(
      currentUser?.name ||
        currentUser?.displayName ||
        currentUser?.username ||
        currentUser?.userName ||
        currentUser?.email ||
        "Unknown User"
    );

    const fitText = (value: unknown, width: number, maxLines = 1) => {
      const lines = doc.splitTextToSize(safe(value), width) as string[];
      if (lines.length <= maxLines) return lines;
      const visible = lines.slice(0, maxLines);
      const lastIndex = visible.length - 1;
      while (doc.getTextWidth(`${visible[lastIndex]}...`) > width && visible[lastIndex].length > 1) {
        visible[lastIndex] = visible[lastIndex].slice(0, -1).trim();
      }
      visible[lastIndex] = `${visible[lastIndex]}...`;
      return visible;
    };

    const drawHeader = () => {
      doc.setFillColor(49, 16, 101);
      doc.rect(margin, 10, tableWidth, 24, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text(report.title, margin + 6, 20);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Robinhood QA - Quality Monitoring Workspace", margin + 6, 28);
    };

    const ensurePageSpace = (neededHeight: number, includeTableHeader = false) => {
      if (y + neededHeight <= pageHeight - margin - footerSpace) return;
      doc.addPage();
      drawHeader();
      y = 44;
      if (includeTableHeader) drawTableHeader();
    };

    const drawInfoCell = (label: string, value: unknown, x: number, top: number, width: number, height = 16) => {
      doc.setDrawColor(221, 214, 254);
      doc.setFillColor(250, 248, 255);
      doc.roundedRect(x, top, width, height, 2.5, 2.5, "FD");
      doc.setTextColor(109, 40, 217);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.text(label, x + 3, top + 5);
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(8.2);
      fitText(value, width - 6, 2).forEach((line, index) => {
        doc.text(line, x + 3, top + 10 + index * 3.6);
      });
    };

    drawHeader();

    let y = 44;

    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Current Scope", margin, y);

    y += 7;

    const scopeGap = 4;
    const scopeCellWidth = (tableWidth - scopeGap) / 2;
    drawInfoCell("Agent", agentLabel, margin, y, scopeCellWidth);
    drawInfoCell("Month", monthLabel, margin + scopeCellWidth + scopeGap, y, scopeCellWidth);

    y += 19;
    drawInfoCell("Week", weekLabel, margin, y, scopeCellWidth);
    drawInfoCell("Year", yearLabel, margin + scopeCellWidth + scopeGap, y, scopeCellWidth);

    y += 21;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(71, 85, 105);
    doc.text("Generated by: " + generatedByName, margin, y);

    y += 9;

    doc.setFillColor(246, 242, 255);
    doc.setDrawColor(221, 214, 254);
    doc.roundedRect(margin, y, tableWidth, 24, 2.5, 2.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(49, 16, 101);
    const metricColWidth = tableWidth / 3;
    doc.text("Cases: " + reportSummary.caseCount, margin + 5, y + 8);
    doc.text("Average Score: " + reportSummary.avgScore.toFixed(2), margin + metricColWidth + 5, y + 8);
    doc.text("Grade: " + reportSummary.grade, margin + metricColWidth * 2 + 5, y + 8);
    doc.text("Revised: " + reportSummary.revisedCount, margin + 5, y + 18);
    doc.text("Generated at: " + new Date().toLocaleString("en-GB"), margin + metricColWidth + 5, y + 18);

    y += 33;

    const drawTableHeader = () => {
      doc.setFillColor(49, 16, 101);
      doc.setDrawColor(49, 16, 101);
      doc.rect(margin, y, tableWidth, 10, "FD");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);

      let x = margin;
      columns.forEach((column, index) => {
        const align = index === 0 ? "left" : "center";
        const textX = index === 0 ? x + 2 : x + colWidths[index] / 2;
        doc.text(column, textX, y + 6.5, { align });
        x += colWidths[index];
      });

      y += 10;
    };

    drawTableHeader();

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);

    if (!report.rows.length) {
      doc.setTextColor(100, 116, 139);
      doc.text("No data found", margin + 2, y + 7);
    }

    report.rows.forEach((row, index) => {
      const firstColumnLines = fitText(row.label, colWidths[0] - 4, 3);
      const rowHeight = Math.max(10, 5 + firstColumnLines.length * 4);
      ensurePageSpace(rowHeight, true);

      if (index % 2 === 0) {
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(248, 250, 252);
      }

      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, tableWidth, rowHeight, "FD");

      doc.setTextColor(15, 23, 42);

      const values = [
        firstColumnLines,
        String(row.caseCount),
        row.avgScore.toFixed(2),
        String(row.grade),
        String(row.revisedCount),
      ];

      let x = margin;
      values.forEach((value, colIndex) => {
        if (Array.isArray(value)) {
          value.forEach((line, lineIndex) => {
            doc.text(line, x + 2, y + 6 + lineIndex * 4);
          });
        } else {
          const text = fitText(value, colWidths[colIndex] - 4, 1)[0] || "";
          const align = colIndex === 0 ? "left" : "center";
          const textX = colIndex === 0 ? x + 2 : x + colWidths[colIndex] / 2;
          doc.text(text, textX, y + 6, { align });
        }
        x += colWidths[colIndex];
      });

      y += rowHeight;
    });

    const pageCount = doc.getNumberOfPages();
    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
      doc.setPage(pageIndex);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Page ${pageIndex} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
    }

    const fileName =
      (report.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "summary_report") +
      ".pdf";

    doc.save(fileName);
    setReportPdfDialogOpen(false);
  }


  if (isLoading) {
    return <LoadingMascot message="กำลังโหลดข้อมูลสรุป" subMessage="กรุณารอสักครู่..." />;
  }

  if (loadError) {
    return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff] p-6"><div className="max-w-xl rounded-3xl border border-rose-200 bg-white px-6 py-5 text-rose-700 shadow-sm"><div className="text-lg font-semibold">โหลดไฟล์ไม่สำเร็จ</div><div className="mt-2 text-sm">{loadError}</div></div></div>;
  }

  return (
    <div className={`relative min-h-screen ${songkranTheme ? "bg-gradient-to-br from-cyan-50 via-sky-50 to-fuchsia-50" : "bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff]"}`}>
      {reportPdfDialogOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-2xl">
            <div className="border-b border-violet-100 bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-5 py-4 text-white">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100">Export PDF</div>
              <div className="mt-1 text-xl font-extrabold">Choose Report PDF</div>
              <div className="mt-1 text-xs text-violet-100">Select report type before generating PDF</div>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-violet-700">Report Type</div>
                <select
                  value={reportPdfView}
                  onChange={(event) => setReportPdfView(event.target.value as SummaryView)}
                  className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                >
                  {reportPdfOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                PDF will be generated in A4 portrait format using the current filters. This does not affect Case Detail PDF.
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReportPdfDialogOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={generateSummaryReportPdf}
                  className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800"
                >
                  Generate PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {songkranTheme ? <SongkranBackdrop /> : null}
      <PageHero
        eyebrow="QA Summary"
        title="Weekly / Monthly / Yearly Summary Workspace"
        subtitle="รวมหน้าสรุป Weekly Dashboard, Weekly QA by Agent, Monthly Dashboard, Monthly Team Summary, Yearly Team Summary และ Yearly by Agent ในหน้าเดียว"
        workspaceTitle="Quality Monitoring Workspace"
        workspaceSubtitle="Corporate dashboard for audit tracking and case review"
      />
      {false ? (
      <div>
        <div className="mx-auto max-w-[1720px] px-6 py-8 lg:px-8 lg:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-4xl">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200">QA Summary</div>
              <div className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl">Weekly / Monthly / Yearly Summary Workspace</div>
              <div className="mt-3 max-w-3xl text-sm leading-6 text-violet-100/95">รวมหน้าสรุป Weekly Dashboard, Weekly QA by Agent, Monthly Dashboard, Monthly Team Summary, Yearly Team Summary และ Yearly by Agent ในหน้าเดียว</div>
            </div>
            <div className="flex items-center gap-4 rounded-[28px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <LogoHeaderBox />
              <div className="hidden sm:block">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200">Robinhood QA</div>
                <div className="mt-1 text-lg font-semibold text-white">Summary Performance Center</div>
                <div className="mt-1 text-sm text-violet-100/90">Weekly / Monthly / Yearly team and agent summary</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : null}

      <div className="mx-auto max-w-[1720px] px-6 py-6 lg:px-8 lg:py-8">
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel className="sticky top-4">
              <PanelHeader title="Summary Controls" subtitle="Select summary type and filter scope" />
              <PanelBody className="space-y-5">
                <div className="space-y-2">
                  <ViewButton active={viewMode === "weekly-dashboard"} label="Weekly Dashboard" onClick={() => setViewMode("weekly-dashboard")} />
                  {!roleScopedAgentList.length ? (
                    <ViewButton active={viewMode === "weekly-qa-by-agent"} label="Weekly QA by Agent" onClick={() => setViewMode("weekly-qa-by-agent")} />
                  ) : null}
                  <ViewButton active={viewMode === "monthly-dashboard"} label="Monthly Dashboard" onClick={() => setViewMode("monthly-dashboard")} />
                  <ViewButton active={viewMode === "monthly-team-summary"} label="Monthly Team Summary" onClick={() => setViewMode("monthly-team-summary")} />
                  <ViewButton active={viewMode === "yearly-team-summary"} label="Yearly Team Summary" onClick={() => setViewMode("yearly-team-summary")} />
                  <ViewButton active={viewMode === "yearly-by-agent"} label="Yearly by Agent" onClick={() => setViewMode("yearly-by-agent")} />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReportPdfView(viewMode);
                    setReportPdfDialogOpen(true);
                  }}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-violet-300 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(109,40,217,0.18)] transition hover:from-violet-800 hover:to-fuchsia-700"
                >
                  Export Report PDF
                </button>

                <div className="space-y-4">
                  <div>
                    <FilterLabel>Agent</FilterLabel>
                    <div className="mt-2">
                      {roleScopedAgentList.length ? (
                        <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3 text-sm font-semibold text-violet-800">
                          {effectiveSelectedAgent || "-"}
                        </div>
                      ) : (
                        <FilterSelect
                          value={effectiveSelectedAgent || "all"}
                          onChange={(value) => {
                            setSelectedAgent(value);
                            onSelectedAgentChange?.(value);
                          }}
                          options={[{ value: "all", label: "All Agents" }].concat(availableAgents.map((agent) => ({ value: agent, label: agent })))}
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <FilterLabel>Month</FilterLabel>
                    <div className="mt-2"><FilterSelect value={selectedMonth} onChange={(value) => { setSelectedMonth(value); onSelectedMonthChange?.(value); setSelectedWeek("all"); }} options={monthOptions} /></div>
                  </div>
                  <div>
                    <FilterLabel>Week</FilterLabel>
                    <div className="mt-2"><FilterSelect value={selectedWeek} onChange={(value) => { setSelectedWeek(value); onSelectedWeekChange?.(value); }} options={weekOptions} /></div>
                  </div>
                  <div>
                    <FilterLabel>Year</FilterLabel>
                    <div className="mt-2"><FilterSelect value={selectedYear} onChange={setSelectedYear} options={yearOptions} /></div>
                  </div>
                </div>
              </PanelBody>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel>
              <PanelHeader title="Current Viewing Scope" subtitle="Selected tab and current data scope" />
              <PanelBody>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4"><div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">View</div><div className="mt-2 text-sm font-bold text-slate-900">{getViewLabel(viewMode)}</div></div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4"><div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Agent</div><div className="mt-2 text-sm font-bold text-slate-900">{effectiveSelectedAgent || "All Agents"}</div></div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4"><div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Month</div><div className="mt-2 text-sm font-bold text-slate-900">{monthOptions.find((item) => item.value === selectedMonth)?.label || "All Months"}</div></div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4"><div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Week</div><div className="mt-2 text-sm font-bold text-slate-900">{selectedWeek === "all" ? "All Weeks" : selectedWeek}</div></div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4"><div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Merge Rows</div><div className="mt-2 text-sm font-bold text-slate-900">{appealMergeCount}</div></div>
                </div>
              </PanelBody>
            </Panel>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard title="Cases" value={`${summaryCards.caseCount}`} sub="Case(s) in current view" />
              <MetricCard title="Average Score" value={summaryCards.avgScore.toFixed(2)} sub="Average final score in current view" valueClassName="text-violet-700" />
              <MetricCard title="Grade" value={summaryCards.grade} sub="Calculated from current average score" valueClassName="text-sky-700" accent="from-white via-sky-50/50 to-indigo-100/60 border-sky-200" />
            </div>

            <Panel>
              <PanelHeader title="Summary Table" subtitle="Summary result based on current tab and filters" />
              <PanelBody><SummaryTable rows={summaryRows} firstColLabel={firstColLabel} showIncentive={summaryTableShowIncentive} /></PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title={agentMonthlyAnalyticsTitle} subtitle={agentMonthlyAnalyticsSubtitle} />
              <PanelBody>
                <AgentMonthlyAnalyticsTable
                  rows={agentMonthlyAnalyticsRows}
                  firstColLabel={agentMonthlyAnalyticsFirstCol}
                />
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Topic Performance" subtitle="Average topic score in current view" />
              <PanelBody><TopicTable topics={topicSummary} /></PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}



