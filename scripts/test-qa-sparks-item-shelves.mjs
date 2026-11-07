import assert from "node:assert/strict";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
const now=Date.parse("2026-11-07T06:00:00.000Z");
await mkdir(resolve("node_modules/.cache"),{recursive:true});
const folder=await mkdtemp(resolve("node_modules/.cache/item-status-"));
try{
 const outfile=resolve(folder,"items.mjs");
 await build({entryPoints:["src/qaSparksItemStatus.ts"],outfile,platform:"node",format:"esm",
   bundle:true,logLevel:"silent"});
 const {classifyTrueMoneyItem:tm,classifySpecialRewardItem:sr,classifyLotteryTicket:lottery}=
   await import(pathToFileURL(outfile).href);
 const later="2026-12-07T06:00:00.000Z",earlier="2026-11-06T06:00:00.000Z";
 assert.equal(tm({status:"unused",expiresAt:later},null,now),"available");
 assert.equal(tm({status:"unused",expiresAt:earlier},null,now),"history");
 assert.equal(tm({status:"requested",expiresAt:earlier},{status:"pending"},now),"processing",
  "request submitted before expiry stays pending after 30 days");
 assert.equal(tm({status:"requested",expiresAt:earlier},{status:"paid"},now),"history");
 assert.equal(sr({status:"unused",expiresAt:later},now),"available");
 assert.equal(sr({status:"unused",expiresAt:earlier},now),"history");
 for(const status of ["activated","submitted","approved"]){
   assert.equal(sr({status,expiresAt:earlier},now),"processing",status);
 }
 for(const status of ["paid","delivered","rejected","completed","expired"]){
   assert.equal(sr({status,expiresAt:later},now),"history",status);
 }
 assert.equal(lottery({paidAt:null,status:"pending"}),"processing");
 assert.equal(lottery({paidAt:"2026-11-01T11:00:00Z",status:"checked"}),"history");
 assert.equal(lottery({status:"checked"}),"history");
 // No physical item or transaction is removed: only its category changes.
 console.log("PASS My Items shelf classification: unused, expiry, pending payout, finished, rejected and lottery results");
}finally{await rm(folder,{recursive:true,force:true});}
