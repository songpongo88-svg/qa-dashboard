import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import React,{act} from "react";
import {JSDOM} from "jsdom";
await mkdir(resolve("node_modules/.cache"),{recursive:true});
const work=await mkdtemp(resolve("node_modules/.cache/mini-items-"));
const dom=new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",{
  url:"https://qa-dashboard.test",pretendToBeVisual:true,
});
for(const k of ["window","document","HTMLElement","MutationObserver","Event","MouseEvent"])globalThis[k]=dom.window[k];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const realFetch=globalThis.fetch;
const redeemedAt="2026-11-05T05:00:00Z";
const claimItem={itemId:"tm-test-claim-2026-123456",rewardId:"truemoney-20-thb",status:"unused",
  redeemedAt,expiresAt:"2026-12-05T05:00:00Z",valueTHB:20};
const usedItem={itemId:"tm-test-used-2026-123456",rewardId:"truemoney-20-thb",status:"requested",
  redeemedAt,expiresAt:"2026-12-05T05:00:00Z",valueTHB:20};
globalThis.fetch=async (_url,options)=>{
  const body=JSON.parse(options.body);
  assert.equal(body.action,"list-my-truemoney","only an authenticated inventory read is allowed in this UI test");
  return {ok:true,json:async()=>body.actorUsername==="empty"?
    {items:[],requests:[]} : {items:[claimItem,usedItem],requests:[{
      requestId:usedItem.itemId,itemId:usedItem.itemId,status:"pending",
      dueDate:"2026-11-25",createdAt:redeemedAt,amountTHB:20,
      phoneMasked:"******5678",
    }]}};
};
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.getElementById("root"));
const wait=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,0));});};
const click=async(el)=>{assert.ok(el);await act(async()=>el.dispatchEvent(new MouseEvent("click",{bubbles:true})));};
try{
  const moneyFile=resolve(work,"TrueMoney.mjs");
  const typingFile=resolve(work,"TypingRelief.mjs");
  await build({entryPoints:["src/TrueMoneyReward.tsx"],outfile:moneyFile,bundle:true,platform:"node",
    format:"esm",packages:"external",logLevel:"silent"});
  await build({entryPoints:["src/TypingReliefRewardCard.tsx"],outfile:typingFile,bundle:true,
    platform:"node",format:"esm",packages:"external",logLevel:"silent"});
  const Money=(await import(pathToFileURL(moneyFile).href)).default;
  const Typing=(await import(pathToFileURL(typingFile).href)).default;
  await act(async()=>root.render(React.createElement(Money,{
    username:"empty",sessionId:"session",balance:0,loaded:true,mode:"inventory",
  })));
  await wait();
  assert.ok(document.querySelector('[data-items-empty="true"]'),"unredeemed member sees only a genuine empty inventory state");
  assert.equal(document.querySelectorAll('[data-owned-item]').length,0);
  assert.equal(document.querySelectorAll('.qa-money-item').length,0,"long cards must not return");
  await act(async()=>root.render(React.createElement(Money,{
    username:"itemowner",sessionId:"session",balance:0,loaded:true,mode:"inventory",
  })));
  await wait();
  assert.equal(document.querySelectorAll('[data-owned-item]').length,2,"each redeemed TrueMoney item has its own tile");
  assert.equal(document.querySelectorAll('.qa-sparks-mini-art').length,2);
  assert.equal(document.querySelector('[data-items-empty="true"]'),null);
  assert.equal(document.querySelectorAll('.qa-money-item').length,0);
  await click(document.querySelector('[data-owned-item="'+usedItem.itemId+'"]'));
  let modal=document.querySelector(".qa-money-modal");
  assert.ok(modal);
  assert.ok(modal.textContent.includes("กำหนดได้รับเงินภายใน"));
  assert.ok(modal.textContent.includes("******5678"),"member can inspect masked phone in the item dialog");
  assert.equal(modal.querySelector("#qa-money-phone"),null,"already used item must not be reusable");
  assert.ok(!modal.textContent.includes("Firestore")&&!modal.textContent.includes("เข้าระบบ Tracker"),
    "member detail must not expose backend infrastructure");
  await click(modal.querySelector(".qa-money-modal-close"));
  await click(document.querySelector('[data-owned-item="'+claimItem.itemId+'"]'));
  modal=document.querySelector(".qa-money-modal");
  assert.ok(modal.querySelector("#qa-money-phone"),"unused item prompts for receiving number");
  assert.ok(modal.textContent.includes("หมดอายุ"));
  await click(modal.querySelector(".qa-money-modal-close"));

  await act(async()=>root.render(React.createElement(Typing,{
    username:"itemowner",sessionId:"session",balance:500,owned:2,loaded:true,mode:"inventory",
  })));
  const typingTile=document.querySelector('[data-reward-item="typing-relief"]');
  assert.ok(typingTile?.classList.contains("qa-sparks-mini-item"));
  assert.ok(typingTile?.textContent.includes("2 สิทธิ์"));
  await click(typingTile);
  modal=document.querySelector(".qa-sparks-reward-detail-modal");
  assert.ok(modal?.textContent.includes("คุณมี 2 สิทธิ์"));
  assert.equal(modal?.querySelector(".qa-sparks-reward-detail-primary"),null,
    "owned Typing Relief only explains usage; it cannot sell another item from My Items");
  console.log("PASS My Items: empty until redeemed, 2 individual compact TrueMoney tiles, used/unused details, owned Typing Relief details only");
}finally{
  await act(async()=>root.unmount());
  globalThis.fetch=realFetch;dom.window.close();
  await rm(work,{recursive:true,force:true});
}