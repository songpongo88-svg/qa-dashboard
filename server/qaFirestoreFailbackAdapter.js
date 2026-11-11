// QA-only Firestore failback adapter. NOT wired to any live HTTP handler.
// The existing QA standby replay worker injects a server-created instance.
// Every mutation is transactionally idempotent, version checked and authorized.
// Never infer permission from a browser request, local archive or role string.
import { createHash } from 'node:crypto';

const ID=/^[a-zA-Z0-9_.:@-]{1,180}$/;
const HASH=/^[a-f0-9]{64}$/;
const validObject=x=>x&&typeof x==='object'&&!Array.isArray(x);
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const validNumber=n=>Number.isSafeInteger(n)&&n>=0;
const fail=code=>Object.assign(new Error(code),{code});

export function createQaFirestoreFailbackAdapter({
  database, collectionName='qa_evaluations',
  authorizeTransaction, serializeRecord,
  fingerprintExisting, allowServerReplay,
  now=()=>new Date(),
}={}){
  if(!database||typeof database.collection!=='function'||typeof database.runTransaction!=='function'||
    collectionName!=='qa_evaluations'||typeof authorizeTransaction!=='function'||
    typeof serializeRecord!=='function'||typeof fingerprintExisting!=='function'||
    typeof allowServerReplay!=='function')throw fail('server_adapter_not_configured');

  return {
    async applyIfVersionMatches(op){
      if(!validObject(op)||!ID.test(op.operationId||'')||!ID.test(op.evaluationId||'')||
        !ID.test(op.actorUsername||'')||!['create','update','delete'].includes(op.action)||
        !validNumber(op.baseVersion)||!validNumber(op.nextVersion)||
        op.nextVersion!==op.baseVersion+1||
        (op.action==='create'&&op.baseVersion!==0)||
        (op.action!=='create'&&op.baseVersion<1)||
        (op.action!=='create'&&!HASH.test(op.sourceBaseHash||''))||
        (op.action==='create'&&op.sourceBaseHash!=null&&op.sourceBaseHash!=='')||
        !validObject(op.record)||String(op.record.id||'')!==op.evaluationId)
        throw fail('invalid_replay_operation');
      const operationHash=digest([
        op.operationId,op.evaluationId,op.action,op.actorUsername,op.baseVersion,
        op.nextVersion,op.sourceBaseHash??null,op.record,
      ]);
      // The adapter must only be instantiated from a trusted server runtime
      // and with a checked Firestore outage/recovery coordinator.
      if(await allowServerReplay()!==true)throw fail('replay_not_authorized');
      const caseRef=database.collection(collectionName).doc(op.evaluationId);
      const receiptRef=database.collection('qa_failback_applied_operations').doc(op.operationId);
      const serialized=serializeRecord(op.record,op.action);
      if(!validObject(serialized)||Object.keys(serialized).length===0||
        serialized.qa_failover_version!==undefined||
        serialized.qa_failover_operation_id!==undefined)
        throw fail('unsafe_record_serializer');
      const source=structuredClone(serialized);
      // Keep the operation ID and authoritative version in the same transaction.
      const result=await database.runTransaction(async tx=>{
        // Firestore requires all reads before writes.
        const [receiptSnap,recordSnap]=await Promise.all([tx.get(receiptRef),tx.get(caseRef)]);
        if(receiptSnap.exists){
          const value=receiptSnap.data();
          if(value?.request_hash!==operationHash||value?.evaluation_id!==op.evaluationId||
            value?.actor_username!==op.actorUsername||value?.action!==op.action)
            return {status:'conflict'};
          return {status:'already_applied',remoteRevision:'qa-failback:'+op.operationId};
        }
        const current=recordSnap.exists?recordSnap.data():null;
        if(op.action==='create'&&recordSnap.exists)return {status:'conflict'};
        if(op.action!=='create'&&!recordSnap.exists)return {status:'conflict'};
        if(op.action!=='create'){
          const remoteVersion=current.qa_failover_version;
          const currentVersion=validNumber(remoteVersion)?remoteVersion:1;
          if(currentVersion!==op.baseVersion)return {status:'conflict'};
          if(!validNumber(remoteVersion)&&
            fingerprintExisting(current)!==op.sourceBaseHash)return {status:'conflict'};
        }
        // This callback MUST independently read current account/role,
        // revoked sessions, signature locks and appeal hold inside tx.
        // It may NOT reuse unverified client fields.
        const permission=await authorizeTransaction(tx,{
          actorUsername:op.actorUsername,evaluationId:op.evaluationId,
          action:op.action,previous:current,next:source,operationId:op.operationId,
        });
        if(!validObject(permission)||permission.authoritative!==true||
          permission.sessionValid!==true||permission.accountActive!==true||
          permission.signatureUnlocked!==true||permission.appealHoldClear!==true||
          permission.scopeVerified!==true)
          return {status:'conflict'};
        const appliedAt=now().toISOString();
        const payload={
          ...source,qa_failover_version:op.nextVersion,
          qa_failover_operation_id:op.operationId,
          qa_failover_applied_at:appliedAt,
        };
        if(op.action==='delete'){
          if(current?.deleted_at||current?.deletedAt)return {status:'conflict'};
          payload.deleted_at=appliedAt;
          payload.deletedAt=appliedAt;
        }
        // A true create is unique. For updates merge preserves untouched legacy
        // fields while serializeRecord must supply explicit deletion sentinels.
        if(op.action==='create')tx.create(caseRef,payload);
        else tx.set(caseRef,payload,{merge:true});
        tx.create(receiptRef,{
          operation_id:op.operationId,evaluation_id:op.evaluationId,
          actor_username:op.actorUsername,action:op.action,
          request_hash:operationHash,source_base_hash:op.sourceBaseHash||null,
          version:op.nextVersion,applied_at:appliedAt,
        });
        return {status:'applied',remoteRevision:'qa-failback:'+op.operationId};
      });
      if(!result||!['applied','already_applied','conflict'].includes(result.status))
        throw fail('transaction_result_invalid');
      return result;
    },
  };
}
