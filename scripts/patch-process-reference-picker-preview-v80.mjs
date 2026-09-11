import fs from "node:fs";

const processFile = "src/processLibrary.tsx";
let source = fs.readFileSync(processFile, "utf8");
const marker = "// process-reference-picker-preview-title-sync-v80";

if (!source.includes(marker)) {
  if (!source.includes("// process-reference-bangkok-time-v79")) {
    throw new Error("Process reference v80 requires v79 first");
  }

  source = source.replace(
    "// process-reference-bangkok-time-v79\n",
    "// process-reference-bangkok-time-v79\n" + marker + "\n",
  );

  const persistPattern = /  const persistDisplayTitleV78 = \(slideNumber: number, nextTitle: string\) => \{[\s\S]*?\n  \};\n/;
  if (!persistPattern.test(source)) throw new Error("Process reference v80: title persistence handler missing");

  const persistReplacement = `  const persistDisplayTitleV78 = (slideNumber: number, nextTitle: string) => {
    const cleanTitle = nextTitle.trim();
    if (historical || !cleanTitle || !active.id) return;
    const nextTitles = [...active.slideTitles];
    while (nextTitles.length < active.slideCount) nextTitles.push("Slide " + (nextTitles.length + 1));
    nextTitles[Math.max(0, slideNumber - 1)] = cleanTitle;
    setCurrent((row) => row.id === active.id ? { ...row, slideTitles: nextTitles } : row);
    const services = firebaseServices();
    if (!services) return;
    const batch = writeBatch(services.db);
    batch.set(doc(services.db, PROCESS_COLLECTION, active.id), { slideTitles: nextTitles }, { merge: true });
    void batch.commit().catch((error) => console.error("Save custom Process slide title failed", error));
  };

  // Backfill custom titles already stored in the current case into the Process Version.
  // This also repairs titles edited before global title persistence was introduced.
  useEffect(() => {
    if (historical || !active.id || !parsedRefs.length) return;
    const nextTitles = [...active.slideTitles];
    while (nextTitles.length < active.slideCount) nextTitles.push("Slide " + (nextTitles.length + 1));
    let changed = false;

    parsedRefs.forEach((item) => {
      if (item.versionId !== active.id) return;
      const customTitle = item.step && item.step !== "ทั้งสไลด์"
        ? String(item.step).trim()
        : String(item.slideTitle || "").trim();
      const index = item.slideNumber - 1;
      if (!customTitle || index < 0 || index >= active.slideCount) return;
      if (nextTitles[index] === customTitle) return;
      nextTitles[index] = customTitle;
      changed = true;
    });

    if (!changed) return;
    setCurrent((row) => row.id === active.id ? { ...row, slideTitles: nextTitles } : row);
    const services = firebaseServices();
    if (!services) return;
    const batch = writeBatch(services.db);
    batch.set(doc(services.db, PROCESS_COLLECTION, active.id), { slideTitles: nextTitles }, { merge: true });
    void batch.commit().catch((error) => console.error("Backfill custom Process slide titles failed", error));
  }, [historical, active.id, active.slideCount, active.slideTitles, parsedRefs]);
`;

  source = source.replace(persistPattern, persistReplacement);

  const pickerRowPattern = /                return \(\n                  <button key=\{item\.slideNumber\} type="button" disabled=\{alreadyUsed\} onClick=\{\(\) => setPickerSlideNumber\(item\.slideNumber\)\} className=\{rowClass\}>[\s\S]*?                  <\/button>\n                \);/;
  if (!pickerRowPattern.test(source)) throw new Error("Process reference v80: picker row missing");

  const pickerRowReplacement = `                const previewMetaForItem = {
                  ...fromVersion(active, item.slideNumber, item.title),
                  slideTitle: item.title,
                  step: item.title,
                };
                return (
                  <div key={item.slideNumber} className={rowClass}>
                    <button type="button" disabled={alreadyUsed} onClick={() => setPickerSlideNumber(item.slideNumber)} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed">
                      <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-gradient-to-br from-[#155B83] to-[#6F8B67] text-[10px] font-black text-white shadow-sm">Slide {item.slideNumber}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black text-[#155B83]">Slide {item.slideNumber}</div>
                        <div className={"truncate text-sm " + (item.isCustom ? "font-normal text-emerald-700" : "font-bold text-slate-800")} title={item.title}>{item.title}</div>
                      </div>
                    </button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); setPreviewMeta(previewMetaForItem); }} className="h-9 shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-3 text-[11px] font-black text-[#155B83] transition hover:bg-sky-100" title="ดูสไลด์ก่อนเลือก">Preview</button>
                    <button type="button" disabled={alreadyUsed} onClick={() => setPickerSlideNumber(item.slideNumber)} className={"h-5 w-5 shrink-0 rounded-full border-2 " + (selected ? "border-sky-600 bg-sky-600 shadow-[inset_0_0_0_4px_white]" : "border-slate-300 bg-white") + (alreadyUsed ? " cursor-not-allowed" : "")} aria-label={alreadyUsed ? "Slide นี้ถูกเลือกแล้ว" : "เลือก Slide " + item.slideNumber} />
                  </div>
                );`;

  source = source.replace(pickerRowPattern, pickerRowReplacement);

  fs.writeFileSync(processFile, source);
  console.log("Applied durable Process slide title sync and picker Preview v80");
} else {
  console.log("Process reference picker Preview/title sync v80 already applied");
}

await import("./patch-process-reference-case-title-repair-v81.mjs");
