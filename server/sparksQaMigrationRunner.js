import { auditQaCredentialSource } from "./sparksQaCredentialPreflight.js";

const normalize = value => String(value ?? "").trim().toLowerCase();

export async function migrateQaPasswordsFromTrustedSource(profiles,{
  token, url, transport=fetch, now=new Date(), timeoutMs=85000,
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
  const entries=active.filter(row=>typeof row.password==="string" && row.password.length>=6 &&
       row.password.length<=128).map(row=>({
    username:normalize(row.username),password:row.password,
    passwordExpiresAt:row.passwordExpiresAt||row.accessExpiresAt||"",
  }));
  if(expectedActive.length!==21 || entries.length!==audit.ready)
    return {ok:false,code:"SOURCE_ROSTER_MISMATCH",audit};
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
    ok:failed.length===0 && created+updated===audit.ready,
    code:failed.length===0 && created+updated===audit.ready?"IMPORTED":"PARTIAL_IMPORT",
    audit,submitted:audit.ready,created,updated,failed,
  };
}
