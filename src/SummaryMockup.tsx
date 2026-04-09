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

  return (
    na === nb ||
    ca === cb ||
    na.includes(nb) ||
    nb.includes(na) ||
    ca.includes(cb) ||
    cb.includes(ca)
  );
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

  const matchedEntry = Object.entries(RESIGNED_AGENT_HIDE_AFTER).find(([name]) =>
    isSameAgent(name, agentName)
  );

  if (!matchedEntry) return false;

  const [, hideFromMonth] = matchedEntry;
  return selectedMonthKey >= hideFromMonth;
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
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds()
    );
  }

  const text = String(value).trim();
  if (!text) return null;

  const ddmmyyyyMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (ddmmyyyyMatch) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = ddmmyyyyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }

  const asDate = new Date(text);
  if (!Number.isNaN(asDate.getTime())) return asDate;
  return null;
}

function formatAuditDate(value: any): string {
  const dt = excelDateToJSDate(value);
  if (!dt) return String(value ?? "");
  const day = `${dt.getDate()}`.padStart(2, "0");
  const month = `${dt.getMonth() + 1}`.padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
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

async function fetchFirstAvailable(urls: string[]) {
  let lastError: Error | null = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return { response, matchedUrl: url };
      }
      lastError = new Error(`ไม่พบไฟล์ ${url}`);
    } catch (error: any) {
      lastError = error;
    }
  }

  throw lastError || new Error("ไม่พบไฟล์ที่ต้องการ");
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
        avgScore: 0,
        max: master.max,
        pct: 0,
      };
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

function emptyAgentPeriodSummary(agent: string, label: string, policyMonthKey = "unknown"): AgentPeriodSummary {
  return {
    agent,
    label,
    caseCount: 0,
    avgScore: 0,
    grade: scoreToGrade(0, policyMonthKey),
    revisedCount: 0,
    incentive: 0,
    policyMonthKey,
  };
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

function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
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
    <div
      className={`relative overflow-hidden rounded-[28px] border bg-gradient-to-br ${accent} shadow-[0_10px_30px_rgba(91,33,182,0.08)]`}
    >
      <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
      <div className="p-5 lg:p-6">
        <div className="text-[13px] font-semibold tracking-wide text-slate-500">{title}</div>
        <div className={`mt-3 text-4xl font-extrabold tracking-tight lg:text-[42px] ${valueClassName}`}>
          {value}
        </div>
        <div className="mt-3 text-xs leading-5 text-slate-500">{sub}</div>
      </div>
    </div>
  );
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

function ViewButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  const songkranTheme = isSongkranThemeActive();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? songkranTheme
            ? "border border-cyan-300 bg-gradient-to-r from-cyan-100 via-sky-100 to-fuchsia-100 text-cyan-800"
            : "border border-violet-300 bg-violet-100 text-violet-800"
          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
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

function SummaryTable({
  rows,
  firstColLabel,
  showWeek = false,
  showMonth = false,
  showYear = false,
}: {
  rows: PeriodTableRow[];
  firstColLabel: string;
  showWeek?: boolean;
  showMonth?: boolean;
  showYear?: boolean;
}) {
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
          {rows.length ? (
            rows.map((row) => (
              <tr key={`${row.label}-${row.weekLabel || ""}-${row.monthLabel || ""}-${row.yearLabel || ""}`} className="bg-white">
                <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">{row.label}</td>
                {showWeek ? <td className="border-t border-slate-200 px-4 py-3">{row.weekLabel || "-"}</td> : null}
                {showMonth ? <td className="border-t border-slate-200 px-4 py-3">{row.monthLabel || "-"}</td> : null}
                {showYear ? <td className="border-t border-slate-200 px-4 py-3">{row.yearLabel || "-"}</td> : null}
                <td className="border-t border-slate-200 px-4 py-3 text-center">{row.caseCount}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">{row.avgScore.toFixed(2)}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(row.grade)}`}>
                    {row.grade}
                  </span>
                </td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">{row.revisedCount}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">{formatCurrencyTHB(row.incentive)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={colSpan} className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                No data found
              </td>
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
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={`${row.agent}-${row.label}-${index}`} className="bg-white">
                <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">{row.agent}</td>
                <td className="border-t border-slate-200 px-4 py-3">{row.label}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">{row.caseCount}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">{row.avgScore.toFixed(2)}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(row.grade)}`}>
                    {row.grade}
                  </span>
                </td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">{row.revisedCount}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">{formatCurrencyTHB(row.incentive)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7} className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                No data found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CaseListTable({
  rows,
  title,
  subtitle,
}: {
  rows: CaseItem[];
  title: string;
  subtitle?: string;
}) {
  return (
    <Panel>
      <PanelHeader title={title} subtitle={subtitle} />
      <PanelBody>
        <div className="overflow-x-auto rounded-2xl border border-violet-100">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="bg-violet-950 text-[11px] text-white">
                <th className="px-4 py-3 text-center">Seq</th>
                <th className="px-4 py-3 text-left">Audit Date</th>
                <th className="px-4 py-3 text-left">Case ID</th>
                <th className="px-4 py-3 text-left">Inquiry</th>
                <th className="px-4 py-3 text-center">Final Score</th>
                <th className="px-4 py-3 text-center">Grade</th>
                <th className="px-4 py-3 text-center">Review</th>
                <th className="px-4 py-3 text-left">Agent</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((item, index) => (
                  <tr key={`${item.key}-${index}`} className="bg-white">
                    <td className="border-t border-slate-200 px-4 py-3 text-center">{index + 1}</td>
                    <td className="border-t border-slate-200 px-4 py-3">{item.auditDate}</td>
                    <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">{item.caseId}</td>
                    <td className="border-t border-slate-200 px-4 py-3 leading-5 text-slate-800">{item.inquiryTh || "-"}</td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center font-semibold text-slate-900">{item.finalScore.toFixed(2)}</td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(item.grade)}`}>
                        {item.grade}
                      </span>
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center">{item.reviewStatus}</td>
                    <td className="border-t border-slate-200 px-4 py-3">{item.agent}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                    No case list found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PanelBody>
    </Panel>
  );
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
  const [viewMode, setViewMode] = useState<SummaryView>("weekly-dashboard");
  const [selectedAgent, setSelectedAgent] = useState<string>(externalSelectedAgent || "all");
  const [selectedMonth, setSelectedMonth] = useState<string>(externalSelectedMonth || "all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>(externalSelectedWeek || "all");

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);

  useEffect(() => {
    if (
      typeof externalSelectedAgent === "string" &&
      externalSelectedAgent !== selectedAgent &&
      currentUser?.role !== "Agent"
    ) {
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

        const rawResponse = await fetch("/QA_RawData1.xlsx", { cache: "no-store" });
        const { response: appealResponse } = await fetchFirstAvailable([
          "/Appleal ROWDATA.xlsx",
          "/Appeal ROWDATA.xlsx",
          "/Appeal_ROWDATA.xlsx",
        ]);

        if (!rawResponse.ok) {
          throw new Error("ไม่พบไฟล์ QA_RawData1.xlsx ในโฟลเดอร์ public");
        }

        const rawBuffer = await rawResponse.arrayBuffer();
        const rawWorkbook = XLSX.read(rawBuffer, { type: "array", cellDates: false });
        const rawSheet = rawWorkbook.Sheets["Raw_Data"] || rawWorkbook.Sheets[rawWorkbook.SheetNames[0]];

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
          throw new Error("ไม่พบแถว Header ในไฟล์ QA_RawData1.xlsx");
        }

        const rawHeaderRow = (rawRows[rawHeaderIndex] || []) as any[];
        const rawDataRows = rawRows.slice(rawHeaderIndex + 1);
        const rawHelper = buildHeaderHelpers(rawHeaderRow);

        const appealBuffer = await appealResponse.arrayBuffer();
        const appealWorkbook = XLSX.read(appealBuffer, { type: "array", cellDates: false });
        const appealSheet =
          appealWorkbook.Sheets["Appeal_Data"] || appealWorkbook.Sheets[appealWorkbook.SheetNames[0]];

        const appealRows = XLSX.utils.sheet_to_json<any[]>(appealSheet, {
          header: 1,
          defval: null,
          raw: true,
        });

        const appealHeaderIndex = (() => {
          for (let i = 0; i < appealRows.length; i++) {
            const row = (appealRows[i] || []) as any[];
            const normalized = row.map((v) => normalizeText(v));
            if (normalized.includes("case id")) return i;
          }
          return -1;
        })();

        const appealMap = new Map<string, AppealMergeItem>();

        if (appealHeaderIndex >= 0) {
          const appealHeaderRow = (appealRows[appealHeaderIndex] || []) as any[];
          const appealDataRows = appealRows.slice(appealHeaderIndex + 1);
          const appealHelper = buildHeaderHelpers(appealHeaderRow);

          appealDataRows.forEach((row) => {
            const caseId = String(appealHelper.getValue(row, "Case ID") || "").trim();
            if (!caseId) return;

            const revisedTopics: Topic[] = [];
            const displayRevisedTopicCodes: string[] = [];

            TOPIC_MASTER.forEach((topicMaster) => {
              const scoreValue =
                appealHelper.getValue(row, `${topicMaster.code} Revised Score`) ??
                appealHelper.getValue(row, `${topicMaster.code} Score`) ??
                appealHelper.getValue(row, topicMaster.code);

              const commentValue =
                appealHelper.getValue(row, `${topicMaster.code} Revised Comment`) ??
                appealHelper.getValue(row, `${topicMaster.code} Comment`);

              if (scoreValue !== null && scoreValue !== "" && !Number.isNaN(Number(scoreValue))) {
                revisedTopics.push({
                  code: topicMaster.code,
                  label: topicMaster.label,
                  score: Number(scoreValue),
                  max: topicMaster.max,
                  pct: Number(((Number(scoreValue) / topicMaster.max) * 100).toFixed(2)),
                  comment: commentValue ? String(commentValue).trim() : "",
                });
                displayRevisedTopicCodes.push(topicMaster.code);
              }
            });

            const finalScoreRaw =
              appealHelper.getValue(row, "Final Score") ??
              appealHelper.getValue(row, "Revised Final Score") ??
              null;
            const previousScoreRaw =
              appealHelper.getValue(row, "Previous Score") ??
              appealHelper.getValue(row, "Original Final Score") ??
              null;

            appealMap.set(caseId, {
              caseId,
              finalScore:
                finalScoreRaw !== null && finalScoreRaw !== "" && !Number.isNaN(Number(finalScoreRaw))
                  ? Number(finalScoreRaw)
                  : undefined,
              previousScore:
                previousScoreRaw !== null && previousScoreRaw !== "" && !Number.isNaN(Number(previousScoreRaw))
                  ? Number(previousScoreRaw)
                  : undefined,
              reviewStatus: displayRevisedTopicCodes.length ? "Revised" : "Original",
              revisedTopics,
              displayRevisedTopicCodes,
            });
          });
        }

        const mapped = rawDataRows
          .map((row, index): CaseItem | null => {
            const caseId = String(rawHelper.getValue(row, "Case ID") || "").trim();
            if (!caseId) return null;

            const topics: Topic[] = TOPIC_MASTER.map((master) => {
              const scoreRaw =
                rawHelper.getValue(row, `${master.code} Score`) ??
                rawHelper.getValue(row, master.code) ??
                0;
              const score = !Number.isNaN(Number(scoreRaw)) ? Number(scoreRaw) : 0;
              const comment = rawHelper.getValue(row, `${master.code} Comment`);
              return {
                code: master.code,
                label: master.label,
                score,
                max: master.max,
                pct: Number(((score / master.max) * 100).toFixed(2)),
                comment: comment ? String(comment).trim() : "",
              };
            });

            const mergedAppeal = appealMap.get(caseId);

            const finalScoreRaw =
              rawHelper.getValue(row, "Final Score") ??
              rawHelper.getValue(row, "QA Score") ??
              rawHelper.getLastValue(row, "Final Score") ??
              calcMergedFinalScore(topics, mergedAppeal?.revisedTopics || []);

            const baseFinalScore = !Number.isNaN(Number(finalScoreRaw)) ? Number(finalScoreRaw) : 0;
            const finalScoreVal = mergedAppeal?.finalScore ?? calcMergedFinalScore(topics, mergedAppeal?.revisedTopics || []) || baseFinalScore;
            const previousScoreVal = mergedAppeal?.previousScore ?? baseFinalScore;

            const inquiry =
              rawHelper.getValue(row, "Customer Inquiry") ??
              rawHelper.getValue(row, "Inquiry TH") ??
              rawHelper.getValue(row, "Inquiry") ??
              "-";

            const weekLabel =
              rawHelper.getValue(row, "Week Label") ??
              rawHelper.getValue(row, "Week") ??
              "-";

            const auditDateRaw = rawHelper.getValue(row, "Audit Date") ?? rawHelper.getValue(row, "Timestamp");
            const auditDateObj = excelDateToJSDate(auditDateRaw);
            const monthKey = getMonthKey(auditDateObj);

            const reviewStatus: ReviewStatus =
              mergedAppeal?.displayRevisedTopicCodes?.length ? "Revised" : "Original";

            return {
              key: `row-${index + 1}-${caseId}`,
              agent: toTitleCaseName(String(rawHelper.getValue(row, "Agent Name") || "").trim()),
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
            };
          })
          .filter((item): item is CaseItem => Boolean(item));

        setAllCases(mapped.filter((item) => item.agent && item.caseId));
      } catch (error: any) {
        setLoadError(error?.message || "โหลดไฟล์ Excel ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);

  const latestMonthKey = useMemo(() => {
    return (
      [...new Set(allCases.map((item) => item.monthKey).filter((item) => item !== "unknown"))]
        .sort((a, b) => b.localeCompare(a))[0] || "all"
    );
  }, [allCases]);

  const visibleAgentList = useMemo(() => {
    const agentsFromCases = allCases.map((item) => String(item.agent || "").trim()).filter(Boolean);
    const effectiveMonthForVisibility = selectedMonth !== "all" ? selectedMonth : latestMonthKey;

    const mergedAgents = getUniqueNormalizedAgents([...AGENT_MASTER, ...agentsFromCases]).filter(
      (name) => !shouldHideAgentByMonth(name, effectiveMonthForVisibility)
    );

    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return mergedAgents.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }

    return mergedAgents;
  }, [allCases, currentUser, selectedMonth, latestMonthKey]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      const lockedAgent = toTitleCaseName(String(currentUser.agentName).trim());
      if (!isSameAgent(selectedAgent || "", lockedAgent)) {
        setSelectedAgent(lockedAgent);
      }
      onSelectedAgentChange?.(lockedAgent);
      return;
    }

    if (selectedAgent !== "all" && selectedAgent && !visibleAgentList.some((agent) => isSameAgent(agent, selectedAgent))) {
      setSelectedAgent("all");
      onSelectedAgentChange?.("all");
    }
  }, [currentUser, visibleAgentList, selectedAgent, onSelectedAgentChange]);

  const effectiveAgent =
    currentUser?.role === "Agent" && currentUser.agentName
      ? toTitleCaseName(String(currentUser.agentName).trim())
      : String(selectedAgent || "all").trim();

  const baseAgentCases = useMemo(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return allCases.filter((item) => isSameAgent(item.agent, currentUser.agentName));
    }
    if (!effectiveAgent || effectiveAgent === "all") return allCases;
    return allCases.filter((item) => isSameAgent(item.agent, effectiveAgent));
  }, [allCases, effectiveAgent, currentUser]);

  const monthOptions = useMemo(() => {
    const sourceCases = baseAgentCases.length > 0 ? baseAgentCases : allCases;
    return Array.from(
      new Map(
        sourceCases
          .filter((item) => item.monthKey !== "unknown")
          .map((item) => [item.monthKey, item.monthLabel])
      ).entries()
    )
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => b.value.localeCompare(a.value));
  }, [baseAgentCases, allCases]);

  const weekOptions = useMemo(() => {
    const sourceCases = selectedMonth === "all"
      ? baseAgentCases
      : baseAgentCases.filter((item) => item.monthKey === selectedMonth);

    return [...new Set(sourceCases.map((item) => item.weekLabel).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  }, [baseAgentCases, selectedMonth]);

  const yearOptions = useMemo(() => {
    return [...new Set(baseAgentCases.map((item) => item.yearKey).filter((item) => item !== "unknown"))].sort((a, b) => b.localeCompare(a));
  }, [baseAgentCases]);

  const monthScopedCases = useMemo(() => {
    let result = [...baseAgentCases];
    if (selectedMonth !== "all") result = result.filter((item) => item.monthKey === selectedMonth);
    if (selectedWeek !== "all") result = result.filter((item) => item.weekLabel === selectedWeek);
    return result.sort((a, b) => {
      const t1 = a.auditDateObj?.getTime() || 0;
      const t2 = b.auditDateObj?.getTime() || 0;
      return t2 - t1;
    });
  }, [baseAgentCases, selectedMonth, selectedWeek]);

  const yearScopedCases = useMemo(() => {
    let result = [...baseAgentCases];
    if (selectedYear !== "all") result = result.filter((item) => item.yearKey === selectedYear);
    if (selectedMonth !== "all") result = result.filter((item) => item.monthKey === selectedMonth);
    if (selectedWeek !== "all") result = result.filter((item) => item.weekLabel === selectedWeek);
    return result.sort((a, b) => {
      const t1 = a.auditDateObj?.getTime() || 0;
      const t2 = b.auditDateObj?.getTime() || 0;
      return t2 - t1;
    });
  }, [baseAgentCases, selectedYear, selectedMonth, selectedWeek]);

  const overallCases = useMemo(() => {
    if (viewMode === "yearly-team-summary" || viewMode === "yearly-by-agent") return yearScopedCases;
    return monthScopedCases;
  }, [viewMode, monthScopedCases, yearScopedCases]);

  const overviewSummary = useMemo(() => summarizeCases(overallCases), [overallCases]);
  const topicSummary = useMemo(() => buildTopicSummary(overallCases), [overallCases]);

  const weeklyDashboardRows = useMemo(() => {
    const groups = new Map<string, CaseItem[]>();
    monthScopedCases.forEach((item) => {
      const key = item.weekLabel || "-";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });

    return [...groups.entries()]
      .map(([label, cases]) => {
        const summary = summarizeCases(cases);
        return {
          ...summary,
          label,
          weekLabel: label,
          monthLabel: cases[0]?.monthLabel || "-",
          yearLabel: cases[0]?.yearKey || "-",
        };
      })
      .sort((a, b) => b.label.localeCompare(a.label));
  }, [monthScopedCases]);

  const weeklyQaByAgentRows = useMemo(() => {
    const activeAgents = effectiveAgent && effectiveAgent !== "all" ? [toTitleCaseName(effectiveAgent)] : visibleAgentList;

    return activeAgents
      .map((agent) => {
        const targetCases = monthScopedCases.filter((item) => isSameAgent(item.agent, agent));
        if (!targetCases.length) {
          return emptyAgentPeriodSummary(agent, selectedWeek === "all" ? "All Weeks" : selectedWeek, selectedMonth === "all" ? latestMonthKey : selectedMonth);
        }
        const summary = summarizeCases(targetCases);
        return {
          agent,
          label: selectedWeek === "all" ? "All Weeks" : targetCases[0]?.weekLabel || selectedWeek,
          caseCount: summary.caseCount,
          avgScore: summary.avgScore,
          grade: summary.grade,
          revisedCount: summary.revisedCount,
          incentive: summary.incentive,
          policyMonthKey: summary.policyMonthKey,
        };
      })
      .sort((a, b) => a.agent.localeCompare(b.agent));
  }, [monthScopedCases, effectiveAgent, visibleAgentList, selectedWeek, selectedMonth, latestMonthKey]);

  const monthlyDashboardRows = useMemo(() => {
    const groups = new Map<string, CaseItem[]>();
    monthScopedCases.forEach((item) => {
      const key = item.monthKey;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });

    return [...groups.entries()]
      .map(([key, cases]) => {
        const summary = summarizeCases(cases);
        return {
          ...summary,
          label: cases[0]?.monthLabel || key,
          weekLabel: selectedWeek === "all" ? "All Weeks" : selectedWeek,
          monthLabel: cases[0]?.monthLabel || "-",
          yearLabel: cases[0]?.yearKey || "-",
        };
      })
      .sort((a, b) => b.label.localeCompare(a.label));
  }, [monthScopedCases, selectedWeek]);

  const monthlyTeamRows = useMemo(() => {
    const activeAgents = effectiveAgent && effectiveAgent !== "all" ? [toTitleCaseName(effectiveAgent)] : visibleAgentList;

    return activeAgents
      .map((agent) => {
        const targetCases = monthScopedCases.filter((item) => isSameAgent(item.agent, agent));

        if (!targetCases.length) {
          const label =
            selectedMonth === "all"
              ? "All Months"
              : monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth;
          const policyMonthKey = selectedMonth === "all" ? getPolicyMonthKeyForCases(monthScopedCases) : selectedMonth;
          return emptyAgentPeriodSummary(agent, label, policyMonthKey);
        }

        const summary = summarizeCases(targetCases);
        return {
          agent,
          label: selectedMonth === "all" ? "All Months" : targetCases[0]?.monthLabel || selectedMonth,
          caseCount: summary.caseCount,
          avgScore: summary.avgScore,
          grade: summary.grade,
          revisedCount: summary.revisedCount,
          incentive: summary.incentive,
          policyMonthKey: summary.policyMonthKey,
        };
      })
      .sort((a, b) => a.agent.localeCompare(b.agent));
  }, [monthScopedCases, effectiveAgent, selectedMonth, monthOptions, visibleAgentList]);

  const yearlyTeamRows = useMemo(() => {
    const groups = new Map<string, CaseItem[]>();
    yearScopedCases.forEach((item) => {
      const key = item.yearKey;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });

    return [...groups.entries()]
      .map(([label, cases]) => {
        const summary = summarizeCases(cases);
        return {
          ...summary,
          label,
          weekLabel: selectedWeek === "all" ? "All Weeks" : selectedWeek,
          monthLabel: selectedMonth === "all" ? "All Months" : monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth,
          yearLabel: label,
        };
      })
      .sort((a, b) => b.label.localeCompare(a.label));
  }, [yearScopedCases, selectedWeek, selectedMonth, monthOptions]);

  const yearlyAgentRows = useMemo(() => {
    const activeAgents = effectiveAgent && effectiveAgent !== "all" ? [toTitleCaseName(effectiveAgent)] : visibleAgentList;

    return activeAgents
      .map((agent) => {
        const targetCases = yearScopedCases.filter((item) => isSameAgent(item.agent, agent));
        if (!targetCases.length) {
          const label = selectedYear === "all" ? "All Years" : selectedYear;
          return emptyAgentPeriodSummary(agent, label, getPolicyMonthKeyForCases(yearScopedCases));
        }
        const summary = summarizeCases(targetCases);
        return {
          agent,
          label: selectedYear === "all" ? "All Years" : targetCases[0]?.yearKey || selectedYear,
          caseCount: summary.caseCount,
          avgScore: summary.avgScore,
          grade: summary.grade,
          revisedCount: summary.revisedCount,
          incentive: summary.incentive,
          policyMonthKey: summary.policyMonthKey,
        };
      })
      .sort((a, b) => a.agent.localeCompare(b.agent));
  }, [yearScopedCases, effectiveAgent, visibleAgentList, selectedYear]);

  const caseListRows = useMemo(() => {
    switch (viewMode) {
      case "weekly-dashboard":
        return monthScopedCases;
      case "weekly-qa-by-agent":
        return monthScopedCases;
      case "monthly-dashboard":
        return monthScopedCases;
      case "monthly-team-summary":
        return monthScopedCases;
      case "yearly-team-summary":
        return yearScopedCases;
      case "yearly-by-agent":
        return yearScopedCases;
      default:
        return monthScopedCases;
    }
  }, [viewMode, monthScopedCases, yearScopedCases]);

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

  const caseListSubtitle = useMemo(() => {
    const agentText = effectiveAgent && effectiveAgent !== "all" ? effectiveAgent : "All Agents";
    const monthText = selectedMonth === "all" ? "All Months" : monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth;
    const weekText = selectedWeek === "all" ? "All Weeks" : selectedWeek;
    const yearText = selectedYear === "all" ? "All Years" : selectedYear;

    if (viewMode === "yearly-team-summary" || viewMode === "yearly-by-agent") {
      return `${agentText} • ${yearText} • ${monthText} • ${weekText}`;
    }
    return `${agentText} • ${monthText} • ${weekText}`;
  }, [effectiveAgent, selectedMonth, selectedWeek, selectedYear, monthOptions, viewMode]);

  const currentRowsBlock = useMemo(() => {
    switch (viewMode) {
      case "weekly-dashboard":
        return <SummaryTable rows={weeklyDashboardRows} firstColLabel="Week" showMonth showYear />;
      case "weekly-qa-by-agent":
        return <AgentPeriodTable rows={weeklyQaByAgentRows} periodLabel="Week" />;
      case "monthly-dashboard":
        return <SummaryTable rows={monthlyDashboardRows} firstColLabel="Month" showWeek showYear />;
      case "monthly-team-summary":
        return <AgentPeriodTable rows={monthlyTeamRows} periodLabel="Month" />;
      case "yearly-team-summary":
        return <SummaryTable rows={yearlyTeamRows} firstColLabel="Year" showMonth showWeek />;
      case "yearly-by-agent":
        return <AgentPeriodTable rows={yearlyAgentRows} periodLabel="Year" />;
      default:
        return null;
    }
  }, [viewMode, weeklyDashboardRows, weeklyQaByAgentRows, monthlyDashboardRows, monthlyTeamRows, yearlyTeamRows, yearlyAgentRows]);

  if (isLoading) {
    return (
      <div className="rounded-[32px] border border-violet-200 bg-white/95 p-10 text-center shadow-[0_14px_40px_rgba(76,29,149,0.10)]">
        <div className="text-lg font-semibold text-slate-800">Loading summary...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-[32px] border border-rose-200 bg-rose-50 p-8 text-rose-700 shadow-[0_14px_40px_rgba(244,63,94,0.10)]">
        {loadError}
      </div>
    );
  }

  return (
    <div className="relative space-y-6">
      <div className={`relative overflow-hidden rounded-[34px] border ${songkranTheme ? "border-cyan-200 bg-gradient-to-br from-violet-900 via-violet-800 to-fuchsia-700" : "border-violet-200 bg-gradient-to-br from-violet-950 via-violet-800 to-fuchsia-700"} px-6 py-6 text-white shadow-[0_18px_45px_rgba(76,29,149,0.22)] lg:px-8 lg:py-8`}>
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-white/70">QA Summary</div>
            <div className="mt-2 text-3xl font-black tracking-tight lg:text-[40px]">Performance Summary Overview</div>
            <div className="mt-2 max-w-3xl text-sm leading-6 text-white/80">
              Weekly, monthly, and yearly summary with topic trend and example case list by selected tab.
            </div>
          </div>
          <LogoHeaderBox />
        </div>
      </div>

      <Panel>
        <PanelHeader title="Summary Filter" subtitle="Filter by agent, month, week, and year" />
        <PanelBody>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="block">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Agent</div>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-300"
                value={effectiveAgent || "all"}
                disabled={currentUser?.role === "Agent"}
                onChange={(e) => {
                  setSelectedAgent(e.target.value);
                  onSelectedAgentChange?.(e.target.value);
                }}
              >
                {currentUser?.role !== "Agent" ? <option value="all">All Agents</option> : null}
                {visibleAgentList.map((agent) => (
                  <option key={agent} value={agent}>{agent}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Month</div>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-300"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  onSelectedMonthChange?.(e.target.value);
                }}
              >
                <option value="all">All Months</option>
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Week</div>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-300"
                value={selectedWeek}
                onChange={(e) => {
                  setSelectedWeek(e.target.value);
                  onSelectedWeekChange?.(e.target.value);
                }}
              >
                <option value="all">All Weeks</option>
                {weekOptions.map((week) => (
                  <option key={week} value={week}>{week}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Year</div>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-300"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                <option value="all">All Years</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>

            <div className="block">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Current View</div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {viewMode}
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <ViewButton active={viewMode === "weekly-dashboard"} label="Weekly Dashboard" onClick={() => setViewMode("weekly-dashboard")} />
            <ViewButton active={viewMode === "weekly-qa-by-agent"} label="Weekly QA by Agent" onClick={() => setViewMode("weekly-qa-by-agent")} />
            <ViewButton active={viewMode === "monthly-dashboard"} label="Monthly Dashboard" onClick={() => setViewMode("monthly-dashboard")} />
            <ViewButton active={viewMode === "monthly-team-summary"} label="Monthly Team Summary" onClick={() => setViewMode("monthly-team-summary")} />
            <ViewButton active={viewMode === "yearly-team-summary"} label="Yearly Team Summary" onClick={() => setViewMode("yearly-team-summary")} />
            <ViewButton active={viewMode === "yearly-by-agent"} label="Yearly by Agent" onClick={() => setViewMode("yearly-by-agent")} />
          </div>
        </PanelBody>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard title="Cases" value={`${overviewSummary.caseCount}`} sub="Case(s) in current view" accent="from-white via-violet-50/40 to-fuchsia-50/60 border-violet-200/70" valueClassName="text-violet-700" />
        <MetricCard title="Average Score" value={overviewSummary.avgScore.toFixed(2)} sub="Average QA score in current view" accent="from-white via-sky-50/40 to-cyan-50/60 border-sky-200/70" valueClassName="text-sky-700" />
        <MetricCard title="Grade" value={overviewSummary.grade} sub="Current calculated grade" accent="from-white via-emerald-50/40 to-lime-50/60 border-emerald-200/70" valueClassName="text-emerald-700" />
        <MetricCard title="Estimated Incentive" value={formatCurrencyTHB(overviewSummary.incentive)} sub="Based on current filtered result" accent="from-white via-fuchsia-50/40 to-violet-50/60 border-fuchsia-200/70" valueClassName="text-fuchsia-700" />
      </div>

      <Panel>
        <PanelHeader title="Summary Table" subtitle="Summary result by current tab" />
        <PanelBody>{currentRowsBlock}</PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Topic Performance" subtitle="Average topic score in current view" />
        <PanelBody>
          <TopicTable topics={topicSummary} />
        </PanelBody>
      </Panel>

      <CaseListTable rows={caseListRows} title={caseListTitle} subtitle={caseListSubtitle} />
    </div>
  );
}
