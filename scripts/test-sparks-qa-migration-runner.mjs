import assert from "node:assert/strict";
import test from "node:test";
import { migrateQaPasswordsFromTrustedSource } from "../server/sparksQaMigrationRunner.js";

const now=new Date("2026-11-11T10:00:00Z");
const profile=(username,props={})=>({
 username,status:"Active",
 role:username==="songpon"?"Quality Assurance":"Agent",
 password:"qa-original-strong-secret",passwordExpiresAt:"2027-01-01T00:00:00Z",
 ...props,
});
const profiles=()=>[
 profile("songpon"),
 ...Array.from({length:16},(_,i)=>profile("agent-"+(i+1))),
 ...["nithikorn","sarika","sirintra","suwadee"].map(username=>profile(username,{password:""})),
 ...["suspended-one","suspended-two"].map(username=>profile(username,{status:"Suspended",password:""})),
];
test("verified source produces 17 credentials, redacted response and never sends Suspended",async()=>{
 let called=0;
 const transport=async(url,options)=>{
   called++;
   assert.equal(url,"https://test.supabase.co/functions/v1/qa-sparks-qa-password-migration");
   assert.equal(options.headers["x-qa-sparks-server-secret"],"test-private-bridge-secret-forty-eight-characters-long");
   const data=JSON.parse(options.body);
   assert.equal(data.action,"import-existing-qa-passwords");
   assert.equal(data.expectedActive.length,21);
   assert.equal(data.entries.length,17);
   assert.ok(data.entries.every(x=>x.password==="qa-original-strong-secret"));
   assert.ok(data.entries.every(x=>x.username!=="suspended-one"&&x.username!=="suspended-two"));
   return {ok:true,status:200,json:async()=>({submitted:17,created:17,updated:0,failed:[]})};
 };
 const result=await migrateQaPasswordsFromTrustedSource(profiles(),{
   now,token:"test-private-bridge-secret-forty-eight-characters-long",
   url:"https://test.supabase.co",transport,
 });
 assert.equal(called,1);
 assert.equal(result.ok,true);
 assert.equal(result.submitted,17);
 assert.equal(result.audit.pending.length,4);
 assert.equal(result.audit.suspended,2);
 assert.doesNotMatch(JSON.stringify(result),/qa-original-strong-secret/);
 assert.doesNotMatch(JSON.stringify(result),/test-private-bridge/);
});
test("server never fetches if Active identity has expired password",async()=>{
 const rows=profiles();rows[2].passwordExpiresAt="2026-11-10T00:00:00Z";
 let calls=0;
 const result=await migrateQaPasswordsFromTrustedSource(rows,{
   now,token:"test-private-bridge-secret-forty-eight-characters-long",
   url:"https://test.supabase.co",transport:async()=>{calls++;throw Error("SHOULD_NOT_CALL");}
 });
 assert.equal(calls,0);
 assert.equal(result.ok,false);
 assert.equal(result.code,"SOURCE_CREDENTIAL_BLOCKED");
});
test("no bridge key means no network transfer or secrets",async()=>{
 let called=false;
 const result=await migrateQaPasswordsFromTrustedSource(profiles(),{
   now,url:"https://test.supabase.co",transport:async()=>{called=true;}
 });
 assert.equal(called,false);
 assert.equal(result.ok,false);
 assert.equal(result.code,"SERVER_BRIDGE_SECRET_MISSING");
});
test("remote partial acceptance cannot be mistaken for complete transfer",async()=>{
 const result=await migrateQaPasswordsFromTrustedSource(profiles(),{
   now,token:"test-private-bridge-secret-forty-eight-characters-long",
   url:"https://test.supabase.co",transport:async()=>({
     ok:true,status:207,json:async()=>({created:15,updated:0,failed:[{username:"agent-16",state:"failed"}]})
   })
 });
 assert.equal(result.ok,false);
 assert.equal(result.code,"PARTIAL_IMPORT");
});
test("wrong roster or no original owner password fails closed",async()=>{
 const rows=profiles();rows[0].password="";
 await assert.rejects(()=>migrateQaPasswordsFromTrustedSource(rows,{
   now,token:"test-private-bridge-secret-forty-eight-characters-long",
   url:"https://test.supabase.co",transport:async()=>{throw Error("SHOULD_NOT_CALL")}
 }),/ACTIVE_ROSTER_OR_OWNER_INCOMPLETE/);
});
