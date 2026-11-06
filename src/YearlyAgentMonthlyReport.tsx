import React from "react";
import type { YearlyTeamReport, YearlyStats } from "./yearlyTeamSummaryData";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const scoreText = (item: YearlyStats) => item.hold ? "รอตรวจสอบ" : item.averageScore === null ? "—" : item.averageScore.toFixed(2);

type Props = {
  reports: readonly YearlyTeamReport[];
  team: string;
  agent: string;
  canExport: boolean;
  exporting: boolean;
  onExportExcel: () => void;
  onExportPdf: () => void;
};

export default function YearlyAgentMonthlyReport({
  reports, team, agent, canExport, exporting, onExportExcel, onExportPdf
}: Props) {
  return <section data-yearly-agent-monthly-report="true" className="space-y-4 rounded-2xl border border-violet-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">Yearly Agent Monthly Score Report</h2>
        <p className="text-sm text-slate-600">คะแนน QA รายพนักงาน แยกครบ 12 เดือน · Team: {team} · Agent: {agent}</p>
        <p className="text-xs text-slate-500">Yearly Avg. = ค่าเฉลี่ยจากคะแนนทุกเคสที่ประเมินจริง | KPI รายเดือนนับเฉพาะเดือนที่มีอย่างน้อย 10 เคส และเกณฑ์ผ่าน 85%</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onExportExcel} disabled={!canExport || exporting}
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
          Gen Yearly Excel · Agent/Month
        </button>
        <button type="button" onClick={onExportPdf} disabled={!canExport || exporting}
          className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50">
          Gen Yearly PDF · Agent/Month
        </button>
      </div>
    </div>
    {reports.map(report => <div key={report.year} className="space-y-2" data-yearly-agent-monthly-year={report.year}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-violet-900">Year {report.year} · {report.agentMonths.length} Agents</h3>
        {report.hold ? <span role="status" className="text-xs font-medium text-amber-700">{report.hold.label}</span> : null}
      </div>
      <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1730px] border-separate border-spacing-0 text-sm">
          <thead className="bg-violet-50">
            <tr>
              <th scope="col" className="sticky left-0 z-20 min-w-[240px] border-b border-r border-violet-100 bg-violet-50 px-4 py-3 text-left font-semibold text-violet-900">Agent</th>
              {MONTHS.map(month => <th scope="col" key={month} className="min-w-[106px] border-b border-r border-violet-100 px-2 py-3 text-center font-semibold text-violet-900">{month}</th>)}
              <th scope="col" className="min-w-[94px] border-b border-r border-violet-100 px-2 py-3 text-center font-semibold text-violet-900">Total Cases</th>
              <th scope="col" className="min-w-[106px] border-b border-r border-violet-100 px-2 py-3 text-center font-semibold text-violet-900">Yearly Avg.</th>
              <th scope="col" className="min-w-[100px] border-b border-violet-100 px-2 py-3 text-center font-semibold text-violet-900">KPI Months</th>
            </tr>
          </thead>
          <tbody>
            {report.agentMonths.map((item, index) => <tr key={item.agent} className="group">
              <th scope="row" className={"sticky left-0 z-10 whitespace-nowrap border-b border-r border-slate-100 px-4 py-3 text-left font-medium text-slate-800 " + (index % 2 ? "bg-slate-50" : "bg-white")}>
                <span className="mr-2 text-xs text-slate-400">{item.sequence}.</span>{item.agent}
              </th>
              {item.months.map((month, monthIndex) => {
                const eligible = month.caseCount >= 10 && !month.hold && month.averageScore !== null;
                const tone = !eligible ? "text-slate-700" : month.averageScore! >= 85 ? "text-emerald-700" : "text-rose-700";
                return <td key={report.year + "-" + item.agent + "-" + monthIndex} className={"border-b border-r border-slate-100 px-2 py-2 text-center " + (index % 2 ? "bg-slate-50" : "bg-white")}
                  title={MONTHS[monthIndex] + " " + report.year + ": " + scoreText(month) + " | " + month.caseCount + " cases" + (eligible ? " | KPI " + (month.averageScore! >= 85 ? "Pass" : "Below 85%") : " | KPI not assessed")}>
                  <div className={"font-semibold tabular-nums " + tone}>{scoreText(month)}</div>
                  <div className="mt-0.5 text-[11px] tabular-nums text-slate-500">{month.caseCount} cases</div>
                </td>;
              })}
              <td className={"border-b border-r border-slate-100 px-2 py-3 text-center font-semibold tabular-nums " + (index % 2 ? "bg-slate-50" : "bg-white")}>{item.hold ? "—" : item.caseCount}</td>
              <td className={"border-b border-r border-slate-100 px-2 py-3 text-center font-semibold tabular-nums " + (index % 2 ? "bg-slate-50" : "bg-white")}>{scoreText(item)}</td>
              <td className={"border-b border-slate-100 px-2 py-3 text-center tabular-nums " + (index % 2 ? "bg-slate-50" : "bg-white")}>
                {item.hold ? "—" : item.kpiEvaluatedMonths ? item.kpiPassedMonths + "/" + item.kpiEvaluatedMonths : "—"}
              </td>
            </tr>)}
            {!report.agentMonths.length ? <tr><td colSpan={16} className="px-4 py-8 text-center text-slate-500">ไม่พบรายชื่อพนักงานในขอบเขตที่เลือก</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">— หมายถึงไม่มีคะแนนประเมินในเดือนนั้น · ตัวเลขใต้คะแนนคือจำนวนเคส · KPI Months = เดือนที่ผ่าน / เดือนที่มีการประเมินครบ 10 เคส</p>
    </div>)}
  </section>;
}
