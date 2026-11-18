// Thank you Support 2026: immutable, fixed recipients. No client-supplied award amounts.
export const THANK_YOU_SUPPORT_ID = "thank-you-support-2026";
export const THANK_YOU_SUPPORT_RECIPIENTS = Object.freeze([
  {username:"krivut",name:"Krivut Vongkampan",amount:1000},
  {username:"jureeporn",name:"Jureeporn Piddum",amount:1000},
  {username:"natcha",name:"Natcha Chai-in",amount:1000},
  {username:"warrathanun",name:"Warrathanun Rinjumrus",amount:1000},
  {username:"chachiya",name:"Chachiya Thawiwong",amount:1000},
  {username:"darunee",name:"Darunee Teparsa",amount:500},
  {username:"nithikorn",name:"Nithikorn wongsuntorn",amount:500},
  {username:"suwadee",name:"Suwadee Dechpong",amount:500},
  {username:"sarika",name:"Sarika Leksung",amount:1000},
  {username:"songpon",name:"Songpon Phothong",amount:1000},
  {username:"chatkonnaphat",name:"Chatkonnaphat Bhusomya",amount:500},
]);
export const thankYouSupportAmount = (username) =>
  THANK_YOU_SUPPORT_RECIPIENTS.find((item) => item.username === String(username||"").trim().toLowerCase())?.amount || 0;
export function thankYouSupportBangkokDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const value = (kind) => parts.find((part) => part.type === kind)?.value || "";
  return [value("year"),value("month"),value("day")].join("-");
}
// Deploy-day notice, then separate once-per-account reminders on Nov 21 and 22.
// No additional points are granted on either reminder date.
export function thankYouSupportPhase(now = new Date()) {
  const day=thankYouSupportBangkokDate(now);
  if(day>="2026-11-18" && day<"2026-11-21")return "launch";
  if(day==="2026-11-21")return "nov21";
  if(day==="2026-11-22")return "nov22";
  return null;
}

export const THANK_YOU_SUPPORT_ANNOUNCEMENT_ID = "thank-you-support-2026-notice";
export const THANK_YOU_SUPPORT_AWARDED_AT = "2026-11-18T08:18:24.700Z"; // Verified immutable Supabase ledger.
export function thankYouSupportAnnouncementFor(username) {
  const recipient = THANK_YOU_SUPPORT_RECIPIENTS.find(
    (item) => item.username === String(username || "").trim().toLowerCase()
  );
  if (!recipient) return null;
  const bonusExplanation = recipient.amount === 1000
    ? "สำหรับช่วงวันที่ 21–22 พฤศจิกายน 2569 คิดเป็นวันละ 500 Sparks รวม 1,000 Sparks แต่ระบบได้มอบยอดทั้งหมดครั้งเดียวแล้วตั้งแต่หลัง Deploy"
    : "สำหรับช่วงวันที่ 21–22 พฤศจิกายน 2569 คุณได้รับทั้งหมด 500 Sparks โดยระบบมอบคะแนนเต็มจำนวนครั้งเดียวหลัง Deploy";
  return {
    id: THANK_YOU_SUPPORT_ANNOUNCEMENT_ID,
    title: "Thank you Support — ได้รับ " + recipient.amount.toLocaleString("en-US") + " Sparks",
    body: [
      "ขอบคุณสำหรับการสนับสนุน",
      "QA Sparks System ได้เพิ่ม " + recipient.amount.toLocaleString("en-US") +
        " Sparks เข้ากระเป๋าของคุณโดยอัตโนมัติเรียบร้อยแล้ว ไม่ต้องกดรับ",
      bonusExplanation,
      "วันที่ 21 และ 22 พฤศจิกายน 2569 ระบบจะแสดง Popup แจ้งเตือนอีกครั้งเท่านั้น ไม่มีการเพิ่มคะแนนซ้ำ",
      "From: QA Sparks System",
    ].join("\n\n"),
    category: "QA Sparks",
    priority: "Important",
    popupMode: "Mailbox Only", // Existing three-stage reward popup is authoritative.
    deliveryModel: "legacy",
    showImmediately: false,
    reminderEnabled: false,
    reminderAt: "",
    repeatMode: "once",
    dailyStartTime: "",
    dailyEndTime: "",
    displayMode: "Mailbox Only",
    tickerMode: "scroll",
    tickerTextColor: "#33264B",
    actionRequired: "Read Only",
    startsAt: THANK_YOU_SUPPORT_AWARDED_AT,
    endsAt: "",
    targetAll: false,
    targetRoles: [],
    targetTeams: [],
    targetUsernames: [recipient.username], // Person-specific award amount.
    media: [],
    createdBy: "qa-sparks-system",
    createdByName: "QA Sparks System",
    createdAt: THANK_YOU_SUPPORT_AWARDED_AT,
    updatedAt: THANK_YOU_SUPPORT_AWARDED_AT,
    archived: false,
  };
}
