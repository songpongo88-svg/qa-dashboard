// QA Dashboard Preview-only, public-safe aggregate standby diagnostics.
// This module performs NO Firestore operations and never reads QA cases.
// It is included in the existing QA-only cron function to avoid Vercel
// Hobby function-limit growth and does not affect QA Sparks.
const send=(res,status,payload)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  return res.status(status).json(payload);
};
const privateOrigin=(raw)=>{
  if(typeof raw!=='string')return null;
  try{
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.port||
      url.search||url.hash||url.pathname!=='/'||
      !/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/i.test(url.hostname))
      return null;
    return url.origin;
  }catch{return null;}
};
const validInt=n=>Number.isSafeInteger(n)&&n>=0;
function isSameOrigin(req){
  const header=req.headers||{};
  const site=header['sec-fetch-site'];
  if(site&&site!=='same-origin'&&site!=='none')return false;
  const origin=header.origin;
  if(!origin)return true; // same-origin GET fetch may omit Origin
  const host=header.host;
  if(typeof host!=='string'||!/^[a-z0-9.-]+(?::443)?$/i.test(host))return false;
  return origin==='https://'+host.replace(/:443$/,'');
}
export function createQaPreviewStatusHandler({
  env=process.env,
  fetchImpl=fetch,
}={}){
  return async function handler(req,res){
    if(req.method!=='GET'){
      res.setHeader('Allow','GET');
      return send(res,405,{ok:false,error:'method_not_allowed'});
    }
    if(env.VERCEL_ENV!=='preview')
      return send(res,404,{ok:false,error:'preview_only'});
    if(req.query?.qaStatus!=='1'||!isSameOrigin(req))
      return send(res,403,{ok:false,error:'request_not_allowed'});
    const origin=privateOrigin(env.QA_LOCAL_BRIDGE_URL);
    const token=env.QA_LOCAL_BRIDGE_TOKEN;
    const configured=!!origin&&typeof token==='string'&&token.length>=40;
    const result={
      ok:true,
      primary:'firestore',
      standby:'local-postgresql',
      standbyRole:'archive-only',
      bridgeStatus:configured?'not_reachable':'not_configured',
      archiveStatus:'unverified',
      currentFirestoreParity:'not_verified',
      dataProxyEnabled:env.QA_STANDBY_DATA_PROXY_ENABLED==='1',
      failoverEnabled:false,
      writeEnabled:false,
      syncBackVerified:false,
      checkedAt:new Date().toISOString(),
    };
    if(!configured)return send(res,200,result);
    try{
      const response=await fetchImpl(origin+'/ready',{
        method:'GET',
        headers:{authorization:'Bearer '+token,accept:'application/json'},
        cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(4500),
      });
      if(response.status!==200||!(response.headers.get('content-type')||'').includes('application/json'))
        return send(res,200,result);
      const text=await response.text();
      if(text.length>16384)return send(res,200,result);
      const remote=JSON.parse(text);
      if(remote?.ok!==true||remote?.readOnly!==true||
        remote?.databaseConnected!==true||remote?.failoverReady!==false)
        return send(res,200,result);
      result.bridgeStatus='reachable_read_only';
      // Best-effort new readiness API. Older Windows bridge installations may
      // not expose it; the old safe archive status remains unchanged.
      try{
        const readiness=await fetchImpl(origin+'/readiness',{
          method:'GET',
          headers:{authorization:'Bearer '+token,accept:'application/json'},
          cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(3500),
        });
        if(readiness.status===200&&
          (readiness.headers.get('content-type')||'').includes('application/json')){
          const body=await readiness.text();
          if(body.length<=16384){
            const proof=JSON.parse(body);
            if(proof?.ok===true&&proof.readOnly===true&&
              proof.failoverReady===false&&proof.canAcceptWrites===false&&
              proof.firestorePrimary===true&&Array.isArray(proof.remainingChecks)&&
              proof.remainingChecks.length<=24&&proof.remainingChecks.every(code=>
                typeof code==='string'&&/^[a-z_]{3,80}$/.test(code))&&
              typeof proof.snapshot?.copied==='boolean'&&
              typeof proof.snapshot?.candidateVerified==='boolean'&&
              validInt(proof.snapshot?.sourceDocuments)&&
              validInt(proof.snapshot?.datasetCount)){
              result.snapshotReadiness={
                snapshotCopied:proof.snapshot.copied,
                candidatesVerified:proof.snapshot.candidateVerified,
                documentCount:proof.snapshot.sourceDocuments,
                datasetCount:proof.snapshot.datasetCount,
                freshnessVerified:proof.snapshot.withinFreshnessWindow===true,
                remainingChecks:proof.remainingChecks,
              };
            }
          }
        }
      }catch{/* Keep archive-only result if current Windows bridge is older. */}
      // The archive may have the expected import count, but this is never
      // proof of a current, complete per-document live Firestore mirror.
      const summary=await fetchImpl(origin+'/summary',{
        method:'GET',
        headers:{authorization:'Bearer '+token,accept:'application/json'},
        cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(4500),
      });
      if(summary.status===200&&(summary.headers.get('content-type')||'').includes('application/json')){
        const summaryText=await summary.text();
        if(summaryText.length<=16384){
          const data=JSON.parse(summaryText);
          if(data?.ok===true&&data.readOnly===true&&
            data.failoverReady===false&&data.importedArchiveCountMatch===true&&
            validInt(data.sourceDocumentCount)){
            result.archiveStatus='archived_counts_match';
            result.archivedDocuments=data.sourceDocumentCount;
          }
        }
      }
    }catch{/* A failed bridge check remains NOT_REACHABLE; no secrets exposed. */}
    return send(res,200,result);
  };
}
export default createQaPreviewStatusHandler();
