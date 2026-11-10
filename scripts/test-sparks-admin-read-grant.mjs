import assert from "node:assert/strict";
import { issueSparksAdminReadGrant, verifySparksAdminReadGrant } from "../server/sparksAdminReadGrant.js";

const original = process.env.SPARKS_SUPABASE_BRIDGE_TOKEN;
try {
  process.env.SPARKS_SUPABASE_BRIDGE_TOKEN = "integration-test-signing-secret-unique-48-character-value";
  const now = Date.UTC(2026, 10, 10, 12, 0, 0);
  const users = [
    { username: "admin-user", displayName: "QA Admin", role: "Quality Assurance", status: "Active" },
    { username: "active-user", displayName: "Active", role: "Admin Live Chat", status: "Active" },
  ];
  const token = issueSparksAdminReadGrant(users, "songpon", "QA-session-id-123456789", now);
  assert.ok(token, "successful live authentication can issue a signed read-only roster");
  const verified = verifySparksAdminReadGrant(token, "songpon", "QA-session-id-123456789", now + 60000);
  assert.equal(verified.users.length, 2);
  assert.equal(verified.users[1].username, "active-user");
  assert.equal(verifySparksAdminReadGrant(token, "different-admin", "QA-session-id-123456789", now), null);
  assert.equal(verifySparksAdminReadGrant(token, "songpon", "different-session", now), null);
  assert.equal(verifySparksAdminReadGrant(token.slice(0, -2) + "xx", "songpon", "QA-session-id-123456789", now), null);
  assert.equal(verifySparksAdminReadGrant(token, "songpon", "QA-session-id-123456789", now + 300001), null,
    "expired grants cannot authorize even reads");
  assert.equal(issueSparksAdminReadGrant([{ username: "suspended", status: "Suspended" }], "songpon", "s", now), "",
    "suspended targets must never enter a signed roster");
  assert.equal(issueSparksAdminReadGrant([users[0], users[0]], "songpon", "s", now), "",
    "duplicate usernames are refused");
  assert.equal(issueSparksAdminReadGrant(users, "songpon", "", now), "");
  delete process.env.SPARKS_SUPABASE_BRIDGE_TOKEN;
  assert.equal(verifySparksAdminReadGrant(token, "songpon", "QA-session-id-123456789", now), null);
  console.log("PASS: signed Sparks Admin read-only grace grants are scope-bound, expiry-bound and never allow mutation");
} finally {
  if (original === undefined) delete process.env.SPARKS_SUPABASE_BRIDGE_TOKEN;
  else process.env.SPARKS_SUPABASE_BRIDGE_TOKEN = original;
}
