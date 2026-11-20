import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { currentMonthIncentiveDocuments, requireCurrentMonthIncentiveDocuments } from "../src/lib/monthlyIncentiveExportScope.mjs";
import { shiftPaymentMonth } from "../src/lib/paymentCarryOverCycle.mjs";
const october=[["Chachiya",700],["Chatkonnaphat",1000],["Jureeporn",1000],
 ["Krivut",1000],["Natcha",1000],["Sompartana",1000],["Sunijtra",1000],
 ["Suphitcha",700],["Warrathanun",500]].map(([agentName,amount])=>({
  id:"2026-10::"+agentName,agentName,monthKey:"2026-10",caseCount:10,amount}));
const may=[["Anucha",500],["Krivut",1000],["Nattapol",500],["Suphitcha",700]]
  .map(([agentName,amount])=>({id:"2026-05::"+agentName,agentName,monthKey:"2026-05",
     caseCount:10,amount,carryOverFrom:"2026-05",paymentCycle:"2026-10"}));
const mixed=[...october,...may];
const normal=currentMonthIncentiveDocuments("2026-10",mixed);
assert.equal(normal.length,9);
assert.equal(normal.reduce((n,row)=>n+row.amount,0),7900);
assert.equal(normal.reduce((n,row)=>n+row.caseCount,0),90);
assert.throws(()=>requireCurrentMonthIncentiveDocuments("2026-10",mixed),/เอกสารต่างเดือน/);
assert.equal(requireCurrentMonthIncentiveDocuments("2026-10",october).length,9);
assert.equal(shiftPaymentMonth("2026-10",-1),"2026-09");
assert.equal(shiftPaymentMonth("2026-11",-1),"2026-10");
const src=await readFile(new URL("../src/SignatureCenterMockup.tsx",import.meta.url),"utf8");
const rendered=await readFile(new URL("../build/signaturePaymentPdfPatch.js",import.meta.url),"utf8");
assert.ok(src.includes("return currentMonthIncentiveDocuments(selectedMonth, selectedMonthExportDocs)"));
assert.ok(!src.includes("return [...selectedMonthExportDocs, ...selectedMonthCarryOverDocs]"));
assert.ok(src.includes("doc.monthKey === shiftPaymentMonth(selectedMonth, -1)"));
assert.ok(src.includes("requireCurrentMonthIncentiveDocuments(selectedMonth, selectedMonthPaymentExportDocs)"));
assert.ok(src.includes("const monthDocs = currentMonthIncentiveDocuments(monthKey, allMonthDocs)"));
assert.ok(src.includes("const sortedDocs = [...requireCurrentMonthIncentiveDocuments(monthKey, readyDocs)]"));
assert.ok(rendered.includes("const sortedDocs = [...requireCurrentMonthIncentiveDocuments(monthKey, readyDocs)]"));
console.log("PASS monthly incentive scope: October only, 9 rows/7900 THB, no May bleed, correct Team Cases/average and separate prior-month carry-over");
