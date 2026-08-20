function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics single-period score drivers patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsSinglePeriodScoreDriversPatch() {
  let patched = false;

  return {
    name: "analytics-single-period-score-drivers",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;

      let next = code;

      const componentCode = String.raw`
function AnalyticsSinglePeriodScoreDrivers({ context }: { context: any }) {
  if (!context) return null;

  if (!context.previousKey) {
    return (
      <section data-analytics-single-period-score-drivers-v1="true" className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Score Drivers</div>
              <div className="mt-1 text-sm font-black text-slate-950">สาเหตุที่คะแนนเพิ่ม / ลด</div>
              <div className="mt-1 text-[10px] font-semibold text-slate-500">ระบบเทียบช่วงที่กำลังดูกับช่วงก่อนหน้าให้อัตโนมัติ</div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black text-slate-500">Auto Compare</span>
          </div>
        </div>
        <div className="px-4 py-5 text-[10px] font-semibold text-slate-500 sm:px-5">
          ไม่มีช่วงเวลาก่อนหน้าสำหรับใช้วิเคราะห์การเปลี่ยนแปลง
        </div>
      </section>
    );
  }

  if (!context.previousCaseCount || !context.currentCaseCount) {
    return (
      <section data-analytics-single-period-score-drivers-v1="true" className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Score Drivers</div>
              <div className="mt-1 text-sm font-black text-slate-950">สาเหตุที่คะแนนเพิ่ม / ลด</div>
              <div className="mt-1 text-[10px] font-semibold text-slate-500">{context.currentLabel} เทียบกับ {context.previousLabel}</div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black text-slate-500">Auto Compare</span>
          </div>
        </div>
        <div className="px-4 py-5 text-[10px] font-semibold text-slate-500 sm:px-5">
          ไม่พบข้อมูลเคสครบทั้งสองช่วง จึงยังไม่สามารถสรุปสาเหตุคะแนนเพิ่ม / ลดได้
        </div>
      </section>
    );
  }

  if (!Array.isArray(context.rows) || !context.rows.length || !context.rows.some((row: any) => Array.isArray(row.topics) && row.topics.length)) {
    return (
      <section data-analytics-single-period-score-drivers-v1="true" className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-600">Score Drivers</div>
              <div className="mt-1 text-sm font-black text-slate-950">สาเหตุที่คะแนนเพิ่ม / ลด</div>
              <div className="mt-1 text-[10px] font-semibold text-slate-500">{context.currentLabel} เทียบกับ {context.previousLabel}</div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black text-slate-500">Auto Compare</span>
          </div>
        </div>
        <div className="px-4 py-5 text-[10px] font-semibold text-slate-500 sm:px-5">
          ไม่พบ Topic ที่เปรียบเทียบกันได้ หรือคะแนนไม่เปลี่ยนจากช่วงก่อนหน้า
        </div>
      </section>
    );
  }

  return (
    <div data-analytics-single-period-score-drivers-v1="true" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-100 bg-violet-50/60 px-3.5 py-2.5">
        <div className="text-[10px] font-bold text-violet-800">
          วิเคราะห์อัตโนมัติ: {context.currentLabel} เทียบกับ {context.previousLabel}
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-violet-700 shadow-sm">Auto Compare</span>
      </div>
      <AnalyticsIntentDriverSummary rows={context.rows} />
    </div>
  );
}

`;

      next = replaceOrThrow(
        this,
        next,
        `function AnalyticsAgentPerformanceV92({`,
        `${componentCode}function AnalyticsAgentPerformanceV92({`,
        "single-period score driver component anchor"
      );

      const memoCode = String.raw`
  const singlePeriodScoreDriverContext = useMemo(() => {
    if (effectivePeriodKeys.length !== 1 || comparisonRows.length >= 2) return null;

    const currentKey = effectivePeriodKeys[0] || "";
    const currentIndex = periodOptions.indexOf(currentKey);
    const previousKey = currentIndex >= 0 ? periodOptions[currentIndex + 1] || "" : "";
    const displayLabelForKey = (periodKey: string) => {
      if (!periodKey) return "";
      if (analysisMode === "monthly") {
        return allCases.find((item) => item.monthKey === periodKey)?.monthLabel || periodKey;
      }
      return periodKey;
    };

    const currentLabel = displayLabelForKey(currentKey);
    const previousLabel = displayLabelForKey(previousKey);

    if (!previousKey) {
      return {
        currentKey,
        previousKey: "",
        currentLabel,
        previousLabel: "",
        currentCaseCount: 0,
        previousCaseCount: 0,
        rows: [],
      };
    }

    const casesForPeriod = (periodKey: string) =>
      allCases.filter((item) => {
        if (
          roleScopedAgentList.length &&
          !roleScopedAgentList.some((agent) => isSameAgent(item.agent, agent))
        ) {
          return false;
        }

        if (selectedTeam !== "all") {
          const account = getAccountStatus(item.agent, accountProfiles);
          if (
            normalizeText(getSummaryTeamName(account)) !==
            normalizeText(selectedTeam)
          ) {
            return false;
          }
        }

        if (
          effectiveSelectedAgent !== "all" &&
          !isSameAgent(item.agent, effectiveSelectedAgent)
        ) {
          return false;
        }

        if (analysisMode === "weekly") return item.weekLabel === periodKey;
        if (analysisMode === "monthly") return item.monthKey === periodKey;
        return item.yearKey === periodKey;
      });

    const previousCases = casesForPeriod(previousKey);
    const currentCases = casesForPeriod(currentKey);

    const buildReport = (periodKey: string, periodCases: CaseItem[]) => {
      const activeCodes = new Set(
        periodCases.flatMap((item) =>
          (
            item.reviewStatus === "Revised" && item.revisedTopics?.length
              ? mergeTopicSet(item.topics, item.revisedTopics)
              : item.topics
          ).map((topic) => topic.code)
        )
      );
      const topics = buildTopicSummary(periodCases).filter((topic) =>
        activeCodes.has(topic.code)
      );
      const summary = summarizeCases(periodCases);
      return {
        label: displayLabelForKey(periodKey),
        cases: periodCases,
        topics,
        avgScore: summary.avgScore,
        caseCount: summary.caseCount,
        grade: summary.grade,
      };
    };

    const rows =
      previousCases.length && currentCases.length
        ? buildAnalyticsIntentDriverSummary([
            buildReport(previousKey, previousCases),
            buildReport(currentKey, currentCases),
          ])
        : [];

    return {
      currentKey,
      previousKey,
      currentLabel,
      previousLabel,
      currentCaseCount: currentCases.length,
      previousCaseCount: previousCases.length,
      rows,
    };
  }, [
    effectivePeriodKeys,
    comparisonRows.length,
    periodOptions,
    allCases,
    analysisMode,
    roleScopedAgentList,
    selectedTeam,
    accountProfiles,
    effectiveSelectedAgent,
  ]);

`;

      next = replaceOrThrow(
        this,
        next,
        `  const agentDisplayPeriods = comparisonRows;`,
        `${memoCode}  const agentDisplayPeriods = comparisonRows;`,
        "single-period score driver memo anchor"
      );

      next = replaceOrThrow(
        this,
        next,
        `            <AnalyticsAgentPerformanceV92`,
        `            {!isComparisonMode ? (\n              <AnalyticsSinglePeriodScoreDrivers context={singlePeriodScoreDriverContext} />\n            ) : null}\n            <AnalyticsAgentPerformanceV92`,
        "single-period score driver UI anchor"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics single-period score drivers patch was not applied.");
    },
  };
}
