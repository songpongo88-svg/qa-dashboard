import React, { useSyncExternalStore } from 'react';
import './textbookIcons.css';

const TEXTBOOK_ICON_SLOTS: Record<string, number> = {
  dashboard: 0, chart: 0,
  add: 1, pencil: 1, evaluate: 1,
  document: 2, check: 2, queue: 2, list: 2,
  train: 3, 'theme-collection': 3,
  chat: 4, appeal: 4, phone: 4,
  signature: 5, presentation: 5,
  book: 6, coaching: 6,
  gift: 7, star: 7,
  users: 8,
  clock: 9,
  key: 10, logout: 10,
  theme: 11, palette: 11,
  ticket: 12, target: 12,
  shield: 13, security: 13, permissions: 13,
  home: 14,
  reading: 15,
};

const subscribers = new Set<() => void>();
let stopObserving: (() => void) | undefined;
const textbookSnapshot = () => typeof document !== 'undefined' && document.documentElement.dataset.qaTheme === 'textbook-train';
const serverSnapshot = () => false;

function subscribeTextbookTheme(notify: () => void) {
  subscribers.add(notify);
  if (!stopObserving && typeof document !== 'undefined') {
    const refresh = () => subscribers.forEach(listener => listener());
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-qa-theme'] });
    window.addEventListener('qa-appearance-change', refresh);
    stopObserving = () => {
      observer.disconnect();
      window.removeEventListener('qa-appearance-change', refresh);
    };
  }
  return () => {
    subscribers.delete(notify);
    if (!subscribers.size) {
      stopObserving?.();
      stopObserving = undefined;
    }
  };
}

export function useTextbookTheme() {
  return useSyncExternalStore(subscribeTextbookTheme, textbookSnapshot, serverSnapshot);
}

export function TextbookIcon({ kind, className = '' }: { kind: string; className?: string }) {
  const slot = TEXTBOOK_ICON_SLOTS[kind] ?? TEXTBOOK_ICON_SLOTS.document;
  return <span className={`qa-textbook-icon ${className}`} data-textbook-icon={kind} aria-hidden="true"
    style={{ backgroundImage: 'url("/textbook-theme/icons-watercolor-v2.png")', backgroundSize: '400% 400%', backgroundPosition: `${(slot % 4) * 100 / 3}% ${Math.floor(slot / 4) * 100 / 3}%` }} />;
}
