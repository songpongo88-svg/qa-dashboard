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
  const [, hideFromMonth] = matchedEntry;
  return selectedMonthKey >= hideFromMonth;
}

function excelDateToJSDate(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
  }

  const text = String(value).trim();
  if (!text) return null;

  const ddmmyyyyMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ddmmyyyyMatch) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = ddmmyyyyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), parsed.getHours(), parsed.getMinutes(), parsed.getSeconds());
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

function getYearKey(date: Date | null) {
  if (!date) return "unknown";
  return String(date.getFullYear());
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
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(value || 0);
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

function getPolicyMonthKeyForCases(cases: CaseItem[]) {
  const valid = cases.map((item) => item.monthKey).filter((item) => item && item !== "unknown").sort((a, b) => a.localeCompare(b));
  return valid.length ? valid[valid.length - 1] : "unknown";
}

function buildHeaderHelpers(headerRow: any[]) {
  const normalizedHeaders = headerRow.map((h) => normalizeText(h));
  const findIndexes = (name: string) => {
    const target = normalizeText(name);
    return normalizedHeaders.map((h, idx) => (h === target ? idx : -1)).filter((idx) => idx >= 0);
  };
  const getValue = (row: any[], name: string, occurrence = 0) => {
    const indexes = findIndexes(name);
    const idx = indexes[occurrence];
    return idx >= 0 ? row[idx] : null;
  };
  return { getValue };
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

function buildTopicSummary(cases: CaseItem[]): TopicSummary[] {
  return TOPIC_MASTER.map((master) => {
    const topics = cases
      .flatMap((item) => (item.reviewStatus === "Revised" && item.revisedTopics?.length ? mergeTopicSet(item.topics, item.revisedTopics) : item.topics))
      .filter((topic) => topic.code === master.code);

    if (!topics.length) return { code: master.code, label: master.label, avgScore: 0, max: master.max, pct: 0 };

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

function summarizeCases(cases: CaseItem[]): SummaryCards {
  const caseCount = cases.length;
  const avgScore = caseCount ? Number((cases.reduce((sum, item) => sum + item.finalScore, 0) / caseCount).toFixed(2)) : 0;
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
    .sort((a, b) => a.label.localeCompare(b.label));
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

function SummaryTable({ rows, firstColLabel }: { rows: PeriodRow[]; firstColLabel: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[880px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-4 py-3 text-left">{firstColLabel}</th>
            <th className="px-4 py-3 text-center">Cases</th>
            <th className="px-4 py-3 text-center">Average Score</th>
            <th className="px-4 py-3 text-center">Grade</th>
            <th className="px-4 py-3 text-center">Revised</th>
            <th className="px-4 py-3 text-center">Incentive</th>
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
              <td className="border-t border-slate-200 px-4 py-3 text-center">{formatCurrencyTHB(row.incentive)}</td>
            </tr>
          )) : (
            <tr><td colSpan={6} className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No data found</td></tr>
          )}
        </tbody>
      </table>
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

function CaseListTable({ cases }: { cases: CaseItem[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[1040px] w-full text-sm">
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
          {cases.length ? cases.map((item, idx) => (
            <tr key={item.key} className="bg-white">
              <td className="border-t border-slate-200 px-4 py-3 text-center">{idx + 1}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{item.auditDate}</td>
              <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">{item.caseId}</td>
              <td className="border-t border-slate-200 px-4 py-3">{item.inquiryTh || "-"}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{item.finalScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-4 py-3 text-center"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getGradeTone(item.grade)}`}>{item.grade}</span></td>
              <td className="border-t border-slate-200 px-4 py-3 text-center">{item.reviewStatus}</td>
            </tr>
          )) : (
            <tr><td colSpan={7} className="border-t border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No case list for current selection</td></tr>
          )}
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
  const [appealMergeCount, setAppealMergeCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
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

        const [rawResponse, appealResponse] = await Promise.all([
          fetch("/QA_RawData1.xlsx", { cache: "no-store" }),
          fetch("/Appleal ROWDATA.xlsx", { cache: "no-store" }),
        ]);

        if (!rawResponse.ok) throw new Error("ไม่พบไฟล์ QA_RawData1.xlsx ในโฟลเดอร์ public");
        if (!appealResponse.ok) throw new Error("ไม่พบไฟล์ Appleal ROWDATA.xlsx ในโฟลเดอร์ public");

        const rawBuffer = await rawResponse.arrayBuffer();
        const rawWorkbook = XLSX.read(rawBuffer, { type: "array", cellDates: false });
        const rawSheet = rawWorkbook.Sheets["Raw_Data"] || rawWorkbook.Sheets[rawWorkbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<any[]>(rawSheet, { header: 1, defval: null, raw: true });

        const rawHeaderIndex = rawRows.findIndex((row: any[]) => {
          const normalized = (row || []).map((v: any) => normalizeText(v));
          return normalized.includes("agent name") && normalized.includes("case id");
        });
        if (rawHeaderIndex === -1) throw new Error("ไม่พบแถว Header ในไฟล์ QA_RawData1.xlsx");

        const rawHeaderRow = (rawRows[rawHeaderIndex] || []) as any[];
        const rawDataRows = rawRows.slice(rawHeaderIndex + 1);
        const rawHelper = buildHeaderHelpers(rawHeaderRow);

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

          appealDataRows.forEach((row: any[]) => {
            const caseId = String(appealHelper.getValue(row, "Case ID") || "").trim();
            if (!caseId) return;

            const revisedTopics: Topic[] = [];
            TOPIC_MASTER.forEach((master) => {
              const scoreRaw = appealHelper.getValue(row, `${master.code} Revised Score`) ?? appealHelper.getValue(row, `${master.code} score`) ?? appealHelper.getValue(row, master.code);
              if (scoreRaw === null || scoreRaw === "" || Number.isNaN(Number(scoreRaw))) return;
              const score = Number(scoreRaw);
              revisedTopics.push({ code: master.code, label: master.label, score, max: master.max, pct: Number(((score / master.max) * 100).toFixed(2)) });
            });

            const finalScoreRaw = appealHelper.getValue(row, "Final Score");
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

        const mappedCases: CaseItem[] = rawDataRows.map((row: any[], index: number) => {
          const caseId = String(rawHelper.getValue(row, "Case ID") || "").trim();
          if (!caseId) return null as any;

          const auditRaw = rawHelper.getValue(row, "Audit Date");
          const auditDateObj = excelDateToJSDate(auditRaw);
          const monthKey = getMonthKey(auditDateObj);
          const monthLabel = getMonthLabel(auditDateObj);
          const yearKey = getYearKey(auditDateObj);
          const weekLabel = String(rawHelper.getValue(row, "Week") || rawHelper.getValue(row, "Week Label") || "-").trim();
          const inquiry = String(rawHelper.getValue(row, "Inquiry") || rawHelper.getValue(row, "Customer Inquiry") || "-").trim();
          const agent = toTitleCaseName(String(rawHelper.getValue(row, "Agent Name") || "").trim());
          const mergedAppeal = appealMap.get(caseId);

          const topics: Topic[] = TOPIC_MASTER.map((master) => {
            const scoreRaw = rawHelper.getValue(row, `${master.code} Score`) ?? rawHelper.getValue(row, master.code) ?? 0;
            const score = scoreRaw !== null && scoreRaw !== "" && !Number.isNaN(Number(scoreRaw)) ? Number(scoreRaw) : 0;
            return { code: master.code, label: master.label, score, max: master.max, pct: Number(((score / master.max) * 100).toFixed(2)) };
          });

          const finalScoreRaw = rawHelper.getValue(row, "Final Score");
          const baseFinalScore = finalScoreRaw !== null && finalScoreRaw !== "" && !Number.isNaN(Number(finalScoreRaw)) ? Number(finalScoreRaw) : Number(topics.reduce((sum, topic) => sum + topic.score, 0).toFixed(2));
          const finalScoreVal = mergedAppeal?.finalScore ?? (mergedAppeal?.revisedTopics?.length ? calcMergedFinalScore(topics, mergedAppeal.revisedTopics) : baseFinalScore);
          const previousScoreVal = mergedAppeal?.previousScore ?? baseFinalScore;
          const reviewStatus: ReviewStatus = mergedAppeal?.displayRevisedTopicCodes?.length ? "Revised" : "Original";

          return {
            key: `row-${index + 1}-${caseId}`,
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
            revisedTopics: mergedAppeal?.revisedTopics?.length ? mergedAppeal.revisedTopics : null,
            displayRevisedTopicCodes: mergedAppeal?.displayRevisedTopicCodes || [],
          } as CaseItem;
        }).filter(Boolean) as CaseItem[];

        setAllCases(mappedCases);
        setAppealMergeCount(appealMap.size);
      } catch (error: any) {
        setLoadError(error?.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);

  const availableAgents = useMemo(() => {
    const names = getUniqueNormalizedAgents([...AGENT_MASTER, ...allCases.map((item) => item.agent)]).filter(
      (name) => (selectedMonth === "all" ? true : !shouldHideAgentByMonth(name, selectedMonth))
    );

    if (currentUser?.role === "Agent" && currentUser?.agentName) {
      return names.filter((name) => isSameAgent(name, currentUser.agentName));
    }

    return names;
  }, [allCases, selectedMonth, currentUser]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser?.agentName) {
      const lockedAgent = toTitleCaseName(String(currentUser.agentName).trim());
      if (!isSameAgent(selectedAgent || "", lockedAgent)) {
        setSelectedAgent(lockedAgent);
      }
      onSelectedAgentChange?.(lockedAgent);
      return;
    }
  }, [currentUser, selectedAgent, onSelectedAgentChange]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && viewMode === "weekly-qa-by-agent") {
      setViewMode("weekly-dashboard");
    }
  }, [currentUser, viewMode]);

  const monthOptions = useMemo(() => {
    const keys = [...new Set(allCases.map((item) => item.monthKey).filter(Boolean))].sort();
    return [{ value: "all", label: "All Months" }].concat(keys.map((key) => ({ value: key, label: allCases.find((item) => item.monthKey === key)?.monthLabel || key })));
  }, [allCases]);

  const weekOptions = useMemo(() => {
    const filtered = selectedMonth === "all" ? allCases : allCases.filter((item) => item.monthKey === selectedMonth);
    const labels = [...new Set(filtered.map((item) => item.weekLabel).filter(Boolean))].sort();
    return [{ value: "all", label: "All Weeks" }].concat(labels.map((label) => ({ value: label, label })));
  }, [allCases, selectedMonth]);

  const yearOptions = useMemo(() => {
    const keys = [...new Set(allCases.map((item) => item.yearKey).filter(Boolean))].sort();
    return [{ value: "all", label: "All Years" }].concat(keys.map((key) => ({ value: key, label: key })));
  }, [allCases]);

  const effectiveSelectedAgent =
    currentUser?.role === "Agent" && currentUser?.agentName
      ? toTitleCaseName(String(currentUser.agentName).trim())
      : selectedAgent;

  const filteredCases = useMemo(() => {
    return allCases.filter((item) => {
      if (effectiveSelectedAgent !== "all" && !isSameAgent(item.agent, effectiveSelectedAgent)) return false;
      if (selectedMonth !== "all" && item.monthKey !== selectedMonth) return false;
      if (selectedWeek !== "all" && item.weekLabel !== selectedWeek) return false;
      if (selectedYear !== "all" && item.yearKey !== selectedYear) return false;
      return true;
    });
  }, [allCases, effectiveSelectedAgent, selectedMonth, selectedWeek, selectedYear]);

  const summaryCards = useMemo(() => summarizeCases(filteredCases), [filteredCases]);
  const topicSummary = useMemo(() => buildTopicSummary(filteredCases), [filteredCases]);

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

  const caseListForView = useMemo(() => [...filteredCases].sort((a, b) => (a.auditDateObj?.getTime() || 0) - (b.auditDateObj?.getTime() || 0)), [filteredCases]);

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

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-100"><div className="rounded-3xl border border-violet-200 bg-white px-6 py-5 text-slate-700 shadow-sm">กำลังโหลด Summary Dashboard...</div></div>;
  }

  if (loadError) {
    return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff] p-6"><div className="max-w-xl rounded-3xl border border-rose-200 bg-white px-6 py-5 text-rose-700 shadow-sm"><div className="text-lg font-semibold">โหลดไฟล์ไม่สำเร็จ</div><div className="mt-2 text-sm">{loadError}</div></div></div>;
  }

  return (
    <div className={`relative min-h-screen ${songkranTheme ? "bg-gradient-to-br from-cyan-50 via-sky-50 to-fuchsia-50" : "bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff]"}`}>
      {songkranTheme ? <SongkranBackdrop /> : null}
      <div className={`relative text-white shadow-[0_16px_40px_rgba(76,29,149,0.22)] ${songkranTheme ? "bg-gradient-to-r from-sky-700 via-cyan-600 to-fuchsia-700" : "bg-gradient-to-r from-violet-950 via-violet-900 to-fuchsia-700"}`}>
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

      <div className="mx-auto max-w-[1720px] px-6 py-6 lg:px-8 lg:py-8">
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel className="sticky top-4">
              <PanelHeader title="Summary Controls" subtitle="Select summary type and filter scope" />
              <PanelBody className="space-y-5">
                <div className="space-y-2">
                  <ViewButton active={viewMode === "weekly-dashboard"} label="Weekly Dashboard" onClick={() => setViewMode("weekly-dashboard")} />
                  {currentUser?.role !== "Agent" ? (
                    <ViewButton active={viewMode === "weekly-qa-by-agent"} label="Weekly QA by Agent" onClick={() => setViewMode("weekly-qa-by-agent")} />
                  ) : null}
                  <ViewButton active={viewMode === "monthly-dashboard"} label="Monthly Dashboard" onClick={() => setViewMode("monthly-dashboard")} />
                  <ViewButton active={viewMode === "monthly-team-summary"} label="Monthly Team Summary" onClick={() => setViewMode("monthly-team-summary")} />
                  <ViewButton active={viewMode === "yearly-team-summary"} label="Yearly Team Summary" onClick={() => setViewMode("yearly-team-summary")} />
                  <ViewButton active={viewMode === "yearly-by-agent"} label="Yearly by Agent" onClick={() => setViewMode("yearly-by-agent")} />
                </div>
                <div className="space-y-4">
                  <div>
                    <FilterLabel>Agent</FilterLabel>
                    <div className="mt-2"><FilterSelect value={effectiveSelectedAgent || "all"} onChange={(value) => { if (currentUser?.role === "Agent") return; setSelectedAgent(value); onSelectedAgentChange?.(value); }} options={[{ value: "all", label: "All Agents" }].concat(availableAgents.map((agent) => ({ value: agent, label: agent })))} /></div>
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

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Cases" value={`${summaryCards.caseCount}`} sub="Case(s) in current view" />
              <MetricCard title="Average Score" value={summaryCards.avgScore.toFixed(2)} sub="Average final score in current view" valueClassName="text-violet-700" />
              <MetricCard title="Grade" value={summaryCards.grade} sub="Calculated from current average score" valueClassName="text-sky-700" accent="from-white via-sky-50/50 to-indigo-100/60 border-sky-200" />
              <MetricCard title="Estimated Incentive" value={formatCurrencyTHB(summaryCards.incentive)} sub={summaryCards.caseCount >= CASE_TARGET ? "Monthly estimate" : "Need at least 10 cases"} valueClassName="text-fuchsia-700" accent="from-white via-fuchsia-50/50 to-violet-100/60 border-fuchsia-200" />
            </div>

            <Panel>
              <PanelHeader title="Summary Table" subtitle="Summary result based on current tab and filters" />
              <PanelBody><SummaryTable rows={summaryRows} firstColLabel={firstColLabel} /></PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Case List" subtitle="Example case list for current tab and selected filters" />
              <PanelBody><CaseListTable cases={caseListForView} /></PanelBody>
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
