import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Grade = "A" | "B" | "C" | "D" | "F";
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

type TopicSummary = {
  code: string;
  label: string;
  avgScore: number;
  max: number;
  pct: number;
};

type PeriodSummary = {
  label: string;
  caseCount: number;
  avgScore: number;
  grade: Grade;
  revisedCount: number;
  incentive: number;
  policyMonthKey: string;
};

type AgentPeriodSummary = {
  agent: string;
  label: string;
  caseCount: number;
  avgScore: number;
  grade: Grade;
  revisedCount: number;
  incentive: number;
  policyMonthKey: string;
};

type PeriodTableRow = {
  label: string;
  weekLabel?: string;
  monthLabel?: string;
  yearLabel?: string;
  caseCount: number;
  avgScore: number;
  grade: Grade;
  revisedCount: number;
  incentive: number;
  policyMonthKey: string;
};

type SummaryView =
  | "weekly-dashboard"
  | "weekly-qa-by-agent"
  | "monthly-dashboard"
  | "monthly-team-summary"
  | "yearly-team-summary"
  | "yearly-by-agent";

const CASE_TARGET = 10;
const SONGKRAN_THEME_END = new Date(2026, 3, 25, 23, 59, 59);
const NEW_POLICY_START_MONTH_KEY = "2026-04";

const TOPIC_MASTER = [
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
  const now = new Date();
  return now <= SONGKRAN_THEME_END && now.getFullYear() === 2026 && now.getMonth() === 3;
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
  return selectedMonthKey >= matchedEntry[1];
}

function isNewPolicyMonth(monthKey: string) {
  return monthKey !== "unknown" && monthKey >= NEW_POLICY_START_MONTH_KEY;
}

function scoreToGrade(score: number, monthKey: string): Grade {
  if (isNewPolicyMonth(monthKey)) {
    if (score >= 90) return "A";
    if (score >= 85) return "B";
    if (score >= 80) return "C";
    return "D";
  }
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
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
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function getPolicyMonthKeyForCases(cases: CaseItem[]) {
  const validMonthKeys = cases
    .map((item) => item.monthKey)
    .filter((item) => item && item !== "unknown")
    .sort((a, b) => a.localeCompare(b));
  return validMonthKeys.length ? validMonthKeys[validMonthKeys.length - 1] : "unknown";
}

function getIncentiveValue(caseCount: number, avg: number, monthKey: string) {
  if (caseCount < CASE_TARGET) return 0;
  if (isNewPolicyMonth(monthKey)) {
    if (avg >= 90) return 1000;
    if (avg >= 85) return 700;
    if (avg >= 80) return 500;
    return 0;
  }
  if (avg >= 90) return 1000;
  if (avg >= 80) return 700;
  if (avg >= 70) return 300;
  return 0;
}

function excelDateToJSDate(value: any): Date | null {
  if (!value && value !== 0) return null;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const text = String(value).trim();
  if (!text) return null;
  const ddmmyyyyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ddmmyyyyMatch) {
    const [, d, m, y] = ddmmyyyyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const asDate = new Date(text);
  if (!Number.isNaN(asDate.getTime())) {
    return new Date(asDate.getFullYear(), asDate.getMonth(), asDate.getDate());
  }
  return null;
}

function formatAuditDate(value: any): string {
  const dt = excelDateToJSDate(value);
  if (!dt) return String(value ?? "").trim();
  const day = `${dt.getDate()}`.padStart(2, "0");
  const month = `${dt.getMonth() + 1}`.padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
}

function getMonthKey(date: Date | null) {
  if (!date) return "unknown";
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}`;
}

function getMonthLabel(date: Date | null) {
  if (!date) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function getYearKey(date: Date | null) {
  if (!date) return "unknown";
  return String(date.getFullYear());
}

function mergeTopicSet(topics: Topic[], revisedTopics?: Topic[] | null) {
  if (!revisedTopics?.length) return topics;
  const revisedMap = new Map(revisedTopics.map((topic) => [topic.code, topic]));
  return topics.map((topic) => revisedMap.get(topic.code) || topic);
}

function calcMergedFinalScore(baseTopics: Topic[], revisedTopics: Topic[]) {
  const revisedMap = new Map(revisedTopics.map((t) => [t.code, t]));
  const total = baseTopics.reduce((sum, base) => {
    const active = revisedMap.get(base.code) || base;
    return sum + active.score;
  }, 0);
  return Number(total.toFixed(2));
}

function buildHeaderHelpers(headerRow: any[]) {
  const normalizedHeaders = headerRow.map((h) => normalizeText(h));
  const colIndexes = (name: string) => {
    const target = normalizeText(name);
    return normalizedHeaders.map((h, idx) => (h === target ? idx : -1)).filter((idx) => idx >= 0);
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

function normalizeAppealReason(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isNoAppealReason(value: unknown) {
  const text = normalizeAppealReason(value);
  if (!text) return false;
  const normalized = text.toLowerCase();
  return normalized === "ไม่อุทธรณ์หัวข้อนี้" || normalized === "not appeal" || normalized === "no appeal" || normalized.includes("ไม่อุทธรณ์");
}

function normalizeCommentForCompare(value?: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
  const originalScoreNum = originalScore !== null && originalScore !== "" && !Number.isNaN(Number(originalScore)) ? Number(originalScore) : null;
  const revisedScoreNum = revisedScore !== null && revisedScore !== "" && !Number.isNaN(Number(revisedScore)) ? Number(revisedScore) : null;
  const scoreChanged = revisedScoreNum !== null && revisedScoreNum !== originalScoreNum;
  const commentChanged = hasMeaningfulTextChange(String(originalComment ?? ""), String(revisedComment ?? ""));
  return scoreChanged || commentChanged;
}

function summarizeCases(cases: CaseItem[]): PeriodSummary {
  const caseCount = cases.length;
  const avgScore = cases.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(caseCount, 1);
  const revisedCount = cases.filter((item) => item.reviewStatus === "Revised").length;
  const policyMonthKey = getPolicyMonthKeyForCases(cases);
  return {
    label: "-",
    caseCount,
    avgScore: Number(avgScore.toFixed(2)),
    grade: scoreToGrade(avgScore, policyMonthKey),
    revisedCount,
    incentive: getIncentiveValue(caseCount, avgScore, policyMonthKey),
    policyMonthKey,
  };
}

function buildTopicSummary(cases: CaseItem[]): TopicSummary[] {
  return TOPIC_MASTER.map((master) => {
    const topics = cases
      .flatMap((item) => (item.reviewStatus === "Revised" && item.revisedTopics?.length ? mergeTopicSet(item.topics, item.revisedTopics) : item.topics))
      .filter((topic) => topic.code === master.code);

    if (!topics.length) {
      return { code: master.code, label: master.label, avgScore: 0, max: master.max, pct: 0 };
    }

    const avg = topics.reduce((sum, topic) => sum + topic.score, 0) / topics.length;
    return {
      code: master.code,
      label: master.label,
      avgScore: Number(avg.toFixed(2)),
      max: master.max,
      pct: Number(((avg / master.max) * 100).toFixed(2)),
    };
  });
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

function MetricCard({
  title,
  value,
  sub,
  accent = "from-white via-violet-50/40 to-fuchsia-50/60 border-violet-200/70",
  valueClassName = "text-slate-900",
}: {
  title: string;
  value: string;
  sub: string;
  accent?: string;
  valueClassName?: string;
}) {
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
      {isSongkranThemeActive() ? <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-80" /> : null}
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
      className={`relative overflow-hidden rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${active ? songkranTheme ? "border border-cyan-300 bg-gradient-to-r from-cyan-100 via-sky-100 to-fuchsia-100 text-cyan-800" : "border border-violet-300 bg-violet-100 text-violet-800" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
    >
      <span className="relative z-10">{label}</span>
    </button>
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

function SummaryTable({ rows, firstColLabel, showWeek = false, showMonth = false, showYear = false }: { rows: PeriodTableRow[]; firstColLabel: string; showWeek?: boolean; showMonth?: boolean; showYear?: boolean }) {
  const colSpan = 6 + (showWeek ? 1 : 0) + (showMonth ? 1 : 0) + (showYear ? 1 : 0);
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[1100px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-4 py-3 text-left">{firstColLabel}</th>
            {showWeek ? <th className="px-4 py-3 text-left">Week</th> : null}
            {showMonth ? <th className="px-4 py-3 text-left">Month</th> : null}
            {showYear ? <th className="px-4 py-3 text-left">Year</th> : null}
            <th className="px-4 py-3 text-center">Cases</th>
            <th className="px-4 py-3 text-center">Average Score</th>
            <th className="px-4 py-3 text-center">Grade</th>
            <th className="px-4 py-3 text-center">Revised</th>
            <th className="px-4 py-3 text-center">Incentive</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => (
            <tr key={`${row.label}-${row.weekLabel || ""}-${row.monthLabel || ""}-${row.yearLabel || ""}`} className="bg-white">
              <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">{row.label}</td>
              {showWeek ? <td className="border-t border-slate-200 px-4 py-3">{row.weekLabel || "-"}</td> : null}
              {showMonth ? <td className="border-t border-slate-200 px-4 py-3">{row.monthLabel || "-"}</td> : null}
              {showYear ? <td className="border-t border-slate-200 px-4 py-3">{row.yearLabel || "-"}</td> : null}
              <td className="border-t border-slate-200 px-4 py-3 text-center">{row.caseCount}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{row.avgScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(row.grade)}`}>{row.grade}</span></td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{row.revisedCount}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{formatCurrencyTHB(row.incentive)}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={colSpan} className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No data found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AgentPeriodTable({ rows, periodLabel }: { rows: AgentPeriodSummary[]; periodLabel: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[1100px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-4 py-3 text-left">Agent</th>
            <th className="px-4 py-3 text-left">{periodLabel}</th>
            <th className="px-4 py-3 text-center">Cases</th>
            <th className="px-4 py-3 text-center">Average Score</th>
            <th className="px-4 py-3 text-center">Grade</th>
            <th className="px-4 py-3 text-center">Revised</th>
            <th className="px-4 py-3 text-center">Incentive</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={`${row.agent}-${row.label}-${index}`} className="bg-white">
              <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">{row.agent}</td>
              <td className="border-t border-slate-200 px-4 py-3">{row.label}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{row.caseCount}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{row.avgScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(row.grade)}`}>{row.grade}</span></td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{row.revisedCount}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{formatCurrencyTHB(row.incentive)}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={7} className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No data found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CaseListTable({ title, cases }: { title: string; cases: CaseItem[] }) {
  return (
    <Panel>
      <PanelHeader title={title} subtitle="Example case list for current selected view" />
      <PanelBody>
        <div className="overflow-x-auto rounded-2xl border border-violet-100">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="bg-violet-950 text-[11px] text-white">
                <th className="px-4 py-3 text-center">Seq</th>
                <th className="px-4 py-3 text-center">Audit Date</th>
                <th className="px-4 py-3 text-left">Case ID</th>
                <th className="px-4 py-3 text-left">Inquiry</th>
                <th className="px-4 py-3 text-center">Final Score</th>
                <th className="px-4 py-3 text-center">Grade</th>
                <th className="px-4 py-3 text-center">Review</th>
              </tr>
            </thead>
            <tbody>
              {cases.length ? cases.map((item, index) => (
                <tr key={item.key} className="bg-white align-top">
                  <td className="border-t border-slate-200 px-4 py-3 text-center">{index + 1}</td>
                  <td className="border-t border-slate-200 px-4 py-3 text-center">{item.auditDate}</td>
                  <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">{item.caseId}</td>
                  <td className="border-t border-slate-200 px-4 py-3 leading-5 text-slate-800">{item.inquiryTh || "-"}</td>
                  <td className="border-t border-slate-200 px-4 py-3 text-center">{item.finalScore.toFixed(2)}</td>
                  <td className="border-t border-slate-200 px-4 py-3 text-center"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(item.grade)}`}>{item.grade}</span></td>
                  <td className="border-t border-slate-200 px-4 py-3 text-center">{item.reviewStatus}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No case list for current selection</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PanelBody>
    </Panel>
  );
}

async function fetchFirstAvailable(urls: string[]) {
  for (const url of urls) {
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
    if (response.ok) return { response, matchedUrl: url };
  }
  throw new Error(`ไม่พบไฟล์ใน public ตามชื่อเหล่านี้: ${urls.join(", ")}`);
}

export default function SummaryMockup({
  currentUser,
  externalSelectedAgent,
  externalSelectedMonth,
  externalSelectedWeek,
  onSelectedAgentChange,
  onSelectedMonthChange,
  onSelectedWeekChange,
}: {
  currentUser: any;
  externalSelectedAgent?: string;
  externalSelectedMonth?: string;
  externalSelectedWeek?: string;
  onSelectedAgentChange?: (agent: string) => void;
  onSelectedMonthChange?: (month: string) => void;
  onSelectedWeekChange?: (week: string) => void;
}) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [appealMergeCount, setAppealMergeCount] = useState(0);
  const [viewMode, setViewMode] = useState<SummaryView>("weekly-dashboard");
  const [selectedAgent, setSelectedAgent] = useState<string>(externalSelectedAgent || "all");
  const [selectedMonth, setSelectedMonth] = useState<string>(externalSelectedMonth || "all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>(externalSelectedWeek || "all");

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);

  useEffect(() => {
    if (typeof externalSelectedAgent === "string" && externalSelectedAgent !== selectedAgent && currentUser?.role !== "Agent") {
      setSelectedAgent(externalSelectedAgent);
    }
  }, [externalSelectedAgent, selectedAgent, currentUser]);

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

        const rawFile = await fetchFirstAvailable(["/QA_RawData1.xlsx", "/QA_RawData1(1).xlsx", "/QA_RawData1(2).xlsx"]);
        const appealFile = await fetchFirstAvailable(["/Appleal ROWDATA.xlsx", "/Appeal ROWDATA.xlsx"]);

        const rawBuffer = await rawFile.response.arrayBuffer();
        const rawWorkbook = XLSX.read(rawBuffer, { type: "array", cellDates: false });
        const rawSheet = rawWorkbook.Sheets["Raw_Data"] || rawWorkbook.Sheets[rawWorkbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<any[]>(rawSheet, { header: 1, defval: null, raw: true });

        const rawHeaderIndex = rawRows.findIndex((row) => {
          const normalized = (row || []).map((v: any) => normalizeText(v));
          return normalized.includes("agent name") && normalized.includes("case id");
        });
        if (rawHeaderIndex === -1) throw new Error("ไม่พบแถว Header ในไฟล์ QA_RawData1.xlsx");

        const rawHeaderRow = (rawRows[rawHeaderIndex] || []) as any[];
        const rawDataRows = rawRows.slice(rawHeaderIndex + 1);
        const rawHelper = buildHeaderHelpers(rawHeaderRow);

        const appealBuffer = await appealFile.response.arrayBuffer();
        const appealWorkbook = XLSX.read(appealBuffer, { type: "array", cellDates: false });
        const appealSheet = appealWorkbook.Sheets["Appeal_Data"] || appealWorkbook.Sheets[appealWorkbook.SheetNames[0]];
        const appealRows = XLSX.utils.sheet_to_json<any[]>(appealSheet, { header: 1, defval: null, raw: true });

        const appealHeaderIndex = appealRows.findIndex((row) => {
          const normalized = (row || []).map((v: any) => normalizeText(v));
          return normalized.includes("case id");
        });
        if (appealHeaderIndex === -1) throw new Error("ไม่พบแถว Header ในไฟล์ Appleal ROWDATA.xlsx");

        const appealHeaderRow = (appealRows[appealHeaderIndex] || []) as any[];
        const appealDataRows = appealRows.slice(appealHeaderIndex + 1);
        const appealHelper = buildHeaderHelpers(appealHeaderRow);
        const appealMap = new Map<string, AppealMergeItem>();

        appealDataRows.forEach((row) => {
          const caseId = String(appealHelper.getValue(row, "Case ID") ?? "").trim();
          if (!caseId) return;

          const revisedTopics: Topic[] = [];
          const displayRevisedTopicCodes: string[] = [];

          TOPIC_MASTER.forEach((topic) => {
            const originalScoreRaw = appealHelper.getValue(row, `${topic.code} Score`);
            const revisedScoreRaw = appealHelper.getValue(row, `${topic.code} Revised Score`);
            const originalCommentRaw = appealHelper.getValue(row, `${topic.code} Comment`);
            const revisedCommentRaw = appealHelper.getValue(row, `${topic.code} Revised Comment`);
            const appealReasonRaw = appealHelper.getValue(row, `${topic.code} Appeal Reason`);

            const hasRevisedScore = revisedScoreRaw !== null && revisedScoreRaw !== "" && !Number.isNaN(Number(revisedScoreRaw));
            const hasRevisedComment = revisedCommentRaw !== null && String(revisedCommentRaw).trim() !== "";
            if (!hasRevisedScore && !hasRevisedComment) return;

            const score = hasRevisedScore ? Number(revisedScoreRaw) : Number(originalScoreRaw ?? 0);
            const comment = hasRevisedComment ? String(revisedCommentRaw).trim() : String(originalCommentRaw ?? "").trim();

            revisedTopics.push({
              code: topic.code,
              label: topic.label,
              score,
              max: topic.max,
              pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,
              comment,
            });

            if (!isNoAppealReason(appealReasonRaw) && hasRealTopicChange(originalScoreRaw, revisedScoreRaw, originalCommentRaw, revisedCommentRaw)) {
              displayRevisedTopicCodes.push(topic.code);
            }
          });

          const explicitFinalScore = appealHelper.getLastValue(row, "Final Score");
          const explicitOriginalFinalScore = appealHelper.getValue(row, "Final Score", 0);

          const finalScore = explicitFinalScore !== null && explicitFinalScore !== "" && !Number.isNaN(Number(explicitFinalScore)) ? Number(explicitFinalScore) : undefined;
          const previousScore = explicitOriginalFinalScore !== null && explicitOriginalFinalScore !== "" && !Number.isNaN(Number(explicitOriginalFinalScore)) ? Number(explicitOriginalFinalScore) : undefined;

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

        setAppealMergeCount(appealMap.size);

        const mapped = rawDataRows
          .map((row, index) => {
            const caseId = String(rawHelper.getValue(row, "Case ID") ?? "").trim();
            if (!caseId) return null;

            const topics: Topic[] = TOPIC_MASTER.map((topic) => {
              const scoreRaw = rawHelper.getValue(row, `${topic.code} Score`);
              const commentRaw = rawHelper.getValue(row, `${topic.code} Comment`);
              const score = scoreRaw !== null && scoreRaw !== "" && !Number.isNaN(Number(scoreRaw)) ? Number(scoreRaw) : 0;
              return {
                code: topic.code,
                label: topic.label,
                score,
                max: topic.max,
                pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,
                comment: String(commentRaw ?? "").trim(),
              };
            });

            const mergedAppeal = appealMap.get(caseId);
            const finalScoreRaw = rawHelper.getValue(row, "Final Score");
            const baseFinalScore = finalScoreRaw !== null && finalScoreRaw !== "" && !Number.isNaN(Number(finalScoreRaw))
              ? Number(finalScoreRaw)
              : topics.reduce((sum, topic) => sum + topic.score, 0);
            const finalScoreVal = mergedAppeal?.finalScore ?? (mergedAppeal?.revisedTopics?.length ? calcMergedFinalScore(topics, mergedAppeal.revisedTopics) : baseFinalScore);
            const previousScoreVal = mergedAppeal?.previousScore ?? baseFinalScore;

            const inquiry = rawHelper.getValue(row, "Customer Inquiry") ?? rawHelper.getValue(row, "Inquiry TH") ?? rawHelper.getValue(row, "Inquiry");
            const weekLabel = rawHelper.getValue(row, "Week Label") ?? rawHelper.getValue(row, "Week") ?? "-";
            const auditDateRaw = rawHelper.getValue(row, "Audit Date");
            const auditDateObj = excelDateToJSDate(auditDateRaw);
            const monthKey = getMonthKey(auditDateObj);
            const reviewStatus: ReviewStatus = mergedAppeal?.displayRevisedTopicCodes?.length ? "Revised" : "Original";

            return {
              key: `row-${index + 1}-${caseId}`,
              agent: toTitleCaseName(String(rawHelper.getValue(row, "Agent Name") ?? "").trim()),
              auditDate: formatAuditDate(auditDateRaw),
              auditDateObj,
              monthKey,
              monthLabel: getMonthLabel(auditDateObj),
              yearKey: getYearKey(auditDateObj),
              weekLabel: String(weekLabel || "-").trim(),
              caseId,
              inquiryTh: inquiry ? String(inquiry).trim() : "-",
              inquiryEn: inquiry ? String(inquiry).trim() : "-",
              finalScore: Number(finalScoreVal.toFixed(2)),
              previousScore: Number(previousScoreVal.toFixed(2)),
              grade: scoreToGrade(finalScoreVal, monthKey),
              reviewStatus,
              topics,
              revisedTopics: mergedAppeal?.revisedTopics?.length ? mergedAppeal.revisedTopics : null,
              displayRevisedTopicCodes: mergedAppeal?.displayRevisedTopicCodes || [],
            } satisfies CaseItem;
          })
          .filter((item): item is CaseItem => Boolean(item && item.agent && item.caseId));

        setAllCases(mapped);
      } catch (error: any) {
        setLoadError(error?.message || "โหลดไฟล์ Excel ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);

  const latestMonthKey = useMemo(() => ([...new Set(allCases.map((item) => item.monthKey).filter((item) => item !== "unknown"))].sort((a, b) => b.localeCompare(a))[0] || "all"), [allCases]);

  const monthOptions = useMemo(() => {
    return Array.from(new Map(allCases.filter((item) => item.monthKey !== "unknown").map((item) => [item.monthKey, item.monthLabel])).entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => b.value.localeCompare(a.value));
  }, [allCases]);

  const yearOptions = useMemo(() => [...new Set(allCases.map((item) => item.yearKey).filter((item) => item !== "unknown"))].sort((a, b) => b.localeCompare(a)), [allCases]);

  const visibleAgentList = useMemo(() => {
    const agentsFromCases = allCases.map((item) => String(item.agent || "").trim()).filter(Boolean);
    const effectiveMonthForVisibility = selectedMonth !== "all" ? selectedMonth : latestMonthKey;
    const mergedAgents = getUniqueNormalizedAgents([...AGENT_MASTER, ...agentsFromCases]).filter((name) => !shouldHideAgentByMonth(name, effectiveMonthForVisibility));
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return mergedAgents.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }
    return mergedAgents;
  }, [allCases, currentUser, selectedMonth, latestMonthKey]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      setSelectedAgent(toTitleCaseName(currentUser.agentName));
    }
  }, [currentUser]);

  useEffect(() => {
    if (selectedMonth === "all" && latestMonthKey !== "all") {
      setSelectedMonth(latestMonthKey);
      onSelectedMonthChange?.(latestMonthKey);
    }
  }, [latestMonthKey]);

  const filteredCases = useMemo(() => {
    return allCases.filter((item) => {
      if (selectedAgent !== "all" && !isSameAgent(item.agent, selectedAgent)) return false;
      if (selectedMonth !== "all" && item.monthKey !== selectedMonth) return false;
      if (selectedYear !== "all" && item.yearKey !== selectedYear) return false;
      if (selectedWeek !== "all" && item.weekLabel !== selectedWeek) return false;
      return true;
    });
  }, [allCases, selectedAgent, selectedMonth, selectedYear, selectedWeek]);

  const summary = useMemo(() => summarizeCases(filteredCases), [filteredCases]);
  const topicSummary = useMemo(() => buildTopicSummary(filteredCases), [filteredCases]);

  const weekOptions = useMemo(() => [...new Set(filteredCases.map((item) => item.weekLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [filteredCases]);

  const weeklyRows = useMemo<PeriodTableRow[]>(() => {
    const grouped = new Map<string, CaseItem[]>();
    filteredCases.forEach((item) => {
      const bucket = grouped.get(item.weekLabel) || [];
      bucket.push(item);
      grouped.set(item.weekLabel, bucket);
    });
    return [...grouped.entries()].map(([label, cases]) => {
      const s = summarizeCases(cases);
      return { label, weekLabel: label, caseCount: s.caseCount, avgScore: s.avgScore, grade: s.grade, revisedCount: s.revisedCount, incentive: s.incentive, policyMonthKey: s.policyMonthKey };
    }).sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredCases]);

  const monthlyRows = useMemo<PeriodTableRow[]>(() => {
    const grouped = new Map<string, CaseItem[]>();
    filteredCases.forEach((item) => {
      const bucket = grouped.get(item.monthKey) || [];
      bucket.push(item);
      grouped.set(item.monthKey, bucket);
    });
    return [...grouped.entries()].map(([monthKey, cases]) => {
      const s = summarizeCases(cases);
      return { label: cases[0]?.monthLabel || monthKey, monthLabel: cases[0]?.monthLabel || monthKey, caseCount: s.caseCount, avgScore: s.avgScore, grade: s.grade, revisedCount: s.revisedCount, incentive: s.incentive, policyMonthKey: s.policyMonthKey };
    }).sort((a, b) => a.monthLabel!.localeCompare(b.monthLabel!));
  }, [filteredCases]);

  const yearlyRows = useMemo<PeriodTableRow[]>(() => {
    const grouped = new Map<string, CaseItem[]>();
    filteredCases.forEach((item) => {
      const bucket = grouped.get(item.yearKey) || [];
      bucket.push(item);
      grouped.set(item.yearKey, bucket);
    });
    return [...grouped.entries()].map(([yearKey, cases]) => {
      const s = summarizeCases(cases);
      return { label: yearKey, yearLabel: yearKey, caseCount: s.caseCount, avgScore: s.avgScore, grade: s.grade, revisedCount: s.revisedCount, incentive: s.incentive, policyMonthKey: s.policyMonthKey };
    }).sort((a, b) => b.label.localeCompare(a.label));
  }, [filteredCases]);

  const byAgentRows = useMemo<AgentPeriodSummary[]>(() => {
    const grouped = new Map<string, CaseItem[]>();
    filteredCases.forEach((item) => {
      const key = `${item.agent}__${viewMode.includes("yearly") ? item.yearKey : item.monthLabel}`;
      const bucket = grouped.get(key) || [];
      bucket.push(item);
      grouped.set(key, bucket);
    });
    return [...grouped.entries()].map(([key, cases]) => {
      const [agent, label] = key.split("__");
      const s = summarizeCases(cases);
      return { agent, label, caseCount: s.caseCount, avgScore: s.avgScore, grade: s.grade, revisedCount: s.revisedCount, incentive: s.incentive, policyMonthKey: s.policyMonthKey };
    }).sort((a, b) => a.agent.localeCompare(b.agent) || a.label.localeCompare(b.label));
  }, [filteredCases, viewMode]);

  const caseListForCurrentView = useMemo(() => {
    const sorter = (a: CaseItem, b: CaseItem) => {
      const ta = a.auditDateObj?.getTime() || 0;
      const tb = b.auditDateObj?.getTime() || 0;
      return ta - tb || a.caseId.localeCompare(b.caseId);
    };
    return [...filteredCases].sort(sorter).slice(0, 50);
  }, [filteredCases]);

  const caseListTitle = useMemo(() => {
    switch (viewMode) {
      case "weekly-dashboard":
        return "Weekly Case List";
      case "weekly-qa-by-agent":
        return "Weekly QA by Agent - Case List";
      case "monthly-dashboard":
        return "Monthly Dashboard - Case List";
      case "monthly-team-summary":
        return "Monthly Team Summary - Case List";
      case "yearly-team-summary":
        return "Yearly Team Summary - Case List";
      case "yearly-by-agent":
        return "Yearly by Agent - Case List";
      default:
        return "Case List";
    }
  }, [viewMode]);

  if (isLoading) {
    return <div className="p-6 text-sm text-slate-600">Loading summary...</div>;
  }

  if (loadError) {
    return <div className="p-6 text-sm text-rose-600">{loadError}</div>;
  }

  return (
    <div className="min-h-screen bg-[#fcfbff] text-slate-900">
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-4 lg:px-6">
        <Panel className="overflow-hidden border-0 bg-gradient-to-br from-violet-950 via-violet-900 to-fuchsia-700 text-white shadow-[0_18px_60px_rgba(76,29,149,0.35)]">
          <div className="relative overflow-hidden px-6 py-7 lg:px-8 lg:py-8">
            {songkranTheme ? <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute left-0 top-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" /><div className="absolute right-6 top-8 h-32 w-32 rounded-full bg-fuchsia-300/18 blur-3xl" /></div> : null}
            <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200">QA Summary</div>
                <h1 className="mt-2 text-3xl font-black tracking-tight lg:text-4xl">Weekly / Monthly / Yearly Summary</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-violet-100">Review performance overview with case list examples for each summary tab.</p>
              </div>
              <LogoHeaderBox />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Control Panel" subtitle="Choose tab, agent, month, week, and year" />
          <PanelBody>
            <div className="grid gap-4 xl:grid-cols-5">
              <div className="xl:col-span-2">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">View</div>
                <div className="flex flex-wrap gap-2">
                  <ViewButton active={viewMode === "weekly-dashboard"} label="Weekly Dashboard" onClick={() => setViewMode("weekly-dashboard")} />
                  <ViewButton active={viewMode === "weekly-qa-by-agent"} label="Weekly QA by Agent" onClick={() => setViewMode("weekly-qa-by-agent")} />
                  <ViewButton active={viewMode === "monthly-dashboard"} label="Monthly Dashboard" onClick={() => setViewMode("monthly-dashboard")} />
                  <ViewButton active={viewMode === "monthly-team-summary"} label="Monthly Team Summary" onClick={() => setViewMode("monthly-team-summary")} />
                  <ViewButton active={viewMode === "yearly-team-summary"} label="Yearly Team Summary" onClick={() => setViewMode("yearly-team-summary")} />
                  <ViewButton active={viewMode === "yearly-by-agent"} label="Yearly by Agent" onClick={() => setViewMode("yearly-by-agent")} />
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Agent</div>
                {currentUser?.role === "Agent" ? (
                  <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3 text-sm font-semibold text-violet-800">{toTitleCaseName(currentUser.agentName)}</div>
                ) : (
                  <select value={selectedAgent} onChange={(e) => { const value = e.target.value; setSelectedAgent(value); onSelectedAgentChange?.(value); }} className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100">
                    <option value="all">All Agents</option>
                    {visibleAgentList.map((agent) => <option key={agent} value={agent}>{agent}</option>)}
                  </select>
                )}
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Month</div>
                <select value={selectedMonth} onChange={(e) => { const value = e.target.value; setSelectedMonth(value); onSelectedMonthChange?.(value); }} className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100">
                  <option value="all">All Months</option>
                  {monthOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Week</div>
                <select value={selectedWeek} onChange={(e) => { const value = e.target.value; setSelectedWeek(value); onSelectedWeekChange?.(value); }} className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100">
                  <option value="all">All Weeks</option>
                  {weekOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Year</div>
                <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100">
                  <option value="all">All Years</option>
                  {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </div>

              <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-4 text-sm text-slate-700 md:col-span-3">
                Current view shows <span className="font-bold text-slate-900">{filteredCases.length}</span> case(s) and <span className="font-bold text-slate-900">{appealMergeCount}</span> appeal merge row(s).
              </div>
            </div>
          </PanelBody>
        </Panel>

        <div className="grid gap-6 xl:grid-cols-4">
          <MetricCard title="Cases" value={`${summary.caseCount}`} sub="Visible cases in current scope" />
          <MetricCard title="Average Score" value={summary.avgScore.toFixed(2)} sub="Average score in current scope" accent="from-white via-sky-50/50 to-indigo-100/60 border-sky-200" valueClassName="text-sky-700" />
          <MetricCard title="Grade" value={summary.grade} sub="Calculated from visible scope" accent="from-white via-emerald-50/50 to-lime-100/60 border-emerald-200" valueClassName="text-emerald-700" />
          <MetricCard title="Incentive" value={formatCurrencyTHB(summary.incentive)} sub="Current incentive result by current view" accent="from-white via-amber-50/50 to-orange-100/60 border-amber-200" valueClassName="text-amber-700" />
        </div>

        {(viewMode === "weekly-dashboard" || viewMode === "monthly-dashboard" || viewMode === "monthly-team-summary" || viewMode === "yearly-team-summary") && (
          <Panel>
            <PanelHeader title="Summary Table" subtitle="Main summary table for selected tab" />
            <PanelBody>
              {viewMode === "weekly-dashboard" && <SummaryTable rows={weeklyRows} firstColLabel="Label" showWeek />}
              {viewMode === "monthly-dashboard" && <SummaryTable rows={monthlyRows} firstColLabel="Label" showMonth />}
              {viewMode === "monthly-team-summary" && <SummaryTable rows={monthlyRows} firstColLabel="Team / Month" showMonth />}
              {viewMode === "yearly-team-summary" && <SummaryTable rows={yearlyRows} firstColLabel="Year" showYear />}
            </PanelBody>
          </Panel>
        )}

        {(viewMode === "weekly-qa-by-agent" || viewMode === "yearly-by-agent") && (
          <Panel>
            <PanelHeader title="Agent Summary Table" subtitle="Agent-based summary for selected tab" />
            <PanelBody>
              <AgentPeriodTable rows={byAgentRows} periodLabel={viewMode === "yearly-by-agent" ? "Year" : "Month / Period"} />
            </PanelBody>
          </Panel>
        )}

        <Panel>
          <PanelHeader title="Topic Performance" subtitle="Topic average in current selected scope" />
          <PanelBody>
            <TopicTable topics={topicSummary} />
          </PanelBody>
        </Panel>

        <CaseListTable title={caseListTitle} cases={caseListForCurrentView} />
      </div>
    </div>
  );
}
