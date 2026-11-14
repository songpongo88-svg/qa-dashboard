import assert from "node:assert/strict";
import {parseTransferSlipText} from "../src/transferSlipRecognition.js";
import {preparePayoutEvidence,decodePayoutSlip,ensurePayoutSlipUnused,payoutSlipWrites} from "../server/payoutSlipService.js";
const text="โอนเงินสำเร็จ\n14/11/2569 15:45\nเลขที่รายการ ABCD202611141234\nจำนวนเงิน 20.00 บาท\nผู้รับเงิน\nธนาคาร ตัวอย่าง\n•••• 5678";
const parsed=parseTransferSlipText(text);
assert.equal(parsed.payoutAt,"2026-11-14T15:45:00+07:00");
assert.equal(parsed.transactionRef,"ABCD202611141234");
assert.equal(parsed.amountTHB,20);
assert.equal(parsed.recipientLast4,"5678");
assert.deepEqual(parsed.missing,[]);
// Regression fixture from Bangkok Bank-style OCR, with all personal names omitted.
// OCR may mistake ก.พ. for n.w. but visible day/time must agree with the long bank reference.
const bangkokSlip="Bangkok Bank\nรายการสําเร็จ\n03 n.w. 69, 14:40\nจํานวนเงิน\n1,405.00 tHe\nจาก\n050-0-%%%771\nธนาคารกรุงเทพ\nไปที่\n430-1-xxx497\nธนาคารไทยพาณิชย์\nค่าธรรมเนียม 0.00 THB\nหมายเลขอ้างอิง\n631438\nเลขที่อ้างอิง\n2026020314403024006233008";
const bankParsed=parseTransferSlipText(bangkokSlip);
assert.equal(bankParsed.payoutAt,"2026-02-03T14:40:00+07:00");
assert.equal(bankParsed.dateSource,"visible-time-matched-bank-reference");
assert.equal(bankParsed.amountTHB,1405);
assert.equal(bankParsed.feeTHB,0);
assert.equal(bankParsed.shortReference,"631438");
assert.equal(bankParsed.longReference,"2026020314403024006233008");
assert.equal(bankParsed.transactionRef,bankParsed.longReference);
assert.equal(bankParsed.recipientBank,"ธนาคารไทยพาณิชย์");
assert.equal(bankParsed.recipientAccountMasked,"430-1-xxx497");
assert.equal(bankParsed.recipientVisibleSuffix,"497");
assert.equal(bankParsed.recipientLast4,"","never invent a missing fourth digit");
assert.equal(bankParsed.recipientIdentifierType,"bank-account");
assert.equal(bankParsed.isSuccessful,true);
assert.deepEqual(bankParsed.missing,[]);
assert.ok(bankParsed.reviewFlags.length>=1,"masked account requires Admin review");

const fake=Buffer.alloc(3600,7);fake[0]=255;fake[1]=216;
const imageData="data:image/jpeg;base64,"+fake.toString("base64");
assert.equal(decodePayoutSlip(imageData).bytes.length,3600);
const body={slipImageData:imageData,slipManualReview:true,
  slipManualReason:"Admin ตรวจสอบหลักฐานธุรกรรมจากภาพต้นฉบับและธนาคารด้วยตนเอง",
  slipManualFields:{payoutAt:new Date().toISOString(),transactionRef:"QASLIPTEST20261114001",amountTHB:20,recipientLast4:"5678"}};
const request={amountTHB:20,phone:"0812345678",createdAt:new Date(Date.now()-60000).toISOString()};
const admin={username:"songpon"};
await assert.rejects(preparePayoutEvidence({...body,slipManualReview:false},request,admin),/อ่านสลิปไม่ครบ/);
const proof=await preparePayoutEvidence(body,request,admin);
assert.equal(proof.summary.reviewMode,"manual");
assert.equal(proof.summary.transactionRef,"QASLIPTEST20261114001");
await assert.rejects(preparePayoutEvidence({...body,slipManualFields:{...body.slipManualFields,amountTHB:25}},request,admin),/ยอดเงิน/);

// Local OCR may read a transfer amount, but the Admin must still review it.
// The server never calls Google Vision and never accepts an OCR mismatch.
const mismatchedOCR="14/11/2569 15:45\nเลขที่รายการ PAYTEST123456\nจำนวนเงิน 30.00 บาท\nผู้รับเงิน\n•••• 5678";
await assert.rejects(preparePayoutEvidence({...body,slipOCRText:mismatchedOCR},request,admin),/ยอดเงินในสลิปไม่ตรง/);
const missingRefOCR="จำนวนเงิน 20.00 บาท";
const localProof=await preparePayoutEvidence({...body,slipOCRText:missingRefOCR},request,admin);
assert.equal(localProof.summary.ocrEngine,"tesseract-local");
assert.equal(localProof.summary.reviewMode,"manual");

const writes=payoutSlipWrites(proof,"tm-unittest-123456","agent",(...args)=>({args}));
assert.equal(writes.length,3);
await ensurePayoutSlipUnused(proof,"tm-unittest-123456",async()=>null,"test-tx");
await assert.rejects(ensurePayoutSlipUnused(proof,"tm-unittest-123456",async()=>({exists:true}),""),/เคยถูกใช้งาน/);
console.log("PASS transfer slip: OCR parsing, Thai Buddhist date/time, manual fallback, mandatory amount and duplicate locks");
