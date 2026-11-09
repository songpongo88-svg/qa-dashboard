import assert from "node:assert/strict";
import { issueSparksReadGrant, verifySparksReadGrant } from "../server/sparksReadGrant.js";

const original = process.env.SPARKS_SUPABASE_BRIDGE_TOKEN;
try {
  process.env.SPARKS_SUPABASE_BRIDGE_TOKEN = "test-secret-for-hmac-qa-sparks-wallet-read-grants-123456789";
  const now = 1794200000000;
  const token = issueSparksReadGrant("Songpon", "session-A", now);
  assert.ok(token.length > 40);
  assert.equal(verifySparksReadGrant(token, "songpon", "session-A", now + 1), true);
  assert.equal(verifySparksReadGrant(token, "another", "session-A", now + 1), false);
  assert.equal(verifySparksReadGrant(token, "songpon", "session-B", now + 1), false);
  assert.equal(verifySparksReadGrant(token, "songpon", "session-A", now + 15 * 60 * 1000), false);
  assert.equal(verifySparksReadGrant(token + "bad", "songpon", "session-A", now + 1), false);
  assert.equal(verifySparksReadGrant("", "songpon", "session-A", now), false);
  process.env.SPARKS_SUPABASE_BRIDGE_TOKEN = "";
  assert.equal(verifySparksReadGrant(token, "songpon", "session-A", now + 1), false);
  assert.equal(issueSparksReadGrant("songpon", "session-A", now), "");
  console.log("PASS QA Sparks: signed wallet-only read grant, user/session scope, expiry and tamper rejection");
} finally {
  if (original === undefined) delete process.env.SPARKS_SUPABASE_BRIDGE_TOKEN;
  else process.env.SPARKS_SUPABASE_BRIDGE_TOKEN = original;
}
