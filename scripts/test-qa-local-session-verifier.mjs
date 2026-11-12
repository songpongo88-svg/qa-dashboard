import assert from 'node:assert/strict';
import {decodeQaArchivedDocument,verifyQaLocalSession} from '../server/qaLocalSessionVerifier.js';
import {QA_SYNC_DATASETS,qaCanonicalDocumentHash} from '../server/qaLiveMirrorStage.js';
const now=Date.parse('2026-11-11T05:00:00.000Z');
const sessionId='qa_editor-8c11937f-01ab-4455-b6f2-620fb73e3e44';
const s=()=>({
  sessionId,username:'QA_Editor',policyVersion:'qa-session-policy-2026-07-15-v1',
  role:'Quality Assurance',status:'active',
  createdAt:'2026-11-11T04:00:00.000Z',
  lastActivityAt:'2026-11-11T04:59:00.000Z',
  expiresAt:'2026-11-11T06:00:00.000Z',
});
const p=()=>({username:'qa_editor',status:'Active',role:'Quality Assurance',agentName:'QA Staff'});
const fields=obj=>({fields:Object.fromEntries(Object.entries(obj).map(([key,value])=>[
  key,{stringValue:String(value)}
]))});
assert.deepEqual(decodeQaArchivedDocument(fields({username:'qa_editor',role:'Quality Assurance'})),{
  username:'qa_editor',role:'Quality Assurance',
});
assert.deepEqual(decodeQaArchivedDocument({data:{role:'QA'}}),{role:'QA'});
const pinnedSnapshot='qa-live-session-fixture-0001';
const db={state:{mode:'standby',source_snapshot_verified:true,generation:'3',active_snapshot_id:pinnedSnapshot},
  session:s(),profile:p(),control:{revokedBefore:'2026-11-11T03:00:00.000Z'},
  failRead:false,batchMissing:false,badHash:false,partialManifest:false};
const tx=[];
const pool={
  async connect(){return {
    async query(sql,params){
      tx.push({sql,params});
      if(db.failRead)throw Error('pg connection failed');
      if(sql.startsWith('BEGIN')||sql==='COMMIT'||sql==='ROLLBACK')return {rows:[]};
      if(sql.includes('SELECT mode,source_snapshot_verified,generation'))
        return {rows:[db.state]};
      if(sql.includes('live_snapshot_batches')){
        if(params?.[0]!==pinnedSnapshot)return {rows:[]};
        return {rows:db.batchMissing?[]:[{
        snapshot_id:pinnedSnapshot,status:'copy_verified',
        source_documents:3,stored_documents:3,
        dataset_manifest:QA_SYNC_DATASETS.slice(0,db.partialManifest?10:11).map(dataset=>({
          dataset,count:['qa_user_sessions','qa_user_profiles','qa_user_session_controls'].includes(dataset)?1:0,
          digest:'a'.repeat(64),
        })),
      }]};
      }
      if(sql.includes("root_collection='qa_user_profiles'")){
        if(!db.profile)return {rows:[]};
        return {rows:[{document_path:'qa_user_profiles/qa_editor',
          document_json:db.profile,content_hash:qaCanonicalDocumentHash(db.profile)}]};
      }
      if(sql.includes('live_snapshot_rows')&&params?.[1]?.startsWith('qa_user_sessions/')){
        return {rows:db.session?[{document_json:db.session,
          content_hash:db.badHash?'0'.repeat(64):qaCanonicalDocumentHash(db.session)}]:[]};
      }
      if(sql.includes('live_snapshot_rows')&&params?.[1]?.startsWith('qa_user_session_controls/')){
        return {rows:db.control?[{document_json:db.control,
          content_hash:qaCanonicalDocumentHash(db.control)}]:[]};
      }
      throw Error('unrecognized SQL');
    },
    release(){},
  };}
};
const check=()=>verifyQaLocalSession(pool,{sessionId,role:'Super Administrator'},now);
const good=await check();
assert.equal(good.username,'qa_editor');
assert.equal(good.role,'Quality Assurance');
assert.equal(good.generation,3);
assert.equal(good.sourceSnapshotId,pinnedSnapshot);
assert.equal(good.source,'verified-local-session');
assert.equal(good.expiresAt,s().expiresAt);
assert.equal(Object.isFrozen(good),true);
assert.equal(tx.some(r=>r.sql.includes('REPEATABLE READ READ ONLY')),true);
assert.equal(tx.some(r=>r.sql==='COMMIT'),true);
const fail=async(expectRollback=true)=>{const before=tx.length;await assert.rejects(check(),e=>e.code==='local_session_not_verified');assert.equal(tx.slice(before).some(r=>r.sql==='ROLLBACK'),expectRollback);};
db.state.source_snapshot_verified=false;await fail();db.state.source_snapshot_verified=true;
db.state.active_snapshot_id=null;await fail();db.state.active_snapshot_id=pinnedSnapshot;
db.state.active_snapshot_id='different-snapshot-111111';await fail();db.state.active_snapshot_id=pinnedSnapshot;
db.batchMissing=true;await fail();db.batchMissing=false;
db.partialManifest=true;await fail();db.partialManifest=false;
db.badHash=true;await fail();db.badHash=false;
db.state.mode='disabled';await fail();db.state.mode='standby';
db.session.status='revoked';await fail();db.session.status='active';
db.session.expiresAt='2026-11-11T04:59:00Z';await fail();db.session.expiresAt=s().expiresAt;
db.session.lastActivityAt='2026-11-11T02:00:00Z';await fail();db.session.lastActivityAt=s().lastActivityAt;
db.session.policyVersion='old';await fail();db.session.policyVersion=s().policyVersion;
db.profile.status='Suspended';await fail();db.profile.status='Active';
db.profile.role='Senior';await fail();db.profile.role=p().role;
db.control.revokedBefore='2026-11-11T04:01:00Z';await fail();db.control.revokedBefore='2026-11-11T03:00:00Z';
db.session=null;await fail();db.session=s();
db.profile=null;await fail();db.profile=p();
db.failRead=true;await fail(false);db.failRead=false;
await assert.rejects(verifyQaLocalSession(pool,{sessionId:'bad'},now),/local_session_not_verified/);
assert.equal(tx.some(r=>r.sql.includes('UPDATE ')||r.sql.includes('INSERT ')),false);
assert.equal(tx.some(r=>r.sql.includes('source_mirror')),false,'old imported archive cannot be an identity authority');
console.log('PASS QA local session: immutable live snapshot instead of old archive, transaction snapshot, active role/profile, revocation, inactivity, expiry and no client role trust');
