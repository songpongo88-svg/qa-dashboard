import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Grade = "A" | "B" | "C" | "D" | "F";
type ReviewStatus = "Original" | "Revised";
type PeriodType = "weekly" | "monthly" | "yearly";
type ScopeType = "team" | "agent";

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

type AgentSummary = {
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
  "Songpon Phothong",
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

function gradeStatus(gradeDisplay: string) {
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

function formatCurrencyTHB(value: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(value);
}

function getIncentiveValue(caseCount: number, avg: number) {
  if (caseCount < CASE_TARGET) return 0;
  if (avg >= 90) return 1000;
  if (avg >= 80) return 700;
  if (avg >= 70) return 300;
  return 0;
}

function getMonthlyGradeDisplay(caseCount: number, avgScore: number) {
  if (caseCount === 0) return "F";
  if (caseCount < CASE_TARGET) return "Pending";
  return scoreToGrade(avgScore);
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

function groupByAgent(cases: CaseItem[]): AgentSummary[] {
  const map = new Map<string, CaseItem[]>();

  cases.forEach((item) => {
    if (!map.has(item.agent)) map.set(item.agent, []);
    map.get(item.agent)!.push(item);
  });

  return [...map.entries()]
    .map(([agent, items]) => {
      const avg = items.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(items.length, 1);
      const gradeDisplay = getMonthlyGradeDisplay(items.length, avg);

      return {
        agent,
        cases: items.length,
        avgScore: Number(avg.toFixed(2)),
        gradeDisplay,
        incentive: getIncentiveValue(items.length, avg),
        critical: 0,
        status:
          items.length >= CASE_TARGET ? "Ready" : items.length === 0 ? "No reviewed cases" : "Need 10 cases",
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);
}

function SectionCard({
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
    <div className="overflow-hidden rounded-[30px] border border-violet-200/80 bg-white shadow-[0_14px_34px_rgba(76,29,149,0.08)]">
      <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-6 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[20px] font-bold tracking-tight text-slate-900">{title}</div>
            {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
          </div>
          {right}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function PillButton({
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
          ? "border-violet-400 bg-violet-100 text-violet-800"
          : "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50"
      }`}
    >
      {label}
    </button>
  );
}

function KpiCard({
  title,
  value,
  badge,
  sub,
  tone = "violet",
}: {
  title: string;
  value: string;
  badge?: string;
  sub?: string;
  tone?: "violet" | "emerald" | "sky" | "amber" | "rose" | "slate";
}) {
  const toneMap = {
    violet: "border-violet-200/80 from-white via-violet-50/45 to-fuchsia-50/55",
    emerald: "border-emerald-200 from-emerald-50 via-white to-emerald-100/65",
    sky: "border-sky-200 from-sky-50 via-white to-indigo-100/55",
    amber: "border-amber-200 from-amber-50 via-white to-amber-100/65",
    rose: "border-rose-200 from-rose-50 via-white to-rose-100/65",
    slate: "border-slate-200 from-slate-50 via-white to-slate-100",
  };

  const badgeToneMap = {
    violet: "border-violet-200 bg-violet-100 text-violet-700",
    emerald: "border-emerald-200 bg-emerald-100 text-emerald-700",
    sky: "border-sky-200 bg-sky-100 text-sky-700",
    amber: "border-amber-200 bg-amber-100 text-amber-700",
    rose: "border-rose-200 bg-rose-100 text-rose-700",
    slate: "border-slate-200 bg-slate-100 text-slate-700",
  };

  return (
    <div className={`overflow-hidden rounded-[28px] border bg-gradient-to-br shadow-sm ${toneMap[tone]}`}>
      <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
      <div className="p-5">
        <div className="text-[13px] font-semibold tracking-wide text-slate-500">{title}</div>
        <div className="mt-3 text-[40px] font-extrabold leading-none tracking-tight text-slate-900">
          {value}
        </div>
        {badge ? (
          <div className="mt-3">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeToneMap[tone]}`}>
              {badge}
            </span>
          </div>
        ) : null}
        {sub ? <div className="mt-3 text-xs leading-5 text-slate-500">{sub}</div> : null}
      </div>
    </div>
  );
}

function KeyValueGrid({
  items,
}: {
  items: {
    label: string;
    value: string | number;
    valueClassName?: string;
  }[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {item.label}
          </div>
          <div className={`mt-2 text-base font-bold ${item.valueClassName || "text-slate-900"}`}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendMiniTable({
  rows,
  col1Label,
  col2Label,
  col3Label,
}: {
  rows: { label: string; cases: number; avg: number; status?: string }[];
  col1Label: string;
  col2Label: string;
  col3Label: string;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[520px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-3 py-3 text-left">{col1Label}</th>
            <th className="px-3 py-3 text-center">{col2Label}</th>
            <th className="px-3 py-3 text-center">{col3Label}</th>
            <th className="px-3 py-3 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 font-medium text-slate-800">
                {row.label}
              </td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.cases}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.avg.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center text-slate-600">
                {row.status || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankingTable({ items }: { items: AgentSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[860px] w-full text-sm">
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
            <tr key={item.agent} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 text-center">{index + 1}</td>
              <td className="border-t border-slate-200 px-3 py-3 font-medium text-slate-900">
                {item.agent}
              </td>
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
              <td className="border-t border-slate-200 px-3 py-3 font-semibold text-slate-900">
                {entry.code}
              </td>
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
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(item.grade)}`}>
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

function LogoHero() {
  return (
    <div className="overflow-hidden rounded-[34px] border border-violet-200/80 bg-gradient-to-r from-violet-950 via-violet-900 to-fuchsia-700 text-white shadow-[0_18px_48px_rgba(76,29,149,0.18)]">
      <div className="flex flex-col gap-6 px-6 py-7 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200">
            Robinhood QA
          </div>
          <div className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl">
            Executive Summary Workspace
          </div>
          <div className="mt-3 max-w-3xl text-sm leading-6 text-violet-100/90">
            Power BI inspired summary view for Weekly, Monthly, and Yearly performance tracking.
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-[28px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/20 bg-white/12 shadow-[0_12px_34px_rgba(0,0,0,0.18)] backdrop-blur-md">
            <img
              src="/robinhood-logo.png"
              alt="Robinhood Logo"
              className="h-16 w-16 object-contain"
            />
          </div>
          <div className="hidden sm:block">
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200">
              Quality Monitoring
            </div>
            <div className="mt-1 text-lg font-semibold text-white">Corporate Summary Dashboard</div>
            <div className="mt-1 text-sm text-violet-100/90">
              Weekly · Monthly · Yearly performance intelligence
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SummaryMockup({ currentUser }: { currentUser: any }) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const isAgentRole = currentUser?.role === "Agent";
  const [scope, setScope] = useState<ScopeType>(isAgentRole ? "agent" : "team");
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedAgent, setSelectedAgent] = useState<string>(
    isAgentRole && currentUser?.agentName ? currentUser.agentName : "all"
  );

  useEffect(() => {
    if (isAgentRole && currentUser?.agentName) {
      setScope("agent");
      setSelectedAgent(currentUser.agentName);
    }
  }, [isAgentRole, currentUser]);

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
    const agentsFromCases = allCases.map((item) => item.agent).filter(Boolean);
    const merged = [...new Set([...AGENT_MASTER, ...agentsFromCases])].sort((a, b) => a.localeCompare(b));
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

  const baseFilteredCases = useMemo(() => {
    let items = [...allCases];

    if (selectedYear !== "all") {
      items = items.filter((item) => String(item.auditYear || "") === selectedYear);
    }

    if (periodType !== "yearly" && selectedMonth !== "all") {
      items = items.filter((item) => String(item.auditMonth || "") === selectedMonth);
    }

    if (periodType === "weekly" && selectedWeek !== "all") {
      items = items.filter((item) => item.weekLabel === selectedWeek);
    }

    if (isAgentRole && currentUser?.agentName) {
      items = items.filter((item) => isSameAgent(item.agent, currentUser.agentName));
      return items;
    }

    if (scope === "agent" && selectedAgent !== "all") {
      items = items.filter((item) => isSameAgent(item.agent, selectedAgent));
    }

    return items;
  }, [
    allCases,
    periodType,
    selectedYear,
    selectedMonth,
    selectedWeek,
    scope,
    selectedAgent,
    currentUser,
    isAgentRole,
  ]);

  const topicSummary = useMemo(() => buildTopicSummary(baseFilteredCases), [baseFilteredCases]);
  const bestTopic = useMemo(() => getBestTopicLabel(topicSummary), [topicSummary]);
  const lowestTopic = useMemo(() => getLowestTopicLabel(topicSummary), [topicSummary]);

  const avgScore =
    baseFilteredCases.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(baseFilteredCases.length, 1);

  const gradeDisplay = getMonthlyGradeDisplay(baseFilteredCases.length, avgScore);
  const criticalCases = 0;
  const incentive = getIncentiveValue(baseFilteredCases.length, avgScore);

  const teamRanking = useMemo(() => groupByAgent(baseFilteredCases), [baseFilteredCases]);

  const weeklyTrendRows = useMemo(() => {
    if (periodType !== "weekly") return [];
    const weekMap = new Map<string, CaseItem[]>();
    baseFilteredCases.forEach((item) => {
      const key = item.weekLabel || "Unknown";
      if (!weekMap.has(key)) weekMap.set(key, []);
      weekMap.get(key)!.push(item);
    });

    return [...weekMap.entries()].map(([label, items]) => {
      const avg = items.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(items.length, 1);
      return {
        label,
        cases: items.length,
        avg,
        status: items.length >= CASE_TARGET ? "Ready" : items.length === 0 ? "No reviewed cases" : "Reviewed",
      };
    });
  }, [baseFilteredCases, periodType]);

  const monthlyTrendRows = useMemo(() => {
    const monthMap = new Map<string, CaseItem[]>();
    baseFilteredCases.forEach((item) => {
      if (!item.auditMonthLabel || item.auditMonthLabel === "-") return;
      if (!monthMap.has(item.auditMonthLabel)) monthMap.set(item.auditMonthLabel, []);
      monthMap.get(item.auditMonthLabel)!.push(item);
    });

    return MONTH_LABELS.map((month) => {
      const items = monthMap.get(month) || [];
      const avg = items.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(items.length, 1);
      return {
        label: month,
        cases: items.length,
        avg: Number(avg.toFixed(2)),
        status:
          items.length === 0 ? "Pending" : items.length < CASE_TARGET ? "Pending 10 cases" : scoreToGrade(avg),
      };
    });
  }, [baseFilteredCases]);

  const selectedAgentCases = useMemo(() => {
    if (isAgentRole && currentUser?.agentName) {
      return baseFilteredCases.filter((item) => isSameAgent(item.agent, currentUser.agentName));
    }
    if (selectedAgent !== "all") {
      return baseFilteredCases.filter((item) => isSameAgent(item.agent, selectedAgent));
    }
    return baseFilteredCases;
  }, [baseFilteredCases, currentUser, isAgentRole, selectedAgent]);

  const selectedAgentTopicSummary = useMemo(
    () => buildTopicSummary(selectedAgentCases),
    [selectedAgentCases]
  );

  const selectedAgentAvg =
    selectedAgentCases.reduce((sum, item) => sum + item.finalScore, 0) /
    Math.max(selectedAgentCases.length, 1);

  const selectedAgentGrade = getMonthlyGradeDisplay(selectedAgentCases.length, selectedAgentAvg);

  const topAgentByYear = useMemo(() => teamRanking[0]?.agent || "-", [teamRanking]);
  const bottomAgentByYear = useMemo(
    () => [...teamRanking].sort((a, b) => a.avgScore - b.avgScore)[0]?.agent || "-",
    [teamRanking]
  );

  const currentAgentName =
    isAgentRole && currentUser?.agentName
      ? currentUser.agentName
      : selectedAgent !== "all"
      ? selectedAgent
      : "-";

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
          <div className="mt-3 text-sm text-slate-600">
            ตรวจสอบว่าไฟล์อยู่ที่ public/QA_RawData1.xlsx และ public/Appleal ROWDATA.xlsx
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff]">
      <div className="mx-auto max-w-[1720px] px-6 py-6 lg:px-8 lg:py-8">
        <div className="space-y-6">
          <LogoHero />

          <SectionCard
            title="Summary Control Panel"
            subtitle="Choose view scope and reporting period"
            right={
              <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                {isAgentRole ? "Agent View" : "Management View"}
              </span>
            }
          >
            <div className="grid gap-5 xl:grid-cols-[1fr_1fr_1.2fr]">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-700">
                  View Scope
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {isAgentRole ? (
                    <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
                      My Performance
                    </div>
                  ) : (
                    <>
                      <PillButton label="Team View" active={scope === "team"} onClick={() => setScope("team")} />
                      <PillButton label="By Agent" active={scope === "agent"} onClick={() => setScope("agent")} />
                    </>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-700">
                  Period Type
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <PillButton label="Weekly" active={periodType === "weekly"} onClick={() => setPeriodType("weekly")} />
                  <PillButton label="Monthly" active={periodType === "monthly"} onClick={() => setPeriodType("monthly")} />
                  <PillButton label="Yearly" active={periodType === "yearly"} onClick={() => setPeriodType("yearly")} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                <div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-700">
                    Year
                  </div>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="mt-3 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
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
                  <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-700">
                    Month
                  </div>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    disabled={periodType === "yearly"}
                    className="mt-3 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
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
                  <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-700">
                    Week
                  </div>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    disabled={periodType !== "weekly"}
                    className="mt-3 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
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
                  <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-700">
                    Agent
                  </div>
                  {isAgentRole ? (
                    <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
                      {currentUser?.agentName || "-"}
                    </div>
                  ) : (
                    <select
                      value={selectedAgent}
                      onChange={(e) => setSelectedAgent(e.target.value)}
                      disabled={scope !== "agent"}
                      className="mt-3 w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:bg-slate-50"
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
          </SectionCard>

          {periodType === "weekly" && scope === "team" && !isAgentRole ? (
            <>
              <SectionCard
                title="Weekly Dashboard"
                subtitle="Selected week overview for the whole team"
                right={
                  <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                    Team Weekly View
                  </span>
                }
              >
                <KeyValueGrid
                  items={[
                    { label: "Week", value: selectedWeek === "all" ? "All Weeks" : selectedWeek },
                    {
                      label: "Month",
                      value:
                        selectedMonth === "all"
                          ? "All Months"
                          : MONTH_LABELS[Number(selectedMonth) - 1] || "All Months",
                    },
                    { label: "Team Cases", value: baseFilteredCases.length },
                    { label: "Avg Score", value: avgScore.toFixed(2) },
                    { label: "Critical Cases", value: criticalCases },
                    { label: "Best Topic", value: bestTopic, valueClassName: "text-emerald-700" },
                    { label: "Lowest Topic", value: lowestTopic, valueClassName: "text-rose-700" },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Agent Weekly Ranking" subtitle="Weekly ranking overview for the selected team scope">
                <RankingTable items={teamRanking} />
              </SectionCard>

              <SectionCard title="Topic Performance % - Team Weekly" subtitle="Topic performance for selected weekly view">
                <TopicPerformanceTable items={topicSummary.sort((a, b) => b.pct - a.pct)} />
              </SectionCard>
            </>
          ) : null}

          {periodType === "weekly" && (scope === "agent" || isAgentRole) ? (
            <>
              <SectionCard
                title="Weekly QA by Agent"
                subtitle="Weekly summary for selected agent only"
                right={
                  <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                    My Weekly View
                  </span>
                }
              >
                <KeyValueGrid
                  items={[
                    { label: "Agent", value: currentAgentName },
                    { label: "Week", value: selectedWeek === "all" ? "All Weeks" : selectedWeek },
                    { label: "Weekly Cases", value: selectedAgentCases.length },
                    { label: "Critical Cases", value: 0 },
                    { label: "Average Score", value: selectedAgentAvg.toFixed(2) },
                    {
                      label: "Best Topic",
                      value: getBestTopicLabel(selectedAgentTopicSummary),
                      valueClassName: "text-emerald-700",
                    },
                    {
                      label: "Improve Topic",
                      value: getLowestTopicLabel(selectedAgentTopicSummary),
                      valueClassName: "text-rose-700",
                    },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Weekly Case List" subtitle="Reviewed weekly cases for selected agent">
                <CaseListTable items={selectedAgentCases} />
              </SectionCard>
            </>
          ) : null}

          {periodType === "monthly" && scope === "team" && !isAgentRole ? (
            <>
              <SectionCard
                title="Monthly Team Summary"
                subtitle="Selected month overview for the whole team"
                right={
                  <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                    Team Monthly View
                  </span>
                }
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                  <KpiCard title="Month" value={selectedMonth === "all" ? "All" : (MONTH_LABELS[Number(selectedMonth) - 1] || "All").slice(0, 3)} badge={selectedMonth === "all" ? "All Months" : MONTH_LABELS[Number(selectedMonth) - 1]} sub="Current month view" tone="violet" />
                  <KpiCard title="Year" value={selectedYear === "all" ? "All" : selectedYear} badge="Selected Year" sub="Current year filter" tone="slate" />
                  <KpiCard title="Team Cases" value={String(baseFilteredCases.length)} badge="Reviewed Cases" sub="Cases in selected view" tone="sky" />
                  <KpiCard title="Avg Score" value={avgScore.toFixed(2)} badge="Team Performance" sub="Average monthly score" tone="violet" />
                  <KpiCard title="Best Topic" value={bestTopic} badge="Top Quality Area" sub="Best topic in month" tone="emerald" />
                  <KpiCard title="Lowest Topic" value={lowestTopic} badge="Main Focus Area" sub="Lowest topic in month" tone="rose" />
                </div>
              </SectionCard>

              <SectionCard title="Agent Monthly Ranking" subtitle="Monthly ranking across the team">
                <RankingTable items={teamRanking} />
              </SectionCard>

              <SectionCard title="Topic Performance % - Team Monthly" subtitle="Monthly topic performance by team">
                <TopicPerformanceTable items={topicSummary.sort((a, b) => b.pct - a.pct)} />
              </SectionCard>
            </>
          ) : null}

          {periodType === "monthly" && (scope === "agent" || isAgentRole) ? (
            <>
              <SectionCard
                title="Monthly QA Dashboard"
                subtitle="Monthly dashboard for selected agent"
                right={
                  <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                    My Monthly View
                  </span>
                }
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                  <KpiCard title="Cases Reviewed" value={String(selectedAgentCases.length)} badge="Monthly Cases" sub="Reviewed in selected month" tone="sky" />
                  <KpiCard
                    title="Need More to 10"
                    value={String(Math.max(CASE_TARGET - selectedAgentCases.length, 0))}
                    badge="Monthly Target"
                    sub="Required to finalize grade"
                    tone={selectedAgentCases.length >= CASE_TARGET ? "emerald" : "amber"}
                  />
                  <KpiCard title="Average Score" value={selectedAgentAvg.toFixed(2)} badge="Current Month" sub="Average score this month" tone="violet" />
                  <KpiCard title="Monthly Grade" value={selectedAgentGrade} badge={gradeStatus(selectedAgentGrade)} sub="Monthly grade status" tone={selectedAgentGrade === "A" ? "emerald" : selectedAgentGrade === "B" ? "sky" : selectedAgentGrade === "C" ? "amber" : selectedAgentGrade === "D" || selectedAgentGrade === "F" ? "rose" : "slate"} />
                  <KpiCard title="Incentive (THB)" value={String(getIncentiveValue(selectedAgentCases.length, selectedAgentAvg))} badge="Monthly Incentive" sub="Calculated after target" tone="amber" />
                  <KpiCard title="Best Topic" value={getBestTopicLabel(selectedAgentTopicSummary)} badge="Strongest Area" sub="Best topic in month" tone="emerald" />
                </div>

                <div className="mt-4">
                  <KeyValueGrid
                    items={[
                      {
                        label: "Lowest Topic",
                        value: getLowestTopicLabel(selectedAgentTopicSummary),
                        valueClassName: "text-rose-700",
                      },
                    ]}
                  />
                </div>
              </SectionCard>

              <SectionCard title="Monthly Case List" subtitle="Case list for selected agent in the current monthly view">
                <CaseListTable items={selectedAgentCases} />
              </SectionCard>
            </>
          ) : null}

          {periodType === "yearly" && scope === "team" && !isAgentRole ? (
            <>
              <SectionCard
                title="Yearly Team Summary"
                subtitle="Yearly overview for the whole team"
                right={
                  <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                    Team Yearly View
                  </span>
                }
              >
                <KeyValueGrid
                  items={[
                    { label: "Year", value: selectedYear === "all" ? "All Years" : selectedYear },
                    { label: "Team Cases", value: baseFilteredCases.length },
                    { label: "Avg Score", value: avgScore.toFixed(2) },
                    { label: "Critical Cases", value: criticalCases },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Monthly Team Trend" subtitle="Monthly team trend for the selected yearly scope">
                <TrendMiniTable rows={monthlyTrendRows} col1Label="Month" col2Label="Cases" col3Label="Avg Score" />
              </SectionCard>

              <SectionCard title="Top / Bottom Agent by Year" subtitle="Best and lowest yearly average by agent">
                <KeyValueGrid
                  items={[
                    { label: "Top Avg Score Agent", value: topAgentByYear, valueClassName: "text-emerald-700" },
                    { label: "Bottom Avg Score Agent", value: bottomAgentByYear, valueClassName: "text-rose-700" },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Yearly Team Ranking" subtitle="Yearly agent ranking table">
                <RankingTable items={teamRanking} />
              </SectionCard>
            </>
          ) : null}

          {periodType === "yearly" && (scope === "agent" || isAgentRole) ? (
            <>
              <SectionCard
                title="Yearly By Agent"
                subtitle="Selected agent yearly trend"
                right={
                  <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                    My Yearly View
                  </span>
                }
              >
                <KeyValueGrid
                  items={[
                    { label: "Agent", value: currentAgentName },
                    { label: "Year", value: selectedYear === "all" ? "All Years" : selectedYear },
                    { label: "Cases", value: selectedAgentCases.length },
                    { label: "Avg Score", value: selectedAgentAvg.toFixed(2) },
                    { label: "Critical Cases", value: 0 },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Monthly Trend" subtitle="Monthly trend for selected agent in yearly view">
                <TrendMiniTable rows={monthlyTrendRows} col1Label="Month" col2Label="Cases" col3Label="Avg Score" />
              </SectionCard>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}