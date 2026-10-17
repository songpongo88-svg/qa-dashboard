import { useLayoutEffect, useSyncExternalStore } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firebaseDb } from '../firebaseClient';
import { characterVersionFromProfile } from './model.mjs';

export type CharacterCollectionState = { username: string; ready: boolean; version: 1 | 2; saving: boolean; error: string };
const EMPTY: CharacterCollectionState = { username: '', ready: false, version: 1, saving: false, error: '' };
let state = EMPTY, epoch = 0;
const listeners = new Set<() => void>();
function publish(next: CharacterCollectionState) {
  state = next;
  if (typeof document !== 'undefined') {
    const version = next.username && next.ready && next.version === 2 ? '2' : '1';
    if (document.documentElement.dataset.qaCharacterVersion !== version) document.documentElement.dataset.qaCharacterVersion = version;
  }
  listeners.forEach(listener => listener());
}
export function activateCharacterAccount(username = '') {
  if (state.username === username) return;
  epoch += 1;
  publish({ ...EMPTY, username });
}
// Reuses the existing account-theme profile read. Missing fields always mean V1.
export function restoreCharacterCollection(username: string, profile: unknown) {
  if (state.username !== username) return;
  publish({ ...state, ready: true, version: characterVersionFromProfile(profile), error: '' });
}
export async function upgradeCharacterCollection() {
  if (!state.username || !state.ready || state.saving || state.version === 2) return;
  const account = state.username, requestEpoch = epoch;
  publish({ ...state, saving: true, error: '' });
  try {
    const ref = doc(firebaseDb, 'qa_user_profiles', account);
    await runTransaction(firebaseDb, async transaction => {
      const snapshot = await transaction.get(ref);
      if (characterVersionFromProfile(snapshot.data()) === 2) return;
      transaction.set(ref, { characterCollectionVersion: 2, characterCollectionUpdatedAt: serverTimestamp() }, { merge: true });
    });
    // Apply only after persistence; a pending request cannot upgrade another account.
    if (epoch === requestEpoch && state.username === account) publish({ ...state, version: 2, saving: false, error: '' });
  } catch {
    if (epoch === requestEpoch && state.username === account) publish({ ...state, saving: false, error: 'อัปเดตไม่สำเร็จ คุณยังใช้ V1 อยู่ กรุณาลองอีกครั้งเมื่อเชื่อมต่อได้' });
  }
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useCharacterCollectionAccount(username?: string) {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useLayoutEffect(() => { activateCharacterAccount(username || ''); }, [username]);
  return snapshot.username === (username || '') ? snapshot : EMPTY;
}
