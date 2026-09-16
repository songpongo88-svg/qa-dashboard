const clean = (value = "") => String(value)
  .replace(/^Khet\s+/i, "")
  .replace(/^Khwaeng\s+/i, "")
  .replace(/^Amphoe\s+/i, "")
  .replace(/^District\s+/i, "")
  .trim();

const component = (items, type) => {
  const row = items.find((item) => Array.isArray(item.types) && item.types.includes(type));
  return row ? clean(row.long_name || row.short_name || "") : "";
};

async function fromGoogle(lat, lon, key) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lon}`);
  url.searchParams.set("language", "en");
  url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Google reverse geocoding failed");
  const payload = await response.json();
  const result = payload.results?.[0];
  if (!result) throw new Error("Google reverse geocoding returned no result");
  const c = result.address_components || [];
  const district = component(c, "sublocality_level_1") || component(c, "administrative_area_level_2") || component(c, "locality");
  const city = component(c, "locality") || component(c, "administrative_area_level_1") || "Bangkok";
  return { district, city, source: "google" };
}

async function fromOsm(lat, lon) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("zoom", "14");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en");
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Robinhood-QA-Dashboard/1.0"
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("OSM reverse geocoding failed");
  const payload = await response.json();
  const a = payload.address || {};
  const district = clean(a.city_district || a.borough || a.district || a.municipality || a.county || a.suburb || "");
  const city = clean(a.city || a.state_district || a.state || a.province || "Bangkok");
  return { district, city, source: "osm" };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: "Invalid coordinates" });
  }

  try {
    let result;
    const googleKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_GEOCODING_API_KEY || "";
    if (googleKey) {
      try { result = await fromGoogle(lat, lon, googleKey); }
      catch { result = await fromOsm(lat, lon); }
    } else {
      result = await fromOsm(lat, lon);
    }

    let district = clean(result.district);
    let city = clean(result.city);
    if (/^Bangkok$/i.test(district)) district = "";
    if (!city) city = "Bangkok";
    const label = district ? `${district}, ${city}` : city;
    res.setHeader("Cache-Control", "private, max-age=900");
    return res.status(200).json({ label, district, city, source: result.source });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Reverse geocoding failed" });
  }
}
