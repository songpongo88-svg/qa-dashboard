import assert from "node:assert/strict";
import test from "node:test";

process.env.SPARKS_SUPABASE_PUBLISHABLE_KEY = "public-test-key";
process.env.SPARKS_SUPABASE_AUTH_URL = "https://example.supabase.co";
const { loginSparksQaCredentials } = await import("../server/sparksSupabaseAuth.js");

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status,
    json: async () => body };
}
function recorder() {
  const headers = {};
  return { headers, setHeader(name, value) { headers[name] = value; } };
}
function mockAuth({ validPassword = true, allowed = true, actorUsername = "agent1" } = {}) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/auth/v1/token?grant_type=password")) {
      const payload = JSON.parse(options.body);
      assert.equal(payload.email, "qa-agent1@qa-sparks-login.invalid");
      if (!validPassword) return response({ error: "invalid_grant" }, 400);
      return response({ access_token: "a".repeat(40), refresh_token: "r".repeat(40), expires_in: 300 });
    }
    if (String(url).includes("/auth/v1/user")) {
      return response({ id: "verified", email: "qa-agent1@qa-sparks-login.invalid",
        email_confirmed_at: "2026-11-11T00:00:00Z" });
    }
    if (String(url).includes("/rest/v1/rpc/sparks_verified_identity_v1")) {
      return response(allowed ? [{ username: actorUsername, display_name: "Agent 1",
        role: "Admin Live Chat", status: "Active" }] : []);
    }
    throw Error("Unexpected outbound request: " + url);
  };
  return calls;
}
test("migrated QA username signs in without OTP and receives HttpOnly cookies", async () => {
  const calls = mockAuth();
  const res = recorder();
  const actor = await loginSparksQaCredentials(res, " Agent1 ", "unchanged-qa-password");
  assert.equal(actor.username, "agent1");
  assert.equal(calls.length, 3);
  assert.ok(res.headers["Set-Cookie"].every(cookie => cookie.includes("HttpOnly") && cookie.includes("SameSite=Strict")));
  assert.equal(JSON.stringify(res.headers).includes("unchanged-qa-password"), false);
});
test("incorrect password is rejected without cookies", async () => {
  mockAuth({ validPassword: false });
  const res = recorder();
  await assert.rejects(loginSparksQaCredentials(res, "agent1", "incorrect-pass"), /Username|Password/);
  assert.equal(res.headers["Set-Cookie"], undefined);
});
test("unreviewed and suspended profiles cannot receive a session", async () => {
  mockAuth({ allowed: false });
  const res = recorder();
  await assert.rejects(loginSparksQaCredentials(res, "agent1", "unchanged-qa-password"));
  assert.equal(res.headers["Set-Cookie"], undefined);
});
test("different Supabase identity cannot impersonate a QA username", async () => {
  mockAuth({ actorUsername: "agent2" });
  const res = recorder();
  await assert.rejects(loginSparksQaCredentials(res, "agent1", "unchanged-qa-password"));
  assert.equal(res.headers["Set-Cookie"], undefined);
});
