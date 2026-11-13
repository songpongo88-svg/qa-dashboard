// QA-only Vercel Preview -> Cloudflare Workers VPC -> Windows 8788
// relay for verified evaluations. No new serverless function is created.
// Production is disabled by default and needs separate opt-in and server proofs.
// Browser never receives the private Cloudflare / Windows bridge token.
const IDENTIFIER=/^[a-zA-Z0-9_.:@-]{1,180}$/;
const SESSION=/^[a-zA-Z0-9_.:@-]{20,180}$/;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_BYTES=2*1024*1024;
const CLIENT_KEYS=new Set(['qaData','action','evaluationId','month','limit','afterId']);
const respond=(res,status,data)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  return res.status(status).json(data);
};
function bridgeOrigin(raw){
  if(typeof raw!=='string'||!raw)return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.port||
      url.search||url.hash||url.pathname!=='/'||
      !/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname))return null;
    return url.origin;
  }catch{return null;}
}
function sourceSession(req){
  const value=req.headers?.['x-qa-user-session'];
  return typeof value==='string'&&SESSION.test(value)?value:null;
}
function scalar(value){
  return typeof value==='string'?value:null;
}
function safeQuery(req){
  if(!req.query||typeof req.query!=='object'||Array.isArray(req.query))return false;
  return Object.keys(req.query).every(key=>CLIENT_KEYS.has(key)&&
    typeof req.query[key]==='string');
}
function authorizedOrigin(req){
  const raw=req.headers?.origin;
  const host=req.headers?.host;
  if(typeof raw!=='string'||typeof host!=='string'||
    !/^[a-z0-9.-]+(?::443)?$/i.test(host))return false;
  const expected='https://'+host.replace(/:443$/,'');
  const site=req.headers?.['sec-fetch-site'];
  return raw===expected&&(!site||site==='same-origin'||site==='none');
}
function validateResult(data,action,operationId){
  if(!data||typeof data!=='object'||Array.isArray(data)||data.ok!==true)
    return false;
  if(action==='write')return data.operationId===operationId&&
    Number.isSafeInteger(data.version)&&data.version>=1&&
    typeof data.queued==='boolean';
  return data.source==='local-postgres-standby'&&
    data.dataStatus==='verified-snapshot';
}
export function createQaVercelStandbyProxy({
  env=process.env,
  fetchImpl=fetch,
}={}){
  return async(req,res)=>{
    // This route is hidden within an existing QA-only cron function to fit
    // the Hobby function limit. It cannot bypass the scheduled cron secret.
    // The browser endpoint requires the existing *active* QA local session ID.
    // Production requires a separate, explicit cutover gate. Publishing this
    // relay does not activate the Windows writer; its independent PG/session
    // and coordinator proof checks still fail closed.
    const preview=env.VERCEL_ENV==='preview'&&
      env.QA_STANDBY_DATA_PROXY_ENABLED==='1';
    const production=env.VERCEL_ENV==='production'&&
      env.QA_STANDBY_DATA_PROXY_ENABLED==='1'&&
      env.QA_STANDBY_PRODUCTION_PROXY_APPROVED==='1'&&
      env.QA_STANDBY_CUTOVER_APPROVED==='1';
    if(!preview&&!production)
      return respond(res,503,{ok:false,error:'standby_data_disabled'});
    if(!['GET','POST'].includes(req.method)){
      res.setHeader('Allow','GET, POST');
      return respond(res,405,{ok:false,error:'method_not_allowed'});
    }
    if(!safeQuery(req)||req.query.qaData!=='1')
      return respond(res,400,{ok:false,error:'invalid_request'});
    if(req.headers?.authorization)
      return respond(res,403,{ok:false,error:'unexpected_browser_authorization'});
    if(req.headers?.origin&&!authorizedOrigin(req))
      return respond(res,403,{ok:false,error:'browser_origin_forbidden'});
    if(req.method==='POST'&&!authorizedOrigin(req))
      return respond(res,403,{ok:false,error:'browser_origin_required'});
    const session=sourceSession(req);
    if(!session)return respond(res,403,{ok:false,error:'session_required'});
    const origin=bridgeOrigin(env.QA_LOCAL_BRIDGE_URL);
    // Never reuse the archive-only /ready token for case reads or writes.
    // Cloudflare validates this token against QA_EDGE_DATA_BEARER_SHA256
    // and routes it exclusively to the private Windows 8790 data binding.
    const secret=env.QA_LOCAL_STANDBY_DATA_TOKEN;
    if(!origin||typeof secret!=='string'||secret.length<40||
       secret===env.QA_LOCAL_BRIDGE_TOKEN)
      return respond(res,503,{ok:false,error:'private_bridge_not_configured'});
    const action=scalar(req.query.action);
    let urlPath='/v1/qa/evaluations',payload=null,operationId=null;
    if(req.method==='GET'){
      if(action==='get'){
        const evaluationId=scalar(req.query.evaluationId);
        if(!IDENTIFIER.test(evaluationId||'')||
           req.query.month!==undefined||req.query.limit!==undefined||req.query.afterId!==undefined)
          return respond(res,400,{ok:false,error:'invalid_request'});
        urlPath+='/'+encodeURIComponent(evaluationId);
      }else if(action==='list'){
        if(req.query.evaluationId!==undefined)return respond(res,400,{ok:false,error:'invalid_request'});
        const params=new URLSearchParams();
        const month=scalar(req.query.month);
        if(month!==null){
          if(!MONTH.test(month))return respond(res,400,{ok:false,error:'invalid_month'});
          params.set('month',month);
        }
        const limit=scalar(req.query.limit);
        if(limit!==null){
          if(!/^[1-9][0-9]{0,2}$/.test(limit)||Number(limit)>100)
            return respond(res,400,{ok:false,error:'invalid_limit'});
          params.set('limit',limit);
        }
        const cursor=scalar(req.query.afterId);
        if(cursor!==null){
          if(!IDENTIFIER.test(cursor))return respond(res,400,{ok:false,error:'invalid_cursor'});
          params.set('afterId',cursor);
        }
        if(params.size)urlPath+='?'+params;
      }else return respond(res,400,{ok:false,error:'unsupported_action'});
    }else{
      if(action!=='write'||req.query.evaluationId!==undefined||
         req.query.month!==undefined||req.query.limit!==undefined||
         req.query.afterId!==undefined)
        return respond(res,400,{ok:false,error:'unsupported_action'});
      if(typeof req.body!=='object'||!req.body||Array.isArray(req.body))
        return respond(res,400,{ok:false,error:'invalid_body'});
      operationId=scalar(req.body.operationId);
      if(!IDENTIFIER.test(operationId||'')||
         !IDENTIFIER.test(scalar(req.body.evaluationId)||'')||
         !['create','update','delete'].includes(req.body.action)||
         !Number.isSafeInteger(req.body.expectedVersion)||req.body.expectedVersion<0||
         (req.body.action==='delete'
           ? (req.body.record!=null)
           : (!req.body.record||typeof req.body.record!=='object'||Array.isArray(req.body.record))))
        return respond(res,400,{ok:false,error:'invalid_write_operation'});
      payload=JSON.stringify(req.body);
      if(Buffer.byteLength(payload,'utf8')>MAX_BYTES)
        return respond(res,413,{ok:false,error:'request_too_large'});
      if(req.headers?.['idempotency-key']!==operationId)
        return respond(res,400,{ok:false,error:'idempotency_required'});
    }
    try{
      const upstream=await fetchImpl(origin+urlPath,{
        method:req.method,
        headers:{
          authorization:'Bearer '+secret,
          'x-qa-user-session':session,
          accept:'application/json',
          ...(req.method==='POST'?{
            'content-type':'application/json',
            'idempotency-key':operationId,
          }:{}),
        },
        ...(payload!==null?{body:payload}:{}),
        cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(8000),
      });
      if(!upstream||!([200,400,403,404,405,409,413,503].includes(upstream.status))||
         !(upstream.headers.get('content-type')||'').toLowerCase().includes('application/json'))
        return respond(res,502,{ok:false,error:'private_bridge_unavailable'});
      const contentLength=Number(upstream.headers.get('content-length'));
      if(Number.isFinite(contentLength)&&contentLength>MAX_BYTES)
        return respond(res,502,{ok:false,error:'invalid_private_reply'});
      const dataText=await upstream.text();
      if(Buffer.byteLength(dataText,'utf8')>MAX_BYTES)
        return respond(res,502,{ok:false,error:'invalid_private_reply'});
      const data=JSON.parse(dataText);
      if(upstream.status!==200)
        return respond(res,upstream.status,{ok:false,error:'private_request_rejected'});
      if(!validateResult(data,action,operationId))
        return respond(res,502,{ok:false,error:'unverified_standby_response'});
      return respond(res,200,data);
    }catch{
      return respond(res,502,{ok:false,error:'private_bridge_unreachable'});
    }
  };
}
export default createQaVercelStandbyProxy();
