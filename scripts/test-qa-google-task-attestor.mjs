// Synthetic RSA signed token against an injected in-memory Google JWKS.
// No Google, Firestore, Windows, production, or user credentials.
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createQaGoogleTaskAttestor} from '../server/qaGoogleTaskAttestor.js';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const kid='qa-ci-google-public-key-1',jwk={...publicKey.export({format:'jwk'}),
 kid,kty:'RSA',alg:'RS256',use:'sig'};
const audience='https://qa-standby.example.workers.dev/v1/qa/source-delta';
const email='qa-source-tasks@qa-fixture.iam.gserviceaccount.com';
const now=Date.parse('2026-11-13T15:00:00Z');
let requests=0;
const getKeys=async ()=>{requests++;return new Response(JSON.stringify({keys:[jwk]}),{
 status:200,headers:{'content-type':'application/json'}});};
const attest=createQaGoogleTaskAttestor({
 audience,serviceAccountEmail:email,fetchImpl:getKeys,now:()=>now});
const event={eventId:'qa-synthetic-event-00001',
 snapshotId:'qa-synthetic-snapshot-01',
 documentPath:'qa_evaluations/synthetic-1',operation:'delete',
 sourceChangedAt:new Date(now-10000).toISOString(),hash:null};
function jwt(overrides={},headerOverrides={}){
 const h={alg:'RS256',typ:'JWT',kid,...headerOverrides};
 const body={iss:'https://accounts.google.com',aud:audience,email,
 email_verified:true,sub:'11223344556677889900',
 iat:Math.floor(now/1000)-60,exp:Math.floor(now/1000)+300,
 ...overrides};
 const data=[h,body].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
 return 'Bearer '+data+'.'+sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
}
let result=await attest(event,jwt());
assert.equal(result.authority,'verified-firestore-private-event');
assert.equal(result.eventId,event.eventId);
assert.equal(result.contentHash,null);
assert.equal(requests,1);
await attest(event,jwt());assert.equal(requests,1,'verified keys cached');
const cases=[
 jwt({aud:'https://wrong.example/v1/qa/source-delta'}),
 jwt({email:'attacker@qa-fixture.iam.gserviceaccount.com'}),
 jwt({email_verified:false}),jwt({iss:'https://not-google.example'}),
 jwt({exp:Math.floor(now/1000)-120}),
 jwt({iat:Math.floor(now/1000)+180}),
 jwt({nbf:Math.floor(now/1000)+180}),
 jwt({}, {alg:'none'}),jwt({}, {kid:'unknown'}),
 jwt({}, {crit:['b64']}),
 jwt().slice(0,-8)+'XXXXXXXX',
];
for(const token of cases)await assert.rejects(attest(event,token));
await assert.rejects(attest(event,'Bearer fake.jwt.bad'));
assert.throws(()=>createQaGoogleTaskAttestor({
 audience:'http://127.0.0.1',serviceAccountEmail:email}),
 /qa_oidc_attestor_configuration_invalid/);
assert.throws(()=>createQaGoogleTaskAttestor({
 audience,serviceAccountEmail:'user@example.com'}),
 /qa_oidc_attestor_configuration_invalid/);
console.log('PASS QA Google Tasks OIDC identity: RSA signature, locked audience/service-account, strict expiry, JWKS, no Firebase reads');
