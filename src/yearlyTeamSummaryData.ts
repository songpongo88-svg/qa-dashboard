import * as XLSX from "xlsx";
import { canonicalAgentIdentityKey, canonicalizeAgentName } from "./lib/agentIdentity";
import { scoreToGrade } from "./lib/scoreIncentivePolicy";
import { getAppealScoreHold, type AppealScoreState } from "./pendingAppealScore";

export type YearlyCase = AppealScoreState & {
  agent: string;
  sourceAgentName?: string;
  caseId: string;
  monthKey: string;
  finalScore: number;
  grade?: string;
  criticalError?: boolean;
  isTestCase?: boolean;
};
export type YearlyHold = { label: string; message?: string; pendingCount?: number };
export type YearlyStats = { caseCount: number; averageScore: number | null; criticalCount: number; hold: YearlyHold | null };
export type YearlyMonth = YearlyStats & { monthKey: string; label: string; aGrade: number; bGrade: number; cGrade: number; otherGrade: number };
export type YearlyAgent = YearlyStats & { agent: string; sequence: number };
export type YearlyAgentMonthRow = YearlyAgent & { months: YearlyStats[]; kpiEvaluatedMonths: number; kpiPassedMonths: number };
export type YearlyTeamReport = YearlyStats & {
  year: string;
  months: YearlyMonth[];
  agents: YearlyAgent[];
  agentMonths: YearlyAgentMonthRow[];
  topAgents: YearlyAgent[];
  bottomAgents: YearlyAgent[];
};
// A rank is meaningful only when at least two Agents with finalized annual scores
// are visible under the same Team/year filter. An individual selection is not
// a competition against itself. Preserve all case totals and scoring rules.
export function showYearlyAgentRanking(report: YearlyTeamReport, selectedAgent: string): boolean {
  if (selectedAgent !== "All Agents" || report.hold) return false;
  return report.agents.filter(item => item.caseCount > 0 && item.averageScore !== null && !item.hold).length >= 2;
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const yearlyMonthKeys = (year: string) => monthNames.map((_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);

export function buildYearlyTeamReport(source: readonly YearlyCase[], year: string, options: {
  agentNames?: readonly string[];
  scopeHold?: (agents: readonly string[], months: readonly string[]) => YearlyHold | null;
} = {}): YearlyTeamReport {
  if (!/^\d{4}$/.test(year)) throw new Error("กรุณาเลือกปีที่ต้องการออกรายงาน");
  const unique = new Map<string, YearlyCase>();
  source.forEach(item => {
    if (item.isTestCase || !item.agent || !item.caseId || !item.monthKey.startsWith(`${year}-`) ||
      !yearlyMonthKeys(year).includes(item.monthKey) || !Number.isFinite(item.finalScore)) return;
    unique.set(`${item.monthKey}|${canonicalAgentIdentityKey(item.agent)}|${item.caseId.trim().toUpperCase()}`, item);
  });
  const cases = [...unique.values()];
  const names = new Map<string, string>();
  [...(options.agentNames || []), ...cases.map(item => item.sourceAgentName || item.agent)].forEach(name => {
    const key = canonicalAgentIdentityKey(name);
    if (key && !names.has(key)) names.set(key, canonicalizeAgentName(name));
  });
  const stats = (rows: YearlyCase[], agents: string[], months: string[]): YearlyStats => ({
    caseCount: rows.length,
    averageScore: rows.length ? rows.reduce((sum, item) => sum + item.finalScore, 0) / rows.length : null,
    criticalCount: rows.filter(item => item.grade === "G" || (item.criticalError && item.finalScore === 0)).length,
    hold: options.scopeHold?.(agents, months) || getAppealScoreHold(rows),
  });
  const agentNames = [...names.values()];
  const monthKeys = yearlyMonthKeys(year);
  const months = monthKeys.map((monthKey, index): YearlyMonth => {
    const rows = cases.filter(item => item.monthKey === monthKey);
    const grades = rows.map(item => item.grade || scoreToGrade(item.finalScore, monthKey, item.criticalError));
    return { ...stats(rows, agentNames, [monthKey]), monthKey, label: monthNames[index],
      aGrade: grades.filter(grade => grade === "A").length,
      bGrade: grades.filter(grade => grade === "B").length,
      cGrade: grades.filter(grade => grade === "C").length,
      otherGrade: grades.filter(grade => !["A", "B", "C"].includes(grade)).length };
  });
  const agents = agentNames.sort((a, b) => a.localeCompare(b, "th")).map((agent, index): YearlyAgent => ({
    agent, sequence: index + 1,
    ...stats(cases.filter(item => canonicalAgentIdentityKey(item.agent) === canonicalAgentIdentityKey(agent)), [agent], monthKeys),
  }));
  // Build the employee x 12-month matrix from the exact same canonical, deduplicated
  // records used by Yearly Team Summary. Missing scores stay null, never zero.
  const agentMonths: YearlyAgentMonthRow[] = agents.map(agent => {
    const identity = canonicalAgentIdentityKey(agent.agent);
    const months = monthKeys.map(monthKey => stats(
      cases.filter(item => item.monthKey === monthKey && canonicalAgentIdentityKey(item.agent) === identity),
      [agent.agent], [monthKey]
    ));
    const eligible = months.filter(month => month.caseCount >= 10 && !month.hold && month.averageScore !== null);
    return { ...agent, months, kpiEvaluatedMonths: eligible.length,
      kpiPassedMonths: eligible.filter(month => month.averageScore! >= 85).length };
  });
  const ranked = agents.filter(item => item.caseCount && !item.hold && item.averageScore !== null);
  const top = Math.max(...ranked.map(item => item.averageScore!));
  const bottom = Math.min(...ranked.map(item => item.averageScore!));
  return { ...stats(cases, agentNames, monthKeys), year, months, agents, agentMonths,
    topAgents: ranked.filter(item => item.averageScore === top),
    bottomAgents: ranked.filter(item => item.averageScore === bottom) };
}

export function buildYearlyTeamSummaryWorkbook(reports: readonly YearlyTeamReport[], scope: { team: string; agent: string }) {
  if (!reports.length) throw new Error("กรุณาเลือกปีที่ต้องการออกรายงาน");
  const hold = reports.find(report => report.hold)?.hold;
  if (hold) throw new Error(hold.label);
  const book = XLSX.utils.book_new();
  reports.forEach(report => {
    const rows: unknown[][] = Array.from({ length: 32 }, () => []);
    rows[0] = ["Yearly Team Summary"];
    rows[1] = ["Monthly team results for the selected year, including finalized appeal results."];
    rows[3] = ["Current View"];
    rows[4] = ["Team", scope.team, null, "Agent", scope.agent];
    rows[5] = ["Year", Number(report.year), null, "Team Cases", report.caseCount, null, "Avg Score", report.averageScore ?? ""];
    rows[7] = ["Critical Cases", report.criticalCount];
    rows[10] = ["Monthly Team Trend"];
    rows[11] = ["Month", "Cases", "Avg Score", "Critical", "A Grade", "B Grade", "C Grade", "D/F/G"];
    report.months.forEach((month, index) => {
      rows[index + 12] = [new Date(Number(report.year), index, 1), month.caseCount, month.averageScore ?? "", month.criticalCount,
        month.aGrade, month.bGrade, month.cGrade, month.otherGrade];
    });
    const showRanking = showYearlyAgentRanking(report, scope.agent);
    const agentHeaderRow = showRanking ? 31 : 27;
    if (showRanking) {
      rows[26] = ["Top / Bottom Agent by Year"];
      rows[27] = ["Metric", "Result"];
      rows[28] = ["Top Avg Score Agent", report.topAgents.map(item => item.agent).join(", ") || "-"];
      rows[29] = ["Bottom Avg Score Agent", report.bottomAgents.map(item => item.agent).join(", ") || "-"];
    } else {
      rows[26] = [`Agent Summary · ${report.year}`];
    }
    rows[agentHeaderRow] = ["Seq", "Agent", "Cases", "Avg Score", "Critical"];
    report.agents.forEach((item, index) => {
      rows[agentHeaderRow + index + 1] = [item.sequence, item.agent, item.caseCount, item.averageScore ?? "", item.criticalCount];
    });
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    // Keep totals editable in Excel; monthly averages retain full precision.
    sheet.E6 = { t: "n", v: report.caseCount, f: "SUM(B13:B24)" };
    sheet.H6 = { t: report.averageScore === null ? "s" : "n", v: report.averageScore ?? "", f: 'IF(E6=0,"",SUMPRODUCT(B13:B24,C13:C24)/E6)' };
    sheet.B8 = { t: "n", v: report.criticalCount, f: "SUM(D13:D24)" };
    sheet["!cols"] = [24, 34, 15, 19, 18, 18, 18, 18, 4, 4].map(wch => ({ wch }));
    sheet["!rows"] = rows.map((_, index) => ({
      hpt: index === 0 ? 32 : index === 1 || (showRanking && (index === 28 || index === 29)) ? 32 : 23
    }));
    sheet["!merges"] = [0, 1, 3, 10, 26].map(r => ({ s: { r, c: 0 }, e: { r, c: 9 } }));
    if (showRanking) {
      sheet["!merges"].push({ s: { r: 28, c: 1 }, e: { r: 28, c: 9 } }, { s: { r: 29, c: 1 }, e: { r: 29, c: 9 } });
    }
    sheet["!ref"] = `A1:J${Math.max(33, rows.length)}`;
    XLSX.utils.book_append_sheet(book, sheet, reports.length === 1 ? "Yearly_Team_Summary" : `Yearly_${report.year}`);
  });
  return book;
}

// The browser export keeps the template's layout and adds native Excel styles.
// No uploaded workbook data, formulas or external links are bundled with the app.
export async function createYearlyTeamSummaryXlsx(reports: readonly YearlyTeamReport[], scope: { team: string; agent: string }) {
  const book = buildYearlyTeamSummaryWorkbook(reports, scope);
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(XLSX.write(book, { bookType: "xlsx", type: "array" }));
  const font = (bold = false, color = "24324A", size = 11, family = "Calibri") => `<font><sz val="${size}"/><color rgb="FF${color}"/><name val="${family}"/>${bold ? "<b/>" : ""}</font>`;
  const xf = (fontId: number, fillId: number, numFmtId = 0, wrap = false) => `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"${wrap ? ' wrapText="1"' : ""}/></xf>`;
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="mmmm"/></numFmts><fonts count="4">${font()}${font(true, "24324A", 16, "Cambria")}${font(true, "FFFFFF", 11, "Cambria")}${font(false, "64748B", 10)}</fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF354B6E"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F3F8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1">${xf(0, 0)}</cellStyleXfs><cellXfs count="8">${xf(0, 0)}${xf(1, 0)}${xf(3, 0, 0, true)}${xf(2, 2)}${xf(0, 3)}${xf(0, 0, 2)}${xf(0, 3, 2)}${xf(0, 0, 164)}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  for (let index = 0; index < reports.length; index++) {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    let xml = await zip.file(path)!.async("string");
    const showRanking = showYearlyAgentRanking(reports[index], scope.agent);
    const agentHeaderRow = showRanking ? 32 : 28;
    xml = xml.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>/g, (_match, attributes, column, rowText) => {
      const row = Number(rowText);
      let style = 0;
      if (row === 1) style = 1;
      else if (row === 2 || (showRanking && (row === 29 || row === 30))) style = 2;
      else if ([4, 11, 12, 27, agentHeaderRow, ...(showRanking ? [28] : [])].includes(row)) style = 3;
      else if (row >= 13 && row <= 24) style = column === "A" ? 7 : column === "C" ? (row % 2 ? 6 : 5) : row % 2 ? 4 : 0;
      else if (row > agentHeaderRow) style = column === "D" ? (row % 2 ? 6 : 5) : row % 2 ? 4 : 0;
      else if (row === 6 && column === "H") style = 5;
      else if (row === 6 || row === 8) style = 4;
      return `<c${String(attributes).replace(/\s+s="\d+"/g, "")} s="${style}">`;
    });
    xml = xml.replace(/<sheetView([^>]*)\/>/, '<sheetView$1 showGridLines="0"><pane ySplit="12" topLeftCell="A13" activePane="bottomLeft" state="frozen"/></sheetView>');
    zip.file(path, xml);
  }
  return { bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
    fileName: reports.length === 1 ? "Yearly_Team_Summary.xlsx" : `Yearly_Team_Summary_${reports.map(report => report.year).join("_")}.xlsx` };
}
