import React from "react";

export type PerformanceWorkspaceSection = "overview" | "analytics" | "cases";

const SECTION_ITEMS: Array<{
  key: PerformanceWorkspaceSection;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: "overview",
    label: "Overview",
    description: "KPI และภาพรวมล่าสุด",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    key: "analytics",
    label: "Analytics",
    description: "สูตรเดิม พร้อม Compare และ Export",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19V9" />
        <path d="M10 19V5" />
        <path d="M16 19v-7" />
        <path d="M2 19h20" />
      </svg>
    ),
  },
  {
    key: "cases",
    label: "Cases",
    description: "ค้นหา Case ID ได้ทุกเดือน",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M14 3v5h4" />
        <path d="M9 12h6" />
        <path d="M9 16h6" />
      </svg>
    ),
  },
];

export default function PerformanceWorkspaceNav({
  activeSection,
  analyticsAllowed = true,
  onChange,
}: {
  activeSection: PerformanceWorkspaceSection;
  analyticsAllowed?: boolean;
  onChange?: (section: PerformanceWorkspaceSection) => void;
}) {
  return (
    <div data-performance-workspace-nav-v161="true" className="mx-auto max-w-[1720px] px-4 pt-4 sm:px-6 lg:px-8">
      <div className="rounded-[22px] border border-slate-300 bg-white p-2 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
        <div className="grid gap-2 md:grid-cols-3" role="tablist" aria-label="QA Dashboard sections">
          {SECTION_ITEMS.map((item) => {
            const selected = activeSection === item.key;
            const disabled = item.key === "analytics" && !analyticsAllowed;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-disabled={disabled}
                disabled={disabled}
                onClick={() => onChange?.(item.key)}
                className={`group flex min-w-0 items-center gap-3 rounded-[16px] border px-4 py-3 text-left transition ${
                  selected
                    ? "border-violet-700 bg-gradient-to-r from-violet-800 to-fuchsia-700 text-white shadow-[0_8px_22px_rgba(109,40,217,0.22)]"
                    : "border-transparent bg-slate-50 text-slate-700 hover:border-violet-200 hover:bg-violet-50"
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-white/15 text-white" : "bg-white text-violet-700 shadow-sm"}`}>
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className={`mt-0.5 block truncate text-[11px] font-medium ${selected ? "text-violet-100" : "text-slate-500"}`}>
                    {disabled ? "ไม่มีสิทธิ์ดู Analytics" : item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
