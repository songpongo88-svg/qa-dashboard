import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";
import { planMonthlyPaymentBatch, type AdditionalPaymentBatch } from "./lib/monthlyPaymentBatchPlan";
const COACHING_COLLECTION="qa_coaching_records";
export type MonthlyPaymentBatch={
  monthKey:string;documentIds:string[];exportedAt:string;exportedBy:string;
  supplementalBatches?:AdditionalPaymentBatch[];confirmedSentAt?:string;
};
export function monthlyPaymentBatchReference(monthKey:string){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey))throw new Error("Invalid payment month");
  return doc(firebaseDb,COACHING_COLLECTION,`monthly-payment-batch-${monthKey}`);
}
// Persist report-generation snapshots, not real-money payment confirmation.
export async function markMonthlyPaymentBatchExported(monthKey:string,documentIds:string[],exportedBy:string){
  const ref=monthlyPaymentBatchReference(monthKey);
  return runTransaction(firebaseDb,async transaction=>{
    const snapshot=await transaction.get(ref);
    const old=snapshot.exists()?snapshot.data():null;
    const now=new Date().toISOString();
    const plan=planMonthlyPaymentBatch(old,documentIds,now,String(exportedBy||"").trim());
    if(plan.changed){
      if(plan.mode==="original"){
        transaction.set(ref,{monthKey,documentIds:plan.documentIds,exportedAt:now,
          exportedBy:String(exportedBy||"").trim(),kind:"Monthly Payment Export Batch",
          exportedAtServer:serverTimestamp(),supplementalBatches:[]},{merge:true});
      }else{
        transaction.set(ref,{supplementalBatches:plan.supplementalBatches,
          lastAdditionalGeneratedAt:now,lastAdditionalGeneratedBy:String(exportedBy||"").trim(),
          kind:"Monthly Payment Export Batch"},{merge:true});
      }
    }
    return plan;
  });
}
