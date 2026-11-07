import assert from "node:assert/strict";
import {parseReceiptText, bangkokDateTimeInput} from "../src/receiptRecognition.js";
import {createQaRewardsService} from "../server/qaRewardsService.js";
import {receiptTimeEligibility} from "../src/receiptTimeEligibility.js";

const rejectedTime=receiptTimeEligibility("2026-11-07T13:12+07:00","2026-11-07T13:36:10+07:00",Date.parse("2026-11-07T14:00+07:00"));
assert.equal(rejectedTime.allowed,false);
assert.equal(rejectedTime.title,"ใช้ใบเสร็จนี้ไม่ได้");
assert.match(rejectedTime.reason,/ซื้อสินค้าก่อนกดใช้ Item ประมาณ 24 นาที/);
assert.equal(receiptTimeEligibility("","2026-11-07T13:36:10+07:00").code,"unreadable");

// Sanitized layout from a 7App e-receipt. No customer's image or transaction IDs are stored here.
const seven = `รายการสั่งซื้อที่ร้านและ 7Delivery
07/11/69 | 13:12
สาขา 7-Eleven ตัวอย่าง
รหัสร้าน : 00000
1 สินค้าตัวอย่าง 29.00
2 สินค้า @20.00 40.00
1 เครื่องดื่ม 45.00
ยอดสูทธิ 4 ชั้น 114.00
ทรูวอลเล็ท7App 114.00
TID#123456789012345
R#7110000001P1 :0000000 07/11/69 13:12
All Member 0-2000-0000`;
const found = parseReceiptText(seven, "seven-100");
assert.equal(found.receiptNumber, "7110000001");
assert.equal(found.receiptAt, "2026-11-07T13:12+07:00");
assert.equal(found.amountTHB, 114, "read actual total; never substitute the 100-baht reward cap");
assert.equal(found.merchantMatched, true);
assert.deepEqual(found.missing, []);
assert.equal(bangkokDateTimeInput(found.receiptAt), "2026-11-07T13:12", "Bangkok time never shifts with the device timezone");
const punthai = parseReceiptText("PUNTHAI\nReceipt No: 00012345\n07/11/2569 13:40:27\nTOTAL 65.00\nCASH 100.00\nCHANGE 35.00", "punthai-65");
assert.equal(punthai.receiptNumber, "00012345");
assert.equal(punthai.amountTHB, 65);
assert.equal(punthai.receiptAt, "2026-11-07T13:40:27+07:00");
assert.equal(bangkokDateTimeInput(punthai.receiptAt), "2026-11-07T13:40:27", "retain printed seconds");
const amazon = parseReceiptText("Café Amazon\nBill No: AZ-000123\n7 NOV 2026 03:12 PM\nGRAND TOTAL 1,114.50", "amazon-55");
assert.equal(amazon.receiptNumber, "AZ-000123");
assert.equal(amazon.receiptAt, "2026-11-07T15:12+07:00", "preserve actual future/AM-PM times for review; never clamp to eligibility");
assert.equal(amazon.amountTHB, 1114.5);
assert.equal(parseReceiptText("7-Eleven\nเลขที่ใบเสร็จ 00000123\n๗ พ.ย. ๒๕๖๙ ๑๓:๑๒\nยอดสุทธิ 114.00", "seven-100").receiptAt, "2026-11-07T13:12+07:00");
assert.equal(parseReceiptText("31/11/2026 13:12\nTOTAL 114.00").receiptAt, "", "invalid calendar date is not auto-corrected");
assert.equal(parseReceiptText("TOTAL -114.00").amountTHB, null, "refund/negative total is never read as a positive payment");
assert.equal(parseReceiptText("TOTAL 100.00\nTOTAL 114.00").amountTHB, null, "ambiguous totals require review");
assert.deepEqual(parseReceiptText("TID#123456789012345\nรหัสร้าน 00000\nโทร 0800000000\n14:40"), {
  receiptNumber: "", receiptAt: "", amountTHB: null, merchantMatched: false, missing: ["เลขที่ใบเสร็จ", "วันและเวลา", "ยอดชำระ"],
});

const originalFetch = globalThis.fetch;
const documents = new Map();
let writes = 0, mode = "success", visionCalls = 0;
const now = Date.now(), receiptISO = new Date(now - 60000).toISOString();
const currentInput = bangkokDateTimeInput(receiptISO);
const [dayPart, clock] = currentInput.split("T"), [year, month, day] = dayPart.split("-");
const text = `7-Eleven\nReceipt No: 7110000001\n${day}/${month}/${year} ${clock}\nยอดสุทธิ 4 ชิ้น 114.00`;
const id = "sr-receipt-scan-0000001";
const seed = (status = "activated", rewardId = "seven-100") => documents.set("qa_sparks_wallets/user", { balance: 1000, specialRewardItems: [{ itemId: id, rewardId, status, activatedAt: new Date(now - 120000).toISOString() }] });
seed();
const adapter = {
  path: (...parts) => parts.join("/"), walletDocumentPath: name => "qa_sparks_wallets/" + name,
  readDoc: async path => documents.has(path) ? {fields: structuredClone(documents.get(path))} : null,
  recordValue: doc => doc?.fields || {},
  listCollection: async () => ({documents: [], truncated: false}),
  currentMemberYear: () => 2026, spendableBalance: wallet => wallet.balance,
  getAccessToken: async () => "fake-test-token",
  createWrite: (path, data) => ({path, data}), updateWrite: (path, data) => ({path, data}),
  firestoreRequest: async (endpoint, _method, body) => {
    if (endpoint === ":beginTransaction") return {transaction: "test"};
    if (endpoint === ":rollback") return {};
    assert.equal(endpoint, ":commit");
    writes += body.writes.length;
    for (const item of body.writes) documents.set(item.path, {...documents.get(item.path), ...item.data});
    return {};
  },
};
globalThis.fetch = async (url, options) => {
  assert.equal(url, "https://vision.googleapis.com/v1/images:annotate");
  const body = JSON.parse(options.body);
  assert.equal(body.requests[0].features[0].type, "DOCUMENT_TEXT_DETECTION");
  visionCalls++;
  return {ok: mode === "success", json: async () => ({responses: [{fullTextAnnotation: {text}}]})};
};
try {
  const service = createQaRewardsService(adapter), actor = {username: "user", displayName: "Test User"};
  const bytes = Buffer.alloc(3600, 12); bytes[0] = 0xff; bytes[1] = 0xd8;
  const imageData = "data:image/jpeg;base64," + bytes.toString("base64");
  const input = {itemId: id, imageData};
  const preview = await service.scanReceipt(input, actor);
  assert.equal(preview.status, "scanned");
  assert.equal(preview.fields.amountTHB, 114);
  assert.equal(writes, 0, "OCR preview must not submit, spend, lock a receipt or change any wallet");
  await assert.rejects(service.scanReceipt(input, {username: "other"}), /ไม่อยู่ในบัญชี/);
  seed("unused"); await assert.rejects(service.scanReceipt(input, actor), /กดใช้ Item/);
  seed("activated", "netflix-1m"); await assert.rejects(service.scanReceipt(input, actor), /ไม่ใช้ใบเสร็จ/);
  seed(); await assert.rejects(service.scanReceipt({...input, imageData: "data:text/plain;base64,abcd"}, actor), /แนบรูปใบเสร็จ/);
  mode = "unavailable";
  const fallback = await service.scanReceipt(input, actor);
  assert.equal(fallback.status, "manual"); assert.equal(fallback.fields.receiptNumber, "");
  assert.equal(fallback.fields.amountTHB, null); assert.equal(writes, 0);
  mode = "success";
  const result = await service.submit({...input, receiptNumber: "7110000001", receiptAt: receiptISO, amountTHB: 114, promptPay: "0800000000"}, actor);
  assert.equal(result.request.amountTHB, 114); assert.equal(result.request.payoutTHB, 100);
  assert.equal(result.request.status, "pending_review", "OCR match does not approve or pay a claim");
  assert.equal(result.request.ocrStatus, "matched");
  assert.equal(documents.get("qa_sparks_wallets/user").balance, 1000);
  seed();
  const beforeInvalid = writes, beforeCalls = visionCalls;
  await assert.rejects(service.submit({...input, receiptNumber: "7110000002", receiptAt: new Date(now - 180000).toISOString(), amountTHB: 114, promptPay: "0800000000"}, actor), /ซื้อสินค้าก่อนกดใช้ Item/);
  await assert.rejects(service.submit({...input, receiptNumber: "7110000002", receiptAt: new Date(now + 600000).toISOString(), amountTHB: 114, promptPay: "0800000000"}, actor), /อนาคต/);
  assert.equal(writes, beforeInvalid); assert.equal(visionCalls, beforeCalls);
  await assert.rejects(service.submit({...input, receiptNumber: "7110000002", receiptAt: new Date(now - 45000).toISOString(), amountTHB: 114, promptPay: "0800000000"}, actor), /วันเวลาถูกล็อกตามภาพ/);
  assert.equal(writes,beforeInvalid,"changing a client timestamp cannot create a claim when server OCR reads a different time");
  documents.get("qa_sparks_wallets/user").specialRewardItems[0].activatedAt=new Date(now-30000).toISOString();
  await assert.rejects(service.submit({...input, receiptNumber: "7110000002", receiptAt: new Date(now).toISOString(), amountTHB: 114, promptPay: "0800000000"}, actor), /ซื้อสินค้าก่อนกดใช้ Item/);
  assert.equal(writes,beforeInvalid,"an ineligible timestamp found in the image is rejected even if the client posts an eligible time");
  console.log("PASS receipt recognition: actual 7App layout, R# vs TID, quantity vs total, Thai/BE/AD dates, exact Bangkok seconds, missing/ambiguous values; authenticated owned-item scan is read-only and server keeps eligibility/caps/Admin review");
} finally { globalThis.fetch = originalFetch; }
