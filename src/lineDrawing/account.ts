import { useLayoutEffect, useSyncExternalStore } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firebaseDb } from '../firebaseClient';
import { lineDrawingVersionFromProfile } from './model.mjs';

export type LineDrawingCollectionState = {
  username: string;
  ready: boolean;
  version: 1 | 2;
  saving: boolean;
  error: string;
};

const EMPTY: LineDrawingCollectionState = { username: '', ready: false, version: 1, saving: false, error: '' };
let state = EMPTY;
let epoch = 0;
const listeners = new Set<() => void>();

function publish(next: LineDrawingCollectionState) {
  state = next;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.qaLineDrawingVersion = next.username && next.ready && next.version === 2 ? '2' : '1';
  }
  listeners.forEach(listener => listener());
}

export function activateLineDrawingAccount(username = '') {
  if (state.username === username) return;
  epoch += 1;
  publish({ ...EMPTY, username });
}

// Share the account profile read already made for theme preferences.
export function restoreLineDrawingCollection(username: string, profile: unknown) {
  if (state.username !== username) return;
  publish({ ...state, ready: true, version: lineDrawingVersionFromProfile(profile), error: '' });
}

export async function upgradeLineDrawingCollection(): Promise<boolean> {
  if (!state.username || !state.ready || state.saving) return false;
  if (state.version === 2) return true;
  const account = state.username;
  const requestEpoch = epoch;
  publish({ ...state, saving: true, error: '' });
  try {
    const ref = doc(firebaseDb, 'qa_user_profiles', account);
    await runTransaction(firebaseDb, async transaction => {
      const profile = await transaction.get(ref);
      if (lineDrawingVersionFromProfile(profile.data()) === 2) return;
      transaction.set(ref, {
        lineDrawingCollectionVersion: 2,
        lineDrawingCollectionUpdatedAt: serverTimestamp(),
      }, { merge: true });
    });
    // A confirmed write for one account must never change another account's skin.
    if (epoch !== requestEpoch || state.username !== account) return false;
    publish({ ...state, version: 2, saving: false, error: '' });
    return true;
  } catch {
    if (epoch === requestEpoch && state.username === account) {
      publish({ ...state, saving: false, error: 'อัปเดตธีมไม่สำเร็จ กรุณาลองใหม่ คุณยังใช้เวอร์ชันเดิมได้' });
    }
    return false;
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useLineDrawingCollectionAccount(username?: string) {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  useLayoutEffect(() => { activateLineDrawingAccount(username || ''); }, [username]);
  return snapshot.username === (username || '') ? snapshot : EMPTY;
}
