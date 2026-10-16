import React, { useEffect, useState } from "react";
import { fetchStoredAnnouncement, type AnnouncementMedia, type StoredAnnouncement } from "./announcementStore";
import "./announcementDetail.css";

export type AnnouncementReaderUser = { username: string; displayName: string; role: string; teamName?: string };

export function announcementDetailUrl(id: string, mediaId = "") {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("announcement", id);
  if (mediaId) url.searchParams.set("media", mediaId);
  return url.href;
}

function DetailMedia({ media }: { media: AnnouncementMedia }) {
  const [failed, setFailed] = useState(false);
  if (media.type === "image") return <figure className="qa-announcement-detail-image" data-announcement-image={media.id}>
    {failed ? <div role="alert">โหลดรูปภาพไม่สำเร็จ <button type="button" onClick={() => setFailed(false)}>ลองโหลดรูปอีกครั้ง</button></div>
      : <img src={media.url} alt={media.label || "รูปภาพประกาศ"} onError={() => setFailed(true)} />}
    {media.label ? <figcaption>{media.label}</figcaption> : null}
  </figure>;
  if (media.type === "video") return <figure className="qa-announcement-detail-image"><video src={media.url} controls /><figcaption>{media.label}</figcaption></figure>;
  const safe = /^(https?:|blob:)/i.test(media.url) || /^data:application\/(pdf|octet-stream)[;,]/i.test(media.url) || media.url.startsWith("/");
  return safe ? <a className="qa-announcement-detail-file" href={media.url} target="_blank" rel="noopener noreferrer" download={media.url.startsWith("data:") ? media.label || "attachment" : undefined}>{media.label || "เปิดไฟล์แนบ"} ↗</a> : null;
}

function publishedAt(value: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

export default function AnnouncementDetail({ announcementId, mediaId, currentUser, canRead }: {
  announcementId: string; mediaId: string; currentUser: AnnouncementReaderUser;
  canRead: (item: StoredAnnouncement, user: AnnouncementReaderUser) => boolean;
}) {
  const [state, setState] = useState<{ loading: boolean; error: boolean; item: StoredAnnouncement | null }>({ loading: true, error: false, item: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: false, item: null });
    void fetchStoredAnnouncement(announcementId).then(item => {
      if (!cancelled) setState({ loading: false, error: false, item });
    }).catch(() => { if (!cancelled) setState({ loading: false, error: true, item: null }); });
    return () => { cancelled = true; };
  }, [announcementId, attempt, currentUser.username]);
  const item = state.item && canRead(state.item, currentUser) ? state.item : null;
  const title = item?.title || "รายละเอียดประกาศ";
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | QA Dashboard`;
    return () => { document.title = previous; };
  }, [title]);
  const primary = item?.media.find(media => media.id === mediaId && media.type === "image") || item?.media.find(media => media.type === "image");
  return <main className="qa-announcement-detail-page" data-announcement-full-detail="true" aria-label="ประกาศฉบับเต็ม">
    <div className="qa-announcement-detail-shell">
      <nav className="qa-announcement-detail-nav"><a href={window.location.pathname}><img src="/robinhood-logo.png" alt="Robinhood" /><span>QA Dashboard · ประกาศ</span></a><button type="button" onClick={() => window.close()}>ปิดแท็บ</button></nav>
      {state.loading ? <section className="qa-announcement-detail-card" role="status">กำลังโหลดประกาศ…</section> : state.error ? <section className="qa-announcement-detail-card" role="alert"><h1>โหลดประกาศไม่สำเร็จ</h1><p>กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง</p><button type="button" onClick={() => setAttempt(value => value + 1)}>ลองอีกครั้ง</button></section> : !item ? <section className="qa-announcement-detail-card" role="status"><h1>ไม่พบประกาศหรือไม่มีสิทธิ์อ่าน</h1><p>ประกาศอาจถูกลบ เก็บถาวร หรือไม่ได้ส่งถึงบัญชีนี้</p></section> : <article className="qa-announcement-detail-card">
        <header><span className="qa-announcement-detail-eyebrow">ประกาศฉบับเต็ม</span><h1>{item.title}</h1><div className="qa-announcement-detail-meta"><span>จาก: {item.createdByName || item.createdBy || "QA"}</span><time dateTime={item.startsAt || item.createdAt}>{publishedAt(item.startsAt || item.createdAt)} (เวลาไทย)</time><span>{({ Normal: "ปกติ", Important: "สำคัญ", Urgent: "เร่งด่วน" })[item.priority]}</span></div></header>
        {primary ? <DetailMedia key={primary.id} media={primary} /> : null}
        <section className="qa-announcement-detail-body" aria-label="รายละเอียดประกาศ"><h2>รายละเอียดประกาศ</h2><div>{item.body || "ไม่มีรายละเอียดเพิ่มเติม"}</div></section>
        {item.media.some(media => media.id !== primary?.id) ? <section className="qa-announcement-detail-attachments" aria-label="ไฟล์แนบเพิ่มเติม"><h2>ไฟล์แนบเพิ่มเติม</h2>{item.media.filter(media => media.id !== primary?.id).map(media => <DetailMedia key={media.id} media={media} />)}</section> : null}
      </article>}
    </div>
  </main>;
}
