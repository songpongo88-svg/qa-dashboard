import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, useState } from "react";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import handler from "../api/google-drive-upload.js";

const originalFetch = globalThis.fetch;
const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);
const body = { uploadKind: "appeal-image", fileName: "proof.jpg", contentType: "image/jpeg", dataBase64: jpeg.toString("base64"), caseId: "appeal-AA990070-1" };
async function runApi(payload) {
  const result = {};
  const res = { status(code) { result.status = code; return this; }, json(data) { result.data = data; return this; } };
  await handler({ method: "POST", body: payload }, res);
  return result;
}
try {
  for (const upstream of [
    { id: "proof_123", webViewLink: "https://drive.google.com/file/d/proof_123/view" },
    { fileId: "proof_123" },
    { url: "https://drive.google.com/file/d/proof_123/view?usp=sharing" },
    { file: { url: "https://drive.google.com/open?id=proof_123" } },
    { data: { fileUrl: "https://docs.google.com/file/d/proof_123/preview" } },
  ]) {
    globalThis.fetch = async () => new Response(JSON.stringify(upstream), { headers: { "Content-Type": "application/json" } });
    const result = await runApi(body);
    assert.equal(result.status, 200);
    assert.equal(result.data.id, "proof_123");
  }
  globalThis.fetch = async () => new Response(JSON.stringify({ url: "https://example.test/file/d/not-a-drive-id/view" }));
  assert.equal((await runApi(body)).status, 502);
  assert.equal((await runApi({ ...body, dataBase64: "invalid" })).status, 400);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "Drive unavailable" }), { status: 503 });
  assert.equal((await runApi(body)).data.error, "Drive unavailable");
  console.log("PASS real upload API accepts direct/nested IDs and Drive-link-only success, rejects invalid files and reports upstream failures");
} finally { globalThis.fetch = originalFetch; }

// Exercise the real picker, compression bounds and upload client. Only browser
// image decoding/canvas encoding and the external Drive boundary are fixtures.
const dom = new JSDOM("<div id='root'></div>", { url: "https://qa.test" });
const keys = ["window", "document", "HTMLElement", "Event", "MouseEvent", "Image", "FileReader", "URL"];
const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const key of keys.slice(0, 5)) globalThis[key] = dom.window[key];
globalThis.FileReader = dom.window.FileReader;
const revoked = [];
const NativeURL = globalThis.URL;
globalThis.URL = class extends NativeURL { static createObjectURL() { return "blob:fixture"; } static revokeObjectURL(value) { revoked.push(value); } };
globalThis.Image = class { naturalWidth = 4000; naturalHeight = 2400; async decode() {} };
const encodedSizes = [];
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ fillStyle: "", fillRect() {}, drawImage() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {} });
dom.window.HTMLCanvasElement.prototype.toBlob = function(callback, type) {
  encodedSizes.push({ width: this.width, height: this.height, type });
  callback(new dom.window.Blob([jpeg], { type }));
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.getElementById("root"));
const temp = await mkdtemp(resolve(fileURLToPath(new URL("../", import.meta.url)), ".appeal-evidence-test-"));
const attempts = [];
let failSecond = true;
globalThis.fetch = async (url, options) => {
  const payload = JSON.parse(options.body);
  if (url === "/api/google-drive-upload") {
    const result = await runApi(payload);
    return new Response(JSON.stringify(result.data), { status: result.status, headers: { "Content-Type": "application/json" } });
  }
  attempts.push(payload.fileName);
  if (payload.fileName === "second.jpg" && failSecond) { failSecond = false; return new Response(JSON.stringify({ error: "Retry this image" }), { status: 503 }); }
  return new Response(JSON.stringify({ url: `https://drive.google.com/file/d/${payload.fileName === "first.jpg" ? "first_id" : "second_id"}/view` }));
};
try {
  const output = resolve(temp, "evidence.mjs");
  await build({ entryPoints: ["src/AppealEvidence.tsx"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent" });
  const { AppealEvidencePicker } = await import(pathToFileURL(output).href);
  let images = [];
  function Fixture() {
    const [saved, setSaved] = useState([]);
    return React.createElement(AppealEvidencePicker, { caseId: "AA990070", topicCode: "1", images: saved, totalCount: saved.length, disabled: false,
      onBusyChange() {}, onRemove: id => setSaved(items => items.filter(item => item.id !== id)),
      onAdd: image => { images.push(image); setSaved(items => [...items, image]); },
    });
  }
  await act(async () => root.render(React.createElement(Fixture)));
  const files = [new dom.window.File(["fixture"], "first.png", { type: "image/png" }), new dom.window.File(["fixture"], "second.png", { type: "image/png" })];
  const input = document.querySelector('input[type="file"]');
  Object.defineProperty(input, "files", { configurable: true, value: files });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 50)); });
  assert.deepEqual(images.map(image => image.id), ["first_id"]);
  assert.ok(document.querySelector('[role="alert"]').textContent.includes("second.png"));
  const retry = [...document.querySelectorAll("button")].find(button => button.textContent.includes("ลองอัปโหลดอีกครั้ง"));
  assert.ok(retry);
  await act(async () => { retry.dispatchEvent(new MouseEvent("click", { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 50)); });
  assert.deepEqual(images.map(image => image.id), ["first_id", "second_id"]);
  assert.deepEqual(attempts, ["first.jpg", "second.jpg", "second.jpg"]);
  assert.ok(images.every(image => image.url.startsWith("/api/google-drive-download?inline=1&id=") && image.size <= 1024 * 1024));
  assert.ok(encodedSizes.every(size => size.width <= 1600 && size.height <= 1600 && size.type === "image/jpeg"));
  assert.equal(revoked.length, 3);
  assert.equal(document.querySelectorAll('[role="alert"]').length, 0);
  console.log("PASS real picker saves successful images, retries only the failed file, keeps both inline URLs and clears the error after success");
} finally {
  globalThis.fetch = originalFetch;
  await act(async () => root.unmount());
  await rm(temp, { recursive: true, force: true });
  dom.window.close();
  for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
}
