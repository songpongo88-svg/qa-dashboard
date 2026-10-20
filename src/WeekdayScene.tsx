import React, { useSyncExternalStore } from "react";
import { weekdayThemeFor } from './weekdayThemes/model.mjs';

const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;
const snapshot = () => typeof document === 'undefined' ? '' : document.documentElement.dataset.qaTheme || '';
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach(notify => notify()));
    observer.observe(document.documentElement, { attributes:true, attributeFilter:['data-qa-theme'] });
  }
  return () => { listeners.delete(listener); if (!listeners.size) { observer?.disconnect(); observer=undefined; } };
}
export function useWeekdayScene() { return weekdayThemeFor(useSyncExternalStore(subscribe, snapshot, () => '')); }

export default function WeekdayScene({ scene, title }: { scene: NonNullable<ReturnType<typeof useWeekdayScene>>; title: string }) {
  const date = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return (
    <header className="qa-weekday-scene" data-qa-weekday-scene="true">
      <div className="qa-weekday-scene-photo" aria-hidden="true" />
      <div className="qa-weekday-scene-content">
        <div className="qa-weekday-brand-row">
          <img src="/robinhood-logo.png" alt="Robinhood" width="40" height="40" />
          <div><strong>Robinhood QA</strong><div className="qa-weekday-scene-eyebrow">HAPPY {scene.english.toUpperCase()}</div></div>
        </div>
        <h1>สวัสดีวัน<span>{scene.day}</span></h1>
        <p>{scene.message}</p>
        <div className="qa-weekday-scene-meta">{title} · {date}</div>
      </div>
    </header>
  );
}

/** A real grid column reserves space for the rail; data and dialogs stay interactive. */
export function WeekdayDashboardLayout({ children }: { children: React.ReactNode }) {
  const scene = useWeekdayScene();
  return (
    <div className={scene ? "qa-weekday-dashboard-layout" : "qa-weekday-layout-inactive"}>
      <div className="qa-weekday-dashboard-main">{children}</div>
      {scene ? (
        <aside className="qa-weekday-side-rail" aria-label="ข้อความประจำวัน">
          <div className="qa-weekday-side-photo" aria-hidden="true" />
          <div className="qa-weekday-side-copy">
            <span className="qa-weekday-side-label">{scene.english}</span>
            <blockquote>{scene.quote}</blockquote>
            <div className="qa-weekday-side-rule" />
            <p>Good People<br />Better Service</p>
          </div>
          <div className="qa-weekday-side-footer">Same System<br /><strong>More Vibes</strong></div>
        </aside>
      ) : null}
    </div>
  );
}
