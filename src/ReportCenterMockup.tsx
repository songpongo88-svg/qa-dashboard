import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { loadCanonicalReportData, type CanonicalReportCase } from "./DashboardMockup";
import { buildYearlyTeamReport, createYearlyTeamSummaryXlsx } from "./yearlyTeamSummaryData";
import { createYearlyTeamSummaryPdf } from "./yearlyTeamSummaryPdf";
import { createYearlyAgentMonthlyPdf, createYearlyAgentMonthlyXlsx } from "./yearlyAgentMonthlyExport";
import { assertEvaluationScopeComplete } from "./evaluationEditingStore";
import { getAppealScoreHold } from "./pendingAppealScore";
import { isTestCaseEvaluation } from "./lib/evaluationScope";

type Kind = "monthly" | "weekly" | "yearly" | "compare" | "payment" | "slides";
type Scope = "all" | "team" | "agent";
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
function drawPdf(title: string, period: string, scope: string, cases: CanonicalReportCase[], mode: Kind) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const groups = reportRows(cases, mode === "weekly" ? "week" : mode === "compare" ? "month" : "agent");
  let y = 17;
  const drawText = (value: string, x: number, y: number, maxWidth = 90) => {
    const text = String(value || "-");
    if (/[^\x20-\x7e]/.test(text)) {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = 1200; canvas.height = 90;
        const cc = canvas.getContext("2d")!;
        cc.font = '28px "Sarabun", "Noto Sans Thai", Tahoma, sans-serif';
        cc.fillStyle = "#1e293b";
        cc.fillText(text, 4, 44, 1180);
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y - 5, maxWidth, 7);
        return;
      }
    }
    pdf.text(text.slice(0, 70), x, y);
  };
  const header = () => {
    pdf.setFillColor(61, 35, 102);
    pdf.rect(0, 0, 297, 12, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(255, 255, 255);
    pdf.text(title, 12, 8);
    pdf.setTextColor(30, 41, 59);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    y = 20;
    drawText("Period: " + period + "   Scope: " + scope, 12, y, 250);
    y += 10;
    pdf.setFontSize(10);
    pdf.text("Group", 12, y);
    pdf.text("Cases", 169, y);
    pdf.text("Avg Score", 205, y);
    pdf.text("Cases 85+", 248, y);
    y += 5;
    pdf.setDrawColor(216, 220, 230);
    pdf.line(12, y - 2, 283, y - 2);
  };
  header();
  groups.forEach((item) => {
    if (y > 188) { pdf.addPage(); header(); }
    drawText(item.label, 12, y, 140);
    pdf.text(String(item.count), 169, y);
    pdf.text(item.average === null ? "-" : item.average.toFixed(2), 205, y);
    pdf.text(String(item.passedCases), 248, y);
    y += 8;
  });
  if (!groups.length) drawText("No records", 12, y);
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
  const selectedCases = visibleCases;
  const totals = summary(selectedCases);
  const selectedKind = TYPES.find(item => item.id === kind)!;
  const specialized = kind === "payment" || kind === "slides";
  const selectedPeriod = kind === "yearly" ? effectiveYear : kind === "compare" ? effectiveMonthInYear + "_vs_" + effectiveCompare : effectiveMonthInYear;
  const scopeLabel = scope === "agent" ? effectiveAgent : scope === "team" ? effectiveTeam : "All_Agents";
  const fail = (error: unknown) => setMessage(error instanceof Error ? error.message : String(error));
  const handleGenerate = async () => {
    if (!canExport || busy || loading || !selectedCases.length) return;
    if (scope === "agent" && effectiveAgent === "all") { setMessage("กรุณาเลือก Agent"); return; }
    setBusy(true); setMessage(""); setProgress("");
    try {
      // Always verify the complete canonical snapshot again before creating official files.
      const fresh = await loadCanonicalReportData();
      const snapshotIds = new Set(selectedCases.map(item => rowMonth(item) + "|" + normalize(rowAgent(item)) + "|" + item.caseId));
      const actual = fresh.cases.filter(item => snapshotIds.has(rowMonth(item) + "|" + normalize(rowAgent(item)) + "|" + item.caseId) && !isTestCaseEvaluation(item));
      if (actual.length !== selectedCases.length) throw new Error("ข้อมูลมีการเปลี่ยนแปลง กรุณากด Refresh แล้วตรวจตัวกรองอีกครั้ง");
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
          download(new Blob([result.bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), result.fileName);
        } else {
          const result = yearlyLayout === "agent-month" ? createYearlyAgentMonthlyPdf(selected, args) : createYearlyTeamSummaryPdf(selected, args);
          result.pdf.save(result.fileName);
        }
      } else {
          const result = await generateBulkCaseDetailPdf({ cases: actual, currentUser, monthKey: effectiveMonthInYear,
            onProgress: (done, total) => setProgress(done + " / " + total + " cases") });
          download(result.blob, result.fileName);
        }
      } else {
        const filename = `QA_${kind.toUpperCase()}_${safe(selectedPeriod)}_${safe(scopeLabel)}`;
        const rows = actual.map(item => ({
          "Case ID": item.caseId, "Agent": rowAgent(item), "Team": rowTeam(item),
          "Month": rowMonth(item), "Week": rowWeek(item), "Audit Date": item.auditDate,
          "Score": rowScore(item), "Grade": item.grade || "", "Status": item.reviewStatus || "",
        }));
        if (format === "xlsx") {
          const book = XLSX.utils.book_new();
          const stats = summary(actual);
          XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ "Report": selectedKind.name, "Period": selectedPeriod, "Scope": scopeLabel, "Cases": stats.count, "Average": stats.average ?? "" }]), "Summary");
          XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(reportRows(actual, kind === "weekly" ? "week" : kind === "compare" ? "month" : "agent").map(x => ({ Group: x.label, Cases: x.count, "Average Score": x.average, "Cases >=85": x.passedCases }))), "By Group");
          XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "Cases");
          download(new Blob([XLSX.write(book, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename + ".xlsx");
        } else {
          drawPdf("QA " + selectedKind.name + " Report", selectedPeriod, scopeLabel, actual, kind).save(filename + ".pdf");
        }
      }
      setMessage("สร้างไฟล์สำเร็จ");
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
            <label className="block text-xs font-semibold text-slate-600">Scope<select className={inputClass + " mt-2"} value={scope} onChange={event => setScope(event.target.value as Scope)}><option value="all">All Agents</option><option value="team">By Team</option><option value="agent">By Agent</option></select></label>
            {scope === "team" ? <label className="block text-xs font-semibold text-slate-600">Team<select className={inputClass + " mt-2"} value={effectiveTeam} onChange={event => setTeam(event.target.value)}><option value="all">All Teams</option>{teams.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}
            {scope === "agent" ? <label className="block text-xs font-semibold text-slate-600">Agent<select className={inputClass + " mt-2"} value={effectiveAgent} onChange={event => setAgent(event.target.value)}><option value="all">Select Agent</option>{agents.map(value => <option key={value} value={value}>{value}</option>)}</select></label> : null}
            
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
          <button type="button" onClick={() => void handleGenerate()} disabled={loading || busy || !canExport || !selectedCases.length || (scope === "agent" && effectiveAgent === "all")} className="mt-5 w-full rounded-xl bg-violet-700 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300">{busy ? "กำลังสร้างรายงาน…" : "Generate / Download Report"}</button>
          {!canExport ? <p className="mt-2 text-center text-xs text-amber-700">บัญชีนี้ไม่มีสิทธิ์ Export รายงาน</p> : null}
          </> : <div className="mt-6">{kind === "payment" ? paymentContent : slidesContent}</div>}
        </section>
      </div>
    </main>
  );
}
