import fs from "node:fs";

const processFile = "src/processLibrary.tsx";
let source = fs.readFileSync(processFile, "utf8");
const marker = "// process-reference-bangkok-time-v79";

if (!source.includes(marker)) {
  if (!source.includes("// process-reference-version-search-sync-v78")) {
    throw new Error("Process reference v79 requires v78 first");
  }

  source = source.replace(
    "// process-reference-version-search-sync-v78\n",
    "// process-reference-version-search-sync-v78\n" + marker + "\n",
  );

  const functionPattern = /function formatProcessVersionV78\(value: unknown\) \{[\s\S]*?\n\}\n\nexport function serializeProcessReference/;
  if (!functionPattern.test(source)) throw new Error("Process reference v79: Version formatter missing");

  const replacement = `function formatBangkokDateV79(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
  return \`${'${valueOf("day")}/${valueOf("month")}/${valueOf("year")} ${valueOf("hour")}:${valueOf("minute")}:${valueOf("second")}'}\`;
}

function formatProcessVersionV78(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return formatBangkokDateV79(value);
  const raw = String(value ?? "").trim();
  if (!raw) return "-";

  // Values already stored in DD/MM/YYYY HH:mm:ss are Bangkok-local display values.
  const displayMatch = raw.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})(?:\\s+(\\d{2}):(\\d{2})(?::(\\d{2}))?)?$/);
  if (displayMatch) {
    return \`${'${displayMatch[1]}/${displayMatch[2]}/${displayMatch[3]} ${displayMatch[4] || "00"}:${displayMatch[5] || "00"}:${displayMatch[6] || "00"}'}\`;
  }

  // Legacy version labels were built from toISOString(), so their clock time is UTC.
  // Convert those legacy YYYY.MM.DD-HH.mm labels to Asia/Bangkok (+07:00).
  const compactMatch = raw.match(/^(\\d{4})[.-](\\d{2})[.-](\\d{2})(?:[-T ](\\d{2})[.:](\\d{2})(?:[.:](\\d{2}))?)?$/);
  if (compactMatch) {
    if (!compactMatch[4]) return \`${'${compactMatch[3]}/${compactMatch[2]}/${compactMatch[1]} 00:00:00'}\`;
    const utcDate = new Date(Date.UTC(
      Number(compactMatch[1]),
      Number(compactMatch[2]) - 1,
      Number(compactMatch[3]),
      Number(compactMatch[4]),
      Number(compactMatch[5]),
      Number(compactMatch[6] || "0"),
    ));
    return formatBangkokDateV79(utcDate);
  }

  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) return formatBangkokDateV79(parsed);
  return raw;
}

export function serializeProcessReference`;

  source = source.replace(functionPattern, replacement);
  fs.writeFileSync(processFile, source);
  console.log("Applied Asia/Bangkok Process Version timezone conversion v79");
} else {
  console.log("Process reference Bangkok timezone v79 already applied");
}

const pdfFile = "src/caseDetailOfficialPdf.ts";
let pdfSource = fs.readFileSync(pdfFile, "utf8");
const pdfMarker = "// process-reference-bangkok-time-pdf-v79";

if (!pdfSource.includes(pdfMarker)) {
  if (!pdfSource.includes("// process-reference-version-format-v78")) {
    throw new Error("Process reference PDF v79 requires v78 first");
  }

  pdfSource = pdfSource.replace(
    "// process-reference-version-format-v78\n",
    "// process-reference-version-format-v78\n" + pdfMarker + "\n",
  );

  const pdfFunctionPattern = /function formatProcessVersionPdfV78\(value: unknown\) \{[\s\S]*?\n\}\n\nfunction formatProcessReferenceForPdfV77/;
  if (!pdfFunctionPattern.test(pdfSource)) throw new Error("Process reference PDF v79: Version formatter missing");

  const pdfReplacement = `function formatProcessVersionPdfV78(value: unknown) {
  const formatBangkok = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "00";
    return \`${'${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")}'}\`;
  };

  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const displayMatch = raw.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})(?:\\s+(\\d{2}):(\\d{2})(?::(\\d{2}))?)?$/);
  if (displayMatch) return \`${'${displayMatch[1]}/${displayMatch[2]}/${displayMatch[3]} ${displayMatch[4] || "00"}:${displayMatch[5] || "00"}:${displayMatch[6] || "00"}'}\`;

  const compactMatch = raw.match(/^(\\d{4})[.-](\\d{2})[.-](\\d{2})(?:[-T ](\\d{2})[.:](\\d{2})(?:[.:](\\d{2}))?)?$/);
  if (compactMatch) {
    if (!compactMatch[4]) return \`${'${compactMatch[3]}/${compactMatch[2]}/${compactMatch[1]} 00:00:00'}\`;
    const utcDate = new Date(Date.UTC(
      Number(compactMatch[1]),
      Number(compactMatch[2]) - 1,
      Number(compactMatch[3]),
      Number(compactMatch[4]),
      Number(compactMatch[5]),
      Number(compactMatch[6] || "0"),
    ));
    return formatBangkok(utcDate);
  }

  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? formatBangkok(parsed) : raw;
}

function formatProcessReferenceForPdfV77`;

  pdfSource = pdfSource.replace(pdfFunctionPattern, pdfReplacement);
  fs.writeFileSync(pdfFile, pdfSource);
  console.log("Applied Asia/Bangkok Process Version timezone in official PDF v79");
} else {
  console.log("Process reference PDF Bangkok timezone v79 already applied");
}

await import("./patch-process-reference-picker-preview-v80.mjs");
