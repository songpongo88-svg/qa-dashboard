// Opt-in integration: real isolated Postgres, mocked QA identity reads.
// User/session validation itself is covered by the deployed HTTP smoke tests.
import assert from "node:assert/strict";
import fs from "node:fs";
import {generateKeyPairSync,randomUUID} from "node:crypto";
import handler from "../api/sparks-admin.js";
if(!process.argv.includes("--live-isolated"))throw Error("Explicit --live-isolated required");
const secrets=JSON.parse(fs.readFileSync(process.env.QA_SPARKS_TEST_SECRET_FILE,"utf8"));
const url="https://vyhleszztvchevncgkhd.supabase.co/functions/v1/qa-sparks-runtime-test";
process.env.SPARKS_DATA_BACKEND="supabase";process.env.SPARKS_CLOUD_READ_ONLY="0";
process.env.SPARKS_SUPABASE_BRIDGE_URL=url;process.env.SPARKS_SUPABASE_BRIDGE_TOKEN=secrets.testToken;
const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:"fixture@example.test",private_key:privateKey});
const realFetch=globalThis.fetch;
const target="zz_sparks_migration_test";
const typed=v=>typeof v==="number"?{integerValue:String(v)}:{stringValue:String(v)};
const doc=(p,o)=>({name:p,fields:Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typed(v)])),updateTime:"2026-11-08T01:00:00Z"});
const response=(v,status=200)=>new Response(JSON.stringify(v),{status});
globalThis.fetch=async(input,opts={})=>{
 const href=String(input);
 if(href===url)return realFetch(input,opts);
 if(href==="https://oauth2.googleapis.com/token")return response({access_token:"fixture-only",expires_in:3600});
 if(href.includes("/qa_user_sessions/")){
  const owner=href.includes("owner-session");
  return response(doc(href,{username:owner?"songpon":target,role:owner?"Quality Assurance":"Agent",status:"active",policyVersion:"qa-session-policy-2026-07-15-v1",createdAt:"2026-11-08T01:00:00Z",expiresAt:"2099-01-01T00:00:00Z"}));
 }
 if(href.includes("/qa_user_session_controls/"))return response({},404);
 if(href.includes("/qa_user_profiles/")){
  const name=decodeURIComponent(new URL(href).pathname.split('/').pop()).toLowerCase();
  assert.ok(["songpon",target].includes(name));
  return response(doc(href,{username:name,role:name==="songpon"?"Quality Assurance":"Agent",displayName:"Isolated Test",status:"Active"}));
 }
 throw Error("Unexpected external request blocked: "+new URL(href).origin);
};
async function invoke(action,body={},owner=true){
 const res={code:200,setHeader(){},status(n){this.code=n;return this},json(data){this.data=data;return this}};
 await handler({method:"POST",url:"/api/sparks-admin",body:{action,actorUsername:owner?"songpon":target,sessionId:owner?"integration-owner-session-20261108":"integration-user-session-20261108",...body}},res);
 assert.equal(res.code,200,JSON.stringify({action,code:res.code,data:res.data}));return res.data;
}
try{
 for(const operation of ["add","deduct"]){
  const body={targetUsername:target,operation,amount:100,reason:"Isolated migration integration test",requestId:"migration-admin-"+randomUUID()};
  const replies=await Promise.all([invoke("adjust",body),invoke("adjust",body)]);
  assert.equal(replies.filter(r=>r.updated).length,1);
 }
 const requestId="migration-refund-"+randomUUID();
 await invoke("redeem-typing-relief",{requestId},false);
 const refund={targetUsername:target,operation:"refund",referenceId:"redeem-"+requestId,reason:"Isolated migration refund test",requestId:"migration-admin-refund-"+randomUUID()};
 const refunds=await Promise.all([invoke("adjust",refund),invoke("adjust",refund)]);
 assert.equal(refunds.filter(r=>r.updated).length,1);
 const mine=await invoke("list-my-truemoney",{},false);
 const money=mine.requests.find(r=>r.status==="pending");assert.ok(money);
 assert.equal((await invoke("mark-truemoney-paid",{itemId:money.itemId||money.requestId})).updated,true);
 assert.equal((await invoke("mark-truemoney-paid",{itemId:money.itemId||money.requestId})).alreadyApplied,true);
 console.log("PASS real isolated Postgres: concurrent admin add/deduct, exactly-once refund, TrueMoney payout confirmation and replay");
}finally{globalThis.fetch=realFetch;}
