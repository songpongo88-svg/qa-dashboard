// Temporary, expiring, server-to-server migration access. Never returns credentials.
import { createHash, timingSafeEqual } from "node:crypto";
import { getAccessToken } from "./sparks-admin.js";

const project="qa-dashboard-b0b5d";
const resource=`projects/${project}/databases/(default)/documents`;
const roots=new Set(["qa_sparks_wallets","qa_sparks_true_money_requests","qa_sparks_reward_settings",
 "qa_sparks_special_reward_requests","qa_sparks_special_receipt_evidence","qa_sparks_special_receipt_locks",
 "qa_sparks_fruit_players_v1","qa_sparks_fruit_boards","qa_sparks_fruit_rounds","qa_sparks_lottery_draws_v1",
 "qa_sparks_treasure_daily","qa_announcement_shield","qa_sparks_snakes_rooms_v1","qa_sparks_snakes_members_v1",
 "qa_sparks_typing_relief_operations"]);
const children={qa_sparks_wallets:["history","lottery_tickets"],qa_sparks_reward_settings:["history"],qa_sparks_lottery_draws_v1:["players"]};
const hash=s=>createHash("sha256").update(s).digest("hex");
const username="zz_sparks_migration_test";
const typed=v=>v===null?{nullValue:null}:Array.isArray(v)?{arrayValue:{values:v.map(typed)}}:
 typeof v==="object"?{mapValue:{fields:fields(v)}}:typeof v==="boolean"?{booleanValue:v}:
 typeof v==="number"?{integerValue:String(v)}:{stringValue:String(v)};
const fields=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,typed(v)]));
async function google(url,method="GET",body){
 const r=await fetch(url,{method,headers:{Authorization:"Bearer "+await getAccessToken(),"content-type":"application/json"},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(24000)});
 const value=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(value.error?.status||"GOOGLE_REQUEST_FAILED"),{status:r.status});
 return value;
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
 const secret=String(req.headers?.["x-qa-migration-token"]||"");
 const expected=String(process.env.SPARKS_MIGRATION_TOKEN_SHA256||"");
 const expires=Date.parse(process.env.SPARKS_MIGRATION_EXPIRES_AT||"");
 const actual=hash(secret);
 if(req.method!=="POST"||expected.length!==64||secret.length<40||!Number.isFinite(expires)||Date.now()>expires||
   !timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))return res.status(404).json({error:"Not found"});
 try{
  const b=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
  if(b.action==="snapshot"){
   const parts=String(b.collection||"").split("/");
   if(!roots.has(parts[0])||!(parts.length===1||parts.length===3&&children[parts[0]]?.includes(parts[2]))||
     parts.some(p=>!p||p==="."||p===".."))return res.status(400).json({error:"Invalid Sparks collection"});
   const url=new URL(`https://firestore.googleapis.com/v1/${resource}/${parts.map(encodeURIComponent).join("/")}`);
   url.searchParams.set("pageSize","200");
   url.searchParams.set("showMissing","true");
   if(b.pageToken)url.searchParams.set("pageToken",String(b.pageToken));
   return res.status(200).json(await google(url));
  }
  if(b.action==="rules-info"){
   const release=await google(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`);
   const rules=await google(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
   return res.status(200).json({release,rules});
  }
  if(b.action==="publish-rules"){
   const release=await google(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`);
   if(release.rulesetName!==b.expectedRuleset)return res.status(409).json({error:"Rules changed; read again"});
   if(!Array.isArray(b.files)||b.files.length!==1||typeof b.files[0]?.content!=="string"||
     !b.files[0].content.includes("qa_sparks_wallets")||b.files[0].content.length>100000)
      return res.status(400).json({error:"Invalid reviewed rules"});
   const created=await google(`https://firebaserules.googleapis.com/v1/projects/${project}/rulesets`,"POST",{source:{files:b.files}});
   const next=await google(`https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore?updateMask=rulesetName`,"PATCH",{
    name:release.name,rulesetName:created.name});
   return res.status(200).json({ok:true,previousRuleset:release.rulesetName,rulesetName:next.rulesetName});
  }
  if(["seed-fixture","cleanup-fixture"].includes(b.action)){
   if(process.env.VERCEL_ENV!=="preview")return res.status(403).json({error:"Fixture is preview-only"});
   const sessionId="migration-test-"+expected.slice(0,24);
   const paths=[`qa_user_profiles/${username}`,`qa_user_sessions/${sessionId}`,`qa_typing_challenges/${username}`];
   if(b.action==="cleanup-fixture"){
    await google(`https://firestore.googleapis.com/v1/${resource}:commit`,"POST",{writes:paths.map(p=>({delete:resource+"/"+p}))});
    return res.status(200).json({ok:true,cleaned:paths.length});
   }
   const now=new Date().toISOString();
   const values=[{username,displayName:"Migration Test",role:"Agent",status:"Active",migrationFixture:true},
    {username,displayName:"Migration Test",role:"Agent",status:"active",policyVersion:"qa-session-policy-2026-07-15-v1",
     createdAt:now,expiresAt:new Date(Math.min(expires,Date.now()+3600000)).toISOString()},
    {username,queue:[{id:"migration-typing-fixture",mode:"word",word:"test",repeatCount:10}],queueCount:1}];
   await google(`https://firestore.googleapis.com/v1/${resource}:commit`,"POST",{
    writes:paths.map((p,i)=>({update:{name:resource+"/"+p,fields:fields(values[i])},currentDocument:{exists:false}}))});
   return res.status(200).json({ok:true,username,sessionId});
  }
  return res.status(400).json({error:"Unknown migration action"});
 }catch(e){return res.status(Number(e.status)||503).json({error:String(e.message||"Migration request failed")});}
}
