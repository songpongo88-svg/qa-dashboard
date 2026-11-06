// Store only fully loaded, account-scoped snapshots. IndexedDB also retains
// large snapshots that cannot fit in Web Storage; no snapshot is written back
// to Firestore and an offline display never replaces the last complete copy.
// A recovery snapshot is account-scoped and never sent back to Firestore.
const PREFIX = "qa-dashboard:recovery-snapshot:v1:";
const MAX_AGE_MS = 12 * 60 * 60_000;
const MAX_JSON_LENGTH = 3_500_000;
const VIEW_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

export type DashboardRecoverySnapshot<C, N> = {
  cachedAt: number;
  cases: C[];
  noCaseEvaluations: N[];
  appealMergeCount: number;
};

function storageKey(accountScope: string): string {
  return PREFIX + encodeURIComponent(accountScope.trim().toLowerCase());
}

function validSnapshot<C,N>(value: unknown, maxAge: number): value is DashboardRecoverySnapshot<C,N> {
  const snapshot = value as DashboardRecoverySnapshot<C,N>;
  return Boolean(snapshot && Array.isArray(snapshot.cases) && Array.isArray(snapshot.noCaseEvaluations)
    && Number.isFinite(snapshot.cachedAt) && snapshot.cachedAt > 0 && snapshot.cachedAt <= Date.now()
    && Date.now() - snapshot.cachedAt <= maxAge);
}
/** Only affects read-only fallback snapshots; server-verified Dashboard data is unchanged.
 * A reduced history must not erase a larger account-scoped recovery copy.
 */
function preferRecoverySnapshot<C,N>(
  candidate:DashboardRecoverySnapshot<C,N>, previous:DashboardRecoverySnapshot<C,N>|null
):DashboardRecoverySnapshot<C,N> {
  if (!previous) return candidate;
  return candidate.cases.length > previous.cases.length ||
    (candidate.cases.length === previous.cases.length && candidate.cachedAt > previous.cachedAt)
    ? candidate : previous;
}
function readWebSnapshot<C,N>(accountScope: string, maxAge: number): DashboardRecoverySnapshot<C,N> | null {
  if (!accountScope.trim() || typeof window === "undefined") return null;
  let latest:DashboardRecoverySnapshot<C,N>|null=null;
  for (const name of ["sessionStorage","localStorage"] as const) {
    try {
      const raw=window[name].getItem(storageKey(accountScope));
      const value=raw?JSON.parse(raw):null;
      if(validSnapshot<C,N>(value,maxAge))latest=preferRecoverySnapshot(value,latest);
    }catch{ /* Storage is optional. Never discard a valid backup on a read error. */ }
  }
  return latest;
}
export function readDashboardRecoverySnapshot<C,N>(accountScope:string):DashboardRecoverySnapshot<C,N>|null {
  return readWebSnapshot<C,N>(accountScope,MAX_AGE_MS);
}
async function recoveryDb():Promise<IDBDatabase|null> {
  if(typeof window==="undefined")return null;
  return new Promise(resolve=>{
    let finished=false;
    const done=(db:IDBDatabase|null)=>{if(finished){db?.close();return;}finished=true;window.clearTimeout(timer);resolve(db);};
    const timer=window.setTimeout(()=>done(null),1000);
    try{
      if(!window.indexedDB){done(null);return;}
      const request=window.indexedDB.open("qa-dashboard-recovery",1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("snapshots"))request.result.createObjectStore("snapshots");};
      request.onerror=()=>done(null);request.onblocked=()=>done(null);request.onsuccess=()=>done(request.result);
    }catch{done(null);}
  });
}
export async function readDashboardRecoverySnapshotForView<C,N>(accountScope:string):Promise<DashboardRecoverySnapshot<C,N>|null> {
  if(!accountScope.trim())return null;
  let latest=readWebSnapshot<C,N>(accountScope,VIEW_MAX_AGE_MS);
  const db=await recoveryDb();if(!db)return latest;
  try{
    const saved=await new Promise<unknown>(resolve=>{
      const request=db.transaction("snapshots","readonly").objectStore("snapshots").get(storageKey(accountScope));
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);
    });
    if(validSnapshot<C,N>(saved,VIEW_MAX_AGE_MS))latest=preferRecoverySnapshot(saved,latest);
  }catch{ /* Keep the Web Storage copy when IndexedDB is unavailable. */ }
  finally{db.close();}
  return latest;
}
async function persistLargeSnapshot(accountScope:string,data:unknown):Promise<void> {
  const db=await recoveryDb();if(!db)return;
  try{
    await new Promise<void>(resolve=>{
      const transaction=db.transaction("snapshots","readwrite");
      const store=transaction.objectStore("snapshots");
      const request=store.get(storageKey(accountScope));
      request.onsuccess=()=>{
        const previous=request.result;
        // Only store more complete recovery histories (or equally complete newer ones).
        if(!validSnapshot(previous,VIEW_MAX_AGE_MS) || data.cases.length>=previous.cases.length){
          store.put(data,storageKey(accountScope));
        }
      };
      transaction.oncomplete=()=>resolve();transaction.onerror=()=>resolve();transaction.onabort=()=>resolve();
    });
  }catch{ /* A failed backup must not block the live Dashboard. */ }
  finally{db.close();}
}

export function saveDashboardRecoverySnapshot<C, N>(accountScope: string, data: DashboardRecoverySnapshot<C, N>): void {
  if (!accountScope.trim() || typeof window === "undefined" || !data.cases.length) return;
  void persistLargeSnapshot(accountScope,data);
  try {
    const previous=readWebSnapshot<C,N>(accountScope,VIEW_MAX_AGE_MS);
    if(previous && previous.cases.length>data.cases.length) return;
    const raw = JSON.stringify(data);
    if (raw.length > MAX_JSON_LENGTH) return; // Do not exhaust browser storage.
    for (const name of ["sessionStorage","localStorage"] as const) {
      try {window[name].setItem(storageKey(accountScope),raw);} catch { /* Keep the other copy available. */ }
    }
  } catch {
    // Storage is optional (e.g., private browsing or quota reached).
  }
}
