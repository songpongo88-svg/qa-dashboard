import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { reportPdfFilename } from "./reportPdfFilename";
import type { YearlyTeamReport } from "./yearlyTeamSummaryData";

type Scope = { team: string; agent: string };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const score = (value: number | null) => value === null ? "—" : value.toFixed(2);

function validated(reports: readonly YearlyTeamReport[]) {
  if (!reports.length) throw new Error("กรุณาเลือกปีที่ต้องการออกรายงาน");
  const hold = reports.find(report => report.hold)?.hold;
  if (hold) throw new Error(hold.label);
  return reports;
}

function fileName(reports: readonly YearlyTeamReport[], scope: Scope, extension: "pdf" | "xlsx") {
  return reportPdfFilename("Yearly_Agent_Monthly_Scores", reports.map(report => report.year), scope)
    .replace(/\.pdf$/, "." + extension);
}

export function buildYearlyAgentMonthlyWorkbook(reports: readonly YearlyTeamReport[], scope: Scope) {
  validated(reports);
  const book = XLSX.utils.book_new();
  for (const report of reports) {
    const rows: (string | number | null)[][] = [
      ["YEARLY AGENT MONTHLY SCORE REPORT"],
      ["Team", scope.team, null, "Agent", scope.agent, null, "Year", Number(report.year)],
      ["Monthly QA score and case count; annual average weighted by actual cases. KPI eligible only with 10+ cases per month (target 85%)."],
      [],
      ["No.", "Agent", ...MONTHS.flatMap(month => [month + " Score", month + " Cases"]),
        "Total Cases", "Yearly Avg.", "KPI Months"]
    ];
    report.agentMonths.forEach(item => {
      rows.push([item.sequence, item.agent,
        ...item.months.flatMap(month => [month.hold || month.averageScore === null ? null : month.averageScore,
          month.hold ? null : month.caseCount]),
        item.hold ? null : item.caseCount,
        item.hold || item.averageScore === null ? null : item.averageScore,
        item.hold ? null : (item.kpiEvaluatedMonths ? item.kpiPassedMonths + "/" + item.kpiEvaluatedMonths : "—")]);
    });
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    report.agentMonths.forEach((item, idx) => {
      if (item.hold) return;
      const row = idx + 6;
      const caseCells = MONTHS.map((_, m) => XLSX.utils.encode_cell({r: row - 1, c: 3 + m * 2}));
      const weightedTerms = MONTHS.map((_, m) => {
        const scoreCell = XLSX.utils.encode_cell({r: row - 1, c: 2 + m * 2});
        return scoreCell + "*" + caseCells[m];
      });
      sheet["AA" + row] = { t: "n", v: item.caseCount, f: "SUM(" + caseCells.join(",") + ")" };
      sheet["AB" + row] = item.averageScore === null
        ? { t: "s", v: "", f: 'IF(AA' + row + '=0,"",(' + weightedTerms.join("+") + ')/AA' + row + ')' }
        : { t: "n", v: item.averageScore, f: 'IF(AA' + row + '=0,"",(' + weightedTerms.join("+") + ')/AA' + row + ')' };
    });
    sheet["!cols"] = [
      { wch: 7 }, { wch: 34 },
      ...MONTHS.flatMap(() => [{ wch: 13 }, { wch: 10 }]),
      { wch: 13 }, { wch: 14 }, { wch: 14 }
    ];
    sheet["!rows"] = rows.map((_, i) => ({ hpt: i === 0 ? 32 : i === 2 ? 28 : i === 4 ? 27 : 24 }));
    sheet["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 28 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 28 } }
    ];
    sheet["!autofilter"] = { ref: "A5:AC" + Math.max(6, rows.length) };
    XLSX.utils.book_append_sheet(book, sheet, "Agent_Monthly_" + report.year);
  }
  return book;
}

export async function createYearlyAgentMonthlyXlsx(reports: readonly YearlyTeamReport[], scope: Scope) {
  const book = buildYearlyAgentMonthlyWorkbook(reports, scope);
  // Apply spreadsheet styles in OOXML; regular SheetJS community export does not
  // preserve cell styling. This does not change any calculated scores or formulas.
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(XLSX.write(book, { bookType: "xlsx", type: "array" }));
  const font = (bold: boolean, color: string, pt: number, family = "Sarabun") =>
    '<font><sz val="' + pt + '"/><color rgb="FF' + color + '"/><name val="' + family + '"/>' + (bold ? "<b/>" : "") + "</font>";
  const fill = (rgb: string) =>
    '<fill><patternFill patternType="solid"><fgColor rgb="FF' + rgb + '"/><bgColor indexed="64"/></patternFill></fill>';
  const xf = (fontId: number, fillId: number, numberFormat = 0) =>
    '<xf numFmtId="' + numberFormat + '" fontId="' + fontId + '" fillId="' + fillId +
    '" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>';
  zip.file("xl/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="6">' + font(false, "334155", 11) + font(true, "FFFFFF", 16) +
    font(true, "FFFFFF", 10) + font(false, "64748B", 10) +
    font(true, "15803D", 11) + font(true, "BE123C", 11) + '</fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    fill("5B21B6") + fill("F4F3FA") + '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1">' + xf(0, 0) + '</cellStyleXfs>' +
    '<cellXfs count="9">' + xf(0, 0) + xf(1, 2) + xf(2, 2) + xf(3, 0) +
    xf(0, 3) + xf(0, 0, 2) + xf(0, 3, 2) + xf(4, 0, 2) + xf(5, 0, 2) +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
  for (let index = 0; index < reports.length; index++) {
    const path = "xl/worksheets/sheet" + (index + 1) + ".xml";
    const member = zip.file(path);
    if (!member) throw new Error("ไม่พบหน้า Excel สำหรับรายงานรายเดือน");
    let xml = await member.async("string");
    xml = xml.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>/g,
      (_match, attrs: string, column: string, rowText: string) => {
        const row = Number(rowText);
        const columnIndex = XLSX.utils.decode_col(column);
        let style = row === 1 ? 1 : row === 5 ? 2 : row === 2 || row === 3 ? 3 : row % 2 ? 4 : 0;
        if (row >= 6) {
          const item = reports[index].agentMonths[row - 6];
          if (columnIndex === 27 || (columnIndex >= 2 && columnIndex <= 25 && columnIndex % 2 === 0)) {
            style = row % 2 ? 6 : 5;
          }
          if (item && columnIndex >= 2 && columnIndex <= 24 && columnIndex % 2 === 0) {
            const month = item.months[(columnIndex - 2) / 2];
            if (!month.hold && month.caseCount >= 10 && month.averageScore !== null)
              style = month.averageScore >= 85 ? 7 : 8;
          }
        }
        return '<c' + String(attrs).replace(/\s+s="\d+"/g, "") + ' s="' + style + '">';
      });
    xml = xml.replace(/<sheetView([^>]*)\/>/,
      '<sheetView$1><pane xSplit="2" ySplit="5" topLeftCell="C6" activePane="bottomRight" state="frozen"/></sheetView>');
    zip.file(path, xml);
  }
  return { bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
    fileName: fileName(reports, scope, "xlsx") };
}

export function createYearlyAgentMonthlyPdf(reports: readonly YearlyTeamReport[], scope: Scope) {
  validated(reports);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3", compress: true });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const cols = [10, 74, ...MONTHS.map(() => 20), 23, 28, 25];
  const columnX = cols.map((_, index) => margin + cols.slice(0, index).reduce((a, b) => a + b, 0));
  const ink = [40, 48, 68] as const;
  const muted = [103, 113, 132] as const;
  const violet = [78, 42, 145] as const;
  const pale = [247, 245, 252] as const;
  let pageStarted = false;
  const txt = (value: unknown, x: number, y: number, maxWidth: number, pt = 8,
    align: "left" | "center" | "right" = "left",
    bold = false, color: readonly number[] = ink) => {
    let valueText = String(value ?? "—").replace(/\s+/g, " ").trim() || "—";
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(pt);
    pdf.setTextColor(color[0], color[1], color[2]);
    const shorten = (measure: (s: string) => number) => {
      if (measure(valueText) <= maxWidth) return;
      while (valueText.length > 1 && measure(valueText + "...") > maxWidth) valueText = valueText.slice(0, -1);
      valueText += "...";
    };
    if (/[^\x20-\x7E]/.test(valueText) && typeof document !== "undefined") {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const scale = 3;
          const fontPx = pt * (96 / 72) * scale;
          const family = '"Sarabun", "Noto Sans Thai", Tahoma, sans-serif';
          ctx.font = (bold ? "700 " : "400 ") + fontPx + "px " + family;
          const measure = (value: string) => ctx.measureText(value).width * 25.4 / (96 * scale);
          shorten(measure);
          canvas.width = Math.ceil(ctx.measureText(valueText).width + 8 * scale);
          canvas.height = Math.ceil(fontPx * 1.55);
          const painter = canvas.getContext("2d");
          if (painter) {
            painter.font = (bold ? "700 " : "400 ") + fontPx + "px " + family;
            painter.textBaseline = "alphabetic";
            painter.fillStyle = "rgb(" + color.join(",") + ")";
            painter.fillText(valueText, 4 * scale, canvas.height * 0.77);
            const imageWidth = canvas.width * 25.4 / (96 * scale);
            const imageHeight = canvas.height * 25.4 / (96 * scale);
            const left = align === "center" ? x - imageWidth / 2 : align === "right" ? x - imageWidth : x;
            pdf.addImage(canvas.toDataURL("image/png"), "PNG", left, y - imageHeight * 0.77,
              imageWidth, imageHeight, undefined, "FAST");
            return;
          }
        }
      } catch { /* Keep numeric report available if browser canvas is blocked. */ }
    }
    shorten(value => pdf.getTextWidth(value));
    pdf.text(valueText, x, y, { align });
  };

  const startPage = (year: string, continued: boolean) => {
    if (pageStarted) pdf.addPage("a3", "landscape");
    pageStarted = true;
    pdf.setFillColor(violet[0], violet[1], violet[2]);
    pdf.rect(0, 0, width, 15, "F");
    txt("QA YEARLY AGENT MONTHLY SCORE REPORT", margin, 10, 275, 14, "left", true, [255, 255, 255]);
    txt(year, width - margin, 10, 50, 13, "right", true, [255, 255, 255]);
    txt("Team: " + scope.team, margin, 23, 192, 9, "left", true);
    txt("Agent: " + scope.agent, width - margin, 23, 188, 9, "right", true);
    txt("Scores per month; case counts beneath. Yearly average uses all evaluated cases. Monthly KPI: 10+ cases, target 85%.", margin, 30, width - 2 * margin, 8, "left", false, muted);
    if (continued) txt("Continued", width - margin, 35.5, 60, 8, "right", false, muted);
    pdf.setFillColor(violet[0], violet[1], violet[2]);
    pdf.rect(margin, 39, width - 2 * margin, 11, "F");
    const headers = ["#", "Agent", ...MONTHS, "Cases", "Yearly Avg.", "KPI Months"];
    headers.forEach((h, i) => txt(h, i === 1 ? columnX[i] + 2 : columnX[i] + cols[i] / 2,
      45.7, cols[i] - 2, 8, i === 1 ? "left" : "center", true, [255, 255, 255]));
  };

  for (const report of reports) {
    let y = 50;
    startPage(report.year, false);
    for (const item of report.agentMonths) {
      if (y + 10 > height - 17) {
        startPage(report.year, true);
        y = 50;
      }
      pdf.setFillColor(...(item.sequence % 2 ? pale : [255, 255, 255] as const));
      pdf.rect(margin, y, width - 2 * margin, 10, "F");
      txt(item.sequence, columnX[0] + cols[0] / 2, y + 6.4, cols[0] - 2, 8, "center");
      txt(item.agent, columnX[1] + 2, y + 6.4, cols[1] - 4, 9, "left", true);
      item.months.forEach((month, i) => {
        const x = columnX[i + 2] + cols[i + 2] / 2;
        const available = !month.hold && month.averageScore !== null;
        const eligible = available && month.caseCount >= 10;
        const tone = !eligible ? ink : month.averageScore! >= 85 ? [21, 128, 61] : [190, 24, 60];
        txt(month.hold ? "—" : score(month.averageScore), x, y + 4.3,
          cols[i + 2] - 2, 8.4, "center", true, tone);
        txt(month.hold ? "—" : month.caseCount + " cases", x, y + 8.1,
          cols[i + 2] - 2, 6.3, "center", false, muted);
      });
      txt(item.hold ? "—" : item.caseCount, columnX[14] + cols[14] / 2, y + 6.4,
        cols[14] - 2, 9, "center", true);
      txt(item.hold ? "—" : score(item.averageScore), columnX[15] + cols[15] / 2, y + 6.4,
        cols[15] - 2, 9, "center", true);
      txt(item.hold ? "—" : item.kpiEvaluatedMonths ? item.kpiPassedMonths + "/" + item.kpiEvaluatedMonths : "—",
        columnX[16] + cols[16] / 2, y + 6.4, cols[16] - 2, 8.5, "center");
      y += 10;
    }
    if (!report.agentMonths.length) txt("No agent records in current selection", margin + 3, 61, 180, 10, "left", false, muted);
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(225, 225, 235);
    pdf.line(margin, height - 12, width - margin, height - 12);
    txt("Robinhood QA | Monthly employee scores | No score = — | KPI Months = passed/eligible months",
      margin, height - 7, width - 100, 7.5, "left", false, muted);
    txt("Page " + page + " / " + pages, width - margin, height - 7, 70, 7.5, "right", false, muted);
  }
  pdf.setProperties({ title: "Yearly Agent Monthly Score Report " + reports.map(r => r.year).join(", "),
    subject: "Monthly QA scores and case counts per employee; annual weighted average", creator: "QA Dashboard" });
  return { pdf, fileName: fileName(reports, scope, "pdf") };
}
