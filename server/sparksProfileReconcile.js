import { createSign, randomUUID } from "node:crypto";

const PROJECT = "qa-dashboard-b0b5d";
const ROOT = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/qa_user_profiles";
const MAX_PROFILES = 120;
// The latest reviewed source census contains 30 QA profiles (2026-11-10).
// Fail closed if a later Firestore response is smaller: a partial list must
// never silently deactivate staff. Legitimate roster reductions need review.
const MIN_PROFILES = 30;
const PROFILE_FIELDS = ["username", "displayName", "email", "role", "status",
  "suspendEffectiveDate", "suspendEndDate", "suspendAutoReactivate"];

const fail = (code, status = 503) => Object.assign(new Error(code), { code, status });
const textField = (fields, name) => {
  const f=fields?.[name]||{};
  return String(f.stringValue ?? f.timestampValue ?? "");
};
const boolField = (fields,name) => fields?.[name]?.booleanValue === true;
const cleanText = (value, limit=250) => {
  const out=String(value||"").trim();
  if (out.length>limit || /[\u0000-\u001f\u007f]/u.test(out)) throw fail("INVALID_PROFILE_FIELD", 422);
  return out;
};
function safeProfile(document) {
  const name=String(document?.name||"");
  const prefix="projects/"+PROJECT+"/databases/(default)/documents/";
  if (!name.startsWith(prefix+"qa_user_profiles/")) throw fail("INVALID_PROFILE_PATH",422);
  const path=name.slice(prefix.length);
  if (!/^qa_user_profiles\/[^/]{1,150}$/.test(path)) throw fail("INVALID_PROFILE_PATH",422);
  const fields=document?.fields||{};
  const username=cleanText(textField(fields,"username")||decodeURIComponent(path.split("/").pop()),100);
  const email=cleanText(textField(fields,"email"),250).toLowerCase();
  const role=cleanText(textField(fields,"role"),100);
  const status=cleanText(textField(fields,"status"),60);
  if (!username||!role||!["active","suspended"].includes(status.toLowerCase())) throw fail("INVALID_PROFILE_IDENTITY",422);
  const stamp=String(document?.updateTime||"");
  if (!Number.isFinite(Date.parse(stamp))) throw fail("PROFILE_UPDATE_TIME_MISSING",422);
  return {
    document_path:path,
    original_firestore_update_time:stamp,
    profile: {
      username,
      displayName:cleanText(textField(fields,"displayName")||username),
      email,
      role,
      status:status.toLowerCase()==="active"?"Active":"Suspended",
      suspendEffectiveDate:cleanText(textField(fields,"suspendEffectiveDate"),70),
      suspendEndDate:cleanText(textField(fields,"suspendEndDate"),70),
      suspendAutoReactivate:boolField(fields,"suspendAutoReactivate"),
    },
  };
}
async function googleToken(source,fetcher=fetch) {
  let account;
  try { account=JSON.parse(source); } catch { throw fail("INVALID_FIREBASE_SERVICE_ACCOUNT",503); }
  if (!account?.client_email || !account?.private_key ||
      !String(account.client_email).includes("@") ||
      !String(account.private_key).includes("PRIVATE KEY")) throw fail("INVALID_FIREBASE_SERVICE_ACCOUNT",503);
  const now=Math.floor(Date.now()/1000);
  const enc=(v)=>Buffer.from(JSON.stringify(v)).toString("base64url");
  const assertion=enc({alg:"RS256",typ:"JWT"})+"."+enc({
    iss:account.client_email,
    scope:"https://www.googleapis.com/auth/datastore",
    aud:"https://oauth2.googleapis.com/token",
    iat:now,exp:now+1200,
  });
  const signature=createSign("RSA-SHA256").update(assertion).sign(String(account.private_key).replace(/\\n/g,"\n"),"base64url");
  const response=await fetcher("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:assertion+"."+signature}),
    signal:AbortSignal.timeout(12000),
  });
  if(!response.ok)throw fail("FIREBASE_OAUTH_UNAVAILABLE",503);
  const data=await response.json();
  if(!data?.access_token)throw fail("FIREBASE_TOKEN_MISSING",503);
  return String(data.access_token);
}
export async function getCompleteSparksProfiles({ serviceAccount,fetcher=fetch }={}) {
  if(!serviceAccount)throw fail("FIREBASE_CREDENTIALS_MISSING",503);
  const token=await googleToken(serviceAccount,fetcher);
  const profiles=[];
  const pageTokens=new Set();
  let pageToken="";
  for(let page=0;page<4;page++){
    const url=new URL(ROOT);url.searchParams.set("pageSize","100");
    if(pageToken)url.searchParams.set("pageToken",pageToken);
    for(const field of PROFILE_FIELDS)url.searchParams.append("mask.fieldPaths",field);
    const response=await fetcher(url.toString(),{
      headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(12000),cache:"no-store",
    });
    if(!response.ok)throw fail(response.status===429?"FIREBASE_QUOTA_EXCEEDED":"FIREBASE_PROFILE_READ_FAILED",503);
    const data=await response.json();
    if(!Array.isArray(data.documents))throw fail("FIREBASE_PARTIAL_SOURCE_RESPONSE",503);
    for(const doc of data.documents)profiles.push(safeProfile(doc));
    if(profiles.length>MAX_PROFILES)throw fail("FIREBASE_SOURCE_TOO_LARGE",503);
    const next=String(data.nextPageToken||"");
    if(!next){pageToken="";break;}
    if(pageTokens.has(next))throw fail("FIREBASE_REPEATED_PAGE",503);
    pageTokens.add(next);pageToken=next;
    if(page===3)throw fail("FIREBASE_SOURCE_TRUNCATED",503);
  }
  if(pageToken||profiles.length<MIN_PROFILES)throw fail("FIREBASE_SOURCE_INCOMPLETE",503);
  const names=new Set(),emails=new Set(),paths=new Set();
  for(const item of profiles){
    const name=item.profile.username.toLowerCase(),email=item.profile.email;
    if(paths.has(item.document_path)||names.has(name))throw fail("DUPLICATE_FIREBASE_PROFILE",503);
    paths.add(item.document_path);names.add(name);
    if(email){
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||emails.has(email))throw fail("INVALID_PROFILE_EMAIL",503);
      emails.add(email);
    }
  }
  return profiles;
}
export async function runSparksProfileReconciliation({env=process.env,fetcher=fetch}={}) {
  if(env.SPARKS_PROFILE_SYNC_ENABLED!=="1")return {skipped:true,code:"PROFILE_SYNC_DISABLED"};
  const secret=String(env.SPARKS_SUPABASE_BRIDGE_TOKEN||"");
  const base=String(env.SPARKS_SUPABASE_BRIDGE_URL||"");
  if(secret.length<40||!/^https:\/\/[^/]+\/functions\/v1\/qa-sparks-runtime(?:-preview|-test)?$/.test(base))
    throw fail("SUPABASE_PROFILE_SYNC_NOT_CONFIGURED",503);
  const serviceAccount=env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON||env.FIREBASE_SERVICE_ACCOUNT_JSON||env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const endpoint=base.replace(/qa-sparks-runtime(?:-preview|-test)?$/,"qa-sparks-profile-reconcile");
  const runId=randomUUID();
  const send=async(body)=>{
    const response=await fetcher(endpoint,{
      method:"POST",
      headers:{"content-type":"application/json","x-qa-sparks-server-secret":secret},
      body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(20000),
    });
    if(!response.ok)throw fail("SUPABASE_PROFILE_SYNC_STATUS_UNAVAILABLE",503);
    const result=await response.json();
    if(!result?.ok)throw fail("SUPABASE_PROFILE_SYNC_STATUS_UNAVAILABLE",503);
    return result;
  };
  // Record the start before reading Firebase. If Supabase is unavailable,
  // leave the source untouched rather than consuming Firebase quota.
  await send({action:"report",event:"start",runId});
  try{
    const profiles=await getCompleteSparksProfiles({serviceAccount,fetcher});
    const result=await send({action:"reconcile",runId,profiles});
    if(result.sourceCount!==profiles.length)
      throw fail("SUPABASE_PROFILE_RECONCILIATION_UNVERIFIED",503);
    return {ok:true,sourceCount:profiles.length,reviewedCount:Number(result.reviewedCount)||0,
      blockedCount:Number(result.blockedCount)||0};
  }catch(error){
    // Fail closed, preserve the last valid roster and record only safe error codes.
    const safeCode=String(error?.code||"SPARKS_PROFILE_SYNC_UNAVAILABLE")
      .replace(/[^A-Z0-9_]/g,"_").slice(0,80);
    try{
      await send({action:"report",event:"failed",runId,errorCode:safeCode});
    }catch{
      console.error("qa_sparks_profile_sync_failure_receipt_unavailable");
    }
    throw error;
  }
}
