import React,{useCallback,useEffect,useState} from "react";
import {createPortal} from "react-dom";
import "./announcementShield.css";

type Subscription={status:"none"|"unused"|"active"|"grace"|"cancelled"|"expired";itemId:string;
 purchasedAt:string;activatedAt:string;nextBillingAt:string;graceEndsAt:string;
 cancelledAt:string;lastRenewalAt:string;entitled:boolean;price:number};
type Shelf="available"|"processing"|"history";
const EMPTY:Subscription={status:"none",itemId:"",purchasedAt:"",activatedAt:"",
 nextBillingAt:"",graceEndsAt:"",cancelledAt:"",lastRenewalAt:"",entitled:false,price:50};
const date=(value:string)=>value?new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Bangkok"}).format(new Date(value)):"-";
const isProcessing=(s:Subscription)=>s.status==="active"||s.status==="grace"||(s.status==="cancelled"&&s.entitled);
function ShieldIcon(){return <span className="qa-shield-art-icon" aria-hidden="true"><svg viewBox="0 0 72 72" width="70" height="70" fill="none"><path d="M36 5 60 14v18c0 18-11 28-24 35C23 60 12 50 12 32V14L36 5Z" fill="#4B348C" stroke="#EFC778" strokeWidth="3"/><path d="M36 18c-7 0-12 6-12 13v5c0 4-3 6-5 8h34c-2-2-5-4-5-8v-5c0-7-5-13-12-13ZM31 49c1 7 9 7 10 0" fill="#FFDE86"/><path d="m18 15 36 38" stroke="#FEA9B3" strokeWidth="5" strokeLinecap="round"/></svg></span>}
export default function AnnouncementShieldItem({username,sessionId,balance,mode,inventoryFilter="available"}:{
 username:string;sessionId:string;balance:number;mode:"reward"|"inventory";inventoryFilter?:Shelf;
}){
 const [sub,setSub]=useState<Subscription>(EMPTY);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const [open,setOpen]=useState(false),[confirm,setConfirm]=useState<""|"buy"|"cancel">("");
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const request=useCallback(async(action:string)=>{
   const response=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",
     headers:{"content-type":"application/json"},body:JSON.stringify({action,actorUsername:username,sessionId})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(String(data.error||"ไม่สามารถทำรายการได้"));
   return data;
 },[username,sessionId]);
 const refresh=useCallback(async()=>{
   if(!username||!sessionId)return;
   try{const status=await request("announcement-shield-state");setSub({...EMPTY,...status});}
   catch(e){setError(e instanceof Error?e.message:"ตรวจสอบสถานะสมาชิกไม่ได้");}
   finally{setReady(true);}
 },[request,username,sessionId]);
 useEffect(()=>{
   setSub(EMPTY);setReady(false);setOpen(false);setError("");
   void refresh();
   const onFocus=()=>void refresh();
   const onRefresh=()=>void refresh();
   window.addEventListener("focus",onFocus);
   window.addEventListener("qa:sparks-items-refresh",onRefresh);
   return()=>{window.removeEventListener("focus",onFocus);window.removeEventListener("qa:sparks-items-refresh",onRefresh);};
 },[refresh]);
 const perform=async(action:"buy"|"activate"|"cancel")=>{
   if(busy)return;
   setConfirm("");setBusy(true);setError("");setNotice("");
   try{
     const endpoint=action==="buy"?"announcement-shield-buy":action==="activate"?"announcement-shield-activate":"announcement-shield-cancel";
     await request(endpoint);
     await refresh();
     if(action==="buy")setNotice("แลก Item สำเร็จแล้ว ไปที่ My Items เพื่อกดใช้งาน");
     else if(action==="activate")setNotice("เริ่มใช้งานแล้ว Pop-up ประกาศทั่วไปจะไม่เด้งขึ้นมา");
     else setNotice("ยกเลิกการต่ออายุแล้ว สิทธิ์คงอยู่จนถึงวันหมดอายุที่ชำระไว้");
     window.dispatchEvent(new Event("qa:announcement-shield-changed"));
     if(action==="buy")window.dispatchEvent(new Event("qa:sparks-updated"));
   }catch(e){setError(e instanceof Error?e.message:"ทำรายการไม่สำเร็จ");}
   finally{setBusy(false);}
 };
 const shelf:Shelf=sub.status==="unused"?"available":isProcessing(sub)?"processing":"history";
 if(mode==="inventory"&&(!ready||sub.status==="none"||shelf!==inventoryFilter))return null;
 return <>
   <button type="button" data-announcement-shield-item={mode} className="qa-sparks-mini-item qa-shield-tile"
     style={mode==="reward"?{order:-50}:undefined} onClick={()=>{setOpen(true);setError("");setConfirm("");}}>
     <span className="qa-sparks-mini-art qa-shield-tile-art"><ShieldIcon/><span className="qa-sparks-mini-corner">{mode==="reward"?"50":"×1"}</span></span>
     <strong className="qa-sparks-mini-name">Announcement Shield</strong>
     <span className="qa-sparks-mini-value">{mode==="reward"?"50 Sparks / เดือน":sub.status==="unused"?"พร้อมใช้งาน":sub.status==="grace"?"ผ่อนผัน 14 วัน":sub.status==="cancelled"?"ไม่ต่ออายุ":sub.status==="expired"?"หมดอายุ":"กำลังใช้งาน"}</span>
   </button>
   {open&&createPortal(<div className="qa-shield-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}>
    <section className="qa-shield-modal" role="dialog" aria-modal="true" aria-label="Announcement Shield">
     <button className="qa-shield-close" type="button" onClick={()=>setOpen(false)} aria-label="ปิดรายละเอียด">×</button>
     <header className="qa-shield-hero"><ShieldIcon/><div><small>QA SPARKS · PREMIUM ITEM</small><h2>Announcement Shield</h2><p>ปิดเฉพาะ Pop-up ของประกาศทั่วไป พร้อมต่ออายุอัตโนมัติ</p></div></header>
     <div className="qa-shield-price"><strong>50 Sparks</strong><span>ต่อเดือน · เริ่มนับเมื่อกดใช้งาน</span></div>
     <div className="qa-shield-terms">
       <h3>สิทธิ์และเงื่อนไข</h3>
       <p>ปิด Pop-up ประกาศทั่วไปเท่านั้น ประกาศยังเปิดอ่านได้จาก Announcement และไม่ถือว่าอ่านแล้วอัตโนมัติ การแจ้งเตือนสำคัญและความปลอดภัยยังปรากฏตามปกติ</p>
       <p>แลก Item ครั้งแรก 50 Sparks และกดใช้งานด้วยตัวเองเพื่อเริ่มนับหนึ่งเดือน จากนั้นระบบตัด 50 Sparks ต่อเดือนอัตโนมัติจนกว่าจะยกเลิก</p>
       <p>ถ้าคะแนนไม่เพียงพอ ยังใช้สิทธิ์ได้ระหว่างรอตัดซ้ำ 14 วัน หากชำระไม่สำเร็จภายในกำหนด ระบบยกเลิกเอง</p>
     </div>
     <div className="qa-shield-status" data-shield-status={sub.status}>
       <strong>สถานะ: {sub.status==="none"?"ยังไม่ได้แลก":sub.status==="unused"?"พร้อมกดใช้งาน":sub.status==="active"?"กำลังใช้งาน":sub.status==="grace"?"รอหัก Sparks (ยังปิด Pop-up ได้)":sub.status==="cancelled"?"ยกเลิกการต่ออายุ":"หมดอายุ"}</strong>
       {sub.purchasedAt?<span>แลกเมื่อ: {date(sub.purchasedAt)}</span>:null}
       {sub.activatedAt?<span>เริ่มใช้: {date(sub.activatedAt)}</span>:null}
       {sub.nextBillingAt?<span>{sub.status==="cancelled"?"สิทธิ์หมดอายุ":"รอบตัดคะแนนถัดไป"}: {date(sub.nextBillingAt)}</span>:null}
       {sub.graceEndsAt&&sub.status==="grace"?<span>สิ้นสุดผ่อนผัน: {date(sub.graceEndsAt)}</span>:null}
       {sub.lastRenewalAt?<span>ต่ออายุล่าสุด: {date(sub.lastRenewalAt)}</span>:null}
     </div>
     {notice?<p className="qa-shield-success" role="status">{notice}</p>:null}
     {error?<p className="qa-shield-error" role="alert">{error}</p>:null}
     {confirm==="buy"?<div className="qa-shield-confirm"><p>ยืนยันแลก Announcement Shield ด้วย 50 Sparks และยินยอมให้ระบบหัก 50 Sparks ทุกเดือนหลังเริ่มใช้งานจนกว่าจะยกเลิก?</p><button onClick={()=>void perform("buy")} disabled={busy}>ยืนยันการสมัครและหัก 50 Sparks</button><button className="qa-shield-outline" onClick={()=>setConfirm("")}>กลับ</button></div>
     :confirm==="cancel"?<div className="qa-shield-confirm"><p>ยืนยันยกเลิกการต่ออายุอัตโนมัติ? สิทธิ์ที่ชำระแล้วจะอยู่จนถึงวันหมดอายุ และจะไม่หักคะแนนรอบถัดไป</p><button onClick={()=>void perform("cancel")} disabled={busy}>ยืนยันยกเลิกต่ออายุ</button><button className="qa-shield-outline" onClick={()=>setConfirm("")}>กลับ</button></div>
     :<div className="qa-shield-actions">
       {!ready?<span>กำลังตรวจสอบสถานะ...</span>:
       (sub.status==="none"||sub.status==="expired")?<button onClick={()=>setConfirm("buy")} disabled={busy||balance<50}>แลก Item 50 Sparks</button>:
       sub.status==="unused"?<button disabled={busy} onClick={()=>void perform("activate")}>กดใช้งาน Item</button>:
       (sub.status==="active"||sub.status==="grace")?<button className="qa-shield-outline" disabled={busy} onClick={()=>setConfirm("cancel")}>ยกเลิกการต่ออายุอัตโนมัติ</button>:
       <span>ระบบหยุดต่ออายุแล้ว</span>}
       {balance<50&&(sub.status==="none"||sub.status==="expired")?<small>ยอด Sparks ไม่เพียงพอ</small>:null}
     </div>}
    </section>
   </div>,document.body):null}
 </>;
}
