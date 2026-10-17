import { useSyncExternalStore } from 'react';
import { characterThemeFor } from './model.mjs';
const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;
const snapshot = () => typeof document === 'undefined' ? '' : document.documentElement.dataset.qaCharacterTheme || '';
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach(notify => notify()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-qa-character-theme'] });
  }
  return () => { listeners.delete(listener); if (!listeners.size) { observer?.disconnect(); observer = undefined; } };
}
export const useCharacterTheme = () => characterThemeFor(useSyncExternalStore(subscribe, snapshot, () => ''));
