import { randomInt } from "node:crypto";

export const SPARK_JOURNEY_END = "2026-12-25";
export const SPARK_JOURNEY_ROUTES = Object.freeze({
  boat: "River Voyage",
  bicycle: "Cycle Adventure",
  dog: "Paw Walk",
  airplane: "Sky Journey",
  train: "Rail Explorer",
});

export function bangkokJourneyDate(date = new Date()) {
  const pieces = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type) => pieces.find((item) => item.type === type)?.value || "";
  return [get("year"), get("month"), get("day")].join("-");
}
const points = (v) => Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : 0;
const rejected = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
function normalizeSaved(row) {
  if (!row || typeof row !== "object") return null;
  const amount = Number(row.amount);
  if (!Object.hasOwn(SPARK_JOURNEY_ROUTES, String(row.routeId || "")) ||
      !Number.isSafeInteger(amount) || amount < 150 || amount > 800) return null;
  return {
    routeId: row.routeId, routeName: SPARK_JOURNEY_ROUTES[row.routeId],
    amount, claimedAt: String(row.claimedAt || row.createdAt || ""),
  };
}

/**
 * Dedicated, server-authorized, once-per-account Spark Journey quest.
 * Uses the existing wallet and fixed history id. The configured transport
 * chooses Supabase or Firebase; the client cannot influence the point amount.
 */
export function createSparkJourneyService(db, options = {}) {
  const {
    firestoreRequest, readDoc, recordValue, walletDocumentPath, updateWrite,
    createWrite, spendableBalance, annualEarnedFromWallet, currentMemberYear,
  } = db;
  const draw = options.draw || (() => randomInt(150, 801));
  const today = options.today || bangkokJourneyDate;
  async function claim(body, actor) {
    const routeId = String(body.routeId || "").trim();
    if (!Object.hasOwn(SPARK_JOURNEY_ROUTES, routeId)) rejected("ไม่พบรูปแบบการเดินทางที่เลือก");
    if (today() > SPARK_JOURNEY_END) rejected("กิจกรรมสิ้นสุดวันที่ 25 ธันวาคม 2026 แล้ว", 409);
    const walletPath = walletDocumentPath(actor.username);
    const historyPath = walletPath + "/history/quest-spark-journey-2026";

    for (let attempt = 0; attempt < 4; attempt++) {
      const started = await firestoreRequest(":beginTransaction", "POST", { options: { readWrite: {} } });
      const transaction = started?.transaction;
      if (!transaction) rejected("ไม่สามารถเริ่มบันทึกรางวัลได้", 503);
      let committed = false;
      try {
        const [walletDoc, historyDoc] = await Promise.all([
          readDoc(walletPath, transaction), readDoc(historyPath, transaction),
        ]);
        const wallet = recordValue(walletDoc);
        const existing = normalizeSaved(wallet.sparkJourney2026) ||
          normalizeSaved(recordValue(historyDoc));
        if (existing) return { ok: true, prize: existing, alreadyApplied: true };

        // A history document is authoritative even if malformed; never pay it twice.
        if (historyDoc || wallet.sparkJourney2026)
          rejected("พบประวัติสิทธิ์นี้แล้ว กรุณาติดต่อผู้ดูแลเพื่อตรวจสอบ", 409);
        const amount = draw();
        if (!Number.isSafeInteger(amount) || amount < 150 || amount > 800)
          rejected("ระบบสุ่มรางวัลไม่พร้อม กรุณาลองอีกครั้ง", 503);
        const now = new Date().toISOString();
        const year = currentMemberYear();
        const current = spendableBalance(wallet, year);
        const earned = annualEarnedFromWallet(wallet, year);
        const prize = {
          routeId, routeName: SPARK_JOURNEY_ROUTES[routeId], amount, claimedAt: now,
        };
        await firestoreRequest(":commit", "POST", { transaction, writes: [
          updateWrite(walletPath, {
            username: actor.username, balance: current + amount, balanceYear: year,
            totalEarned: Math.max(points(wallet.totalEarned), points(wallet.firstLogin?.amount)) + amount,
            memberYear: year, memberYearEarned: earned + amount,
            rewardOrders: points(wallet.rewardOrders),
            sparkJourney2026: prize, updatedAt: now,
          }, walletDoc),
          createWrite(historyPath, {
            createdAt: now, type: "earn", source: "spark-journey-2026",
            title: "The Spark Journey Reward",
            detail: SPARK_JOURNEY_ROUTES[routeId] + " · Spark Land",
            routeId, routeName: SPARK_JOURNEY_ROUTES[routeId], amount,
            balanceAfter: current + amount,
          }),
        ] });
        committed = true;
        return { ok: true, prize, alreadyApplied: false };
      } catch (error) {
        if (["ABORTED", "FAILED_PRECONDITION"].includes(error?.firestoreStatus) && attempt < 3) continue;
        throw error;
      } finally {
        if (!committed) {
          await firestoreRequest(":rollback", "POST", { transaction }).catch(() => {});
        }
      }
    }
    rejected("มีการยืนยันรางวัลจากหลายหน้าต่าง กรุณาลองอีกครั้ง", 409);
  }
  return { claim };
}
