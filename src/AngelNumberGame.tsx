import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ANGEL_CAPTIONS,ANGEL_PROPS} from "./angelNumberCatalog";
import "./angelNumberGame.css";

type Pick = {number:number;bonus:number;at:string};
type AngelState = {status:string;roundId?:string;startsAt?:string;jackpot:number;picks:Pick[];
  cooldownUntil?:number;winner?:string;payoutStatus?:string;ownWon?:boolean;angelNumber?:number;
  distributed?:{username:string;amount:number;percent:number}[]};
type Friend = {username:string;displayName:string};
type Share = {username:string;percent:number};
const fmt=(n:number)=>new Intl.NumberFormat("en-US").format(n||0);
const empty:AngelState={status:"loading",jackpot:0,picks:[]};
function AngelArt({number,large=false}:{number:number;large?:boolean}){
  const wing=number%4===0?"#fef8ff":number%4===1?"#f9edff":number%4===2?"#fff9e5":"#e3f8ff";
  return <div className={"an-angel"+(large?" an-angel--large":"")} aria-hidden="true">
    <svg viewBox="0 0 110 98" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="55" cy="12" rx="27" ry="7" fill="none" stroke="#ffc64e" strokeWidth="4"/>
      <path d="M37 49C15 24 1 40 17 61Q3 75 39 74M73 49C95 24 109 40 93 61Q107 75 71 74" fill={wing} stroke="#d8bdf4" strokeWidth="2"/>
      <path d="M35 80Q55 52 75 80L80 94H30Z" fill={number%2?"#ffd2e9":"#d5c1fc"} stroke="#bb9bde" strokeWidth="2"/>
      <circle cx="55" cy="47" r="24" fill="#ffdfc3" stroke="#eebd9e" strokeWidth="1.5"/>
      <path d="M31 46C29 15 80 11 79 45L71 31Q56 25 43 34Z" fill="#7b4a44"/>
      <circle cx="45" cy="50" r="2.7" fill="#553d42"/><circle cx="65" cy="50" r="2.7" fill="#553d42"/>
      <ellipse cx="37" cy="57" rx="5" ry="3" fill="#ff9bb5" opacity=".65"/>
      <ellipse cx="73" cy="57" rx="5" ry="3" fill="#ff9bb5" opacity=".65"/>
      <path d="M51 61Q55 66 60 61" stroke="#bd6c77" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M40 76Q26 69 24 59M70 76Q84 69 86 59" stroke="#ffdfc3" strokeWidth="8" strokeLinecap="round"/>
    </svg>
    <span className="an-angel-prop">{ANGEL_PROPS[number]||"✨"}</span>
  </div>;
}
function Countdown({until,now}:{until:number;now:number}){
  const seconds=Math.max(0,Math.ceil((until-now)/1000));
  return <span className="an-countdown">{String(Math.floor(seconds/60)).padStart(2,"0")}:{String(seconds%60).padStart(2,"0")}</span>;
}
export default function AngelNumberGame({username,sessionId,adminAccess=false,balance=0}:{
  username:string;sessionId:string;adminAccess?:boolean;balance?:number;
}){
  const [state,setState]=useState<AngelState>(empty);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [selected,setSelected]=useState<number|null>(null),[result,setResult]=useState<{hit:boolean;bonus:number;refund:number;jackpot:number}|null>(null);
  const [adminNumber,setAdminNumber]=useState(""),[now,setNow]=useState(Date.now());
  const [friends,setFriends]=useState<Friend[]>([]),[friendsBusy,setFriendsBusy]=useState(false);
  const [shareChoice,setShareChoice]=useState<"self"|"friends">("self"),[shares,setShares]=useState<Share[]>([]);
  const [prizePaid,setPrizePaid]=useState(false);
  const requestId=useRef("");
  const request=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
    const response=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",credentials:"same-origin",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(String(data.error||"ไม่สามารถดำเนินการได้ กรุณาลองใหม่"));
    return data;
  },[username,sessionId]);
  const refresh=useCallback(async(silent=false)=>{
    if(!username||!sessionId)return;
    if(!silent)setLoading(true);
    try{const data=await request("angel-state");setState(data);if(!silent)setError("");}
    catch(e){if(!silent)setError(e instanceof Error?e.message:"ไม่สามารถโหลดเกมได้");}
    finally{if(!silent)setLoading(false);}
  },[request,username,sessionId]);
  useEffect(()=>{
    void refresh();const interval=window.setInterval(()=>{setNow(Date.now());},1000);
    const polling=window.setInterval(()=>{void refresh(true);},30000);
    const onFocus=()=>{void refresh(true);};window.addEventListener("focus",onFocus);
    return ()=>{window.clearInterval(interval);window.clearInterval(polling);window.removeEventListener("focus",onFocus);};
  },[refresh]);
  const opened=useMemo(()=>new Set((state.picks||[]).map(p=>p.number)),[state.picks]);
  const cooldown=Math.max(0,(state.cooldownUntil||0)-now);
  const canPlay=state.status==="open"&&cooldown===0&&!busy&&username!=="songpon";
  const ended=state.status==="finished";
  const mustAllocate=ended&&state.ownWon&&state.payoutStatus==="pending"&&!prizePaid;
  const canNewRound=state.status==="not-configured"||(ended&&state.payoutStatus==="paid");
  const start=async()=>{
    const n=Number(adminNumber);
    if(!/^(0|[1-9]\d?|100)$/.test(adminNumber)||!Number.isInteger(n))return setError("กรุณากำหนดเลขนางฟ้า 0–100");
    setBusy(true);setError("");try{
      const data=await request("angel-admin-create",{angelNumber:n});
      setState(data);setAdminNumber("");setNotice("สร้างรอบกิจกรรมแล้ว ระบบจะแสดงเลขนางฟ้าต่อผู้ดูแลเท่านั้น");
    }catch(e){setError(e instanceof Error?e.message:"เปิดรอบไม่ได้");}
    finally{setBusy(false);}
  };
  const open=async()=>{
    if(selected===null||busy)return;
    if(!requestId.current)requestId.current=crypto.randomUUID();
    setBusy(true);setError("");
    try{
      const data=await request("angel-open",{number:selected,requestId:requestId.current});
      requestId.current="";setState(data.state);setResult(data);
      window.dispatchEvent(new Event("qa:sparks-updated"));
    }catch(e){setError(e instanceof Error?e.message:"เปิดหมายเลขไม่สำเร็จ");await refresh(true);}
    finally{setBusy(false);setSelected(null);}
  };
  const getFriends=async()=>{
    setFriendsBusy(true);setError("");
    try{const data=await request("angel-friends");setFriends(Array.isArray(data.users)?data.users:[]);}
    catch(e){setError(e instanceof Error?e.message:"โหลดรายชื่อเพื่อนไม่สำเร็จ");}
    finally{setFriendsBusy(false);}
  };
  const addFriend=(name:string)=>{
    if(!name||shares.some(p=>p.username===name)||shares.length>=10)return;
    setShares(current=>[...current,{username:name,percent:10}]);
  };
  const totalPercent=shares.reduce((sum,p)=>sum+p.percent,0);
  const claim=async()=>{
    if(busy||totalPercent>100)return;
    setBusy(true);setError("");
    try{
      const data=await request("angel-claim",{shares:shareChoice==="friends"?shares:[]});
      setPrizePaid(true);setResult(null);setShares([]);setNotice("บันทึกและจ่าย Jackpot ให้ผู้รับครบแล้ว");
      window.dispatchEvent(new Event("qa:sparks-updated"));
      await refresh(true);
      if(data.alreadyApplied)setNotice("รางวัลรอบนี้ได้ถูกจัดสรรไว้แล้ว");
    }catch(e){setError(e instanceof Error?e.message:"จ่าย Jackpot ไม่สำเร็จ");}
    finally{setBusy(false);}
  };
  return <section className="an-game" aria-label="เลขนางฟ้า Angel Number">
    <header className="an-hero">
      <div className="an-hero-copy"><span className="an-eyebrow">QA SPARKS · MINI GAMES</span>
        <h2>เลขนางฟ้า <small>Angel Number</small></h2>
        <p>นางฟ้า 101 คาแรกเตอร์ กับหมายเลขลับหนึ่งเดียว เปิดเลข ลุ้นโบนัส และตามหา Jackpot!</p>
        <div className="an-hero-chips"><span>ค่าเปิด <b>5 Sparks</b></span><span>โบนัสสุ่ม <b>5–50 Sparks</b></span><span>คูลดาวน์ <b>5 นาที</b></span></div>
      </div>
      <div className="an-hero-art"><AngelArt number={8} large/><span className="an-stars">✦ ✧ ✨ ✦</span></div>
      <div className="an-jackpot"><span>✦ JACKPOT สะสม ✦</span><strong>{fmt(state.jackpot)} <small>Sparks</small></strong></div>
    </header>
    <div className="an-toolbar">
      <div><b>{state.status==="open"?"เปิดให้เล่น":state.status==="scheduled"?"รอวันเริ่ม":
        ended?"สิ้นสุดรอบ":state.status==="not-configured"?"รอ Admin เปิดรอบ":"กำลังโหลด"}</b>
        <span>เปิดแล้ว {opened.size} / 101 หมายเลข · เลขที่เปิดแล้วจะเลือกซ้ำไม่ได้</span></div>
      <div className="an-toolbar-right">
        {cooldown>0&&state.status==="open"?<span className="an-cooldown">เปิดเลขอีกครั้งใน <Countdown until={state.cooldownUntil||0} now={now}/></span>:null}
        <button type="button" className="an-refresh" onClick={()=>void refresh()} disabled={loading}>รีเฟรช</button>
      </div>
    </div>
    {error?<div role="alert" className="an-alert an-alert--danger">{error}</div>:null}
    {notice?<div role="status" className="an-alert">{notice}</div>:null}
    {adminAccess&&username==="songpon"?<div className="an-admin">
      <div><strong>ตั้งค่าเลขนางฟ้า (Admin เท่านั้น)</strong><p>กำหนดเลขลับตั้งแต่ 0–100 แล้วกดยืนยันเปิดรอบ · เกมเริ่มเล่นได้ตั้งแต่ 6 ธันวาคม 2569 · เลขลับไม่แสดงแก่ผู้เล่น</p></div>
      {canNewRound?<div className="an-admin-controls">
        <input aria-label="เลขนางฟ้าที่กำหนดโดย Admin" type="number" min="0" max="100" placeholder="เลขลับ 0–100" value={adminNumber} onChange={e=>setAdminNumber(e.target.value)}/>
        <button type="button" onClick={()=>void start()} disabled={busy||adminNumber.trim()===""}>ยืนยันเลขและเปิดรอบ</button>
      </div>:<span className="an-admin-secret">เลขลับของรอบนี้: {state.angelNumber??"—"}</span>}
    </div>:null}
    {state.status==="not-configured"||state.status==="scheduled"?<div className="an-message">
      <AngelArt number={0}/><strong>{state.status==="scheduled"?"กิจกรรมเริ่มวันที่ 6 ธันวาคม 2569":"รอผู้ดูแลเปิดกิจกรรม"}</strong>
      <p>เกมจะเปิดเล่นตามรอบที่ Admin กำหนด ไม่มี Popup อัตโนมัติ</p></div>:null}
    {ended?<div className="an-message an-message--ended">
      <span className="an-trophy">🏆</span><strong>มีผู้พบเลขนางฟ้าแล้ว!</strong>
      <p>ผู้ชนะรอบนี้: {state.winner||"—"} · Jackpot {fmt(state.jackpot)} Sparks</p>
      <span>{state.payoutStatus==="paid"?"จ่ายรางวัลเรียบร้อยแล้ว":"กำลังรอผู้ชนะจัดสรร Jackpot"}</span>
      {mustAllocate?<button type="button" className="an-primary" onClick={()=>{setResult({hit:true,bonus:0,refund:0,jackpot:state.jackpot});}}>จัดสรร Jackpot ของฉัน</button>:null}
    </div>:null}
    <div className="an-board-header"><h3>เลือกนางฟ้าประจำหมายเลข <span>(0–100)</span></h3>
      <div className="an-board-legend"><span>✦ เลือกได้</span><span>🔒 เปิดแล้ว</span></div></div>
    <div className="an-board" role="group" aria-label="เลือกหมายเลขนางฟ้า">
      {Array.from({length:101},(_,number)=>{
        const locked=opened.has(number);
        return <button type="button" key={number} className={"an-tile an-tile--v"+number%6+(locked?" an-tile--locked":"")}
          disabled={!canPlay||locked} aria-label={"หมายเลข "+number+" "+(ANGEL_CAPTIONS[number]||"นางฟ้า")+" "+(locked?"เปิดแล้ว":"เลือกได้")}
          onClick={()=>{requestId.current="";setSelected(number);}}>
          <span className="an-tile-number">{number}</span>
          <AngelArt number={number}/>
          <span className="an-tile-caption">{ANGEL_CAPTIONS[number]||"นางฟ้าแสนสนุก"}</span>
          {locked?<span className="an-tile-locked">🔒 เปิดแล้ว</span>:null}
        </button>;
      })}
    </div>
    <p className="an-fineprint">ทุกครั้งที่ไม่เจอเลขนางฟ้า: คืนค่าเปิด 5 Sparks + ได้โบนัสสุ่ม 5–50 Sparks เข้าบัญชี พร้อมเพิ่มโบนัสที่สุ่มได้เป็นยอด Jackpot กลาง · ระบบล็อกเลขที่มีผู้เปิดแล้วสำหรับทุกคน</p>
    {loading?<div className="an-loading" role="status">กำลังโหลดสถานะรอบกิจกรรม…</div>:null}
    {selected!==null?<div className="an-overlay" role="dialog" aria-modal="true" aria-label="ยืนยันเปิดเลขนางฟ้า">
      <div className="an-dialog"><button className="an-x" type="button" disabled={busy} onClick={()=>{setSelected(null);requestId.current="";}}>×</button>
        <AngelArt number={selected} large/><h3>เปิดเลข {selected} ใช่ไหม?</h3>
        <p>{ANGEL_CAPTIONS[selected]}</p>
        <div className="an-price"><span>ค่าเปิดหมายเลข</span><strong>5 Sparks</strong></div>
        <div className="an-price"><span>Sparks ของคุณ (ล่าสุดที่โหลด)</span><strong>{fmt(balance)}</strong></div>
        <p className="an-note">หากเปิดไม่เจอ รับคืน 5 Sparks พร้อมโบนัสสุ่ม 5–50 Sparks · หากเจอเลขนางฟ้า เกมจะสิ้นสุดทันทีและคุณได้สิทธิ์ Jackpot</p>
        <div className="an-actions"><button type="button" disabled={busy} onClick={()=>setSelected(null)}>ยกเลิก</button>
          <button type="button" className="an-primary" disabled={busy||balance<5} onClick={()=>void open()}>{busy?"กำลังเปิด…":"ยืนยัน (ใช้ 5 Sparks)"}</button></div>
      </div></div>:null}
    {result?<div className="an-overlay" role="dialog" aria-modal="true" aria-label={result.hit?"พบเลขนางฟ้า":"โบนัสที่ได้รับ"}>
      <div className={"an-dialog "+(result.hit?"an-dialog--win":"an-dialog--bonus")}>
        {!result.hit?<><AngelArt number={Math.min(100,(state.picks||[]).slice(-1)[0]?.number||0)} large/>
          <h3>ยังไม่ใช่เลขนางฟ้า</h3><p>แต่คุณได้รับโบนัส!</p>
          <div className="an-win-value">+{fmt(result.bonus)} Sparks</div>
          <p>คืนค่าเปิด {fmt(result.refund)} Sparks + โบนัส {fmt(result.bonus)} Sparks · เพิ่ม Jackpot กลางอีก {fmt(result.bonus)} Sparks</p>
          <button type="button" className="an-primary" onClick={()=>setResult(null)}>กลับไปดูกระดาน</button>
        </>:<><div className="an-trophy">👼🏆</div><h3>คุณพบเลขนางฟ้า!</h3>
          <p>ยินดีด้วย คุณเป็นผู้ได้รับสิทธิ์จัดสรร Jackpot</p>
          <div className="an-win-value">{fmt(result.jackpot)} Sparks</div>
          <h4>ต้องการแบ่งโบนัสให้เพื่อนไหม?</h4>
          <div className="an-choice">
            <label><input type="radio" checked={shareChoice==="self"} onChange={()=>setShareChoice("self")}/> รับทั้งหมดเอง (100%)</label>
            <label><input type="radio" checked={shareChoice==="friends"} onChange={()=>{setShareChoice("friends");if(friends.length===0)void getFriends();}}/> แบ่งโบนัสให้เพื่อน</label>
          </div>
          {shareChoice==="friends"?<div className="an-share">
            <label>เลือกเพื่อน (สูงสุด 10 คน)
              <select value="" onChange={e=>addFriend(e.target.value)} disabled={friendsBusy||shares.length>=10}>
                <option value="">เลือก User ที่ต้องการแบ่ง</option>
                {friends.filter(f=>!shares.some(p=>p.username===f.username)).map(f=><option key={f.username} value={f.username}>{f.displayName} ({f.username})</option>)}
              </select>
            </label>
            {friendsBusy?<p>กำลังโหลดรายชื่อผู้ใช้…</p>:null}
            {shares.map(s=><div className="an-share-line" key={s.username}>
              <span>{friends.find(f=>f.username===s.username)?.displayName||s.username}</span>
              <input type="number" min="1" max="100" value={s.percent} aria-label={"เปอร์เซ็นต์ของ "+s.username}
                onChange={e=>setShares(prev=>prev.map(x=>x.username===s.username?{...x,percent:Math.max(1,Math.min(100,Math.floor(Number(e.target.value)||1)))}:x))}/>
              <span>% · {Math.floor(result.jackpot*s.percent/100)} Sparks</span>
              <button type="button" onClick={()=>setShares(prev=>prev.filter(x=>x.username!==s.username))}>ลบ</button>
            </div>)}
            <div className="an-share-total">แบ่งให้เพื่อน {totalPercent}% · คุณเก็บไว้ {100-totalPercent}% ({fmt(result.jackpot-shares.reduce((sum,s)=>sum+Math.floor(result.jackpot*s.percent/100),0))} Sparks</div>
            {totalPercent>100?<p className="an-alert an-alert--danger">เปอร์เซ็นต์รวมเกิน 100%</p>:null}
          </div>:null}
          {error?<p role="alert" className="an-alert an-alert--danger">{error}</p>:null}
          <button type="button" className="an-primary" disabled={busy||totalPercent>100} onClick={()=>void claim()}>{busy?"กำลังบันทึก…":"ยืนยันการรับ / แบ่ง Jackpot"}</button>
          <p className="an-note">เมื่อยืนยัน ระบบจะจ่ายรางวัลเข้าบัญชีผู้รับทันทีและบันทึกประวัติ สามารถกลับมาจัดสรรภายหลังได้หากปิดหน้าต่าง</p>
          <button type="button" className="an-text-btn" disabled={busy} onClick={()=>setResult(null)}>กลับไปดูกระดานก่อน</button>
        </>}
      </div></div>:null}
  </section>;
}
