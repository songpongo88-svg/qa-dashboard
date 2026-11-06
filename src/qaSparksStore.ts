import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { annualEarnedFromWallet, sparksCalendarYear, spendableSparksFromWallet } from "./qaSparksMemberLevels";
import { invalidateFirestoreReads, sharedFirestoreRead } from "./firestoreReadPolicy";

const WALLETS = "qa_sparks_wallets";
export const FIRST_LOGIN_REWARDS = [100, 150, 200, 250, 300, 400, 500, 600, 750, 1000] as const;
export const FRUIT_CARDS = [
  { id: "apple", name: "Apple Spark" },
  { id: "banana", name: "Banana Boost" },
  { id: "orange", name: "Orange Glow" },
  { id: "grape", name: "Grape Pop" },
  { id: "strawberry", name: "Strawberry Shine" },
  { id: "watermelon", name: "Watermelon Wave" },
  { id: "pineapple", name: "Pineapple Punch" },
  { id: "mango", name: "Mango Magic" },
  { id: "cherry", name: "Cherry Charm" },
  { id: "peach", name: "Peach Bliss" },
] as const;

export type FirstLoginPrize = { cardId: string; cardName: string; amount: number; claimedAt: string };
export type SparksHistoryItem = {
  id: string;
  createdAt: string;
  type: "earn" | "spend";
  title: string;
  detail: string;
  amount: number;
  balanceAfter: number;
  source: string;
};
export type SparksAccount = {
  balance: number;
  totalEarned?: number;
  totalSpent?: number;
  rewardOrders: number;
  typingReliefOwned: number;
  memberYear: number;
  memberYearEarned: number;
  dailyCheckinClaimedDays: number[];
  profileMakeoverClaimedAt: string;
  firstLogin: FirstLoginPrize | null;
  history: SparksHistoryItem[];
};

export const EMPTY_SPARKS_ACCOUNT: SparksAccount = {
  balance: 0, rewardOrders: 0, typingReliefOwned: 0, memberYear: sparksCalendarYear(), memberYearEarned: 0, dailyCheckinClaimedDays: [], profileMakeoverClaimedAt: "", firstLogin: null, history: [],
};

export function sparksAccountKey(username: string): string {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized) throw new Error("กรุณาเข้าสู่ระบบก่อนใช้งาน Sparks");
  return encodeURIComponent(normalized);
}
function walletRef(username: string) {
  return doc(firebaseDb, WALLETS, sparksAccountKey(username));
}
function validPrize(value: any): FirstLoginPrize | null {
  if (!value || typeof value !== "object") return null;
  const amount = Number(value.amount);
  if (!FIRST_LOGIN_REWARDS.some((n) => n === amount)) return null;
  return {
    cardId: String(value.cardId || ""),
    cardName: String(value.cardName || ""),
    amount,
    claimedAt: String(value.claimedAt || ""),
  };
}
function safeBalance(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
}
export function randomPrizeValues(): number[] {
  const numbers: number[] = [...FIRST_LOGIN_REWARDS];
  for (let i = numbers.length - 1; i > 0; i--) {
    const buffer = new Uint32Array(1);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(buffer);
    } else {
      buffer[0] = Math.floor(Math.random() * 4294967296);
    }
    const j = buffer[0] % (i + 1);
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  return numbers;
}
export function invalidateSparksAccount(username: string): void {
  invalidateFirestoreReads("sparks:" + sparksAccountKey(username) + ":");
}

// A reward can be used before the Sparks page has ever been opened.
// Keep every mutation's existing event contract and invalidate display caches.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("qa:sparks-updated", () => invalidateFirestoreReads("sparks:"));
}

export async function getSparksAccount(username: string, options: { historyLimit?: number; forceRefresh?: boolean } = {}): Promise<SparksAccount> {
  if (!String(username || "").trim()) return { ...EMPTY_SPARKS_ACCOUNT, history: [] };
  const ref = walletRef(username);
  const key = "sparks:" + sparksAccountKey(username) + ":";
  const historyLimit = Math.max(0, Math.min(100, Math.floor(options.historyLimit ?? 100)));
  const [wallet, records] = await Promise.all([
    sharedFirestoreRead(key + "wallet", 60_000, () => getDoc(ref), options.forceRefresh),
    historyLimit ? sharedFirestoreRead(key + "history:" + historyLimit, 60_000,
      () => getDocs(query(collection(ref, "history"), orderBy("createdAt", "desc"), limit(historyLimit))), options.forceRefresh)
      : Promise.resolve({ docs: [] }),
  ]);
  const data = wallet.exists() ? wallet.data() : {};
  const memberYear = sparksCalendarYear();
  return {
    memberYear,
    memberYearEarned: annualEarnedFromWallet(data, memberYear),
    profileMakeoverClaimedAt: String(data.profileMakeoverClaimedAt || ""),
    dailyCheckinClaimedDays: Array.isArray(data.dailyCheckin202611Days)
      ? [...new Set(data.dailyCheckin202611Days.map(Number).filter((day: number) => Number.isInteger(day) && day >= 9 && day <= 22))].sort((a: number, b: number) => a - b) as number[]
      : [],
    balance: spendableSparksFromWallet(data,memberYear),
    totalEarned: safeBalance(data.totalEarned) || safeBalance(data.firstLogin?.amount),
    totalSpent: safeBalance(data.totalSpent),
    rewardOrders: safeBalance(data.rewardOrders),
    typingReliefOwned: safeBalance(data.typingReliefOwned),
    firstLogin: validPrize(data.firstLogin),
    history: records.docs.map((row) => {
      const value = row.data();
      // Keep original audit entries in Firestore, but do not present voided
      // TEST adjustments as earned/spent Sparks in a member's history.
      const voided = Boolean(value.voidedAt);
      const amount = voided ? 0 : Number(value.amount) || 0;
      return {
        id: row.id,
        createdAt: String(value.createdAt || ""),
        type: amount < 0 ? "spend" as const : "earn" as const,
        title: voided ? "รายการทดลองถูกยกเลิก" : String(value.title || ""),
        detail: voided ? "ผู้ดูแลแก้ไขรายการทดลองแล้ว · ไม่นับยอด Sparks หรือ Member Level" : String(value.detail || ""),
        source: String(value.source || ""),
        amount,
        balanceAfter: safeBalance(value.balanceAfter),
      };
    }),
  };
}
/**
 * Single atomic wallet + immutable first-login history write. A concurrent tab/device
 * sees the existing grant; it cannot obtain a second bonus by resubmitting.
 */
export async function claimFirstLoginSparks(
  username: string,
  selectedCard: { id: string; name: string },
  amount: number,
): Promise<FirstLoginPrize> {
  const card = FRUIT_CARDS.find((candidate) => candidate.id === selectedCard.id && candidate.name === selectedCard.name);
  if (!card || !FIRST_LOGIN_REWARDS.some((value) => value === amount)) {
    throw new Error("ข้อมูลการ์ดหรือจำนวน Sparks ไม่ถูกต้อง");
  }
  const ref = walletRef(username);
  const historyRef = doc(ref, "history", "first-login-welcome-v1");
  const result = await runTransaction(firebaseDb, async (tx) => {
    const [wallet, existingEntry] = await Promise.all([tx.get(ref), tx.get(historyRef)]);
    const data = wallet.exists() ? wallet.data() : {};
    const alreadyClaimed = validPrize(data.firstLogin);
    if (alreadyClaimed) return alreadyClaimed;
    if (existingEntry.exists()) {
      const stored = existingEntry.data();
      return {
        cardId: String(stored.cardId || ""),
        cardName: String(stored.cardName || ""),
        amount: Number(stored.amount) || 0,
        claimedAt: String(stored.createdAt || ""),
      };
    }
    const now = new Date().toISOString();
    const memberYear = sparksCalendarYear();
    const current = spendableSparksFromWallet(data, memberYear);
    const earnedThisYear = annualEarnedFromWallet(data, memberYear);
    const previousEarned = Math.max(safeBalance(data.totalEarned), safeBalance(data.firstLogin?.amount));
    const prize: FirstLoginPrize = { cardId: card.id, cardName: card.name, amount, claimedAt: now };
    tx.set(ref, {
      username: String(username).trim(),
      balance: current + amount,
      balanceYear: memberYear,
      totalEarned: previousEarned + amount,
      memberYear,
      memberYearEarned: earnedThisYear + amount,
      rewardOrders: safeBalance(data.rewardOrders),
      firstLogin: prize,
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    }, { merge: true });
    tx.set(historyRef, {
      createdAt: now,
      serverCreatedAt: serverTimestamp(),
      type: "earn",
      source: "first-login",
      title: "First Login Reward",
      detail: card.name,
      cardId: card.id,
      cardName: card.name,
      amount,
      balanceAfter: current + amount,
    });
    return prize;
  });
  invalidateSparksAccount(username);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("qa:sparks-updated"));
  return result;
}

