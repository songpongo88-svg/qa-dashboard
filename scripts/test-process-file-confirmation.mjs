import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";

await mkdir(resolve("node_modules/.cache"), { recursive: true });
const dir = await mkdtemp(resolve("node_modules/.cache/process-file-confirm-"));
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: "https://qa.test/?tab=create-evaluation",
  pretendToBeVisual: true,
});
for (const name of [
  "window", "document", "HTMLElement", "MutationObserver",
  "Event", "MouseEvent", "KeyboardEvent",
]) {
  globalThis[name] = dom.window[name];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.getElementById("root"));
const updates = [];
const activated = [];
const previewed = [];
const original = {
  id: "uploaded-process", name: "New Process 2026", fileName: "New Process 2026 (5).pptx",
  versionLabel: "10/09/2026 11:18:35", fileUrl: "https://example.test/process.pptx",
  fileType: "pptx", slideCount: 118, uploadedAt: "2026-09-10T04:18:35Z",
  uploadedBy: "Songpon", status: "archived", hiddenFromPicker: false,
};
const controls = {
  busyId: "", message: "", protectedFileId: "built-in",
  canHideSystemProcess: true, referencedIds: [],
  onClose() { throw Error("File manager closed while confirming"); },
  onPreview(item) { previewed.push(item.id); },
  onChangeVisibility(item, hidden) { updates.push({ id: item.id, hidden }); },
  onActivateCurrent(item) { activated.push(item.id); },
};
async function click(element) {
  assert.ok(element, "expected clickable element");
  await act(async () => element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
}
function fileButton(name) {
  const row = document.querySelector('[data-process-managed-version="uploaded-process"]');
  assert.ok(row, "Process row displayed");
  return [...row.querySelectorAll("button")].find((button) => button.textContent.trim() === name);
}
function modalButton(name) {
  const popup = document.querySelector('[role="alertdialog"]');
  assert.ok(popup, "confirmation popup displayed");
  return [...popup.querySelectorAll("button")].find((button) => button.textContent.trim() === name);
}
try {
  const css = await readFile("src/processSlidePickerPortal.css", "utf8");
  const sheet = document.createElement("style");
  sheet.textContent = css;
  document.head.appendChild(sheet);

  const outfile = resolve(dir, "manager.mjs");
  await build({
    entryPoints: ["src/ProcessFileManager.tsx"], outfile,
    bundle: true, format: "esm", platform: "node", packages: "external",
    loader: { ".css": "empty" }, logLevel: "silent",
  });
  const { ProcessFileManager } = await import(pathToFileURL(outfile).href);
  const render = async (files) => {
    await act(async () => root.render(React.createElement(ProcessFileManager, {
      ...controls, files,
    })));
  };
  await render([original]);
  assert.ok(document.querySelector('[role="dialog"][aria-label="Process File Management"]'));
  assert.equal(document.querySelector('[role="alertdialog"]'), null);

  await click(fileButton("Remove"));
  const firstPopup = document.querySelector('[role="alertdialog"]');
  const main = document.querySelector('[role="dialog"][aria-label="Process File Management"]');
  assert.ok(firstPopup, "Remove click must open in-dashboard confirmation");
  assert.ok(firstPopup.textContent.includes("New Process 2026 (5).pptx"));
  assert.ok(firstPopup.textContent.includes("ยืนยันการซ่อนไฟล์ Process"));
  const mainZ = Number(dom.window.getComputedStyle(main).zIndex);
  const confirmZ = Number(dom.window.getComputedStyle(firstPopup).zIndex);
  assert.ok(confirmZ > mainZ,
    "critical regression: confirmation must appear above Process manager (z-index " + mainZ + " vs " + confirmZ + ")");
  assert.deepEqual(updates, [], "Remove click alone must not change Firestore metadata");

  await click(modalButton("ยกเลิก"));
  assert.equal(document.querySelector('[role="alertdialog"]'), null);
  assert.deepEqual(updates, [], "Cancel must preserve file visibility");

  await click(fileButton("Remove"));
  await click(modalButton("ยืนยันซ่อนไฟล์"));
  assert.equal(document.querySelector('[role="alertdialog"]'), null);
  assert.deepEqual(updates, [{ id: original.id, hidden: true }],
    "Confirm Remove calls metadata visibility action once");

  await render([{ ...original, hiddenFromPicker: true }]);
  await click(fileButton("Restore"));
  assert.ok(document.querySelector('[role="alertdialog"]').textContent.includes("ยืนยันการคืนไฟล์ Process"));
  await click(modalButton("ยืนยัน Restore"));
  assert.deepEqual(updates, [{ id: original.id, hidden: true }, { id: original.id, hidden: false }],
    "Confirm Restore calls metadata visibility action once");

  await click(fileButton("ตั้งเป็น Current"));
  assert.ok(document.querySelector('[role="alertdialog"]').textContent.includes("ตั้งเป็น Process ปัจจุบัน"));
  await click(modalButton("ยืนยันใช้เวอร์ชันนี้"));
  assert.deepEqual(activated,["uploaded-process"],"Activate Current is separate from Restore and does not change file visibility");
  console.log("PASS Process File Remove/Restore/Activate: distinct confirmation and metadata-only activation");
} finally {
  await act(async () => root.unmount());
  dom.window.close();
  await rm(dir, { recursive: true, force: true });
}
