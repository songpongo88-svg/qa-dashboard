function replaceOrThrow(context, code, search, replacement, label) {
  if (!code.includes(search)) {
    context.error(`Analytics compare header/KPI polish patch could not find ${label}.`);
  }
  return code.replace(search, replacement);
}

export function analyticsCompareHeaderKpiPolishPatch() {
  let patched = false;

  return {
    name: "analytics-compare-header-kpi-polish",
    enforce: "pre",

    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;
      if (!code.includes('data-analytics-compare-ppt-report-v1="true"')) {
        this.error("Analytics compare UI redesign must run before header/KPI polish patch.");
      }

      let next = code;

      next = replaceOrThrow(
        this,
        next,
        `            <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
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
            </div>`,
        `            <div data-compare-report-meta-v30="true" className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="flex min-h-[66px] min-w-0 flex-col justify-center rounded-2xl border border-violet-100 bg-gradient-to-b from-violet-50 to-white px-4 py-3 shadow-[0_4px_14px_rgba(76,29,149,0.06)]">
                <div className="text-[8.5px] font-black uppercase tracking-[0.12em] text-violet-500">Scope</div>
                <div className="mt-1.5 truncate text-center text-[12px] font-black leading-tight text-slate-900" title={scopeLabel}>{scopeLabel}</div>
              </div>
              <div className="flex min-h-[66px] min-w-0 flex-col justify-center rounded-2xl border border-violet-200 bg-gradient-to-b from-violet-100/80 to-white px-4 py-3 shadow-[0_5px_16px_rgba(76,29,149,0.08)]">
                <div className="text-[8.5px] font-black uppercase tracking-[0.12em] text-violet-600">Period</div>
                <div className="mt-1.5 break-words text-center text-[12.5px] font-black leading-tight text-violet-950" title={periodText}>{periodText}</div>
              </div>
              <div className="flex min-h-[66px] min-w-0 flex-col justify-center rounded-2xl border border-violet-100 bg-gradient-to-b from-violet-50 to-white px-4 py-3 shadow-[0_4px_14px_rgba(76,29,149,0.06)]">
                <div className="text-[8.5px] font-black uppercase tracking-[0.12em] text-violet-500">Prepared By</div>
                <div className="mt-1.5 truncate text-center text-[12px] font-black leading-tight text-slate-900" title={preparedBy}>{preparedBy}</div>
              </div>
            </div>`,
        "report metadata cards"
      );

      next = replaceOrThrow(
        this,
        next,
        `          <div data-compare-kpis="true" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          </div>`,
        `          <div data-compare-kpis="true" data-compare-kpi-polish-v30="true" className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {kpiCards.map((item) => (
              <article key={item.title} className="flex min-h-[128px] min-w-0 flex-col rounded-2xl border border-violet-150 bg-white px-4 py-3.5 shadow-[0_5px_16px_rgba(76,29,149,0.07)]">
                <div className="flex min-h-[32px] items-center justify-center gap-2 text-center">
                  <span className={"inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-black shadow-sm " + item.iconClass}>{item.icon}</span>
                  <span className="text-[9px] font-black uppercase tracking-[0.06em] text-slate-500">{item.title}</span>
                </div>
                <div className={"flex flex-1 items-center justify-center py-2 text-center text-[29px] font-black leading-none tracking-[-0.025em] tabular-nums " + item.valueClass}>{item.value}</div>
                <div className={"mt-auto w-full rounded-full px-2.5 py-1.5 text-center text-[9px] font-black leading-none " + item.helperClass}>{item.helper}</div>
              </article>
            ))}
          </div>`,
        "KPI card layout"
      );

      // Keep currency formatting report-like even when locale behavior changes.
      next = next.replace(
        `value: latestIncentive.toLocaleString("en-US"),`,
        `value: Number(latestIncentive || 0).toLocaleString("en-US", { maximumFractionDigits: 0 }),`
      );

      patched = true;
      return { code: next, map: null };
    },

    buildEnd(error) {
      if (error) return;
      if (!patched) this.error("Analytics compare header/KPI polish patch was not applied.");
    },
  };
}
