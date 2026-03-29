import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Grade = "A" | "B" | "C" | "D" | "F";
type ReviewStatus = "Original" | "Revised";

type Topic = {
  code: string;
  label: string;
  score: number;
  max: number;
};

type CaseItem = {
  caseId: string;
  agent: string;
  auditDate: string;
  finalScore: number;
  previousScore?: number;
  reviewStatus: ReviewStatus;
  grade: Grade;
  topics: Topic[];
};

type SummaryRow = {
  label: string;
  caseCount: number;
  avgScore: number;
  revisedCount: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  gradeD: number;
  gradeF: number;
};

type TopicPerformanceRow = {
  code: string;
  label: string;
  avgScore: number;
  max: number;
  pct: number;
};

type MonthlyTopicTrendRow = {
  period: string;
  topicCode: string;
  topicLabel: string;
  avgScore: number;
  pct: number;
};

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
  "Sunijtra Siritan",
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
  return normalizeText(value).replace(/[^a-z0-9ก-๙]/g, "");
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

function formatInputDate(value: Date) {
  const y = value.getFullYear();
  const m = `${value.getMonth() + 1}`.padStart(2, "0");
  const d = `${value.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
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

function normalizeComment(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isNoAppealReason(value: unknown) {
  const text = normalizeComment(value).toLowerCase();
  if (!text) return false;
  return (
    text === "ไม่อุทธรณ์หัวข้อนี้" ||
    text === "not appeal" ||
    text === "no appeal" ||
    text.includes("ไม่อุทธรณ์")
  );
}

function hasRealTopicChange(
  originalScore: unknown,
  revisedScore: unknown,
  originalComment: unknown,
  revisedComment: unknown
) {
  const originalScoreNum =
    originalScore !== null && originalScore !== "" && !Number.isNaN(Number(originalScore))
      ? Number(originalScore)
      : null;

  const revisedScoreNum =
    revisedScore !== null && revisedScore !== "" && !Number.isNaN(Number(revisedScore))
      ? Number(revisedScore)
      : null;

  const originalCommentText = normalizeComment(originalComment);
  const revisedCommentText = normalizeComment(revisedComment);

  const scoreChanged =
    originalScoreNum !== null &&
    revisedScoreNum !== null &&
    originalScoreNum !== revisedScoreNum;

  const commentChanged =
    revisedCommentText !== "" && revisedCommentText !== originalCommentText;

  return scoreChanged || commentChanged;
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-sm ${className}`}>
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
      <div className="text-lg font-bold text-slate-900">{title}</div>
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
      <div className="h-1.5 bg-gradient-to-r from-violet-900 via-violet-700 to-fuchsia-600" />
      <PanelBody>
        <div className="text-sm font-semibold text-slate-600">{title}</div>
        <div className="mt-3 text-3xl font-bold text-slate-900">{value}</div>
        <div className="mt-2 text-xs text-slate-500">{sub}</div>
      </PanelBody>
    </Panel>
  );
}

function HighlightCard({
  title,
  value,
  sub,
  tone = "violet",
}: {
  title: string;
  value: string;
  sub: string;
  tone?: "violet" | "emerald" | "rose" | "amber";
}) {
  const toneMap = {
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-2 text-lg font-extrabold text-slate-900">{value}</div>
      <div className="mt-2 text-xs text-slate-500">{sub}</div>
      <div className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${toneMap[tone]}`}>
        Highlight
      </div>
    </div>
  );
}

function SummaryTable({ rows }: { rows: SummaryRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[980px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-white text-[11px]">
            <th className="px-3 py-3 text-left">Period</th>
            <th className="px-3 py-3">Cases</th>
            <th className="px-3 py-3">Avg Score</th>
            <th className="px-3 py-3">Revised</th>
            <th className="px-3 py-3">A</th>
            <th className="px-3 py-3">B</th>
            <th className="px-3 py-3">C</th>
            <th className="px-3 py-3">D</th>
            <th className="px-3 py-3">F</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 font-semibold text-slate-900">
                {row.label}
              </td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.caseCount}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">
                {row.avgScore.toFixed(2)}
              </td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.revisedCount}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.gradeA}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.gradeB}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.gradeC}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.gradeD}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.gradeF}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopicPerformanceTable({ rows }: { rows: TopicPerformanceRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[860px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-white text-[11px]">
            <th className="px-3 py-3">Topic</th>
            <th className="px-3 py-3 text-left">Description</th>
            <th className="px-3 py-3">Avg Score</th>
            <th className="px-3 py-3">Max</th>
            <th className="px-3 py-3">Avg %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.code}</td>
              <td className="border-t border-slate-200 px-3 py-3">{row.label}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.avgScore.toFixed(2)}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.max}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.pct.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopicRankList({
  rows,
  variant,
}: {
  rows: TopicPerformanceRow[];
  variant: "best" | "improvement";
}) {
  const tone =
    variant === "best"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div
          key={row.code}
          className="flex items-center justify-between rounded-2xl border border-violet-100 bg-white px-4 py-3"
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Rank {index + 1}
            </div>
            <div className="mt-1 text-sm font-bold text-slate-900">
              {row.code} {row.label}
            </div>
          </div>

          <div className={`rounded-full border px-3 py-1 text-xs font-bold ${tone}`}>
            {row.pct.toFixed(2)}%
          </div>
        </div>
      ))}
    </div>
  );
}

function MonthlyTopicTrendTable({ rows }: { rows: MonthlyTopicTrendRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-violet-100">
      <table className="min-w-[980px] w-full text-sm">
        <thead>
          <tr className="bg-violet-950 text-white text-[11px]">
            <th className="px-3 py-3 text-left">Month</th>
            <th className="px-3 py-3">Topic</th>
            <th className="px-3 py-3 text-left">Description</th>
            <th className="px-3 py-3">Avg Score</th>
            <th className="px-3 py-3">Avg %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.period}-${row.topicCode}-${index}`} className="bg-white">
              <td className="border-t border-slate-200 px-3 py-3 font-semibold text-slate-900">
                {row.period}
              </td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">{row.topicCode}</td>
              <td className="border-t border-slate-200 px-3 py-3">{row.topicLabel}</td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">
                {row.avgScore.toFixed(2)}
              </td>
              <td className="border-t border-slate-200 px-3 py-3 text-center">
                {row.pct.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogoBox() {
  return (
    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-sm">
      <img
        src="/robinhood-logo.png"
        alt="Robinhood Logo"
        className="h-12 w-12 object-contain"
      />
    </div>
  );
}

function buildSummaryRow(label: string, cases: CaseItem[]): SummaryRow {
  const gradeCount = { A: 0, B: 0, C: 0, D: 0, F: 0 } as Record<Grade, number>;
  cases.forEach((item) => {
    gradeCount[item.grade] += 1;
  });

  const avgScore =
    cases.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(cases.length, 1);

  return {
    label,
    caseCount: cases.length,
    avgScore,
    revisedCount: cases.filter((item) => item.reviewStatus === "Revised").length,
    gradeA: gradeCount.A,
    gradeB: gradeCount.B,
    gradeC: gradeCount.C,
    gradeD: gradeCount.D,
    gradeF: gradeCount.F,
  };
}

function buildTopicPerformance(cases: CaseItem[]): TopicPerformanceRow[] {
  return TOPIC_MASTER.map((master) => {
    const topics = cases.flatMap((item) => item.topics).filter((topic) => topic.code === master.code);

    if (!topics.length) {
      return {
        code: master.code,
        label: master.label,
        avgScore: 0,
        max: master.max,
        pct: 0,
      };
    }

    const avgScore = topics.reduce((sum, topic) => sum + topic.score, 0) / topics.length;
    const pct = (avgScore / master.max) * 100;

    return {
      code: master.code,
      label: master.label,
      avgScore,
      max: master.max,
      pct,
    };
  });
}

export default function SummaryMockup({
  currentUser,
}: {
  currentUser: any;
}) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [dateFrom, setDateFrom] = useState<string>(formatInputDate(new Date(2026, 2, 1)));
  const [dateTo, setDateTo] = useState<string>(formatInputDate(new Date()));

  useEffect(() => {
    const loadWorkbook = async () => {
      try {
        setIsLoading(true);
        setLoadError("");

        const [rawResponse, appealResponse] = await Promise.all([
          fetch("/QA_RawData1.xlsx"),
          fetch("/Appleal ROWDATA.xlsx"),
        ]);

        if (!rawResponse.ok) throw new Error("ไม่พบไฟล์ QA_RawData1.xlsx");
        if (!appealResponse.ok) throw new Error("ไม่พบไฟล์ Appleal ROWDATA.xlsx");

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

        if (rawHeaderIndex === -1) throw new Error("ไม่พบ header ของ QA_RawData1.xlsx");

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

        if (appealHeaderIndex === -1) throw new Error("ไม่พบ header ของ Appleal ROWDATA.xlsx");

        const appealHeaderRow = (appealRows[appealHeaderIndex] || []) as any[];
        const appealDataRows = appealRows.slice(appealHeaderIndex + 1);
        const appealHelper = buildHeaderHelpers(appealHeaderRow);

        const appealMap = new Map<
          string,
          {
            finalScore?: number;
            previousScore?: number;
            reviewStatus: ReviewStatus;
            revisedTopicScores: Map<string, number>;
          }
        >();

        appealDataRows.forEach((row) => {
          const caseId = String(appealHelper.getValue(row, "Case ID") ?? "").trim();
          if (!caseId) return;

          const revisedTopicScores = new Map<string, number>();
          let hasDisplayRevised = false;

          TOPIC_MASTER.forEach((topic) => {
            const originalScoreRaw = appealHelper.getValue(row, `${topic.code} Score`);
            const revisedScoreRaw = appealHelper.getValue(row, `${topic.code} Revised Score`);
            const originalCommentRaw = appealHelper.getValue(row, `${topic.code} Comment`);
            const revisedCommentRaw = appealHelper.getValue(row, `${topic.code} Revised Comment`);
            const appealReasonRaw = appealHelper.getValue(row, `${topic.code} Appeal Reason`);

            const hasRevisedScore =
              revisedScoreRaw !== null &&
              revisedScoreRaw !== "" &&
              !Number.isNaN(Number(revisedScoreRaw));

            if (hasRevisedScore) {
              revisedTopicScores.set(topic.code, Number(revisedScoreRaw));
            }

            const appealedThisTopic = !isNoAppealReason(appealReasonRaw);
            const changedThisTopic = hasRealTopicChange(
              originalScoreRaw,
              revisedScoreRaw,
              originalCommentRaw,
              revisedCommentRaw
            );

            if (appealedThisTopic && changedThisTopic) {
              hasDisplayRevised = true;
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

          if (!revisedTopicScores.size && finalScore === undefined) return;

          appealMap.set(caseId, {
            finalScore,
            previousScore,
            reviewStatus: hasDisplayRevised ? "Revised" : "Original",
            revisedTopicScores,
          });
        });

        const mapped: CaseItem[] = rawDataRows
          .filter(
            (row) => row && rawHelper.getValue(row, "Agent Name") && rawHelper.getValue(row, "Case ID")
          )
          .map((row) => {
            const caseId = String(rawHelper.getValue(row, "Case ID")).trim();

            const baseTopics: Topic[] = TOPIC_MASTER.map((topic) => {
              const rawScore = Number(rawHelper.getValue(row, `${topic.code} Score`) || 0);
              return {
                code: topic.code,
                label: topic.label,
                score: Number.isFinite(rawScore) ? rawScore : 0,
                max: topic.max,
              };
            });

            const mergedAppeal = appealMap.get(caseId);

            const mergedTopics = baseTopics.map((topic) => {
              const revisedScore = mergedAppeal?.revisedTopicScores.get(topic.code);
              return revisedScore !== undefined ? { ...topic, score: revisedScore } : topic;
            });

            const baseFinalScore =
              Number(rawHelper.getValue(row, "Final Score")) ||
              baseTopics.reduce((sum, topic) => sum + topic.score, 0);

            const finalScore =
              mergedAppeal?.finalScore ??
              mergedTopics.reduce((sum, topic) => sum + topic.score, 0);

            return {
              caseId,
              agent: String(rawHelper.getValue(row, "Agent Name") ?? "").trim(),
              auditDate: formatAuditDate(rawHelper.getValue(row, "Audit Date")),
              finalScore,
              previousScore: mergedAppeal?.previousScore ?? baseFinalScore,
              reviewStatus: mergedAppeal?.reviewStatus ?? "Original",
              grade: scoreToGrade(finalScore),
              topics: mergedTopics,
            };
          });

        setAllCases(mapped);
      } catch (error: any) {
        setLoadError(error?.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);

  const visibleAgentList = useMemo(() => {
    const mergedAgents = [...new Set(AGENT_MASTER)].sort((a, b) => a.localeCompare(b));
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return mergedAgents.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }
    return mergedAgents;
  }, [currentUser]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      setSelectedAgent(currentUser.agentName);
    }
  }, [currentUser]);

  const effectiveSelectedAgent =
    currentUser?.role === "Agent" && currentUser.agentName
      ? String(currentUser.agentName).trim()
      : String(selectedAgent || "").trim();

  const filteredCases = useMemo(() => {
    let data = allCases;

    if (effectiveSelectedAgent) {
      data = data.filter((item) => isSameAgent(item.agent, effectiveSelectedAgent));
    }

    data = data.filter((item) => {
      const audit = parseAuditDate(item.auditDate);
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      return audit >= from && audit <= to;
    });

    return data;
  }, [allCases, effectiveSelectedAgent, dateFrom, dateTo]);

  const teamRows = useMemo(() => {
    const map = new Map<string, CaseItem[]>();

    filteredCases.forEach((item) => {
      if (!map.has(item.agent)) map.set(item.agent, []);
      map.get(item.agent)!.push(item);
    });

    return [...map.entries()]
      .map(([agent, cases]) => buildSummaryRow(agent, cases))
      .sort((a, b) => b.avgScore - a.avgScore);
  }, [filteredCases]);

  const overallSummary = useMemo(() => buildSummaryRow("Overall", filteredCases), [filteredCases]);

  const monthlyRows = useMemo(() => {
    const map = new Map<string, CaseItem[]>();

    filteredCases.forEach((item) => {
      const dt = parseAuditDate(item.auditDate);
      const key = `${dt.getFullYear()}-${`${dt.getMonth() + 1}`.padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });

    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, cases]) => buildSummaryRow(label, cases));
  }, [filteredCases]);

  const yearlyRows = useMemo(() => {
    const map = new Map<string, CaseItem[]>();

    filteredCases.forEach((item) => {
      const dt = parseAuditDate(item.auditDate);
      const key = `${dt.getFullYear()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });

    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, cases]) => buildSummaryRow(label, cases));
  }, [filteredCases]);

  const topicPerformance = useMemo(() => buildTopicPerformance(filteredCases), [filteredCases]);

  const strongestTopic = useMemo(() => {
    if (!topicPerformance.length) return null;
    return [...topicPerformance].sort((a, b) => b.pct - a.pct)[0] || null;
  }, [topicPerformance]);

  const weakestTopic = useMemo(() => {
    if (!topicPerformance.length) return null;
    return [...topicPerformance].sort((a, b) => a.pct - b.pct)[0] || null;
  }, [topicPerformance]);

  const bestTopics = useMemo(() => {
    return [...topicPerformance].sort((a, b) => b.pct - a.pct).slice(0, 5);
  }, [topicPerformance]);

  const improvementTopics = useMemo(() => {
    return [...topicPerformance].sort((a, b) => a.pct - b.pct).slice(0, 5);
  }, [topicPerformance]);

  const bestMonth = useMemo(() => {
    if (!monthlyRows.length) return null;
    return [...monthlyRows].sort((a, b) => b.avgScore - a.avgScore)[0] || null;
  }, [monthlyRows]);

  const lowestMonth = useMemo(() => {
    if (!monthlyRows.length) return null;
    return [...monthlyRows].sort((a, b) => a.avgScore - b.avgScore)[0] || null;
  }, [monthlyRows]);

  const bestAgent = useMemo(() => {
    if (!teamRows.length) return null;
    return teamRows[0];
  }, [teamRows]);

  const lowestAgent = useMemo(() => {
    if (!teamRows.length) return null;
    return teamRows[teamRows.length - 1];
  }, [teamRows]);

  const monthlyTopicTrend = useMemo(() => {
    const monthMap = new Map<string, CaseItem[]>();

    filteredCases.forEach((item) => {
      const dt = parseAuditDate(item.auditDate);
      const key = `${dt.getFullYear()}-${`${dt.getMonth() + 1}`.padStart(2, "0")}`;
      if (!monthMap.has(key)) monthMap.set(key, []);
      monthMap.get(key)!.push(item);
    });

    const rows: MonthlyTopicTrendRow[] = [];

    [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([period, cases]) => {
        const perf = buildTopicPerformance(cases)
          .sort((a, b) => a.pct - b.pct)
          .slice(0, 5);

        perf.forEach((topic) => {
          rows.push({
            period,
            topicCode: topic.code,
            topicLabel: topic.label,
            avgScore: topic.avgScore,
            pct: topic.pct,
          });
        });
      });

    return rows;
  }, [filteredCases]);

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
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-xl rounded-3xl border border-rose-200 bg-white px-6 py-5 text-rose-700 shadow-sm">
          <div className="text-lg font-semibold">โหลด Summary ไม่สำเร็จ</div>
          <div className="mt-2 text-sm">{loadError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-gradient-to-r from-violet-950 via-violet-900 to-fuchsia-800 text-white">
        <div className="mx-auto max-w-[1700px] px-6 py-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-200">
                QA Summary
              </div>
              <div className="mt-2 text-3xl font-bold tracking-tight">
                Overall / Monthly / Yearly Summary
              </div>
              <div className="mt-2 max-w-3xl text-sm text-violet-100">
                สรุปจาก QA_RawData1.xlsx และ merge revised score จาก Appleal ROWDATA.xlsx
              </div>
            </div>

            <LogoBox />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1700px] px-6 py-6 space-y-6">
        <Panel>
          <PanelHeader title="Filters" subtitle="Agent and date range" />
          <PanelBody className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Agent
              </div>
              {currentUser?.role === "Agent" ? (
                <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-800">
                  {effectiveSelectedAgent || "-"}
                </div>
              ) : (
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
                >
                  <option value="">All Agents</option>
                  {visibleAgentList.map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Date From
              </div>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
              />
            </div>

            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Date To
              </div>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none"
              />
            </div>
          </PanelBody>
        </Panel>

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard
            title="Overall Cases"
            value={`${overallSummary.caseCount}`}
            sub="cases in current filter"
          />
          <MetricCard
            title="Overall Avg Score"
            value={overallSummary.avgScore.toFixed(2)}
            sub="latest score logic"
          />
          <MetricCard
            title="Revised Cases"
            value={`${overallSummary.revisedCount}`}
            sub="cases updated by appeal"
          />
          <MetricCard
            title="A Grade Cases"
            value={`${overallSummary.gradeA}`}
            sub="grade A in current filter"
          />
        </div>

        <Panel>
          <PanelHeader title="Performance Highlights" subtitle="Quick insight from current filter" />
          <PanelBody>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              <HighlightCard
                title="Strongest Topic"
                value={strongestTopic ? `${strongestTopic.code} ${strongestTopic.label}` : "-"}
                sub={strongestTopic ? `${strongestTopic.pct.toFixed(2)}% average` : "-"}
                tone="emerald"
              />
              <HighlightCard
                title="Main Concern"
                value={weakestTopic ? `${weakestTopic.code} ${weakestTopic.label}` : "-"}
                sub={weakestTopic ? `${weakestTopic.pct.toFixed(2)}% average` : "-"}
                tone="rose"
              />
              <HighlightCard
                title="Best Month"
                value={bestMonth ? bestMonth.label : "-"}
                sub={bestMonth ? `${bestMonth.avgScore.toFixed(2)} average score` : "-"}
                tone="violet"
              />
              <HighlightCard
                title="Lowest Month"
                value={lowestMonth ? lowestMonth.label : "-"}
                sub={lowestMonth ? `${lowestMonth.avgScore.toFixed(2)} average score` : "-"}
                tone="amber"
              />
              <HighlightCard
                title="Top Agent"
                value={bestAgent ? bestAgent.label : "-"}
                sub={bestAgent ? `${bestAgent.avgScore.toFixed(2)} average score` : "-"}
                tone="emerald"
              />
              <HighlightCard
                title="Lowest Agent"
                value={lowestAgent ? lowestAgent.label : "-"}
                sub={lowestAgent ? `${lowestAgent.avgScore.toFixed(2)} average score` : "-"}
                tone="rose"
              />
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Topic Performance Overview" subtitle="Average score by topic from current filter" />
          <PanelBody>
            <TopicPerformanceTable rows={topicPerformance} />
          </PanelBody>
        </Panel>

        <div className="grid gap-6 xl:grid-cols-2">
          <Panel>
            <PanelHeader title="Best Performance Topics" subtitle="Top 5 strongest topics" />
            <PanelBody>
              <TopicRankList rows={bestTopics} variant="best" />
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Improvement Focus Topics" subtitle="Top 5 topics needing attention" />
            <PanelBody>
              <TopicRankList rows={improvementTopics} variant="improvement" />
            </PanelBody>
          </Panel>
        </div>

        <Panel>
          <PanelHeader title="Team Summary" subtitle="Average score by agent in current filter" />
          <PanelBody>
            <SummaryTable rows={teamRows} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Monthly Topic Trend" subtitle="Top 5 weakest topics in each month" />
          <PanelBody>
            <MonthlyTopicTrendTable rows={monthlyTopicTrend} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Overall Summary" subtitle="Current filtered result" />
          <PanelBody>
            <SummaryTable rows={[overallSummary]} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Monthly Summary" subtitle="Grouped by audit month" />
          <PanelBody>
            <SummaryTable rows={monthlyRows} />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Yearly Summary" subtitle="Grouped by audit year" />
          <PanelBody>
            <SummaryTable rows={yearlyRows} />
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}