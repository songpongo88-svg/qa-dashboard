import fs from "node:fs";

const file = "src/processLibrary.tsx";
let source = fs.readFileSync(file, "utf8");
const marker = "// process-library-multi-file-v84";

function replaceOnce(from, to, label) {
  if (!source.includes(from)) throw new Error(`Process multi-file v84: missing ${label}`);
  source = source.replace(from, to);
}

if (!source.includes(marker)) {
  if (!source.includes("// process-reference-case-title-repair-v81")) {
    throw new Error("Process multi-file v84 requires Process reference v81 first");
  }
  source = source.replace(
    "// process-reference-case-title-repair-v81\n",
    "// process-reference-case-title-repair-v81\n" + marker + "\n",
  );

  const fromVersionAnchor = "function fromVersion(version: ProcessVersion, slideNumber: number, step: string): ProcessReferenceMeta {";
  if (!source.includes(fromVersionAnchor)) throw new Error("Process multi-file v84: fromVersion anchor missing");
  const helpers = `function processNameKeyV84(value: unknown) {
  return String(value || "Process").trim().toLowerCase().replace(/\\s+/g, " ");
}

function currentProcessLibraryV84(rows: any[]): ProcessVersion[] {
  const versionRows = rows.filter((row) => row?.kind !== "file-chunk" && row?.id);
  const groups = new Map<string, any[]>();
  versionRows.forEach((row) => {
    const key = processNameKeyV84(row?.name || row?.fileName || "Process");
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  });

  const builtinKey = processNameKeyV84(BUILTIN_VERSION.name);
  if (!groups.has(builtinKey)) groups.set(builtinKey, [{ ...builtInVersionV68(), status: "current" }]);

  const library: ProcessVersion[] = [];
  groups.forEach((list) => {
    const sorted = list.slice().sort((a, b) => new Date(b?.uploadedAt || 0).getTime() - new Date(a?.uploadedAt || 0).getTime());
    const selected = sorted.find((row) => row?.status === "current") || sorted[0];
    if (!selected) return;
    const version = currentProcessVersionV69([{ ...selected, status: "current" }]);
    if (version) library.push(version);
  });

  return library.sort((a, b) => a.name.localeCompare(b.name, "th", { sensitivity: "base" }));
}

`;
  source = source.replace(fromVersionAnchor, helpers + fromVersionAnchor);

  replaceOnce(
    '  const [current, setCurrent] = useState<ProcessVersion>(() => builtInVersionV68());\n',
    '  const [current, setCurrent] = useState<ProcessVersion>(() => builtInVersionV68());\n  const [processLibraryV84, setProcessLibraryV84] = useState<ProcessVersion[]>(() => [builtInVersionV68()]);\n  const [selectedProcessIdV84, setSelectedProcessIdV84] = useState(BUILTIN_VERSION.id);\n',
    "selector multi-process states",
  );

  replaceOnce(
    '        const rows = result.docs.map((entry) => ({ id: entry.id, ...(entry.data() as any) }));\n        setCurrent(currentProcessVersionV69(rows) || builtInVersionV68());\n        setLoading(false);',
    '        const rows = result.docs.map((entry) => ({ id: entry.id, ...(entry.data() as any) }));\n        const library = currentProcessLibraryV84(rows);\n        setProcessLibraryV84(library);\n        setCurrent((previous) => library.find((item) => item.id === previous.id) || library[0] || builtInVersionV68());\n        setSelectedProcessIdV84((previous) => library.some((item) => item.id === previous) ? previous : (library[0]?.id || BUILTIN_VERSION.id));\n        setLoading(false);',
    "Firestore current Process listener",
  );

  const activePattern = /  const firstSaved = parsedRefs\[0\] \|\| null;\n  const historical = Boolean\([\s\S]*?\n    : current;\n/;
  if (!activePattern.test(source)) throw new Error("Process multi-file v84: historical active block missing");
  source = source.replace(activePattern, `  const firstSaved = parsedRefs[0] || null;
  const historical = false;
  const active: ProcessVersion = processLibraryV84.find((item) => item.id === selectedProcessIdV84)
    || processLibraryV84.find((item) => item.id === current.id)
    || current;
`);

  source = source.replace(
    'if (!slideNumber || parsedRefs.some((item) => item.slideNumber === slideNumber)) return;',
    'if (!slideNumber || parsedRefs.some((item) => item.versionId === active.id && item.slideNumber === slideNumber)) return;',
  );
  source = source.replace(
    'writeRefs([...parsedRefs, next].sort((a, b) => a.slideNumber - b.slideNumber));',
    'writeRefs([...parsedRefs, next].sort((a, b) => a.processName.localeCompare(b.processName, "th") || a.slideNumber - b.slideNumber));',
  );
  source = source.replace(
    'writeRefs([...parsedRefs, fromVersion(active, slideNumber, defaultStep)].sort((a, b) => a.slideNumber - b.slideNumber));',
    'writeRefs([...parsedRefs, fromVersion(active, slideNumber, defaultStep)].sort((a, b) => a.processName.localeCompare(b.processName, "th") || a.slideNumber - b.slideNumber));',
  );

  const updatePattern = /  const updateDisplayTitle = \(slideNumber: number, nextTitle: string\) => \{[\s\S]*?\n  \};\n/;
  if (!updatePattern.test(source)) throw new Error("Process multi-file v84: updateDisplayTitle handler missing");
  source = source.replace(updatePattern, `  const updateDisplayTitle = (versionId: string, slideNumber: number, nextTitle: string) => {
    writeRefs(parsedRefs.map((item) => item.versionId === versionId && item.slideNumber === slideNumber
      ? { ...item, step: nextTitle, slideTitle: nextTitle.trim() || item.slideTitle }
      : item));
  };
`);

  const persistPattern = /  const persistDisplayTitleV78 = \(slideNumber: number, nextTitle: string\) => \{[\s\S]*?\n  \};\n/;
  if (!persistPattern.test(source)) throw new Error("Process multi-file v84: persistDisplayTitle handler missing");
  source = source.replace(persistPattern, `  const persistDisplayTitleV78 = (versionId: string, slideNumber: number, nextTitle: string) => {
    const cleanTitle = nextTitle.trim();
    const target = processLibraryV84.find((item) => item.id === versionId) || (active.id === versionId ? active : null);
    if (!cleanTitle || !versionId || !target) return;
    const nextTitles = [...target.slideTitles];
    while (nextTitles.length < target.slideCount) nextTitles.push("Slide " + (nextTitles.length + 1));
    nextTitles[Math.max(0, slideNumber - 1)] = cleanTitle;
    setProcessLibraryV84((rows) => rows.map((row) => row.id === versionId ? { ...row, slideTitles: nextTitles } : row));
    setCurrent((row) => row.id === versionId ? { ...row, slideTitles: nextTitles } : row);
    const services = firebaseServices();
    if (!services) return;
    const batch = writeBatch(services.db);
    batch.set(doc(services.db, PROCESS_COLLECTION, versionId), { slideTitles: nextTitles }, { merge: true });
    void batch.commit().catch((error) => console.error("Save custom Process slide title failed", error));
  };
`);

  const removePattern = /  const removeSlide = \(slideNumber: number\) => \{\n    writeRefs\(parsedRefs\.filter\(\(item\) => item\.slideNumber !== slideNumber\)\);\n  \};/;
  if (!removePattern.test(source)) throw new Error("Process multi-file v84: removeSlide handler missing");
  source = source.replace(removePattern, `  const removeSlide = (versionId: string, slideNumber: number) => {
    writeRefs(parsedRefs.filter((item) => !(item.versionId === versionId && item.slideNumber === slideNumber)));
  };`);

  source = source.split('updateDisplayTitle(meta.slideNumber, event.target.value)').join('updateDisplayTitle(meta.versionId, meta.slideNumber, event.target.value)');
  source = source.split('persistDisplayTitleV78(meta.slideNumber, event.currentTarget.value)').join('persistDisplayTitleV78(meta.versionId, meta.slideNumber, event.currentTarget.value)');
  source = source.split('removeSlide(meta.slideNumber)').join('removeSlide(meta.versionId, meta.slideNumber)');

  replaceOnce(
    '  const usedSlides = new Set(parsedRefs.map((item) => item.slideNumber));',
    '  const usedSlides = new Set(parsedRefs.filter((item) => item.versionId === active.id).map((item) => item.slideNumber));',
    "active Process used Slides",
  );
  source = source.split('const selectedRef = parsedRefs.find((item) => item.slideNumber === slideNumber);')
    .join('const selectedRef = parsedRefs.find((item) => item.versionId === active.id && item.slideNumber === slideNumber);');

  source = source.replace(
    'const processName = uploadFile.name.replace(/\\.[^.]+$/, "").replace(/\\s*\\(\\d+\\)\\s*$/, "").trim() || "Process";',
    'const processName = uploadFile.name.replace(/\\.[^.]+$/, "").replace(/(?:\\s*\\(\\d+\\))+\\s*$/, "").trim() || "Process";',
  );
  source = source.replace(
    'const autoName = uploadFile ? uploadFile.name.replace(/\\.[^.]+$/, "").replace(/\\s*\\(\\d+\\)\\s*$/, "").trim() : "-";',
    'const autoName = uploadFile ? uploadFile.name.replace(/\\.[^.]+$/, "").replace(/(?:\\s*\\(\\d+\\))+\\s*$/, "").trim() : "-";',
  );
  source = source.replace(
    'const attachToSeed = current.id === BUILTIN_VERSION.id && processName === BUILTIN_VERSION.name && !processFileUrlV70(current.fileUrl);',
    'const attachToSeed = active.id === BUILTIN_VERSION.id && processNameKeyV84(processName) === processNameKeyV84(BUILTIN_VERSION.name) && !processFileUrlV70(active.fileUrl);',
  );
  source = source.replace('? formatProcessVersionV78(current.versionLabel)', '? formatProcessVersionV78(active.versionLabel)');
  source = source.replace('? current.versionLabel', '? active.versionLabel');

  const archiveOld = 'if (entry.id !== id && row?.status === "current") batch.set(entry.ref, { status: "archived" }, { merge: true });';
  const archiveNew = 'if (entry.id !== id && row?.status === "current" && processNameKeyV84(row?.name || row?.fileName || "Process") === processNameKeyV84(processName)) batch.set(entry.ref, { status: "archived" }, { merge: true });';
  if (!source.includes(archiveOld)) throw new Error("Process multi-file v84: global current archive rule missing");
  source = source.replace(archiveOld, archiveNew);

  source = source.replace(
    '      setUploadIndex(null);\n      onChange("");',
    '      setUploadIndex(null);\n      setSelectedProcessIdV84(id);',
  );

  const uploadPanelAnchor = '\n      {uploadOpen && !historical ? (';
  if (!source.includes(uploadPanelAnchor)) throw new Error("Process multi-file v84: upload panel anchor missing");
  const processChooser = `
      {!loading && processLibraryV84.length ? (
        <div className="border-b border-sky-100 bg-white/80 px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Process ที่ต้องการใช้</div>
          <select value={active.id} onChange={(event) => { setSelectedProcessIdV84(event.target.value); setPickerSlideNumber(0); setSlideQuery(""); }} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100">
            {processLibraryV84.map((item) => (
              <option key={item.id} value={item.id}>{item.name} · Version {formatProcessVersionV78(item.versionLabel)} · {item.slideCount} Slides</option>
            ))}
          </select>
          <div className="mt-1.5 text-[11px] font-semibold text-slate-500">เลือกได้หลายไฟล์ในเคสเดียว โดยสลับ Process แล้วเพิ่ม Slide ต่อได้ รายการที่เลือกไว้จะไม่หาย</div>
        </div>
      ) : null}
`;
  source = source.replace(uploadPanelAnchor, processChooser + uploadPanelAnchor);

  const selectedSlideLabel = '<div className="text-xs font-black text-[#155B83]">Slide {meta.slideNumber}</div>';
  if (source.includes(selectedSlideLabel)) {
    source = source.replace(selectedSlideLabel, '<div className="text-[10px] font-semibold text-slate-500">{meta.processName}</div>\n                      ' + selectedSlideLabel);
  }

  fs.writeFileSync(file, source);
  console.log("Applied multi-file Process Library and cross-file Slide references v84");
} else {
  console.log("Process Library multi-file v84 already applied");
}
