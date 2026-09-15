export function finalSignedPdfDateFormatPatch() {
  return {
    name: "final-signed-pdf-date-format",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/finalSignedPdfRenderer.ts")) return null;

      let next = code;
      const original = next;

      const oldFormatter = `function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}`;

      const newFormatter = `function normalizeGregorianYear(year: number) {
  if (year > 2400) return year - 543;
  if (year < 100) return 2000 + year;
  return year;
}

function formatDateOnly(value: string) {
  const text = String(value || "").trim();
  if (!text) return "-";

  const slashMatch = text.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})(?:\\s|$)/);
  if (slashMatch) {
    const day = String(Number(slashMatch[1])).padStart(2, "0");
    const month = String(Number(slashMatch[2])).padStart(2, "0");
    const year = normalizeGregorianYear(Number(slashMatch[3]));
    return day + "/" + month + "/" + String(year).padStart(4, "0");
  }

  const isoDateMatch = text.match(/^(\\d{4})-(\\d{2})-(\\d{2})(?:T|\\s|$)/);
  if (isoDateMatch) {
    return isoDateMatch[3] + "/" + isoDateMatch[2] + "/" + isoDateMatch[1];
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date).replace(",", "");
}`;

      next = next.replace(oldFormatter, newFormatter);
      next = next.replace(
        '{ value: item?.auditDate || "-", width: caseColWidths[1], fill, options:',
        '{ value: formatDateOnly(String(item?.auditDate || "")), width: caseColWidths[1], fill, options:'
      );

      return next === original ? null : { code: next, map: null };
    },
  };
}
