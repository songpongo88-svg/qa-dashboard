// Protect unsaved work across multiple tabs/windows in one browser profile.
// Web Locks are origin-scoped. If support or lease state cannot be verified,
// the takeover acknowledgment is denied; the old session is left intact.
export const QA_TAB_LEASE_NAME = "qa-dashboard-single-session-tab-v1";

export function holdQaTabLease(locks = globalThis.navigator?.locks) {
  if (!locks?.request || !locks?.query) return () => {};
  let release = () => {};
  let closed = false;
  const lifetime = new Promise(resolve => {
    release = resolve;
    if (closed) resolve();
  });
  void locks.request(QA_TAB_LEASE_NAME, { mode: "shared" }, () => lifetime)
    .catch(error => console.warn("QA browser tab lease unavailable", error));
  return () => {
    closed = true;
    release();
  };
}

export async function canAcknowledgeQaTakeover(locks = globalThis.navigator?.locks) {
  if (!locks?.query || !locks?.request) return false;
  try {
    const entries = await locks.query();
    const held = (entries?.held || []).filter(x => x.name === QA_TAB_LEASE_NAME);
    const pending = (entries?.pending || []).filter(x => x.name === QA_TAB_LEASE_NAME);
    return held.length === 1 && pending.length === 0;
  } catch {
    return false;
  }
}
