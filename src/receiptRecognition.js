// Suggestions from actual OCR text. Missing or ambiguous values stay empty.
// This module is shared by the prefill UI and the server's independent review.
const pad = value => String(value).padStart(2, "0");
const clean = value => String(value || "").normalize("NFKC").replace(/[๐-๙]/g, char => String(char.charCodeAt(0) - 3664)).replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\r/g, "");
const unique = values => [...new Set(values)];
const merchantPatterns = {
  "punthai-65": /พันธุ์?ไทย|พันธุไท|PUN\s*THAI/i,
  "amazon-55": /AMAZON|อเมซอน|อเมซ่อน/i,
  "seven-100": /7[\s-]*(?:ELEVEN|11)|เซเว่น|CP\s*ALL/i,
};
export function matchesReceiptMerchant(text, rewardId) { return Boolean(merchantPatterns[rewardId]?.test(clean(text))); }
function yearNumber(value) {
  const year = Number(value);
  if (year >= 2400) return year - 543;
  if (year < 100) return year >= 40 ? 2500 + year - 543 : 2000 + year;
  return year;
}
function dateTime(year, month, day, clock) {
  const y = yearNumber(year), m = Number(month), d = Number(day);
  let h = Number(clock[1]);
  const minute = Number(clock[2]), second = Number(clock[3] || 0), ampm = clock[4]?.toUpperCase();
  if (ampm) { if (h < 1 || h > 12) return ""; h = h % 12 + (ampm === "PM" ? 12 : 0); }
  if (y < 2000 || y > 2100 || h > 23 || minute > 59 || second > 59) return "";
  const check = new Date(Date.UTC(y, m - 1, d, h, minute, second));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return "";
  return `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(minute)}${clock[3] !== undefined ? ":" + pad(second) : ""}+07:00`;
}
const monthNames = [
  ["มกราคม", "ม.ค.", "JAN"], ["กุมภาพันธ์", "ก.พ.", "FEB"], ["มีนาคม", "มี.ค.", "MAR"],
  ["เมษายน", "เม.ย.", "APR"], ["พฤษภาคม", "พ.ค.", "MAY"], ["มิถุนายน", "มิ.ย.", "JUN"],
  ["กรกฎาคม", "ก.ค.", "JUL"], ["สิงหาคม", "ส.ค.", "AUG"], ["กันยายน", "ก.ย.", "SEP"],
  ["ตุลาคม", "ต.ค.", "OCT"], ["พฤศจิกายน", "พ.ย.", "NOV"], ["ธันวาคม", "ธ.ค.", "DEC"],
];
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const monthExpression = monthNames.flat().sort((a, b) => b.length - a.length).map(escape).join("|");
function readDateTime(text) {
  const values = [];
  const patterns = [
    { pattern: /\b(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})\b/g, order: "ymd" },
    { pattern: /\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{4}|\d{2})\b/g, order: "dmy" },
    { pattern: new RegExp("(\\d{1,2})\\s*(" + monthExpression + ")\\s*(\\d{4}|\\d{2})", "gi"), order: "named" },
  ];
  for (const { pattern, order } of patterns) {
    for (const match of text.matchAll(pattern)) {
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      const end = text.indexOf("\n", match.index + match[0].length);
      const line = text.slice(lineStart, end < 0 ? text.length : end);
      if (/หมดอายุ|EXPIR|VALID UNTIL|BEST BEFORE/i.test(line)) continue;
      const clockPattern = /\b(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?\s*(AM|PM)?\b/i;
      let clock = line.match(clockPattern);
      if (!clock) {
        const nextLine = text.slice(end + 1).split("\n")[0] || "";
        // A clock on the next line must be explicitly labelled as the receipt time.
        if (end >= 0 && /เวลา|TIME/i.test(nextLine)) clock = nextLine.match(clockPattern);
      }
      if (!clock) continue;
      const month = order === "named" ? monthNames.findIndex(names => names.some(name => name.toUpperCase() === match[2].toUpperCase())) + 1 : match[2];
      const value = order === "ymd" ? dateTime(match[1], month, match[3], clock) : dateTime(match[3], month, match[1], clock);
      if (value) values.push(value);
    }
  }
  const found = unique(values);
  return found.length === 1 ? found[0] : "";
}
function readReceiptNumber(lines) {
  const values = [];
  const label = /(?:เลขที่\s*(?:ใบเสร็จ(?:รับเงิน)?|เอกสาร)|ใบเสร็จ(?:รับเงิน)?\s*เลขที่|(?:TAX\s*INV(?:OICE)?\s*[/&]?\s*)?RECEIPT\s*(?:NO\.?|NUMBER|#)|(?:BILL|INV(?:OICE)?|RCPT)\s*(?:NO\.?|NUMBER|#)|เลขที่บิล)/i;
  for (let i = 0; i < lines.length; i++) {
    const found = lines[i].match(label);
    if (!found) continue;
    const tail = lines[i].slice(found.index + found[0].length).replace(/^[\s:#.=-]+/, "") || lines[i + 1] || "";
    const value = tail.match(/^([A-Z0-9][A-Z0-9_-]{3,69})(?=\s|$)/i)?.[1];
    if (value) values.push(value.toUpperCase());
  }
  const found = unique(values);
  if (found.length) return found.length === 1 ? found[0] : "";
  // 7-Eleven prints its canonical receipt ID as R#<number>P<register>.
  // TID and the phone/store numbers are deliberately not candidates.
  const registerIds = unique([...lines.join("\n").matchAll(/\bR\s*#\s*(\d{4,20})(?=P\d|\s|$)/gi)].map(match => match[1]));
  return registerIds.length === 1 ? registerIds[0] : "";
}
function readTotal(lines) {
  const totals = [];
  const labels = [
    { pattern: /(?:ยอด(?:รวม)?ส[ุู]ทธิ|รวมทั้งสิ้น|ยอด(?:ที่ต้อง)?ชำระ|GRAND\s*TOTAL|NET\s*TOTAL|AMOUNT\s*DUE)/i, priority: 2 },
    { pattern: /(?:รวมเงิน|รวมเป็นเงิน|รวม(?:\s*\(บาท\))?|\bTOTAL\b)/i, priority: 1 },
  ];
  for (let i = 0; i < lines.length; i++) {
    if (/SUB\s*TOTAL|ส่วนลด|DISCOUNT|เงินทอน|CHANGE|TENDERED|RECEIVED|^\s*(?:VAT|ภาษี|รับเงิน|เงินสด)/i.test(lines[i])) continue;
    for (const { pattern, priority } of labels) {
      const match = lines[i].match(pattern);
      if (!match) continue;
      const tail = (lines[i].slice(match.index + match[0].length).trim() || lines[i + 1] || "").replace(/^\s*\d+\s*(?:ชิ้น|ชั้น|ชิน|ชน|รายการ|ITEMS?)\s*/i, "");
      const numbers = [...tail.matchAll(/(?:^|[^\d.\-])(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:\.\d{2})?)(?=\s|บาท|THB|฿|$)/gi)];
      if (numbers.length !== 1 || /%/.test(tail)) continue;
      const value = Number(numbers[0][1].replace(/,/g, ""));
      if (value > 0 && value <= 30000) totals.push({ value, priority });
      break;
    }
  }
  const priority = Math.max(0, ...totals.map(value => value.priority));
  const found = unique(totals.filter(value => value.priority === priority).map(value => value.value));
  return found.length === 1 ? found[0] : null;
}
export function parseReceiptText(rawText, rewardId = "") {
  const text = clean(rawText).slice(0, 12000);
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  const receiptNumber = readReceiptNumber(lines), receiptAt = readDateTime(text), amountTHB = readTotal(lines);
  const missing = [!receiptNumber && "เลขที่ใบเสร็จ", !receiptAt && "วันและเวลา", amountTHB === null && "ยอดชำระ"].filter(Boolean);
  return { receiptNumber, receiptAt, amountTHB, merchantMatched: matchesReceiptMerchant(text, rewardId), missing };
}
export function bangkokDateTimeInput(iso) {
  const value = new Date(iso);
  if (!Number.isFinite(value.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value);
  const get = key => parts.find(part => part.type === key)?.value;
  const hasSeconds = /T\d{2}:\d{2}:\d{2}/.test(iso);
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}${hasSeconds ? ":" + get("second") : ""}`;
}
