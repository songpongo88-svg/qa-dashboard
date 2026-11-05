import { doc, getDoc } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { sparksAccountKey } from "./qaSparksStore";

export const TYPING_RELIEF = Object.freeze({
  id: "typing-relief",
  name: "Typing Relief",
  subtitle: "สิทธิ์ลดจำนวนคำพิมพ์ใน QA Access",
  price: 150,
  wordsReduced: 60,
  maxOwned: 10,
});

export type TypingReliefState = { balance: number; owned: number };
export type TypingReliefResult = {
  updated: boolean;
  alreadyApplied?: boolean;
  balance: number;
  owned: number;
  remainingWords?: number;
  appliedWords?: number;
};

const normalizeAmount = (input: unknown) => {
  const value = Number(input);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
};

export async function fetchTypingReliefState(username: string): Promise<TypingReliefState> {
  const wallet = await getDoc(doc(firebaseDb, "qa_sparks_wallets", sparksAccountKey(username)));
  const data = wallet.exists() ? wallet.data() : {};
  return { balance: normalizeAmount(data.balance), owned: normalizeAmount(data.typingReliefOwned) };
}

export function typingReliefRemainingWords(originalCount: number) {
  return Math.max(1, Math.floor(originalCount) - TYPING_RELIEF.wordsReduced);
}

export async function typingReliefAction(
  action: "redeem-typing-relief" | "use-typing-relief",
  username: string,
  sessionId: string,
  input: { requestId?: string; challengeId?: string } = {},
): Promise<TypingReliefResult> {
  if (!username || !sessionId) throw new Error("กรุณา Login QA Dashboard ก่อนใช้ Sparks");
  const response = await fetch("/api/sparks-admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action, actorUsername: username, sessionId, ...input }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.error || "ไม่สามารถดำเนินการ Typing Relief ได้"));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("qa:sparks-updated"));
  return body as TypingReliefResult;
}
