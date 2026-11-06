import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { qaAccessCheckOverviewPatch } from "../build/qaAccessCheckOverviewPatch.js";
import { qaAccessCaseLinkPatchV2 } from "../build/qaAccessCaseLinkPatchV2.js";
import { qaAccessCheckWriteFixPatch } from "../build/qaAccessCheckWriteFixPatch.js";
import { qaAccessCheckDirectWriteFixPatch } from "../build/qaAccessCheckDirectWriteFixPatch.js";
import { qaAccessCheckQueueVisibilityFixPatch } from "../build/qaAccessCheckQueueVisibilityFixPatch.js";

await mkdir("node_modules/.cache", { recursive: true });
const folder = await mkdtemp(resolve("node_modules/.cache/quota-controls-"));
const dom = new JSDOM("<!doctype html><body><div id='root'></div></body>", { url: "https://qa.test", pretendToBeVisual: true });
for (const key of ["window", "document", "HTMLElement", "MutationObserver", "Event", "MouseEvent"]) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.querySelector("#root"));
const originalFetch = globalThis.fetch, originalNow = Date.now;
let clock = originalNow();
Date.now = () => clock;
const tick = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const render = async component => { await act(async () => root.render(component)); await tick(); };
const click = async element => { assert.ok(element); await act(async () => element.click()); await tick(); };
const focus = async () => { await act(async () => window.dispatchEvent(new Event("focus"))); await tick(); };
let fixture;
function resetFixture() {
  fixture = globalThis.__quotaControlFixture = {
    documents: new Map(), reads: [], queries: [], listeners: new Set(), writes: 0, revision: "v1", probes: 0,
    transactionQueue: Promise.resolve(),
    snapshot(path) { const value = this.documents.get(path); return { id: path.split("/").at(-1), ref: { kind: "doc", path }, exists: () => value !== undefined, data: () => value === undefined ? undefined : structuredClone(value) }; },
    rows(target) {
      const ref = target.kind === "query" ? target.ref : target;
      let rows = [...this.documents.keys()].filter(path => path.startsWith(ref.path + "/") && !path.slice(ref.path.length + 1).includes("/"))
        .map(path => this.snapshot(path));
      for (const filter of target.filters || []) {
        if (filter.kind === "where") rows = rows.filter(row => filter.op === "in" ? filter.value.includes(row.data()[filter.field]) : filter.op === ">=" ? String(row.data()[filter.field]) >= String(filter.value) : row.data()[filter.field] === filter.value);
        if (filter.kind === "order") rows.sort((a, b) => String(b.data()[filter.field] || "").localeCompare(String(a.data()[filter.field] || "")));
        if (filter.kind === "after") { const idx = rows.findIndex(row => row.id === filter.id); rows = idx < 0 ? rows : rows.slice(idx + 1); }
        if (filter.kind === "limit") rows = rows.slice(0, filter.value);
      }
      return { docs: rows };
    },
    emit() { for (const listener of this.listeners) listener.callback(listener.target.kind === "doc" ? this.snapshot(listener.target.path) : this.rows(listener.target)); },
  };
  return fixture;
}
const databaseMock = `
 const f=()=>globalThis.__quotaControlFixture;
 export const collection=(db,name)=>({kind:'collection',path:(db?.path?db.path+'/':'')+name});
 export const doc=(db,name,id)=>({kind:'doc',path:(db?.path?db.path+'/':'')+name+(id===undefined?'':'/'+id)});
 export const query=(ref,...filters)=>({kind:'query',ref,filters}),where=(field,op,value)=>({kind:'where',field,op,value});
 export const limit=value=>({kind:'limit',value}),orderBy=(field,direction)=>({kind:'order',field,direction});
 export const serverTimestamp=()=>new Date().toISOString();
 export async function getDoc(ref){f().reads.push(ref.path);return f().snapshot(ref.path)}
 export const getDocFromServer=getDoc;
 export async function getDocs(target){f().queries.push(target);return f().rows(target)}
 export const getDocsFromServer=getDocs;
 export async function getDocsFromCache(target){return f().rows(target)}
 export function onSnapshot(target,callback,error){const item={target,callback,error};f().listeners.add(item);callback(target.kind==='doc'?f().snapshot(target.path):f().rows(target));return()=>f().listeners.delete(item)}
 export async function setDoc(ref,data,options){const fixture=f();fixture.writes++;fixture.documents.set(ref.path,options?.merge?{...fixture.documents.get(ref.path),...data}:data);fixture.emit()}
 export async function deleteDoc(ref){f().documents.delete(ref.path);f().emit()}
 export function runTransaction(_db,callback){const fixture=f();const pending=fixture.transactionQueue.catch(()=>{}).then(async()=>{const writes=[];const result=await callback({get:async ref=>fixture.snapshot(ref.path),set:(ref,data,options)=>writes.push([ref,data,options]),delete:ref=>fixture.documents.delete(ref.path)});for(const args of writes)await setDoc(...args);return result});fixture.transactionQueue=pending;return pending}
 export const documentId=()=> '__name__',deleteField=()=>undefined,startAfter=doc=>({kind:'after',id:doc.id});
 export async function getCountFromServer(target){return {data:()=>({count:f().rows(target).docs.length})}}
`;
const replacements = {
  userRoleStore: `export const fetchStoredUserProfiles=async()=>[],readCachedUserProfiles=()=>[],fetchStoredRolePermissions=async()=>[];`,
};
async function bundle(name, contents, extra = {}) {
  const outfile = resolve(folder, name + ".mjs");
  await build({ stdin: { contents, loader: "tsx", resolveDir: resolve("src") }, outfile,
    bundle: true, platform: "node", format: "esm", packages: "external", loader: { ".css": "empty" }, logLevel: "silent",
    plugins: [{ name: "isolated-quota-test", setup(builder) {
      builder.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: "database", namespace: "mock" }));
      builder.onResolve({ filter: /firebaseClient$/ }, () => ({ path: "client", namespace: "mock" }));
      for (const [key, value] of Object.entries({ ...replacements, ...extra })) builder.onResolve({ filter: new RegExp("(?:^|/)" + key.replaceAll(".", "\\.") + "$") }, () => ({ path: value, namespace: "replacement" }));
      builder.onLoad({ filter: /.*/, namespace: "replacement" }, args => ({ contents: args.path, loader: "js" }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "database" ? databaseMock : "export const firebaseDb={};", loader: "js" }));
    } }],
  });
  return import(pathToFileURL(outfile).href);
}

try {
  resetFixture();
  const policy = await bundle("policy", 'export * from "./firestoreReadPolicy";');
  let calls = 0;
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([policy.sharedFirestoreRead("a", 60_000, load), policy.sharedFirestoreRead("a", 60_000, load)]), [1, 1]);
  assert.equal(await policy.sharedFirestoreRead("a", 60_000, load), 1);
  policy.invalidateFirestoreReads("a");
  assert.equal(await policy.sharedFirestoreRead("a", 60_000, load), 2);
  await assert.rejects(policy.sharedFirestoreRead("quota", 0, async () => { throw { code: "resource-exhausted" }; }));
  await assert.rejects(policy.sharedFirestoreRead("blocked", 0, load));
  assert.equal(calls, 2, "quota cooldown makes no extra remote display reads");
  clock += 300_001;
  assert.equal(await policy.sharedFirestoreRead("blocked", 0, load), 3);
  console.log("PASS shared reads: concurrent dedup, TTL, invalidation and recoverable quota cooldown");

  resetFixture();
  const settingsPath = "qa_system_settings/global";
  const open = { enabled: false, status: "open", scheduledStartAt: "", scheduledEndAt: "", autoOpenEnabled: false };
  fixture.documents.set(settingsPath, open);
  const maintenance = await bundle("maintenance", 'export {default as Runtime} from "./MaintenanceRuntime";export {maintenanceStateAt,advanceMaintenanceSchedule} from "./maintenanceControlStore";');
  await render(React.createElement(maintenance.Runtime));
  assert.equal(fixture.listeners.size, 1);
  for (let i = 0; i < 10; i++) await focus();
  assert.equal(fixture.reads.length + fixture.queries.length, 0, "focus and normal timer work reuse the live maintenance state");
  await render(null);
  assert.equal(fixture.listeners.size, 0, "root listener detaches on unmount");
  const scheduled = { ...open, status: "scheduled", scheduledStartAt: new Date(clock - 1).toISOString(), scheduledEndAt: new Date(clock + 60_000).toISOString(), autoOpenEnabled: true };
  assert.equal(maintenance.maintenanceStateAt(scheduled, clock).status, "active");
  assert.equal(maintenance.maintenanceStateAt(scheduled, clock + 60_001).status, "completed");
  fixture.documents.set(settingsPath, scheduled);
  const transitions = await Promise.all([maintenance.advanceMaintenanceSchedule(), maintenance.advanceMaintenanceSchedule()]);
  assert.equal(transitions.filter(r => r.changed).length, 1);
  assert.equal(fixture.writes, 1, "concurrent scheduled transitions persist once");
  console.log("PASS Maintenance: one listener, no focus polling, exact schedule boundaries and atomic transition");

  resetFixture();
  const wallet = { username: "Songpon", balance: 500, totalEarned: 500, totalSpent: 0, memberYear: 2026, memberYearEarned: 500, rewardOrders: 0 };
  fixture.documents.set("qa_sparks_wallets/songpon", wallet);
  for (let i = 0; i < 100; i++) fixture.documents.set("qa_sparks_wallets/songpon/history/" + i, { createdAt: String(i).padStart(3, "0"), title: "fixture", amount: 1, balanceAfter: 500 });
  const sparks = await bundle("sparks", 'export {default as Page} from "./QASparks";export {getSparksAccount,invalidateSparksAccount} from "./qaSparksStore";');
  await Promise.all([sparks.getSparksAccount("Songpon", { historyLimit: 0 }), sparks.getSparksAccount("Songpon", { historyLimit: 0 })]);
  assert.equal(fixture.reads.length, 1);assert.equal(fixture.queries.length, 0, "eligibility never loads History");
  let listCalls = 0, quotaLimited = false;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (quotaLimited) return { ok: false, json: async () => ({ code: "FIRESTORE_RESOURCE_EXHAUSTED", error: "Firestore quota exceeded" }) };
    if (body.action === "list") { listCalls++; return { ok: true, json: async () => ({ users: [{ ...wallet, earned: 500, spent: 0, status: "Active", role: "Quality Assurance", displayName: "Fixture QA", firstLogin: null }] }) }; }
    assert.equal(body.action, "history");
    return { ok: true, json: async () => ({ username: "Songpon", wallet: { balance: 500, earned: 500, spent: 0, rewardOrders: 0, firstLogin: null }, history: [], truncated: false }) };
  };
  const props = { username: "Songpon", displayName: "Fixture QA", adminAccess: true, adminSessionId: "fixture-session", active: true };
  await render(React.createElement(sparks.Page, props));
  assert.equal(fixture.queries.length, 1);assert.equal(fixture.rows(fixture.queries[0]).docs.length, 5);
  for (let i = 0; i < 10; i++) await focus();
  assert.equal(fixture.reads.length, 1);assert.equal(fixture.queries.length, 1, "repeated focus shares wallet and preview cache");
  await click(document.querySelector("#qa-sparks-tab-admin"));
  assert.equal(listCalls, 1);
  clock += 60_001;
  for (let i = 0; i < 5; i++) await focus();
  assert.equal(fixture.reads.length, 2);assert.equal(listCalls, 1, "new personal wallet snapshot cannot reload the Admin directory");
  await render(React.createElement(sparks.Page, { ...props, active: false }));
  clock += 60_001;await focus();
  assert.equal(fixture.reads.length, 2, "a retained inactive Sparks page does not read on focus");
  await render(React.createElement(sparks.Page, props));
  await click(document.querySelector("#qa-sparks-tab-history"));
  assert.equal(document.querySelectorAll('.qa-sparks-history-item').length, 100);
  fixture.documents.set("qa_sparks_wallets/songpon", { ...wallet, balance: 650 });
  await act(async () => window.dispatchEvent(new Event("qa:sparks-updated")));await tick();
  assert.ok(document.querySelector('.qa-sparks-balance').textContent.includes("650"), "a successful mutation invalidates the wallet immediately");
  await click(document.querySelector("#qa-sparks-tab-admin"));
  const beforeQuotaReads = fixture.reads.length + fixture.queries.length;
  quotaLimited = true;
  await click([...document.querySelectorAll("button")].find(button => button.textContent === "รีเฟรชข้อมูล"));
  await focus();
  assert.equal(fixture.reads.length + fixture.queries.length, beforeQuotaReads, "Admin quota fallback never starts extra profile/wallet/history network reads");
  assert.ok(document.querySelector('[role="alert"]')?.textContent.includes("Firestore"));
  await render(null);
  console.log("PASS Sparks: eligibility 1 doc, Overview 5 rows, History 100 rows, focus dedup, hidden-page pause, Admin isolation and immediate updates");

  resetFixture();
  const quest = id => ({ id, word: "ทดสอบ", mode: "word", repeatCount: 3, allowedMistakes: 0, timeLimitSeconds: 60, assignedAt: "2026-11-05" });
  fixture.documents.set("qa_typing_challenges/agent", { username: "agent", queue: [quest("canonical")] });
  fixture.documents.set("qa_typing_challenges/old-random-id", { username: "Agent", queue: [quest("legacy")] });
  fixture.documents.set("qa_typing_challenges/other", { username: "Other", queue: [quest("not-mine")] });
  let typingSource = await readFile("src/qaTypingChallengeStore.ts", "utf8");
  for (const factory of [qaAccessCheckOverviewPatch, qaAccessCaseLinkPatchV2, qaAccessCheckWriteFixPatch, qaAccessCheckDirectWriteFixPatch, qaAccessCheckQueueVisibilityFixPatch]) {
    const result = factory().transform.call({ error(message) { throw new Error(message); } }, typingSource, resolve("src/qaTypingChallengeStore.ts"));
    if (result) typingSource = result.code;
  }
  const typing = await bundle("typing", typingSource);
  let queue = [];
  const stop = typing.subscribeQaTypingChallengeQueue("Agent", rows => queue = rows);
  assert.deepEqual(queue.map(row => row.id).sort(), ["canonical", "legacy"]);
  assert.ok([...fixture.listeners].every(({ target }) => target.kind === "doc" || target.kind === "query" && target.filters.some(f => f.field === "username" && f.op === "in")));
  assert.deepEqual((await typing.fetchQaTypingChallengeQueue("Agent")).map(row => row.id).sort(), ["canonical", "legacy"]);
  assert.ok(fixture.queries.every(q => q.kind === "query" && q.filters.some(f => f.field === "username")));
  await typing.removeQaTypingChallenge("Agent", "legacy");
  assert.ok(fixture.documents.has("qa_typing_challenges/other"));
  assert.deepEqual(queue.map(row => row.id), ["canonical"]);
  stop();assert.equal(fixture.listeners.size, 0);
  console.log("PASS QA Access: production patches, owner-scoped listeners/reads, canonical plus legacy IDs, remove and detach");

  resetFixture();
  fixture.documents.set("qa_appeal_events/a", { event_type: "appeal_request_submitted", created_at: "2026-11-05", details: { requestId: "request-1" } });
  fixture.documents.set("qa_appeal_events/b", { event_type: "appeal_internal_message", created_at: "2026-11-05", details: { requestId: "request-1", seniorUsername: "Senior" } });
  const inbox = await bundle("inbox", 'export {fetchAppealInboxSnapshot,clearAppealEventReadCache} from "./appealStore";', {
    dashboardRevision: `export async function fetchDashboardRevision(){const f=globalThis.__quotaControlFixture;f.probes++;return f.revision}`,
    appealCaseAvailability: 'export const checkAppealSourceCases=async rows=>rows;',
    evaluationStore: 'export const fetchStoredEvaluationsForCases=async()=>[];',
    agentIdentity: 'export const canonicalizeAgentName=v=>v||"",canonicalAgentIdentityKey=v=>v||"";',
    monthlyResultLockStore: 'export const monthlyResultScope=()=>({}),prepareMonthlyResultReferences=async()=>[],readMonthlyResultReferences=async()=>{},touchMonthlyResults=()=>{};export class MonthlyResultLockCheckError extends Error{}',
  });
  const qa = { username: "Songpon", role: "Quality Assurance" };
  assert.equal((await inbox.fetchAppealInboxSnapshot(qa)).events.length, 1);
  const initialQueries = fixture.queries.length;
  await inbox.fetchAppealInboxSnapshot(qa);await inbox.fetchAppealInboxSnapshot(qa);
  assert.equal(fixture.queries.length, initialQueries, "unchanged Inbox revision cannot download the event collection again");
  fixture.documents.set("qa_appeal_events/c", { event_type: "appeal_request_reviewed", created_at: "2026-11-06", details: { requestId: "request-1" } });fixture.revision = "v2";
  assert.equal((await inbox.fetchAppealInboxSnapshot(qa)).events.length, 2);
  assert.equal(fixture.queries.length, initialQueries + 1, "QA event and discussion projections share the refreshed snapshot");
  inbox.clearAppealEventReadCache();await inbox.fetchAppealInboxSnapshot(qa);
  assert.equal(fixture.queries.length, initialQueries + 2);
  console.log("PASS Inbox: unchanged revision reuses events, changed revision refreshes both projections, explicit invalidation refreshes");

  resetFixture();
  fixture.documents.set("qa_access_logs/old-chat", {
    event_type: "chat_message", created_at: "2026-11-06T02:00:00.000Z",
    username: "Agent", details: { message: "existing conversation" },
  });
  fixture.documents.set("qa_access_logs/old-presence", {
    event_type: "user_presence", created_at: "2026-11-06T01:59:00.000Z", username: "Agent",
  });
  const chat = await bundle("chat-incremental", 'export {fetchChatEventsIncrementally} from "./usageLog";');
  const firstChat = await chat.fetchChatEventsIncrementally();
  assert.equal(firstChat.filter(x => x.event_type === "chat_message").length, 1);
  assert.equal(fixture.queries.length, 1);
  assert.ok(fixture.queries[0].filters.some(x => x.kind === "limit" && x.value === 1200));
  clock += 6_000;
  const sameChat = await chat.fetchChatEventsIncrementally();
  assert.deepEqual(sameChat.map(x => x.id), firstChat.map(x => x.id));
  assert.ok(fixture.queries[1].filters.some(x => x.kind === "where" && x.op === ">="));
  assert.ok(!fixture.queries[1].filters.some(x => x.kind === "limit" && x.value === 1200),
    "idle Chat must never download the full history again");
  fixture.documents.set("qa_access_logs/new-chat", {
    event_type: "chat_message", created_at: "2026-11-06T02:01:00.000Z",
    username: "Senior", details: { message: "new message" },
  });
  clock += 6_000;
  const nextChat = await chat.fetchChatEventsIncrementally();
  assert.deepEqual(nextChat.filter(x => x.event_type === "chat_message").map(x => x.id),
    ["new-chat", "old-chat"], "incremental Chat merges new and old messages");
  const beforeParallel = fixture.queries.length;
  clock += 6_000;
  await Promise.all([chat.fetchChatEventsIncrementally(), chat.fetchChatEventsIncrementally()]);
  assert.equal(fixture.queries.length, beforeParallel + 1, "concurrent Chat checks share one read");
  console.log("PASS Chat: first full snapshot, idle cursor reads, new-message merge and concurrent dedup");
} finally {
  await act(async () => root.unmount());
  globalThis.fetch = originalFetch;Date.now = originalNow;dom.window.close();
  delete globalThis.__quotaControlFixture;
  await rm(folder, { recursive: true, force: true });
}
