import { useEffect, useState } from 'react';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firebaseDb } from '../firebaseClient';
import { activeInterval, displayedUsage, mergeUsage, pendingUsage, SPECIAL_SAVE_MS, SPECIAL_UNLOCK_MS, usageMs } from './model.mjs';

export type SpecialUsage = { account: string; ready: boolean; activeMs: number; unlocked: boolean; syncPending: boolean };
type Ledger = { contribution: number; serverSource: number; serverTotal: number; lastCreditedAt: number };
const EMPTY: SpecialUsage = { account: '', ready: false, activeMs: 0, unlocked: false, syncPending: false };
const DEVICE_KEY = 'qa-dashboard:special-device-v1';
const PREFIX = 'qa-dashboard:special-usage-v1:';
const read = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Server persistence still works. */ } };

export function useSpecialThemeUsage(username?: string): SpecialUsage {
  const [state, setState] = useState<SpecialUsage>(EMPTY);
  useEffect(() => {
    if (!username) { setState(EMPTY); return; }
    let stopped = false, ready = false, syncing = false, retryPending = false;
    const account = username;
    const key = PREFIX + encodeURIComponent(account);
    const leaseKey = key + ':lease';
    const tabId = crypto.randomUUID();
    let deviceId = read(DEVICE_KEY);
    if (typeof deviceId !== 'string') { deviceId = crypto.randomUUID(); write(DEVICE_KEY, deviceId); }
    const emptyLedger: Ledger = { contribution: 0, serverSource: 0, serverTotal: 0, lastCreditedAt: 0 };
    let ledger: Ledger = { ...emptyLedger, ...read(key) };
    const ref = doc(firebaseDb, 'qa_user_profiles', account);
    let lastSample = Date.now(), lastInteraction = lastSample, lastSave = lastSample;
    let wasEligible = !document.hidden && document.hasFocus();
    const reload = () => { ledger = { ...ledger, ...read(key) }; };
    const publish = () => {
      if (stopped) return;
      const next = { account, ready, activeMs: displayedUsage(ledger),
        unlocked: usageMs(ledger.serverTotal) >= SPECIAL_UNLOCK_MS, syncPending: retryPending };
      // The picker displays minutes. Avoid rerendering the whole workspace every sample.
      setState(previous => previous.account === next.account && previous.ready === next.ready
        && previous.unlocked === next.unlocked && previous.syncPending === next.syncPending
        && Math.floor(previous.activeMs / 60000) === Math.floor(next.activeMs / 60000) ? previous : next);
    };
    const releaseLease = () => {
      if (read(leaseKey)?.owner === tabId) { try { localStorage.removeItem(leaseKey); } catch {} }
    };
    const save = async () => {
      reload();
      if (!ready || syncing || !pendingUsage(ledger) || usageMs(ledger.serverTotal) >= SPECIAL_UNLOCK_MS) return;
      syncing = true; lastSave = Date.now();
      const cumulative = ledger.contribution;
      try {
        const saved = await runTransaction(firebaseDb, async transaction => {
          const snapshot = await transaction.get(ref);
          const profile = snapshot.data() || {};
          const next = mergeUsage(profile, deviceId, cumulative);
          transaction.set(ref, { specialThemeUsageMs: next.total, specialThemeUsageSources: next.sources,
            specialThemeUsageUpdatedAt: serverTimestamp(),
            ...(next.total >= SPECIAL_UNLOCK_MS && !profile.specialThemeUnlockedAt ? { specialThemeUnlockedAt: serverTimestamp() } : {}),
          }, { merge: true });
          return next;
        });
        reload();
        ledger.serverTotal = Math.max(usageMs(ledger.serverTotal), saved.total);
        ledger.serverSource = Math.max(usageMs(ledger.serverSource), saved.source);
        write(key, ledger); retryPending = false;
      } catch {
        // The cumulative local batch survives reloads; retrying it is idempotent.
        retryPending = true;
      } finally { syncing = false; publish(); }
    };
    const withLease = async (callback: () => void) => {
      if (navigator.locks) {
        await navigator.locks.request(key, { ifAvailable: true }, lock => { if (lock && !stopped) callback(); });
      } else {
        const now = Date.now(), lease = read(leaseKey);
        if (lease && lease.owner !== tabId && lease.until > now) return;
        write(leaseKey, { owner: tabId, until: now + 15000 });
        if (read(leaseKey)?.owner === tabId) callback();
      }
    };
    const sample = () => {
      const now = Date.now(), start = lastSample;
      lastSample = now;
      const eligible = !document.hidden && document.hasFocus();
      const active = activeInterval({ start, end: now, lastInteraction, visible: eligible, focused: wasEligible });
      wasEligible = eligible;
      if (!eligible) releaseLease();
      if (!active || stopped) return;
      void withLease(() => {
        reload();
        if (usageMs(ledger.serverTotal) >= SPECIAL_UNLOCK_MS) { publish(); return; }
        // A shared device watermark also excludes overlapping intervals from another tab.
        const credit = Math.min(active, Math.max(0, now - Math.max(start, Number(ledger.lastCreditedAt) || 0)));
        ledger.contribution = usageMs(usageMs(ledger.contribution) + credit);
        ledger.lastCreditedAt = Math.max(Number(ledger.lastCreditedAt) || 0, now);
        write(key, ledger); publish();
        if (ready && (now - lastSave >= SPECIAL_SAVE_MS || displayedUsage(ledger) >= SPECIAL_UNLOCK_MS && now - lastSave >= 15000)) void save();
      });
    };
    const onActivity = () => {
      const now = Date.now();
      if (now - lastInteraction < 1000) return;
      sample(); lastInteraction = now;
    };
    const onPause = () => {
      sample();
      if (Date.now() - lastSave >= 60000) void save();
    };
    const onFocus = () => { lastSample = lastInteraction = Date.now(); wasEligible = !document.hidden && document.hasFocus(); };
    const onStorage = (event: StorageEvent) => { if (event.key === key) { reload(); publish(); } };
    const onOnline = () => { void save(); };
    const timer = window.setInterval(sample, 5000);
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];
    for (const event of activityEvents) document.addEventListener(event, onActivity, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onPause);
    window.addEventListener('blur', onPause);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPause);
    window.addEventListener('storage', onStorage);
    window.addEventListener('online', onOnline);
    void getDoc(ref).then(snapshot => {
      if (stopped) return;
      const profile = snapshot.data() || {};
      reload();
      ledger.serverTotal = usageMs(profile.specialThemeUsageMs);
      ledger.serverSource = usageMs(profile.specialThemeUsageSources?.[deviceId]);
      ledger.contribution = Math.max(usageMs(ledger.contribution), ledger.serverSource);
      write(key, ledger); ready = true; publish();
      if (pendingUsage(ledger)) void save();
    }).catch(() => { if (!stopped) { ready = true; retryPending = true; publish(); } });
    publish();
    return () => {
      sample(); stopped = true; void save(); releaseLease(); window.clearInterval(timer);
      for (const event of activityEvents) document.removeEventListener(event, onActivity, true);
      document.removeEventListener('visibilitychange', onPause);
      window.removeEventListener('blur', onPause); window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPause); window.removeEventListener('storage', onStorage);
      window.removeEventListener('online', onOnline);
    };
  }, [username]);
  return state.account === (username || '') ? state : { ...EMPTY, account: username || '' };
}
