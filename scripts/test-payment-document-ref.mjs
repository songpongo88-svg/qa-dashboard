import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import ts from "typescript";
import { JSDOM } from "jsdom";
import viteConfig from "../vite.config.js";
import { signatureDocumentRefMatchWebPatch } from "../build/signatureDocumentRefMatchWebPatch.js";

const temp = await mkdtemp(resolve(".payment-document-ref-test-"));
const dom = new JSDOM("<html><body></body></html>", { url: "https://fixture.test/" });
for (const key of ["window", "document", "navigator", "HTMLElement", "Node"]) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
}
window.setTimeout = () => 0;
const fixture = globalThis.__paymentRefFixture = { texts: [], files: [], workbook: null, pdf: null, errors: [], marked: [] };
dom.window.HTMLAnchorElement.prototype.click = function () {
  fixture.files.push(this.download);
};
const inputPath = resolve("src/SignatureCenterMockup.tsx");
const raw = await readFile(inputPath, "utf8");
const refPatch = signatureDocumentRefMatchWebPatch();
for (const variable of ["eligible", "selectedMonthPaymentExportDocs", "freshPaymentDocs"]) {
  const legacy = raw.replace(/eligible, signatures, documents/g, variable + ", signatures, selectedMonthAllDocs");
  const repaired = refPatch.transform(legacy, inputPath)?.code || legacy;
  assert.equal((repaired.match(new RegExp(variable + ", signatures, documents", "g")) || []).length, 2);
}
assert.throws(() => refPatch.transform(raw.replace(/eligible, signatures, documents/g, "eligible, signatures, unknownReferenceSource"), inputPath), /same documents collection/);

function exportHandler(source, name) {
  const ast = ts.createSourceFile(inputPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(found, "Actual payment handler found: " + name);
  return found;
}

try {
  // Run the production prebuild that also inserts carry-over export bookkeeping.
  await mkdir(resolve(temp, "src"));
  await mkdir(resolve(temp, "scripts"));
  await writeFile(resolve(temp, "src/SignatureCenterMockup.tsx"), raw);
  const carryOverPatch = resolve(temp, "scripts/patch-signature-late-carryover-v90.mjs");
  await writeFile(carryOverPatch, await readFile(resolve("scripts/patch-signature-late-carryover-v90.mjs"), "utf8"));
  execFileSync(process.execPath, [carryOverPatch], { stdio: "pipe" });
  const prepared = await readFile(resolve(temp, "src/SignatureCenterMockup.tsx"), "utf8");
  const output = resolve(temp, "payment.mjs");
  await build({ entryPoints: [inputPath], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external",
    jsx: "automatic", define: { "import.meta.env": "{}" }, logLevel: "silent",
    plugins: [{ name: "real-payment-exports", setup(builder) {
      // Export rendering has no database dependency; avoid initializing a signed-in service.
      builder.onLoad({ filter: /\/firebaseClient\.ts$/ }, () => ({ loader: "js", contents: "export const firebaseApp=null,firebaseAuth=null,firebaseDb=null;" }));
      builder.onLoad({ filter: /\/PageHero\.tsx$/ }, () => ({ loader: "js", contents: "export default function PageHero(){return null}" }));
      builder.onResolve({ filter: /^(jspdf|xlsx)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents: args.path === "jspdf" ? `
        import {createRequire} from 'node:module';const {jsPDF:RealPdf}=createRequire(import.meta.url)('jspdf');
        export class jsPDF extends RealPdf {constructor(...args){super(...args);const text=this.text.bind(this);this.text=(value,...rest)=>{globalThis.__paymentRefFixture.texts.push(value);return text(value,...rest)};this.save=name=>{globalThis.__paymentRefFixture.files.push(name)};globalThis.__paymentRefFixture.pdf=this;}}
      ` : `
        import {createRequire} from 'node:module';const xlsx=createRequire(import.meta.url)('xlsx');
        export const utils=xlsx.utils,SSF=xlsx.SSF,read=xlsx.read,write=xlsx.write;
        export function writeFile(book,name){globalThis.__paymentRefFixture.workbook=book;globalThis.__paymentRefFixture.files.push(name)};
      ` }));
      builder.onLoad({ filter: /\/SignatureCenterMockup\.tsx$/ }, async () => {
        let source = prepared;
        for (const plugin of viteConfig.plugins.flat().filter(plugin => /^signature-/.test(plugin.name))) {
          const result = await plugin.transform?.(source, inputPath);
          if (result) source = typeof result === "string" ? result : result.code;
        }
        const excel = exportHandler(source, "generatePaymentExcel");
        const pdf = exportHandler(source, "generatePaymentPdf");
        source = source.replace("export default function SignatureCenterMockup", "function SignatureCenterMockup");
        return { loader: "tsx", contents: source + `
          export {getMonthlyDocumentRef,getDocumentIncentive};
          export async function runExport(kind,monthKey,referenceDocs,eligibleDocs,signatureEntries){
            const currentUser={role:'Quality Assurance'},selectedMonth=monthKey,documents=referenceDocs;
            const selectedMonthAllDocs=documents.filter(doc=>doc.monthKey===monthKey),selectedMonthPaymentExportDocs=eligibleDocs,signatures=signatureEntries;
            const paymentDocumentsForExport=async()=>eligibleDocs,setPaymentMessage=message=>globalThis.__paymentRefFixture.errors.push(message);
            const markCurrentCarryOversExported=async docs=>globalThis.__paymentRefFixture.marked.push(docs.map(doc=>doc.id));
            const generatePaymentExcel=${excel};const generatePaymentPdf=${pdf};
            await(kind==='pdf'?generatePaymentPdf():generatePaymentExcel());
          }
        ` };
      });
    } }] });
  const app = await import(pathToFileURL(output).href);
  const XLSX = await import("xlsx");
  const roles = ["Agent", "Senior", "Supervisor", "QA"];
  const allDocs = Array.from({ length: 12 }, (_, index) => {
    const monthKey = `2026-${String(index + 1).padStart(2, "0")}`;
    return ["A", "B", "C"].map((slot, position) => {
      const auditDate = monthKey + "-" + ["28", "22", "20"][position];
      const agentName = "Fixture Agent " + slot;
      return { id: monthKey + "::" + agentName, monthKey, monthLabel: monthKey, agentName, documentHash: monthKey + "-" + slot,
        caseCount: 10, averageScore: 90 + position, grade: "A", eligibleByScore: true,
        cases: Array.from({ length: 10 }, (_, i) => ({ caseId: `FIX-${index}-${slot}-${i}`, auditDate, finalScore: 90 + position, topics: [] })) };
    });
  }).flat().reverse();
  const earlier = { ...allDocs[0], id: "2025-12::Earlier Fixture", monthKey: "2025-12", agentName: "Earlier Fixture", cases: [{ caseId: "FIX-EARLIER", auditDate: "2025-12-20", finalScore: 91 }] };
  allDocs.push(earlier);
  const signatures = Object.fromEntries(allDocs.map(doc => [doc.id, roles.map(role => ({ role, signerName: "Fixture " + role, signedBy: "Fixture " + role, status: "Signed", signedAt: doc.monthKey + "-28T03:00:00Z" }))]));
  const expectedRef = (month, slot) => String(month).padStart(2, "0") + "2026" + String(1 + (month - 1) * 3 + (slot === "A" ? 3 : 1)).padStart(5, "0");

  for (let month = 1; month <= 12; month++) {
    const monthKey = `2026-${String(month).padStart(2, "0")}`;
    const eligible = allDocs.filter(doc => doc.monthKey === monthKey && doc.agentName !== "Fixture Agent B");
    const refs = [expectedRef(month, "A"), expectedRef(month, "C")];
    for (const doc of eligible) assert.equal(app.getMonthlyDocumentRef(doc, allDocs), expectedRef(month, doc.agentName.endsWith("A") ? "A" : "C"), "UI reference is global and independent of payment eligibility");
    fixture.texts = []; fixture.files = []; fixture.errors = [];
    await app.runExport("pdf", monthKey, allDocs, eligible, signatures);
    assert.equal(fixture.files.length, 1, "Real PDF handler completed: " + monthKey + " / " + JSON.stringify({ messages: fixture.errors, texts: fixture.texts.length, pdf: Boolean(fixture.pdf) }));
    const texts = fixture.texts.flat(Infinity).map(String);
    assert.deepEqual(texts.filter(value => /^\d{11}$/.test(value)), refs, "PDF uses exact UI refs: " + monthKey);
    const teamIndex = texts.indexOf("Team Cases");
    assert.equal(texts[teamIndex + 1], "30", "Team total stays in selected month");
    const paidIndex = texts.indexOf("Paid Agents");
    assert.equal(texts[paidIndex + 1], "2", "Only eligible agents appear in payment");
    assert.ok(!texts.includes("Fixture Agent B") && !texts.includes("Earlier Fixture"), "Reference universe does not add unpaid or other-month rows");
    if (process.env.PAYMENT_REF_CHECK_DIR && [1, 9, 10].includes(month)) {
      await mkdir(process.env.PAYMENT_REF_CHECK_DIR, { recursive: true });
      await writeFile(resolve(process.env.PAYMENT_REF_CHECK_DIR, `payment-${monthKey}.pdf`), new Uint8Array(fixture.pdf.output("arraybuffer")));
    }
    fixture.files = []; fixture.errors = [];
    await app.runExport("excel", monthKey, allDocs, eligible, signatures);
    assert.equal(fixture.files.length, 1, "Real Excel handler completed: " + monthKey);
    const rows = XLSX.utils.sheet_to_json(fixture.workbook.Sheets.Monthly_Team_Summary, { header: 1, defval: null });
    const header = rows.findIndex(row => row[0] === "Seq" && row.includes("Document Ref."));
    assert.deepEqual(rows.slice(header + 1, header + 3).map(row => row[6]), refs, "Excel uses exact UI refs and preserves leading zeros: " + monthKey);
    assert.equal(rows.find(row => row[0] === "Month")[7], 30, "Excel team total stays in selected month");
    assert.deepEqual(XLSX.utils.sheet_to_json(fixture.workbook.Sheets.Payment_Cycle_Detail).map(row => row["Document Ref."]), refs, "Carry-over detail worksheet uses the same references");
  }
  const carry = { ...allDocs.find(doc => doc.monthKey === "2026-09" && doc.agentName === "Fixture Agent A"), paymentCycle: "2026-10", carryOverFrom: "2026-09", paymentStatus: "Carry Over" };
  const october = allDocs.filter(doc => doc.monthKey === "2026-10" && doc.agentName !== "Fixture Agent B");
  const paid = [...october, carry];
  const carryRefs = [expectedRef(10, "A"), expectedRef(9, "A"), expectedRef(10, "C")];
  for (const kind of ["pdf", "excel"]) {
    fixture.texts = []; fixture.files = []; fixture.errors = []; fixture.marked = [];
    await app.runExport(kind, "2026-10", allDocs, paid, signatures);
    assert.equal(fixture.files.length, 1, "Carry-over " + kind + " handler completes");
    assert.deepEqual(fixture.marked, [paid.map(doc => doc.id)], "Production export still records carry-over state after download");
    if (kind === "pdf") {
      const texts = fixture.texts.flat(Infinity).map(String);
      assert.deepEqual(texts.filter(value => /^\d{11}$/.test(value)), carryRefs, "Carry-over PDF preserves original performance-month reference");
      assert.equal(texts[texts.indexOf("Team Cases") + 1], "30", "Carry-over PDF team summary stays in October");
      assert.equal(texts[texts.indexOf("Paid Agents") + 1], "3", "Carry-over remains in paid rows");
    } else {
      const rows = XLSX.utils.sheet_to_json(fixture.workbook.Sheets.Payment_Cycle_Detail);
      assert.deepEqual(rows.map(row => row["Document Ref."]), carryRefs, "Carry-over Excel preserves UI references");
      assert.equal(rows[1]["Performance Month"], "2026-09");
      assert.equal(rows[1]["Payment Cycle"], "2026-10");
    }
  }
  console.log("PASS real UI export handlers, all 12 months, earlier year, filtered payment rows, chronological numbering, PDF/Excel parity, leading zeros and month-scoped totals");
  console.log("PASS production carry-over prebuild, original performance-month references and export bookkeeping");
  console.log("PASS build compatibility for refreshed/legacy eligibility variables and fail-fast on an unknown reference source");
} finally {
  dom.window.close();
  await rm(temp, { recursive: true, force: true });
  delete globalThis.__paymentRefFixture;
}
