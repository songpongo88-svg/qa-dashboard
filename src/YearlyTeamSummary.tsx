import React from "react";
import { showYearlyAgentRanking, type YearlyTeamReport, type YearlyStats } from "./yearlyTeamSummaryData";

const score = (row: YearlyStats) => row.hold?.label || (row.averageScore === null ? "—" : row.averageScore.toFixed(2));
const count = (row: YearlyStats, value: number) => row.hold ? "—" : value;
const cell = "whitespace-nowrap px-4 py-3 text-left text-sm";
const heading = `${cell} font-semibold text-slate-700`;

export default function YearlyTeamSummary({ reports, team, agent }: { reports: readonly YearlyTeamReport[]; team: string; agent: string }) {
  return <div className="space-y-6" data-yearly-team-summary="true">
    {reports.map(report => <section key={report.year} data-yearly-report={report.year} className="space-y-5 rounded-2xl border border-violet-100 bg-white p-5 shadow-sm">
      <div><h2 className="text-xl font-semibold text-slate-900">Yearly Team Summary · {report.year}</h2>
        <p className="mt-1 text-sm text-slate-500">Team: {team} · Agent: {agent}</p></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[["Year", report.year], ["Team Cases", report.caseCount], ["Avg Score", score(report)], ["Critical Cases", count(report, report.criticalCount)]].map(([label, value]) =>
          <div key={String(label)} data-yearly-metric={label} className="rounded-xl bg-slate-50 p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-2 text-lg font-semibold text-slate-900">{value}</div></div>)}
      </div>
      {report.hold ? <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{report.hold.label} — {report.hold.message}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full border-collapse"><caption className="bg-violet-50 px-4 py-3 text-left font-semibold text-violet-900">Monthly Team Trend</caption>
          <thead className="bg-slate-50"><tr>{["Month", "Cases", "Avg Score", "Critical", "A Grade", "B Grade", "C Grade", "D/F/G"].map(label => <th key={label} scope="col" className={heading}>{label}</th>)}</tr></thead>
          <tbody>{report.months.map(month => <tr key={month.monthKey} data-yearly-month={month.monthKey} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60">
            <th scope="row" className={`${cell} font-medium text-slate-800`}>{month.label}</th><td className={cell}>{month.caseCount}</td><td className={cell}>{score(month)}</td>
            {[month.criticalCount, month.aGrade, month.bGrade, month.cGrade, month.otherGrade].map((value, index) => <td key={index} className={cell}>{count(month, value)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      {showYearlyAgentRanking(report, agent) ? <div data-yearly-agent-ranking="true" className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full"><caption className="bg-violet-50 px-4 py-3 text-left font-semibold text-violet-900">Top / Bottom Agent by Year</caption>
        <thead className="bg-slate-50"><tr><th scope="col" className={heading}>Metric</th><th scope="col" className={heading}>Result</th></tr></thead>
        <tbody>{[["Top Avg Score Agent", report.topAgents], ["Bottom Avg Score Agent", report.bottomAgents]].map(([label, agents]) => <tr key={String(label)} className="border-t border-slate-100"><th scope="row" className={`${cell} font-medium`}>{String(label)}</th><td className="px-4 py-3 text-sm">{report.hold?.label || (agents as YearlyTeamReport["agents"]).map(item => `${item.agent} (${item.averageScore!.toFixed(2)})`).join(", ") || "—"}</td></tr>)}</tbody>
      </table></div> : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full"><caption className="bg-violet-50 px-4 py-3 text-left font-semibold text-violet-900">Agent Summary · {report.year}</caption>
        <thead className="bg-slate-50"><tr>{["Seq", "Agent", "Cases", "Avg Score", "Critical"].map(label => <th key={label} scope="col" className={heading}>{label}</th>)}</tr></thead>
        <tbody>{report.agents.map(item => <tr key={item.agent} data-yearly-agent={item.agent} className="border-t border-slate-100 even:bg-slate-50/60"><td className={cell}>{item.sequence}</td><th scope="row" className={`${cell} font-medium`}>{item.agent}</th><td className={cell}>{item.caseCount}</td><td className={cell}>{score(item)}</td><td className={cell}>{count(item, item.criticalCount)}</td></tr>)}</tbody>
      </table></div>
    </section>)}
  </div>;
}
