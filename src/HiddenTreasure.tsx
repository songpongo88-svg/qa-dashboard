import React,{useEffect,useRef,useState} from "react";
import "./hiddenTreasure.css";

type TreasureFound={offerId:string;alreadyClaimed:boolean;day:string};
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
   if(!active||!username||!sessionId||!/^[-_a-zA-Z0-9]{3,70}$/.test(caseId))return;
   let cancelled=false,visibleSeconds=0,elapsed=0,checking=false;
   void (async()=>{
     try{
       const started=await call("treasure-start",{caseId});
       if(cancelled||id!==requestId.current||!started.eligible)return;
       const timer=window.setInterval(()=>{
         if(cancelled||id!==requestId.current){window.clearInterval(timer);return;}
         elapsed++;
         if(document.visibilityState==="visible"&&!document.hidden)visibleSeconds++;
         if(visibleSeconds<30||checking)return;
         checking=true;
         window.clearInterval(timer);
         void call("treasure-find",{visitId:started.visitId}).then(d=>{
           if(cancelled||id!==requestId.current||!d.found)return;
           setFound({offerId:String(d.offerId||""),alreadyClaimed:!!d.alreadyClaimed,day:String(d.day||"")});
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
     if(found.alreadyClaimed||!found.offerId){setResult({amount:0,alreadyClaimed:true});return;}
     const awarded=await call("treasure-open",{offerId:found.offerId});
     setResult({amount:Number(awarded.amount||0),claimed:!!awarded.claimed,
       alreadyClaimed:!!awarded.alreadyClaimed,day:awarded.day});
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
       result.alreadyClaimed?<p>คุณรับ Sparks จากขุมทรัพย์ของวันนี้แล้ว กลับมาลุ้นใหม่พรุ่งนี้</p>:
       <p className="qa-hidden-treasure-win">+{result.amount.toLocaleString("th-TH")} Sparks</p>}
     {error?<p role="alert" className="qa-hidden-treasure-error">{error}</p>:null}
     {!result?<button type="button" className="qa-hidden-treasure-open" disabled={opening} onClick={()=>void open()}>
       {opening?"กำลังเปิดหีบ...":"เปิดหีบสมบัติ"}
     </button>:<button type="button" className="qa-hidden-treasure-open" onClick={()=>setClosed(true)}>รับทราบ</button>}
     <small>ขุมทรัพย์สุ่ม · รับ Sparks ได้สูงสุดวันละหนึ่งครั้ง</small>
   </section>
 </div>;
}
