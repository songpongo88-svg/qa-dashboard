function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics single-period/PDF parity patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsCompareSinglePeriodPdfParityPatch() {
  let patched = false;

  return {
    name: "analytics-compare-single-period-pdf-parity",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;
      if (!code.includes('data-analytics-compare-ppt-report-v1="true"')) {
        this.error("Analytics compare UI redesign must run before single-period patch.");
      }
      if (!code.includes("data-analytics-compare-inline-differences-v27")) {
        this.error("Analytics inline differences patch must run before single-period patch.");
      }

      let next = code;

      next = replaceOrThrow(
        this,
        next,
        `  const [analyticsCompareOpen, setAnalyticsCompareOpen] = useState(false);\n  const [compareDraftPeriods, setCompareDraftPeriods] = useState<string[]>([]);`,
        `  const [analyticsCompareOpen, setAnalyticsCompareOpen] = useState(false);\n  // data-analytics-compare-single-period-pdf-parity-v29\n  const [analyticsCompareViewActiveV29, setAnalyticsCompareViewActiveV29] = useState(false);\n  const [compareDraftPeriods, setCompareDraftPeriods] = useState<string[]>([]);`,
        "compare active state"
      );

      next = replaceOrThrow(
        this,
        next,
        `  const isComparisonMode = comparisonRows.length >= 2;`,
        `  const isComparisonMode =\n    comparisonRows.length >= 1 &&\n    (analyticsCompareViewActiveV29 || selectedPeriods.length >= 2);`,
        "comparison mode condition"
      );

      if (!next.includes("disabled={compareDraftPeriods.length < 2}")) {
        this.error("Analytics Compare Apply minimum-period anchor was not found.");
      }
      next = next.replaceAll(
        "disabled={compareDraftPeriods.length < 2}",
        "disabled={compareDraftPeriods.length < 1}"
      );

      next = replaceOrThrow(
        this,
        next,
        `                          const nextPeriods = sortCompareDraftPeriodKeys(compareDraftPeriods);`,
        `                          const nextPeriods = sortCompareDraftPeriodKeys(compareDraftPeriods);\n                          setAnalyticsCompareViewActiveV29(true);`,
        "Compare Apply activation"
      );

      if (!next.includes("const lastPeriod = effectivePeriodKeys[effectivePeriodKeys.length - 1];")) {
        this.error("Exit Compare anchor was not found.");
      }
      next = next.replaceAll(
        "const lastPeriod = effectivePeriodKeys[effectivePeriodKeys.length - 1];",
        "const lastPeriod = effectivePeriodKeys[effectivePeriodKeys.length - 1];\n                      setAnalyticsCompareViewActiveV29(false);"
      );

      next = replaceOrThrow(
        this,
        next,
        `  if (!Array.isArray(periodReports) || periodReports.length < 2) return null;`,
        `  if (!Array.isArray(periodReports) || periodReports.length < 1) return null;`,
        "compare dashboard one-period guard"
      );

      next = replaceOrThrow(
        this,
        next,
        `  const overallDelta = Number((lastScore - firstScore).toFixed(2));\n  const comparisonUnit = reportModeName === "Weekly" ? "Week" : reportModeName === "Monthly" ? "Month" : "Year";\n  const comparisonTitle = comparisonUnit + "-over-" + comparisonUnit;`,
        `  const overallDelta = periodReports.length > 1\n    ? Number((lastScore - firstScore).toFixed(2))\n    : null;\n  const comparisonUnit = reportModeName === "Weekly" ? "Week" : reportModeName === "Monthly" ? "Month" : "Year";\n  const comparisonTitle = periodReports.length > 1\n    ? comparisonUnit + "-over-" + comparisonUnit\n    : "Selected " + comparisonUnit;`,
        "single-period compare title and delta"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics single-period patch was not applied.");
    },
  };
}
