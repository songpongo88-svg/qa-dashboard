import assert from "node:assert/strict";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
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
const oldGlobals={};
for(const name of ["window","document","HTMLElement","MutationObserver","Event","MouseEvent","KeyboardEvent"]){
  oldGlobals[name]=Object.getOwnPropertyDescriptor(globalThis,name);
  globalThis[name]=dom.window[name];
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const originalFetch=globalThis.fetch;
const itemId="tm-payout-modal-123456",phone="0800000000";
let status="pending",outcome="success",markCalls=0,listCalls=0;
const response=(body,ok=true)=>({ok,status:ok?200:403,json:async()=>body});
globalThis.fetch=async (url,options={})=>{
  assert.equal(url,"/api/sparks-admin");
  const body=JSON.parse(options.body);
  assert.equal(body.actorUsername,"test-admin");
  assert.equal(body.sessionId,"admin-session-test");
  if(body.action==="list-truemoney-tracker"){
    listCalls++;
    return response({requests:[{requestId:itemId,itemId,username:"test-user",displayName:"Test User",
      phone,amountTHB:20,status,createdAt:"2026-11-06T01:00:00Z",dueDate:"2026-11-26"}]});
  }
  assert.equal(body.action,"mark-truemoney-paid");
  assert.equal(body.itemId,itemId);
  markCalls++;
  if(outcome==="quota")return response({error:"Firestore daily quota exceeded"},false);
  if(outcome==="unauthorized")return response({error:"Unauthorized Admin"},false);
  status="paid";
  return response({updated:true,status:"paid"});
};
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.querySelector("#app"));
const click=async node=>{
  assert.ok(node,"click target must exist");
  await act(async()=>node.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true})));
};
const byText=txt=>[...document.querySelectorAll(".qa-money-tracker button")]
  .find(el=>el.textContent.includes(txt));
const dialog=()=>document.querySelector(".reward-confirm-modal[role=dialog]");
try{
  const compiled=resolve(tmp,"TrueMoneyTracker.mjs");
  await build({entryPoints:["src/TrueMoneyTracker.tsx"],outfile:compiled,bundle:true,
    platform:"node",format:"esm",packages:"external",loader:{".css":"empty"},logLevel:"silent"});
  const {default:Tracker}=await import(pathToFileURL(compiled).href);
  const render=async adminReady=>await act(async()=>root.render(
    React.createElement(Tracker,{actorUsername:"test-admin",sessionId:"admin-session-test",adminReady})));
  await render(true);
  await click(byText("รีเฟรช Tracker"));
  assert.equal(listCalls,1);
  assert.equal(dialog(),null,"no blocking popup before request selection");
  await click(byText("ตรวจสอบและยืนยันการโอน"));
  assert.ok(dialog(),"row button opens app-owned portal");
  assert.ok(dialog().textContent.includes("TrueMoney 20 บาท"));
  assert.ok(dialog().textContent.includes("Test User"));
  assert.ok(dialog().textContent.includes(phone));
  assert.ok(dialog().textContent.includes("ระบบจะบันทึกสถานะว่าโอนเงินจริงแล้ว"));
  assert.equal(markCalls,0,"opening popup does not send payout confirmation");
  assert.equal(document.body.style.overflow,"hidden");
  await click(dialog().querySelector(".reward-confirm-cancel"));
  assert.equal(dialog(),null,"cancel closes without updating");
  assert.equal(markCalls,0);
  await click(byText("ตรวจสอบและยืนยันการโอน"));
  await click(dialog().querySelector('[data-reward-confirm-submit="true"]'));
  assert.equal(markCalls,1,"one explicit modal confirm sends one payout action");
  assert.equal(dialog(),null,"success closes popup");
  assert.match(document.querySelector(".qa-money-tracker").textContent,/บันทึกสถานะว่าโอน TrueMoney 20 บาทสำเร็จแล้ว/);
  assert.equal(document.querySelectorAll(".qa-money-tracker-request").length,0);
  await click(byText("โอนแล้ว"));
  assert.match(document.querySelector(".qa-money-tracker-request").textContent,/โอนแล้ว/);
  assert.equal(listCalls,1,"show Paid locally without wasteful extra Firestore reads");
  // An error must keep the exact same payable reward visible and allow retry.
  status="pending";outcome="quota";
  await click(byText("รีเฟรช Tracker"));
  await click(byText("รอโอน"));
  await click(byText("ตรวจสอบและยืนยันการโอน"));
  await click(dialog().querySelector('[data-reward-confirm-submit="true"]'));
  assert.equal(markCalls,2);
  assert.ok(dialog());
  assert.match(dialog().querySelector('[role="alert"]').textContent,/Firestore daily quota exceeded/);
  assert.equal(dialog().querySelector('[data-reward-confirm-submit]').disabled,false);
  await click(dialog().querySelector(".reward-confirm-close"));
  assert.equal(dialog(),null);
  // Failed parent wallet read must not permanently block the UI:
  // server still authenticates every mutation and can reject it.
  await render(false);
  await click(byText("ตรวจสอบและยืนยันการโอน"));
  assert.ok(dialog(),"user can inspect popup even when wallet listing failed");
  assert.equal(dialog().querySelector('[data-reward-confirm-submit]').disabled,false);
  outcome="unauthorized";
  await click(dialog().querySelector('[data-reward-confirm-submit]'));
  assert.equal(markCalls,3);
  assert.match(dialog().querySelector('[role="alert"]').textContent,/Unauthorized Admin/);
  assert.equal(status,"pending","server denial never marks the request paid");
  await click(dialog().querySelector(".reward-confirm-close"));
  console.log("PASS TrueMoney: branded modal displays exact item/recipient/phone, cancel safe, single server-authorized confirmation, quota retry and adminReady-independent clickable button");
}finally{
  await act(async()=>root.unmount());
  globalThis.fetch=originalFetch;
  dom.window.close();
  for(const [name,descriptor] of Object.entries(oldGlobals)){
    if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
  }
  await rm(tmp,{recursive:true,force:true});
}
