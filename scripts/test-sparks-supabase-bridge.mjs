import assert from "node:assert/strict";
import {isSparksBackendRequest,requestSparksSupabase} from "../server/sparksSupabaseBridge.js";
const old={mode:process.env.SPARKS_DATA_BACKEND,url:process.env.SPARKS_SUPABASE_BRIDGE_URL,token:process.env.SPARKS_SUPABASE_BRIDGE_TOKEN};
const originalFetch=globalThis.fetch;
const api="https://firestore.googleapis.com/v1/projects/qa-dashboard-b0b5d/databases/(default)/documents/";
try{
  delete process.env.SPARKS_DATA_BACKEND;
  assert.equal(isSparksBackendRequest(":commit","POST"),false);
  process.env.SPARKS_DATA_BACKEND="supabase";
  assert.equal(isSparksBackendRequest(":commit","POST"),true);
  assert.equal(isSparksBackendRequest(":beginTransaction","POST"),true);
  assert.equal(isSparksBackendRequest("/qa_sparks_wallets/test"),true);
  assert.equal(isSparksBackendRequest(api+"qa_sparks_wallets/test/history?pageSize=200"),true);
  assert.equal(isSparksBackendRequest("/qa_user_sessions/test"),false);
  assert.equal(isSparksBackendRequest("/qa_evaluations/test"),false);
  assert.equal(isSparksBackendRequest("/qa_sparks_wallets/test","PATCH"),false);
  process.env.SPARKS_SUPABASE_BRIDGE_URL="https://safe-test.supabase.co/functions/v1/qa-sparks-runtime-preview";
  process.env.SPARKS_SUPABASE_BRIDGE_TOKEN="test-private-server-secret-token-length-over-40";
  const seen=[];
  globalThis.fetch=async (url,opts)=>{
    assert.equal(url,process.env.SPARKS_SUPABASE_BRIDGE_URL);
    assert.equal(opts.headers["x-qa-sparks-server-secret"],process.env.SPARKS_SUPABASE_BRIDGE_TOKEN);
    const payload=JSON.parse(opts.body);
    seen.push(payload);
    if(payload.action==="get"&&payload.path.endsWith("/missing"))
      return new Response(JSON.stringify({error:"NOT_FOUND"}),{status:404});
    if(payload.action==="commit")
      return new Response(JSON.stringify({error:"ABORTED",firestoreStatus:"ABORTED"}),{status:409});
    if(payload.action==="get")return new Response(JSON.stringify({name:api+payload.path,fields:{balance:{integerValue:"42"}},updateTime:"v1"}),{status:200});
    if(payload.action==="list")return new Response(JSON.stringify({documents:[],nextPageToken:""}),{status:200});
    if(payload.action==="begin")return new Response(JSON.stringify({transaction:"t-1"}),{status:200});
    return new Response(JSON.stringify({}),{status:200});
  };
  const doc=await requestSparksSupabase("/qa_sparks_wallets/test","GET");
  assert.equal(doc.fields.balance.integerValue,"42");
  assert.equal(seen.at(-1).path,"qa_sparks_wallets/test");
  await requestSparksSupabase(api+"qa_sparks_wallets/test/history?pageSize=50&mask.fieldPaths=createdAt","GET");
  assert.equal(seen.at(-1).action,"list");
  assert.equal(seen.at(-1).pageSize,50);
  assert.deepEqual(seen.at(-1).mask,["createdAt"]);
  assert.equal(await requestSparksSupabase("/qa_sparks_wallets/missing","GET"),null);
  assert.equal((await requestSparksSupabase(":beginTransaction","POST")).transaction,"t-1");
  await assert.rejects(requestSparksSupabase(":commit","POST",{writes:[]}),e=>e.status===409&&e.firestoreStatus==="ABORTED");
  assert.equal(seen.filter(x=>x.action==="commit").length,1);
  console.log("PASS Sparks-only server bridge: feature flag, session isolation, read/list, retry/conflict, private transport");
}finally{
  globalThis.fetch=originalFetch;
  for(const [k,v]of Object.entries({SPARKS_DATA_BACKEND:old.mode,SPARKS_SUPABASE_BRIDGE_URL:old.url,SPARKS_SUPABASE_BRIDGE_TOKEN:old.token})){
    if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
}
