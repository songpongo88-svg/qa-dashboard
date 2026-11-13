// Verify Google's Cloud Tasks OIDC ID token at the Windows private ingress.
// Does not authenticate a QA browser or claim Firestore parity. Coupled with
// a DISTINCT inbound Worker HMAC, this authenticates an approved cloud task
// sender without granting any evaluation, appeal or signature writes.
// Google public JWKs only; never exchange credentials with Firestore.
import {createPublicKey,verify} from 'node:crypto';

const err=code=>Object.assign(new Error(code),{code});
const GOOGLE_KEYS='https://www.googleapis.com/oauth2/v3/certs';
const EMAIL=/^[a-zA-Z0-9._+-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;
const URI=/^https:\/\/[a-z0-9.-]+\/v1\/qa\/source-delta$/;
const BASE64=/^[A-Za-z0-9_-]+$/;
function parsePart(part){
 if(!BASE64.test(part)||part.length>9000)throw err('qa_oidc_bad_token_encoding');
 try{
  const value=JSON.parse(Buffer.from(part,'base64url').toString('utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value))
   throw Error('not_object');
  return value;
 }catch{throw err('qa_oidc_bad_token_json');}
}
function tokenParts(header){
 if(typeof header!=='string'||header.length>12288||
    !header.startsWith('Bearer '))
  throw err('qa_oidc_token_missing');
 const pieces=header.slice(7).split('.');
 if(pieces.length!==3||pieces.some(part=>!BASE64.test(part)))
  throw err('qa_oidc_token_malformed');
 return pieces;
}
function sameClaims(payload,{audience,serviceAccountEmail,now}){
 const secs=now/1000;
 if(!['https://accounts.google.com','accounts.google.com'].includes(payload.iss)||
    payload.aud!==audience||payload.email!==serviceAccountEmail||
    payload.email_verified!==true||
    typeof payload.sub!=='string'||!/^\d{10,32}$/.test(payload.sub)||
    !Number.isSafeInteger(payload.iat)||
    !Number.isSafeInteger(payload.exp)||
    payload.exp<=secs-30||payload.exp>secs+3600+60||
    payload.iat>secs+60||payload.iat<secs-3600-60||
    payload.exp<=payload.iat||payload.exp-payload.iat>3660||
    (payload.nbf!==undefined&&
      (!Number.isSafeInteger(payload.nbf)||payload.nbf>secs+60)))
  throw err('qa_oidc_claims_mismatch');
}
export function createQaGoogleTaskAttestor({
 audience,serviceAccountEmail,fetchImpl=fetch,now=()=>Date.now(),
 keyUrl=GOOGLE_KEYS,
}={}){
 if(!URI.test(audience||'')||!EMAIL.test(serviceAccountEmail||'')||
    typeof fetchImpl!=='function'||typeof now!=='function'||
    keyUrl!==GOOGLE_KEYS&&process.env.QA_PG_ISOLATED_TEST!=='1')
  throw err('qa_oidc_attestor_configuration_invalid');
 let cache=null,validUntil=0;
 async function getKeys(force=false){
  if(!force&&cache&&now()<validUntil)return cache;
  let response,body;
  try{
   response=await fetchImpl(keyUrl,{method:'GET',redirect:'error',
    headers:{accept:'application/json'},signal:AbortSignal.timeout(4000)});
   if(response?.status!==200||
      !(response.headers.get('content-type')||'').includes('application/json'))
    throw Error('jwks_status');
   const raw=await response.text();
   if(raw.length>50000)throw Error('jwks_size');
   body=JSON.parse(raw);
  }catch{throw err('qa_oidc_google_keys_unavailable');}
  if(!Array.isArray(body?.keys)||body.keys.length<1||body.keys.length>24)
   throw err('qa_oidc_google_keys_invalid');
  const keys=new Map();
  for(const key of body.keys){
   if(key?.kty!=='RSA'||key.alg&&key.alg!=='RS256'||
      key.use&&key.use!=='sig'||typeof key.kid!=='string'||
      !/^[A-Za-z0-9_.-]{1,128}$/.test(key.kid)||
      typeof key.n!=='string'||typeof key.e!=='string'||
      !BASE64.test(key.n)||!BASE64.test(key.e)||keys.has(key.kid))
    throw err('qa_oidc_google_keys_invalid');
   try{
    const pub=createPublicKey({key,format:'jwk'});
    if(pub.asymmetricKeyType!=='rsa'||
       (pub.asymmetricKeyDetails?.modulusLength||0)<2048)
      throw Error('weak_key');
    keys.set(key.kid,pub);
   }catch{throw err('qa_oidc_google_keys_invalid');}
  }
  cache=keys;validUntil=now()+5*60_000;
  return keys;
 }
 return async function attestGoogleCloudTask(event,authorization){
  if(!event||typeof event!=='object')throw err('qa_oidc_event_missing');
  const pieces=tokenParts(authorization),header=parsePart(pieces[0]);
  const claims=parsePart(pieces[1]);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||
     !/^[A-Za-z0-9_.-]{1,128}$/.test(header.kid)||
     header.crit!==undefined||
     (header.typ!==undefined&&header.typ!=='JWT'))
    throw err('qa_oidc_header_invalid');
  sameClaims(claims,{audience,serviceAccountEmail,now:now()});
  let keys=await getKeys();
  if(!keys.has(header.kid))keys=await getKeys(true);
  const key=keys.get(header.kid);
  if(!key)throw err('qa_oidc_unknown_signing_key');
  const signed=Buffer.from(pieces[0]+'.'+pieces[1],'utf8');
  const signature=Buffer.from(pieces[2],'base64url');
  if(signature.length<128||!verify('RSA-SHA256',signed,key,signature))
   throw err('qa_oidc_signature_invalid');
  // Each event is also protected by the separately verified inbound
  // Worker-to-Windows raw-body HMAC in qaSourceDeltaHttpHandler.
  // The returned claim is ONLY for the private delta journal.
  return Object.freeze({
   authority:'verified-firestore-private-event',
   eventId:event.eventId,snapshotId:event.snapshotId,
   documentPath:event.documentPath,operation:event.operation,
   sourceChangedAt:event.sourceChangedAt,contentHash:event.hash,
  });
 };
}
