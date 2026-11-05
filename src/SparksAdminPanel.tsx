import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./qaSparks.css";
import { fetchStoredUserProfiles } from "./userRoleStore";
import { getSparksAccount } from "./qaSparksStore";
import { collection, getDocs } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

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
};
type DetailResponse = {
  username: string;
  wallet: Pick<AdminUser, "balance" | "earned" | "spent" | "rewardOrders" | "firstLogin">;
  history: AdminHistoryItem[];
  truncated: boolean;
};
type Operation = "add" | "deduct" | "refund";
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
export default function SparksAdminPanel({ actorUsername, sessionId }: { actorUsername: string; sessionId: string }) {
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
  const [revision, setRevision] = useState(0);
  const [adminReady, setAdminReady] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthLoading, setReauthLoading] = useState(false);
  const [reauthError, setReauthError] = useState("");

  const request = useCallback(async (action: "list" | "history" | "adjust" | "reauth", input: Record<string, unknown> = {}) => {
    if (!sessionId) throw new Error("ไม่พบ Session ที่ถูกต้อง กรุณา Login ใหม่");
    const response = await fetch("/api/sparks-admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ action, actorUsername, sessionId, ...input }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = Object.assign(new Error(String(result.error || "ไม่สามารถโหลดข้อมูล Sparks ได้")), {
        code: String(result.code || ""),
      });
      throw error;
    }
    return result;
  }, [actorUsername, sessionId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void request("list").then((data) => {
      if (!active) return;
      const loaded = (Array.isArray(data.users) ? data.users as AdminUser[] : [])
        .filter((user) => String(user.status || "").toLowerCase() !== "suspended");
      setUsers(loaded);
      setAdminReady(true);
      setNeedsReauth(false);
      setReauthPassword("");
      setReauthError("");
      setChosen((previous) => loaded.some((row) => row.username === previous) ? previous : (loaded[0]?.username || ""));
      setError("");
    }).catch(async (reason) => {
      if (!active) return;
      setAdminReady(false);
      const policyMismatch = (reason as Error & { code?: string })?.code === "SESSION_POLICY_OUTDATED";
      setNeedsReauth(policyMismatch);
      const message = reason instanceof Error ? reason.message : "บริการ Sparks Admin เชื่อมต่อไม่สำเร็จ";
      setError(policyMismatch
        ? "กรุณายืนยันรหัสผ่าน QA อีกครั้ง เพื่อเปิดสิทธิ์จัดการ Sparks (ไม่ต้อง Logout)"
        : "ระบบจัดการคะแนนยังไม่พร้อม: " + message + " — แสดงรายชื่อจาก QA User Management แบบอ่านอย่างเดียว");
      try {
        const profiles = await fetchStoredUserProfiles();
        const wallets = new Map<string, any>();
        try {
          const rows = await getDocs(collection(firebaseDb, "qa_sparks_wallets"));
          rows.docs.forEach((doc) => {
            const data = doc.data();
            wallets.set(String(data.username || decodeURIComponent(doc.id)).trim().toLowerCase(), data);
          });
        } catch {
          // Keep the QA user directory visible even when wallet reads are unavailable.
        }
        if (!active) return;
        const fallbackUsers = profiles.filter((profile) => String(profile.status || "").toLowerCase() !== "suspended").map((profile) => {
          const wallet = wallets.get(profile.username.trim().toLowerCase());
          return {
            username: profile.username,
            displayName: profile.displayName || profile.agentName || profile.username,
            role: profile.role,
            status: profile.status,
            balance: Number(wallet?.balance) || 0,
            earned: Number(wallet?.totalEarned) || Number(wallet?.firstLogin?.amount) || 0,
            spent: Number(wallet?.totalSpent) || 0,
            rewardOrders: Number(wallet?.rewardOrders) || 0,
            firstLogin: wallet?.firstLogin || null,
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
  }, [request, revision]);

  useEffect(() => {
    let active = true;
    if (!chosen) { setDetail(null); return; }
    setDetailLoading(true);
    setDetail(null);
    void request("history", { targetUsername: chosen }).then((data) => {
      if (active) { setDetail(data as DetailResponse); setError(""); }
    }).catch(async (reason) => {
      if (!active) return;
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
  }, [request, chosen, revision]);

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

  return <div className="qa-sparks-admin" aria-label="Sparks Admin Management">
    <div className="qa-sparks-admin-header">
      <div><h2>Sparks Admin Management</h2><p>ดูยอดและประวัติคะแนนของผู้ใช้งาน พร้อมจัดการคะแนนโดยบันทึกเหตุผลทุกครั้ง</p></div>
      <button type="button" onClick={() => setRevision((x) => x + 1)} disabled={loading}>รีเฟรชข้อมูล</button>
    </div>
    {error ? <div role="alert" className="qa-sparks-inline-error">{error}</div> : null}
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
    {!adminReady && !loading && !needsReauth ? <div role="status" className="qa-sparks-admin-readonly">ยังไม่สามารถเพิ่มหรือคืน Sparks ได้จนกว่าเซิร์ฟเวอร์จะยืนยันสิทธิ์ผู้ดูแลสำเร็จ รายชื่อด้านล่างมาจาก QA User Management แบบอ่านอย่างเดียว</div> : null}
    {notice ? <div role="status" className="qa-sparks-admin-success">{notice}</div> : null}
    <div className="qa-sparks-admin-layout">
      <section className="qa-sparks-admin-users">
        <label htmlFor="qa-sparks-admin-search">ค้นหา User</label>
        <input id="qa-sparks-admin-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ชื่อ / Username / Role"/>
        <div className="qa-sparks-admin-list" role="list" aria-label="รายชื่อผู้ใช้งาน">
          {filteredUsers.map((user) => <button key={user.username} type="button" role="listitem" aria-current={chosen === user.username}
            className={chosen === user.username ? "selected" : ""} onClick={() => { setChosen(user.username); setOperation(null); setFilter("all"); setNotice(""); }}>
            <span className="qa-sparks-admin-user-title">{user.displayName}<small>@{user.username} · {user.role || "User"}</small></span>
            <span className="qa-sparks-admin-user-balance">{adminReady ? fmt(user.balance) : "—"} <small>Sparks</small></span>
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
          <div className="qa-sparks-admin-metrics">
            <div><span>คงเหลือ</span><strong>{detail ? fmt(detail.wallet.balance) : adminReady ? fmt(selected.balance) : "—"}</strong></div>
            <div><span>ได้รับสะสม</span><strong>{detail ? fmt(detail.wallet.earned) : adminReady ? fmt(selected.earned) : "—"}</strong></div>
            <div><span>ใช้ไป</span><strong>{detail ? fmt(detail.wallet.spent) : adminReady ? fmt(selected.spent) : "—"}</strong></div>
            <div><span>รายการแลก</span><strong>{detail ? fmt(detail.wallet.rewardOrders) : adminReady ? fmt(selected.rewardOrders) : "—"}</strong></div>
          </div>
          <div className="qa-sparks-admin-operations">
            <button type="button" disabled={!adminReady || detailLoading} title={!adminReady ? "ต้องแก้การเชื่อมต่อ Google Cloud ก่อน" : ""} onClick={() => startOperation("add")}>+ เพิ่ม Sparks</button>
            <button type="button" disabled={!adminReady || detailLoading} title={!adminReady ? "ต้องแก้การเชื่อมต่อ Google Cloud ก่อน" : ""} onClick={() => startOperation("deduct")}>− ปรับลด Sparks</button>
          </div>
          <div className="qa-sparks-admin-history-heading">
            <h3>ประวัติคะแนนและการแลกรางวัล</h3>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="กรองประวัติคะแนน">
              <option value="all">ทั้งหมด</option><option value="earn">ได้รับ (+)</option><option value="spend">ใช้ไป (−)</option><option value="redeem">การแลกรางวัล / คืนคะแนน</option>
            </select>
          </div>
          {detailLoading ? <p className="qa-sparks-admin-empty">กำลังโหลด History...</p> : null}
          {!detailLoading && history.length === 0 ? <p className="qa-sparks-admin-empty">ยังไม่มีรายการตามตัวกรอง</p> : null}
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
        </>}
      </section>
    </div>
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
