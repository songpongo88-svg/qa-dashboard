import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";

await mkdir(resolve("node_modules/.cache"), { recursive: true });
const folder = await mkdtemp(resolve("node_modules/.cache/admin-workspace-"));
const dom = new JSDOM("<!doctype html><html><body><div id='app'></div></body></html>", {
  url: "https://qa-dashboard.test", pretendToBeVisual: true,
});
const previous = {};
for (const name of ["window", "document", "HTMLElement", "MutationObserver", "Event", "MouseEvent", "KeyboardEvent"]) {
  previous[name] = Object.getOwnPropertyDescriptor(globalThis, name);
  globalThis[name] = dom.window[name];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.confirm = () => { throw Error("native confirmation is forbidden"); };
const oldFetch = globalThis.fetch;
const calls = [];
const common = { createdAt: "2026-11-07T03:00:00Z", username: "qa-user", displayName: "QA User" };
const money = [
  // The existing TrueMoney list projection omits itemId; requestId is its canonical document ID.
  { ...common, requestId: "tm-pending", status: "pending", amountTHB: 20, phone: "0801234567", dueDate: "2026-11-26" },
  { ...common, requestId: "tm-paid", status: "paid", amountTHB: 20, phone: "0812345678", payoutConfirmedBy: "prior-admin", payoutConfirmedAt: "2026-11-07T03:15:00Z" },
];
const special = [
  { ...common, itemId: "punthai-review", requestId: "punthai-review", rewardId: "punthai-65", title: "เครื่องดื่มพันธุ์ไทย", status: "pending_review", amountTHB: 55, payoutTHB: 55, promptPay: "0822222222", receiptNumber: "PT-12345", ocrStatus: "manual" },
  { ...common, itemId: "amazon-approved", requestId: "amazon-approved", rewardId: "amazon-55", title: "Café Amazon", status: "approved", payoutTHB: 50, promptPay: "0833333333" },
  { ...common, itemId: "seven-approved", requestId: "seven-approved", rewardId: "seven-100", title: "7-Eleven", status: "approved", payoutTHB: 100, promptPay: "0844444444" },
  { ...common, itemId: "netflix-approved", requestId: "netflix-approved", rewardId: "netflix-1m", title: "Netflix 1 เดือน", status: "approved", username: "netflix-user", displayName: "Netflix User", email: "netflix@example.test" },
];
const user = { username: "qa-user", displayName: "QA User", role: "Admin Live Chat", status: "Active", balance: 150, earned: 150, spent: 0, rewardOrders: 0 };
let mutationMode = "success", specialListFailure = false, directoryFailure = false;
let priceFailure = true, price = 10000, truncated = false;
let deferred = null;
const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => structuredClone(data) });
globalThis.fetch = async (url, options) => {
  assert.equal(url, "/api/sparks-admin");
  const body = JSON.parse(options.body);
  assert.equal(body.actorUsername, "test-admin");
  assert.equal(body.sessionId, "admin-test-session");
  calls.push(body);
  if (body.action === "list") return directoryFailure ? reply({ error: "Firestore RESOURCE_EXHAUSTED quota" }, 429) : reply({ users: [user] });
  if (body.action === "history") return reply({ username: user.username, wallet: user, history: [{ id: "audit-1", createdAt: common.createdAt, title: "Admin Added Sparks", amount: 150, type: "earn", performedBy: "prior-admin", reason: "verified adjustment", source: "admin-add", status: "Completed" }] });
  if (body.action === "get-truemoney-price") return priceFailure ? reply({ error: "price unavailable" }, 503) : reply({ price });
  if (body.action === "set-truemoney-price") { price = body.price; return reply({ price }); }
  if (body.action === "list-reward-queues") return reply({
    truemoney: { ok: true, requests: money, truncated },
    special: specialListFailure
      ? { ok: false, error: "quota exhausted", code: "FIRESTORE_RESOURCE_EXHAUSTED" }
      : { ok: true, requests: special },
  });
  if (body.action === "list-truemoney-tracker") return reply({ requests: money, truncated });
  if (body.action === "special-rewards-admin-list") return specialListFailure ? reply({ error: "quota exhausted" }, 429) : reply({ requests: special });
  if (body.action === "special-rewards-admin-receipt") return reply({ imageData: "data:image/png;base64,cHJldmlldw==" });
  assert.ok(["mark-truemoney-paid", "special-rewards-admin-action"].includes(body.action), "unexpected API action " + body.action);
  if (mutationMode === "error") return reply({ error: "server did not save" }, 429);
  if (mutationMode === "wrong-status") return reply({ status: "pending" });
  if (mutationMode === "hold") return new Promise(resolveReply => { deferred = resolveReply; });
  const row = (body.action === "mark-truemoney-paid" ? money : special).find(item => (item.itemId || item.requestId) === body.itemId);
  assert.ok(row, "mutation uses the exact canonical item ID");
  row.status = body.action === "mark-truemoney-paid" ? "paid" : body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : row.rewardId === "netflix-1m" ? "delivered" : "paid";
  return reply({ updated: true, status: row.status, ...(body.action === "mark-truemoney-paid" ? { paidAt: "2026-11-07T04:00:00Z" } : {}) });
};
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.getElementById("app"));
const click = async element => {
  assert.ok(element, "click target missing");
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
};
const setValue = async (element, value) => {
  assert.ok(element, "input missing");
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value").set;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
};
const button = (selector, label) => [...document.querySelectorAll(selector)].find(item => item.textContent.includes(label));
const popup = () => document.querySelector('dialog.reward-confirm-modal[data-reward-confirm-overlay="true"][role="dialog"]');
const section = name => document.querySelector('[data-sparks-admin-section="' + name + '"]');
const open = id => click(document.querySelector('[data-request-open="' + id + '"]'));
const primary = id => document.querySelector('[data-request-primary="' + id + '"]');
const count = action => calls.filter(call => call.action === action).length;
const mutations = () => calls.filter(call => ["mark-truemoney-paid", "special-rewards-admin-action"].includes(call.action));
try {
  const output = resolve(folder, "Admin.mjs");
  const mocks = new Map([
    ["./userRoleStore", "export async function fetchStoredUserProfiles(){return []} export function readCachedUserProfiles(){return []}"],
    ["./qaSparksStore", "export async function getSparksAccount(){return {balance:0,history:[]}}"],
    ["./firebaseClient", "export const firebaseDb={}"],
    ["firebase/firestore", "export const collection=()=>({}); export const getDocsFromCache=async()=>({docs:[]})"],
  ]);
  await build({ entryPoints: ["src/SparksAdminPanel.tsx"], outfile: output, bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty" }, logLevel: "silent", plugins: [{ name: "workspace-fixtures", setup(builder) {
    builder.onResolve({ filter: /^(\.\/userRoleStore|\.\/qaSparksStore|\.\/firebaseClient|firebase\/firestore)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks.get(args.path), loader: "js" }));
  } }] });
  const { default: Panel } = await import(pathToFileURL(output).href);
  const render = key => act(async () => root.render(React.createElement(Panel, { key, actorUsername: "test-admin", sessionId: "admin-test-session", ownAccount: null })));
  await render("normal");
  assert.equal(document.querySelectorAll("[data-sparks-admin-section]").length, 4);
  assert.equal(section("requests").getAttribute("aria-pressed"), "true");
  assert.equal(count("list-reward-queues"), 0, "queues load only on explicit click");
  assert.equal(count("get-truemoney-price"), 0, "price does not read on requests page");
  assert.ok(document.querySelector(".sa-settings").hidden);
  await click(button(".sa-section-head button", "โหลดคำขอ"));
  assert.equal(count("list-reward-queues"), 1);
  assert.equal(count("list-reward-queues"), 1);
  assert.deepEqual([...document.querySelectorAll(".sa-stats strong")].map(item => item.textContent), ["1", "3", "1", "1"]);
  await click(button(".sa-brand-tabs button", "TrueMoney"));
  assert.equal(document.querySelectorAll(".sa-request-table tbody tr").length, 1);
  await setValue(document.querySelector('[aria-label="สถานะคำขอ"]'), "all");
  assert.equal(document.querySelectorAll(".sa-request-table tbody tr").length, 2);
  await click(section("points"));
  assert.ok(document.querySelector(".sa-requests").parentElement.hidden);
  await click(section("activity"));
  assert.match(document.querySelector(".qa-sparks-admin-detail").textContent, /verified adjustment/);
  await click(section("requests"));
  assert.equal(count("list-reward-queues"), 1, "navigation and local filters preserve loaded queue");
  await open("tm-pending");
  assert.ok(!document.querySelector(".sa-requests textarea"), "TrueMoney does not offer an unsaved note field");
  await click(primary("tm-pending"));
  assert.match(popup().textContent, /TrueMoney 20 บาท/);
  assert.match(popup().textContent, /0801234567/);
  await click(popup().querySelector(".reward-confirm-cancel"));
  assert.equal(mutations().length, 0, "cancel does not mutate anything");
  await click(primary("tm-pending"));
  mutationMode = "error";
  await click(popup().querySelector("[data-reward-confirm-submit]"));
  assert.match(popup().textContent, /server did not save/);
  assert.match(document.querySelector(".sa-request-hero").textContent, /รอโอนเงิน/);
  mutationMode = "wrong-status";
  await click(popup().querySelector("[data-reward-confirm-submit]"));
  assert.match(popup().textContent, /เซิร์ฟเวอร์ยังไม่ยืนยัน/);
  mutationMode = "hold";
  const beforeDoubleClick = mutations().length;
  await act(async () => {
    const submit = popup().querySelector("[data-reward-confirm-submit]");
    submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    assert.ok(deferred);
    deferred(reply({ updated: true, status: "paid", paidAt: "2026-11-07T04:00:00Z" }));
  });
  assert.equal(mutations().length, beforeDoubleClick + 1, "rapid duplicate clicks send one write");
  assert.equal(mutations().at(-1).itemId, "tm-pending");
  assert.equal(popup(), null);
  assert.match(document.querySelector(".sa-request-hero").textContent, /เสร็จสิ้น/);
  assert.equal(count("list-reward-queues"), 1, "server-confirmed success does not reread queues");
  mutationMode = "success";
  await click(document.querySelector(".sa-back"));
  await click(button(".sa-brand-tabs button", "ทั้งหมด"));
  await open("netflix-approved");
  assert.match(primary("netflix-approved").textContent, /บันทึกส่งสิทธิ์ Netflix แล้ว/);
  await click(primary("netflix-approved"));
  assert.match(popup().textContent, /netflix@example.test/);
  assert.match(popup().textContent, /Netflix User/);
  await click(popup().querySelector("[data-reward-confirm-submit]"));
  assert.equal(mutations().at(-1).decision, "complete");
  assert.match(document.querySelector(".sa-request-hero").textContent, /เสร็จสิ้น/);
  await click(document.querySelector(".sa-back"));
  await open("punthai-review");
  const writesBeforeReview = mutations().length;
  await click(button(".sa-actions button", "ไม่อนุมัติ"));
  assert.equal(mutations().length, writesBeforeReview);
  assert.match(document.querySelector(".sa-error").textContent, /อย่างน้อย 4/);
  await click(button(".sa-receipt button", "ดูภาพ"));
  assert.ok(document.querySelector(".sa-receipt img"));
  await click(button(".sa-receipt button", "ซ่อนภาพ"));
  await click(button(".sa-receipt button", "ดูภาพ"));
  assert.equal(count("special-rewards-admin-receipt"), 1, "receipt is fetched on demand and reused locally");
  await click(primary("punthai-review"));
  assert.equal(mutations().at(-1).decision, "approve");
  assert.match(document.querySelector(".sa-request-hero").textContent, /รอโอนเงิน/);
  assert.ok(primary("punthai-review"), "receipt approval still requires a separate payment confirmation");
  await click(document.querySelector(".sa-back"));
  await open("amazon-approved");
  await setValue(document.querySelector(".sa-field textarea"), "ใบเสร็จไม่ตรงเงื่อนไข");
  await click(button(".sa-actions button", "ไม่อนุมัติ"));
  assert.equal(mutations().at(-1).decision, "reject");
  assert.equal(mutations().at(-1).note, "ใบเสร็จไม่ตรงเงื่อนไข");
  assert.match(document.querySelector(".sa-completed").textContent, /ไม่อนุมัติ/);
  await click(section("settings"));
  assert.equal(count("get-truemoney-price"), 1);
  assert.match(document.querySelector(".sa-settings").textContent, /price unavailable/);
  assert.ok(button(".sa-settings button", "บันทึกราคา").disabled);
  priceFailure = false;
  await click(button(".sa-settings button", "รีเฟรชราคา"));
  assert.equal(count("get-truemoney-price"), 2);
  assert.ok(!button(".sa-settings button", "บันทึกราคา").disabled);
  await setValue(document.querySelector("#qa-truemoney-admin-price"), "12000");
  assert.match(document.querySelector(".sa-settings .sa-product-title p").textContent, /10,000/, "draft edit must not misstate saved price");
  await click(button(".sa-settings button", "บันทึกราคา"));
  assert.equal(price, 12000);
  await click(section("requests"));
  await click(section("settings"));
  assert.equal(count("get-truemoney-price"), 2, "switching tabs does not refetch a loaded price");
  await click(section("requests"));
  await click(document.querySelector(".sa-back"));
  specialListFailure = true;
  truncated = true;
  await click(button(".sa-section-head button", "รีเฟรชคำขอ"));
  assert.ok(document.querySelectorAll(".sa-request-table tbody tr").length > 2, "partial failure preserves previous channel rows");
  assert.deepEqual([...document.querySelectorAll(".sa-stats strong")].map(item => item.textContent), ["—", "—", "—", "—"]);
  assert.match(document.querySelector(".sa-requests").textContent, /ข้อมูลยังโหลดไม่ครบ/);
  assert.match(document.querySelector(".sa-requests").textContent, /อาจมีรายการเก่ากว่านี้/);
  specialListFailure = false;
  directoryFailure = true;
  await render("directory-quota");
  await click(button(".sa-section-head button", "โหลดคำขอ"));
  await open("tm-pending");
  assert.ok(!primary("tm-pending").disabled, "independent tracker is usable when wallet/directory read fails; server authorizes mutations");
  console.log("PASS Admin workspace: four isolated menus, real combined queues, explicit reads, canonical IDs, receipt approval vs payment, Netflix delivery, cancel/error/status/duplicate guards, partial quota data and price retry");
} finally {
  await act(async () => root.unmount());
  globalThis.fetch = oldFetch;
  dom.window.close();
  for (const [name, descriptor] of Object.entries(previous)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  }
  await rm(folder, { recursive: true, force: true });
}
