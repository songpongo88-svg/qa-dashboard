export function formatReceiptTime(iso) {
  if (!Number.isFinite(Date.parse(iso))) return "ยังอ่านวันเวลาไม่ได้";
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    ...(/T\d{2}:\d{2}:\d{2}/.test(iso) ? { second: "2-digit" } : {}), hour12: false,
  });
}
function differenceLabel(milliseconds) {
  if (milliseconds < 60000) return "ไม่ถึง 1 นาที";
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return "ประมาณ " + minutes + " นาที";
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  if (hours < 24) return "ประมาณ " + hours + " ชั่วโมง" + (remainder ? " " + remainder + " นาที" : "");
  return "ประมาณ " + Math.floor(hours / 24) + " วัน" + (hours % 24 ? " " + hours % 24 + " ชั่วโมง" : "");
}
export function receiptTimeEligibility(receiptAt, activatedAt, now = Date.now()) {
  const receipt = Date.parse(receiptAt), activated = Date.parse(activatedAt);
  if (!Number.isFinite(receipt)) return { allowed: false, code: "unreadable", title: "ยังส่งใบเสร็จนี้ไม่ได้", reason: "ระบบยังอ่านวันเวลาจากภาพไม่ชัด", help: "เลือกภาพที่เห็นวันเวลาให้ชัด หรือกดอ่านใบเสร็จอีกครั้ง วันเวลาต้องอ่านจากภาพเท่านั้น" };
  if (!Number.isFinite(activated)) return { allowed: false, code: "activation_missing", title: "ยังส่งคำขอไม่ได้", reason: "ยังตรวจสอบเวลากดใช้ Item ไม่ได้", help: "เปิด Item อีกครั้งเพื่อตรวจสอบสถานะก่อนส่งคำขอ" };
  if (receipt < activated) return {
    allowed: false, code: "before_activation", title: "ใช้ใบเสร็จนี้ไม่ได้",
    reason: "ซื้อสินค้าก่อนกดใช้ Item " + differenceLabel(activated - receipt),
    help: "ใบเสร็จที่ใช้ได้ต้องมาจากการซื้อหลังกดใช้ Item กรุณาเลือกใบเสร็จที่เข้าเงื่อนไข ระบบจะไม่ส่งใบนี้ให้ Admin",
  };
  // Retain the existing five-minute clock-skew allowance enforced by the API.
  if (receipt > now + 5 * 60000) return { allowed: false, code: "future", title: "ใช้ใบเสร็จนี้ไม่ได้", reason: "วันเวลาบนใบเสร็จยังเป็นเวลาในอนาคต", help: "ตรวจภาพใบเสร็จแล้วกดอ่านอีกครั้ง หรือเลือกภาพที่เห็นวันเวลาชัดเจน ระบบจะไม่ส่งใบนี้ให้ Admin" };
  return { allowed: true, code: "eligible", title: "วันเวลาใบเสร็จเข้าเงื่อนไข", reason: "ซื้อสินค้าหลังกดใช้ Item", help: "วันเวลาอ่านจากภาพอัตโนมัติและแก้ไขไม่ได้" };
}
