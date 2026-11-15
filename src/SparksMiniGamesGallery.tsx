import React from "react";
import "./sparksMiniGamesGallery.css";

export type SparksGameChoice="snakes"|"fruit"|"angel";

function AngelCover(){
 return <svg viewBox="0 0 660 350" className="qa-game-cover-svg" role="img" aria-label="เลขนางฟ้า 0–100 ลุ้น Jackpot สะสม">
  <defs>
   <linearGradient id="qa-angel-cover-bg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#3c1a65"/><stop offset=".6" stopColor="#9153c1"/><stop offset="1" stopColor="#f7addd"/></linearGradient>
   <linearGradient id="qa-angel-cover-tile" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff9f5"/><stop offset="1" stopColor="#f2d5ff"/></linearGradient>
  </defs>
  <rect width="660" height="350" fill="url(#qa-angel-cover-bg)"/>
  <circle cx="500" cy="36" r="116" fill="#fff4c9" opacity=".13"/>
  <path d="M0 280Q95 235 172 276Q275 233 368 274Q484 231 660 266V350H0Z" fill="#f9e3ff" opacity=".6"/>
  {Array.from({length:9},(_,i)=>{const x=65+(i%5)*105,y=98+Math.floor(i/5)*98;return <g key={i} transform={"translate("+x+" "+y+") rotate("+(i%2?8:-6)+")"}>
   <rect width="86" height="83" rx="16" fill="url(#qa-angel-cover-tile)" stroke="#ffe1a0" strokeWidth="3"/>
   <ellipse cx="45" cy="27" rx="21" ry="6" fill="none" stroke="#ffc65e" strokeWidth="4"/>
   <path d="M32 50Q4 29 13 66L36 66M58 50Q86 29 77 66L54 66" fill="#fff6fb"/>
   <circle cx="45" cy="57" r="17" fill="#ffe0c5"/><path d="M28 55Q27 32 47 38Q62 36 62 53L55 44L36 46Z" fill="#7d4b53"/>
   <circle cx="39" cy="58" r="2.5" fill="#654550"/><circle cx="52" cy="58" r="2.5" fill="#654550"/>
   <text x="8" y="19" fontSize="15" fontWeight="900" fill="#6f349f">{i===0?0:i*11}</text>
  </g>})}
  <text x="331" y="39" textAnchor="middle" fontFamily="Kanit,sans-serif" fontSize="27" fontWeight="900" fill="#ffe59a">ANGEL NUMBER</text>
  <rect x="184" y="292" width="300" height="41" rx="19" fill="#4b1d70" stroke="#ffcf62" strokeWidth="3"/>
  <text x="334" y="319" textAnchor="middle" fontFamily="Kanit,sans-serif" fontSize="20" fontWeight="900" fill="#ffe592">JACKPOT · 5–50 SPARKS</text>
 </svg>;
}
function SnakesCover(){
 return <svg viewBox="0 0 660 350" className="qa-game-cover-svg" role="img" aria-label="ภาพเกมบันไดงู กระดาน ช่องรางวัล งู บันไดและลูกเต๋า">
   <defs>
     <linearGradient id="qa-game-snakes-bg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#17192f"/><stop offset=".58" stopColor="#41307c"/><stop offset="1" stopColor="#1a4f67"/></linearGradient>
     <linearGradient id="qa-game-snakes-board" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffc96a"/><stop offset="1" stopColor="#be6f2c"/></linearGradient>
     <linearGradient id="qa-game-snake-body" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fba58e"/><stop offset=".52" stopColor="#f45d69"/><stop offset="1" stopColor="#b3347f"/></linearGradient>
     <filter id="qa-game-snake-glow" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="15"/></filter>
   </defs>
   <rect width="660" height="350" fill="url(#qa-game-snakes-bg)"/>
   <circle cx="570" cy="60" r="113" fill="#9a74f2" opacity=".18" filter="url(#qa-game-snake-glow)"/>
   <circle cx="100" cy="290" r="135" fill="#ffc65c" opacity=".16" filter="url(#qa-game-snake-glow)"/>
   <g transform="translate(130,49) rotate(-9 205 127)">
     <rect x="-8" y="-8" width="428" height="258" rx="20" fill="#10162d" stroke="#c1a2f0" strokeWidth="5"/>
     {Array.from({length:4},(_,row)=>Array.from({length:7},(_,col)=><rect key={row+"-"+col} x={col*58} y={row*58} width="55" height="55" rx="9" fill={(row+col)%5===0?"#b78a3e":(row+col)%3===0?"#417369":"#313c62"} stroke="#c4b1e1" strokeOpacity=".4"/>))}
     <path d="M42 196 L112 196 L112 75 L191 75" fill="none" stroke="#235343" strokeWidth="14" strokeLinecap="round"/>
     <path d="M42 196 L112 196 L112 75 L191 75" fill="none" stroke="#a6ffb9" strokeWidth="8" strokeLinecap="round"/>
     <path d="M42 196 L112 196 L112 75 L191 75" fill="none" stroke="#0d5b43" strokeWidth="5" strokeDasharray="3 22"/>
     <path d="M342 37 C242 66 397 143 289 170 S226 224 331 217" fill="none" stroke="#38152f" strokeWidth="29" strokeLinecap="round"/>
     <path d="M342 37 C242 66 397 143 289 170 S226 224 331 217" fill="none" stroke="url(#qa-game-snake-body)" strokeWidth="21" strokeLinecap="round"/>
     <ellipse cx="342" cy="37" rx="21" ry="17" fill="#fb6e8d"/><circle cx="335" cy="32" r="4" fill="#fff8ed"/><circle cx="350" cy="32" r="4" fill="#fff8ed"/>
   </g>
   <g transform="translate(463 221) rotate(12)">
     <rect width="96" height="96" rx="19" fill="#9163b2" transform="translate(0 13)"/>
     <rect width="96" height="96" rx="19" fill="#fff2fa" stroke="#c5b0ea" strokeWidth="5"/>
     {[[25,25],[70,25],[47,47],[25,70],[70,70]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="7" fill="#6b3e93"/>)}
   </g>
   <g><circle cx="73" cy="86" r="30" fill="#ffd76a" opacity=".15"/><path d="M72 53L80 74 102 78 85 93 90 116 72 105 52 116 59 93 43 79 65 74Z" fill="#ffe46d" stroke="#fff3ae" strokeWidth="3"/></g>
   <text x="90" y="323" fontFamily="Kanit, sans-serif" fontSize="13" letterSpacing="3" fill="#ffe4a4">50 TILES · MULTIPLAYER</text>
 </svg>;
}
function FruitCover(){
 return <svg viewBox="0 0 660 350" className="qa-game-cover-svg" role="img" aria-label="ภาพเกมจับคู่ผลไม้ 12 คู่ จับเวลาพร้อมภาพผลไม้">
   <defs>
     <linearGradient id="qa-game-fruit-bg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#0d333c"/><stop offset=".5" stopColor="#1b7164"/><stop offset="1" stopColor="#164d83"/></linearGradient>
     <linearGradient id="qa-game-card" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fffff4"/><stop offset="1" stopColor="#ebffe8"/></linearGradient>
   </defs>
   <rect width="660" height="350" fill="url(#qa-game-fruit-bg)"/>
   <circle cx="92" cy="55" r="105" fill="#a7ffd6" opacity=".12"/>
   <circle cx="587" cy="305" r="149" fill="#65ccff" opacity=".13"/>
   <g transform="translate(122 42) rotate(6 213 125)">
     {Array.from({length:3},(_,row)=>Array.from({length:6},(_,col)=>{const x=col*72,y=row*76,index=row*6+col;return <g key={index} transform={`translate(${x} ${y})`}>
       <rect x="2" y="5" width="64" height="68" rx="12" fill="#043d48" opacity=".75"/>
       <rect width="64" height="66" rx="12" fill={index%4===0?"#ffcfa5":"url(#qa-game-card)"} stroke="#c9f9dd" strokeWidth="2"/>
       {index%4===0?<g><circle cx="31" cy="32" r="20" fill="#f4555f"/><ellipse cx="36" cy="13" rx="12" ry="6" transform="rotate(-24 36 13)" fill="#49ae5b"/><circle cx="25" cy="26" r="4" fill="#ffe9d6" opacity=".6"/></g>:
       index%4===1?<g><ellipse cx="31" cy="35" rx="20" ry="18" fill="#f7ae39"/><ellipse cx="30" cy="14" rx="11" ry="5" fill="#5baa54"/><path d="M24 38 L38 38" stroke="#ffdc76" strokeWidth="4" strokeLinecap="round"/></g>:
       index%4===2?<g><circle cx="31" cy="31" r="21" fill="#9d5ad2"/><circle cx="23" cy="24" r="7" fill="#c399f3" opacity=".8"/><circle cx="42" cy="26" r="5" fill="#c399f3" opacity=".8"/></g>:
       <g><ellipse cx="31" cy="35" rx="19" ry="22" fill="#f3e750"/><ellipse cx="35" cy="12" rx="12" ry="5" transform="rotate(-22 35 12)" fill="#6bc75d"/></g>}
     </g>;}))}
   </g>
   <g transform="translate(475 202) rotate(-10)">
     <circle cx="53" cy="53" r="52" fill="#123e4c" stroke="#d8ffe8" strokeWidth="7"/>
     <path d="M53 19 V55 L74 68" fill="none" stroke="#f7df7e" strokeWidth="7" strokeLinecap="round"/>
     <circle cx="53" cy="53" r="5" fill="#ffe394"/>
   </g>
   <text x="93" y="322" fontFamily="Kanit, sans-serif" fontSize="13" letterSpacing="3" fill="#d8fff1">12 PAIRS · MEMORY CHALLENGE</text>
 </svg>;
}
export default function SparksMiniGamesGallery({onSelect,privateSnakes=false}:{onSelect:(game:SparksGameChoice)=>void;privateSnakes?:boolean}){
 return <section className="qa-games-gallery" aria-label="เลือกมินิเกมจากภาพ">
   <div className="qa-games-gallery-heading">
     <div><span>QA SPARKS GAME ZONE</span><h2>เลือกเกมที่ต้องการเล่น</h2><p>กดที่รูปเกมเพื่อเข้าเล่นหรือกลับไปยังเกมที่เล่นค้างไว้</p></div>
     <div className="qa-games-gallery-count">{privateSnakes?"2 เกม + Private Test":"2 เกม"}</div>
   </div>
   <div className="qa-games-gallery-grid">
     {privateSnakes?<button type="button" data-sparks-game-card="snakes" className="qa-games-gallery-card qa-games-gallery-card--snakes" onClick={()=>onSelect("snakes")}>
       <span className="qa-games-gallery-art"><SnakesCover/><span className="qa-games-gallery-tag">PRIVATE TEST · เฉพาะเจ้าของระบบ</span></span>
       <span className="qa-games-gallery-details"><strong>บันไดงู · โหมดทดสอบส่วนตัว</strong><span>ทดสอบกับ Bot สูงสุด 4 ตัว · ยังไม่เผยแพร่ · ไม่มีการจ่าย Sparks จากเกมทดสอบ</span><span className="qa-games-gallery-play">เข้าทดสอบเกม</span></span>
     </button>:null}
     <button type="button" data-sparks-game-card="angel" className="qa-games-gallery-card qa-games-gallery-card--angel" onClick={()=>onSelect("angel")}>
       <span className="qa-games-gallery-art"><AngelCover/><span className="qa-games-gallery-tag">เริ่ม 6 ธ.ค. 2569 · เข้าจาก Mini Games เท่านั้น</span></span>
       <span className="qa-games-gallery-details"><strong>เลขนางฟ้า · Angel Number</strong><span>นางฟ้า 101 คาแรกเตอร์ · เปิดไม่เจอคืนค่าเล่นพร้อมโบนัส 5–50 Sparks · ลุ้น Jackpot และแบ่งรางวัลให้เพื่อน</span><span className="qa-games-gallery-play">เข้าสู่เกมเลขนางฟ้า <span aria-hidden="true">↗</span></span></span>
     </button>
     <button type="button" data-sparks-game-card="fruit" className="qa-games-gallery-card qa-games-gallery-card--fruit" onClick={()=>onSelect("fruit")}>
       <span className="qa-games-gallery-art"><FruitCover/><span className="qa-games-gallery-tag">เกมจับคู่ผลไม้</span></span>
       <span className="qa-games-gallery-details"><strong>Fruit Match</strong><span>เปิดภาพจับคู่ผลไม้ 12 คู่ ท้าทายความจำและทำสถิติ</span><span className="qa-games-gallery-play">เข้าเล่นเกม <span aria-hidden="true">↗</span></span></span>
     </button>
   </div>
 </section>;
}
