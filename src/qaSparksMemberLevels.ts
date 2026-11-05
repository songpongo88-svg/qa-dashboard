/** Member Level is earned from Sparks credited within the Bangkok calendar year.
 * Redeeming rewards never lowers an earned level; wallet balance rolls forward.
 * 2026 is the legacy launch year. Existing wallets are read without migrating data.
 */
export const SPARKS_ANNUAL_CAP = 200_000;

export const SPARKS_MEMBER_LEVELS = [
  { level: 1, name: "Spark Starter", thaiName: "ผู้เริ่มต้น", min: 0, color: "#8c9aa8" },
  { level: 2, name: "Spark Explorer", thaiName: "นักสำรวจ", min: 1_000, color: "#4caa91" },
  { level: 3, name: "Spark Rising", thaiName: "ดาวรุ่ง", min: 5_000, color: "#448bd4" },
  { level: 4, name: "Spark Pro", thaiName: "มืออาชีพ", min: 20_000, color: "#8a68cf" },
  { level: 5, name: "Spark Elite", thaiName: "ระดับชั้นนำ", min: 50_000, color: "#da933b" },
  { level: 6, name: "Spark Master", thaiName: "ระดับปรมาจารย์", min: 100_000, color: "#db6b8e" },
  { level: 7, name: "Spark Legend", thaiName: "ระดับตำนาน", min: 150_000, color: "#be8b21" },
] as const;

export type MemberLevel = (typeof SPARKS_MEMBER_LEVELS)[number];

function positiveWhole(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}
export function sparksCalendarYear(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "Asia/Bangkok" }).format(date);
  return Number(parts);
}

/** Reuse 2026 launch-era totals when no annual counter has been written yet.
 * The counter is persisted at the next earned-point transaction. Avoid extra reads.
 */
export function annualEarnedFromWallet(wallet: Record<string, unknown>, year = sparksCalendarYear()): number {
  if (positiveWhole(wallet.memberYear) === year && wallet.memberYearEarned !== undefined) {
    return Math.min(SPARKS_ANNUAL_CAP, positiveWhole(wallet.memberYearEarned));
  }
  if (year === 2026 && positiveWhole(wallet.memberYear) < 2026) {
    const firstLogin = wallet.firstLogin && typeof wallet.firstLogin === "object"
      ? wallet.firstLogin as { amount?: unknown; claimedAt?: unknown } : null;
    const claimedYear = firstLogin?.claimedAt ? sparksCalendarYear(new Date(String(firstLogin.claimedAt))) : 0;
    return Math.min(SPARKS_ANNUAL_CAP, Math.max(
      positiveWhole(wallet.totalEarned),
      claimedYear === 2026 ? positiveWhole(firstLogin?.amount) : 0,
    ));
  }
  return 0;
}

export function getSparksMemberLevel(earned: number) {
  const annualEarned = Math.min(SPARKS_ANNUAL_CAP, positiveWhole(earned));
  let index = SPARKS_MEMBER_LEVELS.length - 1;
  while (index > 0 && annualEarned < SPARKS_MEMBER_LEVELS[index].min) index--;
  const current = SPARKS_MEMBER_LEVELS[index];
  const next = SPARKS_MEMBER_LEVELS[index + 1] as MemberLevel | undefined;
  const progress = next
    ? (annualEarned - current.min) / (next.min - current.min)
    : 1;
  return {
    current,
    next,
    annualEarned,
    annualRemaining: SPARKS_ANNUAL_CAP - annualEarned,
    nextRequired: next ? Math.max(0, next.min - annualEarned) : 0,
    progress: Math.max(0, Math.min(100, Math.round(progress * 100))),
  };
}
