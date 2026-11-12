import assert from "node:assert/strict";
import test from "node:test";
import { auditQaCredentialSource } from "../server/sparksQaCredentialPreflight.js";

const now=new Date("2026-11-11T08:00:00.000Z");
const make=(name, overrides={})=>({
  username:name,status:"Active",role:name==="songpon"?"Quality Assurance":"Admin Live Chat",
  password:"fixture-Pass-2026",passwordExpiresAt:"2027-01-01T00:00:00.000Z",
  ...overrides,
});
function complete(){
  return [
    make("songpon"),
    ...Array.from({length:16},(_,i)=>make("agent-"+(i+1))),
    ...["pending-a","pending-b","pending-c","pending-d"].map(name=>make(name,{password:""})),
    make("suspended-a",{status:"Suspended",password:""}),
    make("suspended-b",{status:"Suspended",password:""}),
  ];
}
test("17 ready, 4 not yet configured and 2 suspended, without exposing password material",()=>{
  const result=auditQaCredentialSource(complete(),{now});
  assert.equal(result.checked,23);
  assert.equal(result.active,21);
  assert.equal(result.ready,17);
  assert.equal(result.suspended,2);
  assert.equal(result.pending.length,4);
  assert.equal(result.blocked.length,0);
  assert.equal(result.canStartStagedMigration,true);
  for (const name of ["pending-a","pending-b","pending-c","pending-d"])
    assert.ok(result.pending.some(x=>x.username===name&&x.reason==="QA_PASSWORD_NOT_SET"));
  assert.doesNotMatch(JSON.stringify(result),/fixture-Pass-2026/);
});
test("suspension, invalid expiry and bad password block cutover",()=>{
  const rows=complete();
  rows[1].suspendEffectiveDate="2026-11-01";
  rows[2].passwordExpiresAt="2026-11-10T00:00:00Z";
  rows[3].password="123";
  const result=auditQaCredentialSource(rows,{now});
  assert.equal(result.ready,14);
  assert.equal(result.blocked.length,3);
  assert.equal(result.canStartStagedMigration,false);
});
test("incomplete collection or missing owner fails closed",()=>{
  assert.throws(()=>auditQaCredentialSource(complete().slice(0,10),{now}),/ACTIVE_ROSTER/);
  assert.throws(()=>auditQaCredentialSource(complete().filter(row=>row.username!=="songpon"),{now}),/ACTIVE_ROSTER/);
  assert.throws(()=>auditQaCredentialSource(complete().map(row=>row.username==="songpon"?{...row,role:"User"}:row),{now}),/ACTIVE_ROSTER/);
});
test("duplicate identities always block preflight",()=>{
  const rows=complete();rows.push(make("agent-1"));
  assert.throws(()=>auditQaCredentialSource(rows,{now}),/DUPLICATE/);
});
test("owner credential must be valid even when other staff are ready",()=>{
  const rows=complete();rows[0].password="";
  assert.throws(()=>auditQaCredentialSource(rows,{now}),/ACTIVE_ROSTER/);
});
test("server route always requires the existing authenticated owner session",async()=>{
  // Static guard: the read-only action lives inside the protected sparks-admin
  // handler and must not expose password fields in its JSON response.
  const {readFileSync}=await import("node:fs");
  const source=readFileSync(new URL("../api/sparks-admin.js",import.meta.url),"utf8");
  const start=source.indexOf('if (body.action === "qa-password-preflight")');
  assert.ok(start>=0);
  const snippet=source.slice(start,start+1500);
  assert.match(snippet,/await authorizeAdmin\(body\)/);
  assert.match(snippet,/listCollection\("qa_user_profiles"/);
  assert.match(snippet,/auditQaCredentialSource/);
  assert.doesNotMatch(snippet,/json\(.*password:/);
});

test("migration API distinguishes upstream 429 from previous cooldown without claiming the rewards backend failed",async()=>{
  const {readFileSync}=await import("node:fs");
  const src=readFileSync(new URL("../api/sparks-admin.js",import.meta.url),"utf8");
  const ui=readFileSync(new URL("../src/SparksQaCredentialMigration.tsx",import.meta.url),"utf8");
  assert.match(src,/function firestoreQuotaError\(source = "upstream"\)/);
  assert.match(src,/firestoreQuotaError\("cooldown"\)/);
  assert.match(src,/FIRESTORE_READ_COOLDOWN/);
  assert.match(src,/QA_CREDENTIAL_SERVER_COOLDOWN/);
  assert.match(src,/QA_CREDENTIAL_FIRESTORE_LIMIT/);
  assert.match(src,/firestoreReadAttempted:!cached/);
  assert.match(ui,/QA_CREDENTIAL_SERVER_COOLDOWN/);
  assert.match(ui,/QA_CREDENTIAL_FIRESTORE_LIMIT/);
  assert.ok(!src.includes('if (method === "GET" && Date.now() < firestoreQuotaLimitedUntil) throw firestoreQuotaError();'));
});
