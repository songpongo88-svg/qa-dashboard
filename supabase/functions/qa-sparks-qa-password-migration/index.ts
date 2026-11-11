// Owner-authorized, one-time migration of existing QA credentials to Supabase Auth.
// Passwords are received over HTTPS and immediately handed to GoTrue, which stores
// secure password hashes. This function NEVER stores or returns plaintext passwords.
// No new password and no OTP is required for an enrolled QA employee.
const SUPABASE_URL=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
const ANON_KEY=Deno.env.get("SUPABASE_ANON_KEY")||"";
const ADMIN_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const json=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{
 status,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"},
});
const usernamePattern=/^[a-z0-9._-]{2,64}$/;
const normalize=(value:unknown)=>String(value||"").trim().toLowerCase();
function syntheticEmail(username:string){return "qa-"+username+"@qa-sparks-login.invalid";}
async function callAuth(path:string,method:string,token:string,body?:unknown){
 const resp=await fetch(SUPABASE_URL+path,{
  method,headers:{"apikey":ADMIN_KEY,"Authorization":"Bearer "+token,
  ...(body===undefined?{}:{"content-type":"application/json"})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
 });
 const value=await resp.json().catch(()=>({}));
 return {ok:resp.ok,status:resp.status,value};
}
async function verifyOwner(jwt:string){
 const user=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{"apikey":ANON_KEY,Authorization:"Bearer "+jwt}});
 if(!user.ok)return false;
 const identity=await user.json().catch(()=>({}));
 if(!identity.id||!identity.email_confirmed_at)return false;
 const rpc=await fetch(SUPABASE_URL+"/rest/v1/rpc/sparks_verified_identity_v1",{
  method:"POST",headers:{"apikey":ANON_KEY,Authorization:"Bearer "+jwt,"content-type":"application/json"},body:"{}",
 });
 if(!rpc.ok)return false;
 const rows=await rpc.json().catch(()=>[]);
 return Array.isArray(rows)&&rows.length===1&&normalize(rows[0].username)==="songpon"&&rows[0].role==="Quality Assurance";
}
async function activeRoster(jwt:string){
 const resp=await fetch(SUPABASE_URL+"/rest/v1/rpc/sparks_admin_directory_v1",{
  method:"POST",headers:{"apikey":ANON_KEY,Authorization:"Bearer "+jwt,"content-type":"application/json"},body:"{}",
 });
 if(!resp.ok)throw Error("Current QA Active roster is not verified. Please sync profiles before migration.");
 const rows=await resp.json().catch(()=>[]);
 if(!Array.isArray(rows)||rows.length<1)throw Error("No verified Active roster");
 return new Map(rows.map(row=>[normalize(row.username),row]));
}
Deno.serve(async req=>{
 if(req.method!=="POST")return json(405,{error:"Method not allowed"});
 if(!SUPABASE_URL.startsWith("https://")||!ADMIN_KEY||!ANON_KEY)
   return json(503,{error:"Secure migration server is not configured"});
 const bearer=String(req.headers.get("authorization")||"");
 if(!bearer.startsWith("Bearer "))return json(401,{error:"Verified owner session required"});
 const jwt=bearer.slice(7);
 try{
  if(!await verifyOwner(jwt))return json(403,{error:"Only verified QA owner may migrate existing QA credentials"});
  const payload=await req.json().catch(()=>null);
  const entries=payload?.entries;
  if(!Array.isArray(entries)||entries.length<1||entries.length>35)
    return json(400,{error:"Submit 1 to 35 Active QA profile credentials"});
  const roster=await activeRoster(jwt);
  const distinct=new Set<string>();const prepared:{username:string,password:string}[]=[];
  const skipped:string[]=[];
  for(const row of entries){
   const username=normalize(row?.username),password=row?.password;
   if(!usernamePattern.test(username)||distinct.has(username)){
    return json(400,{error:"Duplicate or invalid QA username"});
   }
   distinct.add(username);
   // The roster is server-verified, not client-supplied. Suspended accounts
   // cannot be provisioned even if the browser sends a stale Active status.
   if(!roster.has(username)){skipped.push(username);continue;}
   if(typeof password!=="string"||password.length<6||password.length>128){
    skipped.push(username);continue;
   }
   if(row?.passwordExpiresAt && Number.isFinite(Date.parse(String(row.passwordExpiresAt)))
      && Date.parse(String(row.passwordExpiresAt)) < Date.now()){
    skipped.push(username);continue;
   }
   prepared.push({username,password});
  }
  // Idempotent: only update identities that this exact migration created.
  const list=await callAuth("/auth/v1/admin/users?per_page=100&page=1","GET",ADMIN_KEY);
  if(!list.ok)return json(503,{error:"Supabase Auth admin roster unavailable"});
  const existing=new Map(((list.value?.users||[]) as Record<string,unknown>[])
    .map(u=>[normalize(u.email),u]));
  const results:{username:string;state:string}[]=[];
  for(const row of prepared){
   const email=syntheticEmail(row.username);
   const old=existing.get(email) as Record<string,unknown>|undefined;
   const appMeta={qa_auth_source:"qa-dashboard-migrated",qa_username:row.username};
   let result;
   if(old){
    const prev=old.app_metadata as Record<string,unknown>||{};
    if(prev.qa_auth_source!=="qa-dashboard-migrated"||normalize(prev.qa_username)!==row.username){
      results.push({username:row.username,state:"identity_conflict"});continue;
    }
    result=await callAuth("/auth/v1/admin/users/"+encodeURIComponent(String(old.id)),"PUT",ADMIN_KEY,
      {password:row.password,app_metadata:appMeta});
   }else{
    result=await callAuth("/auth/v1/admin/users","POST",ADMIN_KEY,
      {email,password:row.password,email_confirm:true,app_metadata:appMeta});
   }
   results.push({username:row.username,state:result.ok?(old?"updated":"created"):"failed"});
  }
  return json(200,{
    submitted:entries.length,eligible:prepared.length,
    created:results.filter(x=>x.state==="created").length,
    updated:results.filter(x=>x.state==="updated").length,
    skipped,failed:results.filter(x=>x.state!=="created"&&x.state!=="updated"),
    // No email, token or password is returned.
  });
 }catch(error){
  // Do not return or log raw exceptions; they may contain authentication data.
  return json(503,{error:"Cannot migrate QA credentials while roster or Auth service is unavailable"});
 }
});
