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
export default {
  async fetch(request,env){
    if(request.method!=='GET')return reply(405,{ok:false,error:'method_not_allowed'},'GET');
    let url;
    try{url=new URL(request.url);}catch{return reply(400,{ok:false,error:'invalid_request'});}
    if(url.pathname!=='/ready'&&url.pathname!=='/summary'||
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
