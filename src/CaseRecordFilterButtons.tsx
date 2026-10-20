import React from "react";
import { FestivalMetricIcon } from "./festivalThemes/Festival";
import type { CaseRecordFilter } from "./caseRecordFilter";
import "./caseRecordFilters.css";

const options = [
  { value: "all", label: "ทั้งหมด", kind: "Cases Evaluated" },
  { value: "appeals", label: "เฉพาะเคสอุทธรณ์", kind: "Appeal Results" },
] as const;

function FilterFallbackIcon({ appeal }: { appeal: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {appeal ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></> : <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M7 12h10M7 16h7" /></>}
  </svg>;
}

export default function CaseRecordFilterButtons({ value, onChange, allCount, appealCount }: {
  value: CaseRecordFilter;
  onChange: (mode: CaseRecordFilter) => void;
  allCount: number;
  appealCount: number;
}) {
  return <div data-case-record-filters="true" role="group" aria-label="กรองรายการเคส">
    {options.map(option => {
      const count = option.value === "all" ? allCount : appealCount;
      return <button key={option.value} type="button" data-case-record-mode={option.value}
        aria-pressed={value === option.value} aria-label={`${option.label} ${count} เคส`}
        onClick={() => onChange(option.value)}>
        <span className="qa-case-record-filter-icon" aria-hidden="true"><FestivalMetricIcon kind={option.kind} fallback={<FilterFallbackIcon appeal={option.value === "appeals"} />} /></span>
        <span>{option.label}</span><span className="qa-case-record-filter-count" aria-hidden="true">{count}</span>
      </button>;
    })}
  </div>;
}
