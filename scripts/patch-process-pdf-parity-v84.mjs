import fs from "node:fs";

const file = "src/caseDetailOfficialPdf.ts";
let source = fs.readFileSync(file, "utf8");
const marker = "// process-reference-pdf-parity-v84";

if (!source.includes(marker)) {
  if (!source.includes("// process-reference-clean-pdf-v77")) {
    throw new Error("Process PDF parity v84 requires Process PDF v77 first");
  }

  const anchor = 'function formatDescriptionText(value: unknown, fallback = "-") {';
  if (!source.includes(anchor)) throw new Error("Process PDF parity v84: formatter anchor missing");

  const helper = `${marker}
function formatProcessReferenceForPdfV84(value: unknown) {
  const raw = safeMultiline(value, "");
  if (!raw) return "";

  // Legacy evaluations already store the exact visible Process block in Thai.
  // Preserve it verbatim instead of collapsing it to only the Slide number.
  if (/^(?:ไฟล์|Slide|ข้อ|Tag)\s*:/im.test(raw) && !/^Process\s*:/im.test(raw)) {
    return raw;
  }

  const blocks = raw
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
  if (!refs.length || refs.every((ref) => !ref.process && !ref.version && !ref.slide)) return raw;

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
  return lines.join("\n");
}

`;
  source = source.replace(anchor, helper + anchor);

  const call = 'const processReferenceText = formatProcessReferenceForPdfV77(caseItem.processReference);';
  if (!source.includes(call)) throw new Error("Process PDF parity v84: Process Reference formatter call missing");
  source = source.replace(call, 'const processReferenceText = formatProcessReferenceForPdfV84(caseItem.processReference);');

  fs.writeFileSync(file, source);
  console.log("Applied Case PDF Process Reference parity v84");
} else {
  console.log("Case PDF Process Reference parity v84 already applied");
}
