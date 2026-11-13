import React, { useEffect, useState } from "react";
import "./SparkQuestAnnouncement.css";

export const SPARK_ANNOUNCEMENT_END = "2026-12-25";
export const SPARK_ANNOUNCEMENT_KEY = "qa-sparks-journey-promo-2026-v1";
export function sparkAnnouncementActive(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const v = (type: string) => parts.find(p => p.type === type)?.value || "";
  return [v("year"), v("month"), v("day")].join("-") <= SPARK_ANNOUNCEMENT_END;
}
const readKey = (username: string) => SPARK_ANNOUNCEMENT_KEY + ":" + username.trim().toLowerCase();
const dismissed = (username: string) => {
  if (!username) return true;
  try { return window.localStorage.getItem(readKey(username)) === "1"; }
  catch { return false; }
};
const markDismissed = (username: string) => {
  try { window.localStorage.setItem(readKey(username), "1"); } catch {}
  window.dispatchEvent(new Event("qa:sparks-announcement-dismissed"));
};

export function SparkQuestArtwork({ onJoin, compact = false }: {
  onJoin: () => void; compact?: boolean;
}) {
  return <div className={"spark-promo-poster" + (compact ? " spark-promo-poster--compact" : "")}
    data-sparks-announcement-artwork="true" role="link" tabIndex={0}
    aria-label="คลิกรูปประกาศเพื่อเข้าเล่นกิจกรรม QA Sparks"
    onClick={(event) => {
      if ((event.target as HTMLElement).closest("button")) return;
      onJoin();
    }}
    onKeyDown={(event) => {
      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault(); onJoin();
      }
    }}>
    <div className="spark-promo-stars" aria-hidden="true">✧ ✦ ✧</div>
    <div className="spark-promo-title-ribbon">
      <span aria-hidden="true">📣</span> ประกาศกิจกรรม QA Sparks
    </div>
    <p className="spark-promo-tagline">ต้อนรับกิจกรรมพิเศษใน QA Sparks<br/>รับสิทธิ์ได้คนละ 1 ครั้งต่อกิจกรรม</p>
    <section className="spark-promo-panel spark-promo-panel--fruit">
      <div className="spark-promo-panel-copy">
        <h3><span className="spark-promo-index">1</span> Welcome Fruit Reward</h3>
        <p>เลือกผลไม้ 1 ครั้ง รับ</p>
        <strong>100–1,000 QA Sparks</strong>
        <small>ทำแล้วไม่แสดงซ้ำ · ยังไม่เคยทำสามารถร่วมกิจกรรมได้</small>
      </div>
      <div className="spark-promo-art-icons spark-promo-art-icons--fruit" aria-hidden="true">
        <span>🍎</span><span>🍇</span><span>🍍</span><span>🍌</span>
      </div>
    </section>
    <section className="spark-promo-panel spark-promo-panel--journey">
      <div className="spark-promo-panel-copy">
        <h3><span className="spark-promo-index">2</span> The Spark Journey</h3>
        <p>เลือก 1 ใน 5 เส้นทาง ไปยัง Spark Land</p>
        <strong>150–800 QA Sparks</strong>
        <small>พายเรือ · ปั่นจักรยาน · เดินจูงสุนัข · เครื่องบิน · รถไฟ</small>
      </div>
      <div className="spark-promo-art-icons spark-promo-art-icons--journey" aria-hidden="true">
        <span>🚣</span><span>🚴</span><span>🐕</span><span>✈️</span><span>🚂</span>
      </div>
      <div className="spark-promo-land">✦ SPARK LAND ✦</div>
    </section>
    <div className="spark-promo-deadline">
      <span aria-hidden="true">📅</span>
      <div><small>หมดเขตเข้าร่วมกิจกรรม</small><strong>25 ธันวาคม 2026 เวลา 23:59 น.</strong><small>ตามเวลาไทย</small></div>
    </div>
    <div className="spark-promo-path"><span aria-hidden="true">📍</span> QA Dashboard › Rewards › QA Sparks › Quest Center</div>
    <button type="button" className="spark-promo-join" onClick={onJoin}
      data-spark-quest-join="true">
      คลิกเพื่อเข้าเล่นกิจกรรม QA Sparks <span aria-hidden="true">➜</span>
    </button>
    <small className="spark-promo-footnote">
      ระบบตรวจสิทธิ์ของแต่ละบัญชี และจะไม่สุ่มหรือรับคะแนนจนกว่าจะเลือกกิจกรรม
    </small>
  </div>;
}

export function SparkQuestAnnouncementPopup({
  username, blocked, onJoin,
}: { username: string; blocked: boolean; onJoin: () => void }) {
  const [acknowledged, setAcknowledged] = useState(() => dismissed(username));
  useEffect(() => { setAcknowledged(dismissed(username)); }, [username]);
  useEffect(() => {
    const refresh = () => setAcknowledged(dismissed(username));
    window.addEventListener("qa:sparks-announcement-dismissed", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("qa:sparks-announcement-dismissed", refresh); window.removeEventListener("storage", refresh); };
  }, [username]);
  if (!username || blocked || acknowledged || !sparkAnnouncementActive()) return null;
  const close = () => { markDismissed(username); setAcknowledged(true); };
  const join = () => { close(); onJoin(); };
  return <div className="spark-promo-modal-backdrop" data-spark-quest-announcement-popup="true">
    <section className="spark-promo-modal" role="dialog" aria-modal="true"
      aria-label="ประกาศ QA Sparks กิจกรรมผลไม้และการเดินทาง">
      <button type="button" onClick={close} className="spark-promo-close"
        aria-label="ปิดประกาศและเก็บไว้ในกล่องประกาศ">×</button>
      <SparkQuestArtwork onJoin={join}/>
      <button type="button" className="spark-promo-later" onClick={close}>
        อ่านภายหลัง (เปิดได้ในประกาศของฉัน)
      </button>
    </section>
  </div>;
}

export function SparkQuestAnnouncementInbox({ onJoin }: { onJoin: () => void }) {
  if (!sparkAnnouncementActive()) return null;
  return <article className="spark-promo-inbox" data-spark-quest-announcement-inbox="true"
    role="link" tabIndex={0} aria-label="คลิกประกาศ The Spark Journey เพื่อเข้าเล่น QA Sparks"
    onClick={(event) => { if ((event.target as HTMLElement).closest("button")) return; onJoin(); }}
    onKeyDown={(event) => {
      if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault(); onJoin();
      }
    }}>
    <div className="spark-promo-inbox-top"><span>ประกาศกิจกรรมพิเศษ</span><strong>25 DEC 2026</strong></div>
    <div className="spark-promo-inbox-title">QA Sparks<br/>Welcome Fruit &amp; The Spark Journey</div>
    <div className="spark-promo-inbox-art" aria-hidden="true">🍎 🍇 ✈️ 🚴 🚂</div>
    <p>รับ Sparks เพิ่มจาก 2 กิจกรรม สำหรับบัญชีที่ยังไม่ได้ใช้สิทธิ์</p>
    <button type="button" onClick={onJoin} data-spark-quest-inbox-join="true">
      คลิกเข้าเล่นกิจกรรม <span aria-hidden="true">➜</span>
    </button>
  </article>;
}
