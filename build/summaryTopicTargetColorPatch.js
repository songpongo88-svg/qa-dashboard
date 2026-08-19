function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Summary topic target color patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function summaryTopicTargetColorPatch() {
  let patched = false;

  return {
    name: "summary-topic-target-color",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;

      let next = code;

      next = replaceOrThrow(
        this,
        next,
        `const PERFORMANCE_KPI_TARGET = 85;`,
        `const PERFORMANCE_KPI_TARGET = 85;\n\n// Topic KPI target policy is centralized here so historical months, current months,\n// and future topic-specific targets can share the same visual/status logic.\nconst PERFORMANCE_KPI_TARGET_BY_POLICY_GROUP: Record<string, number> = {\n  "jan-feb-2026": 85,\n  "march-2026": 85,\n  "apr-may-2026": 85,\n  "june-current": 85,\n};\n\n// Optional per-topic overrides. Leave a topic absent to inherit its month's target.\nconst TOPIC_KPI_TARGET_OVERRIDES_BY_POLICY_GROUP: Record<string, Record<string, number>> = {};\n\nfunction getPerformanceKpiTarget(monthKey: string) {\n  const policyKey = getTopicPolicyGroup(monthKey).key;\n  return PERFORMANCE_KPI_TARGET_BY_POLICY_GROUP[policyKey] ?? PERFORMANCE_KPI_TARGET;\n}\n\nfunction getTopicKpiTarget(monthKey: string, topicCode: string) {\n  const policyKey = getTopicPolicyGroup(monthKey).key;\n  const override = TOPIC_KPI_TARGET_OVERRIDES_BY_POLICY_GROUP[policyKey]?.[String(topicCode || "").trim()];\n  return Number.isFinite(override) ? override : getPerformanceKpiTarget(monthKey);\n}\n\nfunction getGroupedTopicKpiTarget(monthKey: string, topics: TopicSummary[]) {\n  const totalMax = topics.reduce((sum, topic) => sum + Math.max(0, Number(topic.max) || 0), 0);\n  if (!totalMax) return getPerformanceKpiTarget(monthKey);\n  return topics.reduce((sum, topic) => {\n    const weight = Math.max(0, Number(topic.max) || 0);\n    return sum + getTopicKpiTarget(monthKey, topic.code) * weight;\n  }, 0) / totalMax;\n}\n\ntype TopicTargetTone = {\n  key: "below" | "near" | "pass" | "strong";\n  ring: string;\n  text: string;\n  pill: string;\n  group: string;\n};\n\nfunction getTopicTargetTone(scorePct: number, targetPct: number): TopicTargetTone {\n  const difference = scorePct - targetPct;\n  if (difference < -2) {\n    return { key: "below", ring: "text-rose-500", text: "text-rose-600", pill: "bg-rose-50 text-rose-600", group: "bg-rose-100 text-rose-700" };\n  }\n  if (difference < 0) {\n    return { key: "near", ring: "text-amber-500", text: "text-amber-700", pill: "bg-amber-50 text-amber-700", group: "bg-amber-100 text-amber-800" };\n  }\n  if (difference < 5) {\n    return { key: "pass", ring: "text-emerald-500", text: "text-emerald-700", pill: "bg-emerald-50 text-emerald-700", group: "bg-emerald-100 text-emerald-800" };\n  }\n  return { key: "strong", ring: "text-emerald-700", text: "text-emerald-800", pill: "bg-emerald-100 text-emerald-800", group: "bg-emerald-200 text-emerald-900" };\n}`,
        "central KPI target policy"
      );

      next = replaceOrThrow(
        this,
        next,
        `function AnalyticsGroupedTopicDetail({\n  topics,\n}: {\n  topics: TopicSummary[];\n}) {\n  const groups = buildAnalyticsTopicGroups(topics);`,
        `function AnalyticsGroupedTopicDetail({\n  topics,\n  monthKey,\n}: {\n  topics: TopicSummary[];\n  monthKey: string;\n}) {\n  const groups = buildAnalyticsTopicGroups(topics);`,
        "grouped topic detail signature"
      );

      next = replaceOrThrow(
        this,
        next,
        `        const groupDifference =\n          group.percentage - PERFORMANCE_KPI_TARGET;\n        const groupMeetsKpi = groupDifference >= 0;`,
        `        const groupTarget = getGroupedTopicKpiTarget(monthKey, group.topics);\n        const groupDifference = group.percentage - groupTarget;\n        const groupMeetsKpi = groupDifference >= 0;\n        const groupTone = getTopicTargetTone(group.percentage, groupTarget);`,
        "grouped topic KPI calculation"
      );

      next = replaceOrThrow(
        this,
        next,
        `                    (groupMeetsKpi\n                      ? "bg-emerald-100 text-emerald-800"\n                      : "bg-rose-100 text-rose-700")`,
        `                    groupTone.group`,
        "grouped topic status color"
      );

      next = replaceOrThrow(
        this,
        next,
        `                const kpiDifference =\n                  topic.pct - PERFORMANCE_KPI_TARGET;\n                const meetsKpi = kpiDifference >= 0;`,
        `                const topicTarget = getTopicKpiTarget(monthKey, topic.code);\n                const kpiDifference = topic.pct - topicTarget;\n                const meetsKpi = kpiDifference >= 0;\n                const topicTone = getTopicTargetTone(topic.pct, topicTarget);`,
        "grouped topic row KPI calculation"
      );

      next = replaceOrThrow(
        this,
        next,
        `                          (meetsKpi\n                            ? "bg-emerald-50 text-emerald-700"\n                            : "bg-rose-50 text-rose-600")`,
        `                          topicTone.pill`,
        "grouped topic row color"
      );

      next = replaceOrThrow(
        this,
        next,
        `function AnalyticsTopicDetail({ topics }: { topics: TopicSummary[] }) {`,
        `function AnalyticsTopicDetail({ topics, monthKey }: { topics: TopicSummary[]; monthKey: string }) {`,
        "topic detail signature"
      );

      next = replaceOrThrow(
        this,
        next,
        `  if (orderedTopics.length > 4) {\n    return <AnalyticsGroupedTopicDetail topics={orderedTopics} />;\n  }\n\n  const ringRadius = 42;\n  const ringCircumference = 2 * Math.PI * ringRadius;\n  const kpiMarkerRotation =\n    (PERFORMANCE_KPI_TARGET / 100) * 360;`,
        `  if (orderedTopics.length > 4) {\n    return <AnalyticsGroupedTopicDetail topics={orderedTopics} monthKey={monthKey} />;\n  }\n\n  const ringRadius = 42;\n  const ringCircumference = 2 * Math.PI * ringRadius;`,
        "topic detail grouped mode and marker"
      );

      next = replaceOrThrow(
        this,
        next,
        `          const kpiDifference =\n            topic.pct - PERFORMANCE_KPI_TARGET;\n          const meetsKpi = kpiDifference >= 0;`,
        `          const topicTarget = getTopicKpiTarget(monthKey, topic.code);\n          const kpiDifference = topic.pct - topicTarget;\n          const meetsKpi = kpiDifference >= 0;\n          const topicTone = getTopicTargetTone(topic.pct, topicTarget);\n          const kpiMarkerRotation = (topicTarget / 100) * 360;`,
        "ring topic KPI calculation"
      );

      next = replaceOrThrow(
        this,
        next,
        '                  aria-label={`${accessibleTitle}: ${topic.pct.toFixed(2)}%, KPI ${PERFORMANCE_KPI_TARGET}%`}',
        '                  aria-label={`${accessibleTitle}: ${topic.pct.toFixed(2)}%, KPI ${topicTarget}%`}',
        "ring accessibility target"
      );

      next = replaceOrThrow(this, next, `                    className="text-violet-600"`, `                    className={topicTone.ring}`, "ring progress color");
      next = replaceOrThrow(this, next, `                    KPI {PERFORMANCE_KPI_TARGET}%`, `                    KPI {topicTarget}%`, "ring center target");
      next = replaceOrThrow(this, next, `                  (meetsKpi\n                    ? "text-emerald-700"\n                    : "text-rose-600")`, `                  topicTone.text`, "ring status text color");

      next = replaceOrThrow(
        this,
        next,
        `                              คะแนนเฉลี่ยรายหัวข้อเทียบกับเกณฑ์ KPI {PERFORMANCE_KPI_TARGET}%`,
        `                              คะแนนเฉลี่ยรายหัวข้อเทียบกับเกณฑ์ KPI {getPerformanceKpiTarget(summaryCards.policyMonthKey)}%`,
        "topic detail subtitle target"
      );

      next = replaceOrThrow(
        this,
        next,
        `                          <AnalyticsTopicDetail\n                            topics={topicSummary}\n                          />`,
        `                          <AnalyticsTopicDetail\n                            topics={topicSummary}\n                            monthKey={summaryCards.policyMonthKey}\n                          />`,
        "topic detail month binding"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Summary topic target color patch was not applied.");
    },
  };
}
