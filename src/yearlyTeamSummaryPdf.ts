import {reportPdfFilename} from './reportPdfFilename';
import { jsPDF } from "jspdf";
import type { YearlyTeamReport, YearlyStats } from "./yearlyTeamSummaryData";

// This PDF shares its input report models and verification gate with Yearly Excel.
// It must not independently recalculate case totals, grades, appeal scores or rankings.
export function createYearlyTeamSummaryPdf(
  reports: readonly YearlyTeamReport[],
  scope: { team: string; agent: string }
) {
  if (!reports.length) throw new Error("กรุณาเลือกปีที่ต้องการออกรายงาน");
  const hold = reports.find(report => report.hold)?.hold;
  if (hold) throw new Error(hold.label);

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const ink = [35, 44, 66] as const;
  const subtle = [99, 112, 136] as const;
  const violet = [81, 54, 142] as const;
  const light = [247, 245, 252] as const;
  const shade = [244, 247, 251] as const;
  let firstPage = true;

  const asText = (value: unknown) => String(value ?? "-").replace(/\s+/g, " ").trim() || "-";
  const fmtScore = (value: number | null) => value === null ? "-" : value.toFixed(2);
  const fmtValue = (stats: YearlyStats, value: number | string) => stats.hold ? "-" : String(value);
  const fill = (color: readonly number[]) => pdf.setFillColor(color[0], color[1], color[2]);
  const stroke = (color: readonly number[]) => pdf.setDrawColor(color[0], color[1], color[2]);
  const colorText = (color: readonly number[]) => pdf.setTextColor(color[0], color[1], color[2]);

  // jsPDF's built-in Helvetica cannot represent Thai. Draw Thai labels as
  // high-resolution canvas glyphs; ASCII remains searchable vector text.
  const draw = (
    input: unknown, x: number, baseline: number, maxWidth: number,
    fontSize = 9, bold = false, align: "left" | "center" | "right" = "left",
    tone: readonly number[] = ink
  ) => {
    let value = asText(input);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(fontSize);
    colorText(tone);
    const isNonAscii = /[^\x20-\x7E]/.test(value);
    const truncate = (measure: (value: string) => number) => {
      if (measure(value) <= maxWidth) return;
      while (value.length > 1 && measure(value + "...") > maxWidth) value = value.slice(0, -1);
      value += "...";
    };
    if (!isNonAscii || typeof document === "undefined") {
      truncate(text => pdf.getTextWidth(text));
      pdf.text(value, x, baseline, { align });
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context) {
        const dpiScale = 3;
        const fontPx = fontSize * (96 / 72) * dpiScale;
        const family = '"Sarabun", "Noto Sans Thai", Tahoma, sans-serif';
        context.font = (bold ? "700 " : "400 ") + fontPx + "px " + family;
        const measure = (text: string) => context.measureText(text).width * 25.4 / (96 * dpiScale);
        truncate(measure);
        const pixelWidth = Math.ceil(context.measureText(value).width + 12 * dpiScale);
        const pixelHeight = Math.ceil(fontPx * 1.42);
        canvas.width = Math.max(10, pixelWidth);
        canvas.height = Math.max(10, pixelHeight);
        const painter = canvas.getContext("2d");
        if (painter) {
          painter.font = (bold ? "700 " : "400 ") + fontPx + "px " + family;
          painter.textBaseline = "alphabetic";
          painter.fillStyle = "rgb(" + tone[0] + "," + tone[1] + "," + tone[2] + ")";
          painter.fillText(value, 4 * dpiScale, pixelHeight * 0.76);
          const imageWidth = canvas.width * 25.4 / (96 * dpiScale);
          const imageHeight = canvas.height * 25.4 / (96 * dpiScale);
          let left = x;
          if (align === "right") left = x - imageWidth;
          if (align === "center") left = x - imageWidth / 2;
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", left, baseline - imageHeight * 0.76,
            imageWidth, imageHeight, undefined, "FAST");
          return;
        }
      }
    } catch {
      // A browser without canvas can still export the numerical report.
    }
    truncate(text => pdf.getTextWidth(text));
    pdf.text(value, x, baseline, { align });
  };

  const newPage = () => {
    if (!firstPage) pdf.addPage("a4", "landscape");
    firstPage = false;
  };
  const header = (year: string, subheading: string) => {
    fill(violet);
    pdf.rect(0, 0, pageWidth, 14, "F");
    draw("QA YEARLY TEAM SUMMARY", margin, 9.3, contentWidth - 55, 13, true, "left", [255, 255, 255]);
    draw(year, pageWidth - margin, 9.3, 40, 13, true, "right", [255, 255, 255]);
    draw(subheading, margin, 23, contentWidth, 8.4, false, "left", subtle);
    draw("Team: " + scope.team, margin, 29.5, contentWidth * 0.54, 9, true);
    draw("Agent: " + scope.agent, pageWidth - margin, 29.5, contentWidth * 0.42, 9, true, "right");
  };
  const section = (name: string, y: number) => {
    draw(name, margin, y, contentWidth, 10, true, "left", violet);
    stroke([225, 218, 239]);
    pdf.setLineWidth(0.25);
    pdf.line(margin, y + 3.2, pageWidth - margin, y + 3.2);
  };
  const table = (labels: string[], widths: number[], top: number, body: (y: number) => void) => {
    let x = margin;
    fill(violet);
    pdf.roundedRect(margin, top, contentWidth, 8.4, 1.8, 1.8, "F");
    labels.forEach((name, index) => {
      draw(name, x + (index === 0 ? 2.5 : widths[index] / 2), top + 5.5,
        widths[index] - 4, 8, true, index === 0 ? "left" : "center", [255, 255, 255]);
      x += widths[index];
    });
    body(top + 8.4);
  };
  const footer = () => {
    const total = pdf.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      stroke([222, 226, 233]);
      pdf.setLineWidth(0.18);
      pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      draw("Robinhood Quality Assurance | Yearly Team Summary", margin, pageHeight - 7.2,
        contentWidth * 0.74, 7, false, "left", subtle);
      draw("Page " + i + " of " + total, pageWidth - margin, pageHeight - 7.2, 50, 7, false, "right", subtle);
    }
  };

  for (const report of reports) {
    newPage();
    header(report.year, "Annual QA performance | January - December " + report.year);
    const cards = [
      ["TEAM CASES", String(report.caseCount)],
      ["AVERAGE QA SCORE", fmtScore(report.averageScore)],
      ["CRITICAL CASES", String(report.criticalCount)],
      ["MONTHS IN YEAR", "12"],
    ] as const;
    const cardGap = 4.5;
    const cardW = (contentWidth - cardGap * 3) / 4;
    cards.forEach(([label, value], index) => {
      const x = margin + index * (cardW + cardGap);
      fill(light);
      pdf.roundedRect(x, 35, cardW, 21, 2.4, 2.4, "F");
      draw(label, x + 3.4, 42.3, cardW - 7, 8, true, "left", subtle);
      draw(value, x + 3.4, 51.1, cardW - 7, 17, true, "left", ink);
    });
    section("MONTHLY TEAM TREND", 65);
    const monthWidths = [59, 28, 35, 31, 25, 25, 25, contentWidth - 228];
    table(["Month", "Cases", "Avg Score", "Critical", "A", "B", "C", "D/F/G"], monthWidths, 70, firstY => {
      report.months.forEach((month, index) => {
        const y = firstY + index * 6.75;
        fill(index % 2 === 0 ? shade : [255, 255, 255]);
        pdf.rect(margin, y, contentWidth, 6.75, "F");
        const values = [month.label, fmtValue(month, month.caseCount),
          month.hold ? "-" : fmtScore(month.averageScore),
          fmtValue(month, month.criticalCount), fmtValue(month, month.aGrade),
          fmtValue(month, month.bGrade), fmtValue(month, month.cGrade),
          fmtValue(month, month.otherGrade)];
        let x = margin;
        values.forEach((value, col) => {
          draw(value, col === 0 ? x + 2.5 : x + monthWidths[col] / 2,
            y + 4.55, monthWidths[col] - 4, 9, col === 0,
            col === 0 ? "left" : "center");
          x += monthWidths[col];
        });
      });
    });
    section("TOP / BOTTOM AGENT BY YEAR", 167.5);
    const rankingRows = [
      ["Top Avg Score Agent", report.topAgents],
      ["Bottom Avg Score Agent", report.bottomAgents],
    ] as const;
    rankingRows.forEach(([label, items], index) => {
      const y = 172 + 9 * index;
      fill(index === 0 ? shade : light);
      pdf.roundedRect(margin, y, contentWidth, 8.3, 1.4, 1.4, "F");
      draw(label, margin + 3, y + 5.6, 68, 8.4, true, "left", violet);
      const value = items.length
        ? items.map(item => item.agent + " (" + fmtScore(item.averageScore) + ")").join(", ")
        : "-";
      draw(value, margin + 72, y + 5.6, contentWidth - 76, 8.2);
    });

    // Agent rows begin on a separate page, where the table can paginate
    // without clipping names or changing the source data.
    let pageRow = 0;
    const agentWidth = [20, 135, 36, 42, contentWidth - 233];
    const startAgentsPage = (continued: boolean) => {
      newPage();
      header(report.year, "AGENT SUMMARY" + (continued ? " - CONTINUED" : ""));
      section("AGENT SUMMARY - " + report.year, 38);
      table(["Seq", "Agent", "Cases", "Avg Score", "Critical"], agentWidth, 43,
        () => {});
      pageRow = 0;
    };
    startAgentsPage(false);
    report.agents.forEach(item => {
      if (pageRow >= 19) startAgentsPage(true);
      const y = 51.4 + pageRow * 7.15;
      fill(pageRow % 2 ? [255, 255, 255] : shade);
      pdf.rect(margin, y, contentWidth, 7.15, "F");
      const values = [String(item.sequence), item.agent,
        fmtValue(item, item.caseCount), item.hold ? "-" : fmtScore(item.averageScore),
        fmtValue(item, item.criticalCount)];
      let x = margin;
      values.forEach((value, index) => {
        draw(value, index === 1 ? x + 2.4 : x + agentWidth[index] / 2,
          y + 4.8, agentWidth[index] - 5, 9, index === 1,
          index === 1 ? "left" : "center");
        x += agentWidth[index];
      });
      pageRow++;
    });
    if (!report.agents.length) draw("No Agent records", margin + 3, 60, contentWidth - 6, 9, false, "left", subtle);
  }
  footer();
  pdf.setProperties({ title: "Yearly Team Summary " + reports.map(item => item.year).join(", "),
    subject: "QA annual monthly trend, agent rankings and confirmed case results",
    creator: "QA Dashboard" });
  return {pdf,fileName:reportPdfFilename('Yearly',reports.map(item=>String(item.year)),scope)};
}
