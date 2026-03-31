import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";

type ReviewStatus = "Original" | "Revised";
type Grade = "A" | "B" | "C" | "D" | "F";

type Topic = {
  code: string;
  label: string;
  score: number;
  max: number;
  pct: number;
  comment?: string;
  originalScore?: number;
  originalComment?: string;
  appealReason?: string;
  appealed?: boolean;
  changed?: boolean;
};

type AppealCaseItem = {
  key: string;
  caseId: string;
  agent: string;
  auditDate: string;
  weekLabel: string;
  inquiry: string;
  previousScore: number;
  finalScore: number;
  reviewStatus: ReviewStatus;
  grade: Grade;
  appealVersion: string;
  appealSubmitDateTime: string;
  appealResultDateTime: string;
  appealChannel: string;
  caseUrl?: string;
  appealedTopics: Topic[];
  changedTopics: Topic[];
  allTopics: Topic[];
};

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

function getFirstNonEmptyValue(
  helper: { getValue: (row: any[], name: string, occurrence?: number) => any },
  row: any[],
  names: string[]
) {
  for (const name of names) {
    const value = helper.getValue(row, name);
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function getValueByHeaderIncludes(headerRow: any[], row: any[], keywords: string[]) {
  const normalizedHeaders = headerRow.map((h) => normalizeText(h));
  const foundIndex = normalizedHeaders.findIndex((header) =>
    keywords.every((keyword) => header.includes(normalizeText(keyword)))
  );
  return foundIndex >= 0 ? row[foundIndex] : null;
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

function parseExcelDate(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const hh = parsed.H || 0;
    const mm = parsed.M || 0;
    const ss = parsed.S || 0;
    return new Date(parsed.y, parsed.m - 1, parsed.d, hh, mm, ss);
  }

  const text = String(value).trim();
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct;

  const cleaned = text.replace(",", "");
  const direct2 = new Date(cleaned);
  if (!Number.isNaN(direct2.getTime())) return direct2;

  return null;
}

function formatDateOnly(value: any): string {
  const dt = parseExcelDate(value);
  if (!dt) return String(value ?? "").trim();
  const dd = `${dt.getDate()}`.padStart(2, "0");
  const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateTime(value: any): string {
  const dt = parseExcelDate(value);
  if (!dt) return String(value ?? "").trim();
  const dd = `${dt.getDate()}`.padStart(2, "0");
  const mm = `${dt.getMonth() + 1}`.padStart(2, "0");
  const yyyy = dt.getFullYear();
  const hh = `${dt.getHours()}`.padStart(2, "0");
  const min = `${dt.getMinutes()}`.padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function normalizeComment(value?: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeAppealReason(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isNoAppealReason(value: unknown) {
  const text = normalizeAppealReason(value).toLowerCase();
  if (!text) return false;
  return (
    text === "ไม่อุทธรณ์หัวข้อนี้" ||
    text === "not appeal" ||
    text === "no appeal" ||
    text.includes("ไม่อุทธรณ์")
  );
}

function hasMeaningfulTextChange(originalValue?: string, revisedValue?: string) {
  const original = normalizeComment(originalValue);
  const revised = normalizeComment(revisedValue);
  if (!revised) return false;
  if (!original) return revised.length > 0;
  return original !== revised;
}

function isRealTopicChanged(
  originalScore: number,
  revisedScore: number,
  originalComment?: string,
  revisedComment?: string
) {
  return (
    Number(originalScore) !== Number(revisedScore) ||
    hasMeaningfulTextChange(originalComment, revisedComment)
  );
}

function formatScoreDiff(previousScore: number, finalScore: number) {
  const diff = Number((finalScore - previousScore).toFixed(2));
  if (diff > 0) return `+${diff.toFixed(2)}`;
  return diff.toFixed(2);
}

function scoreDiffTone(previousScore: number, finalScore: number) {
  const diff = finalScore - previousScore;
  if (diff > 0) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (diff < 0) return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function topicScoreStatusTone(originalScore: number, revisedScore: number) {
  if (revisedScore > originalScore) {
    return {
      label: "Improved",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (revisedScore < originalScore) {
    return {
      label: "Reduced",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }
  return {
    label: "No Change",
    className: "border-slate-200 bg-slate-50 text-slate-700",
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
      className={`overflow-hidden rounded-[30px] border border-violet-200/80 bg-white/95 shadow-[0_12px_34px_rgba(76,29,149,0.08)] ${className}`}
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
    <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-5 py-4">
      <div className="text-[17px] font-bold tracking-tight text-slate-900">{title}</div>
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
  return <div className={`p-5 lg:p-6 ${className}`}>{children}</div>;
}

function ScoreCard({
  title,
  value,
  tone,
  sub,
}: {
  title: string;
  value: string;
  tone: string;
  sub?: string;
}) {
  return (
    <div className={`rounded-[24px] border p-5 ${tone}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em]">{title}</div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight">{value}</div>
      {sub ? <div className="mt-2 text-xs opacity-80">{sub}</div> : null}
    </div>
  );
}

function AppealClosedBanner() {
  return (
    <div className="rounded-[30px] border border-rose-300 bg-gradient-to-r from-rose-700 via-rose-700 to-red-600 px-6 py-6 text-white shadow-[0_18px_40px_rgba(190,24,93,0.18)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.26em] text-rose-100">
            Appeal Closed
          </div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight">
            This appeal has been finalized
          </div>
          <div className="mt-2 text-sm leading-6 text-rose-50/95">
            เคสนี้ได้พิจารณาอุทธรณ์เสร็จสิ้นแล้ว และไม่สามารถยื่นอุทธรณ์เพิ่มเติมได้อีก
          </div>
        </div>

        <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-4 backdrop-blur-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-100">
            Final Status
          </div>
          <div className="mt-1 text-lg font-bold">Case Closed</div>
        </div>
      </div>
    </div>
  );
}

function QuickCaseCard({
  item,
  isSelected,
  onClick,
}: {
  item: AppealCaseItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[22px] border p-4 text-left transition ${
        isSelected
          ? "border-violet-400 bg-gradient-to-br from-violet-100 to-fuchsia-100 shadow-[0_10px_22px_rgba(109,40,217,0.14)]"
          : "border-violet-100 bg-white hover:border-violet-300 hover:bg-violet-50/70"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-900">{item.caseId}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {item.agent} · {item.appealResultDateTime || item.auditDate}
          </div>
        </div>

        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${gradeTone(
            item.grade
          )}`}
        >
          {item.grade}
        </span>
      </div>

      <div className="mt-3 line-clamp-2 text-[12px] leading-5 text-slate-700">
        {item.inquiry || "-"}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-violet-700">
          {item.previousScore.toFixed(0)} → {item.finalScore.toFixed(0)}
        </span>
        <span className="text-slate-500">{item.appealedTopics.length} appealed topic(s)</span>
      </div>
    </button>
  );
}

function TopicAppealCard({ topic }: { topic: Topic }) {
  const originalScore = Number(topic.originalScore ?? topic.score);
  const revisedScore = Number(topic.score);
  const diff = revisedScore - originalScore;
  const commentChanged = hasMeaningfulTextChange(topic.originalComment, topic.comment);
  const statusTone = topicScoreStatusTone(originalScore, revisedScore);

  return (
    <div className="overflow-hidden rounded-[26px] border border-violet-200 bg-white shadow-[0_10px_28px_rgba(76,29,149,0.08)]">
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">
              {topic.code}
            </div>
            <div className="mt-1 text-base font-bold text-slate-900">{topic.label}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${statusTone.className}`}
            >
              {statusTone.label}
            </span>

            {commentChanged ? (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700">
                Comment Updated
              </span>
            ) : (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                Comment Maintained
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Original Score
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">{originalScore}</div>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
              Revised Score
            </div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900">{revisedScore}</div>
          </div>

          <div className={`rounded-2xl border px-4 py-4 ${statusTone.className}`}>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
              Score Change
            </div>
            <div className="mt-2 text-2xl font-extrabold">
              {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "0"}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-800">Score Comparison</div>
            <div className="text-sm font-bold text-violet-800">
              {originalScore} → {revisedScore}
              {diff === 0 ? " (No Change)" : ""}
            </div>
          </div>
        </div>

        {topic.appealReason ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
              Appeal Reason
            </div>
            <div className="mt-2 whitespace-pre-line text-[13px] leading-6 text-slate-800">
              {topic.appealReason}
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
              Revised Comment
            </div>
            <div className="mt-2 whitespace-pre-line text-[13px] leading-6 text-slate-800">
              {topic.comment || "No revised comment"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppealMockup({
  currentUser,
  externalSelectedAgent,
  onSelectedAgentChange,
}: {
  currentUser: any;
  externalSelectedAgent?: string;
  onSelectedAgentChange?: (agentName: string) => void;
}) {
  const [allCases, setAllCases] = useState<AppealCaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedCaseKey, setSelectedCaseKey] = useState("");
  const [searchCaseId, setSearchCaseId] = useState("");
  const [selectedAgent, setSelectedAgent] = useState(externalSelectedAgent || "");

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

        if (!rawResponse.ok) throw new Error("ไม่พบไฟล์ QA_RawData1.xlsx ในโฟลเดอร์ public");
        if (!appealResponse.ok) throw new Error("ไม่พบไฟล์ Appleal ROWDATA.xlsx ในโฟลเดอร์ public");

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
        if (rawHeaderIndex === -1) throw new Error("ไม่พบ Header ใน QA_RawData1.xlsx");

        const rawHeaderRow = (rawRows[rawHeaderIndex] || []) as any[];
        const rawDataRows = rawRows.slice(rawHeaderIndex + 1);
        const rawHelper = buildHeaderHelpers(rawHeaderRow);

        const rawCaseMap = new Map<string, any[]>();
        rawDataRows.forEach((row) => {
          const caseId = String(rawHelper.getValue(row, "Case ID") ?? "").trim();
          if (caseId) rawCaseMap.set(caseId, row);
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
        if (appealHeaderIndex === -1) throw new Error("ไม่พบ Header ใน Appleal ROWDATA.xlsx");

        const appealHeaderRow = (appealRows[appealHeaderIndex] || []) as any[];
        const appealDataRows = appealRows.slice(appealHeaderIndex + 1);
        const appealHelper = buildHeaderHelpers(appealHeaderRow);

        const mapped: AppealCaseItem[] = appealDataRows
          .map((row, index) => {
            const caseId = String(appealHelper.getValue(row, "Case ID") ?? "").trim();
            if (!caseId) return null;

            const rawRow = rawCaseMap.get(caseId);
            const agent = rawRow
              ? String(rawHelper.getValue(rawRow, "Agent Name") ?? "").trim()
              : String(appealHelper.getValue(row, "Agent Name") ?? "").trim();

            const inquiry = rawRow
              ? String(
                  rawHelper.getValue(rawRow, "Customer Inquiry") ??
                    rawHelper.getValue(rawRow, "Inquiry TH") ??
                    rawHelper.getValue(rawRow, "Inquiry") ??
                    ""
                ).trim()
              : String(
                  appealHelper.getValue(row, "Customer Inquiry") ??
                    appealHelper.getValue(row, "Inquiry TH") ??
                    appealHelper.getValue(row, "Inquiry") ??
                    ""
                ).trim();

            const auditDate = rawRow
              ? formatDateOnly(rawHelper.getValue(rawRow, "Audit Date"))
              : formatDateOnly(appealHelper.getValue(row, "Audit Date"));

            const weekLabel = rawRow
              ? String(
                  rawHelper.getValue(rawRow, "Week Label") ??
                    rawHelper.getValue(rawRow, "Week") ??
                    "-"
                ).trim()
              : String(
                  appealHelper.getValue(row, "Week Label") ??
                    appealHelper.getValue(row, "Week") ??
                    "-"
                ).trim();

            const caseUrl = rawRow
              ? String(
                  rawHelper.getValue(rawRow, "Case URL") ??
                    rawHelper.getValue(rawRow, "Case Url") ??
                    rawHelper.getValue(rawRow, "URL") ??
                    ""
                ).trim()
              : String(
                  appealHelper.getValue(row, "Case URL") ??
                    appealHelper.getValue(row, "Case Url") ??
                    appealHelper.getValue(row, "URL") ??
                    ""
                ).trim();

            const previousScoreRaw =
              appealHelper.getValue(row, "Final Score", 0) ??
              rawHelper.getValue(rawRow || [], "Final Score") ??
              0;

            const finalScoreRaw =
              appealHelper.getLastValue(row, "Final Score") ??
              rawHelper.getValue(rawRow || [], "Final Score") ??
              0;

            const previousScore = Number(previousScoreRaw || 0);
            const finalScore = Number(finalScoreRaw || 0);

            const appealSubmitRaw =
              getFirstNonEmptyValue(appealHelper, row, [
                "Appeal Submit Date & Time",
                "APPEAL SUBMIT DATE & TIME",
                "Appeal Submit Date",
                "Submit Date & Time",
                "Submit Date",
                "Created",
                "Created Date",
                "File Created Date",
              ]) ??
              getValueByHeaderIncludes(appealHeaderRow, row, ["appeal", "submit"]) ??
              getValueByHeaderIncludes(appealHeaderRow, row, ["submit", "date"]) ??
              getValueByHeaderIncludes(appealHeaderRow, row, ["submit"]) ??
              getValueByHeaderIncludes(appealHeaderRow, row, ["created"]);

            const appealResultRaw =
              getFirstNonEmptyValue(appealHelper, row, [
                "Appeal Result Date & Time",
                "APPEAL RESULT DATE & TIME",
                "Appeal Result Date",
                "Result Date & Time",
                "Result Date",
                "Created",
                "Created Date",
                "File Created Date",
              ]) ??
              getValueByHeaderIncludes(appealHeaderRow, row, ["appeal", "result"]) ??
              getValueByHeaderIncludes(appealHeaderRow, row, ["result", "date"]) ??
              getValueByHeaderIncludes(appealHeaderRow, row, ["result"]) ??
              getValueByHeaderIncludes(appealHeaderRow, row, ["created"]);

            const appealChannelRaw = getFirstNonEmptyValue(appealHelper, row, [
              "Appeal Channel",
              "Channel",
            ]);

            const appealVersionRaw = getFirstNonEmptyValue(appealHelper, row, [
              "Appeal Version",
              "Version",
            ]);

            const topics: Topic[] = TOPIC_MASTER.map((master) => {
              const originalScore =
                Number(
                  rawRow
                    ? rawHelper.getValue(rawRow, `${master.code} Score`)
                    : appealHelper.getValue(row, `${master.code} Score`)
                ) || 0;

              const originalComment = String(
                rawRow
                  ? rawHelper.getValue(rawRow, `${master.code} Comment`) ?? ""
                  : appealHelper.getValue(row, `${master.code} Comment`) ?? ""
              ).trim();

              const revisedScoreCandidate = appealHelper.getValue(
                row,
                `${master.code} Revised Score`
              );
              const revisedCommentCandidate = appealHelper.getValue(
                row,
                `${master.code} Revised Comment`
              );
              const appealReason = String(
                appealHelper.getValue(row, `${master.code} Appeal Reason`) ?? ""
              ).trim();

              const hasRevisedScore =
                revisedScoreCandidate !== null &&
                revisedScoreCandidate !== "" &&
                !Number.isNaN(Number(revisedScoreCandidate));

              const hasRevisedComment =
                revisedCommentCandidate !== null &&
                String(revisedCommentCandidate).trim() !== "";

              const revisedScore = hasRevisedScore ? Number(revisedScoreCandidate) : originalScore;
              const revisedComment = hasRevisedComment
                ? String(revisedCommentCandidate).trim()
                : originalComment;

              const appealed = !!appealReason && !isNoAppealReason(appealReason);
              const changed =
                appealed &&
                isRealTopicChanged(
                  originalScore,
                  revisedScore,
                  originalComment,
                  revisedComment
                );

              return {
                code: master.code,
                label: master.label,
                score: revisedScore,
                max: master.max,
                pct: master.max > 0 ? Math.round((revisedScore / master.max) * 100) : 0,
                comment: revisedComment,
                originalScore,
                originalComment,
                appealReason,
                appealed,
                changed,
              };
            });

            const appealedTopics = topics.filter((topic) => topic.appealed);
            const changedTopics = topics.filter((topic) => topic.changed);

            return {
              key: `appeal-${index + 1}-${caseId}`,
              caseId,
              agent,
              auditDate,
              weekLabel,
              inquiry,
              previousScore,
              finalScore,
              reviewStatus: changedTopics.length ? "Revised" : "Original",
              grade: scoreToGrade(finalScore),
              appealVersion: String(appealVersionRaw ?? "-").trim() || "-",
              appealSubmitDateTime: formatDateTime(appealSubmitRaw) || "-",
              appealResultDateTime: formatDateTime(appealResultRaw) || "-",
              appealChannel: String(appealChannelRaw ?? "-").trim() || "-",
              caseUrl,
              appealedTopics,
              changedTopics,
              allTopics: topics,
            } as AppealCaseItem;
          })
          .filter(Boolean) as AppealCaseItem[];

        setAllCases(mapped);
      } catch (error: any) {
        console.error(error);
        setLoadError(error?.message || "โหลดไฟล์ Excel ไม่สำเร็จ");
      } finally {
        setIsLoading(false);
      }
    };

    loadWorkbook();
  }, []);

  const visibleAgentList = useMemo(() => {
    const merged = [...new Set([...AGENT_MASTER, ...allCases.map((item) => item.agent).filter(Boolean)])];
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return merged.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }
    return merged.sort((a, b) => a.localeCompare(b));
  }, [allCases, currentUser]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      if (!isSameAgent(selectedAgent || "", currentUser.agentName)) {
        setSelectedAgent(currentUser.agentName);
      }
      onSelectedAgentChange?.(currentUser.agentName);
      return;
    }

    if (selectedAgent && !visibleAgentList.some((agent) => isSameAgent(agent, selectedAgent))) {
      setSelectedAgent("");
      onSelectedAgentChange?.("");
    }
  }, [currentUser, selectedAgent, visibleAgentList, onSelectedAgentChange]);

  const effectiveSelectedAgent =
    currentUser?.role === "Agent" && currentUser.agentName
      ? String(currentUser.agentName).trim()
      : String(selectedAgent || "").trim();

  const baseVisibleCases = useMemo(() => {
    if (currentUser?.role === "Agent" && currentUser?.agentName) {
      return allCases.filter((item) => isSameAgent(item.agent, currentUser.agentName));
    }
    if (!effectiveSelectedAgent) return allCases;
    return allCases.filter((item) => isSameAgent(item.agent, effectiveSelectedAgent));
  }, [allCases, currentUser, effectiveSelectedAgent]);

  const filteredCases = useMemo(() => {
    const keyword = searchCaseId.trim().toLowerCase();
    if (!keyword) return baseVisibleCases;
    return baseVisibleCases.filter((item) => item.caseId.toLowerCase().includes(keyword));
  }, [baseVisibleCases, searchCaseId]);

  useEffect(() => {
    if (!filteredCases.length) {
      setSelectedCaseKey("");
      return;
    }
    const exists = filteredCases.some((item) => item.key === selectedCaseKey);
    if (!exists) {
      setSelectedCaseKey(filteredCases[0].key);
    }
  }, [filteredCases, selectedCaseKey]);

  const selectedCase =
    filteredCases.find((item) => item.key === selectedCaseKey) || filteredCases[0] || null;

  const handleGeneratePdf = () => {
    if (!selectedCase) return;

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 16;
    const right = pageWidth - 16;
    const contentWidth = right - left;
    let y = 16;

    const ensureSpace = (needed = 12) => {
      if (y + needed > pageHeight - 16) {
        doc.addPage();
        y = 16;
      }
    };

    const addSectionTitle = (text: string) => {
      ensureSpace(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(88, 28, 135);
      doc.text(text, left, y);
      y += 8;
    };

    const addLine = (
      text: string,
      size = 10,
      color: [number, number, number] = [51, 65, 85],
      gap = 6
    ) => {
      ensureSpace(10);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      const lines = doc.splitTextToSize(text || "-", contentWidth);
      doc.text(lines, left, y);
      y += lines.length * (size * 0.4) + gap;
    };

    const addLabelValue = (label: string, value: string) => {
      ensureSpace(8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(88, 28, 135);
      doc.text(label, left, y);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(value || "-", contentWidth - 42);
      doc.text(lines, left + 42, y);
      y += Math.max(6, lines.length * 5);
    };

    doc.setFillColor(91, 33, 182);
    doc.roundedRect(left, y, contentWidth, 18, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Robinhood QA Appeal Result", left + 6, y + 11);
    y += 26;

    addLabelValue("Case ID", selectedCase.caseId);
    addLabelValue("Agent", selectedCase.agent);
    addLabelValue("Audit Date", selectedCase.auditDate || "-");
    addLabelValue("Week", selectedCase.weekLabel || "-");
    addLabelValue("Appeal Version", selectedCase.appealVersion || "-");
    addLabelValue("Review Status", selectedCase.reviewStatus);
    addLabelValue("Grade", selectedCase.grade);
    addLabelValue(
      "Score",
      `${selectedCase.previousScore.toFixed(2)} → ${selectedCase.finalScore.toFixed(2)} (${formatScoreDiff(
        selectedCase.previousScore,
        selectedCase.finalScore
      )})`
    );
    addLabelValue("Appeal Submit", selectedCase.appealSubmitDateTime || "-");
    addLabelValue("Appeal Result", selectedCase.appealResultDateTime || "-");
    addLabelValue("Appeal Channel", selectedCase.appealChannel || "-");

    addSectionTitle("Customer Inquiry");
    addLine(selectedCase.inquiry || "-");

    addSectionTitle("Appealed Topics");
    if (!selectedCase.appealedTopics.length) {
      addLine("ไม่พบหัวข้อที่มีการยื่นอุทธรณ์");
    } else {
      selectedCase.appealedTopics.forEach((topic, idx) => {
        addLine(
          `${idx + 1}. ${topic.code} ${topic.label}`,
          10,
          [15, 23, 42],
          4
        );
        addLine(
          `Original Score: ${Number(topic.originalScore ?? 0)} | Revised Score: ${Number(
            topic.score
          )}`,
          9,
          [71, 85, 105],
          4
        );
        if (topic.appealReason) {
          addLine(`Appeal Reason: ${topic.appealReason}`, 9, [71, 85, 105], 4);
        }
        addLine(`Revised Comment: ${topic.comment || "-"}`, 9, [71, 85, 105], 6);
      });
    }

    doc.save(`QA_Appeal_${selectedCase.caseId}.pdf`);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="rounded-3xl border border-violet-200 bg-white px-8 py-6 text-center shadow-sm">
          <div className="text-lg font-bold text-violet-700">Loading appeal data...</div>
          <div className="mt-2 text-sm text-slate-500">กรุณารอสักครู่</div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-[30px] border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <div className="text-lg font-bold">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>
        <div className="mt-2 text-sm">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AppealClosedBanner />

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="h-fit">
          <PanelHeader
            title="Appeal Case List"
            subtitle="เลือกเคสที่ต้องการดูผลพิจารณาอุทธรณ์"
          />
          <PanelBody className="space-y-4">
            {currentUser?.role !== "Agent" ? (
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Agent
                </label>
                <select
                  value={selectedAgent}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedAgent(next);
                    onSelectedAgentChange?.(next);
                  }}
                  className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-0 transition focus:border-violet-400"
                >
                  <option value="">All Agents</option>
                  {visibleAgentList.map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Search Case ID
              </label>
              <input
                value={searchCaseId}
                onChange={(e) => setSearchCaseId(e.target.value)}
                placeholder="เช่น AA206880"
                className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-0 transition focus:border-violet-400"
              />
            </div>

            <div className="space-y-3">
              {!filteredCases.length ? (
                <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-6 text-center text-sm text-slate-500">
                  ไม่พบข้อมูลเคส
                </div>
              ) : (
                filteredCases.map((item) => (
                  <QuickCaseCard
                    key={item.key}
                    item={item}
                    isSelected={selectedCase?.key === item.key}
                    onClick={() => setSelectedCaseKey(item.key)}
                  />
                ))
              )}
            </div>
          </PanelBody>
        </Panel>

        <div className="space-y-6">
          {!selectedCase ? (
            <Panel>
              <PanelBody>
                <div className="rounded-2xl border border-dashed border-violet-200 bg-white/80 p-10 text-center text-sm text-slate-500">
                  กรุณาเลือกเคสจากรายการด้านซ้าย
                </div>
              </PanelBody>
            </Panel>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ScoreCard
                  title="Previous Score"
                  value={selectedCase.previousScore.toFixed(2)}
                  tone="border-slate-200 bg-slate-50 text-slate-800"
                />
                <ScoreCard
                  title="Final Score"
                  value={selectedCase.finalScore.toFixed(2)}
                  tone="border-violet-200 bg-violet-50 text-violet-800"
                />
                <ScoreCard
                  title="Score Change"
                  value={formatScoreDiff(selectedCase.previousScore, selectedCase.finalScore)}
                  tone={scoreDiffTone(selectedCase.previousScore, selectedCase.finalScore)}
                />
                <ScoreCard
                  title="Grade"
                  value={selectedCase.grade}
                  tone={gradeTone(selectedCase.grade)}
                  sub={selectedCase.reviewStatus}
                />
              </div>

              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.2fr)_360px]">
                <Panel>
                  <PanelHeader
                    title="Appeal Case Summary"
                    subtitle="ข้อมูลสรุปของเคสและผลการพิจารณาอุทธรณ์"
                  />
                  <PanelBody className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                          Case ID
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-900">
                          {selectedCase.caseId}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                          Agent
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-900">
                          {selectedCase.agent}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Audit Date
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-900">
                          {selectedCase.auditDate || "-"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Week Label
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-900">
                          {selectedCase.weekLabel || "-"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Appeal Version
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-900">
                          {selectedCase.appealVersion || "-"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Review Status
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-900">
                          {selectedCase.reviewStatus}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-violet-100 bg-white px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                        Customer Inquiry
                      </div>
                      <div className="mt-2 whitespace-pre-line text-[13px] leading-6 text-slate-800">
                        {selectedCase.inquiry || "-"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {selectedCase.caseUrl ? (
                        <a
                          href={selectedCase.caseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100"
                        >
                          Open Case Link
                        </a>
                      ) : null}

                      <button
                        type="button"
                        onClick={handleGeneratePdf}
                        className="inline-flex rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-2.5 text-sm font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
                      >
                        Generate PDF
                      </button>
                    </div>
                  </PanelBody>
                </Panel>

                <Panel>
                  <PanelHeader title="Appeal Timeline" subtitle="Submit and final result timestamps" />
                  <PanelBody className="space-y-4">
                    <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                        Appeal Submit Date & Time
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-900">
                        {selectedCase.appealSubmitDateTime || "-"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                        Appeal Result Date & Time
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-900">
                        {selectedCase.appealResultDateTime || "-"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Appeal Channel
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-900">
                        {selectedCase.appealChannel || "-"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-red-50 px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                        Final Decision
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-900">
                        Finalized and closed
                      </div>
                      <div className="mt-2 text-[12px] leading-6 text-slate-700">
                        This case has completed the appeal review process and cannot be appealed again.
                      </div>
                    </div>
                  </PanelBody>
                </Panel>
              </div>

              <Panel>
                <PanelHeader
                  title="Appealed Topics"
                  subtitle="แสดงเฉพาะหัวข้อที่มีการยื่นอุทธรณ์ พร้อมเปรียบเทียบคะแนนเดิมและคะแนนใหม่"
                />
                <PanelBody>
                  {!selectedCase.appealedTopics.length ? (
                    <div className="rounded-2xl border border-dashed border-violet-200 bg-white/80 p-8 text-center text-sm text-slate-500">
                      ไม่พบหัวข้อที่มีการยื่นอุทธรณ์
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedCase.appealedTopics.map((topic) => (
                        <TopicAppealCard
                          key={`${selectedCase.caseId}-${topic.code}`}
                          topic={topic}
                        />
                      ))}
                    </div>
                  )}
                </PanelBody>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
