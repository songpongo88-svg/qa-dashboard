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
type SummaryView =
  | "weekly-dashboard"
  | "weekly-qa-by-agent"
  | "monthly-dashboard"
  | "monthly-team-summary"
  | "yearly-team-summary"
  | "yearly-by-agent";

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

function isNewPolicyMonth(monthKey: string) {
  return monthKey !== "unknown" && monthKey >= NEW_POLICY_START_MONTH_KEY;
}

function isSpecialIncentiveMonth(monthKey: string) {
  if (!isNewPolicyMonth(monthKey)) return false;
  return monthKey.endsWith("-01") || monthKey.endsWith("-04");
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
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
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

  const asDate = new Date(value);
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

function summarizeCases(cases: CaseItem[]): PeriodSummary {
  const caseCount = cases.length;
  const avgScore =
    cases.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(caseCount, 1);
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

function SongkranBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-0 top-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="absolute right-6 top-8 h-32 w-32 rounded-full bg-fuchsia-300/18 blur-3xl" />
      <div className="absolute left-1/4 bottom-0 h-36 w-36 rounded-full bg-sky-300/16 blur-3xl" />
      <div className="absolute right-1/3 bottom-2 h-24 w-24 rounded-full bg-violet-300/16 blur-2xl" />
      <div className="absolute left-[15%] top-[15%] h-3 w-3 rounded-full bg-white/80" />
      <div className="absolute right-[14%] top-[12%] h-4 w-4 rounded-full bg-cyan-200/70" />
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
      {isSongkranThemeActive() ? (
        <span className="pointer-events-none absolute right-3 top-3 h-3 w-3 rounded-full bg-cyan-300/70" />
      ) : null}
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

function ViewButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
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
      {active && songkranTheme ? (
        <span className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-cyan-300/80" />
      ) : null}
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
              <td className="border-t border-slate-200 px-3 py-3 text-center">
                {topic.avgScore.toFixed(2)}
              </td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{topic.max}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">
                {topic.pct.toFixed(2)}%
              </td>
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
              <tr
                key={`${row.label}-${row.weekLabel || ""}-${row.monthLabel || ""}-${row.yearLabel || ""}`}
                className="bg-white"
              >
                <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">
                  {row.label}
                </td>
                {showWeek ? (
                  <td className="border-t border-slate-200 px-4 py-3">{row.weekLabel || "-"}</td>
                ) : null}
                {showMonth ? (
                  <td className="border-t border-slate-200 px-4 py-3">{row.monthLabel || "-"}</td>
                ) : null}
                {showYear ? (
                  <td className="border-t border-slate-200 px-4 py-3">{row.yearLabel || "-"}</td>
                ) : null}
                <td className="border-t border-slate-200 px-4 py-3 text-center">{row.caseCount}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">
                  {row.avgScore.toFixed(2)}
                </td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(
                      row.grade
                    )}`}
                  >
                    {row.grade}
                  </span>
                </td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">{row.revisedCount}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">
                  {formatCurrencyTHB(row.incentive)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={colSpan}
                className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500"
              >
                No data found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AgentPeriodTable({
  rows,
  periodLabel,
}: {
  rows: AgentPeriodSummary[];
  periodLabel: string;
}) {
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
                <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">
                  {row.agent}
                </td>
                <td className="border-t border-slate-200 px-4 py-3">{row.label}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">{row.caseCount}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">
                  {row.avgScore.toFixed(2)}
                </td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(
                      row.grade
                    )}`}
                  >
                    {row.grade}
                  </span>
                </td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">{row.revisedCount}</td>
                <td className="border-t border-slate-200 px-4 py-3 text-center">
                  {formatCurrencyTHB(row.incentive)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={7}
                className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500"
              >
                No data found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
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
  const [selectedAgent, setSelectedAgent] = useState<string>(externalSelectedAgent || "");
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

        const [rawResponse, appealResponse] = await Promise.all([
          fetch("/QA_RawData1.xlsx"),
          fetch("/Appleal ROWDATA.xlsx"),
        ]);

        if (!rawResponse.ok) {
          throw new Error("ไม่พบไฟล์ QA_RawData1.xlsx ในโฟลเดอร์ public");
        }
        if (!appealResponse.ok) {
          throw new Error("ไม่พบไฟล์ Appleal ROWDATA.xlsx ในโฟลเดอร์ public");
        }

        const rawBuffer = await rawResponse.arrayBuffer();
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
          throw new Error("ไม่พบแถว Header ในไฟล์ QA_RawData1.xlsx");
        }

        const rawHeaderRow = (rawRows[rawHeaderIndex] || []) as any[];
        const rawDataRows = rawRows.slice(rawHeaderIndex + 1);
        const rawHelper = buildHeaderHelpers(rawHeaderRow);

        const appealBuffer = await appealResponse.arrayBuffer();
        const appealWorkbook = XLSX.read(appealBuffer, { type: "array", cellDates: true });
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

        if (appealHeaderIndex === -1) {
          throw new Error("ไม่พบแถว Header ในไฟล์ Appleal ROWDATA.xlsx");
        }

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

            if (
              originalScoreRaw !== revisedScoreRaw ||
              String(originalCommentRaw ?? "").trim() !== String(revisedCommentRaw ?? "").trim()
            ) {
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

        const mapped: CaseItem[] = rawDataRows
          .filter(
            (row) => row && rawHelper.getValue(row, "Agent Name") && rawHelper.getValue(row, "Case ID")
          )
          .map((row, index) => {
            const topics: Topic[] = TOPIC_MASTER.map((topic) => {
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

            const caseId = String(rawHelper.getValue(row, "Case ID")).trim();
            const mergedAppeal = appealMap.get(caseId);

            const baseFinalScore =
              Number(rawHelper.getValue(row, "Final Score")) ||
              topics.reduce((sum, topic) => sum + topic.score, 0);

            const finalScoreVal =
              mergedAppeal?.finalScore ??
              (mergedAppeal?.revisedTopics?.length
                ? calcMergedFinalScore(topics, mergedAppeal.revisedTopics)
                : baseFinalScore);

            const previousScoreVal = mergedAppeal?.previousScore ?? baseFinalScore;

            const inquiry =
              rawHelper.getValue(row, "Customer Inquiry") ??
              rawHelper.getValue(row, "Inquiry TH") ??
              rawHelper.getValue(row, "Inquiry");

            const weekLabel =
              rawHelper.getValue(row, "Week Label") ??
              rawHelper.getValue(row, "Week") ??
              "-";

            const auditDateRaw = rawHelper.getValue(row, "Audit Date");
            const auditDateObj = excelDateToJSDate(auditDateRaw);
            const monthKey = getMonthKey(auditDateObj);

            const reviewStatus: ReviewStatus =
              mergedAppeal?.displayRevisedTopicCodes?.length ? "Revised" : "Original";

            return {
              key: `row-${index + 1}-${caseId}`,
              agent: String(rawHelper.getValue(row, "Agent Name")).trim(),
              auditDate: formatAuditDate(auditDateRaw),
              auditDateObj,
              monthKey,
              monthLabel: getMonthLabel(auditDateObj),
              yearKey: getYearKey(auditDateObj),
              weekLabel: String(weekLabel || "-").trim(),
              caseId,
              inquiryTh: inquiry ? String(inquiry).trim() : "-",
              inquiryEn: inquiry ? String(inquiry).trim() : "-",
              finalScore: finalScoreVal,
              previousScore: previousScoreVal,
              grade: scoreToGrade(finalScoreVal, monthKey),
              reviewStatus,
              topics,
              revisedTopics: mergedAppeal?.revisedTopics?.length ? mergedAppeal.revisedTopics : null,
              displayRevisedTopicCodes: mergedAppeal?.displayRevisedTopicCodes || [],
            };
          });

        setAllCases(mapped.filter((item) => item.agent && item.caseId));
      } catch (error: any) {
        setLoadError(error?.message || "โหลดไฟล์ Excel ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);

  const visibleAgentList = useMemo(() => {
    const agentsFromCases = allCases.map((item) => String(item.agent || "").trim()).filter(Boolean);
    const mergedAgents = [...new Set([...AGENT_MASTER, ...agentsFromCases])].sort((a, b) =>
      a.localeCompare(b)
    );

    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return mergedAgents.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }

    return mergedAgents;
  }, [allCases, currentUser]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      setSelectedAgent(currentUser.agentName);
      return;
    }

    if (!selectedAgent && visibleAgentList.length) {
      setSelectedAgent("all");
    }
  }, [currentUser, visibleAgentList, selectedAgent]);

  const effectiveAgent =
    currentUser?.role === "Agent" && currentUser.agentName
      ? currentUser.agentName
      : selectedAgent;

  const filteredByAgent = useMemo(() => {
    if (!effectiveAgent || effectiveAgent === "all") return allCases;
    return allCases.filter((item) => isSameAgent(item.agent, effectiveAgent));
  }, [allCases, effectiveAgent]);

  const monthOptions = useMemo(() => {
    const sourceCases = filteredByAgent.length > 0 ? filteredByAgent : allCases;

    return Array.from(
      new Map(
        sourceCases
          .filter((item) => item.monthKey !== "unknown")
          .map((item) => [item.monthKey, item.monthLabel])
      ).entries()
    )
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => b.value.localeCompare(a.value));
  }, [filteredByAgent, allCases]);

  const yearOptions = useMemo(() => {
    return [
      ...new Set(filteredByAgent.map((item) => item.yearKey).filter((item) => item !== "unknown")),
    ].sort((a, b) => b.localeCompare(a));
  }, [filteredByAgent]);

  const monthScopedForWeekOptions = useMemo(() => {
    if (selectedMonth === "all") return filteredByAgent;
    return filteredByAgent.filter((item) => item.monthKey === selectedMonth);
  }, [filteredByAgent, selectedMonth]);

  const weekOptions = useMemo(() => {
    return [...new Set(monthScopedForWeekOptions.map((item) => item.weekLabel).filter(Boolean))].sort();
  }, [monthScopedForWeekOptions]);

  useEffect(() => {
    if (selectedMonth !== "all" && !monthOptions.some((item) => item.value === selectedMonth)) {
      setSelectedMonth("all");
      onSelectedMonthChange?.("all");
    }
  }, [selectedMonth, monthOptions, onSelectedMonthChange]);

  useEffect(() => {
    if (selectedWeek !== "all" && !weekOptions.includes(selectedWeek)) {
      setSelectedWeek("all");
      onSelectedWeekChange?.("all");
    }
  }, [selectedWeek, weekOptions, onSelectedWeekChange]);

  const monthScopedCases = useMemo(() => {
    if (selectedMonth === "all") return filteredByAgent;
    return filteredByAgent.filter((item) => item.monthKey === selectedMonth);
  }, [filteredByAgent, selectedMonth]);

  const yearScopedCases = useMemo(() => {
    if (selectedYear === "all") return filteredByAgent;
    return filteredByAgent.filter((item) => item.yearKey === selectedYear);
  }, [filteredByAgent, selectedYear]);

  const weekScopedCases = useMemo(() => {
    if (selectedWeek === "all") return monthScopedCases;
    return monthScopedCases.filter((item) => item.weekLabel === selectedWeek);
  }, [monthScopedCases, selectedWeek]);

  const weeklyDashboardRows = useMemo(() => {
    const groups = new Map<string, CaseItem[]>();
    weekScopedCases.forEach((item) => {
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
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [weekScopedCases]);

  const weeklyAgentRows = useMemo(() => {
    const activeAgents =
      effectiveAgent && effectiveAgent !== "all" ? [effectiveAgent] : AGENT_MASTER;

    return activeAgents
      .flatMap((agent) => {
        const targetCases = weekScopedCases.filter((item) => isSameAgent(item.agent, agent));

        const groups = new Map<string, CaseItem[]>();
        targetCases.forEach((item) => {
          const key = item.weekLabel || "-";
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(item);
        });

        if (!groups.size && selectedWeek !== "all") {
          const policyMonthKey = getPolicyMonthKeyForCases(weekScopedCases);
          return [emptyAgentPeriodSummary(agent, selectedWeek, policyMonthKey)];
        }

        return [...groups.entries()].map(([label, cases]) => {
          const summary = summarizeCases(cases);
          return {
            agent,
            label,
            caseCount: summary.caseCount,
            avgScore: summary.avgScore,
            grade: summary.grade,
            revisedCount: summary.revisedCount,
            incentive: summary.incentive,
            policyMonthKey: summary.policyMonthKey,
          };
        });
      })
      .sort((a, b) => {
        if (a.label !== b.label) return a.label.localeCompare(b.label);
        return a.agent.localeCompare(b.agent);
      });
  }, [weekScopedCases, effectiveAgent, selectedWeek]);

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
    const activeAgents =
      effectiveAgent && effectiveAgent !== "all" ? [effectiveAgent] : AGENT_MASTER;

    return activeAgents
      .map((agent) => {
        const targetCases = monthScopedCases.filter((item) => isSameAgent(item.agent, agent));

        if (!targetCases.length) {
          const label =
            selectedMonth === "all"
              ? "All Months"
              : monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth;
          const policyMonthKey =
            selectedMonth === "all" ? getPolicyMonthKeyForCases(monthScopedCases) : selectedMonth;
          return emptyAgentPeriodSummary(agent, label, policyMonthKey);
        }

        const summary = summarizeCases(targetCases);
        return {
          agent,
          label:
            selectedMonth === "all"
              ? "All Months"
              : targetCases[0]?.monthLabel || selectedMonth,
          caseCount: summary.caseCount,
          avgScore: summary.avgScore,
          grade: summary.grade,
          revisedCount: summary.revisedCount,
          incentive: summary.incentive,
          policyMonthKey: summary.policyMonthKey,
        };
      })
      .sort((a, b) => a.agent.localeCompare(b.agent));
  }, [monthScopedCases, effectiveAgent, selectedMonth, monthOptions]);

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
          monthLabel:
            selectedMonth === "all"
              ? "All Months"
              : monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth,
          yearLabel: label,
        };
      })
      .sort((a, b) => b.label.localeCompare(a.label));
  }, [yearScopedCases, selectedWeek, selectedMonth, monthOptions]);

  const yearlyAgentRows = useMemo(() => {
    const activeAgents =
      effectiveAgent && effectiveAgent !== "all" ? [effectiveAgent] : AGENT_MASTER;

    return activeAgents
      .map((agent) => {
        const targetCases = yearScopedCases.filter((item) => isSameAgent(item.agent, agent));

        if (!targetCases.length) {
          const policyMonthKey = getPolicyMonthKeyForCases(yearScopedCases);
          return emptyAgentPeriodSummary(
            agent,
            selectedYear === "all" ? "All Years" : selectedYear,
            policyMonthKey
          );
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
  }, [yearScopedCases, effectiveAgent, selectedYear]);

  const summaryCards = useMemo(() => {
  const source =
    viewMode === "weekly-dashboard" || viewMode === "weekly-qa-by-agent"
      ? weekScopedCases
      : viewMode === "monthly-dashboard" || viewMode === "monthly-team-summary"
      ? monthScopedCases
      : yearScopedCases;

  const avg = source.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(source.length, 1);
  const revisedCount = source.filter((item) => item.reviewStatus === "Revised").length;

  const policyMonthKey =
    selectedMonth !== "all"
      ? selectedMonth
      : getPolicyMonthKeyForCases(source);

  const incentive = getIncentiveValue(source.length, avg, policyMonthKey);

  return {
    caseCount: source.length,
    avgScore: avg,
    grade: scoreToGrade(avg, policyMonthKey),
    revisedCount,
    incentive,
    topicSummary: buildTopicSummary(source),
    policyMonthKey,
  };
}, [viewMode, weekScopedCases, monthScopedCases, yearScopedCases, selectedMonth]);

  const viewingAgentText =
    currentUser?.role === "Agent"
      ? currentUser.agentName
      : !effectiveAgent || effectiveAgent === "all"
      ? "All Agents"
      : effectiveAgent;

  const viewingMonthText =
    selectedMonth === "all"
      ? "All Months"
      : monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth;

  const viewingWeekText = selectedWeek === "all" ? "All Weeks" : selectedWeek;
  const viewingYearText = selectedYear === "all" ? "All Years" : selectedYear;

  const policyText = isNewPolicyMonth(summaryCards.policyMonthKey)
    ? "New Criteria"
    : "Previous Criteria";

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-3xl border border-violet-200 bg-white px-6 py-5 text-slate-700 shadow-sm">
          กำลังโหลด Summary Dashboard...
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

      <div
        className={`relative text-white shadow-[0_16px_40px_rgba(76,29,149,0.22)] ${
          songkranTheme
            ? "bg-gradient-to-r from-sky-700 via-cyan-600 to-fuchsia-700"
            : "bg-gradient-to-r from-violet-950 via-violet-900 to-fuchsia-700"
        }`}
      >
        {songkranTheme ? <SongkranBackdrop /> : null}

        <div className="mx-auto max-w-[1720px] px-6 py-8 lg:px-8 lg:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-4xl">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200">
                QA Summary
              </div>
              <div className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl">
                Weekly / Monthly / Yearly Summary Workspace
              </div>
              <div className="mt-3 max-w-3xl text-sm leading-6 text-violet-100/95">
                รวมหน้าสรุป Weekly Dashboard, Weekly QA by Agent, Monthly Dashboard, Monthly Team
                Summary, Yearly Team Summary และ Yearly by Agent ในหน้าเดียว
              </div>
              {songkranTheme ? (
                <div className="mt-4 inline-flex rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/95 backdrop-blur-sm">
                  Songkran Theme Active
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
                  Summary Performance Center
                </div>
                <div className="mt-1 text-sm text-violet-100/90">
                  Weekly / Monthly / Yearly team and agent summary
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1720px] px-6 py-6 lg:px-8 lg:py-8">
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel className="sticky top-4">
              <PanelHeader title="Summary Controls" subtitle="Select summary type and filter scope" />
              <PanelBody className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <ViewButton
                    active={viewMode === "weekly-dashboard"}
                    label="Weekly Dashboard"
                    onClick={() => setViewMode("weekly-dashboard")}
                  />
                  <ViewButton
                    active={viewMode === "weekly-qa-by-agent"}
                    label="Weekly QA by Agent"
                    onClick={() => setViewMode("weekly-qa-by-agent")}
                  />
                  <ViewButton
                    active={viewMode === "monthly-dashboard"}
                    label="Monthly Dashboard"
                    onClick={() => setViewMode("monthly-dashboard")}
                  />
                  <ViewButton
                    active={viewMode === "monthly-team-summary"}
                    label="Monthly Team Summary"
                    onClick={() => setViewMode("monthly-team-summary")}
                  />
                  <ViewButton
                    active={viewMode === "yearly-team-summary"}
                    label="Yearly Team Summary"
                    onClick={() => setViewMode("yearly-team-summary")}
                  />
                  <ViewButton
                    active={viewMode === "yearly-by-agent"}
                    label="Yearly by Agent"
                    onClick={() => setViewMode("yearly-by-agent")}
                  />
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    Agent
                  </div>
                  {currentUser?.role === "Agent" ? (
                    <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3 text-sm font-semibold text-violet-800">
                      {currentUser.agentName}
                    </div>
                  ) : (
                    <select
                      value={selectedAgent}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedAgent(value);
                        onSelectedAgentChange?.(value);
                      }}
                      className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    >
                      <option value="all">All Agents</option>
                      {visibleAgentList.map((agent) => (
                        <option key={agent} value={agent}>
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
                    value={selectedMonth}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedMonth(value);
                      onSelectedMonthChange?.(value);
                      setSelectedWeek("all");
                      onSelectedWeekChange?.("all");
                    }}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  >
                    <option value="all">All Months</option>
                    {monthOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
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
                    }}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  >
                    <option value="all">All Weeks</option>
                    {weekOptions.map((week) => (
                      <option key={week} value={week}>
                        {week}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    Year
                  </div>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  >
                    <option value="all">All Years</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
              </PanelBody>
            </Panel>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              <MetricCard
                title="Total Cases"
                value={String(summaryCards.caseCount)}
                sub="Current summary scope"
                accent="from-sky-50 via-white to-sky-100/70 border-sky-200"
                valueClassName="text-sky-700"
              />
              <MetricCard
                title="Average Score"
                value={summaryCards.avgScore.toFixed(2)}
                sub="Average quality score"
                accent={
                  songkranTheme
                    ? "from-white via-cyan-50/50 to-fuchsia-50/60 border-cyan-200/80"
                    : "from-white via-violet-50/50 to-fuchsia-50/60 border-violet-200/80"
                }
                valueClassName={songkranTheme ? "text-cyan-700" : "text-violet-900"}
              />
              <MetricCard
                title="Current Grade"
                value={summaryCards.grade}
                sub={policyText}
                accent="from-white via-amber-50/50 to-amber-100/70 border-amber-200"
                valueClassName="text-amber-700"
              />
              <MetricCard
                title="Revised Cases"
                value={String(summaryCards.revisedCount)}
                sub="Appeal updated cases"
                accent="from-rose-50 via-white to-rose-100/70 border-rose-200"
                valueClassName="text-rose-700"
              />
              <MetricCard
                title="Estimated Incentive"
                value={formatCurrencyTHB(summaryCards.incentive)}
                sub={
                  isSpecialIncentiveMonth(summaryCards.policyMonthKey)
                    ? "Jan/Apr special month"
                    : "Only paid when casesครบ 10"
                }
                accent={
                  songkranTheme
                    ? "from-white via-cyan-50/50 to-fuchsia-100/60 border-cyan-200"
                    : "from-white via-fuchsia-50/50 to-violet-100/60 border-fuchsia-200"
                }
                valueClassName={songkranTheme ? "text-cyan-700" : "text-fuchsia-700"}
              />
              <MetricCard
                title="Policy Month"
                value={summaryCards.policyMonthKey === "unknown" ? "-" : summaryCards.policyMonthKey}
                sub={policyText}
                accent="from-emerald-50 via-white to-emerald-100/70 border-emerald-200"
                valueClassName="text-emerald-700"
              />
            </div>

            <Panel>
              <PanelHeader title="Current Viewing Scope" subtitle="Current selected agent and period" />
              <PanelBody>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                      Viewing Agent
                    </div>
                    <div className="mt-2 text-sm font-bold text-slate-900">{viewingAgentText}</div>
                  </div>

                  <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                      Viewing Month
                    </div>
                    <div className="mt-2 text-sm font-bold text-slate-900">{viewingMonthText}</div>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                      Viewing Week
                    </div>
                    <div className="mt-2 text-sm font-bold text-slate-900">{viewingWeekText}</div>
                  </div>

                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                      Viewing Year
                    </div>
                    <div className="mt-2 text-sm font-bold text-slate-900">{viewingYearText}</div>
                  </div>

                  <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-4">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">
                      Grade Policy
                    </div>
                    <div className="mt-2 text-sm font-bold text-slate-900">{policyText}</div>
                  </div>
                </div>
              </PanelBody>
            </Panel>

            {(viewMode === "weekly-dashboard" ||
              viewMode === "monthly-dashboard" ||
              viewMode === "yearly-team-summary") && (
              <Panel>
                <PanelHeader
                  title={
                    viewMode === "weekly-dashboard"
                      ? "Weekly Dashboard"
                      : viewMode === "monthly-dashboard"
                      ? "Monthly Dashboard"
                      : "Yearly Team Summary"
                  }
                  subtitle={`Viewing: ${viewingAgentText} • Week: ${viewingWeekText} • Month: ${viewingMonthText} • Year: ${viewingYearText}`}
                />
                <PanelBody>
                  <SummaryTable
                    firstColLabel="Summary"
                    showWeek={true}
                    showMonth={true}
                    showYear={true}
                    rows={
                      viewMode === "weekly-dashboard"
                        ? weeklyDashboardRows
                        : viewMode === "monthly-dashboard"
                        ? monthlyDashboardRows
                        : yearlyTeamRows
                    }
                  />
                </PanelBody>
              </Panel>
            )}

            {(viewMode === "weekly-qa-by-agent" ||
              viewMode === "monthly-team-summary" ||
              viewMode === "yearly-by-agent") && (
              <Panel>
                <PanelHeader
                  title={
                    viewMode === "weekly-qa-by-agent"
                      ? "Weekly QA by Agent"
                      : viewMode === "monthly-team-summary"
                      ? "Monthly Team Summary"
                      : "Yearly by Agent"
                  }
                  subtitle={`Viewing: ${viewingAgentText} • Week: ${viewingWeekText} • Month: ${viewingMonthText} • Year: ${viewingYearText}`}
                />
                <PanelBody>
                  <AgentPeriodTable
                    periodLabel={
                      viewMode === "weekly-qa-by-agent"
                        ? "Week"
                        : viewMode === "monthly-team-summary"
                        ? "Month"
                        : "Year"
                    }
                    rows={
                      viewMode === "weekly-qa-by-agent"
                        ? weeklyAgentRows
                        : viewMode === "monthly-team-summary"
                        ? monthlyTeamRows
                        : yearlyAgentRows
                    }
                  />
                </PanelBody>
              </Panel>
            )}

            <Panel>
              <PanelHeader
                title="Topic Performance Summary"
                subtitle={`Average topic performance in current scope • ${viewingAgentText}`}
              />
              <PanelBody>
                <TopicTable topics={summaryCards.topicSummary} />
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}