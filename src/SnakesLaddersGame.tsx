import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import {fetchStoredProfilePhoto} from "./profilePhotoStore";
import {SNAKES_RULES,resolveSnakeSquare} from "../server/snakesLaddersService.js";
import "./snakesLadders.css";

type Member={username:string;displayName:string;joined:boolean;position:number;pot:number;skips:number;shields:number;claimedAt:string;rewardedTiles:number[]};
type GameEvent={type:string;tile?:number;to?:number;delta?:number;dice?:number;from?:number;description:string;actor?:string;target?:string;at:string};
type Room={id:string;host:string;status:"lobby"|"playing"|"finished";members:Member[];invited:string[];
 currentTurn:string;winner:string;event:GameEvent|null;events:GameEvent[];pendingTarget:{actor:string;type:string;tile:number}|null;
 createdAt:string;startedAt:string;finishedAt:string;lastRoll:number;yourUsername:string;updatedAt:string};
type Rules={rewardSquares:number[];ladders:Record<number,number>;snakes:Record<number,number>;traps:Record<number,string>};
type GameState={rooms:Room[];activeRoomId:string;rules:Rules};
const eventIcon:Record<string,string>={"reward":"⚡","snake":"🐍","ladder":"🪜","shield":"🛡","lose-percent":"💥",
 "lose-fixed":"💸","skip":"⌛","back-five":"↩","restart":"⤺","reset-other":"🎯","swap":"⇄","steal":"⚔","safe":"✦","finish":"🏆"};
const statusLabel:Record<string,string>={lobby:"รอผู้เล่น",playing:"กำลังเล่น",finished:"จบเกม"};
const rewardSquares=new Set(SNAKES_RULES.rewardSquares);
const ladderEntries=Object.entries(SNAKES_RULES.ladders).map(([a,b])=>[+a,b] as [number,number]);
const snakeEntries=Object.entries(SNAKES_RULES.snakes).map(([a,b])=>[+a,b] as [number,number]);
const tileNumbers=Array.from({length:50},(_,i)=>{
 const row=Math.floor(i/10),bucket=4-row;
 return bucket*10+(bucket%2===0?10-i%10:i%10+1);
});
function coords(n:number){const group=Math.floor((n-1)/10),offset=(n-1)%10;return {x:(group%2===0?9-offset:offset)*100+50,y:(4-group)*100+50};}
function BoardArtwork(){
 const ladder=(a:number,b:number)=>{
   const from=coords(a),to=coords(b);const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1,side={x:-dy/length*14,y:dx/length*14};
   const p=(t:number,sign:number)=>({x:from.x+dx*t+side.x*sign,y:from.y+dy*t+side.y*sign});
   const start1=p(0,-1),end1=p(1,-1),start2=p(0,1),end2=p(1,1);
   return <g key={"ladder"+a} className="sl-ladder-art" strokeLinecap="round">
     <line x1={start1.x} y1={start1.y} x2={end1.x} y2={end1.y} stroke="#1c4930" strokeWidth="13"/>
     <line x1={start2.x} y1={start2.y} x2={end2.x} y2={end2.y} stroke="#1c4930" strokeWidth="13"/>
     <line x1={start1.x} y1={start1.y} x2={end1.x} y2={end1.y} stroke="url(#sl-wood)" strokeWidth="8"/>
     <line x1={start2.x} y1={start2.y} x2={end2.x} y2={end2.y} stroke="url(#sl-wood)" strokeWidth="8"/>
     {[.13,.25,.37,.49,.61,.73,.85].map(t=>{const left=p(t,-1),right=p(t,1);return <line key={t} x1={left.x} y1={left.y} x2={right.x} y2={right.y} stroke="#d5fba0" strokeWidth="6"/>;})}
   </g>;
 };
 const snake=(a:number,b:number)=>{
   const start=coords(a),end=coords(b),midX=(start.x+end.x)/2,midY=(start.y+end.y)/2;
   const dx=end.x-start.x,dy=end.y-start.y;
   const side=Math.sign(dx||1)*34;
   const path="M "+start.x+" "+start.y+" C "+(midX+side)+" "+(start.y+48)+", "+(midX-side)+" "+(end.y-48)+", "+end.x+" "+end.y;
   return <g key={"snake"+a} className="sl-snake-art">
     <path d={path} fill="none" stroke="#1a0915" strokeWidth="24" strokeLinecap="round"/>
     <path d={path} fill="none" stroke="url(#sl-snake)" strokeWidth="18" strokeLinecap="round"/>
     <path d={path} fill="none" stroke="#ffc6bf" strokeOpacity=".42" strokeWidth="5" strokeDasharray="6 12" strokeLinecap="round"/>
     <ellipse cx={start.x} cy={start.y} rx="15" ry="12" fill="#d74351" stroke="#ff7a77" strokeWidth="2"/>
     <circle cx={start.x-6} cy={start.y-4} r="2.5" fill="#ffeebc"/>
     <circle cx={start.x+6} cy={start.y-4} r="2.5" fill="#ffeebc"/>
     <path d={"M "+start.x+" "+(start.y+10)+" l -3 11 m3 -11 l 4 11"} stroke="#ff8694" strokeWidth="2" fill="none"/>
   </g>;
 };
 return <svg className="sl-board-art" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
   <defs>
     <linearGradient id="sl-snake" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#ff9999"/><stop offset=".5" stopColor="#d54657"/><stop offset="1" stopColor="#8d2541"/></linearGradient>
     <linearGradient id="sl-wood" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#e0ff94"/><stop offset=".6" stopColor="#64d29c"/><stop offset="1" stopColor="#169d67"/></linearGradient>
   </defs>
   {ladderEntries.map(([a,b])=>ladder(a,b))}
   {snakeEntries.map(([a,b])=>snake(a,b))}
 </svg>;
}
const palette=["mint","sky","rose"];
function Avatar({user,photos,label}: {user:string;photos:Record<string,string>;label?:string}){
 const image=photos[user];
 return <span className="sl-avatar" title={label||user}>{image?<img src={image} alt={label||user}/>:<span>{user.slice(0,2).toUpperCase()}</span>}</span>;
}
function DiceFace({value=5}:{value?:number}){
 const dots:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
 return <div className="sl-die" aria-label={"ทอยได้ "+value}>
   {Array.from({length:9},(_,i)=><i key={i} className={dots[value]?.includes(i)?"dot":"empty"}/>)}
 </div>;
}
function Tile({n,players,photos,currentUser}: {n:number;players:Member[];photos:Record<string,string>;currentUser:string}){
 const rule=resolveSnakeSquare(n);
 const kind=rule.type==="reward"?"reward":rule.type==="ladder"?"ladder":rule.type==="snake"?"snake":
  n===50?"finish":["lose-percent","lose-fixed","skip","back-five","restart","reset-other","swap","steal","shield"].includes(rule.type)?"event":"normal";
 const me=players.some(p=>p.username===currentUser);
 return <div className={"sl-tile sl-tile--"+kind+(me?" sl-tile--mine":"")} data-snake-tile={n} title={"ช่อง "+n+" · "+rule.description}>
   <span className="sl-tile-number">{n}</span>
   {n===50?<span className="sl-tile-symbol">🏁</span>:
      kind==="reward"?<span className="sl-tile-symbol">⚡</span>:
      kind==="event"?<span className="sl-tile-symbol">✦</span>:null}
   {players.length?<div className="sl-tile-players">{players.map((p,i)=><div className={"sl-piece sl-piece--"+palette[i%3]} key={p.username} title={p.displayName+" @"+p.username}>
     <Avatar user={p.username} photos={photos} label={p.displayName}/>
     <span>{p.displayName||p.username}</span>
   </div>)}</div>:null}
 </div>;
}
function GameBoard({room,photos,username}: {room:Room;photos:Record<string,string>;username:string}){
 return <div className="sl-board-frame">
   <div className="sl-board-head"><div><span className="sl-overline">THE GRAND BOARD · 50 TILES</span><h3>สนามบันไดงู</h3></div>
     <span className="sl-board-chip">50 ช่อง · {room.members.filter(m=>m.joined).length} ผู้เล่น</span></div>
   <div className="sl-board-scroll"><div className="sl-board-surface">
     <div className="sl-board-grid">
       {tileNumbers.map(n=><Tile key={n} n={n} players={room.members.filter(p=>p.joined&&p.position===n)} photos={photos} currentUser={username}/>)}
     </div>
     <BoardArtwork/>
   </div></div>
   <div className="sl-legend"><span>ความหมายของช่อง</span>
     <b>⚡ Sparks</b><b>🪜 บันได</b><b>🐍 งู</b><b>✦ อุปสรรค</b><b>🏁 เส้นชัย</b>
   </div>
 </div>;
}
export default function SnakesLaddersGame({username,sessionId}: {username:string;sessionId:string}){
 const [data,setData]=useState<GameState>({rooms:[],activeRoomId:"",rules:SNAKES_RULES});
 const [currentRoomId,setCurrentRoomId]=useState("");
 const [targetInput,setTargetInput]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [popup,setPopup]=useState<GameEvent|null>(null);
 const [photos,setPhotos]=useState<Record<string,string>>({});
 const busyRef=useRef(false),loadRef=useRef(false),nonce=useRef("");
 const room=useMemo(()=>data.rooms.find(r=>r.id===currentRoomId)||null,[data.rooms,currentRoomId]);
 const call=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
   const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),25000);
   try{
     const response=await fetch("/api/sparks-admin",{method:"POST",cache:"no-store",headers:{"content-type":"application/json"},
       signal:controller.signal,body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
     const body=await response.json().catch(()=>({}));
     if(!response.ok)throw Error(String(body.error||"ไม่สามารถเชื่อมต่อเกมได้"));
     return body;
   }catch(e){
     if(e instanceof Error&&e.name==="AbortError")throw Error("เซิร์ฟเวอร์ตอบช้า กรุณากดรีเฟรชสถานะก่อนทำรายการซ้ำ");
     throw e;
   }finally{window.clearTimeout(timer);}
 },[username,sessionId]);
 const refresh=useCallback(async(showLoading=false)=>{
   if(!username||!sessionId||loadRef.current||busyRef.current)return;
   loadRef.current=true;
   if(showLoading)setLoading(true);
   try{
     const result=await call("snakes-state");
     setData(result);
     setCurrentRoomId(current=>{
       if(result.rooms.some((r:Room)=>r.id===current))return current;
       const active=result.rooms.find((r:Room)=>r.id===result.activeRoomId&&r.status!=="finished");
       return active?.id||result.rooms.find((r:Room)=>r.status==="playing"||r.status==="lobby")?.id||"";
     });
     if(showLoading){setError("");setNotice("");}
   }catch(e){if(showLoading)setError(e instanceof Error?e.message:"โหลดห้องไม่สำเร็จ");}
   finally{loadRef.current=false;setLoading(false);}
 },[call,username,sessionId]);
 useEffect(()=>{setData({rooms:[],activeRoomId:"",rules:SNAKES_RULES});setCurrentRoomId("");setPhotos({});void refresh(true);},[refresh,username,sessionId]);
 useEffect(()=>{
   const update=()=>{if(document.visibilityState==="visible")void refresh();};
   const delay=window.setInterval(update,room?.status==="playing"?15000:30000);
   window.addEventListener("focus",update);
   document.addEventListener("visibilitychange",update);
   return()=>{window.clearInterval(delay);window.removeEventListener("focus",update);document.removeEventListener("visibilitychange",update);};
 },[refresh,room?.status]);
 const members=room?.members||[];
 const allNames=members.map(p=>p.username).join("|");
 useEffect(()=>{
   let alive=true;
   for(const name of allNames.split("|").filter(Boolean)){
     if(Object.prototype.hasOwnProperty.call(photos,name))continue;
     void fetchStoredProfilePhoto(name).then(photo=>{
       if(!alive)return;
       const url=String(photo?.photoDataUrl||"");
       setPhotos(old=>({...old,[name]:/^data:image\/(?:png|jpeg|webp);base64,/i.test(url)?url:""}));
     }).catch(()=>{if(alive)setPhotos(old=>({...old,[name]:""}));});
   }
   return()=>{alive=false;};
 },[allNames,photos]);
 const modify=async(action:string,payload:Record<string,unknown>={},message="")=>{
   if(busyRef.current)return null;
   busyRef.current=true;setBusy(true);setError("");setNotice("");
   try{
     const result=await call(action,payload);
     if(result.room){
       setData(old=>({...old,rooms:[result.room,...old.rooms.filter(r=>r.id!==result.room.id)]}));
       setCurrentRoomId(result.room.id);
       if((action==="snakes-roll"||action==="snakes-target")&&!result.alreadyApplied)setPopup(result.room.event);
     }
     if(action==="snakes-create")setTargetInput("");
     if(action==="snakes-invite")setTargetInput("");
     if(action==="snakes-claim"){window.dispatchEvent(new Event("qa:sparks-updated"));}
     if(message)setNotice(message);
     return result;
   }catch(e){setError(e instanceof Error?e.message:"ทำรายการไม่สำเร็จ");return null;}
   finally{setBusy(false);busyRef.current=false;}
 };
 const create=()=>void modify("snakes-create",{requestId:crypto.randomUUID().replace(/-/g,"")},"สร้างห้องแล้ว เชิญเพื่อนเข้าร่วมได้เลย");
 const roll=async()=>{
   if(!nonce.current)nonce.current=crypto.randomUUID().replace(/-/g,"");
   const result=await modify("snakes-roll",{roomId:room?.id,requestId:nonce.current});
   if(result)nonce.current="";
 };
 const me=room?.members.find(p=>p.username===username);
 const invited=room&&me&&!me.joined;
 const myTurn=room?.status==="playing"&&room.currentTurn===username;
 const waitingTarget=room?.pendingTarget?.actor===username;
 const myUnclaimedFinished=room?.status==="finished"&&me?.joined&&!me?.claimedAt;
 return <section className="sl-root" aria-label="เกมบันไดงู Multiplayer" data-sparks-snakes="true">
   <div className="sl-topbar">
     <div className="sl-brand"><span className="sl-brand-flash">ϟ</span><div><span>QA <em>Sparks</em></span><small>SNAKES & LADDERS · MULTIPLAYER</small></div></div>
     <div className="sl-room-badge">🎲 บันไดงู 50 ช่อง <span>·</span> 👥 สูงสุด 3 คน <span>·</span> ไม่จำกัดเวลา</div>
     <button type="button" className="sl-refresh" disabled={busy||loading} onClick={()=>void refresh(true)}>{loading?"กำลังโหลด...":"↻ รีเฟรช"}</button>
   </div>
   {error?<div className="sl-error" role="alert">{error}</div>:null}
   {notice?<div className="sl-notice" role="status">{notice}</div>:null}
   {!room?<div className="sl-lobby">
     <div className="sl-lobby-copy"><span className="sl-overline">CREATE YOUR ROOM</span><h2>บันไดงู Battle Mode</h2>
       <p>สร้างห้อง เชิญสมาชิก QA Dashboard อีก 1–2 คน ผลัดกันทอยเต๋า เก็บ Sparks และเจออุปสรรคระหว่างทาง</p>
       <div className="sl-lobby-rules"><span>50 ช่อง</span><span>2–3 ผู้เล่น</span><span>รับ Sparks หลังจบเกม</span></div>
       <button className="sl-primary" disabled={busy||!username||!sessionId} onClick={create}>＋ สร้างห้องเกม</button>
     </div>
     <div className="sl-lobby-side"><h3>คำเชิญและเกมของคุณ</h3>
       {!data.rooms.length?<p>ยังไม่มีห้องเกมหรือคำเชิญ กดสร้างห้องเพื่อเริ่มเล่น</p>:
        data.rooms.map(r=><button type="button" className="sl-room-row" key={r.id} onClick={()=>setCurrentRoomId(r.id)}>
          <strong>{r.id}</strong><span>{statusLabel[r.status]}</span><small>{r.members.length} / 3 คน</small>
        </button>)}
     </div>
   </div>:<>
     <div className="sl-room-navigation"><div><span className="sl-overline">GAME ROOM</span><strong>{room.id}</strong><span className={"sl-status sl-status--"+room.status}>{statusLabel[room.status]}</span></div>
       <button type="button" className="sl-link" onClick={()=>{setCurrentRoomId("");setPopup(null);}}>ห้องของฉัน / คำเชิญ</button>
     </div>
     <div className="sl-playercards">{room.members.filter(p=>p.joined).map((p,i)=><div className={"sl-playercard sl-playercard--"+palette[i%3]+(room.currentTurn===p.username?" is-turn":"")} key={p.username}>
       <Avatar user={p.username} photos={photos} label={p.displayName}/>
       <div className="sl-playercard-info"><strong>{p.displayName}</strong><small>@{p.username}</small>
         <div><span>ช่อง {p.position}</span><b>⚡ {p.pot.toLocaleString()} Sparks</b></div></div>
       {room.currentTurn===p.username?<span className="sl-turn-label">ถึงตา{p.username===username?"คุณ":"ผู้เล่น"}</span>:null}
       {room.winner===p.username?<span className="sl-winner">🏆 ผู้ชนะ</span>:null}
     </div>)}
       {room.members.filter(p=>!p.joined).map(p=><div className="sl-playercard sl-playercard--pending" key={p.username}>
         <Avatar user={p.username} photos={photos} label={p.displayName}/><div><strong>{p.displayName}</strong><small>รอตอบรับคำเชิญ</small></div></div>)}
     </div>
     {room.status==="lobby"?<div className="sl-invite-panel">
       <div><h3>👥 ห้องรอผู้เล่น · {room.members.filter(p=>p.joined).length} คนตอบรับแล้ว</h3>
         <p>เจ้าของห้องเชิญได้สูงสุด 2 คน สมาชิกที่ถูกเชิญต้องตอบรับก่อนเริ่มเกม</p></div>
       {invited?<div className="sl-invite-actions"><button disabled={busy} className="sl-primary" onClick={()=>void modify("snakes-respond",{roomId:room.id,decision:"accept"},"เข้าร่วมเกมสำเร็จ")}>ตอบรับคำเชิญ</button>
         <button disabled={busy} className="sl-secondary" onClick={()=>void modify("snakes-respond",{roomId:room.id,decision:"decline"},"ปฏิเสธคำเชิญแล้ว")}>ปฏิเสธ</button></div>:null}
       {room.host===username?<div className="sl-invite-actions">
         <label className="sl-invite-label">Username ที่ต้องการเชิญ<input value={targetInput} maxLength={100} onChange={e=>setTargetInput(e.target.value)} placeholder="กรอก Username ของเพื่อน"/></label>
         <button disabled={busy||room.members.length>=3||!targetInput.trim()} className="sl-secondary" onClick={()=>void modify("snakes-invite",{roomId:room.id,targetUsername:targetInput.trim()},"ส่งคำเชิญเรียบร้อยแล้ว")}>ส่งคำเชิญ</button>
         <button disabled={busy||room.members.filter(p=>p.joined).length<2||room.members.some(p=>!p.joined)} className="sl-primary" onClick={()=>void modify("snakes-start",{roomId:room.id},"เริ่มเกมแล้ว!")}>เริ่มเกม</button>
       </div>:null}
     </div>:null}
     {room.status!=="lobby"?<div className="sl-layout">
       <GameBoard room={room} photos={photos} username={username}/>
       <div className="sl-sidebar">
         <div className="sl-dice-panel"><span className="sl-overline">YOUR NEXT MOVE</span><h3>{room.status==="finished"?"เกมจบแล้ว":myTurn?"ถึงตาคุณแล้ว":"รอผู้เล่นคนอื่น"}</h3>
           <div className="sl-dice-display"><DiceFace value={room.lastRoll||5}/><div><small>ผลทอยล่าสุด</small><b>{room.lastRoll||"–"}</b></div></div>
           {room.status==="playing"?
             waitingTarget?<p className="sl-small">เลือกคู่แข่งในรายการด้านล่างเพื่อใช้พลังพิเศษ</p>:
             <button className="sl-roll" type="button" disabled={!myTurn||busy} onClick={()=>void roll()}>🎲 {busy?"กำลังทอย...":myTurn?"ทอยลูกเต๋า":"ยังไม่ถึงตาคุณ"}</button>:
             <span className="sl-game-finished">🏁 เส้นชัยช่อง 50</span>}
           {room.pendingTarget&&waitingTarget?<div className="sl-target"><h4>เลือกเป้าหมาย</h4>
             {room.members.filter(p=>p.joined&&p.username!==username).map(p=><button key={p.username} disabled={busy}
               onClick={()=>void modify("snakes-target",{roomId:room.id,targetUsername:p.username})}>
               <Avatar user={p.username} photos={photos} label={p.displayName}/>{p.displayName}{p.shields?" 🛡":""}
             </button>)}
           </div>:null}
           {room.status==="playing"&&room.currentTurn!==username?<p className="sl-small">ตำแหน่งและ Game Pot บันทึกไว้ กลับมาเล่นต่อภายหลังได้</p>:null}
         </div>
         <div className="sl-pot-panel"><div className="sl-pot-head"><span>⚡ Game Pot</span><span className="sl-pot-lock">🔒 รอจบเกม</span></div>
           <strong>{(me?.pot||0).toLocaleString()} <small>Sparks</small></strong>
           <p>สะสมระหว่างเกม อุปสรรคหักได้เฉพาะ Game Pot ของเกมนี้</p>
           {room.status==="finished"?
             <><div className="sl-pot-winner">{room.winner===username?"🏆 คุณเข้าเส้นชัยเป็นคนแรก!":"🏁 เกมจบแล้ว ผู้เล่นทุกคนรับ Game Pot ของตัวเองได้"}</div>
               <button className="sl-claim" type="button" disabled={busy||!myUnclaimedFinished}
                 onClick={()=>void modify("snakes-claim",{roomId:room.id},"รับ Sparks เข้าบัญชี QA Sparks แล้ว")}>
                 {me?.claimedAt?"✓ รับ Sparks แล้ว":busy?"กำลังบันทึก...":"รับ "+(me?.pot||0).toLocaleString()+" Sparks"}
               </button></>:
             <button className="sl-claim" type="button" disabled>รับ Sparks หลังจบเกม</button>}
         </div>
         <div className="sl-events-panel"><h4>เหตุการณ์ล่าสุด</h4>
           {room.events.slice(-6).reverse().map((e,i)=><div className="sl-event-line" key={i}>
             <span>{eventIcon[e.type]||"✦"}</span>
             <div><strong>{room.members.find(p=>p.username===e.actor)?.displayName||"ระบบ"}</strong><small>{e.description}</small></div>
           </div>)}
         </div>
       </div>
     </div>:null}
   </>}
   {popup?<div className="sl-popup-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setPopup(null);}}>
     <section className="sl-popup" role="dialog" aria-modal="true" aria-label="ผลการทอยเต๋า">
       <div className="sl-popup-icon">{eventIcon[popup.type]||"✦"}</div>
       <span className="sl-overline">GAME EVENT · ช่อง {popup.tile||"–"}</span>
       <h2>{popup.type==="reward"&&popup.delta&&popup.delta>0?"พบหีบ Sparks!":"เหตุการณ์บนกระดาน"}</h2>
       {typeof popup.dice==="number"?<p>ทอยลูกเต๋าได้ {popup.dice} แต้ม</p>:null}
       <strong className={"sl-popup-points"+(popup.delta&&popup.delta<0?" negative":"")}>{popup.delta?(popup.delta>0?"+":"")+popup.delta+" Sparks":popup.description}</strong>
       <p>{popup.delta?"จำนวน Sparks นี้อยู่ใน Game Pot เท่านั้น รับเข้าบัญชีหลังเกมจบ":popup.description}</p>
       <button className="sl-primary" type="button" onClick={()=>setPopup(null)}>ตกลง · กลับไปที่เกม</button>
     </section>
   </div>:null}
   <div className="sl-footer">เกมนี้ไม่มีเวลาจำกัด · แต่ละคนผลัดกันทอย · Sparks เข้าบัญชีจริงเมื่อเกมจบและกดรับเท่านั้น</div>
 </section>;
}
