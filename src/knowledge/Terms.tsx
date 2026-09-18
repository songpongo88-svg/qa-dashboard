import React, { useEffect, useRef, useState } from "react";
import { CURRENT_TERMS, documentHash, formatKnowledgeDate, isCurrentAcceptance, normalizeUsername, type KnowledgeUser, type TermsAcceptance, type TermsDocument } from "./model";
import { termsRepository, type TermsRepository } from "./termsStore";
import { downloadTermsPdf } from "./pdf";
import "./knowledge.css";

const errorText = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อข้อมูลได้ กรุณาลองอีกครั้ง";
export function TermsText({ document: content = CURRENT_TERMS }: { document?: TermsDocument }) {
  return <article className="knowledge-prose">
    <p>{content.introduction}</p>
    {content.sections.map((section, index) => <section key={section.title}>
      <h3>{index + 1}. {section.title}</h3>
      {section.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
    </section>)}
    <p className="knowledge-callout">{content.statement}</p>
  </article>;
}

function SignaturePad({ onChange }: { onChange: (image: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * 600 / bounds.width, y: (event.clientY - bounds.top) * 160 / bounds.height };
  };
  return <div>
    <canvas ref={canvas} width={600} height={160} aria-label="พื้นที่วาดลายเซ็น สามารถข้ามการวาดและใช้การกดยืนยันได้" className="knowledge-signature-pad"
      onPointerDown={(event) => { drawing.current = true; last.current = position(event); event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={(event) => {
        if (!drawing.current) return;
        const context = event.currentTarget.getContext("2d");
        if (!context) return;
        const point = position(event);
        context.lineWidth = 2.5; context.strokeStyle = "#1e293b"; context.lineCap = "round";
        context.beginPath(); context.moveTo(last.current.x, last.current.y); context.lineTo(point.x, point.y); context.stroke(); last.current = point;
      }}
      onPointerUp={() => { if (drawing.current) onChange(canvas.current?.toDataURL("image/png") || ""); drawing.current = false; }}
      onPointerCancel={() => { drawing.current = false; }} />
    <button type="button" className="knowledge-link" onClick={() => { canvas.current?.getContext("2d")?.clearRect(0, 0, 600, 160); onChange(""); }}>ล้างลายเซ็น</button>
  </div>;
}

export function TermsAccessBoundary({ user, onLogout, children, repository = termsRepository }: {
  user: KnowledgeUser; onLogout: () => void; children: React.ReactNode; repository?: TermsRepository;
}) {
  const [state, setState] = useState<"loading" | "required" | "accepted" | "error">("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draw, setDraw] = useState(false);
  const [signature, setSignature] = useState("");
  const [source, setSource] = useState<TermsAcceptance["signatureSource"]>("none");
  const [saved, setSaved] = useState<Array<{ role: string; image: string }>>([]);
  const [signatureMessage, setSignatureMessage] = useState("");
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let alive = true;
    setState("loading"); setError(""); setRead(false); setConfirmed(false); setSignature(""); setSource("none"); setSaved([]);
    Promise.all([repository.current(user), documentHash(CURRENT_TERMS)]).then(([record, hash]) => {
      if (!alive) return;
      if (record && !isCurrentAcceptance(record, user.username, hash)) throw new Error("หลักฐานเวอร์ชันนี้ไม่ตรงกับข้อความปัจจุบัน กรุณาติดต่อผู้ดูแลระบบ");
      setState(record ? "accepted" : "required");
    }).catch((reason) => { if (alive) { setError(errorText(reason)); setState("error"); } });
    return () => { alive = false; };
  }, [user.username, attempt, repository]);
  useEffect(() => {
    if (state !== "required") return;
    heading.current?.focus();
    const element = scroll.current;
    if (element && element.scrollHeight <= element.clientHeight + 8) setRead(true);
  }, [state]);
  const accept = async () => {
    if (busy || !read || !confirmed) return;
    setBusy(true); setError("");
    try {
      const record = await repository.accept(user, { confirmed, readToEnd: read, signatureDataUrl: signature, signatureSource: source });
      if (!isCurrentAcceptance(record, user.username, await documentHash(CURRENT_TERMS))) throw new Error("ยังยืนยันการบันทึกไม่ได้ กรุณาลองอีกครั้ง");
      setState("accepted");
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  };
  if (state === "accepted") return <>{children}</>;
  if (state === "loading") {
    return (
      <main
        role="status"
        aria-busy="true"
        aria-label="กำลังโหลด QA Dashboard"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f8fafc",
          color: "#64748b",
          fontFamily: '"Kanit", ui-sans-serif, system-ui, sans-serif',
          fontSize: "14px",
          fontWeight: 600,
        }}
      >
        กำลังโหลด QA Dashboard…
      </main>
    );
  }
  return <main className="knowledge terms-gate" data-testid="terms-gate" aria-busy={busy} data-saving={busy || undefined}>
    <div className="terms-gate-card">
      <header className="knowledge-header">
        <img src="/robinhood-logo.png" alt="Robinhood" width="52" height="52" />
        <div><span className="knowledge-eyebrow">QA DASHBOARD · TERMS & CONDITIONS</span>
          <h1 ref={heading} tabIndex={-1}>ข้อกำหนดและเงื่อนไขการใช้งาน</h1>
          <p>Version {CURRENT_TERMS.version} · มีผล {CURRENT_TERMS.effectiveDate.split("-").reverse().join("/")}</p>
        </div>
      </header>
      <p className="knowledge-identity">{user.displayName} <span>· {user.role}</span></p>
      {state === "error" ? <div className="knowledge-empty">
        <p role="alert">ตรวจสอบสถานะยังไม่สำเร็จ: {error}</p>
        <button className="knowledge-primary" onClick={() => setAttempt((value) => value + 1)}>ลองอีกครั้ง</button>
      </div> : <>
        <p className="knowledge-callout">กรุณาอ่านให้ครบก่อนยืนยัน · {CURRENT_TERMS.changeSummary}</p>
        <div ref={scroll} className="terms-scroll" tabIndex={0} aria-label="ข้อความ T&C ฉบับเต็ม"
          onScroll={(event) => { const node = event.currentTarget; if (node.scrollHeight - node.scrollTop - node.clientHeight <= 16) setRead(true); }}>
          <TermsText />
          <p className="knowledge-muted">จบข้อกำหนด Version {CURRENT_TERMS.version}</p>
        </div>
        <details className="knowledge-signature-options">
          <summary>แนบลายเซ็นกับการยอมรับครั้งนี้ (ไม่บังคับ)</summary>
          <div className="knowledge-actions">
            <button type="button" className="knowledge-secondary" onClick={() => { setDraw(true); setSignature(""); setSource("none"); }}>วาดลายเซ็น</button>
            <button type="button" className="knowledge-secondary" onClick={async () => {
              setSignatureMessage("กำลังโหลดลายเซ็น…");
              try { const entries = await repository.savedSignatures(user); setSaved(entries); setSignatureMessage(entries.length ? "เลือกภาพที่จะใช้ยืนยันครั้งนี้" : "ไม่พบลายเซ็นที่บันทึกไว้ สามารถวาดใหม่หรือยืนยันโดยไม่แนบภาพได้"); }
              catch (reason) { setSignatureMessage(errorText(reason)); }
            }}>เลือกลายเซ็นที่เคยบันทึก</button>
            {signature && <button className="knowledge-link" onClick={() => { setSignature(""); setSource("none"); setDraw(false); }}>นำลายเซ็นออก</button>}
          </div>
          <p className="knowledge-muted" role="status">{signatureMessage}</p>
          {saved.map((entry) => <button key={entry.role} className="knowledge-saved-signature" aria-label={`ใช้ลายเซ็น ${entry.role}`} onClick={() => { setDraw(false); setSignature(entry.image); setSource("saved"); }}><img src={entry.image} alt={`ลายเซ็น ${entry.role}`} /><span>{entry.role}</span></button>)}
          {draw && <SignaturePad onChange={(image) => { setSignature(image); setSource(image ? "drawn" : "none"); }} />}
          {signature && !draw && <img className="knowledge-signature-preview" src={signature} alt="ลายเซ็นที่เลือกสำหรับการยืนยันครั้งนี้" />}
        </details>
        <label className="knowledge-confirm"><input type="checkbox" checked={confirmed} disabled={!read || busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>{CURRENT_TERMS.statement}</span></label>
        {!read && <p className="knowledge-muted">เลื่อนอ่านข้อความจนถึงท้ายเอกสารเพื่อเปิดปุ่มยืนยัน</p>}
        {error && <p className="knowledge-error" role="alert">บันทึกยังไม่สำเร็จ: {error}</p>}
      </>}
      <footer className="knowledge-actions terms-gate-footer">
        <button type="button" className="knowledge-secondary" onClick={onLogout} disabled={busy}>ออกจากระบบ</button>
        {state === "required" && <button type="button" className="knowledge-primary" disabled={!read || !confirmed || busy} onClick={accept}>{busy ? "กำลังบันทึก…" : "รับทราบและยอมรับ"}</button>}
      </footer>
    </div>
  </main>;
}

export default function TermsWorkspace({ user, management = false, canManage = false, repository = termsRepository }: {
  user: KnowledgeUser; management?: boolean; canManage?: boolean; repository?: TermsRepository;
}) {
  const [records, setRecords] = useState<TermsAcceptance[]>([]);
  const [accounts, setAccounts] = useState<Awaited<ReturnType<TermsRepository["management"]>>["accounts"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [version, setVersion] = useState(CURRENT_TERMS.version);
  const [selected, setSelected] = useState<TermsAcceptance | null>(null);
  const [pdfBusy, setPdfBusy] = useState("");
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(""); setSelected(null); setRecords([]); setAccounts([]);
    if (management && !canManage) { setError("บัญชีนี้ไม่มีสิทธิ์เปิด T&C Management"); setLoading(false); return; }
    (management ? repository.management(user) : repository.history(user).then((history) => ({ records: history, accounts: [] })))
      .then((data) => { if (alive) { setRecords(data.records); setAccounts(data.accounts); } })
      .catch((reason) => { if (alive) setError(errorText(reason)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user.username, management, canManage, repository, attempt]);
  const exportPdf = async (record: TermsAcceptance) => {
    setPdfBusy(record.id); setError("");
    try { await downloadTermsPdf(record); } catch (reason) { setError(errorText(reason)); } finally { setPdfBusy(""); }
  };
  const rows = accounts.map((account) => ({ account, record: records.find((record) => normalizeUsername(record.username) === normalizeUsername(account.username) && record.version === version) }))
    .filter(({ account, record }) => `${account.displayName} ${account.username} ${account.teamName} ${account.role}`.toLowerCase().includes(search.toLowerCase())
      && (status === "all" || (status === "accepted" ? Boolean(record) : !record)))
    .sort((a, b) => a.account.displayName.localeCompare(b.account.displayName, "th"));
  const acceptedCount = accounts.filter((account) => records.some((record) => normalizeUsername(record.username) === normalizeUsername(account.username) && record.version === version)).length;
  return <main className="knowledge knowledge-workspace">
    <header className="knowledge-page-header"><div><span className="knowledge-eyebrow">{management ? "ADMINISTRATION" : "PROFILE"}</span><h1>{management ? "T&C Management" : "Terms & Acknowledgements"}</h1><p>{management ? "ตรวจสอบสถานะและหลักฐานการยอมรับตามสิทธิ์ของคุณ" : "ประวัติการยอมรับข้อกำหนดของคุณ พร้อมเอกสารฉบับที่ยืนยันจริง"}</p></div><button className="knowledge-secondary" onClick={() => setAttempt((value) => value + 1)} disabled={loading}>รีเฟรชข้อมูล</button></header>
    <div className="knowledge-callout">ฉบับปัจจุบัน Version {CURRENT_TERMS.version} · มีผล {CURRENT_TERMS.effectiveDate.split("-").reverse().join("/")}<br />การยอมรับ T&C และการลงนามผลประเมินรายเดือนบันทึกแยกกัน</div>
    {error && <p className="knowledge-error" role="alert">{error}</p>}
    {loading ? <p className="knowledge-empty" role="status">กำลังโหลดหลักฐาน…</p> : !error && (management ? <>
      <div className="knowledge-stats"><div>ผู้ใช้ทั้งหมด<strong>{accounts.length}</strong></div><div>Accepted<strong>{acceptedCount}</strong></div><div>Not Accepted<strong>{accounts.length - acceptedCount}</strong></div></div>
      <div className="knowledge-filters"><label>ค้นหาผู้ใช้<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ชื่อ บัญชี ทีม หรือ Role" /></label><label>สถานะ<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">ทั้งหมด</option><option value="accepted">Accepted</option><option value="pending">Not Accepted</option></select></label><label>เวอร์ชัน<select value={version} onChange={(event) => setVersion(event.target.value)}>{Array.from(new Set([CURRENT_TERMS.version, ...records.map((record) => record.version)])).map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <div className="knowledge-table-wrap"><table><thead><tr><th>ผู้ใช้งาน / ทีม</th><th>Role</th><th>สถานะ</th><th>วันเวลาที่ยอมรับ (เวลาไทย)</th><th>หลักฐาน</th></tr></thead><tbody>{rows.map(({ account, record }) => <tr key={account.username}><td><strong>{account.displayName}</strong><small>{account.username} · {account.teamName || "—"}{account.status === "Suspended" ? " · Suspended" : ""}</small></td><td>{account.role}</td><td><span className={record ? "knowledge-status accepted" : "knowledge-status pending"}>{record ? "Accepted" : "Not Accepted"}</span></td><td>{record ? formatKnowledgeDate(record.acceptedAt) : "—"}</td><td>{record ? <div className="knowledge-actions"><button className="knowledge-link" onClick={() => setSelected(record)}>ดูรายละเอียด</button><button className="knowledge-link" disabled={Boolean(pdfBusy)} onClick={() => exportPdf(record)}>{pdfBusy === record.id ? "กำลังสร้าง…" : "PDF"}</button></div> : "—"}</td></tr>)}</tbody></table>{!rows.length && <p className="knowledge-empty">ไม่พบข้อมูลตามตัวกรอง</p>}</div>
    </> : <div className="knowledge-history">{!records.length && <p className="knowledge-empty">ยังไม่มีประวัติการยอมรับ</p>}{records.map((record) => <section key={record.id} className="knowledge-card"><div><span className="knowledge-status accepted">Accepted</span><h2>Terms & Conditions · Version {record.version}</h2><p>{record.user.displayName} · {formatKnowledgeDate(record.acceptedAt)} (เวลาไทย)</p><p className="knowledge-muted">{record.document.changeSummary}</p></div><div className="knowledge-actions"><button className="knowledge-secondary" onClick={() => setSelected(record)}>ดูฉบับที่ยอมรับ</button><button className="knowledge-primary" disabled={Boolean(pdfBusy)} onClick={() => exportPdf(record)}>{pdfBusy === record.id ? "กำลังสร้าง…" : "ดาวน์โหลด PDF"}</button></div></section>)}</div>)}
    <p className="knowledge-muted">ที่จัดเก็บหลักฐาน: QA Dashboard → ฐานข้อมูลกลาง → qa_terms_acceptances · PDF สร้างจากหลักฐานที่บันทึกไว้เมื่อกดยอมรับ</p>
    {selected && <section className="knowledge-card knowledge-record"><div className="knowledge-page-header"><div><h2>ฉบับที่ยอมรับ · Version {selected.version}</h2><p>{selected.user.displayName} · {formatKnowledgeDate(selected.acceptedAt)} (เวลาไทย)</p></div><button className="knowledge-secondary" onClick={() => setSelected(null)}>ปิดรายละเอียด</button></div><TermsText document={selected.document} />{selected.signatureDataUrl && <img className="knowledge-signature-preview" src={selected.signatureDataUrl} alt="ลายเซ็นที่บันทึกขณะยอมรับ" />}<p className="knowledge-muted">เลขอ้างอิง: {selected.id}</p></section>}
  </main>;
}
