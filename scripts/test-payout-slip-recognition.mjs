import assert from "node:assert/strict";
import {parseTransferSlipText} from "../src/transferSlipRecognition.js";
import {preparePayoutEvidence,decodePayoutSlip,ensurePayoutSlipUnused,payoutSlipWrites} from "../server/payoutSlipService.js";
import {standardSlipFromOcr,formatSlipTime,normalizeSlipAmount,parseSlipTime,validateStandardSlip,diffStandardSlip} from "../src/standardSlipFields.js";
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


// Common domestic transfer layouts. All names/accounts/refs are fictional examples.
const kplus=[
 "K+","โอนเงินสำเร็จ","4 มี.ค. 69 08:09 น.",
 "นาย ทดสอบ ตัวอย่าง","ธ.กสิกรไทย","xxx-x-x1555-x",
 "นางสาว ตัวอย่าง ทดสอบ","ธ.ไทยพาณิชย์","xxx-x-x3049-x",
 "เลขที่รายการ:","016063080910B0R00001","จำนวน:","1,427.00 บาท",
 "ค่าธรรมเนียม:","0.00 บาท"
].join("\n");
const k=parseTransferSlipText(kplus);
assert.equal(k.bank,"ธนาคารกสิกรไทย");
assert.equal(k.payoutAt,"2026-03-04T08:09:00+07:00");
assert.equal(k.amountTHB,1427);
assert.equal(k.feeTHB,0);
assert.equal(k.transactionRef,"016063080910B0R00001");
assert.equal(k.senderAccountMasked,"xxx-x-x1555-x");
assert.equal(k.recipientAccountMasked,"xxx-x-x3049-x");
assert.equal(k.recipientBank,"ธนาคารไทยพาณิชย์");
assert.equal(k.recipientLast4,"","masked middle digits are not account last-four digits");
assert.deepEqual(k.missing,[]);

const truemoney=[
 "truemoney","฿154.00","นาย ตัวอย่าง ทดสอบ",
 "KKP Start Saving","xxx-xxx557-7",
 "นางสาว ทดสอบ ตัวอย่าง","ธนาคารไทยพาณิชย์ จำกัด (มหาชน)",
 "xxx-xxx049-7","จำนวนเงิน ฿154.00","ค่าธรรมเนียม ฿0.00",
 "วันที่ทำรายการ 05 พ.ค. 68 22:45:38","เลขที่อ้างอิง 512522060123"
].join("\n");
const w=parseTransferSlipText(truemoney);
assert.equal(w.bank,"TrueMoney Wallet");
assert.equal(w.payoutAt,"2025-05-05T22:45:38+07:00");
assert.equal(w.amountTHB,154);
assert.equal(w.feeTHB,0);
assert.equal(w.transactionRef,"512522060123");
assert.equal(w.senderBank,"ธนาคารเกียรตินาคินภัทร");
assert.equal(w.recipientBank,"ธนาคารไทยพาณิชย์");
assert.equal(w.recipientAccountMasked,"xxx-xxx049-7");
assert.deepEqual(w.missing,[]);

// SCB-style slip with incomplete text must not be marked as fully extracted.
const scbIncomplete=parseTransferSlipText("SCB EASY\nจำนวนเงิน 1,273.00 บาท\nเลขที่รายการ 202603290001");
assert.equal(scbIncomplete.bank,"ธนาคารไทยพาณิชย์");
assert.equal(scbIncomplete.amountTHB,1273);
assert.ok(scbIncomplete.missing.includes("วันและเวลา"));
assert.ok(scbIncomplete.missing.includes("ผู้รับเงิน"));

// Multiple OCR modes may disagree about the amount: never guess which amount is correct.
const conflict=parseTransferSlipText(
 "Bangkok Bank\nจำนวนเงิน 1.40 บาท\nเลขที่รายการ ABCD20260304001\n"+
 "Bangkok Bank\nจำนวนเงิน 1,405.00 บาท\nเลขที่รายการ ABCD20260304001"
);
assert.equal(conflict.amountTHB,null);
assert.deepEqual(conflict.amountCandidates,[1.4,1405]);
assert.ok(conflict.reviewFlags.some(v=>v.includes("ยอดเงินหลายค่า")));

// OCR observed on a real TrueMoney layout (all personal data removed).
// The baht glyph may be recognized as B in the headline and 8 in amount/fee rows.
const trueMoneyOcrMisread=[
 "true money","B154.00","นาย ทดสอบ","KKP Start Saving","XXX-XXX557-7",
 "นางสาว ผู้รับ ทดสอบ","ธนาคารไทยพาณิชย์ จำกัด (มหาชน)","XXX-XXX049-7",
 "จํานวนเงิน","8154.00","ค่าธรรมเนียม","80.00",
 "วันที่ทํารายการ","05พ.ค. 68 22:45:38","เลขที่อ้างอิง","512522060123"
].join("\n");
const fixedWallet=parseTransferSlipText(trueMoneyOcrMisread);
assert.equal(fixedWallet.bank,"TrueMoney Wallet");
assert.equal(fixedWallet.amountTHB,154,"corroborated headline B154 must override OCR 8154");
assert.equal(fixedWallet.feeTHB,null,"do not falsely claim the fee was 80 or 0 without proof");
assert.equal(fixedWallet.feeGlyphUncertain,true);
assert.equal(fixedWallet.amountCorrectedFromCurrencyGlyph,true);
assert.ok(fixedWallet.reviewFlags.some(f=>f.includes("สัญลักษณ์ ฿")));
assert.ok(fixedWallet.reviewFlags.some(f=>f.includes("ค่าธรรมเนียม")));
assert.equal(fixedWallet.transactionRef,"512522060123");

const mismatchedWallet=parseTransferSlipText(trueMoneyOcrMisread.replace("B154.00","B155.00"));
assert.equal(mismatchedWallet.amountTHB,null,"disagreeing wallet readings may not silently pick a single amount");
assert.deepEqual(mismatchedWallet.amountCandidates,[8154,155]);
assert.ok(mismatchedWallet.missing.includes("ยอดเงิน"));

const actualBangkokOCR=[
 "Bangkok Bank","รายการสําเร็จ","03 n.w. 69,14:40","จํานวนเงิน","1,405.00 tHe",
 "จาก","นาย ทดสอบ","050-0-%%%771","ธนาคารกรุงเทพ","ไปที่",
 "นางสาว ผู้รับ","430-1-%%%497","ธนาคารไทยพาณิชย์",
 "ค่าธรรมเนียม 0.00 THB","หมายเลขอ้างอิง","631438","เลขที่อ้างอิง",
 "2026020314403024006233008"
].join("\n");
const parsedBankOCR=parseTransferSlipText(actualBangkokOCR);
assert.equal(parsedBankOCR.payoutAt,"2026-02-03T14:40:00+07:00");
assert.equal(parsedBankOCR.amountTHB,1405);
assert.equal(parsedBankOCR.feeTHB,0);
assert.equal(parsedBankOCR.transactionRef,"2026020314403024006233008");


// Redacted regression data derived from the five-file OCR PDF report.
// These represent observed text errors, not synthetic claims of confirmed payment.
const pdfBangkok=parseTransferSlipText([
 "Bangkok Bank","รายการสําเร็จ","03 ก.ุพ. 69,14:40",
 "จํานวนเงิน","1.405.00า68","จาก","นาย ทดสอบ","050-0-xxx771",
 "ธนาคารกรุงเทพ","ไปที่","นางสาว ตัวอย่าง",
 "430-1-xxx497","ธนาคารไทยพาณิชย์","ค่าธรรมเนียม 0.00 THB",
 "หมายเลขอ้างอิง","631438","เลขที่อ้างอิง","2026020314403024006233008"
].join("\n"));
assert.equal(pdfBangkok.amountTHB,1405,"PDF OCR 1.405.00 must never be parsed as 1.40 baht");
assert.equal(pdfBangkok.payoutAt,"2026-02-03T14:40:00+07:00");
assert.equal(pdfBangkok.transactionRef,"2026020314403024006233008");
assert.ok(pdfBangkok.reviewFlags.some(v=>v.includes("คั่นหลักพัน")),"corrected punctuation is flagged");

const pdfScb=parseTransferSlipText([
 "SCB EASY","โอนเงินสําเร็จ","29 มี.ค. 2569 - 10:34",
 "รหัสอ้างอิง: 202603292ผ50่020๐%ฮ15ปทาสุ9","จาก","นาย ตัวอย่าง",
 "xxx-xxx967-6","ไปยัง","นางสาว ผู้รับ","xxx-xxx049-7","จำนวนเงิน","1,273.00 บาท"
].join("\n"));
assert.equal(pdfScb.payoutAt,"2026-03-29T10:34:00+07:00","SCB shows a hyphen before the time");
assert.equal(pdfScb.transactionRef,"","truncated OCR reference with Thai junk must never count as valid");
assert.ok(pdfScb.missing.includes("เลขอ้างอิง"));

const pdfKplus=parseTransferSlipText([
 "K+","โอนเงินสําเร็จ","4 มี.ค. 69 08:09 น.","นาย ตัวอย่าง",
 "ธ.กสิกรไทย","xxx-x-x1555-x","นางสาว ผู้รับ",
 "ธ.ไทยพาณิชย์","xxx-x-x3049-x","เลขที่รายการ:",
 "016063080910BOR09809","จำนวน:","1,427.00 บาท"
].join("\n"));
assert.equal(pdfKplus.bank,"ธนาคารกสิกรไทย");
assert.equal(pdfKplus.amountTHB,1427);
assert.equal(pdfKplus.transactionRef,"016063080910BOR09809","K PLUS OCR ref should be read from next line");

const refsConflict=parseTransferSlipText([
 "K+","เลขที่รายการ:","016063080910BOR09809",
 "K+","เลขที่รายการ:","016063080910B0R09809",
 "4 มี.ค. 69 08:09","จำนวน: 1,427.00 บาท"
].join("\n"));
assert.equal(refsConflict.transactionRef,"","two inconsistent OCR reference codes must not be used in a payout");
assert.deepEqual(refsConflict.referenceCandidates,["016063080910BOR09809","016063080910B0R09809"]);
assert.ok(refsConflict.reviewFlags.some(v=>v.includes("เลขอ้างอิงหลายชุด")));

const unidentifiedIssuer=parseTransferSlipText([
 "โอนเงินสําเร็จ","29 มี.ค. 2569 - 10:34",
 "จาก","นาย ตัวอย่าง","xxx-xxx967-6","ไปที่","นางสาว ผู้รับ",
 "xxx-xxx049-7","ธนาคารไทยพาณิชย์","จำนวนเงิน 1,273.00 บาท"
].join("\n"));
assert.notEqual(unidentifiedIssuer.bank,"ธนาคารไทยพาณิชย์",
 "recipient bank must never be presented as the issuer without branding evidence");

const inferredWallet=parseTransferSlipText([
 "วันที่ทํารายการ","05 พ.ค. 68 22:45:38",
 "B154.00","นาย ทดสอบ","KKP Start Saving",
 "xxx-xxx557-7","นางสาว ผู้รับ","ธนาคารไทยพาณิชย์","xxx-xxx049-7",
 "จำนวนเงิน 8154.00","ค่าธรรมเนียม 80.00","เลขที่อ้างอิง 512522068024"
].join("\n"));
assert.equal(inferredWallet.bank,"TrueMoney Wallet");
assert.equal(inferredWallet.issuerSource,"wallet-layout-inferred");
assert.equal(inferredWallet.amountTHB,154,"infer amount only with independently corroborating headline");
assert.equal(inferredWallet.feeTHB,null,"currency-glyph uncertainty cannot fabricate a zero fee");
assert.ok(inferredWallet.reviewFlags.some(v=>v.includes("รูปแบบใบเสร็จ")));

const isolatedWallet=parseTransferSlipText([
 "true money","จำนวนเงิน","8154.00",
 "ค่าธรรมเนียม","80.00","วันที่ทํารายการ 05 พ.ค. 68 22:45:38",
 "เลขที่อ้างอิง 512522068024","ไปที่","xxx-xxx049-7"
].join("\n"));
assert.equal(isolatedWallet.amountTHB,null,
  "OCR 8154 without an independent original amount is ambiguous; do not misreport 8154");

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


// Seven-field standard format is editable even when OCR got a value wrong.
assert.equal(formatSlipTime("2026-02-03T14:40:00+07:00"),"03/02/2569 14:40");
assert.equal(parseSlipTime("03/02/2569 14:40"),"2026-02-03T14:40:00+07:00");
assert.equal(parseSlipTime("31/02/2569 14:40"),"","invalid calendar dates must be rejected");
assert.equal(normalizeSlipAmount("1,405.00"),1405);
assert.equal(normalizeSlipAmount("1.405.00"),null,"malformed amounts must require a correction");
const ocrSeven=standardSlipFromOcr({senderBank:"ธนาคารกรุงเทพ",senderName:"นาย ตัวอย่าง",
  recipientBank:"ธนาคารไทยพาณิชย์",recipientName:"",payoutAt:"2026-02-03T14:40:00+07:00",
  amountTHB:1405,transactionRef:"ABCD123456"});
const amended={...ocrSeven,recipientName:"นางสาว ผู้รับ"};
assert.deepEqual(Object.keys(diffStandardSlip(ocrSeven,amended)),["recipientName"]);
assert.equal(validateStandardSlip(ocrSeven).complete,false);
assert.equal(validateStandardSlip(amended).complete,true);

const correctedData={
  senderBank:"ธนาคารกรุงเทพ",senderName:"นาย ตัวอย่าง",
  recipientBank:"ธนาคารไทยพาณิชย์",recipientName:"นางสาว ผู้รับ",
  payoutAt:formatSlipTime(new Date().toISOString()),amountTHB:"20.00",
  transactionRef:"CORRECTED987654321"
};
const correctionBody={...body,slipOCRText:mismatchedOCR,
  slipVerifiedFields:correctedData,slipManualReview:true,
  slipManualReason:"Admin ตรวจสลิปจริงยืนยันยอด 20 บาท OCR อ่านผิดเป็น 30 บาท"};
const correctedProof=await preparePayoutEvidence(correctionBody,request,admin);
assert.equal(correctedProof.summary.amountTHB,20);
assert.equal(correctedProof.summary.transactionRef,"CORRECTED987654321");
assert.equal(correctedProof.summary.ocrOriginal.amountTHB,"30.00");
assert.equal(correctedProof.summary.reviewedFields.amountTHB,"20.00");
assert.equal(correctedProof.summary.editedFields.amountTHB.ocr,"30.00");
assert.equal(correctedProof.summary.editedFields.amountTHB.verified,"20.00");
assert.equal(correctedProof.summary.editedFields.recipientName.verified,"นางสาว ผู้รับ");
assert.equal(correctedProof.summary.confirmedBy,"songpon");
assert.equal(correctedProof.summary.reviewMode,"manual");
assert.equal(correctedProof.summary.editedFieldCount>0,true);
await assert.rejects(preparePayoutEvidence({...correctionBody,slipManualReview:false},request,admin),/ตรวจด้วยตนเอง/);
await assert.rejects(preparePayoutEvidence({...correctionBody,slipManualReason:""},request,admin),/เหตุผล/);
await assert.rejects(preparePayoutEvidence({...correctionBody,
  slipVerifiedFields:{...correctedData,recipientName:""}},request,admin),/ไม่ครบ/);
await assert.rejects(preparePayoutEvidence({...correctionBody,
  slipVerifiedFields:{...correctedData,amountTHB:"21.00"}},request,admin),/ยอดเงิน/);

const writes=payoutSlipWrites(proof,"tm-unittest-123456","agent",(...args)=>({args}));
assert.equal(writes.length,3);
await ensurePayoutSlipUnused(proof,"tm-unittest-123456",async()=>null,"test-tx");
await assert.rejects(ensurePayoutSlipUnused(proof,"tm-unittest-123456",async()=>({exists:true}),""),/เคยถูกใช้งาน/);
console.log("PASS transfer slip: OCR parsing, Thai Buddhist date/time, manual fallback, mandatory amount and duplicate locks");
