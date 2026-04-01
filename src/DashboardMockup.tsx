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
  auditYear: number | null;
  auditMonth: number | null;
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

type DashboardProps = {
  currentUser: any;
  dashboardSubTab?: "overview" | "case-detail";
  externalSelectedAgent?: string;
  onSelectedAgentChange?: (value: string) => void;
  onOpenCaseDetail?: () => void;
};

type AppealMergeItem = {
  caseId: string;
  finalScore?: number;
  previousScore?: number;
  revisedTopics: Topic[];
  displayRevisedTopicCodes: string[];
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
  "Sunijtra Siritip",
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

function gradeTone(grade: Grade | string) {
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

function robinhoodCardTone(kind: "violet" | "green" | "blue" | "pink" | "amber" | "slate") {
  switch (kind) {
    case "violet":
      return "border-violet-200 bg-gradient-to-br from-white via-violet-50/80 to-fuchsia-50/60";
    case "green":
      return "border-emerald-200 bg-gradient-to-br from-white via-emerald-50/80 to-lime-50/60";
    case "blue":
      return "border-sky-200 bg-gradient-to-br from-white via-sky-50/80 to-indigo-50/60";
    case "pink":
      return "border-fuchsia-200 bg-gradient-to-br from-white via-fuchsia-50/80 to-pink-50/60";
    case "amber":
      return "border-amber-200 bg-gradient-to-br from-white via-amber-50/80 to-orange-50/60";
    default:
      return "border-slate-200 bg-gradient-to-br from-white via-slate-50/80 to-slate-100/70";
  }
}

function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-violet-200/80 bg-white shadow-[0_14px_40px_rgba(76,29,149,0.08)]">
      <div className="h-1.5 bg-gradient-to-r from-[#5F2EEA] via-[#6B46F6] to-[#A855F7]" />
      <div className="flex flex-col gap-2 border-b border-violet-100 bg-gradient-to-r from-white via-violet-50/50 to-fuchsia-50/40 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[17px] font-bold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
        {right}
      </div>
      <div className="p-4 lg:p-5">{children}</div>
    </div>
  );
}

function HeroCard({
  title,
  sub,
}: {
  title: string;
  sub: string;
}) {
  return (
    <div className="overflow-hidden rounded-[32px] border border-violet-200/70 bg-gradient-to-r from-[#2E1A87] via-[#4F46E5] to-[#9333EA] text-white shadow-[0_22px_60px_rgba(76,29,149,0.20)]">
      <div className="flex flex-col gap-6 px-5 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200">
            Robinhood QA
          </div>
          <div className="mt-2 text-[30px] font-extrabold tracking-tight sm:text-[36px]">
            {title}
          </div>
          <div className="mt-2 text-sm text-violet-100/90">{sub}</div>
        </div>

        <div className="flex items-center gap-4 rounded-[24px] border border-white/15 bg-white/10 px-4 py-4 backdrop-blur-sm">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/15">
            <img
              src="/robinhood-logo.png"
              alt="Robinhood"
              className="h-10 w-10 object-contain"
            />
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200">
              Executive View
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              KPI / Trend / Ranking / Topic Performance
            </div>
            <div className="mt-1 text-xs text-violet-100/80">Power BI style dashboard mockup</div>
          </div>
        </div>
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
  tone?: "violet" | "green" | "blue" | "pink" | "amber" | "slate";
}) {
  return (
    <div className={`rounded-[24px] border p-4 shadow-sm ${robinhoodCardTone(tone)}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </div>
      <div className="mt-4 break-words text-[22px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[24px]">
        {value}
      </div>
      {sub ? <div className="mt-2 text-xs leading-5 text-slate-500">{sub}</div> : null}
    </div>
  );
}

function MiniStat({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </div>
      <div className="mt-2">
        {badge ? (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(value)}`}>
            {value}
          </span>
        ) : (
          <div className="break-words text-sm font-semibold text-slate-900">{value}</div>
        )}
      </div>
    </div>
  );
}

function TrendLine({
  data,
  title,
  subtitle,
}: {
  data: { label: string; value: number }[];
  title: string;
  subtitle?: string;
}) {
  const width = 760;
  const height = 240;
  const pad = 34;

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  const points = data.map((item, index) => {
    const x =
      data.length === 1
        ? width / 2
        : pad + (index * (width - pad * 2)) / (data.length - 1);
    const y = pad + ((max - item.value) / range) * (height - pad * 2);
    return { ...item, x, y };
  });

  return (
    <div className="rounded-[24px] border border-violet-100 bg-white p-4">
      <div className="text-sm font-bold text-slate-900">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-gradient-to-b from-white to-violet-50/40 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
          {[0, 1, 2, 3].map((line) => {
            const y = pad + (line * (height - pad * 2)) / 3;
            return (
              <line
                key={line}
                x1={pad}
                x2={width - pad}
                y1={y}
                y2={y}
                stroke="#E9D5FF"
                strokeDasharray="5 7"
              />
            );
          })}

          {points.length > 1 ? (
            <polyline
              fill="none"
              stroke="#5F2EEA"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            />
          ) : null}

          {points.map((p) => (
            <g key={p.label}>
              <circle cx={p.x} cy={p.y} r="5.5" fill="#5F2EEA" />
              <text
                x={p.x}
                y={p.y - 12}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#475569"
              >
                {p.value.toFixed(1)}
              </text>
              <text
                x={p.x}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                fill="#64748B"
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export default function DashboardMockup({
  currentUser,
  dashboardSubTab = "overview",
  externalSelectedAgent,
  onSelectedAgentChange,
  onOpenCaseDetail,
}: DashboardProps) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [localSelectedAgent, setLocalSelectedAgent] = useState("all");
  const selectedAgent = externalSelectedAgent || localSelectedAgent;

  const [caseSearch, setCaseSearch] = useState("");
  const [selectedCaseKey, setSelectedCaseKey] = useState("");

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
          throw new Error("ไม่พบไฟล์ QA_RawData1.xlsx ใน public");
        }
        if (!appealResponse.ok) {
          throw new Error("ไม่พบไฟล์ Appleal ROWDATA.xlsx ใน public");
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

        const rawHeaderIndex = rawRows.findIndex((row) => {
          const normalized = (row || []).map((v: any) => normalizeText(v));
          return normalized.includes("agent name") && normalized.includes("case id");
        });

        if (rawHeaderIndex === -1) {
          throw new Error("ไม่พบ header ใน QA_RawData1.xlsx");
        }

        const rawHeaderRow = rawRows[rawHeaderIndex] || [];
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

        const appealHeaderIndex = appealRows.findIndex((row) => {
          const normalized = (row || []).map((v: any) => normalizeText(v));
          return normalized.includes("case id");
        });

        if (appealHeaderIndex === -1) {
          throw new Error("ไม่พบ header ใน Appleal ROWDATA.xlsx");
        }

        const appealHeaderRow = appealRows[appealHeaderIndex] || [];
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

        setAllCases(mapped);
      } catch (error: any) {
        setLoadError(error?.message || "โหลดไฟล์ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);

  const visibleAgents = useMemo(() => {
    const union = [...new Set([...AGENT_MASTER, ...allCases.map((item) => item.agent)])];
    if (currentUser?.role === "Agent" && currentUser?.agentName) {
      return union.filter((name) => isSameAgent(name, currentUser.agentName));
    }
    return union.sort((a, b) => a.localeCompare(b));
  }, [allCases, currentUser]);

  const setSelectedAgent = (value: string) => {
    if (onSelectedAgentChange) onSelectedAgentChange(value);
    setLocalSelectedAgent(value);
  };

  const casesInScope = useMemo(() => {
    let items = [...allCases];

    if (currentUser?.role === "Agent" && currentUser?.agentName) {
      items = items.filter((item) => isSameAgent(item.agent, currentUser.agentName));
    } else if (selectedAgent && selectedAgent !== "all") {
      items = items.filter((item) => isSameAgent(item.agent, selectedAgent));
    }

    return items.sort((a, b) => {
      const timeA = a.auditDateObj?.getTime?.() || 0;
      const timeB = b.auditDateObj?.getTime?.() || 0;
      return timeB - timeA;
    });
  }, [allCases, currentUser, selectedAgent]);

  const caseDetailRows = useMemo(() => {
    const keyword = normalizeText(caseSearch);
    if (!keyword) return casesInScope;
    return casesInScope.filter((item) => {
      const hay = normalizeText(`${item.caseId} ${item.agent} ${item.inquiry}`);
      return hay.includes(keyword);
    });
  }, [casesInScope, caseSearch]);

  useEffect(() => {
    if (!selectedCaseKey && caseDetailRows.length) {
      setSelectedCaseKey(caseDetailRows[0].key);
    } else if (selectedCaseKey && !caseDetailRows.find((item) => item.key === selectedCaseKey)) {
      setSelectedCaseKey(caseDetailRows[0]?.key || "");
    }
  }, [caseDetailRows, selectedCaseKey]);

  const selectedCase = useMemo(() => {
    return caseDetailRows.find((item) => item.key === selectedCaseKey) || caseDetailRows[0] || null;
  }, [caseDetailRows, selectedCaseKey]);

  const mergedTopicPerformance = useMemo(() => {
    return TOPIC_MASTER.map((master) => {
      const relevant = casesInScope
        .flatMap((item) =>
          item.reviewStatus === "Revised" && item.revisedTopics?.length
            ? mergeTopicSet(item.topics, item.revisedTopics)
            : item.topics
        )
        .filter((topic) => topic.code === master.code);

      if (!relevant.length) {
        return { code: master.code, label: master.label, avgScore: 0, max: master.max, pct: 0 };
      }

      const avg = relevant.reduce((sum, topic) => sum + topic.score, 0) / relevant.length;

      return {
        code: master.code,
        label: master.label,
        avgScore: Number(avg.toFixed(2)),
        max: master.max,
        pct: Number(((avg / master.max) * 100).toFixed(2)),
      };
    });
  }, [casesInScope]);

  const weeklyTrend = useMemo(() => {
    const map = new Map<string, number[]>();

    casesInScope.forEach((item) => {
      const key = item.weekLabel || "Week";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item.finalScore);
    });

    return [...map.entries()]
      .map(([label, scores]) => ({
        label,
        value: Number((scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1)).toFixed(1)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(-8);
  }, [casesInScope]);

  const avgScore =
    casesInScope.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(casesInScope.length, 1);

  const bestTopic = [...mergedTopicPerformance].sort((a, b) => b.pct - a.pct)[0];
  const lowestTopic = [...mergedTopicPerformance].sort((a, b) => a.pct - b.pct)[0];

  const agentRanking = useMemo(() => {
    const sourceNames =
      currentUser?.role === "Agent" && currentUser?.agentName
        ? visibleAgents
        : visibleAgents;

    return sourceNames
      .map((agentName) => {
        const rows = casesInScope.filter((item) => isSameAgent(item.agent, agentName));
        const avg =
          rows.reduce((sum, item) => sum + item.finalScore, 0) / Math.max(rows.length, 1);
        return {
          agent: agentName,
          caseCount: rows.length,
          avgScore: rows.length ? Number(avg.toFixed(2)) : 0,
          grade: rows.length ? scoreToGrade(avg) : "F",
        };
      })
      .sort((a, b) => {
        if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
        return a.agent.localeCompare(b.agent);
      });
  }, [casesInScope, visibleAgents, currentUser]);

  const topAgent = agentRanking[0];

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5 lg:px-6 2xl:px-8">
        <div className="rounded-[28px] border border-violet-200 bg-white px-6 py-6 text-slate-600 shadow-sm">
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5 lg:px-6 2xl:px-8">
        <div className="rounded-[28px] border border-rose-200 bg-white px-6 py-6 text-rose-700 shadow-sm">
          {loadError}
        </div>
      </div>
    );
  }

  const renderOverview = () => (
    <div className="space-y-5">
      <HeroCard
        title="Quality Monitoring Workspace"
        sub="Dashboard / KPI / Weekly Trend / Ranking / Topic Performance / Case Detail"
      />

      <Section
        title="Weekly Dashboard"
        subtitle="Executive weekly overview in Robinhood QA mockup style"
        right={
          <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            Team Overall
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <KpiCard
            title="Team Cases"
            value={String(casesInScope.length)}
            sub="Cases in current weekly scope"
            tone="violet"
          />
          <KpiCard
            title="Average Score"
            value={avgScore.toFixed(2)}
            sub="Weekly overall average"
            tone="blue"
          />
          <KpiCard
            title="Best Topic"
            value={bestTopic?.label || "-"}
            sub="Highest performing topic"
            tone="green"
          />
          <KpiCard
            title="Lowest Topic"
            value={lowestTopic?.label || "-"}
            sub="Main coaching topic"
            tone="pink"
          />
          <KpiCard
            title="Top Agent"
            value={topAgent?.agent || "-"}
            sub="Best weekly performer"
            tone="green"
          />
          <KpiCard
            title="Agent Count"
            value={String(agentRanking.length)}
            sub="Agents in selected scope"
            tone="slate"
          />
        </div>
      </Section>

      <Section title="Weekly Trend" subtitle="Weekly average score trend">
        <TrendLine
          data={weeklyTrend.length ? weeklyTrend : [{ label: "Week", value: 0 }]}
          title="Weekly Performance Trend"
          subtitle="Trend across available weekly periods"
        />
      </Section>

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Section title="Topic Performance" subtitle="Average topic performance in current scope">
          <div className="overflow-x-auto rounded-2xl border border-violet-100">
            <table className="min-w-[760px] w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-[#36208E] to-[#5A3BF0] text-[11px] uppercase tracking-[0.14em] text-white">
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Topic</th>
                  <th className="px-4 py-3 text-center">Avg Score</th>
                  <th className="px-4 py-3 text-center">Max</th>
                  <th className="px-4 py-3 text-center">Performance %</th>
                </tr>
              </thead>
              <tbody>
                {mergedTopicPerformance.map((topic) => (
                  <tr key={topic.code} className="bg-white">
                    <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">
                      {topic.code}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-slate-700">
                      {topic.label}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center">
                      {topic.avgScore.toFixed(2)}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center">
                      {topic.max}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center">
                      {topic.pct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Agent Ranking" subtitle="Overall ranking in current scope">
          <div className="overflow-x-auto rounded-2xl border border-violet-100">
            <table className="min-w-[620px] w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-[#36208E] to-[#5A3BF0] text-[11px] uppercase tracking-[0.14em] text-white">
                  <th className="px-4 py-3 text-left">Rank</th>
                  <th className="px-4 py-3 text-left">Agent</th>
                  <th className="px-4 py-3 text-center">Cases</th>
                  <th className="px-4 py-3 text-center">Avg Score</th>
                  <th className="px-4 py-3 text-center">Grade</th>
                </tr>
              </thead>
              <tbody>
                {agentRanking.map((row, index) => (
                  <tr key={row.agent} className="bg-white">
                    <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">
                      {index + 1}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-slate-700">
                      {row.agent}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center">
                      {row.caseCount}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center">
                      {row.avgScore.toFixed(2)}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(row.grade)}`}>
                        {row.grade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section
        title="Case Snapshot"
        subtitle="Quick access to case detail view"
        right={
          <button
            type="button"
            onClick={() => {
              if (selectedCase) setSelectedCaseKey(selectedCase.key);
              onOpenCaseDetail?.();
            }}
            className="rounded-2xl bg-gradient-to-r from-[#5F2EEA] to-[#A855F7] px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            Open Case Detail
          </button>
        }
      >
        <div className="overflow-x-auto rounded-2xl border border-violet-100">
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-[#36208E] to-[#5A3BF0] text-[11px] uppercase tracking-[0.14em] text-white">
                <th className="px-4 py-3 text-left">Seq</th>
                <th className="px-4 py-3 text-left">Audit Date</th>
                <th className="px-4 py-3 text-left">Case ID</th>
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-left">Inquiry</th>
                <th className="px-4 py-3 text-center">Final Score</th>
                <th className="px-4 py-3 text-center">Grade</th>
              </tr>
            </thead>
            <tbody>
              {casesInScope.slice(0, 10).map((row, index) => (
                <tr
                  key={row.key}
                  className="cursor-pointer bg-white hover:bg-violet-50"
                  onClick={() => {
                    setSelectedCaseKey(row.key);
                    onOpenCaseDetail?.();
                  }}
                >
                  <td className="border-t border-slate-200 px-4 py-3">{index + 1}</td>
                  <td className="border-t border-slate-200 px-4 py-3">{row.auditDate}</td>
                  <td className="border-t border-slate-200 px-4 py-3 font-semibold text-violet-700">
                    {row.caseId}
                  </td>
                  <td className="border-t border-slate-200 px-4 py-3">{row.agent}</td>
                  <td className="border-t border-slate-200 px-4 py-3 text-slate-600">
                    {row.inquiry}
                  </td>
                  <td className="border-t border-slate-200 px-4 py-3 text-center">
                    {row.finalScore.toFixed(2)}
                  </td>
                  <td className="border-t border-slate-200 px-4 py-3 text-center">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(row.grade)}`}>
                      {row.grade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );

  const renderCaseDetail = () => (
    <div className="space-y-5">
      <HeroCard
        title="Case Detail Workspace"
        sub="Search by Case ID / Filter by Agent / Review selected case / Topic breakdown"
      />

      <Section title="Case Detail Controls" subtitle="Search and filter reviewed cases">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr_220px]">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
              Search Case ID / Inquiry
            </div>
            <input
              value={caseSearch}
              onChange={(e) => setCaseSearch(e.target.value)}
              placeholder="Search by Case ID or keyword"
              className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
              Agent Filter
            </div>
            {currentUser?.role === "Agent" ? (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
                {currentUser.agentName}
              </div>
            ) : (
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
              >
                <option value="all">All Agents</option>
                {visibleAgents.map((agent) => (
                  <option key={agent} value={agent}>
                    {agent}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
              Result Count
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
              {caseDetailRows.length} case(s)
            </div>
          </div>
        </div>
      </Section>

      <Section title="Case List" subtitle="Reviewed case list for current scope">
        <div className="overflow-x-auto rounded-2xl border border-violet-100">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-[#36208E] to-[#5A3BF0] text-[11px] uppercase tracking-[0.14em] text-white">
                <th className="px-4 py-3 text-left">Seq</th>
                <th className="px-4 py-3 text-left">Audit Date</th>
                <th className="px-4 py-3 text-left">Case ID</th>
                <th className="px-4 py-3 text-left">Agent</th>
                <th className="px-4 py-3 text-left">Inquiry</th>
                <th className="px-4 py-3 text-center">Final Score</th>
                <th className="px-4 py-3 text-center">Grade</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {caseDetailRows.map((row, index) => {
                const active = selectedCase?.key === row.key;
                return (
                  <tr
                    key={row.key}
                    className={active ? "bg-violet-50" : "bg-white hover:bg-violet-50"}
                    onClick={() => setSelectedCaseKey(row.key)}
                  >
                    <td className="border-t border-slate-200 px-4 py-3">{index + 1}</td>
                    <td className="border-t border-slate-200 px-4 py-3">{row.auditDate}</td>
                    <td className="border-t border-slate-200 px-4 py-3 font-semibold text-violet-700">
                      {row.caseId}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3">{row.agent}</td>
                    <td className="border-t border-slate-200 px-4 py-3 text-slate-600">
                      {row.inquiry}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center">
                      {row.finalScore.toFixed(2)}
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(row.grade)}`}>
                        {row.grade}
                      </span>
                    </td>
                    <td className="border-t border-slate-200 px-4 py-3 text-center">
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                        {row.reviewStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {selectedCase ? (
        <>
          <Section title="Selected Case Summary" subtitle="Focused summary of the selected case">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MiniStat label="Agent" value={selectedCase.agent} />
              <MiniStat label="Audit Date" value={selectedCase.auditDate} />
              <MiniStat label="Case ID" value={selectedCase.caseId} />
              <MiniStat label="Final Score" value={selectedCase.finalScore.toFixed(2)} />
              <MiniStat label="Grade" value={selectedCase.grade} badge />
              <MiniStat label="Review Status" value={selectedCase.reviewStatus} />
              <MiniStat label="Inquiry" value={selectedCase.inquiry} />
              <MiniStat
                label="Revised Topics"
                value={
                  selectedCase.displayRevisedTopicCodes?.length
                    ? selectedCase.displayRevisedTopicCodes.join(", ")
                    : "-"
                }
              />
            </div>
          </Section>

          <Section title="Topic Breakdown" subtitle="Topic score and evaluation comment by selected case">
            <div className="overflow-x-auto rounded-2xl border border-violet-100">
              <table className="min-w-[980px] w-full text-sm">
                <thead>
                  <tr className="bg-gradient-to-r from-[#36208E] to-[#5A3BF0] text-[11px] uppercase tracking-[0.14em] text-white">
                    <th className="px-4 py-3 text-left">Code</th>
                    <th className="px-4 py-3 text-left">Topic</th>
                    <th className="px-4 py-3 text-center">Score</th>
                    <th className="px-4 py-3 text-center">Max</th>
                    <th className="px-4 py-3 text-center">%</th>
                    <th className="px-4 py-3 text-left">Evaluation Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedCase.reviewStatus === "Revised" && selectedCase.revisedTopics?.length
                    ? mergeTopicSet(selectedCase.topics, selectedCase.revisedTopics)
                    : selectedCase.topics
                  ).map((topic) => (
                    <tr key={topic.code} className="bg-white">
                      <td className="border-t border-slate-200 px-4 py-3 font-semibold text-slate-900">
                        {topic.code}
                      </td>
                      <td className="border-t border-slate-200 px-4 py-3 text-slate-700">
                        {topic.label}
                      </td>
                      <td className="border-t border-slate-200 px-4 py-3 text-center">
                        {topic.score}
                      </td>
                      <td className="border-t border-slate-200 px-4 py-3 text-center">
                        {topic.max}
                      </td>
                      <td className="border-t border-slate-200 px-4 py-3 text-center">
                        {topic.pct}%
                      </td>
                      <td className="border-t border-slate-200 px-4 py-3 text-slate-600">
                        {topic.comment || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      ) : (
        <Section title="Selected Case Summary" subtitle="No selected case">
          <div className="text-sm text-slate-500">No case found in current filter.</div>
        </Section>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-5 lg:px-6 2xl:px-8">
      {dashboardSubTab === "case-detail" ? renderCaseDetail() : renderOverview()}
    </div>
  );
}