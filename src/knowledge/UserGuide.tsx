import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { formatKnowledgeDate, KNOWLEDGE_BUILD, type KnowledgeUser } from "./model";
import { canReadChapter, contextualChapter, findChapters, MANUAL, type GuideChapter } from "./guideModel";
import { guideRepository, type GuideRepository } from "./guideStore";
import { downloadGuidePdf } from "./pdf";
import "./knowledge.css";

const PdfReader = lazy(() => import("./PdfReader"));

type Props = { user: KnowledgeUser; permissions: Record<string, boolean>; canManage?: boolean; context?: string; drawer?: boolean; onClose?: () => void; repository?: GuideRepository };
const errorText = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้ง";

async function readGuideImage(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error("เลือกภาพ PNG, JPEG หรือ WebP ขนาดไม่เกิน 8 MB");
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const node = new Image(); node.onload = () => resolve(node); node.onerror = () => reject(new Error("เปิดภาพนี้ไม่สำเร็จ")); node.src = source; });
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 1400 / image.naturalWidth, 1800 / image.naturalHeight);
    canvas.width = Math.round(image.naturalWidth * ratio); canvas.height = Math.round(image.naturalHeight * ratio);
    const context = canvas.getContext("2d"); if (!context) throw new Error("ไม่สามารถเตรียมภาพได้");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/jpeg", .78);
    if (data.length > 330000) data = canvas.toDataURL("image/jpeg", .5);
    if (data.length > 330000) throw new Error("ภาพมีรายละเอียดมากเกินไป กรุณาลดขนาดภาพก่อนเลือก");
    return data;
  } finally { URL.revokeObjectURL(source); }
}

function GuideEditor({ chapter, busy, onCancel, onPublish }: { chapter: GuideChapter; busy: boolean; onCancel: () => void; onPublish: (chapter: GuideChapter) => void }) {
  const [draft, setDraft] = useState<GuideChapter>(() => JSON.parse(JSON.stringify(chapter)));
  const [error, setError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  return <section className="knowledge-card guide-editor" data-unsaved-changes="true">
    <h2>แก้ไขคู่มือ: {chapter.title}</h2><p className="knowledge-muted">ตรวจข้อความและภาพก่อนเผยแพร่ การแก้ไขจะเก็บประวัติผู้แก้และวันเวลา</p>
    <label>ชื่อบท<input value={draft.title} maxLength={180} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
    <label>คำอธิบาย<textarea style={{ minHeight: 80 }} value={draft.summary} maxLength={1000} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
    {draft.steps.map((step, index) => <div key={index} className="knowledge-card"><label>ขั้นตอน {index + 1}<input value={step.title} maxLength={180} onChange={(event) => setDraft({ ...draft, steps: draft.steps.map((item, i) => i === index ? { ...item, title: event.target.value } : item) })} /></label><label>รายละเอียด<textarea value={step.body} maxLength={2500} onChange={(event) => setDraft({ ...draft, steps: draft.steps.map((item, i) => i === index ? { ...item, body: event.target.value } : item) })} /></label><button className="knowledge-link" disabled={draft.steps.length <= 1} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((_, i) => i !== index) })}>นำขั้นตอนนี้ออก</button></div>)}
    <button className="knowledge-secondary" disabled={draft.steps.length >= 15} onClick={() => setDraft({ ...draft, steps: [...draft.steps, { title: "", body: "" }] })}>เพิ่มขั้นตอน</button>
    <label>ผลที่ควรเห็น<textarea style={{ minHeight: 80 }} value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value })} /></label>
    <label>ข้อควรรู้ (หนึ่งข้อต่อบรรทัด)<textarea value={draft.tips.join("\n")} onChange={(event) => setDraft({ ...draft, tips: event.target.value.split("\n") })} /></label>
    <label>เมื่อพบปัญหา (หนึ่งข้อต่อบรรทัด)<textarea value={draft.troubleshooting.join("\n")} onChange={(event) => setDraft({ ...draft, troubleshooting: event.target.value.split("\n") })} /></label>
    <label>ภาพประกอบ (ไม่เกิน 2 ภาพ)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={imageBusy || (draft.images?.length || 0) >= 2} onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      setImageBusy(true); setError("");
      try { const src = await readGuideImage(file); setDraft((current) => ({ ...current, images: [...(current.images || []), { src, caption: "" }] })); }
      catch (reason) { setError(errorText(reason)); } finally { setImageBusy(false); }
    }} /></label>
    {(draft.images || []).map((image, index) => <div key={index}><img className="guide-image" src={image.src} alt={image.caption || `ภาพประกอบ ${index + 1}`} /><label>คำอธิบายภาพ<input value={image.caption} maxLength={400} onChange={(event) => setDraft({ ...draft, images: draft.images?.map((item, i) => i === index ? { ...item, caption: event.target.value } : item) })} /></label><label>ตำแหน่งภาพ<select value={image.step || 0} onChange={event=>setDraft({...draft,images:draft.images?.map((item,i)=>i===index?{...item,step:Number(event.target.value)||undefined}:item)})}><option value={0}>ก่อนเริ่มขั้นตอน</option>{draft.steps.map((step,i)=><option key={i} value={i+1}>หลังขั้นตอน {i+1}: {step.title}</option>)}</select></label><button className="knowledge-link" onClick={() => setDraft({ ...draft, images: draft.images?.filter((_, i) => i !== index) })}>นำภาพนี้ออก</button></div>)}
    {error && <p className="knowledge-error" role="alert">{error}</p>}
    <div className="knowledge-actions"><button className="knowledge-secondary" disabled={busy} onClick={onCancel}>ยกเลิก</button><button className="knowledge-primary" disabled={busy || imageBusy} onClick={() => onPublish(draft)}>{busy ? "กำลังเผยแพร่…" : "เผยแพร่คู่มือฉบับแก้ไข"}</button></div>
  </section>;
}

export default function UserGuide({ user, permissions, canManage = false, context = "user-guide", drawer = false, onClose, repository = guideRepository }: Props) {
  const [chapters, setChapters] = useState<GuideChapter[]>(MANUAL.chapters);
  const [stale, setStale] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selected, setSelected] = useState(() => contextualChapter(context, MANUAL.chapters));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [editing, setEditing] = useState<GuideChapter | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setLoadError("");
    repository.load().then((data) => { if (alive) { setChapters(data.chapters); setStale(data.stale); } })
      .catch(() => { if (alive) setLoadError("โหลดฉบับแก้ไขจากระบบกลางยังไม่สำเร็จ ขณะนี้แสดงคู่มือที่มาพร้อม Deploy นี้"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt, repository]);
  const filtered = useMemo(() => findChapters(chapters, search), [chapters, search]);
  const chapter = chapters.find((item) => item.id === selected) || chapters[0];
  const selectChapter = (id: string) => { setSelected(id); setEditing(null); setError(""); };
  const exportPdf = async (content: GuideChapter[]) => {
    setPdfBusy(true); setError("");
    try { await downloadGuidePdf(content); } catch (reason) { setError(errorText(reason)); } finally { setPdfBusy(false); }
  };
  const publish = async (edited: GuideChapter) => {
    if (!canManage || busy || !editing) return;
    setBusy(true); setError(""); setNotice("");
    try { await repository.publish(user, edited, editing.revision || 0); setEditing(null); setAttempt((value) => value + 1); setNotice("เผยแพร่คู่มือแล้ว PDF จะใช้เนื้อหาฉบับเดียวกัน"); }
    catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  };
  return <main className="knowledge knowledge-workspace guide-workspace" aria-busy={busy} data-saving={busy || undefined}>
    <header className="knowledge-page-header"><div><span className="knowledge-eyebrow">QA DASHBOARD · USER GUIDE</span><h1>{drawer ? "คู่มือหน้านี้" : "คู่มือการใช้งาน"}</h1><p>เลือกหัวข้อแล้วอ่าน PDF ได้ทันที พร้อมค้นหาและดาวน์โหลด</p></div>{onClose && <button className="knowledge-secondary" onClick={onClose} aria-label="ปิดคู่มือ">ปิด</button>}</header>
    <p className="knowledge-muted">คู่มือ {MANUAL.version} · Deploy {String(KNOWLEDGE_BUILD.commitHash || "").slice(0, 7) || "local"} · ครบ {chapters.length} หัวข้อ</p>
    {loading && <p className="knowledge-muted" role="status">กำลังตรวจคู่มือฉบับล่าสุด…</p>}
    {loadError && <div className="knowledge-callout" role="status">{loadError} <button className="knowledge-link" onClick={() => setAttempt(value=>value+1)}>ลองโหลดอีกครั้ง</button></div>}
    {notice && <p className="knowledge-callout" role="status">{notice}</p>}{error && <p className="knowledge-error" role="alert">{error}</p>}
    <form className="guide-global-search" onSubmit={event=>{event.preventDefault();setSearch(searchInput);}}><label>ค้นหาทุกหัวข้อ<input type="search" value={searchInput} onChange={event=>setSearchInput(event.target.value)} placeholder="เช่น อุทธรณ์, วันที่ 10, ลงนาม, Weather"/></label><button className="knowledge-primary">ค้นหา</button>{search&&<button type="button" className="knowledge-secondary" onClick={()=>{setSearch('');setSearchInput('');}}>ล้าง</button>}<button type="button" className="knowledge-secondary" disabled={pdfBusy || loading} onClick={()=>exportPdf(chapters)}>{pdfBusy?'กำลังสร้าง PDF…':'ดาวน์โหลดทั้งเล่ม'}</button></form>
    <div className="guide-layout"><nav className="guide-toc" aria-label="สารบัญคู่มือ">
      <label className="guide-mobile-select">เลือกหัวข้อ<select value={chapter?.id} onChange={event=>selectChapter(event.target.value)}>{chapters.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {search&&<div className="guide-search-results" role="region" aria-label="ผลการค้นหาคู่มือ"><strong>ผลการค้นหา {filtered.length} หัวข้อ</strong>{filtered.map(item=><button key={item.id} onClick={()=>selectChapter(item.id)}>{item.title}</button>)}{!filtered.length&&<p>ไม่พบข้อความ ลองใช้คำสั้นลง</p>}</div>}
      <div className="guide-complete-toc"><h2>สารบัญทั้งหมด ({chapters.length})</h2>{chapters.map(item=><button key={item.id} aria-current={chapter?.id===item.id} onClick={()=>selectChapter(item.id)}><small>{item.category}</small>{item.title}</button>)}</div>
    </nav><div className="guide-document">{chapter&&<>
      <header className="guide-document-header"><div><small>{chapter.category}</small><h2>{chapter.title}</h2><p>สำหรับ: {chapter.audience}</p></div>{canManage&&<button className="knowledge-secondary" disabled={loading || Boolean(loadError) || busy} onClick={()=>setEditing(editing?null:chapter)}>{editing?'กลับไปอ่าน PDF':'แก้ไขบทนี้'}</button>}</header>
      {!canReadChapter(chapter,permissions)&&<p className="knowledge-muted guide-access-note">อ่านขั้นตอนได้ครบ การทำรายการในหัวข้อนี้ต้องได้รับสิทธิ์ที่เกี่ยวข้อง</p>}
      {canManage&&stale.includes(chapter.id)&&<p className="knowledge-callout">บทนี้ปรับตาม Deploy ใหม่ กรุณาตรวจฉบับแก้ไขก่อนเผยแพร่ต่อ</p>}
      {editing&&canManage ? <GuideEditor key={`${editing.id}:${editing.revision || 0}`} chapter={editing} busy={busy} onCancel={()=>setEditing(null)} onPublish={publish}/> : <Suspense fallback={<p role="status">กำลังเปิดตัวอ่าน PDF…</p>}><PdfReader chapter={chapter}/></Suspense>}
    </>}</div></div>
    <details className="guide-updates"><summary>สิ่งที่เปลี่ยนในคู่มือ {MANUAL.version}</summary>{MANUAL.releaseNotes.map(note=><p key={note}>• {note}</p>)}</details>
  </main>;
}

export function GuideDrawer(props: Props & { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = panel.current;
    node?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); props.onClose(); return; }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')).filter((item) => item.getClientRects().length > 0);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [props.onClose]);
  return <div className="guide-overlay" onClick={(event) => { if (event.target === event.currentTarget) props.onClose(); }}><div className="guide-drawer" ref={panel} role="dialog" aria-modal="true" aria-label="คู่มือหน้านี้"><UserGuide {...props} drawer /></div></div>;
}
