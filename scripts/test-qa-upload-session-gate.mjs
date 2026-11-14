import assert from "node:assert/strict";
import handler from "../api/google-drive-upload.js";
import downloadHandler from "../api/google-drive-download.js";

function response() {
  return {
    code: 200, body: null, headers: {},
    status(code) { this.code = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
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
  const downloadRequest = (headers = {}, id = "driveEvidence_123") => ({
    method: "GET", query: { id }, headers,
  });
  const deniedCrossOriginDownload = response();
  await downloadHandler(downloadRequest({
    origin: "https://evil.example", host: "qa.example", "sec-fetch-site": "cross-site",
  }), deniedCrossOriginDownload);
  assert.equal(deniedCrossOriginDownload.code, 403);
  assert.equal(deniedCrossOriginDownload.body.error, "SAME_ORIGIN_REQUIRED");
  assert.equal(deniedCrossOriginDownload.headers["Cache-Control"], "private, no-store");

  const deniedAnonymousDownload = response();
  await downloadHandler(downloadRequest({ host: "qa.example" }), deniedAnonymousDownload);
  assert.equal(deniedAnonymousDownload.code, 401);
  assert.equal(deniedAnonymousDownload.body.error, "QA_SESSION_EXPIRED_OR_REPLACED");
  assert.equal(deniedAnonymousDownload.headers["Cache-Control"], "private, no-store");
  assert.equal(deniedAnonymousDownload.headers.Vary, "Cookie");

  const deniedForgedCookie = response();
  await downloadHandler(downloadRequest({
    host: "qa.example", cookie: "__Host-qa_session=forged",
  }), deniedForgedCookie);
  assert.equal(deniedForgedCookie.code, 401,
    "Forged session cookies must never authorize evidence downloads");

  const invalidDownloadMethod = response();
  await downloadHandler({ method: "POST", headers: {}, query: { id: "abc123" } }, invalidDownloadMethod);
  assert.equal(invalidDownloadMethod.code, 405);

  console.log("PASS QA upload/download gates reject anonymous, forged and cross-origin access");
} finally {
  if (previous === undefined) delete process.env.QA_SINGLE_SESSION_ENABLED;
  else process.env.QA_SINGLE_SESSION_ENABLED = previous;
}
