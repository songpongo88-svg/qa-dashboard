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

const SONGKRAN_THEME_END = new Date(2026, 3, 25, 23, 59, 59);
const NEW_POLICY_START_MONTH_KEY = "2026-04";

function isSongkranThemeActive() {
  const now = new Date();
  return now <= SONGKRAN_THEME_END && now.getFullYear() === 2026 && now.getMonth() === 3;
}

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
  const formatted = formatDateTime(value);
  return formatted && formatted.trim() !== "" ? formatted : String(value).trim() || "-";
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
      <div className="absolute left-5 bottom-4 hidden rounded-[24px] border border-white/20 bg-white/10 px-3 py-2 text-2xl backdrop-blur md:flex">🔫💦</div>
      <div className="absolute right-5 top-4 hidden rounded-[24px] border border-white/20 bg-white/10 px-3 py-2 text-2xl backdrop-blur md:flex">🪣🌸</div>
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
  const songkranTheme = isSongkranThemeActive();

  return (
    <div
      className={`relative overflow-hidden rounded-[30px] border px-6 py-6 text-white shadow-[0_18px_40px_rgba(190,24,93,0.18)] ${
        songkranTheme
          ? "border-cyan-200 bg-gradient-to-r from-sky-700 via-cyan-600 to-fuchsia-600"
          : "border-rose-300 bg-gradient-to-r from-rose-700 via-rose-700 to-red-600"
      }`}
    >
      {songkranTheme ? <SongkranBackdrop /> : null}

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

function AppealedTopicsTable({
  topics,
}: {
  topics: Topic[];
}) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-violet-200/90 bg-white shadow-[0_14px_34px_rgba(76,29,149,0.08)]">
      <div className="h-1 bg-gradient-to-r from-violet-700 via-fuchsia-500 to-cyan-400" />
      <div className="overflow-x-auto">
        <table className="min-w-[1240px] w-full text-sm">
          <thead>
            <tr className="bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 text-[11px] uppercase tracking-[0.16em] text-white">
              <th className="px-4 py-4 text-left">Topic</th>
              <th className="px-4 py-4 text-left">Description</th>
              <th className="px-4 py-4 text-center">Original</th>
              <th className="px-4 py-4 text-center">Final</th>
              <th className="px-4 py-4 text-center">Change</th>
              <th className="px-4 py-4 text-center">Status</th>
              <th className="px-4 py-4 text-left">Appeal Reason</th>
              <th className="px-4 py-4 text-left">Original Comment</th>
              <th className="px-4 py-4 text-left">Revised Comment</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => {
              const originalScore = Number(topic.originalScore ?? topic.score);
              const revisedScore = Number(topic.score);
              const diff = revisedScore - originalScore;
              const diffPrefix = diff > 0 ? "+" : "";
              const statusTone = topicScoreStatusTone(originalScore, revisedScore);
              const commentChanged = hasMeaningfulTextChange(topic.originalComment, topic.comment);

              return (
                <tr key={topic.code} className="align-top bg-white">
                  <td className="border-t border-violet-100 px-4 py-4">
                    <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                      {topic.code}
                    </span>
                  </td>
                  <td className="border-t border-violet-100 px-4 py-4 font-semibold text-slate-900">
                    {topic.label}
                  </td>
                  <td className="border-t border-violet-100 px-4 py-4 text-center">
                    <div className="inline-flex min-w-[72px] justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 font-extrabold text-slate-900">
                      {originalScore}
                    </div>
                  </td>
                  <td className="border-t border-violet-100 px-4 py-4 text-center">
                    <div className="inline-flex min-w-[72px] justify-center rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 font-extrabold text-violet-700">
                      {revisedScore}
                    </div>
                  </td>
                  <td className="border-t border-violet-100 px-4 py-4 text-center">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${statusTone.className}`}>
                      {diff === 0 ? "0" : `${diffPrefix}${diff}`}
                    </span>
                  </td>
                  <td className="border-t border-violet-100 px-4 py-4 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone.className}`}>
                        {statusTone.label}
                      </span>
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold ${
                          commentChanged
                            ? "border-violet-200 bg-violet-50 text-violet-700"
                            : "border-slate-200 bg-slate-50 text-slate-600"
                        }`}
                      >
                        {commentChanged ? "Comment Updated" : "Comment Maintained"}
                      </span>
                    </div>
                  </td>
                  <td className="border-t border-violet-100 px-4 py-4 align-top">
                    <div className="max-w-[320px] whitespace-pre-line text-[13px] font-semibold leading-6 text-amber-900">
                      {topic.appealReason || "-"}
                    </div>
                  </td>
                  <td className="border-t border-violet-100 px-4 py-4 align-top">
                    <div className="max-w-[380px] whitespace-pre-line text-[13px] font-medium leading-6 text-sky-950">
                      {topic.originalComment || "-"}
                    </div>
                  </td>
                  <td className="border-t border-violet-100 px-4 py-4 align-top">
                    <div className="max-w-[380px] whitespace-pre-line text-[13px] font-semibold leading-6 text-violet-900">
                      {topic.comment || "-"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
        rawDataRows.forEach((rawRow) => {
          const rawCaseId = normalizeCaseId(rawHelper.getValue(rawRow, "Case ID"));
          if (rawCaseId) rawCaseMap.set(rawCaseId, rawRow);
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
              appealChannel: String(appealChannelRaw ?? "-").trim() || "-",
              appealReviewSummary: String(appealReviewSummaryRaw ?? "").trim() || "-",
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

  const visibleAgentList = useMemo(() => {
    const effectiveMonthForVisibility =
      currentUser?.role === "Agent" ? "all" : latestMonthKey;

    const mergedAgents = getUniqueNormalizedAgents([
      ...AGENT_MASTER,
      ...allCases.map((item) => item.agent).filter(Boolean),
    ]).filter((agent) => !shouldHideAgentByMonth(agent, effectiveMonthForVisibility));

    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return mergedAgents.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }

    return mergedAgents;
  }, [allCases, currentUser, latestMonthKey]);

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

  const selectedCaseUsesNewPolicy = selectedCase ? isNewPolicyMonth(selectedCase.monthKey) : false;
  const selectedCaseOriginalGrade = selectedCase
    ? scoreToGrade(selectedCase.previousScore, selectedCase.monthKey)
    : null;
  const selectedCaseGradeShift =
    selectedCase && selectedCaseOriginalGrade
      ? gradeShiftTone(selectedCaseOriginalGrade, selectedCase.grade)
      : null;

  const setPdfFont = (doc: jsPDF, style: "normal" | "bold" = "normal") => {
    try {
      doc.setFont("THSarabunNew", style);
      return true;
    } catch {
      doc.setFont("helvetica", style);
      return false;
    }
  };

  const handleGeneratePdf = () => {
    if (!selectedCase) return;

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    registerTHSarabunNew(doc);
    const usingThaiFont = setPdfFont(doc, "normal");
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const left = 14;
    const right = pageWidth - 14;
    const contentWidth = right - left;
    const gap = 4;
    const cardRadius = 3;
    let y = 14;

    const selectedCaseOriginalGradeForPdf = scoreToGrade(
      selectedCase.previousScore,
      selectedCase.monthKey
    );
    const scoreDelta = selectedCase.finalScore - selectedCase.previousScore;
    const scoreDeltaText = `${scoreDelta > 0 ? "+" : ""}${scoreDelta.toFixed(2)}`;

    const PDF_COLORS = {
      titleFill: [76, 29, 149] as [number, number, number],
      titleAccent: [168, 85, 247] as [number, number, number],
      section: [76, 29, 149] as [number, number, number],
      label: [91, 33, 182] as [number, number, number],
      body: [31, 41, 55] as [number, number, number],
      bodyStrong: [15, 23, 42] as [number, number, number],
      muted: [100, 116, 139] as [number, number, number],
      divider: [221, 214, 254] as [number, number, number],
      cardFill: [248, 250, 252] as [number, number, number],
      cardBorder: [226, 232, 240] as [number, number, number],
      violetSoft: [245, 243, 255] as [number, number, number],
      violetBorder: [196, 181, 253] as [number, number, number],
      roseSoft: [255, 241, 242] as [number, number, number],
      roseBorder: [254, 205, 211] as [number, number, number],
      amberSoft: [255, 251, 235] as [number, number, number],
      amberBorder: [253, 230, 138] as [number, number, number],
      skySoft: [240, 249, 255] as [number, number, number],
      skyBorder: [186, 230, 253] as [number, number, number],
      appealReason: [146, 64, 14] as [number, number, number],
      originalComment: [12, 74, 110] as [number, number, number],
      revisedComment: [88, 28, 135] as [number, number, number],
      success: [22, 163, 74] as [number, number, number],
      danger: [225, 29, 72] as [number, number, number],
      neutral: [71, 85, 105] as [number, number, number],
      white: [255, 255, 255] as [number, number, number],
    };

    const ensureSpace = (needed = 12) => {
      if (y + needed > pageHeight - 14) {
        doc.addPage();
        y = 14;
      }
    };

    const setColor = (color: [number, number, number]) => {
      doc.setTextColor(color[0], color[1], color[2]);
    };

    const drawRoundedBox = (
      x: number,
      top: number,
      width: number,
      height: number,
      fill: [number, number, number],
      border: [number, number, number],
      style: "FD" | "F" = "FD"
    ) => {
      doc.setFillColor(fill[0], fill[1], fill[2]);
      doc.setDrawColor(border[0], border[1], border[2]);
      doc.setLineWidth(0.35);
      doc.roundedRect(x, top, width, height, cardRadius, cardRadius, style);
    };

    const drawHeader = () => {
      drawRoundedBox(left, y, contentWidth, 24, PDF_COLORS.titleFill, PDF_COLORS.titleFill, "F");
      doc.setFillColor(PDF_COLORS.titleAccent[0], PDF_COLORS.titleAccent[1], PDF_COLORS.titleAccent[2]);
      doc.circle(right - 10, y + 7, 3, "F");
      doc.circle(right - 19, y + 15, 2.3, "F");

      setPdfFont(doc, "bold");
      doc.setFontSize(20);
      setColor(PDF_COLORS.white);
      doc.text("Robinhood QA Appeal Result", left + 6, y + 9);

      setPdfFont(doc, "normal");
      doc.setFontSize(10.5);
      doc.text(`Case ID: ${selectedCase.caseId}`, left + 6, y + 16);
      doc.text(`Agent: ${selectedCase.agent || "-"}`, left + 6, y + 21);

      y += 30;
    };

    const addSectionTitle = (text: string, subtitle?: string) => {
      ensureSpace(subtitle ? 16 : 12);
      setPdfFont(doc, "bold");
      doc.setFontSize(13);
      setColor(PDF_COLORS.section);
      doc.text(text, left, y);
      doc.setDrawColor(PDF_COLORS.divider[0], PDF_COLORS.divider[1], PDF_COLORS.divider[2]);
      doc.setLineWidth(0.5);
      doc.line(left, y + 1.6, right, y + 1.6);
      y += 6;
      if (subtitle) {
        setPdfFont(doc, "normal");
        doc.setFontSize(9.5);
        setColor(PDF_COLORS.muted);
        const lines = doc.splitTextToSize(subtitle, contentWidth);
        doc.text(lines, left, y + 1.5);
        y += lines.length * 4 + 2;
      }
      y += 2;
    };

    const addParagraphInBox = (
      title: string,
      value: string,
      fill: [number, number, number],
      border: [number, number, number],
      textColor: [number, number, number] = PDF_COLORS.body
    ) => {
      const titleLines = doc.splitTextToSize(title, contentWidth - 10);
      const valueLines = doc.splitTextToSize(value || "-", contentWidth - 10);
      const height = 8 + titleLines.length * 4 + valueLines.length * 5 + 4;
      ensureSpace(height + 2);
      drawRoundedBox(left, y, contentWidth, height, fill, border);
      setPdfFont(doc, "bold");
      doc.setFontSize(10);
      setColor(PDF_COLORS.label);
      doc.text(titleLines, left + 5, y + 6);
      setPdfFont(doc, "normal");
      doc.setFontSize(10.5);
      setColor(textColor);
      doc.text(valueLines, left + 5, y + 11 + titleLines.length * 4);
      y += height + 4;
    };

    const addInfoGrid = (items: Array<{ label: string; value: string }>) => {
      const colGap = 4;
      const colWidth = (contentWidth - colGap) / 2;
      for (let i = 0; i < items.length; i += 2) {
        const rowItems = items.slice(i, i + 2);
        const heights = rowItems.map((item) => {
          const labelLines = doc.splitTextToSize(item.label, colWidth - 10);
          const valueLines = doc.splitTextToSize(item.value || "-", colWidth - 10);
          return 8 + labelLines.length * 4 + valueLines.length * 5 + 4;
        });
        const rowHeight = Math.max(...heights, 18);
        ensureSpace(rowHeight + 2);

        rowItems.forEach((item, colIndex) => {
          const x = left + colIndex * (colWidth + colGap);
          const labelLines = doc.splitTextToSize(item.label, colWidth - 10);
          const valueLines = doc.splitTextToSize(item.value || "-", colWidth - 10);

          drawRoundedBox(x, y, colWidth, rowHeight, PDF_COLORS.cardFill, PDF_COLORS.cardBorder);
          setPdfFont(doc, "bold");
          doc.setFontSize(9.5);
          setColor(PDF_COLORS.label);
          doc.text(labelLines, x + 5, y + 6);

          setPdfFont(doc, "normal");
          doc.setFontSize(10.5);
          setColor(PDF_COLORS.bodyStrong);
          doc.text(valueLines, x + 5, y + 11 + labelLines.length * 4);
        });

        y += rowHeight + 4;
      }
    };

    const drawMetricCard = (
      x: number,
      top: number,
      width: number,
      title: string,
      value: string,
      sub: string,
      fill: [number, number, number],
      border: [number, number, number],
      accent: [number, number, number]
    ) => {
      drawRoundedBox(x, top, width, 23, fill, border);
      setPdfFont(doc, "bold");
      doc.setFontSize(8.5);
      setColor(PDF_COLORS.muted);
      doc.text(title.toUpperCase(), x + 4, top + 6);
      setPdfFont(doc, "bold");
      doc.setFontSize(16);
      setColor(accent);
      doc.text(value, x + 4, top + 14);
      setPdfFont(doc, "normal");
      doc.setFontSize(9);
      setColor(PDF_COLORS.body);
      doc.text(doc.splitTextToSize(sub, width - 8), x + 4, top + 19);
    };

    const addMetricsRow = () => {
      const cardWidth = (contentWidth - gap * 3) / 4;
      ensureSpace(27);
      drawMetricCard(
        left,
        y,
        cardWidth,
        "Original Score",
        selectedCase.previousScore.toFixed(2),
        "ก่อนอุทธรณ์",
        PDF_COLORS.cardFill,
        PDF_COLORS.cardBorder,
        PDF_COLORS.bodyStrong
      );
      drawMetricCard(
        left + cardWidth + gap,
        y,
        cardWidth,
        "Final Score",
        selectedCase.finalScore.toFixed(2),
        `ผลต่าง ${scoreDeltaText}`,
        PDF_COLORS.violetSoft,
        PDF_COLORS.violetBorder,
        PDF_COLORS.section
      );
      drawMetricCard(
        left + (cardWidth + gap) * 2,
        y,
        cardWidth,
        "Original Grade",
        selectedCaseOriginalGradeForPdf,
        "เกรดเดิม",
        PDF_COLORS.cardFill,
        PDF_COLORS.cardBorder,
        PDF_COLORS.bodyStrong
      );
      drawMetricCard(
        left + (cardWidth + gap) * 3,
        y,
        cardWidth,
        "Final Grade",
        selectedCase.grade,
        "เกรดหลังพิจารณา",
        PDF_COLORS.roseSoft,
        PDF_COLORS.roseBorder,
        PDF_COLORS.danger
      );
      y += 27;
    };

    const addTimelineCards = () => {
      const cardWidth = (contentWidth - gap * 2) / 3;
      const cardHeight = 22;
      ensureSpace(cardHeight + 2);

      const cards = [
        {
          title: "Appeal Submit Date & Time",
          value: selectedCase.appealSubmitDateTime || "-",
          fill: PDF_COLORS.violetSoft,
          border: PDF_COLORS.violetBorder,
          accent: PDF_COLORS.section,
        },
        {
          title: "Appeal Result Date & Time",
          value: selectedCase.appealResultDateTime || "-",
          fill: PDF_COLORS.roseSoft,
          border: PDF_COLORS.roseBorder,
          accent: PDF_COLORS.danger,
        },
        {
          title: "Appeal Channel",
          value: selectedCase.appealChannel || "-",
          fill: PDF_COLORS.cardFill,
          border: PDF_COLORS.cardBorder,
          accent: PDF_COLORS.bodyStrong,
        },
      ];

      cards.forEach((card, index) => {
        const x = left + index * (cardWidth + gap);
        drawRoundedBox(x, y, cardWidth, cardHeight, card.fill, card.border);
        setPdfFont(doc, "bold");
        doc.setFontSize(8.5);
        setColor(card.accent);
        doc.text(doc.splitTextToSize(card.title, cardWidth - 8), x + 4, y + 6);
        setPdfFont(doc, "bold");
        doc.setFontSize(11);
        setColor(PDF_COLORS.bodyStrong);
        doc.text(doc.splitTextToSize(card.value, cardWidth - 8), x + 4, y + 14);
      });

      y += cardHeight + 4;
    };

    const addDecisionBox = () => {
      const policyText = selectedCaseUsesNewPolicy
        ? "Use score criteria from April 2026 onward"
        : "Use previous score criteria";
      addParagraphInBox(
        "Final Decision",
        `Finalized and closed
${policyText}
This case has completed the appeal review process and cannot be appealed again.`,
        PDF_COLORS.roseSoft,
        PDF_COLORS.roseBorder,
        PDF_COLORS.bodyStrong
      );
    };

    const addAppealedTopicCard = (topic: Topic, index: number) => {
      const originalScore = Number(topic.originalScore ?? 0);
      const revisedScore = Number(topic.score ?? 0);
      const diff = revisedScore - originalScore;
      const statusLabel = diff > 0 ? "Improved" : diff < 0 ? "Reduced" : "No Change";
      const statusColor =
        diff > 0 ? PDF_COLORS.success : diff < 0 ? PDF_COLORS.danger : PDF_COLORS.neutral;

      const topicTitleLines = doc.splitTextToSize(
        `${index + 1}. ${topic.code} ${topic.label}`,
        contentWidth - 14
      );
      const scoreLines = doc.splitTextToSize(
        `Original Score: ${originalScore}   →   Final Score: ${revisedScore}   (${statusLabel} ${diff > 0 ? "+" : ""}${diff})`,
        contentWidth - 14
      );
      const appealReasonLines = doc.splitTextToSize(topic.appealReason || "-", contentWidth - 18);
      const originalCommentLines = doc.splitTextToSize(topic.originalComment || "-", contentWidth - 18);
      const revisedCommentLines = doc.splitTextToSize(topic.comment || "-", contentWidth - 18);

      const commentBlockHeight = (titleLines: string[], valueLines: string[]) =>
        7 + titleLines.length * 3.8 + valueLines.length * 4.5 + 4;

      const reasonTitle = doc.splitTextToSize("Appeal Reason", contentWidth - 18);
      const originalTitle = doc.splitTextToSize("Original Comment", contentWidth - 18);
      const revisedTitle = doc.splitTextToSize("Revised Comment", contentWidth - 18);

      const reasonHeight = commentBlockHeight(reasonTitle, appealReasonLines);
      const originalHeight = commentBlockHeight(originalTitle, originalCommentLines);
      const revisedHeight = commentBlockHeight(revisedTitle, revisedCommentLines);

      const cardHeight =
        10 +
        topicTitleLines.length * 4.3 +
        scoreLines.length * 4.5 +
        reasonHeight +
        originalHeight +
        revisedHeight +
        8;

      ensureSpace(cardHeight + 3);
      drawRoundedBox(left, y, contentWidth, cardHeight, PDF_COLORS.white, PDF_COLORS.violetBorder);

      let innerY = y + 7;
      setPdfFont(doc, "bold");
      doc.setFontSize(11.5);
      setColor(PDF_COLORS.bodyStrong);
      doc.text(topicTitleLines, left + 5, innerY);
      innerY += topicTitleLines.length * 4.3 + 2;

      setPdfFont(doc, "bold");
      doc.setFontSize(9.5);
      setColor(statusColor);
      doc.text(scoreLines, left + 5, innerY);
      innerY += scoreLines.length * 4.5 + 3;

      const drawCommentBlock = (
        title: string,
        lines: string[],
        fill: [number, number, number],
        border: [number, number, number],
        titleColor: [number, number, number]
      ) => {
        const titleLines = doc.splitTextToSize(title, contentWidth - 18);
        const boxHeight = commentBlockHeight(titleLines, lines);
        drawRoundedBox(left + 4, innerY, contentWidth - 8, boxHeight, fill, border);
        setPdfFont(doc, "bold");
        doc.setFontSize(9.5);
        setColor(titleColor);
        doc.text(titleLines, left + 8, innerY + 5.5);
        setPdfFont(doc, "normal");
        doc.setFontSize(10);
        setColor(PDF_COLORS.body);
        doc.text(lines, left + 8, innerY + 10 + titleLines.length * 3.8);
        innerY += boxHeight + 3;
      };

      drawCommentBlock(
        "Appeal Reason",
        appealReasonLines,
        PDF_COLORS.amberSoft,
        PDF_COLORS.amberBorder,
        PDF_COLORS.appealReason
      );
      drawCommentBlock(
        "Original Comment",
        originalCommentLines,
        PDF_COLORS.skySoft,
        PDF_COLORS.skyBorder,
        PDF_COLORS.originalComment
      );
      drawCommentBlock(
        "Revised Comment",
        revisedCommentLines,
        PDF_COLORS.violetSoft,
        PDF_COLORS.violetBorder,
        PDF_COLORS.revisedComment
      );

      y += cardHeight + 4;
    };

    drawHeader();

    if (!usingThaiFont) {
      addParagraphInBox(
        "Font Notice",
        "TH Sarabun font is not embedded yet. PDF is using fallback font.",
        PDF_COLORS.amberSoft,
        PDF_COLORS.amberBorder,
        PDF_COLORS.appealReason
      );
    }

    addMetricsRow();

    addSectionTitle("Case Overview", "สรุปข้อมูลหลักให้ออกมาใกล้เคียงกับมุมมองบนหน้าเว็บ");
    addInfoGrid([
      { label: "Case ID", value: selectedCase.caseId || "-" },
      { label: "Agent", value: selectedCase.agent || "-" },
      { label: "Audit Date", value: selectedCase.auditDate || "-" },
      { label: "Week Label", value: selectedCase.weekLabel || "-" },
      { label: "Month Key", value: selectedCase.monthKey || "-" },
      {
        label: "Score Flow",
        value: `${selectedCase.previousScore.toFixed(2)} → ${selectedCase.finalScore.toFixed(2)}`,
      },
      {
        label: "Grade Flow",
        value: `${selectedCaseOriginalGradeForPdf} → ${selectedCase.grade}`,
      },
      {
        label: "Appealed Topics",
        value: `${selectedCase.appealedTopics.length} topic(s)`,
      },
    ]);

    addSectionTitle("Customer Inquiry");
    addParagraphInBox(
      "Customer Inquiry",
      selectedCase.inquiry || "-",
      PDF_COLORS.cardFill,
      PDF_COLORS.cardBorder
    );

    addSectionTitle("Appeal Review Summary");
    addParagraphInBox(
      "Appeal Review Summary",
      selectedCase.appealReviewSummary || "-",
      PDF_COLORS.violetSoft,
      PDF_COLORS.violetBorder,
      PDF_COLORS.bodyStrong
    );

    addSectionTitle("Appeal Timeline");
    addTimelineCards();
    addDecisionBox();

    addSectionTitle(
      "Appealed Topics",
      "แสดงเฉพาะหัวข้อที่มีการยื่นอุทธรณ์ พร้อมแยก Appeal Reason, Original Comment และ Revised Comment แบบใกล้เคียงหน้าเว็บ"
    );
    if (!selectedCase.appealedTopics.length) {
      addParagraphInBox(
        "Appealed Topics",
        "ไม่พบหัวข้อที่มีการยื่นอุทธรณ์",
        PDF_COLORS.cardFill,
        PDF_COLORS.cardBorder
      );
    } else {
      selectedCase.appealedTopics.forEach((topic, index) => {
        addAppealedTopicCard(topic, index);
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

                    <div className="rounded-2xl border border-violet-100 bg-white px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                        Customer Inquiry
                      </div>
                      <div className="mt-2 whitespace-pre-line text-[13px] leading-6 text-slate-800">
                        {selectedCase.inquiry || "-"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fuchsia-700">
                        Appeal Review Summary
                      </div>
                      <div className="mt-2 whitespace-pre-line text-[13px] leading-6 text-slate-800">
                        {selectedCase.appealReviewSummary || "-"}
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
                            <span className="text-violet-700">{selectedCase.finalScore.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Grade Flow
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-sm font-extrabold text-slate-900">
                            <span className={`inline-flex rounded-full border px-3 py-1 ${gradeTone(selectedCaseOriginalGrade || selectedCase.grade)}`}>
                              {selectedCaseOriginalGrade || selectedCase.grade}
                            </span>
                            <span className="text-slate-300">→</span>
                            <span className={`inline-flex rounded-full border px-3 py-1 ${gradeTone(selectedCase.grade)}`}>
                              {selectedCase.grade}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-4">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                            Grade Result
                          </div>
                          <div className="mt-2 text-sm font-bold text-violet-700">
                            {selectedCaseGradeShift ? selectedCaseGradeShift.label : `${selectedCase.grade}`}
                          </div>
                        </div>
                      </div>

                      <AppealedTopicsTable topics={selectedCase.appealedTopics} />
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
