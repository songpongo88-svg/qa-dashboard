import assert from "node:assert/strict";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import React,{act} from "react";
import {JSDOM} from "jsdom";

await mkdir(resolve("node_modules/.cache"),{recursive:true});
const folder=await mkdtemp(resolve("node_modules/.cache/special-confirm-"));
const dom=new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>",{
  url:"https://qa-dashboard.test",pretendToBeVisual:true,
});
const previous={};
for(const name of ["window","document","HTMLElement","MutationObserver","Event","MouseEvent","KeyboardEvent"]){
  previous[name]=Object.getOwnPropertyDescriptor(globalThis,name);
  globalThis[name]=dom.window[name];
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const oldFetch=globalThis.fetch;
dom.window.confirm=()=>{throw Error("browser confirmation is forbidden");};
const rows=[
 {requestId:"sr-punthai-00001",itemId:"sr-punthai-00001",rewardId:"punthai-65",
  title:"เครื่องดื่มพันธุ์ไทย",username:"qauser",displayName:"QA User",
  status:"approved",createdAt:"2026-11-06T09:00:00Z",receiptNumber:"PT12345678",payoutTHB:65,promptPay:"0801234567"},
 {requestId:"sr-netflix-00002",itemId:"sr-netflix-00002",rewardId:"netflix-1m",
  title:"Netflix 1 เดือน",username:"qauser2",displayName:"Netflix User",
  status:"approved",createdAt:"2026-11-06T09:00:00Z",email:"netflix@example.com"}
];
let marks=0,outcome="success",lists=0;
globalThis.fetch=async (url,options)=>{
  assert.equal(url,"/api/sparks-admin");
  const data=JSON.parse(options.body);
  assert.equal(data.actorUsername,"test-admin");
  if(data.action==="special-rewards-admin-list"){
    lists++;
    return {ok:true,json:async()=>({requests:rows})};
  }
  assert.equal(data.action,"special-rewards-admin-action");
  assert.equal(data.decision,"complete");
  marks++;
  if(outcome==="error")return {ok:false,status:409,json:async()=>({error:"Server rejected request"})};
  const row=rows.find(r=>r.itemId===data.itemId);
  row.status=row.rewardId==="netflix-1m"?"delivered":"paid";
  return {ok:true,json:async()=>({updated:true,status:row.status})};
};
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.getElementById("app"));
const click=async el=>{
  assert.ok(el,"click target missing");
  await act(async()=>el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true})));
};
const popup=()=>document.querySelector('dialog.reward-confirm-modal[data-reward-confirm-overlay="true"][role="dialog"]');
try{
  const out=resolve(folder,"SpecialRewardsAdmin.mjs");
  await build({entryPoints:["src/SpecialRewardsAdmin.tsx"],outfile:out,bundle:true,
    platform:"node",format:"esm",packages:"external",loader:{".css":"empty"},logLevel:"silent"});
  const {default:Admin}=await import(pathToFileURL(out).href);
  await act(async()=>root.render(React.createElement(Admin,{actorUsername:"test-admin",sessionId:"admin-session-test",adminReady:true})));
  await click([...document.querySelectorAll(".sr-admin button")].find(b=>b.textContent.includes("รีเฟรชคำขอ")));
  assert.equal(lists,1);
  const cards=[...document.querySelectorAll(".sr-admin-card")];
  assert.equal(cards.length,2);
  await click([...cards[0].querySelectorAll("button")].find(b=>b.textContent.includes("ยืนยันว่าโอนเงินจริงแล้ว")));
  assert.ok(popup(),"approved reimbursement opens custom modal");
  assert.ok(popup().textContent.includes("เครื่องดื่มพันธุ์ไทย"));
  assert.ok(popup().textContent.includes("QA User"));
  assert.ok(popup().textContent.includes("65 บาท"));
  assert.ok(popup().textContent.includes("0801234567"));
  assert.ok(popup().querySelector("img"),"reward brand image included");
  assert.equal(marks,0);
  await click(popup().querySelector(".reward-confirm-cancel"));
  assert.equal(popup(),null);assert.equal(marks,0);
  await click([...cards[0].querySelectorAll("button")].find(b=>b.textContent.includes("ยืนยันว่าโอนเงินจริงแล้ว")));
  assert.ok(popup().querySelector('input[type="file"]'),"cash reimbursement must request a transfer slip");
  assert.equal(popup().querySelector('[data-reward-confirm-submit]').disabled,true);
  assert.equal(marks,0,"reimbursement cannot be marked paid without a slip");
  await click(popup().querySelector(".reward-confirm-cancel"));
  await click([...cards[1].querySelectorAll("button")].find(b=>b.textContent.includes("ยืนยันส่งสิทธิ์ Netflix แล้ว")));
  assert.ok(popup());
  assert.ok(popup().textContent.includes("Netflix 1 เดือน"));
  assert.ok(popup().textContent.includes("Netflix User"));
  assert.ok(popup().textContent.includes("netflix@example.com"));
  assert.ok(popup().textContent.includes("ส่งสิทธิ์"));
  assert.equal(marks,0);
  await click(popup().querySelector('[data-reward-confirm-submit]'));
  assert.equal(marks,1);
  assert.equal(popup(),null);
  assert.match(document.querySelector(".sr-admin").textContent,/delivered/);
  console.log("PASS Reward Admin: independent branded confirmations for Punthai reimbursement and Netflix email, cancel/no-charge, server error and exact status");
}finally{
  await act(async()=>root.unmount());
  globalThis.fetch=oldFetch;
  dom.window.close();
  for(const [name,d] of Object.entries(previous)){if(d)Object.defineProperty(globalThis,name,d);else delete globalThis[name];}
  await rm(folder,{recursive:true,force:true});
}
