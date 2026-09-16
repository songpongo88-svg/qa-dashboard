export function processSlideMultiSelectPatch() {
  return {
    name: "process-slide-multi-select",
    enforce: "pre",
    transform(code, id) {
      const normalized = id.replace(/\\/g, "/");
      if (!normalized.endsWith("/src/processLibrary.tsx")) return null;

      const original = code;
      let next = code;

      // The Process Library is heavily rewritten by the prebuild patch chain before Vite
      // runs. Patch the final v84/v85 picker instead of recreating an older picker UI.
      const modalSignature = "function ProcessSlideModalV68({ meta, items = [], onClose, onNavigate }: { meta: ProcessReferenceMeta | null; items?: ProcessReferenceMeta[]; onClose: () => void; onNavigate?: (meta: ProcessReferenceMeta) => void }) {";
      if (next.includes(modalSignature) && !next.includes("onToggleSelection?: () => void")) {
        next = next.replace(
          modalSignature,
          `function ProcessSlideModalV68({ meta, items = [], onClose, onNavigate, selected = false, onToggleSelection, onRenameTitle }: {\n  meta: ProcessReferenceMeta | null;\n  items?: ProcessReferenceMeta[];\n  onClose: () => void;\n  onNavigate?: (meta: ProcessReferenceMeta) => void;\n  selected?: boolean;\n  onToggleSelection?: () => void;\n  onRenameTitle?: (nextTitle: string) => void | Promise<void>;\n}) {`
        );
      }

      const viewerTitle = '<div className="truncate text-sm font-black text-slate-950">Slide {meta.slideNumber} · {displayTitle}</div>';
      if (next.includes(viewerTitle) && !next.includes('aria-label={`แก้ชื่อ Slide ${meta.slideNumber}`}')) {
        next = next.replace(
          viewerTitle,
          `{onRenameTitle ? (\n              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">\n                <span className="shrink-0 text-sm font-black text-slate-950">Slide {meta.slideNumber} ·</span>\n                <input\n                  key={meta.versionId + "-" + meta.slideNumber + "-" + displayTitle}\n                  defaultValue={displayTitle}\n                  aria-label={\`แก้ชื่อ Slide \${meta.slideNumber}\`}\n                  title="แก้ชื่อ Slide แล้วกด Enter หรือคลิกออกนอกช่องเพื่อบันทึก"\n                  onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}\n                  onBlur={(event) => {\n                    const title = event.currentTarget.value.trim();\n                    if (title && title !== displayTitle) void onRenameTitle(title);\n                    else event.currentTarget.value = displayTitle;\n                  }}\n                  className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-sm font-black text-slate-950 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"\n                />\n              </div>\n            ) : (\n              <div className="truncate text-sm font-black text-slate-950">Slide {meta.slideNumber} · {displayTitle}</div>\n            )}`
        );
      }

      const viewerClose = '<button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-600 hover:bg-slate-50" aria-label="ปิด">×</button>';
      if (next.includes(viewerClose) && !next.includes('{selected ? "✓ Selected" : "+ Select Slide"}')) {
        next = next.replace(
          viewerClose,
          `{onToggleSelection ? (\n              <button type="button" onClick={onToggleSelection} className={"h-9 rounded-xl border px-3 text-[11px] font-black transition " + (selected ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100")}>\n                {selected ? "✓ Selected" : "+ Select Slide"}\n              </button>\n            ) : null}\n            ${viewerClose}`
        );
      }

      const pickerState = '  const [pickerSlideNumber, setPickerSlideNumber] = useState(0);';
      if (next.includes(pickerState) && !next.includes('const [pickerSlideNumbers, setPickerSlideNumbers]')) {
        next = next.replace(
          pickerState,
          pickerState + '\n  const [pickerSlideNumbers, setPickerSlideNumbers] = useState<number[]>([]);'
        );
      }

      // Opening the picker starts from the Slides already selected in the active Process.
      next = next.split('setSlidePickerOpen(true); setSlideQuery(""); setPickerSlideNumber(0);')
        .join('setSlidePickerOpen(true); setSlideQuery(""); setPickerSlideNumber(0); setPickerSlideNumbers(Array.from(usedSlides).sort((a, b) => a - b));');

      // Switching Process files while the picker is open loads that file's current selection.
      next = next.split('setSelectedProcessIdV84(event.target.value); setPickerSlideNumber(0); setSlideQuery("");')
        .join('setSelectedProcessIdV84(event.target.value); setPickerSlideNumber(0); setPickerSlideNumbers(parsedRefs.filter((item) => item.versionId === event.target.value).map((item) => item.slideNumber).sort((a, b) => a - b)); setSlideQuery("");');

      next = next.replace(
        'const selected = pickerSlideNumber === item.slideNumber;',
        'const selected = pickerSlideNumbers.includes(item.slideNumber);'
      );

      next = next.replace(
        ' +\n                  (alreadyUsed ? "cursor-not-allowed opacity-45" : "");',
        ';'
      );

      next = next.split(' disabled={alreadyUsed}').join('');
      next = next.split('setPickerSlideNumber(item.slideNumber)')
        .join('setPickerSlideNumbers((current) => current.includes(item.slideNumber) ? current.filter((slideNumber) => slideNumber !== item.slideNumber) : [...current, item.slideNumber].sort((a, b) => a - b))');
      next = next.split(' + (alreadyUsed ? " cursor-not-allowed" : "")').join('');
      next = next.replace(
        'aria-label={alreadyUsed ? "Slide นี้ถูกเลือกแล้ว" : "เลือก Slide " + item.slideNumber}',
        'aria-label={selected ? "ยกเลิก Slide " + item.slideNumber : "เลือก Slide " + item.slideNumber}'
      );

      const singleConfirm = '<button type="button" disabled={!pickerSlideNumber || usedSlides.has(pickerSlideNumber)} onClick={() => { addSlide(pickerSlideNumber); setSlidePickerOpen(false); }} className="h-10 rounded-xl bg-[#155B83] px-5 text-xs font-black text-white shadow-sm hover:bg-[#104A6B] disabled:cursor-not-allowed disabled:bg-slate-300">✓ เลือก Slide นี้</button>';
      if (next.includes(singleConfirm)) {
        next = next.replace(
          singleConfirm,
          `<button\n                type="button"\n                disabled={!pickerSlideNumbers.length}\n                onClick={() => {\n                  const existingBySlide = new Map(parsedRefs.filter((item) => item.versionId === active.id).map((item) => [item.slideNumber, item]));\n                  const preservedOtherProcesses = parsedRefs.filter((item) => item.versionId !== active.id);\n                  const selectedForActive = pickerSlideNumbers.slice().sort((a, b) => a - b).map((slideNumber) => {\n                    const existing = existingBySlide.get(slideNumber);\n                    if (existing) return existing;\n                    const options = stepsForSlideV68(active, slideNumber);\n                    return fromVersion(active, slideNumber, options[0] || "ทั้งสไลด์");\n                  });\n                  writeRefs([...preservedOtherProcesses, ...selectedForActive].sort((a, b) => a.processName.localeCompare(b.processName, "th") || a.slideNumber - b.slideNumber));\n                  setSlidePickerOpen(false);\n                  setPickerSlideNumbers([]);\n                }}\n                className="h-10 rounded-xl bg-[#155B83] px-5 text-xs font-black text-white shadow-sm hover:bg-[#104A6B] disabled:cursor-not-allowed disabled:bg-slate-300"\n              >\n                ✓ เลือก {pickerSlideNumbers.length} Slides\n              </button>`
        );
      }

      const modalCall = '<ProcessSlideModalV68 meta={previewMeta} items={parsedRefs} onNavigate={setPreviewMeta} onClose={() => setPreviewMeta(null)} />';
      if (next.includes(modalCall)) {
        next = next.replace(
          modalCall,
          `<ProcessSlideModalV68\n        meta={previewMeta}\n        items={parsedRefs}\n        onNavigate={setPreviewMeta}\n        selected={Boolean(previewMeta && (slidePickerOpen\n          ? pickerSlideNumbers.includes(previewMeta.slideNumber)\n          : parsedRefs.some((item) => item.versionId === previewMeta.versionId && item.slideNumber === previewMeta.slideNumber)))}\n        onToggleSelection={historical ? undefined : () => {\n          if (!previewMeta) return;\n          if (slidePickerOpen) {\n            setPickerSlideNumbers((current) => current.includes(previewMeta.slideNumber)\n              ? current.filter((slideNumber) => slideNumber !== previewMeta.slideNumber)\n              : [...current, previewMeta.slideNumber].sort((a, b) => a - b));\n            return;\n          }\n          const exists = parsedRefs.some((item) => item.versionId === previewMeta.versionId && item.slideNumber === previewMeta.slideNumber);\n          if (exists) removeSlide(previewMeta.versionId, previewMeta.slideNumber);\n          else writeRefs([...parsedRefs, previewMeta].sort((a, b) => a.processName.localeCompare(b.processName, "th") || a.slideNumber - b.slideNumber));\n        }}\n        onRenameTitle={historical ? undefined : (nextTitle) => {\n          if (!previewMeta) return;\n          updateDisplayTitle(previewMeta.versionId, previewMeta.slideNumber, nextTitle);\n          persistDisplayTitleV78(previewMeta.versionId, previewMeta.slideNumber, nextTitle);\n          setPreviewMeta((previous) => previous ? { ...previous, slideTitle: nextTitle, step: nextTitle } : previous);\n        }}\n        onClose={() => setPreviewMeta(null)}\n      />`
        );
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
