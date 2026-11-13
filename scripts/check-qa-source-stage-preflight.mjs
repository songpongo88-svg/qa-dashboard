// QA-only, zero-network, zero-database, zero-Firestore-read preflight.
// Only reports missing configuration by KEY NAME; never outputs values.
import {pathToFileURL} from 'node:url';
import {validateLocalQaConnectionString} from '../server/qaLocalBridgeServer.js';

export function qaSourceStagePreflight(env={}) {
  const checks={
    localDatabase:validateLocalQaConnectionString(env.QA_LOCAL_DATABASE_URL),
    authorizedProject:/^[a-z][a-z0-9-]{4,62}$/.test(env.QA_FIRESTORE_PROJECT_ID||''),
    trustedOAuth:typeof env.QA_FIRESTORE_OAUTH_ACCESS_TOKEN==='string'&&
      env.QA_FIRESTORE_OAUTH_ACCESS_TOKEN.length>=20,
    explicitStageOnly:env.QA_LIVE_SNAPSHOT_STAGE_ONLY==='1',
  };
  const blockers=[];
  if(!checks.localDatabase)blockers.push('LOCAL_QA_DATABASE_URL_MISSING_OR_UNSAFE');
  if(!checks.authorizedProject)blockers.push('FIRESTORE_PROJECT_ID_MISSING');
  if(!checks.trustedOAuth)blockers.push('TRUSTED_FIRESTORE_OAUTH_MISSING');
  if(!checks.explicitStageOnly)blockers.push('STAGE_ONLY_OPT_IN_MISSING');
  return Object.freeze({
    safeToAttemptSourceCapture:blockers.length===0,
    firestoreReadExecuted:false,postgresWriteExecuted:false,failoverEnabled:false,
    blockers:Object.freeze(blockers),
    warning:'CONFIGURATION_ONLY_NOT_LIVE_SOURCE_VERIFICATION',
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=qaSourceStagePreflight(process.env);
  console.log('QA_SOURCE_STAGE_PREFLIGHT='+(result.safeToAttemptSourceCapture?'CONFIG_READY_NOT_VERIFIED':'BLOCKED'));
  for(const reason of result.blockers)console.log('QA_SOURCE_BLOCKER='+reason);
  console.log('QA_FIRESTORE_READ=NOT_ATTEMPTED');
  console.log('QA_POSTGRES_WRITE=NOT_ATTEMPTED');
  console.log('QA_FAILOVER=OFF');
  if(!result.safeToAttemptSourceCapture)process.exitCode=2;
}
