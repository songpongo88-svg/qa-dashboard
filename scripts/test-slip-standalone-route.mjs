import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const [html,entry,vite,scanner,packageFile]=await Promise.all([
  readFile("slip-ocr-test.html","utf8"),
  readFile("src/slipOcrStandalone.ts","utf8"),
  readFile("vite.config.js","utf8"),
  readFile("src/localPayoutSlipOcr.ts","utf8"),
  readFile("package.json","utf8"),
]);
assert.match(vite,/slipOcrTest:[^\n]*slip-ocr-test\.html/,"OCR demo must be a separate built HTML entry");
assert.match(html,/src="\/src\/slipOcrStandalone\.ts"/,"demo imports the standalone entry, not the Dashboard");
assert.doesNotMatch(html,/supabase|verifyOtp|OTP.*รหัส|\/api\/sparks/i,"OCR demo must not require account auth or call Sparks API");
assert.doesNotMatch(entry,/supabase|fetch\(|\/api\/|mark-truemoney-paid|Paid\b|localStorage|sessionStorage|\.setItem\(/i,
  "demo must not read login state, upload images or submit payouts");
assert.match(entry,/readPayoutSlipLocally\(data\)/,"demo uses on-device OCR");
assert.match(html,/type="file"[^>]*multiple/,"must allow simultaneous selection of several different bank slips");
assert.match(entry,/MAX_FILES=20/,"limit work per batch to keep local OCR responsive");
assert.match(entry,/for\(let i=0;i<files\.length;i\+\+\)/,"process each image in its own batch result");
assert.match(entry,/list\.append\(card\)/,"results must stay separate per uploaded file");
assert.match(entry,/releaseImages\(\)/,"clearing OCR results must release local image URLs");

assert.match(scanner,/createWorker\(\["tha","eng"\]\)/,"OCR includes Thai and English");
assert.match(entry,/new FileReader\(/,"demo accepts a local image");
assert.match(entry,/URL\.createObjectURL/,"demo previews the local file without upload");
assert.match(html,/ไม่ต้อง Login · ไม่ต้อง OTP/,"no OTP requirement stated accurately");
assert.ok(JSON.parse(packageFile).scripts["test:qa-sparks"].includes("test-slip-standalone-route.mjs"),
  "standalone route guard is required in QA Sparks tests");
console.log("PASS standalone slip OCR demo: built HTML route, no OTP/Dashboard mount/API calls, local image-only processing");
