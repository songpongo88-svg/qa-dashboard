import fs from "node:fs";

const dashboardFile = "src/DashboardMockup.tsx";
const summaryFile = "src/SummaryMockup.tsx";
const marker = "// dashboard-unified-reset-v88";

function replaceIfPresent(source, from, to, label) {
  if (!source.includes(from)) {
    console.warn(`Dashboard unified reset v88: optional anchor not found: ${label}`);
    return source;
  }
  return source.replace(from, to);
}

// 1) Dashboard search row: Clear becomes the single Reset button and resets search + analytics filters.
{
  let source = fs.readFileSync(dashboardFile, "utf8");
  if (!source.includes(marker)) {
    if (source.includes('const CASE_SEARCH_HISTORY_LIMIT = 5;\n')) {
      source = source.replace(
        'const CASE_SEARCH_HISTORY_LIMIT = 5;\n',
        'const CASE_SEARCH_HISTORY_LIMIT = 5;\n' + marker + '\n',
      );
    } else {
      source = marker + '\n' + source;
    }

    source = replaceIfPresent(
      source,
      '<div data-search-evaluation-primary-v166="true" data-search-evaluation-auto-v168="true" className="min-w-0">',
      '<div data-search-evaluation-primary-v166="true" data-search-evaluation-auto-v168="true" data-dashboard-unified-reset-v88="true" className="min-w-0">',
      "search controls root",
    );

    source = replaceIfPresent(
      source,
      'className="h-12 min-w-0 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-semibold text-slate-950 outline-none transition placeholder:font-medium placeholder:text-slate-500 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"',
      'className="h-12 min-w-0 rounded-xl border border-sky-200 bg-white px-4 text-sm font-semibold text-slate-950 shadow-sm outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-[#155B83] focus:ring-4 focus:ring-sky-100"',
      "search input styling",
    );

    source = replaceIfPresent(
      source,
      'className="h-12 rounded-xl bg-emerald-700 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800"',
      'className="h-12 rounded-xl bg-[#155B83] px-5 text-xs font-black text-white shadow-[0_7px_18px_rgba(21,91,131,0.20)] transition hover:-translate-y-0.5 hover:bg-[#104A6B] hover:shadow-[0_9px_22px_rgba(21,91,131,0.24)]"',
      "Search button styling",
    );

    const resetButton = '<button type="button" title="ล้างการค้นหา เคสที่เลือก และตัวกรองทั้งหมดกลับค่าเริ่มต้น" onClick={() => { clearCaseSearch(); window.dispatchEvent(new CustomEvent("qa-dashboard-reset-all-v88")); }} className="h-12 rounded-xl border border-sky-200 bg-white px-4 text-xs font-black text-[#155B83] shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-md">Reset</button>';
    const clearPattern = /<button\s+type="button"\s+onClick=\{clearCaseSearch\}[\s\S]{0,700}?>\s*Clear\s*<\/button>/;
    if (clearPattern.test(source)) {
      source = source.replace(clearPattern, resetButton);
    } else {
      console.warn("Dashboard unified reset v88: Clear button pattern not found");
    }

    fs.writeFileSync(dashboardFile, source);
    console.log("Applied unified Search/Reset dashboard controls v88");
  } else {
    console.log("Dashboard unified Search/Reset v88 already applied");
  }
}

// 2) Analytics controls: listen for the unified Reset, remove the second Reset button,
// and align Search / Reset / Export / Compare styling with the dashboard palette.
{
  let source = fs.readFileSync(summaryFile, "utf8");
  if (!source.includes(marker)) {
    if (source.includes('type ReviewStatus = "Original" | "Revised";\n')) {
      source = source.replace(
        'type ReviewStatus = "Original" | "Revised";\n',
        marker + '\n' + 'type ReviewStatus = "Original" | "Revised";\n',
      );
    } else {
      source = marker + '\n' + source;
    }

    const compareAnchor = '  const openAnalyticsCompare = () => {';
    if (source.includes(compareAnchor)) {
      const resetHandler = `  const resetDashboardControlsV88 = () => {
    setSummarySection("summary");
    setAnalysisMode("monthly");
    setSelectedPeriods([]);
    setPeriodFilterYear("all");
    setPeriodFilterMonth("all");
    setSelectedYear("all");
    setSelectedMonth("all");
    setSelectedWeek("all");
    setSelectedTeam(analyticsCanSelectAllTeams ? "all" : currentUserTeamName || "all");
    setSelectedTeamDetail("");
    setAnalyticsExportOpen(false);
    setAnalyticsCustomizeOpen(false);
    setAnalyticsCompareOpen(false);
    if (analyticsCanSelectAllAgents) selectAnalyticsAgent("all");
    onSelectedWeekChange?.("all");
  };

  useEffect(() => {
    const handleDashboardResetV88 = () => resetDashboardControlsV88();
    window.addEventListener("qa-dashboard-reset-all-v88", handleDashboardResetV88);
    return () => window.removeEventListener("qa-dashboard-reset-all-v88", handleDashboardResetV88);
  }, [
    analyticsCanSelectAllAgents,
    analyticsCanSelectAllTeams,
    currentUserTeamName,
    onSelectedWeekChange,
  ]);

`;
      source = source.replace(compareAnchor, resetHandler + compareAnchor);
    } else {
      console.warn("Dashboard unified reset v88: openAnalyticsCompare anchor not found");
    }

    const oldResetPattern = /\s*<button\s+type="button"\s+onClick=\{\(\) => \{[\s\S]{0,700}?setAnalysisMode\("monthly"\);[\s\S]{0,700}?>\s*Reset\s*<\/button>/;
    if (oldResetPattern.test(source)) {
      source = source.replace(oldResetPattern, "");
    } else {
      console.warn("Dashboard unified reset v88: old filter Reset button pattern not found");
    }

    source = source.replace(
      'className="space-y-4 rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_4px_14px_rgba(76,29,149,0.05)]"',
      'className="space-y-4 rounded-[22px] border border-sky-100 bg-gradient-to-b from-white to-sky-50/35 p-4 shadow-[0_10px_30px_rgba(15,67,96,0.08)]"',
    );
    source = source.replace(
      'className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end"',
      'className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end"',
    );

    source = source.replace(
      'className="h-10 rounded-xl border border-violet-200 bg-white px-4 text-xs font-bold text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"',
      'className="h-12 rounded-xl border border-sky-200 bg-white px-4 text-xs font-black text-[#155B83] shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"',
    );
    source = source.replace(
      'className="h-10 rounded-xl border border-violet-700 bg-violet-700 px-4 text-xs font-bold text-white shadow-sm hover:bg-violet-800"',
      'className="h-12 rounded-xl border border-[#0F766E] bg-[#0F766E] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(15,118,110,0.20)] transition hover:-translate-y-0.5 hover:bg-[#0B655E] hover:shadow-[0_9px_22px_rgba(15,118,110,0.24)]"',
    );
    source = source.replace(
      'className="h-10 rounded-xl border border-violet-300 bg-violet-700 px-4 text-xs font-bold text-white hover:bg-violet-800"',
      'className="h-12 rounded-xl border border-sky-200 bg-white px-4 text-xs font-black text-[#155B83] shadow-sm transition hover:-translate-y-0.5 hover:bg-sky-50"',
    );

    source = source.replace(
      'className="grid gap-3 border-t border-violet-100 pt-4 md:grid-cols-2 xl:grid-cols-[260px_minmax(210px,1fr)_minmax(210px,1fr)_minmax(230px,1fr)]"',
      'className="grid gap-3 border-t border-sky-100 pt-4 md:grid-cols-2 xl:grid-cols-[260px_minmax(210px,1fr)_minmax(210px,1fr)_minmax(230px,1fr)]"',
    );
    source = source.replace(
      'className="grid h-12 grid-cols-3 gap-1 rounded-xl border border-violet-200 bg-violet-100 p-1"',
      'className="grid h-12 grid-cols-3 gap-1 rounded-xl border border-sky-200 bg-sky-50 p-1"',
    );
    source = source.replace(
      'className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-violet-50 px-3 py-2 text-[10px] font-medium text-slate-600"',
      'className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white/80 px-3 py-2.5 text-[10px] font-semibold text-slate-600"',
    );

    fs.writeFileSync(summaryFile, source);
    console.log("Applied single Reset + refreshed dashboard control styling v88");
  } else {
    console.log("Dashboard analytics unified reset v88 already applied");
  }
}
