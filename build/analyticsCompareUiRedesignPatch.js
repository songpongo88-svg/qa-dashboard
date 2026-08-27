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
  cases,
  agentRows,
  selectedAgent,
  currentUser,
  accountProfiles,
}: {
  periodReports: any[];
  topicGroups: any[];
  reportModeName: string;
  summary: any;
  cases: any[];
  agentRows: any[];
  selectedAgent: string;
  currentUser: any;
  accountProfiles: any[];
}) {
  if (!Array.isArray(periodReports) || periodReports.length < 2) return null;

  const firstReport = periodReports[0];
  const lastReport = periodReports[periodReports.length - 1];
  const firstScore = Number(firstReport?.avgScore || 0);
  const lastScore = Number(lastReport?.avgScore || 0);
  const overallDelta = Number((lastScore - firstScore).toFixed(2));
  const comparisonUnit = reportModeName === "Weekly" ? "Week" : reportModeName === "Monthly" ? "Month" : "Year";
  const comparisonTitle = comparisonUnit + "-over-" + comparisonUnit;
  const scopeIsAll = selectedAgent === "all";
  const scopeLabel = scopeIsAll
    ? "All Agents"
    : buildSuspendedAgentLabel(String(selectedAgent || "Selected Agent"), accountProfiles || []);
  const preparedBy =
    String(
      currentUser?.displayName ||
      currentUser?.agentName ||
      currentUser?.username ||
      "QA Team"
    ).trim() || "QA Team";

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const shortPeriodLabel = (label: string) => {
    const raw = String(label || "");
    const dates = raw.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || [];
    if (dates.length >= 2) {
      const left = dates[0].split("/").map(Number);
      const right = dates[dates.length - 1].split("/").map(Number);
      if (left[1] === right[1] && left[2] === right[2]) {
        return String(left[0]) + "-" + String(right[0]) + " " + monthNames[Math.max(0, left[1] - 1)] + " " + String(left[2]);
      }
      return String(left[0]) + " " + monthNames[Math.max(0, left[1] - 1)] + " - " + String(right[0]) + " " + monthNames[Math.max(0, right[1] - 1)] + " " + String(right[2]);
    }
    return raw;
  };

  const compactPeriodLabels = periodReports.map((report: any) =>
    shortPeriodLabel(String(report?.label || ""))
  );
  const periodText =
    compactPeriodLabels.length <= 3
      ? compactPeriodLabels.join(" vs ")
      : compactPeriodLabels[0] +
        " → " +
        compactPeriodLabels[compactPeriodLabels.length - 1] +
        " · " +
        String(compactPeriodLabels.length) +
        " periods";

  const latestCases = Array.isArray(lastReport?.cases) ? lastReport.cases : [];
  const latestSummary = lastReport?.summary || lastReport || {};
  const latestCaseCount = Number(lastReport?.caseCount ?? latestSummary?.caseCount ?? latestCases.length ?? 0);
  const latestAverage = Number(lastReport?.avgScore ?? latestSummary?.avgScore ?? 0);
  const latestGrade = String(lastReport?.grade ?? latestSummary?.grade ?? "-");
  const latestAgentCount = Number(
    lastReport?.coverage?.agentCount ??
    new Set(latestCases.map((item: any) => String(item?.agent || "").trim()).filter(Boolean)).size
  );
  const latestIncentive = Number(latestSummary?.incentive ?? lastReport?.incentive ?? 0);
  const averagePerAgent = Number(
    lastReport?.coverage?.averageCasesPerAgent ??
    (latestAgentCount ? latestCaseCount / latestAgentCount : 0)
  );

  const originalCount = Number(lastReport?.reviewMix?.original ?? 0);
  const revisedCount = Number(lastReport?.reviewMix?.revised ?? 0);
  const reviewTotal = originalCount + revisedCount;
  const originalPct = reviewTotal ? Number(((originalCount / reviewTotal) * 100).toFixed(2)) : 0;
  const revisedPct = reviewTotal ? Number(((revisedCount / reviewTotal) * 100).toFixed(2)) : 0;
  const trendScores = periodReports
    .filter((report: any) => Number(report?.caseCount || 0) > 0)
    .map((report: any) => Number(report?.avgScore || 0));
  const rawMinScore = trendScores.length ? Math.min(...trendScores) : 0;
  const trendFloor = Math.max(0, Math.min(70, Math.floor((rawMinScore - 5) / 10) * 10));
  const trendCeiling = 100;
  const trendRange = Math.max(1, trendCeiling - trendFloor);
  const trendTickStep = trendRange <= 40 ? 10 : 20;
  const trendTicks = Array.from(
    { length: Math.floor(trendRange / trendTickStep) + 1 },
    (_, index) => trendCeiling - index * trendTickStep
  );
  if (trendTicks[trendTicks.length - 1] !== trendFloor) trendTicks.push(trendFloor);
  const trendWidth = Math.max(360, periodReports.length * 100 + 44);
  const trendLeft = 34;
  const trendRight = trendWidth - 10;
  const trendTop = 20;
  const trendBottom = 120;
  const trendY = (score: number) =>
    trendBottom - ((Math.max(trendFloor, Math.min(trendCeiling, score)) - trendFloor) / trendRange) * (trendBottom - trendTop);

  const latestTopics = Array.isArray(lastReport?.topics) ? lastReport.topics : [];
  const latestStrongest = Array.isArray(lastReport?.strongest)
    ? lastReport.strongest.slice(0, 2)
    : [...latestTopics].sort((left: any, right: any) => Number(right?.pct || 0) - Number(left?.pct || 0)).slice(0, 2);
  const latestCoaching = Array.isArray(lastReport?.coaching)
    ? lastReport.coaching.slice(0, 2)
    : [...latestTopics].sort((left: any, right: any) => Number(left?.pct || 0) - Number(right?.pct || 0)).slice(0, 2);
  const gradeMix = (Array.isArray(lastReport?.gradeMix) ? lastReport.gradeMix : []).filter(
    (item: any) => Number(item?.count || 0) > 0 || ["A", "B", "C", "D", "F", "G"].includes(String(item?.grade || ""))
  );

  const formatDelta = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return "—";
    return (value > 0 ? "+" : "") + value.toFixed(2) + " pp";
  };

  const kpiCards = [
    {
      title: "TOTAL CASES",
      value: String(latestCaseCount),
      helper: shortPeriodLabel(String(lastReport?.label || "")),
      icon: "▤",
      valueClass: "text-amber-500",
      iconClass: "bg-amber-50 text-amber-500",
      helperClass: "bg-amber-50 text-amber-600",
    },
    {
      title: "AVERAGE SCORE",
      value: latestAverage.toFixed(2),
      helper: scopeIsAll ? "Team Score" : "Agent Score",
      icon: "⌁",
      valueClass: "text-violet-600",
      iconClass: "bg-violet-100 text-violet-600",
      helperClass: "bg-violet-100 text-violet-600",
    },
    {
      title: "OVERALL GRADE",
      value: latestGrade,
      helper: overallDelta > 0 ? "Improving" : overallDelta < 0 ? "Needs Attention" : "Stable",
      icon: "◆",
      valueClass: "text-blue-600",
      iconClass: "bg-blue-50 text-blue-600",
      helperClass: "bg-blue-50 text-blue-600",
    },
    {
      title: "REVIEWED AGENTS",
      value: String(latestAgentCount),
      helper: latestAgentCount === 1 ? "Agent Evaluated" : "Agents Evaluated",
      icon: "♟",
      valueClass: "text-violet-600",
      iconClass: "bg-violet-100 text-violet-600",
      helperClass: "bg-violet-100 text-violet-600",
    },
    {
      title: "TOTAL INCENTIVE",
      value: latestIncentive.toLocaleString("en-US"),
      helper: "THB",
      icon: "฿",
      valueClass: "text-emerald-600",
      iconClass: "bg-emerald-50 text-emerald-600",
      helperClass: "bg-emerald-50 text-emerald-600",
    },
  ];

  const displayAgentRows = scopeIsAll
    ? (Array.isArray(agentRows) ? agentRows : [])
    : [
        {
          agent: scopeLabel,
          values: periodReports.map((report: any) => ({
            period: report.label,
            score: Number(report?.caseCount || 0) > 0 ? Number(report?.avgScore || 0) : null,
            caseCount: Number(report?.caseCount || 0),
          })),
          overallDelta,
        },
      ];

  const sortedAgentRows = [...displayAgentRows].sort((left: any, right: any) => {
    const leftDelta = left?.overallDelta === null || left?.overallDelta === undefined
      ? Number.POSITIVE_INFINITY
      : Number(left.overallDelta);
    const rightDelta = right?.overallDelta === null || right?.overallDelta === undefined
      ? Number.POSITIVE_INFINITY
      : Number(right.overallDelta);
    return leftDelta - rightDelta || String(left?.agent || "").localeCompare(String(right?.agent || ""));
  });
  const comparableAgentRows = sortedAgentRows.filter(
    (row: any) => row?.overallDelta !== null && row?.overallDelta !== undefined
  );
  const weakestAgent = comparableAgentRows.length ? comparableAgentRows[0] : null;
  const strongestAgent = comparableAgentRows.length
    ? comparableAgentRows[comparableAgentRows.length - 1]
    : null;
  const differentCriteria = topicGroups.length > 1;

  return (
    <div data-analytics-compare-ppt-report-v1="true" className="space-y-6">
      <section className="relative overflow-hidden rounded-[24px] border border-violet-200 bg-white shadow-[0_12px_34px_rgba(76,29,149,0.08)]">
        <div className="pointer-events-none absolute -left-20 -top-32 h-48 w-48 rounded-full bg-violet-200/80" />
        <div className="pointer-events-none absolute -left-24 -top-36 h-44 w-44 rounded-full bg-violet-600" />

        <div className="relative px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
            <div className="min-w-0 pl-7 sm:pl-10">
              <div className="text-[23px] font-black tracking-tight text-slate-950 sm:text-[28px]">
                QA {reportModeName} Comparison Report
              </div>
              <div className="mt-1 text-[11px] font-medium text-slate-500">
                {scopeIsAll
                  ? "Formal comparison view for all visible agents"
                  : "Formal comparison view for the selected agent"}
              </div>
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
              <div className="min-w-0 rounded-xl bg-violet-100/90 px-3 py-3">
                <div className="text-[9px] font-black uppercase tracking-wide text-violet-600">Scope</div>
                <div className="mt-1 truncate text-[11px] font-black text-slate-900" title={scopeLabel}>{scopeLabel}</div>
              </div>
              <div className="min-w-0 rounded-xl bg-violet-100/90 px-3 py-3">
                <div className="text-[9px] font-black uppercase tracking-wide text-violet-600">Period</div>
                <div className="mt-1 break-words text-[11px] font-black text-slate-900" title={periodText}>{periodText}</div>
              </div>
              <div className="min-w-0 rounded-xl bg-violet-100/90 px-3 py-3">
                <div className="text-[9px] font-black uppercase tracking-wide text-violet-600">Prepared By</div>
                <div className="mt-1 truncate text-[11px] font-black text-slate-900" title={preparedBy}>{preparedBy}</div>
              </div>
            </div>
          </div>

          <div data-compare-kpis="true" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {kpiCards.map((item) => (
              <article key={item.title} className="flex min-w-0 flex-col rounded-xl border border-violet-200 bg-white px-4 py-3 shadow-[0_4px_12px_rgba(76,29,149,0.06)]">
                <div className="flex items-center gap-2">
                  <span className={"inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black " + item.iconClass}>{item.icon}</span>
                  <span className="text-[9px] font-black tracking-wide text-slate-500">{item.title}</span>
                </div>
                <div className={"mb-2 mt-2 text-[25px] font-black leading-none tabular-nums " + item.valueClass}>{item.value}</div>
                <div className={"mt-auto rounded-full px-2 py-1 text-center text-[9px] font-black " + item.helperClass}>{item.helper}</div>
              </article>
            ))}
          </div>

          <div data-compare-charts="true" className="mt-4 grid items-stretch gap-4 lg:grid-cols-3">
            <article className="flex min-w-0 flex-col rounded-xl border border-violet-200 bg-white p-4 shadow-[0_4px_12px_rgba(76,29,149,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-black text-slate-900">{comparisonTitle} Trend</div>
                  <div className="mt-1 text-[9px] font-semibold text-slate-500">
                    {shortPeriodLabel(String(firstReport?.label || ""))} → {shortPeriodLabel(String(lastReport?.label || ""))}
                  </div>
                </div>
                <div className={"text-[10px] font-black " + (overallDelta > 0 ? "text-emerald-600" : overallDelta < 0 ? "text-rose-500" : "text-slate-500")}>
                  {formatDelta(overallDelta)}
                </div>
              </div>

              <div className="mt-auto overflow-x-auto pt-2">
                <svg
                  data-compare-trend="true"
                  role="img"
                  aria-label={comparisonTitle + " scores: " + periodReports.map((report: any, index: number) => compactPeriodLabels[index] + ": " + (Number(report?.caseCount || 0) > 0 ? Number(report?.avgScore || 0).toFixed(2) : "No data")).join(", ")}
                  viewBox={"0 0 " + String(trendWidth) + " 164"}
                  className="block h-[152px] w-full"
                  style={{ minWidth: periodReports.length > 3 ? String(trendWidth) + "px" : undefined }}
                >
                  {trendTicks.map((tick: number) => (
                    <g key={tick}>
                      <line x1={trendLeft} x2={trendRight} y1={trendY(tick)} y2={trendY(tick)} stroke="#ede9fe" strokeWidth="1" />
                      <text x={trendLeft - 6} y={trendY(tick) + 3.5} textAnchor="end" fontSize="10" fill="#64748b">{tick}</text>
                    </g>
                  ))}
                  <path d={"M " + trendLeft + " " + trendTop + " V " + trendBottom + " H " + trendRight} fill="none" stroke="#94a3b8" strokeWidth="1" />
                  {periodReports.map((report: any, index: number) => {
                    const score = Number(report?.avgScore || 0);
                    const hasData = Number(report?.caseCount || 0) > 0;
                    const slotWidth = (trendRight - trendLeft) / periodReports.length;
                    const centerX = trendLeft + slotWidth * (index + 0.5);
                    const barWidth = slotWidth * 0.68;
                    const labelParts = compactPeriodLabels[index].match(/^(.*)\s(\d{4})$/);
                    return (
                      <g key={String(report?.label || index)}>
                        {hasData ? <rect data-trend-bar="true" x={centerX - barWidth / 2} y={trendY(score)} width={barWidth} height={trendBottom - trendY(score)} rx="1.5" fill="var(--qa-theme-600, #7c3aed)" /> : null}
                        <text x={centerX} y={hasData ? trendY(score) - 7 : trendBottom - 7} textAnchor="middle" fontSize="11" fontWeight="600" fill="#1e293b">{hasData ? score.toFixed(2) : "—"}</text>
                        <text x={centerX} y="138" textAnchor="middle" fontSize="10" fill="#64748b">
                          <tspan x={centerX}>{labelParts ? labelParts[1] : compactPeriodLabels[index]}</tspan>
                          {labelParts ? <tspan x={centerX} dy="13">{labelParts[2]}</tspan> : null}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </article>

            <article className="flex min-w-0 flex-col rounded-xl border border-violet-200 bg-white p-4 shadow-[0_4px_12px_rgba(76,29,149,0.05)]">
              <div className="text-[13px] font-black text-slate-900">Case Coverage</div>
              <div className="mt-1 text-[9px] font-semibold text-slate-500">{shortPeriodLabel(String(lastReport?.label || ""))}</div>
              <div className="mt-4 flex flex-1 flex-col justify-around gap-3">
                <div className="flex items-center justify-between gap-4"><span className="text-[11px] font-medium text-slate-500">Total Cases</span><span className="text-[17px] font-black text-violet-600">{latestCaseCount}</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-[11px] font-medium text-slate-500">Agents Evaluated</span><span className="text-[17px] font-black text-violet-600">{latestAgentCount}</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-[11px] font-medium text-slate-500">Avg / Agent</span><span className="text-[17px] font-black text-violet-600">{averagePerAgent.toFixed(2)}</span></div>
              </div>
            </article>

            <article className="flex min-w-0 flex-col rounded-xl border border-violet-200 bg-white p-4 shadow-[0_4px_12px_rgba(76,29,149,0.05)]">
              <div className="text-[13px] font-black text-slate-900">Review Status Mix</div>
              <div className="mt-3 flex flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1">
                <svg
                  data-compare-review-donut="true"
                  role="img"
                  aria-label={"Review status: Original " + originalCount + " (" + originalPct.toFixed(0) + "%), Revised " + revisedCount + " (" + revisedPct.toFixed(0) + "%)"}
                  viewBox="0 0 120 120"
                  width="112"
                  height="112"
                  className="shrink-0"
                >
                  <circle cx="60" cy="60" r="42" fill="none" stroke={reviewTotal ? "#d946ef" : "#e2e8f0"} strokeWidth="16" />
                  {originalCount > 0 ? <circle cx="60" cy="60" r="42" fill="none" stroke="var(--qa-theme-600, #7c3aed)" strokeWidth="16" pathLength="100" strokeDasharray={String(originalPct) + " " + String(100 - originalPct)} transform="rotate(-90 60 60)" /> : null}
                  <text x="60" y="60" dy="0.35em" textAnchor="middle" fontSize="18" fontWeight="600" fill="#334155">{reviewTotal ? originalPct.toFixed(0) + "%" : "—"}</text>
                </svg>
                <div className="min-w-0 text-[10px] font-bold leading-5">
                  <div className="flex items-center gap-1.5 text-violet-700"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "var(--qa-theme-600, #7c3aed)" }} />Original: {originalCount} ({originalPct.toFixed(0)}%)</div>
                  <div className="flex items-center gap-1.5 text-slate-500"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "#d946ef" }} />Revised: {revisedCount} ({revisedPct.toFixed(0)}%)</div>
                </div>
              </div>
              <div className="mt-1 text-center text-[9px] font-medium text-slate-500">Total: {reviewTotal} cases</div>
            </article>
          </div>

          {differentCriteria ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[9px] font-semibold leading-5 text-amber-700">
              Different QA Rubrics detected. Topic scores are separated by rubric and Difference is calculated only within the same rubric.
            </div>
          ) : null}

          <div data-compare-detail-grid="true" className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              {topicGroups.map((group: any, groupIndex: number) => {
                const reports = Array.isArray(group?.reports) ? group.reports : [];
                const rubricLabel = topicGroups.length > 1
                  ? groupIndex === topicGroups.length - 1
                    ? "Current QA Rubric"
                    : "Previous QA Rubric"
                  : "";
                return (
                  <article key={String(group?.key || groupIndex)} className="min-w-0 overflow-hidden bg-white">
                    <div className="mb-2 flex min-h-[40px] flex-wrap items-center justify-between gap-2">
                      <div className="text-[14px] font-black text-slate-900">(Topic Performance)</div>
                      {rubricLabel ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black text-amber-700">{rubricLabel}</span> : null}
                    </div>
                    <div className="overflow-x-auto border border-violet-200">
                      <table className="w-full text-[10px]" style={{ minWidth: String(Math.max(520, 240 + reports.length * 96 + 88)) + "px" }}>
                        <thead>
                          <tr className="bg-violet-600 text-white">
                            <th className="min-w-[240px] px-3 py-3 text-left font-black">Topic</th>
                            {reports.map((report: any) => (
                              <th key={String(report?.label || "")} className="min-w-[96px] px-2 py-3 text-center font-black" title={String(report?.label || "")}>
                                {shortPeriodLabel(String(report?.label || ""))}
                              </th>
                            ))}
                            <th className="min-w-[88px] px-2 py-3 text-center font-black">Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(group?.topics || []).map((topic: any, topicIndex: number) => {
                            const values = reports.map((report: any) => {
                              const matched = (topic?.values || []).find((item: any) => item?.period === report?.label);
                              return matched?.pct === null || matched?.pct === undefined ? null : Number(matched.pct);
                            });
                            const availableValues = values.filter((value: number | null) => value !== null) as number[];
                            const rowDelta = availableValues.length >= 2
                              ? Number((availableValues[availableValues.length - 1] - availableValues[0]).toFixed(2))
                              : null;
                            const topicTitle = splitAnalyticsTopicTitle(String(topic?.label || topic?.code || "Topic"));
                            return (
                              <tr key={String(topic?.code || topicIndex)} className={topicIndex % 2 === 0 ? "bg-white" : "bg-violet-50/65"}>
                                <td className="border-t border-violet-100 px-3 py-4">
                                  <div className="flex items-start gap-2">
                                    <span className="w-5 shrink-0 text-[10px] font-black text-slate-700">{String(topic?.code || "")}.</span>
                                    <div className="min-w-0">
                                      <div className="font-semibold leading-5 text-slate-700">{topicTitle.thai}</div>
                                      {topicTitle.english ? <div className="mt-0.5 text-[8px] font-semibold italic text-slate-400">{topicTitle.english}</div> : null}
                                    </div>
                                  </div>
                                </td>
                                {reports.map((report: any, reportIndex: number) => {
                                  const pct = values[reportIndex];
                                  const target = getTopicKpiTarget(getPolicyMonthKeyForCases(report?.cases || []), String(topic?.code || ""));
                                  const passed = pct !== null && pct >= target;
                                  return (
                                    <td key={String(topic?.code || "") + "-" + String(report?.label || "")} className="border-t border-violet-100 px-2 py-3 text-center tabular-nums">
                                      {pct === null ? (
                                        <span className="text-slate-400">—</span>
                                      ) : (
                                        <span className={"font-black " + (passed ? "text-emerald-600" : "text-amber-500")}>{pct.toFixed(2)}%</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className={"whitespace-nowrap border-t border-violet-100 px-2 py-3 text-center font-black tabular-nums " + (rowDelta === null ? "text-slate-400" : rowDelta > 0 ? "text-emerald-600" : rowDelta < 0 ? "text-rose-500" : "text-slate-500")}>
                                  {formatDelta(rowDelta)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </article>
                );
              })}
            </div>

            <div data-compare-insights="true" className="grid min-w-0 items-start gap-4 md:grid-cols-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <article className="min-w-0">
                <div className="mb-2 flex min-h-[40px] items-center text-[13px] font-black text-slate-900">Grade Mix</div>
                <div className="space-y-2">
                  {gradeMix.map((item: any) => {
                    const grade = String(item?.grade || "-");
                    const gradeTone =
                      grade === "A" ? "bg-emerald-100 text-emerald-600" :
                      grade === "B" ? "bg-blue-100 text-blue-600" :
                      grade === "C" ? "bg-amber-100 text-amber-600" :
                      grade === "D" ? "bg-orange-100 text-orange-600" :
                      grade === "F" ? "bg-rose-100 text-rose-600" :
                      "bg-slate-200 text-slate-500";
                    return (
                      <div key={grade} className="flex min-w-0 items-center gap-2 rounded-lg border border-violet-200 bg-white px-2 py-2.5">
                        <span className={"inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black " + gradeTone}>{grade}</span>
                        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-1 gap-y-0.5">
                          <div className="whitespace-nowrap text-[10px] font-black text-slate-800">{Number(item?.count || 0)} case(s)</div>
                          <div className={"whitespace-nowrap text-[10px] font-black tabular-nums " + gradeTone.split(" ").slice(-1)[0]}>{Number(item?.pct || 0).toFixed(2)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="min-w-0">
                <div className="mb-2 flex min-h-[40px] items-center justify-center text-center text-[13px] font-black text-emerald-600">★ (Strongest Topics)</div>
                <div className="space-y-3">
                  {latestStrongest.map((topic: any) => (
                    <div key={String(topic?.code || topic?.label)} data-compare-topic-insight="strongest" className="flex min-h-[130px] flex-col justify-between rounded-xl bg-emerald-50 px-3 py-3.5">
                      <AnalyticsBilingualTopicLabel
                        code={String(topic?.code || "")}
                        label={String(topic?.label || "Topic")}
                        className="min-w-0 break-words"
                        thaiClassName="text-[12px] font-semibold leading-5 text-slate-800"
                        englishClassName="mt-1 text-[10px] font-medium leading-4 text-slate-600"
                      />
                      <div className="mt-3 text-[12px] font-black text-emerald-600">{Number(topic?.pct || 0).toFixed(2)}% average</div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="min-w-0">
                <div className="mb-2 flex min-h-[40px] items-center justify-center text-center text-[13px] font-black text-amber-500">⚠ (Coaching Focus)</div>
                <div className="space-y-3">
                  {latestCoaching.map((topic: any) => (
                    <div key={String(topic?.code || topic?.label)} data-compare-topic-insight="coaching" className="flex min-h-[130px] flex-col justify-between rounded-xl bg-amber-50 px-3 py-3.5">
                      <AnalyticsBilingualTopicLabel
                        code={String(topic?.code || "")}
                        label={String(topic?.label || "Topic")}
                        className="min-w-0 break-words"
                        thaiClassName="text-[12px] font-semibold leading-5 text-slate-800"
                        englishClassName="mt-1 text-[10px] font-medium leading-4 text-slate-600"
                      />
                      <div className="mt-3 text-[12px] font-black text-amber-500">{Number(topic?.pct || 0).toFixed(2)}% average</div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <img src="/robinhood-logo.png" alt="Robinhood" className="h-7 w-auto object-contain" />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[24px] border border-violet-200 bg-white shadow-[0_12px_34px_rgba(76,29,149,0.08)]">
        <div className="pointer-events-none absolute -left-20 -top-32 h-48 w-48 rounded-full bg-violet-200/80" />
        <div className="pointer-events-none absolute -left-24 -top-36 h-44 w-44 rounded-full bg-violet-600" />

        <div className="relative px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-4 pl-7 sm:pl-10">
            <div>
              <div className="text-[23px] font-black tracking-tight text-slate-950 sm:text-[28px]">Agent Overview: {comparisonTitle}</div>
              <div className="mt-1 text-[11px] font-medium text-slate-500">{periodText}</div>
            </div>
            <img src="/robinhood-logo.png" alt="Robinhood" className="h-7 w-auto object-contain" />
          </div>

          <div className="mt-6 overflow-x-auto rounded-xl border border-violet-200">
            <table className="w-full text-[11px]" style={{ minWidth: String(Math.max(780, 370 + periodReports.length * 190 + 180)) + "px" }}>
              <thead>
                <tr className="bg-violet-600 text-white">
                  <th className="min-w-[300px] px-4 py-3 text-left font-black">Agent</th>
                  {periodReports.map((report: any) => (
                    <th key={String(report?.label || "")} className="min-w-[190px] px-3 py-3 text-center font-black" title={String(report?.label || "")}>
                      {shortPeriodLabel(String(report?.label || ""))}
                    </th>
                  ))}
                  <th className="min-w-[180px] px-3 py-3 text-center font-black">Δ {comparisonTitle}</th>
                </tr>
              </thead>
              <tbody>
                {sortedAgentRows.map((row: any, rowIndex: number) => {
                  const rowDelta = row?.overallDelta === null || row?.overallDelta === undefined
                    ? null
                    : Number(row.overallDelta);
                  const isWeakest = scopeIsAll && weakestAgent && row?.agent === weakestAgent?.agent;
                  const isStrongest = scopeIsAll && strongestAgent && row?.agent === strongestAgent?.agent && strongestAgent?.agent !== weakestAgent?.agent;
                  return (
                    <tr
                      key={String(row?.agent || rowIndex)}
                      className={
                        isWeakest
                          ? "bg-rose-50"
                          : isStrongest
                            ? "bg-emerald-50/70"
                            : rowIndex % 2 === 0
                              ? "bg-white"
                              : "bg-violet-50/70"
                      }
                    >
                      <td className="border-t border-violet-100 px-4 py-3 font-black text-slate-800">
                        {scopeIsAll ? buildSuspendedAgentLabel(String(row?.agent || ""), accountProfiles || []) : scopeLabel}
                      </td>
                      {periodReports.map((report: any) => {
                        const matched = (row?.values || []).find((value: any) => value?.period === report?.label);
                        const score = matched?.score === null || matched?.score === undefined ? null : Number(matched.score);
                        return (
                          <td key={String(row?.agent || "") + "-" + String(report?.label || "")} className="border-t border-violet-100 px-3 py-3 text-center">
                            <span className={report === lastReport ? "font-black text-slate-900" : "font-medium text-slate-600"}>
                              {score === null ? "—" : score.toFixed(2)}
                            </span>
                          </td>
                        );
                      })}
                      <td className={"border-t border-violet-100 px-3 py-3 text-center font-black " + (rowDelta === null ? "text-slate-400" : rowDelta > 0 ? "text-emerald-600" : rowDelta < 0 ? "text-rose-500" : "text-slate-500")}>
                        {rowDelta === null ? "—" : (rowDelta > 0 ? "+" : "") + rowDelta.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
                {!sortedAgentRows.length ? (
                  <tr><td colSpan={periodReports.length + 2} className="px-5 py-10 text-center text-sm font-medium text-slate-400">No Agent data for the selected periods</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {scopeIsAll && weakestAgent && strongestAgent ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-[11px]">
                <span className="font-black text-rose-500">⚠ Largest decline:</span>
                <span className="ml-2 font-bold text-slate-700">{buildSuspendedAgentLabel(String(weakestAgent.agent || ""), accountProfiles || [])} · {formatDelta(Number(weakestAgent.overallDelta))}</span>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-[11px]">
                <span className="font-black text-emerald-600">★ Biggest improvement:</span>
                <span className="ml-2 font-bold text-slate-700">{buildSuspendedAgentLabel(String(strongestAgent.agent || ""), accountProfiles || [])} · {formatDelta(Number(strongestAgent.overallDelta))}</span>
              </div>
            </div>
          ) : !scopeIsAll && sortedAgentRows.length ? (
            <div className={"mt-5 rounded-xl border px-5 py-4 text-[11px] " + (overallDelta > 0 ? "border-emerald-200 bg-emerald-50" : overallDelta < 0 ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50")}>
              <span className={"font-black " + (overallDelta > 0 ? "text-emerald-600" : overallDelta < 0 ? "text-rose-500" : "text-slate-600")}>
                {overallDelta > 0 ? "★ Improvement:" : overallDelta < 0 ? "⚠ Decline:" : "No change:"}
              </span>
              <span className="ml-2 font-bold text-slate-700">{scopeLabel} · {formatDelta(overallDelta)}</span>
            </div>
          ) : null}
        </div>
      </section>
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
        `          <div data-analytics-overview-logic-v90="true" data-analytics-readable-v128="true" className="min-w-0 space-y-5">\n            {isComparisonMode ? (\n              <AnalyticsCompareDashboardV2\n                periodReports={periodTopicReports}\n                topicGroups={topicDifferenceGroups}\n                reportModeName={reportModeName}\n                summary={summaryCards}\n                cases={filteredCases}\n                agentRows={agentComparisonRows}\n                selectedAgent={effectiveSelectedAgent}\n                currentUser={currentUser}\n                accountProfiles={accountProfiles}\n              />\n            ) : null}\n            <div className={isComparisonMode ? "hidden" : "contents"}>\n            <AnalyticsOverviewV89`,
        "compare workspace start"
      );

      next = replaceOrThrow(
        this,
        next,
        `            {isComparisonMode ? (\n              <Panel>\n                <PanelHeader title="Period Comparison" subtitle={\`เปรียบเทียบ \${effectivePeriodLabels.join(" · ")}\`} />\n                <PanelBody><SummaryTable rows={comparisonRowsWithDelta} firstColLabel={reportModeName} /></PanelBody>\n              </Panel>\n            ) : null}\n          </div>\n          <div\n            data-analytics-filterbar-v89="true"`,
        `            {isComparisonMode ? (\n              <Panel>\n                <PanelHeader title="Period Comparison" subtitle={\`เปรียบเทียบ \${effectivePeriodLabels.join(" · ")}\`} />\n                <PanelBody><SummaryTable rows={comparisonRowsWithDelta} firstColLabel={reportModeName} /></PanelBody>\n              </Panel>\n            ) : null}\n            </div>\n          </div>\n          <div\n            data-analytics-filterbar-v89="true"`,
        "compare workspace end"
      );

      next = replaceOrThrow(
        this,
        next,
        `className="h-10 rounded-xl border border-violet-300 bg-violet-700 px-4 text-xs font-bold text-white hover:bg-violet-800">Exit Compare</button>`,
        `className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">← Exit Compare</button>`,
        "embedded exit compare button"
      );

      next = replaceOrThrow(
        this,
        next,
        `className="h-10 rounded-xl border border-violet-200 bg-white px-4 text-xs font-bold text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"\n                    >\n                      Export`,
        `className="h-10 rounded-xl border border-violet-200 bg-white px-4 text-xs font-bold text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"\n                    >\n                      ⇩ Export`,
        "embedded export button"
      );

      next = replaceOrThrow(
        this,
        next,
        `<button type="button" onClick={openAnalyticsCompare} className="h-10 rounded-xl border border-violet-700 bg-violet-700 px-4 text-xs font-bold text-white shadow-sm hover:bg-violet-800">Compare</button>`,
        `<button type="button" onClick={openAnalyticsCompare} className="h-10 rounded-xl border border-fuchsia-500 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 text-xs font-bold text-white shadow-[0_6px_16px_rgba(147,51,234,0.22)] hover:from-violet-800 hover:to-fuchsia-700">{isComparisonMode ? "✦ Edit Comparison" : "⇄ Compare"}</button>`,
        "embedded edit comparison button"
      );

      next = replaceOrThrow(
        this,
        next,
        `className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 shadow-sm hover:border-violet-300 hover:text-violet-700">Exit Compare</button>`,
        `className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">← Exit Compare</button>`,
        "standalone exit compare button"
      );

      next = replaceOrThrow(
        this,
        next,
        `className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 shadow-sm hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"\n              >\n                Export`,
        `className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 shadow-sm hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-40"\n              >\n                ⇩ Export`,
        "standalone export button"
      );

      next = replaceOrThrow(
        this,
        next,
        `<button type="button" onClick={openAnalyticsCompare} className="rounded-xl border border-violet-400 bg-white px-4 py-2.5 text-xs font-medium text-violet-700 shadow-sm hover:bg-violet-50">Compare</button>`,
        `<button type="button" onClick={openAnalyticsCompare} className="rounded-xl border border-fuchsia-500 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2.5 text-xs font-bold text-white shadow-[0_6px_16px_rgba(147,51,234,0.22)] hover:from-violet-800 hover:to-fuchsia-700">{isComparisonMode ? "✦ Edit Comparison" : "⇄ Compare"}</button>`,
        "standalone edit comparison button"
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
