import assert from "node:assert/strict";
import handler from "../api/google-drive-upload.js";

function response() {
  return {
    code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
const previous = process.env.QA_SINGLE_SESSION_ENABLED;
const req = (headers = {}) => ({
  method: "POST", headers, body: { fileName: "evidence.png", dataBase64: "AAAA", contentType: "image/png" },
});
try {
  process.env.QA_SINGLE_SESSION_ENABLED = "true";
  const cross = response();
  await handler(req({
    origin: "https://evil.example", host: "qa.example", "sec-fetch-site": "cross-site",
  }), cross);
  assert.equal(cross.code, 403);
  assert.equal(cross.body.error, "SAME_ORIGIN_REQUIRED");

  const noCookie = response();
  await handler(req({ origin: "https://qa.example", host: "qa.example" }), noCookie);
  assert.equal(noCookie.code, 401);
  assert.equal(noCookie.body.error, "QA_SESSION_EXPIRED_OR_REPLACED");

  const get = response();
  await handler({ method: "GET", headers: {} }, get);
  assert.equal(get.code, 405);
  console.log("PASS server-side QA upload gate rejects stale/anonymous and cross-origin uploads");
} finally {
  if (previous === undefined) delete process.env.QA_SINGLE_SESSION_ENABLED;
  else process.env.QA_SINGLE_SESSION_ENABLED = previous;
}
