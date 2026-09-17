export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const query = String(req.query.q || '').trim();
  let url;
  if (query) {
    if (query.length < 2 || query.length > 80) return res.status(400).json({ error: 'กรอกชื่อเมือง 2–80 ตัวอักษร' });
    url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({ name: query, count: '8', language: 'th', format: 'json' });
  } else {
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!String(req.query.lat || '').trim() || !String(req.query.lon || '').trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) return res.status(400).json({ error: 'Invalid city coordinates' });
    url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: lat.toFixed(2), longitude: lon.toFixed(2), current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,is_day', hourly: 'precipitation_probability', daily: 'sunrise,sunset', timeformat: 'unixtime', timezone: 'auto', forecast_days: '2' });
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Weather provider unavailable');
    const data = await response.json();
    if (query) return res.status(200).json({ results: (data.results || []).map(city => ({ label: [...new Set([city.name,city.admin1,city.country].filter(Boolean))].join(', '), latitude: +city.latitude.toFixed(2), longitude: +city.longitude.toFixed(2), source: 'manual' })) });
    return res.status(200).json({ current: data.current, hourly: data.hourly, daily: data.daily, timezone: data.timezone });
  } catch { return res.status(503).json({ error: 'อัปเดตอากาศยังไม่สำเร็จ กรุณาลองอีกครั้ง' }); }
}
