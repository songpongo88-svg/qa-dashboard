// PDF dates use the Gregorian calendar and Bangkok time. Slash-formatted
// values are already local DD/MM/YYYY; never pass them to Date's US parser.
const pad = (value: number) => String(value).padStart(2, "0");
const yearOf = (year: number) => year > 2400 ? year - 543 : year < 100 ? year + 2000 : year;
type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function localParts(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Parts | null {
  year = yearOf(year);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day ||
      hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return { year, month, day, hour, minute, second };
}

function partsOf(value: unknown): Parts | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "-") return null;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (slash) return localParts(+slash[3], +slash[2], +slash[1], +(slash[4] || 0), +(slash[5] || 0), +(slash[6] || 0));
  // Date-only fields and timestamps without an offset represent local values.
  const local = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/);
  if (local) return localParts(+local[1], +local[2], +local[3], +(local[4] || 0), +(local[5] || 0), +(local[6] || 0));
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000));
    return localParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
  }
  // Reject unsupported numeric formats rather than guessing their order.
  if (!(value instanceof Date) && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return null;
  const date = value instanceof Date ? value : new Date(raw);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", calendar: "gregory", numberingSystem: "latn",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value);
  return localParts(get("year"), get("month"), get("day"), get("hour"), get("minute"), get("second"));
}

function fallback(value: unknown, empty: string) {
  return value instanceof Date ? empty : String(value ?? "").trim() || empty;
}

export function formatPdfDate(value: unknown, empty = "-"): string {
  const p = partsOf(value);
  return p ? `${pad(p.day)}/${pad(p.month)}/${String(p.year).padStart(4, "0")}` : fallback(value, empty);
}

export function formatPdfDateTime(value: unknown, empty = "-"): string {
  const p = partsOf(value);
  return p ? `${pad(p.day)}/${pad(p.month)}/${String(p.year).padStart(4, "0")} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` : fallback(value, empty);
}

export function formatPdfDateOrTime(value: unknown, empty = "-"): string {
  return value instanceof Date || /[T\s,]\d{1,2}:\d{2}/.test(String(value ?? ""))
    ? formatPdfDateTime(value, empty) : formatPdfDate(value, empty);
}
