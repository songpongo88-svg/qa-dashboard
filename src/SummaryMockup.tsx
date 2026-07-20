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
import { fetchStoredUserProfiles, type StoredUserProfile } from "./userRoleStore";

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

function getTopicPolicyGroup(monthKey: string) {
  if (monthKey === "2026-01" || monthKey === "2026-02") return { key: "jan-feb-2026", label: "January–February 2026", order: 1 };
  if (monthKey === "2026-03") return { key: "march-2026", label: "March 2026", order: 2 };
  if (monthKey === "2026-04" || monthKey === "2026-05") return { key: "apr-may-2026", label: "April–May 2026", order: 3 };
  if (monthKey !== "unknown" && monthKey >= "2026-06") return { key: "june-current", label: "June 2026–Current", order: 4 };
  return { key: "other", label: "Other Periods", order: 9 };
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

type SummaryAccount = StoredUserProfile & Record<string, any>;

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

function buildAccountMatchValues(account: SummaryAccount) {
  const email = String(account.email || account.registeredEmail || account.registered_email || "").trim();
  const emailLocalPart = email.includes("@") ? email.split("@")[0] : "";
  return [
    account.displayName,
    account.agentName,
    account.username,
    email,
    emailLocalPart,
    account.registeredEmail,
    account.registered_email,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function getAccountStatus(agentName: string, accounts: SummaryAccount[]) {
  return accounts.find((account) => buildAccountMatchValues(account).some((value) => isSameAgent(value, agentName)));
}

function parseSummaryDateOnly(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = String(value || "").trim();
  if (!text) return null;

  const isoMatch = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const slashMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    return new Date(Number(slashMatch[3]), Number(slashMatch[2]) - 1, Number(slashMatch[1]));
  }

  return null;
}

function formatSummaryDateOnly(date: Date | null) {
  if (!date) return "";
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function getSuspendedDate(account?: SummaryAccount | null) {
  if (!account) return null;
  const directFields = [
    account.suspendEffectiveDate,
    account.suspend_effective_date,
    account.suspendedAt,
    account.suspended_at,
    account.suspendDate,
    account.suspend_date,
    account.terminatedAt,
    account.terminated_at,
    account.terminateDate,
    account.terminate_date,
  ];
  for (const fieldValue of directFields) {
    const parsed = parseSummaryDateOnly(fieldValue);
    if (parsed) return parsed;
  }

  return parseSummaryDateOnly(
    `${account.suspendReason || ""} ${account.statusReason || ""} ${account.reason || ""} ${account.note || ""}`
  );
}

function isSuspendedDateEffective(suspendedDate: Date | null) {
  if (!suspendedDate) return false;
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return suspendedDate.getTime() <= todayOnly.getTime();
}

function isSuspendedAgent(agentName: string, accounts: SummaryAccount[]) {
  const account = getAccountStatus(agentName, accounts);
  return (
    account?.status === "Suspended" ||
    normalizeText(account?.accountStatus || account?.status).includes("suspend") ||
    isSuspendedDateEffective(getSuspendedDate(account))
  );
}

function hasCasesInCurrentScope(agentName: string, cases: CaseItem[]) {
  return cases.some((item) => isSameAgent(item.agent, agentName));
}

function isCaseBeforeOrOnSuspendedDate(caseDate: Date | null, suspendedDate: Date | null) {
  if (!caseDate || !suspendedDate) return true;
  const caseOnly = new Date(caseDate.getFullYear(), caseDate.getMonth(), caseDate.getDate());
  return caseOnly.getTime() <= suspendedDate.getTime();
}

function buildSuspendedAgentLabel(agentName: string, accounts: SummaryAccount[]) {
  return agentName;
}

function shouldShowAgentInSummaryScope(agentName: string, cases: CaseItem[], accounts: SummaryAccount[]) {
  if (!isSuspendedAgent(agentName, accounts)) return true;
  return hasCasesInCurrentScope(agentName, cases);
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
  fallbackMonthKey: string,
  accounts: SummaryAccount[] = []
): PeriodRow[] {
  return agentNames
    .filter((agentName) => shouldShowAgentInSummaryScope(agentName, cases, accounts))
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
        label: buildSuspendedAgentLabel(agentName, accounts),
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
  const [accountProfiles, setAccountProfiles] = useState<SummaryAccount[]>([]);
  const [viewMode, setViewMode] = useState<SummaryView>("weekly-dashboard");
  const [selectedAgent, setSelectedAgent] = useState<string>(externalSelectedAgent || "all");
  const [selectedMonth, setSelectedMonth] = useState<string>(externalSelectedMonth || "all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>(externalSelectedWeek || "all");
  const [reportPdfDialogOpen, setReportPdfDialogOpen] = useState(false);
  const [reportPdfView, setReportPdfView] = useState<SummaryView>("weekly-dashboard");
  const [analysisMode, setAnalysisMode] = useState<"weekly" | "monthly" | "yearly">("weekly");
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [periodFilterYear, setPeriodFilterYear] = useState<string>("all");
  const [periodFilterMonth, setPeriodFilterMonth] = useState<string>("all");

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);
  const roleScopedAgentList = useMemo(
    () => getUniqueNormalizedAgents((roleScopedAgentNames || []).map((name) => toTitleCaseName(String(name || "").trim())).filter(Boolean)),
    [roleScopedAgentNames]
  );

  useEffect(() => {
    let alive = true;
    fetchStoredUserProfiles()
      .then((profiles) => {
        if (alive) setAccountProfiles(profiles as SummaryAccount[]);
      })
      .catch((error) => {
        console.warn("[Summary] Unable to load user directory for suspended-agent labels.", error);
        if (alive) setAccountProfiles([]);
      });
    return () => {
      alive = false;
    };
  }, []);

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

  const casesInCurrentScopeForAgentOptions = useMemo(() => {
    return allCases.filter((item) => {
      if (roleScopedAgentList.length && !roleScopedAgentList.some((agent) => isSameAgent(item.agent, agent))) return false;
      if (selectedMonth !== "all" && item.monthKey !== selectedMonth) return false;
      if (selectedWeek !== "all" && item.weekLabel !== selectedWeek) return false;
      if (selectedYear !== "all" && item.yearKey !== selectedYear) return false;
      return true;
    });
  }, [allCases, selectedMonth, selectedWeek, selectedYear, roleScopedAgentList]);

  const availableAgents = useMemo(() => {
    const names = getUniqueNormalizedAgents([...AGENT_MASTER, ...allCases.map((item) => item.agent)]).filter((name) =>
      shouldShowAgentInSummaryScope(name, casesInCurrentScopeForAgentOptions, accountProfiles)
    );

    if (roleScopedAgentList.length) {
      return names.filter((name) => roleScopedAgentList.some((scopedAgent) => isSameAgent(name, scopedAgent)));
    }

    return names;
  }, [allCases, accountProfiles, casesInCurrentScopeForAgentOptions, roleScopedAgentList]);

  useEffect(() => {
    if (roleScopedAgentList.length) {
      const lockedAgent = roleScopedAgentList[0];
      if (lockedAgent && !isSameAgent(selectedAgent || "", lockedAgent)) {
        setSelectedAgent(lockedAgent);
      }
      onSelectedAgentChange?.(lockedAgent || "all");
      return;
    }

    if (!roleScopedAgentList.length && selectedAgent !== "all" && !availableAgents.some((agent) => isSameAgent(agent, selectedAgent))) {
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

  const selectableYears = useMemo(
    () => [...new Set(allCases.map((item) => item.yearKey).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [allCases]
  );

  const effectivePeriodYear =
    periodFilterYear !== "all"
      ? periodFilterYear
      : selectableYears[0] || "all";

  const weekMonthOptions = useMemo(() => {
    const keys = [...new Set(
      allCases
        .filter((item) => effectivePeriodYear === "all" || item.yearKey === effectivePeriodYear)
        .map((item) => item.monthKey)
        .filter(Boolean)
    )].sort((a, b) => b.localeCompare(a));

    return [{ value: "all", label: "All Months" }].concat(
      keys.map((key) => ({
        value: key,
        label: allCases.find((item) => item.monthKey === key)?.monthLabel || key,
      }))
    );
  }, [allCases, effectivePeriodYear]);

  const periodOptions = useMemo(() => {
    if (analysisMode === "weekly") {
      return [...new Set(
        allCases
          .filter((item) => effectivePeriodYear === "all" || item.yearKey === effectivePeriodYear)
          .filter((item) => periodFilterMonth === "all" || item.monthKey === periodFilterMonth)
          .map((item) => item.weekLabel)
          .filter((value) => value && value !== "-")
      )].sort((a, b) => getPeriodRowSortRank(b, "week") - getPeriodRowSortRank(a, "week"));
    }

    if (analysisMode === "monthly") {
      return [...new Set(
        allCases
          .filter((item) => effectivePeriodYear === "all" || item.yearKey === effectivePeriodYear)
          .map((item) => item.monthKey)
          .filter(Boolean)
      )].sort((a, b) => b.localeCompare(a));
    }

    return selectableYears;
  }, [allCases, analysisMode, effectivePeriodYear, periodFilterMonth, selectableYears]);

  const maxSelectedPeriods =
    analysisMode === "monthly" ? 6 : 4;

  const sortPeriodKeys = (values: string[]) =>
    [...values].sort((a, b) => {
      if (analysisMode === "weekly") {
        return getPeriodRowSortRank(a, "week") - getPeriodRowSortRank(b, "week");
      }
      if (analysisMode === "monthly") return a.localeCompare(b);
      return Number(a) - Number(b);
    });

  const effectivePeriodKeys = useMemo(() => {
    const valid = selectedPeriods.filter((period) =>
      periodOptions.includes(period)
    );

    if (valid.length) {
      return sortPeriodKeys(valid);
    }

    const now = new Date();

    if (analysisMode === "monthly") {
      const currentMonthKey =
        `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;

      const defaultMonth =
        periodOptions.includes(currentMonthKey)
          ? currentMonthKey
          : periodOptions[0];

      return defaultMonth
        ? [defaultMonth]
        : [];
    }

    if (analysisMode === "weekly") {
      const currentWeek =
        getWeekLabelFromAuditDate(now);

      const defaultWeek =
        periodOptions.includes(currentWeek)
          ? currentWeek
          : periodOptions[0];

      return defaultWeek
        ? [defaultWeek]
        : [];
    }

    const currentYear =
      String(now.getFullYear());

    const defaultYear =
      periodOptions.includes(currentYear)
        ? currentYear
        : periodOptions[0];

    return defaultYear
      ? [defaultYear]
      : [];
  }, [
    selectedPeriods,
    periodOptions,
    analysisMode,
  ]);

  const getPeriodDisplayLabel = (value: string) => {
    if (analysisMode === "monthly") {
      return allCases.find((item) => item.monthKey === value)?.monthLabel || value;
    }
    return value;
  };

  const effectivePeriodLabels = effectivePeriodKeys.map(getPeriodDisplayLabel);

  useEffect(() => {
    setSelectedPeriods([]);
    setPeriodFilterMonth("all");

    if (!roleScopedAgentList.length) {
      setSelectedAgent("all");
      onSelectedAgentChange?.("all");
    }

    setViewMode(
      analysisMode === "weekly"
        ? "weekly-dashboard"
        : analysisMode === "monthly"
          ? "monthly-dashboard"
          : "yearly-team-summary"
    );
  }, [analysisMode]);

  const effectiveSelectedAgent =
    roleScopedAgentList.length
      ? roleScopedAgentList[0]
      : selectedAgent;

  const periodScopedCases = useMemo(() => {
    return allCases.filter((item) => {
      if (
        roleScopedAgentList.length &&
        !roleScopedAgentList.some((agent) => isSameAgent(item.agent, agent))
      ) {
        return false;
      }

      if (effectivePeriodKeys.length) {
        if (
          analysisMode === "weekly" &&
          !effectivePeriodKeys.includes(item.weekLabel)
        ) return false;

        if (
          analysisMode === "monthly" &&
          !effectivePeriodKeys.includes(item.monthKey)
        ) return false;

        if (
          analysisMode === "yearly" &&
          !effectivePeriodKeys.includes(item.yearKey)
        ) return false;
      }

      return true;
    });
  }, [allCases, effectivePeriodKeys, analysisMode, roleScopedAgentList]);

  const selectableAgentOptions = useMemo(() => {
    const scopedAgentNames = getUniqueNormalizedAgents(
      periodScopedCases.map((item) => item.agent)
    );

    const agentUniverse = getUniqueNormalizedAgents([
      ...AGENT_MASTER,
      ...availableAgents,
      ...allCases.map((item) => item.agent),
    ]);

    return agentUniverse.filter((agent) => {
      const hasCasesInSelectedScope = scopedAgentNames.some((name) =>
        isSameAgent(name, agent)
      );

      const isLegacyResigned = Object.keys(
        RESIGNED_AGENT_HIDE_AFTER
      ).some((name) => isSameAgent(name, agent));

      const isInactive =
        isLegacyResigned ||
        isSuspendedAgent(agent, accountProfiles);

      return isInactive ? hasCasesInSelectedScope : true;
    });
  }, [periodScopedCases, availableAgents, allCases, accountProfiles]);

  const filteredCases = useMemo(() => {
    if (effectiveSelectedAgent === "all") return periodScopedCases;

    return periodScopedCases.filter((item) =>
      isSameAgent(item.agent, effectiveSelectedAgent)
    );
  }, [periodScopedCases, effectiveSelectedAgent]);

  useEffect(() => {
    if (!accountProfiles.length || !allCases.length) return;

    const casesAfterSuspendedDate = allCases.filter((item) => {
      const account = getAccountStatus(item.agent, accountProfiles);
      const suspendedDate = getSuspendedDate(account);
      return isSuspendedAgent(item.agent, accountProfiles) && suspendedDate && !isCaseBeforeOrOnSuspendedDate(item.auditDateObj, suspendedDate);
    });

    if (casesAfterSuspendedDate.length) {
      console.warn(
        "[Summary] QA cases found after suspended date. Please review:",
        casesAfterSuspendedDate.map((item) => ({
          caseId: item.caseId,
          agent: item.agent,
          auditDate: item.auditDate,
          suspendedDate: formatSummaryDateOnly(getSuspendedDate(getAccountStatus(item.agent, accountProfiles))),
        }))
      );
    }
  }, [allCases, accountProfiles]);

  const summaryCards = useMemo(() => summarizeCases(filteredCases), [filteredCases]);
  const topicSummary = useMemo(() => buildTopicSummary(filteredCases), [filteredCases]);

  const comparisonRows = useMemo(() => {
    const groupedBy = analysisMode === "weekly" ? "week" : analysisMode === "monthly" ? "month" : "year";
    return groupCases(filteredCases, groupedBy).sort((a, b) => {
      const rankDiff = getPeriodRowSortRank(a.label, groupedBy) - getPeriodRowSortRank(b.label, groupedBy);
      if (rankDiff !== 0) return rankDiff;
      return a.label.localeCompare(b.label);
    });
  }, [filteredCases, analysisMode]);

  const comparisonRowsWithDelta = useMemo(
    () =>
      comparisonRows.map((row, index) => {
        const previous = index > 0 ? comparisonRows[index - 1] : null;
        return {
          ...row,
          scoreDelta: previous ? Number((row.avgScore - previous.avgScore).toFixed(2)) : null,
          caseDelta: previous ? row.caseCount - previous.caseCount : null,
          revisedDelta: previous ? row.revisedCount - previous.revisedCount : null,
        };
      }),
    [comparisonRows]
  );

  const getCasesForPeriodLabel = (periodLabel: string) =>
    filteredCases.filter((item) => {
      if (analysisMode === "weekly") return item.weekLabel === periodLabel;
      if (analysisMode === "monthly") return item.monthLabel === periodLabel;
      return item.yearKey === periodLabel;
    });

  const periodTopicReports = useMemo(() => {
    const now = new Date();
    const currentMonthKey =
      `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;
    const currentYearKey = String(now.getFullYear());

    return comparisonRows.map((period) => {
      const periodCases = getCasesForPeriodLabel(period.label);
      const activeCodes = new Set(
        periodCases.flatMap((item) =>
          (
            item.reviewStatus === "Revised" &&
            item.revisedTopics?.length
              ? mergeTopicSet(
                  item.topics,
                  item.revisedTopics
                )
              : item.topics
          ).map((topic) => topic.code)
        )
      );

      const topics = buildTopicSummary(
        periodCases
      ).filter((topic) =>
        activeCodes.has(topic.code)
      );

      const strongest = [...topics]
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 3);

      const coaching = [...topics]
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 3);

      const summary =
        summarizeCases(periodCases);

      const policy =
        getTopicPolicyGroup(
          getPolicyMonthKeyForCases(
            periodCases
          )
        );

      const evaluatedAgents =
        getUniqueNormalizedAgents(
          periodCases.map(
            (item) => item.agent
          )
        );

      const agentCaseCounts =
        evaluatedAgents.map(
          (agent) => ({
            agent,
            count: periodCases.filter(
              (item) =>
                isSameAgent(
                  item.agent,
                  agent
                )
            ).length,
          })
        );

      const agentsMeetingTarget =
        agentCaseCounts.filter(
          (item) =>
            item.count >= CASE_TARGET
        ).length;

      const averageCasesPerAgent =
        evaluatedAgents.length
          ? Number(
              (
                periodCases.length /
                evaluatedAgents.length
              ).toFixed(2)
            )
          : 0;

      const selectedAgentCaseCount =
        effectiveSelectedAgent === "all"
          ? null
          : periodCases.length;

      const selectedAgentStatus =
        selectedAgentCaseCount === null
          ? null
          : selectedAgentCaseCount === 0
            ? "Not Started"
            : selectedAgentCaseCount <
                CASE_TARGET
              ? "In Progress"
              : selectedAgentCaseCount ===
                  CASE_TARGET
                ? "Completed"
                : "Over Target";

      let isCurrent = false;

      if (
        analysisMode === "monthly"
      ) {
        isCurrent =
          periodCases.some(
            (item) =>
              item.monthKey ===
              currentMonthKey
          );
      }
      else if (
        analysisMode === "yearly"
      ) {
        isCurrent =
          period.label ===
          currentYearKey;
      }
      else {
        const dates =
          period.label.match(
            /\d{1,2}\/\d{1,2}\/\d{4}/g
          );

        const endDate =
          excelDateToJSDate(
            dates?.[
              dates.length - 1
            ]
          );

        if (endDate) {
          endDate.setHours(
            23,
            59,
            59,
            999
          );

          isCurrent =
            endDate.getTime() >=
            now.getTime();
        }
      }

      const gradeOrder = [
        "A",
        "B",
        "C",
        "D",
        "F",
        "G",
      ];

      const gradeMix =
        gradeOrder.map((grade) => {
          const count =
            periodCases.filter(
              (item) =>
                String(
                  item.grade
                ) === grade
            ).length;

          return {
            grade,
            count,
            pct: periodCases.length
              ? Number(
                  (
                    (count /
                      periodCases.length) *
                    100
                  ).toFixed(2)
                )
              : 0,
          };
        });

      const revisedCount =
        periodCases.filter(
          (item) =>
            item.reviewStatus ===
            "Revised"
        ).length;

      return {
        ...period,
        cases: periodCases,
        topics,
        strongest,
        coaching,
        summary,
        policy,
        coverage: {
          agentCount:
            evaluatedAgents.length,
          averageCasesPerAgent,
          agentsMeetingTarget,
          target: CASE_TARGET,
          selectedAgentCaseCount,
          selectedAgentStatus,
        },
        gradeMix,
        reviewMix: {
          original:
            periodCases.length -
            revisedCount,
          revised: revisedCount,
        },
        status:
          periodCases.length === 0
            ? "No Data"
            : isCurrent
              ? "In Progress"
              : "Complete",
      };
    });
  }, [
    comparisonRows,
    filteredCases,
    analysisMode,
    effectiveSelectedAgent,
  ]);

  const topicDifferenceGroups = useMemo(() => {
    const groups = new Map<string, any>();

    periodTopicReports.forEach((report) => {
      if (!groups.has(report.policy.key)) {
        groups.set(report.policy.key, {
          key: report.policy.key,
          label: report.policy.label,
          reports: [],
          topics: [],
        });
      }
      groups.get(report.policy.key).reports.push(report);
    });

    groups.forEach((group) => {
      const master = new Map<string, { code: string; label: string }>();
      group.reports.forEach((report: any) => {
        report.topics.forEach((topic: TopicSummary) => {
          if (!master.has(topic.code)) master.set(topic.code, { code: topic.code, label: topic.label });
        });
      });

      group.topics = Array.from(master.values()).map((topicMaster) => {
        let previousPct: number | null = null;
        const values = group.reports.map((report: any) => {
          const topic = report.topics.find((item: TopicSummary) => item.code === topicMaster.code);
          const pct = topic ? topic.pct : null;
          const delta =
            pct === null || previousPct === null
              ? null
              : Number((pct - previousPct).toFixed(2));
          if (pct !== null) previousPct = pct;
          return { period: report.label, pct, delta };
        });
        return { ...topicMaster, values };
      });
    });

    return Array.from(groups.values());
  }, [periodTopicReports]);

  const agentDisplayPeriods = comparisonRows;

  const agentComparisonRows = useMemo(() => {
    if (effectiveSelectedAgent !== "all") return [];

    return selectableAgentOptions.map((agent) => {
      const values = agentDisplayPeriods.map((period) => {
        const cases = periodScopedCases.filter((item) => {
          if (!isSameAgent(item.agent, agent)) return false;
          if (analysisMode === "weekly") return item.weekLabel === period.label;
          if (analysisMode === "monthly") return item.monthLabel === period.label;
          return item.yearKey === period.label;
        });

        if (!cases.length) {
          return { period: period.label, score: null as number | null, caseCount: 0 };
        }

        const summary = summarizeCases(cases);
        return {
          period: period.label,
          score: summary.avgScore,
          caseCount: summary.caseCount,
        };
      });

      const availableScores = values.filter((item) => item.score !== null);
      const overallDelta =
        availableScores.length >= 2
          ? Number(
              (
                (availableScores[availableScores.length - 1].score ?? 0) -
                (availableScores[0].score ?? 0)
              ).toFixed(2)
            )
          : null;

      return { agent, values, overallDelta };
    });
  }, [
    selectableAgentOptions,
    agentDisplayPeriods,
    periodScopedCases,
    analysisMode,
    effectiveSelectedAgent,
  ]);

  const isComparisonMode = comparisonRows.length >= 2;
  const reportModeName =
    analysisMode === "weekly" ? "Weekly" : analysisMode === "monthly" ? "Monthly" : "Yearly";

  const comparisonChartAnalytics = useMemo(() => {
    const scores = comparisonRowsWithDelta.map((row) => row.avgScore);
    const minimumScore = scores.length ? Math.min(...scores) : 0;
    const trendFloor = Math.max(0, Math.min(90, Math.floor((minimumScore - 5) / 10) * 10));
    const trendCeiling = 100;
    const trendRange = Math.max(10, trendCeiling - trendFloor);
    const trendTicks = Array.from({ length: 4 }, (_, index) =>
      Math.round(trendCeiling - (trendRange / 3) * index)
    );

    const scoreBuckets = [
      {
        label: "90–100",
        count: filteredCases.filter((item) => item.finalScore >= 90).length,
      },
      {
        label: "85–89",
        count: filteredCases.filter((item) => item.finalScore >= 85 && item.finalScore < 90).length,
      },
      {
        label: "80–84",
        count: filteredCases.filter((item) => item.finalScore >= 80 && item.finalScore < 85).length,
      },
      {
        label: "<80",
        count: filteredCases.filter((item) => item.finalScore < 80).length,
      },
    ];

    const maxBucketCount = Math.max(1, ...scoreBuckets.map((bucket) => bucket.count));
    const revised = filteredCases.filter((item) => item.reviewStatus === "Revised").length;
    const original = Math.max(0, filteredCases.length - revised);
    const total = filteredCases.length;
    const originalPct = total ? Number(((original / total) * 100).toFixed(2)) : 0;
    const revisedPct = total ? Number(((revised / total) * 100).toFixed(2)) : 0;

    return {
      trendFloor,
      trendRange,
      trendTicks,
      scoreBuckets,
      maxBucketCount,
      original,
      revised,
      total,
      originalPct,
      revisedPct,
    };
  }, [comparisonRowsWithDelta, filteredCases]);

  const caseHighlights = useMemo(() => {
    const cleanPoint = (
      value: unknown,
      maxLength = 150
    ) => {
      const text = String(
        value || ""
      )
        .replace(
          /[\r\n•▪●◦]+/g,
          " "
        )
        .replace(
          /\s+/g,
          " "
        )
        .replace(
          /^(จากการตรวจสอบ|จุดที่หักคือ|จุดที่ควรปรับ|ข้อควรปรับ|สิ่งที่ทำได้ดี|จุดเด่น)\s*:?\s*/i,
          ""
        )
        .replace(
          /[.…]{2,}$/g,
          ""
        )
        .trim();

      if (
        text.length <= maxLength
      ) {
        return text;
      }

      const completeClauses = text
        .split(
          /(?:[.!?。;；]|\s+(?:แต่|อย่างไรก็ตาม|อย่างไรก็ดี|เนื่องจาก|เพราะ|จึง|รวมถึง)\s+)/
        )
        .map((item) =>
          item.trim()
        )
        .filter(
          (item) =>
            item.length >= 12 &&
            item.length <= maxLength
        );

      if (
        completeClauses.length
      ) {
        return completeClauses[0];
      }

      const shortened =
        text.slice(
          0,
          maxLength
        );

      const lastBreak =
        Math.max(
          shortened.lastIndexOf(
            " "
          ),
          shortened.lastIndexOf(
            ","
          ),
          shortened.lastIndexOf(
            "，"
          )
        );

      return (
        lastBreak > 40
          ? shortened.slice(
              0,
              lastBreak
            )
          : shortened
      )
        .replace(
          /[.…]{2,}$/g,
          ""
        )
        .trim();
    };

    const summarizeComment = (
      value: unknown,
      type:
        | "strength"
        | "improvement"
    ) => {
      const text = String(
        value || ""
      )
        .split(
          /(?:ตัวอย่างที่เหมาะสม|เงื่อนไขที่ใช้หักคะแนนตามไฟล์)/i
        )[0]
        .trim();

      if (!text) return "";

      const prepared = text
        .replace(
          /(จุดที่หักคือ|จุดที่ควรปรับ|ข้อควรปรับ|สิ่งที่ทำได้ดี|จุดเด่น|จากการตรวจสอบ)/g,
          "|||$1"
        )
        .replace(
          /([.!?。])\s+/g,
          "$1|||"
        )
        .replace(
          /[\r\n•▪●◦]+/g,
          "|||"
        );

      const positiveNoIssue = [
        "ไม่พบข้อผิดพลาด",
        "ไม่พบหัวข้อที่ถูกหัก",
        "ไม่มีข้อผิดพลาด",
        "ไม่ถูกหักคะแนน",
      ];

      const positiveKeywords = [
        "ถูกต้อง",
        "ครบถ้วน",
        "ชัดเจน",
        "สุภาพ",
        "เหมาะสม",
        "ตรวจสอบ",
        "ดำเนินการ",
        "ติดตาม",
        "สรุปผล",
        "ดูแลเคส",
        "ตาม process",
        "ตามขั้นตอน",
      ];

      const improvementKeywords = [
        "ควร",
        "ไม่ได้",
        "ไม่แจ้ง",
        "ไม่ตรวจสอบ",
        "ไม่ติดตาม",
        "ไม่สรุป",
        "ไม่ครบ",
        "ไม่ชัดเจน",
        "ไม่เหมาะสม",
        "ผิด",
        "หักคะแนน",
        "ถูกหัก",
        "สะกดผิด",
        "คำผิด",
        "ตกหล่น",
        "ขาด",
        "ล่าช้า",
        "เกิน sla",
        "ไม่ผ่าน sla",
        "ไม่ตรง",
      ];

      const chunks = prepared
        .split("|||")
        .flatMap((item) =>
          item.split(
            /(?:\s*[;；]\s*|\s+(?:แต่|อย่างไรก็ตาม|อย่างไรก็ดี|เนื่องจาก|เพราะ|จึง|รวมถึง)\s+)/
          )
        )
        .map((item) =>
          cleanPoint(item)
        )
        .filter(
          (item) =>
            item.length >= 12
        );

      const ranked = chunks
        .map((item, index) => {
          const normalized =
            item.toLowerCase();

          const noIssue =
            positiveNoIssue.some(
              (keyword) =>
                normalized.includes(
                  keyword
                )
            );

          const positiveScore =
            positiveKeywords.reduce(
              (score, keyword) =>
                score +
                (
                  normalized.includes(
                    keyword
                  )
                    ? 1
                    : 0
                ),
              0
            );

          const improvementScore =
            improvementKeywords.reduce(
              (score, keyword) =>
                score +
                (
                  normalized.includes(
                    keyword
                  )
                    ? 1
                    : 0
                ),
              0
            );

          const valid =
            type === "strength"
              ? (
                  noIssue ||
                  (
                    positiveScore > 0 &&
                    improvementScore === 0
                  )
                )
              : (
                  !noIssue &&
                  improvementScore > 0
                );

          return {
            item,
            valid,
            score:
              type === "strength"
                ? (
                    positiveScore * 5 +
                    (
                      noIssue
                        ? 4
                        : 0
                    ) -
                    index * 0.05
                  )
                : (
                    improvementScore * 6 -
                    positiveScore -
                    index * 0.05
                  ),
          };
        })
        .filter(
          (item) =>
            item.valid
        )
        .sort(
          (a, b) =>
            b.score - a.score
        );

      return cleanPoint(
        ranked[0]?.item || ""
      );
    };

    const buildHighlight = (
      item: CaseItem
    ) => {
      const effectiveTopics =
        item.reviewStatus ===
          "Revised" &&
        item.revisedTopics?.length
          ? mergeTopicSet(
              item.topics,
              item.revisedTopics
            )
          : item.topics;

      const sortedHigh = [
        ...effectiveTopics,
      ].sort(
        (a, b) =>
          b.pct - a.pct
      );

      const sortedLow = [
        ...effectiveTopics,
      ].sort(
        (a, b) =>
          a.pct - b.pct
      );

      const strongestTopic =
        sortedHigh[0] || null;

      const lowestTopic =
        sortedLow[0] || null;

      const inquiry =
        item.inquiryTh &&
        item.inquiryTh !== "-"
          ? item.inquiryTh
          : item.inquiryEn &&
              item.inquiryEn !== "-"
            ? item.inquiryEn
            : "No inquiry detail";

      const buildNote = (
        topic: Topic,
        type:
          | "strength"
          | "improvement"
      ) => {
        const comment =
          String(
            topic.comment || ""
          ).trim();

        const deducted =
          Number(
            Math.max(
              0,
              topic.max -
                topic.score
            ).toFixed(2)
          );

        const fallback =
          type === "strength"
            ? `ทำได้ ${topic.score.toFixed(2)}/${topic.max.toFixed(2)} คะแนน`
            : `ทำได้ ${topic.score.toFixed(2)}/${topic.max.toFixed(2)} คะแนน${
                deducted > 0
                  ? ` และถูกหัก ${deducted.toFixed(2)} คะแนน`
                  : ""
              }`;

        return {
          label: topic.label,
          pct: topic.pct,
          detail:
            summarizeComment(
              comment,
              type
            ) || fallback,
        };
      };

      const strengthCandidates =
        sortedHigh.filter(
          (topic) =>
            topic.pct >= 90
        );

      const improvementCandidates =
        sortedLow.filter(
          (topic) =>
            topic.pct < 100
        );

      const strengthNotes = (
        strengthCandidates.length
          ? strengthCandidates
          : sortedHigh.slice(0, 1)
      )
        .slice(0, 2)
        .map((topic) =>
          buildNote(
            topic,
            "strength"
          )
        );

      const improvementNotes =
        improvementCandidates
          .slice(0, 2)
          .map((topic) =>
            buildNote(
              topic,
              "improvement"
            )
          );

      return {
        caseId: item.caseId,
        agent: item.agent,
        auditDate:
          item.auditDate,
        score: item.finalScore,
        inquiry: cleanPoint(
          inquiry,
          180
        ),
        strongestTopic,
        lowestTopic,
        strengthNotes,
        improvementNotes,
      };
    };

    const strongestCases = [
      ...filteredCases,
    ]
      .sort((a, b) => {
        if (
          b.finalScore !==
          a.finalScore
        ) {
          return (
            b.finalScore -
            a.finalScore
          );
        }

        return (
          (
            b.auditDateObj?.getTime() ||
            0
          ) -
          (
            a.auditDateObj?.getTime() ||
            0
          )
        );
      })
      .slice(0, 5)
      .map(buildHighlight);

    const improvementCases = [
      ...filteredCases,
    ]
      .filter(
        (item) =>
          item.finalScore < 100
      )
      .sort((a, b) => {
        if (
          a.finalScore !==
          b.finalScore
        ) {
          return (
            a.finalScore -
            b.finalScore
          );
        }

        return (
          (
            b.auditDateObj?.getTime() ||
            0
          ) -
          (
            a.auditDateObj?.getTime() ||
            0
          )
        );
      })
      .slice(0, 5)
      .map(buildHighlight);

    return {
      strongestCases,
      improvementCases,
    };
  }, [filteredCases]);

  const teamMonthlyAnalyticsRows = useMemo(() => {
    if (analysisMode !== "monthly") return [];

    const currentMonthKey =
      `${new Date().getFullYear()}-${`${new Date().getMonth() + 1}`.padStart(2, "0")}`;

    const selectedMonthlyKeys = effectivePeriodKeys
      .filter((key) => /^\d{4}-\d{2}$/.test(key))
      .sort((a, b) => a.localeCompare(b));

    const anchorMonthKey =
      selectedMonthlyKeys[selectedMonthlyKeys.length - 1] ||
      (allCases.some((item) => item.monthKey === currentMonthKey)
        ? currentMonthKey
        : getLatestMonthKey(allCases));

    if (!anchorMonthKey || anchorMonthKey === "unknown") {
      return [];
    }

    const rows = buildRecentMonthKeys(anchorMonthKey, 3)
      .reverse()
      .map((monthKey) => {
        const monthCases = allCases.filter((item) => {
          if (
            roleScopedAgentList.length &&
            !roleScopedAgentList.some((agent) =>
              isSameAgent(item.agent, agent)
            )
          ) {
            return false;
          }

          return item.monthKey === monthKey;
        });

        const summary = summarizeCases(monthCases);
        const avgScore = monthCases.length
          ? summary.avgScore
          : 0;

        return {
          monthKey,
          label: getMonthLabelForKey(monthKey, allCases),
          caseCount: summary.caseCount,
          avgScore,
          revisedCount: summary.revisedCount,
          grade: monthCases.length
            ? summary.grade
            : scoreToGrade(0, monthKey),
          barPct: monthCases.length
            ? Math.max(
                8,
                Math.min(
                  100,
                  ((avgScore - 70) / 30) * 100
                )
              )
            : 0,
        };
      });

    return rows.map((row, index) => ({
      ...row,
      scoreDelta:
        index === 0 || !rows[index - 1].caseCount || !row.caseCount
          ? null
          : Number(
              (
                row.avgScore -
                rows[index - 1].avgScore
              ).toFixed(2)
            ),
    }));
  }, [
    analysisMode,
    effectivePeriodKeys,
    allCases,
    roleScopedAgentList,
  ]);



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

    return buildAgentRowsWithMaster(availableAgents, monthlyCases, analyticsMonthKey, accountProfiles);
  }, [allCases, analyticsMonthKey, availableAgents, effectiveSelectedAgent, roleScopedAgentList, accountProfiles]);

  const agentMonthlyAnalyticsTitle =
    effectiveSelectedAgent === "all" ? "Agent Monthly Analytics" : `${effectiveSelectedAgent} Monthly Analytics`;
  const agentMonthlyAnalyticsSubtitle =
    effectiveSelectedAgent === "all"
      ? `Agent coverage for ${getMonthLabelForKey(analyticsMonthKey, allCases)}. Agents with no cases remain visible as 0 cases / Grade F where the month policy applies.`
      : `Last 3 months for ${effectiveSelectedAgent}. Months with no cases remain visible for tracking.`;
  const agentMonthlyAnalyticsFirstCol = effectiveSelectedAgent === "all" ? "Agent" : "Month";

  const summaryRows = useMemo(() => {
    if (effectiveSelectedAgent !== "all") return comparisonRows;

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
        return buildAgentRowsWithMaster(availableAgents, filteredCases, fallbackMonthKey, accountProfiles);
      }
      case "yearly-by-agent":
        return groupCases(filteredCases, "agent");
      case "yearly-team-summary":
        return groupCases(filteredCases, "year");
      default:
        return comparisonRows;
    }
  }, [filteredCases, viewMode, availableAgents, selectedMonth, accountProfiles, effectiveSelectedAgent, comparisonRows]);

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
          rows: buildAgentRowsWithMaster(availableAgents, filteredCases, fallbackMonthKey, accountProfiles),
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
    const reportSummary = summarizeCases(filteredCases);
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2;
    const footerY = pageHeight - 8;
    const contentBottom = pageHeight - 18;
    const generatedBy = String(
      currentUser?.name ||
      currentUser?.displayName ||
      currentUser?.email ||
      "Unknown User"
    ).trim();

    const safe = (value: unknown) =>
      String(value ?? "-")
        .replace(/\s+/g, " ")
        .trim();

    const drawText = (
      value: unknown,
      x: number,
      y: number,
      options: {
        align?: "left" | "center" | "right";
        color?: string;
      } = {}
    ) => {
      const text = safe(value);
      const hasThai = /[\u0E00-\u0E7F]/.test(text);

      if (!hasThai) {
        const previousColor = String(
          (doc as any).getTextColor?.() || "#0f172a"
        );

        if (options.color) {
          doc.setTextColor(options.color);
        }

        doc.text(text, x, y, {
          align: options.align || "left",
        });

        if (options.color) {
          doc.setTextColor(previousColor);
        }

        return;
      }

      const scale = 4;
      const fontSize = Number((doc as any).getFontSize?.() || 9);
      const fontStyle = String((doc as any).getFont?.()?.fontStyle || "normal");
      const fontWeight = fontStyle.includes("bold") ? "700" : "400";
      const fontPx = Math.max(10, fontSize * 1.333) * scale;
      const canvas = document.createElement("canvas");
      const measure = canvas.getContext("2d");

      if (!measure) {
        doc.text(
          text.replace(/[\u0E00-\u0E7F]/g, "?"),
          x,
          y,
          { align: options.align || "left" }
        );
        return;
      }

      measure.font =
        `${fontWeight} ${fontPx}px Tahoma, "Noto Sans Thai", Arial, sans-serif`;
      const measuredWidth = Math.ceil(measure.measureText(text).width + 12 * scale);
      const measuredHeight = Math.ceil(fontPx * 1.55);
      canvas.width = Math.max(8, measuredWidth);
      canvas.height = Math.max(8, measuredHeight);

      const context = canvas.getContext("2d");
      if (!context) return;

      context.scale(scale, scale);
      context.font =
        `${fontWeight} ${fontPx / scale}px Tahoma, "Noto Sans Thai", Arial, sans-serif`;
      context.textBaseline = "alphabetic";
      context.fillStyle = options.color || "#0f172a";
      context.fillText(text, 2, (measuredHeight / scale) * 0.76);

      const pxToMm = 25.4 / 96;
      const widthMm = (canvas.width / scale) * pxToMm;
      const heightMm = (canvas.height / scale) * pxToMm;
      let drawX = x;

      if (options.align === "center") drawX = x - widthMm / 2;
      if (options.align === "right") drawX = x - widthMm;

      doc.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        drawX,
        y - heightMm * 0.76,
        widthMm,
        heightMm,
        undefined,
        "FAST"
      );
    };

    const wrapText = (
      value: unknown,
      maxChars = 66,
      maxLines = 2
    ) => {
      const text = safe(value);

      if (text.length <= maxChars) {
        return [text];
      }

      const words = text.split(/\s+/);
      const lines: string[] = [];
      let current = "";

      words.forEach((word) => {
        if (lines.length >= maxLines) return;

        const candidate =
          current
            ? `${current} ${word}`
            : word;

        if (candidate.length <= maxChars) {
          current = candidate;
          return;
        }

        if (current) {
          lines.push(current);
        }

        current = word;
      });

      if (
        current &&
        lines.length < maxLines
      ) {
        lines.push(current);
      }

      return lines.length
        ? lines.slice(0, maxLines)
        : [text];
    };

    const addDonutChart = (
      x: number,
      y: number,
      size: number,
      originalPct: number,
      revisedPct: number
    ) => {
      const canvas = document.createElement("canvas");
      const pixels = 480;
      canvas.width = pixels;
      canvas.height = pixels;
      const context = canvas.getContext("2d");
      if (!context) return;

      const center = pixels / 2;
      const radius = pixels * 0.38;
      const lineWidth = pixels * 0.15;
      const start = -Math.PI / 2;
      const originalAngle = (Math.max(0, Math.min(100, originalPct)) / 100) * Math.PI * 2;

      context.lineWidth = lineWidth;
      context.lineCap = "butt";

      context.beginPath();
      context.strokeStyle = "#e2e8f0";
      context.arc(center, center, radius, 0, Math.PI * 2);
      context.stroke();

      if (originalPct > 0) {
        context.beginPath();
        context.strokeStyle = "#7c3aed";
        context.arc(center, center, radius, start, start + originalAngle);
        context.stroke();
      }

      if (revisedPct > 0) {
        context.beginPath();
        context.strokeStyle = "#d946ef";
        context.arc(
          center,
          center,
          radius,
          start + originalAngle,
          start + Math.PI * 2
        );
        context.stroke();
      }

      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(center, center, radius - lineWidth / 2 + 2, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#4c1d95";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = "700 64px Arial";
      context.fillText(`${originalPct.toFixed(0)}%`, center, center - 8);
      context.fillStyle = "#64748b";
      context.font = "600 26px Arial";
      context.fillText("Original", center, center + 54);

      doc.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        x,
        y,
        size,
        size,
        undefined,
        "FAST"
      );
    };

    const reportTitle =
      `${reportModeName} ${isComparisonMode ? "Comparison" : "Performance"} Report`;
    const reportSubtitle =
      effectivePeriodLabels.join(", ") || "No period selected";

    let y = 0;

    const drawPageHeader = () => {
      doc.setFillColor(49, 16, 101);
      doc.rect(0, 0, pageWidth, 31, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      drawText(reportTitle, margin, 14, { color: "#ffffff" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      drawText("Robinhood QA • Quality Monitoring Workspace", margin, 22, {
        color: "#ffffff",
      });
      drawText(reportSubtitle, pageWidth - margin, 22, {
        align: "right",
        color: "#ffffff",
      });

      doc.setDrawColor(124, 58, 237);
      doc.setLineWidth(0.7);
      doc.line(margin, 35, pageWidth - margin, 35);
    };

    const startNewPage = () => {
      doc.addPage();
      drawPageHeader();
      y = 43;
    };

    const ensureSpace = (needed: number) => {
      if (y + needed <= contentBottom) return;
      startNewPage();
    };

    const drawSectionTitle = (
      title: string,
      subtitle?: string
    ) => {
      ensureSpace(subtitle ? 18 : 12);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      drawText(title, margin, y);

      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        drawText(subtitle, margin, y + 5);
        y += 12;
      } else {
        y += 7;
      }
    };

    const drawMetricCard = (
      x: number,
      cardY: number,
      width: number,
      label: string,
      value: string,
      tone: "violet" | "emerald" | "sky" | "amber" = "violet"
    ) => {
      const fills: Record<string, [number, number, number]> = {
        violet: [246, 242, 255],
        emerald: [236, 253, 245],
        sky: [240, 249, 255],
        amber: [255, 251, 235],
      };
      const texts: Record<string, [number, number, number]> = {
        violet: [91, 33, 182],
        emerald: [4, 120, 87],
        sky: [3, 105, 161],
        amber: [180, 83, 9],
      };

      const fill = fills[tone];
      const text = texts[tone];

      doc.setFillColor(...fill);
      doc.setDrawColor(221, 214, 254);
      doc.roundedRect(x, cardY, width, 21, 2.5, 2.5, "FD");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      drawText(label, x + 4, cardY + 7);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...text);
      drawText(value, x + 4, cardY + 16);
    };

    drawPageHeader();
    y = 43;

    drawSectionTitle(
      "Report Information",
      "Scope and preparation details"
    );

    const infoRows = [
      [
        "Report Type",
        reportTitle,
        "Scope",
        effectiveSelectedAgent === "all"
          ? "All Agents"
          : buildSuspendedAgentLabel(
              effectiveSelectedAgent,
              accountProfiles
            ),
      ],
      [
        "Selected Periods",
        reportSubtitle,
        "Prepared By",
        generatedBy,
      ],
      [
        "Generated On",
        new Date().toLocaleString("en-GB"),
        "Report Mode",
        isComparisonMode ? "Comparison" : "Single Period",
      ],
    ];

    infoRows.forEach((row, rowIndex) => {
      doc.setFillColor(
        rowIndex % 2 === 0 ? 250 : 255,
        rowIndex % 2 === 0 ? 250 : 255,
        rowIndex % 2 === 0 ? 252 : 255
      );
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, contentWidth, 11, "FD");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      drawText(row[0], margin + 3, y + 4);
      drawText(row[2], margin + contentWidth / 2 + 3, y + 4);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.6);
      doc.setTextColor(15, 23, 42);
      drawText(row[1], margin + 3, y + 8.5);
      drawText(row[3], margin + contentWidth / 2 + 3, y + 8.5);
      y += 11;
    });

    y += 8;
    drawSectionTitle(
      "Executive Summary",
      "Overall result for the selected scope"
    );

    const metricGap = 4;
    const metricWidth = (contentWidth - metricGap * 3) / 4;
    drawMetricCard(
      margin,
      y,
      metricWidth,
      "Total Cases",
      String(reportSummary.caseCount),
      "violet"
    );
    drawMetricCard(
      margin + metricWidth + metricGap,
      y,
      metricWidth,
      "Average Score",
      reportSummary.avgScore.toFixed(2),
      "emerald"
    );
    drawMetricCard(
      margin + (metricWidth + metricGap) * 2,
      y,
      metricWidth,
      "Overall Grade",
      String(reportSummary.grade),
      "sky"
    );
    drawMetricCard(
      margin + (metricWidth + metricGap) * 3,
      y,
      metricWidth,
      "Revised Cases",
      String(reportSummary.revisedCount),
      "amber"
    );
    y += 30;

    if (
      analysisMode === "monthly" &&
      teamMonthlyAnalyticsRows.length
    ) {
      ensureSpace(96);

      drawSectionTitle(
        "Team Monthly Analytics — Last 3 Months",
        "Automatic team trend shown without requiring a month comparison"
      );

      const analyticsTop = y;
      const chartHeight = 54;

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(221, 214, 254);
      doc.roundedRect(
        margin,
        analyticsTop,
        contentWidth,
        chartHeight,
        2.5,
        2.5,
        "FD"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      drawText(
        "Monthly Average Score Trend",
        margin + 4,
        analyticsTop + 7
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      drawText(
        "Team score scale 70–100",
        pageWidth - margin - 4,
        analyticsTop + 7,
        { align: "right" }
      );

      const chartX = margin + 18;
      const chartY = analyticsTop + 13;
      const chartW = contentWidth - 28;
      const chartH = 30;

      [0, 1, 2, 3].forEach((index) => {
        const lineY =
          chartY + (index / 3) * chartH;

        doc.setDrawColor(237, 233, 254);
        doc.setLineWidth(0.25);
        doc.line(
          chartX,
          lineY,
          chartX + chartW,
          lineY
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.3);
        doc.setTextColor(100, 116, 139);
        drawText(
          String(100 - index * 10),
          chartX - 3,
          lineY + 1.5,
          { align: "right" }
        );
      });

      const gap = 12;
      const barWidth =
        (chartW -
          gap * (teamMonthlyAnalyticsRows.length + 1)) /
        Math.max(1, teamMonthlyAnalyticsRows.length);

      teamMonthlyAnalyticsRows.forEach(
        (row, index) => {
          const barHeight = row.caseCount
            ? Math.max(
                2,
                (row.barPct / 100) * chartH
              )
            : 0;

          const barX =
            chartX +
            gap +
            index * (barWidth + gap);

          const barY =
            chartY +
            chartH -
            barHeight;

          if (row.caseCount) {
            doc.setFillColor(124, 58, 237);
            doc.roundedRect(
              barX,
              barY,
              barWidth,
              barHeight,
              1.2,
              1.2,
              "F"
            );
          }

          doc.setFont("helvetica", "bold");
          doc.setFontSize(5.8);
          doc.setTextColor(15, 23, 42);
          drawText(
            row.caseCount
              ? row.avgScore.toFixed(2)
              : "No data",
            barX + barWidth / 2,
            row.caseCount
              ? Math.max(chartY + 3, barY - 2)
              : chartY + chartH - 2,
            { align: "center" }
          );

          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.2);
          doc.setTextColor(100, 116, 139);
          wrapText(row.label, 18, 2).forEach(
            (line, lineIndex) => {
              drawText(
                line,
                barX + barWidth / 2,
                chartY +
                  chartH +
                  5 +
                  lineIndex * 3,
                { align: "center" }
              );
            }
          );
        }
      );

      y += chartHeight + 6;

      const widths = [60, 22, 28, 28, 20, 26];
      const headers = [
        "Month",
        "Cases",
        "Average",
        "Change",
        "Grade",
        "Revised",
      ];

      doc.setFillColor(49, 16, 101);
      doc.roundedRect(
        margin,
        y,
        contentWidth,
        9,
        2,
        2,
        "F"
      );

      let headerX = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.7);

      headers.forEach((header, index) => {
        drawText(
          header,
          index === 0
            ? headerX + 3
            : headerX + widths[index] / 2,
          y + 6,
          {
            align: index === 0
              ? "left"
              : "center",
            color: "#ffffff",
          }
        );

        headerX += widths[index];
      });

      y += 9;

      teamMonthlyAnalyticsRows.forEach(
        (row, index) => {
          doc.setFillColor(
            index % 2 === 0 ? 255 : 248,
            index % 2 === 0 ? 255 : 250,
            index % 2 === 0 ? 255 : 252
          );
          doc.setDrawColor(226, 232, 240);
          doc.rect(
            margin,
            y,
            contentWidth,
            9,
            "FD"
          );

          const values = [
            row.label,
            String(row.caseCount),
            row.caseCount
              ? row.avgScore.toFixed(2)
              : "No data",
            row.scoreDelta === null
              ? "Base"
              : `${row.scoreDelta > 0 ? "+" : ""}${row.scoreDelta.toFixed(2)}`,
            row.caseCount
              ? String(row.grade)
              : "-",
            String(row.revisedCount),
          ];

          let x = margin;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(51, 65, 85);

          values.forEach((value, colIndex) => {
            drawText(
              value,
              colIndex === 0
                ? x + 3
                : x + widths[colIndex] / 2,
              y + 5.8,
              {
                align: colIndex === 0
                  ? "left"
                  : "center",
              }
            );

            x += widths[colIndex];
          });

          y += 9;
        }
      );

      y += 10;


    }

    periodTopicReports.forEach((report, reportIndex) => {
      if (reportIndex > 0 || y > 145) {
        startNewPage();
      }

      drawSectionTitle(
        `Topic Performance — ${report.label}`,
        `${report.caseCount} Cases • Average ${report.avgScore.toFixed(2)} • ${report.status}`
      );

      if (report.status === "In Progress") {
        doc.setFillColor(255, 251, 235);
        doc.setDrawColor(245, 158, 11);
        doc.roundedRect(margin, y, contentWidth, 9, 2, 2, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(146, 64, 14);
        drawText(
          `Partial data — calculated from ${report.caseCount} evaluated case(s)`,
          margin + 3,
          y + 5.8
        );
        y += 13;
      }

      ensureSpace(19);

      const coverageMetrics =
        effectiveSelectedAgent === "all"
          ? [
              {
                label: "Total Cases",
                value: String(
                  report.caseCount
                ),
              },
              {
                label: "Agents Evaluated",
                value: String(
                  report.coverage.agentCount
                ),
              },
              {
                label: "Avg / Agent",
                value:
                  report.coverage.averageCasesPerAgent.toFixed(2),
              },
              ...(analysisMode ===
              "monthly"
                ? [
                    {
                      label: "Target Met",
                      value: `${report.coverage.agentsMeetingTarget}/${report.coverage.agentCount}`,
                    },
                    {
                      label: "Monthly Plan",
                      value: `${report.coverage.target} x ${report.coverage.agentCount}`,
                    },
                  ]
                : []),
            ]
          : [
              {
                label: "Agent",
                value:
                  buildSuspendedAgentLabel(
                    effectiveSelectedAgent,
                    accountProfiles
                  ),
              },
              {
                label: "Evaluated Cases",
                value:
                  analysisMode ===
                  "monthly"
                    ? `${report.caseCount}/${report.coverage.target}`
                    : String(
                        report.caseCount
                      ),
              },
              {
                label: "Status",
                value:
                  report.coverage.selectedAgentStatus ||
                  "No Data",
              },
              ...(analysisMode ===
              "monthly"
                ? [
                    {
                      label: "Monthly Target",
                      value: String(
                        report.coverage.target
                      ),
                    },
                  ]
                : []),
            ];

      const coverageHeight = 14;
      const coverageWidth =
        contentWidth /
        Math.max(
          1,
          coverageMetrics.length
        );

      coverageMetrics.forEach(
        (metric, index) => {
          const metricX =
            margin +
            coverageWidth * index;

          doc.setFillColor(
            index % 2 === 0
              ? 246
              : 240,
            index % 2 === 0
              ? 242
              : 249,
            index % 2 === 0
              ? 255
              : 255
          );

          doc.setDrawColor(
            221,
            214,
            254
          );

          doc.rect(
            metricX,
            y,
            coverageWidth,
            coverageHeight,
            "FD"
          );

          doc.setFont(
            "helvetica",
            "normal"
          );
          doc.setFontSize(5.6);
          doc.setTextColor(
            100,
            116,
            139
          );

          drawText(
            metric.label,
            metricX +
              coverageWidth / 2,
            y + 4.5,
            { align: "center" }
          );

          doc.setFont(
            "helvetica",
            "bold"
          );
          doc.setFontSize(
            metric.label ===
              "Agent"
              ? 6
              : 8
          );
          doc.setTextColor(
            76,
            29,
            149
          );

          drawText(
            metric.value,
            metricX +
              coverageWidth / 2,
            y + 10.5,
            { align: "center" }
          );
        }
      );

      y += coverageHeight + 6;

      const tableX = margin;
      const tableWidth = contentWidth;
      const topicWidths = [112, 24, 20, 28];
      const headers = ["Topic", "Avg", "Max", "%"];

      doc.setFillColor(109, 40, 217);
      doc.roundedRect(tableX, y, tableWidth, 9, 2, 2, "F");

      let headerX = tableX;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);

      headers.forEach((header, index) => {
        drawText(
          header,
          index === 0
            ? headerX + 3
            : headerX + topicWidths[index] / 2,
          y + 6,
          {
            align: index === 0 ? "left" : "center",
            color: "#ffffff",
          }
        );
        headerX += topicWidths[index];
      });

      y += 9;

      report.topics.forEach((topic, index) => {
        const lines = wrapText(
          `${topic.code}. ${topic.label}`,
          68,
          2
        );
        const rowHeight = Math.max(9, 4 + lines.length * 4);

        ensureSpace(rowHeight + 4);

        doc.setFillColor(
          index % 2 === 0 ? 255 : 248,
          index % 2 === 0 ? 255 : 250,
          index % 2 === 0 ? 255 : 252
        );
        doc.setDrawColor(226, 232, 240);
        doc.rect(tableX, y, tableWidth, rowHeight, "FD");

        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);

        lines.forEach((line, lineIndex) => {
          drawText(
            line,
            tableX + 3,
            y + 5 + lineIndex * 4
          );
        });

        doc.setFont("helvetica", "bold");
        drawText(
          topic.avgScore.toFixed(2),
          tableX + 112 + 12,
          y + 5.6,
          { align: "center" }
        );
        drawText(
          topic.max.toFixed(2),
          tableX + 112 + 24 + 10,
          y + 5.6,
          { align: "center" }
        );
        doc.setTextColor(109, 40, 217);
        drawText(
          topic.pct.toFixed(2) + "%",
          pageWidth - margin - 14,
          y + 5.6,
          { align: "center" }
        );

        y += rowHeight;
      });

      y += 7;

      if (y + 39 > contentBottom) {
        startNewPage();
        drawSectionTitle(
          `Topic Performance — ${report.label} (continued)`,
          "Strongest topics and coaching focus"
        );
      }

      const halfWidth = (contentWidth - 5) / 2;
      const insightY = y;

      const drawInsightBox = (
        x: number,
        title: string,
        items: TopicSummary[],
        tone: "emerald" | "amber"
      ) => {
        const fill =
          tone === "emerald"
            ? ([236, 253, 245] as const)
            : ([255, 251, 235] as const);
        const border =
          tone === "emerald"
            ? ([167, 243, 208] as const)
            : ([253, 230, 138] as const);
        const text =
          tone === "emerald"
            ? ([4, 120, 87] as const)
            : ([180, 83, 9] as const);

        doc.setFillColor(...fill);
        doc.setDrawColor(...border);
        doc.roundedRect(x, insightY, halfWidth, 32, 2.5, 2.5, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...text);
        drawText(title, x + 4, insightY + 7);

        items.slice(0, 3).forEach((topic, index) => {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(51, 65, 85);
          drawText(
            `${index + 1}. ${topic.label}`,
            x + 4,
            insightY + 13 + index * 6
          );
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...text);
          drawText(
            topic.pct.toFixed(2) + "%",
            x + halfWidth - 4,
            insightY + 13 + index * 6,
            { align: "right" }
          );
        });
      };

      drawInsightBox(
        margin,
        "Strongest Topics",
        report.strongest,
        "emerald"
      );
      drawInsightBox(
        margin + halfWidth + 5,
        "Coaching Focus",
        report.coaching,
        "amber"
      );

      y += 39;

      if (y + 48 > contentBottom) {
        startNewPage();
        drawSectionTitle(
          `Topic Performance — ${report.label} (continued)`,
          "Grade and review status"
        );
      }

      const gradeBoxWidth = contentWidth * 0.58;
      const statusBoxX = margin + gradeBoxWidth + 5;
      const statusBoxWidth = contentWidth - gradeBoxWidth - 5;

      doc.setFillColor(250, 248, 255);
      doc.setDrawColor(221, 214, 254);
      doc.roundedRect(
        margin,
        y,
        gradeBoxWidth,
        40,
        2.5,
        2.5,
        "FD"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(91, 33, 182);
      drawText("Grade Mix", margin + 4, y + 7);

      const gradeCellWidth = (gradeBoxWidth - 12) / 2;
      report.gradeMix.forEach((item, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const cellX = margin + 4 + col * (gradeCellWidth + 4);
        const cellY = y + 11 + row * 8;

        doc.setFillColor(255, 255, 255);
        doc.roundedRect(
          cellX,
          cellY,
          gradeCellWidth,
          6.5,
          1.5,
          1.5,
          "F"
        );

        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(109, 40, 217);
        drawText(item.grade, cellX + 3, cellY + 4.5);

        doc.setTextColor(71, 85, 105);
        drawText(
          `${item.count} (${item.pct.toFixed(2)}%)`,
          cellX + gradeCellWidth - 3,
          cellY + 4.5,
          { align: "right" }
        );
      });

      doc.setFillColor(240, 249, 255);
      doc.setDrawColor(186, 230, 253);
      doc.roundedRect(
        statusBoxX,
        y,
        statusBoxWidth,
        40,
        2.5,
        2.5,
        "FD"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(3, 105, 161);
      drawText(
        "Review Status Mix",
        statusBoxX + 4,
        y + 7
      );

      const totalReview =
        report.reviewMix.original +
        report.reviewMix.revised;
      const originalPct =
        totalReview > 0
          ? (report.reviewMix.original / totalReview) * 100
          : 0;
      const revisedPct =
        totalReview > 0
          ? (report.reviewMix.revised / totalReview) * 100
          : 0;

      addDonutChart(
        statusBoxX + 5,
        y + 10,
        24,
        originalPct,
        revisedPct
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      drawText(
        `Original: ${report.reviewMix.original} (${originalPct.toFixed(2)}%)`,
        statusBoxX + 32,
        y + 19
      );
      drawText(
        `Revised: ${report.reviewMix.revised} (${revisedPct.toFixed(2)}%)`,
        statusBoxX + 32,
        y + 27
      );
      doc.setFont("helvetica", "bold");
      drawText(
        `Total: ${totalReview} cases`,
        statusBoxX + 32,
        y + 35
      );

      y += 48;
    });

    if (isComparisonMode) {
      startNewPage();
      drawSectionTitle(
        "Performance Comparison Analytics",
        "Trend, score distribution and review status for the selected periods"
      );

      const chartTop = y;
      const trendHeight = 67;

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(221, 214, 254);
      doc.roundedRect(
        margin,
        chartTop,
        contentWidth,
        trendHeight,
        2.5,
        2.5,
        "FD"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      drawText(
        `${reportModeName} Trend vs Selected Periods`,
        margin + 4,
        chartTop + 7
      );

      const trendX = margin + 15;
      const trendY = chartTop + 13;
      const trendW = contentWidth - 23;
      const trendH = 43;

      comparisonChartAnalytics.trendTicks.forEach(
        (tick, index) => {
          const lineY =
            trendY +
            (index /
              Math.max(
                1,
                comparisonChartAnalytics.trendTicks.length - 1
              )) *
              trendH;

          doc.setDrawColor(237, 233, 254);
          doc.setLineWidth(0.25);
          doc.line(
            trendX,
            lineY,
            trendX + trendW,
            lineY
          );

          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.5);
          doc.setTextColor(100, 116, 139);
          drawText(
            String(tick),
            trendX - 3,
            lineY + 1.5,
            { align: "right" }
          );
        }
      );

      const trendGap = 5;
      const trendBarWidth =
        (trendW -
          trendGap *
            (comparisonRowsWithDelta.length + 1)) /
        Math.max(1, comparisonRowsWithDelta.length);

      comparisonRowsWithDelta.forEach((row, index) => {
        const barHeight = Math.max(
          2,
          ((row.avgScore -
            comparisonChartAnalytics.trendFloor) /
            comparisonChartAnalytics.trendRange) *
            trendH
        );
        const barX =
          trendX +
          trendGap +
          index * (trendBarWidth + trendGap);
        const barY = trendY + trendH - barHeight;

        doc.setFillColor(124, 58, 237);
        doc.roundedRect(
          barX,
          barY,
          trendBarWidth,
          barHeight,
          1.2,
          1.2,
          "F"
        );

        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.5);
        doc.setTextColor(15, 23, 42);
        drawText(
          row.avgScore.toFixed(2),
          barX + trendBarWidth / 2,
          Math.max(trendY + 3, barY - 2),
          { align: "center" }
        );

        doc.setFont("helvetica", "normal");
        doc.setFontSize(5);
        doc.setTextColor(100, 116, 139);
        wrapText(row.label, 16, 2).forEach(
          (line, lineIndex) => {
            drawText(
              line,
              barX + trendBarWidth / 2,
              trendY + trendH + 5 + lineIndex * 3,
              { align: "center" }
            );
          }
        );
      });

      y += trendHeight + 8;

      const lowerCardWidth = (contentWidth - 5) / 2;
      const lowerCardHeight = 66;

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(221, 214, 254);
      doc.roundedRect(
        margin,
        y,
        lowerCardWidth,
        lowerCardHeight,
        2.5,
        2.5,
        "FD"
      );
      doc.roundedRect(
        margin + lowerCardWidth + 5,
        y,
        lowerCardWidth,
        lowerCardHeight,
        2.5,
        2.5,
        "FD"
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      drawText(
        `Score Distribution (${comparisonChartAnalytics.total} cases)`,
        margin + 4,
        y + 7
      );
      drawText(
        "Review Status Mix",
        margin + lowerCardWidth + 9,
        y + 7
      );

      const distX = margin + 10;
      const distY = y + 13;
      const distW = lowerCardWidth - 16;
      const distTopPadding = 8;
      const distH = 31;
      const bucketGap = 5;
      const bucketWidth =
        (distW -
          bucketGap *
            (comparisonChartAnalytics.scoreBuckets.length + 1)) /
        comparisonChartAnalytics.scoreBuckets.length;

      comparisonChartAnalytics.scoreBuckets.forEach(
        (bucket, index) => {
          const barHeight =
            comparisonChartAnalytics.maxBucketCount > 0
              ? Math.max(
                  bucket.count ? 2 : 0,
                  (bucket.count /
                    comparisonChartAnalytics.maxBucketCount) *
                    distH
                )
              : 0;
          const barX =
            distX +
            bucketGap +
            index * (bucketWidth + bucketGap);
          const barY = distY + distTopPadding + distH - barHeight;

          doc.setFillColor(124, 58, 237);
          doc.roundedRect(
            barX,
            barY,
            bucketWidth,
            barHeight,
            1,
            1,
            "F"
          );

          doc.setFont("helvetica", "bold");
          doc.setFontSize(6);
          doc.setTextColor(15, 23, 42);
          drawText(
            String(bucket.count),
            barX + bucketWidth / 2,
            barY - 2,
            { align: "center" }
          );

          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.5);
          doc.setTextColor(100, 116, 139);
          drawText(
            bucket.label,
            barX + bucketWidth / 2,
            distY + distTopPadding + distH + 5,
            { align: "center" }
          );
        }
      );

      addDonutChart(
        margin + lowerCardWidth + 13,
        y + 13,
        36,
        comparisonChartAnalytics.originalPct,
        comparisonChartAnalytics.revisedPct
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      drawText(
        `Original: ${comparisonChartAnalytics.original} (${comparisonChartAnalytics.originalPct.toFixed(2)}%)`,
        margin + lowerCardWidth + 52,
        y + 27
      );
      drawText(
        `Revised: ${comparisonChartAnalytics.revised} (${comparisonChartAnalytics.revisedPct.toFixed(2)}%)`,
        margin + lowerCardWidth + 52,
        y + 36
      );
      doc.setFont("helvetica", "bold");
      drawText(
        `Total: ${comparisonChartAnalytics.total} cases`,
        margin + lowerCardWidth + 52,
        y + 47
      );

      y += lowerCardHeight + 10;

      topicDifferenceGroups.forEach((group: any) => {
        drawSectionTitle(
          `Topic Difference — ${group.label}`,
          "Only periods using the same QA criteria are compared"
        );

        group.topics.forEach((topic: any, index: number) => {
          const valuesText = topic.values
            .map((value: any) => {
              if (value.pct === null) {
                return `${value.period}: Not Applicable`;
              }

              const delta =
                value.delta === null
                  ? "Base"
                  : `${value.delta > 0 ? "+" : ""}${value.delta.toFixed(2)}`;

              return `${value.period}: ${value.pct.toFixed(2)}% (${delta})`;
            })
            .join("  |  ");

          const lines = wrapText(valuesText, 108, 2);
          const rowHeight = 9 + lines.length * 3.6;

          ensureSpace(rowHeight + 2);

          doc.setFillColor(
            index % 2 === 0 ? 250 : 255,
            index % 2 === 0 ? 248 : 255,
            255
          );
          doc.setDrawColor(226, 232, 240);
          doc.rect(margin, y, contentWidth, rowHeight, "FD");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(15, 23, 42);
          drawText(
            `${topic.code}. ${topic.label}`,
            margin + 3,
            y + 4.8
          );

          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.4);
          doc.setTextColor(71, 85, 105);

          lines.forEach((line, lineIndex) => {
            drawText(
              line,
              margin + 3,
              y + 9 + lineIndex * 3.6
            );
          });

          y += rowHeight;
        });

        y += 6;
      });
    }

    drawSectionTitle(
      "Summary Table",
      isComparisonMode
        ? "Comparison result based on the selected periods"
        : "Result for the selected period"
    );

    const summaryWidths = [76, 22, 28, 24, 20, 16];
    const summaryHeaders = [
      analysisMode === "weekly"
        ? "Week"
        : analysisMode === "monthly"
          ? "Month"
          : "Year",
      "Cases",
      "Average",
      "Change",
      "Grade",
      "Revised",
    ];

    doc.setFillColor(49, 16, 101);
    doc.roundedRect(
      margin,
      y,
      contentWidth,
      9,
      2,
      2,
      "F"
    );

    let summaryX = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);

    summaryHeaders.forEach((header, index) => {
      drawText(
        header,
        index === 0
          ? summaryX + 3
          : summaryX + summaryWidths[index] / 2,
        y + 6,
        {
          align: index === 0 ? "left" : "center",
          color: "#ffffff",
        }
      );
      summaryX += summaryWidths[index];
    });

    y += 9;

    comparisonRowsWithDelta.forEach((row, index) => {
      ensureSpace(9);

      doc.setFillColor(
        index % 2 === 0 ? 255 : 248,
        index % 2 === 0 ? 255 : 250,
        index % 2 === 0 ? 255 : 252
      );
      doc.setDrawColor(226, 232, 240);
      doc.rect(margin, y, contentWidth, 9, "FD");

      const values = [
        row.label,
        String(row.caseCount),
        row.avgScore.toFixed(2),
        row.scoreDelta === null
          ? "Base"
          : `${row.scoreDelta > 0 ? "+" : ""}${row.scoreDelta.toFixed(2)}`,
        String(row.grade),
        String(row.revisedCount),
      ];

      let cellX = margin;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(15, 23, 42);

      values.forEach((value, colIndex) => {
        drawText(
          value,
          colIndex === 0
            ? cellX + 3
            : cellX + summaryWidths[colIndex] / 2,
          y + 5.8,
          {
            align: colIndex === 0 ? "left" : "center",
          }
        );
        cellX += summaryWidths[colIndex];
      });

      y += 9;
    });

    const drawCaseHighlightTable = (
      title: string,
      rows: typeof caseHighlights.strongestCases,
      mode: "strong" | "improve"
    ) => {
      if (!rows.length) return;

      y += 8;

      drawSectionTitle(
        title,
        mode === "strong"
          ? "Top evaluated cases — concise strengths and improvement points"
          : "Lowest-scoring cases — concise coaching points"
      );

      rows.forEach((row, index) => {
        const agentText =
          buildSuspendedAgentLabel(
            row.agent,
            accountProfiles
          );

        const metaLines = wrapText(
          `Agent: ${agentText} | Audit Date: ${row.auditDate}`,
          84,
          2
        );

        const strengthLines =
          row.strengthNotes.flatMap(
            (
              note: any,
              noteIndex: number
            ) =>
              wrapText(
                `${noteIndex + 1}. ${note.label} (${note.pct.toFixed(2)}%) — ${note.detail}`,
                88,
                2
              )
          );

        const improvementLines =
          row.improvementNotes.length
            ? row.improvementNotes.flatMap(
                (
                  note: any,
                  noteIndex: number
                ) =>
                  wrapText(
                    `${noteIndex + 1}. ${note.label} (${note.pct.toFixed(2)}%) — ${note.detail}`,
                    88,
                    2
                  )
              )
            : [
                "• No deducted topic found in this case.",
              ];

        const inquiryLines =
          wrapText(
            `Inquiry: ${row.inquiry}`,
            90,
            2
          );

        const cardHeight =
          24 +
          (
            metaLines.length +
            strengthLines.length +
            improvementLines.length +
            inquiryLines.length
          ) *
            3.6;

        if (
          y + cardHeight >
          contentBottom
        ) {
          startNewPage();

          drawSectionTitle(
            `${title} (continued)`
          );
        }

        const fill =
          mode === "strong"
            ? ([240, 253, 250] as const)
            : ([255, 251, 235] as const);

        const border =
          mode === "strong"
            ? ([110, 231, 183] as const)
            : ([253, 186, 116] as const);

        const accent =
          mode === "strong"
            ? ([5, 150, 105] as const)
            : ([217, 119, 6] as const);

        doc.setFillColor(...fill);
        doc.setDrawColor(...border);

        doc.roundedRect(
          margin,
          y,
          contentWidth,
          cardHeight,
          2.5,
          2.5,
          "FD"
        );

        doc.setFillColor(...accent);

        doc.roundedRect(
          margin,
          y,
          contentWidth,
          10,
          2.5,
          2.5,
          "F"
        );

        doc.setFont(
          "helvetica",
          "bold"
        );
        doc.setFontSize(8);

        drawText(
          `${index + 1}. Case ID: ${row.caseId}`,
          margin + 4,
          y + 6.6,
          { color: "#ffffff" }
        );

        drawText(
          `Score: ${row.score.toFixed(2)}`,
          pageWidth - margin - 4,
          y + 6.6,
          {
            align: "right",
            color: "#ffffff",
          }
        );

        let lineY = y + 16;

        doc.setFont(
          "helvetica",
          "normal"
        );
        doc.setFontSize(6.5);
        doc.setTextColor(
          51,
          65,
          85
        );

        metaLines.forEach(
          (line) => {
            drawText(
              line,
              margin + 5,
              lineY
            );
            lineY += 3.6;
          }
        );

        doc.setFont(
          "helvetica",
          "bold"
        );
        doc.setTextColor(
          5,
          150,
          105
        );

        drawText(
          "Strengths / สิ่งที่ทำได้ดี",
          margin + 5,
          lineY + 1
        );

        lineY += 5;

        doc.setFont(
          "helvetica",
          "normal"
        );
        doc.setTextColor(
          51,
          65,
          85
        );

        strengthLines.forEach(
          (line) => {
            drawText(
              line,
              margin + 7,
              lineY
            );
            lineY += 3.6;
          }
        );

        doc.setFont(
          "helvetica",
          "bold"
        );
        doc.setTextColor(
          180,
          83,
          9
        );

        drawText(
          "Improvements / จุดที่ควรปรับ",
          margin + 5,
          lineY + 1
        );

        lineY += 5;

        doc.setFont(
          "helvetica",
          "normal"
        );
        doc.setTextColor(
          51,
          65,
          85
        );

        improvementLines.forEach(
          (line) => {
            drawText(
              line,
              margin + 7,
              lineY
            );
            lineY += 3.6;
          }
        );

        doc.setFont(
          "helvetica",
          "normal"
        );
        doc.setTextColor(
          71,
          85,
          105
        );

        inquiryLines.forEach(
          (line) => {
            drawText(
              line,
              margin + 5,
              lineY
            );
            lineY += 3.6;
          }
        );

        y += cardHeight + 4;
      });
    };

    drawCaseHighlightTable(
      "Best Cases / Strong Cases",
      caseHighlights.strongestCases,
      "strong"
    );

    drawCaseHighlightTable(
      "Improvement Cases / Coaching Cases",
      caseHighlights.improvementCases,
      "improve"
    );

    if (
      effectiveSelectedAgent === "all" &&
      agentComparisonRows.length
    ) {
      y += 9;
      drawSectionTitle(
        isComparisonMode ? "Agent Comparison" : "Agent Overview",
        "Agent-level score and case coverage"
      );

      const periodHeaders = agentDisplayPeriods.map((period) => period.label);
      const agentColumnWidth = 48;
      const differenceColumnWidth = isComparisonMode ? 22 : 0;
      const periodColumnWidth =
        (
          contentWidth -
          agentColumnWidth -
          differenceColumnWidth
        ) /
        Math.max(1, periodHeaders.length);

      const drawAgentTableHeader = () => {
        const headerHeight = 12;
        doc.setFillColor(109, 40, 217);
        doc.roundedRect(
          margin,
          y,
          contentWidth,
          headerHeight,
          2,
          2,
          "F"
        );

        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.8);

        drawText("Agent", margin + 3, y + 7, { color: "#ffffff" });

        periodHeaders.forEach((header, index) => {
          const centerX =
            margin +
            agentColumnWidth +
            periodColumnWidth * index +
            periodColumnWidth / 2;

          wrapText(header, 15, 2).forEach((line, lineIndex) => {
            drawText(
              line,
              centerX,
              y + 5 + lineIndex * 3.2,
              { align: "center", color: "#ffffff" }
            );
          });
        });

        if (isComparisonMode) {
          drawText(
            "Difference",
            pageWidth - margin - differenceColumnWidth / 2,
            y + 7,
            { align: "center", color: "#ffffff" }
          );
        }

        y += headerHeight;
      };

      drawAgentTableHeader();

      agentComparisonRows.forEach((row: any, index) => {
        const agentLines = wrapText(
          buildSuspendedAgentLabel(row.agent, accountProfiles),
          28,
          2
        );

        const rowHeight = Math.max(10, 4 + agentLines.length * 3.5);

        if (y + rowHeight > contentBottom) {
          startNewPage();
          drawSectionTitle(
            isComparisonMode
              ? "Agent Comparison (continued)"
              : "Agent Overview (continued)"
          );
          drawAgentTableHeader();
        }

        doc.setFillColor(
          index % 2 === 0 ? 255 : 248,
          index % 2 === 0 ? 255 : 250,
          index % 2 === 0 ? 255 : 252
        );
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, y, contentWidth, rowHeight, "FD");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(5.8);
        doc.setTextColor(51, 65, 85);

        agentLines.forEach((line, lineIndex) => {
          drawText(line, margin + 3, y + 5 + lineIndex * 3.5);
        });

        row.values.forEach((value: any, valueIndex: number) => {
          const centerX =
            margin +
            agentColumnWidth +
            periodColumnWidth * valueIndex +
            periodColumnWidth / 2;

          doc.setFont("helvetica", "bold");
          doc.setTextColor(
            value.score === null ? 148 : 91,
            value.score === null ? 163 : 33,
            value.score === null ? 184 : 182
          );

          drawText(
            value.score === null
              ? "No cases"
              : `${value.score.toFixed(2)} (${value.caseCount})`,
            centerX,
            y + 5.5,
            { align: "center" }
          );
        });

        if (isComparisonMode) {
          const differenceText =
            row.overallDelta === null
              ? "N/A"
              : `${row.overallDelta > 0 ? "+" : ""}${row.overallDelta.toFixed(2)}`;

          doc.setFont("helvetica", "bold");
          doc.setTextColor(
            row.overallDelta === null
              ? 148
              : row.overallDelta >= 0
                ? 5
                : 190,
            row.overallDelta === null
              ? 163
              : row.overallDelta >= 0
                ? 150
                : 24,
            row.overallDelta === null
              ? 184
              : row.overallDelta >= 0
                ? 105
                : 93
          );

          drawText(
            differenceText,
            pageWidth - margin - differenceColumnWidth / 2,
            y + 5.5,
            { align: "center" }
          );
        }

        y += rowHeight;
      });
    }

    const pageCount = doc.getNumberOfPages();

    for (
      let pageIndex = 1;
      pageIndex <= pageCount;
      pageIndex += 1
    ) {
      doc.setPage(pageIndex);

      doc.setDrawColor(226, 232, 240);
      doc.line(
        margin,
        pageHeight - 12,
        pageWidth - margin,
        pageHeight - 12
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      drawText(
        `${reportTitle} • ${generatedBy}`,
        margin,
        footerY
      );
      drawText(
        `Page ${pageIndex} of ${pageCount}`,
        pageWidth - margin,
        footerY,
        { align: "right" }
      );
    }

    const fileName =
      `QA_${reportModeName}_${isComparisonMode ? "Comparison" : "Performance"}_Report.pdf`;

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
        title="QA Performance Comparison Center"
        subtitle="Compare ผล QA แบบ Weekly, Monthly และ Yearly พร้อม Topic Performance และรายงานในหน้าเดียว"
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
              <PanelHeader
                title="Build Summary Report"
                subtitle="เลือก 1 ช่วงเพื่อดูรายงานปกติ หรือเลือกหลายช่วงเพื่อเปรียบเทียบ"
              />
              <PanelBody className="space-y-5">
                <div>
                  <FilterLabel>1. Report Type</FilterLabel>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[
                      { value: "weekly", label: "Weekly" },
                      { value: "monthly", label: "Monthly" },
                      { value: "yearly", label: "Yearly" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAnalysisMode(option.value as "weekly" | "monthly" | "yearly")}
                        className={
                          "rounded-2xl border px-3 py-3 text-xs font-black transition " +
                          (analysisMode === option.value
                            ? "border-violet-700 bg-violet-700 text-white shadow-lg shadow-violet-200"
                            : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50")
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <FilterLabel>2. Select Agent</FilterLabel>
                  <div className="mt-2">
                    {roleScopedAgentList.length ? (
                      <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">
                        {effectiveSelectedAgent ? buildSuspendedAgentLabel(effectiveSelectedAgent, accountProfiles) : "-"}
                      </div>
                    ) : (
                      <FilterSelect
                        value={effectiveSelectedAgent || "all"}
                        onChange={(value) => {
                          setSelectedAgent(value);
                          onSelectedAgentChange?.(value);
                        }}
                        options={[{ value: "all", label: "All Agents" }].concat(
                          selectableAgentOptions.map((agent) => ({
                            value: agent,
                            label: buildSuspendedAgentLabel(agent, accountProfiles),
                          }))
                        )}
                      />
                    )}
                  </div>
                </div>

                {analysisMode !== "yearly" ? (
                  <div>
                    <FilterLabel>3. Select Year</FilterLabel>
                    <div className="mt-2">
                      <FilterSelect
                        value={effectivePeriodYear}
                        onChange={(value) => {
                          setPeriodFilterYear(value);
                          setPeriodFilterMonth("all");
                          setSelectedPeriods([]);
                        }}
                        options={selectableYears.map((year) => ({ value: year, label: year }))}
                      />
                    </div>
                  </div>
                ) : null}

                {analysisMode === "weekly" ? (
                  <div>
                    <FilterLabel>4. Filter Month</FilterLabel>
                    <div className="mt-2">
                      <FilterSelect
                        value={periodFilterMonth}
                        onChange={(value) => {
                          setPeriodFilterMonth(value);
                          setSelectedPeriods([]);
                        }}
                        options={weekMonthOptions}
                      />
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <FilterLabel>
                      {analysisMode === "weekly"
                        ? "Select Weeks"
                        : analysisMode === "monthly"
                          ? "Select Months"
                          : "Select Years"}
                    </FilterLabel>
                    <div className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-black text-violet-700">
                      {selectedPeriods.length}/{maxSelectedPeriods}
                    </div>
                  </div>

                  <div
                    className={
                      "mt-2 max-h-[340px] overflow-y-auto rounded-2xl border border-violet-100 bg-violet-50/50 p-3 " +
                      (analysisMode === "monthly"
                        ? "grid grid-cols-2 gap-2"
                        : analysisMode === "yearly"
                          ? "grid grid-cols-2 gap-2"
                          : "space-y-2")
                    }
                  >
                    {periodOptions.map((period) => {
                      const activeSelections = selectedPeriods;
                      const checked = activeSelections.includes(period);
                      const disabled =
                        !checked &&
                        activeSelections.length >= maxSelectedPeriods;

                      return (
                        <button
                          key={period}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            const current = selectedPeriods;
                            if (current.includes(period)) {
                              setSelectedPeriods(current.filter((item) => item !== period));
                              return;
                            }
                            if (current.length >= maxSelectedPeriods) return;
                            setSelectedPeriods(sortPeriodKeys([...current, period]));
                          }}
                          className={
                            "w-full rounded-xl border px-3 py-3 text-left text-sm font-bold transition " +
                            (checked
                              ? "border-violet-600 bg-white text-violet-800 shadow-sm"
                              : disabled
                                ? "cursor-not-allowed border-transparent bg-slate-100 text-slate-400 opacity-60"
                                : "border-transparent bg-white/70 text-slate-700 hover:border-violet-200")
                          }
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span>{getPeriodDisplayLabel(period)}</span>
                            <span className={checked ? "text-violet-700" : "text-slate-300"}>
                              {checked ? "Selected" : ""}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2 text-xs leading-5 text-slate-500">
                    {selectedPeriods.length
                      ? analysisMode === "monthly"
                        ? "เลือกได้สูงสุด 6 เดือน"
                        : analysisMode === "weekly"
                          ? "เลือกได้สูงสุด 4 สัปดาห์"
                          : "เลือกได้สูงสุด 4 ปี"
                      : `ยังไม่ได้เลือก Compare — ระบบกำลังแสดง ${effectivePeriodLabels.join(", ") || "ช่วงปัจจุบัน"} อัตโนมัติ`}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setReportPdfView(viewMode);
                    setReportPdfDialogOpen(true);
                  }}
                  disabled={!effectivePeriodKeys.length}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:from-violet-800 hover:to-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Generate {reportModeName} {isComparisonMode ? "Compare " : ""}Report
                </button>
              </PanelBody>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel>
              <PanelHeader title="Current Viewing Scope" subtitle="ข้อมูลที่กำลังแสดงในหน้า Summary" />
              <PanelBody>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Mode</div>
                    <div className="mt-2 text-sm font-bold text-slate-900">{reportModeName}</div>
                  </div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Agent</div>
                    <div className="mt-2 text-sm font-bold text-slate-900">
                      {effectiveSelectedAgent === "all" ? "All Agents" : buildSuspendedAgentLabel(effectiveSelectedAgent, accountProfiles)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Year</div>
                    <div className="mt-2 text-sm font-bold text-slate-900">
                      {analysisMode === "yearly" ? effectivePeriodLabels.join(", ") : effectivePeriodYear}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4 xl:col-span-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Selected Periods</div>
                    <div className="mt-2 text-sm font-bold leading-5 text-slate-900">
                      {effectivePeriodLabels.join(", ") || "No period"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">Report Mode</div>
                    <div className="mt-2 text-sm font-bold text-slate-900">
                      {isComparisonMode ? "Comparison" : "Single Period"}
                    </div>
                  </div>
                </div>
              </PanelBody>
            </Panel>


            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard title="Cases" value={String(summaryCards.caseCount)} sub="Case(s) in selected periods" />
              <MetricCard title="Average Score" value={summaryCards.avgScore.toFixed(2)} sub="Average score across selected periods" valueClassName="text-violet-700" />
              <MetricCard title="Grade" value={summaryCards.grade} sub="Calculated from selected periods" valueClassName="text-sky-700" accent="from-white via-sky-50/50 to-indigo-100/60 border-sky-200" />
            </div>

            {analysisMode === "monthly" ? (
              <Panel>
                <PanelHeader
                  title="Team Monthly Analytics — Last 3 Months"
                  subtitle="แสดงภาพรวมทีมย้อนหลัง 3 เดือนอัตโนมัติ โดยไม่ต้องเลือก Compare"
                />
                <PanelBody>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(480px,1.2fr)]">
                    <div className="rounded-2xl border border-violet-100 bg-white p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-slate-900">
                            Monthly Average Score Trend
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">
                            Score scale 70–100
                          </div>
                        </div>
                        <div className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
                          Team
                        </div>
                      </div>

                      <div className="relative mt-6 h-[230px]">
                        <div className="absolute inset-x-0 top-0 bottom-10">
                          {[0, 1, 2, 3].map((index) => (
                            <div
                              key={index}
                              className="absolute left-0 right-0 border-t border-violet-100"
                              style={{ top: `${(index / 3) * 100}%` }}
                            />
                          ))}

                          <div className="absolute inset-0 flex items-end gap-6 px-5">
                            {teamMonthlyAnalyticsRows.map((row) => (
                              <div
                                key={row.monthKey}
                                className="relative h-full min-w-0 flex-1"
                              >
                                <div
                                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-black text-slate-800"
                                  style={{
                                    bottom: `calc(${row.barPct}% + 7px)`,
                                  }}
                                >
                                  {row.caseCount
                                    ? row.avgScore.toFixed(2)
                                    : "No data"}
                                </div>

                                <div
                                  className="absolute bottom-0 left-[18%] right-[18%] rounded-t-xl bg-gradient-to-t from-violet-700 to-fuchsia-500 shadow-[0_5px_16px_rgba(124,58,237,0.22)]"
                                  style={{
                                    height: `${row.barPct}%`,
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 flex h-9 gap-6 px-5">
                          {teamMonthlyAnalyticsRows.map((row) => (
                            <div
                              key={row.monthKey}
                              className="min-w-0 flex-1 truncate text-center text-[11px] font-bold text-slate-500"
                              title={row.label}
                            >
                              {row.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-violet-100 bg-white">
                      <table className="min-w-[680px] w-full text-sm">
                        <thead>
                          <tr className="bg-violet-950 text-white">
                            <th className="px-4 py-3 text-left">Month</th>
                            <th className="px-4 py-3 text-center">Cases</th>
                            <th className="px-4 py-3 text-center">Average</th>
                            <th className="px-4 py-3 text-center">Change</th>
                            <th className="px-4 py-3 text-center">Grade</th>
                            <th className="px-4 py-3 text-center">Revised</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamMonthlyAnalyticsRows.map((row) => (
                            <tr key={row.monthKey} className="bg-white">
                              <td className="border-t border-violet-100 px-4 py-4 font-black text-slate-900">
                                {row.label}
                              </td>
                              <td className="border-t border-violet-100 px-4 py-4 text-center font-bold text-slate-700">
                                {row.caseCount}
                              </td>
                              <td className="border-t border-violet-100 px-4 py-4 text-center font-black text-violet-700">
                                {row.caseCount
                                  ? row.avgScore.toFixed(2)
                                  : "No data"}
                              </td>
                              <td
                                className={
                                  "border-t border-violet-100 px-4 py-4 text-center font-black " +
                                  (row.scoreDelta === null
                                    ? "text-slate-400"
                                    : row.scoreDelta >= 0
                                      ? "text-emerald-600"
                                      : "text-rose-600")
                                }
                              >
                                {row.scoreDelta === null
                                  ? "Base"
                                  : `${row.scoreDelta > 0 ? "+" : ""}${row.scoreDelta.toFixed(2)}`}
                              </td>
                              <td className="border-t border-violet-100 px-4 py-4 text-center font-black text-slate-800">
                                {row.caseCount ? row.grade : "-"}
                              </td>
                              <td className="border-t border-violet-100 px-4 py-4 text-center font-bold text-slate-700">
                                {row.revisedCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="border-t border-violet-100 bg-violet-50 px-4 py-3 text-xs font-semibold text-violet-700">
                        ข้อมูลย้อนหลัง 3 เดือนจะแสดงอัตโนมัติ แม้ยังไม่ได้เลือกเดือนสำหรับ Compare
                      </div>
                    </div>
                  </div>
                </PanelBody>
              </Panel>
            ) : null}

            {(analysisMode === "monthly" || analysisMode === "weekly") && effectiveSelectedAgent === "all" && agentComparisonRows.length ? (
              <Panel>
                <PanelHeader
                  title={
                    selectedPeriods.length >= 2
                      ? "Agent Comparison"
                      : analysisMode === "monthly"
                        ? "Monthly Agent Overview"
                        : "Weekly Agent Overview"
                  }
                  subtitle={
                    selectedPeriods.length >= 2
                      ? "แสดงคะแนน Agent แยกตามแต่ละช่วงที่เลือก"
                      : "ยังไม่เลือกช่วงเปรียบเทียบ ระบบจะแสดง Agent ทั้งหมดของช่วงล่าสุด"
                  }
                />
                <PanelBody>
                  <div className="overflow-x-auto rounded-2xl border border-violet-100">
                    <table className="min-w-[900px] w-full text-sm">
                      <thead>
                        <tr className="bg-violet-950 text-white">
                          <th className="px-4 py-3 text-left">Agent</th>
                          {agentDisplayPeriods.map((period) => (
                            <th key={period.label} className="px-4 py-3 text-center">{period.label}</th>
                          ))}
                          <th className="px-4 py-3 text-center">
                            {selectedPeriods.length >= 2 ? "Overall Difference" : "Status"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {agentComparisonRows.map((row: any) => (
                          <tr key={row.agent} className="bg-white">
                            <td className="border-t border-violet-100 px-4 py-3 font-bold text-slate-900">
                              {buildSuspendedAgentLabel(row.agent, accountProfiles)}
                            </td>
                            {row.values.map((value: any) => (
                              <td key={value.period} className="border-t border-violet-100 px-4 py-3 text-center">
                                {value.score === null ? (
                                  <span className="font-bold text-slate-400">N/A</span>
                                ) : (
                                  <>
                                    <div className="font-black text-violet-700">{value.score.toFixed(2)}</div>
                                    <div className="text-[11px] text-slate-500">{value.caseCount} case(s)</div>
                                  </>
                                )}
                              </td>
                            ))}
                            <td className={
                              "border-t border-violet-100 px-4 py-3 text-center font-black " +
                              (row.overallDelta === null
                                ? "text-slate-400"
                                : row.overallDelta >= 0
                                  ? "text-emerald-600"
                                  : "text-rose-600")
                            }>
                              {selectedPeriods.length < 2
                                ? row.values.some((value: any) => value.score !== null) ? "Active" : "No cases"
                                : row.overallDelta === null
                                  ? "N/A"
                                  : (row.overallDelta > 0 ? "+" : "") + row.overallDelta.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </PanelBody>
              </Panel>
            ) : null}

            {periodTopicReports.length ? (
              periodTopicReports.map((report) => (
                <Panel key={report.label}>
                  <PanelHeader
                    title={`Topic Performance — ${report.label}`}
                    subtitle={`${report.caseCount} Cases • Average ${report.avgScore.toFixed(2)} • ${report.status}`}
                  />
                  <PanelBody>
                    {report.status === "In Progress" ? (
                      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                        Partial data — calculated from {report.caseCount} evaluated case(s)
                      </div>
                    ) : null}

                    <div
                      className={
                        "mb-5 grid gap-3 " +
                        (
                          effectiveSelectedAgent ===
                          "all"
                            ? analysisMode ===
                                "monthly"
                              ? "sm:grid-cols-2 xl:grid-cols-5"
                              : "sm:grid-cols-2 xl:grid-cols-3"
                            : analysisMode ===
                                "monthly"
                              ? "sm:grid-cols-2 xl:grid-cols-4"
                              : "sm:grid-cols-2 xl:grid-cols-3"
                        )
                      }
                    >
                      {effectiveSelectedAgent ===
                      "all" ? (
                        <>
                          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-violet-600">
                              Total Cases
                            </div>
                            <div className="mt-1 text-xl font-black text-slate-900">
                              {report.caseCount}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-sky-700">
                              Agents Evaluated
                            </div>
                            <div className="mt-1 text-xl font-black text-slate-900">
                              {report.coverage.agentCount}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50 px-4 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-fuchsia-700">
                              Average / Agent
                            </div>
                            <div className="mt-1 text-xl font-black text-slate-900">
                              {report.coverage.averageCasesPerAgent.toFixed(2)}
                            </div>
                            <div className="text-[11px] font-semibold text-slate-500">
                              Cases per Agent
                            </div>
                          </div>

                          {analysisMode ===
                          "monthly" ? (
                            <>
                              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                                <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                                  Target Met
                                </div>
                                <div className="mt-1 text-xl font-black text-slate-900">
                                  {report.coverage.agentsMeetingTarget}/{report.coverage.agentCount}
                                </div>
                                <div className="text-[11px] font-semibold text-slate-500">
                                  Agents
                                </div>
                              </div>

                              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                                <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                                  Monthly Plan
                                </div>
                                <div className="mt-1 text-lg font-black text-slate-900">
                                  {report.coverage.target} Cases × {report.coverage.agentCount} Agents
                                </div>
                              </div>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-violet-600">
                              Agent
                            </div>
                            <div className="mt-1 text-sm font-black text-slate-900">
                              {buildSuspendedAgentLabel(
                                effectiveSelectedAgent,
                                accountProfiles
                              )}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-sky-700">
                              Evaluated Cases
                            </div>
                            <div className="mt-1 text-xl font-black text-slate-900">
                              {analysisMode ===
                              "monthly"
                                ? `${report.caseCount}/${report.coverage.target}`
                                : report.caseCount}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                              Status
                            </div>
                            <div className="mt-1 text-sm font-black text-slate-900">
                              {report.coverage.selectedAgentStatus || "No Data"}
                            </div>
                          </div>

                          {analysisMode ===
                          "monthly" ? (
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                              <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                                Monthly Target
                              </div>
                              <div className="mt-1 text-xl font-black text-slate-900">
                                {report.coverage.target}
                              </div>
                              <div className="text-[11px] font-semibold text-slate-500">
                                Cases / Agent
                              </div>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>

                    <div
                      className={
                        report.topics.length <= 4
                          ? "space-y-5"
                          : "grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.8fr)]"
                      }
                    >
                      <div className="h-fit self-start overflow-x-auto rounded-2xl border border-violet-100">
                        <table className="min-w-[760px] w-full text-sm">
                          <thead>
                            <tr className="bg-violet-700 text-white">
                              <th className="px-4 py-3 text-left">Topic</th>
                              <th className="px-4 py-3 text-center">Avg</th>
                              <th className="px-4 py-3 text-center">Max</th>
                              <th className="px-4 py-3 text-center">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.topics.map((topic) => (
                              <tr key={topic.code} className="bg-white">
                                <td className="border-t border-violet-100 px-4 py-3 font-bold text-slate-800">
                                  {topic.code}. {topic.label}
                                </td>
                                <td className="border-t border-violet-100 px-4 py-3 text-center font-black text-slate-900">
                                  {topic.avgScore.toFixed(2)}
                                </td>
                                <td className="border-t border-violet-100 px-4 py-3 text-center font-semibold text-slate-600">
                                  {topic.max.toFixed(2)}
                                </td>
                                <td className="border-t border-violet-100 px-4 py-3 text-center font-black text-violet-700">
                                  {topic.pct.toFixed(2)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div
                        className={
                          report.topics.length <= 4
                            ? "grid gap-4 md:grid-cols-2 xl:grid-cols-4"
                            : "space-y-4"
                        }
                      >
                        <div
                          className={
                            report.topics.length <= 4
                              ? "contents"
                              : "grid gap-4 md:grid-cols-2 xl:grid-cols-1"
                          }
                        >
                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                            <div className="text-sm font-black text-emerald-700">Strongest Topics</div>
                            <div className="mt-3 space-y-2">
                              {report.strongest.map((topic, index) => (
                                <div key={topic.code} className="rounded-xl bg-white/80 px-3 py-2">
                                  <div className="text-xs font-bold text-slate-700">{index + 1}. {topic.label}</div>
                                  <div className="mt-1 text-sm font-black text-emerald-700">{topic.pct.toFixed(2)}%</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                            <div className="text-sm font-black text-amber-700">Coaching Focus</div>
                            <div className="mt-3 space-y-2">
                              {report.coaching.map((topic, index) => (
                                <div key={topic.code} className="rounded-xl bg-white/80 px-3 py-2">
                                  <div className="text-xs font-bold text-slate-700">{index + 1}. {topic.label}</div>
                                  <div className="mt-1 text-sm font-black text-amber-700">{topic.pct.toFixed(2)}%</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-violet-100 bg-white p-4">
                          <div className="text-sm font-black text-violet-800">Grade Mix</div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {report.gradeMix.map((item) => (
                              <div key={item.grade} className="flex items-center justify-between rounded-xl bg-violet-50 px-3 py-2 text-xs">
                                <span className="font-black text-violet-800">{item.grade}</span>
                                <span className="font-bold text-slate-600">{item.count} ({item.pct.toFixed(2)}%)</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                          <div className="text-sm font-black text-sky-800">Review Status Mix</div>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-white px-3 py-3 text-center">
                              <div className="text-2xl font-black text-sky-700">{report.reviewMix.original}</div>
                              <div className="mt-1 text-xs font-bold text-slate-500">Original</div>
                            </div>
                            <div className="rounded-xl bg-white px-3 py-3 text-center">
                              <div className="text-2xl font-black text-fuchsia-700">{report.reviewMix.revised}</div>
                              <div className="mt-1 text-xs font-bold text-slate-500">Revised</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </PanelBody>
                </Panel>
              ))
            ) : (
              <Panel>
                <PanelHeader title="Topic Performance" subtitle="No data found for the selected scope" />
                <PanelBody>
                  <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center text-sm text-slate-500">
                    No evaluated cases were found.
                  </div>
                </PanelBody>
              </Panel>
            )}

            {isComparisonMode ? (
              <Panel>
                <PanelHeader
                  title="Performance Comparison Analytics"
                  subtitle="แสดง Trend, Score Distribution และ Review Status Mix ในรูปแบบเดียวกับรายงาน Weekly"
                />
                <PanelBody>
                  <div className="grid gap-4 xl:grid-cols-3">
                    <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
                      <div className="text-sm font-black text-slate-900">
                        {reportModeName} Trend vs Selected Periods
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        Average score comparison
                      </div>

                      <div className="relative mt-5 h-[245px] pl-10">
                        <div className="absolute left-0 top-0 bottom-9 flex w-8 flex-col justify-between text-right text-[10px] font-semibold text-slate-500">
                          {comparisonChartAnalytics.trendTicks.map((tick) => (
                            <span key={tick}>{tick}</span>
                          ))}
                        </div>

                        <div className="absolute left-10 right-0 top-0 bottom-9">
                          {comparisonChartAnalytics.trendTicks.map((tick, index) => (
                            <div
                              key={tick}
                              className="absolute left-0 right-0 border-t border-violet-100"
                              style={{
                                top:
                                  comparisonChartAnalytics.trendTicks.length === 1
                                    ? "0%"
                                    : `${(index / (comparisonChartAnalytics.trendTicks.length - 1)) * 100}%`,
                              }}
                            />
                          ))}

                          <div className="absolute inset-0 flex items-end gap-3 px-2">
                            {comparisonRowsWithDelta.map((row) => {
                              const barHeight = Math.max(
                                5,
                                Math.min(
                                  100,
                                  ((row.avgScore - comparisonChartAnalytics.trendFloor) /
                                    comparisonChartAnalytics.trendRange) *
                                    100
                                )
                              );

                              return (
                                <div key={row.label} className="relative h-full min-w-0 flex-1">
                                  <div
                                    className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-black text-slate-800"
                                    style={{ bottom: `calc(${barHeight}% + 5px)` }}
                                  >
                                    {row.avgScore.toFixed(2)}
                                  </div>
                                  <div
                                    className="absolute bottom-0 left-[16%] right-[16%] rounded-t-md bg-gradient-to-t from-violet-700 to-violet-500 shadow-[0_3px_10px_rgba(124,58,237,0.25)]"
                                    style={{ height: `${barHeight}%` }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="absolute bottom-0 left-10 right-0 flex h-8 gap-3 px-2">
                          {comparisonRowsWithDelta.map((row) => (
                            <div
                              key={row.label}
                              title={row.label}
                              className="min-w-0 flex-1 truncate text-center text-[10px] font-semibold text-slate-500"
                            >
                              {row.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
                      <div className="text-sm font-black text-slate-900">
                        Score Distribution ({comparisonChartAnalytics.total} cases)
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        Final score range
                      </div>

                      <div className="relative mt-5 h-[245px] pb-8">
                        <div className="absolute inset-x-0 top-0 bottom-8">
                          {[0, 1, 2, 3].map((index) => (
                            <div
                              key={index}
                              className="absolute left-0 right-0 border-t border-violet-100"
                              style={{ top: `${(index / 3) * 100}%` }}
                            />
                          ))}

                          <div className="absolute inset-0 flex items-end gap-5 px-4">
                            {comparisonChartAnalytics.scoreBuckets.map((bucket) => {
                              const barHeight = Math.max(
                                bucket.count ? 7 : 0,
                                (bucket.count / comparisonChartAnalytics.maxBucketCount) * 88
                              );

                              return (
                                <div key={bucket.label} className="relative h-full min-w-0 flex-1">
                                  <div
                                    className="absolute left-1/2 -translate-x-1/2 text-[11px] font-black text-slate-800"
                                    style={{ bottom: `calc(${barHeight}% + 5px)` }}
                                  >
                                    {bucket.count}
                                  </div>
                                  <div
                                    className="absolute bottom-0 left-[12%] right-[12%] rounded-t-md bg-gradient-to-t from-violet-700 to-fuchsia-500 shadow-[0_3px_10px_rgba(124,58,237,0.22)]"
                                    style={{ height: `${barHeight}%` }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 flex h-8 gap-5 px-4">
                          {comparisonChartAnalytics.scoreBuckets.map((bucket) => (
                            <div
                              key={bucket.label}
                              className="min-w-0 flex-1 text-center text-[10px] font-semibold text-slate-500"
                            >
                              {bucket.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
                      <div className="text-sm font-black text-slate-900">Review Status Mix</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        Original vs Revised
                      </div>

                      <div className="mt-7 flex flex-col items-center">
                        <div
                          className="relative h-36 w-36 rounded-full"
                          style={{
                            background:
                              comparisonChartAnalytics.total > 0
                                ? `conic-gradient(#7c3aed 0 ${comparisonChartAnalytics.originalPct}%, #d946ef ${comparisonChartAnalytics.originalPct}% 100%)`
                                : "conic-gradient(#e2e8f0 0 100%)",
                          }}
                        >
                          <div className="absolute inset-[20px] flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
                            <div className="text-2xl font-black text-violet-700">
                              {comparisonChartAnalytics.originalPct.toFixed(0)}%
                            </div>
                            <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Original
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 w-full space-y-3">
                          <div className="flex items-center justify-between rounded-xl bg-violet-50 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="h-3 w-3 rounded-full bg-violet-700" />
                              <span className="text-xs font-bold text-slate-700">Original</span>
                            </div>
                            <div className="text-xs font-black text-violet-700">
                              {comparisonChartAnalytics.original} ({comparisonChartAnalytics.originalPct.toFixed(2)}%)
                            </div>
                          </div>

                          <div className="flex items-center justify-between rounded-xl bg-fuchsia-50 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="h-3 w-3 rounded-full bg-fuchsia-500" />
                              <span className="text-xs font-bold text-slate-700">Revised</span>
                            </div>
                            <div className="text-xs font-black text-fuchsia-700">
                              {comparisonChartAnalytics.revised} ({comparisonChartAnalytics.revisedPct.toFixed(2)}%)
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 text-xs font-bold text-slate-500">
                          Total: {comparisonChartAnalytics.total} cases
                        </div>
                      </div>
                    </div>
                  </div>
                </PanelBody>
              </Panel>
            ) : null}

            {isComparisonMode ? (
              topicDifferenceGroups.map((group: any) => (
                <Panel key={group.key}>
                  <PanelHeader
                    title={`Topic Difference — ${group.label}`}
                    subtitle="แสดงผลต่างของ Topic เฉพาะช่วงที่ใช้เกณฑ์ชุดเดียวกัน"
                  />
                  <PanelBody>
                    <div className="overflow-x-auto rounded-2xl border border-violet-100">
                      <table className="min-w-[900px] w-full text-sm">
                        <thead>
                          <tr className="bg-violet-950 text-white">
                            <th className="px-4 py-3 text-left">Topic</th>
                            {group.reports.map((report: any) => (
                              <th key={report.label} className="px-4 py-3 text-center">{report.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {group.topics.map((topic: any) => (
                            <tr key={topic.code} className="bg-white">
                              <td className="border-t border-violet-100 px-4 py-3 font-bold text-slate-800">
                                {topic.code}. {topic.label}
                              </td>
                              {topic.values.map((value: any) => (
                                <td key={value.period} className="border-t border-violet-100 px-4 py-3 text-center">
                                  {value.pct === null ? (
                                    <div className="font-bold text-slate-400">Not Applicable</div>
                                  ) : (
                                    <>
                                      <div className="font-black text-violet-700">{value.pct.toFixed(2)}%</div>
                                      <div className={
                                        "mt-1 text-xs font-black " +
                                        (value.delta === null
                                          ? "text-slate-400"
                                          : value.delta >= 0
                                            ? "text-emerald-600"
                                            : "text-rose-600")
                                      }>
                                        {value.delta === null
                                          ? "Base"
                                          : (value.delta > 0 ? "▲ +" : value.delta < 0 ? "▼ " : "— ") +
                                            value.delta.toFixed(2)}
                                      </div>
                                    </>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </PanelBody>
                </Panel>
              ))
            ) : null}

            <Panel>
              <PanelHeader
                title="Summary Table"
                subtitle={isComparisonMode ? "Comparison result based on selected periods" : "Summary result for selected period"}
              />
              <PanelBody>
                <SummaryTable
                  rows={comparisonRows}
                  firstColLabel={analysisMode === "weekly" ? "Week" : analysisMode === "monthly" ? "Month" : "Year"}
                  showIncentive={false}
                />
              </PanelBody>
            </Panel>

            <div className="grid gap-6 xl:grid-cols-2">
              <Panel>
                <PanelHeader
                  title="Best Cases / Strong Cases"
                  subtitle="Top 5 เคสที่ได้คะแนนสูง โดยสรุปเฉพาะสิ่งที่ทำได้ดีและจุดที่ควรระวัง"
                />
                <PanelBody>
                  <div className="space-y-3">
                    {caseHighlights.strongestCases.length ? (
                      caseHighlights.strongestCases.map((item, index) => (
                        <div
                          key={`strong-${item.caseId}-${index}`}
                          className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-black text-slate-900">
                                {index + 1}. {item.caseId}
                              </div>
                              <div className="mt-1 text-xs font-semibold text-slate-500">
                                {buildSuspendedAgentLabel(
                                  item.agent,
                                  accountProfiles
                                )} • {item.auditDate}
                              </div>
                            </div>

                            <div className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-black text-white">
                              {item.score.toFixed(2)}
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3">
                            <div className="rounded-xl border border-emerald-100 bg-white/90 p-3">
                              <div className="text-xs font-black text-emerald-700">
                                สิ่งที่ทำได้ดี
                              </div>
                              <ul className="mt-2 space-y-2">
                                {item.strengthNotes.map((note, noteIndex) => (
                                  <li
                                    key={`${item.caseId}-strength-${noteIndex}`}
                                    className="flex gap-2 text-xs leading-5 text-slate-700"
                                  >
                                    <span className="font-black text-emerald-600">{noteIndex + 1}.</span>
                                    <span>
                                      <span className="font-black text-slate-900">
                                        {note.label} ({note.pct.toFixed(2)}%)
                                      </span>
                                      {" — "}
                                      {note.detail}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div className="rounded-xl border border-amber-100 bg-white/90 p-3">
                              <div className="text-xs font-black text-amber-700">
                                จุดที่ควรปรับ / ควรระวัง
                              </div>

                              {item.improvementNotes.length ? (
                                <ul className="mt-2 space-y-2">
                                  {item.improvementNotes.map((note, noteIndex) => (
                                    <li
                                      key={`${item.caseId}-improve-${noteIndex}`}
                                      className="flex gap-2 text-xs leading-5 text-slate-700"
                                    >
                                      <span className="font-black text-amber-600">{noteIndex + 1}.</span>
                                      <span>
                                        <span className="font-black text-slate-900">
                                          {note.label} ({note.pct.toFixed(2)}%)
                                        </span>
                                        {" — "}
                                        {note.detail}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="mt-2 text-xs font-bold text-emerald-700">
                                  ไม่พบหัวข้อที่ถูกหักคะแนนในเคสนี้
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
                            <span className="font-black text-slate-800">
                              Inquiry:
                            </span>{" "}
                            {item.inquiry}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center text-sm text-slate-500">
                        No cases found in the selected scope.
                      </div>
                    )}
                  </div>
                </PanelBody>
              </Panel>

              <Panel>
                <PanelHeader
                  title="Improvement Cases / Coaching Cases"
                  subtitle="Top 5 เคสคะแนนต่ำ โดยสรุปจุดเด่นและหัวข้อที่ควรนำไปโค้ชชิ่ง"
                />
                <PanelBody>
                  <div className="space-y-3">
                    {caseHighlights.improvementCases.length ? (
                      caseHighlights.improvementCases.map((item, index) => (
                        <div
                          key={`improve-${item.caseId}-${index}`}
                          className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-black text-slate-900">
                                {index + 1}. {item.caseId}
                              </div>
                              <div className="mt-1 text-xs font-semibold text-slate-500">
                                {buildSuspendedAgentLabel(
                                  item.agent,
                                  accountProfiles
                                )} • {item.auditDate}
                              </div>
                            </div>

                            <div className="rounded-full bg-amber-600 px-3 py-1 text-sm font-black text-white">
                              {item.score.toFixed(2)}
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3">
                            <div className="rounded-xl border border-emerald-100 bg-white/90 p-3">
                              <div className="text-xs font-black text-emerald-700">
                                สิ่งที่ยังทำได้ดี
                              </div>
                              <ul className="mt-2 space-y-2">
                                {item.strengthNotes.map((note, noteIndex) => (
                                  <li
                                    key={`${item.caseId}-good-${noteIndex}`}
                                    className="flex gap-2 text-xs leading-5 text-slate-700"
                                  >
                                    <span className="font-black text-emerald-600">{noteIndex + 1}.</span>
                                    <span>
                                      <span className="font-black text-slate-900">
                                        {note.label} ({note.pct.toFixed(2)}%)
                                      </span>
                                      {" — "}
                                      {note.detail}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div className="rounded-xl border border-amber-100 bg-white/90 p-3">
                              <div className="text-xs font-black text-amber-700">
                                จุดที่ควรปรับ
                              </div>
                              <ul className="mt-2 space-y-2">
                                {item.improvementNotes.map((note, noteIndex) => (
                                  <li
                                    key={`${item.caseId}-coach-${noteIndex}`}
                                    className="flex gap-2 text-xs leading-5 text-slate-700"
                                  >
                                    <span className="font-black text-amber-600">{noteIndex + 1}.</span>
                                    <span>
                                      <span className="font-black text-slate-900">
                                        {note.label} ({note.pct.toFixed(2)}%)
                                      </span>
                                      {" — "}
                                      {note.detail}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600">
                            <span className="font-black text-slate-800">
                              Inquiry:
                            </span>{" "}
                            {item.inquiry}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-5 py-8 text-center text-sm font-bold text-emerald-700">
                        ไม่พบเคสที่มีคะแนนต่ำกว่า 100 ในช่วงที่เลือก
                      </div>
                    )}
                  </div>
                </PanelBody>
              </Panel>
            </div>


          </div>
        </div>
      </div>
    </div>
  );
}



