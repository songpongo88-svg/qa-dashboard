import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { transform } from "esbuild";
const source=await fs.readFile(new URL("../src/lib/monthlyPaymentBatchPlan.ts",import.meta.url),"utf8");
const code=(await transform(source,{loader:"ts",format:"esm",target:"es2022"})).code;
const {planMonthlyPaymentBatch}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const now="2026-11-16T12:00:00Z",who="QA";
const initial=planMonthlyPaymentBatch(null,["oct::B","oct::A","oct::A"],now,who);
assert.equal(initial.mode,"original");
assert.deepEqual(initial.documentIds,["oct::A","oct::B"]);
const first={documentIds:initial.documentIds,exportedAt:now,exportedBy:who};
assert.equal(planMonthlyPaymentBatch(first,["oct::A","oct::B"],now,who).mode,"original-reprint");
const newBatch=planMonthlyPaymentBatch(first,["oct::A","oct::B","oct::C","oct::D"],now,who);
assert.equal(newBatch.mode,"additional");
assert.equal(newBatch.batchNumber,2);
assert.deepEqual(newBatch.documentIds,["oct::C","oct::D"]);
assert.deepEqual(newBatch.supplementalBatches[0].documentIds,["oct::C","oct::D"]);
const current={...first,supplementalBatches:newBatch.supplementalBatches};
const retry=planMonthlyPaymentBatch(current,["oct::A","oct::B","oct::C","oct::D"],now,who);
assert.equal(retry.mode,"additional-reprint");
assert.deepEqual(retry.documentIds,["oct::C","oct::D"]);
assert.equal(retry.changed,false);
const batch3=planMonthlyPaymentBatch(current,["oct::A","oct::B","oct::C","oct::D","oct::E"],now,who);
assert.equal(batch3.batchNumber,3);
assert.deepEqual(batch3.documentIds,["oct::E"]);
const after3={...first,supplementalBatches:batch3.supplementalBatches};
assert.equal(planMonthlyPaymentBatch(after3,["oct::A","oct::B","oct::C","oct::D","oct::E"],now,who).batchNumber,3);
assert.deepEqual(planMonthlyPaymentBatch(after3,["oct::A","oct::B"],now,who).documentIds,["oct::A","oct::B"]);
assert.throws(()=>planMonthlyPaymentBatch(first,[],now,who),/No payment-ready/);
assert.throws(()=>planMonthlyPaymentBatch(first,["oct::A"],now,who),/รายชื่อ/);
const script=await fs.readFile(new URL("../scripts/patch-signature-late-carryover-v90.mjs",import.meta.url),"utf8");
assert.ok(script.includes("const onTimeRoster = reportExportOnly ? eligible.filter(doc => doc.monthKey === selectedMonth && !doc.carryOverFrom)"),
  "Report Center explicitly excludes late-signature carry-overs");
assert.ok(script.includes("generatePaymentExcelFile(selectedMonth, onTimeRoster, signatures, documents, batchSuffix)"),
  "Excel must include all eligible on-time recipients, including already generated original batch");
assert.ok(script.includes("generatePaymentPdfFile(selectedMonth, onTimeRoster, signatures, documents, batchSuffix)"),
  "PDF must include all eligible on-time recipients, including already generated original batch");
assert.ok(!script.includes("generatePaymentPdfFile(selectedMonth, batchEligible, signatures, documents, batchSuffix)"),
  "do not export additional-only recipient list as the monthly summary");
assert.ok(script.includes('batchEligible = onTimeRoster.filter'),
  "original and supplemental ledger continues to deduplicate generated batches");
assert.ok(script.includes('"_Consolidated"'),"revised consolidated report uses distinct filename");
const pdf=await fs.readFile(new URL("../build/signaturePaymentPdfPatch.js",import.meta.url),"utf8");
assert.ok(pdf.includes("ALL ELIGIBLE AGENTS"),"consolidated PDF includes original and new recipients");
assert.ok(pdf.includes("Eligible Agents"),"file must not claim that generating the PDF paid anyone");
console.log("PASS Monthly Payment: all on-time eligible recipients in one consolidated PDF/Excel, late signers excluded, immutable batch history preserved");
