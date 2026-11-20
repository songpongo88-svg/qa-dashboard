// Windows-only staging composition. NEVER auto-start on Vercel or in
// QA Dashboard; no credentials, scheduler, HTTP endpoint, or failover switch.
import {loadQaWindowsProbeBaseline} from './qaWindowsProbeBaseline.js';
import {startQaWindowsReadOnlyProbe} from './qaWindowsSourceProbe.js';
import {createQaWindowsSignalPersister} from './qaWindowsSourceSignalJournal.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export async function startQaWindowsPrivateSignalStage({
 pool,firestore,authenticateSource,reserveBudget,
 attestLocalProbe,onUnsafe,env=process.env,
 setDeadline,clearDeadline,
}={}){
 if(env.QA_FAILOVER!=='OFF'||
   env.QA_WINDOWS_SOURCE_PROBE!=='1'||
   env.QA_WINDOWS_SOURCE_PROBE_MANIFEST!=='1'||
   env.QA_WINDOWS_SOURCE_SIGNAL_STAGE!=='1'||
   typeof authenticateSource!=='function'||
   typeof reserveBudget!=='function'||
   typeof attestLocalProbe!=='function'||
   typeof onUnsafe!=='function')
   fail('qa_windows_signal_stage_disabled');
 // This reads the existing frozen PostgreSQL copy ONLY.
 const manifest=await loadQaWindowsProbeBaseline({pool,env});
 const persistSignal=createQaWindowsSignalPersister({pool,
  snapshotId:manifest.snapshotId,attestLocalProbe,env});
 const probe=await startQaWindowsReadOnlyProbe({
  firestore,expectedIds:manifest.expectedIds,
  expectedRevisions:manifest.expectedRevisions,
  authenticateSource,reserveBudget,persistSignal,onUnsafe,env,
  ...(setDeadline?{setDeadline}:{}),
  ...(clearDeadline?{clearDeadline}:{}),
 });
 return Object.freeze({
  status:()=>Object.freeze({
   ...probe.status(),
   baselineHashed:true,
   sourceDataContinuous:false,
   verifiedSourceDeltaCount:0,
   canAcceptQaWrites:false,
   failoverReady:false,
  }),
  drain:()=>probe.drain(),
  stop:()=>probe.stop(),
 });
}
