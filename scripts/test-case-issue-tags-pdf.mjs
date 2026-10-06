import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

// Exercise the actual PDF renderer and appeal adapter using synthetic records.
// No data store is imported, and external reads are disabled.
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(resolve(root, ".case-tag-pdf-test-"));
const dom = new JSDOM("<html><body></body></html>");
const keys = ["window", "document", "DOMParser", "Node", "HTMLElement"];
const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
keys.forEach((key) => { globalThis[key] = dom.window[key]; });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(null, { status: 404 });
const pdfs = [];
globalThis.__caseTagPdfFixtures = pdfs;
const label = "Tag ที่พบปัญหา :";
const tags = ["เกิน SLA", "ข้อมูลไม่ครบ", "<b>TAG-LITERAL</b> & ข้อมูล"];
const base = {
  caseId: "AA-TAG-FIXTURE", agent: "Test Agent", monthKey: "2026-10", monthLabel: "October 2026",
  auditDate: "2026-10-06", inquiry: "กรณีทดสอบเอกสาร", finalScore: 86, grade: "B",
  topics: [
    { code: "1", label: "Topic fixture", max: 20, score: 6, pct: 30, comment: "<div><u>ข้อความต้นฉบับ</u><br>จุดที่หักคือ: ข้อมูลไม่ครบ<br>หัก 14 คะแนน</div>", issueTags: [...tags, " เกิน SLA "] },
    { code: "2", label: "Untagged topic", max: 80, score: 80, pct: 100, comment: "หัวข้อที่ไม่มี Tag" },
  ],
};
const output = process.argv.find((arg) => arg.startsWith("--output-dir="))?.slice(13);

try {
  const bundle = resolve(temporary, "renderer.mjs");
  await build({
    stdin: { contents: 'export { generateOfficialCaseDetailPdf } from "./src/caseDetailOfficialPdf"; export { generateCasePdfWithAppealHistory } from "./src/caseAppealPdfAddon";', resolveDir: root, loader: "ts" },
    outfile: bundle, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
    plugins: [{ name: "record-real-pdf-output", setup(builder) {
      builder.onResolve({ filter: /^jspdf$/ }, (args) => args.namespace === "case-tag-pdf" ? { path: args.path, external: true } : { path: args.path, namespace: "case-tag-pdf" });
      builder.onLoad({ filter: /.*/, namespace: "case-tag-pdf" }, () => ({ loader: "js", contents: `
        import { jsPDF as RealPdf } from "jspdf";
        export class jsPDF extends RealPdf {
          constructor(...args) {
            super(...args);
            this.fixtureCalls = [];
            globalThis.__caseTagPdfFixtures.push(this);
            const setTextColor = this.setTextColor.bind(this);
            this.setTextColor = (...color) => {
              this.fixtureTextColor = color;
              return setTextColor(...color);
            };
            for (const method of ["text", "line"]) {
              const original = this[method].bind(this);
              this[method] = (...values) => {
                this.fixtureCalls.push({ method, values, page: this.getCurrentPageInfo().pageNumber,
                  fontSize: this.getFontSize(), color: [...(this.fixtureTextColor || [])], width: method === "text" ? this.getTextWidth(String(values[0])) : 0 });
                return original(...values);
              };
            }
          }
        }` }));
    } }],
  });
  const { generateOfficialCaseDetailPdf, generateCasePdfWithAppealHistory } = await import(pathToFileURL(bundle).href);
  async function generate(caseItem, pdfVariant = "original", name = "") {
    const snapshot = structuredClone(caseItem);
    const result = await generateCasePdfWithAppealHistory({ caseItem, pdfVariant, fallback: generateOfficialCaseDetailPdf });
    const pdf = pdfs.at(-1);
    const calls = pdf.fixtureCalls.filter((call) => call.method === "text");
    const text = calls.map((call) => String(call.values[0])).join("");
    assert.deepEqual(caseItem, snapshot, "export never mutates saved Tags, scores or comments");
    const bytes = Buffer.from(await result.blob.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    assert.ok(result.fileName.includes(caseItem.caseId), "the Case ID remains in the download filename");
    if (output && name) { await mkdir(output, { recursive: true }); await writeFile(resolve(output, name + ".pdf"), bytes); }
    return { pdf, calls, text };
  }

  const normal = await generate(base, "original", "normal-tags");
  assert.equal(normal.text.split(label).length - 1, 1, "one Tag label only for the tagged Topic");
  for (const tag of tags) assert.ok(normal.text.includes(tag), `saved literal Tag retained: ${tag}`);
  assert.equal(normal.text.split("เกิน SLA").length - 1, 1, "duplicate selections appear once");
  assert.ok(normal.text.indexOf("หัก 14 คะแนน") < normal.text.indexOf(label), "Tags follow the deduction text");
  const assertPurpleTags = (rendered) => {
    const tagStart = rendered.calls.findIndex((call) => String(call.values[0]).includes(label));
    assert.ok(tagStart >= 0, "the saved Tag row is present");
    const tagCalls = rendered.calls.slice(tagStart).filter((call) => String(call.values[0]).includes(label) || tags.some((tag) => String(call.values[0]).includes(tag)));
    assert.ok(tagCalls.length >= 2, "both the label and selected Tag names are drawn");
    tagCalls.forEach((call) => assert.deepEqual(call.color, [112, 48, 160], "Tag label and names use the document's purple color"));
    const deduction = rendered.calls.find((call) => String(call.values[0]).includes("หัก 14 คะแนน"));
    assert.deepEqual(deduction.color, [0, 0, 0], "deduction text retains its original black color");
  };
  assertPurpleTags(normal);
  const underlinedText = normal.calls.find((call) => String(call.values[0]).includes("ข้อความต้นฉบับ"));
  assert.ok(normal.pdf.fixtureCalls.some((call) => call.method === "line" &&
    Math.abs(call.values[0] - underlinedText.values[1]) < 0.01 &&
    Math.abs(call.values[1] - underlinedText.values[2] - 0.45) < 0.01), "original underline remains under the original text");
  console.log("PASS actual Case Detail PDF includes selected literal Tags after deductions without duplicates or saved-data changes");

  for (const appealStatus of ["Approved", "Rejected"]) for (const pdfVariant of ["original", "appeal"]) {
    const appeal = { ...structuredClone(base), appealStatus, reviewStatus: "Revised", displayRevisedTopicCodes: ["1"],
      revisedTopics: [{ code: "1", label: "Topic fixture", max: 20, score: 10, comment: "ความคิดเห็นหลังอุทธรณ์" }],
      appealReviewedTopics: [{ code: "1", comment: "ความคิดเห็นหลังอุทธรณ์", appealReason: "เหตุผลอุทธรณ์" }] };
    const rendered = await generate(appeal, pdfVariant, appealStatus === "Approved" && pdfVariant === "original" ? "approved-tags" : "");
    assert.equal(rendered.text.split(label).length - 1, 1, "appeal Tags are never duplicated by the renderer and adapter");
    assert.ok(rendered.text.indexOf("Original Comment") < rendered.text.indexOf("หัก 14 คะแนน"));
    assert.ok(rendered.text.indexOf("หัก 14 คะแนน") < rendered.text.indexOf(label));
    assert.ok(rendered.text.indexOf(label) < rendered.text.indexOf("Appeal Reason"), "Tags stay inside Original Comment, before appeal explanations");
    for (const tag of tags) assert.ok(rendered.text.includes(tag), "appeals without replacement Tags retain saved case Tags");
    assertPurpleTags(rendered);
  }
  console.log("PASS original and appeal downloads place Tags inside Original Comment for approved and rejected appeals");

  const empty = structuredClone(base);
  empty.topics.forEach((topic) => { delete topic.issueTags; });
  assert.ok(!(await generate(empty)).text.includes(label), "historical untagged cases have no invented Tag row");
  const cleared = { ...structuredClone(base), reviewStatus: "Revised", appealStatus: "Approved", displayRevisedTopicCodes: ["1"],
    revisedTopics: [{ ...base.topics[0], score: 10, comment: "ความคิดเห็นใหม่", issueTags: [] }] };
  assert.ok(!(await generate(cleared)).text.includes(label), "an explicitly empty replacement selection stays empty");
  console.log("PASS untagged history and explicitly cleared replacement Tags remain empty");

  const long = structuredClone(base);
  long.topics = [long.topics[0]];
  long.topics[0].comment = "<div>" + Array.from({ length: 130 }, (_, index) => `รายละเอียดตรวจสอบลำดับ ${index + 1}<br>`).join("") + "หัก 14 คะแนน</div>";
  long.topics[0].issueTags = Array.from({ length: 35 }, (_, index) => `TAG-${String(index + 1).padStart(2, "0")} ตรวจข้อมูลและระยะเวลาตามขั้นตอน `.repeat(5).trim());
  const paginated = await generate(long, "original", "paginated-tags");
  assert.ok(paginated.pdf.getNumberOfPages() > 1);
  const tagBodyCalls = paginated.calls.filter((call) => call.values[1] >= 130 && Math.abs(call.fontSize - 5.95) < 0.01);
  const tagStart = tagBodyCalls.findIndex((call) => String(call.values[0]).includes(label));
  tagBodyCalls.slice(tagStart).forEach((call) => assert.deepEqual(call.color, [112, 48, 160], "wrapped Tag text keeps its purple color on continuation pages"));
  const compactText = tagBodyCalls.map((call) => String(call.values[0])).join("").replace(/\s/g, "");
  for (const tag of long.topics[0].issueTags) assert.ok(compactText.includes(tag.replace(/\s/g, "")), "long wrapped names are retained completely across pages");
  const start = paginated.calls.findIndex((call) => String(call.values[0]).includes(label));
  for (const call of paginated.calls.slice(start).filter((call) => call.width > 0 && call.values[1] >= 130 && !String(call.values[0]).startsWith("Page "))) {
    assert.ok(call.values[1] + call.width <= 203.5, "wrapped Tag text stays inside the page width");
    assert.ok(call.values[2] <= 289, "Tag text stays above the footer");
  }
  console.log("PASS long comments and Tag names paginate without clipping or losing the final Tag");
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.__caseTagPdfFixtures;
  dom.window.close();
  for (const key of keys) {
    if (originals.get(key)) Object.defineProperty(globalThis, key, originals.get(key));
    else delete globalThis[key];
  }
  await rm(temporary, { recursive: true, force: true });
}
