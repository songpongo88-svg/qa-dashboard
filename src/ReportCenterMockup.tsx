import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { exportCorporateReport } from "./corporateQaReportXlsx";
import { getCaseDetailTopicTitle } from "./lib/rubricVersions";
import { jsPDF } from "jspdf";
import { loadCanonicalReportData, type CanonicalReportCase } from "./DashboardMockup";
import { buildYearlyTeamReport, createYearlyTeamSummaryXlsx } from "./yearlyTeamSummaryData";
import { createYearlyTeamSummaryPdf } from "./yearlyTeamSummaryPdf";
import { createYearlyAgentMonthlyPdf, createYearlyAgentMonthlyXlsx } from "./yearlyAgentMonthlyExport";
import { assertEvaluationScopeComplete } from "./evaluationEditingStore";
import { getAppealScoreHold } from "./pendingAppealScore";
import { isTestCaseEvaluation } from "./lib/evaluationScope";

type Kind = "monthly" | "weekly" | "yearly" | "compare" | "payment" | "slides";
type Scope = "all" | "team" | "agent" | "case";
type Format = "pdf" | "xlsx";
const TYPES: { id: Kind; name: string; detail: string }[] = [
  { id: "monthly", name: "Monthly", detail: "รายงานคะแนนประจำเดือน" },
  { id: "weekly", name: "Weekly", detail: "รายงานคะแนนรายสัปดาห์" },
  { id: "yearly", name: "Yearly", detail: "คะแนนรายปี / แยกคะแนนรายเดือน" },
  { id: "compare", name: "Compare", detail: "เปรียบเทียบ 2 เดือน" },
  { id: "payment", name: "Payment / Signed", detail: "Payment PDF / Excel และเอกสารลงนาม" },
  { id: "slides", name: "QA Slides", detail: "สรุป QA รายสัปดาห์เป็น PDF" },
];
const normalize = (value: unknown) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const safe = (value: string) => value.replace(/[^a-zA-Z0-9ก-๙_-]+/g, "_").slice(0, 72);
const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const rowMonth = (item: CanonicalReportCase) => String(item.monthKey || "").slice(0, 7);
const rowAgent = (item: CanonicalReportCase) => String(item.agent || item.sourceAgentName || "").trim();
const rowTeam = (item: CanonicalReportCase) => String(item.teamName || "").trim();
const rowScore = (item: CanonicalReportCase) => Number(item.finalScore);
const monthTitle = (month: string) => new Date(month + "-01T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
const rowWeek = (item: CanonicalReportCase) => String(item.weekLabel || "").trim() || "Unspecified Week";
const summary = (cases: CanonicalReportCase[]) => ({
  count: cases.length,
  average: cases.length ? cases.reduce((total, item) => total + rowScore(item), 0) / cases.length : null,
  passedCases: cases.filter(item => rowScore(item) >= 85).length,
});
const reportRows = (cases: CanonicalReportCase[], group: "agent" | "week" | "month") => {
  const map = new Map<string, CanonicalReportCase[]>();
  cases.forEach(item => {
    const key = group === "agent" ? rowAgent(item) : group === "week" ? rowWeek(item) : rowMonth(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  });
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "en")).map(([label, rows]) => ({ label, ...summary(rows) }));
};

const effectiveTopics = (item: CanonicalReportCase) =>
  item.reviewStatus === "Revised" && Array.isArray(item.revisedTopics) && item.revisedTopics.length ? item.revisedTopics : (item.topics || []);
function topicRows(rows: CanonicalReportCase[]) {
  const map = new Map<string, { score: number; max: number; count: number }>();
  rows.forEach(item => effectiveTopics(item).forEach(topic => {
    const code = String(topic.code || topic.label || "").trim();
    const score = Number(topic.score), max = Number(topic.max);
    if (!code || !Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return;
    const entry = map.get(code) || { score: 0, max: 0, count: 0 };
    entry.score += score; entry.max += max; entry.count++;
    map.set(code, entry);
  }));
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([code, item]) => ({
    code, cases: item.count, average: item.score / item.count, max: item.max / item.count,
    percent: item.score * 100 / item.max,
  }));
}
function tagRows(rows: CanonicalReportCase[]) {
  const tags = new Map<string, number>();
  rows.forEach(item => {
    const distinct = new Set<string>();
    effectiveTopics(item).forEach(topic => {
      (topic.issueTags || []).forEach(tag => { if (String(tag).trim()) distinct.add(String(tag).trim()); });
      (topic.deductions || []).forEach(tag => {
        const info = tag as unknown as Record<string, unknown> | string;
        const value = typeof info === "string" ? info : String(info.tag || info.name || info.label || "");
        if (value.trim()) distinct.add(value.trim());
      });
    });
    distinct.forEach(tag => tags.set(tag, (tags.get(tag) || 0) + 1));
  });
  return [...tags].map(([tag, cases]) => ({ tag, cases, percent: rows.length ? cases * 100 / rows.length : 0 }))
    .sort((a,b) => b.cases - a.cases || a.tag.localeCompare(b.tag));
}
function agentRows(rows: CanonicalReportCase[], mode: Kind = "monthly") {
  const agents = new Map<string, CanonicalReportCase[]>();
  rows.forEach(item => { const name = rowAgent(item); agents.set(name, [...(agents.get(name) || []), item]); });
  return [...agents].sort(([a],[b]) => a.localeCompare(b,"th")).map(([name, items]) => ({
    name, team: rowTeam(items[0]), ...summary(items),
    kpi: mode === "yearly" ? "KPI by Month" : mode === "weekly" || mode === "compare" ? "Monthly KPI only" :
      items.length < 10 ? "Not assessed" : (summary(items).average || 0) >= 85 ? "Pass" : "Below 85%",
  }));
}
function detailedRows(rows: CanonicalReportCase[]) {
  return rows.map(item => {
    const values: Record<string, string | number> = {
      "Case ID": item.caseId, "Case Date": item.caseDate || "", "Audit Date": item.auditDate || "",
      "Team": rowTeam(item), "Agent": rowAgent(item), "Month": rowMonth(item), "Week": rowWeek(item),
      "Intent TH": item.inquiryTh || "", "Intent EN": item.inquiryEn || "",
      "Case Description": item.caseDescription || "", "Final Score": rowScore(item),
      "Previous Score": item.previousScore ?? "", "Grade": item.grade || "",
      "Review Status": item.reviewStatus || "", "Appeal Status": item.appealStatus || "",
    };
    effectiveTopics(item).forEach(topic => {
      const code = String(topic.code || "").trim();
      if (!code) return;
      values[code + " Score"] = topic.score;
      values[code + " Max"] = topic.max;
      values[code + " Tag"] = (topic.issueTags || []).join(", ");
      values[code + " Comment"] = String(topic.comment || "");
    });
    return values;
  });
}
function buildReportWorkbook(rows: CanonicalReportCase[], kind: Kind, scope: string, period: string, generatedBy: string, generatedAt: string) {
  const book = XLSX.utils.book_new();
  const stats = summary(rows), agents = agentRows(rows, kind), topics = topicRows(rows), tags = tagRows(rows);
  const evaluatedMonth=rows[0] ? rowMonth(rows[0]) : "";
  const topicName=(code:string)=>getCaseDetailTopicTitle(code,"Topic "+code,evaluatedMonth);
  const cells: Array<{ address:string; value:string|number }>=[];
  const write=(address:string,value:string|number)=>cells.push({address,value});
  write("E2","QUALITY ASSURANCE  /  PERFORMANCE REPORT");
  write("E4",kind.toUpperCase()+"  •  "+period+"  •  "+scope);
  const cards=[
    ["C9","AVERAGE QA","C10",stats.average===null?"-":Number(stats.average.toFixed(2)),"C12","Score / 100"],
    ["G9","EVALUATED CASES","G10",stats.count,"G12","Cases in scope"],
    ["K9","EVALUATED AGENTS","K10",agents.length,"K12","Agents in scope"],
    ["O9","KPI TARGET","O10","85%","O12","Monthly target"],
  ] as const;
  cards.forEach(x=>{write(x[0],x[1]);write(x[2],x[3]);write(x[4],x[5]);});
  write("B15","01  •  TOPIC PERFORMANCE");
  write("K15","02  •  DEDUCTION TAGS");
  write("B17","QA RUBRIC TOPIC"); write("F17","AVG %");write("G17","AVG SCORE");write("H17","CASES");
  write("K17","ISSUE TAG");write("O17","CASES");write("P17","SHARE %");
  topics.slice(0,4).forEach((item,i)=>{
    const r=19+i*2;
    write("B"+r,topicName(item.code));
    write("F"+r,Number(item.percent.toFixed(2)));
    write("G"+r,Number(item.average.toFixed(2)));
    write("H"+r,item.cases);
    write("I"+r,"▰".repeat(Math.max(1,Math.min(18,Math.round(item.percent/5.6)))));
  });
  tags.slice(0,8).forEach((item,i)=>{
    const r=19+i;
    write("K"+r,item.tag);write("O"+r,item.cases);write("P"+r,Number(item.percent.toFixed(2)));
  });
  write("B43","03  •  AGENT SCORECARD");
  [["B45","AGENT"],["F45","CASES"],["I45","AVG SCORE"],["L45","KPI STATUS"],["O45","GRADE"]].forEach(([a,v])=>write(a,v));
  agents.slice(0,12).forEach((a,i)=>{
    const r=46+i;
    write("B"+r,a.name);write("F"+r,a.count);
    write("I"+r,a.average===null?"-":Number(a.average.toFixed(2)));
    write("L"+r,a.kpi);
    write("O"+r,a.kpi==="Pass"?"ON TARGET":a.kpi==="Below 85%"?"REVIEW":"—");
  });
  write("B59","GENERATED BY");write("F59",generatedBy);
  write("B60","GENERATED AT");write("F60",generatedAt);
  write("B61","REPORT SOURCE");write("F61","QA Dashboard / Canonical Evaluation Records");
  write("B62","PERIOD & SCOPE");write("F62",period+"  •  "+scope);
  write("B64","PREPARED FOR INTERNAL QA PERFORMANCE REVIEW   •   KPI STATUS IS MONTHLY AND REQUIRES 10 CASES");
  const dash=XLSX.utils.aoa_to_sheet([[]]);
  for(const cell of cells)XLSX.utils.sheet_add_aoa(dash,[[cell.value]],{origin:cell.address});
  const merge=(s:string,e:string)=>({s:XLSX.utils.decode_cell(s),e:XLSX.utils.decode_cell(e)});
  dash["!merges"]=[
    merge("E2","P3"),merge("E4","P4"),
    ...["B","F","J","N"].flatMap((column,index)=>{
      const end=["D","H","L","P"][index];
      const mid=["C","G","K","O"][index];
      return [merge(column+"8",end+"8"),merge(column+"11",end+"11"),merge(column+"12",end+"12")];
    }),
    merge("B15","I15"),merge("K15","P15"),
    ...[19,21,23,25].map(row=>merge("B"+row,"E"+(row+1))),
    ...Array.from({length:8},(_,i)=>merge("K"+(i+19),"N"+(i+19))),
    merge("B43","P43"),merge("B45","E45"),merge("F45","H45"),merge("I45","K45"),merge("L45","N45"),merge("O45","P45"),
    ...Array.from({length:12},(_,i)=>{
      const row=i+46;return [merge("B"+row,"E"+row),merge("F"+row,"H"+row),merge("I"+row,"K"+row),merge("L"+row,"N"+row),merge("O"+row,"P"+row)];
    }).flat(),
    ...[59,60,61,62].map(r=>merge("F"+r,"P"+r)),merge("B64","P64")
  ];
  dash["!cols"]=Array.from({length:16},()=>({wch:13}));
  dash["!rows"]=Array.from({length:64},(_,i)=>({hpt:i===1||i===2?23:i===14||i===42?29:i===16||i===44?26:24}));
  XLSX.utils.book_append_sheet(book,dash,"Dashboard");
  const groups = reportRows(rows, kind === "weekly" ? "week" : kind === "yearly" || kind === "compare" ? "month" : "agent");
  const add = (name: string, records: Record<string, string | number>[], widths: number[]) => {
    const data = XLSX.utils.json_to_sheet(records.length ? records : [{ "No Data": "ไม่มีข้อมูล" }]);
    data["!cols"] = widths.map(wch => ({ wch }));
    if(records.length&&data["!ref"])data["!autofilter"]={ref:data["!ref"]};
    data["!rows"]= [{hpt:32}];
    XLSX.utils.book_append_sheet(book,data,name);
  };
  add("Performance Summary", groups.map(x=>({Group:x.label,Cases:x.count,"Average Score":x.average===null?"":Number(x.average.toFixed(2))})),[39,17,21]);
  add("Agent Performance",agents.map(x=>({Agent:x.name,Team:x.team||"—",Cases:x.count,"Average Score":x.average===null?"":Number(x.average.toFixed(2)),"KPI Status":x.kpi})),[39,26,16,21,27]);
  add("Topic Performance",topics.map(x=>({Topic:topicName(x.code),"Average Score":Number(x.average.toFixed(2)),"Maximum Score":Number(x.max.toFixed(2)),"Average %":Number(x.percent.toFixed(2)),Cases:x.cases})),[58,20,20,20,16]);
  add("Tag Analysis",tags.map(x=>({Tag:x.tag,"Cases Affected":x.cases,"Share %":Number(x.percent.toFixed(2))})),[57,19,20]);
  const detailed=detailedRows(rows);
  add("Case Detail",detailed,Object.keys(detailed[0]||{}).map(key=>/Description|Comment/.test(key)?60:/Agent|Intent/.test(key)?36:20));
  return book;
}

function drawPdf(title: string, period: string, scope: string, rows: CanonicalReportCase[], mode: Kind) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  const width = pdf.internal.pageSize.getWidth();
  const stats = summary(rows);
  const agents = agentRows(rows, mode), topics = topicRows(rows), tags = tagRows(rows);
  const groups = reportRows(rows, mode === "weekly" ? "week" : mode === "yearly" || mode === "compare" ? "month" : "agent");
  const text = (value: unknown, x: number, y: number, maxWidth = 120, font = 10) => {
    const valueText = String(value ?? "-");
    pdf.setFontSize(font);
    if (!/[^\x20-\x7e]/.test(valueText)) {
      pdf.text(valueText.slice(0, 90), x, y);
      return;
    }
    const canvas = document.createElement("canvas");
    const painter = canvas.getContext("2d");
    if (!painter) { pdf.text(valueText.slice(0, 60), x, y); return; }
    const fontSize = Math.ceil(font * 3.2);
    painter.font = fontSize + 'px "Sarabun", "Noto Sans Thai", Tahoma, sans-serif';
    const intrinsicWidth = Math.ceil(painter.measureText(valueText).width + 15);
    canvas.width = Math.max(20, intrinsicWidth);
    canvas.height = Math.ceil(fontSize * 1.6);
    const ctx = canvas.getContext("2d")!;
    ctx.font = fontSize + 'px "Sarabun", "Noto Sans Thai", Tahoma, sans-serif';
    ctx.fillStyle = "#263047";
    ctx.fillText(valueText, 5, fontSize * 1.1);
    const mmWidth = Math.min(maxWidth, intrinsicWidth * 0.088);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y - 5, mmWidth, Math.min(9, font + 2));
  };
  const page = (label: string) => {
    pdf.setFillColor(59, 36, 103); pdf.rect(0, 0, width, 15, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(11);
    pdf.text("QA PERFORMANCE REPORT  /  " + title.toUpperCase(), 12, 10);
    pdf.setTextColor(49, 53, 72); pdf.setFont("helvetica", "normal");
    text(label, 12, 24, 235, 11);
    pdf.setDrawColor(224, 227, 234); pdf.line(12, 29, width - 12, 29);
  };
  page("Executive Summary   |   " + period + "   |   " + scope);
  const metric = (x: number, label: string, value: string) => {
    pdf.setFillColor(247, 245, 252); pdf.roundedRect(x, 35, 62, 28, 3, 3, "F");
    pdf.setTextColor(90, 96, 116); pdf.setFontSize(9); pdf.text(label, x + 4, 43);
    pdf.setTextColor(42, 34, 80); pdf.setFont("helvetica", "bold"); pdf.setFontSize(17);
    pdf.text(value, x + 4, 56); pdf.setFont("helvetica", "normal");
  };
  metric(12, "Average Score", stats.average === null ? "-" : stats.average.toFixed(2));
  metric(81, "Evaluated Cases", String(stats.count));
  metric(150, "Agents", String(agents.length));
  metric(219, "KPI Target", "85%");
  text("Topic Performance", 12, 74, 200, 11);
  let y = 84;
  topics.slice(0, 8).forEach(topic => {
    text(topic.code, 13, y, 45, 9);
    pdf.setFillColor(233, 229, 243); pdf.roundedRect(58, y - 4, 145, 4, 1, 1, "F");
    pdf.setFillColor(112, 75, 174); pdf.roundedRect(58, y - 4, 145 * Math.min(100, Math.max(0, topic.percent))/100, 4, 1, 1, "F");
    pdf.setFontSize(9); pdf.text(topic.percent.toFixed(1) + "%", 209, y); y += 11;
  });
  text("Top Issue Tags", 12, Math.max(121, y + 3), 150, 11);
  const tagTop = Math.max(130, y + 13);
  tags.slice(0, 5).forEach((tag, i) => {
    text(tag.tag, 14, tagTop + i * 8, 120, 8);
    pdf.text(tag.cases + " cases  /  " + tag.percent.toFixed(1) + "%", 160, tagTop + i * 8);
  });
  pdf.setFontSize(8); pdf.setTextColor(104, 112, 130);
  pdf.text("KPI per Agent is assessed with at least 10 cases. All metrics use the selected QA scope.", 12, 198);
  // Subsequent pages detail the scope's group-level outcomes without copying full case evidence.
  if (groups.length || agents.length) {
    pdf.addPage("a4", "landscape"); page(mode === "compare" || mode === "yearly" ? "Period Performance" : "Agent Performance");
    let yy = 40;
    pdf.setFont("helvetica", "bold"); pdf.text("Group / Agent", 13, yy); pdf.text("Cases", 155, yy);
    pdf.text("Average", 195, yy); pdf.text("KPI", 245, yy); pdf.setFont("helvetica", "normal"); yy += 8;
    const data = mode === "compare" || mode === "yearly" ? groups.map(x => ({ name: x.label, count: x.count, average: x.average, kpi: "-" })) :
      agents.map(x => ({ name: x.name, count: x.count, average: x.average, kpi: x.kpi }));
    data.forEach((item, idx) => {
      if (yy > 193) { pdf.addPage("a4", "landscape"); page("Performance Continued"); yy = 40; }
      if (idx % 2 === 0) { pdf.setFillColor(248,248,251); pdf.rect(12, yy - 5, 270, 9, "F"); }
      text(item.name, 14, yy, 127, 9);
      pdf.setFontSize(9); pdf.text(String(item.count), 155, yy);
      pdf.text(item.average === null ? "-" : item.average.toFixed(2), 195, yy);
      pdf.text(item.kpi, 245, yy);
      yy += 10;
    });
  }
  return pdf;
}
export default function ReportCenterMockup({
  currentUser, roleScopedAgentNames = [], canExport = false, canViewAllAgents = false, canViewAllTeams = false, canViewOwnTeam = false, paymentContent, slidesContent,
}: {
  currentUser: any;
  roleScopedAgentNames?: string[];
  canExport?: boolean;
  canViewAllAgents?: boolean;
  canViewAllTeams?: boolean;
  canViewOwnTeam?: boolean;
  paymentContent?: React.ReactNode;
  slidesContent?: React.ReactNode;
}) {
  const [kind, setKind] = useState<Kind>("monthly");
  const [scope, setScope] = useState<Scope>("all");
  const [caseId, setCaseId] = useState("all");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState<"dashboard"|"agents"|"topics"|"tags"|"cases">("dashboard");
  const [format, setFormat] = useState<Format>("pdf");
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("2026-10");
  const [compareMonth, setCompareMonth] = useState("2026-09");
  const [week, setWeek] = useState("all");
  const [team, setTeam] = useState("all");
  const [agent, setAgent] = useState("all");
  const [yearlyLayout, setYearlyLayout] = useState<"summary" | "agent-month">("agent-month");
  const [cases, setCases] = useState<CanonicalReportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const refresh = async () => {
    setLoading(true); setMessage("");
    try {
      const result = await loadCanonicalReportData();
      setCases(result.cases.filter(item => !isTestCaseEvaluation(item) && Number.isFinite(rowScore(item))));
    } catch (error) {
      setCases([]);
      setMessage(error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const authorized = useMemo(() => {
    const allowed = new Set(roleScopedAgentNames.map(normalize));
    const currentTeam = normalize(String(currentUser?.teamName || currentUser?.team || ""));
    const ownAgent = normalize(String(currentUser?.agentName || currentUser?.displayName || currentUser?.username || ""));
    return cases.filter(item => {
      if (allowed.size) return allowed.has(normalize(rowAgent(item))) || allowed.has(normalize(String(item.sourceAgentName || "")));
      if (canViewAllAgents || canViewAllTeams) return true;
      if (canViewOwnTeam && currentTeam) return normalize(rowTeam(item)) === currentTeam;
      return Boolean(ownAgent) && (normalize(rowAgent(item)) === ownAgent || normalize(String(item.sourceAgentName || "")) === ownAgent);
    });
  }, [cases, roleScopedAgentNames, canViewAllAgents, canViewAllTeams, canViewOwnTeam, currentUser]);
  const years = useMemo(() => [...new Set(authorized.map(item => rowMonth(item).slice(0, 4)).filter(x => /^\d{4}$/.test(x)))].sort().reverse(), [authorized]);
  const months = useMemo(() => [...new Set(authorized.map(rowMonth).filter(x => /^\d{4}-\d{2}$/.test(x)))].sort().reverse(), [authorized]);
  const effectiveYear = years.includes(year) ? year : years[0] || year;
  const effectiveMonth = months.includes(month) ? month : months[0] || month;
  const monthOptions = months.filter(item => item.startsWith(effectiveYear + "-"));
  const effectiveMonthInYear = monthOptions.includes(effectiveMonth) ? effectiveMonth : monthOptions[0] || effectiveMonth;
  const compareOptions = months.filter(item => item !== effectiveMonthInYear);
  const effectiveCompare = compareOptions.includes(compareMonth) ? compareMonth : compareOptions[0] || compareMonth;
  const teams = useMemo(() => [...new Set(authorized.map(rowTeam).filter(Boolean))].sort(), [authorized]);
  const effectiveTeam = teams.includes(team) ? team : "all";
  const teamCases = authorized.filter(item => scope !== "team" || effectiveTeam === "all" || normalize(rowTeam(item)) === normalize(effectiveTeam));
  const agents = useMemo(() => [...new Set(teamCases.map(rowAgent).filter(Boolean))].sort(), [teamCases]);
  const effectiveAgent = agents.includes(agent) ? agent : "all";
  const scopedCases = authorized.filter(item => {
    if (scope === "team") return effectiveTeam === "all" || normalize(rowTeam(item)) === normalize(effectiveTeam);
    if (scope === "agent") return effectiveAgent !== "all" && normalize(rowAgent(item)) === normalize(effectiveAgent);
    return true;
  });
  const periodCases = scopedCases.filter(item => kind === "yearly"
    ? rowMonth(item).startsWith(effectiveYear + "-")
    : kind === "compare"
      ? rowMonth(item) === effectiveMonthInYear || rowMonth(item) === effectiveCompare
      : rowMonth(item) === effectiveMonthInYear);
  const weeks = [...new Set(periodCases.map(rowWeek))].sort();
  const selectedWeek = weeks.includes(week) ? week : "all";
  const visibleCases = periodCases.filter(item => kind !== "weekly" || selectedWeek === "all" || rowWeek(item) === selectedWeek);
  const selectedCases = scope === "case" ? visibleCases.filter(item => item.caseId === caseId) : visibleCases;
  const totals = summary(selectedCases);
  const selectedKind = TYPES.find(item => item.id === kind)!;
  const specialized = kind === "payment" || kind === "slides";
  const selectedPeriod = kind === "yearly" ? effectiveYear : kind === "compare" ? effectiveMonthInYear + "_vs_" + effectiveCompare : effectiveMonthInYear;
  const scopeLabel = scope === "case" ? caseId : scope === "agent" ? effectiveAgent : scope === "team" ? effectiveTeam : "All_Agents";
  const fail = (error: unknown) => setMessage(error instanceof Error ? error.message : String(error));
  React.useEffect(() => { setPreviewOpen(false); }, [kind, scope, format, effectiveYear, effectiveMonthInYear, effectiveCompare, selectedWeek, effectiveTeam, effectiveAgent, caseId, yearlyLayout]);
  const handleGenerate = async () => {
    if (!canExport || busy || loading || !selectedCases.length) return;
    if (scope === "agent" && effectiveAgent === "all") { setMessage("กรุณาเลือก Agent"); return; }
    if (scope === "case" && caseId === "all") { setMessage("กรุณาเลือก Case ID"); return; }
    setBusy(true); setMessage(""); setProgress("");
    try {
      // Always verify the complete canonical snapshot again before creating official files.
      const fresh = await loadCanonicalReportData();
      const snapshotIds = new Set(selectedCases.map(item => rowMonth(item) + "|" + normalize(rowAgent(item)) + "|" + item.caseId));
      const actual = fresh.cases.filter(item => snapshotIds.has(rowMonth(item) + "|" + normalize(rowAgent(item)) + "|" + item.caseId) && !isTestCaseEvaluation(item));
      if (actual.length !== selectedCases.length || actual.some(item => !selectedCases.some(previous => previous.caseId === item.caseId && previous.finalScore === item.finalScore && previous.reviewStatus === item.reviewStatus))) throw new Error("ข้อมูลเปลี่ยนแปลงจาก Preview กรุณา Refresh และเปิด Preview อีกครั้ง");
      const hold = getAppealScoreHold(actual);
      if (hold) throw new Error(hold.label);
      const verificationMonths = kind === "yearly"
        ? Array.from({length: 12}, (_, index) => effectiveYear + "-" + String(index + 1).padStart(2, "0"))
        : [...new Set(actual.map(rowMonth))];
      const verificationAgents = [...new Set(actual.map(rowAgent))];
      await assertEvaluationScopeComplete(verificationAgents, verificationMonths);

      if (kind === "yearly") {
        const names = scope === "agent" ? [effectiveAgent] : [...new Set(actual.map(rowAgent))];
        const report = buildYearlyTeamReport(actual, effectiveYear, { agentNames: names });
        if (report.hold) throw new Error(report.hold.label);
        const selected = [report];
        const args = { team: scope === "team" ? effectiveTeam : "All Teams", agent: scope === "agent" ? effectiveAgent : "All Agents" };
        if (format === "xlsx") {
          const result = yearlyLayout === "agent-month" ? await createYearlyAgentMonthlyXlsx(selected, args) : await createYearlyTeamSummaryXlsx(selected, args);
          // Preserve the official Yearly matrix while adding the same dashboard/detail sheets as other Excel reports.
          const book = XLSX.read(result.bytes, { type: "array" });
          const detailBook = buildReportWorkbook(actual, kind, scopeLabel, selectedPeriod, String(currentUser?.displayName || currentUser?.agentName || currentUser?.username || "Authorized QA User"), new Date().toLocaleString("en-GB", {timeZone:"Asia/Bangkok",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}));
          detailBook.SheetNames.forEach(name => {
            const target = book.SheetNames.includes(name) ? "QA " + name : name;
            XLSX.utils.book_append_sheet(book, detailBook.Sheets[name], target);
          });
          download(await exportCorporateReport(book), result.fileName);
        } else {
          const result = yearlyLayout === "agent-month" ? createYearlyAgentMonthlyPdf(selected, args) : createYearlyTeamSummaryPdf(selected, args);
          result.pdf.save(result.fileName);
        }
      } else {
        const filename = `QA_${kind.toUpperCase()}_${safe(selectedPeriod)}_${safe(scopeLabel)}`;
        if (format === "xlsx") {
          const book = buildReportWorkbook(actual, kind, scopeLabel, selectedPeriod, String(currentUser?.displayName || currentUser?.agentName || currentUser?.username || "Authorized QA User"), new Date().toLocaleString("en-GB", {timeZone:"Asia/Bangkok",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}));
          download(await exportCorporateReport(book), filename + ".xlsx");
        } else {
          drawPdf("QA " + selectedKind.name + " Report", selectedPeriod, scopeLabel, actual, kind).save(filename + ".pdf");
        }
      }
      setMessage("สร้างไฟล์สำเร็จ");
      setPreviewOpen(false);
    } catch (error) { fail(error); } finally { setBusy(false); setProgress(""); }
  };
  const inputClass = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-violet-500";
  return (
    <main data-qa-report-center="export-only" className="min-h-screen bg-[#f7f8fc] px-4 py-6 text-slate-900 sm:px-7">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-violet-700">QA Dashboard / Reports</p>
          <h1 className="mt-1 text-3xl font-bold">Report Center</h1>
          <p className="mt-2 text-sm text-slate-500">เลือกชนิดรายงานและตัวกรอง แล้วดาวน์โหลดไฟล์ PDF หรือ Excel · Case Detail PDF อยู่ที่หน้า Dashboard ตามเดิม</p>
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">1. เลือก Report ที่ต้องการ</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {TYPES.map(item => <button type="button" key={item.id} aria-pressed={kind === item.id} onClick={() => { setKind(item.id); setMessage(""); }} className={`rounded-xl border p-3 text-left transition ${kind === item.id ? "border-violet-600 bg-violet-50 ring-1 ring-violet-300" : "border-slate-200 bg-white hover:border-violet-200"}`}>
              <div className="text-sm font-semibold">{item.name}</div><div className="mt-1 text-xs text-slate-500">{item.detail}</div>
            </button>)}
          </div>
          {!specialized ? <><h2 className="mb-3 mt-7 text-sm font-semibold text-slate-700">2. เลือกช่วงเวลาและขอบเขต</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">Year<select className={inputClass + " mt-2"} value={effectiveYear} onChange={event => setYear(event.target.value)}>{(years.length ? years : ["2026"]).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            {kind !== "yearly" ? <label className="block text-xs font-semibold text-slate-600">Month<select className={inputClass + " mt-2"} value={effectiveMonthInYear} onChange={event => setMonth(event.target.value)}>{monthOptions.map(value => <option key={value} value={value}>{monthTitle(value)}</option>)}</select></label> : <label className="block text-xs font-semibold text-slate-600">Yearly Format<select className={inputClass + " mt-2"} value={yearlyLayout} onChange={event => setYearlyLayout(event.target.value as typeof yearlyLayout)}><option value="agent-month">By Agent / 12 Months</option><option value="summary">Yearly Team Summary</option></select></label>}
            {kind === "compare" ? <label className="block text-xs font-semibold text-slate-600">Compare with Month<select className={inputClass + " mt-2"} value={effectiveCompare} onChange={event => setCompareMonth(event.target.value)}>{compareOptions.map(value => <option key={value} value={value}>{monthTitle(value)}</option>)}</select></label> : null}
            {kind === "weekly" ? <label className="block text-xs font-semibold text-slate-600">Week<select className={inputClass + " mt-2"} value={selectedWeek} onChange={event => setWeek(event.target.value)}><option value="all">All Weeks</option>{weeks.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}
            <label className="block text-xs font-semibold text-slate-600">Scope<select className={inputClass + " mt-2"} value={scope} onChange={event => setScope(event.target.value as Scope)}><option value="all">All Agents</option><option value="team">By Team</option><option value="agent">By Agent</option><option value="case">By Case</option></select></label>
            {scope === "team" ? <label className="block text-xs font-semibold text-slate-600">Team<select className={inputClass + " mt-2"} value={effectiveTeam} onChange={event => setTeam(event.target.value)}><option value="all">All Teams</option>{teams.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}
            {scope === "agent" ? <label className="block text-xs font-semibold text-slate-600">Agent<select className={inputClass + " mt-2"} value={effectiveAgent} onChange={event => setAgent(event.target.value)}><option value="all">Select Agent</option>{agents.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}
            {scope === "case" ? <label className="block text-xs font-semibold text-slate-600">Case ID<select className={inputClass + " mt-2"} value={caseId} onChange={event => setCaseId(event.target.value)}><option value="all">Select Case ID</option>{visibleCases.map(item => <option key={item.caseId} value={item.caseId}>{item.caseId} · {rowAgent(item)}</option>)}</select></label> : null}
            
          </div>
          <div className="mt-7 border-t border-slate-100 pt-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">3. เลือกไฟล์</h2>
            <div className="flex gap-2">
              {(["pdf", "xlsx"] as const).map(value => <button type="button" key={value} onClick={() => setFormat(value)} aria-pressed={format === value} className={`rounded-xl border px-5 py-2.5 text-sm font-semibold ${format === value ? "border-violet-600 bg-violet-700 text-white" : "border-slate-200 text-slate-700"}`}>{value === "pdf" ? "PDF" : "Excel (.xlsx)"}</button>)}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
            <div><div className="text-xs text-slate-500">ตัวอย่างข้อมูลที่จะส่งออก</div><div className="mt-1 text-sm font-semibold">{selectedKind.name} · {selectedPeriod} · {scopeLabel}</div><div className="mt-1 text-xs text-slate-500">{loading ? "กำลังตรวจข้อมูล" : `${totals.count} cases · Avg ${totals.average === null ? "-" : totals.average.toFixed(2)}`}</div></div>
            <button type="button" onClick={() => void refresh()} disabled={loading || busy} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium disabled:opacity-50">Refresh</button>
          </div>
          {message ? <p role="status" className="mt-3 text-sm text-slate-600">{message}</p> : null}
          {progress ? <p role="status" className="mt-2 text-xs text-violet-700">Generating {progress}</p> : null}
          <button type="button" onClick={() => { setPreviewPage("dashboard"); setPreviewOpen(true); }} disabled={loading || busy || !canExport || !selectedCases.length || (scope === "agent" && effectiveAgent === "all") || (scope === "case" && caseId === "all")} className="mt-5 w-full rounded-xl bg-violet-700 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300">Preview Report</button>
          <p className="mt-2 text-center text-xs text-slate-500">ตรวจสอบหน้ารายงานก่อน Generate PDF / Excel</p>
          {!canExport ? <p className="mt-2 text-center text-xs text-amber-700">บัญชีนี้ไม่มีสิทธิ์ Export รายงาน</p> : null}
          </> : <div className="mt-6">{kind === "payment" ? paymentContent : slidesContent}</div>}

        </section>
      </div>
      {previewOpen && !specialized ? (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/70 p-2 sm:p-5" onMouseDown={e => { if (e.currentTarget === e.target && !busy) setPreviewOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Report Preview" className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div><p className="text-xs font-semibold uppercase tracking-wider text-violet-700">PREVIEW · {format === "xlsx" ? "EXCEL REPORT" : "PDF SUMMARY"}</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">{selectedKind.name} · {selectedPeriod}</h2>
                <p className="mt-1 text-xs text-slate-500">{scopeLabel} · {selectedCases.length} Cases · Average {totals.average === null ? "-" : totals.average.toFixed(2)}</p>
              </div>
              <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" onClick={() => setPreviewOpen(false)} disabled={busy} aria-label="Close preview">Close ×</button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-3 sm:p-6">
              <div className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {format === "xlsx" ? (
                  <nav aria-label="Preview Excel sheets" className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 px-3 pt-3">
                    {([{ id: "dashboard", label: "Dashboard" }, { id: "agents", label: "Agent Performance" }, { id: "topics", label: "Topic Performance" }, { id: "tags", label: "Tag Analysis" }, { id: "cases", label: "Case Detail" }] as const).map(page => (
                      <button key={page.id} type="button" aria-pressed={previewPage === page.id} onClick={() => setPreviewPage(page.id)} className={`rounded-t-lg border px-3 py-2 text-xs font-semibold ${previewPage === page.id ? "border-slate-200 border-b-white bg-white text-violet-700" : "border-transparent text-slate-500 hover:bg-white"}`}>{page.label}</button>
                    ))}
                  </nav>
                ) : <div className="h-2 bg-violet-800" />}
                <div className="min-h-[300px] p-4 sm:p-6">
                  {format === "pdf" || previewPage === "dashboard" ? (
                    <div className="space-y-5">
                      <div className="rounded-lg bg-violet-950 px-5 py-4 text-white">
                        <p className="text-[11px] font-semibold tracking-widest text-violet-200">QUALITY ASSURANCE · {format === "pdf" ? "EXECUTIVE REPORT" : "EXCEL DASHBOARD"}</p>
                        <h3 className="mt-1 text-xl font-bold">{selectedKind.name} QA Performance</h3>
                        <p className="mt-1 text-xs text-violet-100">{selectedPeriod} · {scopeLabel}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {([{name:"Average Score",value:totals.average?.toFixed(2) || "-"},{name:"Total Cases",value:totals.count},{name:"Agents",value:agentRows(selectedCases, kind).length},{name:"KPI Target",value:"85%"}] as const).map(metric => (
                          <div key={metric.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] text-slate-500">{metric.name}</p><p className="mt-1 text-xl font-bold text-slate-900">{metric.value}</p></div>
                        ))}
                      </div>
                      <div><h4 className="mb-3 text-sm font-bold text-slate-800">Topic Performance</h4>
                        {topicRows(selectedCases).map(t => <div className="mb-2 grid grid-cols-[70px_1fr_65px] items-center gap-3 text-xs" key={t.code}><span>{t.code}</span><div className="h-3 rounded bg-slate-100"><div className="h-3 rounded bg-violet-600" style={{width:Math.max(0,Math.min(100,t.percent))+"%"}} /></div><b className="text-right">{t.percent.toFixed(1)}%</b></div>)}
                        {!topicRows(selectedCases).length ? <p className="text-xs text-slate-500">ไม่พบข้อมูล Topic สำหรับเคสที่เลือก</p> : null}
                      </div>
                      {kind === "yearly" || kind === "compare" ? <div className="space-y-2"><h4 className="text-sm font-bold">Period Comparison</h4><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{reportRows(selectedCases,"month").map(x => <div key={x.label} className="rounded-lg bg-slate-50 p-3 text-xs"><b>{x.label}</b><p>{x.count} Cases</p><p>Avg {x.average?.toFixed(2) || "-"}</p></div>)}</div></div> : null}
                      {format === "pdf" ? <><h4 className="text-sm font-bold">Agent Performance Summary</h4>
                        <div className="divide-y divide-slate-100">{agentRows(selectedCases, kind).slice(0,12).map(x => <div key={x.name} className="flex flex-wrap justify-between gap-2 py-2 text-xs"><span>{x.name}</span><span>{x.count} Cases · Avg {x.average?.toFixed(2) || "-"} · {x.kpi}</span></div>)}</div>
                        <h4 className="text-sm font-bold">Top Issue Tags</h4><p className="text-xs text-slate-600">{tagRows(selectedCases).slice(0,7).map(x => x.tag+" ("+x.cases+")").join(" · ") || "No tags"}</p></> : null}
                    </div>
                  ) : previewPage === "agents" ? (
                    <div><h3 className="mb-4 text-base font-bold">Agent Performance</h3><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-violet-50"><tr>{["Agent","Team","Cases","Average","KPI"].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{agentRows(selectedCases, kind).map(x => <tr key={x.name} className="border-b"><td className="p-3">{x.name}</td><td className="p-3">{x.team}</td><td className="p-3">{x.count}</td><td className="p-3">{x.average?.toFixed(2) || "-"}</td><td className="p-3">{x.kpi}</td></tr>)}</tbody></table></div></div>
                  ) : previewPage === "topics" ? (
                    <div><h3 className="mb-4 text-base font-bold">Topic Performance</h3><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-violet-50"><tr>{["Topic","Average Score","Max","Average %","Cases"].map(t => <th className="p-3" key={t}>{t}</th>)}</tr></thead><tbody>{topicRows(selectedCases).map(x => <tr className="border-b" key={x.code}><td className="p-3">{x.code}</td><td className="p-3">{x.average.toFixed(2)}</td><td className="p-3">{x.max.toFixed(2)}</td><td className="p-3">{x.percent.toFixed(2)}%</td><td className="p-3">{x.cases}</td></tr>)}</tbody></table></div></div>
                  ) : previewPage === "tags" ? (
                    <div><h3 className="mb-4 text-base font-bold">Tag Analysis</h3><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-violet-50"><tr><th className="p-3">Tag</th><th className="p-3">Cases</th><th className="p-3">Share of Cases</th></tr></thead><tbody>{tagRows(selectedCases).map(x => <tr className="border-b" key={x.tag}><td className="p-3">{x.tag}</td><td className="p-3">{x.cases}</td><td className="p-3">{x.percent.toFixed(2)}%</td></tr>)}</tbody></table></div></div>
                  ) : (
                    <div><h3 className="text-base font-bold">Case Detail · Raw Data</h3><p className="my-2 text-xs text-slate-500">ตัวอย่าง 20 เคสแรก · ไฟล์ Excel จะมีทุกเคส รวม Topic, Tag และผลอุทธรณ์ตามข้อมูลจริง</p><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-violet-50"><tr>{["Case ID","Agent","Audit Date","Intent","Score","Status"].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{selectedCases.slice(0,20).map(x => <tr className="border-b" key={x.caseId}><td className="p-3">{x.caseId}</td><td className="p-3">{rowAgent(x)}</td><td className="p-3">{x.auditDate}</td><td className="p-3">{x.inquiryTh || x.inquiryEn}</td><td className="p-3">{rowScore(x).toFixed(2)}</td><td className="p-3">{x.reviewStatus}</td></tr>)}</tbody></table></div></div>
                  )}
                </div>
              </div>
              <p className="mx-auto mt-3 max-w-5xl text-xs text-slate-600">Preview แสดงข้อมูลจริงตามตัวกรองที่เลือก · รูปแบบตัวอย่างบนหน้าจออาจแตกต่างจากการจัดหน้าส่งออกจริง</p>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <span className="text-xs text-slate-500">{selectedCases.length} Cases · {format === "xlsx" ? "Dashboard + 5 Data Sheets" : "Executive Summary"}</span>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => setPreviewOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">แก้ไขตัวเลือก</button>
                <button type="button" disabled={busy} onClick={() => void handleGenerate()} className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "กำลังสร้างรายงาน…" : `Generate ${format === "xlsx" ? "Excel" : "PDF"}`}</button>
              </div>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
