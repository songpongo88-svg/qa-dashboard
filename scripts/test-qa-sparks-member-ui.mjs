import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";

await mkdir(resolve("node_modules/.cache"), { recursive: true });
const work = await mkdtemp(resolve("node_modules/.cache/annual-member-ui-"));
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "https://qa-dashboard.test/?tab=qa-sparks", pretendToBeVisual: true,
});
for (const key of ["window", "document", "HTMLElement", "MutationObserver", "Event", "MouseEvent"]) globalThis[key] = dom.window[key];
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const currentYear = Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date()));
const baseWallet = {
  balance: 200, rewardOrders: 0, typingReliefOwned: 0,
  firstLogin: {cardId:"apple",cardName:"Apple Spark",amount:200,claimedAt:"2026-11-09T01:00:00Z"},
  history: [], memberYear: currentYear, memberYearEarned: 200,
};
globalThis.__memberTestWallet = { ...baseWallet };
globalThis.__memberTestReads = 0;
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.querySelector("#root"));
try {
  const compiled = resolve(work, "QASparksMember.mjs");
  await build({
    entryPoints: ["src/QASparks.tsx"], outfile: compiled,
    bundle: true, platform: "node", format: "esm", packages: "external",
    loader: { ".css": "empty" }, logLevel: "silent",
    plugins: [{
      name: "mock-qa-sparks-wallet",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/qaSparksStore$/ }, (args) => ({
          path: args.path, namespace: "member-wallet-mock",
        }));
        builder.onLoad({ filter: /.*/, namespace: "member-wallet-mock" }, () => ({
          loader: "js",
          contents: `
            export const EMPTY_SPARKS_ACCOUNT = { balance:0, rewardOrders:0, typingReliefOwned:0, history:[], firstLogin:null, memberYear:2026, memberYearEarned:0 };
            export const sparksAccountKey = (v) => encodeURIComponent(String(v).toLowerCase());
            export const FRUIT_CARDS = [{id:"apple",name:"Apple Spark"}];
            export const randomPrizeValues = () => [100];
            export async function claimFirstLoginSparks() { throw Error("Member Level fixture already claimed first login"); }
            export function invalidateSparksAccount() {}
            export async function getSparksAccount() { globalThis.__memberTestReads++; return { ...globalThis.__memberTestWallet }; }
          `,
        }));
      },
    }],
  });
  const { default: QASparks } = await import(pathToFileURL(compiled).href);
  await act(async () => root.render(React.createElement(QASparks, {
    username: "Songpon", displayName: "Songpon Phothong",
  })));
  const main = document.querySelector('[data-qa-sparks="true"]');
  assert.ok(main);
  const memberTitle = () => {
    const card = main.querySelector(".qa-current-card .qa-member-card");
    return card ? `${card.querySelector(".qa-level-mark").textContent} ${card.querySelector("h3").textContent}` : "";
  };
  const openGuide = () => [...main.querySelectorAll("button")].find(button => button.textContent.includes("ดูระดับสมาชิกทั้งหมด"));
  assert.match(memberTitle(), /LV.1 Spark Starter/, "200 Sparks must show Starter, not a dash");
  assert.ok(main.textContent.includes("200 Sparks · สะสมไม่จำกัด"), "annual progress must not impose a cap");
  assert.equal(main.querySelectorAll(".qa-member-card").length, 1, "Overview only shows the current member card");
  assert.ok(main.querySelector('[data-member-emblem="orbit-crest"]'), "the selected Orbit Crest is used on the member card");
  assert.ok(main.querySelector(".qa-holder").textContent.includes("Songpon Phothong"), "the card uses the signed-in user's name");
  assert.ok(main.querySelector(".qa-year").textContent.includes(String(currentYear)));
  assert.equal(main.querySelector(".qa-track")?.getAttribute("aria-valuenow"), "200");
  assert.match(memberTitle(), /Spark Starter/);

  const readsBeforeGuide = globalThis.__memberTestReads;
  await act(async () => openGuide().dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(main.querySelectorAll(".qa-member-card").length, 10, "the guide reveals all ten distinct cards on demand");
  assert.equal(main.querySelectorAll('[data-member-emblem="orbit-crest"]').length, 10);
  assert.equal(main.querySelectorAll('[data-member-state="current"]').length, 1);
  assert.deepEqual([...main.querySelectorAll(".qa-member-card")].map(card => Number(card.dataset.tier)), [1,2,3,4,5,6,7,8,9,10]);
  assert.equal(globalThis.__memberTestReads, readsBeforeGuide, "opening the guide must not reload the wallet");
  await act(async () => document.activeElement.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(main.querySelectorAll(".qa-member-card").length, 1, "Escape returns to the current card");
  assert.equal(document.activeElement, openGuide(), "focus returns to the guide button");
  assert.equal(globalThis.__memberTestReads, readsBeforeGuide);

  // Spending wallet points does not demote anyone.
  globalThis.__memberTestWallet = { ...baseWallet, balance: 10 };
  await act(async () => window.dispatchEvent(new Event("qa:sparks-updated")));
  assert.match(memberTitle(), /Spark Starter/);
  assert.ok(main.textContent.includes("10") && main.textContent.includes("Sparks"));

  globalThis.__memberTestWallet = { ...baseWallet, balance: 5, memberYearEarned: 50000 };
  await act(async () => window.dispatchEvent(new Event("qa:sparks-updated")));
  assert.match(memberTitle(), /LV.5 Spark Elite/);
  assert.equal(main.querySelector(".qa-track")?.getAttribute("aria-valuenow"), "50000");
  await act(async () => openGuide().dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(main.querySelectorAll('[data-member-state="attained"]').length, 4);
  const back = [...main.querySelectorAll("button")].find(button => button.textContent.includes("กลับหน้าสมาชิก"));
  await act(async () => back.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.match(memberTitle(), /LV.5 Spark Elite/);
  globalThis.__memberTestWallet = { ...baseWallet, balance: 10, memberYearEarned: 200170 };
  await act(async () => window.dispatchEvent(new Event("qa:sparks-updated")));
  assert.match(memberTitle(), /LV.8 Spark Champion/);
  assert.ok(main.querySelector(".qa-next-copy").textContent.includes("99,830"), "next-tier gap uses annual earnings, not spendable balance");
  assert.ok(Math.abs(parseFloat(main.querySelector(".qa-track-fill").style.width) - 0.17) < 0.000001, "progress retains fractional accuracy just above a rank boundary");
  globalThis.__memberTestWallet = { ...baseWallet, balance: 700000, memberYearEarned: 700000 };
  await act(async () => window.dispatchEvent(new Event("qa:sparks-updated")));
  assert.match(memberTitle(), /LV.10 Spark Immortal/);
  assert.ok(main.textContent.includes("700,000 Sparks"));
  console.log("PASS Member Level UI: one Orbit Crest card, on-demand ten-card guide, no extra reads, keyboard/back navigation, annual progress and no demotion on spending");
} finally {
  await act(async () => root.unmount());
  dom.window.close();
  await rm(work, { recursive: true, force: true });
}
