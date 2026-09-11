import fs from "node:fs";

const file = "src/processLibrary.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// process-reference-custom-labels-v73";

if (source.includes(marker)) {
  console.log("Process reference UI v73 already applied");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Process reference UI v73: missing ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  '// process-library-native-v69\n',
  '// process-library-native-v69\n' + marker + '\n',
  'source marker',
);

replaceOnce(
`function ProcessSlideModalV68({ meta, onClose }: { meta: ProcessReferenceMeta | null; onClose: () => void }) {
  useEffect(() => {
    if (!meta) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [meta, onClose]);

  if (!meta) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={\`Slide \${meta.slideNumber} \${meta.slideTitle}\`} className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="flex max-h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] border border-violet-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-violet-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Process Slide</div>
            <div className="truncate text-base font-black text-slate-950">Slide {meta.slideNumber} - {meta.slideTitle}</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-500">{meta.processName} · v{meta.versionLabel} · {meta.step || "ทั้งสไลด์"}</div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-black text-slate-600 hover:bg-slate-50" aria-label="ปิด">×</button>
        </div>
        <div className="min-h-0 flex-1 bg-slate-100 p-2 sm:p-3">
          <ProcessSlideFileV70 key={serializeProcessReference(meta)} meta={meta} />
        </div>
      </div>
    </div>
  );
}
`,
`function ProcessSlideModalV68({ meta, items = [], onClose, onNavigate }: { meta: ProcessReferenceMeta | null; items?: ProcessReferenceMeta[]; onClose: () => void; onNavigate?: (meta: ProcessReferenceMeta) => void }) {
  const [minimized, setMinimized] = useState(false);
  const index = meta ? items.findIndex((item) => item.versionId === meta.versionId && item.slideNumber === meta.slideNumber) : -1;
  const hasPrevious = index > 0;
  const hasNext = index >= 0 && index < items.length - 1;

  useEffect(() => {
    if (!meta) return;
    setMinimized(false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && hasPrevious && onNavigate) onNavigate(items[index - 1]);
      if (event.key === "ArrowRight" && hasNext && onNavigate) onNavigate(items[index + 1]);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [meta, onClose, onNavigate, hasPrevious, hasNext, index, items]);

  if (!meta) return null;
  const displayTitle = meta.step && meta.step !== "ทั้งสไลด์" ? meta.step : meta.slideTitle || `Slide ${meta.slideNumber}`;

  if (minimized) {
    return (
      <div className="fixed bottom-5 right-5 z-[260] flex max-w-[min(92vw,520px)] items-center gap-3 rounded-2xl border border-sky-200 bg-white px-3 py-2.5 shadow-2xl">
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black uppercase tracking-[0.18em] text-sky-700">Process Slide · ย่ออยู่</div>
          <div className="truncate text-sm font-black text-slate-950">Slide {meta.slideNumber} · {displayTitle}</div>
        </div>
        <button type="button" onClick={() => setMinimized(false)} className="h-9 rounded-xl bg-[#0f5b82] px-3 text-xs font-black text-white hover:bg-[#0b4766]" title="ขยายหน้าต่างสไลด์กลับมา">ขยาย</button>
        <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-black text-slate-600 hover:bg-slate-50" aria-label="ปิด">×</button>
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={\`Slide \${meta.slideNumber} \${displayTitle}\`} className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/75 p-3 sm:p-6" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <div className="flex max-h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] border border-sky-200 bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-sky-100 bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0f5b82]">Process Slide</div>
            <div className="truncate text-base font-black text-slate-950">Slide {meta.slideNumber} · {displayTitle}</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-500">{meta.processName} · v{meta.versionLabel}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {items.length > 1 ? (
              <div className="mr-1 hidden items-center gap-1 sm:flex">
                <button type="button" disabled={!hasPrevious} onClick={() => hasPrevious && onNavigate?.(items[index - 1])} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35">← ย้อนกลับ</button>
                <span className="min-w-[54px] text-center text-[11px] font-black text-slate-500">{index + 1}/{items.length}</span>
                <button type="button" disabled={!hasNext} onClick={() => hasNext && onNavigate?.(items[index + 1])} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35">ถัดไป →</button>
              </div>
            ) : null}
            <button type="button" onClick={() => setMinimized(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-lg font-black text-[#0f5b82] hover:bg-sky-100" aria-label="ย่อหน้าต่าง" title="ย่อหน้าต่างสไลด์">−</button>
            <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-black text-slate-600 hover:bg-slate-50" aria-label="ปิด">×</button>
          </div>
        </div>
        {items.length > 1 ? (
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 sm:hidden">
            <button type="button" disabled={!hasPrevious} onClick={() => hasPrevious && onNavigate?.(items[index - 1])} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black disabled:opacity-35">← ย้อนกลับ</button>
            <span className="text-[11px] font-black text-slate-500">{index + 1}/{items.length}</span>
            <button type="button" disabled={!hasNext} onClick={() => hasNext && onNavigate?.(items[index + 1])} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black disabled:opacity-35">ถัดไป →</button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 bg-slate-100 p-2 sm:p-3">
          <ProcessSlideFileV70 key={serializeProcessReference(meta)} meta={meta} />
        </div>
      </div>
    </div>
  );
}
`,
  'slide viewer modal',
);

replaceOnce(
`  const [message, setMessage] = useState("");
  const [previewMeta, setPreviewMeta] = useState<ProcessReferenceMeta | null>(null);
`,
`  const [message, setMessage] = useState("");
  const [previewMeta, setPreviewMeta] = useState<ProcessReferenceMeta | null>(null);
  const [slidePickerOpen, setSlidePickerOpen] = useState(false);
  const [slideQuery, setSlideQuery] = useState("");
  const [pickerSlideNumber, setPickerSlideNumber] = useState(0);
`,
  'selector states',
);

replaceOnce(
`  const addSlide = (slideNumber: number) => {
    if (!slideNumber || parsedRefs.some((item) => item.slideNumber === slideNumber)) return;
    const options = stepsForSlideV68(active, slideNumber);
    const defaultStep = options[0] || "ทั้งสไลด์";
    writeRefs([...parsedRefs, fromVersion(active, slideNumber, defaultStep)].sort((a, b) => a.slideNumber - b.slideNumber));
  };

  const updateStep = (slideNumber: number, nextStep: string) => {
    writeRefs(parsedRefs.map((item) => item.slideNumber === slideNumber ? { ...item, step: nextStep } : item));
  };
`,
`  const addSlide = (slideNumber: number) => {
    if (!slideNumber || parsedRefs.some((item) => item.slideNumber === slideNumber)) return;
    const fallbackTitle = active.slideTitles[Math.max(0, slideNumber - 1)] || `Slide ${slideNumber}`;
    const next = fromVersion(active, slideNumber, fallbackTitle);
    writeRefs([...parsedRefs, next].sort((a, b) => a.slideNumber - b.slideNumber));
    setPickerSlideNumber(0);
  };

  const updateDisplayTitle = (slideNumber: number, nextTitle: string) => {
    writeRefs(parsedRefs.map((item) => item.slideNumber === slideNumber ? { ...item, step: nextTitle } : item));
  };
`,
  'slide add/update handlers',
);

replaceOnce(
`  const usedSlides = new Set(parsedRefs.map((item) => item.slideNumber));
  const autoName = uploadFile ? uploadFile.name.replace(/\\.[^.]+$/, "").replace(/\\s*\\(\\d+\\)\\s*$/, "").trim() : "-";
`,
`  const usedSlides = new Set(parsedRefs.map((item) => item.slideNumber));
  const autoName = uploadFile ? uploadFile.name.replace(/\\.[^.]+$/, "").replace(/\\s*\\(\\d+\\)\\s*$/, "").trim() : "-";
  const filteredSlides = active.slideTitles
    .map((title, index) => ({ slideNumber: index + 1, title: String(title || `Slide ${index + 1}`) }))
    .filter((item) => {
      const query = slideQuery.trim().toLowerCase();
      if (!query) return true;
      return String(item.slideNumber).includes(query) || item.title.toLowerCase().includes(query);
    });
`,
  'slide picker data',
);

replaceOnce(
`      {!historical ? (
        <div className="border-b border-violet-100 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">เพิ่ม Slide ที่ใช้เทียบ</div>
          <select value="" disabled={loading} onChange={(event) => addSlide(Number(event.target.value || 0))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold disabled:cursor-wait disabled:bg-slate-100">
            <option value="">{loading ? "กำลังโหลด Current Version..." : "เลือก Slide เพิ่มได้หลายรายการ..."}</option>
            {active.slideTitles.map((title, index) => (
              <option key={index + 1} value={index + 1} disabled={usedSlides.has(index + 1)}>Slide {index + 1} — {title}</option>
            ))}
          </select>
          <div className="mt-1.5 text-[11px] font-semibold text-slate-500">เลือกทีละ Slide ได้หลาย Slide ระบบจะสร้าง “ข้อที่ใช้เทียบ” จากข้อมูลของ Slide นั้นอัตโนมัติ</div>
        </div>
      ) : null}
`,
`      {!historical ? (
        <div className="border-b border-sky-100 p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">เพิ่ม Slide ที่ใช้เทียบ</div>
          <button type="button" disabled={loading} onClick={() => { setSlidePickerOpen(true); setSlideQuery(""); setPickerSlideNumber(0); }} className="mt-1.5 flex h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-left text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-wait disabled:bg-slate-100">
            <span>{loading ? "กำลังโหลด Current Version..." : "เลือก Slide เพิ่มได้หลายรายการ..."}</span>
            <span className="text-lg text-[#0f5b82]">⌄</span>
          </button>
          <div className="mt-1.5 text-[11px] font-semibold text-slate-500">เลือก Slide แล้วตั้งชื่อหัวข้อที่ต้องการใช้แสดงในแบบประเมินได้เอง</div>
        </div>
      ) : null}
`,
  'slide chooser button',
);

replaceOnce(
`      <div className="space-y-2 p-4">
        {parsedRefs.length ? parsedRefs.map((meta) => {
          const stepOptions = stepsForSlideV68(active, meta.slideNumber);
          const options = stepOptions.includes(meta.step) ? stepOptions : [...stepOptions, meta.step].filter(Boolean);
          return (
            <div key={meta.versionId + "-" + meta.slideNumber} className="rounded-xl border border-violet-100 bg-white px-3 py-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-black text-violet-800">Slide {meta.slideNumber}</div>
                  <div className="mt-0.5 truncate text-sm font-black text-slate-950" title={meta.slideTitle}>{meta.slideTitle}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => setPreviewMeta(meta)} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-100">ดูสไลด์</button>
                  {!historical ? <button type="button" onClick={() => removeSlide(meta.slideNumber)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-sm font-black text-rose-700 hover:bg-rose-100" aria-label="ลบ Slide">×</button> : null}
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
                <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">ข้อที่ใช้เทียบ</div>
                <select value={meta.step || "ทั้งสไลด์"} disabled={historical} onChange={(event) => updateStep(meta.slideNumber, event.target.value)} className="h-10 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold disabled:bg-slate-100">
                  {options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
            </div>
          );
        }) : (
          <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/60 px-4 py-5 text-center text-xs font-semibold text-slate-500">ยังไม่ได้เลือก Slide ที่ใช้เทียบ</div>
        )}
      </div>

      <ProcessSlideModalV68 meta={previewMeta} onClose={() => setPreviewMeta(null)} />
`,
`      <div className="space-y-2 p-4">
        {parsedRefs.length ? (
          <>
            <div className="flex items-center justify-between gap-3 pb-1">
              <div className="text-xs font-black text-slate-700">รายการ Slide ที่เลือก ({parsedRefs.length})</div>
              {!historical && parsedRefs.length > 1 ? <button type="button" onClick={() => writeRefs([])} className="text-[11px] font-black text-rose-600 hover:text-rose-700">ล้างทั้งหมด</button> : null}
            </div>
            {parsedRefs.map((meta) => {
              const displayTitle = meta.step && meta.step !== "ทั้งสไลด์" ? meta.step : meta.slideTitle;
              return (
                <div key={meta.versionId + "-" + meta.slideNumber} className="rounded-xl border border-sky-100 bg-white px-3 py-3 shadow-sm">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-[#0f5b82]">Slide {meta.slideNumber}</div>
                      <input value={displayTitle || ""} readOnly={historical} onChange={(event) => updateDisplayTitle(meta.slideNumber, event.target.value)} placeholder="พิมพ์ชื่อหัวข้อที่ต้องการแสดง..." className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 read-only:bg-slate-100" />
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-end">
                      <button type="button" onClick={() => setPreviewMeta(meta)} className="h-10 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-[#0f5b82] hover:bg-sky-100">◉ ดูสไลด์</button>
                      {!historical ? <button type="button" onClick={() => removeSlide(meta.slideNumber)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-sm font-black text-rose-700 hover:bg-rose-100" aria-label="ลบ Slide">×</button> : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {!historical ? <button type="button" onClick={() => { setSlidePickerOpen(true); setSlideQuery(""); setPickerSlideNumber(0); }} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-sky-300 bg-sky-50/60 text-xs font-black text-[#0f5b82] hover:bg-sky-50"><span className="text-xl">＋</span> เพิ่ม Slide อื่นๆ</button> : null}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/60 px-4 py-5 text-center text-xs font-semibold text-slate-500">ยังไม่ได้เลือก Slide ที่ใช้เทียบ</div>
        )}
      </div>

      {slidePickerOpen && !historical ? (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-950/65 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="เลือก Slide จาก Process" onMouseDown={(event) => { if (event.currentTarget === event.target) setSlidePickerOpen(false); }}>
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-sky-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-sky-100 px-5 py-4">
              <div>
                <div className="text-lg font-black text-[#103d66]">เลือก Slide จาก Process</div>
                <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                  <div className="text-sm font-black text-slate-950">{active.name} · v{active.versionLabel}</div>
                  <div className="text-xs font-semibold text-slate-500">{active.slideCount} slides</div>
                </div>
              </div>
              <button type="button" onClick={() => setSlidePickerOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-black text-slate-600 hover:bg-slate-50">×</button>
            </div>
            <div className="border-b border-slate-100 px-5 py-3">
              <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100">
                <span className="text-slate-400">⌕</span>
                <input autoFocus value={slideQuery} onChange={(event) => setSlideQuery(event.target.value)} placeholder="ค้นหาเลข Slide หรือชื่อหัวข้อ..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-3">
              {filteredSlides.map((item) => {
                const alreadyUsed = usedSlides.has(item.slideNumber);
                const selected = pickerSlideNumber === item.slideNumber;
                return (
                  <button key={item.slideNumber} type="button" disabled={alreadyUsed} onClick={() => setPickerSlideNumber(item.slideNumber)} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${selected ? "border-sky-500 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/50"} ${alreadyUsed ? "cursor-not-allowed opacity-45" : ""}`}>
                    <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-gradient-to-br from-[#0f5b82] to-[#0f766e] text-[10px] font-black text-white shadow-sm">Slide {item.slideNumber}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black text-[#0f5b82]">Slide {item.slideNumber}</div>
                      <div className="truncate text-sm font-bold text-slate-800" title={item.title}>{item.title}</div>
                    </div>
                    <div className={`h-5 w-5 shrink-0 rounded-full border-2 ${selected ? "border-sky-600 bg-sky-600 shadow-[inset_0_0_0_4px_white]" : "border-slate-300 bg-white"}`} />
                  </button>
                );
              })}
              {!filteredSlides.length ? <div className="py-10 text-center text-sm font-semibold text-slate-500">ไม่พบ Slide ที่ค้นหา</div> : null}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <button type="button" onClick={() => setSlidePickerOpen(false)} className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50">ยกเลิก</button>
              <button type="button" disabled={!pickerSlideNumber || usedSlides.has(pickerSlideNumber)} onClick={() => { addSlide(pickerSlideNumber); setSlidePickerOpen(false); }} className="h-10 rounded-xl bg-[#0f5b82] px-5 text-xs font-black text-white shadow-sm hover:bg-[#0b4766] disabled:cursor-not-allowed disabled:bg-slate-300">✓ เลือก Slide นี้</button>
            </div>
          </div>
        </div>
      ) : null}

      <ProcessSlideModalV68 meta={previewMeta} items={parsedRefs} onNavigate={setPreviewMeta} onClose={() => setPreviewMeta(null)} />
`,
  'selected slide cards and picker modal',
);

const displayStart = `export function ProcessReferenceDisplay({ value, className = "" }: { value: string; className?: string }) {
  const refs = useMemo(() => parseProcessReferenceListV68(value), [value]);
  const [previewMeta, setPreviewMeta] = useState<ProcessReferenceMeta | null>(null);
  if (!refs.length) return <RichTextContent value={value} className={"whitespace-pre-line text-[14px] leading-6 text-slate-800 " + className} />;
  const first = refs[0];
  return (
    <div className={className}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Process</div>
          <div className="mt-0.5 truncate text-sm font-black text-slate-950" title={first.processName}>{first.processName}</div>
        </div>
        <div className="shrink-0 text-xs font-bold text-violet-700">Version {first.versionLabel || "-"}</div>
      </div>
      <div className="mt-3 space-y-2">
        {refs.map((meta) => (
          <div key={meta.versionId + "-" + meta.slideNumber} className="flex flex-col gap-2 rounded-xl border border-violet-100 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-black text-violet-800">Slide {meta.slideNumber}</div>
              <div className="mt-0.5 truncate text-sm font-extrabold text-slate-900" title={meta.slideTitle}>{meta.slideTitle}</div>
              <div className="mt-1 text-xs font-bold text-slate-500">{meta.step || "ทั้งสไลด์"}</div>
            </div>
            <button type="button" onClick={() => setPreviewMeta(meta)} className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 shadow-sm transition hover:bg-violet-100">ดูสไลด์</button>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[11px] font-semibold text-slate-500">ใช้ไฟล์จาก Version ที่บันทึกพร้อมผลประเมินเคสนี้</div>
      <ProcessSlideModalV68 meta={previewMeta} onClose={() => setPreviewMeta(null)} />
    </div>
  );
}`;

const displayReplacement = `export function ProcessReferenceDisplay({ value, className = "" }: { value: string; className?: string }) {
  const refs = useMemo(() => parseProcessReferenceListV68(value), [value]);
  const [previewMeta, setPreviewMeta] = useState<ProcessReferenceMeta | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= refs.length) setActiveIndex(Math.max(0, refs.length - 1));
  }, [activeIndex, refs.length]);

  if (!refs.length) return <RichTextContent value={value} className={"whitespace-pre-line text-[14px] leading-6 text-slate-800 " + className} />;
  const first = refs[0];
  const activeRef = refs[Math.min(activeIndex, refs.length - 1)] || first;
  const displayTitle = activeRef.step && activeRef.step !== "ทั้งสไลด์" ? activeRef.step : activeRef.slideTitle || `Slide ${activeRef.slideNumber}`;
  return (
    <div className={className}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Process</div>
          <div className="mt-0.5 truncate text-sm font-black text-slate-950" title={first.processName}>{first.processName}</div>
        </div>
        {refs.length > 1 ? <div className="shrink-0 text-[11px] font-black text-slate-500">{activeIndex + 1} / {refs.length}</div> : null}
      </div>

      <div className="mt-3 rounded-xl border border-sky-100 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-black text-emerald-700">Slide {activeRef.slideNumber}</div>
            <div className="mt-0.5 text-sm font-black text-slate-950" title={displayTitle}>{displayTitle}</div>
          </div>
          <button type="button" onClick={() => setPreviewMeta(activeRef)} className="shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-black text-[#0f5b82] shadow-sm transition hover:bg-sky-100">◉ ดูสไลด์</button>
        </div>
        {refs.length > 1 ? (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <button type="button" disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => Math.max(0, index - 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35">← ย้อนกลับ</button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
              {refs.map((item, index) => <button key={item.versionId + "-dot-" + item.slideNumber} type="button" onClick={() => setActiveIndex(index)} className={`h-2 rounded-full transition-all ${index === activeIndex ? "w-6 bg-[#0f5b82]" : "w-2 bg-slate-300 hover:bg-slate-400"}`} aria-label={`Slide ${item.slideNumber}`} />)}
            </div>
            <button type="button" disabled={activeIndex === refs.length - 1} onClick={() => setActiveIndex((index) => Math.min(refs.length - 1, index + 1))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35">ถัดไป →</button>
          </div>
        ) : null}
      </div>
      <div className="mt-2 text-[11px] font-semibold text-slate-500">ใช้ไฟล์จาก Version ที่บันทึกไว้พร้อมผลประเมินเคสนี้</div>
      <ProcessSlideModalV68 meta={previewMeta} items={refs} onNavigate={(next) => { setPreviewMeta(next); const nextIndex = refs.findIndex((item) => item.slideNumber === next.slideNumber && item.versionId === next.versionId); if (nextIndex >= 0) setActiveIndex(nextIndex); }} onClose={() => setPreviewMeta(null)} />
    </div>
  );
}`;

replaceOnce(displayStart, displayReplacement, 'process reference display');

fs.writeFileSync(file, source);
console.log("Applied Process reference custom labels, picker, carousel, navigation, and minimize v73");
