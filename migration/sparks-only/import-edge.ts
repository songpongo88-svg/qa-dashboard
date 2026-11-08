// Short-lived source import. Token hashes are supplied only when deploying.
import postgres from "npm:postgres@3.4.7";
const TOKEN_SHA256="DEPLOY_TIME_TOKEN_HASH";
const EXPIRES_AT="DEPLOY_TIME_EXPIRY";
const sql=postgres(Deno.env.get("SUPABASE_DB_URL")!,{max:2,prepare:false,ssl:"require",connect_timeout:10,idle_timeout:8});
const roots=["qa_sparks_wallets","qa_sparks_true_money_requests","qa_sparks_reward_settings",
 "qa_sparks_special_reward_requests","qa_sparks_special_receipt_evidence","qa_sparks_special_receipt_locks",
 "qa_sparks_fruit_players_v1","qa_sparks_fruit_boards","qa_sparks_fruit_rounds","qa_sparks_lottery_draws_v1",
 "qa_sparks_treasure_daily","qa_announcement_shield","qa_sparks_snakes_rooms_v1","qa_sparks_snakes_members_v1",
 "qa_sparks_typing_relief_operations"];
const prefix="projects/qa-dashboard-b0b5d/databases/(default)/documents/";
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,"0")).join("");
Deno.serve(async req=>{
 try{
  const token=req.headers.get("x-qa-migration-token")||"";
  if(req.method!=="POST"||Date.now()>Date.parse(EXPIRES_AT)||token.length<40||await hash(token)!==TOKEN_SHA256)
   return reply({error:"Not found"},404);
  const b=await req.json();
  if(!/^server-sync-[a-zA-Z0-9_-]{8,80}$/.test(b.batchId||""))return reply({error:"Invalid batch"},400);
  if(b.action==="import"){
   if(!Array.isArray(b.documents)||b.documents.length>50)return reply({error:"Invalid chunk"},400);
   const docs=[];
   for(const d of b.documents){
    const p=String(d.name||"").slice(prefix.length);
    if(!d.name?.startsWith(prefix)||!roots.includes(p.split("/")[0])||!d.fields||!d.createTime||!d.updateTime)
     return reply({error:"Invalid source document"},400);
    docs.push({p,d,sha:await hash(JSON.stringify(d.fields))});
   }
   await sql.begin(async tx=>{
    await tx`INSERT INTO sparks_migration.batches(batch_id,notes) VALUES(${b.batchId},'Server-side Firebase export; no additive balance changes') ON CONFLICT DO NOTHING`;
    for(const {p,d,sha} of docs)await tx`INSERT INTO sparks_migration.documents(source_path,collection_group,payload,source_create_time,source_update_time,source_sha256,batch_id)
     VALUES(${p},${p.split('/').at(-2)},${tx.json(d.fields)},${d.createTime},${d.updateTime},${sha},${b.batchId})
     ON CONFLICT(source_path) DO UPDATE SET payload=excluded.payload,source_create_time=excluded.source_create_time,
      source_update_time=excluded.source_update_time,source_sha256=excluded.source_sha256,batch_id=excluded.batch_id,copied_at=now()`;
   });
   return reply({ok:true,imported:docs.length});
  }
  if(b.action==="finalize"){
   // Live import is permitted only during the release pause and with the
   // database write gate held closed. Preserve pre-cutover archives separately.
   const state=await fetch("https://qa-dashboard-nine.vercel.app/api/cloud-status",{cache:"no-store"}).then(r=>r.json());
   if(state.sparksWritesPaused!==true)return reply({error:"Live Sparks API is not paused"},409);
   const result=await sql.begin(async tx=>{
    const gate=await tx`SELECT writes_enabled FROM sparks_runtime.control WHERE id='live_sparks' FOR UPDATE`;
    if(gate[0]?.writes_enabled!==false)throw new Error("Runtime must be frozen");
    const count=await tx`SELECT count(*)::int n FROM sparks_migration.documents WHERE batch_id=${b.batchId}`;
    if(count[0].n!==b.expectedDocuments||count[0].n<14)throw new Error("Source count mismatch");
    await tx`DELETE FROM sparks_runtime.documents r WHERE split_part(source_path,'/',1)=ANY(${roots})
     AND NOT EXISTS(SELECT 1 FROM sparks_migration.documents s WHERE s.source_path=r.source_path AND s.batch_id=${b.batchId})`;
    await tx`INSERT INTO sparks_runtime.documents(source_path,fields,create_time,update_time)
     SELECT source_path,payload,source_create_time,source_update_time FROM sparks_migration.documents WHERE batch_id=${b.batchId}
     ON CONFLICT(source_path) DO UPDATE SET fields=excluded.fields,create_time=excluded.create_time,update_time=excluded.update_time,copied_from_snapshot_at=now()`;
    const audit=await tx`SELECT count(*)::int documents,count(*) FILTER(WHERE s.payload IS DISTINCT FROM r.fields OR s.source_update_time IS DISTINCT FROM r.update_time OR s.source_create_time IS DISTINCT FROM r.create_time)::int mismatches
     FROM sparks_migration.documents s JOIN sparks_runtime.documents r USING(source_path) WHERE s.batch_id=${b.batchId}`;
    if(audit[0].mismatches!==0)throw new Error("Payload parity failed");
    await tx`UPDATE sparks_migration.batches SET completed_at=now(),imported_documents=${count[0].n},expected_documents=${b.expectedDocuments} WHERE batch_id=${b.batchId}`;
    return audit[0];
   });
   return reply({ok:true,...result});
  }
  return reply({error:"Unknown action"},400);
 }catch(e){console.error("sparks_import_failed",e instanceof Error?e.message:"unknown");return reply({error:"Import failed; transaction rolled back"},503)}
});
