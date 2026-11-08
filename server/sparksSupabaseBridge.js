// QA Sparks-only Cloud Bridge. No dependency on a browser Supabase key.
// NEVER enable production without a verified source delta sync and live rollback plan.
const FIRESTORE_PREFIX="projects/qa-dashboard-b0b5d/databases/(default)/documents/";
const FIRESTORE_API="https://firestore.googleapis.com/v1/"+FIRESTORE_PREFIX;
const ROOTS=new Set([
  "qa_sparks_wallets","qa_sparks_true_money_requests","qa_sparks_reward_settings",
  "qa_sparks_special_reward_requests","qa_sparks_special_receipt_evidence",
  "qa_sparks_special_receipt_locks","qa_sparks_fruit_players_v1",
  "qa_sparks_fruit_boards","qa_sparks_fruit_rounds","qa_sparks_lottery_draws_v1",
  "qa_sparks_treasure_daily","qa_announcement_shield",
  "qa_sparks_snakes_rooms_v1","qa_sparks_snakes_members_v1",
  "qa_sparks_typing_relief_operations",
  // QA Access Check typing challenges must remain on Firebase.
  // They are NOT Sparks data; a typing-relief cross-DB transaction is blocked.
]);
const TRANSITIONS=new Set([":beginTransaction",":rollback",":commit"]);
function relativeDocUrl(endpoint){
  if(typeof endpoint!=="string")return null;
  let value=endpoint;
  if(value.startsWith(FIRESTORE_API))value=value.slice(FIRESTORE_API.length);
  else if(value.startsWith("https:"))return null;
  else if(value.startsWith("/"))value=value.slice(1);
  else return null;
  const parsed=new URL("https://qa-sparks.local/"+value);
  const path=decodeURI(parsed.pathname.slice(1));
  const root=path.split("/")[0];
  if(!ROOTS.has(root))return null;
  return {path,params:parsed.searchParams};
}
function requireSparksOnlyCommit(writes) {
  if (!Array.isArray(writes) || writes.length>100) {
    throw Object.assign(new Error("Invalid Sparks transaction"),{status:400});
  }
  for (const write of writes) {
    const name = write?.update?.name;
    if (typeof name !== "string" || !name.startsWith(FIRESTORE_PREFIX)) {
      throw Object.assign(new Error("Sparks commit rejected: unrecognized resource"),{status:409,code:"CROSS_DATABASE_WRITE_REJECTED"});
    }
    const resource=name.slice(FIRESTORE_PREFIX.length).split("/");
    if (!ROOTS.has(resource[0]) || resource.length%2!==0) {
      throw Object.assign(new Error("Sparks commit cannot write QA Access Check or other Firebase collections"),{status:409,code:"CROSS_DATABASE_WRITE_REJECTED"});
    }
    if(write.delete||write.transform) {
      throw Object.assign(new Error("Sparks transaction includes an unsupported write type"),{status:409,code:"CROSS_DATABASE_WRITE_REJECTED"});
    }
  }
}

export function isSparksBackendRequest(endpoint,method="GET",body){
  if(process.env.SPARKS_DATA_BACKEND!=="supabase")return false;
  if(method==="POST"&&endpoint===":commit"&&Array.isArray(body?.writes)){
    const sparks=body.writes.map(w=>{
      const name=w?.update?.name||w?.delete||w?.transform?.document;
      return typeof name==="string"&&name.startsWith(FIRESTORE_PREFIX)&&ROOTS.has(name.slice(FIRESTORE_PREFIX.length).split("/")[0]);
    });
    if(sparks.some(Boolean)&&!sparks.every(Boolean))
      throw Object.assign(new Error("Mixed Firebase and Supabase transaction rejected"),{status:409,code:"CROSS_DATABASE_WRITE_REJECTED"});
    // Typing Relief's durable operation commits its QA assignment separately.
    // That versioned, Firebase-only commit must use the Firebase transport.
    if(sparks.length&&!sparks.some(Boolean))return false;
  }
  if(method==="POST"&&TRANSITIONS.has(endpoint))return true;
  if(method!=="GET")return false;
  return relativeDocUrl(endpoint)!==null;
}
export async function requestSparksSupabase(endpoint,method="GET",body){
  const url=String(process.env.SPARKS_SUPABASE_BRIDGE_URL||"");
  const token=String(process.env.SPARKS_SUPABASE_BRIDGE_TOKEN||"");
  if(!/^https:\/\/[^\s]+\/functions\/v1\/qa-sparks-runtime(?:-preview|-test)?$/.test(url)||token.length<40)
    throw Object.assign(new Error("QA Sparks Supabase bridge is not configured"),{status:503});
  let payload;
  if(method==="POST"&&endpoint===":commit")requireSparksOnlyCommit(body?.writes);
  if(method==="POST"&&TRANSITIONS.has(endpoint)){
    payload=endpoint===":beginTransaction"?{action:"begin"}:endpoint===":rollback"?{action:"rollback"}:{action:"commit",writes:body?.writes};
  }else if(method==="GET"){
    const parsed=relativeDocUrl(endpoint);
    if(!parsed)throw Object.assign(new Error("Not a Sparks document path"),{status:400});
    const isList=parsed.params.has("pageSize")||parsed.params.has("pageToken")||parsed.params.has("mask.fieldPaths");
    payload=isList?{action:"list",collection:parsed.path,pageSize:Number(parsed.params.get("pageSize"))||200,
      pageToken:parsed.params.get("pageToken")||"",mask:parsed.params.getAll("mask.fieldPaths")}
     :{action:"get",path:parsed.path};
  }else throw Object.assign(new Error("Sparks bridge action not implemented"),{status:400});
  let response;
  try{
    response=await fetch(url,{method:"POST",headers:{"content-type":"application/json",
      "x-qa-sparks-server-secret":token},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(24000)});
  }catch(error){
    throw Object.assign(new Error("QA Sparks Supabase backend unavailable"),{status:503,cause:error});
  }
  const result=await response.json().catch(()=>({}));
  if(response.status===404&&payload.action==="get")return null;
  if(!response.ok){
    const code=result?.firestoreStatus||result?.error||"BACKEND_UNAVAILABLE";
    const status=response.status===409?409:response.status===423?503:response.status>=500?503:response.status;
    throw Object.assign(new Error(String(code)),{status,firestoreStatus:code});
  }
  return result;
}
