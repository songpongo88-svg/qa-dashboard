import assert from "node:assert/strict";
import { mkdir,mkdtemp,rm } from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import React,{act} from "react";
import {JSDOM} from "jsdom";
await mkdir(resolve("node_modules/.cache"),{recursive:true});
const dir=await mkdtemp(resolve("node_modules/.cache/suphitcha-admin-ui-"));
const dom=new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",{
 url:"https://qa-dashboard.test",pretendToBeVisual:true,
});
for(const key of ["window","document","HTMLElement","MutationObserver","Event","MouseEvent"])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const originalFetch=globalThis.fetch;
let corrected=false, requestBody=null, requests=0;
const user=(username)=>({
 username, displayName:username==="Suphitcha"?"Suphitcha Keawliam":"Other User",
 role:"Senior",status:"Active",balance:corrected?500:200,
 earned:500,spent:corrected?0:300,rewardOrders:corrected?0:1,
 firstLogin:{amount:500,cardName:"Peach Bliss",claimedAt:"2026-11-05T03:00:00Z"},
});
const redeemId="redeem-testing-uuid-12345678901234";
const activationId="typing-relief-use-"+"a".repeat(40);
const deductId="admin-deduct-test-20261105-123456";
function history(){
 const rows=[
  {id:"first-login-welcome-v1",source:"first-login-reward",title:"First Login Reward",
   amount:500,type:"earn",status:"Completed",balanceAfter:500},
  {id:redeemId,source:"reward-redemption",title:"Typing Relief Redeemed",
   amount:corrected?0:-150,originalAmount:-150,voided:corrected,
   type:"spend",status:corrected?"Voided":"Completed",balanceAfter:350},
  {id:activationId,source:"reward-activation",title:"Typing Relief Activated",
   amount:0,originalAmount:0,voided:corrected,
   type:"earn",status:corrected?"Voided":"Completed",balanceAfter:350},
  {id:deductId,source:"admin-deduct",title:"Admin Deducted Sparks",
   amount:corrected?0:-150,originalAmount:-150,voided:corrected,
   type:"spend",status:corrected?"Voided":"Completed",balanceAfter:200},
 ];
 return rows.map(x=>({createdAt:"2026-11-05T07:00:00Z",detail:"ทดลองระบบ",
  performedBy:"songpon",reason:"ทดลองระบบ",referenceId:"",...x}));
}
globalThis.fetch=async(url,opts)=>{
 assert.equal(url,"/api/sparks-admin");
 const req=JSON.parse(opts.body);requests++;
 assert.equal(req.actorUsername,"Songpon");
 assert.equal(req.sessionId,"songpon-mock-session");
 let payload={};
 if(req.action==="list")payload={users:[user("Suphitcha"),user("Other")],truncated:false};
 else if(req.action==="history")payload={
  username:req.targetUsername,wallet:user(req.targetUsername),history:history(),truncated:false,
 };
 else if(req.action==="void-suphitcha-typing-test"){
  requestBody=req;corrected=true;
  payload={updated:true,balance:500,earned:500,spent:0,rewardOrders:0};
 }else throw Error("unexpected action "+req.action);
 return {ok:true,json:async()=>payload};
};
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.getElementById("root"));
const flush=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,0));});};
const click=async(element)=>{
 assert.ok(element,"missing button");
 await act(async()=>element.dispatchEvent(new MouseEvent("click",{bubbles:true})));
 await flush();
};
try{
 const output=resolve(dir,"SparkAdmin.mjs");
 const modules=new Map([
  ["./userRoleStore",`export async function fetchStoredUserProfiles(){return [];}`],
  ["./qaSparksStore",`export async function getSparksAccount(){return {balance:0,history:[]};}`],
  ["./firebaseClient",`export const firebaseDb={};`],
  ["firebase/firestore",`export const collection=()=>({});export const getDocsFromCache=async()=>({docs:[]});`],
 ]);
 await build({entryPoints:["src/SparksAdminPanel.tsx"],outfile:output,
  platform:"node",bundle:true,format:"esm",packages:"external",
  loader:{".css":"empty"},logLevel:"silent",
  plugins:[{name:"mock-sparks-admin-dependencies",setup(b){
   b.onResolve({filter:/^(\.\/userRoleStore|\.\/qaSparksStore|\.\/firebaseClient|firebase\/firestore)$/},(args)=>({
     path:args.path,namespace:"admin-ui-mock",
   }));
   b.onLoad({filter:/.*/,namespace:"admin-ui-mock"},(args)=>({
     contents:modules.get(args.path),loader:"js",
   }));
  }}],
 });
 const {default:Panel}=await import(pathToFileURL(output).href);
 await act(async()=>root.render(React.createElement(Panel,{
  actorUsername:"Songpon",sessionId:"songpon-mock-session",ownAccount:null,
 })));
 await flush();
 let correction=document.querySelector('[data-sparks-correction="suphitcha"]');
 assert.ok(correction,"correction button must show only for this exact reward test pair and deduction");
 const selectOther=[...document.querySelectorAll(".qa-sparks-admin-list button")].find(x=>x.textContent.includes("Other User"));
 await click(selectOther);
 assert.equal(document.querySelector('[data-sparks-correction="suphitcha"]'),null,
  "must never expose specific fix for a different account");
 const selectSuphitcha=[...document.querySelectorAll(".qa-sparks-admin-list button")].find(x=>x.textContent.includes("Suphitcha Keawliam"));
 await click(selectSuphitcha);
 correction=document.querySelector('[data-sparks-correction="suphitcha"]');
 await click(correction);
 assert.ok(document.querySelector("#qa-sparks-typing-reset-title"),"requires explicit confirmation dialog");
 const button=[...document.querySelectorAll(".qa-sparks-admin-dialog button")].find(x=>x.textContent.includes("ยืนยันคืนยอด 500 Sparks"));
 await click(button);
 assert.equal(requestBody?.action,"void-suphitcha-typing-test");
 assert.equal(requestBody?.targetUsername,"Suphitcha");
 assert.equal(requestBody?.redemptionHistoryId,redeemId);
 assert.equal(requestBody?.activationHistoryId,activationId);
 assert.equal(requestBody?.deductionHistoryId,deductId);
 assert.equal(document.querySelector('[data-sparks-correction="suphitcha"]'),null,"fix becomes unavailable after correction");
 assert.ok(document.body.textContent.includes("คงเหลือ 500"),"show completion notice");
 assert.ok(requests>=3);
 console.log("PASS Suphitcha UI: exact 500-point reward test shows correction only for this user; confirm sends all three IDs");
}finally{
 await act(async()=>root.unmount());
 globalThis.fetch=originalFetch;
 dom.window.close();
 await rm(dir,{recursive:true,force:true});
}
