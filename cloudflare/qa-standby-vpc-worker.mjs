// QA Dashboard only: Cloudflare Workers VPC -> existing Windows cloudflared
// -> 127.0.0.1:8788 archive status bridge.
// Private VPC service binding (not a public Tunnel route or PostgreSQL port).
// Fail closed. Read-only aggregate diagnostics only; NO QA records, NO writes.
// Future full failover MUST use a separate, independently authenticated writer.
const reply=(status,payload,allow)=>new Response(JSON.stringify(payload),{
  status,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store, max-age=0',
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'no-referrer',
    ...(allow?{'allow':allow}:{}),
  },
});
function checkDigest(a,b){
  if(a.length!==b.length)return false;
  let diff=0;
  for(let n=0;n<a.length;n++)diff|=a[n]^b[n];
  return diff===0;
}
const validInteger=x=>Number.isSafeInteger(x)&&x>=0;
async function authorized(auth,env){
  if(typeof auth!=='string'||!auth.startsWith('Bearer ')||
    auth.length<47||auth.length>560)return false;
  const expected=env?.QA_EDGE_BEARER_SHA256;
  if(typeof expected!=='string'||!/^[0-9a-f]{64}$/.test(expected))return false;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(auth.slice(7)));
  const hex=new Uint8Array(digest);
  const compare=Uint8Array.from(expected.match(/.{2}/g).map(p=>parseInt(p,16)));
  return checkDigest(hex,compare);
}

const MAX_DATA_BYTES=2*1024*1024;
const SESSION=/^[a-zA-Z0-9_.:@-]{20,180}$/;
const OP=/^[a-zA-Z0-9_.:@-]{1,180}$/;
const DATA_PATH=/^\/v1\/qa\/evaluations(?:\/([a-zA-Z0-9_.:@-]{1,180}))?$/;
const DATA_KEYS=new Set(['month','limit','afterId']);
async function limitedBytes(stream,maxBytes){
  if(!stream)return new Uint8Array(0);
  const reader=stream.getReader(),buffers=[];
  let length=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>maxBytes)throw new Error('size_limit');
      buffers.push(value);
    }
  }finally{try{await reader.cancel();}catch{/* consumed */}reader.releaseLock();}
  const output=new Uint8Array(length);let offset=0;
  for(const bytes of buffers){output.set(bytes,offset);offset+=bytes.length;}
  return output;
}
async function forwardQaData(request,env,url){
  // Data forwarding is deliberately OFF until both the private QA server and
  // current per-document Firestore parity are independently proven ready.
  if(env?.QA_EDGE_DATA_ENABLED!=='1')
    return reply(503,{ok:false,error:'standby_data_disabled'});
  const match=url.pathname.match(DATA_PATH);
  if(!match||url.hash||[...url.searchParams.keys()].some(x=>!DATA_KEYS.has(x)))
    return reply(404,{ok:false,error:'not_found'});
  const action=request.method;
  if(action!=='GET'&&action!=='POST')
    return reply(405,{ok:false,error:'method_not_allowed'},match[1]?'GET':'GET, POST');
  if(action==='POST'&&(match[1]||url.search))
    return reply(405,{ok:false,error:'method_not_allowed'},'GET');
  if(action==='GET'&&match[1]&&url.search)
    return reply(400,{ok:false,error:'invalid_request'});
  if(request.headers.get('origin'))
    return reply(403,{ok:false,error:'browser_origin_forbidden'});
  const tokenHeader=request.headers.get('authorization');
  if(typeof env?.QA_EDGE_BEARER_SHA256!=='string'||!/^[0-9a-f]{64}$/.test(env.QA_EDGE_BEARER_SHA256))
    return reply(503,{ok:false,error:'edge_not_configured'});
  if(!await authorized(tokenHeader,env))
    return reply(403,{ok:false,error:'forbidden'});
  const session=request.headers.get('x-qa-user-session');
  if(!SESSION.test(session||''))return reply(403,{ok:false,error:'session_not_provided'});
  if(!env?.QA_PRIVATE_HTTP_VPC||typeof env.QA_PRIVATE_HTTP_VPC.fetch!=='function')
    return reply(503,{ok:false,error:'private_service_not_configured'});
  let data=null;
  if(action==='POST'){
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))
      return reply(400,{ok:false,error:'invalid_content_type'});
    const size=Number(request.headers.get('content-length'));
    if(Number.isFinite(size)&&size>MAX_DATA_BYTES)
      return reply(413,{ok:false,error:'request_too_large'});
    const operationId=request.headers.get('idempotency-key');
    if(!OP.test(operationId||''))
      return reply(400,{ok:false,error:'idempotency_required'});
    try{data=await limitedBytes(request.body,MAX_DATA_BYTES);}
    catch{return reply(413,{ok:false,error:'request_too_large'});}
    let parsed=null;
    try{parsed=JSON.parse(new TextDecoder().decode(data));}catch{}
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
       parsed.operationId!==operationId||!OP.test(parsed.evaluationId||''))
      return reply(400,{ok:false,error:'invalid_request'});
  }else if(request.body){
    return reply(400,{ok:false,error:'unexpected_body'});
  }
  try{
    const signal=AbortSignal.timeout(8000);
    const upstream=await env.QA_PRIVATE_HTTP_VPC.fetch(
      'http://127.0.0.1:8788'+url.pathname+url.search,{
        method:action,
        headers:{
          authorization:tokenHeader,
          'x-qa-user-session':session,
          accept:'application/json',
          ...(action==='POST'?{
            'content-type':'application/json',
            'idempotency-key':request.headers.get('idempotency-key'),
          }:{}),
        },
        ...(action==='POST'?{body:data}:{}),
        redirect:'manual',
        signal,
      },
    );
    if(!upstream||!([200,400,403,404,405,409,413,503].includes(upstream.status))||
       !(upstream.headers.get('content-type')||'').toLowerCase().includes('application/json'))
      return reply(502,{ok:false,error:'invalid_private_response'});
    const bytes=await limitedBytes(upstream.body,MAX_DATA_BYTES);
    const result=JSON.parse(new TextDecoder().decode(bytes));
    if(!result||typeof result!=='object'||Array.isArray(result)||
       typeof result.ok!=='boolean')
      return reply(502,{ok:false,error:'invalid_private_response'});
    if(upstream.status!==200){
      // Do not forward arbitrary PostgreSQL errors or raw source document data.
      return reply(upstream.status,{ok:false,error:'private_qa_request_denied'});
    }
    if(result.ok!==true)return reply(502,{ok:false,error:'invalid_private_response'});
    if(action==='GET'&&(result.source!=='local-postgres-standby'||
       result.dataStatus!=='verified-snapshot'))
      return reply(502,{ok:false,error:'unverified_private_data'});
    if(action==='POST'&&(
      result.operationId!==request.headers.get('idempotency-key')||
      typeof result.queued!=='boolean'||!Number.isSafeInteger(result.version)
    ))return reply(502,{ok:false,error:'unverified_write_commit'});
    return reply(200,result);
  }catch{
    return reply(502,{ok:false,error:'private_qa_unavailable'});
  }
}

export default {
  async fetch(request,env){
    let url;
    try{url=new URL(request.url);}catch{return reply(400,{ok:false,error:'invalid_request'});}
    if(url.pathname.startsWith('/v1/qa/evaluations')){
      return forwardQaData(request,env,url);
    }
    if(request.method!=='GET')return reply(405,{ok:false,error:'method_not_allowed'},'GET');
    if(!['/ready','/summary','/readiness'].includes(url.pathname)||
      url.search||url.hash)return reply(404,{ok:false,error:'not_found'});
    if(!env?.QA_EDGE_BEARER_SHA256||!/^[0-9a-f]{64}$/.test(env.QA_EDGE_BEARER_SHA256))
      return reply(503,{ok:false,error:'edge_not_configured'});
    if(!await authorized(request.headers.get('authorization'),env))
      return reply(403,{ok:false,error:'forbidden'});
    if(!env?.QA_PRIVATE_HTTP_VPC||typeof env.QA_PRIVATE_HTTP_VPC.fetch!=='function')
      return reply(503,{ok:false,error:'private_service_not_configured'});
    try{
      // VPC binding configuration pins host 127.0.0.1 and HTTP port 8788.
      // This URL does not create an Internet origin; binding routes inside CF.
      const signal=AbortSignal.timeout(5000);
      const upstream=await env.QA_PRIVATE_HTTP_VPC.fetch(
        'http://127.0.0.1:8788'+url.pathname,{
          method:'GET',
          headers:{
            'authorization':request.headers.get('authorization'),
            'accept':'application/json',
          },
          redirect:'manual',
          signal,
        }
      );
      if(!upstream||upstream.status!==200||
        !(upstream.headers.get('content-type')||'').toLowerCase().includes('application/json'))
        return reply(502,{ok:false,error:'local_bridge_unavailable'});
      const raw=await upstream.text();
      if(raw.length>16_384)return reply(502,{ok:false,error:'invalid_bridge_response'});
      const body=JSON.parse(raw);
      if(body?.ok!==true||body.readOnly!==true||body.failoverReady!==false)
        return reply(502,{ok:false,error:'bridge_read_only_not_verified'});
      if(url.pathname==='/readiness'){
        const record=body.snapshot;
        if(body.firestorePrimary!==true||
          body.ok!==true||body.readOnly!==true||body.failoverReady!==false||
          body.canAcceptWrites!==false||body.archiveIsNotLiveSource!==true||
          !record||typeof record!=='object'||
          !['disabled','standby','reconciling'].includes(body.standbyMode)||
          !['boolean'].includes(typeof record.present)||
          typeof record.copied!=='boolean'||typeof record.candidateVerified!=='boolean'||
          !validInteger(record.sourceDocuments)||!validInteger(record.candidateEvaluations)||
          !validInteger(record.sourceEvaluations)||!validInteger(record.datasetCount)||
          !Array.isArray(body.remainingChecks)||body.remainingChecks.length>24||
          body.remainingChecks.some(x=>typeof x!=='string'||!/^[a-z_]{3,80}$/.test(x)))
          return reply(502,{ok:false,error:'invalid_standby_readiness'});
        return reply(200,{ok:true,readOnly:true,failoverReady:false,
          canAcceptWrites:false,firestorePrimary:true,
          standbyMode:body.standbyMode,
          snapshot:{present:record.present,copied:record.copied,
            candidateVerified:record.candidateVerified,
            sourceDocuments:record.sourceDocuments,
            candidateEvaluations:record.candidateEvaluations,
            sourceEvaluations:record.sourceEvaluations,
            datasetCount:record.datasetCount,
            withinFreshnessWindow:record.withinFreshnessWindow===true},
          remainingChecks:body.remainingChecks});
      }
      if(url.pathname==='/ready'){
        if(body.databaseConnected!==true)return reply(502,{ok:false,error:'database_not_connected'});
        return reply(200,{ok:true,readOnly:true,databaseConnected:true,
          failoverReady:false,standbyMode:String(body.standbyMode||'unknown')});
      }
      if(!validInteger(body.collectionCount)||!validInteger(body.sourceDocumentCount)||
        body.importedArchiveCountMatch!==true||!validInteger(body.pendingOperations))
        return reply(502,{ok:false,error:'invalid_archive_summary'});
      return reply(200,{
        ok:true,readOnly:true,failoverReady:false,
        sourceFreshness:'unverified-archived-copy',
        collectionCount:body.collectionCount,
        sourceDocumentCount:body.sourceDocumentCount,
        importedArchiveCountMatch:true,
        pendingOperations:body.pendingOperations,
        standbyMode:String(body.standbyMode||'unknown'),
      });
    }catch{
      // Never expose URLs, session data, API tokens, database records or errors.
      return reply(502,{ok:false,error:'local_bridge_unreachable'});
    }
  },
};
