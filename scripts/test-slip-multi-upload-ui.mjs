import assert from "node:assert/strict";
import {readFile,mkdtemp,rm,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import {JSDOM} from "jsdom";

const html=await readFile("slip-ocr-test.html","utf8");
const dom=new JSDOM(html,{url:"https://test.local/slip-ocr-test.html",pretendToBeVisual:true});
const keys=["window","document","HTMLElement","Event","File","FileReader"];
const old=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
for(const k of keys)globalThis[k]=dom.window[k];
const originalFetch=globalThis.fetch;
let fetchCount=0,readCount=0,inProgress=0,maxInProgress=0;
globalThis.fetch=async()=>{fetchCount++;throw Error("Never send a bank image to an API");};
await mkdir(resolve("node_modules/.cache"),{recursive:true});
const dir=await mkdtemp(resolve("node_modules/.cache/qa-sparks-batch-"));
try{
  const path=resolve(dir,"standalone.mjs");
  await build({
    entryPoints:["src/slipOcrStandalone.ts"],outfile:path,bundle:true,format:"esm",
    platform:"node",packages:"external",logLevel:"silent",
    plugins:[{name:"mock-on-device-ocr",setup(builder){
      builder.onResolve({filter:/localPayoutSlipOcr$/},()=>({path:"virtual",namespace:"mock-ocr"}));
      builder.onLoad({filter:/.*/,namespace:"mock-ocr"},()=>({
        contents:"export async function readPayoutSlipLocally(data){return globalThis.__batchScan(data)}",
        loader:"js"
      }));
    }}]
  });
  globalThis.__batchScan=async data=>{
    inProgress++;readCount++;maxInProgress=Math.max(maxInProgress,inProgress);
    await new Promise(done=>setTimeout(done,15));
    inProgress--;
    const name=Buffer.from(String(data).split(",")[1]||"","base64").toString("utf8");
    const isBkk=name==="bkk";
    return {
      ocrStatus:"local",ocrText:"ชื่อธนาคาร\nยอดเงิน",message:"อ่านข้อมูลจากภาพแล้ว",
      fields:{
        bank:isBkk?"ธนาคารกรุงเทพ":"TrueMoney Wallet",
        amountTHB:isBkk?1405:154,feeTHB:0,payoutAt:"2026-02-03T14:40:00+07:00",
        transactionRef:isBkk?"2026020314403024006233008":"512522068024",
        shortReference:isBkk?"631438":"",longReference:"",
        senderName:"นาย ทดสอบ",senderBank:"",senderAccountMasked:"",
        recipientName:"นางสาว ทดสอบ",recipientBank:"ธนาคารไทยพาณิชย์",
        recipientAccountMasked:"xxx-xxx049-7",recipientVisibleSuffix:"7",
        isSuccessful:true,missing:[],reviewFlags:[],amountCandidates:[isBkk?1405:154]
      }
    };
  };
  await import(pathToFileURL(path).href);
  const input=document.getElementById("file");
  assert.equal(input.multiple,true,"multiple selection must be enabled");
  const files=[
    new File(["bkk"],"bangkok.png",{type:"image/png"}),
    new File(["wallet"],"truemoney.jpg",{type:"image/jpeg"}),
    new File(["unsupported"],"not-image.pdf",{type:"application/pdf"})
  ];
  Object.defineProperty(input,"files",{configurable:true,value:files});
  input.dispatchEvent(new Event("change",{bubbles:true}));
  for(let i=0;i<140&&document.getElementById("file").disabled;i++){
    await new Promise(done=>setTimeout(done,20));
  }
  // Give async input change its first turn even if it has not disabled the input yet.
  for(let i=0;i<140&&!document.getElementById("batch-summary").textContent.includes("3/3");i++){
    await new Promise(done=>setTimeout(done,20));
  }
  const cards=[...document.querySelectorAll("[data-slip-result]")];
  const summary=document.getElementById("batch-summary").textContent;
  assert.equal(cards.length,3,"must preserve a separate card for every submitted file");
  assert.match(cards[0].textContent,/bangkok.png/);
  assert.match(cards[0].textContent,/ธนาคารกรุงเทพ/);
  assert.match(cards[0].textContent,/1,405\.00/);
  assert.match(cards[1].textContent,/truemoney.jpg/);
  assert.match(cards[1].textContent,/TrueMoney Wallet/);
  assert.match(cards[1].textContent,/154\.00/);
  assert.match(cards[2].textContent,/not-image.pdf/);
  assert.match(cards[2].textContent,/8 MB/);
  assert.match(summary,/3\/3 ไฟล์/);
  assert.match(summary,/อ่านข้อมูลหลักครบ 2/);
  assert.match(summary,/อ่านไม่ได้ 1/);
  assert.equal(readCount,2,"invalid file must not call OCR");
  assert.equal(maxInProgress,1,"OCR must be sequential to limit memory");
  assert.equal(fetchCount,0,"UI must not call any API");
  assert.equal(document.querySelectorAll("button[data-reward-confirm-submit]").length,0);
  const reset=document.getElementById("clear");
  assert.equal(reset.disabled,false);
  reset.click();
  assert.equal(document.querySelectorAll("[data-slip-result]").length,0,"Clear must remove all bank OCR data");
  assert.equal(document.getElementById("result").classList.contains("hidden"),true);
  console.log("PASS multi-bank slip upload UI: 3 isolated files, sequential OCR, partial file errors, no API or payout, clear");
}finally{
  delete globalThis.__batchScan;
  globalThis.fetch=originalFetch;
  for(const [k,descriptor] of Object.entries(old)){
    if(descriptor)Object.defineProperty(globalThis,k,descriptor);else delete globalThis[k];
  }
  dom.window.close();
  await rm(dir,{recursive:true,force:true});
}
