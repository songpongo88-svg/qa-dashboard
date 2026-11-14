import assert from "node:assert/strict";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import React,{act} from "react";
import {JSDOM} from "jsdom";

// Only a redacted, fictional OCR fixture is used here. No user's bank slip is in the repository.
const fixture=[
  "Bangkok Bank","รายการสำเร็จ","03 ก.พ. 69, 14:40",
  "จำนวนเงิน","1,405.00 THB","จาก",
  "นาย ตัวอย่าง ทดสอบ","050-0-xxx771","ธนาคารกรุงเทพ",
  "ไปที่","นางสาว ตัวอย่าง ผู้รับ","430-1-xxx497","ธนาคารไทยพาณิชย์",
  "ค่าธรรมเนียม 0.00 THB","หมายเลขอ้างอิง","631438",
  "เลขที่อ้างอิง","2026020314403024006233008"
].join("\n");

await mkdir(resolve("node_modules/.cache"),{recursive:true});
const tmp=await mkdtemp(resolve("node_modules/.cache/qa-sparks-slip-ui-"));
const dom=new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",{
  url:"https://qa-dashboard.test",pretendToBeVisual:true
});
const oldGlobals={};
for(const key of ["window","document","HTMLElement","MutationObserver","Event","MouseEvent","File","FileReader"]){
  oldGlobals[key]=Object.getOwnPropertyDescriptor(globalThis,key);
  globalThis[key]=dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let fetchCount=0,workerCount=0,terminated=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{fetchCount++;throw Error("Read-only slip test must not make a server request");};

try{
  const path=resolve(tmp,"tester.mjs");
  await build({
    entryPoints:["src/SparksSlipOcrTester.tsx"],outfile:path,bundle:true,
    platform:"node",format:"esm",packages:"external",loader:{".css":"empty"},
    logLevel:"silent",
    plugins:[{name:"in-memory-ocr-fixture",setup(builder){
      builder.onResolve({filter:/^tesseract\.js$/},()=>({path:"tesseract",namespace:"test-ocr"}));
      builder.onLoad({filter:/.*/,namespace:"test-ocr"},()=>({
        loader:"js",
        contents:'export const PSM={SPARSE_TEXT:11};export async function createWorker(){globalThis.__payoutWorkerCreated();return {setParameters:async()=>{},recognize:async()=>({data:{text:globalThis.__payoutFixture()}}),terminate:async()=>globalThis.__payoutWorkerTerminated()};}'
      }));
    }}]
  });
  globalThis.__payoutWorkerCreated=()=>{workerCount++};
  globalThis.__payoutFixture=()=>fixture;
  globalThis.__payoutWorkerTerminated=()=>{terminated++};

  const {createRoot}=await import("react-dom/client");
  const {default:SlipTester}=await import(pathToFileURL(path).href);
  const root=createRoot(document.getElementById("root"));
  await act(async()=>{root.render(React.createElement(SlipTester));});
  assert.ok(document.querySelector('[data-sparks-slip-test="read-only"]'));
  assert.equal(document.querySelector(".sa-slip-test-results"),null,"No pretend result before selecting a file");

  const input=document.querySelector('input[type="file"]');
  const sample=new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0])],"redacted-slip.png",{type:"image/png"});
  Object.defineProperty(input,"files",{configurable:true,value:[sample]});
  await act(async()=>{
    input.dispatchEvent(new Event("change",{bubbles:true}));
    await new Promise(done=>setTimeout(done,75));
  });
  for(let retry=0;retry<20&&!document.querySelector(".sa-slip-test-results");retry++){
    await act(async()=>{await new Promise(done=>setTimeout(done,20));});
  }
  const text=document.querySelector(".sa-slip-test-results")?.textContent||"";
  assert.match(text,/1,405\.00/, "read and display full transfer amount");
  assert.match(text,/631438/, "read and display the short bank reference");
  assert.match(text,/2026020314403024006233008/, "read and display the long bank reference");
  assert.match(text,/430-1-xxx497/, "read and display only the masked recipient account");
  assert.match(text,/ไทยพาณิชย์/, "read and display the destination bank");
  assert.match(text,/14:40/, "read and display Thai date and time");
  assert.equal(workerCount,1,"one OCR worker runs in browser");
  assert.equal(terminated,1,"OCR worker is closed after reading");
  assert.equal(fetchCount,0,"preview-only OCR does not call a payment or cloud API");
  assert.equal(document.querySelectorAll('button[data-reward-confirm-submit]').length,0,"read-only OCR has no Paid action");

  await act(async()=>{root.unmount();});
  console.log("PASS QA Sparks sample slip upload UI: reads fields, no payouts, no cloud requests, worker closed");
}finally{
  globalThis.fetch=originalFetch;
  delete globalThis.__payoutWorkerCreated;
  delete globalThis.__payoutFixture;
  delete globalThis.__payoutWorkerTerminated;
  dom.window.close();
  for(const [key,descriptor] of Object.entries(oldGlobals)){
    if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
  await rm(tmp,{recursive:true,force:true});
}
