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
  const tracker = await readFile("src/TrueMoneyTracker.tsx", "utf8");
  assert.match(tracker, /RewardActionConfirmModal/, "TrueMoney payout confirmation uses shared custom app popup");
  assert.match(tracker, /data-truemoney-paid-action/, "TrueMoney row opens branded confirmation");
  assert.match(tracker, /onConfirm=\{\(\)=>void markPaid\(\)\}/, "one explicit confirm runs the server-authorized payout");
  assert.match(tracker, /mark-truemoney-paid/, "server controls the paid state");
  assert.doesNotMatch(tracker, /window\.confirm/, "no browser-native confirmation is allowed");
  const trueMoneyReward = main.querySelector('[data-reward-item="truemoney-20"]');
  assert.ok(trueMoneyReward, "TrueMoney Reward item is listed alongside Typing Relief");
  assert.ok(trueMoneyReward.classList.contains("qa-sparks-mini-item"), "TrueMoney uses mini slot");
  assert.ok(questCard.classList.contains("qa-sparks-mini-item"), "Daily Check-in uses mini slot");
  assert.ok(profileQuest.classList.contains("qa-sparks-mini-item"), "Profile Makeover uses mini slot");
  const lotteryQuest=main.querySelector('[data-quest-item="qa-lottery"]');
  assert.ok(lotteryQuest && lotteryQuest.classList.contains("qa-sparks-mini-item"), "QA Lottery uses the same compact Quest slot");
  assert.equal(main.querySelectorAll(".qa-sparks-quest-grid > .qa-sparks-mini-item").length,3, "all three Quests align in one grid");
  assert.equal(main.querySelectorAll(".qa-sparks-reward-grid .qa-sparks-mini-item").length,6, "Reward Center includes two existing and four new brand rewards");
  for (const id of ["punthai-65","netflix-1m","amazon-55","seven-100"]) assert.ok(main.querySelector(`[data-reward-item="${id}"]`), "new reward "+id+" renders in the compact grid");
  const displayedOrder=[...main.querySelectorAll(".qa-sparks-reward-grid .qa-sparks-mini-item")]
    .sort((a,b)=>Number(a.style.order)-Number(b.style.order))
    .map(item=>item.dataset.rewardItem);
  assert.deepEqual(displayedOrder,["seven-100","netflix-1m","truemoney-20","amazon-55","punthai-65","typing-relief"],
    "Reward Center must display all six rewards from most Sparks to least, including TrueMoney's displayed price");
  await act(async()=>main.querySelector('[data-reward-item="punthai-65"]').dispatchEvent(new MouseEvent("click",{bubbles:true})));
  const punthaiPopup=document.querySelector(".sr-modal");
  assert.ok(punthaiPopup && punthaiPopup.textContent.includes("รายละเอียดรางวัล"),
    "new reward details must read like a product promotion");
  assert.ok(punthaiPopup.textContent.includes("6,500") && punthaiPopup.textContent.includes("65"),
    "product details show Sparks and benefit");
  assert.ok(!punthaiPopup.textContent.includes("วิธีใช้งาน Item") &&
    !punthaiPopup.textContent.includes("กดใช้ Item ก่อนวันหมดอายุ"),
    "purchasing must not show the redemption how-to");
  await act(async()=>punthaiPopup.querySelector(".sr-close").dispatchEvent(new MouseEvent("click",{bubbles:true})));
  assert.equal(document.querySelector(".sr-modal"),null);

  assert.ok(questCard.textContent.includes("+50") && questCard.textContent.includes("9–22"));
  await act(async () => questCard.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  const questDialog = document.querySelector(".qa-sparks-checkin-modal");
  assert.ok(questDialog, "Daily Check-in opens a calendar dialog");
  assert.equal(questDialog.querySelectorAll(".qa-sparks-checkin-day").length,14);
  assert.equal(questDialog.querySelectorAll(".qa-sparks-checkin-day:not(:disabled)").length,0, "unverified wallet can never claim");
  await act(async () => questDialog.querySelector(".qa-sparks-checkin-close").dispatchEvent(new MouseEvent("click",{bubbles:true})));
  assert.equal(document.querySelector(".qa-sparks-checkin-modal"),null);
  assert.ok(item, "Typing Relief must be a collectible clickable Item");
  assert.equal(item.tagName, "BUTTON", "whole Item must be clickable");
  assert.equal(item.getAttribute("aria-haspopup"), "dialog");
  assert.ok(item.textContent.includes("Typing Relief") && item.textContent.includes("150"), "compact Item shows title and price");
  assert.ok(!item.textContent.includes("ดูรายละเอียด"), "Item surface is image + name + price, details are in the popup");
  assert.ok(item.classList.contains("qa-sparks-mini-item"), "Typing Relief is rendered as a compact game slot");
  assert.ok(item.querySelector(".qa-sparks-mini-art"), "Typing Relief has a dedicated mini artwork square");
  assert.ok(!item.textContent.includes("วิธีใช้งาน") && !item.textContent.includes("เงื่อนไขสำคัญ"), "full explanations must not be displayed on the Item");
  assert.ok(!main.textContent.includes("สะสมได้ 10 สิทธิ์"), "inventory rules must live inside the modal, not the Item");
  const art = item.querySelector(".qa-relief-art-svg");
  assert.ok(art && art.querySelectorAll("rect").length > 10, "real illustrated keyboard-and-ticket Artwork is required");

  await act(async () => item.dispatchEvent(new MouseEvent("click", {bubbles:true})));
  let detail = document.querySelector(".qa-sparks-reward-detail-modal");
  assert.ok(detail, "clicking Item opens the Reward Detail modal");
  assert.equal(detail.getAttribute("aria-modal"), "true");
  assert.ok(detail.querySelector('[data-reward-description="product"]') && detail.textContent.includes("เบาภารกิจพิมพ์ลง 60%"), "Reward Center presents product highlights");
  assert.ok(!detail.textContent.includes("วิธีใช้งาน Item"), "how-to steps are exclusive to owned Items");
  assert.ok(detail.textContent.includes("เงื่อนไขสำคัญ"), "reward rules belong inside the Detail modal");
  assert.ok(detail.textContent.includes("สะสมสิทธิ์ที่ยังไม่ได้ใช้ได้สูงสุด 10 สิทธิ์"), "10-ticket limit remains in product terms");
  assert.ok(detail.textContent.includes("150"), "the detail shows the actual purchase price");
  assert.ok(detail.textContent.includes("100") && detail.textContent.includes("40"), "the detail provides a 100-to-40 example");
  assert.ok(detail.textContent.includes("Word Mode"), "the reward's Word Mode restriction is explained");
  assert.ok(detail.textContent.includes("60%"), "Typing Relief must state a percentage, not a fixed 60 words");
  assert.ok(detail.textContent.includes("40"), "remaining words are shown in the 100-to-40 product benefit");
  assert.ok(!detail.textContent.includes("ลดได้สูงสุด 60 คำ"), "the old fixed-word claim must not appear");
  assert.ok(art.textContent.includes("%"), "the reward artwork must show a percent sign");
  assert.ok(detail.querySelector(".qa-sparks-reward-detail-primary:disabled"), "buy stays disabled unless wallet and session are verified");
  await act(async () => detail.querySelector(".qa-sparks-reward-detail-close").dispatchEvent(new MouseEvent("click", {bubbles:true})));
  assert.equal(document.querySelector(".qa-sparks-reward-detail-modal"), null, "detail modal closes without any purchase");
  assert.ok(main.textContent.includes("ยังไม่มีประวัติการได้รับหรือใช้ Sparks"));
  for (const mockupOnly of ["หมายเหตุการใช้งาน", "Setup in progress", "History ready", "No rewards yet", "จะกำหนดภายหลัง", "เตรียมโครงสร้างไว้แล้ว"]) {
    assert.ok(!main.textContent.includes(mockupOnly), "mockup-only status must not appear: " + mockupOnly);
  }
  assert.ok(!main.querySelector(".qa-sparks-notes"), "remove mockup-only explanatory box");
  assert.ok(!main.textContent.includes("QA Learning"),"no QA Learning added against user's request");
  assert.equal(main.querySelectorAll('[role="tab"]').length,6);
  assert.ok(main.querySelector('#qa-sparks-tab-games')?.textContent.includes("Mini Games"));
  assert.ok(!main.textContent.includes("Sparks Admin"), "ordinary users must not see admin management");
  assert.ok(!main.querySelector(".qa-sparks-reward-detail-primary"), "purchase action must be inside the detail modal only");

  const click=async (selector) => {
    const el=main.querySelector(selector);
    assert.ok(el,"missing tab "+selector);
    await act(async()=>el.dispatchEvent(new MouseEvent("click",{bubbles:true})));
  };
  await click("#qa-sparks-tab-quests");
  assert.ok(main.querySelector("#qa-sparks-panel-quests"),"Quest Center has its own tab");
  assert.equal(main.querySelectorAll('[data-quest-item="daily-checkin"]').length,1);
  await click("#qa-sparks-tab-rewards");
  assert.equal(main.querySelector("#qa-sparks-tab-rewards")?.getAttribute("aria-selected"),"true");
  assert.ok(main.querySelector("#qa-sparks-panel-rewards"),"reward tab changes content");
  await click("#qa-sparks-tab-items");
  assert.ok(main.querySelector("#qa-sparks-panel-items"),"My Items tab exists");
  assert.equal(main.querySelectorAll(".qa-sparks-owned-typing-item").length,0,"do not render unowned Typing Relief as a long card");
  assert.equal(main.querySelectorAll('[data-owned-item]').length,0,"do not fabricate inventory items");
  await click("#qa-sparks-tab-history");
  assert.ok(main.querySelector("#qa-sparks-panel-history"),"history tab changes content");
  await click("#qa-sparks-tab-overview");
  assert.ok(main.querySelector("#qa-sparks-panel-overview"),"overview tab returns");

  console.log("PASS QA Sparks: 112px RPG mini item grid, only image/name/price upfront, detail popups and no unowned Typing Relief");
} finally {
  await act(async()=>root.unmount());
  dom.window.close();
  await rm(folder,{recursive:true,force:true});
}

