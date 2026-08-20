function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics compare topic report patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsCompareTopicReportPatch() {
  let patched = false;

  return {
    name: "analytics-compare-topic-report",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;

      let next = code;

      const compareComponent = `
function AnalyticsCompareTopicDetail({
  periodReports,
  topicGroups,
}: {
  periodReports: any[];
  topicGroups: any[];
}) {
  if (!periodReports.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-normal text-slate-400">
        ไม่มีข้อมูล Topic สำหรับช่วงที่เลือกเปรียบเทียบ
      </div>
    );
  }

  return (
    <div data-analytics-topic-compare-v1="true" className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {periodReports.map((report, index) => {
          const monthKey = getPolicyMonthKeyForCases(report.cases || []);
          const target = getPerformanceKpiTarget(monthKey);
          const passed = Number(report.avgScore || 0) >= target;
          const previous = index > 0 ? periodReports[index - 1] : null;
          const delta = previous
            ? Number((Number(report.avgScore || 0) - Number(previous.avgScore || 0)).toFixed(2))
            : null;

          return (
            <div
              key={report.label}
              className={
                "rounded-2xl border px-4 py-4 " +
                (passed
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-rose-200 bg-rose-50/60")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                    Period {index + 1}
                  </div>
                  <div className="mt-1 break-words text-[12px] font-bold leading-5 text-slate-900">
                    {report.label}
                  </div>
                </div>
                <span
                  className={
                    "shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black " +
                    (passed
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700")
                  }
                >
                  {passed ? "PASS" : "FAIL"}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <div className="text-[9px] font-semibold text-slate-500">Average</div>
                  <div
                    className={
                      "mt-0.5 text-2xl font-black " +
                      (passed ? "text-emerald-700" : "text-rose-600")
                    }
                  >
                    {Number(report.avgScore || 0).toFixed(2)}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-semibold text-slate-500">Difference</div>
                  <div
                    className={
                      "mt-0.5 text-sm font-black " +
                      (delta === null
                        ? "text-slate-400"
                        : delta > 0
                          ? "text-emerald-700"
                          : delta < 0
                            ? "text-rose-600"
                            : "text-slate-500")
                    }
                  >
                    {delta === null
                      ? "Base"
                      : `${delta > 0 ? "+" : ""}${delta.toFixed(2)} pp`}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-slate-200/70 pt-3 text-[9px] font-semibold text-slate-500">
                <span>{report.caseCount} Cases</span>
                <span>Grade {report.grade}</span>
                <span>Target {target}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-[10px] font-semibold leading-5 text-violet-800">
        Difference แสดงการเปลี่ยนแปลงเป็น percentage point (pp) เทียบกับช่วงก่อนหน้าในลำดับ Compare • สีแดง = ต่ำกว่า Target • สีเขียว = ผ่าน Target
      </div>

      {topicGroups.map((group) => {
        const reports = Array.isArray(group.reports) ? group.reports : [];
        return (
          <section
            key={group.key}
            className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 bg-violet-50/70 px-4 py-4 sm:px-5">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Topic Comparison Matrix</div>
                <div className="mt-1 text-sm font-black text-slate-950">{group.label}</div>
              </div>
              <div className="rounded-full bg-white px-3 py-1.5 text-[9px] font-black text-violet-700 shadow-sm">
                {reports.length} Period{reports.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table
                className="w-full text-[10px]"
                style={{ minWidth: `${Math.max(760, 300 + reports.length * 180)}px` }}
              >
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="min-w-[300px] px-4 py-3 text-left font-semibold">Topic</th>
                    {reports.map((report: any) => (
                      <th key={report.label} className="min-w-[180px] px-3 py-3 text-center font-semibold">
                        {report.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.topics.map((topic: any, topicIndex: number) => (
                    <tr key={topic.code} className={topicIndex % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                      <td className="border-t border-slate-100 px-4 py-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span className="inline-flex min-w-[38px] shrink-0 justify-center rounded-lg bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700">
                            {topic.code}
                          </span>
                          <div className="pt-0.5 text-[11px] font-semibold leading-5 text-slate-800">
                            {topic.label}
                          </div>
                        </div>
                      </td>

                      {reports.map((report: any) => {
                        const value = topic.values.find((item: any) => item.period === report.label) || null;
                        const pct = value?.pct ?? null;
                        const delta = value?.delta ?? null;
                        const monthKey = getPolicyMonthKeyForCases(report.cases || []);
                        const target = getTopicKpiTarget(monthKey, topic.code);
                        const passed = pct !== null && Number(pct) >= target;

                        return (
                          <td key={`${topic.code}-${report.label}`} className="border-t border-slate-100 px-3 py-3 text-center align-middle">
                            {pct === null ? (
                              <div className="rounded-xl bg-slate-100 px-3 py-3 font-bold text-slate-400">No Data</div>
                            ) : (
                              <div
                                className={
                                  "rounded-xl border px-3 py-3 " +
                                  (passed
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                    : "border-rose-200 bg-rose-50 text-rose-700")
                                }
                              >
                                <div className="text-base font-black">{Number(pct).toFixed(2)}%</div>
                                <div className="mt-0.5 text-[9px] font-black">{passed ? "PASS" : "FAIL"} · Target {target}%</div>
                                <div
                                  className={
                                    "mt-2 border-t pt-2 text-[10px] font-black " +
                                    (delta === null
                                      ? "border-slate-200 text-slate-400"
                                      : delta > 0
                                        ? "border-emerald-200 text-emerald-700"
                                        : delta < 0
                                          ? "border-rose-200 text-rose-600"
                                          : "border-slate-200 text-slate-500")
                                  }
                                >
                                  {delta === null
                                    ? "Base"
                                    : `${delta > 0 ? "+" : ""}${Number(delta).toFixed(2)} pp vs Prev`}
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <div className="space-y-5">
        {periodReports.map((report, index) => {
          const monthKey = getPolicyMonthKeyForCases(report.cases || []);
          const previous = index > 0 ? periodReports[index - 1] : null;
          const overallDelta = previous
            ? Number((Number(report.avgScore || 0) - Number(previous.avgScore || 0)).toFixed(2))
            : null;

          return (
            <section key={`period-topic-${report.label}`} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-600">Period Topic Detail {index + 1}</div>
                  <div className="mt-1 text-[14px] font-black text-slate-950">{report.label}</div>
                  <div className="mt-1 text-[10px] font-semibold text-slate-500">
                    {report.caseCount} Cases · Average {Number(report.avgScore || 0).toFixed(2)}% · Grade {report.grade}
                  </div>
                </div>
                <div
                  className={
                    "rounded-xl px-3 py-2 text-center " +
                    (overallDelta === null
                      ? "bg-slate-100 text-slate-500"
                      : overallDelta >= 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-600")
                  }
                >
                  <div className="text-[9px] font-bold uppercase tracking-wide">Difference</div>
                  <div className="mt-0.5 text-sm font-black">
                    {overallDelta === null
                      ? "Base"
                      : `${overallDelta > 0 ? "+" : ""}${overallDelta.toFixed(2)} pp`}
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <AnalyticsTopicDetail topics={report.topics} monthKey={monthKey} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

`;

      next = replaceOrThrow(
        this,
        next,
        `function AnalyticsAgentPerformanceV92({`,
        `${compareComponent}function AnalyticsAgentPerformanceV92({`,
        "compare topic component anchor"
      );

      next = replaceOrThrow(
        this,
        next,
        `                              คะแนนเฉลี่ยรายหัวข้อเทียบกับเกณฑ์ KPI {getPerformanceKpiTarget(summaryCards.policyMonthKey)}%`,
        `                              {isComparisonMode\n                                ? "แยกคะแนนรายหัวข้อตามแต่ละช่วงที่เลือก พร้อม Difference เทียบช่วงก่อนหน้า"\n                                : <>คะแนนเฉลี่ยรายหัวข้อเทียบกับเกณฑ์ KPI {getPerformanceKpiTarget(summaryCards.policyMonthKey)}%</>}`,
        "topic detail compare subtitle"
      );

      next = replaceOrThrow(
        this,
        next,
        `                          <AnalyticsTopicDetail\n                            topics={topicSummary}\n                            monthKey={summaryCards.policyMonthKey}\n                          />`,
        `                          {isComparisonMode ? (\n                            <AnalyticsCompareTopicDetail\n                              periodReports={periodTopicReports}\n                              topicGroups={topicDifferenceGroups}\n                            />\n                          ) : (\n                            <AnalyticsTopicDetail\n                              topics={topicSummary}\n                              monthKey={summaryCards.policyMonthKey}\n                            />\n                          )}`,
        "topic detail compare branch"
      );

      const pdfComparisonBlock = `    if (isComparisonMode && topicDifferenceGroups.length) {\n      startNewPage();\n      drawSectionTitle(\n        "Topic Comparison by Period",\n        "PASS/FAIL follows each period Target; Difference is percentage-point change vs previous comparable period"\n      );\n\n      topicDifferenceGroups.forEach((group: any, groupIndex: number) => {\n        const reports = Array.isArray(group.reports) ? group.reports : [];\n        if (!reports.length) return;\n\n        if (groupIndex > 0) {\n          ensureSpace(24);\n          y += 4;\n        }\n\n        doc.setFillColor(246, 242, 255);\n        doc.setDrawColor(221, 214, 254);\n        doc.roundedRect(margin, y, contentWidth, 11, 2, 2, "FD");\n        doc.setFont("helvetica", "bold");\n        doc.setFontSize(7.5);\n        doc.setTextColor(91, 33, 182);\n        drawText(group.label, margin + 3, y + 7);\n        drawText(\n          reports.length + " Period" + (reports.length === 1 ? "" : "s"),\n          pageWidth - margin - 3,\n          y + 7,\n          { align: "right" }\n        );\n        y += 14;\n\n        const topicWidth = 64;\n        const periodWidth = (contentWidth - topicWidth) / Math.max(1, reports.length);\n        const headerHeight = 14;\n\n        doc.setFillColor(30, 41, 59);\n        doc.roundedRect(margin, y, contentWidth, headerHeight, 2, 2, "F");\n        doc.setFont("helvetica", "bold");\n        doc.setFontSize(5.7);\n        drawText("Topic", margin + 3, y + 8, { color: "#ffffff" });\n\n        reports.forEach((report: any, index: number) => {\n          const centerX = margin + topicWidth + periodWidth * index + periodWidth / 2;\n          wrapText(report.label, 16, 2).forEach((line, lineIndex) => {\n            drawText(line, centerX, y + 5.5 + lineIndex * 3.2, { align: "center", color: "#ffffff" });\n          });\n        });\n        y += headerHeight;\n\n        group.topics.forEach((topic: any, topicIndex: number) => {\n          const topicLines = wrapText(topic.code + ". " + topic.label, 34, 2);\n          const rowHeight = Math.max(13, 4 + topicLines.length * 3.6);\n          if (y + rowHeight > contentBottom) {\n            startNewPage();\n            drawSectionTitle("Topic Comparison by Period (continued)", group.label);\n            doc.setFillColor(30, 41, 59);\n            doc.roundedRect(margin, y, contentWidth, headerHeight, 2, 2, "F");\n            doc.setFont("helvetica", "bold");\n            doc.setFontSize(5.7);\n            drawText("Topic", margin + 3, y + 8, { color: "#ffffff" });\n            reports.forEach((report: any, index: number) => {\n              const centerX = margin + topicWidth + periodWidth * index + periodWidth / 2;\n              wrapText(report.label, 16, 2).forEach((line, lineIndex) => {\n                drawText(line, centerX, y + 5.5 + lineIndex * 3.2, { align: "center", color: "#ffffff" });\n              });\n            });\n            y += headerHeight;\n          }\n\n          doc.setFillColor(\n            topicIndex % 2 === 0 ? 255 : 248,\n            topicIndex % 2 === 0 ? 255 : 250,\n            topicIndex % 2 === 0 ? 255 : 252\n          );\n          doc.setDrawColor(226, 232, 240);\n          doc.rect(margin, y, contentWidth, rowHeight, "FD");\n\n          doc.setFont("helvetica", "normal");\n          doc.setFontSize(5.8);\n          doc.setTextColor(51, 65, 85);\n          topicLines.forEach((line: string, lineIndex: number) => {\n            drawText(line, margin + 3, y + 5 + lineIndex * 3.6);\n          });\n\n          reports.forEach((report: any, reportIndex: number) => {\n            const centerX = margin + topicWidth + periodWidth * reportIndex + periodWidth / 2;\n            const value = topic.values.find((item: any) => item.period === report.label) || null;\n            const pct = value?.pct ?? null;\n            const delta = value?.delta ?? null;\n\n            if (pct === null) {\n              doc.setFont("helvetica", "bold");\n              doc.setFontSize(5.5);\n              doc.setTextColor(148, 163, 184);\n              drawText("No Data", centerX, y + 7, { align: "center" });\n              return;\n            }\n\n            const monthKey = getPolicyMonthKeyForCases(report.cases || []);\n            const target = getTopicKpiTarget(monthKey, topic.code);\n            const passed = Number(pct) >= target;\n            doc.setFont("helvetica", "bold");\n            doc.setFontSize(6.2);\n            doc.setTextColor(\n              passed ? 5 : 190,\n              passed ? 150 : 24,\n              passed ? 105 : 93\n            );\n            drawText(\n              Number(pct).toFixed(2) + "% " + (passed ? "PASS" : "FAIL"),\n              centerX,\n              y + 5.5,\n              { align: "center" }\n            );\n\n            doc.setFontSize(5);\n            doc.setTextColor(\n              delta === null ? 148 : delta > 0 ? 5 : delta < 0 ? 190 : 100,\n              delta === null ? 163 : delta > 0 ? 150 : delta < 0 ? 24 : 116,\n              delta === null ? 184 : delta > 0 ? 105 : delta < 0 ? 93 : 139\n            );\n            drawText(\n              delta === null\n                ? "Base"\n                : "Diff " + (delta > 0 ? "+" : "") + Number(delta).toFixed(2) + " pp",\n              centerX,\n              y + 10,\n              { align: "center" }\n            );\n          });\n\n          y += rowHeight;\n        });\n\n        y += 6;\n      });\n    }\n\n`;

      next = replaceOrThrow(
        this,
        next,
        `    periodTopicReports.forEach((report, reportIndex) => {`,
        `${pdfComparisonBlock}    periodTopicReports.forEach((report, reportIndex) => {`,
        "PDF topic comparison matrix"
      );

      next = replaceOrThrow(
        this,
        next,
        `      drawSectionTitle(\n        \`Topic Performance — \${report.label}\`,\n        \`\${report.caseCount} Cases • Average \${report.avgScore.toFixed(2)} • \${report.status}\`\n      );`,
        `      const previousPeriodReport = reportIndex > 0 ? periodTopicReports[reportIndex - 1] : null;\n      const periodScoreDifference = previousPeriodReport\n        ? Number((report.avgScore - previousPeriodReport.avgScore).toFixed(2))\n        : null;\n\n      drawSectionTitle(\n        \`Period Topic Detail - \${report.label}\`,\n        \`\${report.caseCount} Cases • Average \${report.avgScore.toFixed(2)} • \${report.status} • Difference \${periodScoreDifference === null ? "Base" : (periodScoreDifference > 0 ? "+" : "") + periodScoreDifference.toFixed(2) + " pp"}\`\n      );`,
        "PDF period topic title difference"
      );

      next = replaceOrThrow(
        this,
        next,
        `        doc.setTextColor(109, 40, 217);\n        drawText(\n          topic.pct.toFixed(2) + "%",\n          pageWidth - margin - 14,\n          y + 5.6,\n          { align: "center" }\n        );`,
        `        const topicTarget = getTopicKpiTarget(\n          getPolicyMonthKeyForCases(report.cases || []),\n          topic.code\n        );\n        const topicPassed = topic.pct >= topicTarget;\n        doc.setTextColor(\n          topicPassed ? 5 : 190,\n          topicPassed ? 150 : 24,\n          topicPassed ? 105 : 93\n        );\n        doc.setFontSize(6.2);\n        drawText(\n          topic.pct.toFixed(2) + "% " + (topicPassed ? "PASS" : "FAIL"),\n          pageWidth - margin - 14,\n          y + 5.6,\n          { align: "center" }\n        );`,
        "PDF topic KPI color status"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics compare topic report patch was not applied.");
    },
  };
}
