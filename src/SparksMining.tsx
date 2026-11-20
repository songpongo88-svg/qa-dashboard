import React,{useCallback,useEffect,useState} from "react";
import "./sparksMining.css";

type MineState={ok:boolean;day:string;open:boolean;claimedToday:boolean;
  amount:number;available:boolean;opensAt:string;closesAt:string;timeZone:string;boostOwned:number;boostBoughtToday:number;boostPrice:number};
type MineResult={ok:boolean;alreadyApplied:boolean;day:string;amount:number;balance:number;boostUsed?:boolean};
const points=(value:number)=>new Intl.NumberFormat("th-TH").format(value);
function bangkokHour(ms:number){
  const parts=new Intl.DateTimeFormat("en-GB",{
    timeZone:"Asia/Bangkok",hour:"2-digit",hourCycle:"h23",
  }).formatToParts(new Date(ms));
  return Number(parts.find(part=>part.type==="hour")?.value||0);
}
export function miningWindowOpen(ms:number){
  const hour=bangkokHour(ms);
  return hour>=14&&hour<16;
}
function MineArt({opened=false}:{opened?:boolean}){
  return <svg className="qa-mining-art" viewBox="0 0 350 180" role="img" aria-label="ภาพเหมืองแร่และคริสตัล Sparks">
    <defs>
      <linearGradient id="mine-rocks" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#4c3c68"/><stop offset="1" stopColor="#191a36"/></linearGradient>
      <linearGradient id="mine-gem" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d8fffe"/><stop offset=".6" stopColor="#73d6ef"/><stop offset="1" stopColor="#5687f8"/></linearGradient>
      <radialGradient id="mine-shine"><stop stopColor="#ffde82" stopOpacity=".5"/><stop offset="1" stopColor="#f8d680" stopOpacity="0"/></radialGradient>
    </defs>
    <rect width="350" height="180" rx="20" fill="#171630"/>
    <circle cx="187" cy="105" r="100" fill="url(#mine-shine)"/>
    <path d="M0 138L55 78 100 116 151 53 207 108 245 70 350 145V180H0Z" fill="#3e3557"/>
    <path d="M0 158L67 118 107 145 161 89 236 153 287 106 350 139V180H0Z" fill="url(#mine-rocks)"/>
    <path d="M146 158L174 99 210 91 231 125 201 163Z" fill="#6b547e" stroke="#9e83bb" strokeWidth="3"/>
    <path d="M178 98L207 91 225 118 203 153 166 144Z" fill="url(#mine-gem)" stroke="#cbffff" strokeWidth="3"/>
    <path d="M178 98L196 123 166 144M207 91L196 123 203 153M196 123L225 118" fill="none" stroke="#f2ffff" strokeWidth="2" opacity=".7"/>
    <g className="qa-mining-pickaxe" transform="translate(72 29) rotate(-30 55 55)">
      <rect x="51" y="30" width="12" height="103" rx="5" fill="#d8a66c" stroke="#7a493d" strokeWidth="3"/>
      <path d="M9 50Q34 7 88 23Q111 29 126 51Q95 38 64 42Q35 36 9 50Z" fill="#d5d6e5" stroke="#69718d" strokeWidth="5"/>
    </g>
    {[48,129,262,309].map((x,i)=><path key={x} d={"M"+x+" "+(33+i*18)+"l5 11 11 4-11 4-5 11-5-11-11-4 11-4Z"} fill="#ffdc7e" opacity=".8"/>)}
    {opened?<text x="175" y="34" textAnchor="middle" fontSize="18" fontWeight="900" fill="#fff0a2">ค้นพบ Sparks!</text>:null}
  </svg>;
}
export default function SparksMining({username,sessionId,active}:{username:string;sessionId:string;active:boolean}){
  const [time,setTime]=useState(()=>Date.now());
  const [isOpen,setIsOpen]=useState(false);
  const [state,setState]=useState<MineState|null>(null);
  const [result,setResult]=useState<MineResult|null>(null);
  const [loading,setLoading]=useState(false);
  const [working,setWorking]=useState(false);
  const [useBoost,setUseBoost]=useState(false);
  const [error,setError]=useState("");
  const inside=active&&miningWindowOpen(time);
  useEffect(()=>{
    if(!active)return;
    const tick=()=>setTime(Date.now());
    const timer=window.setInterval(tick,5000);
    window.addEventListener("focus",tick);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",tick);};
  },[active]);
  useEffect(()=>{if(!inside)setIsOpen(false);},[inside]);
  const request=useCallback(async(action:"mining-state"|"mining-dig",boost=false)=>{
    const response=await fetch("/api/sparks-admin",{
      method:"POST",cache:"no-store",credentials:"same-origin",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({action,actorUsername:username,sessionId,useBoost:boost}),
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(String(data.error||"ไม่สามารถติดต่อเหมืองแร่ได้"));
    return data;
  },[username,sessionId]);
  const openMine=async()=>{
    setIsOpen(true);setError("");setResult(null);setState(null);setUseBoost(false);setLoading(true);
    try{setState(await request("mining-state") as MineState);}
    catch(e){setError(e instanceof Error?e.message:"โหลดข้อมูลไม่สำเร็จ");}
    finally{setLoading(false);}
  };
  const dig=async()=>{
    if(working||!state?.available)return;
    setWorking(true);setError("");
    try {
      const prize=await request("mining-dig",useBoost) as MineResult;
      setResult(prize);
      setState(previous=>previous?{...previous,available:false,claimedToday:true,amount:prize.amount,boostOwned:previous.boostOwned-(prize.boostUsed?1:0)}:previous);
      if(!prize.alreadyApplied)window.dispatchEvent(new Event("qa:sparks-updated"));
    }catch(e){
      setError(e instanceof Error?e.message:"ขุดเหมืองไม่สำเร็จ");
      try{setState(await request("mining-state") as MineState);}catch{/* Preserve the original error. */}
    }finally{setWorking(false);}
  };
  if(!inside)return null;
  return <>
    <button type="button" className="qa-mining-float" aria-label="กิจกรรมขุดเหมือง QA Sparks เปิดถึง 16:00 น." title="เหมืองแร่ · 14:00–16:00" onClick={()=>void openMine()}>
      <span className="qa-mining-glow" aria-hidden="true"/>
      <svg viewBox="0 0 48 48" width="29" height="29" aria-hidden="true" fill="none">
        <path d="M26 14l4 4-17 22-6-5 19-21Z" fill="#dcaa6a" stroke="#ffe3b3" strokeWidth="2"/>
        <path d="M8 19Q22 0 40 16L31 13 23 18 14 17Z" fill="#d7ebff" stroke="#6586b9" strokeWidth="2"/>
        <path d="M35 29l5-9 5 9-5 9Z" fill="#82e9ff" stroke="#cbffff" strokeWidth="2"/>
      </svg>
      <span className="qa-mining-float-label">ขุดแร่</span>
    </button>
    {isOpen?<div className="qa-mining-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setIsOpen(false);}}>
      <section className="qa-mining-dialog" role="dialog" aria-modal="true" aria-labelledby="qa-mining-title">
        <button type="button" className="qa-mining-close" aria-label="ปิดเหมืองแร่" onClick={()=>setIsOpen(false)}>×</button>
        <div className="qa-mining-eyebrow">QA SPARKS · DAILY MINING</div>
        <h2 id="qa-mining-title">เหมืองแร่ Sparks</h2>
        <p className="qa-mining-intro">ขุดได้ 1 ครั้งต่อวัน · เปิดทุกวัน 14:00–16:00 น. (เวลาไทย)</p>
        <MineArt opened={Boolean(result||state?.claimedToday)}/>
        <div className="qa-mining-maximum">สุ่มรับ 1–1,500 Sparks · ยิ่งรางวัลสูง ยิ่งมีโอกาสพบน้อย</div>
        {loading?<p role="status" className="qa-mining-notice">กำลังตรวจสอบสิทธิ์ขุดเหมือง...</p>:
          state?.claimedToday?<div className="qa-mining-won" role="status">
            <small>{result?.alreadyApplied?"รายการนี้ได้รับรางวัลแล้ว":"ขุดเหมืองวันนี้สำเร็จ"}</small>
            <strong>+{points(result?.amount??state.amount)} Sparks</strong>
            <span>กลับมาขุดใหม่ได้ในวันถัดไป เวลา 14:00 น.</span>
          </div>:
          <div className="qa-mining-available">เหลือสิทธิ์ขุดเหมืองวันนี้ 1 ครั้ง</div>}
        {!loading&&!state?.claimedToday?<label style={{display:"flex",gap:10,alignItems:"center",padding:"10px 12px",border:"1px solid #bda6da",borderRadius:12,margin:"12px 0"}}>
          <input type="checkbox" checked={useBoost} disabled={working||!state?.boostOwned} onChange={event=>setUseBoost(event.target.checked)}/>
          <span><strong>ใช้ Mining Lucky Boost +40%</strong><small style={{display:"block"}}>คงเหลือ {state?.boostOwned??0} ชิ้น · เพิ่มโอกาสรางวัลระดับสูง 40%</small></span>
        </label>:null}
        {result?.boostUsed?<p role="status">ใช้ Mining Lucky Boost 1 ชิ้นแล้ว</p>:null}
        {error?<p role="alert" className="qa-mining-error">{error}</p>:null}
        <button type="button" className="qa-mining-action"
          disabled={loading||working||!state?.available}
          onClick={()=>void dig()}>{working?"กำลังขุดเหมือง...":state?.claimedToday?"รับรางวัลวันนี้แล้ว":"ขุดเหมืองรับ Sparks"}</button>
        <p className="qa-mining-footnote">รางวัลจะเข้ากระเป๋า QA Sparks โดยอัตโนมัติ พร้อมบันทึกประวัติรายการ</p>
      </section>
    </div>:null}
  </>;
}
