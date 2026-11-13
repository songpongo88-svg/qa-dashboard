// Isolated, opt-in QA source-delta VPC gateway. NOT the existing QA Sparks,
// archive 8788, or case-data 8790 gateway. No public route is active until
// this separate Worker is explicitly deployed and private secrets are set.
// Google Cloud Tasks supplies a Google ID token. The Windows receiver (not
// this edge) must verify the token against Google's keys and a pinned SA.
// No Firebase or PostgreSQL calls occur in this Worker.
const MAX=512*1024;
const reply=(status,error)=>new Response(JSON.stringify({ok:false,error}),{
 status,headers:{'content-type':'application/json; charset=utf-8',
 'cache-control':'no-store, max-age=0','x-content-type-options':'nosniff',
 'x-frame-options':'DENY','referrer-policy':'no-referrer'},
});
function proper(secret){
 return typeof secret==='string'&&secret.length>=64&&secret.length<=512&&
 /^[\x21-\x7e]+$/.test(secret);
}
function stampValid(stamp,now){
 if(!/^\d{10}$/.test(stamp||''))return false;
 const issued=Number(stamp)*1000;
 return Number.isSafeInteger(issued)&&issued<=now+60000&&issued>=now-300000;
}
function same(a,b){
 if(a.byteLength!==b.byteLength)return false;
 let diff=0;for(let i=0;i<a.byteLength;i++)diff|=a[i]^b[i];
 return diff===0;
}
async function sign(secret,stamp,payload){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const prefix=new TextEncoder().encode('qa-source-delta-v1\n'+stamp+'\n');
 const message=new Uint8Array(prefix.length+payload.length);
 message.set(prefix,0);message.set(payload,prefix.length);
 return new Uint8Array(await crypto.subtle.sign('HMAC',key,message));
}
function hex(bytes){
 return [...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function readLimited(body){
 if(!body)return new Uint8Array(0);
 const reader=body.getReader(),list=[];let n=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))throw Error('invalid_body');
   n+=value.byteLength;
   if(n>MAX)throw Error('too_large');
   list.push(value);
  }
 }finally{try{await reader.cancel();}catch{}reader.releaseLock();}
 const all=new Uint8Array(n);let p=0;
 for(const chunk of list){all.set(chunk,p);p+=chunk.length;}
 return all;
}
const JWT=/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export default {
 async fetch(request,env){
  let url;
  try{url=new URL(request.url);}catch{return reply(400,'invalid_request');}
  if(url.pathname!=='/v1/qa/source-delta'||url.search||url.hash)
   return reply(404,'not_found');
  if(request.method!=='POST')return reply(405,'method_not_allowed');
  if(env?.QA_EDGE_DELTA_ENABLED!=='1')
   return reply(503,'source_delta_disabled');
  const incomingSecret=env.QA_EDGE_SOURCE_HMAC_SECRET;
  const forwardSecret=env.QA_EDGE_DELTA_FORWARD_SECRET;
  if(!proper(incomingSecret)||!proper(forwardSecret)||
     incomingSecret===forwardSecret||
     typeof env.QA_PRIVATE_DELTA_VPC?.fetch!=='function')
   return reply(503,'private_delta_not_configured');
  if(request.headers.get('origin'))return reply(403,'browser_origin_forbidden');
  if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(
   request.headers.get('content-type')||''))
   return reply(415,'invalid_content_type');
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>MAX))
   return reply(413,'request_too_large');
  const auth=request.headers.get('authorization');
  if(typeof auth!=='string'||auth.length<100||auth.length>8192||
     !JWT.test(auth))
   return reply(403,'google_identity_required');
  const stamp=request.headers.get('x-qa-source-timestamp');
  const signature=request.headers.get('x-qa-source-signature');
  if(!stampValid(stamp,Date.now())||
     !/^v1=[a-f0-9]{64}$/.test(signature||''))
   return reply(403,'invalid_signature');
  let bytes;
  try{bytes=await readLimited(request.body);}
  catch{return reply(413,'request_too_large');}
  if(bytes.byteLength===0)return reply(400,'empty_event');
  try{
   const expected=await sign(incomingSecret,stamp,bytes);
   const received=Uint8Array.from(signature.slice(3).match(/.{2}/g)
    .map(x=>parseInt(x,16)));
   if(!same(expected,received))return reply(403,'invalid_signature');
   // Re-sign at the edge with a distinct private-hop key. The original
   // signed event body and OIDC token remain unchanged for Windows checks.
   const privateStamp=String(Math.floor(Date.now()/1000));
   const privateSignature='v1='+hex(await sign(forwardSecret,privateStamp,bytes));
   const upstream=await env.QA_PRIVATE_DELTA_VPC.fetch(
    'http://127.0.0.1:8791/v1/qa/source-delta',{
      method:'POST',redirect:'manual',signal:AbortSignal.timeout(7000),
      headers:{'authorization':auth,'content-type':'application/json',
       'x-qa-source-timestamp':privateStamp,
       'x-qa-source-signature':privateSignature},
      body:bytes,
    });
   if(upstream?.status!==202||
      !(upstream.headers.get('content-type')||'').includes('application/json'))
    return reply(503,'private_delivery_unconfirmed');
   const body=await upstream.text();
   if(body.length>1024)return reply(503,'private_delivery_unconfirmed');
   const receivedResult=JSON.parse(body);
   if(receivedResult?.ok!==true||receivedResult?.stored!==true||
      receivedResult?.failoverReady!==false||
      receivedResult?.canAcceptWrites!==false||
      !['applied','duplicate','stale','conflict'].includes(receivedResult.outcome))
    return reply(503,'private_delivery_unconfirmed');
   // Only acknowledge Cloud Tasks after Windows explicitly acknowledged the
   // PostgreSQL transaction. Never return any case/session payload upstream.
   return new Response(JSON.stringify({
     ok:true,stored:true,outcome:receivedResult.outcome,
     failoverReady:false,canAcceptWrites:false,
   }),{status:202,headers:{'content-type':'application/json',
    'cache-control':'no-store','x-content-type-options':'nosniff'}});
  }catch{
   // 503 is intentionally retryable by Cloud Tasks; no false acknowledgments.
   return reply(503,'private_delta_unavailable');
  }
 }
};
