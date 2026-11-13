// QA Sparks uses the SAME QA username and password after an owner-authorized
// one-time credential migration. The credential is never stored in this client.
const authUrl=String(import.meta.env?.VITE_SPARKS_SUPABASE_AUTH_URL||"").replace(/\/$/,"");
const publishable=String(import.meta.env?.VITE_SPARKS_SUPABASE_PUBLISHABLE_KEY||"");
export function qaSparksLoginEmail(username:string) {
  const normalized=String(username||"").trim().toLowerCase();
  if(!/^[a-z0-9._-]{2,64}$/.test(normalized))throw new Error("Username QA ไม่ถูกต้อง");
  // .invalid is reserved for synthetic identities; messages are never sent here.
  return "qa-"+normalized+"@qa-sparks-login.invalid";
}
export async function signInSparksWithQaPassword(username:string,password:string) {
  if(!authUrl||!publishable)throw Error("ยังไม่ได้ตั้งค่า Supabase Auth");
  if(typeof password!=="string"||!password)throw Error("กรุณากรอกรหัสผ่าน QA เดิม");
  const response=await fetch(authUrl+"/auth/v1/token?grant_type=password",{
    method:"POST",cache:"no-store",
    headers:{"apikey":publishable,"content-type":"application/json"},
    body:JSON.stringify({email:qaSparksLoginEmail(username),password}),
  });
  const tokens=await response.json().catch(()=>({}));
  if(!response.ok||!tokens?.access_token||!tokens?.refresh_token){
    if(response.status===429)throw Error("มีการลองรหัสผ่านหลายครั้ง กรุณาลองใหม่ภายหลัง");
    throw Error("บัญชี QA ยังไม่ได้ซิงก์เข้าสู่ Supabase หรือรหัสผ่านไม่ถูกต้อง");
  }
  const exchanged=await fetch("/api/sparks-auth",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({action:"exchange",expectedUsername:String(username).trim(),access_token:tokens.access_token,
      refresh_token:tokens.refresh_token,expires_in:tokens.expires_in}),
  });
  const payload=await exchanged.json().catch(()=>({}));
  if(!exchanged.ok||payload?.ok!==true||!payload.actor)
    throw Error(String(payload?.error||"บัญชี QA ยังไม่ Active หรือยังไม่ผ่านการตรวจสิทธิ์"));
  if(String(payload.actor.username).toLowerCase()!==String(username).trim().toLowerCase())
    throw Error("บัญชี Supabase ไม่ตรงกับ Username QA ที่เข้าสู่ระบบ");
  if(typeof window!=="undefined")window.dispatchEvent(new Event("qa:sparks-authenticated"));
  return payload.actor as {username:string;displayName:string;role:string;status:string};
}

/** Best-effort synchronization when the employee changes their QA password.
 * The previous password must authenticate with Supabase first. An account that
 * has not been migrated is left untouched; changing QA credentials never
 * grants an unverified user access to another Sparks wallet.
 */
export async function syncSparksQaPasswordChange(username:string,oldPassword:string,newPassword:string){
  if(!authUrl||!publishable||!oldPassword||!newPassword)return false;
  const identity=qaSparksLoginEmail(username);
  const existing=await fetch(authUrl+"/auth/v1/token?grant_type=password",{
    method:"POST",cache:"no-store",headers:{"apikey":publishable,"content-type":"application/json"},
    body:JSON.stringify({email:identity,password:oldPassword}),
  });
  if(!existing.ok)return false;
  const tokens=await existing.json().catch(()=>({}));
  if(!tokens?.access_token)return false;
  const updated=await fetch(authUrl+"/auth/v1/user",{
    method:"PUT",cache:"no-store",
    headers:{"apikey":publishable,"authorization":"Bearer "+tokens.access_token,
      "content-type":"application/json"},
    body:JSON.stringify({password:newPassword}),
  });
  if(!updated.ok)return false;
  await signInSparksWithQaPassword(username,newPassword);
  return true;
}
