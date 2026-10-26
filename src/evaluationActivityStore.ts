import { collection, getDocsFromServer, onSnapshot } from 'firebase/firestore';
import { firebaseDb } from './firebaseClient';
import { EVALUATION_ACTIVITY_COLLECTION, normalizeEvaluationActivity, type EvaluationActivity, type EvaluationActivityState } from './evaluationActivity';
let state: EvaluationActivityState = { ready: false, error: false, records: [], now: Date.now() };
const listeners = new Set<() => void>();
let stop: (() => void) | null = null, timer: ReturnType<typeof setInterval> | undefined;
let revisions: Map<string, string> | null = null, refreshResult: ((id: string) => Promise<void>) | null = null, sequence = 0;
export function configureEvaluationResultRefresh(handler: (id: string) => Promise<void>) { refreshResult = handler; }
const publish = (next: EvaluationActivityState) => { state = next; listeners.forEach(listener => listener()); };
export const getEvaluationActivitySnapshot = () => state;
export function subscribeEvaluationActivity(listener: () => void) {
  listeners.add(listener);
  if (!stop) {
    const pendingResults = new Set<string>();
    let refreshQueue = Promise.resolve();
    stop = onSnapshot(collection(firebaseDb, EVALUATION_ACTIVITY_COLLECTION), { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) { sequence++; publish({ ...state, ready: false, now: Date.now() }); return; }
      if (snapshot.metadata.hasPendingWrites) return;
      const records = snapshot.docs.map(item => normalizeEvaluationActivity(item.data(), item.id)).filter((row): row is EvaluationActivity => Boolean(row));
      const revisionRows = snapshot.docs.filter(item => item.id.startsWith('__result_revision')).map(item => ({ id: item.id, ...item.data() }));
      const changed = revisions === null ? [] : revisionRows.filter(row => revisions!.get(row.id) !== String(row.revision || row.updatedAt || '') && row.evaluationId);
      revisions = new Map(revisionRows.map(row => [row.id, String(row.revision || row.updatedAt || '')]));
      const current = ++sequence;
      // A newer heartbeat must wait for the committed result to reach the shared cache.
      refreshQueue = refreshQueue.then(async () => {
        changed.forEach(row => pendingResults.add(String(row.evaluationId)));
        try { await Promise.all([...pendingResults].map(async id => { await refreshResult?.(id); pendingResults.delete(id); })); }
        catch { if (current === sequence) publish({ ...state, ready: false, error: true, now: Date.now() }); return; }
        if (current === sequence) publish({ ready: true, error: false, records, now: Date.now() });
      });
    }, () => { sequence++; publish({ ...state, ready: false, error: true, now: Date.now() }); });
    timer = setInterval(() => { if (state.records.some(row => !row.persistent)) publish({ ...state, now: Date.now() }); }, 30_000);
  }
  return () => { listeners.delete(listener); if (!listeners.size) {
    stop?.(); stop = null; clearInterval(timer); revisions = null; sequence++;
    state = { ready: false, error: false, records: [], now: Date.now() };
  } };
}
export async function fetchEvaluationActivity(): Promise<EvaluationActivityState> {
  const snapshot = await getDocsFromServer(collection(firebaseDb, EVALUATION_ACTIVITY_COLLECTION));
  return { ready: true, error: false, now: Date.now(), records: snapshot.docs.map(item => normalizeEvaluationActivity(item.data(), item.id)).filter((row): row is EvaluationActivity => Boolean(row)) };
}
