// QA-only authoritative Firestore REST reader, backend only.
// Reads all required QA collections at ONE pinned point-in-time readTime using an
// OAuth token provided by a trusted server, never a QA browser API key.
// This reader performs GETs only; quota/authorization errors abort completely.
import {randomUUID} from 'node:crypto';
import {
  QA_SYNC_DATASETS,qaCanonicalDocumentHash,qaManifestDigest,
} from './qaLiveMirrorStage.js';
const PROJECT=/^[a-z][a-z0-9-]{4,62}$/;
const fail=code=>Object.assign(new Error(code),{code});
const safe=x=>typeof x==='string'&&x.length>0&&x.length<2000;
export async function captureQaFirestorePointInTime({
  projectId,accessToken,fetchImpl=fetch,readTime,
  pageSize=100,
}={}){
  if(!PROJECT.test(projectId||'')||!safe(accessToken)||accessToken.length<20)
    throw fail('firestore_server_credentials_missing');
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>500)
    throw fail('invalid_page_size');
  // Cloud Firestore supports consistent readTime for paginated reads.
  // Always use the same time for every dataset; never use client cache.
  const observedAt=readTime||new Date(Date.now()-15000).toISOString();
  const ms=Date.parse(observedAt);
  if(!Number.isFinite(ms)||ms>Date.now()-1000||Date.now()-ms>55*60000)
    throw fail('read_time_outside_verified_window');
  const scan=new Map(),manifests=[];
  const base='https://firestore.googleapis.com/v1/projects/'+projectId+
    '/databases/(default)/documents/';
  for(const dataset of QA_SYNC_DATASETS){
    const collected=[],seenIds=new Set(),seenTokens=new Set();
    let next='';
    do{
      const url=new URL(base+dataset);
      url.searchParams.set('readTime',observedAt);
      url.searchParams.set('pageSize',String(pageSize));
      if(next)url.searchParams.set('pageToken',next);
      let response;
      try{
        response=await fetchImpl(url.href,{
          method:'GET',
          headers:{authorization:'Bearer '+accessToken,accept:'application/json'},
          redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),
        });
      }catch{throw fail('firestore_source_unreachable');}
      if(response.status===429||response.status===403)
        throw fail('firestore_quota_or_permission_blocked');
      if(!response.ok||!(response.headers.get('content-type')||'').includes('application/json'))
        throw fail('firestore_source_unverified');
      let batch;
      try{batch=await response.json();}catch{throw fail('firestore_invalid_source_page');}
      if(!batch||typeof batch!=='object'||
        !Array.isArray(batch.documents||[])||
        (batch.nextPageToken!==undefined&&typeof batch.nextPageToken!=='string'))
        throw fail('firestore_invalid_source_page');
      const prefix='projects/'+projectId+'/databases/(default)/documents/'+dataset+'/';
      for(const item of batch.documents||[]){
        if(!item||typeof item.name!=='string'||!item.name.startsWith(prefix)||
          !item.fields||typeof item.fields!=='object'||Array.isArray(item.fields))
          throw fail('firestore_invalid_document');
        const id=item.name.slice(prefix.length);
        if(!id||id.includes('/')||seenIds.has(id))throw fail('firestore_duplicate_document');
        seenIds.add(id);
        // Preserve lossless Firestore typed field values and timestamps.
        const data={fields:item.fields,createTime:item.createTime||null,
          updateTime:item.updateTime||null};
        collected.push({id,data});
        if(collected.length>50000)throw fail('firestore_source_size_exceeded');
      }
      next=batch.nextPageToken||'';
      if(next){
        if(seenTokens.has(next))throw fail('firestore_repeated_page_token');
        seenTokens.add(next);
      }
    }while(next);
    scan.set(dataset,collected);
    manifests.push({dataset,count:collected.length,digest:qaManifestDigest(
      collected.map(item=>({
        path:dataset+'/'+item.id,hash:qaCanonicalDocumentHash(item.data),
      }))
    )});
  }
  return Object.freeze({
    metadata:{
      authority:'firestore-server-export',
      immutableSnapshotVerified:true,
      sourceAccessVerified:true,
      allCollectionsIncluded:true,
      exportId:'qa-firestore-readtime-'+randomUUID(),
      snapshotId:'qa-live-'+randomUUID(),
      exportedAt:observedAt,
      manifests,
    },
    async readCollection(dataset){
      if(!QA_SYNC_DATASETS.includes(dataset))throw fail('unrecognized_source_dataset');
      return (async function*(){yield* scan.get(dataset);})();
    },
    // No user case bodies or OAuth tokens leave this internal closure.
    verifiedReadTime:observedAt,
    sourceCount:manifests.reduce((n,row)=>n+row.count,0),
  });
}
