import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";

await mkdir(resolve("node_modules/.cache"),{recursive:true});
const work=await mkdtemp(resolve("node_modules/.cache/checkin-ui-"));
const dom=new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",{
  url:"https://qa-dashboard.test",pretendToBeVisual:true,
});
const initial={};
for(const key of ["window","document","HTMLElement","MutationObserver","Event","MouseEvent"]) {
  initial[key]=Object.getOwnPropertyDescriptor(globalThis,key);
  globalThis[key]=dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const RealDate=globalThis.Date;
let fakeTime="2026-11-08T05:00:00.000Z";
class FakeDate extends RealDate{
  constructor(...args){super(...(args.length?args:[fakeTime]));}
  static now(){return new RealDate(fakeTime).getTime();}
}
globalThis.Date=FakeDate;
const oldFetch=globalThis.fetch;
const calls=[];
let claimed=[];
globalThis.fetch=async (url,opts)=>{
  assert.equal(url,"/api/sparks-admin");
  const body=JSON.parse(opts.body);
  calls.push(body);
  claimed=[...claimed,Number(body.questDate.slice(-2))];
  return {ok:true,json:async()=>({updated:true,questDate:body.questDate,claimedDays:claimed,balance:200+claimed.length*50,memberYearEarned:200+claimed.length*50})};
};
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.querySelector("#root"));
try{
  const bundle=resolve(work,"Checkin.mjs");
  await build({entryPoints:["src/DailyCheckinQuest.tsx"],outfile:bundle,
    bundle:true,platform:"node",format:"esm",packages:"external",logLevel:"silent"});
  const mod=await import(pathToFileURL(bundle).href);
  assert.equal(mod.CHECKIN_DAYS.length,14);
  assert.equal(mod.checkinDayKey(9),"2026-11-09");
  assert.equal(mod.checkinDayKey(22),"2026-11-22");
  assert.equal(mod.bangkokQuestToday(new RealDate("2026-11-08T16:59:59Z")),"2026-11-08");
  assert.equal(mod.bangkokQuestToday(new RealDate("2026-11-08T17:00:00Z")),"2026-11-09");
  assert.equal(mod.checkinStatus(10,"2026-11-11",[]),"missed");
  assert.equal(mod.checkinStatus(11,"2026-11-11",[]),"today");
  assert.equal(mod.checkinStatus(12,"2026-11-11",[]),"future");
  assert.equal(mod.checkinStatus(9,"2026-11-11",[9]),"claimed");

  await act(async()=>root.render(React.createElement(mod.default,{
    username:"Agent",sessionId:"agent-checkin-test-session-1234",claimedDays:[],loaded:true,
  })));
  const card=document.querySelector('[data-quest-item="daily-checkin"]');
  assert.ok(card);
  assert.ok(card.textContent.includes("Daily Check-in"));
  assert.ok(card.textContent.includes("+50"));
  assert.ok(card.textContent.includes("9–22 พ.ย."), "compact item shows short event date; full date remains inside popup");
  await act(async()=>card.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  const modal=document.querySelector(".qa-sparks-checkin-modal");
  assert.ok(modal);
  assert.equal(modal.getAttribute("aria-modal"),"true");
  assert.equal(modal.querySelectorAll(".qa-sparks-checkin-day").length,14);
  assert.equal(modal.querySelectorAll(".qa-sparks-checkin-weekday").length,7);
  assert.equal(modal.querySelectorAll(".qa-sparks-checkin-day:not(:disabled)").length,0,"Nov 8 cannot claim early");
  fakeTime="2026-11-09T05:00:00.000Z";
  await act(async()=>window.dispatchEvent(new Event("focus")));
  assert.equal(modal.querySelectorAll(".qa-sparks-checkin-day:not(:disabled)").length,1);
  const day9=modal.querySelector(".qa-sparks-checkin-day.today");
  assert.ok(day9);
  assert.ok(day9.textContent.includes("รับ +50"));
  await act(async()=>day9.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  assert.equal(calls.length,1);
  assert.equal(calls[0].questDate,"2026-11-09");
  assert.equal(calls[0].action,"claim-daily-checkin");
  assert.ok(modal.querySelector(".qa-sparks-checkin-day.claimed"));
  assert.equal(modal.querySelectorAll(".qa-sparks-checkin-day:not(:disabled)").length,0);
  assert.ok(modal.textContent.includes("50"));
  fakeTime="2026-11-11T05:00:00.000Z";
  await act(async()=>window.dispatchEvent(new Event("focus")));
  assert.equal(modal.querySelectorAll(".qa-sparks-checkin-day:not(:disabled)").length,1);
  assert.equal(modal.querySelectorAll(".qa-sparks-checkin-day.missed").length,1,"unclaimed Nov10 must be missed");
  await act(async()=>modal.querySelector(".qa-sparks-checkin-day.today").dispatchEvent(new MouseEvent("click",{bubbles:true})));
  assert.equal(calls[1].questDate,"2026-11-11","missed day does not block later date");
  assert.equal(modal.querySelectorAll(".qa-sparks-checkin-day.claimed").length,2);
  assert.equal(modal.querySelectorAll(".qa-sparks-checkin-day:not(:disabled)").length,0);
  await act(async()=>modal.querySelector(".qa-sparks-checkin-close").dispatchEvent(new MouseEvent("click",{bubbles:true})));
  assert.equal(document.querySelector(".qa-sparks-checkin-modal"),null);
  console.log("PASS Quest UI: 14-cell calendar, future lock, active day only, click-to-claim, missed dates and saved stamps");
} finally{
  await act(async()=>root.unmount());
  globalThis.Date=RealDate;globalThis.fetch=oldFetch;
  dom.window.close();
  for(const [key,descriptor] of Object.entries(initial)) descriptor
    ? Object.defineProperty(globalThis,key,descriptor)
    : delete globalThis[key];
  await rm(work,{recursive:true,force:true});
}
