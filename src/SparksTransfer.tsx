import React,{useCallback,useEffect,useState} from "react";
import {createPortal} from "react-dom";
import "./sparksTransfer.css";

type Summary={balance:number;sentThisMonth:number;remaining:number;monthlyLimit:number;
  cardActive:boolean;cardNumber:string|null;incoming:Transfer[];history:Transfer[]};
type Transfer={id:string;amount:number;sender:string;recipient?:string;status:string;expiresAt:string;sentAt?:string};
type Card={cardActive:boolean;cardNumber:string|null;pinConfigured:boolean;lockedUntil?:string|null};
const readable=(reason:unknown)=>{const message=String(reason instanceof Error?reason.message:reason||"");
  const codes:Record<string,string>={
    PIN_INCORRECT:"PIN ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง (ผิดครบ 5 ครั้งจะล็อก 15 นาที)",
    PIN_TEMPORARILY_LOCKED:"กรอก PIN ผิดหลายครั้ง กรุณาลองใหม่หลังครบ 15 นาที",
    CARD_NOT_ACTIVE:"กรุณาเปิดใช้งานบัตรสมาชิกและตั้ง PIN ก่อน",
    PIN_NEW_INVALID:"กรุณาตั้ง PIN ตัวเลข 6 หลัก และกรอกยืนยันให้ตรงกัน",
    CARD_REISSUE_CONFIRM_REQUIRED:"ไม่สามารถทำบัตรใหม่ได้ กรุณายืนยันอีกครั้ง",
    RECIPIENT_CARD_NOT_FOUND:"ไม่พบเลขบัตรสมาชิกที่ใช้งานได้ หรือเป็นบัตรของคุณเอง",
    RECIPIENT_NOT_ACTIVE:"บัญชีผู้รับไม่ได้อยู่ในสถานะ Active",
    SPARKS_INSUFFICIENT_BALANCE:"ยอด Sparks ของคุณไม่เพียงพอ",
    TRANSFER_MONTHLY_LIMIT:"ยอดโอนเกินวงเงินคงเหลือ 500 Sparks ต่อเดือน",
    TRANSFER_EXPIRED:"รายการนี้หมดเวลารับแล้ว ระบบจะคืนคะแนนให้ผู้ส่ง",
    TRANSFER_NOT_FOUND:"ไม่พบรายการรับ Sparks ที่เป็นของบัญชีคุณ",
    SPARKS_AUTH_REQUIRED:"กรุณาเข้าสู่ระบบ QA Sparks ด้วยอีเมลที่ยืนยันแล้ว",
    SPARKS_ACTIVE_ACCOUNT_REQUIRED:"บัญชีไม่มีสิทธิ์ใช้งานระบบโอน Sparks",
  };
  return Object.entries(codes).find(([k])=>message.includes(k))?.[1]||message||"ดำเนินการไม่สำเร็จ";
};
const pinValid=(v:string)=>/^\d{6}$/.test(v);
function SparkTransferIllustration(){return <svg viewBox="0 0 144 125" role="img" aria-label="บัตรสมาชิกและเหรียญ Sparks สำหรับส่งให้เพื่อน">
  <defs><linearGradient id="transfer-g" x1="0" x2="1" y2="1"><stop stopColor="#fff4b8"/><stop offset="1" stopColor="#ecae24"/></linearGradient></defs>
  <rect x="8" y="30" width="93" height="61" rx="13" transform="rotate(-9 8 30)" fill="#8f48d9" stroke="#f6ccff" strokeWidth="5"/>
  <rect x="15" y="42" width="76" height="9" rx="4" transform="rotate(-9 15 42)" fill="#eac7ff"/>
  <circle cx="96" cy="77" r="30" fill="url(#transfer-g)" stroke="#bf801b" strokeWidth="5"/>
  <path d="m96 57 6 13 14 2-10 10 3 14-13-7-13 7 2-14-10-10 14-2Z" fill="#fff1af"/>
  <path d="M31 104h38m-7-8 9 8-9 8M98 22H60m7-8-9 8 9 8" stroke="#fff3aa" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
 </svg>}
export default function SparksTransfer({username,sessionId,active}:{username:string;sessionId:string;active:boolean}){
 const [open,setOpen]=useState(false),[screen,setScreen]=useState<"gate"|"activate"|"send"|"inbox"|"history"|"settings">("gate");
 const [card,setCard]=useState<Card|null>(null),[summary,setSummary]=useState<Summary|null>(null);
 const [pin,setPin]=useState(""),[newPin,setNewPin]=useState(""),[confirmPin,setConfirmPin]=useState("");
 const [recipientCard,setRecipientCard]=useState(""),[recipientName,setRecipientName]=useState("");
 const [amount,setAmount]=useState(""),[requestId,setRequestId]=useState(""),[confirmSend,setConfirmSend]=useState(false);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 const [reissue,setReissue]=useState(false),[oldPin,setOldPin]=useState("");
 const call=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
  const response=await fetch("/api/sparks-admin",{method:"POST",credentials:"same-origin",cache:"no-store",
   headers:{"content-type":"application/json"},body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw Error(String(data.error||"ทำรายการไม่สำเร็จ"));
  return data;
 },[username,sessionId]);
 const refresh=useCallback(async()=>{const [c,s]=await Promise.all([
   call("member-card-state"),call("sparks-transfer-state")]);setCard(c);setSummary(s);return c as Card;},[call]);
 const show=useCallback(async()=>{setOpen(true);setLoading(true);setError("");setNotice("");setPin("");
  try{const c=await refresh();setScreen(c.cardActive?"gate":"activate");}
  catch(e){setError(readable(e));setScreen("gate");}finally{setLoading(false);}
 },[refresh]);
 useEffect(()=>{if(!active)return;const listener=()=>{void show()};window.addEventListener("qa:sparks-card-open",listener);return()=>window.removeEventListener("qa:sparks-card-open",listener)},[active,show]);
 useEffect(()=>{if(!open)return;const listener=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)setOpen(false)};
  window.addEventListener("keydown",listener);return()=>window.removeEventListener("keydown",listener);},[open,busy]);
 const run=async(action:string,data:Record<string,unknown>,onSuccess:(result:any)=>Promise<void>|void)=>{
  if(busy)return;setBusy(true);setError("");setNotice("");
  try{const result=await call(action,data);await onSuccess(result);}catch(e){setError(readable(e));}
  finally{setBusy(false);}
 };
 const activate=()=>void run(reissue?"member-card-reissue":"member-card-activate",
  {newPin,confirmPin,...(reissue?{confirm:"REISSUE"}:{})},async result=>{
   setCard({cardActive:true,cardNumber:result.cardNumber,pinConfigured:true});setNewPin("");setConfirmPin("");
   setReissue(false);setScreen("gate");setNotice("เปิดใช้งานบัตรเรียบร้อย กรุณากรอก PIN เพื่อเข้า Spark Transfer");
   window.dispatchEvent(new Event("qa:sparks-card-updated"));await refresh();
  });
 const unlock=()=>void run("member-pin-verify",{pin},async()=>{await refresh();setScreen("send");});
 const lookup=()=>void run("sparks-transfer-lookup",{recipientCard},result=>{setRecipientName(result.recipientName);setConfirmSend(false);});
 const send=()=>{const id=requestId||crypto.randomUUID();setRequestId(id);
  void run("sparks-transfer-submit",{recipientCard,amount:Number(amount),pin,requestId:id},async result=>{
   setNotice("ส่ง "+result.amount+" Sparks สำเร็จ · รอผู้รับกดรับภายใน 72 ชั่วโมง");
   setRecipientCard("");setRecipientName("");setAmount("");setRequestId("");setConfirmSend(false);
   try{await refresh();}catch{setNotice("ส่งสำเร็จแล้ว แต่ยังโหลดรายการล่าสุดไม่ได้ กรุณาปิดและเปิด Item ใหม่");}
   window.dispatchEvent(new Event("qa:sparks-updated"));
  });};
 const accept=(id:string)=>void run("sparks-transfer-accept",{transferId:id},async()=>{
   setNotice("รับ Sparks สำเร็จ คะแนนเข้ากระเป๋าแล้ว");
   try{await refresh();}catch{setNotice("รับ Sparks สำเร็จแล้ว แต่ยังโหลดรายการล่าสุดไม่ได้ กรุณาเปิด Item ใหม่");}
   window.dispatchEvent(new Event("qa:sparks-updated"));
  });
 const change=()=>void run("member-pin-change",{pin:oldPin,newPin,confirmPin},()=>{
   setPin("");setOldPin("");setNewPin("");setConfirmPin("");setScreen("gate");setNotice("เปลี่ยน PIN สำเร็จ กรุณาเข้าสู่ระบบด้วย PIN ใหม่");
  });
 const switchScreen=(target:typeof screen)=>{setScreen(target);setError("");setNotice("");setConfirmSend(false);};
 const eligible=Boolean(recipientName&&Number.isSafeInteger(Number(amount))&&Number(amount)>0&&summary&&Number(amount)<=Math.min(summary.balance,summary.remaining,500));
 const showModal=open&&typeof document!=="undefined";
 return <>
  <button className="qa-sparks-mini-item qa-transfer-item" type="button" data-quest-item="spark-transfer" aria-haspopup="dialog" aria-expanded={open}
    onClick={()=>void show()}>
    <span className="qa-sparks-mini-art qa-transfer-item-art"><SparkTransferIllustration/></span>
    <strong className="qa-sparks-mini-name">Spark Transfer</strong>
    <span className="qa-sparks-mini-value"><strong>โอน Sparks ให้เพื่อน</strong><small>500 Sparks/เดือน</small></span>
  </button>
  {showModal?createPortal(<div className="qa-transfer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false);}}>
   <section className="qa-transfer-dialog" role="dialog" aria-modal="true" aria-label="Spark Transfer">
    <header className="qa-transfer-dialog-header"><div><span>QA SPARKS · MEMBERSHIP</span><h2>Spark Transfer</h2><p>ส่ง Sparks ให้เพื่อนผ่านเลขบัตรสมาชิก · ผู้รับต้องกดรับภายใน 3 วัน</p></div>
      <button type="button" aria-label="ปิด" onClick={()=>setOpen(false)}>×</button></header>
    <div className="qa-transfer-dialog-body">
      {loading?<p role="status">กำลังตรวจสอบบัตรสมาชิกและ Sparks...</p>:null}
      {!loading&&screen==="activate"?<>
        <h3>{reissue?"ออกบัตรสมาชิกใหม่":"เปิดใช้งานบัตรสมาชิก"}</h3>
        <p>{reissue?"บัตรเดิมจะถูกยกเลิกถาวรและออกเลขบัตรใหม่ คะแนนและประวัติยังอยู่กับบัญชีเดิม":"ตั้ง PIN 6 หลักเพื่อเปิดใช้งานบัตรและใช้ Spark Transfer"}</p>
        <label>PIN ใหม่ 6 หลัก<input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,"").slice(0,6))}/></label>
        <label>ยืนยัน PIN ใหม่<input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,"").slice(0,6))}/></label>
        <button className="qa-transfer-main" type="button" disabled={busy||!pinValid(newPin)||newPin!==confirmPin} onClick={activate}>{reissue?"ยืนยันทำบัตรใหม่":"เปิดใช้งานบัตร"}</button>
        {reissue?<button type="button" className="qa-transfer-text" onClick={()=>{setReissue(false);switchScreen("gate");}}>กลับ</button>:null}
      </>:null}
      {!loading&&screen==="gate"&&card?.cardActive?<div className="qa-transfer-gate">
        <div className="qa-transfer-card-number"><small>บัตรสมาชิกที่เปิดใช้งานแล้ว</small><strong>{card.cardNumber}</strong></div>
        <h3>กรอก PIN 6 หลักเพื่อเข้าสู่ระบบโอน</h3>
        <p>PIN นี้ผูกกับบัตรสมาชิกของคุณ ไม่ใช่รหัสผ่านเข้า QA Dashboard</p>
        <input aria-label="PIN สมาชิก 6 หลัก" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin}
          onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="••••••"/>
        <button type="button" className="qa-transfer-main" disabled={busy||!pinValid(pin)} onClick={unlock}>ยืนยัน PIN</button>
        <div className="qa-transfer-inline"><button type="button" onClick={()=>switchScreen("settings")}>เปลี่ยน PIN</button>
         <button type="button" onClick={()=>{setReissue(true);setNewPin("");setConfirmPin("");switchScreen("activate");}}>ลืม PIN · ทำบัตรใหม่</button></div>
      </div>:null}
      {!loading&&screen==="settings"?<>
        <h3>เปลี่ยน PIN บัตรสมาชิก</h3><p>ต้องทราบ PIN เดิม หากจำไม่ได้ต้องทำบัตรใหม่</p>
        <label>PIN เดิม<input type="password" inputMode="numeric" maxLength={6} value={oldPin} onChange={e=>setOldPin(e.target.value.replace(/\D/g,"").slice(0,6))}/></label>
        <label>PIN ใหม่<input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,"").slice(0,6))}/></label>
        <label>ยืนยัน PIN ใหม่<input type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,"").slice(0,6))}/></label>
        <button className="qa-transfer-main" type="button" disabled={busy||!pinValid(oldPin)||!pinValid(newPin)||newPin!==confirmPin} onClick={change}>บันทึก PIN ใหม่</button>
        <button className="qa-transfer-text" type="button" onClick={()=>switchScreen("gate")}>กลับ</button>
      </>:null}
      {!loading&&["send","inbox","history"].includes(screen)?<>
        <div className="qa-transfer-tabs">
         {([["send","ส่ง Sparks"],["inbox","รอกดรับ"],["history","ประวัติ"]] as const).map(([k,label])=>
          <button key={k} type="button" aria-pressed={screen===k} onClick={()=>switchScreen(k)}>{label}{k==="inbox"&&summary?.incoming?.length?" ("+summary.incoming.length+")":""}</button>)}
        </div>
        {screen==="send"?<>
         <div className="qa-transfer-summary">
           <div><small>ยอด Sparks ของฉัน</small><strong>{summary?summary.balance.toLocaleString("th-TH"):"—"}</strong></div>
           <div><small>โอนแล้วเดือนนี้</small><strong>{summary?.sentThisMonth??"—"} / 500</strong></div>
           <div><small>โอนได้อีก</small><strong>{summary?.remaining??"—"} Sparks</strong></div>
         </div>
         <label>เลขบัตรสมาชิกผู้รับ<input value={recipientCard} placeholder="QS-2026-..." autoComplete="off" maxLength={55}
           onChange={e=>{setRecipientCard(e.target.value.trim().toUpperCase());setRecipientName("");setConfirmSend(false);setRequestId("");}}/></label>
         <button type="button" className="qa-transfer-secondary" disabled={busy||recipientCard.length<15} onClick={lookup}>ตรวจสอบบัตรผู้รับ</button>
         {recipientName?<div className="qa-transfer-recipient">ผู้รับที่ตรวจสอบแล้ว: <strong>{recipientName}</strong></div>:null}
         <label>จำนวน Sparks ที่ต้องการโอน<input type="number" min={1} max={500} step={1} value={amount} placeholder="เช่น 100"
           onChange={e=>{setAmount(e.target.value);setConfirmSend(false);setRequestId("");}}/></label>
         {!confirmSend?<button className="qa-transfer-main" type="button" disabled={!eligible||busy} onClick={()=>setConfirmSend(true)}>ตรวจสอบก่อนยืนยันโอน</button>
          :<div className="qa-transfer-confirm"><strong>ยืนยันส่ง {amount} Sparks ให้ {recipientName}?</strong>
           <p>ระบบจะหักคะแนนและพักไว้จนผู้รับกดรับ หากไม่รับภายใน 72 ชั่วโมงจะคืนให้คุณอัตโนมัติ</p>
           <button type="button" className="qa-transfer-main" disabled={busy} onClick={send}>ยืนยันส่ง Sparks</button>
           <button className="qa-transfer-text" type="button" onClick={()=>setConfirmSend(false)}>ยกเลิก</button></div>}
        </>:null}
        {screen==="inbox"?<><h3>รายการรอรับ Sparks</h3>
         {summary?.incoming?.length?summary.incoming.map(t=><div className="qa-transfer-record" key={t.id}>
          <div><strong>+{t.amount} Sparks</strong><small>จาก @{t.sender} · หมดเวลา {new Date(t.expiresAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</small></div>
          <button className="qa-transfer-main" type="button" disabled={busy} onClick={()=>accept(t.id)}>กดรับ Sparks</button></div>):<p>ยังไม่มี Sparks ที่รอให้คุณกดรับ</p>}
        </>:null}
        {screen==="history"?<><h3>ประวัติโอนและรับ Sparks</h3>
         {summary?.history?.length?summary.history.map(t=><div className="qa-transfer-record" key={t.id}>
           <div><strong>{t.sender===username?"ส่ง":"รับ"} {t.amount} Sparks</strong><small>{t.sender===username?"ถึง @"+t.recipient:"จาก @"+t.sender}
            {" · "}{t.status==="pending"?"รอผู้รับกดรับ":t.status==="accepted"?"รับสำเร็จ":"หมดเวลา · คืนผู้ส่งแล้ว"}</small></div>
          </div>):<p>ยังไม่มีประวัติการโอน Sparks</p>}
        </>:null}
        <p className="qa-transfer-note">โอนได้รวมไม่เกิน 500 Sparks/เดือน · ไม่เสียค่าธรรมเนียม · ส่งแล้วต้องให้ผู้รับกดรับภายใน 72 ชั่วโมง · หากไม่รับระบบคืน Sparks ให้ผู้ส่ง และคืนวงเงินโอนของเดือนที่ส่ง (ไม่เพิ่มวงเงินเดือนใหม่)</p>
       </>:null}
      {notice?<p className="qa-transfer-notice" role="status">{notice}</p>:null}
      {error?<p className="qa-transfer-error" role="alert">{error}</p>:null}
      {!loading&&screen==="gate"&&!card?.cardActive?<button type="button" className="qa-transfer-main" onClick={()=>switchScreen("activate")}>เปิดใช้งานบัตรสมาชิก</button>:null}
    </div>
   </section></div>,document.body):null}
 </>;
}
