# Weather Collection repair

The previous implementation ran three DOM-mutating scripts, requested high-accuracy GPS, repeatedly replaced weather HTML, and stacked contradictory CSS backgrounds. The entry page now imports one React integration and one shared weather store.

- The existing `PageHero` reserves two grid columns for weather and the page title. A single column layout keeps all metrics available on mobile. Organization branding stays visible.
- One shared observation drives the scene, temperature, weather label, humidity, wind, rain probability and native theme palette. Updates happen at 30-minute intervals while visible, with a guarded manual refresh. Focus events do not repeatedly fetch fresh data.
- Sunrise/sunset epoch times change the night scene even between observations, while retaining the actual weather type. The ten collection previews plus four night variants are local WebP assets.
- Approximate city detection uses Vercel IP headers without a permission popup or a third-party IP lookup. City search and forecasts use fixed Open-Meteo endpoints through same-origin API handlers with validation and timeouts. No exact GPS location is collected.
- Missing data never becomes 0°C. When refresh fails, the last available observation retains its timestamp and a visible stale/error message. A failed initial lookup uses a labelled Bangkok fallback.
- Native collection switching uses a dedicated appearance event, not a synthetic storage event. Weather changes do not reinitialize T&C acceptance or business state. Other collections continue to use the existing seasonal runtime.
- `npm run test:weather` covers classification, temperature thresholds, solar transitions, null data, API validation, city fallback, React rendering, preview isolation, duplicate-refresh prevention and restoring another collection. Existing T&C and monthly-signature gates remain in the main build.
