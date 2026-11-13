// Private QA Firestore source-delta delivery boundary, intended for an
// authenticated Google Cloud producer through a separately reviewed tunnel.
// Does not install listeners, call Firestore, authorize any QA writes, or
// claim that all Firestore events have been delivered. No browser CORS.
import {createHmac,timingSafeEqual} from 'node:crypto';
import {normalizeQaSourceDelta} from './qaSourceDeltaJournal.js';

const MAX_BODY=512*1024;
const fail=code=>Object.assign(new Error(code),{code});
const json=(res,status,payload)=>{
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store, max-age=0',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer'});
  res.end(JSON.stringify(payload));
};
function secureSignedTimestamp({secret,timestamp,signature,raw,now}){
  if(typeof secret!=='string'||secret.length<64||secret.length>512||
     !/^[\x21-\x7e]+$/.test(secret)||
     typeof timestamp!=='string'||! /^\d{10}$/.test(timestamp)||
     typeof signature!=='string'||!/^v1=[a-f0-9]{64}$/.test(signature))
    return false;
  const issued=Number(timestamp)*1000;
  if(!Number.isSafeInteger(issued)||issued>now+60_000||now-issued>300_000)
    return false;
  const expected=createHmac('sha256',secret)
    .update('qa-source-delta-v1\n'+timestamp+'\n','utf8')
    .update(raw).digest();
  const received=Buffer.from(signature.slice(3),'hex');
  return timingSafeEqual(expected,received);
}
export function signQaSourceDeltaDelivery({secret,timestamp,raw}={}){
  if(typeof secret!=='string'||secret.length<64||secret.length>512||
     !/^[\x21-\x7e]+$/.test(secret)||
     !/^\d{10}$/.test(String(timestamp||''))||
     !Buffer.isBuffer(raw)||!raw.length||raw.length>MAX_BODY)
    throw fail('qa_delta_signing_input_invalid');
  return 'v1='+createHmac('sha256',secret)
    .update('qa-source-delta-v1\n'+timestamp+'\n','utf8').update(raw)
    .digest('hex');
}
export function createQaSourceDeltaHttpHandler({
  secret,recordVerifiedEvent,now=()=>Date.now(),
  maxConcurrent=2,
}={}){
  if(typeof secret!=='string'||secret.length<64||secret.length>512||
     !/^[\x21-\x7e]+$/.test(secret)||
     typeof recordVerifiedEvent!=='function'||typeof now!=='function'||
     !Number.isInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>8)
    throw fail('qa_delta_ingress_configuration_invalid');
  let active=0;
  return async function handleQaDelta(req,res){
    const path=req?.url;
    if(path!=='/v1/qa/source-delta')
      return json(res,404,{ok:false,error:'not_found'});
    if(req.method!=='POST'){
      res.setHeader('Allow','POST');
      return json(res,405,{ok:false,error:'method_not_allowed'});
    }
    if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(
      String(req.headers?.['content-type']||'')))
      return json(res,415,{ok:false,error:'invalid_content_type'});
    if(active>=maxConcurrent)
      return json(res,503,{ok:false,error:'ingress_busy'});
    active++;
    try{
      const announced=req.headers?.['content-length'];
      if(announced!==undefined&&(!/^\d+$/.test(String(announced))||
          Number(announced)>MAX_BODY))
        return json(res,413,{ok:false,error:'event_too_large'});
      const chunks=[];
      let bytes=0;
      for await(const chunk of req){
        if(!Buffer.isBuffer(chunk))throw fail('qa_delta_body_invalid');
        bytes+=chunk.length;
        if(bytes>MAX_BODY)throw fail('qa_delta_body_too_large');
        chunks.push(chunk);
      }
      const raw=Buffer.concat(chunks);
      if(raw.length===0)return json(res,400,{ok:false,error:'invalid_event'});
      const timestamp=req.headers?.['x-qa-source-timestamp'];
      const signature=req.headers?.['x-qa-source-signature'];
      if(!secureSignedTimestamp({secret,timestamp,signature,raw,now:now()}))
        return json(res,403,{ok:false,error:'invalid_source_signature'});
      let submitted;
      try{submitted=JSON.parse(raw.toString('utf8'));}
      catch{return json(res,400,{ok:false,error:'invalid_event'});}
      let normalized;
      try{normalized=normalizeQaSourceDelta(submitted,now());}
      catch{return json(res,422,{ok:false,error:'invalid_event'});}
      // A valid HMAC proves only that the caller holds this private key.
      // The backend's independent source attestor and PostgreSQL writer must
      // still verify origin, baseline and the latest snapshot. This layer
      // never fabricates "verified-firestore-private-event" itself.
      const outcome=await recordVerifiedEvent(normalized,req);
      if(!outcome?.journaled||!['applied','duplicate','stale','conflict']
        .includes(outcome.outcome)||outcome.canAcceptWrites!==false)
        throw fail('qa_delta_private_journal_refused');
      // Do not return case payload, document paths, session data or scores.
      return json(res,202,{ok:true,stored:true,
        outcome:outcome.outcome,failoverReady:false,canAcceptWrites:false});
    }catch(error){
      if(error?.code==='qa_delta_body_too_large')
        return json(res,413,{ok:false,error:'event_too_large'});
      return json(res,503,{ok:false,error:'source_event_unavailable'});
    }finally{active--;}
  };
}
