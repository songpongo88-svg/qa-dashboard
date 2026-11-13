import assert from "node:assert/strict";
import { auditQaCredentialSource } from "../server/sparksQaCredentialPreflight.js";
import { migrateQaPasswordsFromTrustedSource } from "../server/sparksQaMigrationRunner.js";

const now=new Date("2026-11-12T09:00:00+07:00");
const eligible=["songpon",...Array.from({length:20},(_,i)=>"agent"+String(i+1).padStart(2,"0"))];
const pending=new Set(["agent01","agent02","agent03","agent04"]);
const source=[
  ...eligible.map(username=>({
    username,role:username==="songpon"?"Quality Assurance":"Admin Live Chat",
    status:"Active",password:pending.has(username)?"":"valid-"+username+"-pass",
  })),
  {username:"supakrit",role:"Admin Live Chat",status:"Active",
    password:"suspended-password",suspendEffectiveDate:"2026-09-01",
    suspendAutoReactivate:false},
  ...Array.from({length:8},(_,i)=>({
    username:"suspended"+i,role:"Admin Live Chat",status:"Suspended",
    password:"never-import-this",
  })),
];
assert.equal(source.length,30);
const audit=auditQaCredentialSource(source,{now});
assert.equal(audit.checked,30);
assert.equal(audit.active,22);
assert.equal(audit.suspended,8);
assert.equal(audit.eligibleActive,21);
assert.equal(audit.ready,17);
assert.equal(audit.pending.length,4);
assert.deepEqual(audit.excluded,[{username:"supakrit",reason:"SCHEDULED_SUSPENSION"}]);
assert.equal(audit.blocked.length,0);
assert.equal(audit.canStartStagedMigration,true);

let imports=0;
const transport=async (_url,request)=>{
  imports++;
  const payload=JSON.parse(request.body);
  assert.equal(payload.action,"import-existing-qa-passwords");
  assert.deepEqual(payload.expectedActive,[...eligible].sort());
  assert.equal(payload.entries.length,17);
  assert.equal(payload.entries.some(item=>item.username==="supakrit"),false);
  assert.equal(payload.entries.some(item=>pending.has(item.username)),false);
  assert.equal(payload.entries.some(item=>item.username.startsWith("suspended")),false);
  return new Response(JSON.stringify({created:17,updated:0,failed:[]}),{status:200});
};
const valid=await migrateQaPasswordsFromTrustedSource(source,{
  now,url:"https://example.supabase.co",token:"x".repeat(48),transport
});
assert.equal(valid.ok,true);
assert.equal(valid.submitted,17);
assert.equal(imports,1);
assert.equal(valid.audit.eligibleActive,21);

const modified=source.map(row=>({...row}));
modified[0].role="Senior";
const denied=await migrateQaPasswordsFromTrustedSource(modified,{
  now,url:"https://example.supabase.co",token:"x".repeat(48),transport
});
assert.equal(denied.ok,false);
assert.equal(denied.code,"SOURCE_CREDENTIAL_BLOCKED");
assert.equal(imports,1);

const extra=source.map(row=>({...row}));
extra[29].status="Active";
const mismatched=await migrateQaPasswordsFromTrustedSource(extra,{
  now,url:"https://example.supabase.co",token:"x".repeat(48),transport
});
assert.equal(mismatched.ok,false);
assert.equal(imports,1);

console.log("PASS QA credential roster: 30 source, 21 eligible, 17 ready, 4 pending, 1 scheduled exclusion, 8 suspended; invalid source denied");
