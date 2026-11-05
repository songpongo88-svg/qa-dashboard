import React, { useCallback, useEffect, useRef, useState } from "react";
import { FRUIT_MATCH as RULES, FRUIT_MATCH_FRUITS as FRUITS, formatFruitTime } from "./fruitMatchRules.js";
import "./fruitMatchGame.css";

type FruitRecord = {username:string;displayName:string;elapsedMs:number;moves:number;achievedAt:string};
type GameResult = {roundId:string;won:boolean;pairs:number;moves:number;elapsedMs:number;earned:number;reason:string;createdAt:string};
type Stats = {played:number;wins:number;completed:number;best:FruitRecord|null;history:GameResult[];dailyRewardCount:number;totalSparks:number;rewardDay:string};
type GameData = {stats:Stats;leaderboard:FruitRecord[]};
type Round = {token:string;deck:number[];began:number;trace:{card:number;at:number}[];first:number|null;
  open:Set<number>;matched:Set<number>;lockedUntil:number;moves:number;phase:"playing"|"saving"|"complete"|"error";localResult?:GameResult};
const EMPTY:Stats={played:0,wins:0,completed:0,best:null,history:[],dailyRewardCount:0,totalSparks:0,rewardDay:""};
const PREVIEW=Array.from({length:RULES.pairs*2},(_,index)=>index%RULES.pairs);

export default function FruitMatchGame({username,sessionId}:{username:string;sessionId:string}) {
  const [tab,setTab]=useState<"play"|"rank"|"stats">("play");
  const [data,setData]=useState<GameData>({stats:EMPTY,leaderboard:[]});
  const [loading,setLoading]=useState(false),[starting,setStarting]=useState(false),[imagesReady,setImagesReady]=useState(false);
  const [error,setError]=useState("");
  const [result,setResult]=useState<GameResult|null>(null);
  const [snapshot,setSnapshot]=useState({deck:PREVIEW,open:new Set(PREVIEW.map((_,index)=>index)),matched:new Set<number>(),remaining:RULES.durationMs,moves:0,phase:"ready"});
  const round=useRef<Round|null>(null),mounted=useRef(false),busy=useRef(false),requestId=useRef("");
  const hideDelay=useRef<number>();
  const request=useCallback(async(action:string,extra:object={})=>{
    const response=await fetch("/api/sparks-admin",{method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
      body:JSON.stringify({action,actorUsername:username,sessionId,...extra})});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(String(body.error||"ไม่สามารถเชื่อมต่อเกมได้ กรุณาลองอีกครั้ง"));
    return body;
  },[username,sessionId]);
  const refreshData=useCallback(async()=>{
    if(!username||!sessionId)return;
    setLoading(true);setError("");
    try{const next=await request("fruit-match-data");if(mounted.current)setData(next);}
    catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:"โหลดสถิติไม่สำเร็จ");}
    finally{if(mounted.current)setLoading(false);}
  },[username,sessionId,request]);
  const show=useCallback(()=>{
    const current=round.current;if(!current)return;
    setSnapshot({deck:current.deck,open:new Set(current.open),matched:new Set(current.matched),
      remaining:Math.max(0,RULES.durationMs-(performance.now()-current.began)),moves:current.moves,phase:current.phase});
  },[]);
  const submit=useCallback(async(current:Round)=>{
    if(busy.current||round.current!==current||!["playing","error"].includes(current.phase))return;
    busy.current=true;current.phase="saving";show();setError("");
    const won=current.matched.size===RULES.pairs*2;
    const elapsedMs=won?Math.round((current.trace.at(-1)?.at||0)/10)*10:RULES.durationMs;
    current.localResult={roundId:"",won,pairs:current.matched.size/2,moves:current.moves,elapsedMs,earned:0,reason:"pending",createdAt:""};
    setResult(current.localResult);
    try{
      const saved=await request("fruit-match-finish",{token:current.token,trace:current.trace});
      if(!mounted.current||round.current!==current)return;
      current.phase="complete";setResult(saved.result);setData({stats:saved.stats,leaderboard:saved.leaderboard});
      if(saved.result.earned>0)window.dispatchEvent(new Event("qa:sparks-updated"));
    }catch(reason){
      if(!mounted.current||round.current!==current)return;
      current.phase="error";setError(reason instanceof Error?reason.message:"บันทึกผลไม่สำเร็จ กรุณาลองอีกครั้ง");
    }finally{busy.current=false;if(mounted.current)show();}
  },[request,show]);
  const tick=useCallback(()=>{
    const current=round.current;if(!current||current.phase!=="playing")return;
    if(performance.now()-current.began>=RULES.durationMs)void submit(current);
    else show();
  },[show,submit]);
  useEffect(()=>{
    mounted.current=true;void refreshData();
    const interval=window.setInterval(tick,100);
    document.addEventListener("visibilitychange",tick);
    return()=>{mounted.current=false;window.clearInterval(interval);window.clearTimeout(hideDelay.current);document.removeEventListener("visibilitychange",tick);};
  },[refreshData,tick]);
  useEffect(()=>{
    let active=true,count=0;
    const images=FRUITS.map(fruit=>{
      const image=new Image();
      image.onload=()=>{count++;if(active&&count===FRUITS.length)setImagesReady(true);};
      image.onerror=()=>{if(active)setError("โหลดภาพผลไม้ไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่");};
      image.src=fruit.image;return image;
    });
    return()=>{active=false;for(const image of images){image.onload=null;image.onerror=null;}};
  },[]);
  const start=async()=>{
    if(busy.current||!imagesReady||round.current?.phase==="playing"||round.current?.phase==="saving")return;
    busy.current=true;setStarting(true);setError("");
    try{
      if(!requestId.current)requestId.current=typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function"
        ?crypto.randomUUID():"fruit-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
      const started=await request("fruit-match-start",{requestId:requestId.current});
      if(!mounted.current)return;
      if(!Array.isArray(started.deck)||started.deck.length!==RULES.pairs*2||started.deck.some((n:number)=>!Number.isInteger(n)||!FRUITS[n]))throw new Error("ไม่สามารถโหลดกระดานเกมได้");
      window.clearTimeout(hideDelay.current);requestId.current="";setResult(null);
      setData(previous=>({...previous,stats:started.stats}));
      round.current={token:started.token,deck:started.deck,began:performance.now(),trace:[],first:null,
        open:new Set(),matched:new Set(),lockedUntil:0,moves:0,phase:"playing"};show();
    }catch(reason){if(mounted.current)setError(reason instanceof Error?reason.message:"เริ่มเกมไม่สำเร็จ");}
    finally{busy.current=false;if(mounted.current)setStarting(false);}
  };
  const flip=(index:number)=>{
    const current=round.current;if(!current||current.phase!=="playing")return;
    const at=Math.floor(performance.now()-current.began),last=current.trace.at(-1);
    if(at>=RULES.durationMs){void submit(current);return;}
    if(at<current.lockedUntil||current.open.has(index)||current.matched.has(index)||(last&&at-last.at<RULES.minimumFlipMs))return;
    current.trace.push({card:index,at});current.open.add(index);
    if(current.first===null){current.first=index;show();return;}
    const previous=current.first;current.first=null;current.moves++;
    if(current.deck[previous]===current.deck[index]){
      current.matched.add(previous);current.matched.add(index);show();
      if(current.matched.size===RULES.pairs*2)void submit(current);
    }else{
      current.lockedUntil=at+RULES.mismatchMs;show();
      hideDelay.current=window.setTimeout(()=>{
        if(round.current!==current||current.phase!=="playing")return;
        current.open.delete(previous);current.open.delete(index);show();
      },RULES.mismatchMs);
    }
  };
  const playing=snapshot.phase==="playing",saving=snapshot.phase==="saving",failed=snapshot.phase==="error";
  const myRank=data.leaderboard.findIndex(row=>row.username.toLowerCase()===username.toLowerCase());
  const complete=snapshot.phase==="complete";
  return <section className="qfm-root" aria-label="Fruit Match มินิเกมจับคู่ผลไม้">
    <header className="qfm-brand"><span>✦ QA SPARKS · MINI GAMES</span><span>12 คู่ / 24 ใบ</span></header>
    <div className="qfm-heading"><div><p>จับคู่ภาพผลไม้ แล้วทำเวลาให้ดีที่สุด</p><h2>Fruit Match</h2><small>12 คู่ · 24 ใบ · 2 นาที 30 วินาที</small></div><div className="qfm-reward">✦ +10<small>Sparks / รอบที่ผ่าน</small></div></div>
    <nav className="qfm-tabs" role="tablist" aria-label="Fruit Match">
      {([["play","เล่นเกม"],["rank","อันดับผู้เล่น"],["stats","สถิติของฉัน"]] as const).map(([key,label])=><button key={key} id={"qfm-tab-"+key} type="button" role="tab" aria-selected={tab===key} aria-controls={"qfm-"+key} onClick={()=>setTab(key)}>{label}</button>)}
    </nav>
    <section id="qfm-play" role="tabpanel" aria-labelledby="qfm-tab-play" hidden={tab!=="play"}>
      <div className="qfm-metrics"><div><span>เวลาที่เหลือ</span><strong>{formatFruitTime(snapshot.remaining)}</strong></div><div><span>จับคู่แล้ว</span><strong>{snapshot.matched.size/2} <small>/ 12</small></strong></div><div><span>เปิดจับคู่</span><strong>{snapshot.moves} <small>ครั้ง</small></strong></div></div>
      <div className="qfm-timer" aria-hidden="true"><span style={{width:(snapshot.remaining/RULES.durationMs*100)+"%"}}/></div>
      <div className="qfm-board-wrap"><div className="qfm-board" aria-label="การ์ดผลไม้ 24 ใบ">
        {snapshot.deck.map((fruit,index)=>{
          const open=snapshot.open.has(index),matched=snapshot.matched.has(index);
          return <button key={index} type="button" className={"qfm-tile"+(open?" is-open":"")+(matched?" is-matched":"")} disabled={!playing||matched}
            aria-label={matched?FRUITS[fruit].name+" จับคู่แล้ว":open?FRUITS[fruit].name:"การ์ดใบที่ "+(index+1)} onClick={()=>flip(index)} data-fruit-card={index}>
            <span className="qfm-flipper"><span className="qfm-back" aria-hidden="true">✦</span><span className="qfm-face" aria-hidden="true"><img src={FRUITS[fruit].image} width="100" height="100" alt="" draggable={false}/></span></span>
          </button>;
        })}
      </div>{result?<div className="qfm-result" role="status" aria-live="polite"><span aria-hidden="true">{saving?"…":failed?"↻":result.won?"🏆":"⏰"}</span><h3>{saving?"กำลังบันทึกผล…":failed?"บันทึกผลไม่สำเร็จ":result.won?"จับคู่ครบ 12 คู่แล้ว!":"หมดเวลาแล้ว"}</h3><strong>{formatFruitTime(result.elapsedMs,true)}</strong><p>จับคู่ได้ {result.pairs} / 12 คู่ · เปิด {result.moves} ครั้ง</p>
        {complete?<><p className="qfm-result-points">{result.earned?`+${result.earned} Sparks`:result.reason==="daily-limit"?"รับ Sparks ครบ 3 ครั้งวันนี้แล้ว":result.reason==="annual-limit"?"รางวัลรอบนี้เกินเพดาน Sparks ประจำปี":"รอบนี้ยังไม่ได้รับ Sparks"}</p>{result.won?<button type="button" className="qfm-secondary" onClick={()=>setTab("rank")}>ดูอันดับของฉัน →</button>:null}</>:null}
      </div>:null}</div>
      <div className="qfm-message" aria-live="polite">{playing?"เปิดทีละ 2 ใบ แล้วหาภาพผลไม้ชนิดเดียวกัน":saving?"กรุณารอการบันทึกผล":complete?"บันทึกผลการเล่นแล้ว":failed?"ลองบันทึกอีกครั้งก่อนเริ่มรอบใหม่":"พร้อมแล้วกดเริ่ม ภาพจะสลับตำแหน่งใหม่ทุกรอบ"}</div>
      {failed?<button type="button" className="qfm-primary" onClick={()=>round.current&&void submit(round.current)}>ลองบันทึกผลอีกครั้ง</button>:null}
      <button className="qfm-primary" type="button" onClick={()=>void start()} disabled={playing||saving||starting||!imagesReady||!username||!sessionId}>
        {starting?"กำลังเริ่มเกม…":playing?"กำลังเล่น…":saving?"กำลังบันทึก…":!imagesReady?"กำลังโหลดภาพ…":snapshot.phase==="ready"?"เริ่มเล่น 12 คู่ →":data.stats.dailyRewardCount>=RULES.dailyRewardLimit?"เล่นต่อเพื่อทำสถิติ →":"เล่นอีกครั้ง →"}</button>
      <div className="qfm-footbar"><span>รับรางวัลวันนี้ <b>{data.stats.dailyRewardCount} / 3</b> ครั้ง</span><span>ได้รับจากเกม <b>{data.stats.totalSparks}</b> Sparks</span></div>
    </section>
    <section id="qfm-rank" role="tabpanel" aria-labelledby="qfm-tab-rank" hidden={tab!=="rank"}>
      <div className="qfm-section-head"><h3>ใครจับคู่ครบเร็วที่สุด?</h3><button type="button" className="qfm-text-button" disabled={loading} onClick={()=>void refreshData()}>{loading?"กำลังโหลด…":"อัปเดตอันดับ"}</button></div>
      <p className="qfm-caption">ใช้เวลาที่ดีที่สุดต่อคน เฉพาะรอบที่จับคู่ครบ 12 คู่</p>
      <table className="qfm-table"><thead><tr><th>อันดับ / ผู้เล่น</th><th>เวลา</th><th>เปิดจับคู่</th></tr></thead><tbody>{data.leaderboard.map((row,index)=><tr key={row.username} className={row.username.toLowerCase()===username.toLowerCase()?"is-you":""}><td><span className="qfm-rank-num">{index<3?["🥇","🥈","🥉"][index]:index+1}</span>{row.displayName||row.username}</td><td>{formatFruitTime(row.elapsedMs,true)}</td><td>{row.moves} ครั้ง</td></tr>)}</tbody></table>
      {!data.leaderboard.length?<p className="qfm-empty">ยังไม่มีผู้เล่นทำสำเร็จ มาเป็นคนแรกกัน</p>:null}
      <p className="qfm-my-rank">{myRank>=0?`คุณอยู่อันดับ ${myRank+1} · เวลาดีที่สุด ${formatFruitTime(data.leaderboard[myRank].elapsedMs,true)}`:data.stats.best?"สถิติของคุณอยู่นอก 100 อันดับแรก":"เล่นผ่านรอบแรกเพื่อเพิ่มชื่อในอันดับ"}</p>
      <p className="qfm-caption">เวลาเท่ากัน ดูจำนวนครั้งที่เปิดจับคู่ หากยังเท่ากันให้ผู้ที่ทำได้ก่อนอยู่สูงกว่า</p>
    </section>
    <section id="qfm-stats" role="tabpanel" aria-labelledby="qfm-tab-stats" hidden={tab!=="stats"}>
      <h3>สถิติของฉัน</h3><div className="qfm-personal"><div><span>เล่นทั้งหมด</span><strong>{data.stats.played} <small>รอบ</small></strong></div><div><span>ผ่านแล้ว</span><strong>{data.stats.wins} <small>รอบ</small></strong></div><div><span>เวลาดีที่สุด</span><strong>{data.stats.best?formatFruitTime(data.stats.best.elapsedMs,true):"—"}</strong></div></div>
      <h4>ผลการเล่นล่าสุด</h4>{data.stats.history.length?<table className="qfm-table"><thead><tr><th>ผล / วันที่เล่น</th><th>เวลาที่ใช้</th><th>คู่ที่ได้</th></tr></thead><tbody>{[...data.stats.history].reverse().map(row=><tr key={row.roundId}><td>{row.won?"ผ่าน":"หมดเวลา"}<small>{new Date(row.createdAt).toLocaleString("th-TH",{timeZone:"Asia/Bangkok",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false})}</small></td><td>{formatFruitTime(row.elapsedMs,true)}</td><td>{row.pairs} / 12</td></tr>)}</tbody></table>:<p className="qfm-empty">ยังไม่มีผลการเล่น ลองจับคู่ผลไม้รอบแรกกัน</p>}
    </section>
    {error?<div className="qfm-error" role="alert">{error}</div>:null}
    <p className="qfm-note">ผ่านรับ 10 Sparks · สูงสุด 3 ครั้ง/วัน · เวลาไทย · สลับแท็บแล้วยังจับเวลาต่อ</p>
    <p className="qfm-credit">ภาพ: <a href="https://github.com/fruits-360/fruits-360-100x100" target="_blank" rel="noreferrer">Fruits-360 · Mihai Oltean</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a></p>
  </section>;
}
