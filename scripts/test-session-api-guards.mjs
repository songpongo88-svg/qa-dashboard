import assert from "node:assert/strict";
import handler from "../api/qa-session-control.js";

function mockResponse() {
  const res = {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return res;
}

const previous = process.env.QA_SINGLE_SESSION_ENABLED;
try {
  delete process.env.QA_SINGLE_SESSION_ENABLED;
  let response = mockResponse();
  await handler({ method: "POST", headers: {}, body: { action: "begin" } }, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "QA_SINGLE_SESSION_NOT_READY");

  process.env.QA_SINGLE_SESSION_ENABLED = "true";
  response = mockResponse();
  await handler({ method: "GET", headers: {} }, response);
  assert.equal(response.statusCode, 405);

  response = mockResponse();
  await handler({
    method: "POST",
    headers: { host: "example.com", origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
    body: { action: "begin" },
  }, response);
  assert.equal(response.statusCode, 403);

  response = mockResponse();
  await handler({
    method: "POST", headers: { host: "example.com", origin: "https://example.com" },
    body: "{",
  }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, "BAD_BODY");

  response = mockResponse();
  await handler({
    method: "POST", headers: { host: "example.com", origin: "https://example.com" },
    body: { action: "commit", requestId: "not-a-uuid" },
  }, response);
  assert.equal(response.statusCode, 400);

  response = mockResponse();
  await handler({
    method: "POST", headers: { host: "example.com", origin: "https://example.com" },
    body: { action: "ack", requestId: "a3e2fd9a-4134-43ae-8cad-7f1737b6c92a", revision: -1 },
  }, response);
  assert.equal(response.statusCode, 400);
  console.log("session API fail-closed guard tests passed");
} finally {
  if (previous === undefined) delete process.env.QA_SINGLE_SESSION_ENABLED;
  else process.env.QA_SINGLE_SESSION_ENABLED = previous;
}
