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
    const app=await readFile("src/App.tsx","utf8");
  for(const piece of [
    '"qa-sparks"', 'import QASparks from "./QASparks"',
    'key: "qa-sparks"', 'icon: "gift"', '<QASparks displayName=',
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
  assert.ok(main.textContent.includes("ยังไม่มีของรางวัล"));
  assert.ok(main.textContent.includes("ยังไม่มีประวัติการได้รับหรือใช้ Sparks"));
  for (const mockupOnly of ["หมายเหตุการใช้งาน", "Setup in progress", "History ready", "No rewards yet", "จะกำหนดภายหลัง", "เตรียมโครงสร้างไว้แล้ว"]) {
    assert.ok(!main.textContent.includes(mockupOnly), "mockup-only status must not appear: " + mockupOnly);
  }
  assert.ok(!main.querySelector(".qa-sparks-notes"), "remove mockup-only explanatory box");
  assert.ok(!main.textContent.includes("QA Learning"),"no QA Learning added against user's request");
  assert.equal(main.querySelectorAll('[role="tab"]').length,3);
  assert.ok(!main.textContent.includes("เปิดดูรางวัล"),"do not display an unusable reward button");

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

  console.log("PASS QA Sparks: themed UI, sidebar routing, empty Reward Center/History, active tabs, no rules or QA Learning");
} finally {
  await act(async()=>root.unmount());
  dom.window.close();
  await rm(folder,{recursive:true,force:true});
}
