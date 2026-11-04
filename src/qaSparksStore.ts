import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

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
  rewardOrders: number;
  firstLogin: FirstLoginPrize | null;
  history: SparksHistoryItem[];
};

export const EMPTY_SPARKS_ACCOUNT: SparksAccount = {
  balance: 0, rewardOrders: 0, firstLogin: null, history: [],
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
export async function getSparksAccount(username: string): Promise<SparksAccount> {
  if (!String(username || "").trim()) return { ...EMPTY_SPARKS_ACCOUNT, history: [] };
  const ref = walletRef(username);
  const [wallet, records] = await Promise.all([
    getDoc(ref),
    getDocs(query(collection(ref, "history"), orderBy("createdAt", "desc"), limit(100))),
  ]);
  const data = wallet.exists() ? wallet.data() : {};
  return {
    balance: safeBalance(data.balance),
    rewardOrders: safeBalance(data.rewardOrders),
    firstLogin: validPrize(data.firstLogin),
    history: records.docs.map((row) => {
      const value = row.data();
      const amount = Number(value.amount) || 0;
      return {
        id: row.id,
        createdAt: String(value.createdAt || ""),
        type: amount < 0 ? "spend" as const : "earn" as const,
        title: String(value.title || ""),
        detail: String(value.detail || ""),
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
    const current = safeBalance(data.balance);
    const prize: FirstLoginPrize = { cardId: card.id, cardName: card.name, amount, claimedAt: now };
    tx.set(ref, {
      username: String(username).trim(),
      balance: current + amount,
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
  if (typeof window !== "undefined") window.dispatchEvent(new Event("qa:sparks-updated"));
  return result;
}
/** Ready for an eventual reward catalog; no reward inventory is enabled yet. */
export async function redeemSparks(username: string, orderId: string, rewardName: string, cost: number) {
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(orderId)) throw new Error("รหัสรายการแลกรางวัลไม่ถูกต้อง");
  if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error("จำนวน Sparks ไม่ถูกต้อง");
  const ref = walletRef(username);
  const historyRef = doc(ref, "history", "redeem-" + orderId);
  const balance = await runTransaction(firebaseDb, async (tx) => {
    const [wallet, existing] = await Promise.all([tx.get(ref), tx.get(historyRef)]);
    const data = wallet.exists() ? wallet.data() : {};
    if (existing.exists()) return safeBalance(data.balance);
    const current = safeBalance(data.balance);
    if (current < cost) throw new Error("Sparks ไม่เพียงพอสำหรับแลกรางวัล");
    const next = current - cost;
    const now = new Date().toISOString();
    tx.set(ref, {
      balance: next,
      rewardOrders: safeBalance(data.rewardOrders) + 1,
      updatedAt: now,
      updatedAtServer: serverTimestamp(),
    }, { merge: true });
    tx.set(historyRef, {
      createdAt: now,
      serverCreatedAt: serverTimestamp(),
      type: "spend",
      source: "reward-redemption",
      title: "Redeem Reward",
      detail: String(rewardName || "รางวัล"),
      amount: -cost,
      balanceAfter: next,
    });
    return next;
  });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("qa:sparks-updated"));
  return balance;
}
