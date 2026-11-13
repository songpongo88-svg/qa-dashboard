import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "https://qa-dashboard.test/?tab=dashboard", pretendToBeVisual: true,
});
for (const key of ["window", "document", "HTMLElement", "MutationObserver", "Event", "MouseEvent"]) {
  globalThis[key] = dom.window[key];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__sparkTestWallet = { firstLogin: null, sparkJourney2026: null };
globalThis.__sparkTestError = false;
globalThis.__sparkTestReads = [];
await mkdir(resolve("node_modules/.cache"), { recursive: true });
const work = await mkdtemp(resolve("node_modules/.cache/quest-promo-test-"));
const { createRoot } = await import("react-dom/client");
const root = createRoot(document.querySelector("#root"));

try {
  const outfile = resolve(work, "spark-quest-announcement.mjs");
  await build({
    entryPoints: ["src/SparkQuestAnnouncement.tsx"], outfile,
    bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
    loader: { ".css": "empty" },
    plugins: [{
      name: "mock-qa-sparks-wallet",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/qaSparksStore$/ }, args => ({
          namespace: "quest-wallet-mock", path: args.path,
        }));
        builder.onLoad({ filter: /.*/, namespace: "quest-wallet-mock" }, () => ({
          loader: "js",
          contents: `
            export async function getSparksAccount(username, options) {
              globalThis.__sparkTestReads.push({ username, options });
              if (globalThis.__sparkTestError) throw new Error("wallet unavailable");
              return globalThis.__sparkTestWallet;
            }
          `,
        }));
      },
    }],
  });
  const {
    SparkQuestAnnouncementPopup, sparkAnnouncementActive, dismissedForLogin,
  } = await import(pathToFileURL(outfile).href);
  assert.equal(sparkAnnouncementActive(new Date("2026-12-25T16:59:59.000Z")), true);
  assert.equal(sparkAnnouncementActive(new Date("2026-12-25T17:00:00.000Z")), false);

  const realDate = Date;
  // Freeze the promotion window for repeatable tests independent of current calendar date.
  const FakeDate = class extends Date {
    constructor(...args) {
      super(...(args.length ? args : ["2026-11-13T10:00:00.000Z"]));
    }
    static now() { return realDate.parse("2026-11-13T10:00:00.000Z"); }
  };
  globalThis.Date = FakeDate;
  let joined = 0;
  const popup = () => document.querySelector('[data-spark-quest-announcement-popup="true"]');
  const render = async (sessionId, blocked = false, username = "test-user") => {
    await act(async () => {
      root.render(React.createElement(SparkQuestAnnouncementPopup, {
        username, sessionId, blocked, onJoin: () => joined++,
      }));
      await Promise.resolve();
    });
  };

  await render("login-a");
  assert.ok(popup(), "first login with two unclaimed quests should show popup");
  assert.equal(globalThis.__sparkTestReads.length, 1);
  assert.deepEqual(globalThis.__sparkTestReads[0].options,
    { historyLimit: 0, sessionId: "login-a", forceRefresh: true }, "verify wallet once per login, no history scans");

  await act(async () => popup().querySelector(".spark-promo-close")
    .dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(popup(), null, "close hides popup for the current login");
  assert.equal(dismissedForLogin("test-user", "login-a"), true);
  await render("login-a");
  assert.equal(popup(), null, "same login does not show again after rerender");
  assert.equal(globalThis.__sparkTestReads.length, 1);

  await render("login-b");
  assert.ok(popup(), "a new real login must show the popup again");
  assert.equal(globalThis.__sparkTestReads.length, 2);
  await act(async () => popup().querySelector('[data-spark-quest-join="true"]')
    .dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(joined, 1);
  assert.equal(popup(), null);
  assert.equal(dismissedForLogin("test-user", "login-b"), true, "joining records current session only");

  globalThis.__sparkTestWallet = { firstLogin: { amount: 100 }, sparkJourney2026: null };
  await render("login-c");
  assert.ok(popup(), "fruit completed but journey unclaimed must continue to remind");
  assert.equal(globalThis.__sparkTestReads.length, 3);

  globalThis.__sparkTestWallet = { firstLogin: { amount: 100 }, sparkJourney2026: { amount: 500 } };
  await render("login-d");
  assert.equal(popup(), null, "never remind when both quests are complete");
  assert.equal(globalThis.__sparkTestReads.length, 4);

  globalThis.__sparkTestError = true;
  await render("login-e");
  assert.equal(popup(), null, "wallet failure must not guess whether quests are unclaimed");
  assert.equal(globalThis.__sparkTestReads.length, 5);

  globalThis.__sparkTestError = false;
  globalThis.__sparkTestWallet = { firstLogin: null, sparkJourney2026: null };
  await render("login-f", true);
  assert.equal(popup(), null, "other screens and urgent popups take priority");
  assert.equal(globalThis.__sparkTestReads.length, 5, "no wallet read until dashboard popup is permitted");
  await render("login-f", false);
  assert.ok(popup(), "eligible popup appears once dashboard is ready");
  assert.equal(globalThis.__sparkTestReads.length, 6);
  await render("login-f", true);
  await render("login-f", false);
  assert.ok(popup(), "temporary blocking does not lose an unacknowledged reminder");
  assert.equal(globalThis.__sparkTestReads.length, 6, "blocked/unblocked rerender must reuse per-login read");

  console.log("PASS Spark Quest announcement: once per QA login, repeated next login until both complete, backend wallet check, fail-closed, priority blocking and expiry");
} finally {
  globalThis.Date = Date;
  await act(async () => root.unmount());
  dom.window.close();
  await rm(work, { recursive: true, force: true });
}
