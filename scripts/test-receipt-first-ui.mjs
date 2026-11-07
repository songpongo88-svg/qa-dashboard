import assert from "node:assert/strict";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import React,{act} from "react";
import {JSDOM} from "jsdom";

await mkdir(resolve("node_modules/.cache"),{recursive:true});
const folder=await mkdtemp(resolve("node_modules/.cache/receipt-first-"));
const dom=new JSDOM("<!doctype html><body><div id='app'></div></body>",{url:"https://qa.test",pretendToBeVisual:true});
const previous={};
for(const name of ["window","document","HTMLElement","Event","MouseEvent","File"]){previous[name]=Object.getOwnPropertyDescriptor(globalThis,name);globalThis[name]=dom.window[name];}
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const originalNow=Date.now;Date.now=()=>Date.parse("2026-11-07T07:50:00Z");
const fullText="7-Eleven\nReceipt No: 7110000001\n07/11/69 13:12:27\nยอดสุทธิ 4 ชิ้น 114.00";
let scanText=fullText,duplicate=false,browserText="",browserCalls=0,scanCalls=0,checkCalls=0,submitCalls=[],hold=false,delayed=null;
globalThis.__receiptUiFixture={
  prepare:async()=>({imageData:"data:image/jpeg;base64,dGVzdA==",ocrImage:{}}),
  recognize:async(_image,signal)=>{
    browserCalls++;
    if(!hold)return browserText;
    return new Promise((resolve,reject)=>{delayed=resolve;signal.addEventListener("abort",()=>reject(Error("cancelled")),{once:true});});
  },
};
const request=async(action,body)=>{
  if(action==="special-rewards-receipt-scan"){scanCalls++;assert.equal(body.itemId,"sr-test-receipt-item");return {status:scanText?"scanned":"manual",text:scanText};}
  assert.equal(action,"special-rewards-receipt-check");checkCalls++;return {duplicate,valid:true};
};
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.querySelector("#app"));
const click=async el=>{assert.ok(el,"missing click target");await act(async()=>el.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true})));};
const button=text=>[...document.querySelectorAll("button")].find(el=>el.textContent.includes(text));
const field=name=>document.querySelector('[name="'+name+'"]');
const setValue=async(el,value)=>{const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value").set;await act(async()=>{setter.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));});};
const upload=async()=>{const input=document.querySelector('[data-receipt-upload]');Object.defineProperty(input,"files",{configurable:true,value:[new File(["fixture"],"receipt.png",{type:"image/png"})]});await act(async()=>input.dispatchEvent(new Event("change",{bubbles:true})));};
try{
  const output=resolve(folder,"Receipt.mjs");
  await build({entryPoints:["src/ReceiptClaimForm.tsx"],outfile:output,bundle:true,platform:"node",format:"esm",packages:"external",logLevel:"silent",plugins:[{name:"image-fixture",setup(b){
    b.onResolve({filter:/receiptImageOcr$/},()=>({path:"image",namespace:"fixture"}));
    b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"export const prepareReceiptUpload=(...args)=>globalThis.__receiptUiFixture.prepare(...args);export const readReceiptInBrowser=(...args)=>globalThis.__receiptUiFixture.recognize(...args)",loader:"js"}));
  }}]});
  const {default:Form}=await import(pathToFileURL(output).href);
  function Harness({activatedAt="2026-11-07T06:00:00Z"}){
    const [busy,setBusy]=React.useState(false);
    return React.createElement(Form,{itemId:"sr-test-receipt-item",rewardId:"seven-100",activatedAt,busy,request,onBusyChange:setBusy,onSubmit:async body=>{submitCalls.push(body);}});
  }
  const render=(key,props={})=>act(async()=>root.render(React.createElement(Harness,{key,...props})));
  await render("complete");
  assert.equal(scanCalls,0,"opening a form never starts OCR or reads the database");
  assert.equal(field("receiptNumber"),null,"upload precedes manual fields");
  await upload();
  assert.equal(scanCalls,1);assert.equal(checkCalls,1);assert.equal(submitCalls.length,0);
  assert.equal(field("receiptNumber").value,"7110000001");
  assert.equal(field("receiptAt").readOnly,true);
  assert.equal(field("receiptAt").type,"text","native date picker is removed");
  assert.match(field("receiptAt").value,/13:12:27/);
  assert.ok(!document.querySelector('input[type="datetime-local"]'));
  assert.equal(field("amountTHB").value,"114");
  assert.match(document.querySelector(".sr-ocr-result").textContent,/ครบ 3 ช่อง/);
  assert.ok(button("ส่งคำขอ").disabled,"OCR does not submit or approve and needs human review");
  await setValue(field("promptPay"),"0800000000");
  await click(field("receiptReviewed"));
  assert.ok(!button("ส่งคำขอ").disabled);
  await setValue(field("amountTHB"),"113");
  assert.equal(field("receiptReviewed").checked,false,"edits invalidate the review confirmation");
  await click(field("receiptReviewed"));
  await setValue(field("receiptAt"),"2026-11-07T15:12:27");
  await click(button("ส่งคำขอ"));
  assert.equal(submitCalls.length,1);
  assert.equal(submitCalls[0].receiptAt,"2026-11-07T13:12:27+07:00");
  assert.equal(submitCalls[0].amountTHB,113,"send reviewed actual amount, not reward cap");
  assert.ok(submitCalls[0].imageData);
  scanText="7-Eleven\nReceipt No: 7110000002";
  await upload();
  assert.equal(field("receiptNumber").value,"7110000002");
  assert.match(field("receiptAt").value,/ยังอ่านวันเวลาไม่ได้/);assert.equal(field("amountTHB").value,"","new image never reuses previous receipt fields");
  assert.ok(!field("promptPay"),"unreadable time hides the payment and submission section");
  assert.match(document.querySelector(".sr-time-rejection").textContent,/ระบบยังอ่านวันเวลาจากภาพไม่ชัด/);
  assert.match(document.querySelector(".sr-ocr-result").textContent,/1 จาก 3/);
  const callsBeforeFallback=browserCalls;
  scanText="";browserText=fullText;
  await render("browser-fallback");await upload();
  assert.equal(browserCalls,callsBeforeFallback+1,"unavailable cloud OCR runs actual local OCR adapter");
  assert.equal(field("amountTHB").value,"114");
  duplicate=true;scanText=fullText;
  await render("duplicate");await upload();
  assert.match(document.querySelector(".sr-receipt-fields").textContent,/ถูกใช้แล้ว/);
  await click(field("receiptReviewed"));assert.ok(button("ส่งคำขอ").disabled);
  await setValue(field("receiptNumber"),"7110000003");
  assert.ok(button("ส่งคำขอ").disabled);
  duplicate=false;await click(button("ตรวจเลขที่"));
  assert.match(document.querySelector(".sr-receipt-fields").textContent,/ไม่ซ้ำในระบบ/);
  const checksBeforeInvalid=checkCalls;
  await render("before-item",{activatedAt:"2026-11-07T06:36:10Z"});await upload();
  assert.match(document.querySelector(".sr-receipt-fields").textContent,/ซื้อสินค้าก่อนกดใช้ Item ประมาณ 24 นาที/);
  assert.match(field("receiptAt").value,/13:12:27/,"never change a receipt's time to make it eligible");
  assert.equal(checkCalls,checksBeforeInvalid,"ineligible images never trigger a duplicate/database check");
  assert.equal(field("receiptReviewed"),null);assert.equal(field("promptPay"),null);
  assert.equal(document.querySelector('button[type="submit"]'),null);
  const submittedBeforeInvalid=submitCalls.length;
  await act(async()=>document.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  assert.equal(submitCalls.length,submittedBeforeInvalid,"even programmatic submission cannot send the blocked OCR time");
  scanText=fullText.replace("13:12:27","15:12:27");
  await render("future");await upload();
  assert.match(document.querySelector(".sr-receipt-fields").textContent,/อนาคต/);
  scanText="";hold=true;
  await render("cancel");
  const input=document.querySelector('[data-receipt-upload]');
  Object.defineProperty(input,"files",{configurable:true,value:[new File(["fixture"],"receipt.png",{type:"image/png"})]});
  await act(async()=>{input.dispatchEvent(new Event("change",{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,0));});
  assert.ok(delayed);await click(button("หยุดอ่าน"));
  assert.ok(!document.querySelector('[data-receipt-upload]').disabled,"cancel settles UI and permits a new image");
  await act(async()=>delayed(fullText));
  assert.equal(field("receiptNumber").value,"","late OCR result cannot populate a cancelled image");
  console.log("PASS receipt-first UI: upload triggers real scan adapter, prefill+duplicate check, explicit review, locked OCR time with no calendar or DOM-edit override, clear rejection and no invalid payment form or extra database read, partial/fallback/cancel handling");
}finally{
  await act(async()=>root.unmount());Date.now=originalNow;delete globalThis.__receiptUiFixture;dom.window.close();
  for(const [name,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  await rm(folder,{recursive:true,force:true});
}
