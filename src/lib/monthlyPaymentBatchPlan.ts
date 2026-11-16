// Generating a payment report does not prove that funds were sent.
// The initial recipient list is immutable; additional recipients are exported
// separately so previously listed agents never repeat in an additional file.
export type AdditionalPaymentBatch = {batchNumber:number; documentIds:string[]; generatedAt:string; generatedBy:string};
export type PaymentBatchSnapshot = {documentIds?:string[];exportedAt?:string;supplementalBatches?:AdditionalPaymentBatch[];confirmedSentAt?:string};
export type PaymentBatchPlan = {mode:"original"|"original-reprint"|"additional"|"additional-reprint";batchNumber:number;documentIds:string[];supplementalBatches:AdditionalPaymentBatch[];changed:boolean};
const ids = (values:unknown):string[] =>
  [...new Set((Array.isArray(values)?values:[]).map(value=>String(value??"").trim()).filter(Boolean))].sort();
export function planMonthlyPaymentBatch(old:PaymentBatchSnapshot|null,requested:string[],generatedAt:string,generatedBy:string):PaymentBatchPlan {
  const requestedIds=ids(requested);
  if(!requestedIds.length) throw new Error("No payment-ready documents to generate");
  const originalIds=ids(old?.documentIds);
  const additions=Array.isArray(old?.supplementalBatches)
    ? old.supplementalBatches.map((row,index)=>({
      batchNumber:Number(row?.batchNumber)||index+2,documentIds:ids(row?.documentIds),
      generatedAt:String(row?.generatedAt||""),generatedBy:String(row?.generatedBy||"")
    })).filter(row=>row.documentIds.length) : [];
  if(!old?.exportedAt) return {mode:"original",batchNumber:1,documentIds:requestedIds,supplementalBatches:[],changed:true};
  const seen=new Set([...originalIds,...additions.flatMap(batch=>batch.documentIds)]);
  const newIds=requestedIds.filter(id=>!seen.has(id));
  if(newIds.length){
    const batchNumber=additions.reduce((n,row)=>Math.max(n,row.batchNumber),1)+1;
    const next:AdditionalPaymentBatch={batchNumber,documentIds:newIds,generatedAt,generatedBy};
    return {mode:"additional",batchNumber,documentIds:newIds,supplementalBatches:[...additions,next],changed:true};
  }
  const latest=additions.filter(batch=>batch.documentIds.every(id=>requestedIds.includes(id))).at(-1);
  if(latest) return {mode:"additional-reprint",batchNumber:latest.batchNumber,documentIds:latest.documentIds,supplementalBatches:additions,changed:false};
  if(originalIds.every(id=>requestedIds.includes(id)))
    return {mode:"original-reprint",batchNumber:1,documentIds:originalIds,supplementalBatches:additions,changed:false};
  throw new Error("รายชื่อที่เคยสร้างเอกสารไว้ไม่ตรงกับชุดปัจจุบัน กรุณาตรวจสอบ Payment History");
}
