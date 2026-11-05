import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";

await mkdir(resolve("node_modules/.cache"), {recursive:true});
const folder=await mkdtemp(resolve("node_modules/.cache/qa-sparks-ui-"));
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url:"https://qa-dashboard.test/?tab=qa-sparks",pretendToBeVisual:true
});
for(const key of ["window","document","HTMLElement","MutationObserver","Event","MouseEvent"])globalThis[key]=dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.querySelector("#root"));
try{
  const css=await readFile("src/qaSparks.css","utf8");
  assert.match(css,/--qa-theme-700/, "QA Sparks accent must inherit live QA theme color");
  assert.match(css,/--qa-theme-900/, "QA Sparks active navigation/panels inherit selected theme");
  assert.match(css,/@media \(max-width: 850px\)/, "responsive layout required");

  const store = await readFile("src/qaSparksStore.ts", "utf8");
  const modal = await readFile("src/FirstLoginSparksModal.tsx", "utf8");
  assert.match(store, /runTransaction/, "first-login reward must be persisted atomically");
  assert.match(store, /first-login-welcome-v1/, "first login grant must have a stable id");
  assert.match(store, /"history"/, "Sparks history records must be persisted");
  assert.match(store, /FIRST_LOGIN_REWARDS/, "prize amounts must have an explicit maximum");
  assert.match(modal, /FRUIT_CARDS\.map/, "render ten actual fruit cards");
  assert.match(modal, /claimFirstLoginSparks/, "fruit click must grant a persisted prize");
  assert.match(modal, /getSparksAccount/, "popup must check existing claim");
  assert.match(css, /qa-sparks-fruit-photo/, "fruit cards need image presentation");
    const sparksAdmin = await readFile("src/SparksAdminPanel.tsx", "utf8");
  const sparksAdminApi = await readFile("api/sparks-admin.js", "utf8");
  assert.match(sparksAdmin, /fetchStoredUserProfiles/, "Sparks admin list must reuse QA User Management when the server is unavailable");
  assert.match(sparksAdmin, /setAdminReady\(false\)/, "Sparks adjustment must be disabled if the server is unavailable");
  assert.match(sparksAdmin, /disabled=\{!adminReady/, "mutation controls must be disabled without server authorization");
  assert.match(sparksAdminApi, /FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON/, "Sparks admin should support dedicated Firebase service credentials");

  assert.match(sparksAdmin, /\/api\/sparks-admin/, "admin management must use server API");
  assert.match(sparksAdmin, /request\("adjust"/, "adjustments must use server API");
  assert.match(sparksAdmin, /request\("history"/, "admin can review other users' histories");
  assert.match(sparksAdmin, /refund/, "reward refund action must be available");
  assert.match(sparksAdminApi, /authorizeAdmin/, "server must authorize each admin request");
  assert.match(sparksAdmin, /FIRESTORE_RESOURCE_EXHAUSTED/, "quota errors must be distinguished from expired sessions");
  assert.match(sparksAdmin, /getDocsFromCache/, "offline wallet fallback must use Firestore local cache without network reads");
  assert.doesNotMatch(sparksAdmin, /await getDocs\(collection\(firebaseDb, "qa_sparks_wallets"\)\)/, "fallback may not fetch full wallet collection from network");
  assert.match(sparksAdmin, /balanceKnown/, "cached balances and unknown balances must be visibly distinguished");
  assert.match(sparksAdmin, /ยอดที่เคยโหลดไว้ ไม่ใช่ยอดเรียลไทม์/, "cached values must clearly state that they are not current");
  assert.match(sparksAdmin, /rememberBalances/, "successful admin reads must keep a short-lived session cache");
  assert.match(sparksAdmin, /selected\.balanceKnown/, "user detail should show known cached balances during quota outage");
  const qaSparksSource = await readFile("src/QASparks.tsx", "utf8");
  assert.match(qaSparksSource, /ownAccount=\{ownAccountSnapshot\}/, "the administrator's existing personal wallet is available for read-only fallback");
  assert.match(qaSparksSource, /useMemo/, "personal wallet snapshot is stable across QA Sparks rerenders");
  assert.match(sparksAdmin, /request\("reauth"/, "stale admin policy can be verified using QA password");
  assert.match(sparksAdmin, /type="password"/, "QA password re-verification must use masked password control");
  assert.match(sparksAdmin, /profiles\.filter\(\(profile\)/, "fallback directory must exclude suspended accounts");
  assert.match(sparksAdminApi, /isSuspendedProfile/, "server must filter suspended QA users");
  assert.match(sparksAdminApi, /requireActiveTarget/, "server rejects crediting suspended accounts");
  assert.match(sparksAdminApi, /qa_sparks_admin_session_grants/, "password verification must be scoped to Sparks admin without modifying central QA sessions");
  assert.match(sparksAdminApi, /qa_user_sessions/, "server must verify the stored session");
  assert.match(sparksAdminApi, /GOOGLE_SERVICE_ACCOUNT_JSON/, "writes use server-only credentials");
  assert.match(sparksAdminApi, /:commit/, "wallet and ledger updates must commit atomically");
  assert.match(sparksAdminApi, /currentDocument/, "write must reject stale wallet/history versions");
  const { default: adminApi } = await import("../api/sparks-admin.js");
  let accessStatus = 0;
  let accessPayload = null;
  const response = {
    setHeader() {},
    status(code) { accessStatus = code; return this; },
    json(value) { accessPayload = value; return value; },
  };
  await adminApi({ method: "POST", body: { action: "list", actorUsername: "ordinary-user", sessionId: "ordinary-unknown-session" } }, response);
  assert.equal(accessStatus, 403, "non-admin cannot request another user's wallets");
  assert.ok(accessPayload.error, "unauthorized request returns an error");
  const app=await readFile("src/App.tsx","utf8");
  for(const piece of [
    '"qa-sparks"', 'import QASparks from "./QASparks"',
    'key: "qa-sparks"', 'icon: "gift"', '<QASparks username=',
  ])assert.ok(app.includes(piece),"App must register QA Sparks navigation: "+piece);
  const rewardsGroup=app.indexOf('id: "rewards"');
  const systemGroup=app.indexOf('id: "system"');
  const accountGroup=app.indexOf('id: "account"');
  assert.ok(rewardsGroup>=0 && systemGroup>rewardsGroup && accountGroup>systemGroup, "Rewards is its own sidebar section");
  assert.ok(app.slice(rewardsGroup,systemGroup).includes('key: "qa-sparks"'), "QA Sparks belongs in Rewards");
  assert.ok(!app.slice(systemGroup,accountGroup).includes('key: "qa-sparks"'), "QA Sparks must not be in System");

  const compiled=resolve(folder,"QASparks.mjs");
  await build({
    entryPoints:["src/QASparks.tsx"],outfile:compiled,
    bundle:true,platform:"node",format:"esm",packages:"external",
    loader:{".css":"empty"},logLevel:"silent"
  });
  const {default:QASparks}=await import(pathToFileURL(compiled).href);
  await act(async()=>root.render(React.createElement(QASparks,{displayName:"QA Staff"})));
  const main=document.querySelector('[data-qa-sparks="true"]');
  assert.ok(main, "dedicated QA Sparks page rendered");
  assert.equal(main.getAttribute("data-sparks-data-mode"),"not-configured", "must not claim actual ledger data");
  assert.ok(main.textContent.includes("My QA Sparks / Reward Center"));
  assert.ok(main.textContent.includes("Typing Relief"), "first reward item must render");
  assert.ok(main.textContent.includes("150"), "reward price must be visible");
  assert.ok(main.textContent.includes("60 คำ"), "word reduction must be visible");
  assert.ok(main.textContent.includes("สะสมได้ 10 สิทธิ์"), "inventory cap must be visible");
  assert.ok(main.textContent.includes("ยังไม่มีประวัติการได้รับหรือใช้ Sparks"));
  for (const mockupOnly of ["หมายเหตุการใช้งาน", "Setup in progress", "History ready", "No rewards yet", "จะกำหนดภายหลัง", "เตรียมโครงสร้างไว้แล้ว"]) {
    assert.ok(!main.textContent.includes(mockupOnly), "mockup-only status must not appear: " + mockupOnly);
  }
  assert.ok(!main.querySelector(".qa-sparks-notes"), "remove mockup-only explanatory box");
  assert.ok(!main.textContent.includes("QA Learning"),"no QA Learning added against user's request");
  assert.equal(main.querySelectorAll('[role="tab"]').length,3);
  assert.ok(!main.textContent.includes("Sparks Admin"), "ordinary users must not see admin management");
  assert.ok(main.querySelector(".qa-sparks-reward-item button:disabled"), "do not enable purchase without a verified wallet and session");

  const click=async (selector) => {
    const el=main.querySelector(selector);
    assert.ok(el,"missing tab "+selector);
    await act(async()=>el.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  };
  await click("#qa-sparks-tab-rewards");
  assert.equal(main.querySelector("#qa-sparks-tab-rewards")?.getAttribute("aria-selected"),"true");
  assert.ok(main.querySelector("#qa-sparks-panel-rewards"),"reward tab changes content");
  await click("#qa-sparks-tab-history");
  assert.ok(main.querySelector("#qa-sparks-panel-history"),"history tab changes content");
  await click("#qa-sparks-tab-overview");
  assert.ok(main.querySelector("#qa-sparks-panel-overview"),"overview tab returns");

  console.log("PASS QA Sparks: themed Typing Relief card, 150 Sparks cost, 60-word reduction, 10-slot cap, safe disabled purchase, sidebar routing and History");
} finally {
  await act(async()=>root.unmount());
  dom.window.close();
  await rm(folder,{recursive:true,force:true});
}
