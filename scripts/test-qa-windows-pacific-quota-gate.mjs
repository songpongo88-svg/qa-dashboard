import assert from 'node:assert/strict';
import {mkdtemp,writeFile,utimes,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertQaDifferentPacificScanDay}
 from './Run-QA-Windows-Reconciliation.mjs';
const root=await mkdtemp(join(tmpdir(),'qa-firestore-pacific-'));
try{
 const old=join(root,'.qa-parity-attempt-20261114');
 await writeFile(old,'');
 const oldAt=new Date('2026-11-14T14:00:00Z');
 await utimes(old,oldAt,oldAt);
 // At 07:00 Bangkok on Nov 15 the UTC day has changed but
 // Firestore's Pacific quota day is STILL Nov 14. Never scan yet.
 await assert.rejects(assertQaDifferentPacificScanDay({
  stageRoot:root,at:new Date('2026-11-15T00:00:00Z'),
 }),/qa_candidate_previous_scan_same_pacific_day/);
 // At 01:00 PST the reset is only approximate; wait an extra hour.
 await assert.rejects(assertQaDifferentPacificScanDay({
  stageRoot:root,at:new Date('2026-11-15T09:00:00Z'),
 }),/qa_candidate_provider_reset_not_stable/);
 // 02:00 PST next day: old scan no longer same provider day.
 await assertQaDifferentPacificScanDay({
  stageRoot:root,at:new Date('2026-11-15T10:00:00Z'),
 });
 // Another candidate marked Nov15 PST must block further scans that day.
 const today=join(root,'.qa-reconcile-attempt-20261115');
 await writeFile(today,'');
 const todayAt=new Date('2026-11-15T10:00:00Z');
 await utimes(today,todayAt,todayAt);
 await assert.rejects(assertQaDifferentPacificScanDay({
  stageRoot:root,at:new Date('2026-11-15T11:00:00Z'),
 }),/qa_candidate_previous_scan_same_pacific_day/);
 console.log('PASS Pacific-day Firestore quota scan gate: cross-UTC protection, 2-hour cushion, local attempt markers');
}finally{await rm(root,{recursive:true,force:true});}
