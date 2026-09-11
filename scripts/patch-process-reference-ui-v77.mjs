import fs from "node:fs";

const processFile = "src/processLibrary.tsx";
let source = fs.readFileSync(processFile, "utf8");
const marker = "// process-reference-green-titles-pdf-v77";

const replaceExact = (from, to, label) => {
  if (!source.includes(from)) throw new Error(`Process reference v77: missing ${label}`);
  source = source.replace(from, to);
};

if (!source.includes(marker)) {
  if (!source.includes("// process-reference-pinned-minimize-eager-media-v76")) {
    throw new Error("Process reference v77 requires v76 first");
  }

  source = source.replace(
    "// process-reference-pinned-minimize-eager-media-v76\n",
    "// process-reference-pinned-minimize-eager-media-v76\n" + marker + "\n",
  );

  replaceExact(
`  const filteredSlides = active.slideTitles
    .map((title, index) => ({ slideNumber: index + 1, title: String(title || ("Slide " + (index + 1))) }))
    .filter((item) => {
      const query = slideQuery.trim().toLowerCase();
      if (!query) return true;
      return String(item.slideNumber).includes(query) || item.title.toLowerCase().includes(query);
    });
`,
`  const filteredSlides = active.slideTitles
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
`,
    "custom-title picker data",
  );

  replaceExact(
    'className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 read-only:bg-slate-100"',
    'className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-emerald-700 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 read-only:bg-slate-100"',
    "selected custom title style",
  );

  replaceExact(
    '<div className="truncate text-sm font-bold text-slate-800" title={item.title}>{item.title}</div>',
    '<div className={"truncate text-sm " + (item.isCustom ? "font-normal text-emerald-700" : "font-bold text-slate-800")} title={item.title}>{item.title}</div>',
    "picker title style",
  );

  replaceExact(
    '<div className="mt-0.5 text-sm font-black text-slate-950" title={displayTitle}>{displayTitle}</div>',
    '<div className="mt-0.5 text-sm font-normal text-emerald-700" title={displayTitle}>{displayTitle}</div>',
    "Process display title style",
  );

  const modalTitleOld = '<div className="truncate text-sm font-black text-slate-950">Slide {meta.slideNumber} · {displayTitle}</div>';
  const modalTitleNew = '<div className="truncate text-sm text-slate-900"><span className="font-semibold">Slide {meta.slideNumber}</span><span className="text-slate-400"> · </span><span className="font-normal text-emerald-700">{displayTitle}</span></div>';
  const modalTitleCount = source.split(modalTitleOld).length - 1;
  if (modalTitleCount < 2) throw new Error(`Process reference v77: expected viewer titles, found ${modalTitleCount}`);
  source = source.split(modalTitleOld).join(modalTitleNew);

  fs.writeFileSync(processFile, source);
  console.log("Applied green non-bold custom Process titles and picker title sync v77");
} else {
  console.log("Process reference green title UI v77 already applied");
}

const pdfFile = "src/caseDetailOfficialPdf.ts";
let pdfSource = fs.readFileSync(pdfFile, "utf8");
const pdfMarker = "// process-reference-clean-pdf-v77";

if (!pdfSource.includes(pdfMarker)) {
  const helperAnchor = 'function formatDescriptionText(value: unknown, fallback = "-") {';
  if (!pdfSource.includes(helperAnchor)) throw new Error("Process reference v77: PDF helper anchor missing");

  const helper = `${pdfMarker}\nfunction processReferenceFieldV77(block: string, key: string) {\n  const prefix = key + ":";\n  const line = block.split(/\\r?\\n/).find((row) => row.trim().startsWith(prefix));\n  return line ? line.trim().slice(prefix.length).trim() : "";\n}\n\nfunction formatProcessReferenceForPdfV77(value: unknown) {\n  const raw = safeMultiline(value, "");\n  if (!raw) return "";\n  const blocks = raw\n    .split(/\\r?\\n\\s*---PROCESS-REFERENCE---\\s*\\r?\\n/i)\n    .map((block) => block.trim())\n    .filter(Boolean);\n  const refs = blocks.map((block) => ({\n    process: processReferenceFieldV77(block, "Process"),\n    version: processReferenceFieldV77(block, "Version"),\n    slide: processReferenceFieldV77(block, "Slide"),\n    title: processReferenceFieldV77(block, "Title"),\n    step: processReferenceFieldV77(block, "Step"),\n  }));\n  const first = refs[0];\n  if (!first || (!first.process && !first.version && !first.slide)) return raw;\n\n  const lines: string[] = [];\n  if (first.process) lines.push("Process: " + first.process);\n  if (first.version) lines.push("Version: " + first.version);\n  refs.forEach((ref) => {\n    if (ref.slide) lines.push("Slide " + ref.slide);\n    const displayTitle = ref.step && ref.step !== "ทั้งสไลด์" ? ref.step : ref.title;\n    if (displayTitle) lines.push(displayTitle);\n  });\n  return lines.join("\\n");\n}\n\n`;
  pdfSource = pdfSource.replace(helperAnchor, helper + helperAnchor);

  const processBlockPattern = /    const processReferenceText = safeMultiline\(caseItem\.processReference, ""\);\n    if \(processReferenceText\) \{[\s\S]*?\n    \}/;
  if (!processBlockPattern.test(pdfSource)) throw new Error("Process reference v77: PDF Process Reference row missing");
  pdfSource = pdfSource.replace(
    processBlockPattern,
`    const processReferenceText = formatProcessReferenceForPdfV77(caseItem.processReference);
    if (processReferenceText) {
      drawWideRichTextRow({
        labelText: "Process\\nReference",
        text: processReferenceText,
        size: CASE_DESCRIPTION_TEXT_SIZE,
        leading: CASE_DESCRIPTION_LINE_SPACING,
        minH: 14,
        padY: 5,
      });
    }`,
  );

  fs.writeFileSync(pdfFile, pdfSource);
  console.log("Applied clean Process Reference layout in official case PDF v77");
} else {
  console.log("Clean Process Reference PDF v77 already applied");
}
