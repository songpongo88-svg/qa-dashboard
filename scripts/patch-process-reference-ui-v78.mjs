import fs from "node:fs";

const processFile = "src/processLibrary.tsx";
let source = fs.readFileSync(processFile, "utf8");
const marker = "// process-reference-version-search-sync-v78";

const replaceExact = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Process reference v78: missing ${label}`);
  source = source.replace(from, to);
};

if (!source.includes(marker)) {
  if (!source.includes("// process-reference-green-titles-pdf-v77")) {
    throw new Error("Process reference v78 requires v77 first");
  }

  source = source.replace(
    "// process-reference-green-titles-pdf-v77\n",
    "// process-reference-green-titles-pdf-v77\n" + marker + "\n",
  );

  const serializerAnchor = "export function serializeProcessReference(meta: ProcessReferenceMeta) {";
  if (!source.includes(serializerAnchor)) throw new Error("Process reference v78: serializer anchor missing");
  const versionHelper = `function formatProcessVersionV78(value: unknown) {\n  const pad = (part: number) => String(part).padStart(2, \"0\");\n  const formatDate = (date: Date) => \`${'${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}'}\`;\n  if (value instanceof Date && Number.isFinite(value.getTime())) return formatDate(value);\n  const raw = String(value ?? \"\").trim();\n  if (!raw) return \"-\";\n  const displayMatch = raw.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})(?:\\s+(\\d{2}):(\\d{2})(?::(\\d{2}))?)?$/);\n  if (displayMatch) return \`${'${displayMatch[1]}/${displayMatch[2]}/${displayMatch[3]} ${displayMatch[4] || "00"}:${displayMatch[5] || "00"}:${displayMatch[6] || "00"}'}\`;\n  const compactMatch = raw.match(/^(\\d{4})[.-](\\d{2})[.-](\\d{2})(?:[-T ](\\d{2})[.:](\\d{2})(?:[.:](\\d{2}))?)?$/);\n  if (compactMatch) return \`${'${compactMatch[3]}/${compactMatch[2]}/${compactMatch[1]} ${compactMatch[4] || "00"}:${compactMatch[5] || "00"}:${compactMatch[6] || "00"}'}\`;\n  const parsed = new Date(raw);\n  if (Number.isFinite(parsed.getTime())) return formatDate(parsed);\n  return raw;\n}\n\n`;
  source = source.replace(serializerAnchor, versionHelper + serializerAnchor);

  replaceExact(
    '    `Version: ${clean(meta.versionLabel)}`,',
    '    `Version: ${clean(formatProcessVersionV78(meta.versionLabel))}`,',
    "serialized Version formatting",
  );

  replaceExact(
    '      const versionLabel = uploadedAt.slice(0, 16).replace(/-/g, ".").replace("T", "-").replace(":", ".");',
    '      const versionLabel = formatProcessVersionV78(new Date());',
    "new upload Version formatting",
  );

  replaceExact(
    '          <div className="mt-1 text-sm font-black text-slate-950">{loading ? "กำลังโหลด..." : active.name + " · v" + active.versionLabel}</div>',
    '          <div className="mt-1 text-sm font-black text-slate-950">{loading ? "กำลังโหลด..." : active.name}</div>\n          {!loading ? <div className="mt-0.5 text-[11px] font-semibold text-slate-500">Version: {formatProcessVersionV78(active.versionLabel)}</div> : null}',
    "Process Library Version display",
  );

  replaceExact(
    '<div className="truncate text-sm font-black text-slate-950">{active.name} · v{active.versionLabel}</div>\n                  <div className="text-xs font-semibold text-slate-500">{active.slideCount} slides</div>',
    '<div className="truncate text-sm font-black text-slate-950">{active.name}</div>\n                  <div className="mt-0.5 text-xs font-semibold text-slate-500">Version: {formatProcessVersionV78(active.versionLabel)}</div>\n                  <div className="text-xs font-semibold text-slate-500">{active.slideCount} slides</div>',
    "picker Version display",
  );

  const modalVersionOld = '<div className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">{meta.processName} · v{meta.versionLabel}</div>';
  const modalVersionNew = '<div className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">{meta.processName} · Version: {formatProcessVersionV78(meta.versionLabel)}</div>';
  if (!source.includes(modalVersionOld)) throw new Error("Process reference v78: viewer Version display missing");
  source = source.split(modalVersionOld).join(modalVersionNew);

  const processNameDisplay = '<div className="mt-0.5 truncate text-sm font-black text-slate-950" title={first.processName}>{first.processName}</div>';
  replaceExact(
    processNameDisplay,
    processNameDisplay + '\n        <div className="mt-1 text-xs font-semibold text-slate-500">Version: {formatProcessVersionV78(first.versionLabel)}</div>',
    "saved Process Version display",
  );

  const filteredOld = `  const filteredSlides = active.slideTitles
    .map((title, index) => {
      const slideNumber = index + 1;
      const originalTitle = String(title || ("Slide " + slideNumber));
      const selectedRef = parsedRefs.find((item) => item.slideNumber === slideNumber);
      const typedTitle = selectedRef?.step && selectedRef.step !== "ทั้งสไลด์" ? String(selectedRef.step).trim() : "";
      return { slideNumber, title: typedTitle || originalTitle, isCustom: Boolean(typedTitle) };
    })
    .filter((item) => {
      const query = slideQuery.trim().toLowerCase();
      if (!query) return true;
      return String(item.slideNumber).includes(query) || item.title.toLowerCase().includes(query);
    });
`;
  const filteredNew = `  const filteredSlides = active.slideTitles
    .map((title, index) => {
      const slideNumber = index + 1;
      const originalTitle = String(title || ("Slide " + slideNumber));
      const selectedRef = parsedRefs.find((item) => item.slideNumber === slideNumber);
      const typedTitle = selectedRef?.step && selectedRef.step !== "ทั้งสไลด์"
        ? String(selectedRef.step).trim()
        : (selectedRef?.slideTitle ? String(selectedRef.slideTitle).trim() : "");
      return { slideNumber, title: typedTitle || originalTitle, isCustom: Boolean(typedTitle) };
    })
    .filter((item) => {
      const tokens = slideQuery.trim().toLowerCase().split(/[\\s,;]+/).filter(Boolean);
      if (!tokens.length) return true;
      const slideText = String(item.slideNumber);
      const titleText = item.title.toLowerCase();
      return tokens.some((token) => (/^\\d+$/.test(token) ? slideText === token : titleText.includes(token) || slideText === token));
    });
`;
  replaceExact(filteredOld, filteredNew, "multi-slide picker search");

  replaceExact(
    'placeholder="ค้นหาเลข Slide หรือชื่อหัวข้อ..."',
    'placeholder="ค้นหาได้หลาย Slide เช่น 97 99 หรือ 97,99..."',
    "picker search placeholder",
  );

  const updateTitleOld = `  const updateDisplayTitle = (slideNumber: number, nextTitle: string) => {
    writeRefs(parsedRefs.map((item) => item.slideNumber === slideNumber ? { ...item, step: nextTitle } : item));
  };
`;
  const updateTitleNew = `  const updateDisplayTitle = (slideNumber: number, nextTitle: string) => {
    writeRefs(parsedRefs.map((item) => item.slideNumber === slideNumber ? { ...item, step: nextTitle, slideTitle: nextTitle.trim() || item.slideTitle } : item));
  };

  const persistDisplayTitleV78 = (slideNumber: number, nextTitle: string) => {
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
`;
  replaceExact(updateTitleOld, updateTitleNew, "custom title persistence handler");

  const inputOld = 'onChange={(event) => updateDisplayTitle(meta.slideNumber, event.target.value)} placeholder="พิมพ์ชื่อหัวข้อที่ต้องการแสดง..."';
  const inputNew = 'onChange={(event) => updateDisplayTitle(meta.slideNumber, event.target.value)} onBlur={(event) => persistDisplayTitleV78(meta.slideNumber, event.currentTarget.value)} placeholder="พิมพ์ชื่อหัวข้อที่ต้องการแสดง..."';
  replaceExact(inputOld, inputNew, "custom title onBlur persistence");

  fs.writeFileSync(processFile, source);
  console.log("Applied Process Version date/time, title sync, and multi-slide search v78");
} else {
  console.log("Process reference Version/search/title sync v78 already applied");
}

const pdfFile = "src/caseDetailOfficialPdf.ts";
let pdfSource = fs.readFileSync(pdfFile, "utf8");
const pdfMarker = "// process-reference-version-format-v78";
if (!pdfSource.includes(pdfMarker)) {
  if (!pdfSource.includes("// process-reference-clean-pdf-v77")) throw new Error("Process reference PDF v78 requires v77 first");
  const pdfAnchor = 'function formatProcessReferenceForPdfV77(value: unknown) {';
  if (!pdfSource.includes(pdfAnchor)) throw new Error("Process reference v78: PDF formatter anchor missing");
  const pdfHelper = `${pdfMarker}\nfunction formatProcessVersionPdfV78(value: unknown) {\n  const raw = String(value ?? \"\").trim();\n  if (!raw) return \"-\";\n  const displayMatch = raw.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})(?:\\s+(\\d{2}):(\\d{2})(?::(\\d{2}))?)?$/);\n  if (displayMatch) return \`${'${displayMatch[1]}/${displayMatch[2]}/${displayMatch[3]} ${displayMatch[4] || "00"}:${displayMatch[5] || "00"}:${displayMatch[6] || "00"}'}\`;\n  const compactMatch = raw.match(/^(\\d{4})[.-](\\d{2})[.-](\\d{2})(?:[-T ](\\d{2})[.:](\\d{2})(?:[.:](\\d{2}))?)?$/);\n  if (compactMatch) return \`${'${compactMatch[3]}/${compactMatch[2]}/${compactMatch[1]} ${compactMatch[4] || "00"}:${compactMatch[5] || "00"}:${compactMatch[6] || "00"}'}\`;\n  return raw;\n}\n\n`;
  pdfSource = pdfSource.replace(pdfAnchor, pdfHelper + pdfAnchor);
  const versionLine = '  if (first.version) lines.push("Version: " + first.version);';
  if (!pdfSource.includes(versionLine)) throw new Error("Process reference v78: PDF Version line missing");
  pdfSource = pdfSource.replace(versionLine, '  if (first.version) lines.push("Version: " + formatProcessVersionPdfV78(first.version));');
  fs.writeFileSync(pdfFile, pdfSource);
  console.log("Applied dd/mm/yyyy hh:mm:ss Process Version in PDF v78");
} else {
  console.log("Process reference PDF Version v78 already applied");
}
