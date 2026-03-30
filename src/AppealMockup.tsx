import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type ReviewStatus = "Original" | "Revised";
type Grade = "A" | "B" | "C" | "D" | "F";

type AppealTopicItem = {
  code: string;
  label: string;
  max: number;
  originalScore: number;
  revisedScore: number;
  revisedComment: string;
  appealReason: string;
  changed: boolean;
};

type AppealCaseItem = {
  key: string;
  caseId: string;
  agent: string;
  auditDate: string;
  appealSubmitDateTime: string;
  appealResultDateTime: string;
  appealChannel: string;
  weekLabel: string;
  finalScore: number;
  previousScore: number;
  grade: Grade;
  reviewStatus: ReviewStatus;
  inquiryTh: string;
  appealReviewSummary: string;
  appealedTopics: AppealTopicItem[];
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

function formatInputDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function tryParseLooseDate(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(
      parsed.y,
      parsed.m - 1,
      parsed.d,
      parsed.H || 0,
      parsed.M || 0,
      Math.floor(parsed.S || 0)
    );
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const nativeParsed = new Date(raw);
  if (!Number.isNaN(nativeParsed.getTime())) return nativeParsed;

  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/, "$3-$2-$1T$4:$5")
    .trim();

  const secondTry = new Date(cleaned);
  if (!Number.isNaN(secondTry.getTime())) return secondTry;

  return null;
}

function formatDate(value: any): string {
  const dt = tryParseLooseDate(value);
  if (!dt) return String(value ?? "");
  const day = `${dt.getDate()}`.padStart(2, "0");
  const month = `${dt.getMonth() + 1}`.padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: any): string {
  const dt = tryParseLooseDate(value);
  if (!dt) return String(value ?? "-");
  const day = `${dt.getDate()}`.padStart(2, "0");
  const month = `${dt.getMonth() + 1}`.padStart(2, "0");
  const year = dt.getFullYear();
  const hour = `${dt.getHours()}`.padStart(2, "0");
  const minute = `${dt.getMinutes()}`.padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function parseAuditDate(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day);
}

function isWithinDateRange(auditDate: string, from?: string, to?: string) {
  const date = parseAuditDate(auditDate);
  if (Number.isNaN(date.getTime())) return true;
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
    <div
      className={`overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="border-b border-violet-100 bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
        {right}
      </div>
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

function SummaryStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

function LogoBox() {
  return (
    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-sm">
      <img src="/robinhood-logo.png" alt="Robinhood Logo" className="h-12 w-12 object-contain" />
    </div>
  );
}

function AppealCaseCard({
  item,
  isSelected,
  onSelect,
}: {
  item: AppealCaseItem;
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
      className={`cursor-pointer rounded-2xl border p-4 transition ${
        isSelected
          ? "border-violet-400 bg-violet-100 shadow-sm"
          : "border-violet-100 bg-white hover:bg-violet-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900">{item.caseId}</div>
          <div className="mt-1 text-[11px] text-slate-500">{item.auditDate}</div>
        </div>

        <span
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${gradeTone(
            item.grade
          )}`}
        >
          {item.grade}
        </span>
      </div>

      <div className="mt-3 rounded-2xl bg-white/70 px-3 py-3">
        <div className="text-[11px] font-semibold text-slate-500">Appealed Topics</div>
        <div className="mt-1 text-sm font-bold text-slate-900">
          {item.appealedTopics.length} topic(s)
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
        <span>{item.weekLabel || "-"}</span>
        <span className="flex items-center gap-2 text-sm font-extrabold">
          <span className="text-rose-600">{item.previousScore.toFixed(0)}</span>
          <span className="text-slate-300">→</span>
          <span className="text-emerald-600">{item.finalScore.toFixed(0)}</span>
        </span>
      </div>
    </div>
  );
}

function TopicChangeCard({ item }: { item: AppealTopicItem }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-violet-200 bg-white shadow-sm">
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-white px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-violet-700">
              Topic {item.code}
            </div>
            <div className="mt-1 text-lg font-extrabold text-slate-900">{item.label}</div>
            <div className="mt-2 text-sm text-slate-600">หัวข้อที่มีการอุทธรณ์และปรับผลจริง</div>
          </div>

          <div className="min-w-[260px] rounded-2xl border border-violet-300 bg-white px-4 py-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Score Adjustment
            </div>
            <div className="mt-2 flex items-center gap-3 text-2xl font-extrabold">
              <span className="text-rose-600">{item.originalScore}</span>
              <span className="text-slate-300">→</span>
              <span className="text-emerald-600">{item.revisedScore}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-violet-700">
              Appealed Issue
            </div>
            <div className="mt-2 whitespace-pre-line text-[14px] leading-6 text-slate-900">
              {item.appealReason || "-"}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">
              Appeal Result
            </div>
            <div className="mt-2 whitespace-pre-line text-[14px] leading-6 text-slate-900">
              {item.revisedComment || "-"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppealMockup({
  currentUser,
}: {
  currentUser: any;
}) {
  const [allAppeals, setAllAppeals] = useState<AppealCaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedCaseKey, setSelectedCaseKey] = useState("");
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

        const rawCaseScoreMap = new Map<
          string,
          {
            previousScore: number;
            agent: string;
            auditDate: string;
            weekLabel: string;
            inquiryTh: string;
          }
        >();

        rawDataRows.forEach((row) => {
          const caseId = String(rawHelper.getValue(row, "Case ID") ?? "").trim();
          if (!caseId) return;

          const finalScoreRaw = rawHelper.getValue(row, "Final Score");
          const topicTotal = TOPIC_MASTER.reduce((sum, topic) => {
            const scoreVal = Number(rawHelper.getValue(row, `${topic.code} Score`) || 0);
            return sum + (Number.isFinite(scoreVal) ? scoreVal : 0);
          }, 0);

          const previousScore =
            finalScoreRaw !== null && finalScoreRaw !== "" && !Number.isNaN(Number(finalScoreRaw))
              ? Number(finalScoreRaw)
              : topicTotal;

          const inquiry =
            rawHelper.getValue(row, "Customer Inquiry") ??
            rawHelper.getValue(row, "Inquiry TH") ??
            rawHelper.getValue(row, "Inquiry") ??
            "-";

          const weekLabel =
            rawHelper.getValue(row, "Week Label") ??
            rawHelper.getValue(row, "Week") ??
            "-";

          rawCaseScoreMap.set(caseId, {
            previousScore,
            agent: String(rawHelper.getValue(row, "Agent Name") ?? "").trim(),
            auditDate: formatDate(rawHelper.getValue(row, "Audit Date")),
            weekLabel: String(weekLabel || "-").trim(),
            inquiryTh: String(inquiry || "-").trim(),
          });
        });

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
        const helper = buildHeaderHelpers(appealHeaderRow);

        const mapped: AppealCaseItem[] = appealDataRows
          .filter((row) => row && helper.getValue(row, "Case ID"))
          .map((row, index) => {
            const caseId = String(helper.getValue(row, "Case ID") ?? "").trim();
            const rawCase = rawCaseScoreMap.get(caseId);

            const appealedTopics: AppealTopicItem[] = TOPIC_MASTER.map((topic) => {
              const originalScoreRaw = helper.getValue(row, `${topic.code} Score`);
              const revisedScoreRaw = helper.getValue(row, `${topic.code} Revised Score`);
              const originalCommentRaw = helper.getValue(row, `${topic.code} Comment`);
              const revisedCommentRaw = helper.getValue(row, `${topic.code} Revised Comment`);
              const appealReasonRaw = helper.getValue(row, `${topic.code} Appeal Reason`);

              const appealReason = String(appealReasonRaw ?? "").trim();

              const appealedThisTopic = !isNoAppealReason(appealReasonRaw);
              if (!appealedThisTopic) return null;

              const changed = hasRealTopicChange(
                originalScoreRaw,
                revisedScoreRaw,
                originalCommentRaw,
                revisedCommentRaw
              );
              if (!changed) return null;

              const originalScore =
                originalScoreRaw !== null &&
                originalScoreRaw !== "" &&
                !Number.isNaN(Number(originalScoreRaw))
                  ? Number(originalScoreRaw)
                  : 0;

              const revisedScore =
                revisedScoreRaw !== null &&
                revisedScoreRaw !== "" &&
                !Number.isNaN(Number(revisedScoreRaw))
                  ? Number(revisedScoreRaw)
                  : originalScore;

              const revisedComment =
                revisedCommentRaw !== null && String(revisedCommentRaw).trim() !== ""
                  ? String(revisedCommentRaw).trim()
                  : String(originalCommentRaw ?? "").trim();

              return {
                code: topic.code,
                label: topic.label,
                max: topic.max,
                originalScore,
                revisedScore,
                revisedComment,
                appealReason,
                changed,
              };
            }).filter(Boolean) as AppealTopicItem[];

            const explicitFinalScore = helper.getLastValue(row, "Final Score");

            const finalScore =
              explicitFinalScore !== null &&
              explicitFinalScore !== "" &&
              !Number.isNaN(Number(explicitFinalScore))
                ? Number(explicitFinalScore)
                : appealedTopics.reduce((sum, topic) => sum + topic.revisedScore, 0);

            const previousScore = rawCase?.previousScore ?? finalScore;

            const agent =
              helper.getValue(row, "Agent Name") ??
              helper.getValue(row, "QA Name") ??
              helper.getValue(row, "Agent") ??
              rawCase?.agent ??
              "";

            const inquiry =
              helper.getValue(row, "Customer Inquiry") ??
              helper.getValue(row, "Inquiry TH") ??
              helper.getValue(row, "Inquiry") ??
              rawCase?.inquiryTh ??
              "-";

            const appealReviewSummary = String(
              helper.getValue(row, "Appeal Review Summary") ?? ""
            ).trim();

            const reviewStatus: ReviewStatus = appealedTopics.length ? "Revised" : "Original";

            return {
              key: `appeal-${index + 1}-${caseId}`,
              caseId,
              agent: String(agent || "").trim(),
              auditDate:
                formatDate(
                  helper.getValue(row, "Audit Date") ??
                    helper.getValue(row, "Selected Case Date") ??
                    helper.getValue(row, "QA Date")
                ) || rawCase?.auditDate || "-",
              appealSubmitDateTime: formatDateTime(
                helper.getValue(row, "Appeal Submit") ??
                  helper.getValue(row, "Appeal Submit Date & Time") ??
                  helper.getValue(row, "Appeal Submit Date")
              ),
              appealResultDateTime: formatDateTime(
                helper.getValue(row, "Appeal Result") ??
                  helper.getValue(row, "Appeal Result Date & Time") ??
                  helper.getValue(row, "Appeal Result Date")
              ),
              appealChannel: String(helper.getValue(row, "Appeal Channel") ?? "-").trim() || "-",
              weekLabel:
                String(
                  helper.getValue(row, "Week Label") ??
                    helper.getValue(row, "Week") ??
                    rawCase?.weekLabel ??
                    "-"
                ).trim() || "-",
              finalScore,
              previousScore,
              grade: scoreToGrade(finalScore),
              reviewStatus,
              inquiryTh: String(inquiry || "-").trim(),
              appealReviewSummary,
              appealedTopics,
            };
          })
          .filter((item) => item.caseId && item.appealedTopics.length > 0);

        setAllAppeals(mapped);
      } catch (error: any) {
        console.error("Appeal Load Error:", error);
        setLoadError(error?.message || "โหลดไฟล์ Appeal ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);

  const visibleAgentList = useMemo(() => {
    const agentsFromAppeals = allAppeals.map((item) => String(item.agent || "").trim()).filter(Boolean);
    const mergedAgents = [...new Set([...AGENT_MASTER, ...agentsFromAppeals])].sort((a, b) =>
      a.localeCompare(b)
    );

    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return mergedAgents.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }

    return mergedAgents;
  }, [allAppeals, currentUser]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      setSelectedAgent(currentUser.agentName);
    }
  }, [currentUser]);

  const effectiveSelectedAgent =
    currentUser?.role === "Agent" && currentUser.agentName
      ? String(currentUser.agentName).trim()
      : String(selectedAgent || "").trim();

  const agentAppeals = useMemo(() => {
    if (!effectiveSelectedAgent) return [];
    return allAppeals.filter((item) => isSameAgent(item.agent, effectiveSelectedAgent));
  }, [allAppeals, effectiveSelectedAgent]);

  const filteredAppeals = useMemo(() => {
    return agentAppeals.filter((item) => isWithinDateRange(item.auditDate, dateFrom, dateTo));
  }, [agentAppeals, dateFrom, dateTo]);

  const selectedCase =
    filteredAppeals.find((item) => item.key === selectedCaseKey) || filteredAppeals[0] || null;

  useEffect(() => {
    if (!filteredAppeals.length) {
      if (selectedCaseKey !== "") setSelectedCaseKey("");
      return;
    }

    const stillExists = filteredAppeals.some((item) => item.key === selectedCaseKey);
    if (!stillExists) {
      setSelectedCaseKey(filteredAppeals[0].key);
    }
  }, [filteredAppeals, selectedCaseKey]);

  const totalAppealCases = filteredAppeals.length;
  const totalAppealedTopics = filteredAppeals.reduce(
    (sum, item) => sum + item.appealedTopics.length,
    0
  );
  const averageFinal =
    filteredAppeals.reduce((sum, item) => sum + item.finalScore, 0) /
    Math.max(filteredAppeals.length, 1);

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
                QA Appeal Review
              </div>
              <div className="mt-2 text-3xl font-bold tracking-tight">Appeal Result Dashboard</div>
              <div className="mt-2 max-w-3xl text-sm text-violet-100">
                แสดงเฉพาะหัวข้อที่มีการอุทธรณ์จริงและมีการเปลี่ยนจริงจากไฟล์ Appeal
              </div>
            </div>

            <LogoBox />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1700px] px-6 py-6">
        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel>
              <PanelHeader title="Quick Controls" subtitle="Filter by agent and date" />
              <PanelBody className="space-y-4">
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
                      onChange={(e) => {
                        setSelectedAgent(e.target.value);
                        setSelectedCaseKey("");
                      }}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                    >
                      <option value="">Select Agent</option>
                      {visibleAgentList.map((agent) => (
                        <option key={agent} value={agent}>
                          {agent}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      Date From
                    </div>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
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
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                    />
                  </div>
                </div>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Appeal Case List" subtitle="เฉพาะเคสที่มีหัวข้ออุทธรณ์จริง" />
              <PanelBody>
                {!filteredAppeals.length ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    ไม่พบข้อมูลอุทธรณ์ในช่วงที่เลือก
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredAppeals.map((item) => (
                      <AppealCaseCard
                        key={item.key}
                        item={item}
                        isSelected={selectedCase?.key === item.key}
                        onSelect={() => setSelectedCaseKey(item.key)}
                      />
                    ))}
                  </div>
                )}
              </PanelBody>
            </Panel>
          </div>

          <div className="space-y-6">
            {effectiveSelectedAgent ? (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard
                    title="Appeal Cases"
                    value={`${totalAppealCases}`}
                    sub="cases in current filter"
                  />
                  <MetricCard
                    title="Appealed Topics"
                    value={`${totalAppealedTopics}`}
                    sub="topics actually adjusted"
                  />
                  <MetricCard
                    title="Average Final Score"
                    value={averageFinal.toFixed(2)}
                    sub="after appeal result"
                  />
                </div>

                {selectedCase ? (
                  <>
                    <Panel>
                      <PanelHeader
                        title="Appeal Case Summary"
                        subtitle="ข้อมูลสรุปของเคสที่เลือก"
                        right={
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-bold ${gradeTone(
                              selectedCase.grade
                            )}`}
                          >
                            Grade {selectedCase.grade}
                          </span>
                        }
                      />
                      <PanelBody className="space-y-5">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <SummaryStat label="Case ID" value={selectedCase.caseId} />
                          <SummaryStat label="Agent" value={selectedCase.agent} />
                          <SummaryStat
                            label="Appeal Submit"
                            value={selectedCase.appealSubmitDateTime || "-"}
                          />
                          <SummaryStat
                            label="Appeal Result"
                            value={selectedCase.appealResultDateTime || "-"}
                          />
                          <SummaryStat
                            label="Appeal Channel"
                            value={selectedCase.appealChannel || "-"}
                          />
                          <SummaryStat label="Audit Date" value={selectedCase.auditDate || "-"} />

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                              Score Change
                            </div>
                            <div className="mt-2 flex items-center gap-3 text-base font-extrabold">
                              <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-rose-200">
                                {selectedCase.previousScore.toFixed(0)}
                              </span>
                              <span className="text-slate-300">→</span>
                              <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200">
                                {selectedCase.finalScore.toFixed(0)}
                              </span>
                            </div>
                          </div>

                          <SummaryStat
                            label="Appealed Topics"
                            value={`${selectedCase.appealedTopics.length} topic(s)`}
                          />
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                            Customer Inquiry
                          </div>
                          <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-800">
                            {selectedCase.inquiryTh || "-"}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                          <div className="text-[11px] font-extrabold uppercase tracking-wide text-sky-700">
                            Appeal Review Summary
                          </div>
                          <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-900">
                            {selectedCase.appealReviewSummary || "-"}
                          </div>
                        </div>

                        <div className="rounded-[24px] border-2 border-rose-300 bg-gradient-to-r from-rose-50 via-red-50 to-rose-100 px-5 py-5 shadow-sm">
                          <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 shadow-sm">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-6 w-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 9v3.75m0 3.75h.008v.008H12v-.008z"
                                />
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M10.29 3.86L1.82 18a2 2 0 001.72 3h16.92a2 2 0 001.72-3L13.71 3.86a2 2 0 00-3.42 0z"
                                />
                              </svg>
                            </div>

                            <div className="min-w-0">
                              <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-rose-700">
                                Appeal Closed
                              </div>
                              <div className="mt-2 text-lg font-extrabold leading-7 text-rose-800">
                                Appeal Review Completed
                              </div>
                              <div className="mt-2 text-sm leading-7 text-rose-700">
                                เคสนี้ได้ผ่านการพิจารณาอุทธรณ์เรียบร้อยแล้ว และไม่สามารถยื่นอุทธรณ์เพิ่มเติมได้อีก
                                สถานะปัจจุบันถือว่าปิดเคสสมบูรณ์
                              </div>
                            </div>
                          </div>
                        </div>
                      </PanelBody>
                    </Panel>

                    <Panel>
                      <PanelHeader
                        title="Appeal Topic Review"
                        subtitle="แสดงเฉพาะหัวข้อที่มีการอุทธรณ์จริงและมีการเปลี่ยนจริง"
                      />
                      <PanelBody className="space-y-4">
                        {selectedCase.appealedTopics.map((topic) => (
                          <TopicChangeCard key={topic.code} item={topic} />
                        ))}
                      </PanelBody>
                    </Panel>
                  </>
                ) : (
                  <Panel>
                    <PanelHeader title="Appeal Result" />
                    <PanelBody>
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                        กรุณาเลือกเคสอุทธรณ์จากรายการด้านซ้าย
                      </div>
                    </PanelBody>
                  </Panel>
                )}
              </>
            ) : (
              <Panel>
                <PanelHeader title="Appeal Result" />
                <PanelBody>
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    กรุณาเลือก Agent ก่อน
                  </div>
                </PanelBody>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
