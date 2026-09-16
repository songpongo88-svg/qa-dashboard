export function processSlideSelectionUiPatch() {
  return {
    name: "process-slide-selection-ui",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      if (!normalized.endsWith("/src/processLibrary.tsx")) return null;

      const original = code;
      let next = code;

      const searchAnchor = `            <div className="border-b border-slate-100 px-5 py-3">\n              <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">`;
      if (next.includes(searchAnchor) && !next.includes('data-process-selected-summary="true"')) {
        const selectedSummary = `            <div data-process-selected-summary="true" className="shrink-0 border-b border-sky-100 bg-sky-50/60 px-5 py-3">\n              <div className="flex items-center justify-between gap-3">\n                <div className="text-xs font-black text-[#155B83]">Selected Slides · {pickerSlideNumbers.length}</div>\n                {pickerSlideNumbers.length ? (\n                  <button type="button" onClick={() => setPickerSlideNumbers([])} className="text-[11px] font-black text-rose-600 hover:text-rose-700">ล้างที่เลือก</button>\n                ) : null}\n              </div>\n              {pickerSlideNumbers.length ? (\n                <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">\n                  {pickerSlideNumbers.map((slideNumber) => {\n                    const title = String(active.slideTitles[slideNumber - 1] || ("Slide " + slideNumber));\n                    return (\n                      <button\n                        key={"selected-slide-" + active.id + "-" + slideNumber}\n                        type="button"\n                        onClick={() => setPickerSlideNumbers((current) => current.filter((item) => item !== slideNumber))}\n                        className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm transition hover:border-rose-200 hover:bg-rose-50"\n                        title={"เอา Slide " + slideNumber + " ออกจากรายการที่เลือก"}\n                      >\n                        <span className="max-w-[260px] truncate">Slide {slideNumber} · {title}</span>\n                        <span className="shrink-0 font-black text-rose-600">×</span>\n                      </button>\n                    );\n                  })}\n                </div>\n              ) : (\n                <div className="mt-1 text-[11px] font-semibold text-slate-500">ยังไม่ได้เลือก Slide · เลือกได้หลายรายการพร้อมกัน</div>\n              )}\n            </div>\n`;
        next = next.replace(searchAnchor, selectedSummary + searchAnchor);
      }

      next = next.replace(
        'className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4"',
        'className="sticky bottom-0 z-10 flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.06)]"'
      );

      next = next.replace(
        '✓ เลือก {pickerSlideNumbers.length} Slides',
        '✓ เลือก {pickerSlideNumbers.length} {pickerSlideNumbers.length === 1 ? "Slide" : "Slides"}'
      );

      if (!next.includes('data-process-selected-summary="true"')) {
        throw new Error("Process Slide selection UI patch failed: Selected Slides summary missing");
      }
      if (!next.includes('pickerSlideNumbers.map((slideNumber) =>')) {
        throw new Error("Process Slide selection UI patch failed: selected Slide chips missing");
      }
      if (!next.includes('sticky bottom-0 z-10')) {
        throw new Error("Process Slide selection UI patch failed: confirm footer is not sticky");
      }
      if (!next.includes('pickerSlideNumbers.length === 1 ? "Slide" : "Slides"')) {
        throw new Error("Process Slide selection UI patch failed: confirm count label missing");
      }
      if (next === original) throw new Error("Process Slide selection UI patch failed: no source changes were applied");

      return { code: next, map: null };
    },
  };
}
