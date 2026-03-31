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
  displayRevisedTopicCodes?: string[];
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
  displayRevisedTopicCodes: string[];
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

function mergeTopicSet(topics: Topic[], revisedTopics?: Topic[] | null) {
  if (!revisedTopics?.length) return topics;
  const revisedMap = new Map(revisedTopics.map((topic) => [topic.code, topic]));
  return topics.map((topic) => revisedMap.get(topic.code) || topic);
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
          ? mergeTopicSet(item.topics, item.revisedTopics)
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
      className={`overflow-hidden rounded-[30px] border border-violet-200/80 bg-white/95 shadow-[0_10px_35px_rgba(76,29,149,0.10)] backdrop-blur-sm ${className}`}
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
    <Panel className="overflow-hidden border-violet-200/70 bg-gradient-to-br from-white via-violet-50/40 to-fuchsia-50/60">
      <div className="h-1.5 bg-gradient-to-r from-violet-950 via-violet-700 to-fuchsia-500" />
      <PanelBody>
        <div className="text-sm font-semibold text-slate-600">{title}</div>
        <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900 lg:text-[34px]">
          {value}
        </div>
        <div className="mt-2 text-xs leading-5 text-slate-500">{sub}</div>
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
      className={`w-full rounded-[22px] border px-4 py-4 text-left transition-all duration-200 ${
        isActive
          ? "border-violet-400 bg-gradient-to-br from-violet-100 to-fuchsia-100 shadow-[0_10px_24px_rgba(109,40,217,0.18)]"
          : "border-violet-100 bg-white hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50/70 hover:shadow-[0_8px_18px_rgba(109,40,217,0.10)]"
      }`}
    >
      <div className="font-semibold text-slate-900">{label}</div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-violet-100 bg-white/90 p-3">
          <div className="text-slate-500">Average Score</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{averageDisplay}</div>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-white/90 p-3">
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
      className={`h-full cursor-pointer rounded-[22px] border p-4 text-left transition-all duration-200 ${
        isSelected
          ? "border-violet-400 bg-gradient-to-br from-violet-100 to-fuchsia-100 shadow-[0_10px_24px_rgba(109,40,217,0.16)]"
          : "border-violet-100 bg-white hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50/60 hover:shadow-[0_8px_18px_rgba(109,40,217,0.10)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{item.caseId}</div>
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

function normalizeCommentForCompare(value?: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeAppealReason(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isNoAppealReason(value: unknown) {
  const text = normalizeAppealReason(value);
  if (!text) return false;
  const normalized = text.toLowerCase();
  return (
    normalized === "ไม่อุทธรณ์หัวข้อนี้" ||
    normalized === "not appeal" ||
    normalized === "no appeal" ||
    normalized.includes("ไม่อุทธรณ์")
  );
}

function hasMeaningfulTextChange(originalValue?: string, revisedValue?: string) {
  const original = normalizeCommentForCompare(originalValue);
  const revised = normalizeCommentForCompare(revisedValue);

  if (!revised) return false;
  if (!original) return revised.length > 0;

  return original !== revised;
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

  const originalCommentText = normalizeCommentForCompare(String(originalComment ?? ""));
  const revisedCommentText = normalizeCommentForCompare(String(revisedComment ?? ""));

  const scoreChanged =
    originalScoreNum !== null &&
    revisedScoreNum !== null &&
    originalScoreNum !== revisedScoreNum;

  const commentChanged =
    revisedCommentText !== "" && revisedCommentText !== originalCommentText;

  return scoreChanged || commentChanged;
}

function isTopicChanged(originalTopic: Topic | undefined, revisedTopic: Topic) {
  if (!originalTopic) return false;

  const scoreChanged = Number(originalTopic.score) !== Number(revisedTopic.score);
  const commentChanged = hasMeaningfulTextChange(originalTopic.comment, revisedTopic.comment);

  return scoreChanged || commentChanged;
}

function CaseDetailTopicTable({
  topics,
  revisedTopics,
  reviewStatus,
  displayRevisedTopicCodes = [],
}: {
  topics: Topic[];
  revisedTopics?: Topic[] | null;
  reviewStatus?: ReviewStatus;
  displayRevisedTopicCodes?: string[];
}) {
  const originalMap = getOriginalTopicMap(topics);
  const displayCodeSet = new Set(displayRevisedTopicCodes);

  const displayTopics =
    reviewStatus === "Revised" && revisedTopics?.length
      ? topics.map((originalTopic) => {
          const revisedTopic = revisedTopics.find((item) => item.code === originalTopic.code);
          return revisedTopic || originalTopic;
        })
      : topics;

  const columns = [
    displayTopics.filter((_, i) => i % 2 === 0),
    displayTopics.filter((_, i) => i % 2 === 1),
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
              const revisedTopic =
                reviewStatus === "Revised" && revisedTopics?.length
                  ? revisedTopics.find((item) => item.code === topic.code)
                  : undefined;

              const allowedToShowRevised = displayCodeSet.has(topic.code);

              const changed =
                reviewStatus === "Revised" &&
                allowedToShowRevised &&
                !!revisedTopic &&
                isTopicChanged(originalTopic, revisedTopic);

              const shownTopic = changed && revisedTopic ? revisedTopic : topic;

              return (
                <div
                  key={`${shownTopic.code}-${shownTopic.label}`}
                  className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                        {shownTopic.code}
                      </div>
                      <div className="mt-1 text-xs font-semibold leading-5 text-slate-900">
                        {shownTopic.label}
                      </div>
                    </div>

                    <div className="shrink-0 rounded-xl bg-violet-50 px-3 py-2 text-right">
                      <div className="text-[9px] uppercase tracking-wide text-slate-500">
                        Score
                      </div>
                      <div className="text-sm font-bold text-slate-900">
                        {shownTopic.score}/{shownTopic.max}
                      </div>
                    </div>
                  </div>

                  {changed && originalTopic && revisedTopic ? (
                    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[12px] text-violet-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">Revised Topic</span>
                        <span className="rounded-full border border-violet-300 px-2 py-0.5 text-[10px] font-semibold">
                          {originalTopic.score} → {revisedTopic.score}
                        </span>
                      </div>

                      {hasMeaningfulTextChange(originalTopic.comment, revisedTopic.comment) ? (
                        <div className="mt-2 text-[11px] text-violet-700">Comment updated</div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className={`mt-3 rounded-xl border px-3 py-2 text-[11px] ${wrap}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">Percent</div>
                        <div className="mt-1 text-sm font-semibold">{shownTopic.pct}%</div>
                      </div>
                      <span className="rounded-full border border-current px-2 py-0.5 text-[10px] font-semibold">
                        {label}
                      </span>
                    </div>
                  </div>

                  {changed && originalTopic && revisedTopic ? (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Original Comment
                        </div>
                        <div className="mt-1 whitespace-pre-line text-[13px] leading-6 text-slate-700">
                          {originalTopic.comment || "ยังไม่มี Evaluation Comment"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                          Revised Comment
                        </div>
                        <div className="mt-1 whitespace-pre-line text-[13px] leading-6 text-slate-800">
                          {revisedTopic.comment || "ยังไม่มี Revised Comment"}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Evaluation Comment
                      </div>
                      <div className="mt-1 whitespace-pre-line text-[13px] leading-6 text-slate-700">
                        {(originalTopic || shownTopic).comment || "ยังไม่มี Evaluation Comment"}
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
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${gradeTone(grade)}`}
          >
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

function LogoHeaderBox() {
  return (
    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border border-white/20 bg-white/12 shadow-[0_12px_34px_rgba(0,0,0,0.18)] backdrop-blur-md lg:h-28 lg:w-28">
      <img
        src="/robinhood-logo.png"
        alt="Robinhood Logo"
        className="h-16 w-16 object-contain lg:h-20 lg:w-20"
      />
    </div>
  );
}

function PremiumBarChart({
  title,
  subtitle,
  data,
  height = 240,
}: {
  title?: string;
  subtitle?: string;
  data: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="rounded-[28px] border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/40 to-fuchsia-50/50 p-5 shadow-[0_10px_30px_rgba(91,33,182,0.08)]">
      {title ? (
        <div className="mb-4">
          <div className="text-sm font-bold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
      ) : null}

      <div className="relative">
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between pb-7 pt-2">
          {[0, 1, 2, 3].map((line) => (
            <div key={line} className="border-t border-dashed border-violet-100" />
          ))}
        </div>

        <div className="relative flex items-end gap-4" style={{ height }}>
          {data.map((item) => {
            const barHeight = Math.max((item.value / max) * (height - 50), item.value > 0 ? 18 : 6);

            return (
              <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-2">
                <div className="text-xs font-bold text-slate-700">{item.value}</div>

                <div className="relative flex w-full items-end justify-center">
                  <div
                    className="w-full rounded-t-[18px] bg-gradient-to-t from-violet-800 via-violet-600 to-fuchsia-400 shadow-[0_12px_24px_rgba(124,58,237,0.22)] transition-all duration-300"
                    style={{ height: barHeight }}
                  >
                    <div className="h-3 w-full rounded-t-[18px] bg-white/20" />
                  </div>
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

function PremiumReviewMixCard({
  title,
  subtitle,
  data,
}: {
  title?: string;
  subtitle?: string;
  data: { label: string; value: number; tone: string }[];
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const first = data[0]?.value || 0;
  const firstPct = total > 0 ? (first / total) * 100 : 0;

  return (
    <div className="rounded-[28px] border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/30 to-fuchsia-50/50 p-5 shadow-[0_10px_30px_rgba(91,33,182,0.08)]">
      {title ? (
        <div className="mb-4">
          <div className="text-sm font-bold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-center">
        <div className="flex items-center justify-center">
          <div
            className="relative h-40 w-40 rounded-full"
            style={{
              background: `conic-gradient(#94a3b8 0% ${firstPct}%, #7c3aed ${firstPct}% 100%)`,
            }}
          >
            <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white shadow-inner">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total
              </div>
              <div className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
                {total}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">cases</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {data.map((item) => {
            const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";

            return (
              <div
                key={item.label}
                className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-3.5 w-3.5 rounded-full ${item.tone}`} />
                    <span className="text-sm font-semibold text-slate-800">{item.label}</span>
                  </div>
                  <div className="text-sm font-extrabold text-slate-900">
                    {item.value}
                    <span className="ml-1 text-slate-400">({pct}%)</span>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${item.tone}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PremiumLineChart({
  title,
  subtitle,
  data,
  height = 240,
}: {
  title?: string;
  subtitle?: string;
  data: { label: string; value: number }[];
  height?: number;
}) {
  const width = 640;
  const padding = 28;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);

  const points = data.map((item, index) => {
    const x =
      data.length === 1
        ? width / 2
        : padding + (index * (width - padding * 2)) / (data.length - 1);
    const y = padding + ((max - item.value) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <div className="rounded-[28px] border border-violet-200/70 bg-gradient-to-br from-white via-violet-50/30 to-fuchsia-50/50 p-5 shadow-[0_10px_30px_rgba(91,33,182,0.08)]">
      {title ? (
        <div className="mb-4">
          <div className="text-sm font-bold tracking-tight text-slate-900">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[640px] w-full">
          {[0, 1, 2, 3].map((line) => {
            const y = padding + (line * (height - padding * 2)) / 3;
            return (
              <line
                key={line}
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                stroke="#e9d5ff"
                strokeDasharray="4 6"
              />
            );
          })}

          <defs>
            <linearGradient id="lineFillPremium" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(124,58,237,0.25)" />
              <stop offset="100%" stopColor="rgba(124,58,237,0.02)" />
            </linearGradient>
            <linearGradient id="lineStrokePremium" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
          </defs>

          {points.length > 1 ? (
            <>
              <polygon
                points={`${points.join(" ")} ${width - padding},${height - padding} ${padding},${height - padding}`}
                fill="url(#lineFillPremium)"
              />
              <polyline
                fill="none"
                stroke="url(#lineStrokePremium)"
                strokeWidth="4"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points.join(" ")}
              />
            </>
          ) : null}

          {data.map((item, index) => {
            const x =
              data.length === 1
                ? width / 2
                : padding + (index * (width - padding * 2)) / (data.length - 1);
            const y = padding + ((max - item.value) / range) * (height - padding * 2);

            return (
              <g key={item.label}>
                <circle cx={x} cy={y} r="6" fill="#7c3aed" />
                <circle cx={x} cy={y} r="12" fill="rgba(124,58,237,0.12)" />
                <text
                  x={x}
                  y={y - 14}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#475569"
                  fontWeight="700"
                >
                  {item.value.toFixed(1)}
                </text>
                <text
                  x={x}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#64748b"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function QuickCaseSearchCard({
  item,
  onOpen,
}: {
  item: CaseItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-left transition hover:border-violet-300 hover:bg-violet-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-900">{item.caseId}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {item.agent} · {item.auditDate}
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

      <div className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-700">{item.inquiryTh}</div>

      <div className="mt-3 text-[11px] font-semibold text-violet-700">Open in Case Detail</div>
    </button>
  );
}

export default function DashboardMockup({
  currentUser,
  dashboardSubTab,
  externalSelectedAgent,
  onSelectedAgentChange,
  onOpenCaseDetail,
}: {
  currentUser: any;
  dashboardSubTab: "overview" | "case-detail";
  externalSelectedAgent?: string;
  onSelectedAgentChange?: (agentName: string) => void;
  onOpenCaseDetail?: () => void;
}) {
  const [allCases, setAllCases] = useState<CaseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>(externalSelectedAgent || "");
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedCaseKey, setSelectedCaseKey] = useState<string>("");
  const [caseIdSearch, setCaseIdSearch] = useState<string>("");
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
            const appealReasonRaw = appealHelper.getValue(row, `${topic.code} Appeal Reason`);

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

            const appealedThisTopic = !isNoAppealReason(appealReasonRaw);
            const changedThisTopic = hasRealTopicChange(
              originalScoreRaw,
              revisedScoreRaw,
              originalCommentRaw,
              revisedCommentRaw
            );

            if (appealedThisTopic && changedThisTopic) {
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
            reviewStatus: displayRevisedTopicCodes.length ? "Revised" : "Original",
            revisedTopics,
            displayRevisedTopicCodes,
          });
        });

        setAppealMergeCount(appealMap.size);

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
              mergedAppeal?.displayRevisedTopicCodes?.length ? "Revised" : "Original";

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
              displayRevisedTopicCodes: mergedAppeal?.displayRevisedTopicCodes || [],
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
    const agentsFromCases = allCases.map((item) => String(item.agent || "").trim()).filter(Boolean);
    const mergedAgents = [...new Set([...AGENT_MASTER, ...agentsFromCases])].sort((a, b) =>
      a.localeCompare(b)
    );

    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return mergedAgents.filter((agent) => isSameAgent(agent, currentUser.agentName));
    }

    return mergedAgents;
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
  }, [currentUser, visibleAgentList, selectedAgent, onSelectedAgentChange]);

  const effectiveSelectedAgent =
    currentUser?.role === "Agent" && currentUser.agentName
      ? String(currentUser.agentName).trim()
      : String(selectedAgent || "").trim();

  const agentCases = useMemo(() => {
    if (currentUser?.role === "Agent" && currentUser.agentName) {
      return allCases.filter((item) => isSameAgent(item.agent, currentUser.agentName));
    }

    if (!effectiveSelectedAgent) {
      return allCases;
    }

    return allCases.filter((item) => isSameAgent(item.agent, effectiveSelectedAgent));
  }, [allCases, effectiveSelectedAgent, currentUser]);

  const dateFilteredCases = useMemo(() => {
    return agentCases.filter((item) => isWithinDateRange(item.auditDate, dateFrom, dateTo));
  }, [agentCases, dateFrom, dateTo]);

  const searchedCases = useMemo(() => {
    const keyword = caseIdSearch.trim().toLowerCase();
    if (!keyword) return dateFilteredCases;
    return dateFilteredCases.filter((item) =>
      String(item.caseId || "").toLowerCase().includes(keyword)
    );
  }, [dateFilteredCases, caseIdSearch]);

  const weekLabels = useMemo(() => {
    return [...new Set(searchedCases.map((item) => item.weekLabel))];
  }, [searchedCases]);

  const dashboardCasesBase = useMemo(() => {
    if (selectedWeek === "all") return searchedCases;
    return searchedCases.filter((item) => item.weekLabel === selectedWeek);
  }, [searchedCases, selectedWeek]);

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

  useEffect(() => {
    if (!caseIdSearch.trim()) return;
    if (!dashboardCases.length) return;
    setSelectedCaseKey(dashboardCases[0].key);
  }, [caseIdSearch, dashboardCases]);

  const summary = useMemo(() => buildAgentSummary(dashboardCases), [dashboardCases]);

  const metricAverageDisplay = summary.averageDisplay;
  const currentGrade = scoreToGrade(Number(metricAverageDisplay));
  const metricCaseCount = dashboardCases.length;
  const incentiveDisplay = formatCurrencyTHB(
    getIncentiveValue(metricCaseCount, Number(metricAverageDisplay))
  );
  const incentiveRemark = getIncentiveRemark(metricCaseCount, Number(metricAverageDisplay));

  const overviewCaseSearchResults = useMemo(() => {
    const keyword = caseIdSearch.trim().toLowerCase();
    if (!keyword) return [];

    return dateFilteredCases
      .filter((item) => String(item.caseId || "").toLowerCase().includes(keyword))
      .slice(0, 8);
  }, [dateFilteredCases, caseIdSearch]);

  const scoreDistributionData = useMemo(() => {
    const buckets = [
      { label: "90-100", value: 0 },
      { label: "80-89", value: 0 },
      { label: "70-79", value: 0 },
      { label: "60-69", value: 0 },
      { label: "<60", value: 0 },
    ];

    dashboardCases.forEach((item) => {
      const score = item.finalScore;
      if (score >= 90) buckets[0].value += 1;
      else if (score >= 80) buckets[1].value += 1;
      else if (score >= 70) buckets[2].value += 1;
      else if (score >= 60) buckets[3].value += 1;
      else buckets[4].value += 1;
    });

    return buckets;
  }, [dashboardCases]);

  const reviewMixChartData = useMemo(() => {
    const revised = dashboardCases.filter((item) => item.reviewStatus === "Revised").length;
    const original = dashboardCases.filter((item) => item.reviewStatus === "Original").length;

    return [
      { label: "Original", value: original, tone: "bg-slate-400" },
      { label: "Revised", value: revised, tone: "bg-violet-600" },
    ];
  }, [dashboardCases]);

  const weakestTopics = useMemo(() => {
    return summary.topicPerformance
      .filter((item) => item.pct !== "-")
      .sort((a, b) => Number(a.pct) - Number(b.pct))
      .slice(0, 3);
  }, [summary]);

  const strongestTopics = useMemo(() => {
    return summary.topicPerformance
      .filter((item) => item.pct !== "-")
      .sort((a, b) => Number(b.pct) - Number(a.pct))
      .slice(0, 3);
  }, [summary]);

  const weeklyTrendData = useMemo(() => {
    const weekMap = new Map<string, number[]>();

    searchedCases.forEach((item) => {
      const week = item.weekLabel || "Unknown";
      if (!weekMap.has(week)) weekMap.set(week, []);
      weekMap.get(week)!.push(item.finalScore);
    });

    return [...weekMap.entries()].map(([label, scores]) => ({
      label,
      value: scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1),
    }));
  }, [searchedCases]);

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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff] p-6">
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
    <div className="min-h-screen bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff]">
      <div className="bg-gradient-to-r from-violet-950 via-violet-900 to-fuchsia-700 text-white shadow-[0_16px_40px_rgba(76,29,149,0.22)]">
        <div className="mx-auto max-w-[1720px] px-6 py-8 lg:px-8 lg:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-4xl">
              <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200">
                QA Dashboard
              </div>
              <div className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl">
                Agent Performance Dashboard
              </div>
              <div className="mt-3 max-w-3xl text-sm leading-6 text-violet-100/95">
                Dashboard / Case Detail พร้อมข้อมูล Original และ Revised จาก QA_RawData1 +
                Appleal ROWDATA
              </div>
            </div>

            <div className="flex items-center gap-4 rounded-[28px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
              <LogoHeaderBox />
              <div className="hidden sm:block">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200">
                  Robinhood QA
                </div>
                <div className="mt-1 text-lg font-semibold text-white">
                  Quality Monitoring Workspace
                </div>
                <div className="mt-1 text-sm text-violet-100/90">
                  Corporate dashboard for audit tracking and case review
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1720px] px-6 py-6 lg:px-8 lg:py-8">
        <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Panel className="sticky top-4">
              <PanelHeader
                title="Quick Controls"
                subtitle="Filter by agent, case ID, date range and week"
              />
              <PanelBody className="space-y-5">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    Agent
                  </div>
                  {currentUser?.role === "Agent" ? (
                    <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-4 py-3 text-sm font-semibold text-violet-800">
                      {effectiveSelectedAgent || "-"}
                    </div>
                  ) : (
                    <select
                      value={selectedAgent}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSelectedAgent(value);
                        onSelectedAgentChange?.(value);
                        setSelectedWeek("all");
                        setSelectedCaseKey("");
                      }}
                      className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
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
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    Search Case ID
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={caseIdSearch}
                      onChange={(e) => {
                        setCaseIdSearch(e.target.value);
                        setSelectedCaseKey("");
                      }}
                      placeholder="ค้นหาเลขเคสได้ทันที โดยไม่ต้องเลือก Agent"
                      className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 pr-10 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m21 21-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                {caseIdSearch.trim() ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCaseIdSearch("");
                      setSelectedCaseKey("");
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                  >
                    Clear Search
                  </button>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                      Date From
                    </div>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    />
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                      Date To
                    </div>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    Week
                  </div>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="w-full rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    disabled={!searchedCases.length}
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
                {!searchedCases.length ? (
                  <div className="rounded-2xl border border-dashed border-violet-200 bg-white/80 p-4 text-sm text-slate-500">
                    ไม่พบข้อมูลในช่วงที่เลือก
                  </div>
                ) : (
                  <>
                    <WeeklySnapshotCard
                      label="All Weeks"
                      caseCount={searchedCases.length}
                      averageDisplay={buildAgentSummary(searchedCases).averageDisplay}
                      isActive={selectedWeek === "all"}
                      onClick={() => setSelectedWeek("all")}
                    />

                    {weekLabels.map((week) => {
                      const weekCases = searchedCases.filter((item) => item.weekLabel === week);
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
            {dashboardCases.length > 0 || caseIdSearch.trim() || effectiveSelectedAgent ? (
              dashboardSubTab === "overview" ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <MetricCard
                      title="Average Score"
                      value={metricAverageDisplay}
                      sub={`${metricCaseCount} case(s) in current view`}
                    />
                    <MetricCard
                      title="Current Grade"
                      value={currentGrade}
                      sub="Calculated from current average score"
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
                      value={`${revisedCount}`}
                      sub="Revised case(s) in current view"
                    />
                  </div>

                  <Panel>
                    <PanelHeader
                      title="QA Grade & Incentive Guide"
                      subtitle="Monthly incentive is calculated only when the agent has at least 10 reviewed cases in that month"
                    />
                    <PanelBody className="p-0">
                      <div className="overflow-x-auto">
                        <table className="min-w-[860px] w-full text-sm">
                          <thead>
                            <tr className="bg-violet-950 text-[11px] text-white">
                              <th className="px-4 py-3 text-left">Score Range</th>
                              <th className="px-4 py-3 text-left">Level</th>
                              <th className="px-4 py-3 text-center">Grade</th>
                              <th className="px-4 py-3 text-center">Incentive (THB)</th>
                              <th className="px-4 py-3 text-left">Meaning</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="bg-white">
                              <td className="border-t border-slate-200 px-4 py-3">90-100</td>
                              <td className="border-t border-slate-200 px-4 py-3">Excellent</td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">
                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                  A
                                </span>
                              </td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">1,000</td>
                              <td className="border-t border-slate-200 px-4 py-3">Meets all key standards</td>
                            </tr>
                            <tr className="bg-white">
                              <td className="border-t border-slate-200 px-4 py-3">80-89</td>
                              <td className="border-t border-slate-200 px-4 py-3">Good</td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">
                                <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                                  B
                                </span>
                              </td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">700</td>
                              <td className="border-t border-slate-200 px-4 py-3">Meets most standards</td>
                            </tr>
                            <tr className="bg-white">
                              <td className="border-t border-slate-200 px-4 py-3">70-79</td>
                              <td className="border-t border-slate-200 px-4 py-3">Fair</td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">
                                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                  C
                                </span>
                              </td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">300</td>
                              <td className="border-t border-slate-200 px-4 py-3">Minimum pass level</td>
                            </tr>
                            <tr className="bg-white">
                              <td className="border-t border-slate-200 px-4 py-3">60-69</td>
                              <td className="border-t border-slate-200 px-4 py-3">Improvement Required</td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">
                                <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                                  D
                                </span>
                              </td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">0</td>
                              <td className="border-t border-slate-200 px-4 py-3">Below company standard</td>
                            </tr>
                            <tr className="bg-white">
                              <td className="border-t border-slate-200 px-4 py-3">&lt;60</td>
                              <td className="border-t border-slate-200 px-4 py-3">Fail</td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">
                                <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                                  F
                                </span>
                              </td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">0</td>
                              <td className="border-t border-slate-200 px-4 py-3">Significant quality issue</td>
                            </tr>
                            <tr className="bg-white">
                              <td className="border-t border-slate-200 px-4 py-3">Critical Error</td>
                              <td className="border-t border-slate-200 px-4 py-3">Written Warning</td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">
                                <span className="inline-flex rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2.5 py-1 text-xs font-semibold text-fuchsia-700">
                                  G
                                </span>
                              </td>
                              <td className="border-t border-slate-200 px-4 py-3 text-center">0</td>
                              <td className="border-t border-slate-200 px-4 py-3">Immediate fail</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </PanelBody>
                  </Panel>

                  <Panel>
                    <PanelHeader
                      title="Overview Filters"
                      subtitle="Control which cases are shown in overview"
                    />
                    <PanelBody className="space-y-4">
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
                          Revised Only
                        </button>
                      </div>

                      {caseIdSearch.trim() ? (
                        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                          <div className="text-xs font-bold uppercase tracking-wide text-violet-700">
                            Quick Case Search Result
                          </div>

                          <div className="mt-3 space-y-3">
                            {overviewCaseSearchResults.length ? (
                              overviewCaseSearchResults.map((item) => (
                                <QuickCaseSearchCard
                                  key={item.key}
                                  item={item}
                                  onOpen={() => {
                                    setSelectedCaseKey(item.key);
                                    onOpenCaseDetail?.();
                                  }}
                                />
                              ))
                            ) : (
                              <div className="rounded-xl border border-dashed border-violet-200 bg-white px-4 py-4 text-sm text-slate-500">
                                ไม่พบเลขเคสที่ค้นหา
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </PanelBody>
                  </Panel>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <PremiumBarChart
                      title="Score Distribution"
                      subtitle="Case count by score range"
                      data={scoreDistributionData}
                    />

                    <PremiumReviewMixCard
                      title="Review Status Mix"
                      subtitle="Original vs Revised in current view"
                      data={reviewMixChartData}
                    />
                  </div>

                  <PremiumLineChart
                    title="Weekly Score Trend"
                    subtitle="Average score by visible week"
                    data={weeklyTrendData}
                  />

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <Panel>
                      <PanelHeader
                        title="Topic Performance"
                        subtitle="Average topic score in current view"
                      />
                      <PanelBody>
                        <TopicPerformanceTable items={summary.topicPerformance} />
                      </PanelBody>
                    </Panel>

                    <Panel>
                      <PanelHeader title="Grade Mix" subtitle="Current view grade distribution" />
                      <PanelBody>
                        <GradeMix gradeCounts={summary.gradeCounts} />
                      </PanelBody>
                    </Panel>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-2">
                    <Panel>
                      <PanelHeader title="Strongest Topics" subtitle="Top 3 topics in current view" />
                      <PanelBody className="space-y-3">
                        {strongestTopics.length ? (
                          strongestTopics.map((topic) => (
                            <div
                              key={topic.code}
                              className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
                            >
                              <div className="text-sm font-bold text-slate-900">
                                {topic.code} {topic.label}
                              </div>
                              <div className="mt-1 text-xs text-emerald-700">
                                {topic.pct}% average
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-slate-500">No data</div>
                        )}
                      </PanelBody>
                    </Panel>

                    <Panel>
                      <PanelHeader
                        title="Coaching Focus"
                        subtitle="Top 3 weakest topics in current view"
                      />
                      <PanelBody className="space-y-3">
                        {weakestTopics.length ? (
                          weakestTopics.map((topic) => (
                            <div
                              key={topic.code}
                              className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3"
                            >
                              <div className="text-sm font-bold text-slate-900">
                                {topic.code} {topic.label}
                              </div>
                              <div className="mt-1 text-xs text-rose-700">
                                {topic.pct}% average
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-slate-500">No data</div>
                        )}
                      </PanelBody>
                    </Panel>
                  </div>
                </>
              ) : (
                <>
                  <Panel>
                    <PanelHeader
                      title="Case Navigator"
                      subtitle="Select a case to review detailed topic scoring"
                    />
                    <PanelBody>
                      {!dashboardCases.length ? (
                        <div className="rounded-2xl border border-dashed border-violet-200 bg-white/80 p-8 text-center text-sm text-slate-500">
                          ไม่พบข้อมูลในช่วงที่เลือก
                        </div>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
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

                  {activeSelectedCase ? (
                    <>
                      <Panel>
                        <PanelHeader
                          title="Case Information"
                          subtitle="Selected case overview and review status"
                        />
                        <PanelBody className="space-y-5">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                                  {activeSelectedCase.caseId}
                                </span>
                                <span
                                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${gradeTone(
                                    activeSelectedCase.grade
                                  )}`}
                                >
                                  Grade {activeSelectedCase.grade}
                                </span>
                                <ReviewStatusBadge item={activeSelectedCase} />
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Agent
                                  </div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900">
                                    {activeSelectedCase.agent}
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Audit Date
                                  </div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900">
                                    {activeSelectedCase.auditDate}
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Week
                                  </div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900">
                                    {activeSelectedCase.weekLabel}
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                    Final Score
                                  </div>
                                  <div className="mt-1 text-sm font-semibold text-slate-900">
                                    {activeSelectedCase.finalScore.toFixed(2)}
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                  Customer Inquiry
                                </div>
                                <div className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-800">
                                  {activeSelectedCase.inquiryTh || "-"}
                                </div>
                              </div>
                            </div>

                            {activeSelectedCase.caseUrl ? (
                              <a
                                href={activeSelectedCase.caseUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-100"
                              >
                                Open Case URL
                              </a>
                            ) : null}
                          </div>
                        </PanelBody>
                      </Panel>

                      <Panel>
                        <PanelHeader
                          title="Topic Detail"
                          subtitle="Original / Revised topic comparison"
                        />
                        <PanelBody>
                          <CaseDetailTopicTable
                            topics={activeSelectedCase.topics}
                            revisedTopics={activeSelectedCase.revisedTopics}
                            reviewStatus={activeSelectedCase.reviewStatus}
                            displayRevisedTopicCodes={activeSelectedCase.displayRevisedTopicCodes || []}
                          />
                        </PanelBody>
                      </Panel>
                    </>
                  ) : (
                    <Panel>
                      <PanelHeader title="Case Detail" />
                      <PanelBody>
                        <div className="rounded-2xl border border-dashed border-violet-200 bg-white/80 p-8 text-center text-sm text-slate-500">
                          ไม่พบเคสที่ตรงกับเงื่อนไขที่ค้นหา
                        </div>
                      </PanelBody>
                    </Panel>
                  )}
                </>
              )
            ) : (
              <Panel>
                <PanelHeader title="Dashboard" />
                <PanelBody>
                  <div className="rounded-2xl border border-dashed border-violet-200 bg-white/80 p-8 text-center text-sm text-slate-500">
                    กรุณาเลือก Agent หรือค้นหา Case ID
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