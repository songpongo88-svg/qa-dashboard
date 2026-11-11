import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build, transform } from "esbuild";

const read=path=>readFile(path,"utf8");
const [ui,edge,sql,api,server,app,auth,qaSparks,admin]=await Promise.all([
 read("src/sparksQaPasswordLogin.ts"),
 read("supabase/functions/qa-sparks-qa-password-migration/index.ts"),
 read("migration/sparks-only/sparks-qa-username-password-identity.sql"),
 read("api/sparks-auth.js"),
 read("server/sparksSupabaseAuth.js"),
 read("src/App.tsx"),
 read("src/SparksEmailAuth.tsx"),
 read("src/QASparks.tsx"),
 read("src/SparksQaCredentialMigration.tsx"),
]);
await transform(edge,{loader:"ts"});
await transform(auth,{loader:"tsx"});
await transform(admin,{loader:"tsx"});
assert.ok(sql.includes("raw_app_meta_data")&&!sql.includes("raw_user_meta_data"));
assert.ok(sql.includes("s.reviewed is true")&&sql.includes("s.snapshot_imported_at>=now()-interval '7 days'"));
assert.ok(sql.includes("suspendEffectiveDate")&&sql.includes("suspendAutoReactivate"));
assert.ok(edge.includes('verifyOwner(jwt)')&&edge.includes('roster.has(username)'));
assert.ok(edge.includes('ADMIN_KEY')&&edge.includes('qa_auth_source:"qa-dashboard-migrated"'));
assert.ok(!edge.includes('console.log(')&&!admin.includes("console.log("));
assert.ok(server.includes('actor.username!=="songpon"')&&server.includes('expected!==actor.username'));
assert.ok(api.includes('withSparksRequest(req,res,()=>migrateSparksExistingQaPasswords(body.entries))'));
assert.ok(auth.includes('data-sparks-qa-password-login="true"'));
assert.ok(admin.includes("getDocsFromServer("), "Migration must use fresh Firestore source");
assert.ok(admin.includes('action:"admin-migrate-qa-passwords"'), "Keep owner-only migration action");
assert.ok(admin.includes("migration-roster"), "Migration must preflight authoritative roster");
assert.ok(admin.includes("missing.length>0"), "Reject incomplete staff credentials before changes");
assert.ok(api.includes('action === "migration-roster"'), "Owner roster endpoint must exist");
assert.ok(!admin.includes("await fetchStoredUserProfiles("), "Do not migrate cached passwords");
assert.ok(qaSparks.includes("<SparksQaCredentialMigration/>"));
assert.ok(app.includes("void signInSparksWithQaPassword(nextUser.username,typedPassword)"));
assert.ok(app.includes("void signInSparksWithQaPassword(nextUser.username,normalizedPassword)"));
const env='({VITE_SPARKS_SUPABASE_AUTH_URL:"https://supabase.example",VITE_SPARKS_SUPABASE_PUBLISHABLE_KEY:"test-public-key"})';
const replaced=ui.replaceAll("import.meta.env",env);
const bundle=await build({stdin:{contents:replaced,resolveDir:process.cwd(),sourcefile:"sparksQaPasswordLogin.ts",loader:"ts"},
 bundle:true,write:false,format:"esm",platform:"browser",logLevel:"silent"});
const client=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));
assert.equal(client.qaSparksLoginEmail("Alice"),"qa-alice@qa-sparks-login.invalid");
assert.throws(()=>client.qaSparksLoginEmail("Alice@evil.com"),/Username/);
const oldFetch=globalThis.fetch;
let calls=[];
globalThis.fetch=async(url,options)=>{
 calls.push({url:String(url),data:JSON.parse(options.body)});
 if(String(url).includes("/auth/v1/token"))
   return {ok:true,status:200,json:async()=>({access_token:"mock-access",refresh_token:"mock-refresh",expires_in:3600})};
 return {ok:true,status:200,json:async()=>({ok:true,actor:{username:"alice",status:"Active",role:"Admin Live Chat"}})};
};
try{
 const loggedIn=await client.signInSparksWithQaPassword("Alice","ExistingSecret!");
 assert.equal(loggedIn.username,"alice");
 assert.equal(calls.length,2);
 assert.equal(calls[0].data.email,"qa-alice@qa-sparks-login.invalid");
 assert.equal(calls[0].data.password,"ExistingSecret!");
 assert.equal(calls[1].data.expectedUsername,"Alice");
 assert.equal(calls[1].data.action,"exchange");
 calls=[];
 await assert.rejects(()=>client.signInSparksWithQaPassword("Bob","wrong"),/ไม่ตรงกับ Username QA/);
 assert.equal(calls[0].data.email,"qa-bob@qa-sparks-login.invalid");
}finally{globalThis.fetch=oldFetch;}
console.log("PASS existing QA password sign-in, verified owner-only migration, synthetic account binding and Suspended rejection checks");
