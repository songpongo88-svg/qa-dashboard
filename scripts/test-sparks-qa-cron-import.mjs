import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { runSparksProfileReconciliation } from "../server/sparksProfileReconcile.js";

const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
const serviceAccount=JSON.stringify({client_email:"test@qa-dashboard.iam.gserviceaccount.com",
  private_key:privateKey.export({type:"pkcs8",format:"pem"})});
const secret="qa-test-private-bridge-token-with-48-chars-012345678901";
const profiles=[
  {name:"songpon",status:"Active",role:"Quality Assurance",password:"fixture-password-2026"},
  ...Array.from({length:16},(_,i)=>({name:"agent"+(i+1),status:"Active",role:"Admin Live Chat",password:"fixture-password-2026"})),
  ...Array.from({length:4},(_,i)=>({name:"pending"+(i+1),status:"Active",role:"Virtual Rider",password:""})),
  ...Array.from({length:9},(_,i)=>({name:"suspended"+(i+1),status:"Suspended",role:"Admin Live Chat",password:""})),
];
const field=value=>({stringValue:String(value)});
const docs=profiles.map(profile=>({
  name:"projects/qa-dashboard-b0b5d/databases/(default)/documents/qa_user_profiles/"+profile.name,
  updateTime:"2026-11-11T10:10:10.000000Z",
  fields:{
    username:field(profile.name),displayName:field(profile.name),
    email:field(profile.name+"@example.test"),role:field(profile.role),
    status:field(profile.status),password:field(profile.password),
    passwordExpiresAt:field("2027-01-01T00:00:00Z"),
  },
}));
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,
  headers:{"content-type":"application/json"}});
const baseEnv={
  SPARKS_PROFILE_SYNC_ENABLED:"1",
  SPARKS_QA_CREDENTIAL_IMPORT_ENABLED:"1",
  SPARKS_SUPABASE_BRIDGE_TOKEN:secret,
  SPARKS_SUPABASE_BRIDGE_URL:"https://test.supabase.co/functions/v1/qa-sparks-runtime",
  SPARKS_SUPABASE_AUTH_URL:"https://test.supabase.co",
  FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON:serviceAccount,
};
function createTransport({statusFailure=false}={}){
  const trace={maskFields:[],publicSource:null,imported:null,statusCalls:0,importCalls:0};
  const transport=async(url,opts={})=>{
    if(String(url)==="https://oauth2.googleapis.com/token")return json({access_token:"mock-google-token"});
    if(String(url).includes("firestore.googleapis.com/")){
      const request=new URL(String(url));
      trace.maskFields=request.searchParams.getAll("mask.fieldPaths");
      return json({documents:docs});
    }
    if(String(url).endsWith("/qa-sparks-profile-reconcile")){
      const payload=JSON.parse(String(opts.body||"{}"));
      if(payload.action==="report")return json({ok:true});
      assert.equal(payload.action,"reconcile");
      trace.publicSource=payload.profiles;
      assert.equal(payload.profiles.length,30);
      assert.ok(!JSON.stringify(payload.profiles).includes("fixture-password"));
      assert.ok(!JSON.stringify(payload.profiles).includes("passwordExpiresAt"));
      return json({ok:true,sourceCount:30,reviewedCount:29,blockedCount:1});
    }
    if(String(url).endsWith("/qa-sparks-qa-password-migration")){
      const payload=JSON.parse(String(opts.body||"{}"));
      assert.equal(opts.headers?.["x-qa-sparks-server-secret"],secret);
      if(payload.action==="status"){
        trace.statusCalls++;
        return statusFailure?json({error:"temporary"},503):json({
          ok:true,activeCount:21,migratedUsernames:["songpon","agent1"],
        });
      }
      assert.equal(payload.action,"import-existing-qa-passwords");
      trace.importCalls++;
      trace.imported=payload;
      return json({submitted:15,created:15,updated:0,failed:[]});
    }
    throw Error("Unexpected URL "+String(url));
  };
  return {trace,transport};
}
test("owner-approved daily cron imports only missing QA passwords and never stores secrets in the roster",async()=>{
  const {trace,transport}=createTransport();
  const result=await runSparksProfileReconciliation({env:baseEnv,fetcher:transport});
  assert.equal(result.ok,true);
  assert.equal(result.sourceCount,30);
  assert.equal(result.credentialImport.ok,true);
  assert.equal(result.credentialImport.submitted,15);
  assert.equal(result.credentialImport.pending,4);
  assert.ok(trace.maskFields.includes("password"));
  assert.ok(trace.maskFields.includes("passwordExpiresAt"));
  assert.equal(trace.importCalls,1);
  assert.equal(trace.imported.expectedActive.length,21);
  assert.equal(trace.imported.entries.length,15);
  assert.ok(!trace.imported.entries.some(x=>["songpon","agent1"].includes(x.username)));
  assert.ok(!JSON.stringify(result).includes("fixture-password"));
});
test("disabled credential-import flag never reads or transfers QA passwords",async()=>{
  const {trace,transport}=createTransport();
  const result=await runSparksProfileReconciliation({env:{
    ...baseEnv,SPARKS_QA_CREDENTIAL_IMPORT_ENABLED:"0",
  },fetcher:transport});
  assert.equal(result.ok,true);
  assert.equal(result.credentialImport,undefined);
  assert.ok(!trace.maskFields.includes("password"));
  assert.equal(trace.statusCalls,0);
  assert.equal(trace.importCalls,0);
});
test("Auth status unavailable fails closed without issuing any credential import",async()=>{
  const {trace,transport}=createTransport({statusFailure:true});
  const result=await runSparksProfileReconciliation({env:baseEnv,fetcher:transport});
  assert.equal(result.ok,true);
  assert.equal(result.credentialImport.ok,false);
  assert.equal(trace.importCalls,0);
  assert.ok(!JSON.stringify(result).includes("fixture-password"));
});
