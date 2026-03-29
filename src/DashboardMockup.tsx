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
  weekLabel: string;
  caseId: string;
  caseUrl?: string;
  inquiryTh: string;
  inquiryEn: string;
  finalScore: number;
  previousScore?: number;
  grade: Grade;
  reviewStatus: ReviewStatus;
  topics: Topic[];
  revisedTopics?: Topic[] | null;
};

type TopicSummary = {
  code: string;
  label: string;
  avgScore: string;
  max: number;
  pct: string;
};

type Summary = {
  averageDisplay: string;
  gradeCounts: Record<Grade, number>;
  topicPerformance: TopicSummary[];
};

type AppealMergeItem = {
  caseId: string;
  finalScore?: number;
  previousScore?: number;
  reviewStatus?: ReviewStatus;
  revisedTopics: Topic[];
};

const CASE_TARGET = 10;
const TODAY = new Date();

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

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function gradeTone(grade: Grade) {
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

function reviewTone(reviewStatus: ReviewStatus) {
  return reviewStatus === "Revised"
    ? "border-violet-200 bg-violet-50 text-violet-700"
    : "border-slate-200 bg-slate-50 text-slate-700";
}

function formatInputDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function parseAuditDate(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day);
}

function isWithinDateRange(auditDate: string, from?: string, to?: string) {
  const date = parseAuditDate(auditDate);
  if (from) {
    const fromDate = new Date(from);
    if (date < fromDate) return false;
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    if (date > toDate) return false;
  }
  return true;
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

function getIncentiveRemark(caseCount: number, avg: number) {
  if (caseCount < CASE_TARGET) return "ยังประเมินไม่ครบ 10 เคส";
  if (avg >= 90) return "Excellent";
  if (avg >= 80) return "Good";
  if (avg >= 70) return "Fair";
  return "Improvement Required";
}

function buildAgentSummary(cases: CaseItem[]): Summary {
  const average =
    cases.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(cases.length, 1);

  const gradeCounts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const item of cases) gradeCounts[item.grade] += 1;

  const topicPerformance = TOPIC_MASTER.map((master) => {
    const topics = cases
      .flatMap((item) =>
        item.reviewStatus === "Revised" && item.revisedTopics?.length
          ? item.revisedTopics
          : item.topics
      )
      .filter((topic) => topic.code === master.code);

    if (!topics.length) {
      return {
        code: master.code,
        label: master.label,
        avgScore: "-",
        max: master.max,
        pct: "-",
      };
    }

    const avg = topics.reduce((sum, topic) => sum + topic.score, 0) / topics.length;
    return {
      code: master.code,
      label: master.label,
      avgScore: avg.toFixed(2),
      max: master.max,
      pct: ((avg / master.max) * 100).toFixed(2),
    };
  });

  return {
    averageDisplay: average.toFixed(2),
    gradeCounts,
    topicPerformance,
  };
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
      className={`overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm ${className}`}
    >
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
  return (
    <div className="border-b border-violet-100 bg-white px-5 py-4">
      <div className="text-lg font-semibold text-slate-900">{title}</div>
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
  return <div className={`p-5 ${className}`}>{children}</div>;
}

function SmallButton({
  children,
  onClick,
  dark = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        dark
          ? "rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
          : "rounded-2xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50"
      }
    >
      {children}
    </button>
  );
}

function MetricCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string;
  sub: string;
}) {
  return (
    <Panel className="overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-violet-900 via-violet-700 to-fuchsia-600" />
      <PanelBody>
        <div className="text-sm font-semibold text-slate-600">{title}</div>
        <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
        <div className="mt-2 text-xs text-slate-500">{sub}</div>
      </PanelBody>
    </Panel>
  );
}

function WeeklySnapshotCard({
  label,
  caseCount,
  averageDisplay,
  isActive,
  onClick,
}: {
  label: string;
  caseCount: number;
  averageDisplay: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
        isActive
          ? "border-violet-400 bg-violet-100 shadow-sm"
          : "border-violet-100 bg-violet-50 hover:bg-violet-100/70"
      }`}
    >
      <div className="font-semibold text-slate-900">{label}</div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-white p-3">
          <div className="text-slate-500">Average Score</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{averageDisplay}</div>
        </div>
        <div className="rounded-2xl bg-white p-3">
          <div className="text-slate-500">Cases</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{caseCount}</div>
        </div>
      </div>
    </button>
  );
}

function CaseNavigatorCard({
  item,
  isSelected,
  onSelect,
}: {
  item: CaseItem;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`h-full cursor-pointer rounded-2xl border p-4 text-left transition ${
        isSelected
          ? "border-violet-400 bg-violet-100 shadow-sm"
          : "border-violet-100 bg-white hover:bg-violet-50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">
            {item.caseId}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">{item.auditDate}</div>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${gradeTone(
              item.grade
            )}`}
          >
            {item.grade}
          </span>

          {item.reviewStatus === "Revised" ? (
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
              Revised
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 min-h-[2.75rem] text-[12px] font-medium leading-5 text-slate-800">
        {item.inquiryTh}
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
        <span>{item.weekLabel}</span>

        {item.reviewStatus === "Revised" && typeof item.previousScore === "number" ? (
          <span className="font-semibold text-violet-700">
            {item.previousScore.toFixed(0)} → {item.finalScore.toFixed(0)}
          </span>
        ) : (
          <span>{item.reviewStatus}</span>
        )}
      </div>
    </div>
  );
}

function ReviewStatusBadge({ item }: { item: CaseItem }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${reviewTone(
          item.reviewStatus
        )}`}
      >
        {item.reviewStatus}
      </span>
      {item.reviewStatus === "Revised" && typeof item.previousScore === "number" ? (
        <span className="text-xs font-medium text-violet-700">
          {Math.round(item.previousScore)} → {Math.round(item.finalScore)}
        </span>
      ) : null}
    </div>
  );
}

function TopicPerformanceTable({ items }: { items: TopicSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[860px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-[11px] text-white">
            <th className="px-3 py-3">Topic</th>
            <th className="px-3 py-3 text-left">Description</th>
            <th className="px-3 py-3">Avg Score</th>
            <th className="px-3 py-3">Max</th>
            <th className="px-3 py-3">Avg %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.code} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.code}</td>
              <td className="border-t border-slate-200 px-3 py-3">{entry.label}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.avgScore}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{entry.max}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">
                {entry.pct === "-" ? "-" : `${entry.pct}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getOriginalTopicMap(topics: Topic[]) {
  return new Map(topics.map((topic) => [topic.code, topic]));
}

function isTopicChanged(originalTopic: Topic | undefined, revisedTopic: Topic) {
  if (!originalTopic) return false;

  const scoreChanged = originalTopic.score !== revisedTopic.score;
  const commentChanged =
    String(originalTopic.comment || "").trim() !==
    String(revisedTopic.comment || "").trim();

  return scoreChanged || commentChanged;
}

function CaseDetailTopicTable({
  topics,
  revisedTopics,
  reviewStatus,
}: {
  topics: Topic[];
  revisedTopics?: Topic[] | null;
  reviewStatus?: ReviewStatus;
}) {
  const activeTopics =
    reviewStatus === "Revised" && revisedTopics?.length ? revisedTopics : topics;

  const originalMap = getOriginalTopicMap(topics);

  const columns = [
    activeTopics.filter((_, i) => i % 2 === 0),
    activeTopics.filter((_, i) => i % 2 === 1),
  ];

  const getTone = (pct: number): [string, string] => {
    if (pct >= 80) return ["ดี", "bg-emerald-50 text-emerald-700 border-emerald-200"];
    if (pct >= 60) return ["กลาง", "bg-amber-50 text-amber-700 border-amber-200"];
    return ["ควรปรับปรุง", "bg-rose-50 text-rose-700 border-rose-200"];
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-2">
        {columns.map((group, idx) => (
          <div key={idx} className="space-y-3">
            {group.map((topic) => {
              const [label, wrap] = getTone(topic.pct);
              const originalTopic = originalMap.get(topic.code);
              const changed =
                reviewStatus === "Revised" &&
                revisedTopics?.length &&
                isTopicChanged(originalTopic, topic);

              return (
                <div
                  key={`${topic.code}-${topic.label}`}
                  className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                        {topic.code}
                      </div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-slate-900">
                        {topic.label}
                      </div>
                    </div>

                    <div className="shrink-0 rounded-xl bg-violet-50 px-3 py-2 text-right">
                      <div className="text-[9px] uppercase tracking-wide text-slate-500">
                        Score
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {topic.score}/{topic.max}
                      </div>
                    </div>
                  </div>

                  {changed && originalTopic ? (
                    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[12px] text-violet-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">Revised Topic</span>
                        <span className="rounded-full border border-violet-300 px-2 py-0.5 text-[10px] font-semibold">
                          {originalTopic.score} → {topic.score}
                        </span>
                      </div>

                      {String(originalTopic.comment || "").trim() !==
                      String(topic.comment || "").trim() ? (
                        <div className="mt-2 text-[11px] text-violet-700">
                          Comment updated
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className={`mt-3 rounded-xl border px-3 py-2 text-[11px] ${wrap}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">Percent</div>
                        <div className="mt-1 text-sm font-semibold">{topic.pct}%</div>
                      </div>
                      <span className="rounded-full border border-current px-2 py-0.5 text-[10px] font-semibold">
                        {label}
                      </span>
                    </div>
                  </div>

                  {changed && originalTopic ? (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Original Comment
                        </div>
                        <div className="mt-1 text-[13px] leading-6 text-slate-700 whitespace-pre-line">
                          {originalTopic.comment || "ยังไม่มี Evaluation Comment"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                          Revised Comment
                        </div>
                        <div className="mt-1 text-[13px] leading-6 text-slate-800 whitespace-pre-line">
                          {topic.comment || "ยังไม่มี Revised Comment"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Evaluation Comment
                      </div>
                      <div className="mt-1 text-[13px] leading-6 text-slate-700 whitespace-pre-line">
                        {topic.comment || "ยังไม่มี Evaluation Comment"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function GradeMix({ gradeCounts }: { gradeCounts: Record<Grade, number> }) {
  return (
    <div className="space-y-3">
      {(Object.keys(gradeCounts) as Grade[]).map((grade) => (
        <div
          key={grade}
          className="flex items-center justify-between rounded-2xl border border-violet-100 bg-white px-4 py-3"
        >
          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(grade)}`}>
            {grade}
          </span>
          <span className="text-sm font-semibold text-slate-900">{gradeCounts[grade]} Case(s)</span>
        </div>
      ))}
    </div>
  );
}

function DataHealthChecks({
  caseCount,
  agentCount,
  appealCount,
}: {
  caseCount: number;
  agentCount: number;
  appealCount: number;
}) {
  const tests = [
    { name: "Raw data loaded", pass: caseCount > 0 },
    { name: "Agent list built", pass: agentCount > 0 },
    { name: "Appeal merge loaded", pass: appealCount > 0 },
    { name: "Case URL available", pass: true },
  ];

  return (
    <div className="space-y-2">
      {tests.map((test) => (
        <div
          key={test.name}
          className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm ${
            test.pass
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span>{test.name}</span>
          <span className="font-semibold">{test.pass ? "PASS" : "FAIL"}</span>
        </div>
      ))}
    </div>
  );
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

export default function DashboardMockup({
  currentUser,
  dashboardSubTab,
  externalSelectedAgent,
  onSelectedAgentChange,
}: {
  currentUser: any;
  dashboardSubTab: "overview" | "case-detail";
  externalSelectedAgent?: string;
  onSelectedAgentChange?: (agentName: string) => void;
}) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>(externalSelectedAgent || "");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedCaseKey, setSelectedCaseKey] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(formatInputDate(new Date(2026, 2, 1)));
  const [dateTo, setDateTo] = useState<string>(formatInputDate(TODAY));
  const [appealMergeCount, setAppealMergeCount] = useState(0);
  const [overviewMode, setOverviewMode] = useState<"all" | "originalOnly" | "revisedOnly">("all");

  useEffect(() => {
    if (
      currentUser?.role !== "Agent" &&
      typeof externalSelectedAgent === "string" &&
      externalSelectedAgent !== selectedAgent
    ) {
      setSelectedAgent(externalSelectedAgent);
    }
  }, [externalSelectedAgent, currentUser, selectedAgent]);

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
            if (normalized.includes("case id")) {
              return i;
            }
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

          const revisedTopics: Topic[] = TOPIC_MASTER.map((topic) => {
            const revisedScoreRaw = appealHelper.getValue(row, `${topic.code} Revised Score`);
            const revisedCommentRaw = appealHelper.getValue(row, `${topic.code} Revised Comment`);
            const originalScoreRaw = appealHelper.getValue(row, `${topic.code} Score`);
            const originalCommentRaw = appealHelper.getValue(row, `${topic.code} Comment`);

            const hasRevisedScore =
              revisedScoreRaw !== null &&
              revisedScoreRaw !== "" &&
              !Number.isNaN(Number(revisedScoreRaw));

            const hasRevisedComment =
              revisedCommentRaw !== null &&
              String(revisedCommentRaw).trim() !== "";

            if (!hasRevisedScore && !hasRevisedComment) return null;

            const score = hasRevisedScore ? Number(revisedScoreRaw) : Number(originalScoreRaw ?? 0);
            const comment = hasRevisedComment
              ? String(revisedCommentRaw).trim()
              : String(originalCommentRaw ?? "").trim();

            return {
              code: topic.code,
              label: topic.label,
              score,
              max: topic.max,
              pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,
              comment,
            };
          }).filter(Boolean) as Topic[];

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
            reviewStatus: revisedTopics.length ? "Revised" : "Original",
            revisedTopics,
          });
        });

        setAppealMergeCount(appealMap.size);

        const mapped: CaseItem[] = rawDataRows
          .filter((row) => row && rawHelper.getValue(row, "Agent Name") && rawHelper.getValue(row, "Case ID"))
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

            const caseUrl =
              rawHelper.getValue(row, "Case URL") ??
              rawHelper.getValue(row, "Case Url") ??
              rawHelper.getValue(row, "URL") ??
              "";

            const reviewStatus: ReviewStatus =
              mergedAppeal?.revisedTopics?.length ? "Revised" : "Original";

            return {
              key: `row-${index + 1}-${caseId}`,
              agent: String(rawHelper.getValue(row, "Agent Name")).trim(),
              auditDate: formatAuditDate(rawHelper.getValue(row, "Audit Date")),
              weekLabel: String(weekLabel || "-").trim(),
              caseId,
              caseUrl: caseUrl ? String(caseUrl).trim() : "",
              inquiryTh: inquiry ? String(inquiry).trim() : "-",
              inquiryEn: inquiry ? String(inquiry).trim() : "-",
              finalScore: finalScoreVal,
              previousScore: previousScoreVal,
              grade: scoreToGrade(finalScoreVal),
              reviewStatus,
              topics,
              revisedTopics: mergedAppeal?.revisedTopics?.length ? mergedAppeal.revisedTopics : null,
            };
          });

        const cleaned = mapped.filter((item) => item.agent && item.caseId && item.auditDate);
        setAllCases(cleaned);
      } catch (error: any) {
        console.error("Load Error:", error);
        setLoadError(error?.message || "โหลดไฟล์ Excel ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);

  const visibleAgentList = useMemo(() => {
    const agents = [...new Set(allCases.map((item) => String(item.agent).trim()))].sort((a, b) =>
      a.localeCompare(b)
    );

    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return agents.filter(
        (agent) => normalizeText(agent) === normalizeText(currentUser.agentName)
      );
    }

    return agents;
  }, [allCases, currentUser]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      if (selectedAgent !== currentUser.agentName) {
        setSelectedAgent(currentUser.agentName);
      }
      onSelectedAgentChange?.(currentUser.agentName);
      return;
    }

    if (selectedAgent && !visibleAgentList.includes(selectedAgent)) {
      setSelectedAgent("");
      onSelectedAgentChange?.("");
    }
  }, [currentUser, visibleAgentList, selectedAgent, onSelectedAgentChange]);

  const effectiveSelectedAgent =
    currentUser?.role === "Agent" && currentUser.agentName
      ? String(currentUser.agentName).trim()
      : String(selectedAgent || "").trim();

  const agentCases = useMemo(() => {
    if (!effectiveSelectedAgent) return [];
    return allCases.filter(
      (item) => normalizeText(item.agent) === normalizeText(effectiveSelectedAgent)
    );
  }, [allCases, effectiveSelectedAgent]);

  const dateFilteredCases = useMemo(() => {
    return agentCases.filter((item) => isWithinDateRange(item.auditDate, dateFrom, dateTo));
  }, [agentCases, dateFrom, dateTo]);

  const weekLabels = useMemo(() => {
    return [...new Set(dateFilteredCases.map((item) => item.weekLabel))];
  }, [dateFilteredCases]);

  const dashboardCasesBase = useMemo(() => {
    if (selectedWeek === "all") return dateFilteredCases;
    return dateFilteredCases.filter((item) => item.weekLabel === selectedWeek);
  }, [dateFilteredCases, selectedWeek]);

  const revisedCount = useMemo(
    () => dashboardCasesBase.filter((item) => item.reviewStatus === "Revised").length,
    [dashboardCasesBase]
  );

  const dashboardCases = useMemo(() => {
    if (overviewMode === "revisedOnly") {
      return dashboardCasesBase.filter((item) => item.reviewStatus === "Revised");
    }
    if (overviewMode === "originalOnly") {
      return dashboardCasesBase.filter((item) => item.reviewStatus === "Original");
    }
    return dashboardCasesBase;
  }, [dashboardCasesBase, overviewMode]);

  const activeSelectedCase =
    dashboardCases.find((item) => item.key === selectedCaseKey) || dashboardCases[0] || null;

  useEffect(() => {
    if (!dashboardCases.length) {
      if (selectedCaseKey !== "") setSelectedCaseKey("");
      return;
    }

    const stillExists = dashboardCases.some((item) => item.key === selectedCaseKey);
    if (!stillExists) {
      setSelectedCaseKey(dashboardCases[0].key);
    }
  }, [dashboardCases, selectedCaseKey]);

  const summary = useMemo(() => buildAgentSummary(dashboardCases), [dashboardCases]);

  const metricAverageDisplay = summary.averageDisplay;
  const metricCaseCount = dashboardCases.length;
  const incentiveDisplay = formatCurrencyTHB(
    getIncentiveValue(metricCaseCount, Number(metricAverageDisplay))
  );
  const incentiveRemark = getIncentiveRemark(metricCaseCount, Number(metricAverageDisplay));

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-3xl border border-violet-200 bg-white px-6 py-5 text-slate-700 shadow-sm">
          กำลังโหลด QA_RawData1.xlsx + Appleal ROWDATA.xlsx...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
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
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 px-6 py-5 text-white shadow-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
                  Robinhood QA Analytics
                </div>
                <h1 className="mt-3 text-3xl font-bold leading-tight">
                  {currentUser?.role === "Agent"
                    ? currentUser.agentName
                    : "QA Performance Dashboard"}
                </h1>
                <div className="mt-2 text-sm text-violet-100">
                  Logged in as {currentUser?.displayName || "-"} ({currentUser?.role || "-"})
                </div>
              </div>

              <div className="shrink-0">
                <img
                  src="/robinhood-logo.PNG"
                  alt="Robinhood Logo"
                  className="h-28 w-28 rounded-3xl object-cover shadow-xl"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <SmallButton onClick={() => window.print()}>Print / Save PDF</SmallButton>
              <SmallButton onClick={() => window.print()} dark>
                Export
              </SmallButton>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel>
              <PanelHeader title="Quick Controls" subtitle="Filter dashboard by agent, date, and week" />
              <PanelBody className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">
                    Selected Agent
                  </label>
                  <select
                    value={effectiveSelectedAgent}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSelectedAgent(value);
                      onSelectedAgentChange?.(value);
                    }}
                    disabled={currentUser?.role === "Agent"}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 disabled:bg-slate-100"
                  >
                    {currentUser?.role !== "Agent" ? (
                      <option value="">-- Select Agent --</option>
                    ) : null}

                    {visibleAgentList.map((agent) => (
                      <option key={agent} value={agent}>
                        {agent}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Date From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Date To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Week Filter</label>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                    disabled={!effectiveSelectedAgent}
                  >
                    <option value="all">All Weeks</option>
                    {weekLabels.map((week) => (
                      <option key={week} value={week}>
                        {week}
                      </option>
                    ))}
                  </select>
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Weekly Snapshot" subtitle="Quick summary of visible weeks" />
              <PanelBody className="space-y-3">
                {!effectiveSelectedAgent ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                    กรุณาเลือก Agent ก่อน
                  </div>
                ) : (
                  <>
                    <WeeklySnapshotCard
                      label="All Weeks"
                      caseCount={dateFilteredCases.length}
                      averageDisplay={buildAgentSummary(dateFilteredCases).averageDisplay}
                      isActive={selectedWeek === "all"}
                      onClick={() => setSelectedWeek("all")}
                    />

                    {weekLabels.map((week) => {
                      const weekCases = dateFilteredCases.filter((item) => item.weekLabel === week);
                      const weekSummary = buildAgentSummary(weekCases);

                      return (
                        <WeeklySnapshotCard
                          key={week}
                          label={week}
                          caseCount={weekCases.length}
                          averageDisplay={weekSummary.averageDisplay}
                          isActive={selectedWeek === week}
                          onClick={() => setSelectedWeek(week)}
                        />
                      );
                    })}
                  </>
                )}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Data Health Checks" subtitle="System and data validation status" />
              <PanelBody>
                <DataHealthChecks
                  caseCount={allCases.length}
                  agentCount={visibleAgentList.length}
                  appealCount={appealMergeCount}
                />
              </PanelBody>
            </Panel>
          </div>

          <div className="space-y-6">
            {!effectiveSelectedAgent ? (
              <Panel>
                <PanelHeader title="Dashboard" />
                <PanelBody>
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    กรุณาเลือก Agent จาก Quick Controls ก่อน
                  </div>
                </PanelBody>
              </Panel>
            ) : dashboardSubTab === "overview" ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    title="Average Score"
                    value={metricAverageDisplay}
                    sub={`${metricCaseCount} case(s) in current view`}
                  />
                  <MetricCard
                    title="Evaluation Progress"
                    value={`${metricCaseCount}/${CASE_TARGET}`}
                    sub={metricCaseCount >= CASE_TARGET ? "Target reached" : "Target not reached"}
                  />
                  <MetricCard
                    title="Estimated Incentive"
                    value={incentiveDisplay}
                    sub={incentiveRemark}
                  />
                  <MetricCard
                    title="Review Mix"
                    value={`${dashboardCases.filter((c) => c.reviewStatus === "Revised").length}`}
                    sub="Revised case(s) in current view"
                  />
                </div>

                <Panel>
                  <PanelHeader
                    title="Overview Filters"
                    subtitle="Control which cases are shown in overview"
                  />
                  <PanelBody>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setOverviewMode("all")}
                        className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                          overviewMode === "all"
                            ? "border-violet-400 bg-violet-100 text-violet-800"
                            : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
                        }`}
                      >
                        All Cases
                      </button>

                      <button
                        type="button"
                        onClick={() => setOverviewMode("originalOnly")}
                        className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                          overviewMode === "originalOnly"
                            ? "border-violet-400 bg-violet-100 text-violet-800"
                            : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
                        }`}
                      >
                        Original Only
                      </button>

                      <button
                        type="button"
                        onClick={() => setOverviewMode("revisedOnly")}
                        className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                          overviewMode === "revisedOnly"
                            ? "border-violet-400 bg-violet-100 text-violet-800"
                            : "border-violet-200 bg-white text-violet-700 hover:bg-violet-50"
                        }`}
                      >
                        Revised Only ({revisedCount})
                      </button>
                    </div>
                  </PanelBody>
                </Panel>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <Panel>
                    <PanelHeader
                      title="Case Navigator"
                      subtitle={
                        overviewMode === "revisedOnly"
                          ? `Showing revised cases only (${revisedCount})`
                          : overviewMode === "originalOnly"
                          ? "Showing original cases only"
                          : "Select a case to review details"
                      }
                    />
                    <PanelBody>
                      {dashboardCases.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                          ไม่มีเคสในเงื่อนไขที่เลือก
                        </div>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                          {dashboardCases.map((item) => (
                            <CaseNavigatorCard
                              key={item.key}
                              item={item}
                              isSelected={activeSelectedCase?.key === item.key}
                              onSelect={() => setSelectedCaseKey(item.key)}
                            />
                          ))}
                        </div>
                      )}
                    </PanelBody>
                  </Panel>

                  <Panel>
                    <PanelHeader title="Grade Distribution" subtitle="Visible case mix" />
                    <PanelBody>
                      <GradeMix gradeCounts={summary.gradeCounts} />
                    </PanelBody>
                  </Panel>
                </div>

                <Panel>
                  <PanelHeader
                    title="Topic Performance"
                    subtitle="Average by topic using revised scores when available"
                  />
                  <PanelBody>
                    {dashboardCases.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                        ไม่มีข้อมูลในเงื่อนไขที่เลือก
                      </div>
                    ) : (
                      <TopicPerformanceTable items={summary.topicPerformance} />
                    )}
                  </PanelBody>
                </Panel>
              </>
            ) : (
              <div className="space-y-6">
                <Panel>
                  <PanelHeader
                    title="Case Selector"
                    subtitle="Select a case from current filtered results"
                  />
                  <PanelBody>
                    {dashboardCases.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                        ไม่มีเคสในเงื่อนไขที่เลือก
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {dashboardCases.map((item) => (
                          <CaseNavigatorCard
                            key={item.key}
                            item={item}
                            isSelected={activeSelectedCase?.key === item.key}
                            onSelect={() => setSelectedCaseKey(item.key)}
                          />
                        ))}
                      </div>
                    )}
                  </PanelBody>
                </Panel>

                <Panel>
                  <PanelHeader
                    title="Case Detail"
                    subtitle="Uses merged appeal data automatically when revised rows exist"
                  />
                  <PanelBody>
                    {!activeSelectedCase ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                        กรุณาเลือกเคส
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
                          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">
                                  {activeSelectedCase.weekLabel}
                                </div>
                                <div className="mt-1 text-2xl font-bold text-slate-900">
                                  {activeSelectedCase.caseId}
                                </div>
                                <div className="mt-2 text-sm text-slate-600">
                                  {activeSelectedCase.auditDate} • {activeSelectedCase.agent}
                                </div>
                              </div>
                              <ReviewStatusBadge item={activeSelectedCase} />
                            </div>

                            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-2xl bg-white p-4">
                                <div className="text-xs text-slate-500">Final Score</div>
                                <div className="mt-1 text-2xl font-bold text-slate-900">
                                  {activeSelectedCase.finalScore.toFixed(2)}
                                </div>
                              </div>

                              <div className="rounded-2xl bg-white p-4">
                                <div className="text-xs text-slate-500">Previous Score</div>
                                <div className="mt-1 text-2xl font-bold text-slate-900">
                                  {typeof activeSelectedCase.previousScore === "number"
                                    ? activeSelectedCase.previousScore.toFixed(2)
                                    : "-"}
                                </div>
                              </div>

                              <div className="rounded-2xl bg-white p-4">
                                <div className="text-xs text-slate-500">Grade</div>
                                <div className="mt-2">
                                  <span
                                    className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${gradeTone(
                                      activeSelectedCase.grade
                                    )}`}
                                  >
                                    {activeSelectedCase.grade}
                                  </span>
                                </div>
                              </div>

                              <div className="rounded-2xl bg-white p-4">
                                <div className="text-xs text-slate-500">Case URL</div>
                                <div className="mt-2 text-sm text-slate-700 break-all">
                                  {activeSelectedCase.caseUrl ? (
                                    <a
                                      href={activeSelectedCase.caseUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-medium text-violet-700 underline"
                                    >
                                      Open Link
                                    </a>
                                  ) : (
                                    "-"
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="mt-5 rounded-2xl bg-white p-4">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Customer Inquiry
                              </div>
                              <div className="mt-2 text-sm leading-6 text-slate-800">
                                {activeSelectedCase.inquiryTh || "-"}
                              </div>
                              {activeSelectedCase.inquiryEn &&
                              activeSelectedCase.inquiryEn !== activeSelectedCase.inquiryTh ? (
                                <div className="mt-2 text-sm leading-6 text-slate-500">
                                  {activeSelectedCase.inquiryEn}
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="rounded-2xl border border-violet-100 bg-white p-4">
                              <div className="text-xs text-slate-500">Scoring Basis</div>
                              <div className="mt-2 text-sm font-semibold text-slate-900">
                                {activeSelectedCase.reviewStatus === "Revised" &&
                                activeSelectedCase.revisedTopics?.length
                                  ? "Showing Merged Revised Topics"
                                  : "Showing Original Topics"}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-violet-100 bg-white p-4">
                              <div className="text-xs text-slate-500">Score Movement</div>
                              <div className="mt-2 text-sm font-semibold text-slate-900">
                                {typeof activeSelectedCase.previousScore === "number"
                                  ? `${activeSelectedCase.previousScore.toFixed(2)} → ${activeSelectedCase.finalScore.toFixed(2)}`
                                  : activeSelectedCase.finalScore.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        </div>

                        <CaseDetailTopicTable
                          topics={activeSelectedCase.topics}
                          revisedTopics={activeSelectedCase.revisedTopics}
                          reviewStatus={activeSelectedCase.reviewStatus}
                        />
                      </div>
                    )}
                  </PanelBody>
                </Panel>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
