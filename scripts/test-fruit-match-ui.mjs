import assert from "node:assert/strict";
import {mkdtemp,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import React,{act} from "react";
import {JSDOM} from "jsdom";
const work=await mkdtemp(resolve(".fruit-match-test-"));
const dom=new JSDOM("<!doctype html><div id='root'></div>",{url:"https://qa.test",pretendToBeVisual:true});
for(const key of ["window","document","HTMLElement","Event","MouseEvent"])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const originalFetch=fetch,originalImage=globalThis.Image,originalNow=Object.getOwnPropertyDescriptor(performance,"now");
const originalCrypto=Object.getOwnPropertyDescriptor(globalThis,"crypto");
Object.defineProperty(globalThis,"crypto",{value:{},configurable:true});
let clock=10000;
Object.defineProperty(performance,"now",{configurable:true,value:()=>clock});
globalThis.Image=class{set src(_value){queueMicrotask(()=>this.onload?.());}};
const calls=[];
const stats={played:0,wins:0,completed:0,best:null,history:[],dailyRewardCount:0,totalSparks:0,rewardDay:"2026-11-05"};
const deck=Array.from({length:24},(_,index)=>index%12);
let failSave=true,lastSubmission;
globalThis.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);calls.push(body);assert.equal(body.actorUsername,"Agent");assert.equal(body.sessionId,"agent-session-123456789");
  if(body.action==="fruit-match-data")return{ok:true,json:async()=>({stats:{...stats},leaderboard:[]})};
  if(body.action==="fruit-match-start"){stats.played++;return{ok:true,json:async()=>({stats:{...stats},deck,token:"server-issued-ticket"})};}
  assert.equal(body.action,"fruit-match-finish");assert.equal(body.token,"server-issued-ticket");
  if(failSave){failSave=false;lastSubmission=body;throw new Error("การเชื่อมต่อขัดข้อง กรุณาลองอีกครั้ง");}
  assert.deepEqual(body,lastSubmission,"retry must send the same round and moves");
  assert.equal(body.trace.length,26,"one mismatch plus 12 successful pairs");
  stats.wins=1;stats.completed=1;stats.dailyRewardCount=1;stats.totalSparks=10;
  stats.best={username:"agent",displayName:"Agent One",elapsedMs:body.trace.at(-1).at,moves:13,achievedAt:"2026-11-05T05:00:00Z"};
  const result={roundId:"real-round-id",won:true,pairs:12,moves:13,elapsedMs:stats.best.elapsedMs,earned:10,reason:"earned",createdAt:"2026-11-05T05:00:00Z"};stats.history=[result];
  return{ok:true,json:async()=>({result,stats:{...stats},leaderboard:[stats.best]})};
};
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.getElementById("root"));
const wait=async(ms=0)=>act(async()=>{await new Promise(r=>setTimeout(r,ms));});
const click=async(element,advance=200)=>{assert(element);clock+=advance;await act(async()=>element.dispatchEvent(new MouseEvent("click",{bubbles:true})));};
try{
  const outfile=resolve(work,"game.mjs");await build({entryPoints:["src/FruitMatchGame.tsx"],outfile,bundle:true,platform:"node",format:"esm",packages:"external",loader:{".css":"empty"},logLevel:"silent"});
  const Game=(await import(pathToFileURL(outfile).href)).default;
  await act(async()=>root.render(React.createElement(Game,{username:"Agent",sessionId:"agent-session-123456789"})));await wait();
  assert.equal(document.querySelectorAll("[data-fruit-card]").length,24);
  assert.equal(new Set([...document.querySelectorAll(".qfm-face img")].map(image=>image.src)).size,12);
  assert.equal(calls.length,1,"one initial stats read, no polling");assert(!document.body.textContent.includes("ผู้เล่น A"));
  await click(document.querySelector(".qfm-primary"));await wait();assert.equal(calls.length,2);
  const card=index=>document.querySelector(`[data-fruit-card="${index}"]`);
  await click(card(0));await click(card(1));await click(card(2));assert(!card(2).classList.contains("is-open"),"third card is locked during mismatch");assert.equal(calls.length,2,"flipping cards must never read or write the database");
  clock+=700;await wait(660);
  for(let i=0;i<12;i++){await click(card(i));await click(card(i+12));}
  await wait();assert.equal(calls.length,3);assert(document.querySelector(".qfm-result").textContent.includes("บันทึกผลไม่สำเร็จ"));assert(!document.querySelector(".qfm-result").textContent.includes("+10 Sparks"),"no points shown before server confirmation");
  await click([...document.querySelectorAll(".qfm-primary")].find(button=>button.textContent.includes("ลองบันทึก")));await wait();
  assert.equal(calls.length,4);assert(document.querySelector(".qfm-result").textContent.includes("+10 Sparks"));
  assert.equal(document.querySelectorAll(".is-matched").length,24);await click(document.querySelector(".qfm-secondary"));
  assert.equal(document.querySelector("#qfm-rank").hidden,false);assert(document.querySelector("#qfm-rank").textContent.includes("Agent One"));assert(document.querySelector(".qfm-my-rank").textContent.includes("อันดับ 1"));
  await click(document.querySelector("#qfm-tab-stats"));assert(document.querySelector("#qfm-stats").textContent.includes("12 / 12"));
  assert.equal(calls.length,4,"tab changes do not fetch again");
  console.log("PASS Fruit Match UI: 24 photo cards, 12 types, mismatch lock, local-only flips, real server result, same-round retry, personal stats/ranking, no fake rows or polling.");
}finally{await act(async()=>root.unmount());globalThis.fetch=originalFetch;globalThis.Image=originalImage;if(originalCrypto)Object.defineProperty(globalThis,"crypto",originalCrypto);else delete globalThis.crypto;if(originalNow)Object.defineProperty(performance,"now",originalNow);else delete performance.now;dom.window.close();await rm(work,{recursive:true,force:true});}
