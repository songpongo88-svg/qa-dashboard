import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";

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
  auditDateObj: Date | null;
  monthKey: string;
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
  appealReviewSummary: string;
  caseUrl?: string;
  appealedTopics: Topic[];
  changedTopics: Topic[];
  allTopics: Topic[];
};

const AGENT_MASTER = [
  "Anucha Makundin",
  "Arisa Aiemrit",
  "Chatkonnaphat Bhusomya",
  "Jariyawadee Taboodda",
  "Jureeporn Piddum",
  "Krivut Vongkampan",
  "Natcha Chai-in",
  "Nattapol Suprom",
  "Sunijtra Siritip",
  "Supakrit Promkhamnoi",
  "Suphitcha Keawliam",
  "Wachiraporn Chailittichai",
  "Wassana Phothong",
].sort((a, b) => a.localeCompare(b));

const RESIGNED_AGENT_HIDE_AFTER: Record<string, string> = {
  "Arisa Aiemrit": "2026-04",
};

const LEGACY_TOPIC_MASTER = [
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

const APRIL_2026_TOPIC_MASTER = [
  { code: "1.1", label: "มาตรฐานการทักทายและปิดการสนทนา", max: 10 },
  { code: "1.2", label: "การปฏิบัติตาม PDPA / Policy / ข้อกำหนด", max: 10 },
  { code: "1.3", label: "การปฏิบัติตามกระบวนการและ SLA", max: 10 },
  { code: "2.1", label: "ความถูกต้องของคำตอบ", max: 10 },
  { code: "2.2", label: "ความครบถ้วนของคำตอบ", max: 10 },
  { code: "2.3", label: "ความชัดเจนของขั้นตอนและแหล่งอ้างอิง", max: 5 },
  { code: "3.1", label: "การวิเคราะห์และแก้ไขปัญหาได้ตรงจุด", max: 15 },
  { code: "3.2", label: "Ownership และการแจ้ง Next Step", max: 10 },
  { code: "4.1", label: "โครงสร้างข้อความและความอ่านง่าย", max: 5 },
  { code: "4.2", label: "ความกระชับและความถูกต้องของภาษา", max: 5 },
  { code: "4.3", label: "น้ำเสียงและความเหมาะสมตามสถานการณ์", max: 10 },
] as const;

type TopicMasterItem = {
  code: string;
  label: string;
  max: number;
};

function getTopicMasterByMonth(monthKey: string): readonly TopicMasterItem[] {
  return isNewPolicyMonth(monthKey) ? APRIL_2026_TOPIC_MASTER : LEGACY_TOPIC_MASTER;
}

const SONGKRAN_THEME_END = new Date(2026, 4, 25, 23, 59, 59);
const NEW_POLICY_START_MONTH_KEY = "2026-04";

function isSongkranThemeActive() {
  return false;
}

function stripInvisibleChars(value: unknown) {
  return String(value ?? "").replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "");
}

function normalizeText(value: unknown) {
  return stripInvisibleChars(value)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactText(value: unknown) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function normalizeCaseId(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
}

function toTitleCaseName(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      if (part.includes("-")) {
        return part
          .split("-")
          .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : p))
          .join("-");
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
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

function shouldHideAgentByMonth(agentName: string, selectedMonthKey: string) {
  if (!selectedMonthKey || selectedMonthKey === "all" || selectedMonthKey === "unknown") {
    return false;
  }

  const matchedEntry = Object.entries(RESIGNED_AGENT_HIDE_AFTER).find(([name]) =>
    isSameAgent(name, agentName)
  );

  if (!matchedEntry) return false;

  const [, hideFromMonth] = matchedEntry;
  return selectedMonthKey >= hideFromMonth;
}

function getUniqueNormalizedAgents(agentNames: string[]) {
  const result: string[] = [];

  agentNames
    .map((name) => toTitleCaseName(String(name || "").trim()))
    .filter(Boolean)
    .forEach((name) => {
      const exists = result.some((item) => isSameAgent(item, name));
      if (!exists) result.push(name);
    });

  return result.sort((a, b) => a.localeCompare(b));
}

function isNewPolicyMonth(monthKey: string) {
  return monthKey !== "unknown" && monthKey >= NEW_POLICY_START_MONTH_KEY;
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

function scoreToGrade(score: number, monthKey: string): Grade {
  if (isNewPolicyMonth(monthKey)) {
    if (score >= 90) return "A";
    if (score >= 85) return "B";
    if (score >= 80) return "C";
    return "D";
  }

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

function roundExcelLikeMinute(date: Date) {
  const rounded = new Date(date.getTime());
  const seconds = rounded.getSeconds();
  const milliseconds = rounded.getMilliseconds();

  if (seconds >= 30 || milliseconds >= 500) {
    rounded.setMinutes(rounded.getMinutes() + 1);
  }

  rounded.setSeconds(0, 0);
  return rounded;
}

function parseExcelDate(value: any): Date | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return roundExcelLikeMinute(value);
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const hh = parsed.H || 0;
    const mm = parsed.M || 0;
    const ss = parsed.S || 0;
    return roundExcelLikeMinute(new Date(parsed.y, parsed.m - 1, parsed.d, hh, mm, ss));
  }

  const text = String(value).trim();
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct;

  const cleaned = text.replace(",", "");
  const direct2 = new Date(cleaned);
  if (!Number.isNaN(direct2.getTime())) return direct2;

  const ddmmyyyyMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (ddmmyyyyMatch) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = ddmmyyyyMatch;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }

  return null;
}

function getMonthKey(date: Date | null) {
  if (!date) return "unknown";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthKeyLabel(monthKey: string) {
  if (!monthKey || monthKey === "all") return "All Months";
  if (monthKey === "unknown") return "Unknown Month";

  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;

  const [, year, month] = match;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
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

function formatDateTimeOrRaw(value: any): string {
  if (value === null || value === undefined || value === "") return "-";
  const formatted = stripInvisibleChars(formatDateTime(value));
  const raw = stripInvisibleChars(String(value ?? "")).trim();
  return formatted && formatted.trim() !== "" ? formatted : raw || "-";
}

function sanitizeDisplayText(value: unknown, fallback = "-") {
  const cleaned = stripInvisibleChars(String(value ?? "")).trim();
  return cleaned || fallback;
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

function gradeShiftTone(originalGrade: Grade, revisedGrade: Grade) {
  if (originalGrade === revisedGrade) {
    return {
      label: `Grade Maintained · ${revisedGrade}`,
      className: "border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  const rank: Record<Grade, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
  const improved = rank[revisedGrade] > rank[originalGrade];

  return improved
    ? {
        label: `Grade Up · ${originalGrade} → ${revisedGrade}`,
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      }
    : {
        label: `Grade Down · ${originalGrade} → ${revisedGrade}`,
        className: "border-rose-200 bg-rose-50 text-rose-700",
      };
}

function SongkranBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-cyan-200/15 via-fuchsia-200/10 to-sky-200/15" />
      <div className="absolute left-[-40px] top-10 h-40 w-40 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="absolute right-0 top-12 h-36 w-36 rounded-full bg-fuchsia-300/20 blur-3xl" />
      <div className="absolute left-1/3 bottom-0 h-40 w-40 rounded-full bg-sky-300/15 blur-3xl" />
      <div className="absolute right-1/4 bottom-4 h-28 w-28 rounded-full bg-violet-300/15 blur-3xl" />
      <div className="absolute left-[10%] top-[20%] h-3 w-3 rounded-full bg-white/80" />
      <div className="absolute left-[18%] top-[12%] h-4 w-4 rounded-full bg-cyan-300/60" />
      <div className="absolute right-[12%] top-[18%] h-3 w-3 rounded-full bg-pink-300/50" />
      <div className="absolute left-5 bottom-4 hidden rounded-[24px] border border-white/20 bg-white/10 px-3 py-2 text-2xl backdrop-blur md:flex">
        🔫💦
      </div>
      <div className="absolute right-5 top-4 hidden rounded-[24px] border border-white/20 bg-white/10 px-3 py-2 text-2xl backdrop-blur md:flex">
        🪣🌸
      </div>
    </div>
  );
}

function SongkranFlowerCorner({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div className={`pointer-events-none absolute ${className}`}>
      <div className="relative h-12 w-12">
        <span className="absolute left-4 top-0 h-4 w-4 rounded-full bg-pink-300/70" />
        <span className="absolute left-0 top-4 h-4 w-4 rounded-full bg-fuchsia-300/70" />
        <span className="absolute left-4 top-8 h-4 w-4 rounded-full bg-cyan-300/70" />
        <span className="absolute left-8 top-4 h-4 w-4 rounded-full bg-sky-300/70" />
        <span className="absolute left-4 top-4 h-4 w-4 rounded-full bg-white/85 shadow-sm" />
      </div>
    </div>
  );
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
      className={`relative overflow-hidden rounded-[30px] border border-violet-200/80 bg-white/95 shadow-[0_12px_34px_rgba(76,29,149,0.08)] ${className}`}
    >
      {isSongkranThemeActive() ? (
        <SongkranFlowerCorner className="-right-2 -top-2 scale-75 opacity-70" />
      ) : null}
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
    <div
      className={`border-b px-5 py-4 ${
        isSongkranThemeActive()
          ? "border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-fuchsia-50"
          : "border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50"
      }`}
    >
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
    <div className={`relative overflow-hidden rounded-[24px] border p-5 ${tone}`}>
      {isSongkranThemeActive() ? (
        <span className="pointer-events-none absolute right-2 top-2 h-3 w-3 rounded-full bg-cyan-300/70" />
      ) : null}
      <div className="text-xs font-semibold uppercase tracking-[0.18em]">{title}</div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight">{value}</div>
      {sub ? <div className="mt-2 text-xs opacity-80">{sub}</div> : null}
    </div>
  );
}

function AppealClosedBanner() {
  return (
    <div className="relative overflow-hidden rounded-[30px] border border-rose-300 bg-gradient-to-r from-rose-700 via-rose-700 to-red-600 px-6 py-6 text-white shadow-[0_18px_40px_rgba(190,24,93,0.18)]">
      <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.26em] text-rose-100">
            Appeal Closed
          </div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight">
            This appeal has been finalized
          </div>
          <div className="mt-2 text-sm leading-6 text-white/95">
            เคสนี้ได้พิจารณาอุทธรณ์เสร็จสิ้นแล้ว และไม่สามารถยื่นอุทธรณ์เพิ่มเติมได้อีก
          </div>
        </div>

        <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-4 backdrop-blur-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
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
  const songkranTheme = isSongkranThemeActive();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-[22px] border p-4 text-left transition ${
        isSelected
          ? songkranTheme
            ? "border-cyan-300 bg-gradient-to-br from-cyan-100 to-fuchsia-100 shadow-[0_10px_22px_rgba(34,211,238,0.16)]"
            : "border-violet-400 bg-gradient-to-br from-violet-100 to-fuchsia-100 shadow-[0_10px_22px_rgba(109,40,217,0.14)]"
          : "border-violet-100 bg-white hover:border-violet-300 hover:bg-violet-50/70"
      }`}
    >
      {songkranTheme ? (
        <span className="pointer-events-none absolute right-2 top-2 h-3 w-3 rounded-full bg-cyan-300/70" />
      ) : null}

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

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-2 font-semibold">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
            Original: {item.previousScore.toFixed(2)}
          </span>
          <span className="text-slate-400">→</span>
          <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-700">
            Final: {item.finalScore.toFixed(2)}
          </span>
        </div>
        <span className="text-slate-500">{item.appealedTopics.length} appealed topic(s)</span>
      </div>
    </button>
  );
}

function AppealedTopicsCaseDetailTable({
  topics,
}: {
  topics: Topic[];
}) {
  return (
    <div className="rounded-[28px] border border-violet-200/80 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(109,40,217,0.08)]">
      <div className="space-y-8">
        {topics.length ? (
          topics.map((topic, index) => {
            const originalScore = Number(topic.originalScore ?? topic.score);
            const revisedScore = Number(topic.score);
            const diff = revisedScore - originalScore;
            const statusTone = topicScoreStatusTone(originalScore, revisedScore);
            const pct = topic.max > 0 ? (revisedScore / topic.max) * 100 : 0;

            let performanceLabel = "Need Improvement";
            let performanceClass = "text-rose-700";
            if (pct >= 90) {
              performanceLabel = "Excellent";
              performanceClass = "text-emerald-700";
            } else if (pct >= 80) {
              performanceLabel = "Good";
              performanceClass = "text-sky-700";
            } else if (pct >= 60) {
              performanceLabel = "Fair";
              performanceClass = "text-amber-700";
            }

            return (
              <div
                key={`${topic.code}-${index}`}
                className="border-b border-violet-100 pb-8 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-[20px] font-bold tracking-tight text-slate-900">
                      {topic.code} {topic.label}
                    </div>
                    <div className="mt-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                      Appeal topic review
                    </div>
                  </div>

                  <div className="shrink-0 text-left lg:min-w-[260px] lg:text-right">
                    <div className={`text-sm font-bold ${performanceClass}`}>
                      {performanceLabel}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {originalScore}/{topic.max} (
                      {((originalScore / Math.max(topic.max, 1)) * 100).toFixed(1)}%)
                      <span className="mx-2 text-slate-400">→</span>
                      {revisedScore}/{topic.max} ({pct.toFixed(1)}%)
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-x-8 gap-y-3 text-sm lg:grid-cols-[190px_minmax(0,1fr)]">
                  <div className="font-semibold text-slate-500">Score</div>
                  <div className="text-slate-900">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-700">
                        Original {originalScore}/{topic.max}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 font-semibold text-violet-700">
                        Revised {revisedScore}/{topic.max}
                      </span>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone.className}`}
                      >
                        {diff === 0
                          ? "No score change"
                          : `${diff > 0 ? "+" : ""}${diff} · ${statusTone.label}`}
                      </span>
                    </span>
                  </div>

                  <div className="font-semibold text-slate-500">Max Score</div>
                  <div className="text-slate-900">{topic.max}</div>

                  <div className="font-semibold text-slate-500">Status</div>
                  <div className={`font-semibold ${performanceClass}`}>{performanceLabel}</div>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="rounded-[22px] border border-amber-200 bg-amber-50/80 px-4 py-4 shadow-sm">
                    <div className="border-b border-amber-200/80 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                      Appeal Reason
                    </div>
                    <div className="mt-3 whitespace-pre-line leading-7 text-amber-950">
                      {sanitizeDisplayText(topic.appealReason, "-")}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
                      <div className="border-b border-slate-200 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Original Comment
                      </div>
                      <div className="mt-3 whitespace-pre-line leading-7 text-slate-800">
                        {sanitizeDisplayText(
                          topic.originalComment,
                          "ยังไม่มี Evaluation Comment"
                        )}
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-violet-200 bg-violet-50/70 px-4 py-4 shadow-sm">
                      <div className="border-b border-violet-200 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                        Revised Comment
                      </div>
                      <div className="mt-3 whitespace-pre-line leading-7 text-slate-900">
                        {sanitizeDisplayText(topic.comment, "ยังไม่มี Revised Comment")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-10 text-center text-sm text-slate-500">
            ไม่พบหัวข้อที่มีการยื่นอุทธรณ์
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppealMockup({
  currentUser,
  externalSelectedAgent,
  externalSelectedCaseId,
  onSelectedAgentChange,
}: {
  currentUser: any;
  externalSelectedAgent?: string;
  externalSelectedCaseId?: string;
  onSelectedAgentChange?: (agentName: string) => void;
}) {
  const [allCases, setAllCases] = useState<AppealCaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedCaseKey, setSelectedCaseKey] = useState("");
  const [searchCaseId, setSearchCaseId] = useState("");
  const [selectedMonthKey, setSelectedMonthKey] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState(externalSelectedAgent || "");

  const songkranTheme = useMemo(() => isSongkranThemeActive(), []);

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
    if (!externalSelectedCaseId) return;
    setSelectedMonthKey("all");
    setSearchCaseId(externalSelectedCaseId);
  }, [externalSelectedCaseId]);

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
        if (!appealResponse.ok)
          throw new Error("ไม่พบไฟล์ Appleal ROWDATA.xlsx ในโฟลเดอร์ public");

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
        rawDataRows.forEach((rawRow) => {
          const rawCaseId = normalizeCaseId(rawHelper.getValue(rawRow, "Case ID"));
          if (rawCaseId) rawCaseMap.set(rawCaseId, rawRow);
        });

        const appealBuffer = await appealResponse.arrayBuffer();
        const appealWorkbook = XLSX.read(appealBuffer, { type: "array", cellDates: true });
        const appealSheet =
          appealWorkbook.Sheets["Appeal_Data"] ||
          appealWorkbook.Sheets[appealWorkbook.SheetNames[0]];
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

            const normalizedCaseId = normalizeCaseId(caseId);
            const rawRow = rawCaseMap.get(normalizedCaseId);

            const rawAgent = rawRow
              ? String(rawHelper.getValue(rawRow, "Agent Name") ?? "").trim()
              : String(appealHelper.getValue(row, "Agent Name") ?? "").trim();

            const agent = toTitleCaseName(rawAgent);

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

            const auditRaw = rawRow
              ? rawHelper.getValue(rawRow, "Audit Date")
              : appealHelper.getValue(row, "Audit Date");

            const auditDateObj = parseExcelDate(auditRaw);
            const monthKey = getMonthKey(auditDateObj);
            const auditDate = formatDateOnly(auditRaw);

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

            const rawOverallScore =
              rawHelper.getLastValue(rawRow || [], "Final Score") ??
              rawHelper.getValue(rawRow || [], "Final Score") ??
              null;

            const appealOverallScore =
              appealHelper.getLastValue(row, "Final Score") ??
              appealHelper.getValue(row, "Final Score") ??
              null;

            const previousScore = Number(
              rawOverallScore !== null &&
                rawOverallScore !== undefined &&
                String(rawOverallScore).trim() !== ""
                ? rawOverallScore
                : 0
            );

            const finalScore = Number(
              appealOverallScore !== null &&
                appealOverallScore !== undefined &&
                String(appealOverallScore).trim() !== ""
                ? appealOverallScore
                : previousScore
            );

            const appealSubmitRaw =
              getFirstNonEmptyValue(appealHelper, row, [
                "Appeal Submit Date & Time",
                "Appeal Submit",
                "Appeal Submit Date",
                "Submit Date & Time",
                "Submit Date",
                "Appeal Created Date & Time",
                "Appeal Created Date",
                "Created Date & Time",
                "Created Date",
                "Created",
                "File Created Date",
              ]) ?? null;

            const appealResultRaw =
              getFirstNonEmptyValue(appealHelper, row, [
                "Appeal Result Date & Time",
                "Appeal Result",
                "Appeal Result Date",
                "Result Date & Time",
                "Result Date",
                "Appeal Closed Date & Time",
                "Appeal Closed Date",
                "Created Date & Time",
                "Created Date",
                "Created",
                "File Created Date",
              ]) ?? null;

            const appealChannelRaw =
              getFirstNonEmptyValue(appealHelper, row, ["Appeal Channel", "Channel"]) ?? "-";

            const appealVersionRaw = getFirstNonEmptyValue(appealHelper, row, [
              "Appeal Version",
              "Version",
            ]);

            const appealReviewSummaryRaw = getFirstNonEmptyValue(appealHelper, row, [
              "Appeal Review Summary",
              "Review Summary",
              "Appeal Summary",
              "Summary",
            ]);

            const topicMaster = getTopicMasterByMonth(monthKey);

            const topics: Topic[] = topicMaster.map((master) => {
              const originalScore =
                Number(rawHelper.getValue(rawRow || [], `${master.code} Score`) ?? 0) || 0;

              const originalComment = String(
                rawHelper.getValue(rawRow || [], `${master.code} Comment`) ??
                  rawHelper.getValue(rawRow || [], `${master.code} Evaluation Comment`) ??
                  ""
              ).trim();

              const revisedScoreCandidate =
                appealHelper.getValue(row, `${master.code} Revised Score`) ??
                appealHelper.getValue(row, `${master.code} Final Score`) ??
                appealHelper.getValue(row, `${master.code} Score`);

              const revisedCommentCandidate =
                appealHelper.getValue(row, `${master.code} Revised Comment`) ??
                appealHelper.getValue(row, `${master.code} Comment`);

              const appealReason = String(
                appealHelper.getValue(row, `${master.code} Appeal Reason`) ?? ""
              ).trim();

              const hasRevisedScore =
                revisedScoreCandidate !== null &&
                revisedScoreCandidate !== undefined &&
                String(revisedScoreCandidate).trim() !== "" &&
                !Number.isNaN(Number(revisedScoreCandidate));

              const hasRevisedComment =
                revisedCommentCandidate !== null &&
                revisedCommentCandidate !== undefined &&
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
              auditDateObj,
              monthKey,
              weekLabel,
              inquiry,
              previousScore,
              finalScore,
              reviewStatus: changedTopics.length ? "Revised" : "Original",
              grade: scoreToGrade(finalScore, monthKey),
              appealVersion: String(appealVersionRaw ?? "-").trim() || "-",
              appealSubmitDateTime: formatDateTimeOrRaw(appealSubmitRaw),
              appealResultDateTime: formatDateTimeOrRaw(appealResultRaw),
              appealChannel: sanitizeDisplayText(appealChannelRaw, "-"),
              appealReviewSummary: sanitizeDisplayText(appealReviewSummaryRaw, "-"),
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

  const latestMonthKey = useMemo(() => {
    return (
      [...new Set(allCases.map((item) => item.monthKey).filter((item) => item !== "unknown"))]
        .sort((a, b) => b.localeCompare(a))[0] || "all"
    );
  }, [allCases]);

  const monthOptions = useMemo(() => {
    return [...new Set(allCases.map((item) => item.monthKey).filter((item) => item !== "unknown"))]
      .sort((a, b) => b.localeCompare(a));
  }, [allCases]);

  useEffect(() => {
    if (!monthOptions.length) {
      if (selectedMonthKey !== "all") setSelectedMonthKey("all");
      return;
    }

    if (selectedMonthKey !== "all" && !monthOptions.includes(selectedMonthKey)) {
      setSelectedMonthKey("all");
    }
  }, [monthOptions, selectedMonthKey]);

  const visibleAgentList = useMemo(() => {
    const effectiveMonthForVisibility =
      currentUser?.role === "Agent"
        ? "all"
        : selectedMonthKey === "all"
          ? latestMonthKey
          : selectedMonthKey;

    const mergedAgents = getUniqueNormalizedAgents([
      ...AGENT_MASTER,
      ...allCases.map((item) => item.agent).filter(Boolean),
    ]).filter((agent) => !shouldHideAgentByMonth(agent, effectiveMonthForVisibility));

    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return mergedAgents.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }

    return mergedAgents;
  }, [allCases, currentUser, latestMonthKey, selectedMonthKey]);

  useEffect(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      const agentName = toTitleCaseName(currentUser.agentName);
      if (!isSameAgent(selectedAgent || "", agentName)) {
        setSelectedAgent(agentName);
      }
      onSelectedAgentChange?.(agentName);
      return;
    }

    if (selectedAgent && !visibleAgentList.some((agent) => isSameAgent(agent, selectedAgent))) {
      setSelectedAgent("");
      onSelectedAgentChange?.("");
    }
  }, [currentUser, selectedAgent, visibleAgentList, onSelectedAgentChange]);

  const effectiveSelectedAgent =
    currentUser?.role === "Agent" && currentUser.agentName
      ? toTitleCaseName(String(currentUser.agentName).trim())
      : toTitleCaseName(String(selectedAgent || "").trim());

  const baseVisibleCases = useMemo(() => {
    let cases = allCases;

    if (selectedMonthKey && selectedMonthKey !== "all") {
      cases = cases.filter((item) => item.monthKey === selectedMonthKey);
    }

    if (currentUser?.role === "Agent" && currentUser?.agentName) {
      return cases.filter((item) => isSameAgent(item.agent, currentUser.agentName));
    }

    if (!effectiveSelectedAgent) return cases;
    return cases.filter((item) => isSameAgent(item.agent, effectiveSelectedAgent));
  }, [allCases, currentUser, effectiveSelectedAgent, selectedMonthKey]);

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

    if (selectedCaseKey && !filteredCases.some((item) => item.key === selectedCaseKey)) {
      setSelectedCaseKey("");
    }
  }, [filteredCases, selectedCaseKey]);

  useEffect(() => {
    if (!externalSelectedCaseId || !filteredCases.length) return;
    const targetCaseId = externalSelectedCaseId.trim().toLowerCase();
    const matchedCase = filteredCases.find((item) => item.caseId.trim().toLowerCase() === targetCaseId);
    if (matchedCase && matchedCase.key !== selectedCaseKey) {
      setSelectedCaseKey(matchedCase.key);
    }
  }, [externalSelectedCaseId, filteredCases, selectedCaseKey]);

  const selectedCase = filteredCases.find((item) => item.key === selectedCaseKey) || null;

  const selectedCaseUsesNewPolicy = selectedCase ? isNewPolicyMonth(selectedCase.monthKey) : false;
  const selectedCaseOriginalGrade = selectedCase
    ? scoreToGrade(selectedCase.previousScore, selectedCase.monthKey)
    : null;
  const selectedCaseGradeShift =
    selectedCase && selectedCaseOriginalGrade
      ? gradeShiftTone(selectedCaseOriginalGrade, selectedCase.grade)
      : null;

  const currentMonthDisplayLabel = formatMonthKeyLabel(selectedMonthKey);

  const setPdfFont = (doc: jsPDF, style: "normal" | "bold" = "normal") => {
    try {
      doc.setFont("THSarabunNew", style);
      return true;
    } catch {
      doc.setFont("helvetica", style);
      return false;
    }
  };

  const handleGeneratePdf = async () => {
    if (!selectedCase) return;

    const loadLogoDataUrl = async () => {
      try {
        const response = await fetch("/robinhood-logo.png");
        if (!response.ok) return "";
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } catch {
        return "";
      }
    };

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    registerTHSarabunNew(doc);
    const usingThaiFont = setPdfFont(doc, "normal");
    const logoDataUrl = await loadLogoDataUrl();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 16;
    const right = pageWidth - 16;
    const contentWidth = right - left;
    let y = 16;

    const selectedCaseOriginalGradeForPdf = scoreToGrade(
      selectedCase.previousScore,
      selectedCase.monthKey
    );
    const scoreDelta = selectedCase.finalScore - selectedCase.previousScore;
    const scoreDeltaText = `${scoreDelta > 0 ? "+" : ""}${scoreDelta.toFixed(2)}`;
    const generatedAtDisplay = formatDateTime(new Date());
    const generatedByDisplay = currentUser?.displayName || currentUser?.username || "-";
    const generatedByRole = currentUser?.role ? ` (${currentUser.role})` : "";

    const PDF_COLORS = {
      black: [0, 0, 0] as [number, number, number],
      body: [20, 20, 20] as [number, number, number],
      muted: [90, 90, 90] as [number, number, number],
      divider: [170, 170, 170] as [number, number, number],
      sectionLine: [148, 163, 184] as [number, number, number],
      accent: [79, 70, 229] as [number, number, number],
      success: [22, 163, 74] as [number, number, number],
      danger: [220, 38, 38] as [number, number, number],
      neutral: [55, 65, 81] as [number, number, number],
      appealReason: [120, 53, 15] as [number, number, number],
      originalComment: [17, 24, 39] as [number, number, number],
      revisedComment: [17, 24, 39] as [number, number, number],
    };

    const setColor = (color: [number, number, number]) => {
      doc.setTextColor(color[0], color[1], color[2]);
    };

    const ensureSpace = (needed = 10) => {
      if (y + needed > pageHeight - 16) {
        doc.addPage();
        y = 16;
      }
    };

    const drawDivider = (
      spaceBefore = 1.5,
      spaceAfter = 4,
      color: [number, number, number] = PDF_COLORS.divider,
      width = 0.3
    ) => {
      ensureSpace(spaceBefore + spaceAfter + 2);
      y += spaceBefore;
      doc.setDrawColor(color[0], color[1], color[2]);
      doc.setLineWidth(width);
      doc.line(left, y, right, y);
      y += spaceAfter;
    };

    const addMainTitle = () => {
      ensureSpace(30);
      let textLeft = left;
      const logoSize = 16;

      if (logoDataUrl) {
        try {
          doc.addImage(logoDataUrl, "PNG", left, y - 1, logoSize, logoSize);
          textLeft = left + logoSize + 5;
        } catch {
          textLeft = left;
        }
      }

      setPdfFont(doc, "bold");
      doc.setFontSize(18);
      setColor(PDF_COLORS.black);
      doc.text("QA Appeal Result Report", textLeft, y + 1);

      setPdfFont(doc, "normal");
      doc.setFontSize(10.5);
      setColor(PDF_COLORS.muted);
      doc.text("Robinhood QA Appeal Review Report", textLeft, y + 6);

      y += 14;
      setPdfFont(doc, "normal");
      doc.setFontSize(11);
      setColor(PDF_COLORS.body);
      doc.text(`Case ID: ${selectedCase.caseId || "-"}`, textLeft, y);

      y += 5;
      doc.text(`Case Agent: ${selectedCase.agent || "-"}`, textLeft, y);

      y += 5;
      doc.text(`Generated By: ${generatedByDisplay}${generatedByRole}`, textLeft, y);
      
      y += 5;
      doc.text(`Generated At: ${generatedAtDisplay || "-"}`, textLeft, y);

      y += 3;
      drawDivider(1.5, 5, PDF_COLORS.sectionLine, 0.45);
    };

    const addSectionTitle = (text: string) => {
      ensureSpace(10);
      setPdfFont(doc, "bold");
      doc.setFontSize(14);
      setColor(PDF_COLORS.accent);
      doc.text(text, left, y);
      y += 2.5;
      drawDivider(1, 4, PDF_COLORS.sectionLine, 0.35);
    };

    const addParagraph = (
      text: string,
      size = 11,
      color: [number, number, number] = PDF_COLORS.body,
      gapAfter = 5
    ) => {
      const lines = doc.splitTextToSize(sanitizeDisplayText(text, "-"), contentWidth);
      ensureSpace(lines.length * (size * 0.45) + gapAfter + 2);
      setPdfFont(doc, "normal");
      doc.setFontSize(size);
      setColor(color);
      doc.text(lines, left, y);
      y += lines.length * (size * 0.45) + gapAfter;
    };

    const addKeyValue = (label: string, value: string, labelWidth = 40) => {
      const safeValue = sanitizeDisplayText(value, "-");
      const valueLines = doc.splitTextToSize(safeValue, contentWidth - labelWidth);
      ensureSpace(Math.max(6, valueLines.length * 4.8) + 1);

      setPdfFont(doc, "bold");
      doc.setFontSize(11);
      setColor(PDF_COLORS.black);
      doc.text(label, left, y);

      setPdfFont(doc, "normal");
      setColor(PDF_COLORS.body);
      doc.text(valueLines, left + labelWidth, y);
      y += Math.max(6, valueLines.length * 4.8);
    };

    const estimateTopicBlockHeight = (topic: Topic) => {
      const originalScore = Number(topic.originalScore ?? 0);
      const revisedScore = Number(topic.score ?? 0);
      const diff = revisedScore - originalScore;
      const statusLabel = diff > 0 ? "Improved" : diff < 0 ? "Reduced" : "No Change";
      const topicLeft = left + 4;
      const topicRight = right - 4;
      const topicWidth = topicRight - topicLeft;

      const titleLines = doc.splitTextToSize(`${topic.code} ${topic.label}`, topicWidth);
      const topicMetaLines = doc.splitTextToSize("Appealed Topic Detail", topicWidth);
      const scoreLines = doc.splitTextToSize(
        `Original Score: ${originalScore}   Final Score: ${revisedScore}   Change: ${
          diff > 0 ? "+" : ""
        }${diff} (${statusLabel})`,
        topicWidth
      );
      const appealReasonLines = doc.splitTextToSize(topic.appealReason || "-", topicWidth);
      const originalCommentLines = doc.splitTextToSize(
        topic.originalComment || "-",
        topicWidth
      );
      const revisedCommentLines = doc.splitTextToSize(topic.comment || "-", topicWidth);

      return (
        topicMetaLines.length * 4 +
        titleLines.length * 5 +
        scoreLines.length * 4.8 +
        appealReasonLines.length * 4.8 +
        originalCommentLines.length * 4.8 +
        revisedCommentLines.length * 4.8 +
        34
      );
    };

    const addTopicBlock = (topic: Topic) => {
      const originalScore = Number(topic.originalScore ?? 0);
      const revisedScore = Number(topic.score ?? 0);
      const diff = revisedScore - originalScore;
      const statusLabel = diff > 0 ? "Improved" : diff < 0 ? "Reduced" : "No Change";
      const scoreColor =
        diff > 0 ? PDF_COLORS.success : diff < 0 ? PDF_COLORS.danger : PDF_COLORS.neutral;
      const topicLeft = left + 4;
      const topicRight = right - 4;
      const topicWidth = topicRight - topicLeft;

      const titleLines = doc.splitTextToSize(`${topic.code} ${topic.label}`, topicWidth);
      const topicMetaLines = doc.splitTextToSize("Appealed Topic Detail", topicWidth);
      const scoreLines = doc.splitTextToSize(
        `Original Score: ${originalScore}   Final Score: ${revisedScore}   Change: ${
          diff > 0 ? "+" : ""
        }${diff} (${statusLabel})`,
        topicWidth
      );
      const appealReasonLines = doc.splitTextToSize(topic.appealReason || "-", topicWidth);
      const originalCommentLines = doc.splitTextToSize(
        topic.originalComment || "-",
        topicWidth
      );
      const revisedCommentLines = doc.splitTextToSize(topic.comment || "-", topicWidth);

      const estimatedHeight = estimateTopicBlockHeight(topic);

      ensureSpace(estimatedHeight);

      doc.setDrawColor(PDF_COLORS.sectionLine[0], PDF_COLORS.sectionLine[1], PDF_COLORS.sectionLine[2]);
      doc.setLineWidth(0.3);
      doc.line(topicLeft, y, topicRight, y);
      y += 4;

      setPdfFont(doc, "bold");
      doc.setFontSize(9.5);
      setColor(PDF_COLORS.muted);
      doc.text(topicMetaLines, topicLeft, y);
      y += topicMetaLines.length * 4;

      setPdfFont(doc, "bold");
      doc.setFontSize(12);
      setColor(PDF_COLORS.black);
      doc.text(titleLines, topicLeft, y);
      y += titleLines.length * 5;

      setPdfFont(doc, "bold");
      doc.setFontSize(10.5);
      setColor(scoreColor);
      doc.text(scoreLines, topicLeft, y);
      y += scoreLines.length * 4.8 + 2;

      doc.setDrawColor(PDF_COLORS.sectionLine[0], PDF_COLORS.sectionLine[1], PDF_COLORS.sectionLine[2]);
      doc.setLineWidth(0.25);
      doc.line(topicLeft, y, topicRight, y);
      y += 4;

      setPdfFont(doc, "bold");
      doc.setFontSize(11);
      setColor(PDF_COLORS.black);
      doc.text("Appeal Reason", topicLeft, y);
      y += 5;
      setPdfFont(doc, "normal");
      doc.setFontSize(11);
      setColor(PDF_COLORS.appealReason);
      doc.text(appealReasonLines, topicLeft, y);
      y += appealReasonLines.length * 4.8 + 2;

      doc.line(topicLeft, y, topicRight, y);
      y += 4;

      setPdfFont(doc, "bold");
      doc.setFontSize(11);
      setColor(PDF_COLORS.black);
      doc.text("Original Comment", topicLeft, y);
      y += 5;
      setPdfFont(doc, "normal");
      doc.setFontSize(11);
      setColor(PDF_COLORS.originalComment);
      doc.text(originalCommentLines, topicLeft, y);
      y += originalCommentLines.length * 4.8 + 2;

      doc.line(topicLeft, y, topicRight, y);
      y += 4;

      setPdfFont(doc, "bold");
      doc.setFontSize(11);
      setColor(PDF_COLORS.black);
      doc.text("Revised Comment", topicLeft, y);
      y += 5;
      setPdfFont(doc, "normal");
      doc.setFontSize(11);
      setColor(PDF_COLORS.revisedComment);
      doc.text(revisedCommentLines, topicLeft, y);
      y += revisedCommentLines.length * 4.8 + 1.5;

      drawDivider(1, 5);
    };

    addMainTitle();

    if (!usingThaiFont) {
      addParagraph(
        "Font Notice: TH Sarabun font is not embedded yet. PDF is using fallback font.",
        10,
        PDF_COLORS.danger,
        6
      );
    }

    addSectionTitle("Case Overview");
    addKeyValue("Case ID", selectedCase.caseId || "-");
    addKeyValue("Agent", selectedCase.agent || "-");
    addKeyValue("Audit Date", selectedCase.auditDate || "-");
    addKeyValue("Week Label", selectedCase.weekLabel || "-");
    addKeyValue("Month", selectedCase.monthKey || "-");
    addKeyValue("Original Score", selectedCase.previousScore.toFixed(2));
    addKeyValue("Final Score", selectedCase.finalScore.toFixed(2));
    addKeyValue("Score Change", scoreDeltaText);
    addKeyValue("Original Grade", selectedCaseOriginalGradeForPdf);
    addKeyValue("Final Grade", selectedCase.grade);
    addKeyValue("Appealed Topics", `${selectedCase.appealedTopics.length} topic(s)`);

    addSectionTitle("Appeal Timeline");
    addKeyValue("Appeal Submit Date & Time", selectedCase.appealSubmitDateTime || "-", 58);
    addKeyValue("Appeal Result Date & Time", selectedCase.appealResultDateTime || "-", 58);
    addKeyValue("Appeal Channel", selectedCase.appealChannel || "-", 58);
    addKeyValue(
      "Grade Rule",
      selectedCaseUsesNewPolicy
        ? "Use score criteria from April 2026 onward"
        : "Use previous score criteria",
      58
    );
    addKeyValue("Final Decision", "Finalized and closed", 58);

    addSectionTitle("Customer Inquiry");
    addParagraph(selectedCase.inquiry || "-");

    addSectionTitle("Appeal Review Summary");
    addParagraph(selectedCase.appealReviewSummary || "-");

    const firstAppealedTopic = selectedCase.appealedTopics[0];
    const appealedTopicsHeaderHeight = 11;
    if (
      firstAppealedTopic &&
      y + appealedTopicsHeaderHeight + estimateTopicBlockHeight(firstAppealedTopic) > pageHeight - 16
    ) {
      doc.addPage();
      y = 16;
    }

    addSectionTitle("Appealed Topics");
    if (!selectedCase.appealedTopics.length) {
      addParagraph("ไม่พบหัวข้อที่มีการยื่นอุทธรณ์");
    } else {
      selectedCase.appealedTopics.forEach((topic) => {
        addTopicBlock(topic);
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
    <div className="relative space-y-6">
      {songkranTheme ? <SongkranBackdrop /> : null}

      <div className="relative overflow-hidden rounded-[34px] border border-white/15 bg-gradient-to-r from-sky-700 via-cyan-600 to-fuchsia-700 px-6 py-7 text-white shadow-[0_24px_60px_rgba(59,130,246,0.18)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.18),transparent_28%)]" />
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-white/80">
              QA APPEAL
            </div>
            <div className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Appeal Result Workspace
            </div>
            <div className="mt-3 max-w-2xl text-sm leading-7 text-white/90 sm:text-[15px]">
              รวมผลการพิจารณาอุทธรณ์เคส QA พร้อมมุมมองรายเดือน รายชื่อเคส และรายละเอียดผลประเมินในหน้าเดียว
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                {currentMonthDisplayLabel}
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" />
                {filteredCases.length} case(s)
              </div>
            </div>
          </div>

          <div className="min-w-[320px] max-w-[430px] rounded-[28px] border border-white/15 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                <img
                  src="/robinhood-logo.png"
                  alt="Robinhood QA Logo"
                  className="h-16 w-16 rounded-[18px] object-contain bg-white/90 p-2 shadow-sm"
                />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/70">
                  Robinhood QA
                </div>
                <div className="mt-1 text-2xl font-extrabold tracking-tight text-white">
                  Appeal Performance Center
                </div>
                <div className="mt-2 text-sm leading-6 text-white/80">
                  Monthly / All Months appeal result and case review workspace
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AppealClosedBanner />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[26px] border border-violet-200/80 bg-white/90 px-5 py-4 shadow-[0_10px_24px_rgba(76,29,149,0.06)] backdrop-blur-sm">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">
            Current View
          </div>
          <div className="mt-1 text-xl font-extrabold tracking-tight text-slate-900">
            {currentMonthDisplayLabel}
          </div>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-800">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
          {filteredCases.length} case(s)
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel className="h-fit">
          <PanelHeader
            title="Appeal Case List"
            subtitle="เลือกเลขเคสจากรายการด้านซ้ายเพื่อเปิดดูรายละเอียด"
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
                Month
              </label>
              <select
                value={selectedMonthKey}
                onChange={(e) => setSelectedMonthKey(e.target.value)}
                className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-0 transition focus:border-violet-400"
              >
                <option value="all">All Months</option>
                {monthOptions.map((monthKey) => (
                  <option key={monthKey} value={monthKey}>
                    {formatMonthKeyLabel(monthKey)}
                  </option>
                ))}
              </select>
            </div>

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

            <div className="rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-violet-900">
              <span className="font-semibold">{formatMonthKeyLabel(selectedMonthKey)}</span>
              <span className="text-slate-500"> · {filteredCases.length} case(s)</span>
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
                  กรุณาเลือกเลขเคสจากรายการด้านซ้ายก่อน ระบบจะยังไม่เปิดรายละเอียดเคสอัตโนมัติ
                </div>
              </PanelBody>
            </Panel>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <ScoreCard
                  title="Original Score"
                  value={selectedCase.previousScore.toFixed(2)}
                  tone="border-slate-300 bg-slate-100 text-slate-900"
                />
                <ScoreCard
                  title="Final Score"
                  value={selectedCase.finalScore.toFixed(2)}
                  tone="border-violet-300 bg-violet-100 text-violet-900"
                  sub={`${selectedCase.previousScore.toFixed(2)} → ${selectedCase.finalScore.toFixed(2)}`}
                />
                <ScoreCard
                  title="Grade"
                  value={selectedCase.grade}
                  tone={gradeTone(selectedCase.grade)}
                  sub={
                    selectedCaseGradeShift
                      ? `${selectedCaseGradeShift.label} • ${
                          selectedCaseUsesNewPolicy ? "New Criteria" : "Previous Criteria"
                        }`
                      : selectedCaseUsesNewPolicy
                        ? `${selectedCase.reviewStatus} • New Criteria`
                        : `${selectedCase.reviewStatus} • Previous Criteria`
                  }
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
                          Review Status
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-900">
                          {selectedCase.reviewStatus}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Month Key
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-900">
                          {selectedCase.monthKey || "-"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Grade Policy
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-900">
                          {selectedCaseUsesNewPolicy ? "New Criteria" : "Previous Criteria"}
                        </div>
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
                  <PanelHeader
                    title="Appeal Timeline"
                    subtitle="Submit and final result timestamps"
                  />
                  <PanelBody className="space-y-4">
                    <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                        Appeal Submit Date & Time
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-900">
                        {sanitizeDisplayText(selectedCase.appealSubmitDateTime)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                        Appeal Result Date & Time
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-900">
                        {sanitizeDisplayText(selectedCase.appealResultDateTime)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Appeal Channel
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-900">
                        {sanitizeDisplayText(selectedCase.appealChannel)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Grade Rule
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-900">
                        {selectedCaseUsesNewPolicy
                          ? "Use score criteria from April 2026 onward"
                          : "Use previous score criteria"}
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
                        This case has completed the appeal review process and cannot be appealed
                        again.
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
                      <div className="grid gap-4 lg:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Appealed Topics
                          </div>
                          <div className="mt-2 text-2xl font-extrabold text-slate-900">
                            {selectedCase.appealedTopics.length}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Score Flow
                          </div>
                          <div className="mt-2 text-lg font-extrabold text-slate-900">
                            {selectedCase.previousScore.toFixed(2)}
                            <span className="mx-2 text-slate-300">→</span>
                            <span className="text-violet-700">
                              {selectedCase.finalScore.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Grade Flow
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-sm font-extrabold text-slate-900">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 ${gradeTone(selectedCaseOriginalGrade || selectedCase.grade)}`}
                            >
                              {selectedCaseOriginalGrade || selectedCase.grade}
                            </span>
                            <span className="text-slate-300">→</span>
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 ${gradeTone(selectedCase.grade)}`}
                            >
                              {selectedCase.grade}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                            Grade Result
                          </div>
                          <div className="mt-2 text-sm font-bold text-violet-700">
                            {selectedCaseGradeShift
                              ? selectedCaseGradeShift.label
                              : `${selectedCase.grade}`}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl border border-violet-100 bg-white px-4 py-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                            Customer Inquiry
                          </div>
                          <div className="mt-2 whitespace-pre-line text-[13px] leading-6 text-slate-800">
                            {sanitizeDisplayText(selectedCase.inquiry)}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                            Appeal Review Summary
                          </div>
                          <div className="mt-2 whitespace-pre-line text-[13px] leading-6 text-slate-800">
                            {sanitizeDisplayText(selectedCase.appealReviewSummary)}
                          </div>
                        </div>
                      </div>

                      <AppealedTopicsCaseDetailTable topics={selectedCase.appealedTopics} />
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
