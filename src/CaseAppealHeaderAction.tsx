import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AppealIcon = "appeal" | "additional" | "waiting" | "edit" | "expired";
type AppealTone = "teal" | "violet" | "sky" | "slate" | "amber" | "rose";

const iconPaths: Record<AppealIcon, string> = {
  appeal: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM10 7l-3 3 3 3M7 10h6a3 3 0 0 1 3 3",
  additional: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM12 7v6M9 10h6",
  waiting: "M6 3h12M6 21h12M7 3v5l10 8v5M17 3v5L7 16v5",
  edit: "m16 3 5 5M4 20l4-1L21 6a2.12 2.12 0 0 0-3-3L5 16z",
  expired: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2",
};
const toneClasses: Record<AppealTone, string> = {
  teal: "text-teal-700 hover:bg-teal-50",
  violet: "text-violet-700 hover:bg-violet-50",
  sky: "text-sky-700 hover:bg-sky-50",
  slate: "text-slate-500 hover:bg-slate-50",
  amber: "text-amber-700 hover:bg-amber-50",
  rose: "text-rose-700 hover:bg-rose-50",
};

export default function CaseAppealHeaderAction({ label, detail, countdown, viewOnly, icon, tone, actionDisabled, onAction }: {
  label: string; detail: string; countdown?: string; viewOnly: boolean;
  icon: AppealIcon; tone: AppealTone; actionDisabled: boolean; onAction?: () => void;
}) {
  const tooltipId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 272 });
  const canAct = !viewOnly && !actionDisabled && Boolean(onAction);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(272, window.innerWidth - 24);
      const height = tooltip.current?.offsetHeight || 120;
      const next = { width, left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
        top: rect.bottom + 8 + height <= window.innerHeight - 12 ? rect.bottom + 8 : Math.max(12, rect.top - height - 8) };
      setPosition(previous => previous.left === next.left && previous.top === next.top && previous.width === next.width ? previous : next);
    };
    const dismiss = (event: PointerEvent) => {
      if (trigger.current?.contains(event.target as Node) || tooltip.current?.contains(event.target as Node)) return;
      setPinned(false); setOpen(false);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { capture: true, passive: true });
    document.addEventListener("pointerdown", dismiss);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [open, countdown, label, detail]);

  return <>
    <button ref={trigger} type="button" data-case-appeal-action="icon" data-appeal-icon={icon}
      data-action-disabled={actionDisabled} aria-label={viewOnly ? label + " — ดูข้อมูลเท่านั้น" : label}
      aria-describedby={open ? tooltipId : undefined} aria-expanded={canAct ? undefined : open}
      aria-controls={open && !canAct ? tooltipId : undefined} aria-haspopup={canAct ? "dialog" : undefined}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm transition focus:outline-none focus:ring-4 focus:ring-violet-100 ${toneClasses[tone]}`}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (!pinned && !focused.current) setOpen(false); }}
      onFocus={() => { focused.current = true; setOpen(true); }} onBlur={() => { focused.current = false; if (!pinned) setOpen(false); }}
      onKeyDown={event => { if (event.key === "Escape") { setPinned(false); setOpen(false); } }}
      onClick={() => {
        if (canAct) { setPinned(false); setOpen(false); onAction?.(); }
        else { setPinned(!pinned); setOpen(!pinned); }
      }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]"><path d={iconPaths[icon]} /></svg>
      <span className="sr-only">{label}</span>
    </button>
    {open ? createPortal(<div ref={tooltip} id={tooltipId} role="tooltip" style={position}
      className="pointer-events-none fixed z-[180] rounded-xl bg-slate-900 px-4 py-3 text-[12px] leading-5 text-white shadow-xl">
      <div className="font-semibold">{label}</div>
      {countdown ? <div className="mt-1.5 flex items-center gap-1.5 tabular-nums" data-appeal-countdown="true"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5 shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>{countdown}</div> : null}
      {viewOnly ? <div className="mt-1.5">ดูข้อมูลเท่านั้น · View only</div> : actionDisabled ? <div className="mt-1.5">ดูสถานะเท่านั้น</div> : null}
      <div className="mt-2 text-[11px] text-slate-200">{detail}</div>
    </div>, document.body) : null}
  </>;
}
