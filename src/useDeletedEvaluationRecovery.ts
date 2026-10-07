import { useCallback, useEffect, useState } from "react";
import { reconcileDeletedEvaluations } from "./evaluationStore";

export function useDeletedEvaluationRecovery(enabled: boolean, onRecovered: () => void) {
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    if (!enabled) { setError(""); return; }
    let cancelled = false;
    let running = false;
    const recover = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const result = await reconcileDeletedEvaluations();
        if (cancelled) return;
        setError(result.pending ? "ยังยืนยันการลบเคสเดิมไม่สำเร็จ กรุณาลองอีกครั้ง" : "");
        if (result.changed) onRecovered();
      } catch {
        if (!cancelled) setError("ยังยืนยันการลบเคสเดิมไม่สำเร็จ กรุณาลองอีกครั้ง");
      } finally { running = false; }
    };
    void recover();
    window.addEventListener("online", recover);
    window.addEventListener("qa-dashboard-data-refresh", recover);
    return () => {
      cancelled = true;
      window.removeEventListener("online", recover);
      window.removeEventListener("qa-dashboard-data-refresh", recover);
    };
  }, [enabled, attempt, onRecovered]);

  return { error, retry };
}
