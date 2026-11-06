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
  balance: 200, rewardOrders: 0, typingReliefOwned: 0, firstLogin: null,
  history: [], memberYear: currentYear, memberYearEarned: 200,
};
globalThis.__memberTestWallet = { ...baseWallet };
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
            export function invalidateSparksAccount() {}
            export async function getSparksAccount() { return { ...globalThis.__memberTestWallet }; }
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
  assert.ok(main.textContent.includes("LV.1 Spark Starter"), "200 Sparks must show Starter, not a dash");
  assert.ok(main.textContent.includes("200 Sparks · สะสมไม่จำกัด"), "annual progress must not impose a cap");
  assert.equal(main.querySelectorAll(".qa-sparks-member-tier").length, 10);
  assert.equal(main.querySelectorAll(".qa-sparks-member-tier.current").length, 1);
  assert.equal(main.querySelector(".qa-sparks-member-progress")?.getAttribute("aria-valuenow"), "200");
  const memberTitle = () => main.querySelector(".qa-sparks-member-head h2")?.textContent || "";
  assert.match(memberTitle(), /Spark Starter/);

  // Spending wallet points does not demote anyone.
  globalThis.__memberTestWallet = { ...baseWallet, balance: 10 };
  await act(async () => window.dispatchEvent(new Event("qa:sparks-updated")));
  assert.match(memberTitle(), /Spark Starter/);
  assert.ok(main.textContent.includes("10") && main.textContent.includes("Sparks"));

  globalThis.__memberTestWallet = { ...baseWallet, balance: 5, memberYearEarned: 50000 };
  await act(async () => window.dispatchEvent(new Event("qa:sparks-updated")));
  assert.match(memberTitle(), /LV.5 Spark Elite/);
  assert.equal(main.querySelectorAll(".qa-sparks-member-tier.attained").length, 4);
  assert.equal(main.querySelector(".qa-sparks-member-progress")?.getAttribute("aria-valuenow"), "50000");
  globalThis.__memberTestWallet = { ...baseWallet, balance: 700000, memberYearEarned: 700000 };
  await act(async () => window.dispatchEvent(new Event("qa:sparks-updated")));
  assert.match(memberTitle(), /LV.10 Spark Immortal/);
  assert.ok(main.textContent.includes("700,000 Sparks"));
  console.log("PASS Member Level UI: ten levels, 500k+ Immortal, no earned cap, spending never demotes");
} finally {
  await act(async () => root.unmount());
  dom.window.close();
  await rm(work, { recursive: true, force: true });
}
