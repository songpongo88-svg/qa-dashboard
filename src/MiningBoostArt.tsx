import React,{useId} from "react";

/** Shared hand-drawn vector artwork used by the catalog tile and reward details. */
export default function MiningBoostArt({large=false}:{large?:boolean}){
  const uid=useId().replace(/:/g,"");
  const gold="url(#"+uid+"gold)",purple="url(#"+uid+"purple)";
  return <svg className={"qa-mb-art"+(large?" qa-mb-art-large":"")} viewBox="0 0 300 250" aria-label="พลั่วขุดทองประกายแสงและผลึกแร่สีม่วง ไอเทมโบนัส 40%" role="img">
    <defs>
      <linearGradient id={uid+"gold"} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff4a9"/><stop offset=".35" stopColor="#fbc949"/><stop offset=".75" stopColor="#dc8515"/><stop offset="1" stopColor="#fff09b"/></linearGradient>
      <linearGradient id={uid+"purple"} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f5d3ff"/><stop offset=".38" stopColor="#b96dff"/><stop offset=".8" stopColor="#7431ca"/><stop offset="1" stopColor="#4b148d"/></linearGradient>
      <radialGradient id={uid+"glow"}><stop stopColor="#ffeb9b" stopOpacity=".95"/><stop offset="1" stopColor="#ffeb9b" stopOpacity="0"/></radialGradient>
      <filter id={uid+"shadow"} x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#271048" floodOpacity=".5"/></filter>
    </defs>
    <circle cx="150" cy="120" r="115" fill={"url(#"+uid+"glow)"} opacity=".55"/>
    <g fill="#fff2bd"><path d="m53 40 5 13 13 5-13 5-5 13-5-13-13-5 13-5Z"/><path d="m242 33 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z"/><path d="m260 128 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z"/></g>
    <g filter={"url(#"+uid+"shadow)"}>
      <path d="M23 209 71 173 117 198 156 156 194 203 250 172 286 215 281 239H19Z" fill="#3d245b" stroke="#8b4abf" strokeWidth="3"/>
      <path d="m42 203 17-61 24 22 10 48-27 19Z" fill={purple} stroke="#edb5ff" strokeWidth="4"/>
      <path d="m60 146 4 40-22 17" stroke="#f6d9ff" strokeWidth="4" fill="none"/>
      <path d="m181 210 25-112 30 42 12 75-28 20Z" fill={purple} stroke="#ecc7ff" strokeWidth="5"/>
      <path d="m206 98 13 73-38 39m38-39 29 44" fill="none" stroke="#f2d2ff" strokeWidth="5"/>
      <path d="m235 218 19-76 20 35 12 45-26 12Z" fill="#8f44dd" stroke="#ebc3ff" strokeWidth="4"/>
      <g transform="rotate(36 145 120)">
        <rect x="135" y="54" width="20" height="175" rx="9" fill="#a55c2b" stroke="#f2bc70" strokeWidth="5"/>
        <rect x="130" y="70" width="30" height="15" rx="5" fill={gold}/>
        <path d="M58 73Q142 -4 239 73L212 91Q150 58 88 92Z" fill={gold} stroke="#9b5b15" strokeWidth="6"/>
        <path d="M70 70Q143 20 225 69" stroke="#fff5be" strokeWidth="7" fill="none" strokeLinecap="round"/>
        <circle cx="148" cy="66" r="15" fill={purple} stroke="#ffe99e" strokeWidth="5"/>
      </g>
    </g>
    <g filter={"url(#"+uid+"shadow)"}><rect x="174" y="187" width="109" height="47" rx="18" fill="#6817ac" stroke="#ffd565" strokeWidth="4"/><text x="228" y="219" fontSize="30" textAnchor="middle" fill="#fff4af" fontWeight="900">+40%</text></g>
  </svg>;
}
