import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Grade = "A" | "B" | "C" | "D" | "F";
type ReviewStatus = "Original" | "Revised";
type ViewMode = "overall" | "by-agent";
type PeriodType = "weekly" | "monthly" | "yearly";

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
  auditMonthKey: string;
  weekLabel: string;
  caseId: string;
  finalScore: number;
  previousScore?: number;
  grade: Grade;
  reviewStatus: ReviewStatus;
  topics: Topic[];
  revisedTopics?: Topic[] | null;
  displayRevisedTopicCodes?: string[];
};

type TopicSummary = {
  code: string;
  label: string;
  avgScore: number;
  max: number;
  pct: number;
};

type AppealMergeItem = {
  caseId: string;
  finalScore?: number;
  previousScore?: number;
  revisedTopics: Topic[];
  displayRevisedTopicCodes: string[];
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
  "Phrommarin Thaithorn",
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

function gradeTone(grade: string) {
  switch (grade) {
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

function gradeStatus(grade: string) {
  switch (grade) {
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

function mergeTopicSet(topics: Topic[], revisedTopics?: Topic[] | null) {
  if (!revisedTopics?.length) return topics;
  const revisedMap = new Map(revisedTopics.map((topic) => [topic.code, topic]));
  return topics.map((topic) => revisedMap.get(topic.code) || topic);
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

function SectionBand({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[30px] border border-violet-200/80 bg-white shadow-[0_12px_32px_rgba(76,29,149,0.08)]">
      <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
      <div className="flex flex-col gap-3 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[19px] font-bold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
        </div>
        {badge ? (
          <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
            {badge}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ControlChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
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

function PremiumMetricCard({
  title,
  value,
  helper,
  sub,
  tone = "violet",
}: {
  title: string;
  value: string;
  helper?: React.ReactNode;
  sub?: string;
  tone?: "violet" | "emerald" | "sky" | "amber" | "rose" | "slate";
}) {
  const toneMap = {
    violet: "from-white via-violet-50/50 to-fuchsia-50/60 border-violet-200/80 text-violet-900",
    emerald: "from-emerald-50 via-white to-emerald-100/70 border-emerald-200 text-emerald-700",
    sky: "from-sky-50 via-white to-indigo-100/60 border-sky-200 text-sky-700",
    amber: "from-amber-50 via-white to-amber-100/70 border-amber-200 text-amber-700",
    rose: "from-rose-50 via-white to-rose-100/70 border-rose-200 text-rose-700",
    slate: "from-slate-50 via-white to-slate-100 border-slate-200 text-slate-800",
  };

  return (
    <div className={`overflow-hidden rounded-[28px] border bg-gradient-to-br shadow-[0_10px_30px_rgba(91,33,182,0.08)] ${toneMap[tone]}`}>
      <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
      <div className="p-5 lg:p-6">
        <div className="text-[13px] font-semibold tracking-wide text-slate-500">{title}</div>
        <div className="mt-3 text-4xl font-extrabold tracking-tight lg:text-[42px]">{value}</div>
        {helper ? <div className="mt-3">{helper}</div> : null}
        {sub ? <div className="mt-3 text-xs leading-5 text-slate-500">{sub}</div> : null}
      </div>
    </div>
  );
}

function MiniStatCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "emerald" | "sky" | "violet" | "amber" | "rose" | "slate";
}) {
  const toneMap = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm font-bold ${toneMap[tone]}`}>
        {value}
      </div>
    </div>
  );
}

function ExecutiveSummaryCard({
  averageScore,
  currentGrade,
  currentStatus,
  progress,
  incentive,
  revisedCount,
  strongestTopic,
  weakestTopic,
}: {
  averageScore: string;
  currentGrade: string;
  currentStatus: string;
  progress: string;
  incentive: string;
  revisedCount: number;
  strongestTopic: string;
  weakestTopic: string;
}) {
  const gradeColor =
    currentGrade === "A"
      ? "emerald"
      : currentGrade === "B"
      ? "sky"
      : currentGrade === "C"
      ? "amber"
      : currentGrade === "D"
      ? "rose"
      : currentGrade === "F"
      ? "rose"
      : "slate";

  return (
    <div className="overflow-hidden rounded-[30px] border border-violet-200/80 bg-white shadow-[0_14px_34px_rgba(76,29,149,0.10)]">
      <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
      <div className="grid gap-6 px-6 py-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[26px] border border-violet-100 bg-gradient-to-br from-white via-violet-50/35 to-fuchsia-50/45 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-500">Overall Grade</span>
            <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${gradeTone(currentGrade)}`}>
              {currentGrade}
            </span>
            <span className="text-sm font-semibold text-slate-700">{currentStatus}</span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MiniStatCard label="Average Score" value={averageScore} tone="violet" />
            <MiniStatCard label="Progress" value={progress} tone="emerald" />
            <MiniStatCard label="Incentive" value={incentive} tone="amber" />
            <MiniStatCard label="Revised Cases" value={String(revisedCount)} tone="sky" />
            <MiniStatCard label="Status Level" value={currentStatus} tone={gradeColor as any} />
            <MiniStatCard label="Performance View" value="Current Filter" tone="slate" />
          </div>
        </div>

        <div className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-700">
            Executive Reading
          </div>
          <div className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              Current overall performance is at <span className="font-bold text-violet-700">{averageScore}</span> with grade <span className="font-bold text-slate-900">{currentGrade}</span>.
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              Reviewed volume is <span className="font-semibold text-slate-900">{progress}</span> in the selected view.
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              Strongest topic is <span className="font-semibold text-emerald-700">{strongestTopic}</span>.
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              Main coaching focus is <span className="font-semibold text-rose-700">{weakestTopic}</span>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InsightFamilyCard({
  title,
  subtitle,
  tone = "violet",
  children,
}: {
  title: string;
  subtitle: string;
  tone?: "violet" | "emerald" | "rose" | "sky";
  children: React.ReactNode;
}) {
  const toneMap = {
    violet: "from-violet-50 via-white to-fuchsia-50 border-violet-200",
    emerald: "from-emerald-50 via-white to-emerald-100/60 border-emerald-200",
    rose: "from-rose-50 via-white to-rose-100/60 border-rose-200",
    sky: "from-sky-50 via-white to-indigo-100/60 border-sky-200",
  };

  return (
    <div className={`rounded-[26px] border bg-gradient-to-br ${toneMap[tone]} p-5 shadow-sm`}>
      <div className="text-base font-bold tracking-tight text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{subtitle}</div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SimpleListItem({
  label,
  value,
  valueTone = "text-slate-900",
}: {
  label: string;
  value: string;
  valueTone?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${valueTone}`}>{value}</div>
    </div>
  );
}

function ComparisonBarChart({
  data,
  title,
  subtitle,
}: {
  data: { label: string; value: number }[];
  title: string;
  subtitle: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="rounded-[26px] border border-violet-200/70 bg-white p-5 shadow-sm">
      <div className="text-base font-bold tracking-tight text-slate-900">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{subtitle}</div>

      <div className="mt-6">
        <div className="relative flex items-end gap-4" style={{ height: 250 }}>
          {data.map((item) => {
            const h = Math.max((item.value / max) * 180, item.value > 0 ? 16 : 6);

            return (
              <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-2">
                <div className="text-xs font-bold text-slate-700">{item.value.toFixed(1)}</div>
                <div className="flex w-full items-end">
                  <div
                    className="w-full rounded-t-[18px] bg-gradient-to-t from-violet-800 via-violet-600 to-fuchsia-400 shadow-[0_12px_24px_rgba(124,58,237,0.18)]"
                    style={{ height: h }}
                  />
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

function TopicRankingTable({ items }: { items: TopicSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[760px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-3 py-3 text-left">Topic</th>
            <th className="px-3 py-3 text-left">Description</th>
            <th className="px-3 py-3 text-center">Avg Score</th>
            <th className="px-3 py-3 text-center">Max</th>
            <th className="px-3 py-3 text-center">Avg %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.code} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 font-semibold text-slate-900">{entry.code}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-slate-700">{entry.label}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.avgScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.max}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.pct.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentRankingTable({
  items,
}: {
  items: {
    agent: string;
    average: number;
    grade: string;
    caseCount: number;
    revisedCount: number;
  }[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[760px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-3 py-3 text-left">Agent</th>
            <th className="px-3 py-3 text-center">Average</th>
            <th className="px-3 py-3 text-center">Grade</th>
            <th className="px-3 py-3 text-center">Cases</th>
            <th className="px-3 py-3 text-center">Revised</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.agent} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 font-semibold text-slate-900">{entry.agent}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.average.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(entry.grade)}`}>
                  {entry.grade}
                </span>
              </td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.caseCount}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.revisedCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SummaryMockup({ currentUser }: { currentUser: any }) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [viewMode, setViewMode] = useState<ViewMode>("overall");
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedAgent, setSelectedAgent] = useState<string>("all");

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
              revisedCommentRaw !== null &&
              String(revisedCommentRaw).trim() !== "";

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
            const auditMonthKey =
              auditYear && auditMonth
                ? `${auditYear}-${String(auditMonth).padStart(2, "0")}`
                : "unknown";

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

            const reviewStatus: ReviewStatus =
              mergedAppeal?.displayRevisedTopicCodes?.length ? "Revised" : "Original";

            return {
              key: `row-${index + 1}-${caseId}`,
              agent: String(rawHelper.getValue(row, "Agent Name")).trim(),
              auditDate: formatAuditDate(rawAuditDate),
              auditDateObj,
              auditYear,
              auditMonth,
              auditMonthKey,
              weekLabel: String(weekLabel || "-").trim(),
              caseId,
              finalScore: finalScoreVal,
              previousScore: previousScoreVal,
              grade: scoreToGrade(finalScoreVal),
              reviewStatus,
              topics,
              revisedTopics: mergedAppeal?.revisedTopics?.length ? mergedAppeal.revisedTopics : null,
              displayRevisedTopicCodes: mergedAppeal?.displayRevisedTopicCodes || [],
              inquiryTh: "",
              inquiryEn: "",
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
    return [...new Set([...AGENT_MASTER, ...agentsFromCases])].sort((a, b) => a.localeCompare(b));
  }, [allCases]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      setViewMode("by-agent");
      setSelectedAgent(currentUser.agentName);
    }
  }, [currentUser]);

  const yearOptions = useMemo(() => {
    return [...new Set(allCases.map((item) => item.auditYear).filter(Boolean) as number[])].sort(
      (a, b) => b - a
    );
  }, [allCases]);

  const monthOptions = useMemo(() => {
    if (selectedYear === "all") return MONTH_LABELS.map((label, index) => ({ label, value: `${index + 1}` }));
    return MONTH_LABELS.map((label, index) => ({ label, value: `${index + 1}` }));
  }, [selectedYear]);

  const weekOptions = useMemo(() => {
    return [...new Set(allCases.map((item) => item.weekLabel).filter(Boolean))];
  }, [allCases]);

  const scopedCases = useMemo(() => {
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

    if (viewMode === "by-agent" && selectedAgent !== "all") {
      items = items.filter((item) => isSameAgent(item.agent, selectedAgent));
    }

    return items;
  }, [allCases, periodType, selectedYear, selectedMonth, selectedWeek, viewMode, selectedAgent]);

  const averageScore =
    scopedCases.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(scopedCases.length, 1);

  const currentGradeDisplay =
    scopedCases.length === 0
      ? "F"
      : scopedCases.length < CASE_TARGET
      ? "-"
      : scoreToGrade(Number(averageScore.toFixed(2)));

  const currentStatus = gradeStatus(currentGradeDisplay);

  const revisedCount = scopedCases.filter((item) => item.reviewStatus === "Revised").length;
  const incentiveDisplay = formatCurrencyTHB(
    getIncentiveValue(scopedCases.length, Number(averageScore.toFixed(2)))
  );

  const topicSummary = useMemo(() => buildTopicSummary(scopedCases), [scopedCases]);

  const strongestTopics = useMemo(
    () => [...topicSummary].sort((a, b) => b.pct - a.pct).slice(0, 3),
    [topicSummary]
  );

  const weakestTopics = useMemo(
    () => [...topicSummary].sort((a, b) => a.pct - b.pct).slice(0, 3),
    [topicSummary]
  );

  const executiveStrongest = strongestTopics[0]
    ? `${strongestTopics[0].code} ${strongestTopics[0].label}`
    : "-";

  const executiveWeakest = weakestTopics[0]
    ? `${weakestTopics[0].code} ${weakestTopics[0].label}`
    : "-";

  const comparisonData = useMemo(() => {
    if (periodType === "weekly") {
      const weekMap = new Map<string, number[]>();
      scopedCases.forEach((item) => {
        const key = item.weekLabel || "Unknown";
        if (!weekMap.has(key)) weekMap.set(key, []);
        weekMap.get(key)!.push(item.finalScore);
      });

      return [...weekMap.entries()].map(([label, scores]) => ({
        label,
        value: scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1),
      }));
    }

    if (periodType === "monthly") {
      const monthMap = new Map<string, number[]>();
      scopedCases.forEach((item) => {
        if (!item.auditMonth) return;
        const label = MONTH_LABELS[item.auditMonth - 1];
        if (!monthMap.has(label)) monthMap.set(label, []);
        monthMap.get(label)!.push(item.finalScore);
      });

      return MONTH_LABELS.map((label) => ({
        label: label.slice(0, 3),
        value:
          monthMap.get(label)?.reduce((sum, score) => sum + score, 0) /
            Math.max(monthMap.get(label)?.length || 0, 1) || 0,
      })).filter((item) => item.value > 0);
    }

    const yearMap = new Map<string, number[]>();
    scopedCases.forEach((item) => {
      if (!item.auditYear) return;
      const key = String(item.auditYear);
      if (!yearMap.has(key)) yearMap.set(key, []);
      yearMap.get(key)!.push(item.finalScore);
    });

    return [...yearMap.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([label, scores]) => ({
        label,
        value: scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1),
      }));
  }, [periodType, scopedCases]);

  const previousComparison = useMemo(() => {
    if (comparisonData.length < 2) {
      return {
        current: comparisonData[comparisonData.length - 1]?.value || 0,
        previous: 0,
        delta: 0,
      };
    }

    const current = comparisonData[comparisonData.length - 1]?.value || 0;
    const previous = comparisonData[comparisonData.length - 2]?.value || 0;
    return {
      current,
      previous,
      delta: current - previous,
    };
  }, [comparisonData]);

  const agentRanking = useMemo(() => {
    const groups = new Map<string, CaseItem[]>();

    allCases.forEach((item) => {
      if (selectedYear !== "all" && String(item.auditYear || "") !== selectedYear) return;
      if (periodType !== "yearly" && selectedMonth !== "all" && String(item.auditMonth || "") !== selectedMonth) {
        return;
      }
      if (periodType === "weekly" && selectedWeek !== "all" && item.weekLabel !== selectedWeek) {
        return;
      }

      if (!groups.has(item.agent)) groups.set(item.agent, []);
      groups.get(item.agent)!.push(item);
    });

    return [...groups.entries()]
      .map(([agent, items]) => {
        const average =
          items.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(items.length, 1);
        return {
          agent,
          average: Number(average.toFixed(2)),
          grade: items.length < CASE_TARGET ? "-" : scoreToGrade(average),
          caseCount: items.length,
          revisedCount: items.filter((item) => item.reviewStatus === "Revised").length,
        };
      })
      .sort((a, b) => b.average - a.average);
  }, [allCases, selectedYear, selectedMonth, selectedWeek, periodType]);

  const topAgents = agentRanking.slice(0, 3);
  const bottomAgents = [...agentRanking].reverse().slice(0, 3);

  const reviewSnapshotItems = [
    {
      label: "Original Cases",
      value: `${scopedCases.filter((item) => item.reviewStatus === "Original").length} case(s)`,
      valueTone: "text-slate-900",
    },
    {
      label: "Revised Cases",
      value: `${scopedCases.filter((item) => item.reviewStatus === "Revised").length} case(s)`,
      valueTone: "text-violet-700",
    },
    {
      label: "Current Status",
      value: currentStatus,
      valueTone: "text-sky-700",
    },
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
          <SectionBand
            title="Performance Summary Family"
            subtitle="Premium overview for Weekly, Monthly, Yearly performance in Overall and By Agent view"
            badge="Summary Workspace"
          />

          <div className="overflow-hidden rounded-[30px] border border-violet-200/80 bg-white shadow-[0_12px_32px_rgba(76,29,149,0.08)]">
            <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
            <div className="grid gap-5 px-6 py-6 xl:grid-cols-[1.1fr_1fr_1fr]">
              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-700">
                  View Mode
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ControlChip
                    active={viewMode === "overall"}
                    label="Overall"
                    onClick={() => {
                      setViewMode("overall");
                      if (currentUser?.role !== "Agent") setSelectedAgent("all");
                    }}
                  />
                  <ControlChip
                    active={viewMode === "by-agent"}
                    label="By Agent"
                    onClick={() => setViewMode("by-agent")}
                  />
                </div>
              </div>

              <div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.2em] text-violet-700">
                  Period Type
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ControlChip active={periodType === "weekly"} label="Weekly" onClick={() => setPeriodType("weekly")} />
                  <ControlChip active={periodType === "monthly"} label="Monthly" onClick={() => setPeriodType("monthly")} />
                  <ControlChip active={periodType === "yearly"} label="Yearly" onClick={() => setPeriodType("yearly")} />
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
                    {monthOptions.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
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
                  {currentUser?.role === "Agent" ? (
                    <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
                      {currentUser.agentName}
                    </div>
                  ) : (
                    <select
                      value={selectedAgent}
                      onChange={(e) => setSelectedAgent(e.target.value)}
                      disabled={viewMode !== "by-agent"}
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
          </div>

          <SectionBand
            title="Performance Overview"
            subtitle="Executive KPI snapshot for the selected summary view"
            badge={viewMode === "overall" ? "Overall Summary" : "By Agent Summary"}
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <PremiumMetricCard
              title="Average Score"
              value={averageScore.toFixed(2)}
              tone="violet"
              helper={
                <span className="inline-flex rounded-full border border-violet-200 bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                  Overall Performance
                </span>
              }
              sub={`${scopedCases.length} case(s) in selected view`}
            />
            <PremiumMetricCard
              title="Current Grade"
              value={currentGradeDisplay}
              tone={
                currentGradeDisplay === "A"
                  ? "emerald"
                  : currentGradeDisplay === "B"
                  ? "sky"
                  : currentGradeDisplay === "C"
                  ? "amber"
                  : currentGradeDisplay === "D" || currentGradeDisplay === "F"
                  ? "rose"
                  : "slate"
              }
              helper={
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${gradeTone(currentGradeDisplay)}`}>
                    Grade {currentGradeDisplay}
                  </span>
                  <span className="text-[12px] font-semibold text-slate-700">
                    Status: {currentStatus}
                  </span>
                </div>
              }
              sub={scopedCases.length < CASE_TARGET ? "Grade fully applies at 10 reviewed cases" : "Calculated from current average"}
            />
            <PremiumMetricCard
              title="Evaluation Progress"
              value={`${scopedCases.length}/${CASE_TARGET}`}
              tone={scopedCases.length >= CASE_TARGET ? "emerald" : "amber"}
              helper={
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  scopedCases.length >= CASE_TARGET
                    ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                    : "border-amber-200 bg-amber-100 text-amber-700"
                }`}>
                  {scopedCases.length >= CASE_TARGET ? "Target Reached" : "In Progress"}
                </span>
              }
              sub="Reviewed volume in selected summary"
            />
            <PremiumMetricCard
              title="Estimated Incentive"
              value={incentiveDisplay}
              tone="amber"
              helper={
                <span className="inline-flex rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  Monthly Estimate
                </span>
              }
              sub="Based on current scoring rules"
            />
            <PremiumMetricCard
              title="Review Mix"
              value={`${revisedCount}`}
              tone="sky"
              helper={
                <span className="inline-flex rounded-full border border-sky-200 bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">
                  Revised Cases
                </span>
              }
              sub="Revised cases in selected summary"
            />
          </div>

          <ExecutiveSummaryCard
            averageScore={averageScore.toFixed(2)}
            currentGrade={currentGradeDisplay}
            currentStatus={currentStatus}
            progress={`${scopedCases.length}/${CASE_TARGET}`}
            incentive={incentiveDisplay}
            revisedCount={revisedCount}
            strongestTopic={executiveStrongest}
            weakestTopic={executiveWeakest}
          />

          <SectionBand
            title="Period Comparison"
            subtitle="Compare Weekly, Monthly, or Yearly performance trend in the selected view"
            badge={periodType === "weekly" ? "Weekly" : periodType === "monthly" ? "Monthly" : "Yearly"}
          />

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <ComparisonBarChart
              data={comparisonData}
              title={
                periodType === "weekly"
                  ? "Weekly Performance Comparison"
                  : periodType === "monthly"
                  ? "Monthly Performance Trend"
                  : "Yearly Performance Overview"
              }
              subtitle="Average score comparison across selected periods"
            />

            <InsightFamilyCard
              title="Comparison Snapshot"
              subtitle="Current vs previous visible period"
              tone="sky"
            >
              <div className="space-y-3">
                <SimpleListItem label="Current Period" value={previousComparison.current.toFixed(2)} valueTone="text-sky-700" />
                <SimpleListItem label="Previous Period" value={previousComparison.previous.toFixed(2)} valueTone="text-slate-900" />
                <SimpleListItem
                  label="Delta"
                  value={`${previousComparison.delta >= 0 ? "+" : ""}${previousComparison.delta.toFixed(2)}`}
                  valueTone={previousComparison.delta >= 0 ? "text-emerald-700" : "text-rose-700"}
                />
                <SimpleListItem
                  label="Best Visible Period"
                  value={
                    comparisonData.length
                      ? `${[...comparisonData].sort((a, b) => b.value - a.value)[0].label} · ${[...comparisonData].sort((a, b) => b.value - a.value)[0].value.toFixed(2)}`
                      : "-"
                  }
                  valueTone="text-emerald-700"
                />
              </div>
            </InsightFamilyCard>
          </div>

          <SectionBand
            title="Topic Performance Family"
            subtitle="Strength, coaching focus, and topic ranking for the selected summary scope"
            badge="Topic Based Performance"
          />

          <div className="grid gap-6 xl:grid-cols-3">
            <InsightFamilyCard title="Top Strengths" subtitle="Highest performing topics" tone="emerald">
              <div className="space-y-3">
                {strongestTopics.map((topic) => (
                  <SimpleListItem
                    key={topic.code}
                    label={topic.code}
                    value={`${topic.label} · ${topic.pct.toFixed(2)}%`}
                    valueTone="text-emerald-700"
                  />
                ))}
              </div>
            </InsightFamilyCard>

            <InsightFamilyCard title="Coaching Focus" subtitle="Lowest performing topics" tone="rose">
              <div className="space-y-3">
                {weakestTopics.map((topic) => (
                  <SimpleListItem
                    key={topic.code}
                    label={topic.code}
                    value={`${topic.label} · ${topic.pct.toFixed(2)}%`}
                    valueTone="text-rose-700"
                  />
                ))}
              </div>
            </InsightFamilyCard>

            <InsightFamilyCard title="Review Snapshot" subtitle="Summary of review mix and status" tone="violet">
              <div className="space-y-3">
                {reviewSnapshotItems.map((item) => (
                  <SimpleListItem
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    valueTone={item.valueTone}
                  />
                ))}
              </div>
            </InsightFamilyCard>
          </div>

          <div className="overflow-hidden rounded-[30px] border border-violet-200/80 bg-white shadow-[0_12px_32px_rgba(76,29,149,0.08)]">
            <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
            <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-6 py-5">
              <div className="text-[19px] font-bold tracking-tight text-slate-900">Topic Ranking</div>
              <div className="mt-1 text-sm text-slate-500">Full topic ranking for selected summary scope</div>
            </div>
            <div className="p-6">
              <TopicRankingTable items={[...topicSummary].sort((a, b) => b.pct - a.pct)} />
            </div>
          </div>

          <SectionBand
            title="Agent Performance Family"
            subtitle={
              viewMode === "overall"
                ? "Team ranking, top performers, and lowest performers"
                : "Selected agent context plus team comparison"
            }
            badge={viewMode === "overall" ? "Team View" : "Agent View"}
          />

          <div className="grid gap-6 xl:grid-cols-3">
            <InsightFamilyCard title="Top Performers" subtitle="Highest average score" tone="emerald">
              <div className="space-y-3">
                {topAgents.map((agent) => (
                  <SimpleListItem
                    key={agent.agent}
                    label={agent.agent}
                    value={`${agent.average.toFixed(2)} · ${agent.caseCount} case(s)`}
                    valueTone="text-emerald-700"
                  />
                ))}
              </div>
            </InsightFamilyCard>

            <InsightFamilyCard title="Watchlist" subtitle="Lowest average score" tone="rose">
              <div className="space-y-3">
                {bottomAgents.map((agent) => (
                  <SimpleListItem
                    key={agent.agent}
                    label={agent.agent}
                    value={`${agent.average.toFixed(2)} · ${agent.caseCount} case(s)`}
                    valueTone="text-rose-700"
                  />
                ))}
              </div>
            </InsightFamilyCard>

            <InsightFamilyCard
              title={viewMode === "overall" ? "Team Snapshot" : "Selected Agent Snapshot"}
              subtitle={viewMode === "overall" ? "Current team level reading" : "Current selected agent reading"}
              tone="sky"
            >
              <div className="space-y-3">
                <SimpleListItem
                  label={viewMode === "overall" ? "View Mode" : "Selected Agent"}
                  value={viewMode === "overall" ? "Overall Team" : selectedAgent === "all" ? "-" : selectedAgent}
                  valueTone="text-sky-700"
                />
                <SimpleListItem
                  label="Average Score"
                  value={averageScore.toFixed(2)}
                  valueTone="text-violet-700"
                />
                <SimpleListItem
                  label="Current Grade"
                  value={`${currentGradeDisplay} · ${currentStatus}`}
                  valueTone="text-slate-900"
                />
              </div>
            </InsightFamilyCard>
          </div>

          <div className="overflow-hidden rounded-[30px] border border-violet-200/80 bg-white shadow-[0_12px_32px_rgba(76,29,149,0.08)]">
            <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
            <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-6 py-5">
              <div className="text-[19px] font-bold tracking-tight text-slate-900">Agent Ranking</div>
              <div className="mt-1 text-sm text-slate-500">Performance comparison by agent in the current period selection</div>
            </div>
            <div className="p-6">
              <AgentRankingTable items={agentRanking} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}