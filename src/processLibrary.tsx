import React, { useEffect, useMemo, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { collection, doc, getDocs, getFirestore, setDoc } from "firebase/firestore";
import { getDownloadURL, getStorage, ref as storageRef, uploadBytes } from "firebase/storage";

type ProcessVersion = {
  id: string;
  name: string;
  versionLabel: string;
  fileName: string;
  fileUrl: string;
  fileType: "pdf" | "pptx" | "ppt" | "other";
  slideCount: number;
  slideTitles: string[];
  uploadedAt: string;
  uploadedBy: string;
  status: "current" | "archived";
};

export type ProcessReferenceMeta = {
  versionId: string;
  processName: string;
  versionLabel: string;
  slideNumber: number;
  slideTitle: string;
  step: string;
  fileUrl: string;
  fileType: string;
};

const PROCESS_COLLECTION = "qa_process_versions";
const CURRENT_PROCESS_TITLES = ["Customer Service Team","Shop","Customer Support","Customer scenario","1. สอบถามข้อมูลโปรไฟล์","2. สอบถามข้อมูลคำสั่งซื้อ","3. ติดตามสถานะคำสั่งซื้อ","4. ลูกค้าปักหมุดผิด","5. แจ้งร้านค้าปิด/ติดต่อไม่ได้","6.1 ได้รับอาหารล่าช้า - ไรเดอร์รับอาหารแล้ว","6.2 ได้รับอาหารล่าช้า - ไรเดอร์ยังไม่รับอาหาร","7. อาหารไม่ถูกต้อง (ผิดเมนู)","8. ได้รับอาหารไม่ครบ","9. ยกเลิกออเดอร์ หาไรเดอร์ไม่ได้","10. อาหารเสียหาย/หกเลอะเทอะ","11. อาหารไม่ตรงปก/ปริมาณน้อย","12. ไม่ได้รับอาหาร(จัดส่งสำเร็จ)","13. พบสั่งแปลกปลอมในอาหาร","14. สถานะออเดอร์ค้าง/ไม่อัปเดต","15.1 ติดตามเงินคืน – SCB Easy ( Paywise )","15.1 ติดตามเงินคืน – K Plus","14.1 ติดตามเงินคืน – บัตรเครดิต/เดบิต","15.3 ติดตามเงินคืน – QR Promptpay","15.4 ติดตามเงินคืน – Wallet ( TrueMoney / ShopeePay )","16. แจ้ง โค้ดส่วนลดใช้งานไม่ได้","17. ขอลบบัญชีและ Re-active โปรไฟล์","18. ปัญหาการใช้งานแอปพลิเคชัน","19. ลูกค้าได้รับเงินเกิน(ขอโอนเงินคืน)","20. ร้องเรียนพฤติกรรมไรเดอร์","11. ร้องเรียนร้านค้า","Appendix","Order Status","Slide 33","ขั้นตอนการยกลิกออเดอร์( Admin Cancel )/ Partial Refund","1 ) ยกเลิกออเดอร์( Admin Cancel ) ช่องทาง SCB Easy ( Paywise ) /Business Account","2 ) ยกเลิกออเดอร์( Admin Cancel ) ช่องทางบัตรเครดิต/เดบิต , วอลเล็ท , QR Promptpay","3 ) ยกเลิกออเดอร์( Admin Cancel ) โดยที่ร้านค้าต้องได้รับเงินค่าอาหาร","4 ) ยกเลิกออเดอร์( Admin Cancel ) กรณีไม่มีค่าอาหาร (ลูกค้าใช้โค้ดส่วนลด)","5 ) คืนเงินลูกค้าบางส่วน( Partial Refund ) โดยทำการหักเงินร้านค้า","6 ) คืนเงินลูกค้าบางส่วน( Partial Refund ) โดยทำการหักเงินไรเดอร์","Merchant Support ( Shop )","Merchant scenario ( Shop )","การยืนยันตัวตนร้านค้า ( Merchant Verify )","1. สอบถามข้อมูลเกี่ยวกับร้านค้า","2. สอบถามการสมัครร้านค้าใหม่","3. สอบถามการสมัคร/ยกเลิกส่วนลดค่าอาหาร ( DS )","4. ยกเลิกส่วนลดดีดีพลัส ( DDP )","5. ติดตามการสมัครร้านค้าใหม่","6. ร้านเข้าระบบไม่ได้/ลืมรหัสผ่าน","7. ไรเดอร์ไม่มารับอาหาร (ทำอาหารแล้ว)","8. ร้านค้า ทำอาหารไม่ครบ","9. ร้านขอยกเลิกออเดอร์(ร้านปิด)","10. ขอรายงานการขายและใบกำกับภาษี","11. ขอเอกสารใบลดหนี้","12. ร้านค้าไม่ได้รับเงิน","13. ร้านค้าได้รับเงินไม่ครบ","14. เปลี่ยนแปลงอีเมลเข้าระบบ","15. เปลี่ยนแปลงเบอร์โทรศัพท์","16. เปลี่ยนแปลงบัญชีรับเงินร้านค้า","17. เปลี่ยนแปลง ชื่อบริษัท/ชื่อเจ้าของกิจการ","เอกสารประกอบการเปลี่ยนแปลงข้อมูลร้านค้า","18. ขอปรับส่วนลดดีดีพลัส ( GP )","19. สถานะร้านค้าในแอปไม่ถูกต้อง","20. ปัญหาการใช้แอปพลิเคชั่น","21. ปิดร้านค้าถาวร / ชั่วคราว","22. ขอ Re-active บัญชีร้านค้า","XX. ติดตามการอนุมัติร้านค้า","22. ร้องเรียนพฤติกรรมไรเดอร์","23. ร้องเรียนพนักงาน","Appendix","ตัวอย่างอีเมลแจ้งผลการสมัครร้านค้า","ขั้นตอนการรีเซ็ตรหัสผ่านร้านค้าผ่านแอปพลิเคชัน","ขั้นตอนการสมัครร้านค้า ประเภทบุคคลธรรมดา","ขั้นตอนการสมัครร้านค้า ประเภทบุคคลธรรมดา","ขั้นตอนการสมัครร้านค้า ประเภทนิติบุคคล","ขั้นตอนการสมัครร้านค้า ประเภทนิติบุคคล","Slide 77","Robinhood Rider","Rider scenario","การยืนยันตัวตัวไรเดอร์ ( Rider Verify )","1. สอบถามข้อมูลโปรไฟล์","2. สอบถามจำนวนงานที่สำเร็จ","3. สอบถามการสมัครไรเดอร์ใหม่","คุณสมบัติและเอกสารประกอบการสมัครไรเดอร์ใหม่","4. สอบถามการซื้ออุปกรณ์ทำงาน","ขั้นตอนการสั่งซื้ออุปกรณ์ผ่าน Robinhood Rider Shop","5. สอบถามการยกเลิกบัญชี (ลบโปรไฟล์)","6. เปลี่ยนแปลงหมายเลขโทรศัพท์","7. เปลี่ยนแปลงเลขบัญชีรับเงิน","8. เปลี่ยนแปลงรถมอเตอร์ไซค์","9. เปลี่ยนแปลงชื่อ - นามสกุล","10. ขอเอกสารการทำงาน","11. ขอเปิดระบบ - บัญชีถูกระงับบัญชี(ยื่นอุทธรณ์)","เงื่อนไขการพิจารณาปลดระงับสัญญาณไรเดอร์","12. ส่งเอกสารสมัครไรเดอร์เพิ่ม","13. แจ้งร้านค้าปิด/ติดต่อไม่ได้","14. ระบบยิงงานไกลเกิน 8 กม.","15. แจ้งปัญหาติดต่อลูกค้าไม่ได้","16. ไรเดอร์รถเสีย","17. ไรเดอร์เกิดอุบัติเหตุ","18. อาหารเยอะเกินใส่กระเป๋าไม่หมด","19. ลูกค้าปักหมุดผิด","20. ร้านค้าปักหมุดผิด","20. ร้านค้าปักหมุดผิด","21. กดจบงานไม่ได้","22. ระยะทางไม่ตรงกับหน้าแอป","23. ไรเดอร์ติดต่อร้านค้าไม่ได้","24. ไรเดอร์ติดต่อลูกค้าไม่ได้","25. ติดตามเงินค่ารอบไม่ครบ","26. ติดตามการสมัครไรเดอร์ใหม่","27. ติดตามเงินค่ารอบไม่ครบ","28. ติดตามเงินชดเชย/โบนัส","29. ติดตามสถานะการจัดซื้ออุปกรณ์","30. แจ้งปัญหาแอปพลิเคชัน","Appendix","วิธีการถ่ายรูปคู่กับบัตรประชาชนของคุณ","ตัวอย่างเอกสารการทำงานของไรเดอร์","Slide 118"];

const BUILTIN_VERSION: ProcessVersion = {
  id: "new-process-2026-seed-20260910",
  name: "New Process 2026",
  versionLabel: "2026.09.10",
  fileName: "New Process 2026 (5).pptx",
  fileUrl: "",
  fileType: "pptx",
  slideCount: CURRENT_PROCESS_TITLES.length,
  slideTitles: CURRENT_PROCESS_TITLES,
  uploadedAt: "2026-09-10T00:00:00.000Z",
  uploadedBy: "System seed",
  status: "current",
};

const env = (import.meta as any).env || {};

function firebaseServices() {
  try {
    const existing = getApps()[0];
    const app = existing || initializeApp({
      apiKey: String(env.VITE_FIREBASE_API_KEY || ""),
      authDomain: String(env.VITE_FIREBASE_AUTH_DOMAIN || ""),
      projectId: String(env.VITE_FIREBASE_PROJECT_ID || ""),
      storageBucket: String(env.VITE_FIREBASE_STORAGE_BUCKET || ""),
      messagingSenderId: String(env.VITE_FIREBASE_MESSAGING_SENDER_ID || ""),
      appId: String(env.VITE_FIREBASE_APP_ID || ""),
    });
    return { db: getFirestore(app), storage: getStorage(app) };
  } catch {
    return null;
  }
}

function fileType(name: string): ProcessVersion["fileType"] {
  const value = name.toLowerCase();
  if (value.endsWith(".pdf")) return "pdf";
  if (value.endsWith(".pptx")) return "pptx";
  if (value.endsWith(".ppt")) return "ppt";
  return "other";
}

function makeVersionId(name: string) {
  const base = name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "process";
  return `${base}-${Date.now()}`;
}

export function serializeProcessReference(meta: ProcessReferenceMeta) {
  const clean = (value: unknown) => String(value ?? "").replace(/\r?\n/g, " ").trim();
  return [
    `Process: ${clean(meta.processName)}`,
    `Version: ${clean(meta.versionLabel)}`,
    `Version ID: ${clean(meta.versionId)}`,
    `Slide: ${meta.slideNumber || 0}`,
    `Title: ${clean(meta.slideTitle)}`,
    `Step: ${clean(meta.step || "ทั้งสไลด์")}`,
    `File URL: ${clean(meta.fileUrl)}`,
    `File Type: ${clean(meta.fileType)}`,
  ].join("\n");
}

export function parseProcessReference(value: unknown): ProcessReferenceMeta | null {
  const text = String(value || "").trim();
  if (!text || !/^Process:/m.test(text) || !/^Slide:/m.test(text)) return null;
  const get = (key: string) => text.match(new RegExp(`^${key}:\\s*(.*)$`, "mi"))?.[1]?.trim() || "";
  return {
    versionId: get("Version ID"), processName: get("Process"), versionLabel: get("Version"),
    slideNumber: Number(get("Slide") || 0), slideTitle: get("Title"), step: get("Step") || "ทั้งสไลด์",
    fileUrl: get("File URL"), fileType: get("File Type"),
  };
}

function fromVersion(version: ProcessVersion, slideNumber: number, step: string): ProcessReferenceMeta {
  return {
    versionId: version.id, processName: version.name, versionLabel: version.versionLabel, slideNumber,
    slideTitle: version.slideTitles[Math.max(0, slideNumber - 1)] || `Slide ${slideNumber}`,
    step: step || "ทั้งสไลด์", fileUrl: version.fileUrl, fileType: version.fileType,
  };
}

function previewUrl(meta: ProcessReferenceMeta) {
  if (!meta.fileUrl) return "";
  if (meta.fileType === "pdf" || meta.fileUrl.toLowerCase().includes(".pdf")) return `${meta.fileUrl.split("#")[0]}#page=${Math.max(1, meta.slideNumber)}&view=FitH`;
  if (meta.fileType === "pptx" || meta.fileType === "ppt") return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(meta.fileUrl)}`;
  return meta.fileUrl;
}

function snapshot(meta: ProcessReferenceMeta) {
  const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  const title = esc(meta.slideTitle || `Slide ${meta.slideNumber}`);
  const name = esc(meta.processName || "Process");
  const step = esc(meta.step || "ทั้งสไลด์");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g"><stop stop-color="#6d28d9"/><stop offset="1" stop-color="#c026d3"/></linearGradient></defs><rect width="1280" height="720" fill="#fff"/><rect width="1280" height="100" fill="url(#g)"/><text x="52" y="62" font-size="30" font-family="Kanit,Arial" font-weight="700" fill="#fff">${name}</text><text x="52" y="170" font-size="28" font-family="Kanit,Arial" font-weight="700" fill="#6d28d9">Slide ${meta.slideNumber}</text><foreignObject x="52" y="205" width="1176" height="290"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Kanit,Arial;font-size:44px;line-height:1.35;font-weight:800;color:#0f172a;word-wrap:break-word">${title}</div></foreignObject><rect x="52" y="520" width="1176" height="105" rx="18" fill="#f5f3ff" stroke="#ddd6fe"/><text x="82" y="574" font-size="24" font-family="Kanit,Arial" font-weight="600" fill="#475569">อ้างอิง: ${step}</text></svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

async function remoteCurrent(): Promise<ProcessVersion | null> {
  const services = firebaseServices();
  if (!services) return null;
  try {
    const result = await getDocs(collection(services.db, PROCESS_COLLECTION));
    const rows = result.docs.map((entry) => ({ id: entry.id, ...(entry.data() as any) })).filter((row: any) => row.status === "current");
    rows.sort((a: any, b: any) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
    const row: any = rows[0];
    if (!row) return null;
    const count = Math.max(1, Number(row.slideCount || 1));
    const titles = Array.isArray(row.slideTitles) ? row.slideTitles.map(String) : [];
    return { id: row.id, name: String(row.name || row.fileName || "Process"), versionLabel: String(row.versionLabel || "-"), fileName: String(row.fileName || ""), fileUrl: String(row.fileUrl || ""), fileType: fileType(String(row.fileName || row.fileUrl || "")), slideCount: count, slideTitles: Array.from({ length: count }, (_, i) => titles[i] || `Slide ${i + 1}`), uploadedAt: String(row.uploadedAt || ""), uploadedBy: String(row.uploadedBy || ""), status: "current" };
  } catch { return null; }
}

export function ProcessReferenceSelector({ value, onChange, currentUser }: { value: string; onChange: (value: string) => void; currentUser?: any }) {
  const parsed = useMemo(() => parseProcessReference(value), [value]);
  const [current, setCurrent] = useState<ProcessVersion>(BUILTIN_VERSION);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(parsed?.slideNumber || 0);
  const [step, setStep] = useState(parsed?.step || "ทั้งสไลด์");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState("New Process");
  const [uploadSlides, setUploadSlides] = useState(CURRENT_PROCESS_TITLES.length);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [message, setMessage] = useState("");

  const reload = async () => { setLoading(true); setCurrent((await remoteCurrent()) || BUILTIN_VERSION); setLoading(false); };
  useEffect(() => { void reload(); }, []);
  useEffect(() => { if (parsed) { setSlide(parsed.slideNumber || 0); setStep(parsed.step || "ทั้งสไลด์"); } }, [parsed?.versionId, parsed?.slideNumber, parsed?.step]);

  const historical = Boolean(parsed && parsed.versionId && parsed.versionId !== current.id);
  const active: ProcessVersion = historical ? { id: parsed!.versionId, name: parsed!.processName, versionLabel: parsed!.versionLabel, fileName: "", fileUrl: parsed!.fileUrl, fileType: fileType(parsed!.fileUrl || `x.${parsed!.fileType}`), slideCount: Math.max(parsed!.slideNumber, 1), slideTitles: Array.from({ length: Math.max(parsed!.slideNumber, 1) }, (_, i) => i + 1 === parsed!.slideNumber ? parsed!.slideTitle : `Slide ${i + 1}`), uploadedAt: "", uploadedBy: "", status: "archived" } : current;
  const meta = slide ? fromVersion(active, slide, step) : parsed;
  const preview = meta ? previewUrl(meta) : "";

  const setReference = (nextSlide: number, nextStep = step) => {
    setSlide(nextSlide); setStep(nextStep);
    onChange(nextSlide ? serializeProcessReference(fromVersion(active, nextSlide, nextStep)) : "");
  };

  const upload = async () => {
    if (!uploadFile || uploadBusy) return;
    const services = firebaseServices();
    if (!services) { setMessage("Firebase ยังไม่พร้อม จึงยังอัปโหลด Process ไม่ได้"); return; }
    setUploadBusy(true); setMessage("กำลังอัปโหลด Process version ใหม่...");
    try {
      const id = makeVersionId(uploadFile.name); const uploadedAt = new Date().toISOString(); const versionLabel = uploadedAt.slice(0, 10).replace(/-/g, ".");
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const target = storageRef(services.storage, `qa-process/${id}/${safeName}`);
      await uploadBytes(target, uploadFile, { contentType: uploadFile.type || undefined });
      const fileUrl = await getDownloadURL(target);
      const existing = await getDocs(collection(services.db, PROCESS_COLLECTION));
      await Promise.all(existing.docs.map((entry) => (entry.data() as any).status === "current" ? setDoc(doc(services.db, PROCESS_COLLECTION, entry.id), { status: "archived" }, { merge: true }) : Promise.resolve()));
      const count = Math.max(1, Math.min(500, Number(uploadSlides || 1)));
      await setDoc(doc(services.db, PROCESS_COLLECTION, id), { name: uploadName.trim() || uploadFile.name.replace(/\.[^.]+$/, ""), versionLabel, fileName: uploadFile.name, fileUrl, fileType: fileType(uploadFile.name), slideCount: count, slideTitles: Array.from({ length: count }, (_, i) => `Slide ${i + 1}`), uploadedAt, uploadedBy: String(currentUser?.username || currentUser?.displayName || "QA"), status: "current" });
      setMessage(`อัปโหลดสำเร็จ · Version ${versionLabel} · เริ่มนับ Slide 1 ใหม่แล้ว`); setUploadOpen(false); setUploadFile(null); setSlide(0); onChange(""); await reload();
    } catch (error) { console.error("Process upload failed", error); setMessage("อัปโหลด Process ไม่สำเร็จ กรุณาลองอีกครั้ง"); }
    finally { setUploadBusy(false); }
  };

  return <div className="mt-2 overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 shadow-inner">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 px-4 py-3"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">Process Library</div><div className="mt-1 text-sm font-black text-slate-950">{loading ? "กำลังโหลด..." : `${active.name} · v${active.versionLabel}`}</div><div className="mt-0.5 text-xs font-semibold text-slate-500">{historical ? "Historical version · ล็อกตามเคสเดิม" : `Current version · ${active.slideCount} slides`}</div></div><button type="button" onClick={() => setUploadOpen((v) => !v)} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-700 shadow-sm hover:bg-violet-50">Upload New Process</button></div>
    {uploadOpen ? <div className="grid gap-3 border-b border-violet-100 bg-white px-4 py-4 md:grid-cols-[1.2fr_100px_1.5fr_auto]"><label><span className="text-[10px] font-black uppercase text-slate-500">Version Name</span><input value={uploadName} onChange={(e) => setUploadName(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label><label><span className="text-[10px] font-black uppercase text-slate-500">Slides</span><input type="number" min="1" max="500" value={uploadSlides} onChange={(e) => setUploadSlides(Number(e.target.value || 1))} className="mt-1 h-10 w-full rounded-xl border border-slate-300 px-3 text-sm font-semibold" /></label><label><span className="text-[10px] font-black uppercase text-slate-500">Process File</span><input type="file" accept=".pdf,.ppt,.pptx,application/pdf" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className="mt-2 block w-full text-xs font-semibold text-slate-600" /></label><button type="button" onClick={upload} disabled={!uploadFile || uploadBusy} className="self-end rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-black text-white disabled:bg-slate-300">{uploadBusy ? "Uploading..." : "Set Current"}</button><div className="md:col-span-4 text-xs font-semibold leading-5 text-slate-500">ไฟล์ใหม่จะเป็น Current Version สำหรับเคสใหม่และเริ่ม Slide 1 ใหม่ ส่วนเคสที่ประเมินไปแล้วจะคง Version เดิม</div></div> : null}
    {message ? <div className="border-b border-violet-100 bg-violet-50 px-4 py-2 text-xs font-bold text-violet-800">{message}</div> : null}
    <div className="grid gap-3 p-4 md:grid-cols-[1.5fr_1fr]"><label><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Slide</span><select value={slide || ""} disabled={historical} onChange={(e) => setReference(Number(e.target.value || 0))} className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold"><option value="">เลือก Slide ที่ใช้เทียบ...</option>{active.slideTitles.map((title, i) => <option key={i + 1} value={i + 1}>Slide {i + 1} — {title}</option>)}</select></label><label><span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">ข้อ / Step</span><input value={step} disabled={historical} onChange={(e) => { const next = e.target.value; setStep(next); if (slide) onChange(serializeProcessReference(fromVersion(active, slide, next))); }} placeholder="ทั้งสไลด์ / ข้อ 1 / Step ..." className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold" /></label></div>
    {meta?.slideNumber ? <div className="border-t border-violet-100 p-4"><div className="mb-2 flex items-center justify-between gap-2"><div className="text-xs font-black text-violet-800">Slide {meta.slideNumber} · {meta.slideTitle}</div>{preview ? <a href={preview} target="_blank" rel="noreferrer" className="text-xs font-black text-violet-700 underline">View Process</a> : null}</div>{preview ? <iframe src={preview} title={`Process Slide ${meta.slideNumber}`} className="aspect-video w-full rounded-xl border border-violet-100 bg-white" /> : <img src={snapshot(meta)} alt={`Process Slide ${meta.slideNumber} reference snapshot`} className="aspect-video w-full rounded-xl border border-violet-100 bg-white object-contain" />}{!preview ? <div className="mt-2 text-[11px] font-semibold text-amber-700">Version นี้ยังไม่มีไฟล์ Preview ในระบบ จึงแสดง Reference Snapshot ตาม Slide ที่เลือก</div> : null}</div> : null}
  </div>;
}

export function ProcessReferenceDisplay({ value, className = "" }: { value: string; className?: string }) {
  const meta = useMemo(() => parseProcessReference(value), [value]);
  if (!meta) return <div className={`whitespace-pre-line text-[14px] leading-6 text-slate-800 ${className}`}>{String(value || "-")}</div>;
  const preview = previewUrl(meta);
  return <div className={className}><div className="grid gap-2 text-sm sm:grid-cols-2"><div><span className="font-bold text-slate-500">Process:</span> <span className="font-extrabold text-slate-900">{meta.processName}</span></div><div><span className="font-bold text-slate-500">Version:</span> <span className="font-extrabold text-violet-700">{meta.versionLabel || "-"}</span></div><div><span className="font-bold text-slate-500">Slide:</span> <span className="font-extrabold text-slate-900">{meta.slideNumber}</span></div><div><span className="font-bold text-slate-500">ข้อ / Step:</span> <span className="font-extrabold text-slate-900">{meta.step || "ทั้งสไลด์"}</span></div></div><div className="mt-2 text-[14px] font-extrabold leading-6 text-slate-900">{meta.slideTitle || `Slide ${meta.slideNumber}`}</div><div className="mt-3 overflow-hidden rounded-xl border border-violet-100 bg-white">{preview ? <iframe src={preview} title={`Process Slide ${meta.slideNumber}`} className="aspect-video w-full bg-white" /> : <img src={snapshot(meta)} alt={`Process Slide ${meta.slideNumber} reference snapshot`} className="aspect-video w-full bg-white object-contain" />}</div><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><div className="text-[11px] font-semibold text-slate-500">Reference ถูกล็อกตาม Process Version ตอนประเมินเคสนี้</div>{preview ? <a href={preview} target="_blank" rel="noreferrer" className="text-xs font-black text-violet-700 underline">View Process</a> : null}</div></div>;
}
