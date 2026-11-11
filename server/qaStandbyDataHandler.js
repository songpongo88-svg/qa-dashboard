// QA-only authenticated server-to-server DATA router for a future standby.
// NOT mounted to an Internet route and disabled by default.
// Local identity is derived from PostgreSQL sessions, never JSON role claims.
// Only separately trusted server code may build a failover/lock context.
import { createHash, timingSafeEqual } from 'node:crypto';
import { verifyQaLocalSession } from './qaLocalSessionVerifier.js';
import { listQaStandbyEvaluations, readQaStandbyEvaluation } from './qaStandbyRead.js';
import { writeQaStandbyEvaluation } from './qaStandbyPgJournal.js';

const err=code=>Object.assign(new Error(code),{code});
const secureMatch=(actual,expected)=>{
  if(typeof actual!=='string'||!actual||typeof expected!=='string'||expected.length<40)
    return false;
  return timingSafeEqual(createHash('sha256').update(actual).digest(),
    createHash('sha256').update(expected).digest());
};
const respond=(res,status,data,allow)=>{
  if(allow)res.setHeader('Allow',allow);
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, max-age=0',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'no-referrer',
  });
  res.end(JSON.stringify(data));
};
const id=/^[A-Za-z0-9_.:@-]{1,180}$/;
const allowed={
  list:'GET',get:'GET',write:'POST',
};
const errorResponse=code=>{
  if(code==='local_session_not_verified')return [403,'session_denied'];
  if(code==='standby_read_not_authorized'||code==='backup_not_verified'||
    code==='failover_not_authorized'||code==='standby_not_activated'||
    code==='production_writer_disabled')return [503,'standby_not_ready'];
  if(code==='invalid_request'||code==='invalid_evaluation_id'||code==='invalid_month'||
    code==='invalid_limit'||code==='invalid_cursor'||code==='invalid_operation')
    return [400,'invalid_request'];
  return [503,'standby_unavailable'];
};
async function parseBody(req){
  const size=Number(req.headers['content-length']);
  if(Number.isFinite(size)&&(size<0||size>2*1024*1024))throw err('invalid_request');
  if(String(req.headers['content-type']||'').split(';')[0].trim()!=='application/json')
    throw err('invalid_request');
  let raw='',count=0;
  for await(const chunk of req){
    count+=chunk.length;
    if(count>2*1024*1024)throw err('invalid_request');
    raw+=chunk.toString('utf8');
  }
  let parsed;
  try{parsed=JSON.parse(raw);}catch{throw err('invalid_request');}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
    !id.test(parsed.operationId||'')||!id.test(parsed.evaluationId||''))
    throw err('invalid_request');
  return parsed;
}
export function createQaStandbyDataHandler({
  readPool,writePool,token,dataEnabled=false,writesEnabled=false,
  verifySession=verifyQaLocalSession,
  makeTrustedContext,
  listEvaluations=listQaStandbyEvaluations,
  readEvaluation=readQaStandbyEvaluation,
  writeEvaluation=writeQaStandbyEvaluation,
}={}){
  if(!readPool||typeof readPool.query!=='function'||typeof token!=='string'||
    token.length<40||typeof verifySession!=='function'||
    typeof makeTrustedContext!=='function')throw err('standby_data_handler_not_configured');
  return async(req,res)=>{
    if(!dataEnabled)return respond(res,503,{ok:false,error:'standby_data_not_enabled'});
    if(req.headers.origin)return respond(res,403,{ok:false,error:'browser_origin_forbidden'});
    if(!secureMatch(req.headers.authorization,'Bearer '+token))
      return respond(res,403,{ok:false,error:'forbidden'});
    let url;
    try{url=new URL(req.url,'http://127.0.0.1');}
    catch{return respond(res,400,{ok:false,error:'invalid_request'});}
    if(url.hash||url.pathname.length>250||
      [...url.searchParams.keys()].some(x=>!['month','limit','afterId'].includes(x)))
      return respond(res,400,{ok:false,error:'invalid_request'});
    const match=url.pathname.match(/^\/v1\/qa\/evaluations(?:\/([a-zA-Z0-9_.:@-]{1,180}))?$/);
    if(!match)return respond(res,404,{ok:false,error:'not_found'});
    const action=req.method==='GET'?(match[1]?'get':'list'):'write';
    if(req.method!==allowed[action]||(action==='write'&&(match[1]||url.search)))
      return respond(res,405,{ok:false,error:'method_not_allowed'},action==='write'?'POST':'GET');
    if(action==='write'&&(!writesEnabled||!writePool))
      return respond(res,503,{ok:false,error:'standby_writes_disabled'});
    const sessionId=req.headers['x-qa-user-session'];
    if(typeof sessionId!=='string'||sessionId.length>180||sessionId.length<20)
      return respond(res,403,{ok:false,error:'session_denied'});
    let actor;
    try{actor=await verifySession(readPool,{sessionId});}
    catch{return respond(res,403,{ok:false,error:'session_denied'});}
    if(actor?.source!=='verified-local-session'||
      actor.role!=='Quality Assurance'||actor.status!=='active')
      return respond(res,403,{ok:false,error:'session_denied'});
    try{
      let payload=null;
      if(action==='write'){
        payload=await parseBody(req);
        if(req.headers['idempotency-key']!==payload.operationId)
          return respond(res,400,{ok:false,error:'idempotency_key_missing'});
      }
      // The server must look up true agent/month, locks and existing record
      // from trusted PostgreSQL. Only use untrusted fields as lookup keys.
      const trusted=await makeTrustedContext({
        actor,action:action==='write'?payload.action:action,
        evaluationId:action==='write'?payload.evaluationId:(match[1]||null),
        candidate:action==='write'?payload:null,
      });
      if(!trusted||trusted.contextSource!=='server-owned-not-request-body')
        throw err('failover_not_authorized');
      if(action==='get'){
        if(url.search)return respond(res,400,{ok:false,error:'invalid_request'});
        const item=await readEvaluation(readPool,match[1],trusted);
        return respond(res,200,{ok:true,...item});
      }
      if(action==='list'){
        const query={
          month:url.searchParams.get('month')||undefined,
          limit:url.searchParams.get('limit')||undefined,
          afterId:url.searchParams.get('afterId')||undefined,
        };
        const items=await listEvaluations(readPool,query,trusted);
        return respond(res,200,{ok:true,...items});
      }
      const result=await writeEvaluation(writePool,payload,trusted);
      return respond(res,200,{ok:true,...result});
    }catch(error){
      const [status,message]=errorResponse(error?.code);
      return respond(res,status,{ok:false,error:message});
    }
  };
}
