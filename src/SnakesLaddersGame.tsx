import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import {fetchStoredProfilePhoto} from "./profilePhotoStore";
import {SNAKES_RULES,resolveSnakeSquare,SNAKES_BOT_ID} from "./snakesRules.js";
import "./snakesLadders.css";

type Member={username:string;displayName:string;joined:boolean;isBot?:boolean;position:number;pot:number;skips:number;shields:number;claimedAt:string;rewardedTiles:number[]};
type GameEvent={type:string;tile?:number;to?:number;delta?:number;dice?:number;from?:number;description:string;actor?:string;target?:string;at:string};
type Room={id:string;host:string;status:"lobby"|"playing"|"finished"|"cancelled";members:Member[];invited:string[];
 currentTurn:string;winner:string;event:GameEvent|null;events:GameEvent[];pendingTarget:{actor:string;type:string;tile:number}|null;
 createdAt:string;startedAt:string;finishedAt:string;lastRoll:number;yourUsername:string;updatedAt:string};
type Rules={rewardSquares:number[];ladders:Record<number,number>;snakes:Record<number,number>;traps:Record<number,string>};
type GameState={rooms:Room[];activeRoomId:string;rules:Rules};
const eventIcon:Record<string,string>={"reward":"⚡","snake":"🐍","ladder":"🪜","shield":"🛡","lose-percent":"💥",
 "lose-fixed":"💸","skip":"⌛","back-five":"↩","restart":"⤺","reset-other":"🎯","swap":"⇄","steal":"⚔","safe":"✦","finish":"🏆"};
const statusLabel:Record<string,string>={lobby:"รอผู้เล่น",playing:"กำลังเล่น",finished:"จบเกม",cancelled:"ยกเลิกแล้ว"};
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
const normalizedGameUser=(value?:string)=>String(value||"").trim().toLowerCase();
const sameGameUser=(a?:string,b?:string)=>Boolean(normalizedGameUser(a))&&normalizedGameUser(a)===normalizedGameUser(b);
const palette=["mint","sky","rose","gold","violet"];
function Avatar({user,photos,label}: {user:string;photos:Record<string,string>;label?:string}){
 if(user===SNAKES_BOT_ID||user.startsWith(SNAKES_BOT_ID+"_"))return <span className="sl-avatar sl-avatar--bot" role="img" aria-label="Sparks Bot ทดสอบ">🤖</span>;
 const image=photos[user];
 return <span className="sl-avatar" title={label||user}>{image?<img src={image} alt={label||user}/>:<span>{user.slice(0,2).toUpperCase()}</span>}</span>;
}
function DiceFace({value=5}:{value?:number}){
 const dots:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
 return <div className="sl-die" aria-label={"ทอยได้ "+value}>
   {Array.from({length:9},(_,i)=><i key={i} className={dots[value]?.includes(i)?"dot":"empty"}/>)}
 </div>;
}
function Tile({n,players,photos,currentUser,movingActor}: {n:number;players:Member[];photos:Record<string,string>;currentUser:string;movingActor?:string}){
 const rule=resolveSnakeSquare(n);
 const kind=rule.type==="reward"?"reward":rule.type==="ladder"?"ladder":rule.type==="snake"?"snake":
  n===50?"finish":["lose-percent","lose-fixed","skip","back-five","restart","reset-other","swap","steal","shield"].includes(rule.type)?"event":"normal";
 const me=players.some(p=>p.username===currentUser);
 return <div className={"sl-tile sl-tile--"+kind+(me?" sl-tile--mine":"")+(players.some(p=>p.username===movingActor)?" sl-tile--moving":"")} data-snake-tile={n} title={"ช่อง "+n+" · "+rule.description}>
   <span className="sl-tile-number">{n}</span>
   {n===50?<span className="sl-tile-symbol">🏁</span>:
      kind==="reward"?<span className="sl-tile-symbol">⚡</span>:
      kind==="event"?<span className="sl-tile-symbol">✦</span>:null}
   {players.length?<div className="sl-tile-players">{players.map((p,i)=><div className={"sl-piece sl-piece--"+palette[i%palette.length]} key={p.username} title={p.displayName+" @"+p.username}>
     <Avatar user={p.username} photos={photos} label={p.displayName}/>
     <span>{p.displayName||p.username}</span>
   </div>)}</div>:null}
 </div>;
}
function GameBoard({room,photos,username,movingActor}: {room:Room;photos:Record<string,string>;username:string;movingActor?:string}){
 return <div className="sl-board-frame">
   <div className="sl-board-head"><div><span className="sl-overline">THE GRAND BOARD · 50 TILES</span><h3>สนามบันไดงู</h3></div>
     <span className="sl-board-chip">50 ช่อง · {room.members.filter(m=>m.joined).length} ผู้เล่น</span></div>
   <div className="sl-board-scroll"><div className="sl-board-surface">
     <div className="sl-board-grid">
       {tileNumbers.map(n=><Tile key={n} n={n} players={room.members.filter(p=>p.joined&&p.position===n)} photos={photos} currentUser={username} movingActor={movingActor}/>)}
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
 const [motion,setMotion]=useState<{positions:Record<string,number>;actor:string;message:string}|null>(null);
 const [secondsToRoll,setSecondsToRoll]=useState(10);
 const [voiceEnabled,setVoiceEnabled]=useState(true);
 const [voiceMessage,setVoiceMessage]=useState("");
 const lastSpokenTurn=useRef("");
 const animationRef=useRef(0);
 const motionRoomId=useRef("");
 const [cancelConfirm,setCancelConfirm]=useState(false);
 const [photos,setPhotos]=useState<Record<string,string>>({});
 const busyRef=useRef(false),loadRef=useRef(false),nonce=useRef("");
 useEffect(()=>()=>{animationRef.current+=1;},[]);
 const room=useMemo(()=>data.rooms.find(r=>r.id===currentRoomId)||null,[data.rooms,currentRoomId]);
 const displayRoom=useMemo(()=>room&&motion&&motionRoomId.current===room.id?{...room,members:room.members.map(p=>({...p,position:motion.positions[p.username]??p.position}))}:room,[room,motion]);
 const speak=useCallback((message:string)=>{
   if(!voiceEnabled||typeof window==="undefined"||!("speechSynthesis" in window)||!("SpeechSynthesisUtterance" in window))return;
   try{
     window.speechSynthesis.cancel();
     const utterance=new SpeechSynthesisUtterance(message);
     utterance.lang="th-TH";utterance.rate=0.93;utterance.pitch=1;utterance.volume=1;
     const voices=window.speechSynthesis.getVoices();
     const thai=voices.find(v=>v.lang.toLowerCase()==="th-th")||voices.find(v=>v.lang.toLowerCase().startsWith("th"));
     if(thai)utterance.voice=thai;
     window.speechSynthesis.speak(utterance);
     setVoiceMessage(message);
   }catch{/* Voice availability depends on the browser and OS; gameplay must continue. */}
 },[voiceEnabled]);
 useEffect(()=>{
   if(!voiceEnabled&&typeof window!=="undefined"&&"speechSynthesis" in window)window.speechSynthesis.cancel();
 },[voiceEnabled]);
 useEffect(()=>()=>{if(typeof window!=="undefined"&&"speechSynthesis" in window)window.speechSynthesis.cancel();},[]);
 const sleep=(ms:number)=>new Promise<void>(resolve=>window.setTimeout(resolve,ms));
 const animateMoves=async(before:Room,after:Room,events:GameEvent[])=>{
   if(!events.length)return;
   const id=++animationRef.current;
   motionRoomId.current=after.id;
   const positions:Record<string,number>=Object.fromEntries(before.members.map(p=>[p.username,p.position]));
   const show=(actor:string,message:string)=>setMotion({positions:{...positions},actor,message});
   for(const ev of events){
     if(id!==animationRef.current)return;
     const player=after.members.find(p=>p.username===ev.actor);
     const name=player?.displayName||"ผู้เล่น";
     if(typeof ev.dice==="number"&&typeof ev.from==="number"&&typeof ev.tile==="number"){
       positions[ev.actor!]=ev.from;
       show(ev.actor||"",`${name} ทอยได้ ${ev.dice} แต้ม`);
       speak(`${name} ทอยลูกเต๋าได้ ${ev.dice} แต้ม`);
       await sleep(650);
       for(let n=ev.from+1;n<=ev.tile;n++){
         if(id!==animationRef.current)return;
         positions[ev.actor!]=n;
         show(ev.actor||"",`${name} กำลังเดิน · ช่อง ${n} / ${ev.tile}`);
         await sleep(370);
       }
       if(typeof ev.to==="number"&&ev.to!==ev.tile){
         show(ev.actor||"",`${name} ${ev.type==="snake"?"ตกงู":ev.type==="ladder"?"ขึ้นบันได":"ติดกับดัก"}! ช่อง ${ev.tile} → ${ev.to}`);
         speak(ev.type==="snake"?`${name} ตกงูจากช่อง ${ev.tile} ลงไปช่อง ${ev.to}`:ev.type==="ladder"?`${name} ขึ้นบันไดจากช่อง ${ev.tile} ไปช่อง ${ev.to}`:`${name} ติดกับดัก ต้องย้ายไปช่อง ${ev.to}`);
         await sleep(850);
         const direction=ev.to>ev.tile?1:-1;
         for(let n=ev.tile+direction;direction>0?n<=ev.to:n>=ev.to;n+=direction){
           if(id!==animationRef.current)return;
           positions[ev.actor!]=n;
           show(ev.actor||"",`${name} ${ev.type==="ladder"?"กำลังขึ้นบันได":"กำลังเลื่อนลง"} · ช่อง ${n}`);
           await sleep(230);
         }
       }
       show(ev.actor||"",`${name}: ${ev.description}`);
       if(ev.type==="reward")speak(`${name} เปิดการ์ดรางวัล ได้รับ ${Math.max(0,ev.delta||0)} สปาร์กส์`);
       else if(ev.type==="finish")speak(`จบเกมแล้ว! ${name} เป็นผู้ชนะอันดับหนึ่ง!`);
       else if(ev.type!=="snake"&&ev.type!=="ladder"&&ev.type!=="safe")speak(`${name} เปิดการ์ดเหตุการณ์ ${ev.description}`);
       await sleep(ev.type==="finish"?2800:ev.type==="safe"?750:2300);
     }else{
       if(ev.target){const target=after.members.find(p=>p.username===ev.target);if(target)positions[target.username]=target.position;}
       show(ev.actor||"",`${name}: ${ev.description}`);
       speak(`${name} ${ev.description}`);
       await sleep(2300);
     }
   }
   if(id===animationRef.current){setMotion(null);setPopup(events.find(ev=>typeof ev.dice==="number")||events[0]);}
 };
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
     const result=await call("snakes-state",{includeHistory:showLoading});
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
 useEffect(()=>{setData({rooms:[],activeRoomId:"",rules:SNAKES_RULES});setCurrentRoomId("");setPhotos({});setMotion(null);animationRef.current+=1;void refresh(true);},[refresh,username,sessionId]);
 useEffect(()=>{
   const update=()=>{if(document.visibilityState==="visible")void refresh();};
   const delay=window.setInterval(update,room?.status==="playing"?30000:60000);
   window.addEventListener("focus",update);
   document.addEventListener("visibilitychange",update);
   return()=>{window.clearInterval(delay);window.removeEventListener("focus",update);document.removeEventListener("visibilitychange",update);};
 },[refresh,room?.status]);
 const members=room?.members||[];
 const allNames=members.map(p=>p.username).join("|");
 useEffect(()=>{
   let alive=true;
   for(const name of allNames.split("|").filter(Boolean)){
     if(name===SNAKES_BOT_ID||name.startsWith(SNAKES_BOT_ID+"_"))continue;
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
       if((action==="snakes-roll"||action==="snakes-target")&&!result.alreadyApplied){
         const events:GameEvent[]=[...(result.turnEvent?[result.turnEvent]:[]),...(result.botEvents||[])];
         if(room&&events.length)void animateMoves(room,result.room,events);
         else setPopup(result.turnEvent||result.room.event);
       }
     }
     if(result.cancelled){
       setData(old=>({...old,rooms:old.rooms.filter(r=>r.id!==result.roomId),activeRoomId:""}));
       setCurrentRoomId("");setPopup(null);setMotion(null);animationRef.current+=1;setCancelConfirm(false);
     }
     if(action==="snakes-create")setTargetInput("");
     if(action==="snakes-invite")setTargetInput("");
     if(action==="snakes-claim"){window.dispatchEvent(new Event("qa:sparks-updated"));}
     if(message)setNotice(message);
     return result;
   }catch(e){setError(e instanceof Error?e.message:"ทำรายการไม่สำเร็จ");return null;}
   finally{setBusy(false);busyRef.current=false;}
 };
 const create=()=>void modify("snakes-create",{requestId:crypto.randomUUID().replace(/-/g,"")},"สร้างห้องแล้ว เชิญเพื่อนหรือเพิ่ม Bot ทดสอบได้เลย");
 const roll=async()=>{
   if(!nonce.current)nonce.current=crypto.randomUUID().replace(/-/g,"");
   const result=await modify("snakes-roll",{roomId:room?.id,requestId:nonce.current});
   if(result)nonce.current="";
 };
 const me=room?.members.find(p=>sameGameUser(p.username,username));
 const invited=room&&me&&!me.joined;
 const myTurn=room?.status==="playing"&&sameGameUser(room.currentTurn,username);
 const waitingTarget=sameGameUser(room?.pendingTarget?.actor,username);
 const myUnclaimedFinished=room?.status==="finished"&&me?.joined&&!me?.claimedAt;
 useEffect(()=>{
   if(!room||room.status!=="playing"||!room.currentTurn||motion)return;
   const turnKey=room.id+":"+room.currentTurn+":"+room.events.length+":"+room.updatedAt;
   if(lastSpokenTurn.current===turnKey)return;
   lastSpokenTurn.current=turnKey;
   const member=room.members.find(p=>p.username===room.currentTurn);
   if(member&&!member.isBot)speak(sameGameUser(member.username,username)?"ถึงตาคุณแล้ว กรุณาทอยลูกเต๋าภายในสิบวินาที":`ถึงตา ${member.displayName} ทอยลูกเต๋า`);
   else if(member?.isBot)speak(`ถึงตา ${member.displayName} บอทกำลังเล่น`);
 },[room?.id,room?.currentTurn,room?.updatedAt,Boolean(motion),voiceEnabled,username]);
 useEffect(()=>{
   setSecondsToRoll(10);
   if(!myTurn||waitingTarget||motion||busyRef.current)return;
   const expires=Date.now()+10000;
   const timer=window.setInterval(()=>{
     const next=Math.max(0,Math.ceil((expires-Date.now())/1000));
     setSecondsToRoll(next);
     if(next===0){window.clearInterval(timer);if(!busyRef.current)void roll();}
   },150);
   return()=>window.clearInterval(timer);
 },[room?.id,room?.currentTurn,room?.status,username,waitingTarget,Boolean(motion)]);
 return <section className="sl-root" aria-label="เกมบันไดงู Multiplayer" data-sparks-snakes="true">
   <div className="sl-topbar">
     <div className="sl-brand"><span className="sl-brand-flash">ϟ</span><div><span>QA <em>Sparks</em></span><small>SNAKES & LADDERS · MULTIPLAYER</small></div></div>
     <div className="sl-room-badge">🎲 บันไดงู 50 ช่อง <span>·</span> 👥 สูงสุด 5 คน (บอท 4 ตัว) <span>·</span> ดูการเดินแบบทีละช่อง</div>
     <button type="button" className="sl-voice-toggle" aria-pressed={voiceEnabled} onClick={()=>{setVoiceEnabled(v=>!v);if(!voiceEnabled)speak("เปิดเสียงบรรยายเกมแล้ว");}}>{voiceEnabled?"🔊 เสียงพูด: เปิด":"🔇 เสียงพูด: ปิด"}</button>
     <button type="button" className="sl-refresh" disabled={busy||loading} onClick={()=>void refresh(true)}>{loading?"กำลังโหลด...":"↻ รีเฟรช"}</button>
   </div>
   {error?<div className="sl-error" role="alert">{error}</div>:null}
   {notice?<div className="sl-notice" role="status">{notice}</div>:null}
   {!room?<div className="sl-lobby">
     <div className="sl-lobby-copy"><span className="sl-overline">CREATE YOUR ROOM</span><h2>บันไดงู Battle Mode</h2>
       <p>สร้างห้อง เชิญสมาชิก QA Dashboard หรือเพิ่มบอทอัตโนมัติสูงสุด 4 ตัว ผลัดกันทอยเต๋า เก็บ Sparks และเจออุปสรรคระหว่างทาง</p>
       <div className="sl-lobby-rules"><span>50 ช่อง</span><span>2–3 ผู้เล่น</span><span>รับ Sparks หลังจบเกม</span></div>
       <button className="sl-primary" disabled={busy||!username||!sessionId} onClick={create}>＋ สร้างห้องเกม</button>
     </div>
     <div className="sl-lobby-side"><h3>คำเชิญและเกมของคุณ</h3>
       {!data.rooms.length?<p>ยังไม่มีห้องเกมหรือคำเชิญ กดสร้างห้องเพื่อเริ่มเล่น</p>:
        data.rooms.map(r=><button type="button" className="sl-room-row" key={r.id} onClick={()=>setCurrentRoomId(r.id)}>
          <strong>{r.id}</strong><span>{r.members.some(p=>sameGameUser(p.username,username)&&!p.joined)?"คำเชิญรอคุณตอบรับ":statusLabel[r.status]}</span><small>{r.members.length} / 3 คน</small>
        </button>)}
     </div>
   </div>:<>
     <div className="sl-room-navigation"><div><span className="sl-overline">GAME ROOM</span><strong>{room.id}</strong><span className={"sl-status sl-status--"+room.status}>{statusLabel[room.status]}</span></div>
       <div className="sl-room-nav-actions">
          {sameGameUser(room.host,username)&&(room.status==="lobby"||room.status==="playing")?
            <button type="button" className="sl-danger-link" disabled={busy} onClick={()=>setCancelConfirm(true)}>ยกเลิกห้อง</button>:null}
          <button type="button" className="sl-link" onClick={()=>{animationRef.current+=1;setMotion(null);setCurrentRoomId("");setPopup(null);}}>ห้องของฉัน / คำเชิญ</button>
        </div>
     </div>
     <div className="sl-playercards">{room.members.filter(p=>p.joined).map((p,i)=><div className={"sl-playercard sl-playercard--"+palette[i%palette.length]+((motion?.actor===p.username||(!motion&&room.currentTurn===p.username))?" is-turn":"")} key={p.username}>
       <Avatar user={p.username} photos={photos} label={p.displayName}/>
       <div className="sl-playercard-info"><strong>{p.displayName}{p.isBot?" · BOT":""}</strong><small>{p.isBot?"เล่นอัตโนมัติ · ไม่รับ Sparks":"@"+p.username}</small>
         <div><span>ช่อง {p.position}</span><b>⚡ {p.pot.toLocaleString()} Sparks{p.isBot?" (ในเกมเท่านั้น)":""}</b></div></div>
       {motion?.actor===p.username?<span className="sl-turn-label">กำลังเดินบนกระดาน</span>:!motion&&room.currentTurn===p.username?<span className="sl-turn-label">กำลังเล่น · {sameGameUser(p.username,username)?"ตาคุณ":p.isBot?"บอทกำลังทอย":"ตาผู้เล่น"}</span>:<span className="sl-turn-wait">รอตาเล่น</span>}
       {room.winner===p.username?<span className="sl-winner">🏆 ผู้ชนะ</span>:null}
     </div>)}
       {room.members.filter(p=>!p.joined).map(p=><div className="sl-playercard sl-playercard--pending" key={p.username}>
         <Avatar user={p.username} photos={photos} label={p.displayName}/><div><strong>{p.displayName}</strong><small>รอตอบรับคำเชิญ</small></div></div>)}
     </div>
     {room.status==="lobby"?<div className="sl-invite-panel">
       <div><h3>👥 ห้องรอผู้เล่น · {room.members.filter(p=>p.joined).length} คนตอบรับแล้ว</h3>
         <p>เชิญด้วย Username ที่ใช้ Login QA Dashboard (ไม่ใช่ชื่อแสดงผล) เพื่อนเปิดหน้าเกมนี้แล้วกดตอบรับ หรือเพิ่ม Bot ทดสอบได้</p></div>
       {invited?<div className="sl-invite-actions"><button disabled={busy} className="sl-primary" onClick={()=>void modify("snakes-respond",{roomId:room.id,decision:"accept"},"เข้าร่วมเกมสำเร็จ")}>ตอบรับคำเชิญ</button>
         <button disabled={busy} className="sl-secondary" onClick={()=>void modify("snakes-respond",{roomId:room.id,decision:"decline"},"ปฏิเสธคำเชิญแล้ว")}>ปฏิเสธ</button></div>:null}
       {sameGameUser(room.host,username)?<div className="sl-invite-actions">
         <label className="sl-invite-label">เชิญเพื่อนด้วย Username
            <input value={targetInput} maxLength={100} onChange={e=>setTargetInput(e.target.value)} placeholder="Username ที่ใช้ Login"/>
            <small>ให้เพื่อนเปิด Mini Games และกดตอบรับคำเชิญ</small>
          </label>
         <button disabled={busy||room.members.length>=5||!targetInput.trim()} className="sl-secondary" onClick={()=>void modify("snakes-invite",{roomId:room.id,targetUsername:targetInput.trim()},"ส่งคำเชิญแล้ว ให้เพื่อนเปิด Mini Games และกดตอบรับ")}>ส่งคำเชิญ</button>
         <button type="button" data-snakes-add-bot="true" disabled={busy||room.members.length>=5||room.members.filter(p=>p.isBot).length>=4}
            className="sl-bot-button" onClick={()=>void modify("snakes-add-bot",{roomId:room.id},"เพิ่ม Sparks Bot แล้ว Bot จะทอยอัตโนมัติเมื่อถึงตา")}>🤖 เพิ่ม Bot ({room.members.filter(p=>p.isBot).length}/4)</button>
          <button disabled={busy||room.members.filter(p=>p.joined).length<2||room.members.some(p=>!p.joined)} className="sl-primary" onClick={()=>void modify("snakes-start",{roomId:room.id},"เริ่มเกมแล้ว!")}>เริ่มเกม</button>
       </div>:null}
     </div>:null}
     {room.status!=="lobby"?<div className="sl-layout">
       <GameBoard room={displayRoom||room} photos={photos} username={username} movingActor={motion?.actor}/>
       <div className="sl-sidebar">
         <div className="sl-dice-panel">{motion?<div className="sl-movement-notice" role="status"><span>🎲 กำลังเดินบนกระดาน</span><strong>{motion.message}</strong></div>:null}<span className="sl-overline">YOUR NEXT MOVE</span><h3>{room.status==="finished"?"เกมจบแล้ว":myTurn?"ถึงตาคุณแล้ว":"รอผู้เล่นคนอื่น"}</h3>
           {myTurn&&!waitingTarget&&!motion?<div className="sl-roll-countdown" role="timer"><span>ทอยภายใน 10 วินาที</span><strong>{secondsToRoll}</strong><small>หากไม่กด ระบบจะทอยให้อัตโนมัติ</small></div>:null}
           <div className="sl-dice-display"><DiceFace value={room.lastRoll||5}/><div><small>ผลทอยล่าสุด</small><b>{room.lastRoll||"–"}</b></div></div>
           {room.status==="playing"?
             waitingTarget?<p className="sl-small">เลือกคู่แข่งในรายการด้านล่างเพื่อใช้พลังพิเศษ</p>:
             <button className="sl-roll" type="button" disabled={!myTurn||busy||!!motion} onClick={()=>void roll()}>🎲 {busy?"กำลังทอย...":myTurn?"ทอยลูกเต๋า":"ยังไม่ถึงตาคุณ"}</button>:
             <span className="sl-game-finished">🏁 เส้นชัยช่อง 50</span>}
           {room.pendingTarget&&waitingTarget?<div className="sl-target"><h4>เลือกเป้าหมาย</h4>
             {room.members.filter(p=>p.joined&&!sameGameUser(p.username,username)).map(p=><button key={p.username} disabled={busy}
               onClick={()=>void modify("snakes-target",{roomId:room.id,targetUsername:p.username})}>
               <Avatar user={p.username} photos={photos} label={p.displayName}/>{p.displayName}{p.shields?" 🛡":""}
             </button>)}
           </div>:null}
           {room.status==="playing"&&!sameGameUser(room.currentTurn,username)?<p className="sl-small">{room.members.some(p=>p.username===room.currentTurn&&p.isBot)?"Bot ทอยอัตโนมัติเมื่อถึงตา":"ตำแหน่งและ Game Pot บันทึกไว้ กลับมาเล่นต่อภายหลังได้"}</p>:null}
         </div>
         <div className="sl-pot-panel"><div className="sl-pot-head"><span>⚡ Game Pot</span><span className="sl-pot-lock">🔒 รอจบเกม</span></div>
           <strong>{(me?.pot||0).toLocaleString()} <small>Sparks</small></strong>
           <p>สะสมระหว่างเกม อุปสรรคหักได้เฉพาะ Game Pot ของเกมนี้</p>
           {room.status==="finished"?
             <><div className="sl-pot-winner">{sameGameUser(room.winner,username)?"🏆 คุณเข้าเส้นชัยเป็นคนแรก!":"🏁 เกมจบแล้ว ผู้เล่นทุกคนรับ Game Pot ของตัวเองได้"}</div>
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
   {cancelConfirm&&room?<div className="sl-popup-backdrop" role="presentation">
      <section className="sl-popup sl-cancel-popup" role="dialog" aria-modal="true" aria-label="ยืนยันยกเลิกห้อง">
        <div className="sl-popup-icon">⚠️</div><h2>ยกเลิกห้อง {room.id}?</h2>
        <p>ระบบจะนำห้องออกจากรายการที่เล่นได้ โดยเก็บประวัติไว้ ไม่ลบข้อมูลคะแนนย้อนหลัง</p>
        {room.status==="playing"?<p className="sl-cancel-warning">หากยุติเกมตอนนี้ Game Pot ในห้องนี้จะไม่สามารถกดรับ Sparks ได้</p>:null}
        <div className="sl-cancel-actions">
          <button type="button" className="sl-secondary" disabled={busy} onClick={()=>setCancelConfirm(false)}>กลับไปเล่น</button>
          <button type="button" data-snakes-cancel-confirm="true" className="sl-danger-button" disabled={busy}
            onClick={()=>void modify("snakes-cancel",{roomId:room.id},"ยกเลิกห้องแล้ว สามารถสร้างห้องใหม่ได้")}>
            {busy?"กำลังยกเลิก...":"ยืนยันยกเลิกห้อง"}</button>
        </div>
      </section>
   </div>:null}
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
   <div className="sl-footer">เกมไม่จำกัดระยะเวลา · ตาของคุณมีเวลาทอย 10 วินาทีขณะเปิดเกม · Sparks เข้าบัญชีหลังเกมจบและกดรับเท่านั้น</div>
 </section>;
}
