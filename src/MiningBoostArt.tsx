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
    {large?<g transform="translate(13 32)" filter={"url(#"+uid+"shadow)"}>
      <path d="M24 72 18 18 55 37 92 12 94 72" fill="#d5d5ea" stroke="#6b5386" strokeWidth="5"/>
      <ellipse cx="57" cy="77" rx="52" ry="49" fill="#f5f2ff" stroke="#85729e" strokeWidth="5"/>
      <ellipse cx="38" cy="81" rx="12" ry="15" fill="#ffe1e5"/>
      <ellipse cx="77" cy="81" rx="12" ry="15" fill="#ffe1e5"/>
      <path d="M34 68q9-11 18 0m14 0q9-11 18 0" stroke="#36234a" strokeWidth="5" fill="none" strokeLinecap="round"/>
      <path d="m52 86 7 6 7-6" fill="#e58ca8"/><path d="M52 97q8 13 15 0" stroke="#a6506a" strokeWidth="3" fill="none"/>
      <path d="M7 53Q6-5 58-9Q111-7 108 52Z" fill={gold} stroke="#a36316" strokeWidth="5"/>
      <rect x="10" y="39" width="100" height="18" rx="9" fill="#e6a92b" stroke="#a66b17" strokeWidth="4"/>
      <circle cx="57" cy="15" r="16" fill="#fff5bc" stroke="#b58327" strokeWidth="6"/>
      <circle cx="57" cy="15" r="8" fill="#fff"/>
    </g>:null}
    <g filter={"url(#"+uid+"shadow)"}><rect x="174" y="187" width="109" height="47" rx="18" fill="#6817ac" stroke="#ffd565" strokeWidth="4"/><text x="228" y="219" fontSize="30" textAnchor="middle" fill="#fff4af" fontWeight="900">+40%</text></g>
  </svg>;
}
