import React, { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { fetchStoredEvaluations, StoredEvaluation } from "./evaluationStore";
import { scoreToGrade } from "./lib/scoreIncentivePolicy";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";

type CurrentUser = {
  username: string;
  displayName: string;
  role: string;
  agentName: string;
};

type SectionKey = "kpiSummary" | "weekCompare" | "agentRanking" | "topicPerformance" | "actionPlan";
type TemplateKey = "executive" | "topicFocus" | "actionPlan";

type PresentationMockupProps = {
  currentUser: CurrentUser;
  roleScopedAgentNames?: string[];
  dataRefreshKey?: number;
};

type WeekBucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
  cases: StoredEvaluation[];
};

type TopicRow = {
  id: string;
  title: string;
  score: number;
  max: number;
  percent: number;
  cases: number;
};

type AgentRow = {
  agent: string;
  cases: number;
  avg: number;
};

type MonthRow = {
  key: string;
  label: string;
  cases: number;
  avg: number;
  grade: string;
};

const SECTION_OPTIONS: Array<{ key: SectionKey; label: string; description: string }> = [
  { key: "kpiSummary", label: "KPI Summary", description: "จำนวนเคส คะแนนเฉลี่ย Critical Error และภาพรวม" },
  { key: "weekCompare", label: "Week Compare", description: "เทียบกับสัปดาห์ก่อนหน้า" },
  { key: "agentRanking", label: "Agent Ranking", description: "อันดับคะแนนเฉลี่ยราย Agent" },
  { key: "topicPerformance", label: "Topic Performance", description: "หัวข้อที่ทำได้ดีและควรเร่งปรับปรุง" },
  { key: "actionPlan", label: "Action Plan", description: "สรุปแนวทางโฟกัสถัดไป" },
];

const TEMPLATE_OPTIONS: Array<{ key: TemplateKey; label: string; description: string }> = [
  { key: "executive", label: "Executive Summary", description: "สรุปกระชับสำหรับพรีเซ็นต์ภาพรวม" },
  { key: "topicFocus", label: "Topic Focus", description: "เน้นหัวข้อคะแนนดีและหัวข้อที่ต้องปรับปรุง" },
  { key: "actionPlan", label: "Action Plan", description: "เน้นสิ่งที่ต้องทำต่อและเจ้าของงาน" },
];

const DEFAULT_SECTIONS: Record<SectionKey, boolean> = {
  kpiSummary: true,
  weekCompare: true,
  agentRanking: true,
  topicPerformance: true,
  actionPlan: true,
};

const SAMPLE_WEEKLY_SLIDE_DATA = {
  cases: 15,
  averageScore: 95.07,
  grade: "A",
  month: "June 2026",
  week: "01/06/2026 - 07/06/2026",
  mergeRows: 51,
  revised: 0,
};

const SAMPLE_MONTH_ROWS: MonthRow[] = [
  { key: "2026-06", label: "June 2026", cases: 15, avg: 95.07, grade: "A" },
  { key: "2026-05", label: "May 2026", cases: 120, avg: 85.49, grade: "B" },
  { key: "2026-04", label: "April 2026", cases: 120, avg: 86.16, grade: "B" },
];

const SAMPLE_TOPIC_ROWS: TopicRow[] = [
  { id: "sample-process", title: "Process & Policy Compliance", score: 29.07, max: 30, percent: 96.9, cases: 15 },
  { id: "sample-answer", title: "Answer Quality & Problem Analysis", score: 18.67, max: 20, percent: 93.35, cases: 15 },
  { id: "sample-followup", title: "Case Handling & Follow-up", score: 23.47, max: 25, percent: 93.88, cases: 15 },
  { id: "sample-communication", title: "Communication Skills", score: 23.87, max: 25, percent: 95.48, cases: 15 },
];

function parseAuditDate(value: string) {
  const text = String(value || "").trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return new Date(Number(slash[3]), Number(slash[2]) - 1, Number(slash[1]));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfWeek(date: Date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatIsoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatThaiDate(date: Date) {
  return date.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
}

function formatWeekLabel(start: Date, end: Date) {
  return `${formatThaiDate(start)} - ${formatThaiDate(end)}`;
}

function formatMonthKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonthLabelFromKey(key: string) {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key || "-";
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function normalizeText(value: string) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function agentKey(value: string) {
  return normalizeText(value).replace(/[^a-z0-9ก-๙]/gi, "");
}

function scoreOf(item: StoredEvaluation) {
  const score = Number(item.finalScore);
  return Number.isFinite(score) ? score : 0;
}

function avgScore(items: StoredEvaluation[]) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + scoreOf(item), 0) / items.length;
}

function percentOf(score: number, max: number) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, (score / max) * 100));
}

function cleanTopicTitle(title: string) {
  return String(title || "ไม่ระบุหัวข้อ").replace(/\s+/g, " ").trim();
}

function truncateText(text: string, max = 46) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function buildWeekBuckets(cases: StoredEvaluation[]) {
  const map = new Map<string, WeekBucket>();
  cases.forEach((item) => {
    const date = parseAuditDate(item.auditDate || item.submittedAt || item.createdAt || "");
    if (!date) return;
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    const key = formatIsoDate(start);
    const existing = map.get(key);
    if (existing) {
      existing.cases.push(item);
    } else {
      map.set(key, { key, label: formatWeekLabel(start, end), start, end, cases: [item] });
    }
  });
  return Array.from(map.values()).sort((a, b) => b.start.getTime() - a.start.getTime());
}

function buildTopicRows(cases: StoredEvaluation[]) {
  const map = new Map<string, TopicRow>();
  cases.forEach((item) => {
    (item.topics || []).forEach((topic) => {
      const title = cleanTopicTitle(topic.title || topic.code);
      const id = `${topic.code || ""}-${title}`;
      const row = map.get(id) || { id, title, score: 0, max: 0, percent: 0, cases: 0 };
      row.score += Number(topic.score) || 0;
      row.max += Number(topic.max) || 0;
      row.cases += 1;
      row.percent = percentOf(row.score, row.max);
      map.set(id, row);
    });
  });
  return Array.from(map.values()).filter((row) => row.max > 0);
}

function buildAgentRows(cases: StoredEvaluation[]) {
  const map = new Map<string, { total: number; cases: number }>();
  cases.forEach((item) => {
    const agent = item.targetDisplayName || item.agentName || item.targetUsername || "ไม่ระบุ Agent";
    const row = map.get(agent) || { total: 0, cases: 0 };
    row.total += scoreOf(item);
    row.cases += 1;
    map.set(agent, row);
  });
  return Array.from(map.entries())
    .map(([agent, row]) => ({ agent, cases: row.cases, avg: row.cases ? row.total / row.cases : 0 }))
    .sort((a, b) => b.avg - a.avg || b.cases - a.cases);
}

function buildMonthRows(cases: StoredEvaluation[]) {
  const map = new Map<string, StoredEvaluation[]>();
  cases.forEach((item) => {
    const date = parseAuditDate(item.auditDate || item.submittedAt || item.createdAt || "");
    if (!date) return;
    const key = formatMonthKey(date);
    map.set(key, [...(map.get(key) || []), item]);
  });
  return Array.from(map.entries())
    .map(([key, rows]) => {
      const avg = avgScore(rows);
      return { key, label: formatMonthLabelFromKey(key), cases: rows.length, avg, grade: scoreToGrade(avg) };
    })
    .sort((a, b) => b.key.localeCompare(a.key));
}

function buildSlideSummaryText({
  week,
  previousWeek,
  goodTopics,
  lowTopics,
}: {
  week?: WeekBucket;
  previousWeek?: WeekBucket;
  goodTopics: TopicRow[];
  lowTopics: TopicRow[];
}) {
  if (!week) return "ยังไม่มีข้อมูลสำหรับสร้างสรุปสไลด์";
  const currentAvg = avgScore(week.cases);
  const previousAvg = previousWeek ? avgScore(previousWeek.cases) : 0;
  const delta = previousWeek ? currentAvg - previousAvg : 0;
  const deltaText = previousWeek ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}` : "ไม่มีข้อมูลสัปดาห์ก่อน";
  const topText = goodTopics.slice(0, 3).map((item) => item.title).join(", ") || "ยังไม่มีหัวข้อคะแนนดี";
  const lowText = lowTopics.slice(0, 3).map((item) => item.title).join(", ") || "ยังไม่มีหัวข้อที่ต่ำกว่าเกณฑ์";
  return `สรุป QA Weekly ${week.label}: จำนวนเคส ${week.cases.length} เคส คะแนนเฉลี่ย ${currentAvg.toFixed(2)} (${scoreToGrade(currentAvg)}) เทียบสัปดาห์ก่อน ${deltaText} คะแนน หัวข้อที่ทำได้ดีคือ ${topText} และหัวข้อที่ควรเร่งปรับปรุงคือ ${lowText}`;
}

function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
  return Promise.resolve();
}

export default function PresentationMockup({ currentUser, roleScopedAgentNames, dataRefreshKey = 0 }: PresentationMockupProps) {
  const [evaluations, setEvaluations] = useState<StoredEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedWeekKey, setSelectedWeekKey] = useState("");
  const [template, setTemplate] = useState<TemplateKey>("executive");
  const [sections, setSections] = useState<Record<SectionKey, boolean>>(DEFAULT_SECTIONS);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErrorMessage("");
    fetchStoredEvaluations(1000)
      .then((rows) => {
        if (!alive) return;
        setEvaluations(rows);
      })
      .catch((error) => {
        console.warn("Load presentation evaluations failed", error);
        if (alive) setErrorMessage("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dataRefreshKey]);

  const scopedEvaluations = useMemo(() => {
    if (!roleScopedAgentNames?.length) return evaluations;
    const allowed = new Set(roleScopedAgentNames.map(agentKey).filter(Boolean));
    if (!allowed.size) return evaluations;
    return evaluations.filter((item) => {
      const names = [item.agentName, item.targetDisplayName, item.targetUsername].map(agentKey);
      return names.some((name) => allowed.has(name));
    });
  }, [evaluations, roleScopedAgentNames]);

  const weekBuckets = useMemo(() => buildWeekBuckets(scopedEvaluations), [scopedEvaluations]);
  const selectedWeek = useMemo(
    () => weekBuckets.find((week) => week.key === selectedWeekKey) || weekBuckets[0],
    [selectedWeekKey, weekBuckets],
  );
  const previousWeek = useMemo(() => {
    if (!selectedWeek) return undefined;
    const previousKey = formatIsoDate(addDays(selectedWeek.start, -7));
    return weekBuckets.find((week) => week.key === previousKey);
  }, [selectedWeek, weekBuckets]);

  useEffect(() => {
    if (!selectedWeekKey && weekBuckets[0]) setSelectedWeekKey(weekBuckets[0].key);
  }, [selectedWeekKey, weekBuckets]);

  const currentCases = selectedWeek?.cases || [];
  const previousCases = previousWeek?.cases || [];
  const currentAvg = avgScore(currentCases);
  const previousAvg = avgScore(previousCases);
  const delta = previousWeek ? currentAvg - previousAvg : 0;
  const criticalCount = currentCases.filter((item) => item.criticalError).length;
  const topicRows = useMemo(() => buildTopicRows(currentCases), [currentCases]);
  const goodTopics = useMemo(() => [...topicRows].sort((a, b) => b.percent - a.percent).slice(0, 5), [topicRows]);
  const lowTopics = useMemo(() => [...topicRows].sort((a, b) => a.percent - b.percent).slice(0, 5), [topicRows]);
  const agentRows = useMemo(() => buildAgentRows(currentCases).slice(0, 5), [currentCases]);
  const monthRows = useMemo(() => buildMonthRows(scopedEvaluations).slice(0, 3), [scopedEvaluations]);
  const actionTargets = lowTopics.slice(0, 3);
  const slideSummary = useMemo(
    () => buildSlideSummaryText({ week: selectedWeek, previousWeek, goodTopics, lowTopics }),
    [selectedWeek, previousWeek, goodTopics, lowTopics],
  );

  const toggleSection = (key: SectionKey) => {
    setSections((current) => ({ ...current, [key]: !current[key] }));
  };

  const handleCopySummary = useCallback(async () => {
    await copyTextToClipboard(slideSummary);
    setStatusMessage("คัดลอก Slide Summary แล้ว");
    window.setTimeout(() => setStatusMessage(""), 2200);
  }, [slideSummary]);

  const handleExportPdf = useCallback(() => {
    if (!selectedWeek) return;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    registerTHSarabunNew(doc);
    doc.setFont("THSarabunNew", "bold");
    doc.setTextColor(31, 26, 46);
    doc.setFontSize(25);
    doc.text("QA Performance Presentation", 16, 20);
    doc.setFontSize(18);
    doc.setFont("THSarabunNew", "normal");
    doc.setTextColor(93, 84, 110);
    doc.text(`Weekly ${selectedWeek.label}`, 16, 30);

    doc.setFillColor(91, 33, 182);
    doc.roundedRect(242, 12, 40, 12, 6, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("THSarabunNew", "bold");
    doc.setFontSize(14);
    doc.text("Presentation", 248, 20);

    const cards = [
      ["จำนวนเคส", `${currentCases.length}`, previousWeek ? `สัปดาห์ก่อน ${previousCases.length}` : "ยังไม่มีข้อมูลเทียบ"],
      ["คะแนนเฉลี่ย", currentAvg.toFixed(2), previousWeek ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} จากสัปดาห์ก่อน` : scoreToGrade(currentAvg)],
      ["Critical Error", `${criticalCount}`, criticalCount ? "พบเคสที่ต้องติดตาม" : "ไม่พบในสัปดาห์นี้"],
      ["ภาพรวม", currentAvg >= 90 ? "ดีมาก" : currentAvg >= 80 ? "ดีขึ้นต่อเนื่อง" : "ควรโฟกัส", scoreToGrade(currentAvg)],
    ];
    cards.forEach((card, index) => {
      const x = 16 + index * 68;
      doc.setFillColor(248, 245, 255);
      doc.setDrawColor(221, 214, 254);
      doc.roundedRect(x, 40, 60, 28, 3, 3, "FD");
      doc.setFont("THSarabunNew", "bold");
      doc.setFontSize(12);
      doc.setTextColor(49, 20, 99);
      doc.text(card[0], x + 5, 49);
      doc.setFontSize(24);
      doc.text(card[1], x + 5, 60);
      doc.setFont("THSarabunNew", "normal");
      doc.setFontSize(10);
      doc.setTextColor(96, 88, 115);
      doc.text(card[2], x + 5, 65);
    });

    let y = 82;
    if (sections.topicPerformance) {
      doc.setFont("THSarabunNew", "bold");
      doc.setFontSize(17);
      doc.setTextColor(22, 101, 52);
      doc.text("หัวข้อที่ทำได้ดี", 16, y);
      doc.setTextColor(190, 18, 60);
      doc.text("หัวข้อที่ควรเร่งปรับปรุง", 154, y);
      doc.setFont("THSarabunNew", "normal");
      doc.setFontSize(12);
      for (let i = 0; i < 5; i += 1) {
        const good = goodTopics[i];
        const low = lowTopics[i];
        if (good) {
          doc.setTextColor(31, 41, 55);
          doc.text(`${i + 1}. ${truncateText(good.title, 42)}`, 18, y + 10 + i * 8);
          doc.setTextColor(22, 101, 52);
          doc.text(`${good.percent.toFixed(1)}%`, 120, y + 10 + i * 8, { align: "right" });
        }
        if (low) {
          doc.setTextColor(31, 41, 55);
          doc.text(`${i + 1}. ${truncateText(low.title, 42)}`, 156, y + 10 + i * 8);
          doc.setTextColor(190, 18, 60);
          doc.text(`${low.percent.toFixed(1)}%`, 262, y + 10 + i * 8, { align: "right" });
        }
      }
      y += 55;
    }

    if (sections.agentRanking) {
      doc.setFont("THSarabunNew", "bold");
      doc.setFontSize(16);
      doc.setTextColor(49, 20, 99);
      doc.text("Agent Ranking", 16, y);
      doc.setFont("THSarabunNew", "normal");
      doc.setFontSize(12);
      agentRows.forEach((item, index) => {
        doc.setTextColor(31, 41, 55);
        doc.text(`${index + 1}. ${truncateText(item.agent, 36)} (${item.cases} เคส)`, 18, y + 9 + index * 7);
        doc.setTextColor(91, 33, 182);
        doc.text(item.avg.toFixed(2), 120, y + 9 + index * 7, { align: "right" });
      });
    }

    if (sections.actionPlan) {
      doc.setFillColor(250, 245, 255);
      doc.setDrawColor(221, 214, 254);
      doc.roundedRect(154, y - 6, 118, 44, 3, 3, "FD");
      doc.setFont("THSarabunNew", "bold");
      doc.setFontSize(16);
      doc.setTextColor(88, 28, 135);
      doc.text("Action Plan", 160, y + 3);
      doc.setFont("THSarabunNew", "normal");
      doc.setFontSize(12);
      doc.setTextColor(31, 41, 55);
      const targets = actionTargets.length ? actionTargets : lowTopics.slice(0, 2);
      targets.forEach((item, index) => {
        doc.text(`• โฟกัส ${truncateText(item.title, 45)} (${item.percent.toFixed(1)}%)`, 160, y + 12 + index * 8);
      });
    }

    doc.setFillColor(247, 245, 255);
    doc.setDrawColor(196, 181, 253);
    doc.roundedRect(16, 184, 266, 12, 4, 4, "FD");
    doc.setFont("THSarabunNew", "bold");
    doc.setFontSize(12);
    doc.setTextColor(49, 20, 99);
    doc.text(truncateText(slideSummary, 155), 20, 192);
    doc.save(`qa-performance-${selectedWeek.key}.pdf`);
    setStatusMessage("Export PDF แล้ว");
    window.setTimeout(() => setStatusMessage(""), 2200);
  }, [
    actionTargets,
    agentRows,
    criticalCount,
    currentAvg,
    currentCases.length,
    delta,
    goodTopics,
    lowTopics,
    previousCases.length,
    previousWeek,
    sections.actionPlan,
    sections.agentRanking,
    sections.topicPerformance,
    selectedWeek,
    slideSummary,
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f7f2ff] via-white to-[#fbf7ff] px-5 py-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(88,28,135,0.10)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">Performance Menu</div>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 lg:text-4xl">Presentation</h1>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                เลือกสัปดาห์ เทมเพลต และหัวข้อ เพื่อสร้างพรีวิวสไลด์ 1 หน้า จากข้อมูล QA ล่าสุด
              </p>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-900">
              <div className="font-black">ผู้ใช้งาน</div>
              <div>{currentUser.displayName || currentUser.username}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_1.5fr]">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">1. เลือก Week</span>
              <select
                value={selectedWeek?.key || ""}
                onChange={(event) => setSelectedWeekKey(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              >
                {weekBuckets.map((week) => (
                  <option key={week.key} value={week.key}>
                    {week.label} ({week.cases.length} เคส)
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">2. เลือก Template</span>
              <select
                value={template}
                onChange={(event) => setTemplate(event.target.value as TemplateKey)}
                className="mt-2 w-full rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              >
                {TEMPLATE_OPTIONS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-xs text-slate-500">{TEMPLATE_OPTIONS.find((item) => item.key === template)?.description}</div>
            </label>

            <div>
              <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">3. ติ๊กหัวข้อที่จะใส่ในสไลด์</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {SECTION_OPTIONS.map((item) => (
                  <label
                    key={item.key}
                    className={`flex cursor-pointer items-start gap-2 rounded-2xl border px-3 py-2 transition ${
                      sections[item.key] ? "border-violet-200 bg-violet-50 text-violet-950" : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={sections[item.key]}
                      onChange={() => toggleSection(item.key)}
                      className="mt-1 h-4 w-4 accent-violet-700"
                    />
                    <span>
                      <span className="block text-sm font-black">{item.label}</span>
                      <span className="block text-xs leading-4">{item.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{errorMessage}</div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(88,28,135,0.10)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">4. Preview สไลด์ 1 หน้า</div>
                <div className="mt-1 text-sm text-slate-500">สัดส่วน 16:9 สำหรับนำไปวางใน Presentation</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={!selectedWeek || loading}
                  className="rounded-2xl bg-violet-700 px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  5. Generate / Export PDF
                </button>
                <button
                  type="button"
                  onClick={handleCopySummary}
                  disabled={!selectedWeek || loading}
                  className="rounded-2xl border border-violet-200 bg-white px-4 py-2 text-sm font-black text-violet-800 transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  6. Copy Slide Summary
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[24px] border border-violet-100 bg-slate-100 p-3">
              <div className="h-[648px] w-[1152px] overflow-hidden rounded-[8px] bg-white">
                <div style={{ transform: "scale(0.72)", transformOrigin: "top left", width: 1600, height: 900 }}>
                  <DashboardStyleSlide
                    loading={loading}
                    selectedWeek={selectedWeek}
                    currentCases={currentCases}
                    currentAvg={currentAvg}
                    criticalCount={criticalCount}
                    grade={scoreToGrade(currentAvg)}
                    goodTopics={goodTopics}
                    lowTopics={lowTopics}
                    monthRows={monthRows}
                    sections={sections}
                  />
                </div>
              </div>
              <div className="hidden">
              <div className="h-[630px] w-[1120px] overflow-hidden rounded-[18px] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
                <div className="relative h-full w-full overflow-hidden p-9 text-slate-950">
                  <div className="absolute -left-[7%] -top-[10%] h-[26%] w-[28%] rounded-br-[90%] bg-[#9d1b9e]" />
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <div className="text-[13px] font-black uppercase tracking-[0.2em] text-violet-700">QA Presentation</div>
                      <h2 className="mt-2 text-[34px] font-black leading-none tracking-tight">
                        {template === "actionPlan" ? "สรุปแผนยกระดับคะแนน QA" : template === "topicFocus" ? "สรุป Topic Performance" : "สรุปผลการประเมิน QA รายสัปดาห์"}
                      </h2>
                      <p className="mt-3 text-[15px] font-semibold text-slate-500">{selectedWeek ? `Weekly ${selectedWeek.label}` : "กำลังโหลดข้อมูล"}</p>
                    </div>
                    <div className="rounded-full bg-violet-50 px-5 py-3 text-[14px] font-black text-violet-900">
                      ข้อมูลล่าสุด: {new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  </div>

                  {loading ? (
                    <div className="mt-24 text-center text-[22px] font-black text-violet-700">กำลังโหลดข้อมูล...</div>
                  ) : !selectedWeek ? (
                    <div className="mt-24 text-center text-[22px] font-black text-slate-500">ยังไม่มีข้อมูลสำหรับสร้างสไลด์</div>
                  ) : (
                    <>
                      {sections.kpiSummary ? (
                        <div className="mt-7 grid grid-cols-4 gap-4">
                          <SlideKpi label="จำนวนเคส" value={`${currentCases.length}`} sub={previousWeek ? `สัปดาห์ก่อน ${previousCases.length} เคส` : "ไม่มีข้อมูลเทียบ"} />
                          <SlideKpi label="คะแนนเฉลี่ย" value={currentAvg.toFixed(2)} sub={previousWeek ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} จากสัปดาห์ก่อน` : scoreToGrade(currentAvg)} green />
                          <SlideKpi label="Critical Error" value={`${criticalCount}`} sub={criticalCount ? "ต้องติดตาม" : "ไม่พบในสัปดาห์นี้"} />
                          <SlideKpi label="ภาพรวม" value={currentAvg >= 90 ? "ดีมาก" : currentAvg >= 80 ? "ดีขึ้น" : "ต้องโฟกัส"} sub={scoreToGrade(currentAvg)} green={currentAvg >= 80} />
                        </div>
                      ) : null}

                      <div className={`mt-5 grid gap-4 ${sections.agentRanking ? "grid-cols-[1.2fr_0.8fr]" : "grid-cols-1"}`}>
                        <div className="grid gap-4">
                          {sections.weekCompare ? (
                            <SlidePanel title="Week Compare" tone="violet">
                              <div className="grid grid-cols-3 gap-3 text-center">
                                <MiniMetric label="สัปดาห์ก่อน" value={previousWeek ? previousAvg.toFixed(2) : "-"} />
                                <MiniMetric label="สัปดาห์นี้" value={currentAvg.toFixed(2)} highlight />
                                <MiniMetric label="เปลี่ยนแปลง" value={previousWeek ? `${delta >= 0 ? "+" : ""}${delta.toFixed(2)}` : "-"} highlight={delta >= 0} />
                              </div>
                            </SlidePanel>
                          ) : null}

                          {sections.topicPerformance ? (
                            <div className="grid grid-cols-2 gap-4">
                              <SlideTopicList title="หัวข้อที่ทำได้ดี" tone="green" rows={goodTopics.slice(0, 4)} />
                              <SlideTopicList title="หัวข้อที่ควรเร่งปรับปรุง" tone="red" rows={lowTopics.slice(0, 4)} />
                            </div>
                          ) : null}
                        </div>

                        {sections.agentRanking ? (
                          <SlidePanel title="Agent Ranking" tone="violet">
                            <div className="space-y-2">
                              {agentRows.length ? (
                                agentRows.map((item, index) => (
                                  <div key={item.agent} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-[12px] font-black text-violet-800">{index + 1}</div>
                                    <div className="min-w-0 flex-1 text-[13px] font-black leading-tight">{truncateText(item.agent, 24)}</div>
                                    <div className="text-[16px] font-black text-violet-800">{item.avg.toFixed(1)}</div>
                                  </div>
                                ))
                              ) : (
                                <div className="text-[13px] text-slate-500">ยังไม่มีข้อมูล Agent</div>
                              )}
                            </div>
                          </SlidePanel>
                        ) : null}
                      </div>

                      {sections.actionPlan ? (
                        <div className="absolute bottom-5 left-9 right-9 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-4">
                          <div className="flex gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[24px] font-black text-violet-800">!</div>
                            <div className="min-w-0">
                              <div className="text-[15px] font-black text-violet-900">Action Plan</div>
                              <div className="mt-1 text-[14px] font-semibold leading-snug text-slate-700">
                                {actionTargets.length
                                  ? `โฟกัส ${actionTargets.map((item) => truncateText(item.title, 26)).join(", ")} พร้อมทบทวนตัวอย่างคำตอบคะแนนต่ำ`
                                  : "รักษามาตรฐานหัวข้อคะแนนดี และติดตามคุณภาพคำตอบในสัปดาห์ถัดไป"}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(88,28,135,0.10)]">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">Slide Summary</div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{slideSummary}</p>
              {statusMessage ? <div className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">{statusMessage}</div> : null}
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5">
              <div className="text-sm font-black text-slate-950">ข้อมูลที่ใช้</div>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <div className="flex justify-between gap-3"><span>ทั้งหมดที่มองเห็น</span><b>{scopedEvaluations.length} เคส</b></div>
                <div className="flex justify-between gap-3"><span>จำนวน Week</span><b>{weekBuckets.length}</b></div>
                <div className="flex justify-between gap-3"><span>Template</span><b>{TEMPLATE_OPTIONS.find((item) => item.key === template)?.label}</b></div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function DashboardStyleSlide({
  loading,
  selectedWeek,
  currentCases,
  currentAvg,
  criticalCount,
  grade,
  goodTopics,
  lowTopics,
  monthRows,
  sections,
}: {
  loading: boolean;
  selectedWeek?: WeekBucket;
  currentCases: StoredEvaluation[];
  currentAvg: number;
  criticalCount: number;
  grade: string;
  goodTopics: TopicRow[];
  lowTopics: TopicRow[];
  monthRows: MonthRow[];
  sections: Record<SectionKey, boolean>;
}) {
  const hasRealData = Boolean(selectedWeek && currentCases.length);
  const monthKey = selectedWeek ? formatMonthKey(selectedWeek.start) : "";
  const slideData = {
    cases: hasRealData ? currentCases.length : SAMPLE_WEEKLY_SLIDE_DATA.cases,
    averageScore: hasRealData ? currentAvg : SAMPLE_WEEKLY_SLIDE_DATA.averageScore,
    grade: hasRealData ? grade : SAMPLE_WEEKLY_SLIDE_DATA.grade,
    month: hasRealData && monthKey ? formatMonthLabelFromKey(monthKey) : SAMPLE_WEEKLY_SLIDE_DATA.month,
    week: hasRealData && selectedWeek ? selectedWeek.label : SAMPLE_WEEKLY_SLIDE_DATA.week,
    mergeRows: hasRealData ? currentCases.length : SAMPLE_WEEKLY_SLIDE_DATA.mergeRows,
    revised: SAMPLE_WEEKLY_SLIDE_DATA.revised,
  };
  const resolvedMonthRows = monthRows.length ? monthRows : SAMPLE_MONTH_ROWS;
  const realTopicRows = (goodTopics.length ? goodTopics : lowTopics).slice(0, 4);
  const topicRows = realTopicRows.length ? realTopicRows : SAMPLE_TOPIC_ROWS;
  const maxMonthCases = Math.max(...resolvedMonthRows.map((row) => row.cases), 1);
  const topCards = [
    { icon: "□", label: "Cases", value: String(slideData.cases) },
    { icon: "▤", label: "คะแนนเฉลี่ย", value: slideData.averageScore.toFixed(2) },
    { icon: "◎", label: "Grade", value: slideData.grade },
    { icon: "▦", label: "สัปดาห์", value: slideData.week, small: true },
  ];
  const insightRows = [
    `เดือน${slideData.month}: ${slideData.cases} เคส | คะแนนเฉลี่ย ${slideData.averageScore.toFixed(2)} | Grade ${slideData.grade}`,
    ...topicRows.map((item) => `${item.title}: ${item.percent.toFixed(2)}%`),
  ];
  if (criticalCount) insightRows.push(`Critical Error: ${criticalCount} เคส ต้องติดตามทันที`);

  return (
    <div className="relative h-[900px] w-[1600px] overflow-hidden rounded-[8px] border border-violet-100 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
      <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-[#4c1d95] via-[#8b2be8] to-[#c084fc]" />
      <div className="absolute -right-24 -top-28 h-[330px] w-[520px] rotate-12 rounded-[55%] bg-violet-200/55" />
      <div className="absolute -right-6 -top-8 h-[230px] w-[420px] rotate-12 rounded-[55%] bg-fuchsia-200/45" />
      <div className="absolute -bottom-32 -left-28 h-[260px] w-[430px] -rotate-12 rounded-[55%] bg-violet-300/45" />
      <div className="absolute right-24 top-[110px] grid grid-cols-7 gap-2 opacity-25">
        {Array.from({ length: 28 }).map((_, index) => (
          <span key={index} className="h-2 w-2 rounded-full bg-violet-500" />
        ))}
      </div>

      <div className="relative z-10 h-full p-9 text-slate-950">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[62px] font-black leading-none tracking-tight text-[#35126f]">สรุปภาพรวม QA Dashboard</h2>
            <div className="mt-3 text-[28px] font-semibold text-slate-900">Weekly Dashboard + Monthly Analytics</div>
          </div>
          <div className="mr-8 mt-3 rounded-full border border-violet-100 bg-white/90 px-8 py-4 text-[19px] font-black text-violet-900 shadow-sm">
            ข้อมูลล่าสุด: {new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>

        {loading ? (
          <div className="mt-40 text-center text-[24px] font-black text-violet-700">กำลังโหลดข้อมูล...</div>
        ) : (
          <div className="mt-4 grid gap-5">
            <div className="grid grid-cols-[940px_1fr] gap-6">
              <section className="rounded-[24px] border border-violet-100 bg-white/92 p-6 shadow-[0_14px_34px_rgba(88,28,135,0.12)]">
                <SlideRibbon index="1" label="Weekly Dashboard" />
                <div className="mt-4 rounded-[18px] border border-violet-100 bg-violet-50/40 p-5">
                  <div className="text-[15px] font-black text-slate-900">Current Viewing Scope</div>
                  <div className="mt-1 text-[12px] font-semibold text-slate-500">Selected tab and current data scope</div>
                  <div className="mt-5 grid grid-cols-5 gap-3">
                    <ScopeBox label="View" value="Weekly Dashboard" />
                    <ScopeBox label="Agent" value="All Agents" />
                    <ScopeBox label="Month" value={slideData.month} />
                    <ScopeBox label="Week" value={slideData.week} />
                    <ScopeBox label="Merge Rows" value={`${slideData.mergeRows}`} />
                  </div>
                </div>

                {sections.kpiSummary ? (
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <DashboardMiniKpi label="Cases" value={`${slideData.cases}`} sub="Case(s) in current view" />
                    <DashboardMiniKpi label="Average Score" value={slideData.averageScore.toFixed(2)} sub="Average final score in current view" highlight />
                    <DashboardMiniKpi label="Grade" value={slideData.grade} sub="Calculated from current average score" blue />
                  </div>
                ) : null}

                <div className="mt-4 rounded-[18px] border border-violet-100 bg-white p-4">
                  <div className="text-[16px] font-black text-slate-900">Summary Table</div>
                  <div className="mt-1 text-[12px] font-semibold text-slate-500">Summary result based on current tab and filters</div>
                  <div className="mt-4 overflow-hidden rounded-xl border border-violet-100">
                    <div className="grid grid-cols-[1.6fr_0.8fr_1fr_0.8fr] bg-[#35126f] px-4 py-3 text-[14px] font-black text-white">
                      <div>Week</div>
                      <div className="text-center">Cases</div>
                      <div className="text-center">Average Score</div>
                      <div className="text-center">Grade</div>
                    </div>
                    <div className="grid grid-cols-[1.6fr_0.8fr_1fr_0.8fr] px-4 py-3 text-[15px] font-bold text-slate-900">
                      <div>{slideData.week}</div>
                      <div className="text-center">{slideData.cases}</div>
                      <div className="text-center">{slideData.averageScore.toFixed(2)}</div>
                      <div className="text-center"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{slideData.grade}</span></div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-4">
                {sections.kpiSummary ? (
                  <div className="grid grid-cols-2 gap-5">
                    {topCards.map((item) => (
                      <RightKpi key={item.label} icon={item.icon} label={item.label} value={item.value} small={item.small} />
                    ))}
                  </div>
                ) : null}
                <div className="rounded-[20px] border border-violet-100 bg-white/92 p-6 shadow-[0_12px_30px_rgba(88,28,135,0.10)]">
                  <div className="flex items-center gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#35126f] text-2xl text-white">☆</span>
                    <div className="text-[22px] font-black text-[#35126f]">สรุปไฮไลต์</div>
                  </div>
                  <ul className="mt-5 space-y-2 pl-8 text-[17px] font-semibold leading-snug text-slate-950">
                    {insightRows.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </section>
            </div>

            <div className="grid grid-cols-[760px_1fr] gap-6">
              <section className="rounded-[24px] border border-violet-100 bg-white/92 p-6 shadow-[0_14px_34px_rgba(88,28,135,0.12)]">
                <SlideRibbon index="2" label="Monthly Analytics / Topic Performance" />
                <div className="mt-4 text-[20px] font-black text-slate-950">Monthly Analytics</div>
                <div className="text-[12px] font-semibold text-slate-500">Last 3 months for tracking monthly score movement</div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <ScopeBox label="Visible Rows" value={`${resolvedMonthRows.length}`} />
                  <ScopeBox label="Total Cases" value={`${resolvedMonthRows.reduce((sum, item) => sum + item.cases, 0)}`} blue />
                  <ScopeBox label="Zero Case Rows" value="0" green />
                </div>
                <div className="mt-4 overflow-hidden rounded-xl border border-violet-100">
                  <div className="grid grid-cols-[1.4fr_0.7fr_0.9fr_0.6fr_1fr] bg-slate-950 px-4 py-3 text-[13px] font-black uppercase tracking-[0.08em] text-white">
                    <div>Month</div><div className="text-center">Cases</div><div className="text-center">Average</div><div className="text-center">Grade</div><div className="text-center">Progress</div>
                  </div>
                  {resolvedMonthRows.map((row) => (
                    <div key={row.key} className="grid grid-cols-[1.4fr_0.7fr_0.9fr_0.6fr_1fr] items-center border-t border-slate-100 px-4 py-3 text-[15px] font-bold text-slate-900">
                      <div>{row.label}</div>
                      <div className="text-center">{row.cases}</div>
                      <div className="text-center">{row.avg.toFixed(2)}</div>
                      <div className="text-center"><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{row.grade}</span></div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-violet-100"><div className="h-full rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-500" style={{ width: `${Math.max(8, (row.cases / maxMonthCases) * 100)}%` }} /></div>
                        <span className="w-8 text-right text-[10px] text-slate-500">{row.cases}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[24px] border border-violet-100 bg-white/92 p-6 shadow-[0_14px_34px_rgba(88,28,135,0.12)]">
                <div className="text-[20px] font-black text-slate-950">Topic Performance</div>
                <div className="text-[12px] font-semibold text-slate-500">Average topic score in current view</div>
                <div className="mt-4 overflow-hidden rounded-xl border border-violet-100">
                  <div className="grid grid-cols-[0.5fr_2.2fr_0.9fr_0.7fr_0.8fr] bg-[#35126f] px-4 py-3 text-[13px] font-black text-white">
                    <div className="text-center">Topic</div><div>Description</div><div className="text-center">Avg Score</div><div className="text-center">Max</div><div className="text-center">Avg %</div>
                  </div>
                  {(sections.topicPerformance ? topicRows.slice(0, 4) : []).map((row, index) => (
                    <div key={row.id} className="grid grid-cols-[0.5fr_2.2fr_0.9fr_0.7fr_0.8fr] border-t border-slate-100 px-4 py-3 text-[15px] font-bold text-slate-900">
                      <div className="text-center">{index + 1}</div>
                      <div>{truncateText(row.title, 48)}</div>
                      <div className="text-center">{row.score.toFixed(2)}</div>
                      <div className="text-center">{row.max.toFixed(0)}</div>
                      <div className="text-center">{row.percent.toFixed(2)}%</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SlideRibbon({ index, label }: { index: string; label: string }) {
  return (
    <div className="-ml-6 -mt-6 inline-flex min-w-[250px] items-center gap-4 rounded-br-2xl rounded-tl-[22px] bg-gradient-to-r from-[#35126f] to-[#9d3df2] px-6 py-3 text-white">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[18px] font-black text-[#35126f]">{index}</span>
      <span className="text-[22px] font-black">{label}</span>
    </div>
  );
}

function ScopeBox({ label, value, blue = false, green = false }: { label: string; value: string; blue?: boolean; green?: boolean }) {
  const labelColor = green ? "text-emerald-600" : blue ? "text-sky-600" : "text-violet-700";
  return (
    <div className="min-w-0 rounded-xl border border-violet-100 bg-white px-4 py-3">
      <div className={`text-[12px] font-black uppercase ${labelColor}`}>{label}</div>
      <div className="mt-1 text-[15px] font-black leading-tight text-slate-950">{value}</div>
    </div>
  );
}

function DashboardMiniKpi({ label, value, sub, highlight = false, blue = false }: { label: string; value: string; sub: string; highlight?: boolean; blue?: boolean }) {
  const valueColor = blue ? "text-sky-700" : highlight ? "text-violet-700" : "text-slate-950";
  return (
    <div className="rounded-[18px] border border-violet-100 bg-white px-6 py-4">
      <div className="text-[15px] font-bold text-slate-500">{label}</div>
      <div className={`mt-2 text-[42px] font-black leading-none ${valueColor}`}>{value}</div>
      <div className="mt-2 text-[12px] font-semibold text-slate-500">{sub}</div>
    </div>
  );
}

function RightKpi({ icon, label, value, small = false }: { icon: string; label: string; value: string; small?: boolean }) {
  return (
    <div className="flex min-h-[90px] items-center gap-5 rounded-[20px] border border-violet-100 bg-white/92 px-6 py-4 shadow-[0_10px_24px_rgba(88,28,135,0.08)]">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-700 to-[#35126f] text-2xl font-black text-white">{icon}</div>
      <div className="min-w-0">
        <div className="text-[17px] font-semibold text-slate-900">{label}</div>
        <div className={`mt-1 font-black leading-none text-slate-950 ${small ? "text-[17px]" : "text-[30px]"}`}>{value}</div>
      </div>
    </div>
  );
}

function SlideKpi({ label, value, sub, green = false }: { label: string; value: string; sub: string; green?: boolean }) {
  return (
    <div className="rounded-2xl border border-violet-100 bg-white px-4 py-3 shadow-[0_12px_28px_rgba(88,28,135,0.08)]">
      <div className="text-[13px] font-black text-slate-700">{label}</div>
      <div className={`mt-1 text-[32px] font-black leading-none ${green ? "text-emerald-700" : "text-violet-800"}`}>{value}</div>
      <div className="mt-2 text-[12px] font-semibold text-slate-500">{sub}</div>
    </div>
  );
}

function MiniMetric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <div className={`mt-1 text-[21px] font-black ${highlight ? "text-violet-800" : "text-slate-800"}`}>{value}</div>
    </div>
  );
}

function SlidePanel({ title, tone, children }: { title: string; tone: "violet" | "green" | "red"; children: React.ReactNode }) {
  const toneClass =
    tone === "green"
      ? "border-emerald-100 bg-emerald-50/70 text-emerald-900"
      : tone === "red"
        ? "border-rose-100 bg-rose-50/70 text-rose-900"
        : "border-violet-100 bg-violet-50/70 text-violet-950";
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="mb-3 text-[16px] font-black">{title}</div>
      {children}
    </div>
  );
}

function SlideTopicList({ title, tone, rows }: { title: string; tone: "green" | "red"; rows: TopicRow[] }) {
  const color = tone === "green" ? "text-emerald-700 bg-emerald-50 border-emerald-100" : "text-rose-700 bg-rose-50 border-rose-100";
  return (
    <SlidePanel title={title} tone={tone}>
      <div className="space-y-2">
        {rows.length ? (
          rows.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-black ${color}`}>{index + 1}</div>
              <div className="min-w-0 flex-1 text-[13px] font-black leading-tight">{truncateText(item.title, 32)}</div>
              <div className={`text-[15px] font-black ${tone === "green" ? "text-emerald-700" : "text-rose-700"}`}>{item.percent.toFixed(1)}%</div>
            </div>
          ))
        ) : (
          <div className="text-[13px] text-slate-500">ยังไม่มีข้อมูลหัวข้อ</div>
        )}
      </div>
    </SlidePanel>
  );
}
