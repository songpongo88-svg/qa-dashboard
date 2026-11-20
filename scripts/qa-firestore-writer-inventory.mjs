// Source-only QA Firestore writer discovery. Never imports application modules,
// connects to Firestore, reads secrets, writes a database, or changes failover.
import {readdir,readFile,stat} from 'node:fs/promises';
import {join,relative,sep} from 'node:path';
export const QA_CORE_COLLECTIONS=Object.freeze([
 'qa_evaluations','qa_appeal_events','qa_signature_documents',
 'qa_user_profiles','qa_role_permissions','qa_user_sessions',
 'qa_user_session_controls','qa_role_definitions','qa_system_settings',
 'qa_signature_library','qa_evaluation_progress',
]);
export const REVIEWED_WRITERS=Object.freeze({
 qa_evaluations:['src/evaluationStore.ts'],
 qa_appeal_events:['src/appealStore.ts'],
 qa_signature_documents:['src/signatureStore.ts'],
 qa_user_profiles:['src/userRoleStore.ts'],
 qa_role_permissions:['src/userRoleStore.ts'],
 qa_user_sessions:['src/sessionStore.ts'],
 qa_user_session_controls:['src/sessionStore.ts'],
 qa_role_definitions:['src/userRoleStore.ts'],
 qa_system_settings:['src/userRoleStore.ts'],
 qa_signature_library:['src/signatureStore.ts'],
 qa_evaluation_progress:['src/qaEvaluationProgressStore.ts','src/evaluationStore.ts'],
});
const extension=/\.(?:js|jsx|ts|tsx|mjs|cjs)$/i;
const ignored=new Set(['node_modules','dist','build','.git','.vercel','coverage','vendor']);
const firestoreSignal=/firebase(?:-admin)?\/firestore|@google-cloud\/firestore|\bFirestoreApi\b|\bfirebaseDb\b|\bgetFirestore\b|\badmin\.firestore\b/;
const mutation=/\b(?:setDoc|updateDoc|deleteDoc|addDoc|runTransaction|writeBatch|createDocument|commitTransaction)\s*\(|\b(?:transaction|tx|batch|FirestoreApi)\s*\.\s*(?:set|update|delete|create|commit|setDoc|updateDoc|deleteDoc|runTransaction)\s*\(/g;
const adminMutation=/\.\s*(?:set|update|delete|create)\s*\(/g;
const norm=p=>p.split(sep).join('/');
export function inspectQaWriterSource(source,path='fixture.ts'){
 if(typeof source!=='string')throw Error('qa_source_audit_requires_text');
 const hint=firestoreSignal.test(source);
 const explicit=[...source.matchAll(mutation)].length;
 // Admin SDK chained document writes are too dynamic for a text-only proof.
 const admin=/(?:firebase-admin|@google-cloud\/firestore|admin\.firestore)/.test(source)
  ? [...source.matchAll(adminMutation)].length:0;
 const possibleCollections=QA_CORE_COLLECTIONS.filter(name=>source.includes(name));
 return Object.freeze({path,hint,mutationCandidates:hint?explicit+admin:0,
  possibleCollections,indirectOrDynamic:false});
}
export async function discoverQaFirestoreWriters(root,{trees=['src','api','server','scripts'],
 maxFiles=16000,maxFileBytes=1024*1024}={}){
 const files=[],reviewedPaths=new Set(Object.values(REVIEWED_WRITERS).flat());
 async function walk(abs){
  let entries;
  try{entries=await readdir(abs,{withFileTypes:true});}
  catch(e){if(e.code==='ENOENT')return;throw e;}
  for(const item of entries){
   if(item.isSymbolicLink())continue;
   const next=join(abs,item.name);
   if(item.isDirectory()){if(!ignored.has(item.name))await walk(next);continue;}
   if(!item.isFile()||!extension.test(item.name))continue;
   files.push(next);
   if(files.length>maxFiles)throw Error('qa_source_audit_file_limit');
  }
 }
 for(const tree of trees)await walk(join(root,tree));
 const discovered=[],byPath=new Map(),readFailures=[];
 for(const abs of files.sort()){
  const path=norm(relative(root,abs));
  let info;
  try{
   const metadata=await stat(abs);
   if(metadata.size>maxFileBytes){
    readFailures.push(path);continue;
   }
   info=inspectQaWriterSource(await readFile(abs,'utf8'),path);
  }catch{readFailures.push(path);continue;}
  byPath.set(path,info);
  if(info.mutationCandidates>0){
   discovered.push({...info,reviewed:reviewedPaths.has(path)});
  }
 }
 const known=[];
 for(const [collection,paths] of Object.entries(REVIEWED_WRITERS)){
  for(const path of paths){
   const info=byPath.get(path);
   if(!info||info.mutationCandidates<1)
    throw Error('qa_source_known_writer_changed:'+path+':'+collection);
   known.push({collection,path,candidateMutations:info.mutationCandidates});
  }
 }
 // These are all lexical leads, not proof that all writes are intercepted.
 const unreviewed=discovered.filter(v=>!v.reviewed).map(v=>({
  path:v.path,possibleCollections:v.possibleCollections,
  mutationCandidates:v.mutationCandidates,
 }));
 return Object.freeze({
  status:'BLOCKED',sourceFilesScanned:byPath.size,filesSkipped:readFailures.length,
  knownReviewedCollectionCount:Object.keys(REVIEWED_WRITERS).length,
  known,writerFiles:discovered.length,unreviewed,
  unsupportedDynamicDiscovery:true,allSourceWritesProven:false,
  firestoreReads:0,firestoreWrites:0,failoverEnabled:false,
 });
}
