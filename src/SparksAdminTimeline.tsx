import React, { useEffect, useMemo, useState } from "react";
import { isItemHistoryEntry, itemHistoryLabel, itemHistoryDeltaText } from "./sparksItemHistory.mjs";
import "./sparksAdminTimeline.css";
import {transactionText} from "./sparksTransactionText.mjs";

type TimelineUser = { username: string; displayName: string; role: string; teamName?: string; status: string };
type Entry = {
  username: string; id: string; createdAt: string; title: string; detail: string; type: string;
  source: string; amount: number; balanceAfter: number | null; rewardId?: string; itemId?: string;
  inventoryAfter?: number; challengeId?: string; drawDate?: string; performedBy?: string;
  status?: string; reason?: string; referenceId?: string; voided?: boolean; derived?: boolean;
};
type Result = { ok: boolean; total: number; rows: Entry[] };
type Filter = { startDate: string; endDate: string; category: string; team: string; user: string; search: string };
type Props = {
  active: boolean; users: TimelineUser[]; revision: number;
  request: (action: "timeline", input: Record<string, unknown>) => Promise<any>;
  onOpenUser: (username: string) => void;
};
const blank: Filter = { startDate: "", endDate: "", category: "all", team: "all", user: "all", search: "" };
const PAGE_SIZE = 50;
const number = (value: number) => Number(value || 0).toLocaleString("en-US");
const parts = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const fields = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(date);
  const part = (name: string) => fields.find(p => p.type === name)?.value || "";
  return { day: part("year") + "-" + part("month") + "-" + part("day"), date };
};
const dayLabel = (value: string) => new Date(value + "T12:00:00+07:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
const clock = (value: string) => new Date(value).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });
function typeLabel(entry: Entry) {
  if (entry.voided) return "ยกเลิกรายการ";
  if(entry.source==="reward-refund")return "คืน Sparks";
  const item = itemHistoryLabel(entry);
  if (item) return item.action;
  return entry.amount > 0 ? "ได้รับ Sparks" : entry.amount < 0 ? "ใช้ Sparks" : "บันทึกกิจกรรม";
}
export default function SparksAdminTimeline({ active, users, revision, request, onOpenUser }: Props) {
  const [draft, setDraft] = useState<Filter>(blank);
  const [filters, setFilters] = useState<Filter>(blank);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Result>({ ok: true, rows: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const teams = useMemo(() => [...new Set(users.map(user => String(user.teamName || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th")), [users]);
  const eligible = useMemo(() => users.filter(user =>
    String(user.status || "").toLowerCase() !== "suspended" &&
    (filters.team === "all" || user.teamName === filters.team) &&
    (filters.user === "all" || user.username === filters.user)
  ), [filters.team, filters.user, users]);
  const usernameKey = eligible.map(user => user.username.trim().toLowerCase()).sort().join("|");
  const names = useMemo(() => usernameKey.split("|").filter(Boolean), [usernameKey]);
  const nameByUsername = useMemo(() => new Map(users.map(u => [u.username.trim().toLowerCase(), u])), [users]);
  const payload = (offset: number, pageSize: number): Record<string, unknown> => ({
    usernames: names, startDate: filters.startDate, endDate: filters.endDate,
    category: filters.category, search: filters.search, offset, pageSize,
  });
  useEffect(() => {
    if (!active) return;
    let alive = true;
    if (!names.length) { setResult({ ok: true, total: 0, rows: [] }); setLoading(false); setError(""); return; }
    setLoading(true); setError("");
    void request("timeline", payload(page * PAGE_SIZE, PAGE_SIZE))
      .then((data: Result) => { if (alive) setResult({ ok: true, total: Number(data.total || 0), rows: Array.isArray(data.rows) ? data.rows : [] }); })
      .catch((e: unknown) => { if (alive) { setResult({ ok: true, total: 0, rows: [] }); setError(e instanceof Error ? e.message : "อ่าน Timeline ไม่สำเร็จ"); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [active, usernameKey, filters, page, revision, request]);
  const groups = useMemo(() => {
    const items = new Map<string, Entry[]>();
    for (const entry of result.rows) {
      const key = parts(entry.createdAt)?.day || "ไม่ทราบวันที่";
      items.set(key, [...(items.get(key) || []), entry]);
    }
    return [...items.entries()];
  }, [result.rows]);
  const earnedPage = result.rows.reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0)), 0);
  const spentPage = result.rows.reduce((sum, item) => sum + Math.max(0, -Number(item.amount || 0)), 0);
  const itemCountPage = result.rows.filter(isItemHistoryEntry).length;
  const canExport = active && !loading && !exporting && !error && result.total > 0;
  const patchDraft = (patch: Partial<Filter>) => setDraft(old => ({ ...old, ...patch }));
  const apply = () => {
    if (draft.startDate && draft.endDate && draft.startDate > draft.endDate) { setError("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด"); return; }
    setPage(0); setFilters({ ...draft }); setError("");
  };
  const reset = () => { setDraft(blank); setFilters(blank); setPage(0); setError(""); };
  const exportExcel = async () => {
    if (!canExport) return;
    if (result.total > 10000) { setError("พบมากกว่า 10,000 รายการ กรุณาเลือกช่วงวันที่ก่อน Export Excel"); return; }
    setExporting(true); setError("");
    try {
      const all: Entry[] = [];
      for (let offset = 0; offset < result.total; offset += 200) {
        const next: Result = await request("timeline", payload(offset, 200));
        if (!Array.isArray(next.rows) || next.rows.length === 0) throw new Error("ข้อมูลไม่ครบทุกหน้า กรุณาลองส่งออกใหม่");
        all.push(...next.rows);
      }
      if (all.length !== result.total) throw new Error("ข้อมูล Timeline เปลี่ยนระหว่างส่งออก กรุณาลองใหม่");
      const XLSX = await import("xlsx");
      const table = all.map(item => ({
        "วันที่ (เวลาไทย)": parts(item.createdAt)?.day || "—",
        "เวลา (ไทย)": parts(item.createdAt) ? clock(item.createdAt) : "—",
        "ผู้ใช้งาน": nameByUsername.get(item.username)?.displayName || item.username,
        "Username": item.username,
        "ทีม": nameByUsername.get(item.username)?.teamName || "—",
        "กิจกรรม / รางวัล": transactionText(item).title || itemHistoryLabel(item)?.name,
        "ประเภท": typeLabel(item),
        "รายละเอียด": transactionText(item).detail,
        "Sparks เปลี่ยนแปลง": Number(item.amount || 0),
        "Sparks คงเหลือหลังรายการ": item.balanceAfter ?? "",
        "จำนวน Item": itemHistoryDeltaText(item) === "—" ? "" : itemHistoryDeltaText(item),
        "ผู้ดำเนินการ": item.performedBy || "",
        "สถานะ": item.status || "",
        "ที่มา": item.source,
        "อ้างอิง": item.referenceId || item.id,
      }));
      const book = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(table);
      sheet["!cols"] = [17,12,28,20,20,34,22,46,22,25,18,20,18,24,34].map(wch => ({ wch }));
      XLSX.utils.book_append_sheet(book, sheet, "Sparks Timeline");
      XLSX.writeFile(book, "QA_Sparks_Timeline_" + new Date().toISOString().slice(0,10) + ".xlsx");
    } catch (e) { setError(e instanceof Error ? e.message : "ส่งออก Excel ไม่สำเร็จ"); }
    finally { setExporting(false); }
  };
  return <section className="sat-panel" aria-label="ประวัติ Sparks รวมทุกคนตามวัน">
    <div className="sat-heading"><div><h3>Timeline รวมทุกคน</h3><p>ประวัติ Sparks และ Item ที่บันทึกจริง เรียงวันที่ใหม่สุดก่อน · เวลาไทย</p></div>
      <button type="button" className="sat-export" disabled={!canExport} onClick={() => void exportExcel()}>{exporting ? "กำลังส่งออก..." : "Export Excel"}</button></div>
    <div className="sat-summary" aria-label="สรุป Timeline">
      <div><span>รายการทั้งหมดตามตัวกรอง</span><strong>{number(result.total)}</strong><small>รายการ</small></div>
      <div><span>ได้รับในหน้านี้</span><strong className="sat-positive">+{number(earnedPage)}</strong><small>Sparks</small></div>
      <div><span>ใช้ไปในหน้านี้</span><strong className="sat-negative">−{number(spentPage)}</strong><small>Sparks</small></div>
      <div><span>Item ในหน้านี้</span><strong>{number(itemCountPage)}</strong><small>รายการ</small></div>
    </div>
    <form className="sat-filter" onSubmit={e => { e.preventDefault(); apply(); }}>
      <label>ตั้งแต่วันที่<input type="date" value={draft.startDate} onChange={e => patchDraft({ startDate: e.target.value })}/></label>
      <label>ถึงวันที่<input type="date" value={draft.endDate} onChange={e => patchDraft({ endDate: e.target.value })}/></label>
      <label>ประเภทรายการ<select value={draft.category} onChange={e => patchDraft({ category: e.target.value })}>
        <option value="all">ทั้งหมด</option><option value="earn">ได้รับ (+)</option><option value="spend">ใช้ไป (−)</option>
        <option value="redeem">แลกรางวัล / คืนคะแนน</option><option value="items">Item และรางวัล</option>
      </select></label>
      <label>ทีม<select value={draft.team} onChange={e => patchDraft({ team: e.target.value })}>
        <option value="all">ทุกทีม</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}
      </select></label>
      <label>ผู้ใช้งาน<select value={draft.user} onChange={e => patchDraft({ user: e.target.value })}>
        <option value="all">ทุกคน</option>{users.filter(u => draft.team === "all" || u.teamName === draft.team).map(u => <option key={u.username} value={u.username}>{u.displayName} (@{u.username})</option>)}
      </select></label>
      <label className="sat-search">ค้นหารางวัล / Item<input type="search" value={draft.search} maxLength={120} placeholder="เช่น Daily Check-in หรือ Fruit Match" onChange={e => patchDraft({ search: e.target.value })}/></label>
      <button className="sat-search-button" type="submit">ค้นหา</button>
      <button className="sat-clear" type="button" onClick={reset}>ล้าง</button>
    </form>
    {error ? <p className="sat-error" role="alert">{error}</p> : null}
    {loading ? <p className="sat-empty" role="status">กำลังโหลด Timeline จาก Supabase...</p>
      : !names.length ? <p className="sat-empty">ไม่พบผู้ใช้งานตามตัวกรอง</p>
      : !result.rows.length ? <p className="sat-empty">ไม่พบประวัติในช่วงที่เลือก</p>
      : <div className="sat-groups">{groups.map(([day, entries]) => <section className="sat-day" key={day}>
        <div className="sat-day-title"><span className="sat-day-dot" aria-hidden="true"/><strong>{day === "ไม่ทราบวันที่" ? day : dayLabel(day)}</strong><small>{entries.length} รายการในหน้านี้</small></div>
        <div className="sat-table-wrap"><table className="sat-table">
          <thead><tr><th>เวลา</th><th>ผู้ใช้งาน</th><th>กิจกรรม / รางวัล</th><th>ประเภท</th><th>ยอดเปลี่ยนแปลง</th><th>ยอดหลังรายการ</th></tr></thead>
          <tbody>{entries.map(entry => {
            const member = nameByUsername.get(entry.username);
            const item = itemHistoryLabel(entry);
            return <tr key={entry.username + ":" + entry.id}>
              <td data-label="เวลา">{parts(entry.createdAt) ? clock(entry.createdAt) : "—"}</td>
              <td data-label="ผู้ใช้งาน"><button type="button" className="sat-user" onClick={() => onOpenUser(entry.username)}>{member?.displayName || entry.username}<small>@{entry.username} · {member?.teamName || member?.role || "User"}</small></button></td>
              <td data-label="กิจกรรม / รางวัล"><strong>{transactionText(entry).title || item?.name || "รายการ Sparks"}</strong><small>{transactionText(entry).detail || "—"}{item?.extra ? " · " + item.extra : ""}</small></td>
              <td data-label="ประเภท"><span className="sat-type">{typeLabel(entry)}</span>{item && <small className="sat-item">{itemHistoryDeltaText(entry)}</small>}</td>
              <td data-label="ยอดเปลี่ยนแปลง"><strong className={entry.amount > 0 ? "sat-positive" : entry.amount < 0 ? "sat-negative" : ""}>{entry.amount === 0 ? "—" : (entry.amount > 0 ? "+" : "") + number(entry.amount) + " Sparks"}</strong></td>
              <td data-label="ยอดหลังรายการ">{entry.balanceAfter === null ? "—" : number(entry.balanceAfter) + " Sparks"}{entry.voided && <small>รายการถูกยกเลิก</small>}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>)}</div>}
    <div className="sat-pagination">
      <span>แสดง {result.total ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, result.total)} จาก {number(result.total)} รายการ · หน้า {page + 1}</span>
      <div><button type="button" disabled={loading || page === 0} onClick={() => setPage(p => p - 1)}>ก่อนหน้า</button>
        <button type="button" disabled={loading || (page + 1) * PAGE_SIZE >= result.total} onClick={() => setPage(p => p + 1)}>ถัดไป</button></div>
    </div>
    <p className="sat-footnote">Timeline ดึงจากประวัติธุรกรรมที่บันทึกไว้บน Supabase เท่านั้น ไม่แก้ยอดคะแนน และไม่สร้างเหตุการณ์หมดอายุ Item ย้อนหลังจากการคำนวณ</p>
  </section>;
}
