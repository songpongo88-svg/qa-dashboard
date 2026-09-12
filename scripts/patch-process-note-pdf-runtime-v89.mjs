import fs from "node:fs";

const file = "src/caseDetailOfficialPdf.ts";
let source = fs.readFileSync(file, "utf8");
const marker = "// process-reference-note-pdf-runtime-v89";

if (!source.includes(marker)) {
  if (!source.includes("// process-reference-sticky-note-pdf-v87")) {
    throw new Error("Process note PDF runtime v89 requires Process note PDF v87 first");
  }

  const functionStart = source.indexOf("function formatProcessReferenceForPdfV84(value: unknown) {");
  if (functionStart < 0) throw new Error("Process note PDF runtime v89: Process formatter start missing");

  const nextFunctionAnchor = "\n\nfunction formatDescriptionText";
  const functionEnd = source.indexOf(nextFunctionAnchor, functionStart);
  if (functionEnd < 0) throw new Error("Process note PDF runtime v89: Process formatter end missing");

  const replacement = String.raw`function formatProcessReferenceForPdfV84(value: unknown) {
  const raw = safeMultiline(value, "");
  if (!raw) return "";

  // process-reference-no-process-pdf-v86
  // process-reference-sticky-note-pdf-v87
  ${marker}
  // Parse the note once at function scope so every return path is safe.
  const noteMarkerV89 = "---MANUAL-PROCESS-NOTE---";
  const noteIndexV89 = raw.indexOf(noteMarkerV89);
  const processNoteV89 = noteIndexV89 >= 0
    ? raw.slice(noteIndexV89 + noteMarkerV89.length).replace(/^\r?\n/, "").trim()
    : "";
  const rawWithoutNoteV89 = noteIndexV89 >= 0 ? raw.slice(0, noteIndexV89).trimEnd() : raw;

  if (/^Process:\s*ยังไม่มี Process รองรับ\s*$/im.test(rawWithoutNoteV89)) {
    return [
      "Process: ยังไม่มี Process รองรับ",
      processNoteV89 ? "รายละเอียด: " + processNoteV89 : "รายละเอียด: -",
    ].join("\n");
  }

  // Legacy evaluations already store the exact visible Process block in Thai.
  // Preserve it while appending the saved note, if any.
  if (/^(?:ไฟล์|Slide|ข้อ|Tag)\s*:/im.test(rawWithoutNoteV89) && !/^Process\s*:/im.test(rawWithoutNoteV89)) {
    return processNoteV89
      ? rawWithoutNoteV89 + "\n\nโน้ตเพิ่มเติม: " + processNoteV89
      : rawWithoutNoteV89;
  }

  const blocks = rawWithoutNoteV89
    .split(/\r?\n\s*---PROCESS-REFERENCE---\s*\r?\n/i)
    .map((block) => block.trim())
    .filter(Boolean);
  const refs = blocks.map((block) => ({
    process: processReferenceFieldV77(block, "Process"),
    version: processReferenceFieldV77(block, "Version"),
    slide: processReferenceFieldV77(block, "Slide"),
    title: processReferenceFieldV77(block, "Title"),
    step: processReferenceFieldV77(block, "Step"),
  }));

  if (!refs.length || refs.every((ref) => !ref.process && !ref.version && !ref.slide)) {
    return processNoteV89
      ? rawWithoutNoteV89 + "\n\nโน้ตเพิ่มเติม: " + processNoteV89
      : rawWithoutNoteV89;
  }

  const lines: string[] = [];
  let previousGroup = "";
  refs.forEach((ref) => {
    const groupKey = [ref.process, ref.version].join("|");
    if (groupKey !== previousGroup) {
      if (lines.length) lines.push("");
      if (ref.process) lines.push("ไฟล์: " + ref.process);
      if (ref.version) lines.push("Version: " + formatProcessVersionPdfV78(ref.version));
      previousGroup = groupKey;
    }
    if (ref.slide) lines.push("Slide: " + ref.slide);
    const displayTitle = ref.step && ref.step !== "ทั้งสไลด์" ? ref.step : ref.title;
    if (displayTitle) lines.push("ข้อ: " + displayTitle);
    if (ref.step && ref.step !== "ทั้งสไลด์" && ref.title && ref.step !== ref.title && !/^Slide\s+\d+$/i.test(ref.title)) {
      lines.push("ชื่อเดิมในไฟล์: " + ref.title);
    }
  });

  if (processNoteV89) {
    if (lines.length) lines.push("");
    lines.push("โน้ตเพิ่มเติม: " + processNoteV89);
  }
  return lines.join("\n");
}`;

  source = source.slice(0, functionStart) + replacement + source.slice(functionEnd);
  fs.writeFileSync(file, source);
  console.log("Applied Process note PDF runtime scope fix v89");
} else {
  console.log("Process note PDF runtime scope fix v89 already applied");
}
