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
  const [activeTab, setActiveTab] = useState<"overview" | "topics" | "drivers">("overview");

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
  const isWeekly = String(reportModeName || "").toLowerCase().includes("week");

  const monthDetailsForReport = (report: any) => {
    const reportCases = Array.isArray(report?.cases) ? report.cases : [];
    const referenceCase = reportCases[0] || null;
    const monthKey = String(referenceCase?.monthKey || "");
    const monthLabel = String(
      referenceCase?.monthLabel ||
      (monthKey ? getMonthLabelForKey(monthKey, reportCases) : report?.label || "Period")
    );
    return { monthKey, monthLabel };
  };

  const periodGroups = periodReports.reduce((groups: any[], report: any) => {
    const month = monthDetailsForReport(report);
    const groupKey = isWeekly
      ? month.monthKey || month.monthLabel
      : String(report?.label || month.monthLabel);
    const policyKey = String(report?.policy?.key || "default");
    const policyLabel = String(report?.policy?.label || "QA Criteria");
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.key === groupKey) {
      lastGroup.reports.push(report);
      if (!lastGroup.policyKeys.includes(policyKey)) lastGroup.policyKeys.push(policyKey);
      if (!lastGroup.policyLabels.includes(policyLabel)) lastGroup.policyLabels.push(policyLabel);
      return groups;
    }

    groups.push({
      key: groupKey,
      label: isWeekly ? month.monthLabel : String(report?.label || month.monthLabel),
      reports: [report],
      policyKeys: [policyKey],
      policyLabels: [policyLabel],
    });
    return groups;
  }, []);

  const topicMaster = new Map<string, any>();
  periodReports.forEach((report: any) => {
    (report?.topics || []).forEach((topic: any) => {
      topicMaster.set(String(topic.code), {
        code: String(topic.code || ""),
        label: String(topic.label || topic.code || "Topic"),
      });
    });
  });

  const topicCards = Array.from(topicMaster.values()).map((topic: any) => {
    const values = periodReports.map((report: any) => {
      const matched = (report?.topics || []).find(
        (item: any) => String(item.code) === String(topic.code)
      );
      return {
        report,
        pct: matched ? Number(matched.pct) : null,
        policyKey: String(report?.policy?.key || "default"),
      };
    });
    const first = values[0];
    const last = values[values.length - 1];
    const sameCriteria = first.policyKey === last.policyKey;
    let status = "Comparable";
    if (first.pct === null && last.pct !== null) status = "New";
    else if (first.pct !== null && last.pct === null) status = "Removed";
    else if (first.pct === null || last.pct === null || !sameCriteria) status = "Not Comparable";
    const delta = status === "Comparable"
      ? Number((Number(last.pct) - Number(first.pct)).toFixed(2))
      : null;
    const target = last.pct !== null
      ? getTopicKpiTarget(
          getPolicyMonthKeyForCases(last.report?.cases || []),
          topic.code
        )
      : PERFORMANCE_KPI_TARGET;
    const topicTitle = splitAnalyticsTopicTitle(topic.label);

    return {
      ...topic,
      thaiLabel: topicTitle.thai,
      englishLabel: topicTitle.english,
      first,
      last,
      status,
      delta,
      target,
      passed: last.pct !== null && Number(last.pct) >= target,
    };
  });

  const formatDelta = (value: number | null) => {
    if (value === null) return "N/A";
    return (value > 0 ? "+" : "") + value.toFixed(2) + " pp";
  };

  const rubricChangedBetween = (left: any, right: any) => {
    const leftKeys = (left?.policyKeys || []).join("|");
    const rightKeys = (right?.policyKeys || []).join("|");
    return leftKeys !== rightKeys;
  };

  const tabs = [
    { value: "overview", label: "Overview", helper: "ภาพรวม" },
    { value: "topics", label: "Topic Changes", helper: "หัวข้อ" },
    { value: "drivers", label: "Score Drivers", helper: "สาเหตุ" },
  ];

  return (
    <div data-analytics-compare-redesign-v2="true" className="space-y-5">
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-white via-white to-violet-50/70 px-5 py-5 sm:px-6">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Compare Analytics</div>
            <div className="mt-1 text-lg font-black text-slate-950">เปรียบเทียบผล QA ตามช่วงเวลาที่เลือก</div>
            <div className="mt-1 text-[10px] font-medium text-slate-500">{reportModeName} Comparison · แยกภาพรวม การเปลี่ยนแปลงรายหัวข้อ และสาเหตุคะแนน</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-violet-100 bg-violet-50 px-3 py-1.5 text-[10px] font-black text-violet-700">{periodReports.length} Periods</span>
            {differentCriteria ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-black text-amber-700">Rubric changed</span>
            ) : null}
          </div>
        </div>

        <div className="border-b border-slate-100 bg-white px-4 pt-3 sm:px-6">
          <div className="flex min-w-max gap-1" role="tablist" aria-label="Compare result sections">
            {tabs.map((tab) => {
              const selected = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.value as "overview" | "topics" | "drivers")}
                  className={
                    "relative min-w-[142px] rounded-t-xl px-4 py-3 text-left transition " +
                    (selected
                      ? "bg-violet-50 text-violet-800"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800")
                  }
                >
                  <div className="text-[11px] font-black">{tab.label}</div>
                  <div className="mt-0.5 text-[9px] font-semibold opacity-70">{tab.helper}</div>
                  {selected ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-violet-600" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {activeTab === "overview" ? (
        <div className="space-y-5" role="tabpanel">
          <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Selected Timeline</div>
                <div className="mt-1 text-[15px] font-black text-slate-950">ช่วงเวลาที่เปรียบเทียบ แยกตามเดือน</div>
                <div className="mt-1 text-[10px] font-medium text-slate-500">แต่ละกลุ่มเดือนใช้หัวข้อและเกณฑ์ของช่วงเวลานั้น</div>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black text-slate-600">{periodGroups.length} Month Groups</div>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              {periodGroups.map((group: any, groupIndex: number) => {
                const previousGroup = groupIndex > 0 ? periodGroups[groupIndex - 1] : null;
                const rubricChanged = previousGroup && rubricChangedBetween(previousGroup, group);
                return (
                  <div key={group.key} className="space-y-4">
                    {rubricChanged ? (
                      <div className="flex items-center gap-3 py-1">
                        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-200" />
                        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[9px] font-black text-amber-700">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100">!</span>
                          Rubric changed · ไม่คำนวณ Topic Difference ข้ามเกณฑ์
                        </div>
                        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-200" />
                      </div>
                    ) : null}

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/45">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-sm font-black text-white shadow-sm">{groupIndex + 1}</span>
                          <div>
                            <div className="text-[12px] font-black text-slate-950">{group.label}</div>
                            <div className="mt-0.5 text-[9px] font-semibold text-slate-500">{group.policyLabels.join(" · ")}</div>
                          </div>
                        </div>
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[9px] font-black text-violet-700">{group.reports.length} {group.reports.length === 1 ? "Period" : "Periods"}</span>
                      </div>

                      <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
                        {group.reports.map((report: any) => {
                          const reportIndex = periodReports.findIndex((item: any) => item.label === report.label);
                          const isFirst = reportIndex === 0;
                          const isLast = reportIndex === periodReports.length - 1;
                          const target = getPerformanceKpiTarget(getPolicyMonthKeyForCases(report.cases || []));
                          const passed = Number(report.avgScore || 0) >= target;
                          return (
                            <article key={report.label} className={"rounded-2xl border bg-white p-4 " + (isLast ? "border-violet-300 shadow-[0_5px_16px_rgba(124,58,237,0.10)]" : "border-slate-200")}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className={"text-[9px] font-black uppercase tracking-[0.12em] " + (isLast ? "text-violet-600" : isFirst ? "text-emerald-600" : "text-slate-400")}>{isFirst ? "ช่วงแรก" : isLast ? "ช่วงล่าสุด" : "ช่วงที่ " + (reportIndex + 1)}</div>
                                  <div className="mt-1 text-[12px] font-black text-slate-950">{report.label}</div>
                                </div>
                                <span className={"rounded-full px-2.5 py-1 text-[9px] font-black " + (passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>{passed ? "PASS" : "FAIL"}</span>
                              </div>
                              <div className="mt-3 flex items-end justify-between gap-4 border-t border-slate-100 pt-3">
                                <div>
                                  <div className="text-[9px] font-semibold text-slate-400">Average Score</div>
                                  <div className="mt-0.5 text-xl font-black text-slate-950">{Number(report.avgScore || 0).toFixed(2)}%</div>
                                </div>
                                <div className="text-right text-[9px] font-semibold text-slate-500">
                                  <div>{report.caseCount} Cases</div>
                                  <div className="mt-1">Grade {report.grade}</div>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Comparison Summary</div>
                <div className="mt-1 text-[15px] font-black text-slate-950">จากช่วงแรกถึงช่วงล่าสุด</div>
              </div>
              <span className={"rounded-full px-3 py-1.5 text-[10px] font-black " + (overallDelta > 0 ? "bg-emerald-100 text-emerald-700" : overallDelta < 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>{formatDelta(overallDelta)}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 px-4 py-4"><div className="text-[9px] font-semibold text-slate-400">รวมเคส</div><div className="mt-1 text-xl font-black text-slate-950">{totalCases}</div></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4"><div className="text-[9px] font-semibold text-slate-400">คะแนนเฉลี่ยรวม</div><div className="mt-1 text-xl font-black text-slate-950">{Number(summary?.avgScore || 0).toFixed(2)}%</div></div>
              <div className="rounded-2xl bg-slate-50 px-4 py-4"><div className="text-[9px] font-semibold text-slate-400">เกรดรวม</div><div className="mt-1 text-xl font-black text-slate-950">{summary?.grade || "-"}</div></div>
              <div className={"rounded-2xl px-4 py-4 " + (overallDelta > 0 ? "bg-emerald-50" : overallDelta < 0 ? "bg-rose-50" : "bg-slate-50")}><div className="text-[9px] font-semibold text-slate-400">ช่วงล่าสุดเทียบช่วงแรก</div><div className={"mt-1 text-xl font-black " + (overallDelta > 0 ? "text-emerald-700" : overallDelta < 0 ? "text-rose-600" : "text-slate-700")}>{formatDelta(overallDelta)}</div></div>
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "topics" ? (
        <div className="space-y-5" role="tabpanel">
          <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Topic Changes</div>
                <div className="mt-1 text-[15px] font-black text-slate-950">สรุปการเปลี่ยนแปลงรายหัวข้อ</div>
                <div className="mt-1 text-[10px] font-medium text-slate-500">คำนวณ Difference เฉพาะหัวข้อที่ใช้ Rubric เดียวกัน</div>
              </div>
              <div className="flex flex-wrap gap-2 text-[9px] font-black"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">New</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">Removed</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">Not Comparable</span></div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {topicCards.map((topic: any) => {
                const statusTone = topic.status === "New" ? "border-blue-200 bg-blue-50/40" : topic.status === "Removed" ? "border-slate-200 bg-slate-50" : topic.status === "Not Comparable" ? "border-amber-200 bg-amber-50/40" : topic.passed ? "border-emerald-200 bg-emerald-50/35" : "border-rose-200 bg-rose-50/35";
                return (
                  <article key={topic.code} className={"overflow-hidden rounded-2xl border " + statusTone}>
                    <div className="flex min-h-[76px] items-start gap-3 border-b border-slate-200/70 px-4 py-3">
                      <span className="inline-flex h-7 min-w-[30px] shrink-0 items-center justify-center rounded-lg bg-white px-2 text-[10px] font-black text-violet-700 shadow-sm">{topic.code}</span>
                      <div className="min-w-0"><div className="text-[11px] font-black leading-5 text-slate-900">{topic.thaiLabel}</div>{topic.englishLabel ? <div className="mt-0.5 text-[9px] font-black italic leading-4 text-rose-600">{topic.englishLabel}</div> : null}</div>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-slate-200/70 px-2 py-4 text-center">
                      <div><div className="text-[9px] font-semibold text-slate-400">ช่วงแรก</div><div className="mt-1 text-base font-black text-slate-800">{topic.first.pct !== null ? Number(topic.first.pct).toFixed(2) + "%" : "N/A"}</div></div>
                      <div><div className="text-[9px] font-semibold text-slate-400">ช่วงล่าสุด</div><div className={"mt-1 text-base font-black " + (topic.last.pct === null ? "text-slate-400" : topic.passed ? "text-emerald-700" : "text-rose-600")}>{topic.last.pct !== null ? Number(topic.last.pct).toFixed(2) + "%" : "N/A"}</div></div>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200/70 bg-white/70 px-4 py-2.5">
                      <span className="text-[9px] font-semibold text-slate-500">{topic.status === "Comparable" ? "Target " + topic.target + "%" : topic.status}</span>
                      <span className={"text-[10px] font-black " + (topic.delta === null ? "text-slate-400" : topic.delta > 0 ? "text-emerald-700" : topic.delta < 0 ? "text-rose-600" : "text-slate-600")}>{topic.status === "Comparable" ? formatDelta(topic.delta) : "—"}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {topicGroups.map((group: any, groupIndex: number) => {
            const reports = Array.isArray(group?.reports) ? group.reports : [];
            const groupMonths = Array.from(new Set(reports.map((report: any) => monthDetailsForReport(report).monthLabel)));
            return (
              <div key={group.key} className="space-y-5">
                {groupIndex > 0 ? (
                  <div className="flex items-center gap-3 px-2"><span className="h-px flex-1 bg-amber-200" /><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[9px] font-black text-amber-700">Rubric changed · ตารางด้านล่างเป็นคนละชุดเกณฑ์</span><span className="h-px flex-1 bg-amber-200" /></div>
                ) : null}
                <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
                    <div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Topic Comparison Matrix</div><div className="mt-1 text-[15px] font-black text-slate-950">{group.label}</div><div className="mt-1 text-[9px] font-semibold text-slate-500">{groupMonths.join(" · ")}</div></div>
                    <div className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black text-slate-600">{reports.length} {reports.length === 1 ? "Period" : "Periods"}</div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px]" style={{ minWidth: String(Math.max(820, 300 + reports.length * 180 + 130)) + "px" }}>
                      <thead><tr className="bg-slate-900 text-white"><th className="min-w-[280px] px-4 py-3 text-left font-semibold">หัวข้อ (Topic)</th>{reports.map((report: any) => { const month = monthDetailsForReport(report); return <th key={report.label} className="min-w-[180px] px-3 py-3 text-center"><div className="text-[9px] font-black text-violet-200">{month.monthLabel}</div><div className="mt-1 font-semibold text-white">{report.label}</div></th>; })}<th className="min-w-[130px] px-3 py-3 text-center font-semibold">Difference</th></tr></thead>
                      <tbody>
                        {(group.topics || []).map((topic: any, topicIndex: number) => {
                          const values = reports.map((report: any) => (topic.values || []).find((item: any) => item.period === report.label)?.pct ?? null);
                          const firstAvailableIndex = values.findIndex((value: any) => value !== null);
                          const lastAvailableIndex = values.reduce((last: number, value: any, index: number) => value !== null ? index : last, -1);
                          const firstPct = firstAvailableIndex >= 0 ? Number(values[firstAvailableIndex]) : null;
                          const lastPct = lastAvailableIndex >= 0 ? Number(values[lastAvailableIndex]) : null;
                          const rowDelta = reports.length > 1 && firstPct !== null && lastPct !== null && firstAvailableIndex !== lastAvailableIndex ? Number((lastPct - firstPct).toFixed(2)) : null;
                          const topicTitle = splitAnalyticsTopicTitle(String(topic.label || topic.code || "Topic"));
                          return (
                            <tr key={topic.code} className={topicIndex % 2 === 0 ? "bg-white" : "bg-slate-50/60"}>
                              <td className="border-t border-slate-100 px-4 py-4"><div className="flex items-center gap-2.5"><span className="inline-flex h-7 min-w-[32px] items-center justify-center rounded-lg bg-violet-100 px-2 text-[10px] font-black text-violet-700">{topic.code}</span><div className="min-w-0"><div className="font-bold leading-5 text-slate-900">{topicTitle.thai}</div>{topicTitle.english ? <div className="mt-0.5 text-[9px] font-bold italic leading-4 text-rose-600">{topicTitle.english}</div> : null}</div></div></td>
                              {reports.map((report: any, reportIndex: number) => {
                                const pct = values[reportIndex];
                                const target = getTopicKpiTarget(getPolicyMonthKeyForCases(report.cases || []), topic.code);
                                const passed = pct !== null && Number(pct) >= target;
                                let missingStatus = "No Data";
                                if (pct === null && reportIndex < firstAvailableIndex) missingStatus = "New later";
                                else if (pct === null && lastAvailableIndex >= 0 && reportIndex > lastAvailableIndex) missingStatus = "Removed";
                                return <td key={String(topic.code) + "-" + report.label} className="border-t border-slate-100 px-3 py-3">{pct === null ? <div className="text-center"><span className={"inline-flex rounded-full px-2.5 py-1 text-[9px] font-black " + (missingStatus === "Removed" ? "bg-slate-100 text-slate-600" : missingStatus === "New later" ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-400")}>{missingStatus}</span></div> : <div className="flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200"><div className={"h-full rounded-full " + (passed ? "bg-emerald-500" : "bg-rose-500")} style={{ width: String(Math.max(0, Math.min(100, Number(pct)))) + "%" }} /></div><div className="w-[58px] text-right"><div className={"font-black " + (passed ? "text-emerald-700" : "text-rose-600")}>{Number(pct).toFixed(2)}%</div><div className="mt-0.5 text-[8px] font-semibold text-slate-400">Target {target}%</div></div></div>}</td>;
                              })}
                              <td className="border-t border-slate-100 px-3 py-3 text-center"><span className={"inline-flex rounded-full px-2.5 py-1 text-[10px] font-black " + (rowDelta === null ? "bg-amber-50 text-amber-700" : rowDelta > 0 ? "bg-emerald-100 text-emerald-700" : rowDelta < 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>{rowDelta === null ? "Not Comparable" : formatDelta(rowDelta)}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            );
          })}
        </div>
      ) : null}

      {activeTab === "drivers" ? (
        <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]" role="tabpanel">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div><div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Score Drivers</div><div className="mt-1 text-[15px] font-black text-slate-950">สาเหตุหลักของคะแนนที่เพิ่ม / ลด</div><div className="mt-1 text-[10px] font-medium text-slate-500">แสดงสูงสุด 3 หัวข้อสำคัญต่อการเปลี่ยนช่วง เพื่อลดความรก</div></div>
            <div className="flex items-center gap-2 text-[9px] font-bold"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">ดีขึ้น</span><span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">ลดลง</span></div>
          </div>

          {driverTransitions.length ? (
            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3 sm:p-6">
              {driverTransitions.map((transition: any) => {
                const currentReport = periodReports.find((report: any) => report.label === transition.period);
                const previousReport = periodReports.find((report: any) => report.label === transition.previousPeriod);
                const criteriaChanged = String(currentReport?.policy?.key || "") !== String(previousReport?.policy?.key || "");
                const currentMonth = monthDetailsForReport(currentReport || {});
                const previousMonth = monthDetailsForReport(previousReport || {});
                return (
                  <article key={transition.period} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/45">
                    <div className="border-b border-slate-200 bg-white px-4 py-4">
                      <div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-black text-violet-600">{previousMonth.monthLabel} → {currentMonth.monthLabel}</div><div className="mt-1 text-[11px] font-black leading-5 text-slate-950">{transition.previousPeriod}<br />→ {transition.period}</div></div><span className={"shrink-0 rounded-full px-2.5 py-1.5 text-[9px] font-black " + (criteriaChanged ? "bg-amber-100 text-amber-700" : transition.overallDelta > 0 ? "bg-emerald-100 text-emerald-700" : transition.overallDelta < 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600")}>{criteriaChanged ? "Not Comparable" : formatDelta(transition.overallDelta)}</span></div>
                    </div>

                    {criteriaChanged ? (
                      <div className="p-4"><div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4"><div className="text-[10px] font-black text-amber-800">Rubric changed</div><div className="mt-1 text-[9px] font-semibold leading-5 text-amber-700">หัวข้อและน้ำหนักคะแนนเป็นคนละเกณฑ์ จึงไม่สรุปสาเหตุแบบเทียบตรงเพื่อป้องกันความเข้าใจผิด</div></div></div>
                    ) : (
                      <div className="space-y-3 p-3">
                        {(transition.topics || []).slice(0, 3).map((topic: any) => {
                          const topicTitle = splitAnalyticsTopicTitle(String(topic.label || topic.code || "Topic"));
                          return <div key={transition.period + "-" + topic.code} className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[8px] font-black uppercase tracking-wide text-slate-400">Topic {topic.code}</div><div className="mt-1 text-[10px] font-black leading-5 text-slate-900">{topicTitle.thai}</div>{topicTitle.english ? <div className="mt-0.5 text-[8px] font-bold italic leading-4 text-rose-600">{topicTitle.english}</div> : null}</div><span className={"shrink-0 rounded-full px-2 py-1 text-[9px] font-black " + (topic.direction === "up" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>{formatDelta(topic.delta)}</span></div><div className="mt-3 space-y-2">{(topic.causes || []).slice(0, 2).map((cause: any) => <div key={cause.key} className="rounded-lg bg-slate-50 px-3 py-2"><div className="flex items-start justify-between gap-2"><div className="text-[9px] font-bold leading-4 text-slate-700">{cause.label}</div>{cause.count > 0 ? <span className="shrink-0 text-[8px] font-black text-slate-400">{cause.count} เคส</span> : null}</div>{cause.intents?.length ? <div className="mt-1.5 text-[8px] font-semibold leading-4 text-slate-500">Intent: {cause.intents.slice(0, 2).join(" · ")}</div> : null}</div>)}</div></div>;
                        })}
                        {!(transition.topics || []).length ? <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-[9px] font-semibold text-slate-400">ไม่พบหัวข้อที่สามารถอธิบายการเปลี่ยนแปลงได้</div> : null}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : <div className="p-6"><div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-[10px] font-semibold text-slate-500">ยังไม่มีข้อมูลเพียงพอสำหรับสรุป Score Drivers</div></div>}

          <div className="border-t border-blue-100 bg-blue-50/70 px-5 py-3 text-[9px] font-semibold leading-5 text-blue-700">Score Drivers สรุปจากผลประเมิน QA และ Comment/จุดที่หักของเคส โดยไม่แสดง Case ID ในมุม Compare</div>
        </section>
      ) : null}
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
