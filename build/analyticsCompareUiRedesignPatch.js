function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics compare UI redesign patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsCompareUiRedesignPatch() {
  let patched = false;

  return {
    name: "analytics-compare-ui-redesign",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;

      let next = code;

      const compareUi = String.raw`
function AnalyticsCompareDashboardV2({
  periodReports,
  topicGroups,
  reportModeName,
  summary,
}: {
  periodReports: any[];
  topicGroups: any[];
  reportModeName: string;
  summary: any;
}) {
  if (!Array.isArray(periodReports) || periodReports.length < 2) return null;

  const firstReport = periodReports[0];
  const lastReport = periodReports[periodReports.length - 1];
  const overallDelta = Number(
    (Number(lastReport?.avgScore || 0) - Number(firstReport?.avgScore || 0)).toFixed(2)
  );
  const totalCases = periodReports.reduce(
    (sum, report) => sum + Number(report?.caseCount || 0),
    0
  );
  const driverTransitions = buildAnalyticsIntentDriverSummary(periodReports);
  const differentCriteria = topicGroups.length > 1;

  const topicCards = topicGroups.flatMap((group: any) => {
    const reports = Array.isArray(group?.reports) ? group.reports : [];
    return (group?.topics || []).map((topic: any) => {
      const values = reports
        .map((report: any) => {
          const value = (topic.values || []).find((item: any) => item.period === report.label);
          return {
            report,
            pct: value?.pct ?? null,
          };
        })
        .filter((item: any) => item.pct !== null);

      const first = values[0] || null;
      const last = values[values.length - 1] || null;
      const delta = first && last
        ? Number((Number(last.pct) - Number(first.pct)).toFixed(2))
        : null;
      const target = last
        ? getTopicKpiTarget(
            getPolicyMonthKeyForCases(last.report?.cases || []),
            topic.code
          )
        : PERFORMANCE_KPI_TARGET;

      return {
        key: String(group.key || "group") + "-" + String(topic.code || "topic"),
        code: String(topic.code || ""),
        label: String(topic.label || topic.code || "Topic"),
        first,
        last,
        delta,
        target,
        passed: last ? Number(last.pct) >= target : false,
      };
    });
  });

  const formatDelta = (value: number | null) => {
    if (value === null) return "N/A";
    return (value > 0 ? "+" : "") + value.toFixed(2) + " pp";
  };

  return (
    <div data-analytics-compare-redesign-v1="true" className="space-y-5">
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">Compare Analytics</div>
            <div className="mt-1 text-lg font-black text-slate-950">เปรียบเทียบผล QA ตามช่วงเวลาที่เลือก</div>
            <div className="mt-1 text-[10px] font-medium text-slate-500">{reportModeName} Comparison · แสดงคะแนน ความต่าง และสาเหตุหลักในมุม Report</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-violet-50 px-3 py-1.5 text-[10px] font-black text-violet-700">{periodReports.length} Periods</span>
            {differentCriteria ? (
              <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[10px] font-black text-amber-700">Different QA Criteria</span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
          <div>
            <div className="text-[11px] font-black text-slate-800">ช่วงเวลาที่เปรียบเทียบ</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {periodReports.map((report, index) => {
                const isFirst = index === 0;
                const isLast = index === periodReports.length - 1;
                const target = getPerformanceKpiTarget(getPolicyMonthKeyForCases(report.cases || []));
                const passed = Number(report.avgScore || 0) >= target;
                return (
                  <div
                    key={report.label}
                    className={
                      "relative rounded-2xl border px-4 py-4 " +
                      (isLast
                        ? "border-blue-200 bg-blue-50/60"
                        : isFirst
                          ? "border-emerald-200 bg-emerald-50/50"
                          : "border-slate-200 bg-slate-50/60")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={"text-[9px] font-black uppercase tracking-[0.12em] " + (isLast ? "text-blue-600" : isFirst ? "text-emerald-600" : "text-slate-400")}>
                          {isFirst ? "ช่วงแรก" : isLast ? "ช่วงล่าสุด" : "ช่วงที่ " + (index + 1)}
                        </div>
                        <div className="mt-1 text-[13px] font-black text-slate-950">{report.label}</div>
                      </div>
                      <span className={"rounded-full px-2.5 py-1 text-[9px] font-black " + (passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                        {passed ? "PASS" : "FAIL"}
                      </span>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-4 border-t border-slate-200/70 pt-3">
                      <div>
                        <div className="text-[9px] font-semibold text-slate-500">Average Score</div>
                        <div className="mt-0.5 text-xl font-black text-slate-950">{Number(report.avgScore || 0).toFixed(2)}%</div>
                      </div>
                      <div className="text-right text-[9px] font-semibold text-slate-500">
                        <div>{report.caseCount} Cases</div>
                        <div className="mt-1">Grade {report.grade}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="text-[11px] font-black text-slate-800">ภาพรวมการเปรียบเทียบ</div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white px-3 py-3 text-center shadow-sm">
                <div className="text-[9px] font-semibold text-slate-400">รวมเคส</div>
                <div className="mt-1 text-lg font-black text-slate-950">{totalCases}</div>
              </div>
              <div className="rounded-xl bg-white px-3 py-3 text-center shadow-sm">
                <div className="text-[9px] font-semibold text-slate-400">คะแนนเฉลี่ยรวม</div>
                <div className="mt-1 text-lg font-black text-slate-950">{Number(summary?.avgScore || 0).toFixed(2)}%</div>
              </div>
              <div className="rounded-xl bg-white px-3 py-3 text-center shadow-sm">
                <div className="text-[9px] font-semibold text-slate-400">เกรดรวม</div>
                <div className="mt-1 text-lg font-black text-slate-950">{summary?.grade || "-"}</div>
              </div>
            </div>
            <div className={"mt-3 rounded-xl border px-4 py-3 " + (overallDelta > 0 ? "border-emerald-200 bg-emerald-50" : overallDelta < 0 ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[9px] font-bold text-slate-500">ช่วงล่าสุดเทียบช่วงแรก</div>
                  <div className={"mt-0.5 text-lg font-black " + (overallDelta > 0 ? "text-emerald-700" : overallDelta < 0 ? "text-rose-600" : "text-slate-600")}>
                    {formatDelta(overallDelta)}
                  </div>
                </div>
                <div className={"rounded-full px-2.5 py-1 text-[9px] font-black " + (overallDelta > 0 ? "bg-emerald-100 text-emerald-700" : overallDelta < 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>
                  {overallDelta > 0 ? "ดีขึ้น" : overallDelta < 0 ? "ลดลง" : "คงที่"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Topic Summary</div>
            <div className="mt-1 text-[15px] font-black text-slate-950">สรุปคะแนนรายหัวข้อ</div>
            <div className="mt-1 text-[10px] font-medium text-slate-500">เห็นคะแนนช่วงแรก ช่วงล่าสุด และ Difference ในจุดเดียว</div>
          </div>
          <div className="text-[9px] font-semibold text-slate-400">สีพื้น = สถานะช่วงล่าสุดเทียบ Target</div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {topicCards.map((topic: any) => (
            <div
              key={topic.key}
              className={
                "overflow-hidden rounded-2xl border " +
                (topic.passed
                  ? "border-emerald-200 bg-emerald-50/35"
                  : "border-rose-200 bg-rose-50/45")
              }
            >
              <div className="flex min-h-[72px] items-start gap-3 border-b border-slate-200/70 px-4 py-3">
                <span className={"inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black " + (topic.passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                  {topic.code}
                </span>
                <div className="min-w-0 text-[11px] font-black leading-5 text-slate-900">{topic.label}</div>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-200/70 px-2 py-4 text-center">
                <div>
                  <div className="text-[9px] font-semibold text-slate-400">ช่วงแรก</div>
                  <div className="mt-1 text-base font-black text-slate-800">{topic.first ? Number(topic.first.pct).toFixed(2) + "%" : "N/A"}</div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold text-slate-400">ช่วงล่าสุด</div>
                  <div className={"mt-1 text-base font-black " + (topic.passed ? "text-emerald-700" : "text-rose-600")}>
                    {topic.last ? Number(topic.last.pct).toFixed(2) + "%" : "N/A"}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200/70 bg-white/70 px-4 py-2.5">
                <span className="text-[9px] font-semibold text-slate-500">Target {topic.target}%</span>
                <span className={"text-[10px] font-black " + (topic.delta === null ? "text-slate-400" : topic.delta > 0 ? "text-emerald-700" : topic.delta < 0 ? "text-rose-600" : "text-slate-600")}>
                  {formatDelta(topic.delta)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {topicGroups.map((group: any) => {
        const reports = Array.isArray(group?.reports) ? group.reports : [];
        return (
          <section key={group.key} className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Topic Comparison Matrix</div>
                <div className="mt-1 text-[15px] font-black text-slate-950">เปรียบเทียบคะแนนรายหัวข้อ</div>
                {differentCriteria ? <div className="mt-1 text-[9px] font-semibold text-amber-600">Criteria: {group.label}</div> : null}
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black text-slate-600">{reports.length} Periods</div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[10px]" style={{ minWidth: String(Math.max(820, 300 + reports.length * 180 + 120)) + "px" }}>
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="min-w-[280px] px-4 py-3 text-left font-semibold">หัวข้อ (Topic)</th>
                    {reports.map((report: any) => (
                      <th key={report.label} className="min-w-[180px] px-3 py-3 text-center font-semibold">{report.label}</th>
                    ))}
                    <th className="min-w-[120px] px-3 py-3 text-center font-semibold">เปลี่ยนแปลง</th>
                  </tr>
                </thead>
                <tbody>
                  {(group.topics || []).map((topic: any, topicIndex: number) => {
                    const availableValues = (topic.values || []).filter((value: any) => value.pct !== null && value.pct !== undefined);
                    const firstPct = availableValues.length ? Number(availableValues[0].pct) : null;
                    const lastPct = availableValues.length ? Number(availableValues[availableValues.length - 1].pct) : null;
                    const rowDelta = firstPct !== null && lastPct !== null ? Number((lastPct - firstPct).toFixed(2)) : null;
                    return (
                      <tr key={topic.code} className={topicIndex % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                        <td className="border-t border-slate-100 px-4 py-4">
                          <div className="flex items-center gap-2.5">
                            <span className="inline-flex h-7 min-w-[32px] items-center justify-center rounded-lg bg-violet-100 px-2 text-[10px] font-black text-violet-700">{topic.code}</span>
                            <span className="font-bold text-slate-800">{topic.label}</span>
                          </div>
                        </td>
                        {reports.map((report: any) => {
                          const value = (topic.values || []).find((item: any) => item.period === report.label);
                          const pct = value?.pct ?? null;
                          const target = getTopicKpiTarget(getPolicyMonthKeyForCases(report.cases || []), topic.code);
                          const passed = pct !== null && Number(pct) >= target;
                          return (
                            <td key={String(topic.code) + "-" + report.label} className="border-t border-slate-100 px-3 py-3">
                              {pct === null ? (
                                <div className="text-center font-semibold text-slate-400">No Data</div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                                    <div className={"h-full rounded-full " + (passed ? "bg-emerald-500" : "bg-rose-500")} style={{ width: String(Math.max(0, Math.min(100, Number(pct)))) + "%" }} />
                                  </div>
                                  <div className="w-[58px] text-right">
                                    <div className={"font-black " + (passed ? "text-emerald-700" : "text-rose-600")}>{Number(pct).toFixed(2)}%</div>
                                    <div className="mt-0.5 text-[8px] font-semibold text-slate-400">Target {target}%</div>
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="border-t border-slate-100 px-3 py-3 text-center">
                          <span className={"inline-flex rounded-full px-2.5 py-1 text-[10px] font-black " + (rowDelta === null ? "bg-slate-100 text-slate-500" : rowDelta > 0 ? "bg-emerald-100 text-emerald-700" : rowDelta < 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>
                            {formatDelta(rowDelta)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {driverTransitions.length ? (
        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Score Drivers</div>
              <div className="mt-1 text-[15px] font-black text-slate-950">สาเหตุที่คะแนนเพิ่ม / ลด</div>
              <div className="mt-1 text-[10px] font-medium text-slate-500">สรุปตาม Topic ว่าเปลี่ยนเพราะอะไร และพบใน Intent ใด</div>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-bold">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">ดีขึ้น</span>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">ลดลง</span>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            {driverTransitions.map((transition: any) => (
              <div key={transition.period}>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <div>
                    <div className="text-[11px] font-black text-slate-900">{transition.period}</div>
                    <div className="mt-0.5 text-[9px] font-semibold text-slate-500">เทียบกับ {transition.previousPeriod}</div>
                  </div>
                  <span className={"rounded-full px-3 py-1.5 text-[10px] font-black " + (transition.overallDelta > 0 ? "bg-emerald-100 text-emerald-700" : transition.overallDelta < 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>
                    Overall {formatDelta(transition.overallDelta)}
                  </span>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {(transition.topics || []).map((topic: any) => (
                    <article key={transition.period + "-" + topic.code} className={"rounded-2xl border p-4 " + (topic.direction === "up" ? "border-emerald-200 bg-emerald-50/35" : "border-rose-200 bg-rose-50/35")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Topic {topic.code}</div>
                          <div className="mt-1 text-[11px] font-black leading-5 text-slate-900">{topic.label}</div>
                        </div>
                        <span className={"shrink-0 rounded-full px-2 py-1 text-[9px] font-black " + (topic.direction === "up" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                          {formatDelta(topic.delta)}
                        </span>
                      </div>

                      <div className="mt-3 border-t border-slate-200/70 pt-3">
                        <div className={"text-[10px] font-black " + (topic.direction === "up" ? "text-emerald-700" : "text-rose-700")}>
                          {topic.direction === "up" ? "สาเหตุที่ดีขึ้น" : "สาเหตุที่คะแนนลดลง"}
                        </div>
                        <div className="mt-2 space-y-2">
                          {(topic.causes || []).map((cause: any) => (
                            <div key={cause.key} className="rounded-xl bg-white/80 px-3 py-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-[10px] font-bold leading-5 text-slate-800">{cause.label}</div>
                                {cause.count > 0 ? <span className="shrink-0 text-[8px] font-black text-slate-400">พบ {cause.count} เคส</span> : null}
                              </div>
                              {cause.intents?.length ? (
                                <div className="mt-2">
                                  <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">Intent ที่พบ</div>
                                  <div className="mt-1.5 space-y-1">
                                    {cause.intents.slice(0, 3).map((intent: string) => (
                                      <div key={intent} className="text-[9px] font-semibold leading-4 text-slate-600">• {intent}</div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-[9px] font-semibold leading-5 text-blue-700">
        หมายเหตุ: Score Drivers สรุปจากผลประเมิน QA และ Comment/จุดที่หักของเคสในช่วงที่นำมาเปรียบเทียบ ไม่แสดง Case ID ในมุม Compare
      </div>
    </div>
  );
}

`;

      next = replaceOrThrow(
        this,
        next,
        `function AnalyticsAgentPerformanceV92({`,
        `${compareUi}function AnalyticsAgentPerformanceV92({`,
        "compare UI component anchor"
      );

      next = replaceOrThrow(
        this,
        next,
        `          <div data-analytics-overview-logic-v90="true" data-analytics-readable-v128="true" className="min-w-0 space-y-5">\n            <AnalyticsOverviewV89`,
        `          <div data-analytics-overview-logic-v90="true" data-analytics-readable-v128="true" className="min-w-0 space-y-5">\n            {isComparisonMode ? (\n              <AnalyticsCompareDashboardV2\n                periodReports={periodTopicReports}\n                topicGroups={topicDifferenceGroups}\n                reportModeName={reportModeName}\n                summary={summaryCards}\n              />\n            ) : null}\n            <div className={isComparisonMode ? "hidden" : "contents"}>\n            <AnalyticsOverviewV89`,
        "compare workspace start"
      );

      next = replaceOrThrow(
        this,
        next,
        `            {isComparisonMode ? (\n              <Panel>\n                <PanelHeader title="Period Comparison" subtitle={\`เปรียบเทียบ \${effectivePeriodLabels.join(" · ")}\`} />\n                <PanelBody><SummaryTable rows={comparisonRowsWithDelta} firstColLabel={reportModeName} /></PanelBody>\n              </Panel>\n            ) : null}\n          </div>\n          <div\n            data-analytics-filterbar-v89="true"`,
        `            {isComparisonMode ? (\n              <Panel>\n                <PanelHeader title="Period Comparison" subtitle={\`เปรียบเทียบ \${effectivePeriodLabels.join(" · ")}\`} />\n                <PanelBody><SummaryTable rows={comparisonRowsWithDelta} firstColLabel={reportModeName} /></PanelBody>\n              </Panel>\n            ) : null}\n            </div>\n          </div>\n          <div\n            data-analytics-filterbar-v89="true"`,
        "compare workspace end"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics compare UI redesign patch was not applied.");
    },
  };
}
