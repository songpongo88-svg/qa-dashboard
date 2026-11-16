import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "./firebaseClient";

// Stored alongside Coaching in its existing collection to share its access policy.
// These marker documents have no Agent, so they cannot appear in Coaching rosters.
const COACHING_COLLECTION = "qa_coaching_records";

export type MonthlyPaymentBatch = {
  monthKey: string;
  documentIds: string[];
  exportedAt: string;
  exportedBy: string;
};

export function monthlyPaymentBatchReference(monthKey: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) throw new Error("Invalid payment month");
  return doc(firebaseDb, COACHING_COLLECTION, `monthly-payment-batch-${monthKey}`);
}

export async function markMonthlyPaymentBatchExported(
  monthKey: string, documentIds: string[], exportedBy: string
): Promise<MonthlyPaymentBatch> {
  const ids = [...new Set(documentIds.map(id => String(id || "").trim()).filter(Boolean))].sort();
  if (!ids.length) throw new Error("No monthly payment documents to export");
  const reference = monthlyPaymentBatchReference(monthKey);
  return runTransaction(firebaseDb, async transaction => {
    const stored = await transaction.get(reference);
    const old = stored.exists() ? stored.data() : null;
    if (old?.exportedAt) {
      const oldIds = Array.isArray(old.documentIds) ? old.documentIds.map(String).sort() : [];
      if (JSON.stringify(oldIds) !== JSON.stringify(ids)) {
        throw new Error("รอบจ่ายนี้ถูกส่งออกแล้ว และรายชื่อไม่ตรงกับชุดที่ส่งออกเดิม กรุณาตรวจสอบ Payment History ก่อน");
      }
      return {
        monthKey, documentIds: oldIds,
        exportedAt: String(old.exportedAt), exportedBy: String(old.exportedBy || "")
      };
    }
    const first: MonthlyPaymentBatch = {
      monthKey, documentIds: ids, exportedAt: new Date().toISOString(),
      exportedBy: String(exportedBy || "").trim()
    };
    transaction.set(reference, {
      ...first, kind: "Monthly Payment Export Batch", exportedAtServer: serverTimestamp()
    }, { merge: true });
    return first;
  });
}
