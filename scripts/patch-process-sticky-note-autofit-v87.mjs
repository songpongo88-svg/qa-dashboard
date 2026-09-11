import fs from "node:fs";

const processFile = "src/processLibrary.tsx";
let source = fs.readFileSync(processFile, "utf8");
const marker = "// process-reference-sticky-note-autofit-v87";

function replaceRequired(from, to, label) {
  if (!source.includes(from)) throw new Error(`Process sticky note v87: missing ${label}`);
  source = source.replace(from, to);
}

if (!source.includes(marker)) {
  if (!source.includes("// process-reference-no-process-manual-v86")) {
    throw new Error("Process sticky note v87 requires no-Process manual mode v86 first");
  }

  source = source.replace(
    "// process-reference-no-process-manual-v86\n",
    "// process-reference-no-process-manual-v86\n" + marker + "\n",
  );

  const helperAnchor = `function serializeNoProcessReferenceV86(note: unknown) {
  const detail = String(note ?? "").replace(/\\r\\n/g, "\\n").trimEnd();
  return "Process: " + NO_PROCESS_REFERENCE_LABEL_V86 + "\\n" + NO_PROCESS_NOTE_MARKER_V86 + "\\n" + detail;
}

`;
  if (!source.includes(helperAnchor)) throw new Error("Process sticky note v87: helper anchor missing");
  source = source.replace(helperAnchor, helperAnchor + `function processReferenceBaseWithoutNoteV87(value: unknown) {
  const text = String(value || "");
  const markerIndex = text.indexOf(NO_PROCESS_NOTE_MARKER_V86);
  return (markerIndex >= 0 ? text.slice(0, markerIndex) : text).trimEnd();
}

function serializeProcessValueWithNoteV87(baseValue: unknown, note: unknown) {
  const base = processReferenceBaseWithoutNoteV87(baseValue).trimEnd();
  const detail = String(note ?? "").replace(/\\r\\n/g, "\\n").trimEnd();
  if (!detail) return base;
  return (base ? base + "\\n" : "") + NO_PROCESS_NOTE_MARKER_V86 + "\\n" + detail;
}

function autoFitProcessNoteV87(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = Math.max(104, element.scrollHeight) + "px";
}

`);

  const selectorState = `  const noProcessSelectedV86 = isNoProcessReferenceV86(value);
  const noProcessNoteV86 = noProcessSelectedV86 ? readNoProcessNoteV86(value) : "";
`;
  if (!source.includes(selectorState)) throw new Error("Process sticky note v87: selector note state missing");
  source = source.replace(selectorState, `  const noProcessSelectedV86 = isNoProcessReferenceV86(value);
  const processNoteV87 = readNoProcessNoteV86(value);
  const noProcessNoteV86 = noProcessSelectedV86 ? processNoteV87 : "";
  const processNoteRefV87 = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    autoFitProcessNoteV87(processNoteRefV87.current);
  }, [processNoteV87, noProcessSelectedV86]);

  const updateProcessNoteV87 = (nextNote: string) => {
    const base = noProcessSelectedV86
      ? "Process: " + NO_PROCESS_REFERENCE_LABEL_V86
      : processReferenceBaseWithoutNoteV87(value);
    onChange(serializeProcessValueWithNoteV87(base, nextNote));
  };
`);

  const writeRefsOld = '  const writeRefs = (refs: ProcessReferenceMeta[]) => onChange(serializeProcessReferenceListV68(refs));';
  const writeRefsNew = `  const writeRefs = (refs: ProcessReferenceMeta[]) => {
    const base = serializeProcessReferenceListV68(refs);
    onChange(serializeProcessValueWithNoteV87(base, processNoteV87));
  };`;
  replaceRequired(writeRefsOld, writeRefsNew, "writeRefs note preservation");

  source = source.split('onChange(serializeNoProcessReferenceV86(noProcessNoteV86));').join('onChange(serializeProcessValueWithNoteV87("Process: " + NO_PROCESS_REFERENCE_LABEL_V86, processNoteV87));');
  source = source.split('if (noProcessSelectedV86) onChange("");').join('if (noProcessSelectedV86) onChange(serializeProcessValueWithNoteV87("", processNoteV87));');

  const manualPanelPattern = /      \{noProcessSelectedV86 \? \([\s\S]*?      \) : null\}\n\n(?=      <div className="space-y-2 p-4">)/;
  if (!manualPanelPattern.test(source)) throw new Error("Process sticky note v87: v86 manual panel missing");
  source = source.replace(manualPanelPattern, `      <div className="border-b border-sky-100 bg-amber-50/50 p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-white text-base" aria-hidden="true">✎</span>
          <div>
            <div className="text-sm font-black text-slate-900">{noProcessSelectedV86 ? "รายละเอียด / Process ที่ใช้พิจารณา" : "โน้ตเพิ่มเติม"}</div>
            <div className="text-[11px] font-semibold text-slate-500">{noProcessSelectedV86 ? "กรอกรายละเอียดหรือหลักเกณฑ์ที่ใช้พิจารณาเคสนี้แทนการเลือก Slide" : "พิมพ์หมายเหตุเพิ่มเติมประกอบ Process หรือ Slide ที่เลือกไว้ได้ตลอด"}</div>
          </div>
        </div>
        <label className="mt-3 block">
          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{noProcessSelectedV86 ? "รายละเอียด / Process ที่ใช้พิจารณา" : "โน้ตเพิ่มเติม"}</span>
          <textarea
            ref={processNoteRefV87}
            value={processNoteV87}
            onChange={(event) => updateProcessNoteV87(event.target.value)}
            onInput={(event) => autoFitProcessNoteV87(event.currentTarget)}
            rows={1}
            placeholder={noProcessSelectedV86 ? "พิมพ์รายละเอียดที่ใช้ประกอบการประเมิน เช่น ยังไม่มี Process ระบุกรณีนี้โดยตรง จึงพิจารณาตามมาตรฐานการให้บริการและข้อมูลที่ตรวจสอบได้..." : "พิมพ์โน้ตเพิ่มเติมเกี่ยวกับ Process / Slide / เงื่อนไขที่ใช้พิจารณาเคสนี้..."}
            className="mt-1.5 min-h-[104px] w-full resize-none overflow-hidden rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-medium leading-6 text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </label>
        <div className="mt-2 text-[11px] font-semibold text-slate-500">ช่องนี้ค้างไว้เสมอและปรับความสูงตามข้อความอัตโนมัติ · ข้อความจะถูกบันทึกเป็น Snapshot ใน Case Detail / PDF ของเคสนี้</div>
      </div>

`);

  const displayNoteState = '  const noProcessDisplayNoteV86 = noProcessDisplayV86 ? readNoProcessNoteV86(value) : "";';
  replaceRequired(displayNoteState, '  const noProcessDisplayNoteV86 = readNoProcessNoteV86(value);', "display note state");

  const noRefsLine = '  if (!refs.length) return <RichTextContent value={value} className={"whitespace-pre-line text-[14px] leading-6 text-slate-800 " + className} />;';
  const noRefsReplacement = `  if (!refs.length) return noProcessDisplayNoteV86 ? (
    <div className={className}>
      <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-3">
        <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">โน้ตเพิ่มเติม</div>
        <RichTextContent value={noProcessDisplayNoteV86} className="mt-1 whitespace-pre-line text-[14px] leading-6 text-slate-800" />
      </div>
    </div>
  ) : <RichTextContent value={value} className={"whitespace-pre-line text-[14px] leading-6 text-slate-800 " + className} />;`;
  replaceRequired(noRefsLine, noRefsReplacement, "note-only Case Detail display");

  const displayFooter = '      <div className="mt-2 text-[11px] font-semibold text-slate-500">ใช้ไฟล์จาก Version ที่บันทึกไว้พร้อมผลประเมินเคสนี้</div>';
  if (!source.includes(displayFooter)) throw new Error("Process sticky note v87: Case Detail footer missing");
  source = source.replace(displayFooter, `      {noProcessDisplayNoteV86 ? (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-3">
          <div className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-500">โน้ตเพิ่มเติม</div>
          <RichTextContent value={noProcessDisplayNoteV86} className="mt-1 whitespace-pre-line text-[14px] leading-6 text-slate-800" />
        </div>
      ) : null}
      <div className="mt-2 text-[11px] font-semibold text-slate-500">ใช้ไฟล์จาก Version ที่บันทึกไว้พร้อมผลประเมินเคสนี้</div>`);

  fs.writeFileSync(processFile, source);
  console.log("Applied persistent Process note with automatic textarea height v87");
} else {
  console.log("Persistent Process note/autofit v87 already applied");
}

const pdfFile = "src/caseDetailOfficialPdf.ts";
let pdfSource = fs.readFileSync(pdfFile, "utf8");
const pdfMarker = "// process-reference-sticky-note-pdf-v87";
if (!pdfSource.includes(pdfMarker)) {
  if (!pdfSource.includes("// process-reference-no-process-pdf-v86")) {
    throw new Error("Process sticky note PDF v87 requires v86 first");
  }

  const noProcessNoteLine = '    const note = markerIndex >= 0 ? raw.slice(markerIndex + noteMarker.length).replace(/^\\r?\\n/, "").trim() : "";';
  if (!pdfSource.includes(noProcessNoteLine)) throw new Error("Process sticky note PDF v87: v86 note parser missing");
  pdfSource = pdfSource.replace(noProcessNoteLine, `${noProcessNoteLine}
    ${pdfMarker}`);

  const blocksAnchor = '  const blocks = raw\n    .split(/\\r?\\n\\s*---PROCESS-REFERENCE---\\s*\\r?\\n/i)';
  if (!pdfSource.includes(blocksAnchor)) throw new Error("Process sticky note PDF v87: blocks anchor missing");
  pdfSource = pdfSource.replace(blocksAnchor, `  const noteMarkerV87 = "---MANUAL-PROCESS-NOTE---";
  const noteIndexV87 = raw.indexOf(noteMarkerV87);
  const processNoteV87 = noteIndexV87 >= 0 ? raw.slice(noteIndexV87 + noteMarkerV87.length).replace(/^\\r?\\n/, "").trim() : "";
  const rawWithoutNoteV87 = noteIndexV87 >= 0 ? raw.slice(0, noteIndexV87).trimEnd() : raw;

  const blocks = rawWithoutNoteV87
    .split(/\\r?\\n\\s*---PROCESS-REFERENCE---\\s*\\r?\\n/i)`);

  const finalReturn = '  return lines.join("\\n");\n}\n\nfunction formatDescriptionText';
  if (!pdfSource.includes(finalReturn)) throw new Error("Process sticky note PDF v87: final formatter return missing");
  pdfSource = pdfSource.replace(finalReturn, `  if (processNoteV87) {
    if (lines.length) lines.push("");
    lines.push("โน้ตเพิ่มเติม: " + processNoteV87);
  }
  return lines.join("\\n");
}

function formatDescriptionText`);

  fs.writeFileSync(pdfFile, pdfSource);
  console.log("Applied persistent Process note to Case Detail PDF v87");
} else {
  console.log("Persistent Process note PDF v87 already applied");
}
