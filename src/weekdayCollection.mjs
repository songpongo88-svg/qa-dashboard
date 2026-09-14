// Pure calendar helpers shared by the browser runtime and Node checks.
export const WEEKDAY_COLLECTION_ID = "weekday-auto";
export const WEEKDAY_IDS = ["weekday-monday", "weekday-tuesday", "weekday-wednesday", "weekday-thursday", "weekday-friday", "weekday-saturday", "weekday-sunday"];
export function isWeekdayPreference(value) {
  return value === WEEKDAY_COLLECTION_ID || WEEKDAY_IDS.includes(value);
}
export function getBangkokWeekdayTheme(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short" }).format(now);
  return WEEKDAY_IDS[["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(day)];
}
export function resolveWeekdayPreference(value, now = new Date()) {
  return isWeekdayPreference(value) ? getBangkokWeekdayTheme(now) : value;
}
export function millisecondsUntilBangkokMidnight(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now);
  const n = (key) => Number(parts.find((part) => part.type === key)?.value || 0);
  return 86400000 - ((n("hour") * 3600 + n("minute") * 60 + n("second")) * 1000 + now.getMilliseconds());
}
