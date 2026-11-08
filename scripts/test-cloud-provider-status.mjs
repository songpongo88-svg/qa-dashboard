import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler from "../api/cloud-status.js";

const old=Object.fromEntries(["VERCEL_ENV","SPARKS_DATA_BACKEND","SPARKS_CLOUD_READ_ONLY","SPARKS_CUTOVER_VERIFIED","SPARKS_WRITES_PAUSED","SPARKS_MIGRATED_DOCUMENTS"].map(k=>[k,process.env[k]]));
const previousFetch=globalThis.fetch;
let calls=0;
globalThis.fetch=async()=>{calls++;throw new Error("Cloud Status must not call a database or external API")};

function invoke(method="GET"){
  const res={statusCode:200,headers:{},result:undefined,
    setHeader(k,v){this.headers[k]=v;return this;},
    status(n){this.statusCode=n;return this;},
    json(data){this.result=data;return this;}};
  handler({method},res);
  return res;
}
function env(values){
  for(const key of Object.keys(old))delete process.env[key];
  for(const [key,value] of Object.entries(values))process.env[key]=value;
}
try{
  env({VERCEL_ENV:"production"});
  const live=invoke();
  assert.equal(live.statusCode,200);
  assert.equal(live.result.environment,"production");
  assert.equal(live.result.sparksApiProvider,"firebase");
  assert.equal(live.result.qaDataProvider,"firebase");
  assert.equal(live.result.qaLoginProvider,"firebase");
  assert.equal(live.result.migrationPhase,"in-progress");
  assert.equal(live.result.cutoverVerified,false);
  assert.equal(live.result.reviewedSnapshot.documents,301);
  assert.equal(live.result.migrationChecks.length,6);
  assert.equal(live.result.migrationChecks.filter(x=>x.completed).length,3);
  assert.equal(live.headers["Cache-Control"],"no-store, max-age=0");
  assert.equal(JSON.stringify(live.result).includes("secret"),false);

  env({VERCEL_ENV:"preview",SPARKS_DATA_BACKEND:"supabase",SPARKS_CLOUD_READ_ONLY:"1"});
  const preview=invoke();
  assert.equal(preview.result.sparksApiProvider,"supabase");
  assert.equal(preview.result.sparksApiReadOnly,true);
  assert.equal(preview.result.migrationPhase,"in-progress");
  assert.equal(preview.result.cutoverVerified,false);

  env({VERCEL_ENV:"preview",SPARKS_DATA_BACKEND:"supabase",SPARKS_CUTOVER_VERIFIED:"1"});
  assert.equal(invoke().result.cutoverVerified,false,"Preview cannot be announced migrated");

  env({VERCEL_ENV:"production",SPARKS_DATA_BACKEND:"supabase",SPARKS_CLOUD_READ_ONLY:"1",SPARKS_CUTOVER_VERIFIED:"1"});
  assert.equal(invoke().result.cutoverVerified,false,"Read-only server cannot be announced migrated");

  env({VERCEL_ENV:"production",SPARKS_DATA_BACKEND:"supabase"});
  assert.equal(invoke().result.cutoverVerified,false,"Only an explicit audited cutover may be declared complete");

  env({VERCEL_ENV:"production",SPARKS_DATA_BACKEND:"supabase",SPARKS_CUTOVER_VERIFIED:"1"});
  const done=invoke();
  assert.equal(done.result.migrationPhase,"complete");
  assert.equal(done.result.cutoverVerified,true);
  assert.equal(done.result.migrationChecks.every(x=>x.completed),true);

  env({VERCEL_ENV:"production",SPARKS_DATA_BACKEND:"unexpected"});
  assert.equal(invoke().result.sparksApiProvider,"unknown","Unexpected provider must not be silently called Firebase");
  const notAllowed=invoke("POST");
  assert.equal(notAllowed.statusCode,405);
  assert.equal(notAllowed.headers.Allow,"GET");
  assert.equal(calls,0);

  const source=readFileSync(new URL("../src/SparksCloudStatus.tsx",import.meta.url),"utf8");
  const page=readFileSync(new URL("../src/QASparks.tsx",import.meta.url),"utf8");
  const system=readFileSync(new URL("../src/UserRoleAdminMockup.tsx",import.meta.url),"utf8");
  const workspace=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(page, /SparksCloudStatus/, "Cloud infrastructure belongs in System, not Rewards");
  assert.match(system,/adminTab === "maintenance" && canManageMaintenance \?/, "Cloud belongs to privileged System Setup");
  assert.match(system,/<SparksCloudStatus adminAccess=\{true\}/, "System admin sees full migration details");
  assert.match(workspace,/id: "system"/);
  assert.match(workspace,/key: "system-setup".*allowed: maintenanceAdminAllowed/);
  assert.doesNotMatch(system.split('adminTab === "maintenance" && canManageMaintenance ? (')[0], /<SparksCloudStatus/, "Cloud is not on Users or Roles pages");
  assert.match(source,/ข้อมูล Cloud ของหน้าเว็บกับ API ไม่ตรงกัน/);
  assert.match(source,/fetch\("\/api\/cloud-status"/);
  assert.match(source,/import\.meta\.env\?\.VITE_SPARKS_DATA_BACKEND/);
  assert.match(source,/adminAccess && report\?<details/);
  console.log("PASS Cloud Status in privileged System Setup only: Firebase/Supabase status, Preview lock, completion gate, no extra database reads");
}finally{
  for(const [key,val] of Object.entries(old)){if(val===undefined)delete process.env[key];else process.env[key]=val;}
  globalThis.fetch=previousFetch;
}
