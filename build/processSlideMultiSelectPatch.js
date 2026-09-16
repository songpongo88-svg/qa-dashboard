export function processSlideMultiSelectPatch() {
  return {
    name: "process-slide-multi-select",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      if (!normalized.endsWith("/src/processLibrary.tsx")) return null;

      const original = code;
      let next = code;

      // The Process Library source is rewritten by the prebuild chain through v89
      // before Vite runs. Patch that final UI instead of the original v69 source.
      const modalSignature = 'function ProcessSlideModalV68({ meta, items = [], onClose, onNavigate, openToken = 0 }: { meta: ProcessReferenceMeta | null; items?: ProcessReferenceMeta[]; onClose: () => void; onNavigate?: (meta: ProcessReferenceMeta) => void; openToken?: number }) {';
      if (next.includes(modalSignature) && !next.includes('onToggleSelection?: () => void')) {
        next = next.replace(
          modalSignature,
          'function ProcessSlideModalV68({ meta, items = [], onClose, onNavigate, openToken = 0, selected = false, onToggleSelection, onRenameTitle }: { meta: ProcessReferenceMeta | null; items?: ProcessReferenceMeta[]; onClose: () => void; onNavigate?: (meta: ProcessReferenceMeta) => void; openToken?: number; selected?: boolean; onToggleSelection?: () => void; onRenameTitle?: (nextTitle: string) => void | Promise<void> }) {'
        );
      }

      // Make the title editable only in the active floating Preview window.
      const viewerTitle = '<div className="truncate text-sm font-black text-slate-950">Slide {meta.slideNumber} · {displayTitle}</div>';
      if (!next.includes('aria-label={`แก้ชื่อ Slide ${meta.slideNumber}`}')) {
        const titleIndex = next.lastIndexOf(viewerTitle);
        if (titleIndex >= 0) {
          const replacement = `{onRenameTitle ? (
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-sm font-black text-slate-950">Slide {meta.slideNumber} ·</span>
                <input
                  key={meta.versionId + "-" + meta.slideNumber + "-" + displayTitle}
                  defaultValue={displayTitle}
                  aria-label={\`แก้ชื่อ Slide \${meta.slideNumber}\`}
                  title="แก้ชื่อ Slide แล้วกด Enter หรือคลิกออกนอกช่องเพื่อบันทึก"
                  onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                  onBlur={(event) => {
                    const title = event.currentTarget.value.trim();
                    if (title && title !== displayTitle) void onRenameTitle(title);
                    else event.currentTarget.value = displayTitle;
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-sm font-black text-slate-950 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
              </div>
            ) : (
              <div className="truncate text-sm font-black text-slate-950">Slide {meta.slideNumber} · {displayTitle}</div>
            )}`;
          next = next.slice(0, titleIndex) + replacement + next.slice(titleIndex + viewerTitle.length);
        }
      }

      // Add Select/Selected beside the close button in the normal Preview header.
      const viewerClose = '<button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-600 hover:bg-slate-50" aria-label="ปิด">×</button>';
      if (!next.includes('{selected ? "✓ Selected" : "+ Select Slide"}')) {
        const closeIndex = next.lastIndexOf(viewerClose);
        if (closeIndex >= 0) {
          const replacement = `{onToggleSelection ? (
              <button type="button" onClick={onToggleSelection} className={"h-9 rounded-xl border px-3 text-[11px] font-black transition " + (selected ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100")}>
                {selected ? "✓ Selected" : "+ Select Slide"}
              </button>
            ) : null}
            ${viewerClose}`;
          next = next.slice(0, closeIndex) + replacement + next.slice(closeIndex + viewerClose.length);
        }
      }

      // Keep the legacy single-number state for compatibility with older prebuild patches,
      // but use a separate array as the real picker selection state.
      const pickerState = '  const [pickerSlideNumber, setPickerSlideNumber] = useState(0);';
      if (next.includes(pickerState) && !next.includes('const [pickerSlideNumbers, setPickerSlideNumbers]')) {
        next = next.replace(
          pickerState,
          pickerState + '\n  const [pickerSlideNumbers, setPickerSlideNumbers] = useState<number[]>([]);'
        );
      }

      // Opening the picker starts from Slides already selected for the active Process.
      next = next.split('setSlidePickerOpen(true); setSlideQuery(""); setPickerSlideNumber(0);')
        .join('setSlidePickerOpen(true); setSlideQuery(""); setPickerSlideNumber(0); setPickerSlideNumbers(parsedRefs.filter((item) => item.versionId === active.id).map((item) => item.slideNumber).sort((a, b) => a - b));');

      // v86 rewrites the Process selector to use nextValue. Keep the multi-select state
      // in sync whenever the user switches Process files inside or outside the picker.
      next = next.split('setSelectedProcessIdV84(nextValue);')
        .join('setSelectedProcessIdV84(nextValue);\n                      setPickerSlideNumbers(parsedRefs.filter((item) => item.versionId === nextValue).map((item) => item.slideNumber).sort((a, b) => a - b));');

      next = next.replace(
        'const selected = pickerSlideNumber === item.slideNumber;',
        'const selected = pickerSlideNumbers.includes(item.slideNumber);'
      );

      next = next.replace(
        '                  (alreadyUsed ? "cursor-not-allowed opacity-45" : "");',
        '                  "";'
      );

      const oldLeftPickerButton = '<button type="button" disabled={alreadyUsed} onClick={() => setPickerSlideNumber(item.slideNumber)} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed">';
      const newLeftPickerButton = '<button type="button" onClick={() => setPickerSlideNumbers((current) => current.includes(item.slideNumber) ? current.filter((slideNumber) => slideNumber !== item.slideNumber) : [...current, item.slideNumber].sort((a, b) => a - b))} className="flex min-w-0 flex-1 items-center gap-3 text-left">';
      next = next.split(oldLeftPickerButton).join(newLeftPickerButton);

      const oldDotPickerButton = '<button type="button" disabled={alreadyUsed} onClick={() => setPickerSlideNumber(item.slideNumber)} className={"h-5 w-5 shrink-0 rounded-full border-2 " + (selected ? "border-sky-600 bg-sky-600 shadow-[inset_0_0_0_4px_white]" : "border-slate-300 bg-white") + (alreadyUsed ? " cursor-not-allowed" : "")} aria-label={alreadyUsed ? "Slide นี้ถูกเลือกแล้ว" : "เลือก Slide " + item.slideNumber} />';
      const newDotPickerButton = '<button type="button" onClick={() => setPickerSlideNumbers((current) => current.includes(item.slideNumber) ? current.filter((slideNumber) => slideNumber !== item.slideNumber) : [...current, item.slideNumber].sort((a, b) => a - b))} className={"h-5 w-5 shrink-0 rounded-full border-2 " + (selected ? "border-sky-600 bg-sky-600 shadow-[inset_0_0_0_4px_white]" : "border-slate-300 bg-white")} aria-label={selected ? "ยกเลิก Slide " + item.slideNumber : "เลือก Slide " + item.slideNumber} />';
      next = next.split(oldDotPickerButton).join(newDotPickerButton);

      const singleConfirm = '<button type="button" disabled={!pickerSlideNumber || usedSlides.has(pickerSlideNumber)} onClick={() => { addSlide(pickerSlideNumber); setSlidePickerOpen(false); }} className="h-10 rounded-xl bg-[#155B83] px-5 text-xs font-black text-white shadow-sm hover:bg-[#104A6B] disabled:cursor-not-allowed disabled:bg-slate-300">✓ เลือก Slide นี้</button>';
      if (next.includes(singleConfirm)) {
        next = next.replace(
          singleConfirm,
          `<button
                type="button"
                disabled={!pickerSlideNumbers.length}
                onClick={() => {
                  const existingBySlide = new Map(parsedRefs.filter((item) => item.versionId === active.id).map((item) => [item.slideNumber, item]));
                  const preservedOtherProcesses = parsedRefs.filter((item) => item.versionId !== active.id);
                  const selectedForActive = pickerSlideNumbers.slice().sort((a, b) => a - b).map((slideNumber) => {
                    const existing = existingBySlide.get(slideNumber);
                    if (existing) return existing;
                    const options = stepsForSlideV68(active, slideNumber);
                    return fromVersion(active, slideNumber, options[0] || "ทั้งสไลด์");
                  });
                  writeRefs([...preservedOtherProcesses, ...selectedForActive].sort((a, b) => a.processName.localeCompare(b.processName, "th") || a.slideNumber - b.slideNumber));
                  setSlidePickerOpen(false);
                  setPickerSlideNumbers([]);
                }}
                className="h-10 rounded-xl bg-[#155B83] px-5 text-xs font-black text-white shadow-sm hover:bg-[#104A6B] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                ✓ เลือก {pickerSlideNumbers.length} Slides
              </button>`
        );
      }

      // v76 injects openToken into the selector modal call. Match that final call only
      // (items={parsedRefs}); ProcessReferenceDisplay uses items={refs} and remains read-only.
      const selectorModalPattern = /<ProcessSlideModalV68\s+meta=\{previewMeta\}\s+items=\{parsedRefs\}[\s\S]*?onClose=\{\(\) => setPreviewMeta\(null\)\}\s*\/>/;
      if (selectorModalPattern.test(next)) {
        next = next.replace(
          selectorModalPattern,
          `<ProcessSlideModalV68
        meta={previewMeta}
        items={parsedRefs}
        openToken={previewOpenTokenV76}
        onNavigate={setPreviewMeta}
        selected={Boolean(previewMeta && (slidePickerOpen
          ? pickerSlideNumbers.includes(previewMeta.slideNumber)
          : parsedRefs.some((item) => item.versionId === previewMeta.versionId && item.slideNumber === previewMeta.slideNumber)))}
        onToggleSelection={historical ? undefined : () => {
          if (!previewMeta) return;
          if (slidePickerOpen) {
            setPickerSlideNumbers((current) => current.includes(previewMeta.slideNumber)
              ? current.filter((slideNumber) => slideNumber !== previewMeta.slideNumber)
              : [...current, previewMeta.slideNumber].sort((a, b) => a - b));
            return;
          }
          const exists = parsedRefs.some((item) => item.versionId === previewMeta.versionId && item.slideNumber === previewMeta.slideNumber);
          if (exists) removeSlide(previewMeta.versionId, previewMeta.slideNumber);
          else writeRefs([...parsedRefs, previewMeta].sort((a, b) => a.processName.localeCompare(b.processName, "th") || a.slideNumber - b.slideNumber));
        }}
        onRenameTitle={historical ? undefined : (nextTitle) => {
          if (!previewMeta) return;
          updateDisplayTitle(previewMeta.versionId, previewMeta.slideNumber, nextTitle);
          persistDisplayTitleV78(previewMeta.versionId, previewMeta.slideNumber, nextTitle);
          setPreviewMeta((previous) => previous ? { ...previous, slideTitle: nextTitle, step: nextTitle } : previous);
        }}
        onClose={() => setPreviewMeta(null)}
      />`
        );
      }

      if (!next.includes('onToggleSelection?: () => void')) {
        throw new Error('Process Slide patch failed: Preview modal props missing');
      }
      if (!next.includes('const [pickerSlideNumbers, setPickerSlideNumbers]')) {
        throw new Error('Process Slide patch failed: multi-select state missing');
      }
      if (!next.includes('✓ เลือก {pickerSlideNumbers.length} Slides')) {
        throw new Error('Process Slide patch failed: multi-select confirm missing');
      }
      if (!next.includes('onRenameTitle={historical ? undefined')) {
        throw new Error('Process Slide patch failed: Preview rename wiring missing');
      }
      if (!next.includes('{selected ? "✓ Selected" : "+ Select Slide"}')) {
        throw new Error('Process Slide patch failed: Preview selection action missing');
      }
      if (next === original) throw new Error('Process Slide patch failed: no source changes were applied');

      return { code: next, map: null };
    },
  };
}
