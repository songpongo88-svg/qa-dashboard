import assert from "node:assert/strict";
import { mkdir,mkdtemp,rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React,{act} from "react";
import { JSDOM } from "jsdom";

await mkdir(resolve("node_modules/.cache"),{recursive:true});
const work=await mkdtemp(resolve("node_modules/.cache/lottery-popup-"));
const dom=new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",{
  url:"https://qa-dashboard.test",pretendToBeVisual:true,
});
const initial={};
for(const key of ["window","document","HTMLElement","MutationObserver","Event","MouseEvent","KeyboardEvent","CustomEvent"]){
  initial[key]=Object.getOwnPropertyDescriptor(globalThis,key);
  globalThis[key]=dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const oldFetch=globalThis.fetch;
const calls=[];
const state={price:120,maxPerDraw:2,draw:{date:"2026-11-16",status:"pending",tickets:[]},
  previous:{date:"2026-11-01",status:"published",officialResult:{
    date:"2026-11-01",first:"123456",back3:["456","100"],last2:"56",
    source:"GLO"
  },tickets:[]},cutoffTime:"14:00",timeZone:"Asia/Bangkok"};
globalThis.fetch=async (url,opts)=>{
  assert.equal(url,"/api/sparks-admin");
  const data=JSON.parse(opts.body);
  calls.push(data);
  if(data.action==="qa-lottery-state")return {ok:true,json:async()=>structuredClone(state)};
  if(data.action==="qa-lottery-buy"){
    state.draw.tickets.push({id:data.requestId,number:data.number,createdAt:new Date().toISOString(),paidAt:null,prize:0,matched:[]});
    return {ok:true,json:async()=>({alreadyPurchased:false,number:data.number,drawDate:data.drawDate,balance:380})};
  }
  throw Error("Unexpected QA Lottery request "+data.action);
};
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.querySelector("#root"));
try{
  const bundle=resolve(work,"Lottery.mjs");
  await build({entryPoints:["src/QALottery.tsx"],outfile:bundle,bundle:true,
    platform:"node",format:"esm",packages:"external",logLevel:"silent"});
  const {default:QALottery}=await import(pathToFileURL(bundle).href);
  await act(async()=>root.render(React.createElement("div",{className:"qa-sparks-mini-grid"},
    React.createElement(QALottery,{username:"agent",sessionId:"agent-lottery-test-1234",balance:500,loaded:true}))));
  const rootNode=document.querySelector("#root");
  const card=rootNode.querySelector('[data-quest-item="qa-lottery"]');
  assert.ok(card,"QA Lottery must be a compact item in Quest Center");
  assert.ok(card.matches("button.qa-sparks-mini-item.qa-sparks-mini-item--lottery"));
  assert.ok(card.querySelector(".qa-sparks-mini-art--lottery"));
  assert.ok(card.textContent.includes("QA Lottery"));
  assert.ok(card.textContent.includes("120 Sparks"));
  assert.equal(rootNode.querySelector(".ql-card"),null,"old full-width banner removed");
  assert.equal(document.querySelector(".ql-modal"),null,"details must not render before click");
  assert.equal(calls.length,0,"the quest card must not poll the backend");

  await act(async()=>card.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  const modal=document.querySelector(".ql-modal");
  assert.ok(modal,"click opens a popup");
  assert.equal(modal.getAttribute("role"),"dialog");
  assert.equal(modal.getAttribute("aria-modal"),"true");
  assert.ok(document.body.contains(modal));
  assert.ok(!rootNode.contains(modal),"popup must use a portal outside the small grid tile");
  assert.equal(document.body.style.overflow,"hidden","background page locked while popup is open");
  assert.ok(modal.textContent.includes("3,000"));
  assert.ok(modal.textContent.includes("1,500"));
  assert.ok(modal.textContent.includes("1,000"));
  assert.ok(modal.textContent.includes("16 พฤศจิกายน"));
  assert.ok(modal.querySelector("#ql-number"));
  assert.equal(modal.querySelector("#ql-number").maxLength,6);
  assert.equal(calls.length,1);
  assert.equal(calls[0].action,"qa-lottery-state");
  assert.equal(calls.some(r=>r.action==="qa-lottery-buy"),false,"no Sparks charge on popup open");

  await act(async()=>modal.querySelector(".ql-link").dispatchEvent(new MouseEvent("click",{bubbles:true})));
  assert.equal(calls.filter(r=>r.action==="qa-lottery-state").length,2);

  await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
  assert.equal(document.querySelector(".ql-modal"),null,"Escape closes QA Lottery popup");
  assert.equal(document.body.style.overflow,"","closing restores background scrolling");
  assert.equal(document.activeElement,card,"focus restored to quest item");

  await act(async()=>card.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  const close=document.querySelector(".ql-modal-close");
  assert.ok(close);
  await act(async()=>close.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  assert.equal(document.querySelector(".ql-modal"),null);

  await act(async()=>card.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  const overlay=document.querySelector(".ql-modal-backdrop");
  await act(async()=>overlay.dispatchEvent(new MouseEvent("mousedown",{bubbles:true})));
  assert.equal(document.querySelector(".ql-modal"),null);
  assert.equal(calls.some(r=>r.action==="qa-lottery-buy"),false,"closing popup must not charge Sparks");
  console.log("PASS QA Lottery compact tile, popup portal, official prizes, refresh, Escape, close and no accidental purchase");
} finally {
  await act(async()=>root.unmount());
  globalThis.fetch=oldFetch;
  dom.window.close();
  for(const [key,descriptor] of Object.entries(initial))descriptor
    ?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];
  await rm(work,{recursive:true,force:true});
}
