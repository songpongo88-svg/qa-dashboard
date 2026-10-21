import { useLayoutEffect, useState } from 'react';
import { initialLoginAppearance, readLoginAppearance, writeLoginAppearance, resolveLoginTheme } from './model.mjs';

const browserStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
};

function rootAppearance() {
  const root = document.documentElement;
  const weather = root.dataset.qaWeatherState?.replace(/^weather-/, '') || 'clear';
  const base = root.dataset.qaWeatherNight?.replace(/^weather-/, '');
  const weatherScene = weather !== 'night' ? weather : /cloud/.test(base || '') ? 'night-cloudy' : /rain|sunshower/.test(base || '') ? 'night-rain' : base === 'thunderstorm' ? 'night-thunderstorm' : base === 'fog' ? 'night-fog' : 'night';
  return { festivalId: root.dataset.qaFestivalOverride || '', weatherScene, now: Date.now() };
}
export function useLoginAppearance({ authenticated, ready, themeId, preference, characterVersion, accountUsername = '', loginUsername = '', lineDrawingPublished = false }: {
  authenticated: boolean; ready: boolean; themeId: string; preference: string; characterVersion: 1 | 2; accountUsername?: string; loginUsername?: string; lineDrawingPublished?: boolean;
}) {
  const [state, setState] = useState(() => ({ appearance: initialLoginAppearance(browserStorage), environment: rootAppearance() }));
  useLayoutEffect(() => {
    const sync = () => {
      let remembered = null;
      if (authenticated && ready) {
        remembered = writeLoginAppearance(browserStorage, { version: 1, themeId, preference, characterVersion, lineDrawingAccount: accountUsername });
      } else if (!authenticated) {
        remembered = readLoginAppearance(browserStorage);
      }
      const environment = { ...rootAppearance(), loginUsername, lineDrawingPublished };
      setState(current => {
        const next = { appearance: remembered || current.appearance, environment };
        // Root appearance events can arrive together; do not add a render loop.
        return JSON.stringify(next) === JSON.stringify(current) ? current : next;
      });
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-qa-theme', 'data-qa-festival-override', 'data-qa-weather-state', 'data-qa-weather-night', 'data-qa-weather-collection', 'data-qa-weekday-collection'] });
    window.addEventListener('qa-appearance-change', sync);
    window.addEventListener('storage', sync);
    document.addEventListener('visibilitychange', sync);
    const clock = window.setInterval(sync, 60_000);
    return () => {
      observer.disconnect(); window.clearInterval(clock);
      window.removeEventListener('qa-appearance-change', sync); window.removeEventListener('storage', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [authenticated, ready, themeId, preference, characterVersion, accountUsername, loginUsername, lineDrawingPublished]);
  return resolveLoginTheme(state.appearance, state.environment);
}
