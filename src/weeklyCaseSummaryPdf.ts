import { jsPDF } from "jspdf";
import { registerTHSarabunNew } from "./THSarabunNew-jsPDF";
import { scoreToGrade } from "./lib/scoreIncentivePolicy";

function caseDate(item: any) {
  return String(item?.caseDate || item?.auditDate || item?.evaluationAuditDate || "-");
}

function activeTopics(item: any) {
  const base = Array.isArray(item?.topics) ? item.topics : [];
  const revised = Array.isArray(item?.revisedTopics) ? item.revisedTopics : [];
  if (!revised.length) return base;
  const revisedMap = new Map(revised.map((topic: any) => [String(topic?.code || ""), topic]));
  return base.map((topic: any) => revisedMap.get(String(topic?.code || "")) || topic);
}

export function appendWeeklyCaseSummaryForAgent({
  doc,
  cases,
  monthKey,
  weekLabel,
  agentName,
  appendPage,
}: {
  doc: jsPDF;
  cases: any[];
  monthKey: string;
  weekLabel: string;
  agentName: string;
  appendPage: boolean;
}) {
  const sortedCases = [...cases].sort((a, b) => {
    const da = new Date(a?.caseDate || a?.auditDate || a?.auditTimestamp || "").getTime() || 0;
    const db = new Date(b?.caseDate || b?.auditDate || b?.auditTimestamp || "").getTime() || 0;
    return da - db || String(a?.caseId || "").localeCompare(String(b?.caseId || ""));
  });
  if (!sortedCases.length) return false;

  if (appendPage) doc.addPage();
  registerTHSarabunNew(doc as any);

  const PURPLE: [number, number, number] = [112, 48, 160];
  const DARK_PURPLE: [number, number, number] = [91, 44, 131];
  const LIGHT_PURPLE: [number, number, number] = [231, 221, 241];
  const BORDER: [number, number, number] = [184, 184, 184];
  const BLACK: [number, number, number] = [18, 24, 38];
  const GOOD: [number, number, number] = [5, 150, 105];
  const WARN: [number, number, number] = [190, 24, 93];
  const WHITE: [number, number, number] = [255, 255, 255];
  const left = 10;
  const tableW = 186;
  let y = 10;

  const setFont = (size: number, bold = false, color: [number, number, number] = BLACK) => {
    try {
      doc.setFont("THSarabunNew", bold ? "bold" : "normal");
    } catch {
      doc.setFont("helvetica", bold ? "bold" : "normal");
    }
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const cell = (
    x: number,
    yy: number,
    w: number,
    h: number,
    text: unknown,
    fill: [number, number, number],
    options: {
      bold?: boolean;
      size?: number;
      color?: [number, number, number];
      align?: "left" | "center" | "right";
      maxLines?: number;
    } = {}
  ) => {
    doc.setLineWidth(0.15);
    doc.setDrawColor(...BORDER);
    doc.setFillColor(...fill);
    doc.rect(x, yy, w, h, "FD");
    const size = options.size ?? 8;
    const align = options.align ?? "left";
    setFont(size, options.bold ?? false, options.color ?? BLACK);
    const lines = doc
      .splitTextToSize(String(text ?? "-"), Math.max(4, w - 4))
      .slice(0, options.maxLines ?? 2);
    const gap = size * 0.42 + 1.2;
    const startY = yy + h / 2 - ((lines.length - 1) * gap) / 2 + size * 0.22;
    const tx = align === "center" ? x + w / 2 : align === "right" ? x + w - 2 : x + 2;
    lines.forEach((line: string, index: number) => doc.text(line, tx, startY + index * gap, { align }));
  };

  const section = (title: string) => {
    cell(left, y, tableW, 7.2, title, PURPLE, { bold: true, size: 10, color: WHITE });
    y += 8;
  };

  const averageScore = sortedCases.reduce((sum, item) => sum + Number(item?.finalScore || 0), 0) / sortedCases.length;
  const grade = scoreToGrade(averageScore, monthKey) as any;
  const kpiPassed = averageScore >= 85;
  const teamName = String(sortedCases[0]?.teamName || "-");

  cell(left, y, tableW, 9.2, "Weekly QA Dashboard", PURPLE, { bold: true, size: 15.6, color: WHITE });
  y += 9.2;
  cell(
    left,
    y,
    tableW,
    7,
    "Weekly dashboard for the selected Agent and selected Week. Values are generated from the current QA system.",
    PURPLE,
    { bold: true, size: 8.6, color: WHITE }
  );
  y += 8.2;

  section("Current View");
  const widths = [23, 50, 20, 55, 18, 20];
  const pairs = [
    ["Agent", `${agentName}\n(${teamName})`],
    ["Week", weekLabel],
    ["Reviewed Cases", String(sortedCases.length)],
  ];
  let x = left;
  pairs.forEach(([label, value], index) => {
    const labelW = widths[index * 2];
    const valueW = widths[index * 2 + 1];
    cell(x, y, labelW, 12, label, DARK_PURPLE, { bold: true, size: 8, align: "center", color: WHITE });
    x += labelW;
    cell(x, y, valueW, 12, value, LIGHT_PURPLE, { bold: true, size: 8.4, align: "center", maxLines: 2 });
    x += valueW;
  });
  y += 14;

  const metricW = tableW / 4;
  ["Reviewed Cases", "Average Score", "Weekly Grade", "KPI Status"].forEach((label, index) =>
    cell(left + index * metricW, y, metricW, 7.4, label, PURPLE, { bold: true, size: 8.4, align: "center", color: WHITE })
  );
  y += 7.4;
  const metricValues = [String(sortedCases.length), averageScore.toFixed(2), String(grade), kpiPassed ? "Passed" : "Not Passed"];
  metricValues.forEach((value, index) =>
    cell(left + index * metricW, y, metricW, 10.8, value, LIGHT_PURPLE, {
      bold: true,
      size: 12.4,
      align: "center",
      color: index === 1 || index === 3 ? (kpiPassed ? GOOD : WARN) : BLACK,
    })
  );
  y += 13;

  section("Weekly Case List");
  const caseWidths = [9, 22, 24, 79, 17, 12, 23];
  const caseHeaders = ["Seq", "Case Date", "Case ID", "Inquiry", "Score", "Grade", "KPI Status"];
  x = left;
  caseHeaders.forEach((header, index) => {
    cell(x, y, caseWidths[index], 7.2, header, PURPLE, { bold: true, size: 7.4, align: "center", color: WHITE });
    x += caseWidths[index];
  });
  y += 7.2;

  const visibleCases = sortedCases.slice(0, 10);
  visibleCases.forEach((item, index) => {
    const fill: [number, number, number] = index % 2 === 0 ? WHITE : [250, 247, 253];
    const score = Number(item?.finalScore || 0);
    const itemGrade = item?.grade || scoreToGrade(score, item?.monthKey || monthKey);
    const values = [
      index + 1,
      caseDate(item),
      item?.caseId || "-",
      item?.inquiryTh || item?.inquiryEn || "-",
      score.toFixed(2),
      itemGrade,
      score >= 85 ? "Passed" : "Not Passed",
    ];
    x = left;
    values.forEach((value, valueIndex) => {
      cell(x, y, caseWidths[valueIndex], 8.2, value, fill, {
        bold: true,
        size: valueIndex === 3 ? 6.8 : 7.2,
        align: valueIndex === 3 ? "left" : "center",
        maxLines: valueIndex === 3 ? 2 : 1,
        color: valueIndex === 6 ? (score >= 85 ? GOOD : WARN) : BLACK,
      });
      x += caseWidths[valueIndex];
    });
    y += 8.2;
  });

  if (sortedCases.length > visibleCases.length) {
    cell(left, y, tableW, 7.2, `+ ${sortedCases.length - visibleCases.length} more case(s) in this week`, [250, 247, 253], {
      bold: true,
      size: 7.8,
      align: "center",
    });
    y += 7.2;
  }

  const topicMap = new Map<string, { label: string; score: number; max: number; count: number }>();
  sortedCases.forEach((item) => {
    activeTopics(item).forEach((topic: any) => {
      const code = String(topic?.code || "").trim();
      const max = Number(topic?.max || 0);
      if (!code || max <= 0) return;
      const current = topicMap.get(code) || { label: String(topic?.label || code), score: 0, max: 0, count: 0 };
      current.score += Number(topic?.score || 0);
      current.max += max;
      current.count += 1;
      topicMap.set(code, current);
    });
  });

  y += 3;
  section("Weekly Topic Performance");
  const topicRows = [...topicMap.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  const topicWidths = [16, 78, 26, 18, 24, 24];
  x = left;
  ["Topic", "Description", "Avg Score", "Max", "Avg %", "KPI Status"].forEach((header, index) => {
    cell(x, y, topicWidths[index], 7.2, header, PURPLE, { bold: true, size: 7.5, align: "center", color: WHITE });
    x += topicWidths[index];
  });
  y += 7.2;

  topicRows.forEach(([code, row], index) => {
    const avgScore = row.count ? row.score / row.count : 0;
    const avgMax = row.count ? row.max / row.count : 0;
    const pct = avgMax > 0 ? (avgScore / avgMax) * 100 : 0;
    const passed = pct >= 85;
    const fill: [number, number, number] = index % 2 === 0 ? WHITE : [250, 247, 253];
    const values = [code, row.label, avgScore.toFixed(2), avgMax.toFixed(0), `${pct.toFixed(2)}%`, passed ? "Passed" : "Not Passed"];
    x = left;
    values.forEach((value, valueIndex) => {
      cell(x, y, topicWidths[valueIndex], 8.6, value, fill, {
        bold: true,
        size: valueIndex === 1 ? 6.8 : 7.1,
        align: valueIndex === 1 ? "left" : "center",
        maxLines: valueIndex === 1 ? 2 : 1,
        color: valueIndex === 5 ? (passed ? GOOD : WARN) : BLACK,
      });
      x += topicWidths[valueIndex];
    });
    y += 8.6;
  });

  return true;
}
