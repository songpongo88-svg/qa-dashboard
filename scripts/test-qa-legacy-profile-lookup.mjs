import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readQaFirebaseProfile } from "../server/qaFirebaseCredentials.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
  publicKeyEncoding: { format: "pem", type: "spki" },
});
const previous = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
const originalFetch = globalThis.fetch;
process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: "qa-dashboard-b0b5d",
  private_key: privateKey,
  client_email: "qa-service-test@qa-dashboard-b0b5d.iam.gserviceaccount.com",
});
const requests = [];
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});
globalThis.fetch = async input => {
  const url = String(input);
  if (url === "https://oauth2.googleapis.com/token") {
    return json({ access_token: "test-token", expires_in: 3600 });
  }
  const docId = decodeURIComponent(url.split("/").pop());
  requests.push(docId);
  if (docId !== "Agent") return json({ error: "Not Found" }, 404);
  return json({ fields: {
    username: { stringValue: "agent" },
    password: { stringValue: "test-pass" },
    role: { stringValue: "Admin Live Chat" },
    status: { stringValue: "Active" },
  } });
};
try {
  const profile = await readQaFirebaseProfile("agent");
  assert.equal(profile.username, "agent");
  assert.deepEqual(requests, ["agent", "Agent"]);
  console.log("PASS capitalized legacy QA profile matching with server-verified username");
} finally {
  globalThis.fetch = originalFetch;
  if (previous === undefined) delete process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  else process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON = previous;
}
