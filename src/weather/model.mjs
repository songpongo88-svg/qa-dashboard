export const WEATHER_KEY = 'qa-dashboard:custom-theme-v1';
export const WEATHER_ID = 'weather-auto';
export const WEATHER_STATES = [
  ['clear','Clear / Fair','แจ่มใส','☀️'], ['hot','Sunny / Hot','แดดร้อน','☀️'],
  ['partly-cloudy','Partly Cloudy','มีเมฆสลับแดด','🌤️'], ['cloudy','Cloudy','เมฆมาก','☁️'],
  ['light-rain','Light Rain','ฝนเล็กน้อย','🌦️'], ['rain','Rain','ฝนตก','🌧️'],
  ['thunderstorm','Thunderstorm','พายุฝนฟ้าคะนอง','⛈️'], ['fog','Mist / Fog','หมอก','🌫️'],
  ['sunshower','Rain + Clear','ฝนตกแต่ฟ้าใส','🌦️'], ['night','Night','กลางคืน','🌙'],
];
export const numberOrNull = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
export function temperatureBand(temp) { return temp >= 35 ? 'hot' : temp >= 25 ? 'normal' : temp >= 15 ? 'cool' : 'cold'; }
export function classifyDay(c) {
  const code = numberOrNull(c.weather_code), temp = numberOrNull(c.temperature_2m), cloud = numberOrNull(c.cloud_cover);
  const p = Math.max(numberOrNull(c.precipitation) || 0, numberOrNull(c.rain) || 0);
  if ([95,96,99].includes(code)) return 'thunderstorm';
  if ([45,48].includes(code)) return 'fog';
  if (p > 0 || [51,53,55,56,57,61,63,65,66,67,80,81,82,71,73,75,77,85,86].includes(code)) {
    if (p > 0 && cloud !== null && cloud <= 55) return 'sunshower';
    if ([51,53,56,61,80].includes(code) || (p > 0 && p <= 1)) return 'light-rain';
    return 'rain';
  }
  if (code === 3 || (cloud !== null && cloud >= 75)) return 'cloudy';
  if ([1,2].includes(code) || (cloud !== null && cloud >= 30)) return 'partly-cloudy';
  return temp >= 35 ? 'hot' : 'clear';
}
export function sceneFor(data, now = Date.now()) {
  if (!data) return { id: 'clear', base: 'clear', scene: 'clear', label: 'กำลังตรวจสภาพอากาศ', icon: '☁️', band: 'normal' };
  const seconds = now / 1000;
  const daylight = data.sun?.find(([rise,set]) => seconds >= rise - 43200 && seconds < set + 21600);
  const night = daylight ? seconds < daylight[0] || seconds >= daylight[1] : data.isDay === false;
  const base = night && data.base === 'hot' ? 'clear' : data.base;
  const meta = WEATHER_STATES.find(row => row[0] === base) || WEATHER_STATES[0];
  let scene = night ? 'night' : base;
  if (night && ['partly-cloudy','cloudy'].includes(base)) scene = 'night-cloudy';
  if (night && ['light-rain','rain','sunshower'].includes(base)) scene = 'night-rain';
  if (night && base === 'thunderstorm') scene = 'night-thunderstorm';
  if (night && base === 'fog') scene = 'night-fog';
  return { id: night ? 'night' : base, base, scene, label: night ? `กลางคืน · ${meta[2]}` : meta[2], icon: night && base === 'clear' ? '🌙' : meta[3], band: temperatureBand(data.temp) };
}
export function normalizeForecast(payload, location, now = Date.now()) {
  const c = payload?.current;
  if (!c || numberOrNull(c.temperature_2m) === null || numberOrNull(c.weather_code) === null || ![0,1].includes(c.is_day) || !Number.isFinite(c.time)) throw new Error('ข้อมูลอากาศไม่ครบ กรุณาลองอัปเดตอีกครั้ง');
  if (Math.abs(now / 1000 - c.time) > 7200) throw new Error('ข้อมูลอากาศจากผู้ให้บริการเก่าเกินไป');
  let hour = -1;
  for (let i = 0; i < (payload.hourly?.time?.length || 0); i++) if (hour < 0 || Math.abs(payload.hourly.time[i]-c.time) < Math.abs(payload.hourly.time[hour]-c.time)) hour = i;
  const sun = (payload.daily?.sunrise || []).map((rise,i) => [rise,payload.daily.sunset?.[i]]).filter(pair => pair.every(Number.isFinite));
  return { temp: c.temperature_2m, feels: numberOrNull(c.apparent_temperature), humidity: numberOrNull(c.relative_humidity_2m), wind: numberOrNull(c.wind_speed_10m), rainChance: numberOrNull(payload.hourly?.precipitation_probability?.[hour]), base: classifyDay(c), isDay: c.is_day === 1, sun, timezone: payload.timezone || 'Asia/Bangkok', observedAt: c.time * 1000, fetchedAt: now, location };
}
export const sceneUrl = id => `/weather/${id}.webp`;
