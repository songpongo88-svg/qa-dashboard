export function dashboardResetPreservesEvaluationPatch() {
  return {
    name: "dashboard-reset-preserves-evaluation",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/").split("?")[0];

      if (normalized.endsWith("/src/DashboardMockup.tsx")) {
        let next = code;
        const resetEvent = 'window.dispatchEvent(new Event("qa-dashboard-reset-preserve-evaluation-v90"));';

        // Vercel may run the legacy dashboard-unified-reset script before Vite.
        // Replace its full-page reload with an in-place dashboard reset so Evaluate/Edit tabs keep unsaved React state.
        if (next.includes("window.setTimeout(() => window.location.reload(), 0);")) {
          next = next.replace(
            "window.setTimeout(() => window.location.reload(), 0);",
            `resetToCurrentPeriod();\n          ${resetEvent}`
          );
        }

        // GitHub Actions builds the raw source where the search action is still Clear.
        // Convert it to the same safe Reset behaviour without reloading the whole workspace.
        const clearButtonPattern = /<button\s+type="button"\s+onClick=\{clearCaseSearch\}\s+disabled=\{!caseIdSearch\.trim\(\)\}\s+className="[^"]*">Clear<\/button>/;
        if (clearButtonPattern.test(next)) {
          const safeResetButton = `<button type="button" title="ล้างการค้นหา เคสที่เลือก และตัวกรอง Dashboard โดยไม่กระทบงานประเมินที่กำลังทำ" onClick={() => {
          clearCaseSearch();
          [
            "qa_analytics_mode_v134",
            "qa_analytics_periods_v134",
            "qa_analytics_year_filter_v134",
            "qa_analytics_month_filter_v134",
            "qa_analytics_section_v134",
            "qa_analytics_team_month_v134",
            "qa_analytics_team_v134",
            "qa_analytics_team_detail_v134",
            "qa_summary_selected_agent_v119"
          ].forEach((key) => window.sessionStorage.removeItem(key));
          resetToCurrentPeriod();
          ${resetEvent}
        }} className="h-12 rounded-xl border border-sky-200 bg-white px-4 text-xs font-black text-[#155B83] shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-md">Reset</button>`;
          next = next.replace(clearButtonPattern, safeResetButton);
        }

        if (next.includes("window.setTimeout(() => window.location.reload(), 0);")) {
          throw new Error("Dashboard reset preservation patch failed: full-page reload still present");
        }
        if (!next.includes("qa-dashboard-reset-preserve-evaluation-v90")) {
          throw new Error("Dashboard reset preservation patch failed: safe Reset event was not wired");
        }

        return next === code ? null : { code: next, map: null };
      }

      if (normalized.endsWith("/src/SummaryMockup.tsx")) {
        if (code.includes("qa-dashboard-reset-preserve-evaluation-v90")) return null;

        const anchor = '  const [dashboardControlTarget, setDashboardControlTarget] = useState<HTMLElement | null>(null);\n';
        if (!code.includes(anchor)) {
          throw new Error("Dashboard reset preservation patch failed: Summary reset listener anchor missing");
        }

        const listener = `${anchor}\n  // Reset only Dashboard/Analytics state. Never reload the app or clear Evaluate/Edit workspace state.\n  useEffect(() => {\n    const handleDashboardResetPreserveEvaluationV90 = () => {\n      setSummarySection("summary");\n      setAnalysisMode("monthly");\n      setSelectedPeriods([]);\n      setPeriodFilterYear("all");\n      setPeriodFilterMonth("all");\n      setTeamSelectedMonth("");\n      setSelectedTeam(analyticsCanSelectAllTeams ? "all" : currentUserTeamName || "all");\n      setSelectedTeamDetail("");\n      setAnalyticsCompareOpen(false);\n      setCompareDraftPeriods([]);\n      setCompareDraftMode("monthly");\n      setCompareDraftYear("all");\n      setCompareDraftMonth("all");\n      setAnalyticsExportOpen(false);\n\n      if (analyticsCanSelectAllAgents) {\n        setSelectedAgent("all");\n        onSelectedAgentChange?.("all");\n      }\n    };\n\n    window.addEventListener(\n      "qa-dashboard-reset-preserve-evaluation-v90",\n      handleDashboardResetPreserveEvaluationV90\n    );\n    return () => {\n      window.removeEventListener(\n        "qa-dashboard-reset-preserve-evaluation-v90",\n        handleDashboardResetPreserveEvaluationV90\n      );\n    };\n  });\n`;

        const next = code.replace(anchor, listener);
        if (!next.includes("handleDashboardResetPreserveEvaluationV90")) {
          throw new Error("Dashboard reset preservation patch failed: Summary listener was not inserted");
        }
        return { code: next, map: null };
      }

      return null;
    },
  };
}
