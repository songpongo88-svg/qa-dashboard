// Vercel supplies coarse IP geolocation. Never request browser GPS or persist an IP.
const read = (req, key) => { try { return decodeURIComponent(String(req.headers[key] || '')).trim(); } catch { return ''; } };
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const city = read(req,'x-vercel-ip-city');
  const latRaw = read(req,'x-vercel-ip-latitude'), lonRaw = read(req,'x-vercel-ip-longitude');
  const lat = Number(latRaw), lon = Number(lonRaw);
  if (!city || !latRaw || !lonRaw || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) return res.status(200).json({ label: 'กรุงเทพมหานคร', latitude: 13.75, longitude: 100.50, source: 'fallback' });
  return res.status(200).json({ label: city, latitude: +lat.toFixed(2), longitude: +lon.toFixed(2), source: 'ip' });
}
