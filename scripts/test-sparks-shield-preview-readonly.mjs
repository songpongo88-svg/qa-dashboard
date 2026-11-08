import assert from "node:assert/strict";
import { createAnnouncementShieldService } from "../server/announcementShieldService.js";

// Test an OVERDUE active subscription, so a legacy state read would
// attempt to renew and debit 50 Sparks just by opening My Items.
// This is an offline test: no real Firebase/Supabase connection exists.
const oldMode=process.env.SPARKS_DATA_BACKEND;
const oldReadonly=process.env.SPARKS_CLOUD_READ_ONLY;
let networkCalls=0;
let reads=0;
const subscription={username:"synthetic-shield-test",status:"active",itemId:"safe-test-item",
  activatedAt:"2026-01-01T00:00:00.000Z",nextBillingAt:"2026-02-01T00:00:00.000Z",
  graceEndsAt:"",cancelledAt:"",lastAttemptDay:"",lastRenewalAt:""};
const service=createAnnouncementShieldService({
 firestoreRequest:async()=>{networkCalls++;throw new Error("TEST_LEGACY_RENEWAL_PATH_REACHED");},
 readDoc:async(path)=>{reads++;assert.equal(path,"qa_announcement_shield/synthetic-shield-test");return {data:subscription};},
 recordValue:s=>s?.data||{},
 path:(...segments)=>segments.join("/"),
 updateWrite:()=>{throw new Error("Unexpected state write");},
 createWrite:()=>{throw new Error("Unexpected history write");},
 listCollection:async()=>{throw new Error("Unexpected collection scan");},
 walletDocumentPath:()=>{throw new Error("Unexpected wallet mutation");},
 spendableBalance:()=>0,
 currentMemberYear:()=>2026,
});
try{
 process.env.SPARKS_DATA_BACKEND="supabase";
 process.env.SPARKS_CLOUD_READ_ONLY="1";
 const data=await service.state({username:"synthetic-shield-test"});
 assert.equal(data.status,"active");
 assert.equal(data.itemId,"safe-test-item");
 assert.equal(data.entitled,false,"expired time window cannot grant entitlement just by state read");
 assert.equal(reads,1,"only the Shield source snapshot may be read");
 assert.equal(networkCalls,0,"preview read must not start renewal, debit, or history commit");

 // Keep production behavior unchanged: the real Firebase handler still
 // executes its on-read settlement path for due subscriptions.
 process.env.SPARKS_DATA_BACKEND="firebase";
 await assert.rejects(service.state({username:"synthetic-shield-test"}),/TEST_LEGACY_RENEWAL_PATH_REACHED/);
 assert.equal(networkCalls,1,"Firebase production settlement must remain intact");
 console.log("PASS Announcement Shield: Supabase preview GET is side-effect free even when renewal is overdue");
}finally{
 if(oldMode===undefined)delete process.env.SPARKS_DATA_BACKEND;else process.env.SPARKS_DATA_BACKEND=oldMode;
 if(oldReadonly===undefined)delete process.env.SPARKS_CLOUD_READ_ONLY;else process.env.SPARKS_CLOUD_READ_ONLY=oldReadonly;
}
