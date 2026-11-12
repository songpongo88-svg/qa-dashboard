import { auditQaCredentialSource } from "./sparksQaCredentialPreflight.js";

const normalize = value => String(value ?? "").trim().toLowerCase();

export async function migrateQaPasswordsFromTrustedSource(profiles,{
  token, url, transport=fetch, now=new Date(), timeoutMs=85000, onlyUsernames=null,
}={}){
  const audit=auditQaCredentialSource(profiles,{now,minActive:21});
  if(audit.blocked.length || !audit.canStartStagedMigration)
    return {ok:false,code:"SOURCE_CREDENTIAL_BLOCKED",audit};
  if(audit.active!==21 || audit.pending.some(item=>item.reason!=="QA_PASSWORD_NOT_SET"))
    return {ok:false,code:"SOURCE_ROSTER_MISMATCH",audit};
  // Preserve the existing QA identity, owner role and active/suspension
  // verification. Credentials exist only inside this trusted request.
  const active=profiles.filter(row=>normalize(row.status)==="active");
  const expectedActive=active.map(row=>normalize(row.username)).sort();
  const allReady=active.filter(row=>typeof row.password==="string" && row.password.length>=6 &&
       row.password.length<=128).map(row=>({
    username:normalize(row.username),password:row.password,
    passwordExpiresAt:row.passwordExpiresAt||row.accessExpiresAt||"",
  }));
  if(expectedActive.length!==21 || allReady.length!==audit.ready)
    return {ok:false,code:"SOURCE_ROSTER_MISMATCH",audit};
  // On repeated cron runs, never overwrite the password of an identity that
  // already migrated. Only newly eligible QA accounts may be provisioned.
  const normalizedTargets=onlyUsernames===null?null:Array.isArray(onlyUsernames)
    ?onlyUsernames.map(normalize):null;
  if(onlyUsernames!==null && (!normalizedTargets || new Set(normalizedTargets).size!==normalizedTargets.length ||
    normalizedTargets.some(name=>!allReady.some(row=>row.username===name))))
    return {ok:false,code:"INVALID_MIGRATION_TARGET_SET",audit};
  const targets=normalizedTargets===null?null:new Set(normalizedTargets);
  const entries=targets?allReady.filter(row=>targets.has(row.username)):allReady;
  if(entries.length===0)return {ok:true,code:"ALREADY_MIGRATED",audit,submitted:0,created:0,updated:0,failed:[]};
  if(typeof token!=="string" || token.length<40 || token.length>150)
    return {ok:false,code:"SERVER_BRIDGE_SECRET_MISSING",audit};
  let parsed;
  try{
    const endpoint=new URL("/functions/v1/qa-sparks-qa-password-migration",url);
    if(endpoint.protocol!=="https:")throw Error("HTTPS_REQUIRED");
    const response=await transport(endpoint.toString(),{
      method:"POST",cache:"no-store",signal:AbortSignal.timeout(timeoutMs),
      headers:{"content-type":"application/json","x-qa-sparks-server-secret":token,
        "x-qa-sparks-migration-mode":"one-time-source-import"},
      body:JSON.stringify({action:"import-existing-qa-passwords",expectedActive,entries}),
    });
    parsed=await response.json().catch(()=>({}));
    if(!response.ok){
      return {ok:false,code:"REMOTE_IMPORT_REJECTED",httpStatus:response.status,audit};
    }
  }catch{
    return {ok:false,code:"REMOTE_IMPORT_UNAVAILABLE",audit};
  }
  const created=Number(parsed?.created)||0,updated=Number(parsed?.updated)||0;
  const failed=Array.isArray(parsed?.failed)?parsed.failed.map(x=>({
    username:normalize(x.username),state:"failed",
  })):[];
  return {
    ok:failed.length===0 && created+updated===entries.length,
    code:failed.length===0 && created+updated===entries.length?"IMPORTED":"PARTIAL_IMPORT",
    audit,submitted:entries.length,created,updated,failed,
  };
}


// Only private Vercel server code may use this introspection. The Edge function
// verifies the same private bridge secret before reading mapped Auth identities.
// No passwords or email addresses are returned.
export async function getMigratedQaAuthUsernames({token,url,transport=fetch,timeoutMs=15000}={}){
  if(typeof token!=="string"||token.length<40||token.length>150)
    throw Object.assign(new Error("SERVER_BRIDGE_SECRET_MISSING"),{code:"SERVER_BRIDGE_SECRET_MISSING"});
  const endpoint=new URL("/functions/v1/qa-sparks-qa-password-migration",url);
  if(endpoint.protocol!=="https:")throw Object.assign(new Error("HTTPS_REQUIRED"),{code:"HTTPS_REQUIRED"});
  const response=await transport(endpoint.toString(),{
    method:"POST",cache:"no-store",signal:AbortSignal.timeout(timeoutMs),
    headers:{"content-type":"application/json","x-qa-sparks-server-secret":token,
      "x-qa-sparks-migration-mode":"one-time-source-import"},
    body:JSON.stringify({action:"status"}),
  });
  if(!response.ok)throw Object.assign(new Error("SUPABASE_AUTH_STATUS_UNAVAILABLE"),{code:"SUPABASE_AUTH_STATUS_UNAVAILABLE"});
  const payload=await response.json().catch(()=>null);
  if(!payload?.ok||payload.activeCount!==21||!Array.isArray(payload.migratedUsernames)||
    payload.migratedUsernames.length>21)throw Object.assign(new Error("UNTRUSTED_AUTH_STATUS"),{code:"UNTRUSTED_AUTH_STATUS"});
  const usernames=payload.migratedUsernames.map(normalize);
  if(usernames.some(name=>!/^[a-z0-9._-]{2,64}$/.test(name))||
    new Set(usernames).size!==usernames.length)throw Object.assign(new Error("UNTRUSTED_AUTH_STATUS"),{code:"UNTRUSTED_AUTH_STATUS"});
  return usernames;
}
