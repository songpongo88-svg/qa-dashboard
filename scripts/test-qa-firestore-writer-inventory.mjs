// Synthetic source tree only: no source credentials, databases or network.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {inspectQaWriterSource,discoverQaFirestoreWriters,
 REVIEWED_WRITERS} from './qa-firestore-writer-inventory.mjs';
const inspection=inspectQaWriterSource(
 'import {setDoc} from "firebase/firestore"; setDoc(reference, payload);',
 'src/example.ts');
assert.equal(inspection.mutationCandidates,1);
assert.equal(inspectQaWriterSource('setDoc(ref,data)', 'src/no-hint.ts')
 .mutationCandidates,0);
const admin=inspectQaWriterSource(
 'import { getFirestore } from "firebase-admin/firestore"; reference.set(value);',
 'server/admin.js');
assert.ok(admin.mutationCandidates>0);
const root=await mkdtemp(join(tmpdir(),'qa-writer-audit-'));
try{
 const paths=[...new Set(Object.values(REVIEWED_WRITERS).flat())];
 for(const file of paths){
  const target=join(root,file);
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,
   'import { setDoc } from "firebase/firestore";\n'+
   'const QA_COLLECTION="qa_evaluations"; setDoc(reference, value);\n');
 }
 await mkdir(join(root,'src'),{recursive:true});
 await writeFile(join(root,'src','undisclosedQaWriter.ts'),
  'import { deleteDoc } from "firebase/firestore";\n'+
  'const collection="qa_appeal_events"; deleteDoc(ref);\n');
 await writeFile(join(root,'src','notFirestore.ts'),
  'function deleteDoc(ref){ return ref; } deleteDoc("local");');
 const report=await discoverQaFirestoreWriters(root);
 assert.equal(report.knownReviewedCollectionCount,11);
 assert.equal(report.known.length,Object.values(REVIEWED_WRITERS).flat().length);
 assert.equal(report.unreviewed.length,1);
 assert.equal(report.unreviewed[0].path,'src/undisclosedQaWriter.ts');
 assert.equal(report.unreviewed[0].possibleCollections[0],'qa_appeal_events');
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.firestoreReads,0);
 assert.equal(report.failoverEnabled,false);
 assert.equal(report.allSourceWritesProven,false);
 assert.equal(report.sourceFilesScanned,paths.length+2);
 await rm(join(root,'src','evaluationStore.ts'));
 await assert.rejects(discoverQaFirestoreWriters(root),
  /qa_source_known_writer_changed/);
 console.log('PASS source-only QA writer inventory: 11 known mappings, unreviewed path surfaced, fails on missing known write, 0 reads');
}finally{await rm(root,{recursive:true,force:true});}
