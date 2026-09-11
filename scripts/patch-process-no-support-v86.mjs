import fs from "node:fs";

const processFile = "src/processLibrary.tsx";
let source = fs.readFileSync(processFile, "utf8");
const marker = "// process-reference-no-process-manual-v86";

function replaceRequired(from, to, label) {
  if (!source.includes(from)) throw new Error(`Process no-support v86: missing ${label}`);
  source = source.replace(from, to);
}

if (!source.includes(marker)) {
  if (!source.includes("// process-library-visible-file-picker-v85b")) {
    throw new Error("Process no-support v86 requires visible multi-file picker v85b first");
  }

  source = source.replace(
    "// process-library-visible-file-picker-v85b\n",
    "// process-library-visible-file-picker-v85b\n" + marker + "\n",
  );

  const separatorAnchor = 'const PROCESS_REFERENCE_SEPARATOR_V68 = "\\n---PROCESS-REFERENCE---\\n";';
  if (!source.includes(separatorAnchor)) throw new Error("Process no-support v86: reference separator anchor missing");
  const manualHelpers = `const NO_PROCESS_REFERENCE_ID_V86 = "__no_process_supported__";
const NO_PROCESS_REFERENCE_LABEL_V86 = "ยังไม่มี Process รองรับ";
const NO_PROCESS_NOTE_MARKER_V86 = "---MANUAL-PROCESS-NOTE---";

function isNoProcessReferenceV86(value: unknown) {
  return String(value || "").trim().startsWith("Process: " + NO_PROCESS_REFERENCE_LABEL_V86);
}

function readNoProcessNoteV86(value: unknown) {
  const text = String(value || "");
  const markerIndex = text.indexOf(NO_PROCESS_NOTE_MARKER_V86);
  if (markerIndex < 0) return "";
  return text.slice(markerIndex + NO_PROCESS_NOTE_MARKER_V86.length).replace(/^\\r?\\n/, "").trimEnd();
}

function serializeNoProcessReferenceV86(note: unknown) {
  const detail = String(note ?? "").replace(/\\r\\n/g, "\\n").trimEnd();
  return "Process: " + NO_PROCESS_REFERENCE_LABEL_V86 + "\\n" + NO_PROCESS_NOTE_MARKER_V86 + "\\n" + detail;
}

`;
  source = source.replace(separatorAnchor, manualHelpers + separatorAnchor);

  const parsedRefsAnchor = '  const parsedRefs = useMemo(() => parseProcessReferenceListV68(value), [value]);\n';
  if (!source.includes(parsedRefsAnchor)) throw new Error("Process no-support v86: selector parsed refs anchor missing");
  source = source.replace(
    parsedRefsAnchor,
    parsedRefsAnchor + '  const noProcessSelectedV86 = isNoProcessReferenceV86(value);\n  const noProcessNoteV86 = noProcessSelectedV86 ? readNoProcessNoteV86(value) : "";\n',
  );

  source = source.replace(
    '{loading ? "กำลังโหลด..." : active.name}',
    '{loading ? "กำลังโหลด..." : noProcessSelectedV86 ? NO_PROCESS_REFERENCE_LABEL_V86 : active.name}',
  );
  source = source.replace(
    '{!loading ? <div className="mt-0.5 text-[11px] font-semibold text-slate-500">Version: {formatProcessVersionV78(active.versionLabel)}</div> : null}',
    '{!loading && !noProcessSelectedV86 ? <div className="mt-0.5 text-[11px] font-semibold text-slate-500">Version: {formatProcessVersionV78(active.versionLabel)}</div> : null}',
  );
  source = source.replace(
    '<div className="mt-0.5 text-xs font-semibold text-slate-500">{historical ? "Historical version · ล็อกตามเคสเดิม" : "Current version · " + active.slideCount + " slides"}</div>',
    '<div className="mt-0.5 text-xs font-semibold text-slate-500">{noProcessSelectedV86 ? "กรอกข้อความอ้างอิงเองสำหรับเคสนี้" : historical ? "Historical version · ล็อกตามเคสเดิม" : "Current version · " + active.slideCount + " slides"}</div>',
  );

  const mainProcessSelect = `<select value={active.id} onChange={(event) => { setSelectedProcessIdV84(event.target.value); setPickerSlideNumber(0); setSlideQuery(""); }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100">
            {processLibraryV84.map((item) => (`;
  const mainProcessSelectReplacement = `<select value={noProcessSelectedV86 ? NO_PROCESS_REFERENCE_ID_V86 : active.id} onChange={(event) => {
            const nextValue = event.target.value;
            setPickerSlideNumber(0);
            setSlideQuery("");
            if (nextValue === NO_PROCESS_REFERENCE_ID_V86) {
              setSlidePickerOpen(false);
              onChange(serializeNoProcessReferenceV86(noProcessNoteV86));
              return;
            }
            if (noProcessSelectedV86) onChange("");
            setSelectedProcessIdV84(nextValue);
          }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100">
            <option value={NO_PROCESS_REFERENCE_ID_V86}>ยังไม่มี Process รองรับ</option>
            {processLibraryV84.map((item) => (`;
  replaceRequired(mainProcessSelect, mainProcessSelectReplacement, "main Process selector");

  const pickerProcessSelect = `                  <select
                    value={active.id}
                    onChange={(event) => {
                      setSelectedProcessIdV84(event.target.value);
                      setPickerSlideNumber(0);
                      setSlideQuery("");
                    }}
                    className="mt-1.5 h-11 w-full rounded-xl border border-sky-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    aria-label="เลือก Process File ที่ต้องการดู Slide"
                  >
                    {processLibraryV84.map((item) => (`;
  const pickerProcessSelectReplacement = `                  <select
                    value={noProcessSelectedV86 ? NO_PROCESS_REFERENCE_ID_V86 : active.id}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setPickerSlideNumber(0);
                      setSlideQuery("");
                      if (nextValue === NO_PROCESS_REFERENCE_ID_V86) {
                        setSlidePickerOpen(false);
                        onChange(serializeNoProcessReferenceV86(noProcessNoteV86));
                        return;
                      }
                      if (noProcessSelectedV86) onChange("");
                      setSelectedProcessIdV84(nextValue);
                    }}
                    className="mt-1.5 h-11 w-full rounded-xl border border-sky-200 bg-white px-3 text-sm font-black text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    aria-label="เลือก Process File ที่ต้องการดู Slide"
                  >
                    <option value={NO_PROCESS_REFERENCE_ID_V86}>ยังไม่มี Process รองรับ</option>
                    {processLibraryV84.map((item) => (`;
  replaceRequired(pickerProcessSelect, pickerProcessSelectReplacement, "Slide picker Process selector");

  replaceRequired(
    '      {!historical ? (\n        <div className="border-b border-sky-100 p-4">\n          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">เพิ่ม Slide ที่ใช้เทียบ</div>',
    '      {!historical && !noProcessSelectedV86 ? (\n        <div className="border-b border-sky-100 p-4">\n          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">เพิ่ม Slide ที่ใช้เทียบ</div>',
    "Slide chooser visibility",
  );

  const selectedListAnchor = '      <div className="space-y-2 p-4">\n';
  if (!source.includes(selectedListAnchor)) throw new Error("Process no-support v86: selected list anchor missing");
  const manualPanel = `      {noProcessSelectedV86 ? (
        <div className="border-b border-sky-100 bg-amber-50/60 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-white text-base" aria-hidden="true">✎</span>
            <div>
              <div className="text-sm font-black text-slate-900">ยังไม่มี Process รองรับ</div>
              <div className="text-[11px] font-semibold text-slate-500">กรอกรายละเอียดหรือหลักเกณฑ์ที่ใช้พิจารณาเคสนี้แทนการเลือก Slide</div>
            </div>
          </div>
          <label className="mt-3 block">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">รายละเอียด / Process ที่ใช้พิจารณา</span>
            <textarea
              value={noProcessNoteV86}
              onChange={(event) => onChange(serializeNoProcessReferenceV86(event.target.value))}
              rows={4}
              placeholder="พิมพ์รายละเอียดที่ใช้ประกอบการประเมิน เช่น ยังไม่มี Process ระบุกรณีนี้โดยตรง จึงพิจารณาตามมาตรฐานการให้บริการและข้อมูลที่ตรวจสอบได้..."
              className="mt-1.5 min-h-[104px] w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-medium leading-6 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            />
          </label>
          <div className="mt-2 text-[11px] font-semibold text-slate-500">ข้อความนี้จะถูกบันทึกติดกับเคสเป็น Snapshot และจะแสดงใน Case Detail / PDF ของเคสนี้</div>
        </div>
      ) : null}

`;
  source = source.replace(selectedListAnchor, manualPanel + selectedListAnchor);

  const emptySelectedState = `        ) : (
          <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/60 px-4 py-5 text-center text-xs font-semibold text-slate-500">ยังไม่ได้เลือก Slide ที่ใช้เทียบ</div>
        )}`;
  const emptySelectedStateReplacement = `        ) : noProcessSelectedV86 ? null : (
          <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/60 px-4 py-5 text-center text-xs font-semibold text-slate-500">ยังไม่ได้เลือก Slide ที่ใช้เทียบ</div>
        )}`;
  replaceRequired(emptySelectedState, emptySelectedStateReplacement, "empty selected Slide state");

  source = source.replace(
    '{slidePickerOpen && !historical ? (',
    '{slidePickerOpen && !historical && !noProcessSelectedV86 ? (',
  );

  source = source.replace(
    '      setSelectedProcessIdV84(id);',
    '      setSelectedProcessIdV84(id);\n      if (noProcessSelectedV86) onChange("");',
  );

  const displayStateAnchor = 'export function ProcessReferenceDisplay({ value, className = "" }: { value: string; className?: string }) {\n  const refs = useMemo(() => parseProcessReferenceListV68(value), [value]);\n  const [previewMeta, setPreviewMeta] = useState<ProcessReferenceMeta | null>(null);';
  if (!source.includes(displayStateAnchor)) throw new Error("Process no-support v86: ProcessReferenceDisplay anchor missing");
  const displayStateReplacement = `${displayStateAnchor}
  const noProcessDisplayV86 = isNoProcessReferenceV86(value);
  const noProcessDisplayNoteV86 = noProcessDisplayV86 ? readNoProcessNoteV86(value) : "";

  if (noProcessDisplayV86) return (
    <div className={className}>
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Process</div>
      <div className="mt-0.5 text-sm font-normal text-emerald-700">ยังไม่มี Process รองรับ</div>
      <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-3">
        <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">รายละเอียด</div>
        <RichTextContent value={noProcessDisplayNoteV86 || "-"} className="mt-1 whitespace-pre-line text-[14px] leading-6 text-slate-800" />
      </div>
      <div className="mt-2 text-[11px] font-semibold text-slate-500">ข้อความที่บันทึกไว้พร้อมผลประเมินเคสนี้</div>
    </div>
  );`;
  source = source.replace(displayStateAnchor, displayStateReplacement);

  fs.writeFileSync(processFile, source);
  console.log("Applied no-Process manual reference option and snapshot UI v86");
} else {
  console.log("No-Process manual reference v86 already applied");
}

const pdfFile = "src/caseDetailOfficialPdf.ts";
let pdfSource = fs.readFileSync(pdfFile, "utf8");
const pdfMarker = "// process-reference-no-process-pdf-v86";
if (!pdfSource.includes(pdfMarker)) {
  if (!pdfSource.includes("// process-reference-pdf-parity-v84")) {
    throw new Error("Process no-support PDF v86 requires PDF parity v84 first");
  }
  const helperAnchor = 'function formatProcessReferenceForPdfV84(value: unknown) {\n  const raw = safeMultiline(value, "");\n  if (!raw) return "";';
  if (!pdfSource.includes(helperAnchor)) throw new Error("Process no-support v86: PDF formatter anchor missing");
  const helperReplacement = `function formatProcessReferenceForPdfV84(value: unknown) {
  const raw = safeMultiline(value, "");
  if (!raw) return "";
  ${pdfMarker}
  if (/^Process:\\s*ยังไม่มี Process รองรับ\\s*$/im.test(raw)) {
    const noteMarker = "---MANUAL-PROCESS-NOTE---";
    const markerIndex = raw.indexOf(noteMarker);
    const note = markerIndex >= 0 ? raw.slice(markerIndex + noteMarker.length).replace(/^\\r?\\n/, "").trim() : "";
    return ["Process: ยังไม่มี Process รองรับ", note ? "รายละเอียด: " + note : "รายละเอียด: -"].join("\\n");
  }`;
  pdfSource = pdfSource.replace(helperAnchor, helperReplacement);
  fs.writeFileSync(pdfFile, pdfSource);
  console.log("Applied no-Process manual reference PDF parity v86");
} else {
  console.log("No-Process manual reference PDF v86 already applied");
}
