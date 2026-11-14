// Admin-only payout slip checks. OCR cannot certify that funds settled.
import {createHash} from "node:crypto";
import {parseTransferSlipText} from "../src/transferSlipRecognition.js";
const fail=(text,status=400)=>{throw Object.assign(new Error(text),{status});};
const hash=value=>createHash("sha256").update(value).digest("hex");
const normalizeRef=v=>String(v||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
const evidencePath=id=>"qa_sparks_special_receipt_evidence/payout-"+id;
const imageLock=h=>"qa_sparks_special_receipt_locks/payout-image-"+h;
const refLock=r=>"qa_sparks_special_receipt_locks/payout-ref-"+hash(r);
const cents=n=>Math.round(Number(n)*100);
export function decodePayoutSlip(source){
  const imageData=String(source||"");
  const m=/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(imageData);
  if(!m||m[2].length>480000)fail("แนบสลิป JPG/PNG/WebP ไม่เกิน 350 KB",413);
  const bytes=Buffer.from(m[2],"base64");
  const jpeg=bytes[0]===255&&bytes[1]===216;
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  if(bytes.length<3000||bytes.length>350000||!(jpeg||png||webp))fail("รูปสลิปไม่ถูกต้อง",400);
  return {bytes,imageData,imageHash:hash(bytes)};
}
// Tesseract OCR is performed locally in Admin browser. The text is untrusted
// client input and is always reviewed by the authorized Admin before Paid.
// Never invoke Google Vision here, and never treat OCR as bank confirmation.
export async function preparePayoutEvidence(body,request,admin){
  const image=decodePayoutSlip(body.slipImageData);
  if(typeof body.slipOCRText!=="string"&&body.slipOCRText!==undefined)
    fail("ข้อมูล OCR ไม่ถูกต้อง",400);
  if(String(body.slipOCRText||"").length>12000)fail("ข้อมูล OCR ยาวเกินไป",400);
  const rawText=String(body.slipOCRText||"");
  const ocrStatus=rawText.trim()?"local":"manual";
  const fields=parseTransferSlipText(rawText);
  const amount=Number(request.payoutTHB??request.amountTHB);
  if(!Number.isFinite(amount)||amount<=0||amount>100000)fail("ยอดเงินตามคำขอผิดพลาด",409);
  const recipient=String(request.phone||request.promptPay||"").replace(/\D/g,"").slice(-4);
  if(!/^\d{4}$/.test(recipient))fail("ไม่พบเลขท้ายข้อมูลรับเงิน",409);
  // The OCR values win. Client overrides are permitted only for missing values.
  if(fields.amountTHB!==null&&cents(fields.amountTHB)!==cents(amount))fail("ยอดเงินในสลิปไม่ตรงกับยอดคำขอ",409);
  // A masked bank account is NOT the same identifier as a PromptPay phone.
  // Read its visible suffix, but never invent the missing fourth digit or compare unlike IDs.
  const bankAccount=fields.recipientIdentifierType==="bank-account";
  if(!bankAccount&&fields.recipientLast4&&fields.recipientLast4!==recipient)
    fail("เลขท้ายหมายเลขผู้รับในสลิปไม่ตรงกับคำขอ",409);
  const manual=body.slipManualFields&&typeof body.slipManualFields==="object"?body.slipManualFields:{};
  const payoutAt=fields.payoutAt||String(manual.payoutAt||"");
  const ref=normalizeRef(fields.transactionRef||manual.transactionRef);
  const paid=fields.amountTHB===null?Number(manual.amountTHB):fields.amountTHB;
  const last4=bankAccount?"":fields.recipientLast4||String(manual.recipientLast4||"").replace(/\D/g,"");
  const needsManual=ocrStatus!=="local"||fields.missing.length>0||fields.reviewFlags.length>0||bankAccount||!fields.isSuccessful;
  const reason=String(body.slipManualReason||"").trim().slice(0,350);
  if(needsManual&&(body.slipManualReview!==true||reason.length<12))fail("ระบบอ่านสลิปไม่ครบ กรุณาตรวจด้วยตนเองพร้อมระบุเหตุผลอย่างน้อย 12 ตัวอักษร",409);
  if(!/^[A-Z0-9]{6,70}$/.test(ref))fail("ไม่พบเลขอ้างอิงการโอนที่ถูกต้อง",400);
  if(!Number.isFinite(paid)||cents(paid)!==cents(amount))fail("ยอดเงินโอนไม่ตรงกับยอดคำขอ",409);
  if(bankAccount){
    if(body.slipRecipientChecked!==true)fail("สลิปแสดงเลขบัญชีธนาคารที่ปิดบังไว้ กรุณาตรวจยืนยันผู้รับด้วยตนเอง",409);
  }else if(last4!==recipient)fail("เลขท้ายผู้รับไม่ตรงกับข้อมูลคำขอ",409);
  const timestamp=Date.parse(payoutAt),requested=Date.parse(request.createdAt);
  if(!Number.isFinite(timestamp)||!/^20\d{2}-\d\d-\d\dT\d\d:\d\d/.test(payoutAt)||
      timestamp>Date.now()+600000||(Number.isFinite(requested)&&timestamp<requested-300000))
    fail("วันเวลาโอนเงินไม่ถูกต้องหรือเกิดก่อนส่งคำขอ",409);
  const summary={transactionRef:ref,shortReference:fields.shortReference||"",longReference:fields.longReference||"",
    payoutAt:new Date(timestamp).toISOString(),amountTHB:amount,
    feeTHB:fields.feeTHB,issuerBank:fields.bank,recipientBank:fields.recipientBank,
    recipientNameOcr:fields.recipientName||"",recipientAccountMasked:fields.recipientAccountMasked||"",
    recipientVisibleSuffix:fields.recipientVisibleSuffix||"",
    recipientIdentifierType:fields.recipientIdentifierType,
    recipientLast4:last4,expectedRecipientLast4:recipient,
    recipientVerification:bankAccount?"admin-verified-bank-account":"masked-reference-checked",
    ocrStatus,ocrEngine:"tesseract-local",reviewMode:needsManual?"manual":"local_ocr_admin_reviewed",
    manualReason:needsManual?reason:"",imageHash:image.imageHash,
    confirmedBy:admin.username,confirmedAt:new Date().toISOString()};
  return {summary,imageData:image.imageData,lockPaths:[imageLock(image.imageHash),refLock(ref)]};
}
export async function ensurePayoutSlipUnused(evidence,requestId,readDoc,txn){
  const docs=await Promise.all([readDoc(evidencePath(requestId),txn),
    ...evidence.lockPaths.map(key=>readDoc(key,txn))]);
  if(docs.some(Boolean))fail("สลิปภาพนี้หรือเลขอ้างอิงการโอนเคยถูกใช้งานแล้ว",409);
}
export function payoutSlipWrites(evidence,requestId,username,createWrite){
  return [
    createWrite(evidencePath(requestId),{...evidence.summary,requestId,username,imageData:evidence.imageData}),
    ...evidence.lockPaths.map(key=>createWrite(key,{requestId,confirmedAt:evidence.summary.confirmedAt}))
  ];
}
export async function readPayoutEvidence(body,readDoc,recordValue){
  const id=String(body.itemId||"");
  if(!/^(?:sr-)?[A-Za-z0-9_-]{12,110}$/.test(id))fail("เลขคำขอไม่ถูกต้อง",400);
  const evidence=recordValue(await readDoc(evidencePath(id)));
  if(!evidence.imageData)fail("ไม่พบหลักฐานสลิปโอนเงิน",404);
  return {imageData:evidence.imageData,transactionRef:evidence.transactionRef,
    payoutAt:evidence.payoutAt,amountTHB:evidence.amountTHB,
    recipientLast4:evidence.recipientLast4,reviewMode:evidence.reviewMode,
    confirmedBy:evidence.confirmedBy,confirmedAt:evidence.confirmedAt};
}
