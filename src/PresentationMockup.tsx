import { useEvaluationActivity, EvaluationActivityUnavailable } from "./EvaluationActivityContext";
import { evaluationActivityMonth, evaluationScopeHold } from "./evaluationActivity";
import { assertEvaluationScopeComplete } from "./evaluationEditingStore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchStoredEvaluations, excludeTestEvaluations, isNoCaseEvaluation, StoredEvaluation } from "./evaluationStore";
import { getIncentiveByScore, scoreToGrade } from "./lib/scoreIncentivePolicy";
import PageHero from "./PageHero";

type CurrentUser = { username: string; displayName: string; role: string; agentName: string };
type PresentationMockupProps = {
  currentUser: CurrentUser;
  roleScopedAgentNames?: string[];
  dataRefreshKey?: number;
  reportCenter?: boolean;
  reportExportOnly?: boolean;
};
type WeekBucket = { key: string; label: string; start: Date; end: Date; cases: StoredEvaluation[] };
type TopicRow = { id: string; code: string; title: string; score: number; max: number; percent: number; cases: number };
type TagRate = { name: string; count: number; percent: number };
type TopicComparison = {
  id: string;
  code: string;
  title: string;
  previousPercent: number;
  currentPercent: number;
  changePercent: number | null;
  tags: TagRate[];
};

const COLORS = {
  navy: "142B4D", purple: "5B35C9", purpleDark: "4A178B", purpleSoft: "F6F3FD",
  purpleLight: "9C7CE7", green: "009B76", red: "C23B5A", panel: "F6F6FB",
  border: "DCE3EE", muted: "596D8B", white: "FFFFFF",
};
const KPI_TARGET = 85;
const MONTHLY_CASE_TARGET = 10;

function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function normalizeText(value: string) { return clean(value).toLowerCase(); }
function agentKey(value: string) { return normalizeText(value).replace(/[^a-z0-9ก-๙]/gi, ""); }

function parseAuditDate(value: string) {
  const text = clean(value);
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
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  copy.setHours(0, 0, 0, 0);
  return copy;
}
function addDays(date: Date, days: number) { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; }
function formatIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function formatMonthKey(date: Date) { return formatIsoDate(date).slice(0, 7); }
function formatThaiShortDate(date: Date) { return date.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }); }
function formatWeekLabel(start: Date, end: Date) { return `${formatThaiShortDate(start)} - ${formatThaiShortDate(end)}`; }
function scoreOf(item: StoredEvaluation) { const score = Number(item.finalScore); return Number.isFinite(score) ? score : 0; }
function avgScore(items: StoredEvaluation[]) { return items.length ? items.reduce((sum, item) => sum + scoreOf(item), 0) / items.length : 0; }
function percentOf(score: number, max: number) { return max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0; }
function truncateText(text: string, max = 48) { const value = clean(text); return value.length <= max ? value : `${value.slice(0, max - 1).trim()}…`; }
function caseAgentName(item: StoredEvaluation) { return clean(item.targetDisplayName || item.agentName || item.targetUsername) || "ไม่ระบุ Agent"; }
function caseTeamName(item: StoredEvaluation) {
  const preview = item.rawDataPreview || {};
  return clean(preview.Team || preview["Team Name"] || preview["Agent Team"] || preview["ทีม"] || "Unassigned Team");
}
function reviewStatusOf(item: StoredEvaluation) {
  const preview = item.rawDataPreview || {};
  const raw = [preview["Review Status"], preview["Latest Appeal Status"], preview["Data Source"], preview["Appeal Status"]].map(clean).join(" ").toLowerCase();
  return /revised|appeal[_\s-]?approved|approved appeal/.test(raw) ? "Revised" : "Original";
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
    if (existing) existing.cases.push(item);
    else map.set(key, { key, label: formatWeekLabel(start, end), start, end, cases: [item] });
  });
  return Array.from(map.values()).sort((left, right) => right.start.getTime() - left.start.getTime());
}
function topicKey(code: string, title: string) { return clean(code) || normalizeText(title); }
function topicOrder(code: string, title: string) { const match = `${code} ${title}`.match(/\d+/); return match ? Number(match[0]) : 999; }
function buildTopicRows(cases: StoredEvaluation[]) {
  const map = new Map<string, TopicRow>();
  cases.forEach((item) => (item.topics || []).forEach((topic) => {
    const title = clean(topic.title || topic.code) || "ไม่ระบุหัวข้อ";
    const code = clean(topic.code);
    const id = topicKey(code, title);
    const row = map.get(id) || { id, code, title, score: 0, max: 0, percent: 0, cases: 0 };
    row.score += Number(topic.score) || 0;
    row.max += Number(topic.max) || 0;
    row.cases += 1;
    row.percent = percentOf(row.score, row.max);
    map.set(id, row);
  }));
  return Array.from(map.values()).filter((row) => row.max > 0).sort((left, right) => topicOrder(left.code, left.title) - topicOrder(right.code, right.title));
}
function buildTagRates(cases: StoredEvaluation[], topicId: string) {
  const counts = new Map<string, number>();
  cases.forEach((item) => {
    const topic = (item.topics || []).find((candidate) => topicKey(candidate.code, candidate.title) === topicId);
    if (!topic) return;
    const tags = (topic.issueTags?.length ? topic.issueTags : (topic.deductions || []).filter((entry) => Number(entry.points) > 0).map((entry) => entry.subtopic)).map(clean).filter(Boolean);
    new Set(tags).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  return Array.from(counts.entries()).map(([name, count]) => ({ name, count, percent: cases.length ? (count / cases.length) * 100 : 0 })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "th"));
}
function buildTopicComparisons(currentCases: StoredEvaluation[], comparisonCases: StoredEvaluation[]) {
  const currentRows = buildTopicRows(currentCases);
  const comparisonRows = buildTopicRows(comparisonCases);
  const currentMap = new Map(currentRows.map((row) => [row.id, row]));
  const comparisonMap = new Map(comparisonRows.map((row) => [row.id, row]));
  const ids = Array.from(new Set([...currentRows.map((row) => row.id), ...comparisonRows.map((row) => row.id)]));
  return ids.map((id) => {
    const current = currentMap.get(id);
    const previous = comparisonMap.get(id);
    const currentPercent = current?.percent || 0;
    const previousPercent = previous?.percent || 0;
    return {
      id, code: current?.code || previous?.code || "", title: current?.title || previous?.title || "ไม่ระบุหัวข้อ",
      previousPercent, currentPercent,
      changePercent: previousPercent > 0 ? ((currentPercent - previousPercent) / previousPercent) * 100 : null,
      tags: buildTagRates(currentCases, id),
    } satisfies TopicComparison;
  }).sort((left, right) => topicOrder(left.code, left.title) - topicOrder(right.code, right.title)).slice(0, 4);
}
function gradeMix(cases: StoredEvaluation[], monthKey: string) {
  const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0, G: 0 };
  cases.forEach((item) => {
    const grade = clean(item.grade).toUpperCase() || scoreToGrade(scoreOf(item), monthKey, item.criticalError);
    counts[grade] = (counts[grade] || 0) + 1;
  });
  return counts;
}
function totalIncentive(cases: StoredEvaluation[], monthKey: string) {
  const groups = new Map<string, StoredEvaluation[]>();
  cases.forEach((item) => { const agent = caseAgentName(item); groups.set(agent, [...(groups.get(agent) || []), item]); });
  return Array.from(groups.values()).reduce((sum, rows) => rows.length < MONTHLY_CASE_TARGET ? sum : sum + getIncentiveByScore(avgScore(rows), monthKey, rows.some((row) => row.criticalError)).cash, 0);
}
async function imageUrlToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`โหลดโลโก้ไม่สำเร็จ (${response.status})`);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("อ่านไฟล์โลโก้ไม่สำเร็จ"));
    reader.readAsDataURL(blob);
  });
}

export default function PresentationMockup({ currentUser, roleScopedAgentNames, dataRefreshKey = 0, reportCenter = false, reportExportOnly = false }: PresentationMockupProps) {
  const evaluationActivity = useEvaluationActivity();
  const [evaluations, setEvaluations] = useState<StoredEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [selectedWeekKey, setSelectedWeekKey] = useState("");
  const [comparisonWeekKey, setComparisonWeekKey] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState("all");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErrorMessage("");
    fetchStoredEvaluations(1000).then((rows) => { if (alive) setEvaluations(excludeTestEvaluations(rows).filter((item) => !isNoCaseEvaluation(item))); }).catch((error) => {
      console.warn("Load presentation evaluations failed", error);
      if (alive) setErrorMessage("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [dataRefreshKey]);

  const roleScopedEvaluations = useMemo(() => {
    if (!roleScopedAgentNames?.length) return evaluations;
    const allowed = new Set(roleScopedAgentNames.map(agentKey).filter(Boolean));
    return allowed.size ? evaluations.filter((item) => [item.agentName, item.targetDisplayName, item.targetUsername].map(agentKey).some((name) => allowed.has(name))) : evaluations;
  }, [evaluations, roleScopedAgentNames]);
  const weekBuckets = useMemo(() => buildWeekBuckets(roleScopedEvaluations), [roleScopedEvaluations]);
  useEffect(() => { if (!selectedWeekKey && weekBuckets[0]) setSelectedWeekKey(weekBuckets[0].key); }, [selectedWeekKey, weekBuckets]);
  useEffect(() => {
    const currentIndex = weekBuckets.findIndex((week) => week.key === selectedWeekKey);
    const suggested = weekBuckets[currentIndex + 1] || weekBuckets.find((week) => week.key !== selectedWeekKey);
    const valid = weekBuckets.some((week) => week.key === comparisonWeekKey && week.key !== selectedWeekKey);
    if (!valid) setComparisonWeekKey(suggested?.key || "");
  }, [comparisonWeekKey, selectedWeekKey, weekBuckets]);

  const teamOptions = useMemo<string[]>(() => Array.from(new Set<string>(roleScopedEvaluations.map(caseTeamName))).sort((a, b) => a.localeCompare(b, "th")), [roleScopedEvaluations]);
  const agentOptions = useMemo<string[]>(() => Array.from(new Set<string>(roleScopedEvaluations.filter((item) => selectedTeam === "all" || caseTeamName(item) === selectedTeam).map(caseAgentName))).sort((a, b) => a.localeCompare(b, "th")), [roleScopedEvaluations, selectedTeam]);
  useEffect(() => { if (selectedAgent !== "all" && !agentOptions.includes(selectedAgent)) setSelectedAgent("all"); }, [agentOptions, selectedAgent]);

  const selectedWeek = useMemo(() => weekBuckets.find((week) => week.key === selectedWeekKey), [selectedWeekKey, weekBuckets]);
  const comparisonWeek = useMemo(() => weekBuckets.find((week) => week.key === comparisonWeekKey), [comparisonWeekKey, weekBuckets]);
  const inScope = useCallback((item: StoredEvaluation) => (selectedTeam === "all" || caseTeamName(item) === selectedTeam) && (selectedAgent === "all" || caseAgentName(item) === selectedAgent), [selectedAgent, selectedTeam]);
  const currentCases = useMemo(() => (selectedWeek?.cases || []).filter(inScope), [inScope, selectedWeek]);
  const comparisonCases = useMemo(() => (comparisonWeek?.cases || []).filter(inScope), [comparisonWeek, inScope]);
  const currentAverage = avgScore(currentCases);
  const comparisonAverage = avgScore(comparisonCases);
  const weekChange = comparisonAverage > 0 ? ((currentAverage - comparisonAverage) / comparisonAverage) * 100 : null;
  const currentMonthKey = selectedWeek ? formatMonthKey(selectedWeek.start) : "";
  const overallGrade = scoreToGrade(currentAverage, currentMonthKey, currentCases.some((item) => item.criticalError));
  const agentCount = new Set(currentCases.map(caseAgentName)).size;
  const incentive = totalIncentive(currentCases, currentMonthKey);
  const reviewCounts = useMemo(() => { const revised = currentCases.filter((item) => reviewStatusOf(item) === "Revised").length; return { original: currentCases.length - revised, revised }; }, [currentCases]);
  const grades = useMemo(() => gradeMix(currentCases, currentMonthKey), [currentCases, currentMonthKey]);
  const topics = useMemo(() => buildTopicComparisons(currentCases, comparisonCases), [comparisonCases, currentCases]);
  const scoreAgents = useMemo(() => { const names = [...currentCases, ...comparisonCases].map(caseAgentName); return names.length ? Array.from(new Set(names)) : roleScopedAgentNames || []; }, [comparisonCases, currentCases, roleScopedAgentNames]);
  const scoreMonths = useMemo(() => Array.from(new Set([...currentCases, ...comparisonCases].map(evaluationActivityMonth).filter(Boolean))), [comparisonCases, currentCases]);
  const evaluationHold = evaluationScopeHold(evaluationActivity, scoreAgents, scoreMonths);
  const scopeLabel = selectedAgent !== "all" ? selectedAgent : selectedTeam !== "all" ? selectedTeam : "All Teams / All Agents";

  const handleExportPptx = useCallback(async () => {
    if (!selectedWeek || !comparisonWeek || !currentCases.length) return;
    try {
      setExporting(true);
      setStatusMessage("กำลังสร้าง PowerPoint...");
      await assertEvaluationScopeComplete(scoreAgents, scoreMonths);
      const [{ default: PptxGenJS }, logoData] = await Promise.all([import("pptxgenjs"), imageUrlToDataUrl("/robinhood-logo.png")]);
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      pptx.author = currentUser.displayName || currentUser.username || "QA Dashboard";
      pptx.company = "Robinhood";
      pptx.subject = "QA Weekly Comparison";
      pptx.title = `QA Weekly Comparison ${comparisonWeek.label} vs ${selectedWeek.label}`;
      pptx.theme = { headFontFace: "Kanit", bodyFontFace: "Kanit" };

      const slide = pptx.addSlide();
      slide.background = { color: COLORS.white };
      const shape = pptx.ShapeType;
      const addText = (text: string, options: Record<string, unknown>) => slide.addText(text, { fontFace: "Kanit", color: COLORS.navy, lang: "th-TH", margin: 0, fit: "shrink", valign: "middle", ...options });
      const addPanel = (x: number, y: number, w: number, h: number) => slide.addShape(shape.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: COLORS.white }, line: { color: COLORS.border, width: 0.8 } });

      slide.addShape(shape.rect, { x: 0.44, y: 0.25, w: 0.045, h: 0.48, fill: { color: COLORS.purple }, line: { color: COLORS.purple } });
      addText("QA Weekly Comparison", { x: 0.62, y: 0.24, w: 6.4, h: 0.32, fontSize: 22, bold: true });
      addText(`${scopeLabel} | ${comparisonWeek.label} เทียบกับ ${selectedWeek.label}`, { x: 0.62, y: 0.58, w: 7.6, h: 0.18, fontSize: 8.5, color: COLORS.muted });
      slide.addImage({ data: logoData, x: 11.48, y: 0.27, w: 1.12, h: 0.32 });
      addText("QA PERFORMANCE REVIEW", { x: 10.98, y: 0.61, w: 1.95, h: 0.15, fontSize: 6.5, color: COLORS.muted, align: "right" });

      const kpis = [
        { label: "TOTAL CASES", value: `${currentCases.length}`, note: selectedWeek.label, accent: COLORS.purple },
        { label: "AVERAGE SCORE", value: `${currentAverage.toFixed(2)}%`, note: `KPI TARGET ${KPI_TARGET}%`, accent: COLORS.green },
        { label: "OVERALL GRADE", value: overallGrade, note: selectedAgent === "all" ? "ALL AGENTS" : selectedAgent, accent: COLORS.purple },
        { label: "AGENTS EVALUATED", value: `${agentCount}`, note: agentCount ? `${(currentCases.length / agentCount).toFixed(2)} CASES / AGENT` : "0 CASES / AGENT", accent: COLORS.purple },
        { label: "TOTAL INCENTIVE", value: `฿${incentive.toLocaleString("en-US")}`, note: "THB", accent: COLORS.purple },
      ];
      const cardGap = 0.11;
      const cardW = (12.43 - cardGap * 4) / 5;
      kpis.forEach((item, index) => {
        const x = 0.45 + index * (cardW + cardGap);
        addPanel(x, 0.92, cardW, 0.72);
        slide.addShape(shape.line, { x: x + 0.02, y: 0.93, w: cardW - 0.04, h: 0, line: { color: item.accent, width: 2 } });
        addText(item.label, { x: x + 0.14, y: 1.03, w: cardW - 0.28, h: 0.13, fontSize: 7.5, bold: true, color: COLORS.muted });
        addText(item.value, { x: x + 0.14, y: 1.20, w: cardW * 0.58, h: 0.25, fontSize: index === 1 ? 19 : 18, bold: true, color: index === 1 ? COLORS.green : COLORS.navy });
        addText(item.note, { x: x + cardW * 0.50, y: 1.27, w: cardW * 0.42, h: 0.14, fontSize: 6.1, color: COLORS.muted, align: "right" });
      });

      addPanel(0.45, 1.78, 7.54, 1.08);
      addText("WEEK-OVER-WEEK SCORE", { x: 0.62, y: 1.90, w: 3.2, h: 0.18, fontSize: 10.5, bold: true });
      [
        { label: comparisonWeek.label, value: comparisonAverage, color: COLORS.purpleLight, y: 2.20 },
        { label: selectedWeek.label, value: currentAverage, color: COLORS.purple, y: 2.53 },
      ].forEach((row) => {
        addText(row.label, { x: 0.62, y: row.y - 0.04, w: 1.20, h: 0.16, fontSize: 7.4, color: COLORS.muted });
        slide.addShape(shape.roundRect, { x: 1.80, y: row.y, w: 3.42, h: 0.10, rectRadius: 0.05, fill: { color: "E8EAF1" }, line: { color: "E8EAF1" } });
        slide.addShape(shape.roundRect, { x: 1.80, y: row.y, w: Math.max(0.10, 3.42 * Math.min(100, row.value) / 100), h: 0.10, rectRadius: 0.05, fill: { color: row.color }, line: { color: row.color } });
        addText(`${row.value.toFixed(2)}%`, { x: 5.30, y: row.y - 0.07, w: 0.85, h: 0.20, fontSize: 10.3, bold: true, align: "right" });
      });
      const changePositive = weekChange !== null && weekChange >= 0;
      slide.addShape(shape.roundRect, { x: 6.35, y: 2.17, w: 1.38, h: 0.44, rectRadius: 0.07, fill: { color: changePositive ? "E9F7F1" : "FBECEF" }, line: { color: changePositive ? "E9F7F1" : "FBECEF" } });
      addText(weekChange === null ? "ไม่มีข้อมูลเทียบ" : `${weekChange >= 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(weekChange).toFixed(2)}%`, { x: 6.43, y: 2.28, w: 1.22, h: 0.20, fontSize: 11, bold: true, color: changePositive ? COLORS.green : COLORS.red, align: "center" });

      addPanel(8.12, 1.78, 4.76, 1.08);
      addText("REVIEW STATUS & GRADE MIX", { x: 8.28, y: 1.90, w: 2.9, h: 0.18, fontSize: 10.5, bold: true });
      const originalPct = currentCases.length ? (reviewCounts.original / currentCases.length) * 100 : 0;
      const revisedPct = currentCases.length ? (reviewCounts.revised / currentCases.length) * 100 : 0;
      addText(`Original ${reviewCounts.original} เคส (${originalPct.toFixed(2)}%)`, { x: 8.28, y: 2.18, w: 2.1, h: 0.16, fontSize: 7.4, bold: true, color: COLORS.purple });
      addText(`Revised ${reviewCounts.revised} เคส (${revisedPct.toFixed(2)}%)`, { x: 10.42, y: 2.18, w: 2.25, h: 0.16, fontSize: 7.4, bold: true, color: COLORS.muted, align: "right" });
      slide.addShape(shape.line, { x: 8.28, y: 2.42, w: 4.38, h: 0, line: { color: COLORS.border, width: 0.8 } });
      addText("Grade Mix", { x: 8.28, y: 2.53, w: 1.0, h: 0.16, fontSize: 7.2, bold: true, color: COLORS.muted });
      addText(["A", "B", "C", "D", "F", "G"].map((grade) => `${grade} ${grades[grade] || 0}`).join("    "), { x: 10.06, y: 2.53, w: 2.60, h: 0.16, fontSize: 7.1, bold: true, align: "right" });

      addText("TOPIC PERFORMANCE", { x: 0.45, y: 3.04, w: 2.7, h: 0.20, fontSize: 11.5, bold: true });
      addText(`ประเด็นข้อผิดพลาดที่ตรวจพบ (% ของเคสทั้งหมด ${currentCases.length} เคส)`, { x: 8.68, y: 3.07, w: 4.20, h: 0.16, fontSize: 6.8, color: COLORS.muted, align: "right" });

      const topicCardW = 6.13;
      Array.from({ length: 4 }).forEach((_, index) => {
        const topic = topics[index];
        const x = index % 2 === 0 ? 0.45 : 6.75;
        const y = index < 2 ? 3.34 : 5.02;
        addPanel(x, y, topicCardW, 1.55);
        if (!topic) {
          addText("NO TOPIC DATA", { x: x + 0.20, y: y + 0.66, w: topicCardW - 0.40, h: 0.20, fontSize: 8, bold: true, color: COLORS.muted, align: "center" });
          return;
        }
        slide.addShape(shape.roundRect, { x: x + 0.14, y: y + 0.13, w: 0.34, h: 0.25, rectRadius: 0.04, fill: { color: COLORS.purpleSoft }, line: { color: COLORS.purpleSoft } });
        addText(String(index + 1).padStart(2, "0"), { x: x + 0.14, y: y + 0.16, w: 0.34, h: 0.13, fontSize: 7.8, bold: true, color: COLORS.purple, align: "center" });
        addText(truncateText(topic.title, 62), { x: x + 0.56, y: y + 0.13, w: topicCardW - 0.72, h: 0.24, fontSize: 10.6, bold: true });
        slide.addShape(shape.roundRect, { x: x + 0.14, y: y + 0.43, w: topicCardW - 0.28, h: 0.25, rectRadius: 0.03, fill: { color: COLORS.panel }, line: { color: COLORS.panel } });
        addText(`${comparisonWeek.label}  ${topic.previousPercent.toFixed(2)}%`, { x: x + 0.22, y: y + 0.47, w: 2.26, h: 0.13, fontSize: 7.2, bold: true });
        addText(`${selectedWeek.label}  ${topic.currentPercent.toFixed(2)}%`, { x: x + 2.55, y: y + 0.47, w: 2.12, h: 0.13, fontSize: 7.2, bold: true, color: COLORS.purple });
        const topicPositive = topic.changePercent !== null && topic.changePercent >= 0;
        const topicChangeText = topic.changePercent === null ? "ไม่มีข้อมูลเทียบ" : `${topic.changePercent >= 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(topic.changePercent).toFixed(2)}%`;
        addText(topicChangeText, { x: x + 4.58, y: y + 0.47, w: 1.30, h: 0.13, fontSize: 7.2, bold: true, color: topicPositive ? COLORS.green : COLORS.red, align: "right" });
        const visibleTags = topic.tags.length ? topic.tags.slice(0, 6) : [{ name: "ไม่พบข้อผิดพลาด", count: 0, percent: 0 }];
        visibleTags.forEach((tag, tagIndex) => {
          const tagY = y + 0.75 + tagIndex * 0.12;
          addText(truncateText(tag.name, 64), { x: x + 0.20, y: tagY, w: topicCardW - 1.12, h: 0.11, fontSize: tagIndex === 0 ? 7.1 : 6.5, bold: tagIndex === 0, color: tagIndex === 0 ? COLORS.navy : COLORS.muted });
          addText(`${tag.percent.toFixed(2)}%`, { x: x + topicCardW - 0.90, y: tagY, w: 0.68, h: 0.11, fontSize: tagIndex === 0 ? 7.1 : 6.5, bold: tagIndex === 0, color: tagIndex === 0 ? COLORS.purple : COLORS.muted, align: "right" });
        });
      });

      slide.addShape(shape.line, { x: 0.45, y: 7.20, w: 12.43, h: 0, line: { color: COLORS.border, width: 0.8 } });
      addText(`ข้อผิดพลาดแต่ละประเภท (%) = สัดส่วนเคสจาก ${currentCases.length} เคส (1 เคสพบได้หลายประเภท)  |  % การเปลี่ยนแปลงเทียบกับสัปดาห์ก่อน`, { x: 0.45, y: 7.24, w: 9.4, h: 0.12, fontSize: 5.8, color: COLORS.muted });
      slide.addImage({ data: logoData, x: 11.80, y: 7.17, w: 0.26, h: 0.12 });
      addText("Robinhood Quality Assurance", { x: 12.08, y: 7.22, w: 0.80, h: 0.10, fontSize: 4.8, color: COLORS.muted, align: "right" });

      await assertEvaluationScopeComplete(scoreAgents, scoreMonths);
      await pptx.writeFile({ fileName: `QA_Weekly_Comparison_${comparisonWeek.key}_vs_${selectedWeek.key}.pptx`, compression: true });
      setStatusMessage("ดาวน์โหลด PowerPoint แล้ว");
    } catch (error) {
      console.error("Generate QA PowerPoint failed", error);
      setStatusMessage(error instanceof Error ? `สร้าง PowerPoint ไม่สำเร็จ: ${error.message}` : "สร้าง PowerPoint ไม่สำเร็จ กรุณาลองใหม่");
    } finally { setExporting(false); }
  }, [comparisonAverage, comparisonWeek, currentAverage, currentCases, currentUser.displayName, currentUser.username, grades, incentive, agentCount, overallGrade, reviewCounts, scopeLabel, scoreAgents, scoreMonths, selectedAgent, selectedWeek, topics, weekChange]);

  const controls = (
    <div className="grid gap-4 lg:grid-cols-4">
      <StepSelect step="1" label="สัปดาห์ปัจจุบัน" value={selectedWeekKey} onChange={setSelectedWeekKey}>{weekBuckets.map((week) => <option key={week.key} value={week.key}>{week.label} ({week.cases.length} เคส)</option>)}</StepSelect>
      <StepSelect step="2" label="สัปดาห์เปรียบเทียบ" value={comparisonWeekKey} onChange={setComparisonWeekKey}>{weekBuckets.filter((week) => week.key !== selectedWeekKey).map((week) => <option key={week.key} value={week.key}>{week.label} ({week.cases.length} เคส)</option>)}</StepSelect>
      <StepSelect step="3" label="Team" value={selectedTeam} onChange={setSelectedTeam}><option value="all">All Teams</option>{teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}</StepSelect>
      <StepSelect step="3" label="Agent Scope" value={selectedAgent} onChange={setSelectedAgent}><option value="all">All Agents</option>{agentOptions.map((agent) => <option key={agent} value={agent}>{agent}</option>)}</StepSelect>
    </div>
  );
  const preview = selectedWeek && comparisonWeek ? <WeeklyComparisonPreview selectedWeek={selectedWeek} comparisonWeek={comparisonWeek} scopeLabel={scopeLabel} currentCases={currentCases} currentAverage={currentAverage} comparisonAverage={comparisonAverage} weekChange={weekChange} overallGrade={overallGrade} agentCount={agentCount} incentive={incentive} reviewCounts={reviewCounts} grades={grades} topics={topics} /> : null;

  if (reportExportOnly) return (
    <div data-slides-export-only="true" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
      <h2 className="text-xl font-semibold text-slate-900">QA Weekly Comparison</h2>
      <p className="mt-1 text-sm text-slate-500">เลือกสองสัปดาห์และขอบเขตข้อมูล จากนั้นดาวน์โหลด PowerPoint ที่แก้ไขได้</p>
      <div className="mt-5">{controls}</div>
      {evaluationHold ? <div className="mt-4"><EvaluationActivityUnavailable label={evaluationHold.label} /></div> : null}
      <div className="mt-5 overflow-x-auto rounded-2xl border border-violet-100 bg-slate-100 p-2"><div className="h-[450px] w-[800px] overflow-hidden rounded-lg bg-white"><div style={{ transform: "scale(0.5)", transformOrigin: "top left", width: 1600, height: 900 }}>{preview}</div></div></div>
      <div className="mt-4 flex items-center justify-between gap-3"><span role="status" className="text-sm font-medium text-slate-600">{statusMessage}</span><button type="button" onClick={() => void handleExportPptx()} disabled={loading || exporting || !currentCases.length || Boolean(evaluationHold)} className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{exporting ? "กำลังสร้าง PowerPoint..." : "5. Generate PowerPoint (.pptx)"}</button></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f7f2ff] via-white to-[#fbf7ff]">
      <PageHero eyebrow="Documents" title="QA Weekly Comparison" subtitle="สร้างสไลด์ PowerPoint 16:9 ตามต้นแบบ QA Weekly Comparison" />
      <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-6 lg:px-8">
        <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(88,28,135,0.10)]">
          <div className="mb-5 flex items-start justify-between gap-4"><div><div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">PowerPoint Builder</div><h2 className="mt-1 text-2xl font-black text-slate-950">กำหนดช่วงเปรียบเทียบ</h2><p className="mt-1 text-sm font-medium text-slate-500">โครงสร้างสไลด์ตายตัวตามต้นแบบ ไม่มี Template หรือหัวข้อที่ต้องติ๊กเพิ่ม</p></div><div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-900"><div className="font-bold">ผู้ใช้งาน</div><div>{currentUser.displayName || currentUser.username}</div></div></div>
          {controls}
        </section>
        {errorMessage ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{errorMessage}</div> : null}
        {evaluationHold ? <div className="mt-4"><EvaluationActivityUnavailable label={evaluationHold.label} /></div> : null}
        <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(88,28,135,0.10)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="text-[11px] font-black uppercase tracking-[0.2em] text-violet-700">4. Preview PowerPoint</div><div className="mt-1 text-sm font-medium text-slate-500">สไลด์หน้าเดียว สัดส่วน 16:9 ตามต้นแบบเดิม</div></div><button type="button" onClick={() => void handleExportPptx()} disabled={loading || exporting || !currentCases.length || Boolean(evaluationHold)} className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300">{exporting ? "กำลังสร้าง PowerPoint..." : "5. Generate PowerPoint (.pptx)"}</button></div>
          <div className="overflow-x-auto rounded-[24px] border border-violet-100 bg-slate-100 p-3"><div className="h-[648px] w-[1152px] overflow-hidden rounded-[8px] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.14)]"><div style={{ transform: "scale(0.72)", transformOrigin: "top left", width: 1600, height: 900 }}>{preview}</div></div></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="text-sm font-medium text-slate-600">{loading ? "กำลังโหลดข้อมูล..." : currentCases.length ? `${currentCases.length} เคส · ${agentCount} Agents · ${topics.length} Topics` : "ไม่พบเคสในขอบเขตที่เลือก"}</div>{statusMessage ? <div role="status" className={`rounded-xl px-3 py-2 text-sm font-bold ${statusMessage.includes("ไม่สำเร็จ") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{statusMessage}</div> : null}</div>
        </section>
      </div>
    </div>
  );
}

function StepSelect({ step, label, value, onChange, children }: { step: string; label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="block rounded-2xl border border-violet-100 bg-violet-50/40 p-3"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.1em] text-slate-600"><span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-violet-700 px-1.5 text-white">{step}</span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-3 h-11 w-full rounded-xl border border-violet-100 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100">{children}</select></label>;
}

function WeeklyComparisonPreview({ selectedWeek, comparisonWeek, scopeLabel, currentCases, currentAverage, comparisonAverage, weekChange, overallGrade, agentCount, incentive, reviewCounts, grades, topics }: { selectedWeek: WeekBucket; comparisonWeek: WeekBucket; scopeLabel: string; currentCases: StoredEvaluation[]; currentAverage: number; comparisonAverage: number; weekChange: number | null; overallGrade: string; agentCount: number; incentive: number; reviewCounts: { original: number; revised: number }; grades: Record<string, number>; topics: TopicComparison[] }) {
  const originalPct = currentCases.length ? (reviewCounts.original / currentCases.length) * 100 : 0;
  const revisedPct = currentCases.length ? (reviewCounts.revised / currentCases.length) * 100 : 0;
  const kpis = [
    { label: "TOTAL CASES", value: `${currentCases.length}`, note: selectedWeek.label, accent: "border-t-violet-700" },
    { label: "AVERAGE SCORE", value: `${currentAverage.toFixed(2)}%`, note: `KPI TARGET ${KPI_TARGET}%`, accent: "border-t-emerald-600", green: true },
    { label: "OVERALL GRADE", value: overallGrade, note: "CURRENT SCOPE", accent: "border-t-violet-700" },
    { label: "AGENTS EVALUATED", value: `${agentCount}`, note: agentCount ? `${(currentCases.length / agentCount).toFixed(2)} CASES / AGENT` : "0 CASES / AGENT", accent: "border-t-violet-700" },
    { label: "TOTAL INCENTIVE", value: `฿${incentive.toLocaleString("en-US")}`, note: "THB", accent: "border-t-violet-700" },
  ];
  return <div className="relative h-[900px] w-[1600px] overflow-hidden bg-white px-[54px] pb-[28px] pt-[38px] font-['Kanit'] text-[#142B4D]">
    <div className="flex h-[92px] items-start justify-between"><div className="flex gap-4"><span className="mt-1 h-[54px] w-[6px] rounded-full bg-[#5B35C9]" /><div><h2 className="text-[34px] font-black leading-none">QA Weekly Comparison</h2><p className="mt-3 text-[15px] font-semibold text-[#596D8B]">{scopeLabel} | {comparisonWeek.label} เทียบกับ {selectedWeek.label}</p></div></div><div className="mr-4 text-right"><img src="/robinhood-logo.png" alt="Robinhood" className="ml-auto h-[38px] w-auto object-contain" /><div className="mt-1 text-[11px] font-bold tracking-wide text-[#596D8B]">QA PERFORMANCE REVIEW</div></div></div>
    <div className="grid grid-cols-5 gap-[14px]">{kpis.map((item) => <div key={item.label} className={`h-[92px] rounded-xl border border-[#DCE3EE] border-t-[4px] ${item.accent} bg-white px-5 py-3`}><div className="text-[12px] font-black tracking-wide text-[#596D8B]">{item.label}</div><div className={`mt-1 flex items-end justify-between gap-3 ${item.green ? "text-[#009B76]" : "text-[#142B4D]"}`}><span className="text-[30px] font-black leading-none">{item.value}</span><span className="max-w-[125px] pb-1 text-right text-[10px] font-bold leading-tight text-[#596D8B]">{item.note}</span></div></div>)}</div>
    <div className="mt-4 grid h-[130px] grid-cols-[1.62fr_0.95fr] gap-4"><section className="rounded-xl border border-[#DCE3EE] bg-[#F6F6FB] px-5 py-4"><h3 className="text-[17px] font-black">WEEK-OVER-WEEK SCORE</h3><div className="mt-4 grid grid-cols-[145px_1fr_96px_150px] items-center gap-x-4 gap-y-4 text-[13px] font-bold"><span className="text-[#596D8B]">{comparisonWeek.label}</span><ScoreBar value={comparisonAverage} color="#9C7CE7" /><span className="text-right text-[18px] font-black">{comparisonAverage.toFixed(2)}%</span><div className={`row-span-2 flex h-[58px] items-center justify-center rounded-xl text-[20px] font-black ${weekChange !== null && weekChange >= 0 ? "bg-[#E9F7F1] text-[#009B76]" : "bg-[#FBECEF] text-[#C23B5A]"}`}>{weekChange === null ? "ไม่มีข้อมูลเทียบ" : `${weekChange >= 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(weekChange).toFixed(2)}%`}</div><span className="text-[#596D8B]">{selectedWeek.label}</span><ScoreBar value={currentAverage} color="#5B35C9" /><span className="text-right text-[18px] font-black">{currentAverage.toFixed(2)}%</span></div></section><section className="rounded-xl border border-[#DCE3EE] bg-white px-5 py-4"><h3 className="text-[17px] font-black">REVIEW STATUS &amp; GRADE MIX</h3><div className="mt-3 flex justify-between text-[13px] font-black"><span className="text-[#5B35C9]">Original {reviewCounts.original} เคส ({originalPct.toFixed(2)}%)</span><span className="text-[#596D8B]">Revised {reviewCounts.revised} เคส ({revisedPct.toFixed(2)}%)</span></div><div className="my-3 h-px bg-[#DCE3EE]" /><div className="flex items-center justify-between text-[13px] font-black"><span className="text-[#596D8B]">Grade Mix</span><span>{["A", "B", "C", "D", "F", "G"].map((grade) => `${grade} ${grades[grade] || 0}`).join("   ")}</span></div></section></div>
    <div className="mt-4 flex items-end justify-between"><h3 className="text-[19px] font-black">TOPIC PERFORMANCE</h3><span className="text-[12px] font-semibold text-[#596D8B]">ประเด็นข้อผิดพลาดที่ตรวจพบ (% ของเคสทั้งหมด {currentCases.length} เคส)</span></div>
    <div className="mt-2 grid h-[380px] grid-cols-2 grid-rows-2 gap-3">{Array.from({ length: 4 }).map((_, index) => <TopicPreviewCard key={topics[index]?.id || index} index={index} topic={topics[index]} selectedWeek={selectedWeek} comparisonWeek={comparisonWeek} />)}</div>
    <div className="absolute bottom-[20px] left-[54px] right-[54px] border-t border-[#DCE3EE] pt-2 text-[10px] font-semibold text-[#596D8B]">ข้อผิดพลาดแต่ละประเภท (%) = สัดส่วนเคสจาก {currentCases.length} เคส (1 เคสพบได้หลายประเภท) | % การเปลี่ยนแปลงเทียบกับสัปดาห์ก่อน</div>
  </div>;
}
function ScoreBar({ value, color }: { value: number; color: string }) { return <div className="h-[12px] overflow-hidden rounded-full bg-[#E8EAF1]"><div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, value))}%`, backgroundColor: color }} /></div>; }
function TopicPreviewCard({ index, topic, selectedWeek, comparisonWeek }: { key?: React.Key; index: number; topic?: TopicComparison; selectedWeek: WeekBucket; comparisonWeek: WeekBucket }) {
  if (!topic) return <div className="rounded-xl border border-dashed border-[#DCE3EE] bg-white" />;
  const changeText = topic.changePercent === null ? "ไม่มีข้อมูลเทียบ" : `${topic.changePercent >= 0 ? "เพิ่มขึ้น" : "ลดลง"} ${Math.abs(topic.changePercent).toFixed(2)}%`;
  const tags = topic.tags.length ? topic.tags.slice(0, 6) : [{ name: "ไม่พบข้อผิดพลาด", count: 0, percent: 0 }];
  return <section className="overflow-hidden rounded-xl border border-[#DCE3EE] bg-white px-5 py-3"><div className="flex items-center gap-3"><span className="flex h-[30px] w-[38px] items-center justify-center rounded-lg bg-[#F6F3FD] text-[15px] font-black text-[#5B35C9]">{String(index + 1).padStart(2, "0")}</span><h4 className="min-w-0 flex-1 truncate text-[18px] font-black">{topic.title}</h4></div><div className="mt-2 grid grid-cols-[1fr_1fr_150px] rounded-lg bg-[#F6F6FB] px-3 py-2 text-[13px] font-black"><span>{comparisonWeek.label} {topic.previousPercent.toFixed(2)}%</span><span className="text-[#5B35C9]">{selectedWeek.label} {topic.currentPercent.toFixed(2)}%</span><span className={`text-right ${topic.changePercent !== null && topic.changePercent >= 0 ? "text-[#009B76]" : "text-[#C23B5A]"}`}>{changeText}</span></div><div className="mt-2 space-y-1">{tags.map((tag, tagIndex) => <div key={`${tag.name}-${tagIndex}`} className={`flex items-center justify-between gap-4 text-[13px] leading-tight ${tagIndex === 0 ? "font-black text-[#142B4D]" : "font-semibold text-[#596D8B]"}`}><span className="truncate">{tag.name}</span><span className={tagIndex === 0 ? "font-black text-[#5B35C9]" : "text-[#596D8B]"}>{tag.percent.toFixed(2)}%</span></div>)}</div></section>;
}
