/** Member Level is earned from Sparks credited within the Bangkok calendar year.
 * Redeeming does not lower the level. Unspent wallet Sparks expire at the end of
 * the Bangkok calendar year. Legacy wallets with no balanceYear belong to 2026.
 * Keep lifetime earned/spent/history records untouched for historical audit.
 */
export const SPARKS_TOP_LEVEL_POINTS = 500_000;

export const SPARKS_MEMBER_LEVELS = [
  { level: 1, name: "Spark Starter", thaiName: "ผู้เริ่มต้น", min: 0, color: "#8c9aa8" },
  { level: 2, name: "Spark Explorer", thaiName: "นักสำรวจ", min: 1_000, color: "#4caa91" },
  { level: 3, name: "Spark Rising", thaiName: "ดาวรุ่ง", min: 5_000, color: "#448bd4" },
  { level: 4, name: "Spark Pro", thaiName: "มืออาชีพ", min: 20_000, color: "#8a68cf" },
  { level: 5, name: "Spark Elite", thaiName: "ระดับชั้นนำ", min: 50_000, color: "#da933b" },
  { level: 6, name: "Spark Master", thaiName: "ระดับปรมาจารย์", min: 100_000, color: "#db6b8e" },
  { level: 7, name: "Spark Legend", thaiName: "ระดับตำนาน", min: 150_000, color: "#be8b21" },
  { level: 8, name: "Spark Champion", thaiName: "แชมเปียน", min: 200_000, color: "#c97642" },
  { level: 9, name: "Spark Grandmaster", thaiName: "ปรมาจารย์สูงสุด", min: 300_000, color: "#7558d6" },
  { level: 10, name: "Spark Immortal", thaiName: "ระดับอมตะ", min: 500_000, color: "#bd4192" },
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

/** Read-only effective balance. A missing balanceYear indicates the 2026 launch
 * wallet. Historical raw balance remains in Firestore; new writes stamp a year.
 */
export function spendableSparksFromWallet(wallet: Record<string, unknown>, year = sparksCalendarYear()): number {
  const balanceYear = positiveWhole(wallet.balanceYear) || 2026;
  return balanceYear === year ? positiveWhole(wallet.balance) : 0;
}

/** 2026 legacy totals are used only for launch-era wallets. */
export function annualEarnedFromWallet(wallet: Record<string, unknown>, year = sparksCalendarYear()): number {
  if (positiveWhole(wallet.memberYear) === year && wallet.memberYearEarned !== undefined) {
    return positiveWhole(wallet.memberYearEarned);
  }
  if (year === 2026 && positiveWhole(wallet.memberYear) < 2026) {
    const firstLogin = wallet.firstLogin && typeof wallet.firstLogin === "object"
      ? wallet.firstLogin as { amount?: unknown; claimedAt?: unknown } : null;
    const claimedDate = new Date(String(firstLogin?.claimedAt || ""));
    const claimedYear = Number.isFinite(claimedDate.getTime()) ? sparksCalendarYear(claimedDate) : 0;
    return Math.max(
      positiveWhole(wallet.totalEarned),
      claimedYear === 2026 ? positiveWhole(firstLogin?.amount) : 0,
    );
  }
  return 0;
}

export function getSparksMemberLevel(earned: number) {
  const annualEarned = positiveWhole(earned);
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
    nextRequired: next ? Math.max(0, next.min - annualEarned) : 0,
    progress: Math.max(0, Math.min(100, Math.round(progress * 100))),
  };
}
