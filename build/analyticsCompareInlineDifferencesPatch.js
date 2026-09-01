function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics inline compare diff patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsCompareInlineDifferencesPatch() {
  let patched = false;

  return {
    name: "analytics-compare-inline-differences",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;
      if (!code.includes('data-analytics-compare-ppt-report-v1="true"')) {
        this.error("Analytics compare UI redesign must run before inline differences patch.");
      }

      let next = code;

      next = replaceOrThrow(
        this,
        next,
        `  const formatDelta = (value: number | null) => {`,
        `  // data-analytics-compare-inline-differences-v27
  const microPeriodLabel = (value: unknown) => {
    const raw = shortPeriodLabel(String(value || ""));
    const parts = raw.split(" ").filter(Boolean);
    if (parts.length === 2 && parts[1].length === 4 && Number.isFinite(Number(parts[1]))) {
      return parts[0].slice(0, 3);
    }
    return raw.length > 10 ? raw.slice(0, 10) : raw;
  };

  const getGradeSequentialSteps = (gradeValue: unknown) =>
    periodReports.slice(1).map((report: any, offset: number) => {
      const index = offset + 1;
      const previous = periodReports[index - 1];
      const currentGrade = (Array.isArray(report?.gradeMix) ? report.gradeMix : []).find(
        (item: any) => String(item?.grade || "") === String(gradeValue || "")
      );
      const previousGrade = (Array.isArray(previous?.gradeMix) ? previous.gradeMix : []).find(
        (item: any) => String(item?.grade || "") === String(gradeValue || "")
      );
      const currentPct = Number(currentGrade?.pct || 0);
      const previousPct = Number(previousGrade?.pct || 0);
      const comparable = Number(previous?.caseCount || 0) > 0 && Number(report?.caseCount || 0) > 0;
      return {
        key: String(previous?.label || index - 1) + "->" + String(report?.label || index),
        from: microPeriodLabel(previous?.label),
        to: microPeriodLabel(report?.label),
        delta: comparable ? Number((currentPct - previousPct).toFixed(2)) : null,
      };
    });

  const getTopicSequentialSteps = (topicCode: unknown) =>
    periodReports.slice(1).map((report: any, offset: number) => {
      const index = offset + 1;
      const previous = periodReports[index - 1];
      const currentTopic = (Array.isArray(report?.topics) ? report.topics : []).find(
        (item: any) => String(item?.code || "") === String(topicCode || "")
      );
      const previousTopic = (Array.isArray(previous?.topics) ? previous.topics : []).find(
        (item: any) => String(item?.code || "") === String(topicCode || "")
      );
      const comparable = Boolean(currentTopic && previousTopic);
      return {
        key: String(previous?.label || index - 1) + "->" + String(report?.label || index),
        from: microPeriodLabel(previous?.label),
        to: microPeriodLabel(report?.label),
        delta: comparable
          ? Number((Number(currentTopic?.pct || 0) - Number(previousTopic?.pct || 0)).toFixed(2))
          : null,
      };
    }).filter((step: any) => step.delta !== null);

  const formatDelta = (value: number | null) => {`,
        "inline comparison helpers"
      );

      next = replaceOrThrow(
        this,
        next,
        `                      </g>
                    );
                  })}
                </svg>`,
        `                      </g>
                    );
                  })}
                  {periodReports.slice(1).map((report: any, offset: number) => {
                    const index = offset + 1;
                    const previous = periodReports[index - 1];
                    const comparable = Number(previous?.caseCount || 0) > 0 && Number(report?.caseCount || 0) > 0;
                    if (!comparable) return null;
                    const previousScore = Number(previous?.avgScore || 0);
                    const currentScore = Number(report?.avgScore || 0);
                    const delta = Number((currentScore - previousScore).toFixed(2));
                    const slotWidth = (trendRight - trendLeft) / periodReports.length;
                    const previousCenterX = trendLeft + slotWidth * (index - 0.5);
                    const currentCenterX = trendLeft + slotWidth * (index + 0.5);
                    const labelX = (previousCenterX + currentCenterX) / 2;
                    const labelY = Math.max(11, Math.min(trendY(previousScore), trendY(currentScore)) - 11);
                    return (
                      <text
                        key={String(previous?.label || index - 1) + "-diff-" + String(report?.label || index)}
                        x={labelX}
                        y={labelY}
                        textAnchor="middle"
                        fontSize="8.5"
                        fontWeight="800"
                        fill={delta > 0 ? "#059669" : delta < 0 ? "#e11d48" : "#64748b"}
                      >
                        {(delta > 0 ? "+" : "") + delta.toFixed(2) + " pp"}
                      </text>
                    );
                  })}
                </svg>`,
        "trend sequential labels"
      );

      next = replaceOrThrow(
        this,
        next,
        `                  {gradeMix.map((item: any) => {
                    const grade = String(item?.grade || "-");
                    const gradeTone =`,
        `                  {gradeMix.map((item: any) => {
                    const grade = String(item?.grade || "-");
                    const gradeSteps = getGradeSequentialSteps(grade);
                    const gradeTone =`,
        "grade mix sequential data"
      );

      next = replaceOrThrow(
        this,
        next,
        `                          <div className={"whitespace-nowrap text-[10px] font-black tabular-nums " + gradeTone.split(" ").slice(-1)[0]}>{Number(item?.pct || 0).toFixed(2)}%</div>`,
        `                          <div className={"whitespace-nowrap text-[10px] font-black tabular-nums " + gradeTone.split(" ").slice(-1)[0]}>{Number(item?.pct || 0).toFixed(2)}%</div>
                          {gradeSteps.map((step: any) => (
                            <span
                              key={grade + "-" + step.key}
                              className={"whitespace-nowrap text-[8px] font-black tabular-nums " + (
                                step.delta === null
                                  ? "text-slate-400"
                                  : step.delta > 0
                                    ? "text-emerald-600"
                                    : step.delta < 0
                                      ? "text-rose-500"
                                      : "text-slate-500"
                              )}
                              title={step.from + " → " + step.to}
                            >
                              {step.from}→{step.to} {formatDelta(step.delta)}
                            </span>
                          ))}`,
        "grade mix inline deltas"
      );

      next = replaceOrThrow(
        this,
        next,
        `                      <div className="mt-3 text-[12px] font-black text-emerald-600">{Number(topic?.pct || 0).toFixed(2)}% average</div>`,
        `                      <div className="mt-3">
                        <div className="text-[12px] font-black text-emerald-600">{Number(topic?.pct || 0).toFixed(2)}% average</div>
                        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
                          {getTopicSequentialSteps(String(topic?.code || "")).map((step: any) => (
                            <span
                              key={"strong-" + String(topic?.code || "") + "-" + step.key}
                              className={"text-[8px] font-black tabular-nums " + (
                                step.delta > 0 ? "text-emerald-600" : step.delta < 0 ? "text-rose-500" : "text-slate-500"
                              )}
                              title={step.from + " → " + step.to}
                            >
                              {step.from}→{step.to} {formatDelta(step.delta)}
                            </span>
                          ))}
                        </div>
                      </div>`,
        "strongest topic inline deltas"
      );

      next = replaceOrThrow(
        this,
        next,
        `                      <div className="mt-3 text-[12px] font-black text-amber-500">{Number(topic?.pct || 0).toFixed(2)}% average</div>`,
        `                      <div className="mt-3">
                        <div className="text-[12px] font-black text-amber-500">{Number(topic?.pct || 0).toFixed(2)}% average</div>
                        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1">
                          {getTopicSequentialSteps(String(topic?.code || "")).map((step: any) => (
                            <span
                              key={"coach-" + String(topic?.code || "") + "-" + step.key}
                              className={"text-[8px] font-black tabular-nums " + (
                                step.delta > 0 ? "text-emerald-600" : step.delta < 0 ? "text-rose-500" : "text-slate-500"
                              )}
                              title={step.from + " → " + step.to}
                            >
                              {step.from}→{step.to} {formatDelta(step.delta)}
                            </span>
                          ))}
                        </div>
                      </div>`,
        "coaching topic inline deltas"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics inline comparison differences patch was not applied.");
    },
  };
}
