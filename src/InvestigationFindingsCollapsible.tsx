import { useEffect, useId, useRef, useState } from "react";
import { RichTextContent } from "./richText";

// Four lines at the 26px line height used by the Case Detail findings text.
const COLLAPSED_HEIGHT = 104;

export default function InvestigationFindingsCollapsible({ value }: { value: string }) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();

  // Opening another case always starts with the concise preview.
  useEffect(() => setExpanded(false), [value]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const checkOverflow = () => setHasOverflow(content.getBoundingClientRect().height > COLLAPSED_HEIGHT + 1);
    checkOverflow();

    // Text can reflow when the detail panel is resized; rich-text images can load later.
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", checkOverflow);
      return () => window.removeEventListener("resize", checkOverflow);
    }
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(content);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div>
      <div
        id={contentId}
        style={{ maxHeight: expanded ? undefined : COLLAPSED_HEIGHT, overflow: expanded ? "visible" : "hidden" }}
      >
        <div ref={contentRef}>
          <RichTextContent
            value={value || "-"}
            preserveWhitespace
            className="whitespace-pre-wrap break-words text-[14px] leading-[26px] text-slate-800"
          />
        </div>
      </div>
      {hasOverflow && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            aria-controls={contentId}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            {expanded ? "Show Less" : "Show More"}
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}>
              <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
