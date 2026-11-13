import React, { useState } from "react";
import type { SparksHistoryItem } from "./qaSparksStore";
import {isItemHistoryEntry,itemHistoryLabel,itemHistoryDeltaText} from "./sparksItemHistory.mjs";

const REQUEST_RESULTS: Record<string, string> = {
  approved: "คำขอได้รับอนุมัติ",
  paid: "โอนเงินสำเร็จ",
  delivered: "ส่งสิทธิ์เรียบร้อยแล้ว",
  rejected: "คำขอไม่ได้รับอนุมัติ",
};

// Present legacy ledger wording without rewriting stored history or audit notes.
export function memberHistoryText(item: SparksHistoryItem) {
  if (item.source === "special-reward-admin") {
    const suffix = item.title.match(/\s+·\s+(approved|paid|delivered|rejected)$/i);
    const legacy = item.detail.match(/^Admin บันทึกสถานะ:?\s+(approved|paid|delivered|rejected)$/i);
    const status = (suffix?.[1] || legacy?.[1] || "").toLowerCase();
    if (REQUEST_RESULTS[status]) return {
      title: suffix ? item.title.slice(0, suffix.index) : item.title,
      detail: REQUEST_RESULTS[status],
      note: legacy || !item.detail.trim() ? "" : item.detail,
    };
  }
  if (item.source === "special-reward" && / Request$/.test(item.title)) return {
    title: item.title.replace(/ Request$/, ""),
    detail: "ส่งคำขอแล้ว · รอตรวจสอบ",
    note: item.detail === "ส่งคำขอให้ Admin ตรวจสอบ" ? "" : item.detail,
  };
  if (item.source === "reward-payout" && item.title === "TrueMoney 20 THB Paid") return {
    title: "TrueMoney 20 บาท",
    detail: "โอนเงิน TrueMoney 20 บาทสำเร็จ",
    note: item.detail === "Admin ยืนยันโอน TrueMoney 20 บาทสำเร็จ" ? "" : item.detail,
  };
  return { title: item.title, detail: item.detail, note: "" };
}

function formatDate(date: string) {
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }) : date;
}

type HistoryFilter = "all" | "earn" | "spend" | "items";
const HISTORY_FILTERS: {key: HistoryFilter; label: string}[] = [
  {key:"all",label:"ทั้งหมด"},
  {key:"earn",label:"ได้รับ (+)"},
  {key:"spend",label:"ใช้ไป (−)"},
  {key:"items",label:"Item ทุกชนิด"}
];

/**
 * The same cards are used in the Overview half-column and full History tab.
 * Search and pagination only work on already loaded entries, never trigger
 * extra Firestore reads or change wallet/ledger data.
 */
export default function SparksHistory({ history, large = false }: {
  history: SparksHistoryItem[]; large?: boolean;
}) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");
  const pageSize = large ? 12 : 4;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const query = search.trim().toLocaleLowerCase("th-TH");
  const visible = history.filter(item => {
    if (filter === "items" && !isItemHistoryEntry(item)) return false;
    if (filter === "earn" && !(item.amount > 0)) return false;
    if (filter === "spend" && !(item.amount < 0)) return false;
    if (!query) return true;
    const display = memberHistoryText(item);
    const itemAudit = itemHistoryLabel(item);
    const searchable = [
      display.title,display.detail,display.note,itemAudit?.name,
      itemAudit?.action,itemAudit?.extra,item.source,formatDate(item.createdAt)
    ].filter(Boolean).join(" ").toLocaleLowerCase("th-TH");
    return searchable.includes(query);
  });
  const page = visible.slice(0, visibleCount);
  const remaining = visible.length - page.length;
  const selectFilter = (next: HistoryFilter) => {
    setFilter(next);
    setVisibleCount(pageSize);
  };
  const updateSearch = (value: string) => {
    setSearch(value);
    setVisibleCount(pageSize);
  };
  const clearFilters = () => {
    setFilter("all");
    setSearch("");
    setVisibleCount(pageSize);
  };

  return <section className={"qa-sparks-history-wrap qa-sparks-history-cards" +
    (large ? " qa-sparks-history-wrap--large" : "")} aria-label="ประวัติ QA Sparks">
    <div className="qa-sparks-history-toolbar">
      <div className="qa-sparks-history-filters" role="group" aria-label="กรองประวัติ Sparks">
        {HISTORY_FILTERS.map(({key,label}) =>
          <button key={key} type="button" className={filter === key ? "active" : ""}
            aria-pressed={filter === key} onClick={() => selectFilter(key)}>{label}</button>
        )}
      </div>
      {history.length > 0 && <label className="qa-sparks-history-search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.7" cy="10.7" r="6.4"/><path d="m15.5 15.5 5 5"/>
        </svg>
        <span className="sr-only">ค้นหาประวัติจากรายการที่โหลดมา</span>
        <input type="search" value={search} onChange={e=>updateSearch(e.target.value)}
          placeholder="ค้นหาชื่อ Item หรือรายการ..." autoComplete="off"/>
      </label>}
    </div>
    {history.length > 0 && <p className="qa-sparks-history-count" role="status">
      พบ <strong>{visible.length.toLocaleString("th-TH")}</strong> รายการ
      <span> · แสดง {page.length.toLocaleString("th-TH")} รายการจากประวัติที่โหลดมา</span>
    </p>}
    {page.length > 0 ? <ol className="qa-sparks-history-list" aria-label="รายการประวัติ">
      {page.map(item => {
        const text = memberHistoryText(item);
        const itemAudit = itemHistoryLabel(item);
        const delta = itemAudit ? itemHistoryDeltaText(item) : "—";
        const hasSparks = item.amount !== 0;
        const hasItemQuantity = delta !== "—";
        const tone = item.amount > 0 || delta.startsWith("+")
          ? "positive" : item.amount < 0 || delta.startsWith("-") ? "negative" : "neutral";
        const balance = item.balanceAfter === null || item.balanceAfter === undefined
          ? "ไม่มีข้อมูลยอดคงเหลือ" : item.balanceAfter.toLocaleString("en-US") + " Sparks";
        return <li key={item.id} className="qa-sparks-history-entry" data-history-source={item.source}>
          <div className="qa-sparks-history-entry-row">
            <span className={"qa-sparks-history-entry-symbol " + tone} aria-hidden="true">
              {tone === "positive" ? "+" : tone === "negative" ? "−" : "•"}
            </span>
            <div className="qa-sparks-history-entry-main">
              <strong className="qa-sparks-history-entry-title">{itemAudit?.name || text.title}</strong>
              <div className="qa-sparks-history-entry-meta">
                <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                {itemAudit && <span className="qa-sparks-history-action">{itemAudit.action}</span>}
              </div>
            </div>
            <div className="qa-sparks-history-entry-changes" aria-label="ยอดเปลี่ยนแปลง">
              {hasSparks && <strong className={"qa-sparks-history-change " + (item.amount > 0 ? "positive" : "negative")}>
                {item.amount > 0 ? "+" : ""}{item.amount.toLocaleString("en-US")} Sparks
              </strong>}
              {hasItemQuantity && <span className={"qa-sparks-history-change item " +
                (delta.startsWith("+") ? "positive" : delta.startsWith("-") ? "negative" : "neutral")}>
                {delta} Item
              </span>}
              {!hasSparks && !hasItemQuantity && <span className="qa-sparks-history-change neutral">
                อัปเดตสถานะ
              </span>}
            </div>
          </div>
          {(text.detail || text.note || itemAudit?.extra || item.derived) && <div className="qa-sparks-history-entry-details">
            {text.detail && <p>{text.detail}</p>}
            {text.note && <p>หมายเหตุ: {text.note}</p>}
            {itemAudit?.extra && <p>{itemAudit.extra}</p>}
            {item.derived && <p>แสดงตามวันหมดอายุใน Item · ไม่ได้สร้างธุรกรรมย้อนหลัง</p>}
          </div>}
          <div className="qa-sparks-history-entry-footer">
            <span>ยอดคงเหลือหลังรายการ</span><strong>{balance}</strong>
          </div>
        </li>;
      })}
    </ol> : <div className="qa-sparks-history-empty-state" role="status">
      <strong>{history.length === 0 ? "ยังไม่มีประวัติการได้รับหรือใช้ Sparks" : "ไม่พบรายการที่ตรงกับการค้นหา"}</strong>
      <span>{history.length === 0 ? "เมื่อมีการรับคะแนนหรือใช้ Item ประวัติจะปรากฏที่นี่" :
        "ลองเลือกตัวกรองอื่นหรือล้างคำค้นหา"}</span>
      {history.length > 0 && <button type="button" onClick={clearFilters}>แสดงรายการทั้งหมด</button>}
    </div>}
    {remaining > 0 && <div className="qa-sparks-history-more">
      <button type="button" onClick={() => setVisibleCount(count=>count+pageSize)}>
        ดูเพิ่มเติมอีก {Math.min(pageSize,remaining)} รายการ
      </button>
      <span>จากทั้งหมด {visible.length.toLocaleString("th-TH")} รายการ</span>
    </div>}
    {visibleCount > pageSize && visible.length > pageSize && <button
      type="button" className="qa-sparks-history-collapse"
      onClick={() => setVisibleCount(pageSize)}>แสดงน้อยลง</button>}
  </section>;
}
