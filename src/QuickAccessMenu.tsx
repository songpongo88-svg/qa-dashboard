import React, { useEffect, useMemo, useRef, useState } from "react";
import "./quickAccess.css";

type Category = "work" | "document" | "report" | "other";
type MenuIcon = "auto" | "chat" | "dashboard" | "bike" | "users" | "presentation" | "sheet" | "link" | "file" | "chart" | "book" | "globe";
type QuickLink = { id: string; title: string; url: string; category: Category; icon: MenuIcon; sortOrder: number };
type DraftLink = Pick<QuickLink, "title" | "url" | "category" | "icon">;

const INITIAL_LINKS: QuickLink[] = [
  { id: "initial-oho", title: "Oho Chat", url: "https://app.oho.chat/", category: "work", icon: "chat", sortOrder: 0 },
  { id: "initial-panel", title: "Admin Panel V2", url: "https://adminpanel-v2-prod.robinhood.in.th/login/", category: "work", icon: "dashboard", sortOrder: 1 },
  { id: "initial-ops", title: "Rider OPS", url: "https://operations-portal.apps.prod.riderplatform.com/rider", category: "work", icon: "bike", sortOrder: 2 },
  { id: "initial-consumer", title: "Consumer Profile", url: "https://adminpanel.robinhood.in.th/consumer/profile", category: "work", icon: "users", sortOrder: 3 },
  { id: "initial-sharepoint", title: "SharePoint", url: "https://purpleventuresth-my.sharepoint.com/:p:/g/personal/phrommarin_robinhood_co_th/IQDHaQVM1m1OQrQlC10AIRAzAZYOMEYFO3DgserHGSo_rpM?e=6sVdyi", category: "document", icon: "presentation", sortOrder: 4 },
  { id: "initial-sheets", title: "Google Sheets", url: "https://docs.google.com/spreadsheets/d/1a-ojTDu7Fj7Wbm99KYjTLtgKtGYsR04NQ4TZE33oIhY/edit", category: "report", icon: "sheet", sortOrder: 5 },
];
const CATEGORIES: Array<{ value: Category | "all"; label: string }> = [
  { value: "all", label: "ทั้งหมด" }, { value: "work", label: "ระบบงาน" },
  { value: "document", label: "เอกสาร" }, { value: "report", label: "รายงาน" },
  { value: "other", label: "อื่น ๆ" },
];
const ICONS: MenuIcon[] = ["auto", "chat", "dashboard", "bike", "users", "presentation", "sheet", "link", "file", "chart", "book", "globe"];
const EMPTY_DRAFT: DraftLink = { title: "", url: "", category: "other", icon: "auto" };
const safeUrl = (raw: string) => {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname.includes(".") ||
        /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(url.hostname)) return "";
    return url.toString();
  } catch { return ""; }
};
const suggestTitle = (raw: string) => {
  const url = safeUrl(raw);
  if (!url) return "";
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.includes("docs.google.")) return "Google Docs";
  if (host.includes("sheets.google.") || host.includes("spreadsheets")) return "Google Sheets";
  const first = host.split(".")[0] || "";
  return first.charAt(0).toUpperCase() + first.slice(1).replace(/[-_]/g, " ");
};
const selectedIcon = (item: QuickLink | DraftLink) => item.icon === "auto" ? "globe" : item.icon;
const iconColors: Record<MenuIcon, string> = {
  auto: "#64748b", chat: "#11a999", dashboard: "#7555d4", bike: "#db922d",
  users: "#4587cc", presentation: "#cb6744", sheet: "#249e65", link: "#6e78be",
  file: "#5974a2", chart: "#6471d8", book: "#a66bb2", globe: "#6b7394",
};

function Glyph({ name, size = 23 }: { name: MenuIcon | "grid" | "close" | "search" | "plus" | "back" | "edit" | "trash" | "settings"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  let path: React.ReactNode;
  switch (name) {
    case "grid": path = <><rect x="2.5" y="2.5" width="5" height="5" rx="1" /><rect x="9.5" y="2.5" width="5" height="5" rx="1" /><rect x="16.5" y="2.5" width="5" height="5" rx="1" /><rect x="2.5" y="9.5" width="5" height="5" rx="1" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /><rect x="16.5" y="9.5" width="5" height="5" rx="1" /><rect x="2.5" y="16.5" width="5" height="5" rx="1" /><rect x="9.5" y="16.5" width="5" height="5" rx="1" /><rect x="16.5" y="16.5" width="5" height="5" rx="1" /></>; break;
    case "close": path = <path d="M18 6 6 18M6 6l12 12" />; break;
    case "search": path = <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></>; break;
    case "plus": path = <path d="M12 5v14M5 12h14" />; break;
    case "back": path = <path d="m15 18-6-6 6-6" />; break;
    case "edit": path = <><path d="M12 20h9" /><path d="M17 3a2.1 2.1 0 0 1 3 3L9 17l-5 1 1-5Z" /></>; break;
    case "trash": path = <><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7" /></>; break;
    case "settings": path = <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="white"/><circle cx="16" cy="17" r="2" fill="white"/></>; break;
    case "chat": path = <><path d="M4 4h16v13H9l-5 4V4Z" /><path d="M8 9h8M8 13h6" /></>; break;
    case "dashboard": path = <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="5" rx="1" /><rect x="13" y="10" width="8" height="11" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /></>; break;
    case "bike": path = <><circle cx="5.5" cy="17" r="3.5" /><circle cx="18.5" cy="17" r="3.5" /><path d="m5.5 17 5-9 4 9h4l-4-9h-3M9 6h4" /></>; break;
    case "users": path = <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5v1" /></>; break;
    case "presentation": path = <><rect x="3" y="3" width="18" height="14" rx="2" /><path d="M12 17v4m-5 0h10M7 8h10M7 12h7" /></>; break;
    case "sheet": path = <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M4 9h16M4 15h16M12 9v13" /></>; break;
    case "file": path = <><path d="M6 2h8l5 5v15H6zM14 2v5h5M9 13h7M9 17h7" /></>; break;
    case "chart": path = <><path d="M3 3v18h18M7 16l5-6 4 3 5-8" /></>; break;
    case "book": path = <><path d="M12 6C9 4 6 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z M12 6v14" /></>; break;
    case "link": path = <><path d="M9 15l6-6M8 8l-2 2a4 4 0 0 0 6 6l2-2M16 16l2-2a4 4 0 0 0-6-6l-2 2" /></>; break;
    default: path = <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18" /></>;
  }
  return <svg {...common}>{path}</svg>;
}
function LinkIcon({ link, size = "large" }: { link: QuickLink | DraftLink; size?: "large" | "small" }) {
  const [broken, setBroken] = useState(false);
  const url = safeUrl(link.url);
  const domain = url ? new URL(url).origin : "";
  const auto = link.icon === "auto" && Boolean(domain) && !broken;
  const glyph = selectedIcon(link);
  return <span className={"qa-quick-icon qa-quick-icon--" + size} style={{ background: iconColors[glyph] }} aria-hidden="true">
    {auto ? <img src={domain + "/favicon.ico"} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <Glyph name={glyph} size={size === "small" ? 19 : 25} />}
  </span>;
}

async function sendRequest(username: string, sessionId: string, action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/cloud-status", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json", "x-qa-quick-access": "1" },
    body: JSON.stringify({ actorUsername: username, sessionId, action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่" :
    response.status === 403 ? "ไม่มีสิทธิ์จัดการ Quick Access" : "ไม่สามารถเชื่อมต่อรายการลิงก์ได้");
  if (!Array.isArray(data.links)) throw new Error("รูปแบบข้อมูลลิงก์ไม่ถูกต้อง");
  return data.links as QuickLink[];
}

export default function QuickAccessMenu({ username, sessionId, canManage }: { username: string; sessionId: string; canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"grid" | "manage" | "editor">("grid");
  const [links, setLinks] = useState<QuickLink[]>(INITIAL_LINKS);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftLink>(EMPTY_DRAFT);
  const [autoTitle, setAutoTitle] = useState(true);
  const dragId = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const updated = await sendRequest(username, sessionId, "list");
      setLinks(updated);
      setReady(true);
    } catch (e) {
      setReady(false);
      setError(e instanceof Error ? e.message : "ไม่สามารถโหลด Quick Access ได้");
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [username, sessionId]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const visible = useMemo(() => links
    .filter((link) => category === "all" || link.category === category)
    .filter((link) => !search.trim() || (link.title + " " + link.url).toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a,b) => a.sortOrder - b.sortOrder), [links, category, search]);
  const edit = (link?: QuickLink) => {
    setDraft(link ? { title: link.title, url: link.url, category: link.category, icon: link.icon } : { ...EMPTY_DRAFT });
    setEditingId(link?.id || null);
    setAutoTitle(!link);
    setError("");
    setMode("editor");
  };
  const mutate = async (action: "create" | "update" | "delete" | "reorder", payload: Record<string, unknown>) => {
    setSaving(true);
    setError("");
    try {
      const updated = await sendRequest(username, sessionId, action, payload);
      setLinks(updated);
      setReady(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally { setSaving(false); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || !ready || saving) return;
    const url = safeUrl(draft.url);
    if (!url) { setError("กรุณาใช้ลิงก์ HTTPS ที่ถูกต้อง"); return; }
    const title = draft.title.trim() || suggestTitle(url);
    if (!title || title.length > 64) { setError("ชื่อเมนูต้องมี 1–64 ตัวอักษร"); return; }
    const success = await mutate(editingId ? "update" : "create", { ...(editingId ? { id: editingId } : {}),
      link: { ...draft, title, url } });
    if (success) setMode("manage");
  };
  const remove = async (link: QuickLink) => {
    if (!canManage || !ready || saving || !window.confirm("ลบเมนู " + link.title + " จาก Quick Access ของทุกคนหรือไม่?")) return;
    await mutate("delete", { id: link.id });
  };
  const reorder = async (targetId: string) => {
    const moved = dragId.current;
    dragId.current = null;
    if (!canManage || !ready || saving || !moved || moved === targetId) return;
    const ordered = [...links].sort((a,b) => a.sortOrder - b.sortOrder);
    const oldIndex = ordered.findIndex(link => link.id === moved);
    const newIndex = ordered.findIndex(link => link.id === targetId);
    if (oldIndex < 0 || newIndex < 0) return;
    const [item] = ordered.splice(oldIndex, 1);
    ordered.splice(newIndex, 0, item);
    await mutate("reorder", { ids: ordered.map(link => link.id) });
  };

  return <div className="qa-quick-root" ref={rootRef} data-quick-access-menu="true">
    <button type="button" className={"qa-quick-trigger" + (open ? " qa-quick-trigger--open" : "")}
      aria-haspopup="dialog" aria-expanded={open} aria-label="Quick Access - External Links" title="Quick Access · External Links"
      onClick={() => { setOpen(!open); if (!open) { setMode("grid"); setError(""); } }}>
      <Glyph name="grid" size={20} /><span className="qa-quick-trigger-label">Quick Access</span>
    </button>
    {open && <div className="qa-quick-panel" role="dialog" aria-label="Quick Access External Links">
      <div className="qa-quick-head">
        <div className="qa-quick-head-left">
          {mode !== "grid" && <button type="button" className="qa-quick-plain" onClick={() => { setMode(mode === "editor" ? "manage" : "grid"); setError(""); }} aria-label="ย้อนกลับ"><Glyph name="back" size={19}/></button>}
          <div><strong>{mode === "grid" ? "Quick Access" : mode === "manage" ? "จัดการเมนูลัด" : editingId ? "แก้ไขเมนูลัด" : "เพิ่มเมนูลัด"}</strong>
            <small>External Links · QA Dashboard</small></div>
        </div>
        <button type="button" className="qa-quick-plain" onClick={() => setOpen(false)} aria-label="ปิด Quick Access"><Glyph name="close" size={19}/></button>
      </div>
      {error && <div className="qa-quick-alert" role="status">{error} {!ready && <button type="button" disabled={loading} onClick={() => void refresh()}>ลองใหม่</button>}</div>}
      {mode === "grid" ? <>
        <div className="qa-quick-search"><Glyph name="search" size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาระบบหรือเอกสาร..." aria-label="ค้นหา Quick Access"/></div>
        <div className="qa-quick-categories" aria-label="ประเภทเมนู">{CATEGORIES.map(item => <button key={item.value} type="button" aria-pressed={category === item.value}
          className={category === item.value ? "selected" : ""} onClick={() => setCategory(item.value)}>{item.label}</button>)}</div>
        <div className="qa-quick-grid" role="list">{visible.map(link => <a role="listitem" key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
          className="qa-quick-tile" title={link.title + " · " + link.url}>
          <LinkIcon link={link}/><span>{link.title}</span>
        </a>)}
          {!visible.length && <div className="qa-quick-empty">ไม่พบเมนูที่ค้นหา</div>}
        </div>
        <div className="qa-quick-footer"><span>{loading ? "กำลังอัปเดต..." : links.length + " เมนูลัด"}</span>
          <div className="qa-quick-footer-actions">
            <button type="button" className="qa-quick-text-btn" onClick={() => void refresh()} disabled={loading} title="อัปเดตเมนู">รีเฟรช</button>
            {canManage && <button type="button" className="qa-quick-text-btn" onClick={() => { setMode("manage"); setError(""); }}><Glyph name="settings" size={15}/> จัดการเมนู</button>}
          </div>
        </div>
      </> : mode === "manage" ? <>
        <div className="qa-quick-manage-toolbar"><span>ลากรายการเพื่อเปลี่ยนลำดับ</span><button type="button" disabled={!ready || saving} onClick={() => edit()}><Glyph name="plus" size={17}/> เพิ่มลิงก์</button></div>
        <div className="qa-quick-manage-list">{[...links].sort((a,b) => a.sortOrder - b.sortOrder).map(link =>
          <div key={link.id} className="qa-quick-manage-row" draggable={ready && !saving}
            onDragStart={() => { dragId.current = link.id; }}
            onDragOver={(event) => { if (dragId.current) event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); void reorder(link.id); }}
            onDragEnd={() => { dragId.current = null; }}>
            <span className="qa-quick-drag" aria-hidden="true">⠿</span><LinkIcon link={link} size="small"/>
            <div className="qa-quick-manage-name"><strong>{link.title}</strong><span>{new URL(link.url).hostname}</span></div>
            <button type="button" disabled={!ready || saving} onClick={() => edit(link)} title={"แก้ไข " + link.title} aria-label={"แก้ไข " + link.title}><Glyph name="edit" size={17}/></button>
            <button type="button" disabled={!ready || saving} onClick={() => void remove(link)} title={"ลบ " + link.title} aria-label={"ลบ " + link.title}><Glyph name="trash" size={17}/></button>
          </div>)}
        </div>
        <div className="qa-quick-footer"><span>การเปลี่ยนแปลงมีผลกับทุก User</span></div>
      </> : <form onSubmit={(event) => void save(event)} className="qa-quick-form">
        <label>ลิงก์เว็บไซต์ (HTTPS)
          <input required type="url" value={draft.url} placeholder="https://example.com"
            onChange={(event) => { const url = event.target.value; setDraft(previous => ({ ...previous, url, title: autoTitle ? suggestTitle(url) : previous.title })); }}/>
        </label>
        <label>ชื่อเมนู
          <input required maxLength={64} value={draft.title} placeholder="ชื่อที่ต้องการแสดง"
            onChange={(event) => { setAutoTitle(false); setDraft(previous => ({ ...previous, title: event.target.value })); }}/>
        </label>
        <label>หมวดหมู่
          <select value={draft.category} onChange={(event) => setDraft(previous => ({ ...previous, category: event.target.value as Category }))}>
            {CATEGORIES.filter(option => option.value !== "all").map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>ไอคอน
          <select value={draft.icon} onChange={(event) => setDraft(previous => ({ ...previous, icon: event.target.value as MenuIcon }))}>
            {ICONS.map(icon => <option key={icon} value={icon}>{icon === "auto" ? "Favicon อัตโนมัติ" : icon}</option>)}
          </select>
        </label>
        <div className="qa-quick-preview"><LinkIcon link={draft}/><div><strong>{draft.title || "ตัวอย่างชื่อเมนู"}</strong><small>Preview · Quick Access</small></div></div>
        <div className="qa-quick-form-actions"><button type="button" onClick={() => setMode("manage")}>ยกเลิก</button><button type="submit" disabled={!ready || saving || !safeUrl(draft.url) || !draft.title.trim()}>{saving ? "กำลังบันทึก..." : "บันทึกเมนู"}</button></div>
      </form>}
    </div>}
  </div>;
}
