import React,{useCallback,useEffect,useMemo,useRef,useState} from "react";
import "./fifteenPuzzleGame.css";
type Round={roundId:string;board:number[];startedAt:number};
type Result={roundId:string;won:boolean;moves:number;elapsedMs:number;base:number;fast:number;rankBonus:number;rank:number|null;earned:number;balanceAfter:number};
type Rank={username:string;displayName:string;elapsedMs:number;moves:number;achievedAt:string};
type Stats={dailyWins:number;won:number;best:Rank|null;active:boolean;highestAwardedRank:number|null};
const GOAL=Array.from({length:15},(_,i)=>i+1).concat(0);
const REWARDS=[150,120,100,80,50];
const duration=(ms:number)=>{const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");};
function neighbors(blank:number){const r=Math.floor(blank/4),c=blank%4;return [r>0?blank-4:-1,r<3?blank+4:-1,c>0?blank-1:-1,c<3?blank+1:-1].filter(n=>n>=0);}
function validBoard(b:unknown):b is number[]{return Array.isArray(b)&&b.length===16&&b.slice().sort((a,b)=>a-b).every((n,i)=>n===i);}
export default function FifteenPuzzleGame({username,sessionId}:{username:string;sessionId:string}){
 const [tiles,setTiles]=useState<number[]>(GOAL),[moves,setMoves]=useState(0),[trace,setTrace]=useState<number[]>([]);
 const [phase,setPhase]=useState<"ready"|"playing"|"saving"|"won">("ready"),[elapsed,setElapsed]=useState(0),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[result,setResult]=useState<Result|null>(null);
 const [stats,setStats]=useState<Stats|null>(null),[leaderboard,setLeaderboard]=useState<Rank[]>([]);
 const round=useRef<Round|null>(null),movesRef=useRef<number[]>([]),requestId=useRef("");
 const call=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
  const response=await fetch("/api/sparks-admin",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
  const json=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(json.error||"ไม่สามารถเชื่อมต่อ QA Sparks ได้"));
  return json;
 },[username,sessionId]);
 const refresh=useCallback(async()=>{try{const data=await call("puzzle15-data");setStats(data.stats);setLeaderboard(data.leaderboard||[]);}catch(e){setError(e instanceof Error?e.message:"โหลดข้อมูลไม่สำเร็จ");}},[call]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{if(phase!=="playing"||!round.current)return;const id=window.setInterval(()=>setElapsed(Date.now()-(round.current?.startedAt||Date.now())),100);return()=>window.clearInterval(id);},[phase]);
 const allowed=useMemo(()=>neighbors(tiles.indexOf(0)),[tiles]);
 const begin=async()=>{
  if(busy||phase==="saving")return;
  if(phase==="playing"&&!window.confirm("ต้องการเริ่มเกมใหม่หรือไม่? ค่าเข้าเกมเดิม 1 Spark จะไม่คืน และเกมใหม่จะหักอีก 1 Spark"))return;
  setBusy(true);setError("");setNotice("");setResult(null);
  if(!requestId.current)requestId.current=crypto.randomUUID();
  try{
   const data=await call("puzzle15-start",{requestId:requestId.current});
   if(!validBoard(data.board)||typeof data.roundId!=="string"||!Number.isSafeInteger(data.startedAt))throw new Error("ข้อมูลกระดานผิดพลาด กรุณาโหลดหน้าใหม่");
   round.current={roundId:data.roundId,board:data.board,startedAt:data.startedAt};
   movesRef.current=[];setTrace([]);setMoves(0);setElapsed(0);setTiles([...data.board]);setPhase("playing");setStats(data.stats||null);
   requestId.current="";window.dispatchEvent(new Event("qa:sparks-updated"));
  }catch(e){setError(e instanceof Error?e.message:"เริ่มเกมไม่สำเร็จ");}
  finally{setBusy(false);}
 };
 const finish=async(steps:number[])=>{
  if(!round.current)return;setPhase("saving");setBusy(true);
  try{const data=await call("puzzle15-finish",{roundId:round.current.roundId,trace:steps});
   setResult(data.result);setStats(data.stats);setLeaderboard(data.leaderboard||[]);setPhase("won");
   round.current=null;window.dispatchEvent(new Event("qa:sparks-updated"));
  }catch(e){setError(e instanceof Error?e.message:"บันทึกผลไม่สำเร็จ");setPhase("playing");}
  finally{setBusy(false);}
 };
 const slide=(i:number)=>{
  if(phase!=="playing"||busy||!allowed.includes(i))return;
  const a=[...tiles],z=a.indexOf(0);[a[z],a[i]]=[a[i],a[z]];
  const steps=[...movesRef.current,i];movesRef.current=steps;setTrace(steps);setMoves(steps.length);setTiles(a);
  if(a.every((n,j)=>n===GOAL[j]))void finish(steps);
 };
 const exit=()=>{if(phase==="saving")return;if(phase==="playing"&&!window.confirm("ออกจากเกมตอนนี้จะไม่ได้รับรางวัลและไม่คืนค่าเข้า 1 Spark ยืนยันออกจากเกมหรือไม่?"))return;
  round.current=null;movesRef.current=[];setTiles(GOAL);setMoves(0);setTrace([]);setElapsed(0);setResult(null);setPhase("ready");setNotice("ออกจากเกมแล้ว ไม่ตัดสิทธิ์รับรางวัลประจำวัน แต่ค่าเข้าเดิมไม่คืน");};
 const claimed=stats?.dailyWins||0;
 return <section className="fifteen-game" aria-label="15-Puzzle เกมเลื่อนตัวเลข" data-fifteen-live="true">
  <header className="fifteen-head"><span className="fifteen-eyebrow">QA SPARKS · MINI GAMES</span><h2>✦ 15-Puzzle (4×4)</h2><p>เลื่อนตัวเลข 1–15 ให้เรียงถูกต้อง ภาพพื้นหลังแต่ละช่องตั้งใจให้ชวนสับสน</p><span className="fifteen-tag">✦ ค่าเข้า 1 Spark · หักแล้วไม่คืน · รับรางวัลได้ {Math.max(0,2-claimed)}/2 ครั้งวันนี้</span></header>
  {error?<div role="alert" className="fifteen-alert">{error}<button type="button" onClick={()=>{setError("");void refresh();}}>โหลดข้อมูลใหม่</button></div>:null}
  {notice?<p role="status" className="fifteen-victory">{notice}</p>:null}
  <div className="fifteen-stats"><div><small>⏱ เวลา</small><strong>{duration(elapsed)}</strong></div><div><small>↔ จำนวนครั้งที่เลื่อน</small><strong>{moves}</strong></div><div><small>สถานะ</small><strong>{phase==="won"?"สำเร็จ!":phase==="saving"?"กำลังบันทึก":phase==="playing"?"กำลังเล่น":"พร้อมเล่น"}</strong></div></div>
  <div className="fifteen-board" role="group" aria-label="กระดานปริศนาขนาดสี่คูณสี่">
   {tiles.map((n,i)=>n===0?<div key="blank" className="fifteen-blank" aria-label="ช่องว่าง">✧</div>:<button type="button" key={n} aria-label={"เลื่อนเลข "+n} disabled={phase!=="playing"||busy||!allowed.includes(i)} onClick={()=>slide(i)} className={"fifteen-tile fifteen-pattern-"+n%8+(allowed.includes(i)&&phase==="playing"?" is-movable":"")}><span className="fifteen-glyph" aria-hidden="true">{["◇","✦","⬡","◈","☷","✧","⬢","❖"][n%8]}</span><span className="fifteen-number">{n}</span></button>)}
  </div>
  {result?<div className="fifteen-victory" role="status">🏆 สำเร็จ {duration(result.elapsedMs)} · รับ {result.earned} Sparks (สำเร็จ {result.base} + โบนัสเวลา {result.fast} + อันดับ {result.rankBonus})</div>:<p className="fifteen-hint">{phase==="ready"?"กดเริ่มเกมเพื่อหักค่าเข้า 1 Spark และสุ่มโจทย์ใหม่":phase==="saving"?"กำลังยืนยันคำตอบและจ่ายรางวัลจากเซิร์ฟเวอร์":"กดตัวเลขติดช่องว่างเพื่อเลื่อนไปยังช่องว่าง"}</p>}
  <div className="fifteen-actions">
   {phase==="playing"&&tiles.every((n,i)=>n===GOAL[i])?<button type="button" disabled={busy} onClick={()=>void finish(movesRef.current)}>ลองบันทึกผลอีกครั้ง</button>:null}
   <button type="button" disabled={busy} onClick={()=>void begin()}>{phase==="playing"?"↻ เริ่มใหม่ (หัก 1 Spark)":"✦ เริ่มเกม (1 Spark)"}</button>
   {phase==="playing"||phase==="won"?<button type="button" disabled={busy} onClick={exit}>ออกจากเกม</button>:null}
  </div>
  <div className="fifteen-panels"><section><h3>✦ รางวัลจากการเล่น</h3><p>เล่นสำเร็จ +30 Sparks</p><p>จบภายใน 3 นาที โบนัส +50 Sparks</p><p>รับรางวัลได้ 2 ครั้ง/วัน · ออกก่อนจบไม่ตัดสิทธิ์ · ค่าเข้าไม่คืน</p></section>
   <section><h3>♛ Leaderboard Top 5</h3><div className="fifteen-rank-list">{REWARDS.map((prize,i)=><div key={i}><span>อันดับ {i+1} · {leaderboard[i]?.displayName||"ว่าง"}</span><strong>{leaderboard[i]?duration(leaderboard[i].elapsedMs):"--:--"} · +{prize}</strong></div>)}</div><small>โบนัสอันดับใหม่สูงสุดเท่านั้น ไม่สะสมอันดับที่แซงผ่าน · จัดอันดับตามเวลาที่เซิร์ฟเวอร์ตรวจสอบ</small></section></div>
 </section>;
}
