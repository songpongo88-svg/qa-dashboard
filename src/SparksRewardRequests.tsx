import React, { useCallback, useRef, useState } from "react";
import RewardActionConfirmModal, { type RewardConfirmation } from "./RewardActionConfirmModal";

type RequestRow = {
  requestId: string; itemId: string; username: string; displayName: string; createdAt: string; status: string;
  rewardId: string; title: string; channel: "truemoney" | "special"; phone?: string; dueDate?: string;
  amountTHB?: number; payoutTHB?: number; promptPay?: string; email?: string;
  receiptNumber?: string; receiptAt?: string; ocrStatus?: string; ocrNote?: string;
  adminNote?: string; resolvedBy?: string; resolvedAt?: string; payoutConfirmedBy?: string; payoutConfirmedAt?: string;
};
const brands = [
  ["all", "ทั้งหมด", ""], ["truemoney-20", "TrueMoney", "T"], ["punthai-65", "พันธุ์ไทย", "P"],
  ["amazon-55", "Café Amazon", "A"], ["seven-100", "7-Eleven", "7"], ["netflix-1m", "Netflix", "N"],
] as const;
type Stage = "review" | "transfer" | "send" | "done" | "rejected" | "unknown";
const stageLabels: Record<Stage, string> = { review: "รอตรวจสอบ", transfer: "รอโอนเงิน", send: "รอส่งสิทธิ์", done: "เสร็จสิ้น", rejected: "ไม่อนุมัติ", unknown: "ตรวจสอบสถานะ" };
function stage(row: RequestRow): Stage {
  if (row.status === "pending_review") return "review";
  if (row.channel === "truemoney" && row.status === "pending") return "transfer";
  if (row.status === "approved") return row.rewardId === "netflix-1m" ? "send" : "transfer";
  if (["paid", "delivered"].includes(row.status)) return "done";
  return row.status === "rejected" ? "rejected" : "unknown";
}
function dateLabel(value?: string, time = false) {
  if (!value) return "—";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T12:00:00+07:00" : value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}) }) : "—";
}
function badge(row: RequestRow) { const value = stage(row); return <span className={"sa-badge sa-status-" + value}>{stageLabels[value]}</span>; }
function brandSymbol(row: RequestRow) { return <span className={"sa-brand sa-brand-" + row.rewardId} aria-hidden="true">{brands.find(brand => brand[0] === row.rewardId)?.[2] || "S"}</span>; }
function amount(row: RequestRow) {
  if (row.rewardId === "netflix-1m") return "1 เดือน";
  const value = row.channel === "truemoney" ? row.amountTHB : row.payoutTHB;
  return Number.isFinite(value) && Number(value) > 0 ? Number(value).toLocaleString("en-US") + " บาท" : "รอตรวจยอด";
}
function actionLabel(row: RequestRow) {
  if (stage(row) === "review") return (row.rewardId === "netflix-1m" ? "อนุมัติคำขอ " : "อนุมัติคืนเงิน ") + row.title;
  if (stage(row) === "send") return "บันทึกส่งสิทธิ์ Netflix แล้ว";
  return "บันทึกโอน " + row.title + " แล้ว";
}
function errorText(error: unknown) { return error instanceof Error ? error.message : "ไม่สามารถทำรายการได้ กรุณาลองอีกครั้ง"; }

export default function SparksRewardRequests({ actorUsername, sessionId, onReauth }: { actorUsername: string; sessionId: string; onReauth: () => void }) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loaded, setLoaded] = useState<Record<"truemoney" | "special", boolean>>({ truemoney: false, special: false });
  const [incomplete, setIncomplete] = useState(false);
  const [truncated, setTruncated] = useState<Record<"truemoney" | "special", boolean>>({ truemoney: false, special: false });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [brand, setBrand] = useState("all");
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [images, setImages] = useState<Record<string, string>>({});
  const [receiptVisible, setReceiptVisible] = useState<Record<string, boolean>>({});
  const [confirmation, setConfirmation] = useState<RewardConfirmation | null>(null);
  const inFlight = useRef(false);
  const row = rows.find(item => item.channel + ":" + item.itemId === selected);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!sessionId) throw Error("ไม่พบ Session กรุณาเข้าสู่ระบบใหม่");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch("/api/sparks-admin", { method: "POST", cache: "no-store", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ action, actorUsername, sessionId, ...extra }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (result.code === "SESSION_POLICY_OUTDATED") onReauth();
        throw Error(String(result.error || "ทำรายการไม่สำเร็จ (HTTP " + response.status + ")"));
      }
      return result;
    } catch (reason) {
      if (reason instanceof Error && reason.name === "AbortError") throw Error("ระบบตอบกลับช้า อาจบันทึกสำเร็จแล้ว กรุณารีเฟรชคำขอเพื่อตรวจสถานะก่อนทำซ้ำ");
      throw reason;
    } finally { window.clearTimeout(timeout); }
  }, [actorUsername, sessionId, onReauth]);

  // One explicit refresh reuses the two existing trackers. Tabs and filters never read Firestore.
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true; setLoading(true); setError(""); setMessage("");
    const results = await call("list-reward-queues")
      .then((data) => (["truemoney", "special"] as const).map((channel) => (
        data[channel]?.ok === true
          ? { status: "fulfilled" as const, value: data[channel] }
          : { status: "rejected" as const, reason: Error(String(data[channel]?.error || "คำขอรางวัลไม่พร้อมใช้งาน")) }
      )))
      .catch((error) => (["truemoney", "special"] as const).map(() => ({ status: "rejected" as const, reason: error })));
    const errors: string[] = [];
    const updates: Partial<Record<"truemoney" | "special", RequestRow[]>> = {};
    results.forEach((result, index) => {
      const channel = index === 0 ? "truemoney" : "special";
      if (result.status === "fulfilled") {
        // TrueMoney's existing projection returns requestId, which is also its item/document ID.
        updates[channel] = (Array.isArray(result.value.requests) ? result.value.requests : []).map((item: RequestRow) => ({ ...item, itemId: item.itemId || item.requestId, channel, ...(channel === "truemoney" ? { rewardId: "truemoney-20", title: "TrueMoney 20 บาท" } : {}) }));
        setTruncated(previous => ({ ...previous, [channel]: result.value.truncated === true }));
      } else errors.push((channel === "truemoney" ? "TrueMoney: " : "รางวัลอื่น: ") + errorText(result.reason));
    });
    setRows(previous => [...(updates.truemoney || previous.filter(item => item.channel === "truemoney")), ...(updates.special || previous.filter(item => item.channel === "special"))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setLoaded(previous => ({ truemoney: updates.truemoney !== undefined || previous.truemoney, special: updates.special !== undefined || previous.special }));
    setIncomplete(errors.length > 0);
    setError(errors.join(" · ")); setLoading(false); inFlight.current = false;
  }

  async function viewReceipt(item: RequestRow) {
    if (inFlight.current) return;
    if (images[item.itemId]) { setReceiptVisible(previous => ({ ...previous, [item.itemId]: !previous[item.itemId] })); return; }
    inFlight.current = true; setSaving(true); setError("");
    try { const result = await call("special-rewards-admin-receipt", { itemId: item.itemId }); setImages(previous => ({ ...previous, [item.itemId]: result.imageData })); setReceiptVisible(previous => ({ ...previous, [item.itemId]: true })); }
    catch (reason) { setError(errorText(reason)); }
    finally { setSaving(false); inFlight.current = false; }
  }

  async function perform(decision: "approve" | "reject" | "complete") {
    if (!row || inFlight.current) return;
    if (decision === "reject" && note.trim().length < 4) { setError("ระบุเหตุผลที่ไม่อนุมัติอย่างน้อย 4 ตัวอักษร"); return; }
    const allowed = decision === "approve" ? row.channel === "special" && stage(row) === "review" : decision === "complete" ? ["transfer", "send"].includes(stage(row)) : row.channel === "special" && ["review", "transfer", "send"].includes(stage(row));
    if (!allowed) { setError("สถานะรายการเปลี่ยนไป กรุณารีเฟรชคำขอ"); return; }
    inFlight.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = row.channel === "truemoney" ? await call("mark-truemoney-paid", { itemId: row.itemId }) : await call("special-rewards-admin-action", { itemId: row.itemId, decision, note: note.trim() });
      const expected = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : row.rewardId === "netflix-1m" ? "delivered" : "paid";
      if (result.status !== expected) throw Error("เซิร์ฟเวอร์ยังไม่ยืนยันสถานะที่ต้องการ กรุณารีเฟรชคำขอเพื่อตรวจสอบ");
      setRows(previous => previous.map(item => item.channel + ":" + item.itemId === selected ? {
        ...item, status: result.status,
        ...(row.channel === "truemoney" ? {
          payoutConfirmedAt: result.paidAt || item.payoutConfirmedAt,
          payoutConfirmedBy: result.updated ? actorUsername : item.payoutConfirmedBy,
        } : {
          resolvedAt: result.resolvedAt || "",
          resolvedBy: result.updated ? actorUsername : "",
          adminNote: result.updated ? note.trim() || item.adminNote : item.adminNote,
        }),
      } : item));
      setMessage(result.alreadyApplied ? "รายการนี้ถูกดำเนินการแล้วก่อนหน้านี้ กรุณารีเฟรชเพื่อดูข้อมูลผู้บันทึก" : (decision === "reject" ? "บันทึกไม่อนุมัติ " + row.title : decision === "approve" ? "อนุมัติ " + row.title + (row.rewardId === "netflix-1m" ? " · รอส่งสิทธิ์" : " · รอโอนเงิน") : actionLabel(row)) + " · " + (row.displayName || row.username));
      setConfirmation(null);
    } catch (reason) { setError(errorText(reason)); }
    finally { setSaving(false); inFlight.current = false; }
  }
  function openConfirmation() {
    if (!row || saving) return;
    setError(""); setMessage("");
    if (row.rewardId === "netflix-1m" ? !row.email : amount(row) === "รอตรวจยอด" || !(row.phone || row.promptPay)) {
      setError("ข้อมูลผู้รับหรือยอดรางวัลไม่ครบ กรุณารีเฟรชคำขอก่อนยืนยัน");
      return;
    }
    setConfirmation({ rewardId: row.rewardId, itemName: row.title, recipientName: row.displayName || row.username, username: row.username, amountLabel: amount(row), destinationLabel: row.rewardId === "netflix-1m" ? row.email || "ไม่พบอีเมล" : row.phone || row.promptPay || "ไม่พบหมายเลขรับเงิน", requestedAt: row.createdAt, dueDate: row.dueDate, kind: row.rewardId === "netflix-1m" ? "netflix" : "money" });
  }
  const ready = loaded.truemoney && loaded.special && !incomplete;
  const visible = rows.filter(item => (brand === "all" || item.rewardId === brand) && (filter === "all" || filter === "pending" && ["review", "transfer", "send"].includes(stage(item)) || filter === stage(item)));

  return <section className="sa-requests" aria-label="คำขอรางวัล">
    {message ? <p className="sa-message" role="status">{message}</p> : null}
    {error && !confirmation ? <p className="sa-error" role="alert">{error}</p> : null}
    {row ? <>
      <button type="button" className="sa-back" disabled={saving} onClick={() => { setSelected(""); setNote(""); setError(""); }}>← กลับรายการคำขอ</button>
      <header className="sa-request-hero"><div className="sa-product-title">{brandSymbol(row)}<div><h3>{row.title}</h3><p>{row.requestId} · {row.displayName || row.username}</p></div></div>{badge(row)}</header>
      <div className="sa-request-detail">
        <section className="sa-box"><h3>ข้อมูลผู้รับ{row.rewardId === "netflix-1m" ? "สิทธิ์" : "เงิน"}</h3><dl className="sa-details">
          <div><dt>ผู้ขอรางวัล</dt><dd>{row.displayName || row.username}<small>@{row.username}</small></dd></div><div><dt>เลขคำขอ</dt><dd>{row.requestId}</dd></div><div><dt>ส่งคำขอ</dt><dd>{dateLabel(row.createdAt, true)}</dd></div>
          <div><dt>{row.rewardId === "netflix-1m" ? "อีเมลรับสิทธิ์" : row.channel === "truemoney" ? "เบอร์ TrueMoney" : "พร้อมเพย์"}</dt><dd>{row.email || row.phone || row.promptPay || "—"}</dd></div>
          {row.dueDate ? <div><dt>รับเงินภายใน</dt><dd>{dateLabel(row.dueDate)}</dd></div> : null}
          {row.receiptNumber ? <><div><dt>เลขที่ใบเสร็จ</dt><dd>{row.receiptNumber}</dd></div><div><dt>วันที่ซื้อ</dt><dd>{dateLabel(row.receiptAt)}</dd></div><div><dt>ยอดจ่ายจริง</dt><dd>{Number(row.amountTHB || 0).toLocaleString("en-US")} บาท</dd></div><div><dt>ผลตรวจ OCR</dt><dd>{row.ocrStatus || "ตรวจด้วยตนเอง"}{row.ocrNote ? <small>{row.ocrNote}</small> : null}</dd></div></> : null}
        </dl>{row.receiptNumber ? <div className="sa-receipt"><button type="button" disabled={saving} onClick={() => void viewReceipt(row)}>{receiptVisible[row.itemId] ? "ซ่อนภาพใบเสร็จ" : "ดูภาพใบเสร็จ"}</button>{receiptVisible[row.itemId] && images[row.itemId] ? <img src={images[row.itemId]} alt={"ใบเสร็จประกอบคำขอ " + row.requestId}/> : null}</div> : null}</section>
        <section className="sa-box"><h3>{stage(row) === "review" ? "ตรวจสอบคำขอ" : stage(row) === "send" ? "ส่งสิทธิ์ Netflix" : stage(row) === "transfer" ? "บันทึกผลการโอนเงิน" : "ผลการดำเนินการ"}</h3><p className="sa-payout">{amount(row)}</p><p className="sa-muted">{stage(row) === "review" ? "ตรวจหลักฐานและเงื่อนไขรางวัลก่อนอนุมัติ" : stage(row) === "send" ? "บันทึกหลังส่งสิทธิ์ให้ผู้รับเรียบร้อยแล้ว" : stage(row) === "transfer" ? "บันทึกหลังโอนเงินจริงให้ผู้รับเรียบร้อยแล้ว" : "ดำเนินการรายการนี้แล้ว"}</p>
          {["review", "transfer", "send"].includes(stage(row)) ? <>{row.channel === "special" ? <label className="sa-field">{stage(row) === "review" ? "หมายเหตุการตรวจสอบ / เหตุผลไม่อนุมัติ" : "เลขอ้างอิง / หมายเหตุ"}<textarea value={note} maxLength={350} onChange={event => setNote(event.target.value)} disabled={saving} placeholder="ระบุรายละเอียดประกอบรายการ"/></label> : null}<div className="sa-actions"><button type="button" className="sa-primary" disabled={saving} data-request-primary={row.itemId} aria-haspopup={stage(row) === "review" ? undefined : "dialog"} aria-expanded={confirmation ? true : undefined} onPointerDown={event => event.stopPropagation()} onClick={event => { event.preventDefault(); event.stopPropagation(); if (stage(row) === "review") void perform("approve"); else openConfirmation(); }}>{saving ? "กำลังบันทึก..." : actionLabel(row)}</button>{row.channel === "special" ? <button type="button" className="sa-danger" disabled={saving} onClick={() => void perform("reject")}>ไม่อนุมัติคำขอ</button> : null}</div></> : <div className={"sa-completed" + (stage(row) === "rejected" ? " sa-rejected" : "")}>{stageLabels[stage(row)]}{row.payoutConfirmedBy || row.resolvedBy ? " · โดย " + (row.payoutConfirmedBy || row.resolvedBy) : ""}{row.adminNote ? <p>{row.adminNote}</p> : null}<small>{row.payoutConfirmedAt || row.resolvedAt ? dateLabel(row.payoutConfirmedAt || row.resolvedAt, true) : "รีเฟรชคำขอเพื่อดูวันเวลาและผู้บันทึกล่าสุด"}</small></div>}
        </section>
      </div>
    </> : <>
      <div className="sa-section-head"><div><h3>คำขอรางวัล</h3><p>เลือกประเภทรางวัล แล้วเปิดรายการที่ต้องดำเนินการ</p></div><button type="button" className="sa-secondary" disabled={loading || saving} onClick={() => void refresh()}>{loading ? "กำลังโหลดคำขอ..." : loaded.truemoney || loaded.special ? "รีเฟรชคำขอ" : "โหลดคำขอรางวัล"}</button></div>
      <div className="sa-stats">{([["review", "รอตรวจสอบ"], ["transfer", "รอโอนเงิน"], ["send", "รอส่งสิทธิ์"], ["done", "ดำเนินการแล้ว"]] as const).map(([value, label]) => <div key={value}><span>{label}</span><strong>{ready ? rows.filter(item => value === "done" ? ["done", "rejected"].includes(stage(item)) : stage(item) === value).length : "—"}</strong></div>)}</div>
      {truncated.truemoney || truncated.special ? <p className="sa-muted">แสดงจำนวนจากคำขอส่วนล่าสุดที่โหลดได้ อาจมีรายการเก่ากว่านี้</p> : null}
      <div className="sa-brand-tabs" aria-label="ประเภทรางวัล">{brands.map(([value, label]) => <button key={value} type="button" aria-pressed={brand === value} onClick={() => setBrand(value)}>{label}</button>)}</div>
      <div className="sa-request-toolbar"><span>{ready ? visible.length + " รายการ" : loaded.truemoney || loaded.special ? visible.length + " รายการ · ข้อมูลยังโหลดไม่ครบ" : "ยังไม่ได้โหลดรายการ"}</span><label>สถานะ <select aria-label="สถานะคำขอ" value={filter} onChange={event => setFilter(event.target.value)}><option value="pending">รอดำเนินการ</option><option value="all">ทุกสถานะ</option>{Object.entries(stageLabels).filter(([value]) => value !== "unknown").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
      <div className="sa-table-wrap"><table className="sa-request-table"><thead><tr><th>ผู้ขอ / เลขคำขอ</th><th>รางวัล</th><th>สถานะ</th><th>ส่งคำขอ</th><th>ดำเนินการ</th></tr></thead><tbody>{visible.map(item => <tr key={item.channel + item.itemId}><td><strong>{item.displayName || item.username}</strong><small>@{item.username} · {item.requestId}</small></td><td><div className="sa-reward-cell">{brandSymbol(item)}<span>{item.title}</span></div></td><td data-label="สถานะ">{badge(item)}</td><td data-label="ส่งคำขอ">{dateLabel(item.createdAt)}</td><td><button type="button" className="sa-row-action" data-request-open={item.itemId} onClick={() => { setSelected(item.channel + ":" + item.itemId); setNote(item.adminNote || ""); setError(""); setMessage(""); }}>{stage(item) === "review" ? "ตรวจใบเสร็จ" : stage(item) === "send" ? "จัดส่งสิทธิ์ Netflix" : stage(item) === "transfer" ? "บันทึกโอน " + (brands.find(value => value[0] === item.rewardId)?.[1] || item.title) : "ดูผลการดำเนินการ"} →</button></td></tr>)}</tbody></table>{visible.length === 0 ? <p className="sa-empty">{loading ? "กำลังโหลดรายการ..." : !ready ? "กดโหลดคำขอรางวัลเพื่อดูรายการล่าสุด" : "ไม่มีคำขอในสถานะนี้"}</p> : null}</div>
    </>}
    <RewardActionConfirmModal request={confirmation} busy={saving} error={confirmation ? error : ""} onCancel={() => { if (!saving) { setConfirmation(null); setError(""); } }} onConfirm={() => void perform("complete")}/>
  </section>;
}
