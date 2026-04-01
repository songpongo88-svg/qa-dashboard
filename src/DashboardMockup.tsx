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
};

type AppealMergeItem = {
  caseId: string;
  finalScore?: number;
  previousScore?: number;
  revisedTopics: Topic[];
  displayRevisedTopicCodes: string[];
};

const CASE_TARGET = 10;

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

function getIncentiveValue(caseCount: number, avg: number) {
  if (caseCount < CASE_TARGET) return 0;
  if (avg >= 90) return 1000;
  if (avg >= 80) return 700;
  if (avg >= 70) return 300;
  return 0;
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

function gradeBadge(grade: string) {
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

function currentGradeTone(gradeDisplay: string) {
  switch (gradeDisplay) {
    case "A":
      return {
        card: "from-emerald-50 via-white to-emerald-100/60 border-emerald-200",
        badge: "border-emerald-200 bg-emerald-100 text-emerald-700",
        valueText: "text-emerald-800",
      };
    case "B":
      return {
        card: "from-sky-50 via-white to-sky-100/60 border-sky-200",
        badge: "border-sky-200 bg-sky-100 text-sky-700",
        valueText: "text-sky-800",
      };
    case "C":
      return {
        card: "from-amber-50 via-white to-amber-100/60 border-amber-200",
        badge: "border-amber-200 bg-amber-100 text-amber-700",
        valueText: "text-amber-800",
      };
    case "D":
      return {
        card: "from-orange-50 via-white to-orange-100/60 border-orange-200",
        badge: "border-orange-200 bg-orange-100 text-orange-700",
        valueText: "text-orange-800",
      };
    case "F":
      return {
        card: "from-rose-50 via-white to-rose-100/60 border-rose-200",
        badge: "border-rose-200 bg-rose-100 text-rose-700",
        valueText: "text-rose-800",
      };
    default:
      return {
        card: "from-slate-50 via-white to-slate-100/70 border-slate-200",
        badge: "border-slate-200 bg-slate-100 text-slate-700",
        valueText: "text-slate-900",
      };
  }
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
    violet: {
      card: "border-violet-200 bg-gradient-to-br from-white via-violet-50/70 to-fuchsia-50/70",
      value: "text-violet-900",
      line: "from-violet-800 to-fuchsia-500",
    },
    emerald: {
      card: "border-emerald-200 bg-gradient-to-br from-white via-emerald-50 to-emerald-100/60",
      value: "text-emerald-800",
      line: "from-emerald-700 to-emerald-400",
    },
    amber: {
      card: "border-amber-200 bg-gradient-to-br from-white via-amber-50 to-amber-100/60",
      value: "text-amber-800",
      line: "from-amber-700 to-amber-400",
    },
    sky: {
      card: "border-sky-200 bg-gradient-to-br from-white via-sky-50 to-sky-100/60",
      value: "text-sky-800",
      line: "from-sky-700 to-sky-400",
    },
    rose: {
      card: "border-rose-200 bg-gradient-to-br from-white via-rose-50 to-rose-100/60",
      value: "text-rose-800",
      line: "from-rose-700 to-rose-400",
    },
    slate: {
      card: "border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100/70",
      value: "text-slate-900",
      line: "from-slate-700 to-slate-400",
    },
  };

  const styles = toneMap[tone];

  return (
    <div className={`relative overflow-hidden rounded-[22px] border p-4 shadow-sm ${styles.card}`}>
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${styles.line}`} />
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {title}
      </div>
      <div className={`mt-3 line-clamp-2 break-words text-3xl font-extrabold leading-tight tracking-tight ${styles.value}`}>
        {value}
      </div>
      {sub ? <div className="mt-2 text-xs leading-5 text-slate-500">{sub}</div> : null}
    </div>
  );
}

function CurrentGradeCard({
  gradeDisplay,
  caseCount,
  avgScore,
}: {
  gradeDisplay: string;
  caseCount: number;
  avgScore: number;
}) {
  const tone = currentGradeTone(gradeDisplay);

  return (
    <div className={`relative overflow-hidden rounded-[22px] border bg-gradient-to-br p-4 shadow-sm ${tone.card}`}>
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-800 to-fuchsia-500" />
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        Current Grade
      </div>

      <div className={`mt-3 text-3xl font-extrabold leading-tight tracking-tight ${tone.valueText}`}>
        {gradeDisplay}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>
          Grade {gradeDisplay}
        </span>
        <span className="text-xs font-semibold text-slate-500">
          Status: {getGradeStatus(gradeDisplay)}
        </span>
      </div>

      <div className="mt-3 text-xs leading-5 text-slate-500">
        {caseCount < CASE_TARGET && caseCount > 0
          ? `Pending final grade until ${CASE_TARGET} reviewed cases`
          : caseCount === 0
          ? "No reviewed cases in current view"
          : `Calculated from current average score ${avgScore.toFixed(2)}`}
      </div>
    </div>
  );
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
    <div className="overflow-hidden rounded-[26px] border border-violet-200/80 bg-white shadow-[0_12px_30px_rgba(76,29,149,0.08)]">
      <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-5 py-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[17px] font-bold tracking-tight text-slate-900">{title}</div>
            {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
          </div>
          {right}
        </div>
      </div>
      <div className="p-4 lg:p-5">{children}</div>
    </div>
  );
}

export default function DashboardMockup({
  currentUser,
  dashboardSubTab = "overview",
}: DashboardProps) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedAgent, setSelectedAgent] = useState<string>(
    currentUser?.role === "Agent" && currentUser?.agentName ? currentUser.agentName : "all"
  );
  const [selectedCaseKey, setSelectedCaseKey] = useState<string>("");

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
    if (currentUser?.role === "Agent" && currentUser?.agentName) {
      return AGENT_MASTER.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }

    const agentsFromCases = allCases.map((item) => item.agent).filter(Boolean);
    return [...new Set([...AGENT_MASTER, ...agentsFromCases])].sort((a, b) => a.localeCompare(b));
  }, [allCases, currentUser]);

  const filteredCases = useMemo(() => {
    let items = [...allCases];

    if (currentUser?.role === "Agent" && currentUser?.agentName) {
      items = items.filter((item) => isSameAgent(item.agent, currentUser.agentName));
    } else if (selectedAgent !== "all") {
      items = items.filter((item) => isSameAgent(item.agent, selectedAgent));
    }

    return items.sort((a, b) => {
      const timeA = a.auditDateObj?.getTime?.() || 0;
      const timeB = b.auditDateObj?.getTime?.() || 0;
      return timeB - timeA;
    });
  }, [allCases, currentUser, selectedAgent]);

  const metricCaseCount = filteredCases.length;
  const metricAverageScore =
    filteredCases.reduce((sum, item) => sum + item.finalScore, 0) /
    Math.max(filteredCases.length, 1);
  const metricAverageDisplay = metricCaseCount ? metricAverageScore.toFixed(2) : "0.00";
  const currentGradeDisplay = getGradeDisplay(metricCaseCount, metricAverageScore);
  const estimatedIncentive = getIncentiveValue(metricCaseCount, metricAverageScore);
  const revisedCount = filteredCases.filter((item) => item.reviewStatus === "Revised").length;

  const selectedCase = useMemo(() => {
    if (!selectedCaseKey) return filteredCases[0] || null;
    return filteredCases.find((item) => item.key === selectedCaseKey) || filteredCases[0] || null;
  }, [filteredCases, selectedCaseKey]);

  const topicPerformance = useMemo(() => {
    return TOPIC_MASTER.map((master) => {
      const relevant = filteredCases
        .flatMap((item) =>
          item.reviewStatus === "Revised" && item.revisedTopics?.length
            ? mergeTopicSet(item.topics, item.revisedTopics)
            : item.topics
        )
        .filter((topic) => topic.code === master.code);

      if (!relevant.length) {
        return {
          code: master.code,
          label: master.label,
          avgScore: 0,
          max: master.max,
          pct: 0,
        };
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
  }, [filteredCases]);

  const bestTopic = [...topicPerformance].sort((a, b) => b.pct - a.pct)[0];
  const lowestTopic = [...topicPerformance].sort((a, b) => a.pct - b.pct)[0];

  useEffect(() => {
    if (!selectedCaseKey && filteredCases.length) {
      setSelectedCaseKey(filteredCases[0].key);
    }
  }, [filteredCases, selectedCaseKey]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-3xl border border-violet-200 bg-white px-6 py-5 text-slate-700 shadow-sm">
          Loading dashboard...
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
      <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-5 lg:px-6 2xl:px-8">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-[28px] border border-violet-200/80 bg-gradient-to-r from-violet-950 via-violet-900 to-fuchsia-700 text-white shadow-[0_22px_60px_rgba(76,29,149,0.2)]">
            <div className="flex flex-col gap-6 px-5 py-6 lg:flex-row lg:items-center lg:justify-between lg:px-7">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200">
                  Robinhood QA
                </div>
                <div className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                  Quality Monitoring Workspace
                </div>
                <div className="mt-2 text-sm text-violet-100/85">
                  Dashboard / KPI / Review Mix / Topic Performance / Case Detail
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-[24px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/15">
                  <img
                    src="/robinhood-logo.png"
                    alt="Robinhood"
                    className="h-10 w-10 object-contain"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
                    Current User
                  </div>
                  <div className="mt-1 text-base font-semibold text-white">
                    {currentUser?.displayName || currentUser?.agentName || "User"}
                  </div>
                  <div className="mt-1 text-sm text-violet-100/85">
                    Role: {currentUser?.role || "-"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Section
            title="Dashboard Controls"
            subtitle="Responsive layout optimized for common laptop browser sizes"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                  Dashboard View
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold ${
                      dashboardSubTab === "overview"
                        ? "border-violet-400 bg-violet-100 text-violet-800"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    className={`rounded-2xl border px-4 py-2.5 text-sm font-semibold ${
                      dashboardSubTab === "case-detail"
                        ? "border-violet-400 bg-violet-100 text-violet-800"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    Case Detail
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                  Agent Filter
                </div>
                {currentUser?.role === "Agent" ? (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
                    {currentUser?.agentName || "-"}
                  </div>
                ) : (
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
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
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                  Selected Case
                </div>
                <select
                  value={selectedCase?.key || ""}
                  onChange={(e) => setSelectedCaseKey(e.target.value)}
                  className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                >
                  {filteredCases.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.caseId} · {item.agent}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          <Section title="Performance Overview" subtitle="Executive KPI snapshot for current dashboard view">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              <KpiCard
                title="Average Score"
                value={metricAverageDisplay}
                sub={`${metricCaseCount} case(s) in current view`}
                tone="violet"
              />

              <CurrentGradeCard
                gradeDisplay={currentGradeDisplay}
                caseCount={metricCaseCount}
                avgScore={metricAverageScore}
              />

              <KpiCard
                title="Evaluation Progress"
                value={`${metricCaseCount}/${CASE_TARGET}`}
                sub={metricCaseCount >= CASE_TARGET ? "Target reached" : "Target not reached"}
                tone={metricCaseCount >= CASE_TARGET ? "emerald" : "sky"}
              />

              <KpiCard
                title="Estimated Incentive"
                value={`฿${estimatedIncentive.toLocaleString()}`}
                sub={getGradeStatus(currentGradeDisplay)}
                tone="amber"
              />

              <KpiCard
                title="Review Mix"
                value={String(revisedCount)}
                sub="Revised case(s) in current view"
                tone="slate"
              />
            </div>
          </Section>

          <Section title="QA Grade & Incentive Guide" subtitle="Monthly incentive is calculated only when the agent has at least 10 reviewed cases in that month">
            <div className="overflow-x-auto rounded-2xl border border-violet-100">
              <table className="min-w-[760px] w-full text-sm">
                <thead>
                  <tr className="bg-violet-950 text-[11px] uppercase tracking-wide text-white">
                    <th className="px-4 py-3 text-left">Score Range</th>
                    <th className="px-4 py-3 text-left">Level</th>
                    <th className="px-4 py-3 text-center">Grade</th>
                    <th className="px-4 py-3 text-center">Incentive (THB)</th>
                    <th className="px-4 py-3 text-left">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["90-100", "Excellent", "A", "1,000", "Meets all key standards"],
                    ["80-89", "Good", "B", "700", "Meets most standards"],
                    ["70-79", "Fair", "C", "300", "Minimum pass level"],
                    ["60-69", "Improvement Required", "D", "0", "Below company standard"],
                    ["<60", "Fail", "F", "0", "Significant quality issue"],
                  ].map((row) => (
                    <tr key={row[0]} className="bg-white">
                      <td className="border-t border-slate-200 px-4 py-3">{row[0]}</td>
                      <td className="border-t border-slate-200 px-4 py-3">{row[1]}</td>
                      <td className="border-t border-slate-200 px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeBadge(row[2])}`}>
                          {row[2]}
                        </span>
                      </td>
                      <td className="border-t border-slate-200 px-4 py-3 text-center">{row[3]}</td>
                      <td className="border-t border-slate-200 px-4 py-3">{row[4]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid gap-5 xl:grid-cols-[370px_minmax(0,1fr)]">
            <Section title="Case Navigator" subtitle="Choose a case to inspect detailed scores and comments">
              <div className="space-y-3">
                {filteredCases.slice(0, 12).map((item) => {
                  const isActive = selectedCase?.key === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setSelectedCaseKey(item.key)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isActive
                          ? "border-violet-300 bg-violet-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{item.caseId}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.agent} · {item.auditDate}
                          </div>
                        </div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${gradeBadge(item.grade)}`}>
                          {item.grade}
                        </span>
                      </div>
                      <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
                        {item.inquiry || "-"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Section>

            <div className="space-y-5">
              <Section title="Selected Case Summary" subtitle="Overview of currently selected case">
                {selectedCase ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <InfoStat label="Agent" value={selectedCase.agent} />
                    <InfoStat label="Audit Date" value={selectedCase.auditDate} />
                    <InfoStat label="Case ID" value={selectedCase.caseId} />
                    <InfoStat label="Final Score" value={selectedCase.finalScore.toFixed(2)} />
                    <InfoStat label="Grade" value={selectedCase.grade} badge />
                    <InfoStat label="Review Status" value={selectedCase.reviewStatus} />
                    <InfoStat label="Inquiry" value={selectedCase.inquiry || "-"} wide />
                    <InfoStat
                      label="Revised Topics"
                      value={
                        selectedCase.displayRevisedTopicCodes?.length
                          ? selectedCase.displayRevisedTopicCodes.join(", ")
                          : "-"
                      }
                      wide
                    />
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No case selected</div>
                )}
              </Section>

              <Section title="Topic Performance" subtitle="Current view topic performance summary">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <InfoStat label="Best Topic" value={bestTopic?.label || "-"} />
                  <InfoStat label="Best Topic %" value={`${bestTopic?.pct?.toFixed?.(1) || "0.0"}%`} />
                  <InfoStat label="Lowest Topic" value={lowestTopic?.label || "-"} />
                  <InfoStat label="Lowest Topic %" value={`${lowestTopic?.pct?.toFixed?.(1) || "0.0"}%`} />
                </div>

                <div className="mt-5 overflow-x-auto rounded-2xl border border-violet-100">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead>
                      <tr className="bg-violet-950 text-[11px] uppercase tracking-wide text-white">
                        <th className="px-4 py-3 text-left">Code</th>
                        <th className="px-4 py-3 text-left">Topic</th>
                        <th className="px-4 py-3 text-center">Avg Score</th>
                        <th className="px-4 py-3 text-center">Max</th>
                        <th className="px-4 py-3 text-center">Performance %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topicPerformance.map((topic) => (
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

              <Section title="Case Detail Breakdown" subtitle="Topic-by-topic score and evaluation comment for selected case">
                {selectedCase ? (
                  <div className="overflow-x-auto rounded-2xl border border-violet-100">
                    <table className="min-w-[980px] w-full text-sm">
                      <thead>
                        <tr className="bg-violet-950 text-[11px] uppercase tracking-wide text-white">
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
                ) : (
                  <div className="text-sm text-slate-500">No case selected</div>
                )}
              </Section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoStat({
  label,
  value,
  wide = false,
  badge = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
  badge?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 ${wide ? "md:col-span-2" : ""}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2">
        {badge ? (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeBadge(value)}`}>
            {value}
          </span>
        ) : (
          <div className="break-words text-sm font-semibold leading-6 text-slate-900">{value}</div>
        )}
      </div>
    </div>
  );
}