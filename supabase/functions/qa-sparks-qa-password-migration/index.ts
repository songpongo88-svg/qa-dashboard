// QA Sparks: restricted Vercel-server-only credential import and status.
// Never accepts a browser session; Vercel validates the original QA owner
// session and reads the fresh Firestore source, then sends only eligible
// identities through HTTPS with the existing private bridge credential.
const URL=(Deno.env.get("SUPABASE_URL")||"").replace(/\/$/,"");
const ADMIN_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const BRIDGE_HASH="3e6eb4cb263eb395295476543aa1dbf183995bd91782e8ed0533482846c3b26d";
const reply=(status:number,result:Record<string,unknown>)=>new Response(JSON.stringify(result),{
 status,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}
});
const norm=(v:unknown)=>String(v||"").trim().toLowerCase();
const uname=(v:unknown)=>/^[a-z0-9._-]{2,64}$/.test(norm(v));
async function verifyBridge(req:Request){
 const secret=req.headers.get("x-qa-sparks-server-secret")||"";
 if(req.headers.get("x-qa-sparks-migration-mode")!=="one-time-source-import" ||
    secret.length<40||secret.length>150)return false;
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret)));
 const hashed=Array.from(digest).map(byte=>byte.toString(16).padStart(2,"0")).join("");
 let mismatch=0;
 for(let i=0;i<64;i++)mismatch|=hashed.charCodeAt(i)^BRIDGE_HASH.charCodeAt(i);
 return mismatch===0;
}
async function reqAuth(path:string,method:string,body?:unknown){
 const response=await fetch(URL+path,{
   method,headers:{"apikey":ADMIN_KEY,Authorization:"Bearer "+ADMIN_KEY,
   ...(body===undefined?{}:{"content-type":"application/json"})},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
 });
 const result=await response.json().catch(()=>({}));
 return {ok:response.ok,status:response.status,result};
}
async function roster(){
 const response=await reqAuth("/rest/v1/rpc/sparks_qa_migration_directory_v1","POST",{});
 if(!response.ok || !Array.isArray(response.result))
   throw Error("REVIEWED_ROSTER_UNAVAILABLE");
 const all=response.result as {username:string;role:string}[];
 if(all.length!==21)throw Error("REVIEWED_ACTIVE_ROSTER_COUNT_CHANGED");
 const names=all.map(x=>norm(x.username));
 if(new Set(names).size!==21||!all.some(x=>norm(x.username)==="songpon"&&x.role==="Quality Assurance"))
   throw Error("REVIEWED_ACTIVE_ROSTER_INVALID");
 return names.sort();
}
Deno.serve(async (req:Request)=>{
 if(req.method!=="POST")return reply(405,{error:"METHOD_NOT_ALLOWED"});
 if(!URL.startsWith("https://") || !ADMIN_KEY)return reply(503,{error:"AUTH_SERVICE_UNAVAILABLE"});
 if(!await verifyBridge(req))return reply(403,{error:"TRUSTED_SERVER_REQUIRED"});
 try{
   const data=await req.json().catch(()=>null);
   if(data?.action==="status"){
     const active=await roster();
     const directory=await reqAuth("/auth/v1/admin/users?per_page=200&page=1","GET");
     if(!directory.ok||!Array.isArray(directory.result.users))
       return reply(503,{error:"AUTH_DIRECTORY_UNAVAILABLE"});
     const migratedUsernames=(directory.result.users as Record<string,unknown>[])
       .map(user=>{
         const metadata=user.app_metadata as Record<string,unknown>||{};
         const username=norm(metadata.qa_username);
         return metadata.qa_auth_source==="qa-dashboard-migrated" && active.includes(username) &&
           norm(user.email)==="qa-"+username+"@qa-sparks-login.invalid" ? username : "";
       }).filter(Boolean).sort();
     if(new Set(migratedUsernames).size!==migratedUsernames.length)
       return reply(409,{error:"DUPLICATE_MIGRATED_IDENTITIES"});
     return reply(200,{ok:true,activeCount:active.length,migratedUsernames});
   }
   if(!data||data.action!=="import-existing-qa-passwords"||
       !Array.isArray(data.entries)||!Array.isArray(data.expectedActive))
     return reply(400,{error:"INVALID_MIGRATION_PAYLOAD"});
   const expected=data.expectedActive.map(norm);
   if(expected.length!==21 || expected.some((x:string)=>!uname(x))||
      new Set(expected).size!==21)return reply(409,{error:"SOURCE_ROSTER_MISMATCH"});
   const verified=await roster();
   if(verified.some((name,i)=>name!==[...expected].sort()[i]))
     return reply(409,{error:"ACTIVE_ROSTER_NOT_MATCHED"});
   const entries=data.entries as {username?:unknown;password?:unknown;passwordExpiresAt?:unknown}[];
   if(!entries.length||entries.length>21)return reply(400,{error:"INVALID_ELIGIBLE_COUNT"});
   const names=new Set<string>();
   for(const item of entries){
     const n=norm(item?.username),p=item?.password;
     if(!uname(n)||names.has(n)||!verified.includes(n)||typeof p!=="string"||
        p.length<6||p.length>128)return reply(409,{error:"INVALID_ELIGIBLE_IDENTITY"});
     names.add(n);
     const expiry=String(item.passwordExpiresAt||"").trim();
     if(expiry&&(!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=Date.now()))
       return reply(409,{error:"CREDENTIAL_EXPIRED"});
   }
   const identities=await reqAuth("/auth/v1/admin/users?per_page=200&page=1","GET");
   if(!identities.ok||!Array.isArray(identities.result.users))
     return reply(503,{error:"AUTH_DIRECTORY_UNAVAILABLE"});
   const existing=new Map((identities.result.users as Record<string,unknown>[]).map(u=>[norm(u.email),u]));
   for(const item of entries){
     const username=norm(item.username),email="qa-"+username+"@qa-sparks-login.invalid";
     const current=existing.get(email);
     if(!current)continue;
     const meta=current.app_metadata as Record<string,unknown>||{};
     if(meta.qa_auth_source!=="qa-dashboard-migrated"||norm(meta.qa_username)!==username)
       return reply(409,{error:"EXISTING_IDENTITY_CONFLICT",username});
   }
   let created=0,updated=0;
   const failed:{username:string;state:string}[]=[];
   for(const entry of entries){
     const username=norm(entry.username);
     const email="qa-"+username+"@qa-sparks-login.invalid";
     const current=existing.get(email);
     const attributes={password:entry.password,
       app_metadata:{qa_auth_source:"qa-dashboard-migrated",qa_username:username}};
     const result=current
       ?await reqAuth("/auth/v1/admin/users/"+encodeURIComponent(String(current.id)),"PUT",attributes)
       :await reqAuth("/auth/v1/admin/users","POST",{...attributes,email,email_confirm:true});
     if(result.ok){if(current)updated++;else created++}
     else failed.push({username,state:"failed"});
   }
   return reply(failed.length?207:200,{
     submitted:entries.length,created,updated,failed,
     // Passwords, synthetic emails, credentials and access keys are never returned.
   });
 }catch{
   return reply(503,{error:"MIGRATION_UNAVAILABLE"});
 }
});
