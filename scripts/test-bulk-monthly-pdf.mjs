import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { finalSignedPdfDateFormatPatch } from "../build/finalSignedPdfDateFormatPatch.js";

// Exercise the export after the production patch chain, including the real
// Signature Center source loader, Case Detail renderer and signature renderer.
// Only data stores are replaced. No test can write to Firebase.
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(resolve(root, ".bulk-pdf-test-"));
const output = process.argv.find((arg) => arg.startsWith("--output-dir="))?.slice(13);
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4XmNgYGD4D8IABgMB/7I8x4cAAAAASUVORK5CYII=";
const roles = ["Agent", "Senior", "Supervisor", "QA"];
const names = { Agent: "Test Agent Chai-in", Senior: "Test Senior", Supervisor: "Test Supervisor", QA: "Test QA" };
const signatureStore = `
  export async function fetchStoredSignatureDocuments() {
    const fixture = globalThis.__monthlyPdfFixture;
    fixture.signatureReads++;
    if (fixture.signatureError) throw new Error("Signature read unavailable");
    return fixture.signatures;
  }
  export const fetchStoredSignatureLibraryEntry = async () => "";
  const noWrite = async () => { throw new Error("Test attempted a signature write"); };
  export { noWrite as clearStoredSignatureConfirm, noWrite as deleteStoredSignatureLibraryEntry,
    noWrite as saveStoredSignatureConfirm, noWrite as saveStoredSignatureDocument,
    noWrite as saveStoredSignatureLibraryEntry };
`;
const stubs = {
  signatureStore,
  coachingStore: `export const fetchStoredCoachingRecords = async () => globalThis.__monthlyPdfFixture.coaching;`,
  evaluationStore: `export const fetchStoredEvaluations = async () => globalThis.__monthlyPdfFixture.evaluations;
    export const excludeTestEvaluations = (rows) => rows;`,
  appealStore: `export const fetchAppealEvents = async () => [];`,
  AppealRequestsMockup: `export default () => null; export const buildAppealRequests = () => [];`,
  jspdf: `import { jsPDF as RealPdf } from "jspdf";
    export class jsPDF extends RealPdf {
      constructor(...args) {
        super(...args);
        const calls = [];
        this.fixtureCalls = calls;
        globalThis.__monthlyPdfFixture.pdfs.push(this);
        for (const method of ["text", "rect", "line", "addImage"]) {
          const original = this[method].bind(this);
          this[method] = (...values) => {
            calls.push({ method, values, page: this.getCurrentPageInfo().pageNumber, fill: this.getFillColor() });
            return original(...values);
          };
        }
      }
    }`,
};

function fixtures(monthKey = "2026-09", agent = names.Agent) {
  const ids = ["AA296725", "AA296591", "AA297285", "AA298421", "AA303077", "AA306300", "AA307160, AA307176", "AA312498", "AA314571", "AA315254"];
  return ids.map((caseId, index) => ({
    id: `fixture-${index}`, caseId, agent, agentName: agent, monthKey,
    monthLabel: monthKey === "2026-09" ? "September 2026" : "August 2026",
    auditDate: `${monthKey}-${String(index < 2 ? 6 : index + 6).padStart(2, "0")}`,
    caseDate: `${monthKey}-${String(index < 2 ? 6 : index + 6).padStart(2, "0")}`,
    inquiry: "Fixture inquiry", inquiryTh: "กรณีทดสอบการเรียงหน้า", teamName: "Fixture Team",
    rawDataPreview: { Senior: names.Senior, Supervisor: names.Supervisor, Team: "Fixture Team" },
    evaluatorName: names.QA, finalScore: 88, grade: "B",
    topics: [30, 20, 25, 25].map((max, topic) => ({ code: String(topic + 1), title: `หัวข้อทดสอบ ${topic + 1}`, max, score: max - 3, comment: "รายละเอียดทดสอบ", issueTags: topic === 0 ? ["เกิน SLA"] : [] })),
  }));
}

function coaching(agent = names.Agent, long = false) {
  return { id: "coaching-fixture", agent, monthKey: "2026-09", monthLabel: "September 2026",
    updatedAt: "2026-10-05T08:00:00Z", coachName: names.Senior,
    appointment: { date: "2026-10-05", startTime: "16:00", duration: 60, method: "Face to Face", participants: [agent, names.Senior], agenda: ["ทบทวน Process", "ติดตาม Action Plan"] },
    qaSummary: long ? Array.from({ length: 150 }, (_, index) => `บันทึก Coaching ลำดับ ${index + 1}: ตรวจสอบขั้นตอนก่อนให้ข้อมูล`).join("\n") : "ทบทวนขั้นตอนและตรวจสอบข้อมูลก่อนดำเนินการ",
    recommendedTopics: ["ขั้นตอนการทำงานและนโยบาย"], actions: [],
  };
}

function signedDocument(agent = "test agent chai in", monthKey = "2026-09") {
  return { docId: `${monthKey}::${agent}`, updatedAt: "2026-10-12T08:00:00Z",
    entries: roles.map((role) => ({ role, signerName: names[role], signedBy: names[role], status: "Signed", signedAt: "2026-10-12T04:29:00Z", signatureDataUrl: pixel })) };
}

const textCalls = (pdf) => pdf.fixtureCalls.filter((call) => call.method === "text")
  .map((call) => ({ ...call, value: String(call.values[0]), x: call.values[1], y: call.values[2] }));

try {
  for (const directory of ["src", "scripts", "build", "public", "docs", "api"]) await cp(resolve(root, directory), resolve(temporary, directory), { recursive: true });
  for (const file of ["package.json", "package-lock.json", "vite.config.js", "index.html"]) await cp(resolve(root, file), resolve(temporary, file));
  await symlink(resolve(root, "node_modules"), resolve(temporary, "node_modules"));
  const pkg = JSON.parse(await readFile(resolve(temporary, "package.json"), "utf8"));
  // Guide review applies to committed source; the disposable test copy is
  // deliberately transformed just as prebuild transforms the production copy.
  const patchChain = pkg.scripts.prebuild.replace(/^npm run guide:check && /, "");
  execFileSync("bash", ["-c", patchChain], { cwd: temporary, stdio: "pipe", maxBuffer: 5_000_000 });
  execFileSync(process.execPath, ["scripts/patch-case-pdf-page-numbers-v7.mjs"], { cwd: temporary, stdio: "pipe" });
  execFileSync(process.execPath, ["scripts/patch-evaluate-workspace-edit-tabs-v85.mjs"], { cwd: temporary, stdio: "pipe", maxBuffer: 5_000_000 });
  for (const file of ["src/finalSignedPdfRenderer.ts", "src/finalSignedCasePdf.ts", "src/bulkCaseDetailPdf.ts", "src/SignatureCenterMockup.tsx"]) {
    const first = await readFile(resolve(temporary, file), "utf8");
    execFileSync(process.execPath, ["scripts/patch-bulk-case-pdf-section-order-v14.mjs"], { cwd: temporary, stdio: "pipe" });
    assert.equal(await readFile(resolve(temporary, file), "utf8"), first, `patch is idempotent: ${file}`);
  }
  const entry = resolve(temporary, "export-entry.ts");
  await writeFile(entry, `export { generateBulkCaseDetailPdf } from "./src/bulkCaseDetailPdf";\nexport { renderFinalSignedPdf } from "./src/finalSignedPdfRenderer";\nexport { loadSignatureCenterFinalSignedSource } from "./src/SignatureCenterMockup";`);
  const bundle = resolve(temporary, "export.mjs");
  await build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent", define: { "window.setTimeout": "globalThis.setTimeout" }, plugins: [{
    name: "read-only-pdf-fixtures",
    setup(builder) {
      builder.onResolve({ filter: /(?:^|\/)(signatureStore|coachingStore|evaluationStore|appealStore|AppealRequestsMockup|jspdf)$/ }, (args) => {
        if (args.namespace === "pdf-fixture") return { path: args.path, external: true };
        const key = args.path.split("/").pop();
        return { path: key, namespace: "pdf-fixture" };
      });
      builder.onLoad({ filter: /.*/, namespace: "pdf-fixture" }, ({ path }) => ({ contents: stubs[path], loader: "js" }));
      builder.onLoad({ filter: /finalSignedPdfRenderer\.ts$/ }, async ({ path }) => {
        const code = await readFile(path, "utf8");
        const result = finalSignedPdfDateFormatPatch().transform(code, path);
        return { contents: result?.code || code, loader: "ts", resolveDir: dirname(path) };
      });
    },
  }] });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  try {
    for (const scenario of [
      { label: "signed-name-variants", signatures: [signedDocument()], coaching: [coaching()], expectedSigned: 4 },
      { label: "pending-signatures", signatures: [], coaching: [coaching()], expectedSigned: 0 },
      { label: "coaching-pagination", signatures: [signedDocument()], coaching: [coaching(names.Agent, true)], expectedSigned: 4 },
      { label: "without-coaching", signatures: [signedDocument()], coaching: [], expectedSigned: 4 },
      { label: "reset-signature", signatures: [signedDocument(), { ...signedDocument(names.Agent), updatedAt: "2026-10-13T08:00:00Z", entries: [{ role: "QA", signerName: names.QA, status: "Pending", signedAt: "", signedBy: "", resetAt: "2026-10-13T08:00:00Z" }] }], coaching: [], expectedSigned: 3 },
      { label: "august-unchanged", monthKey: "2026-08", signatures: [signedDocument("test agent chai in", "2026-08")], coaching: [coaching()], expectedSigned: 4 },
      { label: "weekly-unchanged", signatures: [signedDocument()], coaching: [coaching()], expectedSigned: 0, weekLabel: "Week 1" },
      { label: "signature-read-failure", signatures: [], coaching: [], signatureError: true },
    ]) {
      const monthKey = scenario.monthKey || "2026-09";
      const evaluations = fixtures(monthKey);
      const fixture = globalThis.__monthlyPdfFixture = { ...scenario, evaluations, signatureReads: 0, pdfs: [] };
      // A fresh renderer import prevents a different fixture's Coaching cache
      // from being reused. Production still caches within a single export.
      const { generateBulkCaseDetailPdf, renderFinalSignedPdf, loadSignatureCenterFinalSignedSource } = await import(`${pathToFileURL(bundle).href}?fixture=${scenario.label}`);
      const input = { cases: [...evaluations].reverse(), monthKey, weekLabel: scenario.weekLabel || "" };
      if (scenario.signatureError) {
        await assert.rejects(generateBulkCaseDetailPdf(input), /Signature read unavailable/);
        console.log(`PASS ${scenario.label}: export reports failure instead of losing signatures`);
        continue;
      }
      const result = await generateBulkCaseDetailPdf(input);
      const pdf = fixture.pdfs[0];
      const text = textCalls(pdf);
      const monthly = text.find((call) => call.value === "Monthly QA Dashboard");
      const acknowledgements = text.filter((call) => call.value === "Acknowledgement / Signature");
      const caseHeadings = text.filter((call) => call.value === "Case Detail");
      assert.equal(result.caseCount, 10);
      assert.equal(caseHeadings.length, 10, "all cases retained");
      assert.equal(text.filter((call) => call.value.includes("Tag ที่พบปัญหา :")).length, 10, "Gen Case Detail includes the saved Tag row for each tagged case");
      assert.equal(text.filter((call) => call.value.includes("เกิน SLA")).length, 10, "saved Tag names appear once per case in the combined export");
      assert.equal(fixture.signatureReads, scenario.weekLabel ? 0 : 1, "one saved-signature snapshot per export");
      for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
        assert.ok(text.some((call) => call.page === page && !call.value.startsWith("Page ") && call.value !== "Robinhood Quality Assurance"), `no blank page ${page}`);
      }
      if (scenario.weekLabel) {
        assert.ok(!monthly && !acknowledgements.length);
        assert.ok(!text.some((call) => call.value.startsWith("Monthly Coaching")));
      } else {
        assert.equal(monthly.page, 1);
        assert.equal(acknowledgements.length, 1, "exactly one acknowledgement per Agent");
        const acknowledgement = acknowledgements[0];
        assert.equal(acknowledgement.page, 1, "signatures stay on the original monthly dashboard page");
        const topicHeading = text.find((call) => call.value === "Monthly Topic Performance");
        assert.ok(acknowledgement.y > topicHeading.y, "acknowledgement follows the monthly topic table");
        if (monthKey < "2026-09") {
          assert.ok(!text.some((call) => call.value.startsWith("Monthly Coaching")));
        } else {
          const coachingPages = text.filter((call) => call.value.startsWith("Monthly Coaching"));
          assert.equal(coachingPages.length > 0, !!scenario.coaching.length, "no empty coaching page");
          if (coachingPages.length) {
            assert.equal(coachingPages[0].page, 2, "coaching starts on a new page after dashboard");
            assert.equal(caseHeadings[0].page, coachingPages.at(-1).page + 1, "cases immediately follow all coaching pages");
          } else assert.equal(caseHeadings[0].page, 2);
          const detailIds = caseHeadings.map((heading) => text.find((call) => call.page === heading.page && evaluations.some((item) => item.caseId === call.value))?.value);
          assert.deepEqual(detailIds, evaluations.map((item) => item.caseId), "case sequence matches the monthly list, including equal dates and compound IDs");
        }
        const panels = pdf.fixtureCalls.filter((call) => call.method === "rect" && call.page === acknowledgement.page && call.fill.toLowerCase() === "#7030a0" && Math.abs(call.values[2] - 45) < 0.02);
        assert.equal(panels.length, 4, "all four signature blocks retained");
        assert.equal(new Set(panels.map((call) => call.values[1])).size, 1, "one horizontal signature row");
        assert.ok(panels.every((call) => call.values[1] + 23.2 <= 289), "signature row fits above the footer");
        const images = pdf.fixtureCalls.filter((call) => call.method === "addImage" && call.page === acknowledgement.page);
        assert.equal(images.length, scenario.expectedSigned, "stored signature images retained; pending roles stay unsigned");
        assert.ok(images.every((call) => call.values[0] === pixel), "original signature bytes preserved");
        for (const [index, role] of roles.entries()) {
          const center = panels[index].values[0] + panels[index].values[2] / 2;
          // Pending QA uses the existing monthly role assignment; a completed
          // signature must instead preserve the name stored with that image.
          const expectedName = role === "QA" && scenario.expectedSigned < 4 ? "Songpon Phothong" : names[role];
          assert.ok(text.some((call) => call.page === acknowledgement.page && call.x === center && call.value === expectedName), `signer retained in ${role} column`);
        }
        assert.ok(text.some((call) => call.value.includes(`Signed: ${scenario.expectedSigned}/4`)), "footer shows the actual signature count");

        // The Signature Center button calls the same renderer directly. Verify
        // that path independently, including Coaching continuation pages.
        const source = await loadSignatureCenterFinalSignedSource(monthKey, names.Agent, [], scenario.signatures);
        assert.ok(source, "the monthly source is available");
        const monthlyResult = await renderFinalSignedPdf({ ...source, generatedAt: "2026-10-05T08:00:00Z" });
        const monthlyPdf = monthlyResult.pdf;
        const monthlyText = textCalls(monthlyPdf);
        const monthlyAcknowledgements = monthlyText.filter((call) => call.value === "Acknowledgement / Signature");
        assert.equal(monthlyAcknowledgements.length, 1);
        assert.equal(monthlyAcknowledgements[0].page, 1, "standalone monthly signatures stay on page one");
        const monthlyCoaching = monthlyText.filter((call) => call.value.startsWith("Monthly Coaching"));
        assert.equal(monthlyCoaching.length > 0, monthKey >= "2026-09" && !!scenario.coaching.length);
        if (monthlyCoaching.length) assert.equal(monthlyCoaching[0].page, 2);
        assert.equal(monthlyPdf.getNumberOfPages(), 1 + monthlyCoaching.length, "no separate acknowledgement page in the monthly PDF");
        const monthlyPanels = monthlyPdf.fixtureCalls.filter((call) => call.method === "rect" && call.page === 1 && call.fill.toLowerCase() === "#7030a0" && Math.abs(call.values[2] - 45) < 0.02);
        assert.deepEqual(monthlyPanels.map((call) => call.values), panels.map((call) => call.values), "monthly and bulk use the original identical signature geometry");
        const monthlyImages = monthlyPdf.fixtureCalls.filter((call) => call.method === "addImage");
        assert.deepEqual(monthlyImages.map((call) => call.values), images.map((call) => call.values), "monthly and bulk retain identical signature images");
        assert.equal(fixture.signatureReads, 1, "standalone source reuses the saved-signature snapshot");
        if (output) {
          await mkdir(resolve(output), { recursive: true });
          await writeFile(resolve(output, `monthly-${scenario.label}.pdf`), Buffer.from(monthlyPdf.output("arraybuffer")));
        }
      }
      if (output) {
        await mkdir(resolve(output), { recursive: true });
        await writeFile(resolve(output, `${scenario.label}.pdf`), Buffer.from(await result.blob.arrayBuffer()));
      }
      console.log(`PASS ${scenario.label}: ${pdf.getNumberOfPages()} pages`);
    }
    const secondAgent = "Another Fixture Agent";
    const firstCases = fixtures();
    const secondCases = fixtures("2026-09", secondAgent).map((item) => ({ ...item, caseId: `SECOND-${item.caseId}` }));
    const secondSignature = signedDocument(secondAgent.toLowerCase());
    secondSignature.entries[0].signerName = secondAgent;
    const fixture = globalThis.__monthlyPdfFixture = {
      signatures: [signedDocument(), secondSignature],
      evaluations: [...firstCases, ...secondCases],
      coaching: [coaching(), coaching(secondAgent)], signatureReads: 0, pdfs: [],
    };
    const { generateBulkCaseDetailPdf } = await import(`${pathToFileURL(bundle).href}?fixture=multiple-agents`);
    const result = await generateBulkCaseDetailPdf({ cases: [...fixture.evaluations].reverse(), monthKey: "2026-09" });
    const text = textCalls(fixture.pdfs[0]);
    const covers = text.filter((call) => call.value === "Monthly QA Dashboard");
    const acknowledgements = text.filter((call) => call.value === "Acknowledgement / Signature");
    assert.equal(result.caseCount, 20);
    assert.equal(fixture.signatureReads, 1);
    assert.equal(covers.length, 2);
    assert.equal(acknowledgements.length, 2);
    assert.deepEqual(acknowledgements.map((call) => call.page), covers.map((call) => call.page), "each Agent's signatures remain on their own monthly dashboard");
    const casePages = text.filter((call) => call.value === "Case Detail").map((call) => call.page);
    assert.equal(casePages.filter((page) => page < covers[1].page).length, 10, "the first Agent's cases finish before the next cover");
    assert.equal(casePages.filter((page) => page > covers[1].page).length, 10, "the second Agent's cases follow their cover and Coaching");
    assert.ok(text.some((call) => call.page === acknowledgements[0].page && call.value === secondAgent));
    assert.ok(text.some((call) => call.page === acknowledgements[1].page && call.value === names.Agent));
    assert.equal(fixture.pdfs[0].fixtureCalls.filter((call) => call.method === "addImage").length, 8);
    console.log("PASS multiple-agents: separate case groups and signatures; one stored-signature read");
  } finally { globalThis.fetch = originalFetch; delete globalThis.__monthlyPdfFixture; }
} finally { await rm(temporary, { recursive: true, force: true }); }
