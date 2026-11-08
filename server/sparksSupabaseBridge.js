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
  "qa_typing_challenges","qa_typing_challenge_history",
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
export function isSparksBackendRequest(endpoint,method="GET"){
  if(process.env.SPARKS_DATA_BACKEND!=="supabase")return false;
  if(method==="POST"&&TRANSITIONS.has(endpoint))return true;
  if(method!=="GET")return false;
  return relativeDocUrl(endpoint)!==null;
}
export async function requestSparksSupabase(endpoint,method="GET",body){
  const url=String(process.env.SPARKS_SUPABASE_BRIDGE_URL||"");
  const token=String(process.env.SPARKS_SUPABASE_BRIDGE_TOKEN||"");
  if(!/^https:\/\/[^\s]+\/functions\/v1\/qa-sparks-runtime-preview$/.test(url)||token.length<40)
    throw Object.assign(new Error("QA Sparks Supabase bridge is not configured"),{status:503});
  let payload;
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
