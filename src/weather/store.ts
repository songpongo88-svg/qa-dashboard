import { useSyncExternalStore } from 'react';
import { deviceCity } from './location';
import { WEATHER_ID, WEATHER_KEY, normalizeForecast, sceneFor, sceneUrl } from './model.mjs';

export type City = { label: string; latitude: number; longitude: number; source: 'ip' | 'manual' | 'fallback' | 'gps' };
const CACHE = 'qa-dashboard:weather-v6', CITY = 'qa-dashboard:weather-city-v1', REFRESH = 30 * 60000;
const listeners = new Set<() => void>();
const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key,value); } catch {} };
const parse = (key: string) => { try { return JSON.parse(read(key) || 'null'); } catch { return null; } };
const validCity = (city: any): city is City => Boolean(city && typeof city.label === 'string' && city.label.length < 200 && Number.isFinite(city.latitude) && Math.abs(city.latitude) <= 90 && Number.isFinite(city.longitude) && Math.abs(city.longitude) <= 180);
let state: { enabled: boolean; data: any; loading: boolean; error: string; now: number } = { enabled: false, data: null, loading: false, error: '', now: Date.now() };
let controller: AbortController | undefined, generation = 0, lastAttempt = 0, override: City | null = parse(CITY), sessionPreference: string | undefined;
if (!validCity(override)) override = null;
const enabled = () => (sessionPreference ?? read(WEATHER_KEY)) === WEATHER_ID;
function emit(patch: Partial<typeof state> = {}) {
  state = { ...state, ...patch };
  const root = document.documentElement;
  if (state.enabled) {
    const scene = sceneFor(state.data,state.now);
    root.dataset.qaWeatherCollection = 'auto'; root.dataset.qaWeatherState = `weather-${scene.id}`;
    root.dataset.qaWeatherNight = scene.id === 'night' ? `weather-${scene.base}` : '';
    root.dataset.qaWeatherBand = scene.band;
    root.style.setProperty('--weather-scene', `url("${sceneUrl(scene.scene)}")`);
  } else {
    for (const key of ['qaWeatherCollection','qaWeatherState','qaWeatherNight','qaWeatherBand']) delete root.dataset[key];
    root.style.removeProperty('--weather-scene');
  }
  listeners.forEach(listener => listener());
}
async function json(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('อัปเดตอากาศยังไม่สำเร็จ กรุณาลองอีกครั้ง');
  return response.json();
}
export async function refreshWeather(force = false) {
  if (!state.enabled || state.loading || (!force && Date.now() - lastAttempt < REFRESH)) return;
  const current = ++generation; controller?.abort(); controller = new AbortController(); const activeController = controller; const signal = activeController.signal;
  const timeout = setTimeout(() => activeController.abort(), 30000);
  lastAttempt = Date.now(); emit({ loading: true, error: '' });
  try {
    let city = override;
    if (!city) city = await deviceCity(signal);
    if (!city) { try { city = await json('/api/weather-location',signal); } catch (error) { if (signal.aborted) throw error; } }
    if (!validCity(city)) city = { label: 'กรุงเทพมหานคร', latitude: 13.75, longitude: 100.5, source: 'fallback' };
    const payload = await json(`/api/weather?lat=${city.latitude.toFixed(2)}&lon=${city.longitude.toFixed(2)}`,signal);
    const data = normalizeForecast(payload,city);
    if (current !== generation || !enabled()) return;
    write(CACHE,city.source === 'gps' ? null : JSON.stringify(data)); emit({ data, loading: false, now: Date.now() });
  } catch {
    if (current === generation && enabled()) emit({ loading: false, error: 'อัปเดตอากาศยังไม่สำเร็จ' });
  } finally { clearTimeout(timeout); }
}
export function chooseWeather() {
  sessionPreference = WEATHER_ID; write(WEATHER_KEY,WEATHER_ID);
  window.dispatchEvent(new CustomEvent('qa-appearance-change', { detail: { preference: WEATHER_ID } }));
  syncSelection();
}
export function chooseCity(city: City | null) {
  if (city && !validCity(city)) return;
  override = city; write(CITY,city ? JSON.stringify(city) : null); write(CACHE,null);
  generation++; controller?.abort(); emit({ data: null, loading: false, error: '' });
  void refreshWeather(true);
}
function syncSelection() {
  const active = enabled();
  if (active === state.enabled) return;
  if (!active) { generation++; controller?.abort(); emit({ enabled: false, loading: false }); return; }
  const cached = parse(CACHE);
  const usable = cached && Number.isFinite(cached.temp) && Number.isFinite(cached.fetchedAt) && Date.now()-cached.fetchedAt < 24*3600000 && validCity(cached.location) && (!override || (override.label === cached.location.label && override.latitude === cached.location.latitude && override.longitude === cached.location.longitude));
  emit({ enabled: true, data: usable ? cached : null, error: usable && Date.now()-cached.fetchedAt > REFRESH ? 'กำลังอัปเดตข้อมูลล่าสุด' : '' });
  lastAttempt = 0; void refreshWeather();
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useWeather = () => useSyncExternalStore(subscribe, () => state, () => state);
if (typeof window !== 'undefined') {
  // Remove the old precise-location cache; the new cache contains only coarse city data.
  write('qa-dashboard:weather-cache-v4',null);
  window.addEventListener('qa-appearance-change', (event: Event) => { sessionPreference = (event as CustomEvent).detail?.preference; syncSelection(); });
  window.addEventListener('storage', event => {
    if (event.key === WEATHER_KEY || event.key === null) { sessionPreference = undefined; syncSelection(); }
    if (event.key === CITY) { const city = parse(CITY); override = validCity(city) ? city : null; generation++; controller?.abort(); emit({ data: null, loading: false }); void refreshWeather(true); }
  });
  window.addEventListener('focus', () => { syncSelection(); void refreshWeather(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { emit({ now: Date.now() }); void refreshWeather(); } });
  setInterval(() => { if (!document.hidden && state.enabled) { emit({ now: Date.now() }); void refreshWeather(); } },60000);
  syncSelection();
}
