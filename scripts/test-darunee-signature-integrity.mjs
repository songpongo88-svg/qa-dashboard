import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isDaruneeOctober, assignedMonthlySenior, isAssignedSeniorSignature } from "../src/lib/monthlySeniorAssignment.mjs";
import { pixelsContainSignatureInk } from "../src/lib/signatureInk.mjs";
import { carryOverCycle } from "../src/lib/paymentCarryOverCycle.mjs";

const row={monthKey:"2026-10",agentName:"Darunee Teparsa",seniorName:"PANOMCHAT SRIJAROENSOOK"};
assert.equal(isDaruneeOctober(row.monthKey,row.agentName),true);
assert.equal(assignedMonthlySenior(row.monthKey,row.agentName,row.seniorName),"Suphitcha Keawliam");
assert.equal(assignedMonthlySenior("2026-11",row.agentName,row.seniorName),row.seniorName);
assert.equal(assignedMonthlySenior(row.monthKey,"Other Agent",row.seniorName),row.seniorName);
assert.equal(isAssignedSeniorSignature(row,{signedBy:"PANOMCHAT SRIJAROENSOOK"}),false,
  "existing signature cannot be reassigned to the expected Senior");
assert.equal(isAssignedSeniorSignature(row,{signedBy:"Suphitcha Keawliam"}),true);
assert.equal(isAssignedSeniorSignature(row,null),false);
assert.equal(isAssignedSeniorSignature({...row,agentName:"Other Agent"},null),true);

const pixels=new Uint8ClampedArray(900*260*4);
assert.equal(pixelsContainSignatureInk(pixels),false,"all-transparent Agent PDF PNG has no ink");
for(let i=0;i<8;i++){let k=i*4;pixels[k]=18;pixels[k+1]=18;pixels[k+2]=18;pixels[k+3]=255;}
assert.equal(pixelsContainSignatureInk(pixels),true,"visible dark stroke is valid");
const white=new Uint8ClampedArray(900*260*4).fill(255);
assert.equal(pixelsContainSignatureInk(white),false,"opaque white background alone is not a signature");

assert.equal(carryOverCycle("2026-10","2026-11-15T16:59:59Z"),"",
  "within October signature cutoff stays in original cycle");
assert.equal(carryOverCycle("2026-10","2026-11-20T03:00:00Z"),"2026-11",
  "after November 15 signing belongs to the November payment cycle");
assert.equal(carryOverCycle("2026-10","2026-12-16T02:00:00Z"),"2026-12",
  "completion after November cycle cutoff shifts one further cycle");
assert.equal(carryOverCycle("2026-10","2026-11-13T02:00:00Z","2026-11-18T01:00:00Z"),"2026-11",
  "late coaching completion also delays payment");
assert.equal(carryOverCycle("2026-10",""),"","missing signature never enters payment");

const src=await readFile(new URL("../src/SignatureCenterMockup.tsx",import.meta.url),"utf8");
const pdf=await readFile(new URL("../src/finalSignedPdfRenderer.ts",import.meta.url),"utf8");
const signatures=await readFile(new URL("../src/signatureStore.ts",import.meta.url),"utf8");
const batch=await readFile(new URL("../src/monthlyPaymentBatchStore.ts",import.meta.url),"utf8");
const patch=await readFile(new URL("../build/signaturePaymentPdfPatch.js",import.meta.url),"utf8");
assert.ok(src.includes("assignedMonthlySenior(monthKey, agentName"),"monthly senior comes from verified assignment");
assert.ok(src.includes("canvasContainsSignatureInk(canvas)"),"drawing must have visible strokes");
assert.ok(src.includes("!await signatureImageContainsInk(signatureDataUrl"),"saved PNG cannot be blank");
assert.ok(src.includes("const selectedMonthCarryOverDocs = useMemo("),"late signatures appear in next-cycle export");
assert.ok(src.includes("lateSignaturePaymentCycle(doc, entries, records) === selectedMonth"),"fresh coaching recheck before payout");
assert.ok(src.includes("sourceBatch?.confirmedSentAt && priorIds.includes(doc.id)"),"actually-sent earlier payments block duplicates");
assert.ok(src.includes("previousSignerEvidence"),"prior signer metadata survives QA reset");
assert.ok(pdf.includes("verifiedSignatureImage"),"PDF does not claim all signed based on timestamps alone");
assert.ok(pdf.includes("isAssignedSeniorSignature(selectedDocument, signed)"),"Senior image is not attributed to a different person");
assert.ok(signatures.includes("previousSignerEvidence"),"Firestore preserves signer audit evidence");
assert.ok(batch.includes("fetchMonthlyPaymentBatch"),"confirmed payment history is checked");
assert.ok(patch.includes("doc.carryOverFrom ?"),"PDF labels carry-over rows");
console.log("PASS Darunee 2026-10 Senior / blank signature / true-time re-sign / November carry-over / sent-ledger guard");
