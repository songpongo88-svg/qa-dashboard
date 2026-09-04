function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics Comparison PDF data parity patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsComparePdfDataParityPatch() {
  let patched = false;

  return {
    name: "analytics-compare-pdf-data-parity",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;
      if (!code.includes("data-analytics-compare-single-period-pdf-parity-v29")) {
        this.error("Single-period Comparison patch must run before PDF data parity patch.");
      }

      let next = code;

      next = replaceOrThrow(
        this,
        next,
        `    const reportSummary = summarizeCases(filteredCases);`,
        `    // data-analytics-compare-pdf-data-parity-v32\n    // Keep the original PDF design, but source its headline metrics from the\n    // exact latest Comparison period shown on screen. Period-by-period sections\n    // continue to use periodTopicReports, so their values remain tied to each\n    // selected period.\n    const comparisonPdfSummaryCasesV32 =\n      isComparisonMode && periodTopicReports.length\n        ? (Array.isArray(periodTopicReports[periodTopicReports.length - 1]?.cases)\n            ? periodTopicReports[periodTopicReports.length - 1].cases\n            : [])\n        : filteredCases;\n    const reportSummary = summarizeCases(comparisonPdfSummaryCasesV32);`,
        "PDF report summary source"
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics Comparison PDF data parity patch was not applied.");
    },
  };
}
