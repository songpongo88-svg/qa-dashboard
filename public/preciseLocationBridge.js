(() => {
  const RESOLVER_VERSION = 'district-v3';
  const CACHE_KEY = 'qa-dashboard:weather-cache-v4';
  const VERSION_KEY = 'qa-dashboard:location-resolver-version';

  try {
    if (localStorage.getItem(VERSION_KEY) !== RESOLVER_VERSION) {
      localStorage.setItem(VERSION_KEY, RESOLVER_VERSION);
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {}

  const geo = navigator.geolocation;
  if (geo) {
    const originalGet = geo.getCurrentPosition.bind(geo);
    const originalWatch = geo.watchPosition.bind(geo);
    const originalClear = geo.clearWatch.bind(geo);

    const preciseGet = (success, error, options = {}) => {
      if (!options?.enableHighAccuracy) return originalGet(success, error, options);

      let best = null;
      let watchId = null;
      let finished = false;
      let settleTimer = null;
      let hardTimer = null;

      const cleanup = () => {
        if (watchId !== null) {
          try { originalClear(watchId); } catch {}
        }
        if (settleTimer) clearTimeout(settleTimer);
        if (hardTimer) clearTimeout(hardTimer);
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        cleanup();
        if (best) success(best);
        else originalGet(success, error, { ...options, enableHighAccuracy: true, maximumAge: 0 });
      };

      const fail = (reason) => {
        if (finished) return;
        if (best) return finish();
        finished = true;
        cleanup();
        if (typeof error === 'function') error(reason);
      };

      try {
        watchId = originalWatch((position) => {
          const accuracy = Number(position?.coords?.accuracy);
          if (!best || (Number.isFinite(accuracy) && accuracy < Number(best.coords.accuracy || Infinity))) best = position;

          if (Number.isFinite(accuracy) && accuracy <= 35) return finish();
          if (!settleTimer) settleTimer = setTimeout(finish, 5500);
        }, fail, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: Math.min(Number(options.timeout) || 15000, 15000),
        });
        hardTimer = setTimeout(finish, 12000);
      } catch {
        originalGet(success, error, { ...options, enableHighAccuracy: true, maximumAge: 0 });
      }
    };

    try {
      Object.defineProperty(geo, 'getCurrentPosition', { configurable: true, value: preciseGet });
    } catch {
      try { geo.getCurrentPosition = preciseGet; } catch {}
    }
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
    if (!url.includes('api.bigdatacloud.net/data/reverse-geocode-client')) {
      return originalFetch(input, init);
    }

    try {
      const source = new URL(url);
      const lat = source.searchParams.get('latitude');
      const lon = source.searchParams.get('longitude');
      if (!lat || !lon) return originalFetch(input, init);

      const endpoint = `/api/reverse-geocode?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const response = await originalFetch(endpoint, { cache: 'no-store' });
      if (!response.ok) throw new Error('district resolver unavailable');
      const resolved = await response.json();
      if (!resolved?.label) throw new Error('district resolver returned no label');

      return new Response(JSON.stringify({
        city: resolved.label,
        locality: resolved.district || resolved.label,
        principalSubdivision: resolved.city || 'Bangkok',
        countryName: 'Thailand',
        source: resolved.source || 'district-resolver',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    } catch {
      return originalFetch(input, init);
    }
  };
})();
