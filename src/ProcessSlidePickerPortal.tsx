import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './processSlidePickerPortal.css';

// A body-level portal cannot be clipped or repositioned by a themed card's blur.
export function ProcessSlidePickerPortal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const scope = useRef<HTMLDivElement>(null);
  const priorFocus = useRef(document.activeElement as HTMLElement | null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const previousFocus = priorFocus.current;
    const previousOverflow = document.body.style.overflow;
    const app = document.getElementById('root');
    const wasInert = app?.hasAttribute('inert');
    app?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(scope.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]') || []).filter(element => !element.closest('[hidden]') && element.getAttribute('aria-hidden') !== 'true');
    (scope.current?.querySelector<HTMLElement>('input:not([type="checkbox"])') || focusable()[0])?.focus();
    const keydown = (event: KeyboardEvent) => {
      // The existing slide Preview viewer opens above the chooser.
      if (Array.from(document.querySelectorAll('[role="dialog"][aria-label^="Slide "]')).some(dialog => !scope.current?.contains(dialog))) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && (document.activeElement === first || !scope.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !scope.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      if (app && !wasInert) app.removeAttribute('inert');
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(<div ref={scope} data-process-picker-portal="true">{children}</div>, document.body);
}
