import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";

await mkdir(resolve("node_modules/.cache"), { recursive: true });
const dir = await mkdtemp(resolve("node_modules/.cache/announcement-read-stats-"));
const dom = new JSDOM('<div id="root"></div>', {
  url: "https://qa.test/?tab=dashboard", pretendToBeVisual: true,
});
for (const name of ["window", "document", "HTMLElement", "MutationObserver", "Event", "MouseEvent", "sessionStorage", "localStorage"]) {
  globalThis[name] = dom.window[name];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.getElementById("root"));
const now = Date.now();
const past = new Date(now - 24 * 60 * 60 * 1000).toISOString();
const recent = new Date(now - 60 * 1000).toISOString();
const future = new Date(now + 24 * 60 * 60 * 1000).toISOString();
const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
function announcement(id, title) {
  return { id, title, body: "ข้อความจาก QA", category: "QA Update", priority: "Important",
    popupMode: "Once", deliveryModel: "immediate-reminder", showImmediately: true,
    reminderEnabled: false, reminderAt: "", repeatMode: "once", dailyStartTime: "",
    dailyEndTime: "", displayMode: "Media Only", tickerMode: "scroll",
    tickerTextColor: "#33264B", actionRequired: "Read Only",
    startsAt: past, endsAt: future, targetAll: true,
    targetRoles: [], targetTeams: [], targetUsernames: [],
    media: [{ id: "img", type: "image", url: image, label: title }],
    createdBy: "qa", createdByName: "QA Reviewer", createdAt: past,
    updatedAt: past, archived: false };
}
const alreadyRead = announcement("already-read", "ประกาศที่เคยอ่านแล้ว");
const pending = announcement("pending-new", "ประกาศใหม่");
const reader = { id: "already-read__qa", announcementId: alreadyRead.id,
  username: "qa", displayName: "QA Reviewer", readAt: recent,
  acknowledgedAt: recent, lastShownAt: recent, immediateShownAt: recent,
  immediateReadAt: recent, reminderShownAt: "", reminderReadAt: "" };
const fixture = globalThis.__announcementStatsFixture = {
  announcements: [alreadyRead], receipts: [reader], announcementListeners: [],
  receiptListeners: [], receiptScopes: [], writes: [], published: [],
  notifyReceipts() {
    for (const { callback, username } of this.receiptListeners) {
      callback(this.receipts.filter(x => !username || x.username === username));
    }
  },
};
const store = `
const f = () => globalThis.__announcementStatsFixture;
export function subscribeStoredAnnouncements(callback) {
  f().announcementListeners.push(callback);
  queueMicrotask(() => callback(f().announcements));
  return () => { f().announcementListeners = f().announcementListeners.filter(x => x !== callback); };
}
export function subscribeAnnouncementReceipts(callback, onError, username = "") {
  const normalized = String(username || "").trim().toLowerCase();
  f().receiptScopes.push(normalized);
  const entry = { callback, username: normalized };
  f().receiptListeners.push(entry);
  queueMicrotask(() => callback(f().receipts.filter(x => !normalized || x.username === normalized)));
  return () => { f().receiptListeners = f().receiptListeners.filter(x => x !== entry); };
}
export async function upsertAnnouncementReceipt(value) {
  const entries = f().receipts;
  const i = entries.findIndex(x => x.announcementId === value.announcementId && x.username === value.username);
  if (i < 0) entries.push(value);
  else entries[i] = value;
  f().writes.push(value);
  f().notifyReceipts();
}
export async function upsertStoredAnnouncement(item) {
  const record = { ...item, createdAt: item.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  f().published.push(record);
  f().announcements = [record, ...f().announcements.filter(x => x.id !== record.id)];
  for (const callback of f().announcementListeners) callback(f().announcements);
  return record;
}
export async function deleteStoredAnnouncement() { throw Error("not available"); }
export async function fetchStoredAnnouncement() { return null; }
`;
const click = async (button) => {
  assert.ok(button, "expected control");
  await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
};
const button = (label) => [...document.querySelectorAll("button")].find(b => b.textContent.trim() === label);
const fill = async (element, value) => {
  assert.ok(element, "expected input");
  const proto = element.tagName === "TEXTAREA" ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
try {
  const out = resolve(dir, "hub.mjs");
  await build({ entryPoints: ["src/AnnouncementHub.tsx"], outfile: out,
    bundle: true, format: "esm", platform: "node", packages: "external",
    loader: { ".css": "empty" }, logLevel: "silent",
    plugins: [{ name: "mock-announcement-store", setup(build) {
      build.onResolve({ filter: /^\.\/announcementStore$/ }, () => ({ path: "store", namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: store, loader: "js" }));
    } }] });
  const { default: AnnouncementHub } = await import(pathToFileURL(out));
  await act(async () => root.render(React.createElement(AnnouncementHub, {
    currentUser: { username: "qa", displayName: "QA Reviewer", role: "Quality Assurance" },
    users: [], shortcutVisible: true, onOpenShortcut() {},
  })));
  assert.equal(document.querySelector('[aria-label="ปิดประกาศ"]'), null, "already read announcement must not reopen");
  assert.deepEqual(fixture.receiptScopes, ["qa"], "normal inbox uses only personal receipts");

  await click(document.querySelector('[aria-label="ประกาศและกล่องข้อความ"]'));
  await click(button("สถิติการอ่าน"));
  assert.deepEqual(fixture.receiptScopes, ["qa", ""], "manager statistics subscribes separately without removing personal receipt scope");
  assert.equal(fixture.receiptListeners.filter(x => x.username === "qa").length, 1, "personal subscription stays active");
  assert.equal(document.querySelector('[aria-label="ปิดประกาศ"]'), null, "opening statistics cannot reopen a read popup");
  assert.ok(document.body.textContent.includes("อ่านแล้ว 1"), "statistics still show manager-wide receipts");
  assert.ok(document.body.textContent.includes("รับทราบแล้ว 1"), "acknowledgement statistics are retained");
  assert.equal(fixture.writes.length, 0, "opening statistics must not create false delivery receipts");

  await act(async () => {
    fixture.announcements = [pending, alreadyRead];
    for (const listener of fixture.announcementListeners) listener(fixture.announcements);
  });
  assert.equal(document.querySelector('[aria-label="ปิดประกาศ"]'), null, "unread deliveries do not interrupt the statistics overlay");
  await click(button("ปิด"));
  assert.ok(document.querySelector('[aria-label="ปิดประกาศ"]'), "genuinely unread announcement appears after closing statistics");
  await click(document.querySelector('[aria-label="ปิดประกาศ"]'));
  assert.equal(document.querySelector('[aria-label="ปิดประกาศ"]'), null, "acknowledging new announcement closes popup");
  assert.ok(fixture.receipts.some(x => x.announcementId === pending.id && Boolean(x.immediateReadAt)),
    "new receipt records acknowledgement");
  await click(document.querySelector('[aria-label="ประกาศและกล่องข้อความ"]'));
  await click(button("สถิติการอ่าน"));
  assert.equal(document.querySelector('[aria-label="ปิดประกาศ"]'), null, "reopening stats after acknowledgement does not repeat popup");
  console.log("PASS announcement read stats keeps personal receipts, shows totals and never reopens already-read popups");

  // Publishing a scheduled announcement must still display its immediate first
  // popup to the publisher, even with the management panel open.
  await click(button("จัดการประกาศ"));
  const titleInput = [...document.querySelectorAll("label")]
    .find(x => x.textContent.includes("หัวข้อประกาศ"))?.querySelector("input");
  const bodyInput = [...document.querySelectorAll("label")]
    .find(x => x.textContent.includes("รายละเอียดเมื่อกด Media"))?.querySelector("textarea");
  await fill(titleInput, "QA First Immediate Delivery");
  await fill(bodyInput, "รายละเอียดประกาศใหม่");
  await fill(document.querySelector('input[placeholder="URL รูปภาพหรือวิดีโอ"]'), "https://example.com/qa-test-image.png");
  await click(button("เพิ่ม"));
  const repeatToggle = [...document.querySelectorAll("button")].find(x => x.textContent.includes("แจ้งเตือนซ้ำตามกำหนด"));
  await click(repeatToggle);
  await click(button("บันทึก ส่งทันที และตั้งเตือน"));
  assert.equal(fixture.published.length, 1, "announcement should save once");
  assert.equal(fixture.published[0].showImmediately, true);
  assert.equal(fixture.published[0].reminderEnabled, true);
  assert.ok(new Date(fixture.published[0].reminderAt).getTime() > Date.now(), "reminder time is in the future");
  assert.ok(document.querySelector('[aria-label="ปิดประกาศ"]'),
    "publisher must see immediate first popup while management stays open");
  await click(document.querySelector('[aria-label="ปิดประกาศ"]'));
  assert.equal(document.querySelector('[aria-label="ปิดประกาศ"]'), null,
    "first delivery should close on acknowledgement");
  assert.ok(fixture.receipts.some(x => x.announcementId === fixture.published[0].id && Boolean(x.immediateReadAt)));
  await click(button("สถิติการอ่าน"));
  assert.equal(document.querySelector('[aria-label="ปิดประกาศ"]'), null,
    "after publishing, opening statistics cannot show the first delivery again");
  console.log("PASS first immediate popup displays once before a future scheduled reminder");
} finally {
  await act(async () => root.unmount());
  dom.window.close();
  delete globalThis.__announcementStatsFixture;
  await rm(dir, { recursive: true, force: true });
}
