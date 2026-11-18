import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
const temp = await mkdtemp(resolve(".login-storage-test-"));
const source = resolve(temp,"currentUserStorage.mjs");
await build({entryPoints:["src/currentUserStorage.ts"],outfile:source,bundle:true,format:"esm",platform:"node",logLevel:"silent"});
const storage = await import(pathToFileURL(source));
function bucket(blocked=false){
  const map=new Map();
  return {
    getItem(key){return map.has(key)?map.get(key):null;},
    setItem(key,value){if(blocked)throw Object.assign(new Error("Quota exceeded"),{name:"QuotaExceededError"});map.set(key,String(value));},
    removeItem(key){map.delete(key);},
    keys(){return [...map.keys()];},
  };
}
const key=storage.QA_CURRENT_USER_STORAGE_KEY;
const user={username:"krivut",displayName:"Krivut Vongkampan",agentName:"Krivut Vongkampan",
  role:"Admin Live Chat",email:"",loginAt:"2026-11-18T14:44:00.000Z",
  sessionId:"krivut-verified-server-session",sessionPolicyVersion:"qa-session-policy-2026-07-15-v1",
  sessionExpiresAt:"2026-11-18T16:44:00.000Z",extraHugeDraft:"x".repeat(1000000)};
try {
  // Normal path: minimal session, localStorage persists and stale fallback removed.
  const local=bucket(),session=bucket();
  globalThis.window={localStorage:local,sessionStorage:session};
  session.setItem(key,"stale-tab-session");
  assert.equal(storage.saveCurrentUserStorage(user),"local");
  assert.equal(storage.readCurrentUserStorage(),local.getItem(key));
  assert.equal(JSON.parse(local.getItem(key)).sessionId,user.sessionId);
  assert.equal(local.getItem(key).includes("extraHugeDraft"),false);
  assert.equal(session.getItem(key),null,"stale tab fallback removed on successful local write");

  // User's failing browser: quota-exhausted localStorage does not abort sign-in.
  const full=bucket(true),tab=bucket();
  const unrelated=bucket();unrelated.setItem("qa:unsaved-draft","important");
  globalThis.window={localStorage:full,sessionStorage:tab};
  assert.equal(storage.saveCurrentUserStorage(user),"session");
  assert.equal(JSON.parse(storage.readCurrentUserStorage()).sessionId,user.sessionId,
    "fallback restores the same server-issued session ID");
  assert.equal(tab.getItem(key)!==null,true);
  assert.equal(unrelated.getItem("qa:unsaved-draft"),"important");

  // Old local session must NOT supersede a new tab session.
  const old=bucket(true),newTab=bucket();
  old.getItem=key=>key===storage.QA_CURRENT_USER_STORAGE_KEY?"old-session":null;
  globalThis.window={localStorage:old,sessionStorage:newTab};
  assert.equal(storage.saveCurrentUserStorage(user),"session");
  assert.equal(JSON.parse(storage.readCurrentUserStorage()).sessionId,user.sessionId);

  // If both stores are full, keep a verified user in React memory; no partial
  // storage writes or forced deletion. Reload must revalidate by signing in.
  globalThis.window={localStorage:bucket(true),sessionStorage:bucket(true)};
  assert.equal(storage.saveCurrentUserStorage(user),"memory");
  assert.equal(storage.readCurrentUserStorage(),null);
  assert.equal(storage.writeLocalStorageSafely("qa_remembered_username","krivut"),false);
  assert.equal(storage.writeSessionStorageSafely("qa_case_selected_week_v134","all"),false);
  assert.doesNotThrow(()=>storage.clearCurrentUserStorage());

  const after=bucket(),restored=bucket();
  globalThis.window={localStorage:after,sessionStorage:restored};
  restored.setItem(key,JSON.stringify(user));
  storage.clearCurrentUserStorage();
  assert.equal(restored.getItem(key),null);
  assert.equal(after.getItem(key),null);
  assert.equal(storage.readCurrentUserStorage(),null);
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app,/saveCurrentUserStorage\(authenticatedUser\)/,
    "successful server session creation persists through quota-safe helper");
  assert.match(app,/const raw = readCurrentUserStorage\(\)/,
    "reload restores from per-tab fallback before normal server validation");
  assert.match(app,/validateStoredUserSession\(/,
    "reload must revalidate secure session against server");
  assert.match(app,/writeLocalStorageSafely\(REMEMBERED_USERNAME_KEY/,
    "remembered username must not abort a verified login when browser quota is exceeded");
  assert.match(app,/clearCurrentUserStorage\(\)/,
    "logout and invalidated sessions clear both storage tiers");
  assert.doesNotMatch(app,/localStorage\.setItem\(STORAGE_KEY/,
    "no unguarded auth writes must survive");
  assert.doesNotMatch(app,/window\.sessionStorage\.setItem\(/,
    "UI preference writes must not crash a valid session in low-quota browser");
  console.log("PASS QA Login: full browser quota, per-tab secure-session fallback, verified restore, no draft deletion, safe logout.");
} finally {
  delete globalThis.window;
  await rm(temp,{recursive:true,force:true});
}
