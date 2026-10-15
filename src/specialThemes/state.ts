import { useSyncExternalStore } from 'react';
import { specialThemeFor } from './model.mjs';

const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;
const snapshot = () => typeof document === 'undefined' ? '' : document.documentElement.dataset.qaSpecialTheme || '';
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach(notify => notify()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-qa-special-theme'] });
  }
  return () => { listeners.delete(listener); if (!listeners.size) { observer?.disconnect(); observer = undefined; } };
}
export function useSpecialTheme() {
  return specialThemeFor(useSyncExternalStore(subscribe, snapshot, () => ''));
}
