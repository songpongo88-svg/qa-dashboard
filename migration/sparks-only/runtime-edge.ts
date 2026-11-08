import postgres from "npm:postgres@3.4.7";
const TOKEN_SHA256="DEPLOY_TIME_TOKEN_HASH";
const ROOTS=new Set(["qa_sparks_wallets","qa_sparks_true_money_requests","qa_sparks_reward_settings","qa_sparks_special_reward_requests","qa_sparks_special_receipt_evidence","qa_sparks_special_receipt_locks","qa_sparks_fruit_players_v1","qa_sparks_fruit_boards","qa_sparks_fruit_rounds","qa_sparks_lottery_draws_v1","qa_sparks_treasure_daily","qa_announcement_shield","qa_sparks_snakes_rooms_v1","qa_sparks_snakes_members_v1","qa_sparks_typing_relief_operations"]);
const CHILDREN={"qa_sparks_wallets":new Set(["history","lottery_tickets"]),"qa_sparks_reward_settings":new Set(["history"]),"qa_sparks_lottery_draws_v1":new Set(["players"])};
const PREFIX="projects/qa-dashboard-b0b5d/databases/(default)/documents/";
const dbUrl=Deno.env.get("SUPABASE_DB_URL");
const sql=dbUrl?postgres(dbUrl,{max:2,prepare:false,ssl:"require",connect_timeout:10,idle_timeout:8}):null;
const send=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");
const eq=(a,b)=>{if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;};
async function canAccess(req){const secret=req.headers.get("x-qa-sparks-server-secret")||"";return secret.length>=40&&secret.length<=150&&eq(await hash(secret),TOKEN_SHA256);}
function parts(value,collection=false){
 if(typeof value!=="string"||value.length>1450||!value.length||/[\u0000-\u001f\u007f]/u.test(value))return null;
 const x=value.split("/");
 if(x.some(y=>!y||y==="."||y===".."))return null;
 if(!ROOTS.has(x[0]))return null;
 if(collection){
  if(x.length===1)return x;
  if(x.length===3&&CHILDREN[x[0]]?.has(x[2]))return x;
  return null;
 }
 if(x.length===2||x.length===4&&CHILDREN[x[0]]?.has(x[2]))return x;
 return null;
}
function toDoc(row,mask=[]){
 if(!row)return null;
 const fields={...row.fields};
 if(Array.isArray(mask)&&mask.length)for(const k of Object.keys(fields))if(!mask.includes(k))delete fields[k];
 return {name:PREFIX+row.source_path,fields,createTime:row.create_time,updateTime:row.update_time};
}
Deno.serve(async req=>{
 try{
  if(req.method==="GET")return send({ok:true,service:"qa-sparks-runtime"});
  if(req.method!=="POST")return send({error:"method-not-allowed"},405);
  if(!(await canAccess(req)))return send({error:"unauthorized"},401);
  if(!sql)return send({error:"database-not-configured"},503);
  const raw=await req.text();
  if(raw.length>2000000)return send({error:"payload-too-large"},413);
  let body;try{body=JSON.parse(raw)}catch{return send({error:"invalid-json"},400)}
  if(body?.action==="status"){
    const r=await sql`SELECT (SELECT count(*)::int FROM sparks_runtime.documents) docs,
    (SELECT writes_enabled FROM sparks_runtime.control WHERE id='live_sparks') writes_enabled`;
    return send({ok:true,docs:r[0].docs,writesEnabled:r[0].writes_enabled});
  }
  if(body?.action==="begin")return send({transaction:crypto.randomUUID()});
  if(body?.action==="rollback")return send({});
  if(body?.action==="get"){
    if(!parts(body.path))return send({error:"invalid-path"},400);
    const rows=await sql`SELECT source_path,fields,create_time,update_time FROM sparks_runtime.documents WHERE source_path=${body.path} LIMIT 1`;
    return rows.length?send(toDoc(rows[0])):send({error:"NOT_FOUND"},404);
  }
  if(body?.action==="list"){
    const cp=parts(body.collection,true);
    if(!cp)return send({error:"invalid-collection-path"},400);
    const size=Math.min(200,Math.max(1,Number(body.pageSize)||200));
    const token=String(body.pageToken||"");
    if(token&&(!parts(token)||!token.startsWith(body.collection+"/")))return send({error:"invalid-page-token"},400);
    const prefix=body.collection+"/";
    const nextDepth=cp.length+1;
    const rows=await sql`SELECT source_path,fields,create_time,update_time FROM sparks_runtime.documents
      WHERE left(source_path,${prefix.length})=${prefix}
        AND array_length(string_to_array(source_path,'/'),1)=${nextDepth}
        AND source_path>${token} ORDER BY source_path ASC LIMIT ${size+1}`;
    const subset=rows.slice(0,size);
    const nextPageToken=rows.length>size?subset[subset.length-1].source_path:"";
    return send({documents:subset.map(r=>toDoc(r,body.mask)),...(nextPageToken?{nextPageToken}:{})});
  }
  if(body?.action==="commit"){
    if(!Array.isArray(body.writes)||body.writes.length>100)return send({error:"invalid-writes"},400);
    const results=await sql`SELECT sparks_runtime.commit_transaction(${sql.json(body.writes)}::jsonb,${sql.json(body.reads||[])}::jsonb) AS result`;
    return send(results[0].result);
  }
  return send({error:"unsupported-action"},400);
 }catch(e){
  const msg=e instanceof Error?e.message:"unknown";
  if(msg.includes("ABORTED_")||["40001","23505","40P01"].includes(e?.code))return send({error:"ABORTED",firestoreStatus:"ABORTED"},409);
  if(msg.includes("SPARKS_WRITES_DISABLED"))return send({error:"SPARKS_WRITES_DISABLED"},423);
  console.error("qa_sparks_preview_error",e instanceof Error?e.name:"unknown");
  return send({error:"sparks-backend-unavailable"},503);
 }
});
