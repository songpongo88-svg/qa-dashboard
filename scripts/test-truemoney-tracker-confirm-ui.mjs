import assert from "node:assert/strict";
import {readFile,mkdir,mkdtemp,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import React,{act} from "react";
import {JSDOM} from "jsdom";

await mkdir(resolve("node_modules/.cache"),{recursive:true});
const tmp=await mkdtemp(resolve("node_modules/.cache/truemoney-confirm-"));
const dom=new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>",{
  url:"https://qa-dashboard.test",pretendToBeVisual:true,
});
for(const name of ["window","document","HTMLElement","MutationObserver","Event","MouseEvent"])globalThis[name]=dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const realFetch=globalThis.fetch;
const itemId="tm-confirm-test-123456",phone="0800000000";
let status="pending",markOutcome="success",markCalls=0,listCalls=0;
const result=(data,ok=true)=>({ok,json:async()=>data});
globalThis.fetch=async (url,options={})=>{
  assert.equal(url,"/api/sparks-admin");
  const body=JSON.parse(options.body);
  assert.equal(body.actorUsername,"test-admin");
  assert.equal(body.sessionId,"admin-session-test");
  if(body.action==="list-truemoney-tracker"){
    listCalls++;
    return result({requests:[{requestId:itemId,itemId,username:"test-user",displayName:"Test User",
      phone,amountTHB:20,status,createdAt:"2026-11-06T01:00:00Z",dueDate:"2026-11-26"}]});
  }
  assert.equal(body.action,"mark-truemoney-paid");
  assert.equal(body.itemId,itemId);
  markCalls++;
  if(markOutcome==="quota")return result({error:"Firestore daily quota exceeded"},false);
  status="paid";
  return result({updated:true,status:"paid"});
};
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.querySelector("#app"));
const click=async (element)=>{
  assert.ok(element,"click target must exist");
  await act(async()=>element.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true})));
};
try{
  const css=await readFile("src/qaSparks.css","utf8");
  assert.match(css,/qa-money-tracker-confirm-overlay\{z-index:2147483600;pointer-events:auto/);
  const compiled=resolve(tmp,"TrueMoneyTracker.mjs");
  await build({entryPoints:["src/TrueMoneyTracker.tsx"],outfile:compiled,bundle:true,
    platform:"node",format:"esm",packages:"external",logLevel:"silent"});
  const {default:Tracker}=await import(pathToFileURL(compiled).href);
  const render=async adminReady=>await act(async()=>root.render(
    React.createElement(Tracker,{actorUsername:"test-admin",sessionId:"admin-session-test",adminReady})));
  await render(true);
  await click([...document.querySelectorAll(".qa-money-tracker button")].find(x=>x.textContent.includes("รีเฟรช Tracker")));
  assert.equal(listCalls,1);
  await click(document.querySelector(".qa-money-tracker-request button"));
  let overlay=document.querySelector(".qa-money-tracker-confirm-overlay");
  assert.ok(overlay,"explicit confirmation dialog opens");
  assert.equal(overlay.parentElement,document.body,"dialog must be a top-level portal outside Dashboard stacking contexts");
  assert.equal(document.querySelectorAll('[role="dialog"]').length,1);
  const action=()=>document.querySelector('[data-truemoney-confirm-action="paid"]');
  assert.ok(action());
  assert.equal(action().disabled,false);
  assert.equal(markCalls,0,"opening the dialog must not mark money paid");
  await click(action());
  assert.equal(markCalls,1,"click must dispatch one authenticated status change");
  assert.equal(document.querySelector(".qa-money-tracker-confirm-overlay"),null,"successful result closes dialog");
  assert.match(document.querySelector(".qa-money-tracker").textContent,/บันทึกว่าโอน TrueMoney 20 บาทสำเร็จแล้ว/);
  assert.equal(document.querySelectorAll(".qa-money-tracker-request").length,0,"completed item leaves the pending filter");
  await click([...document.querySelectorAll(".qa-money-tracker-filters button")].find(x=>x.textContent==="โอนแล้ว"));
  assert.match(document.querySelector(".qa-money-tracker-request").textContent,/โอนแล้ว/,"paid request appears under its new status");
  markOutcome="quota";status="pending";
  await click([...document.querySelectorAll(".qa-money-tracker button")].find(x=>x.textContent.includes("รีเฟรช Tracker")));
  await click([...document.querySelectorAll(".qa-money-tracker-filters button")].find(x=>x.textContent==="รอโอน"));
  await click(document.querySelector(".qa-money-tracker-request button"));
  await click(action());
  assert.equal(markCalls,2);
  overlay=document.querySelector(".qa-money-tracker-confirm-overlay");
  assert.ok(overlay,"failure must leave dialog open");
  assert.match(overlay.querySelector('[role="alert"]').textContent,/Firestore daily quota exceeded/,"show API error in same dialog");
  assert.ok(action()&&!action().disabled,"retry remains possible after transient failure");
  await render(false);
  assert.equal(action().disabled,true,"authorization loss disables submit");
  const before=markCalls;
  await click(action());
  assert.equal(markCalls,before,"disabled control must not send mutation");
  await click([...overlay.querySelectorAll("button")].find(x=>x.textContent==="ยกเลิก"));
  assert.equal(document.querySelector(".qa-money-tracker-confirm-overlay"),null);
  console.log("PASS TrueMoney confirmation: body portal receives click, one mark-paid request, success UI, API error visible, authorization guard, cancellation");
}finally{
  await act(async()=>root.unmount());
  globalThis.fetch=realFetch;
  dom.window.close();
  await rm(tmp,{recursive:true,force:true});
}
