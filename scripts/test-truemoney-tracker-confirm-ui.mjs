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
const itemId="tm-inline-test-123456",phone="0800000000";
let status="pending",markOutcome="success",markCalls=0,listCalls=0;
const result=(data,ok=true)=>({ok,status:ok?200:429,json:async()=>data});
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
const click=async element=>{
  assert.ok(element,"click target must exist");
  await act(async()=>element.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true})));
};
const btn=text=>[...document.querySelectorAll(".qa-money-tracker button")].find(x=>x.textContent.includes(text));
const confirm=()=>document.querySelector(".qa-money-tracker-inline-confirm");
const action=()=>document.querySelector(".qa-money-tracker-mark-paid");
try{
  const css=await readFile("src/qaSparks.css","utf8");
  assert.match(css,/\.qa-money-tracker-inline-confirm\{/);
  const compiled=resolve(tmp,"TrueMoneyTracker.mjs");
  await build({entryPoints:["src/TrueMoneyTracker.tsx"],outfile:compiled,bundle:true,
    platform:"node",format:"esm",packages:"external",logLevel:"silent"});
  const {default:Tracker}=await import(pathToFileURL(compiled).href);
  const render=async adminReady=>await act(async()=>root.render(
    React.createElement(Tracker,{actorUsername:"test-admin",sessionId:"admin-session-test",adminReady})));
  await render(true);
  await click(btn("รีเฟรช Tracker"));
  assert.equal(listCalls,1);
  await click(btn("ยืนยันโอนสำเร็จ"));
  assert.ok(confirm(),"inline confirmation must open under its Tracker row");
  assert.equal(confirm().parentElement.className,"qa-money-tracker-request","confirmation must stay in same clickable row");
  assert.equal(document.querySelectorAll('[role="dialog"]').length,0,"no popup or overlay for confirmation");
  assert.equal(action().disabled,false);
  assert.equal(markCalls,0,"first click only opens confirmation and never transfers or changes status");
  await click(action());
  assert.equal(markCalls,1,"second explicit click must dispatch one admin status change");
  assert.equal(confirm(),null,"success closes inline confirmation");
  assert.match(document.querySelector(".qa-money-tracker").textContent,/บันทึกสถานะว่าโอน TrueMoney 20 บาทสำเร็จแล้ว/);
  assert.equal(document.querySelectorAll(".qa-money-tracker-request").length,0,"paid item leaves Pending filter");
  await click(btn("โอนแล้ว"));
  assert.match(document.querySelector(".qa-money-tracker-request").textContent,/โอนแล้ว/,"paid item remains visible under Paid filter");
  assert.equal(listCalls,1,"confirmed result must not need a second Firestore read");
  markOutcome="quota";status="pending";
  await click(btn("รีเฟรช Tracker"));
  await click(btn("รอโอน"));
  await click(btn("ยืนยันโอนสำเร็จ"));
  await click(action());
  assert.equal(markCalls,2);
  assert.ok(confirm(),"failed status change must keep the inline confirmation open");
  assert.match(confirm().querySelector('[role="alert"]').textContent,/Firestore daily quota exceeded/,"show backend quota error right next to the button");
  assert.ok(action()&&!action().disabled,"retry remains possible after a server failure");
  await render(false);
  assert.equal(action().disabled,true,"admin authorization loss disables mutation");
  const before=markCalls;
  await click(action());
  assert.equal(markCalls,before,"disabled confirmation cannot mutate status");
  await click(btn("ยกเลิก"));
  assert.equal(confirm(),null);
  assert.equal(document.querySelectorAll('[role="dialog"]').length,0);
  console.log("PASS TrueMoney inline confirmation: two-step click, one mark-paid request, Paid filter, quota error, disabled authorization, cancel");
}finally{
  await act(async()=>root.unmount());
  globalThis.fetch=realFetch;
  dom.window.close();
  await rm(tmp,{recursive:true,force:true});
}
