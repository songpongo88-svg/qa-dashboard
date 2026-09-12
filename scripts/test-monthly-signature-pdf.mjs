import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";
import { jsPDF } from "jspdf";

// Synthetic fixtures for geometry regression only. Acceptance must ALSO export
// the original real record from Signature Center in the deployed UI.
const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(resolve(root, ".pdf-layout-test-"));
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.02, `${label}: ${actual} != ${expected}`);
const roles = ["Agent", "Senior", "Supervisor", "QA"];
const roleSignerNames = { Agent: "Test Agent", Senior: "Test Senior", Supervisor: "Test Supervisor", QA: "Test QA" };
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4XmNgYGD4D8IABgMB/7I8x4cAAAAASUVORK5CYII=";

try {
  const bundle = resolve(temporary, "renderer.mjs");
  await build({ entryPoints: [resolve(root, "src/finalSignedPdfRenderer.ts")], outfile: bundle, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" });
  const { renderFinalSignedPdf } = await import(pathToFileURL(bundle).href);
  for (const scenario of [
    { label: "10 cases / 4 topics / two signatures", cases: 10, topics: 4, signed: ["Agent", "QA"] },
    { label: "historical 13 topics / complete signatures", cases: 10, topics: 13, signed: roles },
    { label: "partial month / pending signatures", cases: 2, topics: 4, signed: [] },
    { label: "empty month", cases: 0, topics: 0, signed: [] },
    { label: "bulk append preserves earlier page", cases: 10, topics: 4, signed: ["Agent", "QA"], append: true },
  ]) {
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    if (scenario.append) pdf.text("Earlier document must not change", 10, 10);
    const previousPage = scenario.append ? [...pdf.internal.pages[1]] : null;
    const calls = { text: [], rect: [], line: [], addImage: [] };
    for (const method of Object.keys(calls)) {
      const original = pdf[method].bind(pdf);
      pdf[method] = (...args) => {
        calls[method].push({ args, page: pdf.getCurrentPageInfo().pageNumber, fill: pdf.getFillColor(), fontSize: pdf.getFontSize() });
        return original(...args);
      };
    }
    const cases = Array.from({ length: scenario.cases }, (_, index) => ({
      caseId: `TEST-${index + 1}`, auditDate: "1/8/2569", inquiry: "Synthetic regression fixture", finalScore: 82.1, grade: "C",
      topics: Array.from({ length: scenario.topics }, (_, topic) => ({ code: String(topic + 1), title: `Topic fixture ${topic + 1}`, score: 20, max: 25 })),
    }));
    const entries = scenario.signed.map(role => ({ role, status: "Signed", signerName: roleSignerNames[role], signedAt: "2026-09-12T04:29:00Z", signatureDataUrl: pixel }));
    await renderFinalSignedPdf({ document: { monthKey: "2026-08", monthLabel: "August 2026", agentName: roleSignerNames.Agent, caseCount: cases.length, averageScore: 82.1, grade: "C", cases }, entries, incentive: { cash: 500, label: "500 THB" }, documentRef: "TEST-REF", roleSignerNames, pdfDoc: pdf, appendPage: !!scenario.append, generatedAt: "2026-09-12T12:00:00Z" });
    assert.equal(pdf.getNumberOfPages(), scenario.append ? 2 : 1, "one portrait page per document");
    near(pdf.internal.pageSize.getWidth(), 210, "A4 width");
    near(pdf.internal.pageSize.getHeight(), 297, "A4 height");
    if (previousPage) assert.deepEqual(pdf.internal.pages[1], previousPage, "append cannot write on previous document");
    const text = calls.text.map(c => ({ value: String(c.args[0]), x: c.args[1], y: c.args[2], options: c.args[3], page: c.page }));
    const headings = ["Current View", "Incentive Summary", "Monthly Case List", "Monthly Topic Performance", "Acknowledgement / Signature"].map(title => text.find(c => c.value === title));
    assert.ok(headings.every(Boolean), "all sections retained");
    assert.ok(headings.every((item, index) => !index || item.y > headings[index - 1].y), "topic performance precedes acknowledgement");
    assert.ok(text.every(c => c.page === (scenario.append ? 2 : 1)), "all content stays on the same document page");
    for (const item of cases) assert.ok(text.some(c => c.value === item.caseId), `case retained: ${item.caseId}`);
    const topicHeadingY = headings[3].y;
    for (let index = 1; index <= scenario.topics; index++) assert.ok(text.some(c => c.value === `Topic fixture ${index}` && c.y > topicHeadingY), `topic retained: ${index}`);
    const panels = calls.rect.filter(c => c.fill.toLowerCase() === "#7030a0" && Math.abs(c.args[2] - 45) < 0.02);
    assert.equal(panels.length, 4, "exactly four purple panel headers");
    const panelY = panels[0].args[1];
    assert.ok(panelY > headings[4].y, "panels below acknowledgement");
    for (let index = 0; index < roles.length; index++) {
      const [x, y, w, headerH] = panels[index].args;
      near(x, 10 + index * 47, "equal columns in role order");
      near(y, panelY, "one row only");
      near(headerH, 3.5, "compact header");
      const cells = calls.rect.filter(c => c.args[0] === x && c.args[1] >= panelY && c.args[2] === w);
      const panelBottom = Math.max(...cells.map(c => c.args[1] + c.args[3]));
      near(panelBottom - y, 23.2, "reference card height");
      assert.ok(w / (panelBottom - y) > 1.9, "wide/shallow, not tall cards");
      assert.ok(panelBottom <= 289.01, "panel above footer safe area");
      const centerX = x + w / 2;
      const panelText = text.filter(c => c.x === centerX && c.y > panelY);
      assert.ok(panelText[0].value.startsWith(roles[index]), "correct role header");
      assert.ok(panelText.some(c => c.value === roleSignerNames[roles[index]]), "correct signer below own signature");
      const dateLineY = panelBottom - 1;
      const dateLines = calls.line.filter(c => Math.abs(c.args[1] - dateLineY) < 0.02 && c.args[0] >= x && c.args[2] <= x + w);
      assert.equal(dateLines.length, 1, "date baseline stays continuous, not split around value");
      near(dateLines[0].args[0], x + 11, "original dotted line start");
      near(dateLines[0].args[2], x + w - 2, "original dotted line end");
      assert.ok(text.some(c => c.value === "วันที่" && c.x > x && c.x < x + w && Math.abs(c.y - (dateLineY - .25)) < .02), "วันที่ label retained");
      if (scenario.signed.includes(roles[index])) {
        const date = panelText.find(c => c.value === "12/9/69 11:29");
        assert.ok(date, "signed datetime retained");
        near(date.x, centerX, "date centered on signature axis");
        near(date.y, dateLineY - .5, "date above dotted line");
        const image = calls.addImage.find(c => Math.abs(c.args[2] + c.args[4] / 2 - centerX) < .02);
        assert.ok(image, "signature remains in its role's column");
        assert.equal(image.args[0], entries.find(entry => entry.role === roles[index]).signatureDataUrl, "original signature bytes");
        assert.ok(image.args[3] >= panelY + headerH && image.args[3] + image.args[5] <= panelY + 12.5, "signature contained in ink area");
      }
    }
    assert.equal(calls.addImage.length, scenario.signed.length, "no signature added to pending roles");
    const footer = text.find(c => c.value.startsWith("Document Ref. TEST-REF | Generated:"));
    assert.ok(footer?.value.includes(`| Signed: ${scenario.signed.length}/4`), "footer includes ref, generation, signature status and count");
    assert.ok(footer.value.includes(scenario.signed.length === 4 ? "Completed Signature" : "Incomplete Signature"));
    near(footer.y, 291.6, "footer unchanged");
    const output = process.argv.find(arg => arg.startsWith("--output="))?.slice(9);
    if (output && scenario.label === "10 cases / 4 topics / two signatures") pdf.save(resolve(output));
    console.log(`PASS ${scenario.label}`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
