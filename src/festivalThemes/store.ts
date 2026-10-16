import { useSyncExternalStore } from 'react';
import { festivalThemeFor } from './model.mjs';

const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;
const snapshot = () => typeof document === 'undefined' ? '' : document.documentElement.dataset.qaTheme || '';
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach(notify => notify()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-qa-theme'] });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) { observer?.disconnect(); observer = undefined; }
  };
}
export function useFestivalTheme() {
  return festivalThemeFor(useSyncExternalStore(subscribe, snapshot, () => ''));
}
