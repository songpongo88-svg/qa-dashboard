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
