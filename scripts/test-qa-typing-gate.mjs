import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React, { act } from "react";
import { JSDOM } from "jsdom";
import { qaAccessCaseLinkPatchV2 } from "../build/qaAccessCaseLinkPatchV2.js";

const temporary = await mkdtemp(resolve(".qa-typing-test-"));
const dom = new JSDOM('<div id="root"></div>', { url: "https://qa.test/" });
const keys = ["window", "document", "navigator", "HTMLElement", "HTMLTextAreaElement", "Event", "InputEvent", "CompositionEvent", "IS_REACT_ACT_ENVIRONMENT", "__qaTypingFixture"];
const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const key of keys.slice(0, 9)) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
const timers = new Map();
let timerId = 0;
window.setInterval = (callback) => { timers.set(++timerId, callback); return timerId; };
window.clearInterval = (id) => timers.delete(id);

let root;
let fixture;
try {
  const sourcePath = resolve("src/QaTypingGate.tsx");
  const source = await readFile(sourcePath, "utf8");
  const context = { error(message) { throw new Error(message); } };
  const transformed = qaAccessCaseLinkPatchV2().transform.call(context, source, sourcePath)?.code;
  assert.ok(transformed, "the production case-link transform must still apply");
  const output = resolve(temporary, "gate.mjs");
  await build({
    stdin: { contents: transformed, loader: "tsx", resolveDir: resolve("src"), sourcefile: sourcePath },
    outfile: output, bundle: true, packages: "external", platform: "node", format: "esm", logLevel: "silent",
    plugins: [{
      name: "qa-typing-test-stores",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/qaTypingChallenge(?:History)?Store$/ }, (args) => ({ path: args.path, namespace: "qa-test" }));
        builder.onResolve({ filter: /^\.\/typingReliefReward$/ }, (args) => ({ path: args.path, namespace: "qa-test" }));
        builder.onLoad({ filter: /.*/, namespace: "qa-test" }, () => ({ contents: `
          export const subscribeQaTypingChallengeQueue = (...args) => globalThis.__qaTypingFixture.subscribe(...args);
          export const completeQaTypingChallenge = (...args) => globalThis.__qaTypingFixture.complete(...args);
          export const saveQaTypingChallengeHistory = (...args) => globalThis.__qaTypingFixture.save(...args);
          export const TYPING_RELIEF = { id:"typing-relief", price:150, wordsReduced:60, maxOwned:10 };
          export const typingReliefRemainingWords = (n) => Math.max(1, n-60);
          export const fetchTypingReliefState = (...args) => globalThis.__qaTypingFixture.fetchInventory(...args);
          export const typingReliefAction = (...args) => globalThis.__qaTypingFixture.action(...args);
        ` }));
      },
    }],
  });
  const { default: Gate } = await import(pathToFileURL(output).href);
  const { createRoot } = await import("react-dom/client");
  const user = { username: "typing-fixture", displayName: "Typing Fixture" };
  const challenge = (overrides = {}) => ({
    id: "fixture-1", username: user.username, displayName: user.displayName,
    word: "ยกเลิก", mode: "word", repeatCount: 4, allowedMistakes: 2, timeLimitSeconds: 8,
    assignedAt: "2026-11-02T10:00:00Z", assignedBy: "QA Fixture", caseIds: ["AA990001"], topicCode: "4", ...overrides,
  });
  const mount = async (overrides = {}, nextItems = []) => {
    if (root) await act(async () => root.unmount());
    assert.equal(timers.size, 0, "unmount cleans up the countdown");
    fixture = {
      queue: [challenge(overrides), ...nextItems], listeners: new Set(), history: [], completions: [], saveDelay: null,
      rewardState: { balance: 300, owned: 0 }, rewardCalls: [], rewardError: false,
      async fetchInventory() {
        if (this.rewardError) throw new Error("Firestore limit exceeded");
        return this.rewardState;
      },
      async action(action, name, session, input) {
        this.rewardCalls.push({ action, name, session, input });
        if (action === "redeem-typing-relief") {
          if (this.rewardState.owned >= 10 || this.rewardState.balance < 150) throw new Error("Insufficient reward entitlement");
          this.rewardState = { balance:this.rewardState.balance - 150, owned:this.rewardState.owned + 1 };
          return { updated:true, balance:this.rewardState.balance, owned:this.rewardState.owned };
        }
        if (action === "use-typing-relief") {
          if (this.rewardState.owned <= 0) throw new Error("No Typing Relief");
          const current = this.queue[0];
          if (current.id !== input.challengeId) throw new Error("Wrong challenge");
          const remainingWords = Math.max(1, current.repeatCount - 60);
          const appliedWords = current.repeatCount - remainingWords;
          this.rewardState = { ...this.rewardState, owned:this.rewardState.owned - 1 };
          this.emit([{...current,repeatCount:remainingWords},...this.queue.slice(1)]);
          return {updated:true,owned:this.rewardState.owned,balance:this.rewardState.balance,remainingWords,appliedWords};
        }
      },
      subscribe(username, callback) {
        assert.equal(username, user.username);
        this.listeners.add(callback); callback(this.queue);
        return () => this.listeners.delete(callback);
      },
      emit(queue) { this.queue = queue; for (const listener of this.listeners) listener(queue); },
      save(record) { this.history.push(structuredClone(record)); return this.saveDelay || Promise.resolve(); },
      async complete(username, id) {
        this.completions.push({ username, id });
        this.emit(this.queue.filter((item) => item.id !== id));
      },
    };
    Object.defineProperty(globalThis, "__qaTypingFixture", { configurable: true, value: fixture });
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(Gate, { currentUser: user, enabled: true })));
  };
  const field = () => document.querySelector("textarea");
  const countdown = () => document.querySelector('[role="timer"]')?.textContent;
  const verify = () => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("ตรวจสอบ"));
  const restart = () => document.querySelector('[role="alert"] button') || document.querySelector('button[aria-label="เริ่มพิมพ์ใหม่"]');
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
  const type = async (value, isComposing = false) => act(async () => {
    setValue.call(field(), value);
    field().dispatchEvent(new InputEvent("input", { bubbles: true, isComposing }));
  });
  const click = async (button) => act(async () => button.click());
  const tick = async (seconds) => {
    for (let second = 0; second < seconds; second += 1) {
      await act(async () => { for (const callback of [...timers.values()]) callback(); });
    }
  };
  const deferred = () => {
    let resolvePromise;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });
    return { promise, resolve: resolvePromise };
  };

  await mount({ allowedMistakes: 0, repeatCount: 3 });
  await type("ยก");
  assert.equal(field().disabled, false, "unfinished words are not errors");
  await tick(2);
  await type("ยกเลิก ยกเลก");
  assert.equal(fixture.history.length, 0, "the last word stays editable until committed");
  await type("ยกเลิก ยกเลก ");
  assert.equal(field().disabled, true);
  assert.equal(field().value, "ยกเลิก ยกเลก ", "failure preserves the typed text");
  assert.equal(verify().disabled, true);
  assert.match(document.querySelector('[role="alert"]').textContent, /พิมพ์ผิด 1 คำ.*ผิดได้ไม่เกิน 0 คำ/);
  assert.deepEqual(fixture.history.map(({ result, typedCount, correctCount, mistakeCount, timeUsedSeconds }) =>
    ({ result, typedCount, correctCount, mistakeCount, timeUsedSeconds })),
  [{ result: "Fail", typedCount: 2, correctCount: 1, mistakeCount: 1, timeUsedSeconds: 2 }]);
  assert.deepEqual(fixture.history[0].caseIds, ["AA990001"]);
  assert.equal(fixture.history[0].topicCode, "4");
  assert.deepEqual(fixture.history[0].mistakeDetails, [{ index: 1, expected: "ยกเลิก", typed: "ยกเลก" }]);
  await tick(20);
  assert.equal(countdown(), "0:06", "failure freezes time until an explicit restart");
  assert.equal(fixture.history.length, 1, "a failed round cannot also time out");
  assert.equal(fixture.completions.length, 0, "failure does not unlock QA");
  await click(restart());
  assert.equal(field().value, "");
  assert.equal(field().disabled, false);
  assert.equal(document.activeElement, field());
  assert.equal(countdown(), "0:08");
  assert.match(document.body.textContent, /พิมพ์แล้ว 0 \/ 3/);
  await tick(1);
  assert.equal(countdown(), "0:07");
  await type("ยกเลิก ยกเลิก ยกเลิก");
  await click(verify());
  assert.deepEqual(fixture.history.map((item) => item.result), ["Fail", "Pass"]);
  assert.equal(fixture.completions.length, 1);
  console.log("PASS zero allowance, unfinished words, frozen failure, explicit restart and subsequent pass");

  await mount({ repeatCount: 40, allowedMistakes: 2, timeLimitSeconds: 80 });
  await type("ผิด ผิด ");
  assert.equal(field().disabled, false, "exactly the allowed number of mistakes is permitted");
  await tick(1);
  await type("ผิด ผิด ผิ");
  assert.equal(field().disabled, false);
  await type("ผิด ผิด ผิด ");
  assert.equal(field().disabled, true, "the third error ends a round with two allowed errors");
  assert.equal(fixture.history[0].mistakeCount, 3);
  assert.equal(fixture.history[0].typedCount, 3, "stop before forcing all forty words");
  console.log("PASS allowance boundary and early failure before the target count");

  await mount({ word: "ขอบคุณ สำหรับข้อมูลเพิ่มเติม", mode: "sentence", allowedMistakes: 0 });
  await type("ขอบคุณ สำหรับ");
  assert.equal(field().disabled, false, "spaces inside a sentence do not commit it");
  await type("ขอบคุณ สำหรับข้อมูลเพิ่มเติม\nขอบคุณสำหรับข้อมูลเพิ่มเติม");
  assert.equal(field().disabled, false);
  await type("ขอบคุณ สำหรับข้อมูลเพิ่มเติม\nขอบคุณสำหรับข้อมูลเพิ่มเติม\n");
  assert.equal(field().disabled, true);
  assert.equal(fixture.history[0].correctCount, 1);
  assert.equal(fixture.history[0].mistakeCount, 1, "internal sentence spacing is checked exactly");
  assert.match(document.querySelector('[role="alert"]').textContent, /พิมพ์ผิด 1 รอบ/);
  console.log("PASS sentence boundaries and exact internal spacing");

  await mount({ repeatCount: 2, allowedMistakes: 0 });
  await tick(3);
  await type("ยกเลิก ผิด");
  assert.equal(field().disabled, false);
  const submit = verify();
  await act(async () => { submit.click(); submit.click(); });
  assert.equal(field().disabled, true, "Verify checks the last unit even without a delimiter");
  assert.equal(fixture.history.length, 1, "rapid Verify clicks record only one failure");
  assert.equal(countdown(), "0:05");
  await act(async () => fixture.emit([...fixture.queue]));
  assert.equal(field().disabled, true, "queue refreshes do not start a failed round automatically");
  console.log("PASS Verify fallback, duplicate-submit protection and stable failed rounds");

  await mount({ timeLimitSeconds: 3 });
  await type("ยกเลิก ยก");
  await tick(3);
  assert.equal(field().disabled, true);
  assert.equal(fixture.history[0].result, "Timeout");
  assert.equal(fixture.history[0].timeUsedSeconds, 3);
  await tick(10);
  assert.equal(fixture.history.length, 1);
  assert.equal(field().value, "ยกเลิก ยก");
  await click(restart());
  assert.equal(countdown(), "0:03");
  assert.equal(field().value, "");
  await tick(1);
  assert.equal(countdown(), "0:02");
  await tick(2);
  assert.equal(fixture.history.length, 2);
  await act(async () => fixture.emit([challenge({ id: "replacement", timeLimitSeconds: 6 })]));
  assert.equal(countdown(), "0:06");
  assert.equal(fixture.history.length, 2, "a replacement must not inherit a previous round's zero clock");
  console.log("PASS timeout stays stopped, manual restart and replacement challenge reset");

  await mount({ allowedMistakes: 0, timeLimitSeconds: 3 });
  const delayedFailure = deferred();
  fixture.saveDelay = delayedFailure.promise;
  await tick(2);
  await type("ผิด ");
  await tick(10);
  assert.deepEqual(fixture.history.map((item) => item.result), ["Fail"]);
  await click(restart());
  await type("ยกเลิก");
  await tick(1);
  await act(async () => delayedFailure.resolve());
  assert.equal(field().value, "ยกเลิก", "an old history save cannot clear the new attempt");
  assert.equal(countdown(), "0:02");
  console.log("PASS failure/timeout race and delayed history after restart");

  await mount({ repeatCount: 2, allowedMistakes: 1 }, [challenge({ id: "fixture-2", word: "ขอบคุณ" })]);
  const delayedPass = deferred();
  fixture.saveDelay = delayedPass.promise;
  await type("ยกเลิก ผิด");
  const passButton = verify();
  await act(async () => { passButton.click(); passButton.click(); });
  assert.equal(field().disabled, true);
  assert.equal(restart().disabled, true, "restart cannot race with queue completion");
  await tick(20);
  assert.equal(fixture.history.length, 1);
  assert.equal(fixture.history[0].result, "Pass");
  assert.equal(fixture.completions.length, 0);
  await act(async () => delayedPass.resolve());
  assert.equal(fixture.completions.length, 1);
  assert.equal(field().value, "");
  assert.equal(field().disabled, false);
  assert.match(document.body.textContent, /ขอบคุณ/);
  assert.equal(countdown(), "0:08");
  console.log("PASS within-allowance success, paused submission and next queue item");

  await mount({ allowedMistakes: 0 });
  await type("ผิด ", true);
  assert.equal(field().disabled, false, "IME composition is not graded before it ends");
  await act(async () => field().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  assert.equal(field().disabled, true);
  assert.equal(fixture.history.length, 1);
  console.log("PASS IME composition finishes before grading");

  await mount({ repeatCount: 1, allowedMistakes: 0 });
  const stalePass = deferred();
  fixture.saveDelay = stalePass.promise;
  await type("ยกเลิก");
  await click(verify());
  await act(async () => fixture.emit([challenge({ id: "new-assignment", word: "ขอบคุณ" })]));
  await act(async () => stalePass.resolve());
  assert.equal(fixture.completions.length, 0, "a late Pass response cannot complete a replacement assignment");
  assert.equal(field().disabled, false);
  assert.equal(field().value, "");
  assert.match(document.body.textContent, /ขอบคุณ/);
  console.log("PASS stale submission does not affect a replacement assignment");
  user.sessionId = "typing-fixture-session-1234";
  await mount({ repeatCount: 100, timeLimitSeconds: 120 });
  assert.match(document.body.textContent, /เลือกวิธีก่อนเริ่มพิมพ์/);
  assert.equal(field().disabled, true, "typing is blocked until the user chooses a path");
  await tick(2);
  assert.equal(countdown(), "2:00", "reward selection pauses the QA typing timer");
  const normal = () => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("พิมพ์ตามปกติ"));
  await click(normal());
  assert.equal(field().disabled, false);
  assert.match(document.body.textContent, /พิมพ์แล้ว 0 \/ 100/);
  await tick(1);
  assert.equal(countdown(), "1:59");
  assert.equal(fixture.rewardCalls.length, 0, "normal typing neither redeems nor consumes rewards");
  console.log("PASS optional reward popup, unchanged 100-word typing, timer paused before choice");

  await mount({ repeatCount: 100, timeLimitSeconds: 120 });
  await act(async () => { fixture.rewardState = { balance: 150, owned: 1 }; });
  // Explicitly re-emit a new assignment to open the owned-reward offer.
  await act(async () => fixture.emit([challenge({ id: "owned-reward-task", repeatCount: 100, timeLimitSeconds: 120 })]));
  const useTicket = () => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("ใช้ Typing Relief 1 สิทธิ์"));
  assert.ok(useTicket(), "owned ticket should offer Use or Type normally");
  await click(useTicket());
  assert.match(document.body.textContent, /พิมพ์แล้ว 0 \/ 40/);
  assert.equal(fixture.rewardState.owned, 0);
  assert.equal(fixture.completions.length, 0, "using 60-word relief never skips completion of a 100-word challenge");
  console.log("PASS use a saved ticket, 100->40, no premature QA unlock");

  await mount({ repeatCount: 100, timeLimitSeconds: 120 });
  const buyTicket = () => [...document.querySelectorAll("button")].find((button) => button.textContent.includes("แลก Typing Relief"));
  assert.ok(buyTicket(), "no ticket should offer 150-Sparks redemption");
  await click(buyTicket());
  assert.equal(fixture.rewardState.owned, 0, "opening purchase confirmation must not deduct Sparks");
  const confirmBuy = [...document.querySelectorAll("button")].find((button) => button.textContent.includes("ยืนยันแลก 150 Sparks"));
  assert.ok(confirmBuy, "gate purchase requires explicit confirmation");
  await click(confirmBuy);
  assert.equal(fixture.rewardState.owned, 1);
  assert.equal(fixture.rewardState.balance, 150);
  assert.ok(useTicket(), "user can use the newly redeemed ticket");
  await click(useTicket());
  assert.match(document.body.textContent, /พิมพ์แล้ว 0 \/ 40/);
  assert.equal(fixture.rewardCalls.map((item) => item.action).join(","), "redeem-typing-relief,use-typing-relief");
  console.log("PASS buy during QA Access, then use one ticket, with proper balance and inventory updates");
  delete user.sessionId;

} finally {
  if (root) await act(async () => root.unmount());
  dom.window.close();
  for (const [key, descriptor] of previous) descriptor
    ? Object.defineProperty(globalThis, key, descriptor)
    : delete globalThis[key];
  await rm(temporary, { recursive: true, force: true });
}
