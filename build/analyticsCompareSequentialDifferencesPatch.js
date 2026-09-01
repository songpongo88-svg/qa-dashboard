function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics sequential compare patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsCompareSequentialDifferencesPatch() {
  let patched = false;

  return {
    name: "analytics-compare-sequential-differences",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;
      if (!code.includes('data-analytics-compare-ppt-report-v1="true"')) {
        this.error("Analytics compare UI redesign must run before sequential differences patch.");
      }

      let next = code;

      next = replaceOrThrow(
        this,
        next,
        `  const formatDelta = (value: number | null) => {`,
        `  // data-analytics-compare-sequential-differences-v26
  const sequentialPeriodDeltas = periodReports.map((report: any, index: number) => {
    const currentLabel = shortPeriodLabel(String(report?.label || ""));
    if (index === 0) {
      return {
        key: String(report?.label || index),
        from: "",
        to: currentLabel,
        delta: null as number | null,
      };
    }

    const previous = periodReports[index - 1];
    const previousLabel = shortPeriodLabel(String(previous?.label || ""));
    const comparable =
      Number(previous?.caseCount || 0) > 0 &&
      Number(report?.caseCount || 0) > 0;

    return {
      key: String(previous?.label || index - 1) + "->" + String(report?.label || index),
      from: previousLabel,
      to: currentLabel,
      delta: comparable
        ? Number((Number(report?.avgScore || 0) - Number(previous?.avgScore || 0)).toFixed(2))
        : null,
    };
  });

  const gradeMixComparison = ["A", "B", "C", "D", "F", "G"]
    .map((grade) => {
      const values = periodReports.map((report: any, index: number) => {
        const matched = (Array.isArray(report?.gradeMix) ? report.gradeMix : []).find(
          (item: any) => String(item?.grade || "") === grade
        );
        const count = Number(matched?.count || 0);
        const pct = Number(matched?.pct || 0);
        const previousReport = index > 0 ? periodReports[index - 1] : null;
        const previousMatched = previousReport
          ? (Array.isArray(previousReport?.gradeMix) ? previousReport.gradeMix : []).find(
              (item: any) => String(item?.grade || "") === grade
            )
          : null;
        const previousPct = previousMatched ? Number(previousMatched?.pct || 0) : null;
        const delta = index > 0 && previousPct !== null
          ? Number((pct - previousPct).toFixed(2))
          : null;

        return {
          period: shortPeriodLabel(String(report?.label || "")),
          count,
          pct,
          delta,
        };
      });

      return { grade, values };
    })
    .filter((row) => row.values.some((value) => value.count > 0));

  const getCompareInsightTopics = (report: any, type: "strongest" | "coaching") => {
    const topics = Array.isArray(report?.topics) ? report.topics : [];
    const direct = Array.isArray(report?.[type]) ? report[type] : [];
    if (direct.length) return direct.slice(0, 2);
    const sorted = [...topics].sort((left: any, right: any) =>
      type === "strongest"
        ? Number(right?.pct || 0) - Number(left?.pct || 0)
        : Number(left?.pct || 0) - Number(right?.pct || 0)
    );
    return sorted.slice(0, 2);
  };

  const periodInsightRows = periodReports.map((report: any, index: number) => {
    const previousReport = index > 0 ? periodReports[index - 1] : null;
    const previousTopics = Array.isArray(previousReport?.topics) ? previousReport.topics : [];
    const attachDelta = (topic: any) => {
      const previousTopic = previousTopics.find(
        (item: any) => String(item?.code || "") === String(topic?.code || "")
      );
      const delta = previousTopic
        ? Number((Number(topic?.pct || 0) - Number(previousTopic?.pct || 0)).toFixed(2))
        : null;
      return { ...topic, sequentialDelta: delta };
    };

    return {
      period: shortPeriodLabel(String(report?.label || "")),
      strongest: getCompareInsightTopics(report, "strongest").map(attachDelta),
      coaching: getCompareInsightTopics(report, "coaching").map(attachDelta),
    };
  });

  const formatDelta = (value: number | null) => {`,
        "sequential comparison metrics"
      );

      next = replaceOrThrow(
        this,
        next,
        `                  <div className="mt-1 text-[9px] font-semibold text-slate-500">
                    {shortPeriodLabel(String(firstReport?.label || ""))} → {shortPeriodLabel(String(lastReport?.label || ""))}
                  </div>
                </div>
                <div className={"text-[10px] font-black " + (overallDelta > 0 ? "text-emerald-600" : overallDelta < 0 ? "text-rose-500" : "text-slate-500")}>
                  {formatDelta(overallDelta)}
                </div>
              </div>`,
        `                  <div className="mt-1 text-[9px] font-semibold text-slate-500">
                    Sequential change across {periodReports.length} selected periods
                  </div>
                </div>
              </div>
              <div className="mt-2 flex max-w-full flex-wrap gap-1.5">
                {sequentialPeriodDeltas.slice(1).map((step: any) => (
                  <span
                    key={step.key}
                    className={"rounded-full border px-2 py-1 text-[9px] font-black tabular-nums " + (
                      step.delta === null
                        ? "border-slate-200 bg-slate-50 text-slate-400"
                        : step.delta > 0
                          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                          : step.delta < 0
                            ? "border-rose-200 bg-rose-50 text-rose-500"
                            : "border-slate-200 bg-slate-50 text-slate-500"
                    )}
                    title={step.from + " → " + step.to}
                  >
                    {step.from} → {step.to} · {formatDelta(step.delta)}
                  </span>
                ))}
              </div>`,
        "sequential trend header"
      );

      next = replaceOrThrow(
        this,
        next,
        `            <div data-compare-insights="true" className="grid min-w-0 items-start gap-4 md:grid-cols-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">`,
        `            <div data-compare-sequential-insights-v26="true" className="min-w-0 space-y-4">
              <article className="min-w-0 rounded-xl border border-violet-200 bg-white p-3.5">
                <div className="text-[13px] font-black text-slate-900">Grade Mix</div>
                <div className="mt-0.5 text-[9px] font-semibold text-slate-500">Each selected period · Δ vs previous period</div>
                <div className="mt-3 space-y-2">
                  {gradeMixComparison.map((row: any) => {
                    const grade = String(row?.grade || "-");
                    const gradeTone =
                      grade === "A" ? "bg-emerald-100 text-emerald-600" :
                      grade === "B" ? "bg-blue-100 text-blue-600" :
                      grade === "C" ? "bg-amber-100 text-amber-600" :
                      grade === "D" ? "bg-orange-100 text-orange-600" :
                      grade === "F" ? "bg-rose-100 text-rose-600" :
                      "bg-slate-200 text-slate-500";
                    return (
                      <div key={grade} className="rounded-lg border border-violet-100 bg-violet-50/35 p-2">
                        <div className="flex items-center gap-2">
                          <span className={"inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black " + gradeTone}>{grade}</span>
                          <div className="min-w-0 flex-1 overflow-x-auto pb-1">
                            <div className="flex min-w-max items-stretch gap-1.5">
                              {(row?.values || []).map((value: any, valueIndex: number) => (
                                <div key={grade + "-" + value.period} className="min-w-[92px] rounded-md bg-white px-2 py-1.5 text-center shadow-sm">
                                  <div className="truncate text-[8px] font-black text-slate-500" title={value.period}>{value.period}</div>
                                  <div className="mt-1 text-[10px] font-black text-slate-800">{value.count} case(s)</div>
                                  <div className="text-[10px] font-black tabular-nums text-violet-600">{value.pct.toFixed(2)}%</div>
                                  {valueIndex > 0 ? (
                                    <div className={"mt-1 text-[8px] font-black tabular-nums " + (
                                      value.delta === null
                                        ? "text-slate-400"
                                        : value.delta > 0
                                          ? "text-emerald-600"
                                          : value.delta < 0
                                            ? "text-rose-500"
                                            : "text-slate-500"
                                    )}>{formatDelta(value.delta)}</div>
                                  ) : <div className="mt-1 text-[8px] font-bold text-slate-400">Base</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!gradeMixComparison.length ? <div className="py-4 text-center text-[10px] font-semibold text-slate-400">No grade data</div> : null}
                </div>
              </article>

              <article className="min-w-0 rounded-xl border border-emerald-200 bg-white p-3.5">
                <div className="text-[13px] font-black text-emerald-600">★ (Strongest Topics)</div>
                <div className="mt-0.5 text-[9px] font-semibold text-slate-500">Top topics by period · Δ compares the same topic with the previous period</div>
                <div className="mt-3 space-y-2.5">
                  {periodInsightRows.map((period: any) => (
                    <div key={"strong-" + period.period} className="rounded-xl bg-emerald-50 p-3">
                      <div className="mb-2 text-[9px] font-black text-emerald-700">{period.period}</div>
                      <div className="space-y-2">
                        {(period.strongest || []).map((topic: any) => (
                          <div key={period.period + "-strong-" + String(topic?.code || topic?.label)} className="rounded-lg bg-white/90 px-2.5 py-2">
                            <AnalyticsBilingualTopicLabel
                              code={String(topic?.code || "")}
                              label={String(topic?.label || "Topic")}
                              className="min-w-0 break-words"
                              thaiClassName="text-[10px] font-semibold leading-4 text-slate-800"
                              englishClassName="mt-0.5 text-[8px] font-medium leading-3 text-slate-500"
                            />
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-black tabular-nums text-emerald-600">{Number(topic?.pct || 0).toFixed(2)}%</span>
                              <span className={"text-[8px] font-black tabular-nums " + (
                                topic.sequentialDelta === null
                                  ? "text-slate-400"
                                  : topic.sequentialDelta > 0
                                    ? "text-emerald-600"
                                    : topic.sequentialDelta < 0
                                      ? "text-rose-500"
                                      : "text-slate-500"
                              )}>{topic.sequentialDelta === null ? "Base / new topic" : formatDelta(topic.sequentialDelta)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="min-w-0 rounded-xl border border-amber-200 bg-white p-3.5">
                <div className="text-[13px] font-black text-amber-500">⚠ (Coaching Focus)</div>
                <div className="mt-0.5 text-[9px] font-semibold text-slate-500">Lowest topics by period · Δ compares the same topic with the previous period</div>
                <div className="mt-3 space-y-2.5">
                  {periodInsightRows.map((period: any) => (
                    <div key={"coach-" + period.period} className="rounded-xl bg-amber-50 p-3">
                      <div className="mb-2 text-[9px] font-black text-amber-700">{period.period}</div>
                      <div className="space-y-2">
                        {(period.coaching || []).map((topic: any) => (
                          <div key={period.period + "-coach-" + String(topic?.code || topic?.label)} className="rounded-lg bg-white/90 px-2.5 py-2">
                            <AnalyticsBilingualTopicLabel
                              code={String(topic?.code || "")}
                              label={String(topic?.label || "Topic")}
                              className="min-w-0 break-words"
                              thaiClassName="text-[10px] font-semibold leading-4 text-slate-800"
                              englishClassName="mt-0.5 text-[8px] font-medium leading-3 text-slate-500"
                            />
                            <div className="mt-1.5 flex items-center justify-between gap-2">
                              <span className="text-[11px] font-black tabular-nums text-amber-500">{Number(topic?.pct || 0).toFixed(2)}%</span>
                              <span className={"text-[8px] font-black tabular-nums " + (
                                topic.sequentialDelta === null
                                  ? "text-slate-400"
                                  : topic.sequentialDelta > 0
                                    ? "text-emerald-600"
                                    : topic.sequentialDelta < 0
                                      ? "text-rose-500"
                                      : "text-slate-500"
                              )}>{topic.sequentialDelta === null ? "Base / new topic" : formatDelta(topic.sequentialDelta)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div data-compare-insights="true" className="hidden">`,
        "comparative grade and topic insights"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics sequential compare patch was not applied.");
    },
  };
}
