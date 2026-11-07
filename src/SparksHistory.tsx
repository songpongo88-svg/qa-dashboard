import React, { useState } from "react";
import type { SparksHistoryItem } from "./qaSparksStore";

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

export default function SparksHistory({ history, large = false }: { history: SparksHistoryItem[]; large?: boolean }) {
  const [filter, setFilter] = useState<"all" | "earn" | "spend">("all");
  const visible = history.filter((item) => filter === "all" || item.type === filter);
  return <section className={"qa-sparks-history-wrap" + (large ? " qa-sparks-history-wrap--large" : "")}>
    {history.length ? <div className="qa-sparks-history-filters" aria-label="กรองประวัติ Sparks">
      {([["all", "ทั้งหมด"], ["earn", "ได้รับ (+)"], ["spend", "ใช้ไป (−)"]] as const).map(([key, label]) => (
        <button key={key} type="button" className={filter === key ? "active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
      ))}
    </div> : <div className="qa-sparks-history-empty-message">
      <div className="qa-sparks-history-clock"><svg aria-hidden="true" viewBox="0 0 24 24" width="49" height="49" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
      <h3>ยังไม่มีประวัติการได้รับหรือใช้ Sparks</h3>
    </div>}
    <div className="qa-sparks-history-scroll" role="region" aria-label="เลื่อนดูประวัติ QA Sparks" tabIndex={history.length ? 0 : undefined}>
      <table className="qa-sparks-history-table" aria-label="ประวัติ QA Sparks">
        <thead><tr className="qa-sparks-history-head">
          <th scope="col">วันที่ / เวลา</th><th scope="col">รายการ</th>
          <th scope="col" className="qa-sparks-history-number">Sparks (+/−)</th>
          <th scope="col">รายละเอียด</th>
          <th scope="col" className="qa-sparks-history-number">คงเหลือหลังรายการ</th>
        </tr></thead>
        <tbody>{visible.length ? visible.map((item) => {
          const text = memberHistoryText(item);
          return <tr className="qa-sparks-history-item" key={item.id}>
            <td><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></td>
            <td>{text.title}</td>
            <td className="qa-sparks-history-number"><strong className={item.amount > 0 ? "positive" : item.amount < 0 ? "negative" : "neutral"}>{item.amount > 0 ? "+" : ""}{item.amount.toLocaleString()} Sparks</strong></td>
            <td>{text.detail}{text.note ? <small className="qa-sparks-history-note">หมายเหตุ: {text.note}</small> : null}</td>
            <td className="qa-sparks-history-number qa-sparks-history-balance">{item.balanceAfter.toLocaleString()} Sparks</td>
          </tr>;
        }) : <tr><td colSpan={5}><div className="qa-sparks-history-no-rows">ยังไม่มีประวัติรายการ</div></td></tr>}</tbody>
      </table>
    </div>
  </section>;
}
