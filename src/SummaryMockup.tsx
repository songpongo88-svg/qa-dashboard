import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import LoadingMascot from "./LoadingMascot";
import {
  fetchStoredEvaluations,
  getStoredEvaluationMonthKey,
  isNoCaseEvaluation,
  type StoredEvaluation,
} from "./evaluationStore";
import { buildAppealRequests } from "./AppealRequestsMockup";
import { fetchUsageLogsByEventTypes, type UsageLogEvent } from "./usageLog";
import { getIncentiveByGrade, getIncentivePolicyKey, hasRbhPromo, scoreToGrade, type Grade } from "./lib/scoreIncentivePolicy";
import { fetchCachedStaticResponse } from "./staticFileCache";
import { fetchStoredUserProfiles, type StoredUserProfile } from "./userRoleStore";
import PageHero from "./PageHero";
import { canonicalAgentIdentityKey, canonicalizeAgentName, isSameCanonicalAgent, JIRAPONG_AGENT_NAME } from "./lib/agentIdentity";

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
const PERFORMANCE_KPI_TARGET = 85;
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
  JIRAPONG_AGENT_NAME,
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


function getSummaryTeamName(account?: SummaryAccount | null) {
  return String(
    account?.teamName ||
      account?.team_name ||
      account?.team ||
      account?.department ||
      ""
  ).trim();
}

function getPreviousMonthKey(monthKey: string) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 2, 1);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

type GradeGuideRow = {
  range: string;
  grade: Grade;
};

function getGradeGuideRows(monthKey: string): GradeGuideRow[] {
  switch (getIncentivePolicyKey(monthKey)) {
    case "JAN_FEB_2026":
      return [
        { range: "80-100", grade: "A" },
        { range: "70-79", grade: "B" },
        { range: "60-69", grade: "C" },
        { range: "<60", grade: "D" },
      ];
    case "MAR_2026":
      return [
        { range: "90-100", grade: "A" },
        { range: "80-89", grade: "B" },
        { range: "70-79", grade: "C" },
        { range: "60-69", grade: "D" },
        { range: "<60", grade: "F" },
      ];
    default:
      return [
        { range: "90-100", grade: "A" },
        { range: "85-89", grade: "B" },
        { range: "80-84", grade: "C" },
        { range: "<80", grade: "D" },
      ];
  }
}

function getGradePolicyLabel(monthKey: string) {
  if (monthKey === "2026-01") return "January 2026 policy";
  if (monthKey === "2026-02") return "February 2026 policy";
  if (monthKey === "2026-03") return "March 2026 policy";
  if (monthKey === "2026-04") return "April 2026 policy";
  return "Current monthly grade policy";
}

function getTotalIncentiveForCases(cases: CaseItem[]) {
  const groups = new Map<string, CaseItem[]>();

  cases.forEach((item) => {
    const key = `${canonicalAgentIdentityKey(item.agent)}|${item.monthKey}`;
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  });

  return [...groups.values()].reduce((sum, groupCases) => {
    const summary = summarizeCases(groupCases);
    return sum + summary.incentive;
  }, 0);
}

function sanitizePdfFilePart(value: unknown, fallback = "Report") {
  const text = String(value || "")
    .trim()
    .replace(/\s+-\s+/g, "_to_")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^-+|-+$/g, "")
    .replace(/^_+|_+$/g, "");
  return text || fallback;
}

async function ensureSarabunPdfFont() {
  if (typeof document === "undefined") return;

  const fontQuery = '400 16px "Sarabun"';

  if (!document.fonts?.check(fontQuery)) {
    const existingLink = document.querySelector<HTMLLinkElement>(
      'link[data-summary-pdf-sarabun="true"]'
    );

    if (!existingLink) {
      await new Promise<void>((resolve) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href =
          "https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap";
        link.dataset.summaryPdfSarabun = "true";
        link.onload = () => resolve();
        link.onerror = () => resolve();
        document.head.appendChild(link);
      });
    }
  }

  try {
    await document.fonts?.load('400 16px "Sarabun"');
    await document.fonts?.load('700 16px "Sarabun"');
  } catch {
    // Use a Thai-compatible fallback font.
  }
}

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
  const formattedName = String(value || "")
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
  return canonicalizeAgentName(formattedName);
}

function isSameAgent(a: string, b: string) {
  return isSameCanonicalAgent(a, b);
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

// data-unified-monthly-status-incentive-v129-fix2
function getMonthlyPerformanceResult(
  caseCount: number,
  avg: number,
  monthKey: string,
  criticalError = false
) {
  const grade = scoreToGrade(
    avg,
    monthKey,
    criticalError
  );
  const incentive = getIncentiveByGrade(
    grade,
    monthKey
  );
  const completed = caseCount >= CASE_TARGET;
  const eligible =
    completed &&
    !criticalError &&
    (incentive.cash > 0 ||
      incentive.promo > 0);

  return {
    grade,
    incentive,
    completed,
    eligible,
  };
}

function getIncentiveValue(
  caseCount: number,
  avg: number,
  monthKey: string,
  criticalError = false
) {
  const result = getMonthlyPerformanceResult(
    caseCount,
    avg,
    monthKey,
    criticalError
  );
  return result.eligible
    ? result.incentive.total
    : 0;
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
    canonicalAgentIdentityKey(agent),
    formatEvaluationDateKey(auditRaw),
    scoreKey,
    buildTopicScoreHash(topics),
  ].join("|");
}

function buildCaseMergeKey(item: Pick<CaseItem, "caseId" | "agent" | "evaluationKey">) {
  const caseId = normalizeEvaluationKeyPart(item.caseId).toUpperCase();
  const agent = canonicalAgentIdentityKey(item.agent);
  if (caseId && agent) return ["case", caseId, agent].join("|");
  return item.evaluationKey;
}

function buildTopicSummary(cases: CaseItem[]): TopicSummary[] {
  if (!cases.length) return [];

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
  const avgScore = caseCount
    ? roundToTwo(
        cases.reduce(
          (sum, item) =>
            sum + item.finalScore,
          0
        ) / caseCount
      )
    : 0;
  const revisedCount = cases.filter(
    (item) => item.reviewStatus === "Revised"
  ).length;
  const policyMonthKey =
    getPolicyMonthKeyForCases(cases);
  const criticalError = cases.some(
    (item) => item.grade === "G"
  );
  const performance =
    getMonthlyPerformanceResult(
      caseCount,
      avgScore,
      policyMonthKey,
      criticalError
    );

  return {
    caseCount,
    avgScore,
    revisedCount,
    grade: performance.grade,
    incentive: performance.eligible
      ? performance.incentive.total
      : 0,
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
  // data-zero-case-agent-grade-v122-fix
  return agentNames
    .filter(
      (agentName) =>
        !shouldHideAgentByMonth(agentName, fallbackMonthKey)
    )
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
    <div className={`relative overflow-hidden rounded-[22px] border border-slate-200/90 bg-white shadow-[0_6px_22px_rgba(15,23,42,0.05)] ${className}`}>
      {isSongkranThemeActive() ? <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-70" /> : null}
      {children}
    </div>
  );
}

function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const songkranTheme = isSongkranThemeActive();
  return (
    <div className={`border-b px-5 py-4 ${songkranTheme ? "border-cyan-100 bg-cyan-50/40" : "border-slate-100 bg-white"}`}>
      <div className="text-[16px] font-semibold tracking-tight text-slate-900">{title}</div>
      {subtitle ? <div className="mt-1 text-[11px] font-normal text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

function PanelBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-5 lg:p-6 ${className}`}>{children}</div>;
}

function MetricCard({ title, value, sub, accent = "from-white via-violet-50/40 to-fuchsia-50/60 border-violet-200/70", valueClassName = "text-slate-900" }: { title: string; value: string; sub: string; accent?: string; valueClassName?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[20px] border bg-gradient-to-br ${accent} shadow-[0_5px_18px_rgba(15,23,42,0.05)]`}>
      <div className="h-1 bg-gradient-to-r from-violet-700 via-violet-600 to-fuchsia-500" />
      <div className="p-5">
        <div className="text-xs font-medium tracking-wide text-slate-500">{title}</div>
        <div className={`mt-2 text-3xl font-semibold tracking-tight ${valueClassName}`}>{value}</div>
        <div className="mt-2 text-[11px] font-normal leading-5 text-slate-500">{sub}</div>
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
  return <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{children}</div>;
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100">
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
  localizedHeaders = false,
}: {
  rows: PeriodRow[];
  firstColLabel: string;
  showIncentive?: boolean;
  localizedHeaders?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className={`${showIncentive ? "min-w-[880px]" : "min-w-[760px]"} w-full text-sm`}>
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-4 py-3 text-left">
              {localizedHeaders ? "ช่วงเวลา" : firstColLabel}
            </th>
            <th className="px-4 py-3 text-center">
              {localizedHeaders ? "จำนวนเคส" : "Cases"}
            </th>
            <th className="px-4 py-3 text-center">
              {localizedHeaders ? "คะแนนเฉลี่ย" : "Average Score"}
            </th>
            <th className="px-4 py-3 text-center">
              {localizedHeaders ? "เกรด" : "Grade"}
            </th>
            {showIncentive ? (
              <th className="px-4 py-3 text-center">
                {localizedHeaders ? "อินเซนทีฟ" : "Incentive"}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={row.label} className="bg-white">
              <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">{row.label}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{row.caseCount}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{row.avgScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(row.grade)}`}>{row.grade}</span></td>
              {showIncentive ? <td className="border-t border-slate-200 px-4 py-3 text-center">{formatCurrencyTHB(row.incentive)}</td> : null}
            </tr>
          )) : (
            <tr><td colSpan={showIncentive ? 5 : 4} className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No data found</td></tr>
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
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">Visible Rows</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{rows.length}</div>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-500">Total Cases</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{rows.reduce((sum, row) => sum + row.caseCount, 0)}</div>
        </div>
        <div className="rounded-2xl border border-white/70 bg-white/85 px-4 py-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-500">Zero Case Rows</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{rows.filter((row) => row.caseCount === 0).length}</div>
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
                    <td className="border-t border-slate-100 px-4 py-3 font-medium text-slate-950">{row.label}</td>
                    <td className="border-t border-slate-100 px-4 py-3 text-center font-semibold">{row.caseCount}</td>
                    <td className="border-t border-slate-100 px-4 py-3 text-center font-semibold">{row.avgScore.toFixed(2)}</td>
                    <td className="border-t border-slate-100 px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(row.grade)}`}>{row.grade}</span>
                    </td>
                    <td className="border-t border-slate-100 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-500" style={{ width: `${completion}%` }} />
                        </div>
                        <div className="w-14 text-right text-xs font-medium text-slate-500">{row.caseCount}/{CASE_TARGET}</div>
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
              <td className="border-t border-slate-200 px-3 py-3">
                <AnalyticsBilingualTopicLabel label={topic.label} />
              </td>
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

const ANALYTICS_TOPIC_TITLES: Record<
  string,
  { thai: string; english: string }
> = {
  "Process & Policy Compliance": {
    thai: "ขั้นตอนการทำงานและนโยบาย",
    english: "Process & Policy Compliance",
  },
  "Answer Quality & Problem Analysis": {
    thai: "คุณภาพคำตอบและการวิเคราะห์ปัญหา",
    english: "Answer Quality & Problem Analysis",
  },
  "Case Handling & Follow-up": {
    thai: "การดูแลเคสและติดตามผล",
    english: "Case Handling & Follow-up",
  },
  "Communication Skills": {
    thai: "ทักษะการสื่อสาร",
    english: "Communication Skills",
  },
};

const ANALYTICS_TOPIC_GROUP_TITLES: Record<string, string> = {
  "1": "ขั้นตอนการทำงานและนโยบาย",
  "2": "คุณภาพคำตอบ",
  "3": "การวิเคราะห์และดูแลเคส",
  "4": "ทักษะการสื่อสาร",
  "5": "การปฏิบัติตามกระบวนการ",
};

function splitAnalyticsTopicTitle(label: string) {
  const mappedTitle = ANALYTICS_TOPIC_TITLES[label];
  const bilingualFallback = label.match(
    /^(.+?)\s*\(([^()]*)\)$/
  );

  return {
    thai:
      mappedTitle?.thai ||
      bilingualFallback?.[1]?.trim() ||
      label,
    english:
      mappedTitle?.english ||
      bilingualFallback?.[2]?.trim() ||
      "",
  };
}

function AnalyticsBilingualTopicLabel({
  label,
  code,
  className = "",
  thaiClassName = "text-[12px] font-bold leading-5 text-slate-950",
  englishClassName = "mt-0.5 text-[11px] font-bold italic leading-5 text-rose-600",
}: {
  label: string;
  code?: string;
  className?: string;
  thaiClassName?: string;
  englishClassName?: string;
}) {
  const { thai, english } = splitAnalyticsTopicTitle(label);

  return (
    <div className={className}>
      <div className={thaiClassName}>
        {code ? `${code}. ` : ""}{thai}
      </div>
      {english ? (
        <div className={englishClassName}>{english}</div>
      ) : null}
    </div>
  );
}

function buildAnalyticsTopicGroups(topics: TopicSummary[]) {
  const hasNestedTopicCodes = topics.some((topic) =>
    /^[^.]+\..+$/.test(topic.code.trim())
  );
  const topicGroups = new Map<
    string,
    { code: string; title: string; topics: TopicSummary[] }
  >();

  topics.forEach((topic) => {
    const nestedCodeMatch = topic.code.trim().match(/^([^.]+)\..+$/);
    const groupCode =
      hasNestedTopicCodes && nestedCodeMatch
        ? nestedCodeMatch[1]
        : "all";
    const groupTitle =
      groupCode === "all"
        ? "หัวข้อการประเมิน"
        : ANALYTICS_TOPIC_GROUP_TITLES[groupCode] ||
          `หมวดการประเมิน ${groupCode}`;
    const existingGroup = topicGroups.get(groupCode);

    if (existingGroup) {
      existingGroup.topics.push(topic);
      return;
    }

    topicGroups.set(groupCode, {
      code: groupCode,
      title: groupTitle,
      topics: [topic],
    });
  });

  return [...topicGroups.values()]
    .sort((left, right) =>
      left.code.localeCompare(right.code, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    )
    .map((group) => {
      const totalAverageScore = group.topics.reduce(
        (sum, topic) => sum + topic.avgScore,
        0
      );
      const totalMaxScore = group.topics.reduce(
        (sum, topic) => sum + topic.max,
        0
      );

      return {
        ...group,
        averageScore: totalAverageScore,
        maxScore: totalMaxScore,
        percentage: totalMaxScore
          ? (totalAverageScore / totalMaxScore) * 100
          : 0,
      };
    });
}

function AnalyticsGroupedTopicDetail({
  topics,
}: {
  topics: TopicSummary[];
}) {
  const groups = buildAnalyticsTopicGroups(topics);

  return (
    <div
      data-analytics-grouped-topics-v146="true"
      className="space-y-4"
    >
      {groups.map((group) => {
        const groupDifference =
          group.percentage - PERFORMANCE_KPI_TARGET;
        const groupMeetsKpi = groupDifference >= 0;

        return (
          <section
            key={group.code}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
          >
            <div className="flex flex-col gap-3 border-b border-violet-100 bg-violet-50/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {group.code !== "all" ? (
                    <span className="inline-flex rounded-lg bg-violet-700 px-2.5 py-1 text-[10px] font-semibold text-white">
                      หมวด {group.code}
                    </span>
                  ) : null}
                  <h3 className="text-[13px] font-semibold text-slate-950">
                    {group.title}
                  </h3>
                </div>
                <div className="mt-1 text-[10px] font-normal text-slate-500">
                  {group.topics.length} หัวข้อการประเมิน
                </div>
              </div>

              <div className="flex items-center gap-3 sm:justify-end">
                <div className="text-left sm:text-right">
                  <div className="text-[10px] font-normal text-slate-500">
                    คะแนนเฉลี่ยรวม
                  </div>
                  <div className="mt-0.5 text-[13px] font-semibold text-slate-950">
                    {group.averageScore.toFixed(2)}/{group.maxScore}
                  </div>
                </div>
                <div
                  className={
                    "min-w-[78px] rounded-xl px-3 py-2 text-center " +
                    (groupMeetsKpi
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-rose-100 text-rose-700")
                  }
                >
                  <div className="text-[15px] font-semibold">
                    {group.percentage.toFixed(2)}%
                  </div>
                  <div className="mt-0.5 text-[9px] font-medium">
                    {groupMeetsKpi ? "ผ่าน KPI" : "ต่ำกว่า KPI"}
                  </div>
                </div>
              </div>
            </div>

            <div className="hidden grid-cols-[minmax(0,1fr)_120px_92px_142px] gap-3 bg-slate-50/80 px-4 py-2.5 text-[10px] font-medium text-slate-500 sm:grid">
              <div>หัวข้อการประเมิน</div>
              <div className="text-right">คะแนนเฉลี่ย</div>
              <div className="text-right">ผลคะแนน</div>
              <div className="text-right">เทียบเกณฑ์ KPI</div>
            </div>

            <div className="divide-y divide-slate-100">
              {group.topics.map((topic) => {
                const kpiDifference =
                  topic.pct - PERFORMANCE_KPI_TARGET;
                const meetsKpi = kpiDifference >= 0;

                return (
                  <div
                    key={topic.code}
                    className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_120px_92px_142px] sm:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="inline-flex min-w-[38px] shrink-0 justify-center rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                          {topic.code}
                        </span>
                        <AnalyticsBilingualTopicLabel
                          label={topic.label}
                          className="min-w-0 pt-0.5"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                      <span className="text-[10px] font-normal text-slate-500 sm:hidden">
                        คะแนนเฉลี่ย
                      </span>
                      <span className="text-[12px] font-medium text-slate-700">
                        {topic.avgScore.toFixed(2)}/{topic.max}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                      <span className="text-[10px] font-normal text-slate-500 sm:hidden">
                        ผลคะแนน
                      </span>
                      <span className="text-[13px] font-semibold text-slate-950">
                        {topic.pct.toFixed(2)}%
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="text-[10px] font-normal text-slate-500 sm:hidden">
                        เทียบเกณฑ์ KPI
                      </span>
                      <span
                        className={
                          "inline-flex min-w-[126px] justify-center rounded-full px-3 py-1.5 text-[10px] font-semibold " +
                          (meetsKpi
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-600")
                        }
                      >
                        {meetsKpi ? "ผ่าน KPI" : "ต่ำกว่า KPI"}{" "}
                        {meetsKpi ? "+" : "−"}
                        {Math.abs(kpiDifference).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AnalyticsTopicDetail({ topics }: { topics: TopicSummary[] }) {
  const orderedTopics = [...topics].sort((left, right) =>
    left.code.localeCompare(right.code, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  );

  if (!orderedTopics.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-normal text-slate-400">
        ไม่มีข้อมูลคะแนนรายหัวข้อ
      </div>
    );
  }

  if (orderedTopics.length > 4) {
    return <AnalyticsGroupedTopicDetail topics={orderedTopics} />;
  }

  const ringRadius = 42;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const kpiMarkerRotation =
    (PERFORMANCE_KPI_TARGET / 100) * 360;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {orderedTopics.map((topic) => {
          const normalizedPercent = Math.max(
            0,
            Math.min(100, topic.pct)
          );
          const progressOffset =
            ringCircumference *
            (1 - normalizedPercent / 100);
          const kpiDifference =
            topic.pct - PERFORMANCE_KPI_TARGET;
          const meetsKpi = kpiDifference >= 0;
          const { thai: thaiTitle, english: englishTitle } =
            splitAnalyticsTopicTitle(topic.label);
          const accessibleTitle = englishTitle
            ? `${thaiTitle}, ${englishTitle}`
            : thaiTitle;

          return (
            <div
              key={topic.code}
              className="flex min-w-0 flex-col items-center rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-5 text-center"
            >
              <div className="w-full px-2 text-center">
                <div className="text-[12px] font-bold leading-5 text-slate-950">
                  <span className="mr-1.5 text-slate-950">
                    {topic.code}.
                  </span>
                  {thaiTitle}
                </div>
                {englishTitle ? (
                  <div className="mt-1 text-[14px] font-bold italic leading-5 text-rose-600">
                    {englishTitle}
                  </div>
                ) : null}
              </div>

              <div className="relative mt-4 h-32 w-32 shrink-0">
                <svg
                  viewBox="0 0 100 100"
                  className="h-full w-full"
                  role="img"
                  aria-label={`${accessibleTitle}: ${topic.pct.toFixed(2)}%, KPI ${PERFORMANCE_KPI_TARGET}%`}
                >
                  <circle
                    cx="50"
                    cy="50"
                    r={ringRadius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="7"
                    className="text-slate-200"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r={ringRadius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={progressOffset}
                    transform="rotate(-90 50 50)"
                    className="text-violet-600"
                  />
                  <line
                    x1="50"
                    y1="3"
                    x2="50"
                    y2="14"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    transform={`rotate(${kpiMarkerRotation} 50 50)`}
                    className="text-rose-500"
                  />
                </svg>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-xl font-medium text-slate-950">
                    {topic.pct.toFixed(2)}%
                  </div>
                  <div className="mt-0.5 text-[9px] font-normal text-slate-400">
                    KPI {PERFORMANCE_KPI_TARGET}%
                  </div>
                </div>
              </div>

              <div className="mt-3 text-[10px] font-normal text-slate-500">
                คะแนนเฉลี่ย {topic.avgScore.toFixed(2)}/{topic.max}
              </div>
              <div
                className={
                  "mt-1 text-[10px] font-medium " +
                  (meetsKpi
                    ? "text-emerald-700"
                    : "text-rose-600")
                }
              >
                {meetsKpi ? "ผ่าน KPI" : "ต่ำกว่า KPI"}{" "}
                {meetsKpi ? "+" : "−"}
                {Math.abs(kpiDifference).toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthlyGradeIncentiveCriteriaV144({
  monthKey,
  monthlyMode,
  periodLabel,
}: {
  monthKey: string;
  monthlyMode: boolean;
  periodLabel: string;
}) {
  const promoActiveForMonth = monthlyMode && hasRbhPromo(monthKey);

  return (
    <section
      data-monthly-grade-incentive-criteria-v144="true"
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-[18px] border border-violet-200 bg-white shadow-[0_8px_24px_rgba(76,29,149,0.08)]"
    >
      <div className="flex min-h-[88px] flex-wrap items-start justify-between gap-3 border-b border-violet-200 bg-gradient-to-r from-violet-950 via-violet-800 to-violet-600 px-4 py-4 text-white">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-200">Monthly Policy Reference</div>
          <h3 className="mt-1 text-[14px] font-bold">Monthly Grade &amp; Incentive Criteria</h3>
          <p className="mt-1 text-[10px] font-medium text-violet-100">
            {monthlyMode
              ? `${periodLabel || "Selected month"} · ${getGradePolicyLabel(monthKey)}`
              : "Select Monthly view to see the monthly Grade and Incentive criteria"}
          </p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-base font-bold text-emerald-200">฿</div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        {monthlyMode ? (
          <div className="overflow-x-auto rounded-xl border border-violet-200 bg-white">
            <table className="w-full min-w-[430px] text-[10px]">
              <thead>
                <tr className="bg-slate-900 text-left font-semibold text-white">
                  <th className="px-3 py-2.5">Grade</th>
                  <th className="px-3 py-2.5">Score Range</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Cash Incentive</th>
                  {promoActiveForMonth ? <th className="px-3 py-2.5 text-right">Promo</th> : null}
                </tr>
              </thead>
              <tbody>
                {getGradeGuideRows(monthKey).map((row, index) => {
                  const incentive = getIncentiveByGrade(row.grade, monthKey);

                  return (
                    <tr key={`grade-incentive-${row.grade}`} className={`border-t border-slate-100 ${index % 2 === 0 ? "bg-white" : "bg-violet-50/45"}`}>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border font-semibold ${getGradeTone(row.grade)}`}>{row.grade}</span>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-700">{row.range}</td>
                      <td className="px-3 py-2.5 text-slate-600">{incentive.remark}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                        {incentive.cash > 0 ? `฿${incentive.cash.toLocaleString("en-US")}` : "—"}
                      </td>
                      {promoActiveForMonth ? (
                        <td className="px-3 py-2.5 text-right font-medium text-slate-600">
                          {incentive.promo > 0 ? `${incentive.promo.toLocaleString("en-US")} RBH` : "—"}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-violet-300 bg-white/70 px-4 py-7 text-center text-xs font-medium text-slate-500">
            Grade and Incentive criteria are available in Monthly view.
          </div>
        )}

        <p className="mt-auto border-l-2 border-violet-400 pl-3 pt-3 text-[9px] font-medium leading-4 text-slate-500">
          Score range, status and incentive follow the selected month. Incentive requires at least {CASE_TARGET} evaluated cases and all applicable monthly conditions. Promo is shown only when active.
        </p>
      </div>
    </section>
  );
}

function AnalyticsAgentPerformanceV92({
  cases,
  agentNames,
  noCaseAgentNames,
  accountProfiles,
  monthKey,
  monthlyMode,
  selectedAgent,
  periodLabel,
  canSelectAgent,
  onSelectAgent,
}: {
  cases: CaseItem[];
  agentNames: string[];
  noCaseAgentNames: string[];
  accountProfiles: StoredUserProfile[];
  monthKey: string;
  monthlyMode: boolean;
  selectedAgent: string;
  periodLabel: string;
  canSelectAgent: boolean;
  onSelectAgent: (agent: string) => void;
}) {
  const [agentSortTab, setAgentSortTab] = useState<
    "ranking" | "alphabetical"
  >(() =>
    window.sessionStorage.getItem("qa_analytics_agent_sort_tab_v134") === "alphabetical"
      ? "alphabetical"
      : "ranking"
  );

  useEffect(() => {
    window.sessionStorage.setItem("qa_analytics_agent_sort_tab_v134", agentSortTab);
  }, [agentSortTab]);

  const rows = useMemo(() => {
    const names = new Map<string, string>();

    [...agentNames, ...cases.map((item) => item.agent)]
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      .forEach((name) => {
        const canonicalName = canonicalizeAgentName(name);
        const key = canonicalAgentIdentityKey(canonicalName);
        if (!names.has(key)) names.set(key, canonicalName);
      });

    return [...names.values()]
      .map((agent) => {
        const agentCases = cases.filter((item) => isSameAgent(item.agent, agent));
        const caseCount = agentCases.length;
        const average = caseCount
          ? Number(
              (
                agentCases.reduce((sum, item) => sum + item.finalScore, 0) /
                caseCount
              ).toFixed(2)
            )
          : 0;
        const criticalError = agentCases.some(
          (item) => item.grade === "G"
        );
        const monthlyPerformance =
          getMonthlyPerformanceResult(
            caseCount,
            average,
            monthKey,
            criticalError
          );
        const grade = monthlyPerformance.grade;
        const hasNoCaseMonthlyResult =
          caseCount === 0 &&
          monthlyMode &&
          noCaseAgentNames.some((name) =>
            isSameAgent(agent, name)
          );
        const gradeReady =
          hasNoCaseMonthlyResult ||
          (caseCount > 0 &&
            (!monthlyMode ||
              monthlyPerformance.completed));
        const kpiPassed =
          caseCount > 0 &&
          average >= PERFORMANCE_KPI_TARGET;
        const completed =
          monthlyMode &&
          monthlyPerformance.completed;
        const incentiveResult =
          monthlyMode &&
          monthlyPerformance.eligible
            ? monthlyPerformance.incentive
            : null;
        const profile =
          accountProfiles.find(
            (item) =>
              isSameAgent(item.agentName, agent) ||
              isSameAgent(item.displayName, agent)
          ) || null;
        const displayName = profile?.displayName || agent;
        const initials =
          displayName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part.charAt(0).toUpperCase())
            .join("") || "A";

        return {
          agent,
          displayName,
          initials,
          caseCount,
          average,
          grade,
          criticalError,
          hasNoCaseMonthlyResult,
          gradeReady,
          kpiPassed,
          completed,
          incentiveCash: incentiveResult?.cash || 0,
          incentivePromo: incentiveResult?.promo || 0,
          revisedCount: agentCases.filter(
            (item) => item.reviewStatus === "Revised"
          ).length,
        };
      })
      .filter((row) => row.caseCount > 0 || row.hasNoCaseMonthlyResult)
      .sort(
        (left, right) =>
          right.average - left.average ||
          right.caseCount - left.caseCount ||
          left.displayName.localeCompare(right.displayName)
      );
  }, [accountProfiles, agentNames, cases, monthKey, monthlyMode, noCaseAgentNames]);

  const allAgentsMode = selectedAgent === "all";
  // data-analytics-layout-promo-readable-v128
  const visibleRows = useMemo(() => {
    if (!allAgentsMode || agentSortTab === "ranking") {
      return rows;
    }

    return [...rows].sort(
      (left, right) =>
        left.displayName.localeCompare(
          right.displayName,
          "en",
          { sensitivity: "base" }
        ) ||
        left.agent.localeCompare(
          right.agent,
          "en",
          { sensitivity: "base" }
        )
    );
  }, [rows, allAgentsMode, agentSortTab]);
  // data-topic-status-allagents-incentive-v131-fix
  const incentiveText = (row: (typeof rows)[number]) => {
    const notEligibleText = allAgentsMode ? "฿0 (Not Eligible)" : "Not Eligible";
    if (!monthlyMode) return "Monthly only";
    if (row.hasNoCaseMonthlyResult) {
      return allAgentsMode ? "฿0 (Not Eligible)" : "฿0";
    }
    if (row.caseCount < CASE_TARGET) {
      return `Pending ${row.caseCount}/${CASE_TARGET}`;
    }
    if (row.incentiveCash <= 0 && row.incentivePromo <= 0) {
      return notEligibleText;
    }

    const cash = `฿${row.incentiveCash.toLocaleString("en-US")}`;
    return row.incentivePromo > 0
      ? `${cash} + ${row.incentivePromo.toLocaleString("en-US")} RBH`
      : cash;
  };

  return (
    <div
      data-analytics-agent-incentive-v92="true"
      data-agent-no-data-logic-v111="true"
      data-agent-performance-tabs-v132="true"
      data-agent-performance-kpi-score-only-v1="true"
      className="space-y-5"
    >
      <div className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_5px_16px_rgba(15,23,42,0.04)]">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[15px] font-semibold text-slate-900">
                {allAgentsMode
                  ? "Agent Performance (All Agents)"
                  : "Individual Agent Analysis"}
              </div>
              <div className="mt-1 text-[10px] font-normal text-slate-500">
                {periodLabel || "Current selection"} ·{" "}
                {allAgentsMode && agentSortTab === "alphabetical"
                  ? "Sorted by Agent name A–Z"
                  : "Ranked by average score"}
              </div>
            </div>
            <div className="rounded-full bg-violet-50 px-3 py-1.5 text-[10px] font-medium text-violet-700">
              {rows.length} Agent{rows.length === 1 ? "" : "s"}
            </div>
          </div>

          {allAgentsMode ? (
            <div className="mt-4 inline-flex rounded-xl border border-violet-200 bg-violet-50/70 p-1">
              <button
                type="button"
                onClick={() => setAgentSortTab("ranking")}
                className={
                  "rounded-lg px-4 py-2 text-[11px] font-medium transition " +
                  (agentSortTab === "ranking"
                    ? "bg-violet-700 text-white shadow-sm"
                    : "text-violet-700 hover:bg-white")
                }
              >
                Performance Ranking
              </button>
              <button
                type="button"
                onClick={() => setAgentSortTab("alphabetical")}
                className={
                  "rounded-lg px-4 py-2 text-[11px] font-medium transition " +
                  (agentSortTab === "alphabetical"
                    ? "bg-violet-700 text-white shadow-sm"
                    : "text-violet-700 hover:bg-white")
                }
              >
                Agent A–Z
              </button>
            </div>
          ) : null}
        </div>

        <div className="max-h-[520px] overflow-auto">
          <table className="min-w-[1080px] w-full text-[11px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50 text-left font-normal text-slate-500">
                <th className="w-12 px-4 py-3 text-center">#</th>
                <th className="px-3 py-3">Agent</th>
                <th className="px-3 py-3 text-center">Cases</th>
                <th className="px-3 py-3 text-center">Average</th>
                <th className="px-3 py-3 text-center">KPI Status</th>
                <th className="px-3 py-3 text-center">Grade</th>
                <th className="px-4 py-3 text-right">Incentive</th>
                {allAgentsMode ? (
                  <th className="px-4 py-3 text-right">Details</th>
                ) : null}
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((row, index) => (
                <tr
                  key={row.agent}
                  className="border-t border-slate-100 bg-white transition hover:bg-violet-50/40"
                >
                  <td className="px-4 py-3 text-center text-slate-400">
                    {index + 1}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      disabled={!canSelectAgent}
                      onClick={() => onSelectAgent(row.agent)}
                      className="flex max-w-[290px] items-center gap-3 text-left disabled:cursor-default"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700">
                        {row.initials}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">
                          {buildSuspendedAgentLabel(row.agent, accountProfiles)}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-center font-normal text-slate-600">
                    {row.caseCount}
                  </td>
                  <td className="px-3 py-3 text-center font-medium text-slate-800">
                    {row.caseCount || row.hasNoCaseMonthlyResult ? row.average.toFixed(2) : "—"}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium " +
                        (row.hasNoCaseMonthlyResult
                          ? "bg-rose-50 text-rose-600"
                          : !row.caseCount
                            ? "bg-slate-100 text-slate-500"
                            : row.kpiPassed
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-600")
                      }
                    >
                      {row.hasNoCaseMonthlyResult
                        ? "● Not Passed"
                        : !row.caseCount
                          ? "No Data"
                          : row.kpiPassed
                            ? "✓ Passed"
                            : "● Not Passed"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={
                        "inline-flex rounded-full border px-2.5 py-1 font-medium " +
                        (row.gradeReady
                          ? getGradeTone(row.grade)
                          : "border-slate-200 bg-slate-50 text-slate-400")
                      }
                    >
                      {row.gradeReady ? row.grade : "—"}
                    </span>
                  </td>
                  <td
                    className={
                      "px-4 py-3 text-right font-medium " +
                      (row.completed &&
                      row.incentiveCash > 0
                        ? "text-violet-700"
                        : "text-slate-500")
                    }
                  >
                    {incentiveText(row)}
                  </td>
                  {allAgentsMode ? (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={!canSelectAgent}
                        onClick={() =>
                          onSelectAgent(
                            row.agent
                          )
                        }
                        className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-[10px] font-medium text-violet-700 transition hover:bg-violet-50 disabled:cursor-default disabled:border-slate-200 disabled:text-slate-400"
                      >
                        View Details
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}

              {!visibleRows.length ? (
                <tr>
                  <td
                    colSpan={allAgentsMode ? 8 : 7}
                    className="border-t border-slate-100 px-6 py-12 text-center text-sm font-normal text-slate-400"
                  >
                    No Agent data for the current selection
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

function AnalyticsOverviewV89({
  summary,
  cases,
  trendRows,
  monthlyMode,
  individualMode,
  noCaseMonthKey,
  periodKeys,
  policyPeriodLabel = "",
  detailContent,
  hideSummaryCards = false,
}: {
  summary: SummaryCards;
  cases: CaseItem[];
  trendRows: Array<
    PeriodRow & {
      scoreDelta?: number | null;
    }
  >;
  monthlyMode: boolean;
  individualMode: boolean;
  noCaseMonthKey?: string;
  periodKeys?: string[];
  policyPeriodLabel?: string;
  detailContent?: React.ReactNode;
  hideSummaryCards?: boolean;
}) {
  // data-month-policy-zero-case-and-incentive-guide-v126
  // data-team-evaluation-target-v141
  const evaluatedCases =
    cases.length;
  const evaluatedAgentCount =
    new Set(
      cases
        .map((item) =>
          String(item.agent || "")
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    ).size;
  const evaluationTarget =
    monthlyMode && !individualMode
      ? Math.max(
          CASE_TARGET,
          evaluatedAgentCount * CASE_TARGET
        )
      : CASE_TARGET;
  const hasNoCaseMonthlyResult =
    evaluatedCases === 0 &&
    monthlyMode &&
    Boolean(noCaseMonthKey);
  const noCaseMonthlyGrade =
    scoreToGrade(
      0,
      noCaseMonthKey
    );
  const overviewMonthKey =
    noCaseMonthKey ||
    (periodKeys || []).slice(-1)[0] ||
    summary.policyMonthKey;
  const overviewCriticalError = cases.some(
    (item) => item.grade === "G"
  );
  const overviewPerformance =
    getMonthlyPerformanceResult(
      evaluatedCases,
      summary.avgScore,
      overviewMonthKey,
      overviewCriticalError
    );
  const hasKpiData =
    evaluatedCases > 0 ||
    hasNoCaseMonthlyResult;
  const gradeReady =
    hasNoCaseMonthlyResult ||
    (hasKpiData &&
      (!monthlyMode ||
        evaluatedCases >= CASE_TARGET));
  // data-kpi-grade-description-v143
  const kpiPassed =
    hasKpiData &&
    !hasNoCaseMonthlyResult &&
    summary.avgScore >=
      PERFORMANCE_KPI_TARGET;

  const currentGradeGuide =
    gradeReady
      ? getGradeGuideRows(
          overviewMonthKey
        ).find(
          (row) =>
            row.grade ===
            (hasNoCaseMonthlyResult
              ? noCaseMonthlyGrade
              : summary.grade)
        ) || null
      : null;
  const currentGradeStatus =
    currentGradeGuide
      ? getIncentiveByGrade(
          currentGradeGuide.grade,
          overviewMonthKey
        ).remark
      : "";

  const gradeColors: Record<
    string,
    string
  > = {
    A: "#55c98a",
    B: "#64b5f6",
    C: "#f7c84b",
    D: "#f3a447",
    F: "#ed4568",
    G: "#94a3b8",
  };
  const gradeOrder = [
    "A",
    "B",
    "C",
    "D",
    "F",
    "G",
  ];
  const gradeRows = gradeOrder
    .map((grade) => {
      const count =
        hasNoCaseMonthlyResult &&
        grade === noCaseMonthlyGrade
          ? 1
          : cases.filter(
              (item) =>
                String(item.grade) ===
                grade
            ).length;
      return {
        grade,
        count,
        pct:
          hasNoCaseMonthlyResult
            ? grade === noCaseMonthlyGrade
              ? 100
              : 0
            : evaluatedCases > 0
              ? (count /
                  evaluatedCases) *
                100
              : 0,
        color:
          gradeColors[grade],
      };
    })
    .filter(
      (item) =>
        item.count > 0
    );

  let gradeCursor = 0;
  const gradeGradient =
    gradeRows.length > 0
      ? `conic-gradient(${gradeRows
          .map((item) => {
            const start =
              gradeCursor;
            gradeCursor +=
              item.pct;
            return `${item.color} ${start}% ${gradeCursor}%`;
          })
          .join(", ")})`
      : "#e2e8f0";

  const visibleTrend =
    trendRows.slice(0, 3);
  const trendScores =
    visibleTrend.map(
      (row) => row.avgScore
    );
  const pointRows =
    visibleTrend.map(
      (row, index) => {
        const x =
          visibleTrend.length <= 1
            ? 365
            : 50 +
              (index /
                (visibleTrend.length -
                  1)) *
                630;
        const y =
          190 -
          Math.max(
            0,
            Math.min(
              100,
              row.avgScore
            )
          ) *
            1.6;

        return {
          ...row,
          x,
          y,
        };
      }
    );
  const points =
    pointRows
      .map(
        (row) =>
          `${row.x},${row.y}`
      )
      .join(" ");

  const metricItems = [
    {
      title:
        "Quality Score (Avg.)",
      value: hasNoCaseMonthlyResult
        ? "0.00%"
        : hasKpiData
          ? `${summary.avgScore.toFixed(2)}%`
          : "—",
      note: hasNoCaseMonthlyResult
        ? `No evaluated cases · Grade ${noCaseMonthlyGrade} applied`
        : hasKpiData
          ? `Average from ${summary.caseCount} evaluated case${summary.caseCount === 1 ? "" : "s"}`
          : "No evaluated cases",
      icon: "☆",
      tone:
        "bg-violet-50 text-violet-600",
      valueTone:
        hasKpiData
          ? "text-slate-900"
          : "text-slate-400",
    },
    {
      title: "KPI Status",
      value: hasNoCaseMonthlyResult
        ? "Not Passed"
        : !hasKpiData
          ? "No Data"
          : kpiPassed
            ? "Passed"
            : "Not Passed",
      note: hasNoCaseMonthlyResult
        ? `Average 0.00% · KPI Target ${PERFORMANCE_KPI_TARGET}%`
        : !hasKpiData
          ? `No evaluated cases · KPI Target ${PERFORMANCE_KPI_TARGET}%`
          : `Average ${summary.avgScore.toFixed(2)}% · KPI Target ${PERFORMANCE_KPI_TARGET}%`,
      icon: !hasKpiData
        ? "–"
        : kpiPassed
          ? "✓"
          : "!",
      tone: !hasKpiData
        ? "bg-slate-100 text-slate-500"
        : kpiPassed
          ? "bg-emerald-50 text-emerald-600"
          : "bg-rose-50 text-rose-600",
      valueTone: !hasKpiData
        ? "text-slate-500"
        : kpiPassed
          ? "text-emerald-700"
          : "text-rose-600",
    },
    {
      title: "Cases Evaluated",
      value: String(summary.caseCount),
      note: `${Math.min(summary.caseCount, evaluationTarget)}/${evaluationTarget} monthly target · ${individualMode ? "1 Agent" : `${evaluatedAgentCount} Agents × ${CASE_TARGET}`}`,
      icon: "▤",
      tone: "bg-sky-50 text-sky-600",
      valueTone: "text-slate-900",
    },
    {
      title: "Total Incentive",
      value: hasNoCaseMonthlyResult
        ? formatCurrencyTHB(0)
        : !hasKpiData
          ? "—"
          : individualMode &&
              monthlyMode &&
              !gradeReady
          ? "—"
          : formatCurrencyTHB(
              getTotalIncentiveForCases(
                cases
              )
            ),
      note: hasNoCaseMonthlyResult
        ? `Grade ${noCaseMonthlyGrade} · No incentive`
        : !hasKpiData
          ? "No evaluated cases"
          : individualMode &&
              monthlyMode &&
              !gradeReady
          ? `Pending ${evaluatedCases}/${CASE_TARGET} cases`
          : "Total from eligible monthly Agent results",
      icon: "฿",
      tone: "bg-fuchsia-50 text-fuchsia-600",
      valueTone: hasKpiData
        ? "text-slate-900"
        : "text-slate-400",
    },
    {
      title: "Overall Grade",
      value: hasNoCaseMonthlyResult
        ? noCaseMonthlyGrade
        : gradeReady
          ? summary.grade
          : "—",
      note: hasNoCaseMonthlyResult
        ? `Score 0 · Grade ${noCaseMonthlyGrade} · ${currentGradeStatus || "Current criteria"}`
        : !hasKpiData
          ? "No evaluated cases"
          : !gradeReady
            ? `Available after ${CASE_TARGET} monthly cases`
            : currentGradeGuide
              ? `Score ${currentGradeGuide.range} · Grade ${hasNoCaseMonthlyResult ? noCaseMonthlyGrade : summary.grade} · ${currentGradeStatus}`
              : `Grade ${hasNoCaseMonthlyResult ? noCaseMonthlyGrade : summary.grade} · Current criteria`,
      icon: "◇",
      tone: "bg-amber-50 text-amber-600",
      valueTone: gradeReady
        ? "text-slate-900"
        : "text-slate-400",
    },
  ];

  return (
    <div
      data-analytics-overview-v89="true"
      data-kpi-status-average-v91="true"
      className="space-y-5"
    >
      {!hideSummaryCards ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metricItems.map(
          (item) => (
            <div
              key={item.title}
              className="rounded-[18px] border border-slate-200 bg-white p-5 shadow-[0_5px_16px_rgba(15,23,42,0.04)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-normal text-slate-500">
                    {item.title}
                  </div>
                  <div
                    className={`mt-2 text-[28px] font-semibold tracking-tight ${item.valueTone}`}
                  >
                    {item.value}
                  </div>
                </div>

                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-xl font-normal ${item.tone}`}
                >
                  {item.icon}
                </div>
              </div>

              <div className="mt-2 text-[10px] font-normal text-slate-500">
                {item.note}
              </div>
            </div>
          )
        )}
      </div> : null}

      <section
        data-performance-reference-group-v146="true"
        className="overflow-hidden rounded-[24px] border border-violet-200 bg-gradient-to-br from-white via-violet-50/45 to-slate-50 shadow-[0_14px_38px_rgba(76,29,149,0.09)]"
      >
        <div className="border-b border-violet-200 bg-gradient-to-r from-violet-950 via-violet-800 to-violet-600 px-5 py-4 text-white">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200">Performance Reference</div>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-[18px] font-semibold">Performance Overview</h2>
              <p className="mt-1 text-[10px] font-medium text-violet-100">เกณฑ์ที่ใช้งาน แนวโน้มคะแนน และการกระจายเกรดในมุมมองเดียว</p>
            </div>
            <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[9px] font-semibold text-violet-100">
              Current selection
            </div>
          </div>
        </div>

        <div className="grid items-stretch gap-4 p-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
          <MonthlyGradeIncentiveCriteriaV144
            monthKey={monthlyMode ? overviewMonthKey : ""}
            monthlyMode={monthlyMode}
            periodLabel={policyPeriodLabel}
          />

        <div className="h-full rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold text-slate-900">
                Quality Score Trend
              </div>
              <div className="mt-1 text-[10px] font-normal text-slate-500">
                Latest 3 calendar months · newest month first
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-normal text-slate-500">
              {visibleTrend.length}/3 months
            </div>
          </div>

          <div className="mt-4 h-[230px]">
            {pointRows.length ? (
              <>
                <svg
                  viewBox="0 0 720 220"
                  preserveAspectRatio="none"
                  className="h-[190px] w-full overflow-visible"
                  aria-label="Quality Score Trend"
                >
                  {[0, 1, 2, 3, 4, 5].map(
                    (index) => {
                      const y =
                        30 +
                        index * 32;
                      const label =
                        100 -
                        index * 20;

                      return (
                        <g key={label}>
                          <line
                            x1="42"
                            x2="700"
                            y1={y}
                            y2={y}
                            stroke="#e8edf5"
                            strokeDasharray="3 4"
                          />
                          <text
                            x="4"
                            y={y + 4}
                            fill="#94a3b8"
                            fontSize="10"
                          >
                            {label}%
                          </text>
                        </g>
                      );
                    }
                  )}

                  <polyline
                    points={points}
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {pointRows.map(
                    (row) => (
                      <g
                        key={`point-${row.label}`}
                      >
                        <circle
                          cx={row.x}
                          cy={row.y}
                          r="5"
                          fill="#7c3aed"
                          stroke="#ffffff"
                          strokeWidth="3"
                        />
                        <text
                          x={row.x}
                          y={Math.max(
                            15,
                            row.y - 12
                          )}
                          textAnchor="middle"
                          fill="#475569"
                          fontSize="10"
                        >
                          {row.avgScore.toFixed(
                            2
                          )}
                        </text>
                      </g>
                    )
                  )}
                </svg>

                <div
                  className="grid gap-2 text-center text-[10px] font-normal text-slate-500"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(
                      1,
                      pointRows.length
                    )}, minmax(0, 1fr))`,
                  }}
                >
                  {pointRows.map(
                    (row) => (
                      <div
                        key={`label-${row.label}`}
                        className="truncate"
                        title={row.label}
                      >
                        {row.label}
                      </div>
                    )
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-sm font-normal text-slate-400">
                No trend data
              </div>
            )}
          </div>
        </div>

        <div className="h-full rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <div className="text-[15px] font-semibold text-slate-900">
            Grade Distribution
          </div>
          <div className="mt-1 text-[10px] font-normal text-slate-500">
            Distribution from the current selection
          </div>

          <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-center xl:flex-col 2xl:flex-row">
            <div
              className="relative h-36 w-36 shrink-0 rounded-full"
              style={{
                background:
                  gradeGradient,
              }}
            >
              <div className="absolute inset-[25px] flex flex-col items-center justify-center rounded-full bg-white">
                <div className="text-2xl font-semibold text-slate-900">
                  {evaluatedCases}
                </div>
                <div className="text-[9px] font-normal uppercase tracking-wide text-slate-400">
                  Cases
                </div>
              </div>
            </div>

            <div className="w-full space-y-3">
              {gradeRows.length ? (
                gradeRows.map(
                  (item) => (
                    <div
                      key={item.grade}
                      className="flex items-center justify-between gap-4 text-[11px]"
                    >
                      <div className="flex items-center gap-2 text-slate-600">
                        <span
                          className="h-3 w-3 rounded-sm"
                          style={{
                            backgroundColor:
                              item.color,
                          }}
                        />
                        Grade{" "}
                        {item.grade}
                      </div>
                      <div className="font-normal text-slate-500">
                        {item.pct.toFixed(
                          0
                        )}
                        % ({item.count})
                      </div>
                    </div>
                  )
                )
              ) : (
                <div className="text-sm font-normal text-slate-400">
                  No grade data
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </section>

      {detailContent}

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
  canViewAllAgents = false,
  canViewAllTeams = false,
  canViewOwnTeam = false,
  canExportAnalytics = false,
  dataRefreshKey,
  embedded = false,
  onSelectedAgentChange,
  onSelectedMonthChange,
  onSelectedWeekChange,
  onSelectedYearChange,
}: {
  currentUser: any;
  externalSelectedAgent?: string;
  externalSelectedMonth?: string;
  externalSelectedWeek?: string;
  roleScopedAgentNames?: string[];
  canViewAllAgents?: boolean;
  canViewAllTeams?: boolean;
  canViewOwnTeam?: boolean;
  canExportAnalytics?: boolean;
  dataRefreshKey?: number;
  embedded?: boolean;
  onSelectedAgentChange?: (agent: string) => void;
  onSelectedMonthChange?: (month: string) => void;
  onSelectedWeekChange?: (week: string) => void;
  onSelectedYearChange?: (year: string) => void;
}) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [noCaseEvaluations, setNoCaseEvaluations] = useState<StoredEvaluation[]>([]);
  const [appealMergeCount, setAppealMergeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [accountProfiles, setAccountProfiles] = useState<SummaryAccount[]>([]);
  const [viewMode, setViewMode] = useState<SummaryView>("monthly-dashboard");
  // data-agent-selection-stable-v119
  const [selectedAgent, setSelectedAgent] = useState<string>(() => {
    const savedAgent =
      typeof window !== "undefined"
        ? window.sessionStorage.getItem(
            "qa_summary_selected_agent_v119"
          )
        : "";

    return (
      String(
        savedAgent ||
          externalSelectedAgent ||
          "all"
      ).trim() || "all"
    );
  });

  // Keep the user's explicit Agent choice across rerenders, month changes and remounts.
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.sessionStorage.setItem(
      "qa_summary_selected_agent_v119",
      String(selectedAgent || "").trim() || "all"
    );
  }, [selectedAgent]);
  const [selectedMonth, setSelectedMonth] = useState<string>(externalSelectedMonth || "all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>(externalSelectedWeek || "all");
  const [reportPdfDialogOpen, setReportPdfDialogOpen] = useState(false);
  const [reportPdfView, setReportPdfView] = useState<SummaryView>("monthly-dashboard");
  const [analyticsCustomizeOpen, setAnalyticsCustomizeOpen] = useState(false);
  // data-workspace-view-state-v134
  const [analysisMode, setAnalysisMode] = useState<"weekly" | "monthly" | "yearly">(() => {
    const saved = window.sessionStorage.getItem("qa_analytics_mode_v134");
    return saved === "weekly" || saved === "yearly" ? saved : "monthly";
  });
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(window.sessionStorage.getItem("qa_analytics_periods_v134") || "[]");
      return Array.isArray(saved) ? saved.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  });
  const [periodFilterYear, setPeriodFilterYear] = useState<string>(
    () => window.sessionStorage.getItem("qa_analytics_year_filter_v134") || "all"
  );
  const [periodFilterMonth, setPeriodFilterMonth] = useState<string>(
    () => window.sessionStorage.getItem("qa_analytics_month_filter_v134") || "all"
  );
  const [summarySection, setSummarySection] = useState<"summary" | "team">(
    () => window.sessionStorage.getItem("qa_analytics_section_v134") === "team" ? "team" : "summary"
  );
  const [teamSelectedMonth, setTeamSelectedMonth] = useState<string>(
    () => window.sessionStorage.getItem("qa_analytics_team_month_v134") || ""
  );
  const [analyticsCompareOpen, setAnalyticsCompareOpen] = useState(false);
  const [compareDraftPeriods, setCompareDraftPeriods] = useState<string[]>([]);
  const [analyticsExportOpen, setAnalyticsExportOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(
    () => window.sessionStorage.getItem("qa_analytics_team_v134") || "all"
  );
  const analyticsModeMountedRef = useRef(false);
  const [selectedTeamDetail, setSelectedTeamDetail] = useState(
    () => window.sessionStorage.getItem("qa_analytics_team_detail_v134") || ""
  );
  const [dashboardControlTarget, setDashboardControlTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!embedded) {
      setDashboardControlTarget(null);
      return;
    }

    const target = document.getElementById("qa-dashboard-control-center-performance-v163");
    setDashboardControlTarget(target);
  }, [embedded, isLoading]);

  useEffect(() => {
    window.sessionStorage.setItem("qa_analytics_mode_v134", analysisMode);
    window.sessionStorage.setItem("qa_analytics_periods_v134", JSON.stringify(selectedPeriods));
    window.sessionStorage.setItem("qa_analytics_year_filter_v134", periodFilterYear);
    window.sessionStorage.setItem("qa_analytics_month_filter_v134", periodFilterMonth);
    window.sessionStorage.setItem("qa_analytics_section_v134", summarySection);
    window.sessionStorage.setItem("qa_analytics_team_month_v134", teamSelectedMonth);
    window.sessionStorage.setItem("qa_analytics_team_v134", selectedTeam);
    window.sessionStorage.setItem("qa_analytics_team_detail_v134", selectedTeamDetail);
  }, [
    analysisMode,
    selectedPeriods,
    periodFilterYear,
    periodFilterMonth,
    summarySection,
    teamSelectedMonth,
    selectedTeam,
    selectedTeamDetail,
  ]);

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);
  const roleScopedAgentList = useMemo(
    () =>
      getUniqueNormalizedAgents(
        (roleScopedAgentNames || [])
          .map((name) =>
            toTitleCaseName(
              String(name || "").trim()
            )
          )
          .filter(Boolean)
      ),
    [roleScopedAgentNames]
  );
  const analyticsCanSelectAllAgents =
    canViewAllAgents &&
    !roleScopedAgentList.length;

  // data-agent-selection-local-source-v116
  const selectAnalyticsAgent = (value: string) => {
    const nextAgent =
      String(value || "").trim() || "all";

    setSelectedAgent(nextAgent);
    onSelectedAgentChange?.(nextAgent);
  };

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
    if (typeof externalSelectedAgent !== "string") return;
    const nextAgent = String(externalSelectedAgent || "").trim() || "all";
    if (nextAgent !== selectedAgent) setSelectedAgent(nextAgent);
  }, [externalSelectedAgent, selectedAgent]);

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
        setNoCaseEvaluations(storedEvaluations.filter(isNoCaseEvaluation));
        const evaluationCases: CaseItem[] = storedEvaluations
          .filter((record) => !isNoCaseEvaluation(record))
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
    const names = getUniqueNormalizedAgents([
      ...AGENT_MASTER,
      ...allCases.map((item) => item.agent),
      ...noCaseEvaluations.map((item) => item.agentName || item.targetDisplayName),
    ]).filter(
      (name) => !shouldHideAgentByMonth(name, selectedMonth)
    );

    if (roleScopedAgentList.length) {
      return names.filter((name) => roleScopedAgentList.some((scopedAgent) => isSameAgent(name, scopedAgent)));
    }

    return names;
  }, [allCases, accountProfiles, casesInCurrentScopeForAgentOptions, noCaseEvaluations, roleScopedAgentList, selectedMonth]);

  // data-agent-selection-no-auto-reset-v120
  // Keep an explicitly selected Agent pinned even while month/week/year options
  // are recalculating. A temporarily missing option must show No Data instead
  // of silently switching the filter back to All Agents.
  useEffect(() => {
    if (!roleScopedAgentList.length) return;

    const lockedAgent = roleScopedAgentList[0];
    if (lockedAgent && !isSameAgent(selectedAgent || "", lockedAgent)) {
      setSelectedAgent(lockedAgent);
    }
    onSelectedAgentChange?.(lockedAgent || "all");
  }, [
    selectedAgent,
    onSelectedAgentChange,
    roleScopedAgentList,
  ]);

  useEffect(() => {
    if (roleScopedAgentList.length && viewMode === "weekly-qa-by-agent") {
      setViewMode("weekly-dashboard");
    }
  }, [roleScopedAgentList.length, viewMode]);

  const monthOptions = useMemo(() => {
    const keys = [...new Set(
      [
        ...allCases.map((item) => item.monthKey),
        ...noCaseEvaluations.map(getStoredEvaluationMonthKey),
      ].filter((key) => key && key !== "unknown")
    )].sort((a, b) => b.localeCompare(a));

    return keys.map((key) => ({
      value: key,
      label: getMonthLabelForKey(key, allCases),
    }));
  }, [allCases, noCaseEvaluations]);

  const weekOptions = useMemo(() => {
    const filtered = selectedMonth === "all" ? allCases : allCases.filter((item) => item.monthKey === selectedMonth);
    const labels = [...new Set(filtered.map((item) => item.weekLabel).filter(Boolean))]
      .sort((a, b) => getPeriodRowSortRank(b, "week") - getPeriodRowSortRank(a, "week"));
    return [{ value: "all", label: "All Weeks" }].concat(labels.map((label) => ({ value: label, label })));
  }, [allCases, selectedMonth]);

  const yearOptions = useMemo(() => {
    const keys = [...new Set([
      ...allCases.map((item) => item.yearKey),
      ...noCaseEvaluations.map((item) => getStoredEvaluationMonthKey(item).slice(0, 4)),
    ].filter(Boolean))].sort((a, b) => b.localeCompare(a));
    return [{ value: "all", label: "All Years" }].concat(keys.map((key) => ({ value: key, label: key })));
  }, [allCases, noCaseEvaluations]);

  const selectableYears = useMemo(
    () => [...new Set([
      ...allCases.map((item) => item.yearKey),
      ...noCaseEvaluations.map((item) => getStoredEvaluationMonthKey(item).slice(0, 4)),
    ].filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [allCases, noCaseEvaluations]
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
        .concat(
          noCaseEvaluations
            .map(getStoredEvaluationMonthKey)
            .filter((key) => effectivePeriodYear === "all" || key.startsWith(`${effectivePeriodYear}-`))
        )
        .filter(Boolean)
    )].sort((a, b) => b.localeCompare(a));

    return [{ value: "all", label: "All Months" }].concat(
      keys.map((key) => ({
        value: key,
        label: allCases.find((item) => item.monthKey === key)?.monthLabel || key,
      }))
    );
  }, [allCases, effectivePeriodYear, noCaseEvaluations]);

  const periodOptions = useMemo(() => {
    if (analysisMode === "weekly") {
      return Array.from(new Set(allCases.map((item) => item.weekLabel).filter((value) => value && value !== "-")))
        .sort((a, b) => getPeriodRowSortRank(b, "week") - getPeriodRowSortRank(a, "week"));
    }
    if (analysisMode === "monthly") {
      return Array.from(new Set([
        ...allCases.map((item) => item.monthKey),
        ...noCaseEvaluations.map(getStoredEvaluationMonthKey),
      ].filter(Boolean)))
        .sort((a, b) => b.localeCompare(a));
    }
    return selectableYears;
  }, [allCases, analysisMode, noCaseEvaluations, selectableYears]);

  const weeklyPeriodGroups = useMemo(() => {
    if (analysisMode !== "weekly") return [];

    const grouped = new Map<
      string,
      {
        monthKey: string;
        monthLabel: string;
        periods: string[];
      }
    >();

    periodOptions.forEach((period) => {
      const matchingCases = allCases
        .filter((item) => item.weekLabel === period)
        .sort(
          (left, right) =>
            (right.auditDateObj?.getTime() || 0) -
            (left.auditDateObj?.getTime() || 0)
        );

      const referenceCase = matchingCases[0];
      const monthKey =
        referenceCase?.monthKey ||
        "unknown";
      const monthLabel =
        referenceCase?.monthLabel ||
        "Other";

      if (!grouped.has(monthKey)) {
        grouped.set(monthKey, {
          monthKey,
          monthLabel,
          periods: [],
        });
      }

      grouped.get(monthKey)!.periods.push(period);
    });

    return [...grouped.values()]
      .sort((left, right) =>
        right.monthKey.localeCompare(left.monthKey)
      )
      .map((group) => ({
        ...group,
        periods: [...group.periods].sort(
          (left, right) =>
            getPeriodRowSortRank(right, "week") -
            getPeriodRowSortRank(left, "week")
        ),
      }));
  }, [analysisMode, periodOptions, allCases]);

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
  const activeUnifiedPeriodKey = effectivePeriodKeys[effectivePeriodKeys.length - 1] || "";

  useEffect(() => {
    if (!embedded || summarySection !== "summary" || !activeUnifiedPeriodKey) return;

    if (analysisMode === "monthly") {
      setTeamSelectedMonth(activeUnifiedPeriodKey);
      onSelectedMonthChange?.(activeUnifiedPeriodKey);
      onSelectedWeekChange?.("all");
      onSelectedYearChange?.(activeUnifiedPeriodKey.slice(0, 4));
      return;
    }

    if (analysisMode === "weekly") {
      const matchedCase = allCases.find((item) => item.weekLabel === activeUnifiedPeriodKey);
      if (matchedCase?.monthKey) onSelectedMonthChange?.(matchedCase.monthKey);
      if (matchedCase?.yearKey) onSelectedYearChange?.(matchedCase.yearKey);
      onSelectedWeekChange?.(activeUnifiedPeriodKey);
      return;
    }

    onSelectedMonthChange?.("all");
    onSelectedWeekChange?.("all");
    onSelectedYearChange?.(activeUnifiedPeriodKey);
  }, [
    activeUnifiedPeriodKey,
    allCases,
    analysisMode,
    embedded,
    onSelectedMonthChange,
    onSelectedWeekChange,
    onSelectedYearChange,
    summarySection,
  ]);

  useEffect(() => {
    if (embedded && summarySection !== "summary") {
      setSummarySection("summary");
    }
  }, [embedded, summarySection]);

  useEffect(() => {
    if (!embedded || summarySection !== "team" || !teamSelectedMonth) return;
    onSelectedMonthChange?.(teamSelectedMonth);
    onSelectedWeekChange?.("all");
    onSelectedYearChange?.(teamSelectedMonth.slice(0, 4));
  }, [
    embedded,
    onSelectedMonthChange,
    onSelectedWeekChange,
    onSelectedYearChange,
    summarySection,
    teamSelectedMonth,
  ]);

  useEffect(() => {
    if (!analyticsModeMountedRef.current) {
      analyticsModeMountedRef.current = true;
    } else {
      setSelectedPeriods([]);
      setPeriodFilterMonth("all");
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

      if (selectedTeam !== "all") {
        const account = getAccountStatus(item.agent, accountProfiles);
        const itemTeam = getSummaryTeamName(account);
        if (normalizeText(itemTeam) !== normalizeText(selectedTeam)) return false;
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
  }, [allCases, effectivePeriodKeys, analysisMode, roleScopedAgentList, selectedTeam, accountProfiles]);

  const periodScopedNoCaseEvaluations = useMemo(() => {
    return noCaseEvaluations.filter((item) => {
      const agent = item.agentName || item.targetDisplayName;
      const monthKey = getStoredEvaluationMonthKey(item);
      if (!agent || !monthKey) return false;

      if (
        roleScopedAgentList.length &&
        !roleScopedAgentList.some((name) => isSameAgent(agent, name))
      ) return false;

      if (selectedTeam !== "all") {
        const account = getAccountStatus(agent, accountProfiles);
        if (
          normalizeText(getSummaryTeamName(account)) !==
          normalizeText(selectedTeam)
        ) return false;
      }

      if (analysisMode === "monthly") {
        return !effectivePeriodKeys.length || effectivePeriodKeys.includes(monthKey);
      }
      if (analysisMode === "yearly") {
        return (
          !effectivePeriodKeys.length ||
          effectivePeriodKeys.includes(monthKey.slice(0, 4))
        );
      }
      return false;
    });
  }, [
    accountProfiles,
    analysisMode,
    effectivePeriodKeys,
    noCaseEvaluations,
    roleScopedAgentList,
    selectedTeam,
  ]);

  const selectableAgentOptions = useMemo(() => {
    const agentNames = getUniqueNormalizedAgents(
      [
        ...periodScopedCases.map((item) => item.agent),
        ...periodScopedNoCaseEvaluations.map(
          (item) => item.agentName || item.targetDisplayName
        ),
      ]
    );

    return agentNames.sort((a, b) =>
      a.localeCompare(b)
    );
  }, [
    periodScopedCases,
    periodScopedNoCaseEvaluations,
  ]);

  const agentFilterOptions = useMemo(() => {
    const agentNames = [...selectableAgentOptions];

    if (
      selectedAgent !== "all" &&
      !agentNames.some((agent) =>
        isSameAgent(agent, selectedAgent)
      )
    ) {
      agentNames.push(selectedAgent);
    }

    return [
      { value: "all", label: "All Agents" },
      ...agentNames
        .sort((a, b) => a.localeCompare(b))
        .map((agent) => ({
          value: agent,
          label: buildSuspendedAgentLabel(
            agent,
            accountProfiles
          ),
        })),
    ];
  }, [
    selectableAgentOptions,
    selectedAgent,
    accountProfiles,
  ]);

  const filteredCases = useMemo(() => {
    if (effectiveSelectedAgent === "all") return periodScopedCases;

    return periodScopedCases.filter((item) =>
      isSameAgent(item.agent, effectiveSelectedAgent)
    );
  }, [periodScopedCases, effectiveSelectedAgent]);

  const activeNoCaseMonthKey = useMemo(() => {
    if (
      analysisMode !== "monthly" ||
      effectiveSelectedAgent === "all" ||
      filteredCases.length > 0
    ) return "";

    const matched = periodScopedNoCaseEvaluations.find((item) =>
      isSameAgent(
        item.agentName || item.targetDisplayName,
        effectiveSelectedAgent
      )
    );
    return matched ? getStoredEvaluationMonthKey(matched) : "";
  }, [
    analysisMode,
    effectiveSelectedAgent,
    filteredCases.length,
    periodScopedNoCaseEvaluations,
  ]);

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

  const qualityScoreTrendRows = useMemo(() => {
    const selectedMonthlyKey =
      analysisMode === "monthly"
        ? effectivePeriodKeys[
            effectivePeriodKeys.length - 1
          ] || ""
        : "";
    const anchorMonthKey =
      selectedMonthlyKey ||
      getLatestMonthKey(
        filteredCases.length
          ? filteredCases
          : allCases
      );

    if (!/^\d{4}-\d{2}$/.test(anchorMonthKey)) {
      return [...comparisonRowsWithDelta]
        .slice(-3)
        .reverse();
    }

    const newestFirstRows =
      buildRecentMonthKeys(
        anchorMonthKey,
        3
      )
        .reverse()
        .map((monthKey) => {
          const monthCases =
            allCases.filter((item) => {
              if (
                item.monthKey !== monthKey
              ) {
                return false;
              }

              if (
                roleScopedAgentList.length &&
                !roleScopedAgentList.some(
                  (agent) =>
                    isSameAgent(
                      item.agent,
                      agent
                    )
                )
              ) {
                return false;
              }

              if (
                selectedTeam !== "all"
              ) {
                const account =
                  getAccountStatus(
                    item.agent,
                    accountProfiles
                  );
                if (
                  normalizeText(
                    getSummaryTeamName(
                      account
                    )
                  ) !==
                  normalizeText(
                    selectedTeam
                  )
                ) {
                  return false;
                }
              }

              return (
                effectiveSelectedAgent ===
                  "all" ||
                isSameAgent(
                  item.agent,
                  effectiveSelectedAgent
                )
              );
            });

          if (!monthCases.length) {
            return {
              label:
                getMonthLabelForKey(
                  monthKey,
                  allCases
                ),
              caseCount: 0,
              avgScore: 0,
              revisedCount: 0,
              grade: scoreToGrade(
                0,
                monthKey
              ),
              incentive: 0,
            };
          }

          const monthSummary =
            summarizeCases(monthCases);

          return {
            label:
              getMonthLabelForKey(
                monthKey,
                allCases
              ),
            caseCount:
              monthSummary.caseCount,
            avgScore:
              monthSummary.avgScore,
            revisedCount:
              monthSummary.revisedCount,
            grade: monthSummary.grade,
            incentive:
              monthSummary.incentive,
          };
        });

    return newestFirstRows.map(
      (row, index) => {
        const previousMonth =
          newestFirstRows[index + 1] ||
          null;

        return {
          ...row,
          scoreDelta: previousMonth
            ? Number(
                (
                  row.avgScore -
                  previousMonth.avgScore
                ).toFixed(2)
              )
            : null,
          caseDelta: previousMonth
            ? row.caseCount -
              previousMonth.caseCount
            : null,
          revisedDelta: previousMonth
            ? row.revisedCount -
              previousMonth.revisedCount
            : null,
        };
      }
    );
  }, [
    accountProfiles,
    allCases,
    analysisMode,
    comparisonRowsWithDelta,
    effectivePeriodKeys,
    effectiveSelectedAgent,
    filteredCases,
    roleScopedAgentList,
    selectedTeam,
  ]);

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

  const normalizedCurrentRole = normalizeText(currentUser?.role);
  const isAdminRole =
    normalizedCurrentRole === "admin" ||
    normalizedCurrentRole.startsWith("admin ") ||
    normalizedCurrentRole.endsWith(" admin") ||
    normalizedCurrentRole.includes("admin live chat");

  const currentUserAccount = useMemo(() => {
    const matchValues = [
      currentUser?.agentName,
      currentUser?.displayName,
      currentUser?.username,
      currentUser?.email,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    return (
      accountProfiles.find((account) =>
        buildAccountMatchValues(account).some((accountValue) =>
          matchValues.some((currentValue) => isSameAgent(accountValue, currentValue))
        )
      ) || null
    );
  }, [accountProfiles, currentUser]);

  const currentUserTeamName = useMemo(
    () => getSummaryTeamName(currentUserAccount),
    [currentUserAccount]
  );

  const analyticsCanSelectAllTeams =
    canViewAllTeams &&
    !roleScopedAgentList.length;
  const analyticsCanViewTeamPerformance =
    canViewAllTeams ||
    canViewOwnTeam;
  const analyticsCanExport =
    canExportAnalytics;
  const analyticsTeamOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        accountProfiles
          .map((account) =>
            getSummaryTeamName(account)
          )
          .filter(Boolean)
      )
    ).sort((a, b) =>
      a.localeCompare(b)
    );

    if (analyticsCanSelectAllTeams) {
      return names;
    }

    return canViewOwnTeam &&
      currentUserTeamName
      ? [currentUserTeamName]
      : [];
  }, [
    accountProfiles,
    analyticsCanSelectAllTeams,
    canViewOwnTeam,
    currentUserTeamName,
  ]);

  useEffect(() => {
    if (analyticsCanSelectAllTeams) {
      if (
        selectedTeam !== "all" &&
        !analyticsTeamOptions.includes(
          selectedTeam
        )
      ) {
        setSelectedTeam("all");
      }
      return;
    }

    if (
      canViewOwnTeam &&
      currentUserTeamName
    ) {
      setSelectedTeam(
        currentUserTeamName
      );
      return;
    }

    setSelectedTeam("all");
  }, [
    analyticsCanSelectAllTeams,
    analyticsTeamOptions,
    canViewOwnTeam,
    currentUserTeamName,
    selectedTeam,
  ]);

  useEffect(() => {
    if (
      !analyticsCanViewTeamPerformance &&
      summarySection !== "summary"
    ) {
      setSummarySection("summary");
    }
  }, [
    analyticsCanViewTeamPerformance,
    summarySection,
  ]);

  const teamMonthOptions = useMemo(() => {
    return Array.from(
      new Set(
        allCases
          .map((item) => item.monthKey)
          .filter((monthKey) => /^\d{4}-\d{2}$/.test(monthKey))
      )
    ).sort((a, b) => b.localeCompare(a));
  }, [allCases]);

  useEffect(() => {
    if (!teamMonthOptions.length) return;

    const currentMonthKey = `${new Date().getFullYear()}-${`${new Date().getMonth() + 1}`.padStart(2, "0")}`;
    const defaultMonth = teamMonthOptions.includes(currentMonthKey)
      ? currentMonthKey
      : teamMonthOptions[0];

    if (!teamSelectedMonth || !teamMonthOptions.includes(teamSelectedMonth)) {
      setTeamSelectedMonth(defaultMonth);
    }
  }, [teamMonthOptions, teamSelectedMonth]);

  const getCaseTeamName = (item: CaseItem) => {
    const account = getAccountStatus(item.agent, accountProfiles);
    return getSummaryTeamName(account) || "Unassigned Team";
  };

  const teamPerformanceRows = useMemo(() => {
    if (!teamSelectedMonth) return [];

    const trendMonthKeys = buildRecentMonthKeys(teamSelectedMonth, 3);
    const selectedCases = allCases.filter(
      (item) => item.monthKey === teamSelectedMonth
    );

    const teamNames = Array.from(
      new Set([
        ...accountProfiles
          .map((account) => getSummaryTeamName(account))
          .filter(Boolean),
        ...selectedCases.map((item) => getCaseTeamName(item)),
      ])
    )
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return teamNames
      .map((teamName) => {
        const cases = selectedCases.filter(
          (item) => getCaseTeamName(item) === teamName
        );
        const summary = summarizeCases(cases);

        const agents = getUniqueNormalizedAgents(
          cases.map((item) => item.agent)
        )
          .map((agent) => {
            const agentCases = cases.filter((item) =>
              isSameAgent(item.agent, agent)
            );
            const agentSummary = summarizeCases(agentCases);

            const kpiPassed =
              agentSummary.caseCount > 0 &&
              agentSummary.avgScore >=
                PERFORMANCE_KPI_TARGET;
            const completed =
              agentSummary.caseCount >=
              CASE_TARGET;
            const criticalError = agentCases.some(
              (item) => item.grade === "G"
            );
            const monthlyPerformance = getMonthlyPerformanceResult(
              agentSummary.caseCount,
              agentSummary.avgScore,
              teamSelectedMonth,
              criticalError
            );
            const incentiveResult =
              monthlyPerformance.eligible
                ? monthlyPerformance.incentive
                : null;

            return {
              agent,
              caseCount: agentSummary.caseCount,
              avgScore: agentSummary.avgScore,
              grade: agentSummary.grade,
              revisedCount: agentSummary.revisedCount,
              kpiPassed,
              completed,
              incentiveCash:
                incentiveResult?.cash || 0,
              incentivePromo:
                incentiveResult?.promo || 0,
            };
          })
          .sort((a, b) => a.agent.localeCompare(b.agent));

        const trend = trendMonthKeys.map((monthKey, index) => {
          const monthCases = allCases.filter(
            (item) =>
              item.monthKey === monthKey &&
              getCaseTeamName(item) === teamName
          );
          const monthSummary = summarizeCases(monthCases);
          const avgScore = monthCases.length
            ? monthSummary.avgScore
            : null;
          const previousMonthKey =
            index > 0 ? trendMonthKeys[index - 1] : "";
          const previousCases = previousMonthKey
            ? allCases.filter(
                (item) =>
                  item.monthKey === previousMonthKey &&
                  getCaseTeamName(item) === teamName
              )
            : [];
          const previousSummary = summarizeCases(previousCases);
          const change =
            avgScore !== null && previousCases.length
              ? Number(
                  (
                    avgScore -
                    previousSummary.avgScore
                  ).toFixed(2)
                )
              : null;

          return {
            monthKey,
            label: getMonthLabelForKey(monthKey, allCases),
            caseCount: monthCases.length,
            avgScore,
            change,
          };
        });

        const currentTrend =
          trend[trend.length - 1] || null;

        return {
          teamName,
          cases,
          agents,
          caseCount: summary.caseCount,
          agentCount: agents.length,
          avgScore: cases.length ? summary.avgScore : null,
          change: currentTrend?.change ?? null,
          grade: cases.length ? summary.grade : null,
          revisedCount: summary.revisedCount,
          passedKpiCount: agents.filter(
            (agent) => agent.kpiPassed
          ).length,
          completedAgentCount: agents.filter(
            (agent) => agent.completed
          ).length,
          incentiveTotal: agents.reduce(
            (sum, agent) =>
              sum + agent.incentiveCash,
            0
          ),
          incentivePromoTotal: agents.reduce(
            (sum, agent) =>
              sum + agent.incentivePromo,
            0
          ),
          topics: buildTopicSummary(cases),
          trend,
        };
      })
      .filter((row) => {
        if (!row.caseCount) {
          return false;
        }

        if (analyticsCanSelectAllTeams) {
          return (
            selectedTeam === "all" ||
            normalizeText(
              row.teamName
            ) ===
              normalizeText(
                selectedTeam
              )
          );
        }

        if (
          canViewOwnTeam &&
          currentUserTeamName
        ) {
          return (
            normalizeText(
              row.teamName
            ) ===
            normalizeText(
              currentUserTeamName
            )
          );
        }

        return false;
      });
  }, [
    allCases,
    accountProfiles,
    teamSelectedMonth,
    analyticsCanSelectAllTeams,
    canViewOwnTeam,
    currentUserTeamName,
    selectedTeam,
  ]);

  const selectedTeamPerformance = useMemo(
    () => selectedTeamDetail
      ? teamPerformanceRows.find((row) => row.teamName === selectedTeamDetail) || null
      : null,
    [selectedTeamDetail, teamPerformanceRows]
  );

  const adminOwnTeamRow = useMemo(
    () =>
      currentUserTeamName
        ? teamPerformanceRows.find(
            (row) => normalizeText(row.teamName) === normalizeText(currentUserTeamName)
          ) || null
        : null,
    [teamPerformanceRows, currentUserTeamName]
  );

  const allTeamsSummary = useMemo(
    () =>
      summarizeCases(
        teamPerformanceRows.flatMap(
          (row) => row.cases
        )
      ),
    [teamPerformanceRows]
  );

  const adminSelectedTeamAverage = useMemo(() => {
    if (
      !isAdminRole ||
      !currentUserTeamName
    ) {
      return null;
    }

    const teamCases = allCases.filter((item) => {
      if (
        normalizeText(
          getCaseTeamName(item)
        ) !==
        normalizeText(
          currentUserTeamName
        )
      ) {
        return false;
      }

      if (!effectivePeriodKeys.length) {
        return true;
      }

      if (analysisMode === "weekly") {
        return effectivePeriodKeys.includes(
          item.weekLabel
        );
      }

      if (analysisMode === "monthly") {
        return effectivePeriodKeys.includes(
          item.monthKey
        );
      }

      return effectivePeriodKeys.includes(
        item.yearKey
      );
    });

    if (!teamCases.length) {
      return null;
    }

    return summarizeCases(teamCases).avgScore;
  }, [
    isAdminRole,
    currentUserTeamName,
    allCases,
    accountProfiles,
    effectivePeriodKeys,
    analysisMode,
  ]);

  const performanceStatusBaseMonthKey = useMemo(() => {
    if (analysisMode === "monthly") {
      const monthlyKeys = effectivePeriodKeys
        .filter((key) => /^\d{4}-\d{2}$/.test(key))
        .sort();

      if (monthlyKeys.length) {
        return monthlyKeys[monthlyKeys.length - 1];
      }
    }

    const scopedKeys = periodScopedCases
      .map((item) => item.monthKey)
      .filter((key) => /^\d{4}-\d{2}$/.test(key))
      .sort();

    return (
      scopedKeys[scopedKeys.length - 1] ||
      teamSelectedMonth ||
      getLatestMonthKey(allCases)
    );
  }, [
    analysisMode,
    effectivePeriodKeys,
    periodScopedCases,
    teamSelectedMonth,
    allCases,
  ]);

  const performanceStatusMonthKeys = useMemo(
    () =>
      performanceStatusBaseMonthKey &&
      performanceStatusBaseMonthKey !== "unknown"
        ? buildRecentMonthKeys(
            performanceStatusBaseMonthKey,
            3
          )
        : [],
    [performanceStatusBaseMonthKey]
  );

  const performanceStatusRows = useMemo(() => {
    if (
      !performanceStatusBaseMonthKey ||
      performanceStatusBaseMonthKey === "unknown"
    ) {
      return [];
    }

    const baseMonthCases = allCases.filter(
      (item) => item.monthKey === performanceStatusBaseMonthKey
    );

    const candidateAgents = roleScopedAgentList.length
      ? getUniqueNormalizedAgents(roleScopedAgentList)
      : getUniqueNormalizedAgents(baseMonthCases.map((item) => item.agent));

    return candidateAgents.map((agent) => {
      const trend = performanceStatusMonthKeys.map((monthKey) => {
        const monthCases = allCases.filter(
          (item) =>
            item.monthKey === monthKey &&
            isSameAgent(item.agent, agent)
        );

        if (!monthCases.length) {
          return {
            monthKey,
            label: getMonthLabelForKey(monthKey, allCases),
            caseCount: 0,
            avgScore: null as number | null,
            grade: null as Grade | null,
            meetsKpi: null as boolean | null,
          };
        }

        const monthSummary = summarizeCases(monthCases);
        const avgScore = monthSummary.avgScore;

        return {
          monthKey,
          label: getMonthLabelForKey(monthKey, allCases),
          caseCount: monthSummary.caseCount,
          avgScore,
          grade: monthSummary.grade,
          meetsKpi: avgScore >= PERFORMANCE_KPI_TARGET,
        };
      });

      const current = trend[trend.length - 1];
      const currentAvg = current?.avgScore ?? null;
      const currentGrade = current?.grade ?? null;

      let consecutiveBelowKpi = 0;
      for (let index = trend.length - 1; index >= 0; index -= 1) {
        const month = trend[index];
        if (month.caseCount > 0 && month.meetsKpi === false) {
          consecutiveBelowKpi += 1;
          continue;
        }
        break;
      }

      const failedQaThreeMonths = consecutiveBelowKpi >= 3;
      const hasThreeMonths =
        trend.length === 3 &&
        trend.every((item) => item.caseCount > 0 && item.grade);
      const gradeCThreeMonths =
        hasThreeMonths && trend.every((item) => item.grade === "C");
      const gradeDThreeMonths =
        hasThreeMonths && trend.every((item) => item.grade === "D");

      const actions: string[] = [];
      if (
        failedQaThreeMonths ||
        currentGrade === "D" ||
        gradeCThreeMonths ||
        gradeDThreeMonths
      ) {
        actions.push("Coaching Program");
      }
      if (gradeDThreeMonths) {
        actions.push("Contract Renewal Review");
      }

      const account = getAccountStatus(agent, accountProfiles);

      return {
        agent,
        teamName: getSummaryTeamName(account) || "Unassigned Team",
        currentAvg,
        currentGrade,
        trend,
        consecutiveBelowKpi,
        failedQaThreeMonths,
        gradeCThreeMonths,
        gradeDThreeMonths,
        actions,
        qaStatus: failedQaThreeMonths ? "ไม่ผ่าน QA" : "อยู่ในเกณฑ์ปกติ",
      };
    });
  }, [
    performanceStatusBaseMonthKey,
    performanceStatusMonthKeys,
    allCases,
    accountProfiles,
    roleScopedAgentList,
  ]);

  const performanceStatusSummary = useMemo(
    () => ({
      failedQa: performanceStatusRows.filter((row) => row.failedQaThreeMonths).length,
      coaching: performanceStatusRows.filter((row) =>
        row.actions.includes("Coaching Program")
      ).length,
      contractReview: performanceStatusRows.filter((row) =>
        row.actions.includes("Contract Renewal Review")
      ).length,
    }),
    [performanceStatusRows]
  );

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
          /\(\s*\d+(?:\.\d+)?\s*%\s*\)/g,
          ""
        )
        .replace(
          /\b\d+(?:\.\d+)?\s*%\b/g,
          ""
        )
        .replace(
          /(?:ได้|ทำได้)\s*\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*คะแนน/g,
          ""
        )
        .replace(
          /(?:ถูกหัก|หัก)\s*\d+(?:\.\d+)?\s*คะแนน/g,
          ""
        )
        .replace(
          /\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\b/g,
          ""
        )
        .replace(
          /^(จากการตรวจสอบ|จุดที่หักคือ|จุดที่ควรปรับ|ข้อควรปรับ|สิ่งที่ทำได้ดี|จุดเด่น)\s*:?\s*/i,
          ""
        )
        .replace(
          /\s+/g,
          " "
        )
        .replace(
          /^[\-–—:;,.\s]+/,
          ""
        )
        .replace(
          /[\-–—:;,.\s]+$/,
          ""
        )
        .trim();

      if (
        !text ||
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

      return (
        completeClauses[0] ||
        ""
      );
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

        const summarized =
          summarizeComment(
            comment,
            type
          );

        const detail = cleanPoint(
          summarized
            .replace(
              topic.label,
              ""
            )
            .replace(
              /^\s*[\(\)\-–—:;,.\s]+/,
              ""
            )
        );

        return detail
          ? { detail }
          : null;
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
        )
        .filter(
          (
            note
          ): note is {
            detail: string;
          } => Boolean(
            note?.detail
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
          )
          .filter(
            (
              note
            ): note is {
              detail: string;
            } => Boolean(
              note?.detail
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

  function exportCurrentAnalyticsExcel() {
    const workbook = XLSX.utils.book_new();
    const periodLabel = effectivePeriodLabels.join(" | ") || "Current Period";
    const summarySheet = XLSX.utils.json_to_sheet([{
      "View By": reportModeName,
      Period: periodLabel,
      Team: selectedTeam === "all" ? (currentUserTeamName || "All Teams") : selectedTeam,
      Agent: effectiveSelectedAgent === "all" ? "All Agents" : effectiveSelectedAgent,
      Mode: isComparisonMode ? "Compare" : "Single Period",
      "Average Score": summaryCards.avgScore,
      "Cases Evaluated": summaryCards.caseCount,
      "Total Incentive": formatCurrencyTHB(getTotalIncentiveForCases(filteredCases)),
      "Overall Grade": summaryCards.grade,
      "Exported By": String(currentUser?.displayName || currentUser?.username || "-"),
      "Exported At": new Date().toLocaleString("en-GB"),
    }]);
    const caseSheet = XLSX.utils.json_to_sheet(filteredCases.length ? filteredCases.map((item) => ({
      "Case ID": item.caseId,
      Agent: item.agent,
      "Audit Date": item.auditDate,
      Month: item.monthLabel,
      Week: item.weekLabel,
      Year: item.yearKey,
      Score: item.finalScore,
      Grade: item.grade,
      Status: item.reviewStatus,
      Inquiry: item.inquiryTh || item.inquiryEn || "-",
    })) : [{ Message: "No data for the current view" }]);
    const topicSheet = XLSX.utils.json_to_sheet(topicSummary.length ? topicSummary.map((topic) => ({
      Topic: topic.code,
      Description: topic.label,
      "Average Score": topic.avgScore,
      Max: topic.max,
      "Average %": topic.pct,
    })) : [{ Message: "No topic data for the current view" }]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
    XLSX.utils.book_append_sheet(workbook, caseSheet, "Cases");
    XLSX.utils.book_append_sheet(workbook, topicSheet, "Topics");
    const safePeriod = periodLabel.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 70) || "Current_View";
    XLSX.writeFile(workbook, `QA_Analytics_${safePeriod}.xlsx`);
    setAnalyticsExportOpen(false);
  }

  async function generateSummaryReportPdf() {
    await ensureSarabunPdfFont();

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
      const requiresCanvas = /[^\x20-\x7E]/.test(text);

      if (!requiresCanvas) {
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
        `${fontWeight} ${fontPx}px "Sarabun", "TH Sarabun New", Tahoma, "Noto Sans Thai", Arial, sans-serif`;
      const measuredWidth = Math.ceil(measure.measureText(text).width + 12 * scale);
      const measuredHeight = Math.ceil(fontPx * 1.55);
      canvas.width = Math.max(8, measuredWidth);
      canvas.height = Math.max(8, measuredHeight);

      const context = canvas.getContext("2d");
      if (!context) return;

      context.scale(scale, scale);
      context.font =
        `${fontWeight} ${fontPx / scale}px "Sarabun", "TH Sarabun New", Tahoma, "Noto Sans Thai", Arial, sans-serif`;
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
      "Total Incentive",
      String(getTotalIncentiveForCases(filteredCases).toLocaleString("en-US")) + " THB",
      "amber"
    );
    y += 30;

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

    if (
      analysisMode === "monthly" &&
      performanceStatusRows.length
    ) {
      y += 5;
      drawSectionTitle(
        "Performance Status & Coaching Watchlist",
        `KPI target ${PERFORMANCE_KPI_TARGET}% • Three consecutive months rule`
      );

      const statusWidths = [29, 23, 24, 24, 24, 17, 20, 25];
      const monthHeaders = performanceStatusMonthKeys.map((monthKey) =>
        getMonthLabelForKey(monthKey, allCases)
      );
      const statusHeaders = [
        "Agent",
        "Team",
        ...monthHeaders,
        "Consecutive",
        "QA Status",
        "Required Action",
      ];

      const drawStatusHeader = () => {
        doc.setFillColor(30, 41, 59);
        doc.roundedRect(margin, y, contentWidth, 13, 2, 2, "F");
        let x = margin;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(4.7);

        statusHeaders.forEach((header, index) => {
          wrapText(header, index >= 2 && index <= 4 ? 10 : 13, 2).forEach(
            (line, lineIndex) => {
              drawText(
                line,
                index < 2 ? x + 2 : x + statusWidths[index] / 2,
                y + 5 + lineIndex * 3.2,
                {
                  align: index < 2 ? "left" : "center",
                  color: "#ffffff",
                }
              );
            }
          );
          x += statusWidths[index];
        });

        y += 13;
      };

      drawStatusHeader();

      performanceStatusRows.forEach((row, index) => {
        const agentLines = wrapText(
          buildSuspendedAgentLabel(row.agent, accountProfiles),
          18,
          2
        );
        const teamLines = wrapText(row.teamName, 13, 2);
        const monthCells = row.trend.map((month) =>
          month.avgScore === null
            ? ["No Data"]
            : [
                month.avgScore.toFixed(2),
                month.meetsKpi ? "Pass KPI" : "Fail KPI",
              ]
        );
        const actionLines = wrapText(
          row.actions.length ? row.actions.join(" • ") : "Monitor",
          16,
          3
        );

        const rowHeight = Math.max(
          11,
          4 +
            Math.max(
              agentLines.length,
              teamLines.length,
              ...monthCells.map((lines) => lines.length),
              actionLines.length
            ) *
              3.4
        );

        if (y + rowHeight > contentBottom) {
          startNewPage();
          drawSectionTitle(
            "Performance Status & Coaching Watchlist (continued)"
          );
          drawStatusHeader();
        }

        doc.setFillColor(
          index % 2 === 0 ? 255 : 248,
          index % 2 === 0 ? 255 : 250,
          252
        );
        doc.setDrawColor(226, 232, 240);
        doc.rect(margin, y, contentWidth, rowHeight, "FD");

        const cells = [
          agentLines,
          teamLines,
          ...monthCells,
          [`${row.consecutiveBelowKpi} month(s)`],
          [row.failedQaThreeMonths ? "Fail QA" : "Normal"],
          actionLines,
        ];

        let x = margin;
        cells.forEach((lines, colIndex) => {
          doc.setFont(
            "helvetica",
            colIndex === 0 || colIndex === 6 ? "bold" : "normal"
          );
          doc.setFontSize(4.8);

          if (colIndex === 6 && row.failedQaThreeMonths) {
            doc.setTextColor(190, 24, 93);
          } else {
            doc.setTextColor(51, 65, 85);
          }

          lines.forEach((line, lineIndex) => {
            drawText(
              line,
              colIndex < 2 ? x + 2 : x + statusWidths[colIndex] / 2,
              y + 5 + lineIndex * 3.4,
              { align: colIndex < 2 ? "left" : "center" }
            );
          });
          x += statusWidths[colIndex];
        });

        y += rowHeight;
      });

      y += 7;
    }

    if (
      analysisMode === "monthly" &&
      teamMonthlyAnalyticsRows.length
    ) {
      ensureSpace(55);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      drawText(
        "3-Month Supporting Trend",
        margin,
        y
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.2);
      doc.setTextColor(148, 163, 184);
      drawText(
        "Reference trend — selected periods remain the primary report focus",
        margin,
        y + 4.5
      );

      y += 8;

      const analyticsTop = y;
      const chartHeight = 42;
      const chartRows = [
        ...teamMonthlyAnalyticsRows,
      ]
        .reverse()
        .map((row, index, rows) => ({
          ...row,
          displayDelta:
            index === 0 ||
            !rows[index - 1].caseCount ||
            !row.caseCount
              ? null
              : Number(
                  (
                    row.avgScore -
                    rows[index - 1].avgScore
                  ).toFixed(2)
                ),
        }));

      doc.setFillColor(250, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(
        margin,
        analyticsTop,
        contentWidth,
        chartHeight,
        2,
        2,
        "FD"
      );

      const chartX = margin + 14;
      const chartY = analyticsTop + 6;
      const chartW = contentWidth - 22;
      const chartH = 23;
      const gap = 12;
      const barWidth =
        (chartW -
          gap * (chartRows.length + 1)) /
        Math.max(1, chartRows.length);

      [70, 85, 100].forEach(
        (tick) => {
          const lineY =
            chartY +
            chartH -
            ((tick - 70) / 30) *
              chartH;

          doc.setDrawColor(
            tick === 85
              ? 253
              : 226,
            tick === 85
              ? 186
              : 232,
            tick === 85
              ? 116
              : 240
          );
          doc.setLineWidth(
            tick === 85 ? 0.45 : 0.2
          );
          doc.line(
            chartX,
            lineY,
            chartX + chartW,
            lineY
          );

          doc.setFont(
            "helvetica",
            "normal"
          );
          doc.setFontSize(5);
          doc.setTextColor(
            100,
            116,
            139
          );
          drawText(
            String(tick),
            chartX - 3,
            lineY + 1.4,
            { align: "right" }
          );
        }
      );

      chartRows.forEach(
        (row, index) => {
          const barHeight =
            row.caseCount
              ? Math.max(
                  2,
                  ((row.avgScore - 70) /
                    30) *
                    chartH
                )
              : 0;
          const barX =
            chartX +
            gap +
            index *
              (barWidth + gap);
          const barY =
            chartY +
            chartH -
            barHeight;

          if (row.caseCount) {
            doc.setFillColor(
              124,
              58,
              237
            );
            doc.roundedRect(
              barX,
              barY,
              barWidth,
              barHeight,
              1,
              1,
              "F"
            );
          }

          doc.setFont(
            "helvetica",
            "bold"
          );
          doc.setFontSize(5.7);
          doc.setTextColor(
            15,
            23,
            42
          );
          drawText(
            row.caseCount
              ? row.avgScore.toFixed(2)
              : "N/A",
            barX + barWidth / 2,
            row.caseCount
              ? Math.max(
                  chartY + 3,
                  barY - 1.8
                )
              : chartY +
                  chartH -
                  2,
            { align: "center" }
          );

          const diffText =
            row.displayDelta === null
              ? "Base"
              : `${row.displayDelta > 0 ? "+" : ""}${row.displayDelta.toFixed(2)}`;

          doc.setFont(
            "helvetica",
            "bold"
          );
          doc.setFontSize(5.1);
          doc.setTextColor(
            row.displayDelta === null
              ? 148
              : row.displayDelta > 0
                ? 5
                : row.displayDelta < 0
                  ? 190
                  : 37,
            row.displayDelta === null
              ? 163
              : row.displayDelta > 0
                ? 150
                : row.displayDelta < 0
                  ? 24
                  : 99,
            row.displayDelta === null
              ? 184
              : row.displayDelta > 0
                ? 105
                : row.displayDelta < 0
                  ? 93
                  : 235
          );
          drawText(
            diffText,
            barX + barWidth / 2,
            chartY + chartH + 4,
            { align: "center" }
          );

          doc.setFont(
            "helvetica",
            "normal"
          );
          doc.setFontSize(4.8);
          doc.setTextColor(
            100,
            116,
            139
          );
          drawText(
            row.label,
            barX + barWidth / 2,
            chartY + chartH + 8,
            { align: "center" }
          );
        }
      );

      y += chartHeight + 8;
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
        const topicTitle = splitAnalyticsTopicTitle(topic.label);
        const thaiLines = wrapText(
          `${topic.code}. ${topicTitle.thai}`,
          54,
          2
        );
        const englishLines = topicTitle.english
          ? wrapText(topicTitle.english, 54, 1)
          : [];
        const rowHeight = Math.max(
          13,
          4 + thaiLines.length * 3.6 + englishLines.length * 3.5
        );

        ensureSpace(rowHeight + 4);

        doc.setFillColor(
          index % 2 === 0 ? 255 : 248,
          index % 2 === 0 ? 255 : 250,
          index % 2 === 0 ? 255 : 252
        );
        doc.setDrawColor(226, 232, 240);
        doc.rect(tableX, y, tableWidth, rowHeight, "FD");

        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.6);

        thaiLines.forEach((line, lineIndex) => {
          drawText(
            line,
            tableX + 3,
            y + 4.8 + lineIndex * 3.6
          );
        });

        if (englishLines.length) {
          doc.setTextColor(225, 29, 72);
          doc.setFont("helvetica", "italic");
          doc.setFontSize(6.2);
          englishLines.forEach((line, lineIndex) => {
            drawText(
              line,
              tableX + 3,
              y + 4.8 + thaiLines.length * 3.6 + lineIndex * 3.5
            );
          });
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        const scoreY = y + rowHeight / 2 + 1.8;
        drawText(
          topic.avgScore.toFixed(2),
          tableX + 112 + 12,
          scoreY,
          { align: "center" }
        );
        drawText(
          topic.max.toFixed(2),
          tableX + 112 + 24 + 10,
          scoreY,
          { align: "center" }
        );
        doc.setTextColor(109, 40, 217);
        drawText(
          topic.pct.toFixed(2) + "%",
          pageWidth - margin - 14,
          scoreY,
          { align: "center" }
        );

        y += rowHeight;
      });

      y += 7;

      if (y + 47 > contentBottom) {
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
        doc.roundedRect(x, insightY, halfWidth, 40, 2.5, 2.5, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...text);
        drawText(title, x + 4, insightY + 7);

        items.slice(0, 3).forEach((topic, index) => {
          const topicTitle = splitAnalyticsTopicTitle(topic.label);
          const itemY = insightY + 13 + index * 9;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(5.8);
          doc.setTextColor(51, 65, 85);
          drawText(
            `${index + 1}. ${topicTitle.thai}`,
            x + 4,
            itemY
          );
          doc.setFont("helvetica", "bold");
          doc.setTextColor(...text);
          drawText(
            topic.pct.toFixed(2) + "%",
            x + halfWidth - 4,
            itemY,
            { align: "right" }
          );
          if (topicTitle.english) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(5.1);
            doc.setTextColor(225, 29, 72);
            drawText(topicTitle.english, x + 4, itemY + 3.6);
          }
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

      y += 47;

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
          const topicTitle = splitAnalyticsTopicTitle(topic.label);
          const thaiTitleLines = wrapText(
            `${topic.code}. ${topicTitle.thai}`,
            80,
            2
          );
          const englishTitleLines = topicTitle.english
            ? wrapText(topicTitle.english, 88, 1)
            : [];
          const titleBlockHeight =
            thaiTitleLines.length * 3.6 + englishTitleLines.length * 3.4;
          const rowHeight = 7 + titleBlockHeight + lines.length * 3.6;

          ensureSpace(rowHeight + 2);

          doc.setFillColor(
            index % 2 === 0 ? 250 : 255,
            index % 2 === 0 ? 248 : 255,
            255
          );
          doc.setDrawColor(226, 232, 240);
          doc.rect(margin, y, contentWidth, rowHeight, "FD");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.6);
          doc.setTextColor(15, 23, 42);
          thaiTitleLines.forEach((line, lineIndex) => {
            drawText(line, margin + 3, y + 4.6 + lineIndex * 3.6);
          });

          if (englishTitleLines.length) {
            doc.setFont("helvetica", "italic");
            doc.setFontSize(6);
            doc.setTextColor(225, 29, 72);
            englishTitleLines.forEach((line, lineIndex) => {
              drawText(
                line,
                margin + 3,
                y + 4.6 + thaiTitleLines.length * 3.6 + lineIndex * 3.4
              );
            });
          }

          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.4);
          doc.setTextColor(71, 85, 105);
          const valuesStartY = y + 6 + titleBlockHeight;

          lines.forEach((line, lineIndex) => {
            drawText(
              line,
              margin + 3,
              valuesStartY + lineIndex * 3.6
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
        if (colIndex === 3) {
          if (row.scoreDelta === null) {
            doc.setTextColor(100, 116, 139);
          }
          else if (row.scoreDelta > 0) {
            doc.setTextColor(5, 150, 105);
          }
          else if (row.scoreDelta < 0) {
            doc.setTextColor(190, 24, 93);
          }
          else {
            doc.setTextColor(37, 99, 235);
          }
          doc.setFont("helvetica", "bold");
        }
        else {
          doc.setTextColor(15, 23, 42);
          doc.setFont("helvetica", "normal");
        }

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

    const selectedAgentFilePart =
      effectiveSelectedAgent === "all"
        ? "All_Agents"
        : sanitizePdfFilePart(effectiveSelectedAgent, "Agent");

    const selectedPeriodFilePart = sanitizePdfFilePart(
      effectivePeriodLabels.length
        ? effectivePeriodLabels.join(isComparisonMode ? "_vs_" : "_")
        : comparisonRows.map((row) => row.label).join("_vs_"),
      "Selected_Period"
    );

    const fileName =
      `QA_${reportModeName}_${isComparisonMode ? "Comparison_" : ""}${selectedAgentFilePart}_${selectedPeriodFilePart}.pdf`;


    doc.save(fileName);
    setReportPdfDialogOpen(false);
  }

  async function generateTeamPerformancePdf() {
    if (!teamSelectedMonth) return;

    await ensureSarabunPdfFont();

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth =
      doc.internal.pageSize.getWidth();
    const pageHeight =
      doc.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth =
      pageWidth - margin * 2;
    const contentBottom =
      pageHeight - 18;
    const monthLabel =
      getMonthLabelForKey(
        teamSelectedMonth,
        allCases
      );

    const drawTeamText = (
      value: unknown,
      x: number,
      textY: number,
      options: {
        align?: "left" | "center" | "right";
        color?: string;
        bold?: boolean;
        italic?: boolean;
        size?: number;
      } = {}
    ) => {
      const text = String(value ?? "-")
        .replace(/\s+/g, " ")
        .trim();
      const requiresCanvas = /[^\x20-\x7E]/.test(text);
      const size = options.size || 7;

      doc.setFont(
        "helvetica",
        options.bold
          ? "bold"
          : options.italic
            ? "italic"
          : "normal"
      );
      doc.setFontSize(size);

      if (!requiresCanvas) {
        if (options.color) {
          doc.setTextColor(
            options.color
          );
        }

        doc.text(text, x, textY, {
          align:
            options.align || "left",
        });
        return;
      }

      const scale = 4;
      const fontPx =
        Math.max(
          10,
          size * 1.333
        ) * scale;
      const canvas =
        document.createElement(
          "canvas"
        );
      const measure =
        canvas.getContext("2d");

      if (!measure) return;

      const weight =
        options.bold ? "700" : "400";
      const fontStyle =
        options.italic ? "italic " : "";
      const family =
        '"Sarabun", "TH Sarabun New", Tahoma, "Noto Sans Thai", Arial, sans-serif';

      measure.font =
        `${fontStyle}${weight} ${fontPx}px ${family}`;
      canvas.width = Math.max(
        8,
        Math.ceil(
          measure.measureText(text)
            .width +
            12 * scale
        )
      );
      canvas.height = Math.max(
        8,
        Math.ceil(fontPx * 1.55)
      );

      const context =
        canvas.getContext("2d");

      if (!context) return;

      context.scale(scale, scale);
      context.font =
        `${fontStyle}${weight} ${fontPx / scale}px ${family}`;
      context.textBaseline =
        "alphabetic";
      context.fillStyle =
        options.color || "#0f172a";
      context.fillText(
        text,
        2,
        (canvas.height / scale) *
          0.76
      );

      const pxToMm = 25.4 / 96;
      const widthMm =
        (canvas.width / scale) *
        pxToMm;
      const heightMm =
        (canvas.height / scale) *
        pxToMm;
      let drawX = x;

      if (
        options.align === "center"
      ) {
        drawX = x - widthMm / 2;
      }

      if (
        options.align === "right"
      ) {
        drawX = x - widthMm;
      }

      doc.addImage(
        canvas.toDataURL(
          "image/png"
        ),
        "PNG",
        drawX,
        textY -
          heightMm * 0.76,
        widthMm,
        heightMm,
        undefined,
        "FAST"
      );
    };

    const drawPageHeader = (
      title: string
    ) => {
      doc.setFillColor(
        49,
        16,
        101
      );
      doc.rect(
        0,
        0,
        pageWidth,
        31,
        "F"
      );

      drawTeamText(
        title,
        margin,
        14,
        {
          color: "#ffffff",
          bold: true,
          size: 16,
        }
      );

      drawTeamText(
        monthLabel,
        margin,
        22,
        {
          color: "#ffffff",
          size: 8.5,
        }
      );
    };

    drawPageHeader(
      isAdminRole
        ? "My Team Average"
        : "Team Performance"
    );

    if (isAdminRole) {
      drawTeamText(
        currentUserTeamName ||
          "Team not assigned",
        margin,
        55,
        {
          bold: true,
          size: 12,
        }
      );

      drawTeamText(
        adminOwnTeamRow?.avgScore ===
          null ||
        adminOwnTeamRow?.avgScore ===
          undefined
          ? "No Data"
          : adminOwnTeamRow.avgScore.toFixed(
              2
            ),
        margin,
        78,
        {
          color: "#6d28d9",
          bold: true,
          size: 30,
        }
      );

      drawTeamText(
        "Average Score",
        margin,
        88,
        {
          color: "#64748b",
          size: 9,
        }
      );

      doc.save(
        `QA_Team_Average_${sanitizePdfFilePart(
          currentUserTeamName,
          "Team_Not_Assigned"
        )}_${sanitizePdfFilePart(
          monthLabel
        )}.pdf`
      );
      return;
    }

    let y = 40;

    const startNewTeamPage = () => {
      doc.addPage();
      drawPageHeader(
        "Team Performance"
      );
      y = 40;
    };

    const ensureTeamSpace = (
      needed: number
    ) => {
      if (
        y + needed <=
        contentBottom
      ) {
        return;
      }

      startNewTeamPage();
    };

    teamPerformanceRows.forEach(
      (teamRow) => {
        if (!teamRow.caseCount) return;

        const estimatedHeight =
          28 +
          teamRow.agents.length * 8 +
          teamRow.topics.length * 9 +
          38;

        if (
          y > 45 ||
          y + estimatedHeight >
            contentBottom
        ) {
          startNewTeamPage();
        }

        doc.setFillColor(
          109,
          40,
          217
        );
        doc.roundedRect(
          margin,
          y,
          contentWidth,
          13,
          2.5,
          2.5,
          "F"
        );

        drawTeamText(
          teamRow.teamName,
          margin + 4,
          y + 8,
          {
            color: "#ffffff",
            bold: true,
            size: 9,
          }
        );

        drawTeamText(
          `${teamRow.caseCount} Cases • ${teamRow.agentCount} Agents • Avg ${
            teamRow.avgScore === null
              ? "No Data"
              : teamRow.avgScore.toFixed(2)
          }`,
          pageWidth - margin - 4,
          y + 8,
          {
            align: "right",
            color: "#ffffff",
            bold: true,
            size: 6.3,
          }
        );

        y += 17;

        drawTeamText(
          "Agent Performance",
          margin,
          y,
          {
            bold: true,
            size: 7.5,
          }
        );
        y += 4;

        const agentWidths = [
          78,
          28,
          34,
          24,
          22,
        ];
        const agentHeaders = [
          "Agent",
          "Cases",
          "Average",
          "Grade",
          "Revised",
        ];

        doc.setFillColor(
          30,
          41,
          59
        );
        doc.rect(
          margin,
          y,
          contentWidth,
          9,
          "F"
        );

        let agentX = margin;
        agentHeaders.forEach(
          (header, index) => {
            drawTeamText(
              header,
              index === 0
                ? agentX + 3
                : agentX +
                    agentWidths[index] /
                      2,
              y + 6,
              {
                align:
                  index === 0
                    ? "left"
                    : "center",
                color: "#ffffff",
                bold: true,
                size: 5.8,
              }
            );
            agentX += agentWidths[index];
          }
        );

        y += 9;

        teamRow.agents.forEach(
          (agentRow, index) => {
            ensureTeamSpace(8);

            doc.setFillColor(
              index % 2 === 0
                ? 255
                : 248,
              index % 2 === 0
                ? 255
                : 250,
              252
            );
            doc.setDrawColor(
              226,
              232,
              240
            );
            doc.rect(
              margin,
              y,
              contentWidth,
              8,
              "FD"
            );

            const values = [
              buildSuspendedAgentLabel(
                agentRow.agent,
                accountProfiles
              ),
              String(
                agentRow.caseCount
              ),
              agentRow.avgScore.toFixed(
                2
              ),
              String(agentRow.grade),
              String(
                agentRow.revisedCount
              ),
            ];

            let x = margin;
            values.forEach(
              (value, colIndex) => {
                drawTeamText(
                  value,
                  colIndex === 0
                    ? x + 3
                    : x +
                      agentWidths[
                        colIndex
                      ] /
                        2,
                  y + 5.4,
                  {
                    align:
                      colIndex === 0
                        ? "left"
                        : "center",
                    bold:
                      colIndex === 0 ||
                      colIndex === 2,
                    size: 5.7,
                    color:
                      colIndex === 2
                        ? "#6d28d9"
                        : "#334155",
                  }
                );
                x +=
                  agentWidths[colIndex];
              }
            );

            y += 8;
          }
        );

        y += 7;
        ensureTeamSpace(
          8 +
          teamRow.topics.length * 13
        );

        drawTeamText(
          "Topic Performance",
          margin,
          y,
          {
            bold: true,
            size: 7.5,
          }
        );
        y += 5;

        teamRow.topics.forEach(
          (topic) => {
            const topicTitle = splitAnalyticsTopicTitle(topic.label);
            drawTeamText(
              `${topic.code}. ${topicTitle.thai}`,
              margin,
              y + 3,
              {
                size: 5.8,
                bold: true,
                color: "#334155",
              }
            );

            if (topicTitle.english) {
              drawTeamText(
                topicTitle.english,
                margin,
                y + 6.5,
                {
                  size: 5.2,
                  italic: true,
                  color: "#e11d48",
                }
              );
            }

            drawTeamText(
              `${topic.pct.toFixed(2)}%`,
              pageWidth - margin,
              y + 3,
              {
                align: "right",
                size: 5.8,
                bold: true,
                color: "#6d28d9",
              }
            );

            const trackX = margin;
            const trackY = y + 9;
            const trackWidth =
              contentWidth;
            doc.setFillColor(
              237,
              233,
              254
            );
            doc.roundedRect(
              trackX,
              trackY,
              trackWidth,
              2.5,
              1,
              1,
              "F"
            );
            doc.setFillColor(
              124,
              58,
              237
            );
            doc.roundedRect(
              trackX,
              trackY,
              trackWidth *
                Math.max(
                  0,
                  Math.min(
                    100,
                    topic.pct
                  )
                ) /
                100,
              2.5,
              1,
              1,
              "F"
            );

            y += 13;
          }
        );

        y += 4;
        ensureTeamSpace(36);

        drawTeamText(
          "3-Month Average Trend",
          margin,
          y,
          {
            bold: true,
            size: 7.5,
          }
        );

        y += 4;
        const trendTop = y;
        const trendHeight = 28;
        doc.setFillColor(
          250,
          250,
          252
        );
        doc.setDrawColor(
          226,
          232,
          240
        );
        doc.roundedRect(
          margin,
          trendTop,
          contentWidth,
          trendHeight,
          2,
          2,
          "FD"
        );

        const chartX = margin + 10;
        const chartY =
          trendTop + 4;
        const chartW =
          contentWidth - 20;
        const chartH = 14;
        const gap = 12;
        const barWidth =
          (chartW -
            gap *
              (teamRow.trend.length +
                1)) /
          Math.max(
            1,
            teamRow.trend.length
          );

        teamRow.trend.forEach(
          (trendItem, index) => {
            const barHeight =
              trendItem.avgScore === null
                ? 0
                : Math.max(
                    1.5,
                    ((trendItem.avgScore -
                      70) /
                      30) *
                      chartH
                  );
            const barX =
              chartX +
              gap +
              index *
                (barWidth + gap);
            const barY =
              chartY +
              chartH -
              barHeight;

            if (
              trendItem.avgScore !==
              null
            ) {
              doc.setFillColor(
                124,
                58,
                237
              );
              doc.roundedRect(
                barX,
                barY,
                barWidth,
                barHeight,
                1,
                1,
                "F"
              );
            }

            drawTeamText(
              trendItem.avgScore ===
                null
                ? "N/A"
                : trendItem.avgScore.toFixed(
                    2
                  ),
              barX + barWidth / 2,
              trendItem.avgScore ===
                null
                ? chartY +
                  chartH -
                  1
                : Math.max(
                    chartY + 2,
                    barY - 1.5
                  ),
              {
                align: "center",
                bold: true,
                size: 5.2,
              }
            );

            const diffText =
              trendItem.change === null
                ? "Base"
                : `${trendItem.change > 0 ? "+": ""}${trendItem.change.toFixed(2)}`;

            drawTeamText(
              diffText,
              barX + barWidth / 2,
              chartY + chartH + 4,
              {
                align: "center",
                bold: true,
                size: 4.8,
                color:
                  trendItem.change === null
                    ? "#94a3b8"
                    : trendItem.change > 0
                      ? "#059669"
                      : trendItem.change < 0
                        ? "#be185d"
                        : "#2563eb",
              }
            );

            drawTeamText(
              trendItem.label,
              barX + barWidth / 2,
              chartY + chartH + 8,
              {
                align: "center",
                size: 4.5,
                color: "#64748b",
              }
            );
          }
        );

        y += trendHeight + 8;
      }
    );

    doc.save(
      `QA_Team_Performance_All_Teams_${sanitizePdfFilePart(
        monthLabel
      )}.pdf`
    );
  }

  if (isLoading) {
    return <LoadingMascot message="กำลังโหลดข้อมูลสรุป" subMessage="กรุณารอสักครู่..." />;
  }

  if (loadError) {
    return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff] p-6"><div className="max-w-xl rounded-3xl border border-rose-200 bg-white px-6 py-5 text-rose-700 shadow-sm"><div className="text-lg font-semibold">โหลดไฟล์ไม่สำเร็จ</div><div className="mt-2 text-sm">{loadError}</div></div></div>;
  }

  return (
    <div
      data-analytics-permission-scope-v95="true"
      data-analytics-embedded-v162={embedded ? "true" : "false"}
      className={`relative ${embedded ? "" : `min-h-screen ${songkranTheme ? "bg-gradient-to-br from-cyan-50 via-sky-50 to-fuchsia-50" : "bg-[#f7f8fc]"}`}`}
    >
      {embedded && dashboardControlTarget
        ? createPortal(
            <div data-qa-dashboard-unified-controls-v163="true" data-unified-controls-light-v164="true" className="space-y-4 rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_4px_14px_rgba(76,29,149,0.05)]">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                <div id="qa-dashboard-search-slot-v166" className="min-w-0" />
                <div className="flex flex-wrap items-center gap-2">
                  {isComparisonMode ? (
                    <button type="button" onClick={() => {
                      const lastPeriod = effectivePeriodKeys[effectivePeriodKeys.length - 1];
                      setSelectedPeriods(lastPeriod ? [lastPeriod] : []);
                    }} className="h-10 rounded-xl border border-violet-300 bg-violet-700 px-4 text-xs font-bold text-white hover:bg-violet-800">Exit Compare</button>
                  ) : null}
                  <button type="button" onClick={() => setAnalyticsCustomizeOpen(true)} className="h-10 rounded-xl border border-violet-200 bg-white px-4 text-xs font-bold text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50">Customize</button>
                  <div className="relative">
                    <button
                      type="button"
                      disabled={!analyticsCanExport}
                      onClick={() => setAnalyticsExportOpen((value) => !value)}
                      className="h-10 rounded-xl border border-violet-200 bg-white px-4 text-xs font-bold text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      Export
                    </button>
                    {analyticsExportOpen && analyticsCanExport ? (
                      <div className="absolute right-0 top-[calc(100%+8px)] z-[520] w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-2xl">
                        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Export Current Report</div>
                        <button type="button" onClick={() => { setAnalyticsExportOpen(false); void generateSummaryReportPdf(); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-violet-50 hover:text-violet-700"><span>PDF</span><span>›</span></button>
                        <button type="button" onClick={exportCurrentAnalyticsExcel} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-violet-50 hover:text-violet-700"><span>Excel</span><span>›</span></button>
                      </div>
                    ) : null}
                  </div>
                  <button type="button" onClick={() => {
                    setCompareDraftPeriods(effectivePeriodKeys.length ? [...effectivePeriodKeys] : periodOptions.slice(0, 1));
                    setAnalyticsCompareOpen(true);
                  }} className="h-10 rounded-xl border border-violet-700 bg-violet-700 px-4 text-xs font-bold text-white shadow-sm hover:bg-violet-800">Compare</button>
                </div>
              </div>

              <div className="grid gap-3 border-t border-violet-100 pt-4 md:grid-cols-2 xl:grid-cols-[260px_minmax(210px,1fr)_minmax(210px,1fr)_minmax(230px,1fr)]">
                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">Time View</div>
                    <div className="grid h-12 grid-cols-3 gap-1 rounded-xl border border-violet-200 bg-violet-100 p-1">
                      {[
                        { value: "weekly", label: "Weekly" },
                        { value: "monthly", label: "Monthly" },
                        { value: "yearly", label: "Yearly" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setAnalysisMode(option.value as "weekly" | "monthly" | "yearly");
                            setSelectedPeriods([]);
                            setAnalyticsCompareOpen(false);
                          }}
                          className={`rounded-lg px-2 text-[10px] font-bold transition ${analysisMode === option.value ? "bg-violet-700 text-white shadow-sm" : "text-violet-700 hover:bg-white/80"}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">Period</div>
                    {analysisMode === "weekly" ? (
                      <select
                        value={activeUnifiedPeriodKey}
                        onChange={(event) => setSelectedPeriods(event.target.value ? [event.target.value] : [])}
                        className="h-12 w-full rounded-xl border border-violet-200 bg-slate-50 px-4 text-sm font-bold text-slate-950 outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                      >
                        {weeklyPeriodGroups.map((group) => (
                          <optgroup key={group.monthKey} label={group.monthLabel}>
                            {group.periods.map((period) => <option key={period} value={period}>{getPeriodDisplayLabel(period)}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={activeUnifiedPeriodKey}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSelectedPeriods(value ? [value] : []);
                          if (analysisMode === "monthly" && value) setTeamSelectedMonth(value);
                        }}
                        className="h-12 w-full rounded-xl border border-violet-200 bg-slate-50 px-4 text-sm font-bold text-slate-950 outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100"
                      >
                        {periodOptions.map((period) => <option key={period} value={period}>{getPeriodDisplayLabel(period)}</option>)}
                      </select>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">Team</div>
                    {analyticsCanSelectAllTeams ? (
                      <select value={selectedTeam} onChange={(event) => {
                        setSelectedTeam(event.target.value);
                        selectAnalyticsAgent("all");
                      }} className="h-12 w-full rounded-xl border border-violet-200 bg-slate-50 px-4 text-sm font-bold text-slate-950 outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-100">
                        <option value="all">All Teams</option>
                        {analyticsTeamOptions.map((teamName) => <option key={teamName} value={teamName}>{teamName}</option>)}
                      </select>
                    ) : (
                      <div className="flex h-12 items-center rounded-xl border border-violet-200 bg-slate-50 px-4 text-sm font-bold text-slate-900">{currentUserTeamName || "Assigned Scope"}</div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">Agent</div>
                    {!analyticsCanSelectAllAgents ? (
                      <div className="flex h-12 items-center truncate rounded-xl border border-violet-200 bg-slate-50 px-4 text-sm font-bold text-slate-900">{effectiveSelectedAgent ? buildSuspendedAgentLabel(effectiveSelectedAgent, accountProfiles) : "-"}</div>
                    ) : (
                      <FilterSelect value={effectiveSelectedAgent || "all"} onChange={selectAnalyticsAgent} options={agentFilterOptions} />
                    )}
                  </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-violet-50 px-3 py-2 text-[10px] font-medium text-slate-600">
                <span>{isComparisonMode ? `Comparing: ${effectivePeriodLabels.join(" · ")}` : `Current view: ${effectivePeriodLabels[0] || "Current period"}`}</span>
                <button type="button" onClick={() => {
                  setSummarySection("summary");
                  setAnalysisMode("monthly");
                  setSelectedPeriods([]);
                  setSelectedTeam(analyticsCanSelectAllTeams ? "all" : currentUserTeamName || "all");
                  if (analyticsCanSelectAllAgents) selectAnalyticsAgent("all");
                }} className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 font-bold text-violet-700 hover:bg-violet-100">Reset</button>
              </div>
            </div>,
            dashboardControlTarget
          )
        : null}
      {false && reportPdfDialogOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-2xl">
            <div className="border-b border-violet-100 bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-5 py-4 text-white">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-100">Export PDF</div>
              <div className="mt-1 text-xl font-semibold">Choose Report PDF</div>
              <div className="mt-1 text-xs text-violet-100">Select report type before generating PDF</div>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-violet-700">Report Type</div>
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
                  className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800"
                >
                  Generate PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {songkranTheme && !embedded ? <SongkranBackdrop /> : null}
      {!embedded ? (
        <PageHero
          eyebrow="QA Workspace"
          title="QA Dashboard"
          subtitle="คะแนน ผลงาน แนวโน้ม และรายการประเมินในพื้นที่เดียว"
        />
      ) : null}
      {!embedded ? <div data-analytics-header-v90="true" className="mx-auto max-w-[1720px] px-6 pt-4 lg:px-8">
        <div className={embedded ? "flex flex-wrap items-end justify-between gap-4 rounded-[18px] border border-violet-700/60 bg-gradient-to-r from-slate-950 via-violet-950 to-violet-800 px-5 py-4 shadow-[0_12px_28px_rgba(30,27,75,0.22)]" : "flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4"}>
            {embedded ? (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200">Analytics</div>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-white">Performance Analysis</h2>
                <p className="mt-1 text-xs font-medium text-violet-100">วิเคราะห์คะแนน แนวโน้ม และปัจจัยที่มีผลต่อคุณภาพ</p>
              </div>
            ) : <span />}
            <div className="flex flex-wrap items-center justify-end gap-2">
            {isComparisonMode ? <span className="rounded-full bg-violet-100 px-3 py-2 text-xs font-medium text-violet-700">Compare Mode · {effectivePeriodKeys.length} Periods</span> : null}
            {isComparisonMode ? (
              <button type="button" onClick={() => {
                const lastPeriod = effectivePeriodKeys[effectivePeriodKeys.length - 1];
                setSelectedPeriods(lastPeriod ? [lastPeriod] : []);
              }} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 shadow-sm hover:border-violet-300 hover:text-violet-700">Exit Compare</button>
            ) : null}
            <button
              type="button"
              onClick={() => setAnalyticsCustomizeOpen(true)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 shadow-sm hover:border-violet-300 hover:text-violet-700"
            >
              Customize
            </button>
            <div className="relative">
              <button
                type="button"
                disabled={!analyticsCanExport}
                title={
                  analyticsCanExport
                    ? "Export current Analytics view"
                    : "Missing Export PDF permission"
                }
                onClick={() =>
                  setAnalyticsExportOpen(
                    (value) => !value
                  )
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 shadow-sm hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export
              </button>
              {analyticsExportOpen && analyticsCanExport ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Export Current View</div>
                  <button type="button" onClick={() => { setAnalyticsExportOpen(false); void generateSummaryReportPdf(); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-normal text-slate-700 hover:bg-violet-50 hover:text-violet-700"><span>PDF</span><span>›</span></button>
                  <button type="button" onClick={exportCurrentAnalyticsExcel} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-normal text-slate-700 hover:bg-violet-50 hover:text-violet-700"><span>Excel</span><span>›</span></button>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={() => {
              setCompareDraftPeriods(effectivePeriodKeys.length ? [...effectivePeriodKeys] : periodOptions.slice(0, 1));
              setAnalyticsCompareOpen(true);
            }} className="rounded-xl border border-violet-400 bg-white px-4 py-2.5 text-xs font-medium text-violet-700 shadow-sm hover:bg-violet-50">Compare</button>
            </div>
        </div>
      </div> : null}
      {!embedded && analyticsCanViewTeamPerformance ? (
        <div className="mx-auto max-w-[1720px] px-6 pt-6 lg:px-8">
          <div className="inline-flex rounded-2xl border border-violet-200 bg-white p-1.5 shadow-sm">
            <button
              type="button"
              onClick={() =>
                setSummarySection(
                  "summary"
                )
              }
              className={
                "rounded-xl px-5 py-2.5 text-sm font-semibold transition " +
                (
                  summarySection ===
                  "summary"
                    ? "bg-violet-700 text-white shadow-lg shadow-violet-200"
                    : "text-violet-700 hover:bg-violet-50"
                )
              }
            >
              Performance Analysis
            </button>

            <button
              type="button"
              onClick={() =>
                setSummarySection(
                  "team"
                )
              }
              className={
                "rounded-xl px-5 py-2.5 text-sm font-semibold transition " +
                (
                  summarySection ===
                  "team"
                    ? "bg-violet-700 text-white shadow-lg shadow-violet-200"
                    : "text-violet-700 hover:bg-violet-50"
                )
              }
            >
              Team Performance
            </button>
          </div>
        </div>
      ) : null}

      {((embedded && selectedTeam !== "all" && analysisMode === "monthly" && !isComparisonMode && effectiveSelectedAgent === "all") || summarySection === "team") && analyticsCanViewTeamPerformance ? (
        <div data-team-performance-logic-v90="true" data-team-performance-integrated-v166={embedded ? "true" : "false"} className="mx-auto max-w-[1720px] px-6 py-6 lg:px-8 lg:py-8">
          <Panel>
            <PanelHeader title="Team Performance" subtitle="จำนวนผู้ถูกประเมิน เคส คะแนนเฉลี่ย KPI เกรด และอินเซนทีฟรายทีม" />
            <PanelBody className="space-y-5">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full max-w-sm">
                  <FilterLabel>Month</FilterLabel>
                  <div className="mt-2">
                    <FilterSelect value={teamSelectedMonth} onChange={setTeamSelectedMonth} options={teamMonthOptions.map((monthKey) => ({
                      value: monthKey,
                      label: getMonthLabelForKey(monthKey, allCases),
                    }))} />
                  </div>
                </div>
                <div className="text-xs font-normal text-slate-500">{teamPerformanceRows.length} Teams · {allTeamsSummary.caseCount} Cases</div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <div className="grid min-w-[980px] grid-cols-[minmax(0,1fr)_76px_76px_86px_86px_76px_120px_36px] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  <div>Team</div>
                  <div className="text-center">Agents</div>
                  <div className="text-center">Cases</div>
                  <div className="text-center">Average</div>
                  <div className="text-center">KPI Pass</div>
                  <div className="text-center">Grade</div>
                  <div className="text-right">Incentive</div>
                  <div />
                </div>
                {teamPerformanceRows.map((row) => {
                  const open = selectedTeamDetail === row.teamName;
                  return (
                                        <button key={row.teamName} type="button" onClick={() => setSelectedTeamDetail(open ? "" : row.teamName)} className="grid min-w-[980px] w-full grid-cols-[minmax(0,1fr)_76px_76px_86px_86px_76px_120px_36px] gap-3 border-t border-slate-100 bg-white px-4 py-4 text-left text-sm hover:bg-violet-50/50">
                       <div className="min-w-0"><div className="truncate font-medium text-slate-900">{row.teamName}</div><div className="mt-1 text-[10px] font-normal text-slate-500">{row.completedAgentCount} completed target</div></div>
                       <div className="text-center font-normal text-slate-600">{row.agentCount}</div>
                       <div className="text-center font-normal text-slate-600">{row.caseCount}</div>
                       <div className="text-center font-medium text-violet-700">{row.avgScore === null ? "-" : row.avgScore.toFixed(2)}</div>
                       <div className="text-center font-medium text-emerald-700">{row.passedKpiCount}/{row.agentCount}</div>
                       <div className="text-center font-medium text-slate-700">{row.grade || "-"}</div>
                       <div className="text-right font-medium text-violet-700">฿{row.incentiveTotal.toLocaleString("en-US")}</div>
                       <div className="text-center text-violet-600">{open ? "⌃" : "›"}</div>
                     </button>
                  );
                })}
                {!teamPerformanceRows.length ? <div className="border-t border-slate-100 px-6 py-12 text-center text-sm font-normal text-slate-400">No team data for the selected month</div> : null}
              </div>
              {selectedTeamPerformance ? (
                <div className="grid gap-5 xl:grid-cols-2">
                  <Panel>
                    <PanelHeader title={`${selectedTeamPerformance.teamName} · Agents`} subtitle={`${selectedTeamPerformance.caseCount} Cases · Average ${selectedTeamPerformance.avgScore === null ? "-" : selectedTeamPerformance.avgScore.toFixed(2)} · KPI ${selectedTeamPerformance.passedKpiCount}/${selectedTeamPerformance.agentCount} · Incentive ฿${selectedTeamPerformance.incentiveTotal.toLocaleString("en-US")}`} />
                    <PanelBody>
                      <div className="overflow-hidden rounded-xl border border-slate-200">
                                                {selectedTeamPerformance.agents.map((agent) => (
                          <button
                            key={agent.agent}
                            type="button"
                            disabled={!analyticsCanSelectAllAgents}
                            onClick={() => {
                              if (!analyticsCanSelectAllAgents) return;
                              setSelectedTeam(selectedTeamPerformance.teamName);
                               selectAnalyticsAgent(agent.agent);
                               setSummarySection("summary");
                            }}
                            className="grid w-full grid-cols-[minmax(0,1fr)_65px_70px_82px_110px] gap-3 border-t border-slate-100 px-4 py-3 text-left text-xs first:border-t-0 hover:bg-violet-50 disabled:cursor-default"
                          >
                            <div className="truncate font-normal text-slate-700">{buildSuspendedAgentLabel(agent.agent, accountProfiles)}</div>
                            <div className="text-center text-slate-500">{agent.caseCount}</div>
                            <div className="text-center font-medium text-violet-700">{agent.avgScore.toFixed(2)}</div>
                            <div className={"text-center font-medium " + (agent.kpiPassed ? "text-emerald-700" : "text-rose-600")}>{agent.kpiPassed ? "Passed" : "Not Passed"}</div>
                            <div className="text-right font-medium text-violet-700">{agent.completed ? "฿" + agent.incentiveCash.toLocaleString("en-US") : "Pending " + agent.caseCount + "/" + CASE_TARGET}</div>
                          </button>
                        ))}
                      </div>
                    </PanelBody>
                  </Panel>
                  <Panel>
                    <PanelHeader title={`${selectedTeamPerformance.teamName} · Topics`} subtitle="คะแนนเฉลี่ยรายหัวข้อของเดือนที่เลือก" />
                    <PanelBody><TopicTable topics={selectedTeamPerformance.topics} /></PanelBody>
                  </Panel>
                </div>
              ) : null}
            </PanelBody>
          </Panel>
        </div>
      ) : null}

      {false && summarySection === "team" && !isAdminRole ? (
        <div className="mx-auto max-w-[1720px] px-6 py-6 lg:px-8 lg:py-8">
          <Panel>
            <PanelHeader
              title={isAdminRole ? "My Team" : "Teams"}
              subtitle={
                isAdminRole
                  ? "คะแนนเฉลี่ยของทีมที่ผู้ดูแลรับผิดชอบ"
                  : "ผลการประเมินรายทีมในเดือนที่เลือก"
              }
            />
            <PanelBody className="space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="w-full max-w-sm">
                  <FilterLabel>Select Month</FilterLabel>
                  <div className="mt-2">
                    <FilterSelect
                      value={teamSelectedMonth}
                      onChange={setTeamSelectedMonth}
                      options={teamMonthOptions.map((monthKey) => ({
                        value: monthKey,
                        label: getMonthLabelForKey(monthKey, allCases),
                      }))}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={generateTeamPerformancePdf}
                  disabled={!teamSelectedMonth || (isAdminRole && !currentUserTeamName)}
                  className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Generate Team PDF
                </button>
              </div>

              {isAdminRole ? (
                currentUserTeamName ? (
                  <div className="rounded-[28px] border border-violet-200 bg-gradient-to-br from-violet-950 via-violet-800 to-fuchsia-700 p-7 text-white shadow-xl shadow-violet-100">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
                      Team
                    </div>
                    <div className="mt-2 text-2xl font-semibold">{currentUserTeamName}</div>
                    <div className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
                      Average Score
                    </div>
                    <div className="mt-2 text-6xl font-semibold tracking-tight">
                      {adminOwnTeamRow?.avgScore === null || adminOwnTeamRow?.avgScore === undefined
                        ? "No Data"
                        : adminOwnTeamRow.avgScore.toFixed(2)}
                    </div>
                    <div className="mt-4 text-sm font-semibold text-violet-100">
                      {getMonthLabelForKey(teamSelectedMonth, allCases)}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-8 text-center text-sm font-medium text-amber-800">
                    ยังไม่ได้กำหนดทีมสำหรับบัญชีนี้
                  </div>
                )
              ) : (
                <>
                  <div className="flex flex-col gap-3 rounded-3xl border border-violet-100 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-950">
                        {getMonthLabelForKey(
                          teamSelectedMonth,
                          allCases
                        )}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        {teamPerformanceRows.length} Teams • {allTeamsSummary.caseCount} Cases
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-violet-100 px-3 py-2 text-violet-700">
                        Overall Avg {allTeamsSummary.avgScore.toFixed(2)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-2 text-slate-700">
                        3-Month View
                      </span>
                    </div>
                  </div>

                  <div className="space-y-6">
                    {teamPerformanceRows.length ? (
                      teamPerformanceRows.map((row) => (
                        <div
                          key={row.teamName}
                          className="overflow-hidden rounded-[28px] border border-violet-200/80 bg-white shadow-[0_10px_30px_rgba(76,29,149,0.08)]"
                        >
                          <div className="flex flex-col gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-[17px] font-semibold text-slate-950">
                                {row.teamName}
                              </div>
                              <div className="mt-1 text-xs font-semibold text-slate-500">
                                {row.caseCount} Cases • {row.agentCount} Agents
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 text-xs font-semibold">
                              <span className="rounded-full bg-violet-700 px-3 py-2 text-white">
                                Avg {row.avgScore === null ? "No Data" : row.avgScore.toFixed(2)}
                              </span>
                              <span
                                className={
                                  "rounded-full px-3 py-2 " +
                                  (row.change === null
                                    ? "bg-slate-100 text-slate-500"
                                    : row.change > 0
                                      ? "bg-emerald-100 text-emerald-700"
                                      : row.change < 0
                                        ? "bg-rose-100 text-rose-700"
                                        : "bg-blue-100 text-blue-700")
                                }
                              >
                                {row.change === null
                                  ? "Base"
                                  : `${row.change > 0 ? "▲ +" : row.change < 0 ? "▼ " : ""}${row.change.toFixed(2)}`}
                              </span>
                              <span className={`rounded-full border px-3 py-2 ${getGradeTone(row.grade || "G")}`}>
                                Grade {row.grade || "-"}
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
                            <div>
                              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Agent Performance
                              </div>

                              <div className="overflow-hidden rounded-2xl border border-slate-200">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-950 text-white">
                                      <th className="px-3 py-2.5 text-left">Agent</th>
                                      <th className="px-2 py-2.5 text-center">Cases</th>
                                      <th className="px-2 py-2.5 text-center">Avg</th>
                                      <th className="px-2 py-2.5 text-center">Grade</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.agents.map((agentRow) => (
                                      <tr
                                        key={`${row.teamName}-${agentRow.agent}`}
                                        className="bg-white"
                                      >
                                        <td className="border-t border-slate-100 px-3 py-2.5 font-medium text-slate-900">
                                          {buildSuspendedAgentLabel(
                                            agentRow.agent,
                                            accountProfiles
                                          )}
                                          {agentRow.revisedCount > 0 ? (
                                            <div className="mt-0.5 text-[10px] font-semibold text-fuchsia-600">
                                              {agentRow.revisedCount} Revised
                                            </div>
                                          ) : null}
                                        </td>
                                        <td className="border-t border-slate-100 px-2 py-2.5 text-center font-medium text-slate-600">
                                          {agentRow.caseCount}
                                        </td>
                                        <td className="border-t border-slate-100 px-2 py-2.5 text-center font-semibold text-violet-700">
                                          {agentRow.avgScore.toFixed(2)}
                                        </td>
                                        <td className="border-t border-slate-100 px-2 py-2.5 text-center">
                                          <span className={`inline-flex rounded-full border px-2 py-1 font-semibold ${getGradeTone(agentRow.grade)}`}>
                                            {agentRow.grade}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div>
                              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Topic Performance
                              </div>

                              <div className="space-y-3">
                                {row.topics.map((topic) => (
                                  <div key={`${row.teamName}-${topic.code}`}>
                                    <div className="flex items-start justify-between gap-3 text-xs">
                                      <AnalyticsBilingualTopicLabel
                                        label={topic.label}
                                        code={topic.code}
                                        className="min-w-0"
                                      />
                                      <div className="shrink-0 font-semibold text-violet-700">
                                        {topic.pct.toFixed(2)}%
                                      </div>
                                    </div>
                                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-violet-100">
                                      <div
                                        className="h-full rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-500"
                                        style={{
                                          width: `${Math.max(
                                            0,
                                            Math.min(100, topic.pct)
                                          )}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="border-t border-violet-100 bg-slate-50/70 px-5 py-4">
                            <div>
                              <div className="text-xs font-semibold text-slate-900">
                                3-Month Average Trend
                              </div>
                              <div className="mt-1 text-[11px] font-semibold text-slate-500">
                                Supporting view for the selected month
                              </div>
                            </div>

                            <div className="relative mt-4 h-36 overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 pt-4 pb-11">
                              <div className="absolute inset-x-4 top-4 bottom-11">
                                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-200" />

                                <div className="absolute inset-0 flex items-end gap-8">
                                  {row.trend.map((trendItem) => {
                                    const barHeight =
                                      trendItem.avgScore === null
                                        ? 0
                                        : Math.max(
                                            8,
                                            Math.min(
                                              100,
                                              ((trendItem.avgScore - 70) / 30) * 100
                                            )
                                          );

                                    return (
                                      <div
                                        key={`${row.teamName}-${trendItem.monthKey}`}
                                        className="relative h-full min-w-0 flex-1"
                                      >
                                        <div
                                          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-slate-900"
                                          style={{ bottom: `calc(${barHeight}% + 6px)` }}
                                        >
                                          {trendItem.avgScore === null
                                            ? "N/A"
                                            : trendItem.avgScore.toFixed(2)}
                                        </div>

                                        <div
                                          className={
                                            "absolute bottom-0 left-[22%] right-[22%] rounded-t-xl " +
                                            (trendItem.avgScore === null
                                              ? "bg-slate-200"
                                              : "bg-gradient-to-t from-violet-700 to-fuchsia-500")
                                          }
                                          style={{ height: `${barHeight}%` }}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="absolute bottom-2 left-4 right-4 grid grid-cols-3 gap-8 text-center">
                                {row.trend.map((trendItem) => (
                                  <div key={`label-${row.teamName}-${trendItem.monthKey}`} className="min-w-0">
                                    <div
                                      className={
                                        "text-[11px] font-semibold " +
                                        (trendItem.change === null
                                          ? "text-slate-400"
                                          : trendItem.change > 0
                                            ? "text-emerald-600"
                                            : trendItem.change < 0
                                              ? "text-rose-600"
                                              : "text-blue-600")
                                      }
                                    >
                                      {trendItem.change === null
                                        ? "Base"
                                        : `${trendItem.change > 0 ? "+" : ""}${trendItem.change.toFixed(2)}`}
                                    </div>
                                    <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
                                      {trendItem.label}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                        </div>
                      ))
                    ) : (
                      <div className="col-span-full rounded-3xl border border-dashed border-violet-200 bg-violet-50/40 px-6 py-12 text-center text-sm font-semibold text-violet-600">
                        ไม่พบข้อมูลทีมในเดือนที่เลือก
                      </div>
                    )}
                  </div>
                </>              )}
            </PanelBody>
          </Panel>
        </div>
      ) : null}

      {false ? (
      <div>
        <div className="mx-auto max-w-[1720px] px-6 py-8 lg:px-8 lg:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-4xl">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200">QA Summary</div>
              <div className="mt-2 text-3xl font-medium tracking-tight lg:text-4xl">Weekly / Monthly / Yearly Summary Workspace</div>
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

      <div className={`mx-auto max-w-[1720px] px-6 py-6 lg:px-8 lg:py-8 ${summarySection === "summary" ? "" : "hidden"}`}>
        <div
          data-analytics-clean-v88="true"
          className="space-y-5"
        >
          <div data-analytics-logic-v90="true" className="space-y-5">
            {!embedded ? <div className="rounded-[20px] border border-violet-200 bg-gradient-to-br from-white via-violet-50/45 to-emerald-50/35 p-5 shadow-[0_8px_24px_rgba(76,29,149,0.08)]">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div data-weekly-dropdown-buttons-v138="true">
                  <FilterLabel>View By</FilterLabel>
                  <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl border border-violet-200 bg-violet-50 p-1">
                    {[
                      { value: "weekly", label: "Weekly View" },
                      { value: "monthly", label: "Monthly View" },
                      { value: "yearly", label: "Yearly View" },
                    ].map((option) => {
                      const active = analysisMode === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setAnalysisMode(
                              option.value as
                                | "weekly"
                                | "monthly"
                                | "yearly"
                            );
                            setSelectedPeriods([]);
                            setAnalyticsCompareOpen(false);
                          }}
                          className={
                            "rounded-lg px-2 py-2.5 text-[11px] font-medium transition " +
                            (active
                              ? "bg-violet-700 text-white shadow-sm"
                              : "bg-white text-violet-700 hover:bg-violet-100")
                          }
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <FilterLabel>Period</FilterLabel>

                  {analysisMode === "weekly" ? (
                    <select
                      value={
                        effectivePeriodKeys[
                          effectivePeriodKeys.length - 1
                        ] || ""
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        setSelectedPeriods(value ? [value] : []);
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    >
                      {weeklyPeriodGroups.map((group, groupIndex) => (
                        <React.Fragment key={group.monthKey}>
                          <optgroup label={group.monthLabel}>
                            {group.periods.map((period) => (
                              <option key={period} value={period}>
                                {getPeriodDisplayLabel(period)}
                              </option>
                            ))}
                          </optgroup>

                          {groupIndex < weeklyPeriodGroups.length - 1 ? (
                            <option
                              data-weekly-separator-hyphen-v139="true"
                              disabled
                              value={"__separator_" + group.monthKey}
                            >
                              ----------------------------
                            </option>
                          ) : null}
                        </React.Fragment>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={
                        effectivePeriodKeys[
                          effectivePeriodKeys.length - 1
                        ] || ""
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        setSelectedPeriods(value ? [value] : []);
                        if (analysisMode === "monthly" && value) {
                          setTeamSelectedMonth(value);
                        }
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    >
                      {periodOptions.map((period) => (
                        <option key={period} value={period}>
                          {getPeriodDisplayLabel(period)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <FilterLabel>Team</FilterLabel>
                  {analyticsCanSelectAllTeams ? (
                    <select value={selectedTeam} onChange={(event) => {
                      setSelectedTeam(event.target.value);
                      setSelectedAgent("all");
                      onSelectedAgentChange?.("all");
                    }} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100">
                      <option value="all">All Teams</option>
                      {analyticsTeamOptions.map((teamName) => <option key={teamName} value={teamName}>{teamName}</option>)}
                    </select>
                  ) : <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-normal text-slate-700">{currentUserTeamName || "Assigned Scope"}</div>}
                </div>
                <div>
                  <FilterLabel>Agent</FilterLabel>
                  <div className="mt-2">
                    {!analyticsCanSelectAllAgents ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-normal text-slate-700">{effectiveSelectedAgent ? buildSuspendedAgentLabel(effectiveSelectedAgent, accountProfiles) : "-"}</div>
                    ) : (
                      <FilterSelect
                        value={effectiveSelectedAgent || "all"}
                        onChange={selectAnalyticsAgent}
                        options={agentFilterOptions}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="text-xs font-normal text-slate-500">
                  {isComparisonMode
                    ? "กำลังเปรียบเทียบ " + effectivePeriodLabels.join(" · ")
                    : "กำลังแสดง " + (effectivePeriodLabels[0] || "ช่วงปัจจุบัน")}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisMode("monthly");
                      setSelectedPeriods([]);
                      setSelectedTeam(
                        analyticsCanSelectAllTeams
                          ? "all"
                          : currentUserTeamName || "all"
                      );
                      if (analyticsCanSelectAllAgents) {
                        selectAnalyticsAgent("all");
                      }
                    }}
                    className="text-xs font-normal text-violet-600 hover:text-violet-800"
                  >
                    Reset filters
                  </button>
                </div>
              </div>
            </div> : null}

            {analyticsCompareOpen ? (
              <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/45 p-4">
                <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[22px] border border-slate-200 bg-white shadow-2xl">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                    <div><div className="text-lg font-semibold text-slate-900">Compare Periods</div><div className="mt-1 text-xs font-normal text-slate-500">{reportModeName} · เลือก 2–{maxSelectedPeriods} ช่วง</div></div>
                    <button type="button" onClick={() => setAnalyticsCompareOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">×</button>
                  </div>
                  <div className="p-6">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {periodOptions.map((period) => {
                        const checked = compareDraftPeriods.includes(period);
                        const disabled = !checked && compareDraftPeriods.length >= maxSelectedPeriods;
                        return (
                          <button key={period} type="button" disabled={disabled} onClick={() => {
                            if (checked) {
                              setCompareDraftPeriods(compareDraftPeriods.filter((item) => item !== period));
                            } else if (!disabled) {
                              setCompareDraftPeriods(sortPeriodKeys([...compareDraftPeriods, period]));
                            }
                          }} className={"flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-normal transition " + (checked ? "border-violet-400 bg-violet-50 text-violet-800" : disabled ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300" : "border-slate-200 bg-white text-slate-600 hover:border-violet-300")}>
                            <span>{getPeriodDisplayLabel(period)}</span><span>{checked ? "✓" : ""}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-5">
                      <div className="text-xs font-normal text-slate-500">{compareDraftPeriods.length}/{maxSelectedPeriods} selected</div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setAnalyticsCompareOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
                        <button type="button" disabled={compareDraftPeriods.length < 2} onClick={() => {
                          setSelectedPeriods(sortPeriodKeys(compareDraftPeriods));
                          setAnalyticsCompareOpen(false);
                        }} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40">Compare</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div data-analytics-overview-logic-v90="true" data-analytics-readable-v128="true" className="min-w-0 space-y-5">
            <AnalyticsOverviewV89
              summary={summaryCards}
              cases={filteredCases}
              trendRows={qualityScoreTrendRows}
              hideSummaryCards={embedded}
              monthlyMode={
                analysisMode === "monthly" &&
                !isComparisonMode
              }
              individualMode={
                effectiveSelectedAgent !== "all"
              }
              noCaseMonthKey={activeNoCaseMonthKey}
              periodKeys={
                effectivePeriodKeys
              }
              policyPeriodLabel={effectivePeriodLabels.join(" · ")}
              detailContent={
                <div data-analytics-primary-details-v145="true" className="space-y-5">
                  <Panel className="border-violet-200/90 shadow-[0_10px_28px_rgba(76,29,149,0.08)]">
                    <PanelHeader
                      title="รายละเอียดผลการประเมินและหัวข้อ (Performance & Topic Detail)"
                      subtitle="จำนวนเคส คะแนนเฉลี่ย เกรด และผลคะแนนรายหัวข้อ"
                    />
                    <PanelBody>
                      <div className="min-w-0 space-y-6">
                        <section className="min-w-0">
                          <div className="mb-4">
                            <div className="text-[13px] font-medium text-slate-900">
                              รายละเอียดผลการประเมิน (Performance Detail)
                            </div>
                            <div className="mt-1 text-[10px] font-normal text-slate-500">
                              จำนวนเคส คะแนนเฉลี่ย และเกรดของช่วงเวลาที่เลือก
                            </div>
                          </div>
                          <SummaryTable
                            rows={summaryRows}
                            firstColLabel={firstColLabel}
                            showIncentive={summaryTableShowIncentive}
                            localizedHeaders
                          />
                        </section>

                        <section className="min-w-0 border-t border-slate-100 pt-6">
                          <div className="mb-4">
                            <div className="text-[13px] font-medium text-slate-900">
                              รายละเอียดตามหัวข้อ (Topic Detail)
                            </div>
                            <div className="mt-1 text-[10px] font-normal text-slate-500">
                              คะแนนเฉลี่ยรายหัวข้อเทียบกับเกณฑ์ KPI {PERFORMANCE_KPI_TARGET}%
                            </div>
                          </div>
                          <AnalyticsTopicDetail
                            topics={topicSummary}
                          />
                        </section>
                      </div>
                    </PanelBody>
                  </Panel>
                </div>
              }
            />

            <AnalyticsAgentPerformanceV92
              cases={filteredCases}
              noCaseAgentNames={periodScopedNoCaseEvaluations.map(
                (item) => item.agentName || item.targetDisplayName
              )}
              agentNames={
                effectiveSelectedAgent !== "all"
                  ? [effectiveSelectedAgent]
                  : roleScopedAgentList.length
                    ? roleScopedAgentList
                    : selectedTeam !== "all"
                      ? selectableAgentOptions.filter((agent) => {
                          const account = getAccountStatus(
                            agent,
                            accountProfiles
                          );
                          return (
                            normalizeText(getSummaryTeamName(account)) ===
                            normalizeText(selectedTeam)
                          );
                        })
                      : selectableAgentOptions
              }
              accountProfiles={accountProfiles}
              monthKey={
                analysisMode === "monthly"
                  ? effectivePeriodKeys[
                      effectivePeriodKeys.length - 1
                    ] || ""
                  : ""
              }
              monthlyMode={
                analysisMode === "monthly" &&
                !isComparisonMode
              }
              selectedAgent={effectiveSelectedAgent}
              periodLabel={effectivePeriodLabels.join(" · ")}
              canSelectAgent={analyticsCanSelectAllAgents}
              onSelectAgent={(agent) => {
                if (!analyticsCanSelectAllAgents) return;
                selectAnalyticsAgent(agent);
              }}
            />
            {isComparisonMode ? (
              <Panel>
                <PanelHeader title="Period Comparison" subtitle={`เปรียบเทียบ ${effectivePeriodLabels.join(" · ")}`} />
                <PanelBody><SummaryTable rows={comparisonRowsWithDelta} firstColLabel={reportModeName} /></PanelBody>
              </Panel>
            ) : null}
          </div>
          <div
            data-analytics-filterbar-v89="true"
            className="hidden"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <FilterLabel>
                  Date Range
                </FilterLabel>
                <button
                  type="button"
                  onClick={() =>
                    setAnalyticsCustomizeOpen(
                      true
                    )
                  }
                  className="mt-2 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-normal text-slate-600 transition hover:border-violet-300"
                >
                  <span className="truncate">
                    {effectivePeriodLabels.join(
                      " · "
                    ) ||
                      "Current period"}
                  </span>
                  <span className="text-violet-500">
                    ▣
                  </span>
                </button>
              </div>

              <div>
                <FilterLabel>
                  View By
                </FilterLabel>
                <div className="mt-2">
                  <select
                    value={analysisMode}
                    onChange={(event) =>
                      setAnalysisMode(
                        event.target
                          .value as
                          | "weekly"
                          | "monthly"
                          | "yearly"
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-700 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  >
                    <option value="weekly">
                      Weekly
                    </option>
                    <option value="monthly">
                      Monthly
                    </option>
                    <option value="yearly">
                      Yearly
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <FilterLabel>
                  Team
                </FilterLabel>
                <button
                  type="button"
                  onClick={() => {
                    if (!isAdminRole) {
                      setSummarySection(
                        "team"
                      );
                    }
                  }}
                  className="mt-2 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-normal text-slate-600 transition hover:border-violet-300"
                >
                  <span className="truncate">
                    {currentUserTeamName ||
                      "All Teams"}
                  </span>
                  <span className="text-slate-400">
                    ⌄
                  </span>
                </button>
              </div>

              <div>
                <FilterLabel>
                  Agent
                </FilterLabel>
                <div className="mt-2">
                  {roleScopedAgentList.length ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm font-normal text-slate-700">
                      {effectiveSelectedAgent
                        ? buildSuspendedAgentLabel(
                            effectiveSelectedAgent,
                            accountProfiles
                          )
                        : "-"}
                    </div>
                  ) : (
                    <FilterSelect
                      value={
                        effectiveSelectedAgent ||
                        "all"
                      }
                      onChange={(value) => {
                        selectAnalyticsAgent(value);
                        onSelectedAgentChange?.(
                          String(value || "").trim() || "all"
                        );
                      }}
                      options={[
                        {
                          value: "all",
                          label:
                            "All Agents",
                        },
                      ].concat(
                        selectableAgentOptions.map(
                          (agent) => ({
                            value: agent,
                            label:
                              buildSuspendedAgentLabel(
                                agent,
                                accountProfiles
                              ),
                          })
                        )
                      )}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setAnalysisMode(
                    "monthly"
                  );
                  setSelectedPeriods([]);
                  setPeriodFilterYear(
                    "all"
                  );
                  setPeriodFilterMonth(
                    "all"
                  );

                  if (
                    !roleScopedAgentList.length
                  ) {
                    setSelectedAgent(
                      "all"
                    );
                    onSelectedAgentChange?.(
                      "all"
                    );
                  }
                }}
                className="text-xs font-normal text-violet-600 transition hover:text-violet-800"
              >
                Clear all
              </button>
            </div>
          </div>

          {analyticsCustomizeOpen ? (
            <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 p-4">
              <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[22px] border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">
                      Report Builder
                    </div>
                    <div className="mt-1 text-xs font-normal text-slate-500">
                      รายงานผลตามช่วงเวลาและการเปรียบเทียบหลายช่วง
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setAnalyticsCustomizeOpen(
                        false
                      )
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                    aria-label="Close Report Builder"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-5 p-6">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <FilterLabel>
                        Report Type
                      </FilterLabel>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {[
                          {
                            value:
                              "weekly",
                            label:
                              "Weekly",
                          },
                          {
                            value:
                              "monthly",
                            label:
                              "Monthly",
                          },
                          {
                            value:
                              "yearly",
                            label:
                              "Yearly",
                          },
                        ].map(
                          (option) => (
                            <button
                              key={
                                option.value
                              }
                              type="button"
                              onClick={() =>
                                setAnalysisMode(
                                  option.value as
                                    | "weekly"
                                    | "monthly"
                                    | "yearly"
                                )
                              }
                              className={
                                "rounded-xl border px-3 py-2.5 text-xs font-medium transition " +
                                (
                                  analysisMode ===
                                  option.value
                                    ? "border-violet-500 bg-violet-600 text-white"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-violet-300"
                                )
                              }
                            >
                              {
                                option.label
                              }
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {analysisMode !==
                    "yearly" ? (
                      <div>
                        <FilterLabel>
                          Year
                        </FilterLabel>
                        <div className="mt-2">
                          <FilterSelect
                            value={
                              effectivePeriodYear
                            }
                            onChange={(
                              value
                            ) => {
                              setPeriodFilterYear(
                                value
                              );
                              setPeriodFilterMonth(
                                "all"
                              );
                              setSelectedPeriods(
                                []
                              );
                            }}
                            options={selectableYears.map(
                              (
                                year
                              ) => ({
                                value:
                                  year,
                                label:
                                  year,
                              })
                            )}
                          />
                        </div>
                      </div>
                    ) : null}

                    {analysisMode ===
                    "weekly" ? (
                      <div>
                        <FilterLabel>
                          Filter Month
                        </FilterLabel>
                        <div className="mt-2">
                          <FilterSelect
                            value={
                              periodFilterMonth
                            }
                            onChange={(
                              value
                            ) => {
                              setPeriodFilterMonth(
                                value
                              );
                              setSelectedPeriods(
                                []
                              );
                            }}
                            options={
                              weekMonthOptions
                            }
                          />
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <FilterLabel>
                        Agent
                      </FilterLabel>
                      <div className="mt-2">
                        {roleScopedAgentList.length ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-700">
                            {effectiveSelectedAgent ||
                              "-"}
                          </div>
                        ) : (
                          <FilterSelect
                            value={
                              effectiveSelectedAgent ||
                              "all"
                            }
                            onChange={(
                              value
                            ) => {
                              setSelectedAgent(
                                value
                              );
                              onSelectedAgentChange?.(
                                value
                              );
                            }}
                            options={[
                              {
                                value:
                                  "all",
                                label:
                                  "All Agents",
                              },
                            ].concat(
                              selectableAgentOptions.map(
                                (
                                  agent
                                ) => ({
                                  value:
                                    agent,
                                  label:
                                    buildSuspendedAgentLabel(
                                      agent,
                                      accountProfiles
                                    ),
                                })
                              )
                            )}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <FilterLabel>
                        {analysisMode ===
                        "weekly"
                          ? "Select Weeks"
                          : analysisMode ===
                              "monthly"
                            ? "Select Months"
                            : "Select Years"}
                      </FilterLabel>

                      <div className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-medium text-violet-700">
                        {
                          selectedPeriods.length
                        }
                        /{maxSelectedPeriods}
                      </div>
                    </div>

                    <div
                      data-weekly-period-groups-v135="true"
                      className="mt-2 max-h-[320px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-3"
                    >
                      {(analysisMode === "weekly"
                        ? weeklyPeriodGroups
                        : [
                            {
                              monthKey: "all",
                              monthLabel: "",
                              periods: periodOptions,
                            },
                          ]
                      ).map((group, groupIndex) => (
                        <div
                          key={group.monthKey}
                          className={
                            groupIndex > 0
                              ? "mt-4 border-t border-dashed border-slate-300 pt-4"
                              : ""
                          }
                        >
                          {analysisMode === "weekly" ? (
                            <div className="mb-2 flex items-center gap-3">
                              <div className="text-xs font-semibold text-slate-700">
                                {group.monthLabel}
                              </div>
                              <div className="h-px flex-1 border-t border-dashed border-slate-300" />
                            </div>
                          ) : null}

                          <div className="flex flex-wrap gap-2">
                            {group.periods.map((period) => {
                              const checked =
                                selectedPeriods.includes(period);
                              const disabled =
                                !checked &&
                                selectedPeriods.length >=
                                  maxSelectedPeriods;

                              return (
                                <button
                                  key={period}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => {
                                    if (checked) {
                                      setSelectedPeriods(
                                        selectedPeriods.filter(
                                          (item) => item !== period
                                        )
                                      );
                                      return;
                                    }

                                    if (disabled) return;

                                    setSelectedPeriods(
                                      sortPeriodKeys([
                                        ...selectedPeriods,
                                        period,
                                      ])
                                    );
                                  }}
                                  className={
                                    "min-w-[140px] rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition " +
                                    (checked
                                      ? "border-violet-400 bg-white text-violet-800 shadow-sm"
                                      : disabled
                                        ? "cursor-not-allowed border-transparent bg-slate-100 text-slate-400 opacity-60"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-violet-300")
                                  }
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <span>
                                      {getPeriodDisplayLabel(period)}
                                    </span>
                                    <span className="text-violet-600">
                                      {checked ? "✓" : ""}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-5">
                    <button
                      type="button"
                      onClick={() =>
                        setAnalyticsCustomizeOpen(
                          false
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      Close
                    </button>

                    {analysisMode === "weekly" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setAnalyticsCustomizeOpen(false);
                          setViewMode("weekly-dashboard");
                        }}
                        disabled={!effectivePeriodKeys.length}
                        className="rounded-xl border border-violet-300 bg-white px-5 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Weekly View
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => {
                        setAnalyticsCustomizeOpen(false);
                      }}
                      disabled={
                        !effectivePeriodKeys.length
                      }
                      className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Apply View
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="hidden">
            <AnalyticsOverviewV89
              summary={summaryCards}
              cases={filteredCases}
              trendRows={qualityScoreTrendRows}
              monthlyMode={
                analysisMode === "monthly" &&
                !isComparisonMode
              }
              individualMode={
                effectiveSelectedAgent !== "all"
              }
              noCaseMonthKey={activeNoCaseMonthKey}
              periodKeys={effectivePeriodKeys}
            />

            {analysisMode === "monthly" ? (
              <Panel>
                <PanelHeader
                  title="Team Monthly Analytics — Last 3 Months"
                  subtitle="แนวโน้มคะแนนเฉลี่ยและผลการประเมินรายทีมย้อนหลัง 3 เดือน"
                />
                <PanelBody>
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(480px,1.2fr)]">
                    <div className="rounded-2xl border border-violet-100 bg-white p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            Monthly Average Score Trend
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">
                            Score scale 70–100
                          </div>
                        </div>
                        <div className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
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
                                  className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-slate-800"
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
                              className="min-w-0 flex-1 truncate text-center text-[11px] font-medium text-slate-500"
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
                              <td className="border-t border-violet-100 px-4 py-4 font-semibold text-slate-900">
                                {row.label}
                              </td>
                              <td className="border-t border-violet-100 px-4 py-4 text-center font-medium text-slate-700">
                                {row.caseCount}
                              </td>
                              <td className="border-t border-violet-100 px-4 py-4 text-center font-semibold text-violet-700">
                                {row.caseCount
                                  ? row.avgScore.toFixed(2)
                                  : "No data"}
                              </td>
                              <td
                                className={
                                  "border-t border-violet-100 px-4 py-4 text-center font-semibold " +
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
                              <td className="border-t border-violet-100 px-4 py-4 text-center font-semibold text-slate-800">
                                {row.caseCount ? row.grade : "-"}
                              </td>
                              <td className="border-t border-violet-100 px-4 py-4 text-center font-medium text-slate-700">
                                {row.revisedCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="border-t border-violet-100 bg-violet-50 px-4 py-3 text-xs font-semibold text-violet-700">
                        คะแนนเฉลี่ย จำนวนเคส และการเปลี่ยนแปลงของทีมย้อนหลัง 3 เดือน
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
                      ? "คะแนนและผลการประเมินราย Agent แยกตามช่วงเวลา"
                      : "คะแนนและผลการประเมินราย Agent ในช่วงเวลาล่าสุด"
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
                            <td className="border-t border-violet-100 px-4 py-3 font-medium text-slate-900">
                              {buildSuspendedAgentLabel(row.agent, accountProfiles)}
                            </td>
                            {row.values.map((value: any) => (
                              <td key={value.period} className="border-t border-violet-100 px-4 py-3 text-center">
                                {value.score === null ? (
                                  <span className="font-medium text-slate-400">N/A</span>
                                ) : (
                                  <>
                                    <div className="font-semibold text-violet-700">{value.score.toFixed(2)}</div>
                                    <div className="text-[11px] text-slate-500">{value.caseCount} case(s)</div>
                                  </>
                                )}
                              </td>
                            ))}
                            <td className={
                              "border-t border-violet-100 px-4 py-3 text-center font-semibold " +
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


            {analysisMode === "monthly" ? (
            <Panel>
              <PanelHeader
                title="Performance Status & Coaching Watchlist"
                subtitle={`ตรวจสอบสถานะ KPI ต่อเนื่อง 3 เดือน • เป้าหมายรายเดือน ${PERFORMANCE_KPI_TARGET}%`}
              />
              <PanelBody className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                      ไม่ผ่าน QA 3 เดือนติด
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-950">
                      {performanceStatusSummary.failedQa}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-yellow-100 bg-yellow-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-yellow-700">
                      Coaching Program
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-950">
                      {performanceStatusSummary.coaching}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
                      Contract Review
                    </div>
                    <div className="mt-1 text-2xl font-semibold text-slate-950">
                      {performanceStatusSummary.contractReview}
                    </div>
                  </div>
                </div>

                {performanceStatusRows.length ? (
                  <div className="overflow-x-auto rounded-2xl border border-violet-100">
                    <table className="min-w-[1240px] w-full text-sm">
                      <thead>
                        <tr className="bg-slate-950 text-white">
                          <th className="px-4 py-3 text-left">Agent</th>
                          <th className="px-4 py-3 text-left">Team</th>
                          {performanceStatusMonthKeys.map((monthKey) => (
                            <th key={`status-header-${monthKey}`} className="px-4 py-3 text-center">
                              {getMonthLabelForKey(monthKey, allCases)}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-center">ไม่ผ่านต่อเนื่อง</th>
                          <th className="px-4 py-3 text-center">QA Status</th>
                          <th className="px-4 py-3 text-left">Required Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {performanceStatusRows.map((row) => (
                          <tr key={`status-${row.agent}`} className="bg-white">
                            <td className="border-t border-slate-100 px-4 py-3 font-semibold text-slate-900">
                              {buildSuspendedAgentLabel(row.agent, accountProfiles)}
                            </td>
                            <td className="border-t border-slate-100 px-4 py-3 font-semibold text-slate-600">
                              {row.teamName}
                            </td>
                            {row.trend.map((month) => (
                              <td
                                key={`${row.agent}-${month.monthKey}`}
                                className="border-t border-slate-100 px-3 py-3 text-center"
                              >
                                {month.avgScore === null ? (
                                  <div className="text-xs font-medium text-slate-400">No Data</div>
                                ) : (
                                  <div className="space-y-1.5">
                                    <div className="font-semibold text-slate-900">
                                      {month.avgScore.toFixed(2)}
                                    </div>
                                    <span
                                      className={
                                        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold " +
                                        (month.meetsKpi
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-amber-100 text-amber-800")
                                      }
                                    >
                                      {month.meetsKpi ? "ผ่าน KPI" : "ไม่ผ่าน KPI"}
                                    </span>
                                  </div>
                                )}
                              </td>
                            ))}
                            <td className="border-t border-slate-100 px-4 py-3 text-center">
                              <span
                                className={
                                  "inline-flex rounded-full px-3 py-1 text-xs font-semibold " +
                                  (row.failedQaThreeMonths
                                    ? "bg-rose-100 text-rose-700"
                                    : row.consecutiveBelowKpi > 0
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-emerald-100 text-emerald-700")
                                }
                              >
                                {row.consecutiveBelowKpi} เดือน
                              </span>
                            </td>
                            <td className="border-t border-slate-100 px-4 py-3 text-center">
                              <span
                                className={
                                  "inline-flex rounded-full px-3 py-1 text-xs font-semibold " +
                                  (row.failedQaThreeMonths
                                    ? "bg-rose-100 text-rose-700"
                                    : "bg-emerald-100 text-emerald-700")
                                }
                              >
                                {row.qaStatus}
                              </span>
                            </td>
                            <td className="border-t border-slate-100 px-4 py-3 font-medium text-slate-700">
                              {row.actions.length ? row.actions.join(" • ") : "Monitor"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm font-medium text-slate-600">
                    ไม่พบข้อมูลการประเมินในช่วง 3 เดือนที่ใช้ตรวจสอบ
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <div className="text-sm font-semibold text-slate-900">
                    เกณฑ์การพิจารณาสถานะ
                  </div>

                  <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                    <li className="flex gap-3">
                      <span className="font-semibold text-violet-700">1.</span>
                      <span>
                        คะแนนตั้งแต่ <strong>{PERFORMANCE_KPI_TARGET}%</strong> ขึ้นไป ถือว่าผ่าน KPI ของเดือนนั้น
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-semibold text-violet-700">2.</span>
                      <span>
                        คะแนนต่ำกว่า <strong>{PERFORMANCE_KPI_TARGET}%</strong> ติดต่อกัน 1–2 เดือน ยังอยู่ในเกณฑ์ปกติ และแสดงสถานะ Monitor
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-semibold text-violet-700">3.</span>
                      <span>
                        คะแนนต่ำกว่า <strong>{PERFORMANCE_KPI_TARGET}%</strong> ติดต่อกันครบ 3 เดือน ถือว่าไม่ผ่าน QA และเข้าสู่ Coaching Program
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-semibold text-violet-700">4.</span>
                      <span>
                        Grade D ในเดือนปัจจุบัน หรือ Grade C ติดต่อกัน 3 เดือน เข้าสู่ Coaching Program
                      </span>
                    </li>
                    <li className="flex gap-3">
                      <span className="font-semibold text-violet-700">5.</span>
                      <span>
                        Grade D ติดต่อกัน 3 เดือน เข้าสู่ Contract Renewal Review
                      </span>
                    </li>
                  </ol>
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
                      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
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
                            <div className="text-[11px] font-medium uppercase tracking-wide text-violet-600">
                              Total Cases
                            </div>
                            <div className="mt-1 text-xl font-semibold text-slate-900">
                              {report.caseCount}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-sky-700">
                              Agents Evaluated
                            </div>
                            <div className="mt-1 text-xl font-semibold text-slate-900">
                              {report.coverage.agentCount}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50 px-4 py-3">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-fuchsia-700">
                              Average / Agent
                            </div>
                            <div className="mt-1 text-xl font-semibold text-slate-900">
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
                                <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                                  Target Met
                                </div>
                                <div className="mt-1 text-xl font-semibold text-slate-900">
                                  {report.coverage.agentsMeetingTarget}/{report.coverage.agentCount}
                                </div>
                                <div className="text-[11px] font-semibold text-slate-500">
                                  Agents
                                </div>
                              </div>

                              <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                                <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700">
                                  Monthly Plan
                                </div>
                                <div className="mt-1 text-lg font-semibold text-slate-900">
                                  {report.coverage.target} Cases × {report.coverage.agentCount} Agents
                                </div>
                              </div>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-violet-600">
                              Agent
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">
                              {buildSuspendedAgentLabel(
                                effectiveSelectedAgent,
                                accountProfiles
                              )}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-sky-700">
                              Evaluated Cases
                            </div>
                            <div className="mt-1 text-xl font-semibold text-slate-900">
                              {analysisMode ===
                              "monthly"
                                ? `${report.caseCount}/${report.coverage.target}`
                                : report.caseCount}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                              Status
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">
                              {report.coverage.selectedAgentStatus || "No Data"}
                            </div>
                          </div>

                          {analysisMode ===
                          "monthly" ? (
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                              <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700">
                                Monthly Target
                              </div>
                              <div className="mt-1 text-xl font-semibold text-slate-900">
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
                                <td className="border-t border-violet-100 px-4 py-3">
                                  <AnalyticsBilingualTopicLabel label={topic.label} code={topic.code} />
                                </td>
                                <td className="border-t border-violet-100 px-4 py-3 text-center font-semibold text-slate-900">
                                  {topic.avgScore.toFixed(2)}
                                </td>
                                <td className="border-t border-violet-100 px-4 py-3 text-center font-semibold text-slate-600">
                                  {topic.max.toFixed(2)}
                                </td>
                                <td className="border-t border-violet-100 px-4 py-3 text-center font-semibold text-violet-700">
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
                            <div className="text-sm font-semibold text-emerald-700">Strongest Topics</div>
                            <div className="mt-3 space-y-2">
                              {report.strongest.map((topic, index) => (
                                <div key={topic.code} className="rounded-xl bg-white/80 px-3 py-2">
                                  <AnalyticsBilingualTopicLabel
                                    label={topic.label}
                                    code={String(index + 1)}
                                    thaiClassName="text-xs font-bold leading-5 text-slate-800"
                                    englishClassName="mt-0.5 text-[10px] font-bold italic leading-4 text-rose-600"
                                  />
                                  <div className="mt-1 text-sm font-semibold text-emerald-700">{topic.pct.toFixed(2)}%</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                            <div className="text-sm font-semibold text-amber-700">Coaching Focus</div>
                            <div className="mt-3 space-y-2">
                              {report.coaching.map((topic, index) => (
                                <div key={topic.code} className="rounded-xl bg-white/80 px-3 py-2">
                                  <AnalyticsBilingualTopicLabel
                                    label={topic.label}
                                    code={String(index + 1)}
                                    thaiClassName="text-xs font-bold leading-5 text-slate-800"
                                    englishClassName="mt-0.5 text-[10px] font-bold italic leading-4 text-rose-600"
                                  />
                                  <div className="mt-1 text-sm font-semibold text-amber-700">{topic.pct.toFixed(2)}%</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-violet-100 bg-white p-4">
                          <div className="text-sm font-semibold text-violet-800">Grade Mix</div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {report.gradeMix.map((item) => (
                              <div key={item.grade} className="flex items-center justify-between rounded-xl bg-violet-50 px-3 py-2 text-xs">
                                <span className="font-semibold text-violet-800">{item.grade}</span>
                                <span className="font-medium text-slate-600">{item.count} ({item.pct.toFixed(2)}%)</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
                          <div className="text-sm font-semibold text-sky-800">Review Status Mix</div>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-white px-3 py-3 text-center">
                              <div className="text-2xl font-semibold text-sky-700">{report.reviewMix.original}</div>
                              <div className="mt-1 text-xs font-medium text-slate-500">Original</div>
                            </div>
                            <div className="rounded-xl bg-white px-3 py-3 text-center">
                              <div className="text-2xl font-semibold text-fuchsia-700">{report.reviewMix.revised}</div>
                              <div className="mt-1 text-xs font-medium text-slate-500">Revised</div>
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
                  subtitle="คะแนนเฉลี่ย การกระจายคะแนน และสัดส่วนสถานะการตรวจทานของช่วงเวลาที่เลือก"
                />
                <PanelBody>
                  <div className="grid gap-4 xl:grid-cols-3">
                    <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
                      <div className="text-sm font-semibold text-slate-900">
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
                                    className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-slate-800"
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
                      <div className="text-sm font-semibold text-slate-900">
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
                                    className="absolute left-1/2 -translate-x-1/2 text-[11px] font-semibold text-slate-800"
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
                      <div className="text-sm font-semibold text-slate-900">Review Status Mix</div>
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
                            <div className="text-2xl font-semibold text-violet-700">
                              {comparisonChartAnalytics.originalPct.toFixed(0)}%
                            </div>
                            <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                              Original
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 w-full space-y-3">
                          <div className="flex items-center justify-between rounded-xl bg-violet-50 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="h-3 w-3 rounded-full bg-violet-700" />
                              <span className="text-xs font-medium text-slate-700">Original</span>
                            </div>
                            <div className="text-xs font-semibold text-violet-700">
                              {comparisonChartAnalytics.original} ({comparisonChartAnalytics.originalPct.toFixed(2)}%)
                            </div>
                          </div>

                          <div className="flex items-center justify-between rounded-xl bg-fuchsia-50 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="h-3 w-3 rounded-full bg-fuchsia-500" />
                              <span className="text-xs font-medium text-slate-700">Revised</span>
                            </div>
                            <div className="text-xs font-semibold text-fuchsia-700">
                              {comparisonChartAnalytics.revised} ({comparisonChartAnalytics.revisedPct.toFixed(2)}%)
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 text-xs font-medium text-slate-500">
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
                              <td className="border-t border-violet-100 px-4 py-3">
                                <AnalyticsBilingualTopicLabel label={topic.label} code={topic.code} />
                              </td>
                              {topic.values.map((value: any) => (
                                <td key={value.period} className="border-t border-violet-100 px-4 py-3 text-center">
                                  {value.pct === null ? (
                                    <div className="font-medium text-slate-400">Not Applicable</div>
                                  ) : (
                                    <>
                                      <div className="font-semibold text-violet-700">{value.pct.toFixed(2)}%</div>
                                      <div className={
                                        "mt-1 text-xs font-semibold " +
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
                title="Details"
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




          </div>
        </div>
      </div>
    </div>
  );
}
