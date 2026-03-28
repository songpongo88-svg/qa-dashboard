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

const CASE_TARGET = 10;
const TODAY = new Date();

const TOPIC_MASTER = [
  { code: "1.1", label: "Greeting & Closing Standard", max: 10 },
  { code: "1.2", label: "Accuracy of Information", max: 5 },
  { code: "1.3", label: "PDPA & Policy", max: 5 },
  { code: "2.1", label: "Case Accuracy", max: 5 },
  { code: "2.2", label: "Completeness", max: 5 },
  { code: "2.3", label: "Clarity of Steps", max: 5 },
  { code: "2.4", label: "Official Sources", max: 5 },
  { code: "3.1", label: "Root Cause & Fix", max: 10 },
  { code: "3.2", label: "Ownership", max: 5 },
  { code: "3.3", label: "Next Step", max: 5 },
  { code: "4.1", label: "Message Structure", max: 5 },
  { code: "4.2", label: "Language", max: 5 },
  { code: "4.3", label: "Tone", max: 5 },
  { code: "4.4", label: "Adaptation", max: 5 },
  { code: "5.1", label: "Process", max: 10 },
  { code: "5.2", label: "SLA", max: 5 },
  { code: "5.3", label: "Case Logging", max: 5 },
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

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-violet-200 bg-white/95 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-slate-200 px-5 py-4 text-lg font-semibold text-slate-900">
      {title}
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
          ? "rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
          : "rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-violet-50"
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
    <Panel>
      <PanelBody>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-3 text-3xl font-bold">{value}</div>
        <div className="mt-2 text-xs opacity-80">{sub}</div>
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
      className={`w-full rounded-2xl border px-4 py-4 text-left ${
        isActive
          ? "border-violet-300 bg-violet-100/80"
          : "border-violet-100 bg-violet-50/70 hover:bg-violet-100/70"
      }`}
    >
      <div className="font-semibold text-slate-900">{label}</div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-white/70 p-3">
          <div className="text-slate-500">Average Score</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{averageDisplay}</div>
        </div>
        <div className="rounded-2xl bg-white/70 p-3">
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
      className={`h-full cursor-pointer rounded-2xl border p-3 text-left transition ${
        isSelected
          ? "border-violet-300 bg-violet-100/80 shadow-sm"
          : "border-violet-100 bg-white/70 hover:bg-violet-50/80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{item.caseId}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{item.auditDate}</div>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${gradeTone(
            item.grade
          )}`}
        >
          {item.grade}
        </span>
      </div>
      <div className="mt-2 min-h-[2.5rem] text-[12px] font-medium text-slate-800">
        {item.inquiryTh}
      </div>
      <div className="mt-2 text-[10px] text-slate-500">{item.reviewStatus}</div>
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
    <div className="overflow-x-auto rounded-2xl border border-violet-100 bg-violet-50/70">
      <table className="min-w-[860px] w-full text-sm">
        <thead>
          <tr className="bg-violet-700 text-[11px] text-white">
            <th className="px-3 py-3">Topic</th>
            <th className="px-3 py-3 text-left">Description</th>
            <th className="px-3 py-3">Avg Score</th>
            <th className="px-3 py-3">Max</th>
            <th className="px-3 py-3">Avg %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.code}>
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
              return (
                <div
                  key={`${topic.code}-${topic.label}`}
                  className="rounded-xl border border-fuchsia-100 bg-white/90 p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700">
                        {topic.code}
                      </div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-slate-900">
                        {topic.label}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-lg bg-fuchsia-50 px-2.5 py-1.5 text-right">
                      <div className="text-[9px] uppercase tracking-wide text-slate-500">Score</div>
                      <div className="text-sm font-bold text-slate-900">
                        {topic.score}/{topic.max}
                      </div>
                    </div>
                  </div>

                  <div className={`mt-2 rounded-lg border px-2.5 py-2 text-[11px] ${wrap}`}>
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

                  <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Evaluation Comment
                    </div>
                    <div className="mt-1 text-[13px] leading-6 text-slate-700">
                      {topic.comment || "ยังไม่มี Evaluation Comment"}
                    </div>
                  </div>
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
          className="flex items-center justify-between rounded-2xl border border-violet-100 bg-white/70 px-4 py-3"
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
}: {
  caseCount: number;
  agentCount: number;
}) {
  const tests = [
    { name: "Raw data loaded", pass: caseCount > 0 },
    { name: "Agent list built", pass: agentCount > 0 },
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

function DashboardMockup({ currentUser }: { currentUser: any }) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedCaseKey, setSelectedCaseKey] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(formatInputDate(new Date(2026, 2, 1)));
  const [dateTo, setDateTo] = useState<string>(formatInputDate(TODAY));

  useEffect(() => {
    const loadWorkbook = async () => {
      try {
        setIsLoading(true);
        setLoadError("");

        const response = await fetch("/QA_RawData1.xlsx");
        if (!response.ok) {
          throw new Error("ไม่พบไฟล์ QA_RawData1.xlsx ในโฟลเดอร์ public");
        }

        const buffer = await response.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheet = workbook.Sheets["Raw_Data"] || workbook.Sheets[workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json<any[]>(sheet, {
          header: 1,
          defval: null,
          raw: true,
        });

        const findHeaderRowIndex = () => {
          for (let i = 0; i < rows.length; i++) {
            const row = (rows[i] || []) as any[];
            const normalized = row.map((v) => normalizeText(v));
            const hasAgent = normalized.includes("agent name");
            const hasCaseId = normalized.includes("case id");
            if (hasAgent && hasCaseId) return i;
          }
          return -1;
        };

        const headerIndex = findHeaderRowIndex();
        if (headerIndex === -1) {
          throw new Error("ไม่พบแถว Header ในไฟล์ Excel");
        }

        const headerRow = ((rows[headerIndex] || []) as any[]).map((h) => String(h ?? "").trim());
        const dataRows = rows.slice(headerIndex + 1);

        const col = (name: string) => {
          const target = normalizeText(name);
          return headerRow.findIndex((h) => normalizeText(h) === target);
        };

        const getValue = (row: any[], name: string) => {
          const idx = col(name);
          return idx >= 0 ? row[idx] : null;
        };

        const mapped: CaseItem[] = dataRows
          .filter((row) => row && getValue(row, "Agent Name") && getValue(row, "Case ID"))
          .map((row, index) => {
            const topics: Topic[] = TOPIC_MASTER.map((topic) => {
              const scoreVal = Number(getValue(row, `${topic.code} Score`) || 0);
              const score = Number.isFinite(scoreVal) ? scoreVal : 0;
              const commentVal = getValue(row, `${topic.code} Comment`);

              return {
                code: topic.code,
                label: topic.label,
                score,
                max: topic.max,
                pct: topic.max > 0 ? Math.round((score / topic.max) * 100) : 0,
                comment: commentVal ? String(commentVal).trim() : "",
              };
            });

            const finalScoreVal =
              Number(getValue(row, "Final Score")) ||
              topics.reduce((sum, topic) => sum + topic.score, 0);

            const inquiry =
              getValue(row, "Customer Inquiry") ??
              getValue(row, "Inquiry TH") ??
              getValue(row, "Inquiry");

            const weekLabel =
              getValue(row, "Week Label") ??
              getValue(row, "Week") ??
              "-";

            const caseUrl =
              getValue(row, "Case URL") ??
              getValue(row, "Case Url") ??
              getValue(row, "URL") ??
              "";

            return {
              key: `row-${index + 1}-${String(getValue(row, "Case ID")).trim()}`,
              agent: String(getValue(row, "Agent Name")).trim(),
              auditDate: formatAuditDate(getValue(row, "Audit Date")),
              weekLabel: String(weekLabel || "-").trim(),
              caseId: String(getValue(row, "Case ID")).trim(),
              caseUrl: caseUrl ? String(caseUrl).trim() : "",
              inquiryTh: inquiry ? String(inquiry).trim() : "-",
              inquiryEn: inquiry ? String(inquiry).trim() : "-",
              finalScore: finalScoreVal,
              previousScore: undefined,
              grade: scoreToGrade(finalScoreVal),
              reviewStatus: "Original",
              topics,
              revisedTopics: null,
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
    if (!selectedAgent && visibleAgentList.length > 0) {
      setSelectedAgent(visibleAgentList[0]);
      return;
    }

    if (selectedAgent && !visibleAgentList.includes(selectedAgent)) {
      setSelectedAgent(visibleAgentList[0] || "");
    }
  }, [visibleAgentList, selectedAgent]);

  const effectiveSelectedAgent =
    currentUser?.role === "Agent" && currentUser.agentName
      ? String(currentUser.agentName).trim()
      : String(selectedAgent).trim();

  const agentCases = useMemo(() => {
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

  const dashboardCases = useMemo(() => {
    if (selectedWeek === "all") return dateFilteredCases;
    return dateFilteredCases.filter((item) => item.weekLabel === selectedWeek);
  }, [dateFilteredCases, selectedWeek]);

  const activeSelectedCase =
    dashboardCases.find((item) => item.key === selectedCaseKey) ||
    dashboardCases[0] ||
    null;

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

  const summary = useMemo(() => buildAgentSummary(dateFilteredCases), [dateFilteredCases]);

  const metricAverageDisplay = summary.averageDisplay;
  const metricCaseCount = dateFilteredCases.length;
  const incentiveDisplay = formatCurrencyTHB(
    getIncentiveValue(metricCaseCount, Number(metricAverageDisplay))
  );
  const incentiveRemark = getIncentiveRemark(metricCaseCount, Number(metricAverageDisplay));

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 via-slate-50 to-fuchsia-50">
        <div className="rounded-3xl border border-violet-200 bg-white px-6 py-5 text-slate-700 shadow-sm">
          กำลังโหลด QA_RawData1.xlsx...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-50 via-slate-50 to-fuchsia-50 p-6">
        <div className="max-w-xl rounded-3xl border border-rose-200 bg-white px-6 py-5 text-rose-700 shadow-sm">
          <div className="text-lg font-semibold">โหลดไฟล์ไม่สำเร็จ</div>
          <div className="mt-2 text-sm">{loadError}</div>
          <div className="mt-3 text-sm text-slate-600">
            ตรวจสอบว่าไฟล์อยู่ที่ public/QA_RawData1.xlsx
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-slate-50 to-fuchsia-50">
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 rounded-3xl bg-gradient-to-r from-violet-700 via-fuchsia-600 to-violet-500 p-6 text-white shadow-lg">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-sm font-medium text-violet-100">QA Performance Dashboard</div>
              <h1 className="mt-2 text-3xl font-bold">
                {currentUser?.role === "Agent"
                  ? currentUser.agentName
                  : "QA Performance Dashboard"}
              </h1>
              <div className="mt-2 text-sm text-violet-100">
                Logged in as {currentUser?.displayName || "-"} ({currentUser?.role || "-"})
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
              <PanelHeader title="Quick Controls" />
              <PanelBody className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Selected Agent</label>
                  <select
                   <select
 value={effectiveSelectedAgent}
 onChange={(e) => setSelectedAgent(e.target.value)}
 disabled={currentUser?.role === "Agent"}
 className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400 disabled:bg-slate-100"
>
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
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Date To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Week Filter</label>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400"
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
              <PanelHeader title="Weekly Snapshot" />
              <PanelBody className="space-y-3">
                <WeeklySnapshotCard
                  label="All Weeks"
                  caseCount={dateFilteredCases.length}
                  averageDisplay={summary.averageDisplay}
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
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Data Health Checks" />
              <PanelBody>
                <DataHealthChecks caseCount={allCases.length} agentCount={visibleAgentList.length} />
              </PanelBody>
            </Panel>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Average Score"
                value={metricAverageDisplay}
                sub={`${metricCaseCount} / ${CASE_TARGET} cases`}
              />
              <MetricCard title="Incentive" value={incentiveDisplay} sub={incentiveRemark} />
              <MetricCard
                title="Selected Cases"
                value={`${dashboardCases.length}`}
                sub={selectedWeek === "all" ? "All visible weeks" : selectedWeek}
              />
              <MetricCard
                title="Grade"
                value={scoreToGrade(Number(metricAverageDisplay))}
                sub="Based on current average"
              />
            </div>

            <Panel>
              <PanelHeader title="Case Navigator" />
              <PanelBody>
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
              </PanelBody>
            </Panel>

            {activeSelectedCase ? (
              <Panel>
                <PanelHeader title="Case Detail" />
                <PanelBody className="space-y-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
<div className="text-sm text-slate-500">Case ID</div>
<div className="text-xl font-bold text-slate-900">{activeSelectedCase.caseId}</div>
<div className="mt-2 text-sm text-slate-700">
   {activeSelectedCase.inquiryTh}
</div>
 {activeSelectedCase.inquiryEn &&
 normalizeText(activeSelectedCase.inquiryEn) !== normalizeText(activeSelectedCase.inquiryTh) ? (
<div className="mt-1 text-sm text-slate-500">
     {activeSelectedCase.inquiryEn}
</div>
 ) : null}
</div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${gradeTone(
                          activeSelectedCase.grade
                        )}`}
                      >
                        Grade {activeSelectedCase.grade}
                      </span>
                      <ReviewStatusBadge item={activeSelectedCase} />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                      <div className="text-xs text-slate-500">Audit Date</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{activeSelectedCase.auditDate}</div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                      <div className="text-xs text-slate-500">Week</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{activeSelectedCase.weekLabel}</div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                      <div className="text-xs text-slate-500">Final Score</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{activeSelectedCase.finalScore}</div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                      <div className="text-xs text-slate-500">Case URL</div>
                      {activeSelectedCase.caseUrl ? (
                        <a
                          href={activeSelectedCase.caseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block break-all text-sm font-semibold text-violet-700 underline"
                        >
                          เปิดเคส
                        </a>
                      ) : (
                        <div className="mt-1 text-sm font-semibold text-slate-500">-</div>
                      )}
                    </div>
                  </div>

                  <CaseDetailTopicTable
                    topics={activeSelectedCase.topics}
                    revisedTopics={activeSelectedCase.revisedTopics}
                    reviewStatus={activeSelectedCase.reviewStatus}
                  />
                </PanelBody>
              </Panel>
            ) : (
              <Panel>
                <PanelHeader title="Case Detail" />
                <PanelBody>
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
                    ไม่พบเคสในช่วงวันที่เลือก
                  </div>
                </PanelBody>
              </Panel>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <Panel>
                <PanelHeader title="Topic Performance" />
                <PanelBody>
                  <TopicPerformanceTable items={summary.topicPerformance} />
                </PanelBody>
              </Panel>

              <Panel>
                <PanelHeader title="Grade Mix" />
                <PanelBody>
                  <GradeMix gradeCounts={summary.gradeCounts} />
                </PanelBody>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardMockup;
