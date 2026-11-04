import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./qaSparks.css";

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

  const request = useCallback(async (action: "list" | "history" | "adjust", input: Record<string, unknown> = {}) => {
    if (!sessionId) throw new Error("ไม่พบ Session ที่ถูกต้อง กรุณา Login ใหม่");
    const response = await fetch("/api/sparks-admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ action, actorUsername, sessionId, ...input }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(result.error || "ไม่สามารถโหลดข้อมูล Sparks ได้"));
    return result;
  }, [actorUsername, sessionId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void request("list").then((data) => {
      if (!active) return;
      const loaded = Array.isArray(data.users) ? data.users as AdminUser[] : [];
      setUsers(loaded);
      setChosen((previous) => loaded.some((row) => row.username === previous) ? previous : (loaded[0]?.username || ""));
      setError("");
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "ไม่สามารถโหลดรายชื่อ User ได้");
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
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "โหลดประวัติไม่สำเร็จ");
    }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [request, chosen, revision]);

  const selected = users.find((user) => user.username === chosen);
  const filteredUsers = useMemo(() => users.filter((user) => (
    user.username + " " + user.displayName + " " + user.role
  ).toLocaleLowerCase().includes(search.toLocaleLowerCase())), [search, users]);
  const history = (detail?.history || []).filter((entry) => {
    if (filter === "all") return true;
    if (filter === "redeem") return ["reward-redemption", "reward-refund"].includes(entry.source);
    return entry.type === filter;
  });
  const refundedIds = new Set((detail?.history || []).filter((item) => item.source === "reward-refund").map((item) => item.referenceId));

  function startOperation(kind: Operation, item?: AdminHistoryItem) {
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
    if (!operation || !chosen || !confirm || saving) return;
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
    {notice ? <div role="status" className="qa-sparks-admin-success">{notice}</div> : null}
    <div className="qa-sparks-admin-layout">
      <section className="qa-sparks-admin-users">
        <label htmlFor="qa-sparks-admin-search">ค้นหา User</label>
        <input id="qa-sparks-admin-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ชื่อ / Username / Role"/>
        <div className="qa-sparks-admin-list" role="list" aria-label="รายชื่อผู้ใช้งาน">
          {filteredUsers.map((user) => <button key={user.username} type="button" role="listitem" aria-current={chosen === user.username}
            className={chosen === user.username ? "selected" : ""} onClick={() => { setChosen(user.username); setOperation(null); setFilter("all"); setNotice(""); }}>
            <span className="qa-sparks-admin-user-title">{user.displayName}<small>@{user.username} · {user.role || "User"}</small></span>
            <span className="qa-sparks-admin-user-balance">{fmt(user.balance)} <small>Sparks</small></span>
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
            <div><span>คงเหลือ</span><strong>{fmt(detail?.wallet.balance ?? selected.balance)}</strong></div>
            <div><span>ได้รับสะสม</span><strong>{fmt(detail?.wallet.earned ?? selected.earned)}</strong></div>
            <div><span>ใช้ไป</span><strong>{fmt(detail?.wallet.spent ?? selected.spent)}</strong></div>
            <div><span>รายการแลก</span><strong>{fmt(detail?.wallet.rewardOrders ?? selected.rewardOrders)}</strong></div>
          </div>
          <div className="qa-sparks-admin-operations">
            <button type="button" onClick={() => startOperation("add")}>+ เพิ่ม Sparks</button>
            <button type="button" onClick={() => startOperation("deduct")}>− ปรับลด Sparks</button>
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
                  <button type="button" onClick={() => startOperation("refund", entry)}>คืน Sparks</button> : null}
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
        <div className="qa-sparks-admin-actions">
          <button type="button" className="secondary" onClick={() => { if (confirm) setConfirm(false); else cancelOperation(); }} disabled={saving}>{confirm ? "กลับไปแก้ไข" : "ยกเลิก"}</button>
          {confirm ? <button type="button" onClick={() => { void submit(); }} disabled={saving}>{saving ? "กำลังบันทึก..." : "ยืนยันบันทึกคะแนน"}</button>
            : <button type="button" onClick={beginConfirmation}>ตรวจสอบก่อนบันทึก</button>}
        </div>
      </section>
    </div> : null}
  </div>;
}
