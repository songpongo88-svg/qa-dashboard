import assert from "node:assert/strict";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import React,{act} from "react";
import {JSDOM} from "jsdom";

await mkdir(resolve("node_modules/.cache"),{recursive:true});
const folder=await mkdtemp(resolve("node_modules/.cache/sparks-product-"));
const dom=new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",{
 url:"https://qa-dashboard.test",pretendToBeVisual:true
});
const originals={};
for(const key of ["window","document","HTMLElement","MutationObserver","Event","MouseEvent","KeyboardEvent","CustomEvent"]){
 originals[key]=Object.getOwnPropertyDescriptor(globalThis,key);
 globalThis[key]=dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const oldFetch=globalThis.fetch;
const calls=[];
const owned={itemId:"sr-test-owned-item-123456",rewardId:"punthai-65",title:"เครื่องดื่มพันธุ์ไทย",
 price:6500,status:"unused",redeemedAt:"2026-11-06T03:30:00.000Z",expiresAt:"2026-12-06T03:30:00.000Z",activatedAt:""};
globalThis.fetch=async (url,options)=>{
 const data=JSON.parse(options.body);
 calls.push(data.action);
 assert.equal(url,"/api/sparks-admin");
 assert.equal(data.action,"special-rewards-mine","opening promo may never charge Sparks");
 return {ok:true,json:async()=>({items:[owned],catalog:[],expiryDays:30})};
};
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.querySelector("#root"));
const click=async node=>{assert.ok(node);await act(async()=>node.dispatchEvent(new MouseEvent("click",{bubbles:true})));};
try{
 const filename=resolve(folder,"SpecialRewardCenter.mjs");
 await build({entryPoints:["src/SpecialRewardCenter.tsx"],outfile:filename,
  bundle:true,platform:"node",format:"esm",packages:"external",loader:{".css":"empty"},logLevel:"silent"});
 const {default:SpecialRewardCenter}=await import(pathToFileURL(filename).href);
 const props={username:"qa-test",sessionId:"session-test-1234567",balance:20000,loaded:true};
 await act(async()=>root.render(React.createElement("div",{},
   React.createElement(SpecialRewardCenter,{...props,mode:"reward"}))));
 const tiles=[...document.querySelectorAll("[data-reward-item]")];
 assert.equal(tiles.length,4);
 const ids=tiles.slice().sort((a,b)=>Number(a.style.order)-Number(b.style.order)).map(x=>x.dataset.rewardItem);
 assert.deepEqual(ids,["seven-100","netflix-1m","amazon-55","punthai-65"]);
 assert.equal(calls.length,0,"Reward Center is read-only until redemption confirmation");
 await click(document.querySelector('[data-reward-item="punthai-65"]'));
 let popup=document.querySelector(".sr-modal");
 assert.ok(popup);
 assert.ok(popup.querySelector('[data-sr-reward-description="product"]'));
 assert.match(popup.textContent,/เติมความสดชื่นกับพันธุ์ไทย/);
 assert.match(popup.textContent,/6,500/);
 assert.match(popup.textContent,/65/);
 assert.ok(!popup.textContent.includes("วิธีใช้งาน Item"));
 assert.ok(!popup.textContent.includes("กรอกเลขที่ใบเสร็จ"));
 assert.ok(popup.textContent.includes("30 วัน"));
 assert.equal(calls.length,0,"preview does not charge or fetch");
 await click(popup.querySelector(".sr-close"));
 await click(document.querySelector('[data-reward-item="netflix-1m"]'));
 popup=document.querySelector(".sr-modal");
 assert.match(popup.textContent,/1 เดือน/);
 assert.match(popup.textContent,/15,000/);
 assert.ok(!popup.textContent.includes("กรอกอีเมลที่"));
 await click(popup.querySelector(".sr-close"));
 
 // The same reward opens a different operational guide only from its owned Item.
 await act(async()=>root.render(React.createElement("div",{},
   React.createElement(SpecialRewardCenter,{...props,mode:"inventory"}))));
 const tile=document.querySelector('[data-special-inventory-item="sr-test-owned-item-123456"]');
 assert.ok(tile,"My Items only reflects actual backend-owned rewards");
 await click(tile);
 const itemPopup=document.querySelector(".sr-modal");
 assert.ok(itemPopup.querySelector(".sr-item-guide"),"redeemed Item contains how-to");
 assert.match(itemPopup.textContent,/วิธีใช้งาน Item/);
 assert.match(itemPopup.textContent,/เลขที่ใบเสร็จ/);
 assert.match(itemPopup.textContent,/พร้อมเพย์/);
 assert.match(itemPopup.textContent,/ใบเสร็จต้องมีวันและเวลาตั้งแต่กดใช้ Item/);
 assert.ok(itemPopup.querySelector(".sr-primary.sr-block"),"owned Item exposes use action");
 assert.deepEqual(calls,["special-rewards-mine"]);
 console.log("PASS Reward Center: promotional product details, descending prices; My Items: instructions only after ownership, no accidental Sparks spending");
}finally{
 await act(async()=>root.unmount());
 globalThis.fetch=oldFetch;dom.window.close();
 for(const [key,descriptor] of Object.entries(originals)){
  if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
 }
 await rm(folder,{recursive:true,force:true});
}
