// Isolated test transport. This file is never imported by the production application.
export const state = { docs: new Map(), writes: [], reads: [], queries: [], failWrite: false, failRead: false,
  identity: { username: 'test.agent', displayName: 'Test Agent', role: 'Admin Live Chat', teamName: 'Team A', email: '', sessionId: 'test-session' }, tick: 0 };
export function reset() { state.docs.clear(); state.writes.length = 0; state.reads.length = 0; state.queries.length = 0; state.failWrite = false; state.failRead = false; state.tick = 0; }
export const firebaseDb = {};
export const doc = (_db, ...segments) => ({ path: segments.join('/') });
export const collection = (_db, path) => ({ path });
export const where = (field, op, value) => ({ field, op, value });
export const documentId = () => '__name__';
export const query = (reference, ...conditions) => ({ ...reference, conditions });
function snapshot(reference) {
  const session = reference.path === 'qa_user_sessions/' + state.identity.sessionId
    ? { ...state.identity, policyVersion: 'qa-session-policy-2026-07-15-v1', status: 'active',
      createdAt: '2026-09-01T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' } : undefined;
  const value = state.docs.get(reference.path) ?? session;
  return { id: reference.path.split('/').at(-1), exists: () => value !== undefined, data: () => value };
}
export async function getDocFromServer(reference) { state.reads.push(reference.path); if (state.failRead) throw new Error('offline'); return snapshot(reference); }
export const getDoc = getDocFromServer;
export async function setDoc(reference, data) { if (state.failWrite) throw new Error('write denied'); state.docs.set(reference.path, data); state.writes.push(reference.path); }
export async function updateDoc(reference, data) { return setDoc(reference, { ...state.docs.get(reference.path), ...data }); }
export async function getDocsFromServer(reference) {
  if (state.failRead) throw new Error('offline');
  state.queries.push(reference);
  const docs = [...state.docs.keys()].filter((key) => key.startsWith(reference.path + '/') && !key.slice(reference.path.length + 1).includes('/'))
    .map((path) => snapshot({ path })).filter((snap) => (reference.conditions || []).every(({ field, op, value }) => {
      const actual = field === '__name__' ? snap.id : snap.data()[field];
      return op === 'in' ? value.includes(actual) : actual === value;
    }));
  state.reads.push(...(docs.length ? docs.map((snap) => reference.path + '/' + snap.id) : [reference.path + '/<empty-query>']));
  return { docs };
}
export const serverTimestamp = () => { const value = new Date(Date.UTC(2026, 8, 16, 12, 0, state.tick++)); return { toDate: () => value }; };
export async function runTransaction(_db, callback) {
  const pending = [];
  await callback({ get: async (reference) => { state.reads.push(reference.path); return snapshot(reference); }, set: (reference, data) => pending.push([reference.path, data]) });
  if (state.failWrite) throw new Error('write denied');
  for (const [path, data] of pending) { state.docs.set(path, data); state.writes.push(path); }
}
// Exercise the actual validator so read-count checks cover its real session/control lookups.
export { validateStoredUserSession } from '../../src/sessionStore.ts';
export async function fetchStoredSignatureLibraryEntry() { return ''; }
