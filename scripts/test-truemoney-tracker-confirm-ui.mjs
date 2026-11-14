import assert from "node:assert/strict";
import {mkdir,mkdtemp,rm,readFile} from "node:fs/promises";
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
  const popupSource=await readFile("src/RewardActionConfirmModal.tsx","utf8");
  assert.ok(popupSource.includes("modal.showModal()"),"showModal must be called on opening the payout dialog");
  assert.ok(!popupSource.includes('<div className="reward-confirm-backdrop"'),
    "avoid nested browser top-layer dialog and competing fixed overlay");
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
  assert.equal(dialog().tagName,"DIALOG","confirmation must use a native dialog in the browser top layer");
  assert.ok(dialog().hasAttribute("open"),"one click must make confirmation visibly open, not merely render a hidden dialog");
  assert.equal(document.querySelectorAll(".reward-confirm-backdrop").length,0,
    "native dialog must not be blocked by an additional full-screen overlay");
  assert.ok(dialog().textContent.includes("TrueMoney 20 บาท"));
  assert.ok(dialog().textContent.includes("Test User"));
  assert.ok(dialog().textContent.includes(phone));
  assert.ok(dialog().textContent.includes("ระบบจะบันทึกสถานะว่าโอนเงินจริงแล้ว"));
  assert.equal(markCalls,0,"opening popup does not send payout confirmation");
  assert.equal(document.body.style.overflow,"hidden");
  await click(dialog().querySelector(".reward-confirm-cancel"));
  assert.equal(dialog(),null,"cancel closes without updating");
  assert.equal(document.querySelector("dialog.reward-confirm-modal"),null,"cancel removes the modal portal");
  assert.equal(markCalls,0);
  await click(byText("ตรวจสอบและยืนยันการโอน"));
  assert.ok(dialog(),"Admin can inspect the payout before uploading");
  assert.ok(dialog().querySelector('input[type="file"]'),"slip upload input exists");
  assert.equal(dialog().querySelector('[data-reward-confirm-submit]').disabled,true,
    "confirmation blocked until slip is uploaded, scanned and reviewed");
  assert.equal(markCalls,0,"no payout API call without evidence");
  await click(dialog().querySelector(".reward-confirm-close"));
  await render(false);
  await click(byText("ตรวจสอบและยืนยันการโอน"));
  assert.ok(dialog());
  assert.equal(dialog().querySelector('[data-reward-confirm-submit]').disabled,true);
  await click(dialog().querySelector(".reward-confirm-close"));
  console.log("PASS TrueMoney: slip required, no-proof payout blocked, cancel safe");
}finally{
  await act(async()=>root.unmount());
  globalThis.fetch=originalFetch;
  dom.window.close();
  for(const [name,descriptor] of Object.entries(oldGlobals)){
    if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
  }
  await rm(tmp,{recursive:true,force:true});
}
