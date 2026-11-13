// Only server code can compose the QA Windows bridge's authenticated data
// runtime. No browser flag or Vercel env may supply the independent proofs.
// Standalone archive bridge remains read-only until a reviewed Windows host
// explicitly opts into this module with seven independent sources.
import {createQaBridgeRouter} from './qaLocalBridgeServer.js';
import {createQaStandbyDataHandler} from './qaStandbyDataHandler.js';
import {createQaStandbyTrustedContextFactory} from './qaStandbyTrustedContext.js';
import {verifyQaLocalSession} from './qaLocalSessionVerifier.js';

const fail=code=>{throw Object.assign(new Error(code),{code});};
const SOURCES=['primaryHealth','mirrorProof','bridgeProof','coordinatorLease',
  'signatureAndAppealLocks','editLease','productionAuthorization'];

export function createQaStandaloneDataBridge({
  readPool,writePool,token,archiveToken,sources,env=process.env,
  verifySession,
  listEvaluations,readEvaluation,writeEvaluation,
}={}){
  if(!readPool||typeof readPool.query!=='function'||
     typeof readPool.connect!=='function'||!writePool||
     typeof writePool.query!=='function'||typeof writePool.connect!=='function'||
     typeof token!=='string'||token.length<40)
    fail('qa_data_bridge_requires_postgres_connections');
  // Archive monitoring and case-data ingress MUST NOT share a bearer token
  // on a real machine; a copied read-only probe token grants no QA write access.
  if(env.QA_PG_ISOLATED_TEST!=='1'&&(
    typeof archiveToken!=='string'||archiveToken.length<40||
    archiveToken===token
  ))fail('qa_data_bridge_separate_archive_token_required');
  if(!sources||SOURCES.some(k=>typeof sources[k]!=='function'))
    fail('qa_data_bridge_independent_authority_missing');
  if(env.QA_LOCAL_STANDBY_DATA_ENABLED!=='1')
    fail('qa_data_bridge_not_enabled');
  const writesEnabled=env.QA_LOCAL_STANDBY_WRITES_ENABLED==='1';
  if(writesEnabled && env.QA_STANDBY_CUTOVER_ENABLED!=='1')
    fail('qa_data_bridge_write_activation_missing');
  // Test-only injection may never be used on the physical Windows DB.
  if(verifySession && env.QA_PG_ISOLATED_TEST!=='1')
    fail('qa_data_bridge_session_override_forbidden');
  if((listEvaluations||readEvaluation||writeEvaluation)&&
     env.QA_PG_ISOLATED_TEST!=='1')
    fail('qa_data_bridge_handler_override_forbidden');
  const makeTrustedContext=createQaStandbyTrustedContextFactory({
    readPool,...Object.fromEntries(SOURCES.map(k=>[k,sources[k]])),
  });
  const handler=createQaStandbyDataHandler({
    readPool,writePool,token,dataEnabled:true,writesEnabled,
    makeTrustedContext,
    verifySession:verifySession||verifyQaLocalSession,
    ...(listEvaluations?{listEvaluations}:{}),
    ...(readEvaluation?{readEvaluation}:{}),
    ...(writeEvaluation?{writeEvaluation}:{}),
  });
  return createQaBridgeRouter(readPool,{token:archiveToken||token,standbyDataHandler:handler});
}
