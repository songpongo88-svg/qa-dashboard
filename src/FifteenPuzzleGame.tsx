import React,{useEffect,useMemo,useRef,useState} from "react";
import "./fifteenPuzzleGame.css";
const GOAL=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0];
const RANK=[150,120,100,80,50];
function neighbours(blank:number){const r=Math.floor(blank/4),c=blank%4;return [r>0?blank-4:-1,r<3?blank+4:-1,c>0?blank-1:-1,c<3?blank+1:-1].filter(n=>n>=0);}
function shuffled(){let tiles=[...GOAL],previous=-1;for(let k=0;k<180;k++){const blank=tiles.indexOf(0),available=neighbours(blank).filter(n=>n!==previous),choice=available[Math.floor(Math.random()*available.length)];[tiles[blank],tiles[choice]]=[tiles[choice],tiles[blank]];previous=blank;}if(tiles.every((n,i)=>n===GOAL[i]))return shuffled();return tiles;}
const duration=(ms:number)=>{const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");};
export default function FifteenPuzzleGame(){
 const [tiles,setTiles]=useState<number[]>(()=>shuffled()),[moves,setMoves]=useState(0),[phase,setPhase]=useState<"ready"|"playing"|"won">("ready"),[elapsed,setElapsed]=useState(0);
 const started=useRef<number|null>(null),elapsedBefore=useRef(0);
 const won=phase==="won";const allowed=useMemo(()=>neighbours(tiles.indexOf(0)),[tiles]);
 useEffect(()=>{if(phase!=="playing")return;const interval=window.setInterval(()=>{if(started.current!==null)setElapsed(elapsedBefore.current+performance.now()-started.current);},100);return()=>window.clearInterval(interval);},[phase]);
 const reset=()=>{setTiles(shuffled());setMoves(0);setElapsed(0);elapsedBefore.current=0;started.current=null;setPhase("ready");};
 const slide=(i:number)=>{if(won||!allowed.includes(i))return;if(phase==="ready"){started.current=performance.now();setPhase("playing");}
  const next=[...tiles],blank=next.indexOf(0);[next[i],next[blank]]=[next[blank],next[i]];setTiles(next);setMoves(m=>m+1);
  if(next.every((n,index)=>n===GOAL[index])){const total=elapsedBefore.current+(started.current===null?0:performance.now()-started.current);setElapsed(total);setPhase("won");started.current=null;}
 };
 return <section className="fifteen-game" aria-label="15-Puzzle เกมเลื่อนตัวเลข">
  <header className="fifteen-head"><span className="fifteen-eyebrow">QA SPARKS · MINI GAMES</span><h2>✦ 15-Puzzle (4×4)</h2><p>เลื่อนตัวเลข 1–15 ให้เรียงถูกต้อง ภาพพื้นหลังแต่ละช่องตั้งใจให้ชวนสับสน</p><span className="fifteen-tag">โหมดทดลอง · ยังไม่หักหรือจ่าย Sparks จริง</span></header>
  <div className="fifteen-stats"><div><small>⏱ เวลา</small><strong>{duration(elapsed)}</strong></div><div><small>↔ จำนวนครั้งที่เลื่อน</small><strong>{moves}</strong></div><div><small>สถานะ</small><strong>{won?"สำเร็จ!":phase==="playing"?"กำลังเล่น":"พร้อมเล่น"}</strong></div></div>
  <div className="fifteen-board" role="group" aria-label="กระดานปริศนาขนาดสี่คูณสี่">
   {tiles.map((number,index)=>number===0?<div key="blank" className="fifteen-blank" aria-label="ช่องว่าง">✧</div>:<button type="button" key={number} aria-label={"เลื่อนเลข "+number} disabled={won||!allowed.includes(index)}
    onClick={()=>slide(index)} className={"fifteen-tile fifteen-pattern-"+number%8+(allowed.includes(index)?" is-movable":"")}><span className="fifteen-glyph" aria-hidden="true">{["◇","✦","⬡","◈","☷","✧","⬢","❖"][number%8]}</span><span className="fifteen-number">{number}</span></button>)}
  </div>
  {won?<div className="fifteen-victory" role="status">🏆 สำเร็จ! ใช้เวลา {duration(elapsed)} · เลื่อน {moves} ครั้ง</div>:<p className="fifteen-hint">กดช่องตัวเลขที่อยู่ติดกับช่องว่างเพื่อเลื่อนไปยังช่องว่าง</p>}
  <div className="fifteen-actions"><button type="button" onClick={reset}>⟳ เริ่มเกมใหม่ / สุ่มใหม่</button></div>
  <div className="fifteen-panels"><section><h3>✦ รางวัลที่กำหนดไว้</h3><p>ค่าเข้า 1 Spark (ไม่คืน) · เล่นสำเร็จ +30 Sparks</p><p>จบภายใน 3 นาที โบนัส +50 Sparks</p><p>รับรางวัลได้ 2 ครั้ง/วัน · ออกก่อนจบไม่ตัดสิทธิ์</p></section><section><h3>♛ โบนัสอันดับ Top 5</h3><div className="fifteen-rank-list">{RANK.map((prize,i)=><div key={i}><span>อันดับ {i+1}</span><strong>+{prize} Sparks</strong></div>)}</div><small>รับเฉพาะรางวัลอันดับใหม่สูงสุด ไม่สะสมอันดับที่แซงผ่าน</small></section></div>
  <p className="fifteen-warning">นี่คือหน้าทดลองเล่นก่อนเชื่อมระบบ Supabase: เวลาและการเลื่อนเป็นการทำงานภายในเบราว์เซอร์เท่านั้น จึงยังใช้จัดอันดับหรือรับ Sparks จริงไม่ได้</p>
 </section>;
}
