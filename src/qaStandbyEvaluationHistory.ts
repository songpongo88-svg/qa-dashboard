// QA Core only. A complete server-certified PG evaluation history is
// permitted as a read fallback for Firestore quota errors; NEVER silently
// treat browser cache or a partial set of pages as official QA scores.
// Browser/localStorage roles are not proof. The private server validates the
// current session, source snapshot, month locks and coordinator separately.
import {listQaStandbyEvaluations,QaStandbyRequestDenied}
  from './qaStandbyEvaluationApi';

const SESSION=/^[A-Za-z0-9_.:@-]{20,180}$/;
export function currentQaDashboardSessionId(){
  if(typeof window==='undefined')return '';
  try{
    const value=JSON.parse(window.localStorage.getItem('qa_current_user')||'null');
    const id=typeof value?.sessionId==='string'?value.sessionId:'';
    return SESSION.test(id)?id:'';
  }catch{return '';}
}
export async function fetchCompleteQaStandbyEvaluationHistory<T extends {
  id:string;finalScore:number;topics:unknown[];
}>(sessionId:string,{fetchImpl}:{fetchImpl?:typeof fetch}={}):Promise<T[]>{
  if(!SESSION.test(sessionId))throw new QaStandbyRequestDenied(403);
  const result:T[]=[];
  const seen=new Set<string>();
  let cursor='';
  let complete=false;
  for(let page=0;page<100;page++){
    const batch=await listQaStandbyEvaluations<T>(sessionId,{
      limit:100,afterId:cursor,fetchImpl,
    });
    if(typeof batch.hasMore!=='boolean'||!Array.isArray(batch.rows)||
       batch.rows.length>100||(batch.hasMore&&batch.rows.length===0))
      throw new QaStandbyRequestDenied(502);
    for(const row of batch.rows){
      const record=row.record;
      if(seen.has(row.evaluationId)||record?.id!==row.evaluationId||
         typeof record.finalScore!=='number'||!Number.isFinite(record.finalScore)||
         record.finalScore<0||record.finalScore>100||
         !Array.isArray(record.topics))
        throw new QaStandbyRequestDenied(502);
      seen.add(row.evaluationId);
      result.push(record);
    }
    if(!batch.hasMore){
      if(batch.nextAfterId!=null)throw new QaStandbyRequestDenied(502);
      complete=true;
      break;
    }
    if(typeof batch.nextAfterId!=='string'||!batch.nextAfterId||
       !seen.has(batch.nextAfterId)||batch.nextAfterId===cursor)
      throw new QaStandbyRequestDenied(502);
    cursor=batch.nextAfterId;
  }
  if(!complete)throw new QaStandbyRequestDenied(502);
  // Only return after ALL pages are acknowledged by the same authenticated
  // server route. No partial pages may be returned or cached as verified.
  return result;
}
