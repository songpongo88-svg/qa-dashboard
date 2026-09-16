// Isolated test transport. This file is never imported by the production application.
export const state = { docs: new Map(), writes: [], failWrite: false, failRead: false,
  identity: { username: 'test.agent', displayName: 'Test Agent', role: 'Admin Live Chat', teamName: 'Team A', email: '', sessionId: 'test-session' }, tick: 0 };
export function reset() { state.docs.clear(); state.writes.length = 0; state.failWrite = false; state.failRead = false; state.tick = 0; }
export const firebaseDb = {};
export const doc = (_db, ...segments) => ({ path: segments.join('/') });
export const collection = (_db, path) => ({ path });
export const where = (field, op, value) => ({ field, op, value });
export const query = (reference, ...conditions) => ({ ...reference, conditions });
function snapshot(reference) { const value = state.docs.get(reference.path); return { id: reference.path.split('/').at(-1), exists: () => value !== undefined, data: () => value }; }
export async function getDocFromServer(reference) { if (state.failRead) throw new Error('offline'); return snapshot(reference); }
export const getDoc = getDocFromServer;
export async function getDocsFromServer(reference) {
  if (state.failRead) throw new Error('offline');
  return { docs: [...state.docs.keys()].filter((key) => key.startsWith(reference.path + '/') && !key.slice(reference.path.length + 1).includes('/'))
    .map((path) => snapshot({ path })).filter((snap) => (reference.conditions || []).every(({ field, op, value }) => op === 'in' ? value.includes(snap.data()[field]) : snap.data()[field] === value)) };
}
export const serverTimestamp = () => { const value = new Date(Date.UTC(2026, 8, 16, 12, 0, state.tick++)); return { toDate: () => value }; };
export async function runTransaction(_db, callback) {
  const pending = [];
  await callback({ get: async (reference) => snapshot(reference), set: (reference, data) => pending.push([reference.path, data]) });
  if (state.failWrite) throw new Error('write denied');
  for (const [path, data] of pending) { state.docs.set(path, data); state.writes.push(path); }
}
export async function validateStoredUserSession(sessionId, username) {
  return sessionId === state.identity.sessionId && username === state.identity.username ? { valid: true, session: state.identity } : { valid: false, reason: 'mismatch' };
}
export async function fetchStoredSignatureLibraryEntry() { return ''; }
