import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import handler from "../api/sparks-admin.js";
import {FRUIT_MATCH, replayFruitRound, compareFruitRecords} from "../src/fruitMatchRules.js";

const OriginalDate=Date, originalFetch=fetch, oldSecret=process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
let clock=OriginalDate.parse("2026-11-05T05:00:00Z"),commits=0,quota=false,conflict=false;
class TestDate extends OriginalDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
globalThis.Date=TestDate;
const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048,privateKeyEncoding:{type:"pkcs8",format:"pem"},publicKeyEncoding:{type:"spki",format:"pem"}});
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:"fruit-test@example.test",private_key:privateKey});
const session="fruit-match-test-session-123456",docs=new Map(),revisions=new Map();
docs.set("qa_user_sessions/"+session,{username:"Agent",displayName:"Agent One",role:"Admin Live Chat",status:"active",createdAt:"2026-11-01T00:00:00Z",expiresAt:"2027-01-01T00:00:00Z"});
docs.set("qa_user_profiles/Agent",{username:"Agent",displayName:"Agent One",status:"Active"});
docs.set("qa_sparks_wallets/agent",{username:"Agent",balance:200,totalEarned:200,memberYear:2026,memberYearEarned:200});
function encode(v){if(v==null)return{nullValue:"NULL_VALUE"};if(typeof v==="string")return{stringValue:v};if(typeof v==="number")return{integerValue:String(v)};if(typeof v==="boolean")return{booleanValue:v};if(Array.isArray(v))return{arrayValue:{values:v.map(encode)}};return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};}
function decode(v){if("nullValue"in v)return null;if("stringValue"in v)return v.stringValue;if("integerValue"in v)return Number(v.integerValue);if("booleanValue"in v)return v.booleanValue;if("arrayValue"in v)return(v.arrayValue.values||[]).map(decode);return Object.fromEntries(Object.entries(v.mapValue.fields).map(([k,x])=>[k,decode(x)]));}
const document=(key)=>({name:"projects/qa-dashboard-b0b5d/databases/(default)/documents/"+key,fields:Object.fromEntries(Object.entries(docs.get(key)).map(([k,v])=>[k,encode(v)])),updateTime:`2026-11-05T00:00:00.${String(revisions.get(key)||1).padStart(3,"0")}Z`});
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});
globalThis.fetch=async(input,options={})=>{
  const url=String(input);
  if(url==="https://oauth2.googleapis.com/token")return response({access_token:"test-only",expires_in:3600});
  assert(url.includes("projects/qa-dashboard-b0b5d/databases/(default)/documents"));
  if(quota)return response({error:{status:"RESOURCE_EXHAUSTED"}},429);
  if(url.endsWith(":beginTransaction"))return response({transaction:"fruit-transaction"});
  if(url.endsWith(":rollback"))return response({});
  if(url.endsWith(":commit")){
    if(conflict){conflict=false;return response({error:{status:"ABORTED"}},409);}
    const {writes}=JSON.parse(options.body);
    for(const write of writes){
      const key=write.update.name.split("/documents/")[1];
      if(write.currentDocument?.exists===false&&docs.has(key))return response({error:{status:"FAILED_PRECONDITION"}},412);
      if(write.currentDocument?.updateTime&&write.currentDocument.updateTime!==document(key).updateTime)return response({error:{status:"FAILED_PRECONDITION"}},412);
    }
    for(const write of writes){const key=write.update.name.split("/documents/")[1],fields=Object.fromEntries(Object.entries(write.update.fields).map(([k,v])=>[k,decode(v)]));const next={...(docs.get(key)||{})};for(const k of write.updateMask?.fieldPaths||Object.keys(fields))next[k]=fields[k];docs.set(key,next);revisions.set(key,(revisions.get(key)||1)+1);}
    commits++;return response({writeResults:writes.map(()=>({}))});
  }
  const key=decodeURIComponent(new URL(url).pathname.split("/documents/")[1]||"");
  return docs.has(key)?response(document(key)):response({error:{status:"NOT_FOUND"}},404);
};
async function invoke(action,extra={},actorUsername="Agent",sessionId=session){let status,body;await handler({method:"POST",body:{action,actorUsername,sessionId,...extra}},{setHeader(){},status(s){status=s;return this;},json(b){body=b;return b;}});return{status,body};}
let requestNumber=0;
async function start(){clock+=1100;const result=await invoke("fruit-match-start",{requestId:"fruit-request-"+(++requestNumber)});assert.equal(result.status,200,JSON.stringify(result.body));return result.body;}
function traceFor(deck,elapsedMs=6000){const groups=new Map();deck.forEach((fruit,index)=>{if(!groups.has(fruit))groups.set(fruit,[]);groups.get(fruit).push(index);});return[...groups.values()].flat().map((card,index)=>({card,at:Math.round((index+1)*elapsedMs/24)}));}
async function win(elapsed=6000){const round=await start();clock+=elapsed;const result=await invoke("fruit-match-finish",{token:round.token,trace:traceFor(round.deck,elapsed)});assert.equal(result.status,200,JSON.stringify(result.body));return{round,...result};}
const wallet=()=>docs.get("qa_sparks_wallets/agent");
try{
  assert.equal((await invoke("fruit-match-start",{requestId:"fruit-request-auth"},"Other")).status,403);
  assert.equal((await invoke("fruit-match-data",{},"Agent","")).status,403);assert.equal(commits,0);
  let loaded=await invoke("fruit-match-data");assert.equal(loaded.status,200);assert.deepEqual(loaded.body.leaderboard,[]);
  const round=await start(),beforeRetry=commits;
  const duplicateStart=await invoke("fruit-match-start",{requestId:"fruit-request-1"});assert.equal(duplicateStart.body.token,round.token);assert.equal(commits,beforeRetry);assert.equal(duplicateStart.body.stats.played,1);
  const trace=traceFor(round.deck);
  assert.equal((await invoke("fruit-match-finish",{token:round.token,trace})).status,400,"cannot submit a time not yet elapsed on the server");
  const tampered=round.token.replace(/^./,round.token[0]==="a"?"b":"a");assert.equal((await invoke("fruit-match-finish",{token:tampered,trace})).status,403);
  assert.throws(()=>replayFruitRound(round.deck,[{card:0,at:100},{card:0,at:300}]));
  assert.throws(()=>replayFruitRound(round.deck,[{card:0,at:100},{card:1,at:101}]));
  clock+=6000;conflict=true;
  let r=await invoke("fruit-match-finish",{token:round.token,trace});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.result.won,true);assert.equal(r.body.result.pairs,12);assert.equal(r.body.result.moves,12);assert.equal(wallet().balance,210);assert.equal(wallet().memberYearEarned,210);assert.equal(r.body.leaderboard.length,1);
  const applied=commits;clock+=200000;r=await invoke("fruit-match-finish",{token:round.token,trace});assert.equal(r.status,200);assert.equal(r.body.alreadyApplied,true);assert.equal(commits,applied);assert.equal(wallet().balance,210);
  await win(5000);await win(4000);r=await win(3000);assert.equal(r.body.result.earned,0);assert.equal(r.body.result.reason,"daily-limit");assert.equal(r.body.stats.dailyRewardCount,3);assert.equal(wallet().balance,230);assert.equal(r.body.stats.best.elapsedMs,3000);assert.equal(r.body.leaderboard.length,1,"one best record per user");
  const histories=()=>[...docs.keys()].filter(key=>key.includes("/history/fruit-match-"));assert.equal(histories().length,3);
  clock=OriginalDate.parse("2026-11-05T16:59:58Z");r=await win(4000);assert.equal(r.body.result.earned,10,"daily reset at midnight in Bangkok, even when the round starts the previous day");assert.equal(r.body.stats.rewardDay,"2026-11-06");assert.equal(r.body.stats.dailyRewardCount,1);assert.equal(r.body.stats.best.elapsedMs,3000,"slower wins do not replace the best");
  wallet().memberYearEarned=199995;r=await win();assert.equal(r.body.result.reason,"annual-limit");assert.equal(r.body.result.earned,0);assert.equal(wallet().memberYearEarned,199995);
  wallet().memberYearEarned=199990;r=await win();assert.equal(r.body.result.earned,10);assert.equal(wallet().memberYearEarned,200000);
  const timeout=await start();clock+=FRUIT_MATCH.durationMs;r=await invoke("fruit-match-finish",{token:timeout.token,trace:[]});assert.equal(r.status,200);assert.equal(r.body.result.won,false);assert.equal(r.body.result.earned,0);assert.equal(r.body.result.pairs,0);
  const old=await start();clock+=1200;await start();clock+=6000;r=await invoke("fruit-match-finish",{token:old.token,trace:traceFor(old.deck)});assert.equal(r.status,409,"a superseded round cannot grant rewards");
  const originalBalance=wallet().balance;quota=true;r=await invoke("fruit-match-data");assert.equal(r.status,429);assert.equal(wallet().balance,originalBalance);quota=false;
  assert(compareFruitRecords({elapsedMs:1000,moves:12,achievedAt:"2026-01-01"},{elapsedMs:1000,moves:13,achievedAt:"2025-01-01"})<0);
  console.log("PASS Fruit Match API: session auth, signed boards, replay checks, transactions/retry, single reward, 3/day, Bangkok midnight, annual cap, personal best/ranking, timeout, superseded rounds and quota safety.");
}finally{globalThis.Date=OriginalDate;globalThis.fetch=originalFetch;if(oldSecret===undefined)delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON=oldSecret;}
