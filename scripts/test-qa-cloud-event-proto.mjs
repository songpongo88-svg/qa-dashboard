// Decodes a binary protobuf Firestore Eventarc fixture using the same proto
// and library that the isolated Cloud Run producer uses. No Google API calls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {qaEventarcToDelta} from '../cloud/qa-firestore-delta-producer/producer.mjs';
const dir=join(dirname(fileURLToPath(import.meta.url)),'../cloud/qa-firestore-delta-producer');
const require=createRequire(join(dir,'package.json'));
const protobuf=require('protobufjs');
const root=await protobuf.load(join(dir,'data.proto'));
const T=root.lookupType('google.events.cloud.firestore.v1.DocumentEventData');
const name='projects/qa-fixture-2026/databases/(default)/documents/qa_evaluations/AA100001';
const binary=T.encode(T.create({value:{name,
 createTime:{seconds:1794618000,nanos:0},
 updateTime:{seconds:1794618001,nanos:123456000},
 fields:{score:{integerValue:85},enabled:{booleanValue:true},
  details:{mapValue:{fields:{note:{stringValue:'sample'}}}},
 }}})).finish();
const decoded=T.toObject(T.decode(binary),{longs:String,bytes:String,
 enums:String,defaults:false,oneofs:true,json:true});
const cloudEvent={type:'google.cloud.firestore.document.v1.written',
 source:'//firestore.googleapis.com/projects/qa-fixture-2026/databases/(default)',
 subject:'documents/qa_evaluations/AA100001',
 id:'99999999999999999999999',time:'2026-11-14T01:00:00Z'};
const delta=qaEventarcToDelta({cloudEvent,decoded,
 projectId:'qa-fixture-2026',snapshotId:'qa-live-snapshot-fixture'});
assert.equal(delta.documentJson.fields.score.integerValue,'85');
assert.equal(delta.documentJson.fields.enabled.booleanValue,true);
assert.equal(delta.documentJson.fields.details.mapValue.fields.note.stringValue,'sample');
assert.ok(delta.documentJson.updateTime.endsWith('.123456Z'));
console.log('PASS QA official Eventarc Firestore protobuf decoding without Firestore reads');
