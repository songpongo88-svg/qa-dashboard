// Staged QA Dashboard client for a future server-certified PostgreSQL failover.
// It is NOT imported by the production evaluation store. Firestore remains
// PRIMARY until a trusted server proves a complete live mirror and cutover.
// Never accept browser flags or browser-supplied roles as authorization.
const API='/api/cron/expire-additional-appeals';
const IDENTIFIER=/^[A-Za-z0-9_.:@-]{1,180}$/;
const SESSION=/^[A-Za-z0-9_.:@-]{20,180}$/;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/;

export type QaStandbyEvaluationEntry<T> = {
  evaluationId:string;
  version:number;
  origin:string;
  record:T;
};
export type QaStandbyWriteRequest<T> = {
  operationId:string;
  evaluationId:string;
  action:'create'|'update'|'delete';
  expectedVersion:number;
  record:T;
};
export type QaStandbyWriteReceipt = {
  operationId:string;
  evaluationId:string;
  version:number;
  queued:boolean;
  replay:boolean;
};

export class QaStandbyRequestDenied extends Error {
  readonly httpStatus:number;
  constructor(httpStatus:number){
    super('QA standby not available or request rejected; original assessment was not centrally submitted');
    this.name='QaStandbyRequestDenied';
    this.httpStatus=httpStatus;
  }
}
const assertId=(id:string)=>{
  if(!IDENTIFIER.test(id))throw new TypeError('invalid QA ID');
};
const assertSession=(sessionId:string)=>{
  if(!SESSION.test(sessionId))throw new QaStandbyRequestDenied(403);
};
async function send<T>(
  sessionId:string,
  params:URLSearchParams,
  options:{body?:unknown;operationId?:string;signal?:AbortSignal;fetchImpl?:typeof fetch}={},
):Promise<T>{
  assertSession(sessionId);
  params.set('qaData','1');
  const headers:Record<string,string>={'x-qa-user-session':sessionId,'accept':'application/json'};
  const init:RequestInit={method:'GET',headers,cache:'no-store',credentials:'same-origin',signal:options.signal};
  if(options.body!==undefined){
    if(!options.operationId)throw new TypeError('missing idempotency key');
    headers['content-type']='application/json';
    headers['idempotency-key']=options.operationId;
    init.method='POST';
    init.body=JSON.stringify(options.body);
  }
  let response:Response;
  try{response=await (options.fetchImpl??fetch)(API+'?'+params.toString(),init);}
  catch{throw new QaStandbyRequestDenied(502);}
  if(!response.ok)throw new QaStandbyRequestDenied(response.status);
  let result:any;
  try{result=await response.json();}catch{throw new QaStandbyRequestDenied(502);}
  if(!result||typeof result!=='object'||result.ok!==true)
    throw new QaStandbyRequestDenied(502);
  return result as T;
}
export async function listQaStandbyEvaluations<T>(
  sessionId:string,
  {month,limit=50,afterId='',signal,fetchImpl}:{
    month?:string;limit?:number;afterId?:string;signal?:AbortSignal;fetchImpl?:typeof fetch;
  }={},
){
  if(month!==undefined&&!MONTH.test(month))throw new TypeError('invalid month');
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw new TypeError('invalid limit');
  if(afterId)assertId(afterId);
  const p=new URLSearchParams({action:'list',limit:String(limit)});
  if(month)p.set('month',month);
  if(afterId)p.set('afterId',afterId);
  const res=await send<{
    ok:true;source:string;dataStatus:string;rows:QaStandbyEvaluationEntry<T>[];
    hasMore:boolean;nextAfterId?:string|null;
  }>(sessionId,p,{signal,fetchImpl});
  if(res.source!=='local-postgres-standby'||res.dataStatus!=='verified-snapshot'||
    !Array.isArray(res.rows)||res.rows.some(x=>
      !IDENTIFIER.test(x?.evaluationId||'')||
      !Number.isSafeInteger(x?.version)||x.version<1||
      !x.record||typeof x.record!=='object'
    ))throw new QaStandbyRequestDenied(502);
  return res;
}
export async function readQaStandbyEvaluation<T>(
  sessionId:string,evaluationId:string,{signal,fetchImpl}:{
    signal?:AbortSignal;fetchImpl?:typeof fetch;
  }={},
){
  assertId(evaluationId);
  const p=new URLSearchParams({action:'get',evaluationId});
  const res=await send<{
    ok:true;source:string;dataStatus:string;found:boolean;
    evaluationId?:string;version?:number;record?:T;
  }>(sessionId,p,{signal,fetchImpl});
  if(res.source!=='local-postgres-standby'||res.dataStatus!=='verified-snapshot'||
    typeof res.found!=='boolean'||(res.found&&(
      res.evaluationId!==evaluationId||!Number.isSafeInteger(res.version)||
      (res.version??0)<1||!res.record
    )))throw new QaStandbyRequestDenied(502);
  return res;
}
export async function writeQaStandbyEvaluation<T>(
  sessionId:string,request:QaStandbyWriteRequest<T>,{signal,fetchImpl}:{
    signal?:AbortSignal;fetchImpl?:typeof fetch;
  }={},
):Promise<QaStandbyWriteReceipt>{
  assertId(request.operationId);
  assertId(request.evaluationId);
  if(!['create','update','delete'].includes(request.action)||
    !Number.isSafeInteger(request.expectedVersion)||request.expectedVersion<0||
    (request.action==='create'&&request.expectedVersion!==0)||
    (request.action!=='create'&&request.expectedVersion<1)||
    !request.record||typeof request.record!=='object')throw new TypeError('invalid standby write');
  const p=new URLSearchParams({action:'write'});
  const res=await send<{
    ok:true;operationId:string;evaluationId:string;version:number;
    queued:boolean;replay:boolean;
  }>(sessionId,p,{body:request,operationId:request.operationId,signal,fetchImpl});
  if(res.operationId!==request.operationId||res.evaluationId!==request.evaluationId||
     res.version!==request.expectedVersion+1||typeof res.queued!=='boolean'||
     typeof res.replay!=='boolean')throw new QaStandbyRequestDenied(502);
  // queued:true means COMMITTED TO LOCAL OUTBOX, not synced to Firestore.
  // Never show this as official central QA submission until replay confirms it.
  return res;
}
