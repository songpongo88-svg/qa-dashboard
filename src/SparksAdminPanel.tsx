import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./qaSparks.css";
import { fetchStoredUserProfiles, readCachedUserProfiles } from "./userRoleStore";
import { getSparksAccount, type SparksAccount } from "./qaSparksStore";
import { collection, getDocsFromCache } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import SparksRewardRequests from "./SparksRewardRequests";
import "./sparksAdminWorkspace.css";
import { assertFirestoreReadAllowed, isFirestoreQuotaError, noteFirestoreReadError } from "./firestoreReadPolicy";

type AdminUser = {
  username: string;
  displayName: string;
  role: string;
  status: string;
  balance: number;
  earned: number;
  spent: number;
  rewardOrders: number;
  firstLogin: { cardName: string; amount: number; claimedAt: string } | null;
  balanceKnown?: boolean;
  balanceAsOf?: string;
};
type AdminHistoryItem = {
  id: string;
  createdAt: string;
  type: "earn" | "spend";
  title: string;
  detail: string;
  amount: number;
  balanceAfter: number;
  source: string;
  performedBy: string;
  reason: string;
  referenceId: string;
  status: string;
  voided?: boolean;
  originalAmount?: number;
};
type DetailResponse = {
  username: string;
  wallet: Pick<AdminUser, "balance" | "earned" | "spent" | "rewardOrders" | "firstLogin">;
  history: AdminHistoryItem[];
  truncated: boolean;
};
type Operation = "add" | "deduct" | "refund";
type CachedBalance = Pick<AdminUser, "balance" | "earned" | "spent" | "rewardOrders" | "firstLogin"> & { savedAt: string };
type OwnAccountSnapshot = SparksAccount & { lastLoadedAt: string };
const SNAPSHOT_KEY = "qa-sparks:admin-wallet-snapshot:v1:";
const normalizeUser = (username: string) => String(username || "").trim().toLowerCase();
function validBalance(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function readCachedBalances(actor: string): Map<string, CachedBalance> {
  const cache = new Map<string, CachedBalance>();
  if (typeof window === "undefined") return cache;
  try {
    const raw = window.sessionStorage.getItem(SNAPSHOT_KEY + normalizeUser(actor));
    if (!raw) return cache;
    const data = JSON.parse(raw);
    if (!Number.isFinite(Date.parse(data.savedAt)) || Date.now() - Date.parse(data.savedAt) > 24 * 60 * 60 * 1000) return cache;
    const localYear = (date: Date) => new Intl.DateTimeFormat("en-US", { year:"numeric", timeZone:"Asia/Bangkok" }).format(date);
    if (localYear(new Date(data.savedAt)) !== localYear(new Date())) return cache; // Expired points may not reappear via a snapshot.
    for (const item of Array.isArray(data.wallets) ? data.wallets.slice(0, 500) : []) {
      const name = normalizeUser(item?.username);
      if (name && validBalance(item?.balance) && validBalance(item?.earned) && validBalance(item?.spent) && validBalance(item?.rewardOrders)) {
        cache.set(name, {
          balance: item.balance, earned: item.earned, spent: item.spent, rewardOrders: item.rewardOrders,
          firstLogin: item.firstLogin || null, savedAt: data.savedAt,
        });
      }
    }
  } catch { /* Browser session storage is an optional, read-only fallback. */ }
  return cache;
}
function rememberBalances(actor: string, users: AdminUser[]) {
  if (typeof window === "undefined") return;
  const wallets = users.filter((item) => validBalance(item.balance)).slice(0, 500).map((item) => ({
    username: item.username, balance: item.balance, earned: item.earned,
    spent: item.spent, rewardOrders: item.rewardOrders, firstLogin: item.firstLogin,
  }));
  try {
    window.sessionStorage.setItem(SNAPSHOT_KEY + normalizeUser(actor), JSON.stringify({ savedAt: new Date().toISOString(), wallets }));
  } catch { /* A full/disabled storage must never block Sparks Admin. */ }
}
const fmt = (value: number) => Number(value || 0).toLocaleString("en-US");
function thaiDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : value || "—";
}
function operationLabel(operation: Operation) {
  return operation === "add" ? "เพิ่ม Sparks" : operation === "deduct" ? "ปรับลด Sparks" : "คืน Sparks จากการแลกรางวัล";
}
function createRequestId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "adjust-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}
export default function SparksAdminPanel({ actorUsername, sessionId, ownAccount, active: panelActive = true }: {
  actorUsername: string; sessionId: string; ownAccount: OwnAccountSnapshot | null; active?: boolean;
}) {
  const [adminSection, setAdminSection] = useState<"requests" | "points" | "settings" | "activity">("requests");
  const ownAccountRef = useRef(ownAccount);
  ownAccountRef.current = ownAccount;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [chosen, setChosen] = useState("");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "earn" | "spend" | "redeem">("all");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [operation, setOperation] = useState<Operation | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voidConfirm, setVoidConfirm] = useState(false);
  const [typingTestConfirm, setTypingTestConfirm] = useState(false);
  const [voidSaving, setVoidSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [adminReady, setAdminReady] = useState(false);
  const [firestoreLimited, setFirestoreLimited] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const requestReauth = useCallback(() => setNeedsReauth(true), []);
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthLoading, setReauthLoading] = useState(false);
  const [reauthError, setReauthError] = useState("");
  const [trueMoneyPrice,setTrueMoneyPrice] = useState("10000");
  const [trueMoneyPriceLoaded,setTrueMoneyPriceLoaded] = useState(false);
  const [loadedTrueMoneyPrice, setLoadedTrueMoneyPrice] = useState<number | null>(null);
  const [trueMoneyPriceBusy,setTrueMoneyPriceBusy] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState("");
  const [priceRevision, setPriceRevision] = useState(0);
  const priceLoadedKey = useRef("");

  const request = useCallback(async (action: "list" | "history" | "adjust" | "reauth" | "void-chachiya-test-pair" | "void-suphitcha-typing-test" | "get-truemoney-price" | "set-truemoney-price", input: Record<string, unknown> = {}) => {
    if (action === "list" || action === "history") assertFirestoreReadAllowed();
    if (!sessionId) throw new Error("ไม่พบ Session ที่ถูกต้อง กรุณา Login ใหม่");
    const controller = action === "get-truemoney-price" ? new AbortController() : null;
    const timeout = controller ? window.setTimeout(() => controller.abort(), 25000) : null;
    try {
      const response = await fetch("/api/sparks-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        ...(controller ? { signal: controller.signal } : {}),
        body: JSON.stringify({ action, actorUsername, sessionId, ...input }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = Object.assign(new Error(String(result.error || "ไม่สามารถโหลดข้อมูล Sparks ได้")), {
          code: String(result.code || ""),
        });
        noteFirestoreReadError(error);
        throw error;
      }
      return result;
    } catch (reason) {
      if (controller?.signal.aborted) throw new Error("โหลดราคาใช้เวลานานเกินไป กรุณากดรีเฟรชราคา");
      throw reason;
    } finally {
      if (timeout !== null) window.clearTimeout(timeout);
    }
  }, [actorUsername, sessionId]);

  useEffect(() => {
    let active = true;
    if (!panelActive) return;
    setLoading(true);
    void request("list", { forceRefresh: revision > 0 }).then((data) => {
      if (!active) return;
      const loaded = (Array.isArray(data.users) ? data.users as AdminUser[] : [])
        .filter((user) => String(user.status || "").toLowerCase() !== "suspended");
      setUsers(loaded);
      rememberBalances(actorUsername, loaded);
      setAdminReady(true);
      setFirestoreLimited(false);
      setNeedsReauth(false);
      setReauthPassword("");
      setReauthError("");
      setChosen((previous) => loaded.some((row) => row.username === previous) ? previous : (loaded[0]?.username || ""));
      setError("");
    }).catch(async (reason) => {
      if (!active) return;
      setAdminReady(false);
      const code = (reason as Error & { code?: string })?.code || "";
      const policyMismatch = code === "SESSION_POLICY_OUTDATED";
      const quotaLimited = isFirestoreQuotaError(reason);
      setFirestoreLimited(quotaLimited);
      setNeedsReauth(policyMismatch);
      const message = reason instanceof Error ? reason.message : "บริการ Sparks Admin เชื่อมต่อไม่สำเร็จ";
      setError(quotaLimited
        ? "Firestore จำกัดโควตาหรืออัตราการใช้งานอยู่ ไม่ใช่ปัญหา Role, Session หรือ Firebase Key กรุณาตรวจการใช้โควตาใน Firebase Console → Firestore → Usage"
        : policyMismatch
          ? "กรุณายืนยันรหัสผ่าน QA อีกครั้ง เพื่อเปิดสิทธิ์จัดการ Sparks (ไม่ต้อง Logout)"
          : "ระบบจัดการคะแนนยังไม่พร้อม: " + message + " — แสดงรายชื่อจาก QA User Management แบบอ่านอย่างเดียว");
      try {
        const profiles = quotaLimited ? readCachedUserProfiles() : await fetchStoredUserProfiles();
        // Reuse past wallet snapshots and Firestore's local cache, without
        // making another network read when quota is exhausted.
        const wallets = readCachedBalances(actorUsername);
        try {
          const rows = await getDocsFromCache(collection(firebaseDb, "qa_sparks_wallets"));
          rows.docs.forEach((document) => {
            const data = document.data();
            const name = normalizeUser(String(data.username || decodeURIComponent(document.id)));
            if (!name || !validBalance(data.balance)) return;
            const firstLogin = data.firstLogin || null;
            wallets.set(name, {
              balance: data.balance,
              earned: validBalance(data.totalEarned) ? data.totalEarned : Number(firstLogin?.amount) || 0,
              spent: validBalance(data.totalSpent) ? data.totalSpent : 0,
              rewardOrders: validBalance(data.rewardOrders) ? data.rewardOrders : 0,
              firstLogin,
              savedAt: String(data.updatedAt || ""),
            });
          });
        } catch { /* No local Firestore snapshot exists yet. */ }
        const ownAccount = ownAccountRef.current;
        if (ownAccount && validBalance(ownAccount.balance) && normalizeUser(actorUsername)) {
          const history = ownAccount.history || [];
          wallets.set(normalizeUser(actorUsername), {
            balance: ownAccount.balance,
            earned: ownAccount.totalEarned ?? history.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0),
            spent: ownAccount.totalSpent ?? history.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum - entry.amount, 0),
            rewardOrders: ownAccount.rewardOrders,
            firstLogin: ownAccount.firstLogin,
            savedAt: ownAccount.lastLoadedAt,
          });
        }
        if (!active) return;
        const fallbackUsers = profiles.filter((profile) => String(profile.status || "").toLowerCase() !== "suspended").map((profile) => {
          const wallet = wallets.get(normalizeUser(profile.username));
          return {
            username: profile.username,
            displayName: profile.displayName || profile.agentName || profile.username,
            role: profile.role,
            status: profile.status,
            balance: wallet?.balance ?? 0,
            earned: wallet?.earned ?? 0,
            spent: wallet?.spent ?? 0,
            rewardOrders: wallet?.rewardOrders ?? 0,
            firstLogin: wallet?.firstLogin || null,
            balanceKnown: Boolean(wallet),
            balanceAsOf: wallet?.savedAt || "",
          } as AdminUser;
        });
        fallbackUsers.sort((a, b) => a.displayName.localeCompare(b.displayName, "th"));
        setUsers(fallbackUsers);
        setChosen((previous) => fallbackUsers.some((row) => row.username === previous) ? previous : (fallbackUsers[0]?.username || ""));
      } catch (directoryError) {
        if (active) {
          setUsers([]);
          setError("ไม่สามารถโหลดรายชื่อจาก QA User Management: " + String(directoryError instanceof Error ? directoryError.message : "Unknown error"));
        }
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, revision, actorUsername, panelActive]);

  useEffect(() => {
    let active = true;
    if (!panelActive) return;
    if (!chosen) { setDetail(null); return; }
    setDetailLoading(true);
    setDetail(null);
    if (firestoreLimited) { setDetailLoading(false); return; }
    void request("history", { targetUsername: chosen, forceRefresh: revision > 0 }).then((data) => {
      if (active) { setDetail(data as DetailResponse); setError(""); }
    }).catch(async (reason) => {
      if (!active) return;
      if (isFirestoreQuotaError(reason)) {
        setFirestoreLimited(true);
        setAdminReady(false);
        setError("Firestore จำกัดการอ่านข้อมูลชั่วคราว กรุณารอสักครู่แล้วกดรีเฟรชข้อมูล");
        return;
      }
      try {
        const account = await getSparksAccount(chosen);
        if (!active) return;
        const history = account.history.map((item) => ({
          ...item,
          performedBy: "",
          reason: "",
          referenceId: "",
          status: "",
        }));
        setDetail({
          username: chosen,
          wallet: {
            balance: account.balance,
            earned: history.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0),
            spent: history.filter((item) => item.amount < 0).reduce((sum, item) => sum - item.amount, 0),
            rewardOrders: account.rewardOrders,
            firstLogin: account.firstLogin,
          },
          history,
          truncated: history.length >= 100,
        });
      } catch {
        if (active) setError("ประวัติ Sparks ยังโหลดไม่ได้ เนื่องจากไม่มีสิทธิ์อ่านข้อมูล Firestore หรือบริการยังไม่พร้อม");
      }
    }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [request, chosen, revision, firestoreLimited, panelActive]);

  const selected = users.find((user) => user.username === chosen);
  const filteredUsers = useMemo(() => users.filter((user) =>
    String(user.status || "").toLowerCase() !== "suspended"
    && (user.username + " " + user.displayName + " " + user.role).toLocaleLowerCase().includes(search.toLocaleLowerCase())
  ), [search, users]);
  const history = (detail?.history || []).filter((entry) => {
    if (filter === "all") return true;
    if (filter === "redeem") return ["reward-redemption", "reward-refund"].includes(entry.source);
    return entry.type === filter;
  });
  const refundedIds = new Set((detail?.history || []).filter((item) => item.source === "reward-refund").map((item) => item.referenceId));
  const voidGrant = detail?.history.find((item) => item.source === "admin-add" && item.amount === 99800 && !item.voided);
  const voidDeduct = detail?.history.find((item) => item.source === "admin-deduct" && item.amount === -99800 && !item.voided);
  const canCorrectTest = adminReady && normalizeUser(chosen) === "chachiya" && Boolean(
    detail && detail.wallet.balance === 150 && detail.wallet.earned === 99950
    && detail.wallet.spent === 99800 && detail.wallet.firstLogin?.amount === 150
    && voidGrant && voidDeduct
  );
  const typingRedemption = detail?.history.find((item) =>
    item.source === "reward-redemption" && item.amount === -150 && !item.voided);
  const typingActivation = detail?.history.find((item) =>
    item.source === "reward-activation" && item.amount === 0 && !item.voided);
  const typingDeduction = detail?.history.find((item) =>
    item.source === "admin-deduct" && item.amount === -150 && !item.voided);
  const canCorrectTypingTest = adminReady && normalizeUser(chosen) === "suphitcha" && Boolean(
    detail && detail.wallet.balance === 200 && detail.wallet.earned === 500
    && detail.wallet.spent === 300 && detail.wallet.rewardOrders === 1
    && detail.wallet.firstLogin?.amount === 500 && typingRedemption
    && typingActivation && typingDeduction
  );
  async function voidSuphitchaTypingTest() {
    if (!canCorrectTypingTest || !typingRedemption || !typingActivation || !typingDeduction
      || !typingTestConfirm || voidSaving) return;
    setVoidSaving(true); setError("");
    try {
      const result = await request("void-suphitcha-typing-test", {
        targetUsername: chosen, redemptionHistoryId: typingRedemption.id,
        activationHistoryId: typingActivation.id, deductionHistoryId: typingDeduction.id,
      });
      setTypingTestConfirm(false);
      setNotice(result.alreadyApplied
        ? "รายการทดลองนี้ได้รับการแก้ไขแล้ว ไม่มีการปรับซ้ำ"
        : "ยกเลิกการทดสอบ Typing Relief และปรับลด Sparks แล้ว · คงเหลือ 500 · ได้รับสะสม 500 · ใช้ไป 0");
      setRevision((value) => value + 1);
      window.dispatchEvent(new Event("qa:sparks-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ไม่สามารถยกเลิกรายการทดสอบได้");
      setTypingTestConfirm(false);
    } finally { setVoidSaving(false); }
  }

  async function voidChachiyaTestRecords() {
    if (!canCorrectTest || !voidGrant || !voidDeduct || !voidConfirm || voidSaving) return;
    setVoidSaving(true); setError("");
    try {
      const result = await request("void-chachiya-test-pair", {
        targetUsername: chosen, addHistoryId: voidGrant.id, deductHistoryId: voidDeduct.id,
      });
      setVoidConfirm(false);
      setNotice(result.alreadyApplied
        ? "รายการทดลองนี้ได้รับการแก้ไขแล้ว ไม่มีการปรับซ้ำ"
        : "ยกเลิกรายการทดลอง +99,800 / -99,800 แล้ว · คงเหลือ 150 · ได้รับสะสม 150 · ใช้ไป 0");
      setRevision((value) => value + 1);
      window.dispatchEvent(new Event("qa:sparks-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ไม่สามารถยกเลิกรายการทดลองได้");
      setVoidConfirm(false);
    } finally { setVoidSaving(false); }
  }


  async function submitReauth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reauthLoading || !reauthPassword) return;
    setReauthLoading(true);
    setReauthError("");
    try {
      await request("reauth", { password: reauthPassword });
      setReauthPassword("");
      setNeedsReauth(false);
      setRevision((value) => value + 1);
    } catch (reason) {
      setReauthError(reason instanceof Error ? reason.message : "ยืนยันรหัสผ่าน QA ไม่สำเร็จ");
    } finally {
      setReauthLoading(false);
    }
  }
  function startOperation(kind: Operation, item?: AdminHistoryItem) {
    if (!adminReady) return;
    setOperation(kind);
    setAmount(kind === "refund" && item ? String(-item.amount) : "");
    setReferenceId(kind === "refund" ? String(item?.id || "") : "");
    setReason("");
    setRequestId(createRequestId());
    setConfirm(false);
    setNotice("");
    setError("");
  }
  function cancelOperation() {
    if (saving) return;
    setOperation(null);
    setConfirm(false);
  }
  function beginConfirmation() {
    const value = Number(amount);
    if (!chosen || !operation) return;
    if (reason.trim().length < 5) { setError("กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร"); return; }
    if (operation !== "refund" && (!Number.isSafeInteger(value) || value < 1 || value > 100000)) {
      setError("ระบุจำนวน Sparks ตั้งแต่ 1–100,000"); return;
    }
    if (operation === "deduct" && value > (detail?.wallet.balance || 0)) {
      setError("จำนวน Sparks ที่จะปรับลดมากกว่ายอดคงเหลือ"); return;
    }
    setError("");
    setConfirm(true);
  }
  async function submit() {
    if (!adminReady || !operation || !chosen || !confirm || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await request("adjust", {
        targetUsername: chosen, operation, amount: Number(amount), reason: reason.trim(), referenceId, requestId,
      });
      setNotice(result.alreadyApplied ? "รายการนี้ถูกบันทึกไว้แล้ว ไม่ได้ทำรายการซ้ำ" : "บันทึก " + operationLabel(operation) + " สำเร็จ");
      setOperation(null);
      setConfirm(false);
      setRevision((value) => value + 1);
      window.dispatchEvent(new Event("qa:sparks-updated"));
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "บันทึก Sparks ไม่สำเร็จ");
      setConfirm(false);
    } finally { setSaving(false); }
  }

  useEffect(() => {
    if (!panelActive || adminSection !== "settings") return;
    const key = actorUsername + ":" + sessionId + ":" + priceRevision;
    if (priceLoadedKey.current === key && trueMoneyPriceLoaded) return;
    let active = true;
    setPriceLoading(true); setPriceError(""); setTrueMoneyPriceLoaded(false);
    void request("get-truemoney-price").then(result => {
      if (active) { setTrueMoneyPrice(String(result.price)); setLoadedTrueMoneyPrice(Number(result.price)); setTrueMoneyPriceLoaded(true); priceLoadedKey.current = key; }
    }).catch(reason => { if (active) setPriceError(reason instanceof Error ? reason.message : "โหลดราคาไม่สำเร็จ กรุณากดลองใหม่"); })
      .finally(() => { if (active) setPriceLoading(false); });
    return () => { active = false; };
  }, [panelActive, adminSection, request, actorUsername, sessionId, priceRevision]);
  const saveTrueMoneyPrice=async()=>{
    const price=Number(trueMoneyPrice);
    if(!Number.isSafeInteger(price)||price<1||price>1000000){setError("ราคาต้องเป็นจำนวนเต็มตั้งแต่ 1–1,000,000 Sparks");return;}
    setTrueMoneyPriceBusy(true);setError("");setNotice("");
    try{
      const result=await request("set-truemoney-price",{price});
      setTrueMoneyPrice(String(result.price));
      setLoadedTrueMoneyPrice(Number(result.price));
      setNotice("บันทึกราคา TrueMoney 20 THB เป็น "+Number(result.price).toLocaleString("en-US")+" Sparks / Item แล้ว");
      window.dispatchEvent(new Event("qa:truemoney-price-updated"));
    }catch(e){setError(e instanceof Error?e.message:"บันทึกราคาไม่สำเร็จ");}
    finally{setTrueMoneyPriceBusy(false);}
  };
  return <div className="qa-sparks-admin sa-workspace" aria-label="Sparks Admin Management">
    <div className="qa-sparks-admin-header">
      <div><h2>จัดการ QA Sparks</h2><p>คำขอรางวัล · คะแนนผู้ใช้งาน · ตั้งค่ารางวัล · ประวัติการจัดการ</p></div>
      {adminSection === "points" || adminSection === "activity" ? <button type="button" onClick={() => setRevision((x) => x + 1)} disabled={loading}>รีเฟรชข้อมูล</button> : <span className={"sa-admin-status" + (adminReady ? " ready" : "")}>{adminReady ? "สิทธิ์ผู้ดูแลพร้อมใช้งาน" : loading ? "กำลังตรวจสิทธิ์ผู้ดูแล..." : "ตรวจสิทธิ์เมื่อทำรายการ"}</span>}
    </div>
    {error && (adminSection !== "requests" || needsReauth) ? <div role="alert" className="qa-sparks-inline-error">{error}</div> : null}
    {needsReauth ? <form className="qa-sparks-admin-reauth" onSubmit={(event) => { void submitReauth(event); }}>
      <div><strong>ยืนยันสิทธิ์ Sparks Admin</strong><p>กรอกรหัสผ่านที่ใช้ Login QA Dashboard ปัจจุบัน 1 ครั้ง เพื่อยืนยันสิทธิ์ผู้ดูแล</p></div>
      <label htmlFor="qa-sparks-admin-reauth-password">รหัสผ่าน QA</label>
      <div className="qa-sparks-admin-reauth-controls">
        <input id="qa-sparks-admin-reauth-password" type="password" autoComplete="current-password" value={reauthPassword}
          onChange={(event) => setReauthPassword(event.target.value)} disabled={reauthLoading} required maxLength={512} placeholder="รหัสผ่าน QA Dashboard"/>
        <button type="submit" disabled={reauthLoading || !reauthPassword}>{reauthLoading ? "กำลังยืนยัน..." : "ยืนยันสิทธิ์"}</button>
      </div>
      {reauthError ? <p role="alert" className="qa-sparks-admin-reauth-error">{reauthError}</p> : null}
    </form> : null}
    {adminSection !== "requests" && !adminReady && !loading && !needsReauth ? <div role="status" className="qa-sparks-admin-readonly">{firestoreLimited
      ? "โควตา Firestore อาจเต็มหรือระบบถูกจำกัดอัตราการเรียกข้อมูลชั่วคราว เพื่อป้องกันการเรียกข้อมูลซ้ำ ระบบหยุดโหลด Wallet และ History เพิ่มเติมแล้ว ตรวจยอดที่ Firebase Console → Firestore → Usage ก่อน แล้วค่อยกดรีเฟรชเมื่อระบบพร้อม"
      : "ยังไม่สามารถเพิ่มหรือคืน Sparks ได้จนกว่าเซิร์ฟเวอร์จะยืนยันสิทธิ์ผู้ดูแลสำเร็จ รายชื่อด้านล่างมาจาก QA User Management แบบอ่านอย่างเดียว"}</div> : null}
    {notice ? <div role="status" className="qa-sparks-admin-success">{notice}</div> : null}
    <nav className="sa-workspace-tabs" aria-label="งานของผู้ดูแล">
      {([["requests", "คำขอรางวัล"], ["points", "จัดการคะแนน"], ["settings", "ตั้งค่ารางวัล"], ["activity", "ประวัติการจัดการ"]] as const).map(([key, label]) => <button key={key} type="button" data-sparks-admin-section={key} aria-pressed={adminSection === key} onClick={() => { setAdminSection(key); setNotice(""); }}>{label}</button>)}
    </nav>
    <div hidden={adminSection !== "requests"}><SparksRewardRequests actorUsername={actorUsername} sessionId={sessionId} onReauth={requestReauth}/></div>
    <section hidden={adminSection !== "settings"} aria-label="ตั้งค่าราคารางวัล TrueMoney 20 THB" className="sa-settings">
      <div className="sa-section-head"><div><h3>ตั้งค่ารางวัล</h3><p>เปลี่ยนคะแนนที่ใช้แลก โดยระบุรางวัลให้ชัดเจน</p></div><button type="button" className="sa-secondary" disabled={priceLoading || trueMoneyPriceBusy} onClick={() => setPriceRevision(value => value + 1)}>รีเฟรชราคา</button></div>
      <div className="sa-settings-grid"><section className="sa-box"><div className="sa-product-title"><span className="sa-brand sa-brand-truemoney-20" aria-hidden="true">T</span><div><h3>TrueMoney 20 บาท</h3><p>{trueMoneyPriceLoaded ? "ราคาที่บันทึก " + fmt(loadedTrueMoneyPrice ?? 0) + " Sparks / Item" : priceLoading ? "กำลังโหลดราคา..." : "ยังโหลดราคาไม่สำเร็จ"}</p></div></div>
        <label className="sa-field" htmlFor="qa-truemoney-admin-price">Sparks ที่ใช้แลก 1 Item</label>
        <div className="sa-price-controls"><input id="qa-truemoney-admin-price" type="number" min="1" max="1000000" step="1" value={trueMoneyPrice} onChange={event => setTrueMoneyPrice(event.target.value)} disabled={!adminReady || !trueMoneyPriceLoaded || trueMoneyPriceBusy}/>
          <button type="button" className="sa-primary" onClick={() => void saveTrueMoneyPrice()} disabled={!adminReady || !trueMoneyPriceLoaded || trueMoneyPriceBusy}>{trueMoneyPriceBusy ? "กำลังบันทึก..." : "บันทึกราคา TrueMoney"}</button></div>
        <p className="sa-muted">ราคาใหม่มีผลกับการแลกครั้งถัดไป Item ที่แลกไปแล้วใช้เงื่อนไขเดิม</p>
        {!adminReady ? <p className="sa-muted">ต้องยืนยันสิทธิ์ผู้ดูแลก่อนบันทึกราคา</p> : null}
        {priceError ? <p role="alert" className="sa-error">{priceError} · กดรีเฟรชราคาเพื่อลองอีกครั้ง</p> : null}
      </section><section className="sa-box"><h3>เงื่อนไข TrueMoney ปัจจุบัน</h3><dl className="sa-details"><div><dt>มูลค่ารางวัล</dt><dd>20 บาท / Item</dd></div><div><dt>อายุ Item</dt><dd>30 วันจากวันที่แลก</dd></div><div><dt>ระยะเวลารับเงิน</dt><dd>14 วันทำการ<br/>ไม่รวมเสาร์–อาทิตย์</dd></div><div><dt>ข้อมูลรับเงิน</dt><dd>เบอร์ TrueMoney 10 หลัก</dd></div></dl></section></div>
    </section>
    <div hidden={adminSection !== "points" && adminSection !== "activity"}>
      <div className="sa-section-head"><div><h3>{adminSection === "activity" ? "ประวัติการจัดการรายผู้ใช้งาน" : "จัดการคะแนนรายผู้ใช้งาน"}</h3><p>{adminSection === "activity" ? "เลือกผู้ใช้งานเพื่อตรวจวันเวลา ผู้ดำเนินการ และเหตุผลจากประวัติที่บันทึกไว้" : "เลือกผู้ใช้งานเพื่อเพิ่ม หัก หรือเปิดดูประวัติ Sparks"}</p></div></div>
    <div className="qa-sparks-admin-layout">
      <section className="qa-sparks-admin-users">
        <label htmlFor="qa-sparks-admin-search">ค้นหาผู้ใช้งาน</label>
        <input id="qa-sparks-admin-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ชื่อ / Username / Role"/>
        <div className="qa-sparks-admin-list" role="list" aria-label="รายชื่อผู้ใช้งาน">
          {filteredUsers.map((user) => <button key={user.username} type="button" role="listitem" aria-current={chosen === user.username}
            className={chosen === user.username ? "selected" : ""} onClick={() => { setChosen(user.username); setOperation(null); setVoidConfirm(false); setTypingTestConfirm(false); setFilter("all"); setNotice(""); }}>
            <span className="qa-sparks-admin-user-title">{user.displayName}<small>@{user.username} · {user.role || "User"}</small></span>
            <span className="qa-sparks-admin-user-balance">{adminReady || user.balanceKnown ? fmt(user.balance) : "—"} <small>Sparks{!adminReady && user.balanceKnown ? " · แคช" : ""}</small></span>
          </button>)}
          {!loading && filteredUsers.length === 0 ? <p className="qa-sparks-admin-empty">ไม่พบ User</p> : null}
          {loading ? <p className="qa-sparks-admin-empty">กำลังโหลดรายชื่อ...</p> : null}
        </div>
      </section>
      <section className="qa-sparks-admin-detail">
        {!selected ? <p className="qa-sparks-admin-empty">เลือก User เพื่อดูรายละเอียด</p> : <>
          <div className="qa-sparks-admin-detail-top">
            <div><h3>{selected.displayName}</h3><p>@{selected.username} · {selected.role}</p></div>
            <span className="qa-sparks-admin-status">{selected.status || "Active"}</span>
          </div>
          {!adminReady ? <p className="qa-sparks-admin-cached-indicator">{selected.balanceKnown
            ? "ยอดที่เคยโหลดไว้ ไม่ใช่ยอดเรียลไทม์" + (selected.balanceAsOf ? " · ข้อมูล ณ " + thaiDate(selected.balanceAsOf) : " · ไม่ทราบเวลาล่าสุด")
            : "ยังไม่มีข้อมูลแต้มในเครื่องของ User นี้ ต้องรอ Firestore กลับมาใช้งานจึงจะตรวจยอดจริงได้"}</p> : null}
          <div hidden={adminSection === "activity"}>
          <div className="qa-sparks-admin-metrics">
            <div><span>คงเหลือ</span><strong>{detail ? fmt(detail.wallet.balance) : adminReady || selected.balanceKnown ? fmt(selected.balance) : "—"}</strong></div>
            <div><span>ได้รับสะสม</span><strong>{detail ? fmt(detail.wallet.earned) : adminReady || selected.balanceKnown ? fmt(selected.earned) : "—"}</strong></div>
            <div><span>ใช้ไป</span><strong>{detail ? fmt(detail.wallet.spent) : adminReady || selected.balanceKnown ? fmt(selected.spent) : "—"}</strong></div>
            <div><span>รายการแลก</span><strong>{detail ? fmt(detail.wallet.rewardOrders) : adminReady || selected.balanceKnown ? fmt(selected.rewardOrders) : "—"}</strong></div>
          </div>
          <div className="qa-sparks-admin-operations">
            <button type="button" disabled={!adminReady || detailLoading} title={!adminReady ? "ต้องยืนยันสิทธิ์ผู้ดูแลก่อนปรับคะแนน" : ""} onClick={() => startOperation("add")}>+ เพิ่ม Sparks</button>
            <button type="button" disabled={!adminReady || detailLoading} title={!adminReady ? "ต้องยืนยันสิทธิ์ผู้ดูแลก่อนปรับคะแนน" : ""} onClick={() => startOperation("deduct")}>− ปรับลด Sparks</button>
            {canCorrectTest ? <button type="button" data-sparks-correction="chachiya" className="qa-sparks-admin-void-test"
              onClick={() => { setError(""); setVoidConfirm(true); }}>ยกเลิกรายการทดลอง +99,800 / −99,800</button> : null}
            {canCorrectTypingTest ? <button type="button" data-sparks-correction="suphitcha" className="qa-sparks-admin-void-test"
              onClick={() => { setError(""); setTypingTestConfirm(true); }}>ยกเลิกการทดสอบ Typing Relief / −150 Sparks</button> : null}
          </div>
          <button type="button" className="sa-secondary" onClick={() => setAdminSection("activity")}>ประวัติคะแนนของผู้ใช้งานนี้</button>
          </div>
          <div hidden={adminSection !== "activity"}>
          <div className="qa-sparks-admin-history-heading">
            <h3>ประวัติคะแนนและการแลกรางวัล</h3>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="กรองประวัติคะแนน">
              <option value="all">ทั้งหมด</option><option value="earn">ได้รับ (+)</option><option value="spend">ใช้ไป (−)</option><option value="redeem">การแลกรางวัล / คืนคะแนน</option>
            </select>
          </div>
          {detailLoading ? <p className="qa-sparks-admin-empty">กำลังโหลด History...</p> : null}
          {!detailLoading && history.length === 0 && !firestoreLimited ? <p className="qa-sparks-admin-empty">ยังไม่มีรายการตามตัวกรอง</p> : null}
          {firestoreLimited ? <p className="qa-sparks-admin-empty">ประวัติล่าสุดยังตรวจสอบไม่ได้ระหว่างที่ Firestore เกินโควตา</p> : null}
          <div className="qa-sparks-admin-history-list">
            {history.map((entry) => <article className="qa-sparks-admin-history-row" key={entry.id}>
              <div><strong>{entry.title}</strong><small>{thaiDate(entry.createdAt)}</small>
                <p>{entry.detail || "—"}{entry.performedBy ? " · โดย " + entry.performedBy : ""}</p>
                {entry.reason && entry.reason !== entry.detail ? <p>เหตุผล: {entry.reason}</p> : null}
                {entry.referenceId ? <small>อ้างอิง: {entry.referenceId}</small> : null}
                {entry.status ? <small>สถานะ: {entry.status}</small> : null}
              </div>
              <div className="qa-sparks-admin-history-amount"><strong className={entry.amount >= 0 ? "positive" : "negative"}>{entry.amount > 0 ? "+" : ""}{fmt(entry.amount)}</strong><small>เหลือ {fmt(entry.balanceAfter)}</small>
                {entry.source === "reward-redemption" && entry.amount < 0 && !refundedIds.has(entry.id) ?
                  <button type="button" disabled={!adminReady} onClick={() => startOperation("refund", entry)}>คืน Sparks</button> : null}
              </div>
            </article>)}
          </div>
          {detail?.truncated ? <p className="qa-sparks-admin-limit">แสดงประวัติส่วนล่าสุดที่ระบบดึงได้ อาจมีรายการเก่ากว่านี้</p> : null}
          </div>
        </>}
      </section>
    </div>
    </div>
    {typingTestConfirm && selected && canCorrectTypingTest ? <div className="qa-sparks-admin-overlay" role="presentation">
      <section className="qa-sparks-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="qa-sparks-typing-reset-title">
        <h2 id="qa-sparks-typing-reset-title">ยืนยันคืนยอดก่อนทดลอง Typing Relief</h2>
        <p>บัญชี: <strong>Suphitcha Keawliam (@Suphitcha)</strong></p>
        <p>ยกเลิกผลคะแนนของรายการ <strong>Typing Relief Redeemed −150</strong>,
          <strong> Typing Relief Activated 0</strong> และ <strong>Admin Deducted −150</strong>
          โดยเก็บประวัติทั้งหมดไว้เป็นหลักฐาน</p>
        <div className="qa-sparks-admin-confirm">
          <p><strong>ยอดหลังยืนยัน</strong></p>
          <p>คงเหลือ <strong>500 Sparks</strong> · ได้รับสะสม <strong>500 Sparks</strong> · ใช้ไป <strong>0 Sparks</strong> · รายการแลก <strong>0</strong></p>
          <p>คงรางวัล First Login 500 Sparks และ Member Level ตามคะแนนจริง ไม่แก้ย้อนหลังผลภารกิจ QA Access ที่เคยใช้สิทธิ์ไปแล้ว</p>
        </div>
        <div className="qa-sparks-admin-actions">
          <button type="button" className="secondary" onClick={() => setTypingTestConfirm(false)} disabled={voidSaving}>ยกเลิก</button>
          <button type="button" onClick={() => { void voidSuphitchaTypingTest(); }} disabled={voidSaving}>
            {voidSaving ? "กำลังตรวจสอบและแก้ไข..." : "ยืนยันคืนยอด 500 Sparks"}
          </button>
        </div>
      </section>
    </div> : null}
    {voidConfirm && selected && canCorrectTest ? <div className="qa-sparks-admin-overlay" role="presentation">
      <section className="qa-sparks-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="qa-sparks-void-title">
        <h2 id="qa-sparks-void-title">ยืนยันการแก้ไข Sparks ที่เพิ่มผิด</h2>
        <p>บัญชี: <strong>Chachiya Thawiwong (@Chachiya)</strong></p>
        <p>ยกเลิกเฉพาะคู่รายการทดลอง <strong>เพิ่ม +99,800</strong> และ <strong>ปรับลด −99,800</strong> โดยเก็บหลักฐานเดิมใน History</p>
        <div className="qa-sparks-admin-confirm">
          <p><strong>ยอดหลังยืนยัน</strong></p>
          <p>คงเหลือ <strong>150 Sparks</strong> · ได้รับสะสม <strong>150 Sparks</strong> · ใช้ไป <strong>0 Sparks</strong></p>
          <p>Member Level จะใช้ยอดสะสมจริง 150 คะแนน (LV.1) และคงรางวัล First Login ตามเดิม</p>
        </div>
        <div className="qa-sparks-admin-actions">
          <button type="button" className="secondary" onClick={() => setVoidConfirm(false)} disabled={voidSaving}>ยกเลิก</button>
          <button type="button" onClick={() => { void voidChachiyaTestRecords(); }} disabled={voidSaving}>
            {voidSaving ? "กำลังตรวจสอบและแก้ไข..." : "ยืนยันแก้ไขเฉพาะบัญชีนี้"}
          </button>
        </div>
      </section>
    </div> : null}
    {operation && selected ? <div className="qa-sparks-admin-overlay" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="qa-sparks-admin-adjust-title" className="qa-sparks-admin-dialog">
        <h2 id="qa-sparks-admin-adjust-title">{operationLabel(operation)}</h2>
        <p>บัญชี: <strong>{selected.displayName} (@{selected.username})</strong></p>
        <label htmlFor="qa-sparks-adjust-amount">จำนวน Sparks</label>
        <input id="qa-sparks-adjust-amount" type="number" min="1" max="100000" step="1" value={amount} disabled={confirm || operation === "refund" || saving} onChange={(e) => setAmount(e.target.value)}/>
        {operation === "refund" ? <p className="qa-sparks-admin-reference">อ้างอิงรายการแลก: {referenceId}</p> : null}
        <label htmlFor="qa-sparks-adjust-reason">เหตุผล (บังคับ)</label>
        <textarea id="qa-sparks-adjust-reason" rows={3} maxLength={500} value={reason} disabled={confirm || saving} onChange={(e) => setReason(e.target.value)} placeholder="ระบุเหตุผลที่เพิ่ม คืน หรือปรับลดคะแนน"/>
        {confirm ? <div className="qa-sparks-admin-confirm">
          ยืนยัน <strong>{operationLabel(operation)} {fmt(Number(amount))} Sparks</strong> ให้บัญชี {selected.displayName} ใช่หรือไม่?
          <p>ระบบจะบันทึกผู้ดำเนินการ วันที่ เวลา และเหตุผลลงใน History</p>
        </div> : null}
        {error ? <div role="alert" className="qa-sparks-inline-error">{error}</div> : null}
        <div className="qa-sparks-admin-actions">
          <button type="button" className="secondary" onClick={() => { if (confirm) setConfirm(false); else cancelOperation(); }} disabled={saving}>{confirm ? "กลับไปแก้ไข" : "ยกเลิก"}</button>
          {confirm ? <button type="button" onClick={() => { void submit(); }} disabled={saving}>{saving ? "กำลังบันทึก..." : "ยืนยันบันทึกคะแนน"}</button>
            : <button type="button" onClick={beginConfirmation}>ตรวจสอบก่อนบันทึก</button>}
        </div>
      </section>
    </div> : null}
  </div>;
}

