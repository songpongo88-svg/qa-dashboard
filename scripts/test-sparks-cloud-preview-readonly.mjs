import assert from "node:assert/strict";
import fs from "node:fs";
import handler from "../api/sparks-admin.js";
const file=fs.readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
const sparks=fs.readFileSync(new URL("../src/QASparks.tsx",import.meta.url),"utf8");
const admin=fs.readFileSync(new URL("../src/SparksAdminPanel.tsx",import.meta.url),"utf8");
const originalMode=process.env.SPARKS_DATA_BACKEND;
const originalReadonly=process.env.SPARKS_CLOUD_READ_ONLY;
const originalFetch=globalThis.fetch;
const requests=[];
globalThis.fetch=async()=>{requests.push("network");throw new Error("A READ-ONLY preview tried to use the network");};
function response(){
  const out={code:200,body:null,headers:{}};
  out.setHeader=(a,b)=>{out.headers[a]=b;return out;};
  out.status=(code)=>{out.code=code;return out;};
  out.json=(value)=>{out.body=value;return out;};
  return out;
}
try {
  process.env.SPARKS_DATA_BACKEND="supabase";
  process.env.SPARKS_CLOUD_READ_ONLY="1";
  for(const action of [
    "claim-daily-checkin","claim-profile-makeover","redeem-typing-relief","use-typing-relief",
    "fruit-match-start","fruit-match-finish","treasure-start","treasure-find","treasure-open",
    "qa-lottery-buy","redeem-truemoney","use-truemoney-item","mark-truemoney-paid",
    "special-rewards-redeem","special-rewards-submit","special-rewards-admin-action",
    "announcement-shield-buy","announcement-shield-activate","announcement-shield-cancel",
    "adjust","set-truemoney-price","reauth","snakes-create","void-suphitcha-typing-test",
    "sparks-cloud-first-login"
  ]){
    const res=response();
    await handler({method:"POST",url:"/api/sparks-admin",body:{action}},res);
    assert.equal(res.code,423,action+" must be blocked by Cloud preview");
    assert.equal(res.body?.code,"SPARKS_CLOUD_PREVIEW_READ_ONLY");
  }
  const cron=response();
  await handler({method:"GET",url:"/api/cron/qa-lottery",headers:{authorization:"Bearer not-a-real-key"}},cron);
  assert.equal(cron.code,423,"cron must not pay an item during Cloud read-only preview");
  assert.equal(requests.length,0,"no Firebase or Supabase network call from rejected writes");
  assert.match(file,/VITE_SPARKS_CLOUD_READ_ONLY !== "1"/);
  assert.match(sparks,/SUPABASE PREVIEW · อ่านข้อมูลอย่างเดียว/);
  assert.match(admin,/Cloud wallet cache disabled/);
  console.log("PASS QA Sparks preview is read-only: all reward, game, admin, onboarding and cron writes fail closed");
}finally{
 globalThis.fetch=originalFetch;
 if(originalMode===undefined)delete process.env.SPARKS_DATA_BACKEND;else process.env.SPARKS_DATA_BACKEND=originalMode;
 if(originalReadonly===undefined)delete process.env.SPARKS_CLOUD_READ_ONLY;else process.env.SPARKS_CLOUD_READ_ONLY=originalReadonly;
}
