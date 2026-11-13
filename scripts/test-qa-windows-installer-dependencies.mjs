import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=async p=>readFile(resolve(root,p),'utf8');
const launcher=await read('scripts/Start-QA-Standby-From-Existing.ps1');
const source=await read('scripts/Run-QA-Local-Source-Snapshot.ps1');
const names=['qaLocalBridgeServer.js','qaStandbyArchiveStatus.js','qaStandbySnapshotReadiness.js','qaLiveMirrorStage.js'];
for(const name of names)assert.ok(launcher.includes("'"+name+"'"),'Windows bridge missing '+name);
const stagePaths=[
  'scripts/Run-QA-Authoritative-Snapshot-Stage.mjs',
  'scripts/check-qa-source-stage-preflight.mjs',
  'server/qaLocalBridgeServer.js',
  'server/qaStandbyArchiveStatus.js',
  'server/qaStandbySnapshotReadiness.js',
  'server/qaFirestoreRestSnapshot.js',
  'server/qaLiveMirrorStage.js',
  'server/qaStandbyCandidateMaterializer.js',
  'server/qaFirestoreSnapshotCodec.js',
  'migration/qa-local-live-snapshot-stage.sql',
];
for(const path of stagePaths)assert.ok(source.includes("'"+path+"'"),'stage installer missing '+path);
async function closure(path,allowed,seen=new Set()){
  if(seen.has(path))return; seen.add(path);
  const body=await read(path);
  const re=/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;
  for(const match of body.matchAll(re)){
    const spec=match[1]||match[2];
    if(!spec.startsWith('.'))continue;
    const dependency=relative(root,resolve(dirname(resolve(root,path)),spec)).replaceAll('\\','/');
    assert.ok(allowed.includes(dependency),path+' missing local import '+dependency);
    await closure(dependency,allowed,seen);
  }
}
await closure('server/qaLocalBridgeServer.js',names.map(x=>'server/'+x));
// The installed Windows launcher stays PINNED to the previous fully-reviewed
// runner; its existing file list and hash MUST remain unchanged. The NEW
// daily-budget importer has one additional module and will require a separate
// reviewed Windows installer after the additive SQL ledger migration.
await closure('scripts/Run-QA-Authoritative-Snapshot-Stage.mjs',
  [...stagePaths,'server/qaSourceReadBudget.js']);
await closure('scripts/check-qa-source-stage-preflight.mjs',stagePaths);
assert.match(launcher,/\$repoCommit\s*=\s*'[a-f0-9]{40}'/);
assert.match(source,/\$pinnedCommit\s*=\s*'[a-f0-9]{40}'/);
assert.match(source,/\$gcloudExit\s*=\s*\$LASTEXITCODE/);
assert.match(source,/\$rawToken\s*=\s*\@\(\& \$gcloud\.Source/);
console.log('PASS QA Windows installers: complete pinned local import dependency closure');
