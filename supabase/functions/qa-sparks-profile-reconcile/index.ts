import postgres from "npm:postgres@3.4.7";

// Dedicated QA Sparks roster reconciliation. It cannot access or modify Wallet,
// rewards, Evaluation, Appeals, or any source Firebase records.
const TOKEN_SHA256 = "3e6eb4cb263eb395295476543aa1dbf183995bd91782e8ed0533482846c3b26d";
const dbUrl = Deno.env.get("SUPABASE_DB_URL");
const sql = dbUrl ? postgres(dbUrl, {max:2,prepare:false,ssl:"require",connect_timeout:10,idle_timeout:8}) : null;
const send=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",
    "x-content-type-options":"nosniff"},
});
async function authorized(req:Request){
  const token=req.headers.get("x-qa-sparks-server-secret")||"";
  if(token.length<40||token.length>150)return false;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))))
    .map(x=>x.toString(16).padStart(2,"0")).join("");
  let diff=0;
  for(let i=0;i<64;i++)diff|=hash.charCodeAt(i)^TOKEN_SHA256.charCodeAt(i);
  return diff===0;
}
type Profile={username:string;displayName:string;email:string;role:string;status:"Active"|"Suspended";
 suspendEffectiveDate:string;suspendEndDate:string;suspendAutoReactivate:boolean};
type Row={document_path:string;original_firestore_update_time:string;profile:Profile};
const validStr=(v:unknown,max=250)=>typeof v==="string"&&v.length<=max&&!/[\u0000-\u001f\u007f]/u.test(v);
function validate(input:unknown):Row[] {
  if(!Array.isArray(input)||input.length<25||input.length>120)throw Error("invalid source count");
  const paths=new Set<string>(),users=new Set<string>(),emails=new Set<string>();
  for(const row of input){
    if(!row||typeof row!=="object")throw Error("invalid row");
    const v=row as Row,p=v.profile;
    if(!validStr(v.document_path,160)||!/^qa_user_profiles\/[^/]{1,150}$/.test(v.document_path)||
      paths.has(v.document_path)||!validStr(v.original_firestore_update_time,80)||
      !Number.isFinite(Date.parse(v.original_firestore_update_time))||!p||typeof p!=="object")
      throw Error("invalid source path or timestamp");
    if(!validStr(p.username,100)||!p.username||!validStr(p.displayName)||!validStr(p.email)||
      !validStr(p.role,100)||!p.role||!["Active","Suspended"].includes(p.status)||
      !validStr(p.suspendEffectiveDate,70)||!validStr(p.suspendEndDate,70)||
      typeof p.suspendAutoReactivate!=="boolean")throw Error("invalid profile");
    if(p.email&& !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))throw Error("invalid email");
    const user=p.username.toLowerCase(),email=p.email.toLowerCase();
    if(users.has(user)||(email&&emails.has(email)))throw Error("duplicate identity");
    paths.add(v.document_path);users.add(user);if(email)emails.add(email);
  }
  return input as Row[];
}
const uuidOk=(v:unknown):v is string=>typeof v==="string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const codeOk=(v:unknown):v is string=>typeof v==="string"&&/^[A-Z0-9_]{1,80}$/.test(v);
// Restricted job diagnostics only: never store emails, usernames, cookies, or tokens.
async function reportRun(payload:{runId?:unknown;event?:unknown;errorCode?:unknown}) {
  if(!uuidOk(payload.runId)) return send({error:"invalid-run-id"},422);
  if(payload.event==="start") {
    await sql`INSERT INTO qa_migration.sparks_profile_sync_runs(run_id,status)
      VALUES (${payload.runId}::uuid,'started') ON CONFLICT(run_id) DO NOTHING`;
    return send({ok:true,recorded:true});
  }
  if(payload.event==="failed"){
    if(!codeOk(payload.errorCode))return send({error:"invalid-error-code"},422);
    await sql`UPDATE qa_migration.sparks_profile_sync_runs
      SET status='failed',finished_at=now(),error_code=${payload.errorCode}
      WHERE run_id=${payload.runId}::uuid AND status='started'`;
    return send({ok:true,recorded:true});
  }
  return send({error:"unsupported-event"},422);
}
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return send({error:"method-not-allowed"},405);
  if(!(await authorized(req)))return send({error:"unauthorized"},401);
  if(!sql)return send({error:"database-unavailable"},503);
  try{
    const raw=await req.text();
    if(raw.length>100000)return send({error:"payload-too-large"},413);
    const payload=JSON.parse(raw);
    if(payload?.action==="report")return await reportRun(payload);
    if(payload?.action!=="reconcile")return send({error:"unsupported-action"},400);
    const runId=payload.runId;
    if(runId !== undefined && !uuidOk(runId))return send({error:"invalid-run-id"},422);
    let profiles:Row[];
    try{profiles=validate(payload.profiles)}catch{return send({error:"invalid-source-snapshot"},422)}
    // Single transaction: incomplete source or any SQL failure changes nothing.
    const result=await sql.begin(async tx=>{
      const before=await tx`SELECT count(*)::int AS n FROM qa_migration.sparks_profile_reconciliation_v1`;
      if(Number(before[0].n)>=25&&profiles.length<Math.ceil(Number(before[0].n)*0.8))
        throw Error("SOURCE_COUNT_DROPPED");
      await tx`
        INSERT INTO qa_migration.sparks_profile_reconciliation_v1 AS previous
         (document_path,original_firestore_update_time,profile,snapshot_imported_at,reviewed)
        SELECT incoming.document_path, incoming.original_firestore_update_time::timestamptz,
          incoming.profile, now(), false
        FROM jsonb_to_recordset(${tx.json(profiles)}::jsonb)
          AS incoming(document_path text,original_firestore_update_time text,profile jsonb)
        ON CONFLICT (document_path) DO UPDATE SET
          original_firestore_update_time=EXCLUDED.original_firestore_update_time,
          profile=EXCLUDED.profile,
          snapshot_imported_at=now(),
          reviewed=(
            previous.reviewed
            AND lower(btrim(coalesce(previous.profile->>'email','')))=lower(btrim(coalesce(EXCLUDED.profile->>'email','')))
            AND coalesce(previous.profile->>'role','')=coalesce(EXCLUDED.profile->>'role','')
            AND lower(coalesce(previous.profile->>'username',''))=lower(coalesce(EXCLUDED.profile->>'username',''))
            AND NOT (
              lower(coalesce(previous.profile->>'status',''))='suspended'
              AND lower(coalesce(EXCLUDED.profile->>'status',''))='active'
            )
            AND NOT (
              coalesce(previous.profile->>'suspendEffectiveDate','')<>''
              AND coalesce(EXCLUDED.profile->>'suspendEffectiveDate','')=''
            )
            AND coalesce(previous.profile->>'suspendAutoReactivate','false')=
                coalesce(EXCLUDED.profile->>'suspendAutoReactivate','false')
          )
        WHERE EXCLUDED.original_firestore_update_time>=previous.original_firestore_update_time
      `;
      // A deleted/missing account is never silently authorized.
      await tx`UPDATE qa_migration.sparks_profile_reconciliation_v1 AS item
        SET reviewed=false
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(${tx.json(profiles)}::jsonb)
          AS incoming(document_path text)
          WHERE incoming.document_path=item.document_path
        )`;
      const rows=await tx`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE reviewed)::int AS reviewed,
        count(*) FILTER (WHERE NOT reviewed)::int AS blocked
        FROM qa_migration.sparks_profile_reconciliation_v1`;
      if(runId){
        const finished=await tx`UPDATE qa_migration.sparks_profile_sync_runs SET
          status='success',finished_at=now(),error_code=NULL,
          source_count=${profiles.length},reviewed_count=${Number(rows[0].reviewed)},
          blocked_count=${Number(rows[0].blocked)}
          WHERE run_id=${runId}::uuid AND status='started' RETURNING run_id`;
        if(finished.length!==1)throw Error("SYNC_RUN_NOT_STARTED");
      }
      return rows[0];
    });
    return send({ok:true,sourceCount:profiles.length,reviewedCount:Number(result.reviewed),
      blockedCount:Number(result.blocked)});
  }catch(error){
    const code=String(error instanceof Error?error.message:"");
    if(code==="SOURCE_COUNT_DROPPED")return send({error:"source-count-dropped"},409);
    console.error("sparks_profile_reconciliation_failed");
    return send({error:"reconciliation-unavailable"},503);
  }
});
