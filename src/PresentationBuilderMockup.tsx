import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import PageHero from "./PageHero";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";

type CurrentUser = { username: string; displayName: string; role: string; agentName: string };
type Row = { agentName: string; score: number; topic: string; weekKey: string; date: Date };
const RAW_FILES = ["/QA_RawData_January-February2026.xlsx", "/QA_RawData_March-May2026.xlsx"];

function clean(v: unknown) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
function toNum(v: unknown) { const n = typeof v === "number" ? v : Number(clean(v).replace(/,/g, "")); return Number.isFinite(n) ? n : NaN; }
function toDate(v: unknown) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number") { const p = XLSX.SSF.parse_date_code(v); return p ? new Date(p.y, p.m - 1, p.d) : null; }
  const t = clean(v); const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { let y = Number(m[3]); if (y < 100) y += 2500; if (y > 2400) y -= 543; return new Date(y, Number(m[2]) - 1, Number(m[1])); }
  const d = new Date(t); return Number.isNaN(d.getTime()) ? null : d;
}
function weekStart(d: Date) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const day = x.getDay(); x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day)); return x; }
function weekKey(d: Date) { return weekStart(d).toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function dLabel(d: Date) { return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }); }
function wLabel(w: string) { if (!w) return "-"; const s = new Date(`${w}T00:00:00`); return `${dLabel(s)} - ${dLabel(addDays(s, 6))}`; }
function avg(a: number[]) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

function getHeader(row: unknown[]) {
  const m = new Map<string, number>();
  row.forEach((h, i) => m.set(clean(h).toLowerCase(), i));
  return (names: string[]) => names.map(n => m.get(n.toLowerCase())).find(i => i !== undefined) ?? -1;
}

function parse(buffer: ArrayBuffer) {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const out: Row[] = [];
  wb.SheetNames.forEach(s => {
    const table = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, defval: "" }) as unknown[][];
    const h = table.findIndex(r => r.map(x => clean(x).toLowerCase()).join("|").includes("agent") && r.map(x => clean(x).toLowerCase()).join("|").includes("score"));
    if (h < 0) return;
    const idx = getHeader(table[h]);
    const iAgent = idx(["Agent", "Agent Name", "Admin", "Name"]);
    const iScore = idx(["Final Score", "Score", "Total Score", "QA Score"]);
    const iDate = idx(["Case Date", "Audit Date", "Timestamp", "Date"]);
    const iTopic = idx(["Intent", "Topic", "Case Type", "Inquiry"]);
    table.slice(h + 1).forEach(r => {
      const agentName = clean(r[iAgent]); const score = toNum(r[iScore]); const date = toDate(r[iDate]);
      if (!agentName || !Number.isFinite(score) || !date) return;
      out.push({ agentName, score, date, weekKey: weekKey(date), topic: clean(r[iTopic]) || "Other" });
    });
  });
  return out;
}

function group(rows: Row[], field: "agentName" | "topic", asc = false) {
  const m = new Map<string, number[]>(); rows.forEach(r => m.set(r[field], [...(m.get(r[field]) || []), r.score]));
  return Array.from(m.entries()).map(([name, scores]) => ({ name, cases: scores.length, score: avg(scores) })).sort((a, b) => asc ? a.score - b.score : b.score - a.score);
}

export default function PresentationBuilderMockup({ currentUser }: { currentUser: CurrentUser; roleScopedAgentNames?: string[]; dataRefreshKey?: string }) {
  const [rows, setRows] = useState<Row[]>([]); const [week, setWeek] = useState(""); const [msg, setMsg] = useState(""); const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState(["kpi", "compare", "agents", "topics", "action"]);
  useEffect(() => { (async () => { const all: Row[] = []; for (const f of RAW_FILES) { const r = await fetch(f); if (r.ok) all.push(...parse(await r.arrayBuffer())); } setRows(all); setWeek(Array.from(new Set(all.map(r => r.weekKey))).sort().reverse()[0] || ""); setLoading(false); })().catch(e => { setMsg(String(e)); setLoading(false); }); }, []);
  const weeks = useMemo(() => Array.from(new Set(rows.map(r => r.weekKey))).sort().reverse(), [rows]);
  const current = rows.filter(r => r.weekKey === week); const prev = rows.filter(r => r.weekKey === weeks[weeks.indexOf(week) + 1]);
  const score = avg(current.map(r => r.score)); const prevScore = avg(prev.map(r => r.score)); const pass = current.length ? current.filter(r => r.score >= 80).length / current.length * 100 : 0;
  const agents = group(current, "agentName").slice(0, 5); const topics = group(current, "topic", true).slice(0, 5);
  const toggle = (s: string) => setSections(x => x.includes(s) ? x.filter(i => i !== s) : [...x, s]);
  const exportPdf = () => { const pdf = new jsPDF({ orientation: "landscape", unit: "mm" }); try { registerTHSarabunNew(pdf); pdf.setFont("THSarabunNew"); } catch {} pdf.setFillColor(88,28,135); pdf.rect(0,0,297,24,"F"); pdf.setTextColor(255,255,255); pdf.setFontSize(18); pdf.text("Weekly QA Presentation", 12, 10); pdf.setFontSize(12); pdf.text(wLabel(week), 12, 18); pdf.setTextColor(15,23,42); pdf.setFontSize(16); pdf.text(`Cases ${current.length} | Avg ${score.toFixed(2)} | Pass ${pass.toFixed(1)}% | WoW ${(score-prevScore).toFixed(2)}`, 12, 40); let y=58; pdf.text("Agent Ranking",12,y); pdf.text("Focus Topics",154,y); y+=8; for(let i=0;i<5;i++){ if(agents[i]) pdf.text(`${i+1}. ${agents[i].name} ${agents[i].score.toFixed(2)}`,12,y); if(topics[i]) pdf.text(`${i+1}. ${topics[i].name} ${topics[i].score.toFixed(2)}`,154,y); y+=8;} pdf.save(`QA_Weekly_Presentation_${week}.pdf`); };
  const copy = async () => { const t = `Weekly QA Presentation\n${wLabel(week)}\nCases: ${current.length}\nAvg: ${score.toFixed(2)}\nPass: ${pass.toFixed(1)}%\nWoW: ${(score-prevScore).toFixed(2)}`; await navigator.clipboard.writeText(t).catch(()=>window.prompt("Copy", t)); setMsg("คัดลอก Summary แล้ว"); setTimeout(()=>setMsg(""),2000); };
  return <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-5 lg:px-6 2xl:px-8">
    <PageHero eyebrow="Presentation Builder" title="สร้างสไลด์ QA รายสัปดาห์" description="เลือก Week, ติ๊กหัวข้อ, Preview และ Export PDF สำหรับประชุมประจำสัปดาห์" icon="🎞️" tone="violet" />
    {msg ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{msg}</div> : null}
    <div className="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="rounded-[30px] border border-violet-100 bg-white p-5 shadow-[0_20px_54px_rgba(88,28,135,0.08)]">
        <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Builder Control</div><div className="mt-1 text-xl font-black text-slate-950">ตั้งค่าสไลด์</div>
        <div className="mt-5 grid gap-4"><select value={week} onChange={e=>setWeek(e.target.value)} className="rounded-2xl border border-violet-100 px-4 py-3 text-sm font-bold">{weeks.map(w=><option key={w} value={w}>{wLabel(w)}</option>)}</select>
        {["kpi","compare","agents","topics","action"].map(s=><label key={s} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold"><input type="checkbox" checked={sections.includes(s)} onChange={()=>toggle(s)} className="h-4 w-4 accent-violet-700"/>{s}</label>)}
        <button onClick={exportPdf} disabled={loading||!current.length} className="rounded-2xl bg-violet-700 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">Generate / Export PDF</button><button onClick={copy} disabled={loading||!current.length} className="rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-black text-violet-700 disabled:text-slate-400">Copy Slide Summary</button></div>
      </div>
      <div className="overflow-hidden rounded-[32px] border border-violet-100 bg-white shadow-[0_24px_70px_rgba(88,28,135,0.10)]"><div className="bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 px-8 py-7 text-white"><div className="text-xs font-black uppercase tracking-[0.22em] text-violet-100">QA Weekly Presentation</div><div className="mt-2 text-3xl font-black">สรุปผล QA รายสัปดาห์</div><div className="mt-1 text-sm font-semibold text-violet-100">{wLabel(week)}</div></div>
      <div className="p-8">{loading ? "กำลังโหลด..." : <><div className="grid gap-4 md:grid-cols-4">{[["Cases",current.length],["Avg Score",score.toFixed(2)],["Pass Rate",`${pass.toFixed(1)}%`],["WoW",(score-prevScore).toFixed(2)]].map(k=><div key={k[0]} className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4"><div className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{k[0]}</div><div className="mt-2 text-3xl font-black text-violet-700">{k[1]}</div></div>)}</div><div className="mt-6 grid gap-6 lg:grid-cols-2"><div className="rounded-[24px] border border-violet-100 bg-violet-50 p-5"><div className="text-sm font-black text-violet-700">Agent Ranking</div>{agents.map((a,i)=><div key={a.name} className="mt-2 flex justify-between rounded-2xl bg-white px-4 py-3 text-sm"><b>{i+1}. {a.name}</b><b>{a.score.toFixed(2)}</b></div>)}</div><div className="rounded-[24px] border border-amber-100 bg-amber-50 p-5"><div className="text-sm font-black text-amber-700">Topic Focus</div>{topics.map(t=><div key={t.name} className="mt-2 flex justify-between rounded-2xl bg-white px-4 py-3 text-sm"><b>{t.name}</b><b>{t.score.toFixed(2)}</b></div>)}</div></div></>}</div></div>
    </div>
  </div>;
}

