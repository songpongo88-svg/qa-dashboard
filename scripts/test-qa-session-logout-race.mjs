import assert from "node:assert/strict";
import {
  runQaServerLogout, waitForQaServerLogout,
  runQaFirebaseSignOut, waitForQaFirebaseSignOut,
} from "../src/qaSessionTransitionBarrier.mjs";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, no) => { resolve = ok; reject = no; });
  return { promise, resolve, reject };
};
const slow = deferred();
let logoutCalls = 0;
const old = runQaServerLogout(() => { logoutCalls++; return slow.promise; });
assert.strictEqual(runQaServerLogout(() => { throw Error("duplicate"); }), old);
let newLoginStarted = false;
const login = (async () => { await waitForQaServerLogout(); newLoginStarted = true; })();
await Promise.resolve(); await Promise.resolve();
assert.equal(logoutCalls, 1);
assert.equal(newLoginStarted, false, "Old Set-Cookie must finish before login");
slow.resolve("logged_out");
await old; await login;
assert.equal(newLoginStarted, true);
const failed = runQaServerLogout(() => Promise.reject(Error("offline")));
const recovered = waitForQaServerLogout();
await assert.rejects(failed, /offline/);
await recovered;
assert.equal(await runQaServerLogout(() => Promise.resolve("retry")), "retry");

const signOut = deferred();
const oldSignOut = runQaFirebaseSignOut(() => signOut.promise);
assert.strictEqual(runQaFirebaseSignOut(() => { throw Error("duplicate"); }), oldSignOut);
let newSignInStarted = false;
const signIn = (async () => { await waitForQaFirebaseSignOut(); newSignInStarted = true; })();
await Promise.resolve(); await Promise.resolve();
assert.equal(newSignInStarted, false);
signOut.resolve();
await oldSignOut; await signIn;
assert.equal(newSignInStarted, true);
const failedSignOut = runQaFirebaseSignOut(() => Promise.reject(Error("auth offline")));
const recoveredSignOut = waitForQaFirebaseSignOut();
await assert.rejects(failedSignOut, /auth offline/);
await recoveredSignOut;
console.log("PASS QA same-tab logout/login and Firebase sign-out barriers");
