import React,{useEffect,useRef,useState} from "react";
import "./hiddenTreasure.css";

type TreasureFound={offerId:string;day:string};
const claimedUsersToday=new Set<string>();
function bangkokDay(){
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const part=(type:string)=>parts.find(p=>p.type===type)?.value||"";
 return part("year")+"-"+part("month")+"-"+part("day");
}
type TreasureReward={amount:number;alreadyClaimed?:boolean;claimed?:boolean;day?:string};

/** Hidden Treasure only starts on a visible, permission-scoped Case Detail.
 * Discovery is cosmetic until a server-authorized, fixed-day wallet transaction.
 */
export default function HiddenTreasure({username,sessionId,caseId,active}:{
 username:string;sessionId:string;caseId:string;active:boolean;
}){
 const [found,setFound]=useState<TreasureFound|null>(null);
 const [result,setResult]=useState<TreasureReward|null>(null);
 const [opening,setOpening]=useState(false);
 const [error,setError]=useState("");
 const [closed,setClosed]=useState(false);
 const requestId=useRef(0);
 const call=async(action:string,extra:Record<string,unknown>={})=>{
   const response=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",
     headers:{"content-type":"application/json"},
     body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
   const value=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(String(value.error||"ไม่สามารถตรวจสอบขุมทรัพย์ได้"));
   return value;
 };
 useEffect(()=>{
   const id=++requestId.current;
   setFound(null);setResult(null);setError("");setClosed(false);
   const claimKey=username.toLowerCase()+":"+bangkokDay();
   if(!active||!username||!sessionId||!/^[-_a-zA-Z0-9]{3,70}$/.test(caseId)||claimedUsersToday.has(claimKey))return;
   let cancelled=false,visibleSeconds=0,checking=false;
   void (async()=>{
     try{
       const started=await call("treasure-start",{caseId});
       if(cancelled||id!==requestId.current)return;
       if(started.claimed||started.reason==="already-claimed"){claimedUsersToday.add(claimKey);return;}
       if(started.pendingOfferId){setFound({offerId:String(started.pendingOfferId),day:String(started.day||"")});return;}
       if(!started.eligible)return;
       const timer=window.setInterval(()=>{
         if(cancelled||id!==requestId.current){window.clearInterval(timer);return;}
         if(document.visibilityState==="visible"&&!document.hidden)visibleSeconds++;
         if(visibleSeconds<Math.max(30,Math.min(90,Number(started.readSeconds)||30))||checking)return;
         checking=true;
         window.clearInterval(timer);
         void call("treasure-find",{visitId:started.visitId}).then(d=>{
           if(cancelled||id!==requestId.current)return;
           if(d.claimed||d.reason==="already-claimed"){claimedUsersToday.add(claimKey);return;}
           if(!d.found||!d.offerId)return;
           setFound({offerId:String(d.offerId),day:String(d.day||"")});
         }).catch(()=>{/* Discovery fails closed without affecting any other QA page. */});
       },1000);
       // Limit a visit to 15 minutes even if the tab stays in the background.
       window.setTimeout(()=>window.clearInterval(timer),14*60*1000);
     }catch{/* Optional feature never blocks viewing a QA case. */}
   })();
   return()=>{cancelled=true;};
 },[active,caseId,username,sessionId]);
 const open=async()=>{
   if(!found||opening)return;
   setOpening(true);setError("");
   try{
     if(!found.offerId)return;
     const awarded=await call("treasure-open",{offerId:found.offerId});
     setResult({amount:Number(awarded.amount||0),claimed:!!awarded.claimed,
       alreadyClaimed:!!awarded.alreadyClaimed,day:awarded.day});
     if(awarded.claimed||awarded.alreadyClaimed)claimedUsersToday.add(username.toLowerCase()+":"+bangkokDay());
     if(awarded.claimed)window.dispatchEvent(new Event("qa:sparks-updated"));
   }catch(e){setError(e instanceof Error?e.message:"เปิดหีบไม่สำเร็จ");}
   finally{setOpening(false);}
 };
 if(!found||closed)return null;
 return <div className="qa-hidden-treasure" data-qa-hidden-treasure="true">
   <section className="qa-hidden-treasure-card" role="dialog" aria-modal="false" aria-label="ขุมทรัพย์ลับ QA Sparks">
     <button type="button" className="qa-hidden-treasure-close" aria-label="ปิดขุมทรัพย์" onClick={()=>setClosed(true)}>×</button>
     <div className="qa-hidden-treasure-icon" aria-hidden="true">🎁</div>
     <h3>{result?"ผลการเปิดขุมทรัพย์":"คุณพบขุมทรัพย์ลับ!"}</h3>
     {!result?<p>เปิดหีบเพื่อดูว่าขุมทรัพย์วันนี้มีอะไรซ่อนอยู่</p>:
       result.alreadyClaimed?<p>ระบบบันทึกรางวัลวันนี้ไว้แล้ว</p>:
       <p className="qa-hidden-treasure-win">+{result.amount.toLocaleString("th-TH")} Sparks</p>}
     {error?<p role="alert" className="qa-hidden-treasure-error">{error}</p>:null}
     {!result?<button type="button" className="qa-hidden-treasure-open" disabled={opening} onClick={()=>void open()}>
       {opening?"กำลังเปิดหีบ...":"เปิดหีบสมบัติ"}
     </button>:<button type="button" className="qa-hidden-treasure-open" onClick={()=>setClosed(true)}>รับทราบ</button>}
     <small>ค้นหาได้จนกว่าจะพบ · เมื่อรับแล้วจะไม่พบหีบอีกจนถึงวันถัดไป</small>
   </section>
 </div>;
}
