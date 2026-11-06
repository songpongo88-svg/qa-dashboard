import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import handler from "../api/sparks-admin.js";

const OriginalDate = globalThis.Date;
const originalFetch = globalThis.fetch;
const oldCredentials = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
let testTime = "2026-11-08T05:00:00.000Z";
class StubDate extends OriginalDate {
  constructor(...args) { super(...(args.length ? args : [testTime])); }
  static now() { return new OriginalDate(testTime).getTime(); }
}
globalThis.Date = StubDate;
const session = "agent-quest-test-session-1234567";
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: "firebase-quest@example.test", private_key: privateKey,
  project_id: "qa-dashboard-b0b5d",
});

const docs = new Map();
const revisions = new Map();
const key = (collection, id) => collection + "/" + id;
const walletPath = key("qa_sparks_wallets", "agent");
docs.set(key("qa_user_sessions", session), {
  username: "Agent", displayName: "Agent", role: "Admin Live Chat", status: "active",
  createdAt: "2026-11-01T00:00:00.000Z", expiresAt: "2026-12-01T00:00:00.000Z",
});
docs.set(key("qa_user_profiles", "Agent"), { username: "Agent", role: "Admin Live Chat", status: "Active" });
docs.set(walletPath, { username: "Agent", balance: 200, totalEarned: 200,
  firstLogin: { amount: 200, claimedAt: "2026-11-04T01:00:00Z" } });
let commits = 0;
let quotaExceeded = false;
function encode(v) {
  if (v == null) return { nullValue: "NULL_VALUE" };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k,val]) => [k,encode(val)])) } };
}
function decode(v) {
  if (!v || "nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,val])=>[k,decode(val)]));
  if ("arrayValue" in v) return (v.arrayValue.values||[]).map(decode);
  return null;
}
function asDocument(k,v) {
  return {
    name: "projects/qa-dashboard-b0b5d/databases/(default)/documents/" + k,
    fields: Object.fromEntries(Object.entries(v).map(([a,b]) => [a,encode(b)])),
    updateTime: "2026-11-" + String(revisions.get(k) || 1).padStart(2,"0") + "T12:00:00Z",
  };
}
function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url === "https://oauth2.googleapis.com/token") return response({access_token:"quest-only-token",expires_in:3600});
  assert.ok(url.includes("/projects/qa-dashboard-b0b5d/databases/(default)/documents"), "wrong QA Firebase project");
  if (quotaExceeded) return response({error:{status:"RESOURCE_EXHAUSTED",message:"quota reached"}},429);
  if (url.endsWith(":beginTransaction")) return response({transaction:"quest-test-transaction"});
  if (url.endsWith(":commit")) {
    const writes = JSON.parse(options.body).writes;
    assert.equal(writes.length, 2, "check-in wallet and history must be written atomically");
    const current = writes.map((write) => {
      const k = write.update.name.split("/documents/")[1];
      const value = docs.get(k);
      if (write.currentDocument?.exists === false && value !== undefined) return null;
      if (write.currentDocument?.updateTime && write.currentDocument.updateTime !== asDocument(k, value).updateTime) return null;
      return { k, value, write };
    });
    if (current.some((item) => !item)) return response({error:{status:"FAILED_PRECONDITION"}},412);
    for (const {k,value,write} of current) {
      const payload = Object.fromEntries(Object.entries(write.update.fields).map(([n,v])=>[n,decode(v)]));
      const next = {...(value||{})};
      for (const field of write.updateMask?.fieldPaths || Object.keys(payload)) next[field] = payload[field];
      docs.set(k,next);revisions.set(k,(revisions.get(k)||1)+1);
    }
    commits++;
    return response({writeResults:[{},{}]});
  }
  const pathName = decodeURIComponent(new URL(url).pathname.split("/documents/")[1]||"");
  return docs.has(pathName) ? response(asDocument(pathName,docs.get(pathName))) : response({error:{status:"NOT_FOUND"}},404);
};
const invoke = async (date, action="claim-daily-checkin", username="Agent", sessionId=session) => {
  let status=0, body=null;
  const res={setHeader(){},status(n){status=n;return this;},json(v){body=v;return v;}};
  await handler({method:"POST",body:{action,actorUsername:username,sessionId,questDate:date}},res);
  return {status,body};
};
const wallet=()=>docs.get(walletPath);
const claimDate = (day) => "2026-11-" + String(day).padStart(2,"0");
const setDate = (iso) => {testTime=iso;};
const getClaims = () => [...docs.values()].filter(x=>x.source==="quest-daily-checkin");

try {
  let r=await invoke(claimDate(9));
  assert.equal(r.status,400,"Quest must not be claimable on November 8");
  assert.equal(commits,0);
  setDate("2026-11-08T17:00:00.000Z"); // midnight Nov 9 in Bangkok
  r=await invoke(claimDate(9));
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.updated,true);
  assert.deepEqual(r.body.claimedDays,[9]);
  assert.equal(wallet().balance,250);
  assert.equal(wallet().memberYearEarned,250);
  assert.equal(getClaims().length,1);
  const originalCommits=commits;
  r=await invoke(claimDate(9));
  assert.equal(r.status,200);
  assert.equal(r.body.alreadyClaimed,true);
  assert.equal(commits,originalCommits);
  assert.equal((await invoke(claimDate(10))).status,400,"cannot claim future Nov 10 while today is Nov 9");
  assert.equal((await invoke(claimDate(8))).status,400,"cannot claim past Nov 8");

  setDate("2026-11-10T17:00:00.000Z"); // midnight Nov 11 in Bangkok
  assert.equal((await invoke(claimDate(10))).status,400,"missed Nov 10 must be permanently unavailable");
  r=await invoke(claimDate(11));
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.deepEqual(wallet().dailyCheckin202611Days,[9,11]);
  assert.equal(wallet().balance,300);
  assert.equal(wallet().memberYearEarned,300);
  assert.equal(getClaims().length,2);

  setDate("2026-11-21T17:00:00.000Z"); // midnight Nov 22 in Bangkok
  r=await invoke(claimDate(22));
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.deepEqual(wallet().dailyCheckin202611Days,[9,11,22]);
  assert.equal(wallet().balance,350);
  assert.equal(getClaims().length,3);
  setDate("2026-11-22T17:00:00.000Z"); // midnight Nov 23
  assert.equal((await invoke(claimDate(22))).status,400,"expired campaign cannot give backdated points");
  assert.equal(commits,3);

  setDate("2026-11-08T17:00:00.000Z");
  // A valid award may cross 200,000 Sparks: there is no earning ceiling.
  setDate("2026-11-12T05:00:00.000Z");
  docs.set(walletPath,{username:"Agent",balance:199975,totalEarned:199975,memberYear:2026,memberYearEarned:199975});
  r=await invoke(claimDate(12));
  assert.equal(r.status,200,"reward can exceed old 200k cap");
  assert.equal(wallet().balance,200025);
  assert.equal(wallet().memberYearEarned,200025);
  assert.equal(wallet().balanceYear,2026);
  assert.equal(commits,4);
  // Already-claimed fixed history ID remains authoritative even if wallet state is artificially reset.
  docs.set(walletPath,{username:"Agent",balance:200025,totalEarned:200025,memberYear:2026,memberYearEarned:200025});
  r=await invoke(claimDate(12));
  assert.equal(r.status,200);
  assert.equal(r.body.alreadyClaimed,true);
  assert.equal(commits,4,"cannot grant duplicate even if wallet's claimedDays is absent");

  // Start a fresh 14-day walk with empty history and a clean wallet.
  for (const k of [...docs.keys()]) if (k.startsWith("qa_sparks_wallets/agent/history/quest-daily-checkin-")) docs.delete(k);
  docs.set(walletPath,{username:"Agent",balance:0,totalEarned:0,memberYear:2026,memberYearEarned:0});
  revisions.set(walletPath,20);
  for(let day=9;day<=22;day++){
    setDate(new OriginalDate(`2026-11-${String(day).padStart(2,"0")}T06:00:00Z`).toISOString());
    const got=await invoke(claimDate(day));
    assert.equal(got.status,200,"Check-in rejected on "+day+": "+JSON.stringify(got.body));
    assert.equal(got.body.updated,true);
  }
  assert.equal(wallet().balance,700);
  assert.equal(wallet().memberYearEarned,700);
  assert.equal(wallet().totalEarned,700);
  assert.deepEqual(wallet().dailyCheckin202611Days,Array.from({length:14},(_,i)=>i+9));
  assert.equal(getClaims().length,14);
  console.log("PASS Daily Check-in: 14 days × 50 = 700; +Member Level, History, exact dates, missed dates and duplicate lock");

  // No session impersonation, and database quota errors never touch wallet.
  setDate("2026-11-20T05:00:00.000Z");
  assert.equal((await invoke(claimDate(20),"claim-daily-checkin","Other",session)).status,403);
  const previousBalance=wallet().balance;
  quotaExceeded=true;
  r=await invoke(claimDate(20));
  assert.equal(r.status,429);
  assert.equal(wallet().balance,previousBalance);
  quotaExceeded=false;
  console.log("PASS Daily Check-in: authenticated user only, unlimited rewards, atomic wallet+history, quota safety");
} finally {
  globalThis.Date=OriginalDate;
  globalThis.fetch=originalFetch;
  if(oldCredentials===undefined)delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=oldCredentials;
}
