import React,{useState} from "react";
import {readPayoutSlipLocally} from "./localPayoutSlipOcr";
import type {PayoutScan} from "./RewardActionConfirmModal";

// Admin-only read-only test. It NEVER calls the payout API or changes a reward request.
export default function SparksSlipOcrTester(){
  const [scan,setScan]=useState<PayoutScan|null>(null);
  const [image,setImage]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function readImage(file?:File){
    if(!file)return;
    setBusy(true);setScan(null);setError("");setImage("");
    try{
      if(!/^image\/(?:jpeg|png|webp)$/.test(file.type)||file.size>8*1024*1024)
        throw Error("ใช้ไฟล์ JPG/PNG/WebP ขนาดไม่เกิน 8 MB");
      const url=await new Promise<string>((resolve,reject)=>{
        const reader=new FileReader();
        reader.onerror=()=>reject(Error("เปิดภาพสลิปไม่สำเร็จ"));
        reader.onload=()=>resolve(String(reader.result||""));
        reader.readAsDataURL(file);
      });
      const result=await readPayoutSlipLocally(url);
      setImage(url);setScan(result);
    }catch(reason){setError(reason instanceof Error?reason.message:"ไม่สามารถอ่านสลิปได้");}
    finally{setBusy(false);}
  }
  const fields=scan?.fields;
  const fmt=(n:number|null|undefined)=>n===null||n===undefined?"—":n.toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2})+" บาท";
  const date=(iso:string|undefined)=>{
    if(!iso)return "—";const d=new Date(iso);
    return Number.isFinite(d.getTime())?d.toLocaleString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
  };
  return <div className="sa-slip-test" data-sparks-slip-test="read-only">
    <p className="sa-muted">ทดลองอ่านภาพสลิปได้โดยไม่ต้องมีคำขอจ่ายเงิน ไม่ตรวจยอดเทียบกับ 20 บาท ไม่ส่งข้อมูลไปยัง API จ่ายเงิน และไม่บันทึก Paid</p>
    <label className="sa-field">เลือกภาพสลิปตัวอย่าง
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
        onChange={e=>{void readImage(e.target.files?.[0]);e.target.value="";}}/>
    </label>
    {busy?<p role="status">กำลังอ่านข้อความไทยและอังกฤษจากภาพบนอุปกรณ์นี้…</p>:null}
    {error?<p className="sa-error" role="alert">{error}</p>:null}
    {fields?<div className="sa-slip-test-results">
      <p><strong>ผลการอ่าน: {scan?.ocrStatus==="local"?"อ่านข้อความได้แล้ว":"ยังอ่านไม่ชัด ต้องตรวจเอง"}</strong></p>
      <dl className="sa-details">
        <div><dt>ธนาคารที่ออกสลิป</dt><dd>{fields.bank||"—"}</dd></div>
        <div><dt>สถานะที่ปรากฏ</dt><dd>{fields.isSuccessful?"รายการสำเร็จ":"อ่านสถานะไม่ชัด"}</dd></div>
        <div><dt>วันที่และเวลา</dt><dd>{date(fields.payoutAt)}</dd></div>
        <div><dt>ยอดโอน</dt><dd>{fmt(fields.amountTHB)}</dd></div>
        <div><dt>ค่าธรรมเนียม</dt><dd>{fmt(fields.feeTHB)}</dd></div>
        <div><dt>หมายเลขอ้างอิง</dt><dd>{fields.shortReference||"—"}</dd></div>
        <div><dt>เลขที่อ้างอิง</dt><dd>{fields.longReference||fields.transactionRef||"—"}</dd></div>
        <div><dt>ผู้โอน (ผล OCR)</dt><dd>{fields.senderName||"—"}</dd></div>
        <div><dt>บัญชีผู้โอนที่แสดง</dt><dd>{fields.senderAccountMasked||"—"}</dd></div>
        <div><dt>ธนาคารผู้รับ</dt><dd>{fields.recipientBank||"—"}</dd></div>
        <div><dt>ผู้รับ (ผล OCR)</dt><dd>{fields.recipientName||fields.recipientLabel||"—"}</dd></div>
        <div><dt>บัญชีผู้รับที่แสดง</dt><dd>{fields.recipientAccountMasked||fields.recipientVisibleSuffix||"—"}</dd></div>
      </dl>
      {fields.reviewFlags?.length?<p className="sa-muted">ต้องตรวจทาน: {fields.reviewFlags.join(" · ")}</p>:null}
      {fields.missing.length?<p className="sa-error">ยังอ่านไม่ครบ: {fields.missing.join(", ")}</p>:null}
      <p className="sa-muted">ข้อความชื่อบุคคลอาจคลาดเคลื่อนจาก OCR และสลิปนี้ยังไม่ได้รับการตรวจยืนยันกับธนาคาร</p>
    </div>:null}
    {image?<details><summary>ดูภาพต้นฉบับที่ใช้ทดสอบ</summary><img src={image} alt="สลิปตัวอย่าง" style={{display:"block",maxWidth:"100%",maxHeight:560,objectFit:"contain",margin:"10px auto"}}/></details>:null}
  </div>;
}
