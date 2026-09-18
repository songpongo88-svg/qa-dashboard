import type { City } from './store';
let denied = false;
export async function deviceCity(signal: AbortSignal, retry = false): Promise<City | null> {
  if (retry) denied = false;
  if (denied || !navigator.geolocation || signal.aborted) return null;
  const point = await new Promise<GeolocationPosition | null>(resolve => {
    let done = false;
    const finish = (value: GeolocationPosition | null) => { if (done) return; done = true; clearTimeout(timer); signal.removeEventListener('abort', cancel); resolve(value); };
    const cancel = () => finish(null);
    const timer = setTimeout(cancel, 10000);
    signal.addEventListener('abort', cancel, { once: true });
    navigator.geolocation.getCurrentPosition(value => finish(value), error => { if (error.code === 1) denied = true; finish(null); }, { enableHighAccuracy: false, timeout: 9000, maximumAge: 300000 });
  });
  if (!point || signal.aborted) return null;
  const { latitude, longitude } = point.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) return null;
  let label = 'ตำแหน่งปัจจุบัน (ยังระบุชื่อพื้นที่ไม่ได้)';
  try {
    const response = await fetch(`/api/reverse-geocode?lat=${latitude.toFixed(4)}&lon=${longitude.toFixed(4)}`, { signal, cache: 'no-store' });
    if (response.ok) { const result = await response.json(); if (typeof result.label === 'string' && result.label.trim()) label = result.label; }
  } catch { /* Weather can still use the device coordinates when naming fails. */ }
  return signal.aborted ? null : { label, latitude: +latitude.toFixed(2), longitude: +longitude.toFixed(2), source: 'gps' };
}
