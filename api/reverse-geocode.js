const clean = (value = "") => String(value)
  .replace(/^Khet\s+/i, "")
  .replace(/^Khwaeng\s+/i, "")
  .replace(/^Amphoe\s+/i, "")
  .replace(/^District\s+/i, "")
  .replace(/\s+District$/i, "")
  .replace(/\s+Province$/i, "")
  .replace(/^Bangkok Metropolis$/i, "Bangkok")
  .replace(/^Krung Thep Maha Nakhon$/i, "Bangkok")
  .trim();

const keyOf = (value = "") => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const component = (items, type) => {
  const row = items.find((item) => Array.isArray(item.types) && item.types.includes(type));
  return row ? clean(row.long_name || row.short_name || "") : "";
};

async function fromGoogle(lat, lon, key) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lon}`);
  url.searchParams.set("language", "th");
  url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error("Google reverse geocoding failed");
  const payload = await response.json();
  const result = payload.results?.[0];
  if (!result) throw new Error("Google reverse geocoding returned no result");
  const c = result.address_components || [];
  const district = component(c, "sublocality_level_1") || component(c, "administrative_area_level_2") || component(c, "locality");
  const city = component(c, "locality") || component(c, "administrative_area_level_2") || component(c, "administrative_area_level_1");
  const region = component(c, "administrative_area_level_1") || city || "";
  return { district, city, region, source: "google" };
}

async function fromOsm(lat, lon) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("zoom", "14");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "th");
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Robinhood-QA-Dashboard/1.0"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error("OSM reverse geocoding failed");
  const payload = await response.json();
  const a = payload.address || {};
  const district = clean(a.city_district || a.borough || a.district || a.municipality || a.county || a.suburb || "");
  const city = clean(a.city || a.town || a.municipality || a.state_district || a.state || a.province || "");
  const region = clean(a.state || a.province || a.state_district || city || "");
  return { district, city, region, source: "osm" };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "private, no-store");
  if (!String(req.query.lat ?? "").trim() || !String(req.query.lon ?? "").trim()) return res.status(400).json({ error: "Invalid coordinates" });
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
    let region = clean(result.region);

    if (/^Bangkok$/i.test(district)) district = "";
    if (/^Bangkok$/i.test(region)) region = "Bangkok";
    if (/^Bangkok$/i.test(city)) city = "Bangkok";

    // Some providers return the Bangkok district in both city_district and city.
    // Prefer the broader administrative region so the UI becomes "Bang Phlat, Bangkok".
    if (district && city && keyOf(district) === keyOf(city)) {
      city = region && keyOf(region) !== keyOf(district) ? region : "";
    }
    if (district && region && keyOf(district) === keyOf(region)) region = "";
    if (!city) city = region || "";
    if (district && keyOf(district) === keyOf(city)) district = "";

    if (!district && !city) throw new Error("Area name unavailable");
    const label = district ? `${district}, ${city}` : city;
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({ label, district, city, source: result.source });
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : "Reverse geocoding failed" });
  }
}
