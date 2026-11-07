import React, { useEffect, useRef, useState } from "react";
import { bangkokDateTimeInput, parseReceiptText } from "./receiptRecognition.js";
import { prepareReceiptUpload, readReceiptInBrowser } from "./receiptImageOcr";

type Request = (action: string, extra?: Record<string, unknown>, signal?: AbortSignal) => Promise<any>;
type Props = { itemId: string; rewardId: string; activatedAt: string; busy: boolean; request: Request;
  onBusyChange: (busy: boolean) => void; onSubmit: (data: Record<string, unknown>) => Promise<unknown> };
const timeLabel = (iso: string) => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", ...(/T\d{2}:\d{2}:\d{2}/.test(iso) ? { second: "2-digit" as const } : {}), hour12: false });
const readableError = (reason: unknown) => reason instanceof Error ? reason.message : "ไม่สามารถอ่านใบเสร็จได้";

export default function ReceiptClaimForm({ itemId, rewardId, activatedAt, busy, request, onBusyChange, onSubmit }: Props) {
  const [imageData, setImageData] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptAt, setReceiptAt] = useState("");
  const [amount, setAmount] = useState("");
  const [promptPay, setPromptPay] = useState("");
  const [text, setText] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const [progress, setProgress] = useState("");
  const [phase, setPhase] = useState<"ready" | "reading" | "checking" | "submitting">("ready");
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState<boolean | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const file = useRef<File | null>(null);
  const job = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; job.current?.abort(); }; }, []);

  async function checkNumber(value: string, signal?: AbortSignal) {
    const result = await request("special-rewards-receipt-check", { rewardId, receiptNumber: value }, signal);
    if (typeof result.duplicate !== "boolean") throw Error("ยังตรวจเลขที่ใบเสร็จไม่สำเร็จ กรุณากดตรวจอีกครั้ง");
    if (alive.current && !signal?.aborted) setDuplicate(result.duplicate);
  }
  async function scan(selectedFile: File) {
    if (inFlight.current || busy) return;
    inFlight.current = true; file.current = selectedFile;
    const controller = new AbortController(); job.current = controller;
    setPhase("reading"); onBusyChange(true); setAttempted(false); setReadCount(0); setError(""); setReviewed(false);
    setDuplicate(null); setReceiptNumber(""); setReceiptAt(""); setAmount(""); setText(""); setImageData("");
    setProgress("กำลังเตรียมรูปใบเสร็จ...");
    try {
      const prepared = await prepareReceiptUpload(selectedFile);
      if (controller.signal.aborted) return;
      setImageData(prepared.imageData); setProgress("กำลังอ่านข้อมูลจากภาพใบเสร็จ...");
      const cloud = new AbortController(), abortCloud = () => cloud.abort();
      controller.signal.addEventListener("abort", abortCloud, { once: true });
      const timeout = window.setTimeout(abortCloud, 15000);
      let recognizedText = "";
      try {
        const result = await request("special-rewards-receipt-scan", { itemId, imageData: prepared.imageData }, cloud.signal);
        recognizedText = typeof result.text === "string" ? result.text : "";
      } catch (reason) {
        if ([401, 403].includes(Number((reason as { status?: number })?.status))) throw reason;
        // A missing Vision service never fabricates receipt values. Read the image locally instead.
      } finally { window.clearTimeout(timeout); controller.signal.removeEventListener("abort", abortCloud); }
      if (controller.signal.aborted) return;
      let fields = parseReceiptText(recognizedText, rewardId);
      if (fields.missing.length === 3) {
        setProgress("กำลังอ่านข้อความจากภาพ อาจใช้เวลาสักครู่เมื่ออ่านครั้งแรก...");
        recognizedText = await readReceiptInBrowser(prepared.ocrImage, controller.signal, value => { if (alive.current) setProgress(value); });
        fields = parseReceiptText(recognizedText, rewardId);
      }
      if (!alive.current || controller.signal.aborted) return;
      setText(recognizedText); setReceiptNumber(fields.receiptNumber);
      setReadCount(3 - fields.missing.length);
      setReceiptAt(bangkokDateTimeInput(fields.receiptAt));
      setAmount(fields.amountTHB === null ? "" : String(fields.amountTHB));
      if (fields.receiptNumber) {
        setProgress("กำลังตรวจเลขที่ใบเสร็จซ้ำ...");
        try { await checkNumber(fields.receiptNumber, controller.signal); }
        catch (reason) { if (!controller.signal.aborted) setError(readableError(reason)); }
      }
    } catch (reason) {
      if (alive.current && !controller.signal.aborted) setError(readableError(reason) + " · ตรวจจากภาพและกรอกช่องที่ยังว่างได้");
    } finally {
      inFlight.current = false;
      if (alive.current) { setAttempted(true); setPhase("ready"); setProgress(""); onBusyChange(false); }
    }
  }
  async function recheck() {
    if (inFlight.current || busy) return;
    inFlight.current = true; setPhase("checking"); onBusyChange(true); setError(""); setDuplicate(null);
    try { await checkNumber(receiptNumber); }
    catch (reason) { if (alive.current) setError(readableError(reason)); }
    finally { inFlight.current = false; if (alive.current) { setPhase("ready"); onBusyChange(false); } }
  }
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(receiptAt) ? receiptAt + "+07:00" : "";
  const receiptMillis = Date.parse(iso);
  const timeProblem = iso && receiptMillis < Date.parse(activatedAt)
    ? "ใบเสร็จเวลา " + timeLabel(iso) + " อยู่ก่อนเวลากดใช้ Item " + timeLabel(activatedAt) + " จึงยังส่งใบนี้ไม่ได้"
    : iso && receiptMillis > Date.now() + 5 * 60000
      ? "ใบเสร็จระบุเวลาในอนาคต " + timeLabel(iso) + " กรุณาตรวจวันและเวลาไทยจากภาพอีกครั้ง" : "";
  const missing = [!receiptNumber.trim() && "เลขที่ใบเสร็จ", !iso && "วันและเวลา", !(Number(amount) > 0) && "ยอดชำระ"].filter(Boolean);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current || busy) return;
    if (!imageData || !attempted || missing.length || !Number.isFinite(receiptMillis)) { setError("แนบใบเสร็จและตรวจข้อมูลให้ครบก่อนส่งคำขอ"); return; }
    if (timeProblem) { setError(timeProblem); return; }
    if (duplicate !== false) { setError("กรุณาตรวจเลขที่ใบเสร็จจนยืนยันว่าไม่ซ้ำก่อนส่ง"); return; }
    if (!reviewed) { setError("ตรวจข้อมูลจากภาพ แล้วติ๊กยืนยันว่าข้อมูลตรงกับใบเสร็จก่อนส่ง"); return; }
    if (!/^0\d{9}$/.test(promptPay)) { setError("กรอกเบอร์พร้อมเพย์ 10 หลัก"); return; }
    inFlight.current = true; setPhase("submitting"); setError("");
    try { await onSubmit({ receiptNumber, receiptAt: iso, amountTHB: Number(amount), promptPay, imageData }); }
    catch (reason) { if (alive.current) setError(readableError(reason)); }
    finally { inFlight.current = false; if (alive.current) setPhase("ready"); }
  }
  return <form className="sr-form sr-receipt-form" onSubmit={event => void submit(event)} aria-label="อ่านใบเสร็จก่อนส่งคำขอ">
    <section className="sr-receipt-upload">
      <h3><span>1</span> แนบใบเสร็จให้อ่านข้อมูลก่อน</h3>
      <p>ระบบจะอ่านเลขที่ใบเสร็จ วันเวลา และยอดสุทธิจากภาพมาเติมให้</p>
      <label>ภาพใบเสร็จ (JPG, PNG, WebP)
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || phase !== "ready"} data-receipt-upload="true"
          onChange={event => { const selected = event.target.files?.[0]; if (selected) void scan(selected); event.target.value = ""; }}/>
      </label>
      {imageData ? <><img className="sr-preview" src={imageData} alt="ภาพใบเสร็จที่ใช้ส่งคำขอ"/><details className="sr-ocr-text"><summary>ขยายภาพใบเสร็จเพื่อตรวจข้อมูล</summary><img className="sr-receipt-large" src={imageData} alt="ภาพใบเสร็จขนาดใหญ่"/></details></> : null}
      {progress ? <p className="sr-ocr-progress" role="status" aria-live="polite">{progress}</p> : null}
      {phase === "reading" ? <button type="button" className="sr-check" onClick={() => { job.current?.abort(); setError("หยุดอ่านภาพแล้ว กรอกข้อมูลตามใบเสร็จได้"); }}>หยุดอ่านและกรอกเอง</button> : null}
      {file.current && attempted ? <button type="button" className="sr-check" disabled={busy} onClick={() => { if (file.current) void scan(file.current); }}>อ่านใบเสร็จอีกครั้ง</button> : null}
    </section>
    {error ? <p className="sr-error" role="alert">{error}</p> : null}
    {attempted && imageData ? <section className="sr-receipt-fields">
      <h3><span>2</span> ตรวจข้อมูลที่อ่านจากใบเสร็จ</h3>
      <p className={"sr-ocr-result" + (readCount < 3 ? " sr-ocr-partial" : "") } role="status">{readCount === 3 ? "อ่านจากภาพครบ 3 ช่อง ตรวจให้ตรงกับใบเสร็จก่อนส่ง" : "อ่านจากภาพได้ " + readCount + " จาก 3 ช่อง" + (missing.length ? " · กรุณากรอก " + missing.join(" · ") + " ตามภาพ" : " · เติมข้อมูลที่ขาดแล้ว กรุณาตรวจทานก่อนส่ง")}</p>
      <label>เลขที่ใบเสร็จ<input name="receiptNumber" value={receiptNumber} required disabled={busy} onChange={event => { setReceiptNumber(event.target.value); setDuplicate(null); setReviewed(false); }} placeholder="เลขที่ใบเสร็จจากภาพ"/></label>
      <button type="button" className="sr-check" disabled={busy || receiptNumber.trim().length < 4} onClick={() => void recheck()}>ตรวจเลขที่ใบเสร็จซ้ำ</button>
      {duplicate === false ? <p className="sr-success">เลขที่ใบเสร็จไม่ซ้ำในระบบ ณ เวลาตรวจ</p> : duplicate === true ? <p className="sr-error" role="alert">เลขที่ใบเสร็จนี้ถูกใช้แล้ว ไม่สามารถส่งซ้ำได้</p> : null}
      <label>วันที่และเวลาบนใบเสร็จ (เวลาไทย)<input name="receiptAt" type="datetime-local" step="1" value={receiptAt} required disabled={busy} onChange={event => { setReceiptAt(event.target.value); setReviewed(false); }}/></label>
      {iso ? <p className="sr-hint">เวลาไทยที่เลือก: {timeLabel(iso)}</p> : null}
      {timeProblem ? <p className="sr-error" role="alert">{timeProblem}</p> : <p className="sr-hint">กดใช้ Item เมื่อ {timeLabel(activatedAt)} · ใช้วันเวลาจริงบนใบเสร็จ</p>}
      <label>ยอดสุทธิบนใบเสร็จ (บาท)<input name="amountTHB" type="number" min=".01" max="30000" step=".01" value={amount} required disabled={busy} onChange={event => { setAmount(event.target.value); setReviewed(false); }}/></label>
      {text ? <details className="sr-ocr-text"><summary>ดูข้อความที่อ่านจากภาพ</summary><pre>{text}</pre></details> : null}
      <label className="sr-checklabel"><input name="receiptReviewed" type="checkbox" checked={reviewed} disabled={busy || missing.length > 0} onChange={event => setReviewed(event.target.checked)}/>ตรวจแล้วว่าเลขใบเสร็จ วันเวลา และยอดสุทธิตรงกับภาพ</label>
      <h3><span>3</span> ข้อมูลรับเงิน</h3>
      <label>เบอร์พร้อมเพย์ 10 หลัก<input name="promptPay" inputMode="numeric" autoComplete="tel" pattern="0[0-9]{9}" maxLength={10} required disabled={busy} value={promptPay} onChange={event => setPromptPay(event.target.value.replace(/\D/g, "").slice(0, 10))}/></label>
      <p className="sr-hint">Admin จะตรวจภาพใบเสร็จก่อนอนุมัติคืนเงินตามเงื่อนไขรางวัล</p>
      <button type="submit" className="sr-primary sr-block" disabled={busy || !reviewed || missing.length > 0 || duplicate !== false || Boolean(timeProblem)}>{phase === "submitting" ? "กำลังส่งคำขอ..." : "ส่งคำขอให้ Admin ตรวจสอบ"}</button>
    </section> : null}
  </form>;
}
