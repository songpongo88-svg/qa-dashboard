export function dashboardUnifiedButtonStylePatch() {
  return {
    name: "dashboard-unified-button-style",
    enforce: "post",
    transform(code, id) {
      const cleanId = id.replace(/\\/g, "/").split("?")[0];
      if (!cleanId.endsWith("/src/SummaryMockup.tsx")) return null;

      let next = code;

      next = next.replace(
        'className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">← Exit Compare</button>',
        'className="h-12 rounded-xl border border-sky-200 bg-white px-4 text-xs font-black text-[#155B83] shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-md">← Exit Compare</button>',
      );

      next = next.replace(
        'className="h-10 rounded-xl border border-violet-200 bg-white px-4 text-xs font-bold text-violet-800 shadow-sm hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"\n                    >\n                      ⇩ Export',
        'className="h-12 rounded-xl border border-sky-200 bg-white px-4 text-xs font-black text-[#155B83] shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"\n                    >\n                      ⇩ Export',
      );

      next = next.replace(
        'className="h-10 rounded-xl border border-fuchsia-500 bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 text-xs font-bold text-white shadow-[0_6px_16px_rgba(147,51,234,0.22)] hover:from-violet-800 hover:to-fuchsia-700">{isComparisonMode ? "✦ Edit Comparison" : "⇄ Compare"}</button>',
        'className="h-12 rounded-xl border border-[#0F766E] bg-[#0F766E] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(15,118,110,0.20)] transition hover:-translate-y-0.5 hover:bg-[#0B655E] hover:shadow-[0_9px_22px_rgba(15,118,110,0.24)]">{isComparisonMode ? "✦ Edit Comparison" : "⇄ Compare"}</button>',
      );

      return next === code ? null : { code: next, map: null };
    },
  };
}
