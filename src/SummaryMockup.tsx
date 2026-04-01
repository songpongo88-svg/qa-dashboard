import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Grade = "A" | "B" | "C" | "D" | "F";
type ReviewStatus = "Original" | "Revised";

type SummaryTab =
  | "Weekly_Dashboard"
  | "Weekly_QA_by_Agent"
  | "Monthly_Dashboard"
  | "Monthly_Team_Summary"
  | "Yearly_Team_Summary"
  | "Yearly_By_Agent";

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
  auditYear: number | null;
  auditMonth: number | null;
  auditMonthLabel: string;
  weekLabel: string;
  caseId: string;
  inquiry: string;
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

type AgentRow = {
  agent: string;
  cases: number;
  avgScore: number;
  gradeDisplay: string;
  incentive: number;
  critical: number;
  status: string;
};

const CASE_TARGET = 10;

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

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
  "Arisa aiemrit",
  "Chatkonnaphat Bhusomya",
  "Jariyawadee Taboodda",
  "Jureeporn Piddum",
  "Krivut Vongkampan",
  "Natcha Chai-in",
  "Nattapol Suprom",
  "Sunijtra Siritip",
  "Supakrit Promkhamnoi",
  "Suphitcha Keawliam",
  "Wachiraporn chailittichai",
  "Wassana Phothong",
].sort((a, b) => a.localeCompare(b));

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

function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function getGradeDisplay(caseCount: number, avgScore: number) {
  if (caseCount === 0) return "F";
  if (caseCount < CASE_TARGET) return "Pending";
  return scoreToGrade(avgScore);
}

function getGradeStatus(gradeDisplay: string) {
  switch (gradeDisplay) {
    case "A":
      return "Excellent";
    case "B":
      return "Good";
    case "C":
      return "Fair";
    case "D":
      return "Improvement Required";
    case "F":
      return "Fail";
    default:
      return "Pending";
  }
}

function gradeTone(gradeDisplay: string) {
  switch (gradeDisplay) {
    case "A":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "B":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "C":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "D":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "F":
      return "border-rose-200 bg-rose-50 text-rose-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getIncentiveValue(caseCount: number, avg: number) {
  if (caseCount < CASE_TARGET) return 0;
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

function getBestTopicLabel(topicSummary: TopicSummary[]) {
  const best = [...topicSummary].sort((a, b) => b.pct - a.pct)[0];
  return best ? best.label : "-";
}

function getLowestTopicLabel(topicSummary: TopicSummary[]) {
  const lowest = [...topicSummary].sort((a, b) => a.pct - b.pct)[0];
  return lowest ? lowest.label : "-";
}

function buildAgentRanking(cases: CaseItem[]): AgentRow[] {
  const grouped = new Map<string, CaseItem[]>();

  cases.forEach((item) => {
    if (!grouped.has(item.agent)) grouped.set(item.agent, []);
    grouped.get(item.agent)!.push(item);
  });

  return [...grouped.entries()]
    .map(([agent, items]) => {
      const avg = items.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(items.length, 1);
      const gradeDisplay = getGradeDisplay(items.length, avg);

      return {
        agent,
        cases: items.length,
        avgScore: Number(avg.toFixed(2)),
        gradeDisplay,
        incentive: getIncentiveValue(items.length, avg),
        critical: 0,
        status:
          items.length === 0
            ? "No reviewed cases"
            : items.length < CASE_TARGET
            ? "Need 10 cases"
            : "Ready",
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);
}

function formatMonthValue(selectedMonth: string) {
  if (selectedMonth === "all") return "All Months";
  return MONTH_LABELS[Number(selectedMonth) - 1] || "All Months";
}

function formatYearValue(selectedYear: string) {
  return selectedYear === "all" ? "All Years" : selectedYear;
}

function Section({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-violet-200/80 bg-white shadow-[0_12px_30px_rgba(76,29,149,0.08)]">
      <div className="h-1.5 bg-gradient-to-r from-violet-900 via-violet-700 to-fuchsia-500" />
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-5 py-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[18px] font-bold tracking-tight text-slate-900">{title}</div>
            {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
          </div>
          {right}
        </div>
      </div>
      <div className="p-5 lg:p-6">{children}</div>
    </div>
  );
}

function SummaryHero() {
  return (
    <div className="overflow-hidden rounded-[34px] border border-violet-200/80 bg-gradient-to-r from-violet-950 via-violet-900 to-fuchsia-700 text-white shadow-[0_20px_54px_rgba(76,29,149,0.18)]">
      <div className="flex flex-col gap-6 px-6 py-7 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200">
            Robinhood QA
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl">
            Executive Summary Workspace
          </div>
          <div className="mt-3 max-w-3xl text-sm leading-6 text-violet-100/90">
            Weekly, Monthly, and Yearly summary views in enterprise reporting format.
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-[28px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/20 bg-white/12 shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
            <img
              src="/robinhood-logo.png"
              alt="Robinhood Logo"
              className="h-16 w-16 object-contain"
            />
          </div>
          <div className="hidden sm:block">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200">
              Corporate Summary
            </div>
            <div className="mt-1 text-lg font-semibold text-white">Power BI Style Workspace</div>
            <div className="mt-1 text-sm text-violet-100/90">
              Weekly Dashboard · Monthly Team Summary · Yearly By Agent
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "border-violet-400 bg-violet-100 text-violet-800 shadow-sm"
          : "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50"
      }`}
    >
      {label}
    </button>
  );
}

function CurrentViewCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        tone === "good"
          ? "border-emerald-200 bg-emerald-50"
          : tone === "bad"
          ? "border-rose-200 bg-rose-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-2 text-base font-bold ${
          tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
  tone = "violet",
}: {
  title: string;
  value: string;
  sub?: string;
  tone?: "violet" | "emerald" | "amber" | "sky" | "rose" | "slate";
}) {
  const toneMap = {
    violet: "from-white via-violet-50/50 to-fuchsia-50/60 border-violet-200/80",
    emerald: "from-emerald-50 via-white to-emerald-100/60 border-emerald-200",
    amber: "from-amber-50 via-white to-amber-100/60 border-amber-200",
    sky: "from-sky-50 via-white to-sky-100/60 border-sky-200",
    rose: "from-rose-50 via-white to-rose-100/60 border-rose-200",
    slate: "from-slate-50 via-white to-slate-100 border-slate-200",
  };

  return (
    <div className={`rounded-[24px] border bg-gradient-to-br p-5 shadow-sm ${toneMap[tone]}`}>
      <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-3 text-[34px] font-extrabold tracking-tight text-slate-900">{value}</div>
      {sub ? <div className="mt-2 text-xs leading-5 text-slate-500">{sub}</div> : null}
    </div>
  );
}

function RankingTable({ items }: { items: AgentRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[900px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-3 py-3 text-center">Seq</th>
            <th className="px-3 py-3 text-left">Agent</th>
            <th className="px-3 py-3 text-center">Cases</th>
            <th className="px-3 py-3 text-center">Avg Score</th>
            <th className="px-3 py-3 text-center">Grade</th>
            <th className="px-3 py-3 text-center">Incentive</th>
            <th className="px-3 py-3 text-center">Critical</th>
            <th className="px-3 py-3 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.agent}-${index}`} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 text-center">{index + 1}</td>
              <td className="border-t border-slate-200 px-3 py-3 font-medium text-slate-900">{item.agent}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{item.cases}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{item.avgScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(item.gradeDisplay)}`}>
                  {item.gradeDisplay}
                </span>
              </td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{item.incentive}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{item.critical}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center text-slate-600">{item.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopicPerformanceTable({ items }: { items: TopicSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[760px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-3 py-3 text-left">Topic</th>
            <th className="px-3 py-3 text-left">Description</th>
            <th className="px-3 py-3 text-center">Avg Score</th>
            <th className="px-3 py-3 text-center">Max</th>
            <th className="px-3 py-3 text-center">Performance %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.code} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 font-semibold text-slate-900">{entry.code}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-slate-700">{entry.label}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.avgScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.max}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.pct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CaseListTable({ items }: { items: CaseItem[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[980px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-3 py-3 text-center">Seq</th>
            <th className="px-3 py-3 text-center">Audit Date</th>
            <th className="px-3 py-3 text-left">Case ID</th>
            <th className="px-3 py-3 text-left">Inquiry</th>
            <th className="px-3 py-3 text-center">Final Score</th>
            <th className="px-3 py-3 text-center">Grade</th>
            <th className="px-3 py-3 text-center">Review</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.key} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 text-center">{index + 1}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{item.auditDate}</td>
              <td className="border-t border-slate-200 px-3 py-3 font-medium text-slate-900">{item.caseId}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-slate-700">{item.inquiry || "-"}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{item.finalScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${gradeTone(item.grade)}`}>
                  {item.grade}
                </span>
              </td>
              <td className="border-t border-slate-200 px-3 py-3 text-center text-slate-600">{item.reviewStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendTable({
  rows,
  labelTitle = "Period",
}: {
  rows: { label: string; cases: number; avgScore: number; status?: string }[];
  labelTitle?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[560px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-3 py-3 text-left">{labelTitle}</th>
            <th className="px-3 py-3 text-center">Cases</th>
            <th className="px-3 py-3 text-center">Avg Score</th>
            <th className="px-3 py-3 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 font-medium text-slate-800">{row.label}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.cases}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.avgScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center text-slate-600">{row.status || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SimpleBarChart({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle?: string;
  data: { label: string; value: number }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="rounded-[24px] border border-violet-200/80 bg-white p-5 shadow-sm">
      <div className="text-base font-bold tracking-tight text-slate-900">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}

      <div className="mt-5 space-y-4">
        {data.map((item) => {
          const pct = Math.max((item.value / max) * 100, 2);

          return (
            <div key={item.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-700">{item.label}</span>
                <span className="font-bold text-slate-900">{item.value.toFixed(2)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SimpleDonutLegend({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: { label: string; value: number; tone: string }[];
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="rounded-[24px] border border-violet-200/80 bg-white p-5 shadow-sm">
      <div className="text-base font-bold tracking-tight text-slate-900">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}

      <div className="mt-5 space-y-3">
        {items.map((item) => {
          const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
          return (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`h-3.5 w-3.5 rounded-full ${item.tone}`} />
                  <span className="text-sm font-semibold text-slate-800">{item.label}</span>
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {item.value} <span className="text-slate-400">({pct}%)</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SummaryMockup({ currentUser }: { currentUser: any }) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const isAgentRole = currentUser?.role === "Agent";

  const [activeTab, setActiveTab] = useState<SummaryTab>(
    isAgentRole ? "Weekly_QA_by_Agent" : "Weekly_Dashboard"
  );

  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedAgent, setSelectedAgent] = useState<string>(
    isAgentRole && currentUser?.agentName ? currentUser.agentName : "all"
  );

  useEffect(() => {
    if (isAgentRole && currentUser?.agentName) {
      setSelectedAgent(currentUser.agentName);

      if (
        activeTab === "Weekly_Dashboard" ||
        activeTab === "Monthly_Team_Summary" ||
        activeTab === "Yearly_Team_Summary"
      ) {
        setActiveTab("Weekly_QA_by_Agent");
      }
    }
  }, [isAgentRole, currentUser, activeTab]);

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
            const rawAuditDate = rawHelper.getValue(row, "Audit Date");
            const auditDateObj = excelDateToJSDate(rawAuditDate);
            const auditYear = auditDateObj ? auditDateObj.getFullYear() : null;
            const auditMonth = auditDateObj ? auditDateObj.getMonth() + 1 : null;
            const auditMonthLabel =
              auditMonth && auditMonth >= 1 && auditMonth <= 12 ? MONTH_LABELS[auditMonth - 1] : "-";

            const baseFinalScore =
              Number(rawHelper.getValue(row, "Final Score")) ||
              topics.reduce((sum, topic) => sum + topic.score, 0);

            const finalScoreVal =
              mergedAppeal?.finalScore ??
              (mergedAppeal?.revisedTopics?.length
                ? calcMergedFinalScore(topics, mergedAppeal.revisedTopics)
                : baseFinalScore);

            const previousScoreVal = mergedAppeal?.previousScore ?? baseFinalScore;

            const weekLabel =
              rawHelper.getValue(row, "Week Label") ??
              rawHelper.getValue(row, "Week") ??
              "-";

            const inquiry =
              rawHelper.getValue(row, "Customer Inquiry") ??
              rawHelper.getValue(row, "Inquiry TH") ??
              rawHelper.getValue(row, "Inquiry") ??
              "-";

            const reviewStatus: ReviewStatus =
              mergedAppeal?.displayRevisedTopicCodes?.length ? "Revised" : "Original";

            return {
              key: `row-${index + 1}-${caseId}`,
              agent: String(rawHelper.getValue(row, "Agent Name")).trim(),
              auditDate: formatAuditDate(rawAuditDate),
              auditDateObj,
              auditYear,
              auditMonth,
              auditMonthLabel,
              weekLabel: String(weekLabel || "-").trim(),
              caseId,
              inquiry: String(inquiry || "-").trim(),
              finalScore: finalScoreVal,
              previousScore: previousScoreVal,
              grade: scoreToGrade(finalScoreVal),
              reviewStatus,
              topics,
              revisedTopics: mergedAppeal?.revisedTopics?.length ? mergedAppeal.revisedTopics : null,
              displayRevisedTopicCodes: mergedAppeal?.displayRevisedTopicCodes || [],
            };
          });

        const cleaned = mapped.filter((item) => item.agent && item.caseId && item.auditDate);
        setAllCases(cleaned);
      } catch (error: any) {
        setLoadError(error?.message || "โหลดไฟล์ Excel ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);

  const agentOptions = useMemo(() => {
    const fromCases = allCases.map((item) => item.agent).filter(Boolean);
    const merged = [...new Set([...AGENT_MASTER, ...fromCases])].sort((a, b) => a.localeCompare(b));
    if (isAgentRole && currentUser?.agentName) {
      return merged.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }
    return merged;
  }, [allCases, currentUser, isAgentRole]);

  const yearOptions = useMemo(() => {
    return [...new Set(allCases.map((item) => item.auditYear).filter(Boolean) as number[])].sort(
      (a, b) => b - a
    );
  }, [allCases]);

  const weekOptions = useMemo(() => {
    const base = allCases.filter((item) => {
      if (selectedYear !== "all" && String(item.auditYear || "") !== selectedYear) return false;
      if (selectedMonth !== "all" && String(item.auditMonth || "") !== selectedMonth) return false;
      return true;
    });
    return [...new Set(base.map((item) => item.weekLabel).filter(Boolean))];
  }, [allCases, selectedYear, selectedMonth]);

  const effectiveAgentName =
    isAgentRole && currentUser?.agentName
      ? String(currentUser.agentName).trim()
      : selectedAgent !== "all"
      ? selectedAgent
      : "";

  const teamBaseCases = useMemo(() => {
    let items = [...allCases];

    if (selectedYear !== "all") {
      items = items.filter((item) => String(item.auditYear || "") === selectedYear);
    }
    if (selectedMonth !== "all") {
      items = items.filter((item) => String(item.auditMonth || "") === selectedMonth);
    }
    if (selectedWeek !== "all") {
      items = items.filter((item) => item.weekLabel === selectedWeek);
    }

    return items;
  }, [allCases, selectedYear, selectedMonth, selectedWeek]);

  const agentBaseCases = useMemo(() => {
    let items = [...allCases];

    if (effectiveAgentName) {
      items = items.filter((item) => isSameAgent(item.agent, effectiveAgentName));
    } else {
      items = [];
    }

    if (selectedYear !== "all") {
      items = items.filter((item) => String(item.auditYear || "") === selectedYear);
    }
    if (selectedMonth !== "all") {
      items = items.filter((item) => String(item.auditMonth || "") === selectedMonth);
    }
    if (selectedWeek !== "all") {
      items = items.filter((item) => item.weekLabel === selectedWeek);
    }

    return items;
  }, [allCases, effectiveAgentName, selectedYear, selectedMonth, selectedWeek]);

  const teamTopicSummary = useMemo(() => buildTopicSummary(teamBaseCases), [teamBaseCases]);
  const agentTopicSummary = useMemo(() => buildTopicSummary(agentBaseCases), [agentBaseCases]);

  const teamAvg =
    teamBaseCases.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(teamBaseCases.length, 1);

  const agentAvg =
    agentBaseCases.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(agentBaseCases.length, 1);

  const teamRanking = useMemo(() => buildAgentRanking(teamBaseCases), [teamBaseCases]);

  const monthlyTeamTrend = useMemo(() => {
    const base = allCases.filter((item) => {
      if (selectedYear !== "all" && String(item.auditYear || "") !== selectedYear) return false;
      return true;
    });

    return MONTH_LABELS.map((month, idx) => {
      const monthItems = base.filter((item) => item.auditMonth === idx + 1);
      const avg =
        monthItems.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(monthItems.length, 1);

      return {
        label: month,
        cases: monthItems.length,
        avgScore: Number(avg.toFixed(2)),
        status:
          monthItems.length === 0
            ? "Pending"
            : monthItems.length < CASE_TARGET
            ? "Pending 10 cases"
            : scoreToGrade(avg),
      };
    });
  }, [allCases, selectedYear]);

  const yearlyAgentTrend = useMemo(() => {
    return MONTH_LABELS.map((month, idx) => {
      const monthItems = allCases.filter((item) => {
        if (!effectiveAgentName) return false;
        if (!isSameAgent(item.agent, effectiveAgentName)) return false;
        if (selectedYear !== "all" && String(item.auditYear || "") !== selectedYear) return false;
        return item.auditMonth === idx + 1;
      });

      const avg =
        monthItems.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(monthItems.length, 1);

      return {
        label: month,
        cases: monthItems.length,
        avgScore: Number(avg.toFixed(2)),
        status:
          monthItems.length === 0
            ? "Pending"
            : monthItems.length < CASE_TARGET
            ? "Pending 10 cases"
            : scoreToGrade(avg),
      };
    });
  }, [allCases, effectiveAgentName, selectedYear]);

  const topAgentByYear = useMemo(() => teamRanking[0]?.agent || "-", [teamRanking]);

  const bottomAgentByYear = useMemo(() => {
    const sorted = [...teamRanking].sort((a, b) => a.avgScore - b.avgScore);
    return sorted[0]?.agent || "-";
  }, [teamRanking]);

  const isMonthlyDashboardTeamView = !isAgentRole && selectedAgent === "all";

  const monthlyTeamCases = useMemo(() => {
    let items = [...allCases];

    if (selectedYear !== "all") {
      items = items.filter((item) => String(item.auditYear || "") === selectedYear);
    }

    if (selectedMonth !== "all") {
      items = items.filter((item) => String(item.auditMonth || "") === selectedMonth);
    }

    return items;
  }, [allCases, selectedYear, selectedMonth]);

  const monthlyTeamAvg =
    monthlyTeamCases.reduce((sum, item) => sum + item.finalScore, 0) /
    Math.max(monthlyTeamCases.length, 1);

  const monthlyTeamTopicSummary = useMemo(
    () => buildTopicSummary(monthlyTeamCases),
    [monthlyTeamCases]
  );

  const monthlyTeamRanking = useMemo(
    () => buildAgentRanking(monthlyTeamCases),
    [monthlyTeamCases]
  );

  const monthlyTop5Agents = useMemo(() => {
    return monthlyTeamRanking.slice(0, 5).map((item) => ({
      label: item.agent,
      value: item.avgScore,
    }));
  }, [monthlyTeamRanking]);

  const monthlyGradeDistribution = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, D: 0, F: 0, Pending: 0 } as Record<string, number>;

    monthlyTeamRanking.forEach((item) => {
      counts[item.gradeDisplay] = (counts[item.gradeDisplay] || 0) + 1;
    });

    return [
      { label: "A", value: counts.A, tone: "bg-emerald-500" },
      { label: "B", value: counts.B, tone: "bg-sky-500" },
      { label: "C", value: counts.C, tone: "bg-amber-500" },
      { label: "D", value: counts.D, tone: "bg-orange-500" },
      { label: "F", value: counts.F, tone: "bg-rose-500" },
      { label: "Pending", value: counts.Pending, tone: "bg-slate-400" },
    ];
  }, [monthlyTeamRanking]);

  const monthlyAverageTrend = useMemo(() => {
    const base = allCases.filter((item) => {
      if (selectedYear !== "all" && String(item.auditYear || "") !== selectedYear) return false;
      return true;
    });

    return MONTH_LABELS.map((month, idx) => {
      const monthItems = base.filter((item) => item.auditMonth === idx + 1);
      const avg =
        monthItems.reduce((sum, item) => sum + item.finalScore, 0) /
        Math.max(monthItems.length, 1);

      return {
        label: month.slice(0, 3),
        value: Number(avg.toFixed(2)),
      };
    }).filter((item) => item.value > 0);
  }, [allCases, selectedYear]);

  const visibleTabs: { key: SummaryTab; label: string }[] = isAgentRole
    ? [
        { key: "Weekly_QA_by_Agent", label: "Weekly QA by Agent" },
        { key: "Monthly_Dashboard", label: "Monthly Dashboard" },
        { key: "Yearly_By_Agent", label: "Yearly By Agent" },
      ]
    : [
        { key: "Weekly_Dashboard", label: "Weekly Dashboard" },
        { key: "Weekly_QA_by_Agent", label: "Weekly QA by Agent" },
        { key: "Monthly_Dashboard", label: "Monthly Dashboard" },
        { key: "Monthly_Team_Summary", label: "Monthly Team Summary" },
        { key: "Yearly_Team_Summary", label: "Yearly Team Summary" },
        { key: "Yearly_By_Agent", label: "Yearly By Agent" },
      ];

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-3xl border border-violet-200 bg-white px-6 py-5 text-slate-700 shadow-sm">
          กำลังโหลด Summary...
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
    <div className="min-h-screen bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff]">
      <div className="mx-auto max-w-[1720px] px-6 py-6 lg:px-8 lg:py-8">
        <div className="space-y-6">
          <SummaryHero />

          <Section
            title="Summary Navigation"
            subtitle="Select summary view and reporting scope"
            right={
              <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                {isAgentRole ? "Agent Restricted View" : "Management View"}
              </span>
            }
          >
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {visibleTabs.map((tab) => (
                  <TabButton
                    key={tab.key}
                    label={tab.label}
                    active={activeTab === tab.key}
                    onClick={() => setActiveTab(tab.key)}
                  />
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Year</div>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  >
                    <option value="all">All Years</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Month</div>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  >
                    <option value="all">All Months</option>
                    {MONTH_LABELS.map((month, index) => (
                      <option key={month} value={String(index + 1)}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Week</div>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
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
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Agent</div>
                  {isAgentRole ? (
                    <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
                      {currentUser?.agentName || "-"}
                    </div>
                  ) : (
                    <select
                      value={selectedAgent}
                      onChange={(e) => setSelectedAgent(e.target.value)}
                      className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    >
                      <option value="all">All Agents</option>
                      {agentOptions.map((agent) => (
                        <option key={agent} value={agent}>
                          {agent}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          </Section>

          {activeTab === "Weekly_Dashboard" && !isAgentRole && (
            <>
              <Section title="Weekly Dashboard" subtitle="Selected week overview for the whole team">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <CurrentViewCard label="Week" value={selectedWeek === "all" ? "All Weeks" : selectedWeek} />
                  <CurrentViewCard label="Month" value={formatMonthValue(selectedMonth)} />
                  <CurrentViewCard label="Team Cases" value={teamBaseCases.length} />
                  <CurrentViewCard label="Avg Score" value={teamAvg.toFixed(2)} />
                  <CurrentViewCard label="Critical Cases" value={0} />
                  <CurrentViewCard label="Best Topic" value={getBestTopicLabel(teamTopicSummary)} tone="good" />
                  <CurrentViewCard label="Lowest Topic" value={getLowestTopicLabel(teamTopicSummary)} tone="bad" />
                </div>
              </Section>

              <Section title="Agent Weekly Ranking" subtitle="Weekly team ranking for selected view">
                <RankingTable items={teamRanking} />
              </Section>

              <Section title="Topic Performance % - Team Weekly" subtitle="Weekly topic performance summary">
                <TopicPerformanceTable items={[...teamTopicSummary].sort((a, b) => b.pct - a.pct)} />
              </Section>
            </>
          )}

          {activeTab === "Weekly_QA_by_Agent" && (
            <>
              <Section title="Weekly QA by Agent" subtitle="Selected weekly summary for one agent">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <CurrentViewCard label="Agent" value={effectiveAgentName || "-"} />
                  <CurrentViewCard label="Week" value={selectedWeek === "all" ? "All Weeks" : selectedWeek} />
                  <CurrentViewCard label="Weekly Cases" value={agentBaseCases.length} />
                  <CurrentViewCard label="Critical Cases" value={0} />
                  <CurrentViewCard label="Average Score" value={agentAvg.toFixed(2)} />
                  <CurrentViewCard label="Best Topic" value={getBestTopicLabel(agentTopicSummary)} tone="good" />
                  <CurrentViewCard label="Improve Topic" value={getLowestTopicLabel(agentTopicSummary)} tone="bad" />
                </div>
              </Section>

              <Section title="Weekly Case List" subtitle="Case list in selected weekly agent view">
                <CaseListTable items={agentBaseCases} />
              </Section>
            </>
          )}

          {activeTab === "Monthly_Dashboard" && (
            <>
              {isMonthlyDashboardTeamView ? (
                <>
                  <Section
                    title="Monthly Dashboard"
                    subtitle="Team monthly dashboard when All Agents is selected"
                  >
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                      <KpiCard
                        title="Team Cases"
                        value={String(monthlyTeamCases.length)}
                        sub="Reviewed cases in selected month"
                        tone="sky"
                      />
                      <KpiCard
                        title="Average Score"
                        value={monthlyTeamAvg.toFixed(2)}
                        sub="Monthly team average"
                        tone="violet"
                      />
                      <KpiCard
                        title="Best Topic"
                        value={getBestTopicLabel(monthlyTeamTopicSummary)}
                        sub="Strongest team topic"
                        tone="emerald"
                      />
                      <KpiCard
                        title="Lowest Topic"
                        value={getLowestTopicLabel(monthlyTeamTopicSummary)}
                        sub="Main coaching topic"
                        tone="rose"
                      />
                      <KpiCard
                        title="Top Agent"
                        value={monthlyTeamRanking[0]?.agent || "-"}
                        sub="Highest monthly average"
                        tone="emerald"
                      />
                      <KpiCard
                        title="Agent Count"
                        value={String(monthlyTeamRanking.length)}
                        sub="Agents in selected month"
                        tone="slate"
                      />
                    </div>
                  </Section>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <SimpleBarChart
                      title="Top 5 Agents by Average Score"
                      subtitle="Highest performers in selected month"
                      data={monthlyTop5Agents}
                    />

                    <SimpleDonutLegend
                      title="Grade Distribution"
                      subtitle="Monthly grade mix across agents"
                      items={monthlyGradeDistribution}
                    />
                  </div>

                  <Section
                    title="Monthly Average Score Trend"
                    subtitle="Average score by month in selected year"
                  >
                    <SimpleBarChart
                      title="Monthly Team Trend"
                      subtitle="Trend across available months"
                      data={monthlyAverageTrend}
                    />
                  </Section>

                  <Section
                    title="Agent Monthly Ranking"
                    subtitle="Monthly ranking across the team"
                  >
                    <RankingTable items={monthlyTeamRanking} />
                  </Section>

                  <Section
                    title="Topic Performance % - Team Monthly"
                    subtitle="Monthly topic performance for the whole team"
                  >
                    <TopicPerformanceTable
                      items={[...monthlyTeamTopicSummary].sort((a, b) => b.pct - a.pct)}
                    />
                  </Section>
                </>
              ) : (
                <>
                  <Section title="Monthly Dashboard" subtitle="Monthly dashboard for selected agent">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                      <KpiCard
                        title="Reviewed Cases"
                        value={String(agentBaseCases.length)}
                        sub="Reviewed in selected month"
                        tone="sky"
                      />
                      <KpiCard
                        title="Need More to 10"
                        value={String(Math.max(CASE_TARGET - agentBaseCases.length, 0))}
                        sub="Required before final grade"
                        tone={agentBaseCases.length >= CASE_TARGET ? "emerald" : "amber"}
                      />
                      <KpiCard
                        title="Average Score"
                        value={agentAvg.toFixed(2)}
                        sub="Average monthly score"
                        tone="violet"
                      />
                      <KpiCard
                        title="Monthly Grade"
                        value={getGradeDisplay(agentBaseCases.length, agentAvg)}
                        sub={getGradeStatus(getGradeDisplay(agentBaseCases.length, agentAvg))}
                        tone={
                          getGradeDisplay(agentBaseCases.length, agentAvg) === "A"
                            ? "emerald"
                            : getGradeDisplay(agentBaseCases.length, agentAvg) === "B"
                            ? "sky"
                            : getGradeDisplay(agentBaseCases.length, agentAvg) === "C"
                            ? "amber"
                            : getGradeDisplay(agentBaseCases.length, agentAvg) === "Pending"
                            ? "slate"
                            : "rose"
                        }
                      />
                      <KpiCard
                        title="Incentive (THB)"
                        value={String(getIncentiveValue(agentBaseCases.length, agentAvg))}
                        sub="Monthly incentive estimate"
                        tone="amber"
                      />
                      <KpiCard
                        title="Best Topic"
                        value={getBestTopicLabel(agentTopicSummary)}
                        sub="Strongest topic"
                        tone="emerald"
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <CurrentViewCard label="Agent" value={effectiveAgentName || "-"} />
                      <CurrentViewCard
                        label="Lowest Topic"
                        value={getLowestTopicLabel(agentTopicSummary)}
                        tone="bad"
                      />
                    </div>
                  </Section>

                  <Section title="Monthly Case List" subtitle="Case list in selected monthly agent view">
                    <CaseListTable items={agentBaseCases} />
                  </Section>
                </>
              )}
            </>
          )}

          {activeTab === "Monthly_Team_Summary" && !isAgentRole && (
            <>
              <Section title="Monthly Team Summary" subtitle="Selected month overview for the whole team">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <CurrentViewCard label="Month" value={formatMonthValue(selectedMonth)} />
                  <CurrentViewCard label="Year" value={formatYearValue(selectedYear)} />
                  <CurrentViewCard label="Team Cases" value={teamBaseCases.length} />
                  <CurrentViewCard label="Avg Score" value={teamAvg.toFixed(2)} />
                  <CurrentViewCard label="Critical Cases" value={0} />
                  <CurrentViewCard label="Best Topic" value={getBestTopicLabel(teamTopicSummary)} tone="good" />
                  <CurrentViewCard label="Lowest Topic" value={getLowestTopicLabel(teamTopicSummary)} tone="bad" />
                </div>
              </Section>

              <Section title="Agent Monthly Ranking" subtitle="Monthly ranking for selected team scope">
                <RankingTable items={teamRanking} />
              </Section>

              <Section title="Topic Performance % - Team Monthly" subtitle="Monthly topic performance summary">
                <TopicPerformanceTable items={[...teamTopicSummary].sort((a, b) => b.pct - a.pct)} />
              </Section>
            </>
          )}

          {activeTab === "Yearly_Team_Summary" && !isAgentRole && (
            <>
              <Section title="Yearly Team Summary" subtitle="Yearly overview for the whole team">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <CurrentViewCard label="Year" value={formatYearValue(selectedYear)} />
                  <CurrentViewCard label="Team Cases" value={teamBaseCases.length} />
                  <CurrentViewCard label="Avg Score" value={teamAvg.toFixed(2)} />
                  <CurrentViewCard label="Critical Cases" value={0} />
                </div>
              </Section>

              <Section title="Monthly Team Trend" subtitle="Monthly trend inside selected year">
                <TrendTable rows={monthlyTeamTrend} labelTitle="Month" />
              </Section>

              <Section title="Top / Bottom Agent by Year" subtitle="Best and lowest yearly average score">
                <div className="grid gap-4 md:grid-cols-2">
                  <CurrentViewCard label="Top Avg Score Agent" value={topAgentByYear} tone="good" />
                  <CurrentViewCard label="Bottom Avg Score Agent" value={bottomAgentByYear} tone="bad" />
                </div>
              </Section>

              <Section title="Yearly Team Ranking" subtitle="Yearly ranking table">
                <RankingTable items={teamRanking} />
              </Section>
            </>
          )}

          {activeTab === "Yearly_By_Agent" && (
            <>
              <Section title="Yearly By Agent" subtitle="Yearly trend for selected agent">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <CurrentViewCard label="Agent" value={effectiveAgentName || "-"} />
                  <CurrentViewCard label="Year" value={formatYearValue(selectedYear)} />
                  <CurrentViewCard label="Cases" value={agentBaseCases.length} />
                  <CurrentViewCard label="Avg Score" value={agentAvg.toFixed(2)} />
                  <CurrentViewCard label="Critical Cases" value={0} />
                </div>
              </Section>

              <Section title="Monthly Trend" subtitle="Monthly trend within selected year for one agent">
                <TrendTable rows={yearlyAgentTrend} labelTitle="Month" />
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}