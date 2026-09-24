import assert from 'node:assert/strict';
import { readDraftQueue, writeDraftQueue } from '../src/lib/evaluation/draftPersistence.ts';

const saved = new Map();
const browserStorage = new Map();
const localStorage = {
  getItem(key) { return browserStorage.get(key) ?? null; },
  removeItem(key) { browserStorage.delete(key); },
  setItem() { throw new DOMException('Storage quota exceeded', 'QuotaExceededError'); },
};

const database = {
  objectStoreNames: { contains: () => true },
  close() {},
  transaction() {
    const transaction = {
      objectStore() {
        return {
          get(key) {
            const request = {};
            queueMicrotask(() => { request.result = saved.get(key); request.onsuccess?.(); });
            return request;
          },
          put(value, key) {
            queueMicrotask(() => { saved.set(key, structuredClone(value)); transaction.oncomplete?.(); });
          },
        };
      },
    };
    return transaction;
  },
};

globalThis.window = {
  localStorage,
  indexedDB: {
    open() {
      const request = {};
      queueMicrotask(() => { request.result = database; request.onsuccess?.(); });
      return request;
    },
  },
};

const original = { draftId: 'case-a', caseId: 'A', savedAtMs: 1 };
browserStorage.set('qa-dashboard:create-evaluation:drafts', JSON.stringify([original]));
assert.deepEqual(await readDraftQueue(), [original], 'existing local drafts migrate before removal');
assert.equal(browserStorage.size, 0, 'legacy copy is removed after IndexedDB commits');

const next = { draftId: 'case-b', caseId: 'B', savedAtMs: 2 };
await writeDraftQueue([original, next]);
assert.deepEqual(await readDraftQueue(), [original, next], 'both drafts survive a quota error in localStorage');

await writeDraftQueue([next]);
assert.deepEqual(await readDraftQueue(), [next], 'deleting one draft persists without restoring it from old storage');
console.log('PASS draft migration, localStorage quota and Draft Queue reload');
