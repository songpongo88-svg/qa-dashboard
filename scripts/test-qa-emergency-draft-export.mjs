import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const file=new URL('../src/lib/evaluation/draftBackup.ts',import.meta.url);
const source=await fs.readFile(file,'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const tmp=path.join(os.tmpdir(),'qa-emergency-draft-'+process.pid+'-'+Date.now()+'.mjs');
await fs.writeFile(tmp,output,'utf8');
try {
  const {makeQaDraftBackup,makeQaDraftBackupFilename,QA_DRAFT_BACKUP_KIND}=await import(pathToFileURL(tmp).href);
  const at=new Date('2026-11-10T12:00:00Z');
  const drafts=[
    {draftId:'A-001',caseId:'AA001',agentName:'QA Agent',auditDate:'2026-11-10',savedAtMs:12,caseDescription:'This must remain exactly unchanged',topicState:{'1':{score:85,reason:'Evidence preserved'}}},
    {draftId:'A-002',caseId:'AA002',savedAtMs:13,callLogs:[{recordingContent:'data:audio/wav;base64,QUJD'}]}
  ];
  const envelope=makeQaDraftBackup(drafts,'qa.owner',at);
  assert.equal(envelope.format,QA_DRAFT_BACKUP_KIND);
  assert.equal(envelope.schemaVersion,1);
  assert.equal(envelope.ownerUsername,'qa.owner');
  assert.equal(envelope.draftCount,2);
  assert.deepEqual(JSON.parse(JSON.stringify(envelope)).drafts,drafts,'no loss of score, text or stored audio data');
  assert.deepEqual(envelope.drafts,drafts,'original drafts unchanged');
  assert.equal(makeQaDraftBackupFilename('qa.owner',at),'QA_Private_Draft_Backup_qa_owner_20261110T120000Z.json');
  assert.throws(()=>makeQaDraftBackup([], 'qa.owner',at),/Draft/);
  assert.throws(()=>makeQaDraftBackup(drafts,'',at),/ผู้ใช้งาน/);
  const component=await fs.readFile(new URL('../src/CreateEvaluationMockup.tsx',import.meta.url),'utf8');
  for(const marker of ['backupAllLocalDrafts','exportAllLocalDraftsExcel','Backup Draft JSON','Export Draft Excel','LOCAL DRAFT — NOT SUBMITTED','readDraftQueue<EvaluationDraft>()']){
    assert.ok(component.includes(marker),'emergency export UI missing: '+marker);
  }
  // The save-draft flow stays browser-only. An emergency export must never
  // silently convert a local draft into an official submitted QA score.
  assert.ok(component.includes('await writeDraftQueue(sortedDrafts)'));
  assert.ok(!source.includes('fetch(') && !source.includes('firestore'),'backup envelope must be offline');
  console.log('PASS: emergency QA Draft backup preserves score/topic/audio data and local-only UI export is wired');
} finally { await fs.unlink(tmp).catch(()=>{}); }
