import { useEffect, useState } from "react";
import { fetchCachedMonthlyResultLocks, monthlyResultKey, MONTHLY_RESULT_LOCK_CHECK_MESSAGE, MONTHLY_RESULT_LOCK_MESSAGE } from "./monthlyResultLockStore";

export function useMonthlyResultLock(agentName: string, monthKey: string) {
  const key = monthlyResultKey({ agentName, monthKey });
  const [state, setState] = useState({ key: "", verified: false, lockedAt: "", error: "" });
  useEffect(() => {
    if (!agentName || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return;
    let alive = true;
    let version = 0;
    const load = async (refresh = false) => {
      const requestVersion = ++version;
      try {
        const locks = await fetchCachedMonthlyResultLocks(monthKey, refresh);
        if (!alive || requestVersion !== version) return;
        const lockedAt = locks.find(item => monthlyResultKey(item) === key && item.lockedAt)?.lockedAt || "";
        setState({ key, verified: true, lockedAt, error: "" });
      } catch {
        if (alive && requestVersion === version) setState({ key, verified: false, lockedAt: "", error: MONTHLY_RESULT_LOCK_CHECK_MESSAGE });
      }
    };
    void load();
    const refresh = () => { void load(true); };
    window.addEventListener("qa-monthly-result-refresh", refresh);
    window.addEventListener("qa-dashboard-data-refresh", refresh);
    return () => {
      alive = false;
      window.removeEventListener("qa-monthly-result-refresh", refresh);
      window.removeEventListener("qa-dashboard-data-refresh", refresh);
    };
  }, [key, monthKey, agentName]);
  const current = state.key === key;
  const locked = current && Boolean(state.lockedAt);
  const editable = current && state.verified && !locked;
  return { locked, editable, lockedAt: current ? state.lockedAt : "", message: locked ? MONTHLY_RESULT_LOCK_MESSAGE : current ? state.error : "" };
}
