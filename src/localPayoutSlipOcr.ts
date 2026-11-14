// OCR runs on the Admin's device, not on a paid cloud OCR service.
// Language models/worker files may download once and are cached by the browser.
import {parseTransferSlipText} from "./transferSlipRecognition.js";
import type {PayoutScan} from "./RewardActionConfirmModal";

export async function readPayoutSlipLocally(imageData:string):Promise<PayoutScan>{
  let text="";
  try{
    const {createWorker,PSM}=await import("tesseract.js");
    const worker=await createWorker(["tha","eng"]);
    try{
      // Bank slips have floating labels and QR codes. Sparse text reads names and account lines better.
      await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
      const result=await worker.recognize(imageData);
      text=String(result?.data?.text||"").slice(0,12000);
    }finally{
      await worker.terminate();
    }
  }catch{
    // OCR failure must not prevent a verified Admin from entering slip details manually.
    return {ocrStatus:"manual",ocrText:"",message:"ไม่สามารถอ่านสลิปอัตโนมัติได้ กรุณาตรวจภาพสลิปด้วยตนเอง",
      fields:parseTransferSlipText("")};
  }
  return {ocrStatus:text?"local":"manual",ocrText:text,
    message:text?"อ่านสลิปในเครื่องแล้ว กรุณาตรวจความถูกต้องก่อนยืนยัน":"อ่านภาพไม่พบข้อความ กรุณากรอกข้อมูลจากสลิปด้วยตนเอง",
    fields:parseTransferSlipText(text)};
}
