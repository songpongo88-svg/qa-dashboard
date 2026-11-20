// Repo-wide, source-only QA Firestore writer audit. This script does not
// open Firestore, Supabase, Windows PostgreSQL, Google Billing or user data.
// A list of candidate writes is NOT proof that all source commits are covered.
import {fileURLToPath} from 'node:url';
import {discoverQaFirestoreWriters,REVIEWED_WRITERS}
 from './qa-firestore-writer-inventory.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const inventory=await discoverQaFirestoreWriters(root);
if(inventory.knownReviewedCollectionCount!==11)
 throw Error('qa_source_writer_inventory_count_changed');
const records=Object.entries(REVIEWED_WRITERS).map(([collection,paths])=>({
 collection,files:paths.map(path=>({
  path,candidateMutations:inventory.known.find(x=>
   x.collection===collection&&x.path===path)?.candidateMutations??0,
 })),
}));
const report={
 status:'BLOCKED',firebaseBillingRequired:false,
 guarantee:'NOT_PROVEN',
 reason:'direct_browser_firestore_writers_and_no_durable_committed_outbox',
 collectionCount:records.length,records,
 sourceFilesScanned:inventory.sourceFilesScanned,
 sourceFilesSkipped:inventory.filesSkipped,
 skippedPaths:inventory.skippedPaths,
 qaCollectionWriterLeads:inventory.unreviewed.filter(v=>v.possibleCollections.length>0),
 candidateFirestoreWriterFiles:inventory.writerFiles,
 additionalUnreviewedWriterFiles:inventory.unreviewed.length,
 additionalUnreviewedWriters:inventory.unreviewed,
 assertions:{
  eventarcProducerDeployed:false,
  trustedDurableWriteGateway:false,
  allWritesServerAuthorized:false,
  deleteAndLockParityCertified:false,
  full11DatasetParityCertified:false,
  windowsFailureRecoveryCertified:false,
  dynamicWriterCoverageProven:false,
 },
 firestoreReads:0,firestoreWrites:0,
 failoverEnabled:false,
};
if(process.argv.includes('--json'))console.log(JSON.stringify(report,null,2));
else{
 console.log('QA_NO_BILLING_SOURCE_WRITERS='+records.length);
 console.log('QA_NO_BILLING_FILES_SCANNED='+report.sourceFilesScanned);
 console.log('QA_NO_BILLING_ADDITIONAL_WRITER_LEADS='+report.additionalUnreviewedWriterFiles);
 console.log('QA_NO_BILLING_SOURCE_FILES_SKIPPED='+report.sourceFilesSkipped);
 console.log('QA_NO_BILLING_QA_COLLECTION_LEADS='+report.qaCollectionWriterLeads.length);
 console.log('QA_NO_BILLING_QA_LEAD_PATHS='+report.qaCollectionWriterLeads.slice(0,30).map(x=>x.path).join(','));
 console.log('QA_NO_BILLING_SKIPPED_PATHS='+report.skippedPaths.slice(0,10).join(','));
 console.log('QA_NO_BILLING_MIRROR_STATUS=BLOCKED');
 console.log('QA_NO_BILLING_GUARANTEE=NOT_PROVEN');
 console.log('QA_FIRESTORE_READS_BY_AUDIT=0');
 console.log('QA_FAILOVER=OFF');
}
