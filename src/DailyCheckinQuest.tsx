import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ProfileMakeoverQuest from "./ProfileMakeoverQuest";

export const DAILY_CHECKIN_EVENT = Object.freeze({
  id: "daily-checkin-nov-2026", start: "2026-11-09", end: "2026-11-22",
  pointsPerDay: 50, days: 14, maxPoints: 700,
});
export const CHECKIN_DAYS = Array.from({ length: 14 }, (_, index) => index + 9);

export function bangkokQuestToday(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (part: string) => date.find((item) => item.type === part)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day");
}
export function checkinDayKey(day: number) {
  return "2026-11-" + String(day).padStart(2, "0");
}
export function checkinStatus(day: number, today: string, claimed: readonly number[]) {
  if (claimed.includes(day)) return "claimed" as const;
  const date = checkinDayKey(day);
  return date < today ? "missed" as const : date > today ? "future" as const : "today" as const;
}

type ClaimResult = {
  updated: boolean; alreadyClaimed?: boolean; questDate: string;
  claimedDays: number[]; balance: number; memberYearEarned: number;
};
type Props = {
  username: string; sessionId: string; claimedDays: number[];
  loaded: boolean; profileQuestClaimed?: boolean; display?: "overview" | "full";
};

function CalendarBadge({ size = 34 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" fill="none">
    <rect x="5" y="8" width="38" height="35" rx="9" fill="#FFF9F1" stroke="#CA8CDA" strokeWidth="2.5"/>
    <path d="M6.5 20h35" stroke="#CA8CDA" strokeWidth="2.5"/>
    <path d="M15 5v10M33 5v10" stroke="#A45DC9" strokeWidth="4" strokeLinecap="round"/>
    <path d="m16 31 6 5 11-11" stroke="#2EAE75" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

export default function DailyCheckinQuest({ username, sessionId, claimedDays, loaded, profileQuestClaimed = false, display = "overview" }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverDays, setServerDays] = useState<{ username: string; days: number[] } | null>(null);
  const [today, setToday] = useState(() => bangkokQuestToday());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [modalTheme, setModalTheme] = useState({accent:"#7e22ce", dark:"#581c87",soft:"#faf5ff"});
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const validServerDays = serverDays?.username === username ? serverDays.days : [];
  const saved = [...new Set([...claimedDays, ...validServerDays])].filter((n) => Number.isInteger(n) && n >= 9 && n <= 22).sort((a, b) => a - b);
  const claimedCount = loaded ? saved.length : 0;
  const upcoming = today < DAILY_CHECKIN_EVENT.start;
  const finished = today > DAILY_CHECKIN_EVENT.end;
  const currentDay = Number(today.slice(-2));
  const status = upcoming ? "เตรียมเปิดกิจกรรม" : finished ? "กิจกรรมสิ้นสุดแล้ว" : saved.includes(currentDay) ? "รับรางวัลวันนี้แล้ว" : "เช็กอินวันนี้ได้";
  const statusClass = upcoming ? "upcoming" : finished ? "finished" : "live";

  useEffect(() => {
    if (!open) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const refreshToday = () => setToday(bangkokQuestToday());
    const id = window.setInterval(refreshToday, 30000);
    window.addEventListener("focus", refreshToday);
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) setOpen(false);
      if (event.key !== "Tab" || !modalRef.current) return;
      const items = [...modalRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'
      )];
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault(); items[items.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === items[items.length - 1]) {
        event.preventDefault(); items[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", refreshToday);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = oldOverflow;
      trigger.current?.focus();
    };
  }, [open]);
  const openDetails = () => {
    if (trigger.current) {
      const theme = window.getComputedStyle(trigger.current);
      setModalTheme({
        accent: theme.getPropertyValue("--sparks-accent").trim() || "#7e22ce",
        dark: theme.getPropertyValue("--sparks-dark").trim() || "#581c87",
        soft: theme.getPropertyValue("--sparks-soft").trim() || "#faf5ff",
      });
    }
    setToday(bangkokQuestToday());
    setMessage(""); setError(""); setOpen(true);
  };
  const claim = async (day: number) => {
    const currentDate = bangkokQuestToday();
    setToday(currentDate);
    if (!loaded || !sessionId || !username || busy || checkinStatus(day, currentDate, saved) !== "today") return;
    setBusy(true);
    setError(""); setMessage("");
    try {
      const response = await fetch("/api/sparks-admin", {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
        body: JSON.stringify({
          action: "claim-daily-checkin", actorUsername: username, sessionId,
          questDate: checkinDayKey(day),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(result.error || "ระบบไม่สามารถบันทึกเช็กอินได้"));
      const data = result as ClaimResult;
      setServerDays({ username, days: data.claimedDays });
      setMessage(data.alreadyClaimed
        ? "คุณได้รับรางวัลของวันนี้ไปแล้ว ไม่ได้เพิ่มคะแนนซ้ำ"
        : "เช็กอินสำเร็จ! ได้รับ +50 QA Sparks บันทึกใน History และ Member Level แล้ว");
      window.dispatchEvent(new Event("qa:sparks-updated"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ไม่สามารถรับรางวัลได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  return <>
    <section className="qa-sparks-quest-center" aria-label="Quest Center">
      <div className="qa-sparks-quest-center-head">
        <div><div className="qa-sparks-quest-overline">QA SPARKS · QUEST #01</div><h2><CalendarBadge size={24}/> Quest Center</h2><p>เลือกภารกิจเพื่อดูรายละเอียดและรับรางวัล</p></div>
        <span className="qa-sparks-quest-count">2 Quests</span>
      </div>
      <button type="button" ref={trigger} className="qa-sparks-quest-tile" data-quest-item="daily-checkin"
        aria-haspopup="dialog" aria-expanded={open} aria-label="เปิดรายละเอียด Daily Check-in" onClick={openDetails}>
        <span className="qa-sparks-quest-tile-art">
          <span className="qa-sparks-quest-sunburst"/>
          <span className="qa-sparks-quest-big-calendar"><CalendarBadge size={92}/></span>
          <span className="qa-sparks-quest-coin">✦ 50</span>
        </span>
        <span className="qa-sparks-quest-tile-details">
          <span className="qa-sparks-quest-eyebrow"><span>DAILY EVENT</span><span className={"qa-sparks-quest-state " + statusClass}>{status}</span></span>
          <strong>Daily Check-in</strong>
          <span className="qa-sparks-quest-tile-dates">9–22 พฤศจิกายน 2026 · 14 วัน</span>
          <span className="qa-sparks-quest-tile-bottom">
            <span><b>+50</b> Sparks / วัน</span>
            <span>ดูปฏิทิน <span aria-hidden="true">›</span></span>
          </span>
        </span>
      </button>
      <ProfileMakeoverQuest username={username} sessionId={sessionId} claimed={profileQuestClaimed} loaded={loaded}/>
      {display === "full" ? <p className="qa-sparks-quest-center-foot">Quest ใหม่จะปรากฏในรายการนี้เมื่อเปิดกิจกรรมเพิ่มเติม</p> : null}
    </section>

    {open && typeof document !== "undefined" ? createPortal(
      <div className="qa-sparks-checkin-backdrop" style={{
        "--sparks-accent": modalTheme.accent, "--sparks-dark": modalTheme.dark,
        "--sparks-soft": modalTheme.soft,
      } as React.CSSProperties} onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) setOpen(false);
      }}>
        <section ref={modalRef} className="qa-sparks-checkin-modal" role="dialog" aria-modal="true" aria-labelledby="qa-checkin-title" aria-describedby="qa-checkin-summary">
          <button className="qa-sparks-checkin-close" ref={closeButton} type="button" aria-label="ปิดรายละเอียด Daily Check-in"
            onClick={() => { if (!busy) setOpen(false); }} disabled={busy}>×</button>
          <div className="qa-sparks-checkin-hero">
            <span className="qa-sparks-checkin-hero-badge">✦ QA SPARKS QUEST · LIMITED EVENT</span>
            <div className="qa-sparks-checkin-hero-flex">
              <div className="qa-sparks-checkin-hero-icon"><CalendarBadge size={88}/></div>
              <div>
                <h2 id="qa-checkin-title">Daily Check-in</h2>
                <p id="qa-checkin-summary">เช็กอินทุกวันที่สะดวก กดรับด้วยตัวเอง วันละ 50 Sparks</p>
                <span className="qa-sparks-checkin-event-dates">9–22 พ.ย. 2026 · เวลาไทย (UTC+7)</span>
              </div>
            </div>
          </div>
          <div className="qa-sparks-checkin-body">
            <div className="qa-sparks-checkin-stats">
              <div><span>รางวัลต่อวัน</span><strong>+50 <small>Sparks</small></strong></div>
              <div><span>รับแล้ว</span><strong>{loaded ? claimedCount : "—"} <small>/ 14 วัน</small></strong></div>
              <div><span>คะแนนที่ได้รับ</span><strong>{loaded ? claimedCount * 50 : "—"} <small>/ 700 Sparks</small></strong></div>
            </div>
            <div className="qa-sparks-checkin-calendar-head">
              <div><h3>ปฏิทินเช็กอิน</h3><span>พฤศจิกายน 2026 · เลือกรับรางวัลจากช่องวันที่ปัจจุบันเท่านั้น</span></div>
              <span className={"qa-sparks-quest-state " + statusClass}>{status}</span>
            </div>
            <div className="qa-sparks-checkin-calendar" aria-label="ปฏิทินเช็กอิน 9 ถึง 22 พฤศจิกายน 2026">
              {["จ.","อ.","พ.","พฤ.","ศ.","ส.","อา."].map((day) =>
                <span key={day} className="qa-sparks-checkin-weekday">{day}</span>)}
              {CHECKIN_DAYS.map((day) => {
                const dayStatus = checkinStatus(day, today, saved);
                const isToday = dayStatus === "today";
                const canClaim = loaded && Boolean(username && sessionId) && isToday && !busy;
                return <button key={day} type="button"
                  className={"qa-sparks-checkin-day " + dayStatus}
                  title={dayStatus === "claimed" ? "รับรางวัลแล้ว" : dayStatus === "missed" ? "พลาดแล้ว รับย้อนหลังไม่ได้" : isToday ? "รับ 50 Sparks วันนี้" : "ยังไม่ถึงวันที่รับรางวัล"}
                  aria-label={"วันที่ " + day + " พฤศจิกายน 2026, " + (dayStatus === "claimed" ? "รับรางวัลแล้ว" : dayStatus === "missed" ? "พลาดแล้ว" : isToday ? "กดรับรางวัล 50 Sparks" : "ยังไม่เปิด")}
                  disabled={!canClaim}
                  onClick={() => void claim(day)}>
                  <span className="qa-sparks-checkin-day-num">{day}</span>
                  <span className="qa-sparks-checkin-day-points">{dayStatus === "claimed" ? "✓ ได้รับแล้ว"
                    : dayStatus === "missed" ? "พลาด" : isToday ? busy ? "กำลังรับ..." : "รับ +50" : "+50"}</span>
                  <span className="qa-sparks-checkin-day-symbol" aria-hidden="true">{dayStatus === "claimed" ? "✓" : dayStatus === "missed" ? "×" : isToday ? "✦" : "○"}</span>
                </button>;
              })}
            </div>
            <div className="qa-sparks-checkin-legend">
              <span><i className="claimed"/> รับแล้ว</span><span><i className="today"/> รับได้วันนี้</span>
              <span><i className="missed"/> พลาดแล้ว</span><span><i className="future"/> ยังไม่เปิด</span>
            </div>
            {message ? <p role="status" className="qa-sparks-checkin-success">{message}</p> : null}
            {error ? <p role="alert" className="qa-sparks-checkin-error">{error}</p> : null}
            {!loaded ? <p role="status" className="qa-sparks-checkin-note">กำลังตรวจสอบข้อมูล Sparks กรุณารอโหลดบัญชีให้เสร็จ</p> : null}
            <div className="qa-sparks-checkin-rules">
              <h3>กติกาการรับรางวัล</h3>
              <p>กดที่ช่องวันที่ปัจจุบันเพื่อรับ 50 Sparks วันละ 1 ครั้ง ไม่มีการแจกคะแนนอัตโนมัติ</p>
              <p>หากไม่ได้เข้ามาเช็กอินในวันใด วันนั้นจะพลาดถาวร ไม่สามารถรับย้อนหลังหรือล่วงหน้าได้ แต่ยังรับของวันต่อไปได้ตามปกติ</p>
              <p>รางวัลจะเพิ่มในยอด Sparks, History และคะแนนสะสม Member Level เมื่อบันทึกสำเร็จ ทั้งนี้ต้องไม่เกินเพดานสะสม 200,000 Sparks ต่อปี</p>
            </div>
          </div>
        </section>
      </div>, document.body) : null}
  </>;
}
