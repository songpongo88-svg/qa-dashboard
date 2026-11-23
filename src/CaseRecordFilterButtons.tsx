import React, { useEffect, useRef, useState } from "react";
import { FestivalMetricIcon } from "./festivalThemes/Festival";
import type { CaseRecordFilter, CaseRecordingFilter } from "./caseRecordFilter";
import "./caseRecordFilters.css";

const options = [
  { value: "all", label: "ทั้งหมด", kind: "Cases Evaluated" },
  { value: "appeals", label: "เฉพาะเคสอุทธรณ์", kind: "Appeal Results" },
] as const;

const recordingOptions = [
  { value: "all", label: "ทั้งหมดที่มีไฟล์เสียง" },
  { value: "Merchant", label: "ร้านค้า (Merchant)" },
  { value: "Customer", label: "ลูกค้า (Customer)" },
  { value: "Rider", label: "ไรเดอร์ (Rider)" },
] as const;

function FilterFallbackIcon({ appeal }: { appeal: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {appeal ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></> : <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M7 12h10M7 16h7" /></>}
  </svg>;
}

function RecordingIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 14v-3a8 8 0 0 1 16 0v3" /><rect x="2.5" y="12.5" width="4.5" height="7" rx="2" /><rect x="17" y="12.5" width="4.5" height="7" rx="2" />
  </svg>;
}

export default function CaseRecordFilterButtons({ value, onChange, allCount, appealCount, recordingFilter, onRecordingFilterChange, recordingCounts }: {
  value: CaseRecordFilter;
  onChange: (mode: CaseRecordFilter) => void;
  allCount: number;
  appealCount: number;
  recordingFilter: CaseRecordingFilter;
  onRecordingFilterChange: (mode: CaseRecordingFilter) => void;
  recordingCounts: Record<Exclude<CaseRecordingFilter, "none">, number>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return <div data-case-record-filters="true" role="group" aria-label="กรองรายการเคส">
    {options.map(option => {
      const count = option.value === "all" ? allCount : appealCount;
      return <button key={option.value} type="button" data-case-record-mode={option.value}
        aria-pressed={value === option.value && (option.value !== "all" || recordingFilter === "none")}
        aria-label={`${option.label} ${count} เคส`}
        onClick={() => { setMenuOpen(false); onChange(option.value); }}>
        <span className="qa-case-record-filter-icon" aria-hidden="true"><FestivalMetricIcon kind={option.kind} fallback={<FilterFallbackIcon appeal={option.value === "appeals"} />} /></span>
        <span>{option.label}</span><span className="qa-case-record-filter-count" aria-hidden="true">{count}</span>
      </button>;
    })}
    <div className="qa-case-record-audio-wrap" ref={menuRef}>
      <button type="button" data-case-record-audio-trigger="true"
        aria-pressed={recordingFilter !== "none"}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`เคสมีไฟล์เสียง ${recordingCounts.all} เคส`}
        onClick={() => setMenuOpen((open) => !open)}>
        <span className="qa-case-record-filter-icon" aria-hidden="true"><RecordingIcon /></span>
        <span>เคสมีไฟล์เสียง</span>
        <span className="qa-case-record-filter-count" aria-hidden="true">{recordingCounts.all}</span>
        <svg className={`qa-case-record-audio-chevron ${menuOpen ? "qa-case-record-audio-chevron-open" : ""}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {menuOpen ? (
        <div data-case-record-audio-menu="true" className="qa-case-record-audio-menu" role="menu" aria-label="ประเภทไฟล์เสียง">
          <div className="qa-case-record-audio-title">เลือกประเภทไฟล์เสียง</div>
          {recordingOptions.map(option => (
            <button type="button" role="menuitemradio" key={option.value}
              data-case-record-audio-mode={option.value}
              aria-checked={recordingFilter === option.value}
              onClick={() => { onRecordingFilterChange(option.value); setMenuOpen(false); }}>
              <span>{option.label}</span>
              <span className="qa-case-record-audio-option-end">
                <span className="qa-case-record-filter-count">{recordingCounts[option.value]}</span>
                {recordingFilter === option.value ? <span aria-hidden="true">✓</span> : null}
              </span>
            </button>
          ))}
          <div className="qa-case-record-audio-menu-footer">
            <button type="button" data-case-record-audio-clear="true"
              onClick={() => { onRecordingFilterChange("none"); setMenuOpen(false); }}>
              ล้างตัวกรองไฟล์เสียง
            </button>
          </div>
        </div>
      ) : null}
    </div>
  </div>;
}
