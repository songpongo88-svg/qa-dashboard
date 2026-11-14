// Local, free OCR. Different Thai bank and wallet apps use different layouts.
// OCR extracts text only; Admin review is mandatory before a Paid decision.
import {parseTransferSlipText} from "./transferSlipRecognition.js";
import type {PayoutScan} from "./RewardActionConfirmModal";

const score=(text:string)=>{
  const fields=parseTransferSlipText(text);
  return (fields.payoutAt?3:0)+(fields.transactionRef?3:0)+(fields.amountTHB!==null?3:0)+
    (fields.recipientAccountMasked?2:0)+(fields.isSuccessful?1:0)+
    (fields.bank?1:0)+(fields.recipientName?1:0)+(fields.senderName?1:0);
};

export async function readPayoutSlipLocally(imageData:string):Promise<PayoutScan>{
  let text="";
  try{
    const {createWorker,PSM}=await import("tesseract.js");
    const worker=await createWorker(["tha","eng"]);
    const reads:string[]=[];
    try{
      // Two OCR layout strategies. Sparse Text recovers floating account/name rows;
      // Auto often reads large numeric amounts and labels more accurately.
      for(const mode of [PSM.SPARSE_TEXT,PSM.AUTO]){
        await worker.setParameters({tessedit_pageseg_mode:mode});
        const result=await worker.recognize(imageData);
        const candidate=String(result?.data?.text||"").slice(0,5500);
        if(candidate.trim()&&!reads.includes(candidate))reads.push(candidate);
      }
    }finally{
      await worker.terminate();
    }
    const ordered=reads.sort((a,b)=>score(b)-score(a));
    text=ordered.join("\n").slice(0,11000);
  }catch{
    return {ocrStatus:"manual",ocrText:"",message:"อ่านภาพอัตโนมัติไม่สำเร็จ กรุณาตรวจหลักฐานและกรอกข้อมูลด้วยตนเอง",
      fields:parseTransferSlipText("")};
  }
  const fields=parseTransferSlipText(text);
  const partial=fields.missing.length>0;
  return {ocrStatus:text?"local":"manual",ocrText:text,
    message:text?(partial?"อ่านได้บางส่วน กรุณาตรวจข้อมูลที่ขาด":"อ่านข้อมูลเบื้องต้นได้ กรุณาตรวจเทียบกับภาพจริง")
      :"ไม่พบข้อความบนภาพสลิป กรุณาตรวจและกรอกข้อมูลด้วยตนเอง",
    fields};
}
