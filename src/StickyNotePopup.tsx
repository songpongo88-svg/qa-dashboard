import { useEffect, useRef, useState, type ReactNode } from "react";

export default function StickyNotePopup({ owner, children }: { owner: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [owner]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [contenteditable="true"], [tabindex="0"]') || []);
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  return <>
    <button ref={launcher} type="button" title="Sticky Note" aria-label="Sticky Note" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-[82] grid h-12 w-12 place-items-center rounded-full border border-amber-200 bg-white text-amber-700 shadow-[0_8px_24px_rgba(217,119,6,0.18)] transition hover:-translate-y-0.5 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9l7-7V5a2 2 0 0 0-2-2h-5Z"/><path d="M14 21v-7h7M7 8h10M7 12h4"/></svg>
    </button>
    {open ? <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" onClick={event => { if(event.target === event.currentTarget) setOpen(false); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label="Sticky Note" tabIndex={-1} className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-2xl outline-none" style={{fontFamily:"'Kanit', sans-serif"}}>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-5 py-4"><h2 className="text-base font-semibold text-amber-900">Sticky Note</h2><button type="button" aria-label="Close Sticky Note" title="ปิด" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-amber-200 bg-white text-amber-800 hover:bg-amber-100"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
      </div>
    </div> : null}
  </>;
}
