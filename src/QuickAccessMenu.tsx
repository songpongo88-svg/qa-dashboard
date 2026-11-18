import React, { useEffect, useMemo, useRef, useState } from "react";
import "./quickAccess.css";

type Category = "work" | "document" | "report" | "other";
type MenuIcon = "auto" | "chat" | "dashboard" | "bike" | "users" | "presentation" | "sheet" | "link" | "file" | "chart" | "book" | "globe";
type QuickLink = { id: string; title: string; url: string; category: Category; icon: MenuIcon; sortOrder: number; groupName?: string };
type DraftLink = Pick<QuickLink, "title" | "url" | "category" | "icon"> & { groupName: string };

// Source of truth for the six Excel "Grop" items and ten links. The server's
// stored rows take precedence once the authenticated API responds.
const INITIAL_LINKS: QuickLink[] = [
  { id:"initial-oho", title:"Oho Chat", url:"https://app.oho.chat/", category:"work", icon:"chat", sortOrder:0, groupName:"Oho Chat" },
  { id:"initial-process", title:"New Procees 2026", url:"https://purpleventuresth-my.sharepoint.com/:p:/g/personal/phrommarin_robinhood_co_th/IQDHaQVM1m1OQrQlC10AIRAzAZYOMEYFO3DgserHGSo_rpM?e=6sVdyi", category:"document", icon:"presentation", sortOrder:1, groupName:"Process" },
  { id:"initial-admin-v2", title:"Admin Panel V2", url:"https://adminpanel-v2-prod.robinhood.in.th/login/", category:"work", icon:"dashboard", sortOrder:2, groupName:"Admin Panel" },
  { id:"initial-admin-v1", title:"Admin Panel V1", url:"https://adminpanel.robinhood.in.th/", category:"work", icon:"dashboard", sortOrder:3, groupName:"Admin Panel" },
  { id:"initial-ops", title:"Rider Portal", url:"https://operations-portal.apps.prod.riderplatform.com/rider", category:"work", icon:"bike", sortOrder:4, groupName:"Operations Portal" },
  { id:"initial-shift", title:"Shift schedule 2026", url:"https://docs.google.com/spreadsheets/d/1a-ojTDu7Fj7Wbm99KYjTLtgKtGYsR04NQ4TZE33oIhY/edit?gid=709504718#gid=709504718", category:"document", icon:"sheet", sortOrder:5, groupName:"Sheet Share Point" },
  { id:"initial-rider-test", title:"แบบทดสอบวัดความรู้ผู้เข้าอบรมคนขับใหม่ปี 2568 (ผู้สมัครใหม่กรุงเทพและปริมณฑล) ใหม่", url:"https://docs.google.com/spreadsheets/d/1AbgIhy9UNueWgF-ecrSAaM5HFsmUIG8AmUMJpoc_Y7o/edit?gid=473201267#gid=473201267", category:"document", icon:"sheet", sortOrder:6, groupName:"Sheet Share Point" },
  { id:"initial-merchant-lead", title:"CS- Merchant Lead - Acquire 2026", url:"https://docs.google.com/spreadsheets/d/1u2VTy_V7zlFGgIXmvDWMkdVF1bNtZyADuaqvhT_uIn0/edit?gid=37513336#gid=37513336", category:"document", icon:"sheet", sortOrder:7, groupName:"Sheet Share Point" },
  { id:"initial-oper", title:"ไฟล์โอนเงินตัดเงินทั้งหมด (OPER)", url:"https://purpleventuresth-my.sharepoint.com/:x:/g/personal/nichakarn_robinhood_co_th/IQCJXQuVegwFTId9y9Ru0NrOASKNFZN8sWess-PKjZ__YmQ?e=a3sLmM", category:"document", icon:"sheet", sortOrder:8, groupName:"Sheet Share Point" },
  { id:"initial-promotion", title:"promotion-engine", url:"https://promotion-engine-management-web.robinhood.in.th/login/", category:"work", icon:"dashboard", sortOrder:9, groupName:"Promotion Check" },
];
const GROUP_ORDER = ["Oho Chat", "Process", "Admin Panel", "Operations Portal", "Sheet Share Point", "Promotion Check"] as const;
type QuickGroup = { name: string; links: QuickLink[]; category: Category; order: number };
function groupLinks(items: QuickLink[]): QuickGroup[] {
  const groups = new Map<string, QuickGroup>();
  for (const item of [...items].sort((a,b) => a.sortOrder - b.sortOrder)) {
    const name = (item.groupName || item.title).trim();
    let group = groups.get(name);
    if (!group) { group = { name, links: [], category: item.category, order: item.sortOrder }; groups.set(name, group); }
    group.links.push(item);
    group.order = Math.min(group.order, item.sortOrder);
  }
  return [...groups.values()].sort((a,b) => {
    const aIndex = GROUP_ORDER.findIndex(name => name === a.name);
    const bIndex = GROUP_ORDER.findIndex(name => name === b.name);
    if (aIndex >= 0 || bIndex >= 0) return (aIndex < 0 ? 1000 : aIndex) - (bIndex < 0 ? 1000 : bIndex);
    return a.order - b.order;
  });
}
function GroupIcon({ group }: { group: QuickGroup }) {
  if (group.links.length === 1) return <LinkIcon link={group.links[0]}/>;
  const bundledIcon = group.name === "Admin Panel" ? "/robinhood-logo.png"
    : group.name === "Sheet Share Point" ? "/quick-access/sharepoint.svg" : "";
  if (bundledIcon) return <span className="qa-quick-icon qa-quick-icon--large qa-quick-icon--brand" aria-hidden="true">
    <img src={bundledIcon} alt="" loading="lazy"/>
  </span>;
  return <LinkIcon link={group.links[0]}/>;
}
const CATEGORIES: Array<{ value: Category | "all"; label: string }> = [
  { value: "all", label: "ทั้งหมด" }, { value: "work", label: "ระบบงาน" },
  { value: "document", label: "เอกสาร" }, { value: "report", label: "รายงาน" },
  { value: "other", label: "อื่น ๆ" },
];
const ICONS: MenuIcon[] = ["auto", "chat", "dashboard", "bike", "users", "presentation", "sheet", "link", "file", "chart", "book", "globe"];
const EMPTY_DRAFT: DraftLink = { title: "", url: "", category: "other", icon: "auto", groupName: "" };
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
// Prefer each website's own favicon. Known work portals have verified product-brand
// fallbacks because private login screens may not expose an icon to unauthenticated browsers.
// Only the origin / hostname are sent to icon services: never disclose link paths or query strings.
function logoCandidates(rawUrl: string): string[] {
  const href = safeUrl(rawUrl);
  if (!href) return [];
  const website = new URL(href);
  const host = website.hostname.toLowerCase();
  const direct = website.origin + "/favicon.ico";
  const googleFavicon = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=128";

  // Public, brand-specific images are bundled locally. Many private internal
  // login pages return a blank favicon and cannot provide the correct icon.
  if (host === "app.oho.chat") return ["/quick-access/oho-chat.svg", direct, googleFavicon];
  if (host === "docs.google.com" && website.pathname.startsWith("/spreadsheets/"))
    return ["/quick-access/google-sheets.svg", direct, googleFavicon];
  if (host.endsWith(".sharepoint.com") || host === "sharepoint.com")
    return ["/quick-access/sharepoint.svg", direct, googleFavicon];
  if (host === "adminpanel-v2-prod.robinhood.in.th" ||
      host === "adminpanel.robinhood.in.th" ||
      host === "operations-portal.apps.prod.riderplatform.com")
    return ["/robinhood-logo.png", direct, googleFavicon];

  // Other user-created links remain personalized to their real website.
  return [direct, googleFavicon];
}
function quickAccessProductLabel(rawUrl: string): string {
  const href = safeUrl(rawUrl);
  if (!href) return "";
  const host = new URL(href).hostname.toLowerCase();
  if (host === "adminpanel-v2-prod.robinhood.in.th") return "V2";
  if (host === "operations-portal.apps.prod.riderplatform.com") return "OPS";
  if (host === "adminpanel.robinhood.in.th") return "USER";
  return "";
}
function LinkIcon({ link, size = "large" }: { link: QuickLink | DraftLink; size?: "large" | "small" }) {
  const [attempt, setAttempt] = useState(0);
  const logos = useMemo(() => logoCandidates(link.url), [link.url]);
  useEffect(() => setAttempt(0), [link.url]);
  const logoSrc = logos[attempt];
  const glyph = selectedIcon(link);
  const productLabel = quickAccessProductLabel(link.url);
  return <span className={"qa-quick-icon qa-quick-icon--" + size + (logoSrc ? " qa-quick-icon--brand" : "")}
    data-icon-source={logoSrc ? "website" : "fallback"}
    style={{ background: logoSrc ? "#ffffff" : iconColors[glyph] }} aria-hidden="true">
    {logoSrc ?
      <img key={logoSrc} src={logoSrc} alt="" loading="lazy" referrerPolicy="no-referrer"
        onError={() => setAttempt(index => index + 1)} /> :
      <Glyph name={glyph} size={size === "small" ? 19 : 25} />}
    {logoSrc && productLabel ? <span className="qa-quick-product-label" aria-hidden="true">{productLabel}</span> : null}
  </span>;
}

class QuickAccessSessionError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "QuickAccessSessionError";
    this.code = code;
  }
}

async function sendRequest(username: string, sessionId: string, action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/cloud-status", {
    method: "POST", credentials: "same-origin",
    headers: { "content-type": "application/json", "x-qa-quick-access": "1" },
    body: JSON.stringify({ actorUsername: username, sessionId, action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      const code = String(data.code || "SESSION_INVALID");
      const descriptions: Record<string,string> = {
        SESSION_EXPIRED: "Session หมดอายุแล้ว กรุณาบันทึกงานค้างก่อนเข้าสู่ระบบใหม่",
        SESSION_REVOKED: "Session นี้ถูกยกเลิกแล้ว กรุณาบันทึกงานค้างก่อนเข้าสู่ระบบใหม่",
        SESSION_ID_MISSING: "ไม่พบรหัส Session ที่ถูกต้อง กรุณาเข้าสู่ระบบใหม่",
        SESSION_NOT_FOUND: "ไม่พบ Session ในระบบกลาง กรุณาเข้าสู่ระบบใหม่",
        SESSION_MISMATCH: "บัญชีและ Session ไม่ตรงกัน กรุณาเข้าสู่ระบบใหม่",
        SESSION_POLICY: "Session ใช้นโยบายเก่า กรุณาเข้าสู่ระบบใหม่",
        SESSION_INVALID: "Session นี้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่",
      };
      throw new QuickAccessSessionError(descriptions[code] || "Session ยืนยันตัวตนไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่", code);
    }
    if (response.status === 403) throw new Error("บัญชีนี้ไม่มีสิทธิ์จัดการ Quick Access กรุณาติดต่อ Admin");
    if (response.status === 503 && data.code === "STORAGE_AUTH_UNAVAILABLE")
      throw new Error("Quick Access เชื่อมต่อ Supabase ไม่ผ่านการยืนยันสิทธิ์ฝั่งเซิร์ฟเวอร์ ไม่ใช่ปัญหา Session ของคุณ กรุณาแจ้งผู้ดูแลระบบ");
    if (response.status === 503 && data.code === "FIRESTORE_HTTP_429")
      throw new Error("Firestore ถึงขีดจำกัดการอ่าน Session ชั่วคราว ระบบจะไม่อนุญาตให้บันทึกโดยข้ามการยืนยันตัวตน");
    if (response.status === 503 && data.code?.startsWith?.("FIRESTORE_HTTP_"))
      throw new Error("เซิร์ฟเวอร์ไม่สามารถอ่าน Session ใน Firestore ได้ (รหัส " + String(data.code).replace("FIRESTORE_HTTP_", "") + ") กรุณาติดต่อผู้ดูแลระบบ");
    throw new Error("เชื่อมต่อรายการลิงก์ส่วนกลางไม่สำเร็จ กรุณาลองใหม่โดยไม่ต้องออกจากระบบ");
  }
  if (!Array.isArray(data.links)) throw new Error("รูปแบบข้อมูลลิงก์ไม่ถูกต้อง");
  return data.links as QuickLink[];
}

export default function QuickAccessMenu({ username, sessionId, canManage, onReauthenticate, onRenewSession }: {
  username: string; sessionId: string; canManage: boolean;
  onReauthenticate: () => void;
  onRenewSession: (password: string) => Promise<{ok:boolean;message?:string}>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"grid" | "group" | "manage" | "editor">("grid");
  const [activeGroup, setActiveGroup] = useState("");
  const [links, setLinks] = useState<QuickLink[]>(INITIAL_LINKS);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sessionErrorCode, setSessionErrorCode] = useState("");
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewPassword, setRenewPassword] = useState("");
  const [renewBusy, setRenewBusy] = useState(false);
  const [renewError, setRenewError] = useState("");
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
    setSessionErrorCode("");
    try {
      const updated = await sendRequest(username, sessionId, "list");
      setLinks(updated);
      setEditingId(previous => {
        if (!previous?.startsWith("initial-")) return previous;
        const source = INITIAL_LINKS.find(item => item.id === previous);
        if (!source) return previous;
        const matches = updated.filter(item => item.url === source.url);
        return matches.length === 1 ? matches[0].id : previous;
      });
      setReady(true);
      setRenewOpen(false);
      setRenewPassword("");
      setRenewError("");
    } catch (e) {
      setReady(false);
      setSessionErrorCode(e instanceof QuickAccessSessionError ? e.code : "");
      setError(e instanceof Error ? e.message : "ไม่สามารถโหลด Quick Access ได้");
    } finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [username, sessionId]);
  const renewCurrentSession = async (event: React.FormEvent) => {
    event.preventDefault();
    if (renewBusy || !canManage || !renewPassword.trim()) return;
    setRenewBusy(true);
    setRenewError("");
    try {
      const result = await onRenewSession(renewPassword);
      setRenewPassword("");
      if (!result.ok) setRenewError(result.message || "ยืนยันตัวตนไม่สำเร็จ");
      else {
        // The parent supplies a new sessionId and refresh() reloads real link
        // IDs. Do not discard an edited title or URL during re-verification.
        setRenewOpen(false);
        setRenewError("");
        setError("ยืนยันตัวตนสำเร็จ กำลังตรวจสอบ Session ใหม่...");
      }
    } catch {
      setRenewPassword("");
      setRenewError("ไม่สามารถออก Session ใหม่ได้ กรุณาลองอีกครั้ง");
    } finally {
      setRenewBusy(false);
    }
  };
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
    .filter((link) => !search.trim() || (link.title + " " + link.url + " " + (link.groupName || "")).toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a,b) => a.sortOrder - b.sortOrder), [links, category, search]);
  const visibleGroups = useMemo(() => groupLinks(visible), [visible]);
  const selectedGroup = useMemo(() => groupLinks(links).find(group => group.name === activeGroup), [links, activeGroup]);
  const edit = (link?: QuickLink) => {
    setDraft(link ? { title: link.title, url: link.url, category: link.category, icon: link.icon, groupName: link.groupName || link.title } : { ...EMPTY_DRAFT });
    setEditingId(link?.id || null);
    setAutoTitle(!link);
    if (ready) setError("");
    // Preserve the actual request failure if the user opens an editor while
    // offline, rather than replacing it with a generic disabled-button notice.
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
      setSessionErrorCode(e instanceof QuickAccessSessionError ? e.code : "");
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      return false;
    } finally { setSaving(false); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || saving) return;
    if (!ready) {
      if (!error) setError("ยังเชื่อมต่อ Quick Access ไม่สำเร็จ กรุณากดตรวจสอบการเชื่อมต่ออีกครั้ง");
      return;
    }
    if (editingId?.startsWith("initial-")) {
      setError("รายการนี้เป็นข้อมูลตั้งต้น ไม่พบรหัสรายการจริงใน Supabase กรุณากลับไปเลือกรายการหลังเชื่อมต่อสำเร็จ");
      return;
    }
    const url = safeUrl(draft.url);
    if (!url) { setError("กรุณาใช้ลิงก์ HTTPS ที่ถูกต้อง"); return; }
    const title = draft.title.trim() || suggestTitle(url);
    if (!title || title.length > 180) { setError("ชื่อเมนูต้องมี 1–180 ตัวอักษร"); return; }
    const groupName = (draft.groupName.trim() || title);
    if (groupName.length > 64) { setError("ชื่อ Item ต้องมี 1–64 ตัวอักษร"); return; }
    const success = await mutate(editingId ? "update" : "create", { ...(editingId ? { id: editingId } : {}),
      link: { ...draft, title, url, groupName } });
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
      onClick={() => {
        setOpen(!open);
        if (!open) {
          setMode("grid");
          // Retry once on reopen after login/session startup races.
          if (!ready && !loading) void refresh();
        }
      }}>
      <Glyph name="grid" size={20} /><span className="qa-quick-trigger-label">Quick Access</span>
    </button>
    {open && <div className="qa-quick-panel" role="dialog" aria-label="Quick Access External Links">
      <div className="qa-quick-head">
        <div className="qa-quick-head-left">
          {mode !== "grid" && <button type="button" className="qa-quick-plain" onClick={() => { setMode(mode === "editor" ? "manage" : "grid"); setError(""); }} aria-label="ย้อนกลับ"><Glyph name="back" size={19}/></button>}
          <div><strong>{mode === "grid" ? "Quick Access" : mode === "group" ? activeGroup : mode === "manage" ? "จัดการเมนูลัด" : editingId ? "แก้ไขเมนูลัด" : "เพิ่มเมนูลัด"}</strong>
            <small>External Links · QA Dashboard</small></div>
        </div>
        <button type="button" className="qa-quick-plain" onClick={() => setOpen(false)} aria-label="ปิด Quick Access"><Glyph name="close" size={19}/></button>
      </div>
      {error && (mode === "grid" || mode === "group" || ready) && <div className="qa-quick-alert" role="status">
        <span>{error}</span>
        {!ready && <div className="qa-quick-alert-actions">
          <button type="button" disabled={loading} onClick={() => void refresh()}>ตรวจสอบอีกครั้ง</button>
          {sessionErrorCode && canManage && <button type="button" onClick={() => setRenewOpen(true)}>ยืนยันรหัสผ่านเพื่อแก้ไข</button>}
          {sessionErrorCode && <button type="button" onClick={onReauthenticate}>ออกจากระบบและ Login ใหม่</button>}
        </div>}
      </div>}
      {renewOpen && sessionErrorCode && canManage && <form onSubmit={(event) => void renewCurrentSession(event)}
        className="qa-quick-renew-form" aria-label="ยืนยันรหัสผ่านเพื่อแก้ไข Quick Access">
        <strong>ยืนยันตัวตนเพื่อแก้ไขเมนู</strong>
        <span>กรอกรหัสผ่านของบัญชี {username} เพื่อเปิด Session ใหม่โดยไม่ปิดหน้างานที่กำลังทำอยู่</span>
        <label>รหัสผ่านปัจจุบัน
          <input type="password" autoComplete="current-password" value={renewPassword}
            onChange={event => setRenewPassword(event.target.value)}
            autoFocus required aria-label="รหัสผ่านปัจจุบันสำหรับ Quick Access"/>
        </label>
        {renewError && <p role="alert">{renewError}</p>}
        <div className="qa-quick-recovery-actions">
          <button type="button" disabled={renewBusy} onClick={() => {setRenewOpen(false);setRenewPassword("");setRenewError("");}}>ยกเลิก</button>
          <button type="submit" disabled={renewBusy || !renewPassword.trim()}>
            {renewBusy ? "กำลังยืนยัน..." : "ยืนยันและเปิดการแก้ไข"}
          </button>
        </div>
      </form>}
      {mode === "grid" ? <>
        <div className="qa-quick-search"><Glyph name="search" size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาระบบหรือเอกสาร..." aria-label="ค้นหา Quick Access"/></div>
        <div className="qa-quick-categories" aria-label="ประเภทเมนู">{CATEGORIES.map(item => <button key={item.value} type="button" aria-pressed={category === item.value}
          className={category === item.value ? "selected" : ""} onClick={() => setCategory(item.value)}>{item.label}</button>)}</div>
        <div className="qa-quick-grid" role="list">{visibleGroups.map(group =>
          group.links.length === 1 ? <a role="listitem" key={group.name} href={group.links[0].url} target="_blank" rel="noopener noreferrer"
            className="qa-quick-tile" title={group.name + " · " + group.links[0].title}>
            <GroupIcon group={group}/><span>{group.name}</span>
          </a> : <button role="listitem" type="button" key={group.name} className="qa-quick-tile"
            aria-label={"เปิดกลุ่ม " + group.name + " มี " + group.links.length + " ลิงก์"}
            onClick={() => { setActiveGroup(group.name); setMode("group"); }}>
            <GroupIcon group={group}/><span>{group.name}</span><small>{group.links.length} ลิงก์</small>
          </button>
        )}
          {!visibleGroups.length && <div className="qa-quick-empty">ไม่พบเมนูที่ค้นหา</div>}
        </div>
        <div className="qa-quick-footer"><span>{loading ? "กำลังอัปเดต..." : visibleGroups.length + " Items · " + links.length + " ลิงก์"}</span>
          <div className="qa-quick-footer-actions">
            <button type="button" className="qa-quick-text-btn" onClick={() => void refresh()} disabled={loading} title="อัปเดตเมนู">รีเฟรช</button>
            {canManage && <button type="button" className="qa-quick-text-btn" onClick={() => setMode("manage")}><Glyph name="settings" size={15}/> จัดการเมนู</button>}
          </div>
        </div>
      </> : mode === "group" ? <>
        <div className="qa-quick-group-list" role="list" aria-label={"ลิงก์ในกลุ่ม " + activeGroup}>
          {(selectedGroup?.links || []).map(link => <a key={link.id} role="listitem" className="qa-quick-group-link"
            href={link.url} target="_blank" rel="noopener noreferrer" title={link.url}>
            <LinkIcon link={link} size="small"/>
            <span className="qa-quick-group-name">{link.title}</span>
            <Glyph name="link" size={16}/>
          </a>)}
          {!selectedGroup && <div className="qa-quick-empty">ไม่พบรายการในกลุ่ม กรุณากลับไปเลือก Item อีกครั้ง</div>}
        </div>
        <div className="qa-quick-footer"><span>{selectedGroup?.links.length || 0} ลิงก์ในกลุ่ม</span></div>
      </> : mode === "manage" ? <>
        {!ready && <div className="qa-quick-manage-unavailable" role="status">
          <strong>ยังแก้ไขรายการส่วนกลางไม่ได้</strong>
          <span>{error || "ระบบกำลังตรวจสอบ Session ก่อนโหลดลิงก์จริงจากฐานข้อมูล"}</span>
          <div className="qa-quick-recovery-actions">
            <button type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "กำลังเชื่อมต่อ..." : "ตรวจสอบอีกครั้ง"}</button>
          </div>
        </div>}
        <div className="qa-quick-manage-toolbar"><span>ลากรายการเพื่อเปลี่ยนลำดับ</span><button type="button" disabled={!ready || saving} onClick={() => edit()}><Glyph name="plus" size={17}/> เพิ่มลิงก์</button></div>
        <div className="qa-quick-manage-list">{[...links].sort((a,b) => a.sortOrder - b.sortOrder).map(link =>
          <div key={link.id} className="qa-quick-manage-row" draggable={ready && !saving}
            onDragStart={() => { dragId.current = link.id; }}
            onDragOver={(event) => { if (dragId.current) event.preventDefault(); }}
            onDrop={(event) => { event.preventDefault(); void reorder(link.id); }}
            onDragEnd={() => { dragId.current = null; }}>
            <span className="qa-quick-drag" aria-hidden="true">⠿</span><LinkIcon link={link} size="small"/>
            <div className="qa-quick-manage-name"><strong>{link.title}</strong><span>{link.groupName || link.title} · {new URL(link.url).hostname}</span></div>
            <button type="button" disabled={!ready || saving} onClick={() => edit(link)} title={"แก้ไข " + link.title} aria-label={"แก้ไข " + link.title}><Glyph name="edit" size={17}/></button>
            <button type="button" disabled={!ready || saving} onClick={() => void remove(link)} title={"ลบ " + link.title} aria-label={"ลบ " + link.title}><Glyph name="trash" size={17}/></button>
          </div>)}
        </div>
        <div className="qa-quick-footer"><span>การเปลี่ยนแปลงมีผลกับทุก User</span></div>
      </> : <form onSubmit={(event) => void save(event)} className="qa-quick-form">
        {!ready && <div className="qa-quick-manage-unavailable" role="status">
          <strong>{loading ? "กำลังตรวจสอบการเชื่อมต่อ..." : "ยังบันทึกเมนูไม่ได้"}</strong>
          <span>{error || "ระบบต้องตรวจสอบ Session กับเซิร์ฟเวอร์ก่อนบันทึก"}</span>
          <div className="qa-quick-recovery-actions">
            <button type="button" disabled={loading} onClick={() => void refresh()}>
              {loading ? "กำลังเชื่อมต่อ..." : "ตรวจสอบการเชื่อมต่อใหม่"}
            </button>
          </div>
        </div>}
        {ready && editingId?.startsWith("initial-") && <div className="qa-quick-manage-unavailable" role="alert">
          <strong>ยังไม่พบรหัสรายการจริงในฐานข้อมูล</strong>
          <span>กรุณาย้อนกลับไปเลือกเมนูเดิมอีกครั้ง เพื่อป้องกันการบันทึกทับผิดรายการ</span>
        </div>}
        <label>ลิงก์เว็บไซต์ (HTTPS)
          <input required type="url" value={draft.url} placeholder="https://example.com"
            onChange={(event) => { const url = event.target.value; setDraft(previous => ({ ...previous, url, title: autoTitle ? suggestTitle(url) : previous.title })); }}/>
        </label>
        <label>ชื่อเมนู
          <input required maxLength={180} value={draft.title} placeholder="ชื่อที่ต้องการแสดง"
            onChange={(event) => { setAutoTitle(false); setDraft(previous => ({ ...previous, title: event.target.value })); }}/>
        </label>
        <label>Item / กลุ่มหลัก (ตามคอลัมน์ Grop ใน Excel)
          <input maxLength={64} list="qa-quick-group-options" value={draft.groupName} placeholder="เช่น Admin Panel"
            onChange={(event) => setDraft(previous => ({ ...previous, groupName: event.target.value }))}/>
          <datalist id="qa-quick-group-options">{GROUP_ORDER.map(name => <option key={name} value={name}/>)}</datalist>
        </label>
        <label>หมวดหมู่
          <select value={draft.category} onChange={(event) => setDraft(previous => ({ ...previous, category: event.target.value as Category }))}>
            {CATEGORIES.filter(option => option.value !== "all").map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>ไอคอนสำรอง (กรณีเว็บไซต์ไม่มี Favicon)
          <select value={draft.icon} onChange={(event) => setDraft(previous => ({ ...previous, icon: event.target.value as MenuIcon }))}>
            {ICONS.map(icon => <option key={icon} value={icon}>{icon === "auto" ? "Favicon อัตโนมัติ" : icon}</option>)}
          </select>
        </label>
        <div className="qa-quick-preview"><LinkIcon link={draft}/><div><strong>{draft.title || "ตัวอย่างชื่อเมนู"}</strong><small>Preview · Quick Access</small></div></div>
        <div className="qa-quick-form-actions"><button type="button" onClick={() => setMode("manage")}>ยกเลิก</button><button type="submit" disabled={!ready || saving || Boolean(editingId?.startsWith("initial-")) || !safeUrl(draft.url) || !draft.title.trim()}>{saving ? "กำลังบันทึก..." : "บันทึกเมนู"}</button></div>
      </form>}
    </div>}
  </div>;
}
