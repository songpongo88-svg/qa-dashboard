const WKEY = 'weather-auto';
const CKEY = 'qa-dashboard:custom-theme-v1';
const CACHE_KEY = 'qa-dashboard:weather-cache-v2';
const CACHE_TTL_MS = 60 * 60 * 1000;
const WEATHER_REFRESH_MS = 30 * 60 * 1000;

const STATES = [
  ['weather-clear', 'Clear / Fair', 'อากาศแจ่มใส', '☀️'],
  ['weather-hot', 'Sunny / Hot', 'แดดร้อน', '🌞'],
  ['weather-partly-cloudy', 'Partly Cloudy', 'มีเมฆสลับแดด', '🌤️'],
  ['weather-cloudy', 'Cloudy', 'เมฆมาก', '☁️'],
  ['weather-light-rain', 'Light Rain', 'ฝนเล็กน้อย', '🌦️'],
  ['weather-rain', 'Rain', 'ฝนตก', '🌧️'],
  ['weather-thunderstorm', 'Thunderstorm', 'พายุฝนฟ้าคะนอง', '⛈️'],
  ['weather-fog', 'Mist / Fog', 'หมอก', '🌫️'],
  ['weather-sunshower', 'Rain + Clear', 'ฝนตกแต่ฟ้าใส', '🌦️'],
  ['weather-night', 'Night', 'กลางคืน · อัตโนมัติ', '🌙'],
];

let data = null;
let state = 'idle';
let msg = '';
let timer = 0;
let serial = 0;
let rendering = false;
let raf = 0;
const sidebarOriginal = new WeakMap();

const selected = () => {
  try { return localStorage.getItem(CKEY) === WKEY; }
  catch { return false; }
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const meta = (id) => STATES.find((entry) => entry[0] === id) || STATES[0];

function classifyDay(current) {
  const code = n(current.weather_code);
  const temp = n(current.temperature_2m);
  const cloud = n(current.cloud_cover);
  const precipitation = n(current.precipitation);
  const rain = n(current.rain);

  if ([95, 96, 99].includes(code)) return 'weather-thunderstorm';
  if ([45, 48].includes(code)) return 'weather-fog';

  const wet = precipitation > 0 || rain > 0 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code);
  if (wet) {
    if (cloud <= 55 && (precipitation > 0 || rain > 0)) return 'weather-sunshower';
    if ([51, 53, 56, 61, 80].includes(code) || Math.max(precipitation, rain) <= 1) return 'weather-light-rain';
    return 'weather-rain';
  }

  if (code === 3 || cloud >= 75) return 'weather-cloudy';
  if ([1, 2].includes(code) || cloud >= 30) return 'weather-partly-cloudy';
  return temp >= 35 ? 'weather-hot' : 'weather-clear';
}

function classify(current) {
  if (n(current.is_day, 1) === 1) return { id: classifyDay(current), nightBase: '' };
  let nightBase = classifyDay({ ...current, is_day: 1 });
  if (nightBase === 'weather-hot') nightBase = 'weather-clear';
  return { id: 'weather-night', nightBase };
}

function activeThemeName(item = data) {
  if (!item) return 'Weather Collection';
  if (item.id !== 'weather-night') return meta(item.id)[1];
  const base = meta(item.nightBase || 'weather-clear')[1].replace('Sunny / Hot', 'Clear / Fair');
  return `Night + ${base}`;
}

function activeThaiLabel(item = data) {
  if (!item) return 'กำลังตรวจสภาพอากาศ';
  if (item.id !== 'weather-night') return meta(item.id)[2];
  return `กลางคืน · ${meta(item.nightBase || 'weather-clear')[2]}`;
}

function saveCache() {
  if (!data) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, at: data.at instanceof Date ? data.at.toISOString() : data.at }));
  } catch {}
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const at = new Date(cached.at);
    if (!Number.isFinite(at.getTime()) || Date.now() - at.getTime() > CACHE_TTL_MS) return null;
    return { ...cached, at };
  } catch {
    return null;
  }
}

function setWeatherDatasets(item = data) {
  const root = document.documentElement;
  root.dataset.qaWeatherCollection = selected() ? 'auto' : '';
  if (!selected()) {
    delete root.dataset.qaWeatherState;
    delete root.dataset.qaWeatherNight;
    return;
  }
  const id = item?.id || root.dataset.qaWeatherState || 'weather-clear';
  root.dataset.qaWeatherState = id;
  root.dataset.qaWeatherNight = item?.nightBase || '';
}

function selectWeather() {
  try { localStorage.setItem(CKEY, WKEY); } catch {}
  setWeatherDatasets(data);
  try { window.dispatchEvent(new StorageEvent('storage', { key: CKEY })); } catch {}
  sync();
}

async function place(lat, lon) {
  try {
    const url = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    url.searchParams.set('latitude', lat.toFixed(6));
    url.searchParams.set('longitude', lon.toFixed(6));
    url.searchParams.set('localityLanguage', 'th');
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('reverse-geocode');
    const json = await response.json();
    return String(json.city || json.locality || json.principalSubdivision || json.countryName || 'พื้นที่ปัจจุบัน');
  } catch {
    return 'พื้นที่ปัจจุบัน';
  }
}

async function weather(lat, lon, requestSerial) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toFixed(6));
  url.searchParams.set('longitude', lon.toFixed(6));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,pressure_msl,wind_speed_10m,is_day');
  url.searchParams.set('timezone', 'auto');

  const [response, loc] = await Promise.all([
    fetch(url, { cache: 'no-store' }),
    place(lat, lon),
  ]);
  if (!response.ok) throw new Error('weather');

  const current = (await response.json()).current;
  if (!current || requestSerial !== serial || !selected()) return;

  const classification = classify(current);
  data = {
    id: classification.id,
    nightBase: classification.nightBase,
    temp: n(current.temperature_2m),
    feel: current.apparent_temperature == null ? null : n(current.apparent_temperature),
    humidity: current.relative_humidity_2m == null ? null : n(current.relative_humidity_2m),
    pressure: current.pressure_msl == null ? null : n(current.pressure_msl),
    wind: current.wind_speed_10m == null ? null : n(current.wind_speed_10m),
    loc,
    at: new Date(),
  };
  state = 'ready';
  msg = '';
  saveCache();
  setWeatherDatasets(data);
  paint();
  schedule();
}

function locate(userInitiated = true) {
  if (!selected()) return;
  if (!navigator.geolocation) {
    state = 'error';
    msg = 'Browser นี้ไม่รองรับ Location';
    paint();
    return;
  }

  state = 'requesting';
  msg = userInitiated ? 'กำลังขอสิทธิ์ Location…' : 'กำลังอัปเดตตำแหน่ง…';
  paint();
  const requestSerial = ++serial;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      weather(position.coords.latitude, position.coords.longitude, requestSerial).catch(() => {
        if (requestSerial !== serial) return;
        state = 'error';
        msg = 'ดึงข้อมูลอากาศไม่สำเร็จ กรุณาลองใหม่';
        paint();
        schedule(5 * 60 * 1000);
      });
    },
    (error) => {
      if (requestSerial !== serial) return;
      state = error.code === 1 ? 'denied' : 'error';
      msg = error.code === 1
        ? 'Location ถูกปฏิเสธ · อนุญาตจาก Site settings แล้วกดอีกครั้ง'
        : 'ไม่สามารถอ่านตำแหน่งได้ กรุณาลองใหม่';
      paint();
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10 * 60 * 1000 },
  );
}

function schedule(ms = WEATHER_REFRESH_MS) {
  clearTimeout(timer);
  if (selected()) timer = window.setTimeout(() => locate(false), ms);
}

function widget() {
  let element = document.getElementById('qa-weather-widget');
  if (element) return element;
  element = document.createElement('button');
  element.id = 'qa-weather-widget';
  element.className = 'qa-weather-widget';
  element.type = 'button';
  element.addEventListener('click', () => {
    element.classList.toggle('expanded');
    if (['idle', 'denied', 'error'].includes(state) && selected()) locate(true);
  });
  document.body.append(element);
  return element;
}

function atmosphere() {
  let element = document.getElementById('qa-weather-atmosphere');
  if (element) return element;
  element = document.createElement('div');
  element.id = 'qa-weather-atmosphere';
  element.className = 'qa-weather-atmosphere';
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = `
    <i class="w-decor w-sun"></i>
    <i class="w-decor w-moon"></i>
    <i class="w-decor w-cloud w-cloud-a"></i>
    <i class="w-decor w-cloud w-cloud-b"></i>
    <i class="w-decor w-rain-layer"></i>
    <i class="w-decor w-rainbow"></i>
    <i class="w-decor w-lightning"></i>
    <i class="w-decor w-fog-layer"></i>
    <i class="w-decor w-stars"></i>
    <i class="w-decor w-skyline"></i>`;
  document.body.append(element);
  return element;
}

function formatUpdated(at) {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) return '—';
  return new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }).format(at);
}

function sidebarButton() {
  return document.querySelector('button[aria-label^="Theme ปัจจุบัน"]');
}

function patchSidebar() {
  if (!selected()) return restoreSidebar();
  const button = sidebarButton();
  if (!button) return;

  if (!sidebarOriginal.has(button)) {
    sidebarOriginal.set(button, {
      html: button.innerHTML,
      aria: button.getAttribute('aria-label') || '',
    });
  }

  const expanded = Boolean(button.querySelector('.qa-sidebar-label'));
  const theme = activeThemeName();
  const location = data?.loc || (state === 'requesting' ? 'กำลังตรวจตำแหน่ง' : 'รอข้อมูลตำแหน่ง');
  const temp = data ? `${Math.round(data.temp)}°C` : '—°C';
  const icon = data ? meta(data.id)[3] : '🌦️';

  button.dataset.qaWeatherSidebar = 'true';
  button.setAttribute('aria-label', `Weather Collection · ${theme} · ${temp} · ${location}. กดเพื่อเปลี่ยน Theme`);

  if (!expanded) {
    button.innerHTML = `<span class="w-sidebar-collapsed" aria-hidden="true">${icon}</span>`;
    return;
  }

  button.innerHTML = `
    <span class="w-sidebar-weather-icon" aria-hidden="true">${icon}</span>
    <span class="qa-sidebar-label w-sidebar-weather-copy min-w-0 flex-1">
      <span class="block text-[8px] font-normal uppercase tracking-[0.12em]">Weather Collection</span>
      <span class="block truncate text-[11px] font-semibold">${esc(theme)}</span>
      <span class="block truncate text-[9px] font-normal">${esc(temp)} · ${esc(location)}</span>
    </span>
    <svg viewBox="0 0 24 24" class="qa-sidebar-label h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>`;
}

function restoreSidebar() {
  document.querySelectorAll('button[data-qa-weather-sidebar="true"]').forEach((button) => {
    const original = sidebarOriginal.get(button);
    if (original) {
      button.innerHTML = original.html;
      button.setAttribute('aria-label', original.aria);
    }
    delete button.dataset.qaWeatherSidebar;
  });
}

function paint() {
  const button = widget();
  const scene = atmosphere();
  const on = selected();
  button.hidden = !on;
  scene.hidden = !on;

  if (!on) {
    restoreSidebar();
    return;
  }

  setWeatherDatasets(data);
  scene.dataset.state = data?.id || 'weather-clear';
  scene.dataset.night = data?.nightBase || '';

  if (data && state === 'ready') {
    const theme = activeThemeName();
    const label = activeThaiLabel();
    const icon = meta(data.id)[3];
    const updated = formatUpdated(data.at);
    button.innerHTML = `
      <span class="w-kicker">WEATHER · ${esc(theme)}</span>
      <span class="w-main"><b>${icon}</b><strong>${Math.round(data.temp)}°C</strong><span>${esc(data.loc)}</span></span>
      <small>${esc(label)} · อัปเดต ${updated} น.</small>
      <span class="w-detail">
        <i>Theme ที่ใช้<b>${esc(theme)}</b></i>
        <i>พื้นที่<b>${esc(data.loc)}</b></i>
        <i>รู้สึกเหมือน<b>${data.feel == null ? '—' : Math.round(data.feel) + '°C'}</b></i>
        <i>ความชื้น<b>${data.humidity == null ? '—' : Math.round(data.humidity) + '%'}</b></i>
        <i>ความกดอากาศ<b>${data.pressure == null ? '—' : Math.round(data.pressure).toLocaleString() + ' hPa'}</b></i>
        <i>ลม<b>${data.wind == null ? '—' : Math.round(data.wind) + ' km/h'}</b></i>
      </span>`;
  } else {
    const icon = state === 'requesting' ? '📍' : state === 'denied' ? '🔒' : '🌦️';
    button.innerHTML = `
      <span class="w-kicker">WEATHER COLLECTION</span>
      <span class="w-main"><b>${icon}</b><span>สภาพอากาศจริงตามตำแหน่ง</span></span>
      <small>${esc(msg || 'กดเพื่ออนุญาต Location และดูอากาศจริง')}</small>`;
  }

  patchSidebar();
  renderSoon();
}

function dialog() {
  return document.querySelector('section[role="dialog"][aria-labelledby="qa-theme-picker-title"]');
}

function grid() {
  const panel = dialog();
  if (!panel) return null;
  return [...panel.querySelectorAll('div')].find((element) => (
    typeof element.className === 'string'
    && element.className.includes('grid')
    && element.className.includes('overflow-y-auto')
  )) || null;
}

function tabList() {
  return dialog()?.querySelector('.qa-theme-collection-tabs') || null;
}

function collectionIdFromTab(button) {
  return button?.id?.startsWith('qa-collection-tab-') ? button.id.replace('qa-collection-tab-', '') : '';
}

function setTabSelected(id) {
  const list = tabList();
  const panel = grid();
  if (!list || !panel) return;

  list.querySelectorAll('button[role="tab"]').forEach((tab) => {
    const isCurrent = collectionIdFromTab(tab) === id;
    tab.setAttribute('aria-selected', String(isCurrent));
    tab.tabIndex = isCurrent ? 0 : -1;
  });

  panel.dataset.qaPickerCollection = id;
  document.documentElement.dataset.qaPickerCollection = id;
}

function ensureWeatherTab() {
  const list = tabList();
  if (!list) return null;
  list.classList.add('qa-weather-tabs-five');

  let tab = list.querySelector('#qa-collection-tab-weather');
  if (!tab) {
    tab = document.createElement('button');
    tab.id = 'qa-collection-tab-weather';
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', 'qa-theme-collection-panel');
    tab.setAttribute('aria-selected', 'false');
    tab.tabIndex = -1;
    tab.textContent = 'Weather Collection';
    tab.addEventListener('click', () => setTabSelected('weather'));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...list.querySelectorAll('button[role="tab"]')];
      const index = tabs.indexOf(tab);
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + delta + tabs.length) % tabs.length];
      next?.focus();
      next?.click();
    });
    list.append(tab);
  }
  return tab;
}

function miniScene(id, icon) {
  return `<span class="w-mini-scene ${id}" aria-hidden="true"><i class="w-mini-sun"></i><i class="w-mini-cloud"></i><i class="w-mini-rain"></i><i class="w-mini-bolt"></i><i class="w-mini-moon"></i><b>${icon}</b></span>`;
}

function picker() {
  if (rendering) return;
  const panel = grid();
  const modal = dialog();
  if (!panel || !modal) return;

  rendering = true;
  try {
    ensureWeatherTab();
    panel.querySelectorAll('[data-qa-weather-added]').forEach((node) => node.remove());

    const heading = document.createElement('div');
    heading.dataset.qaWeatherAdded = '1';
    heading.dataset.qaThemeCollection = 'weather';
    heading.className = 'w-heading';
    heading.innerHTML = '<strong>Weather Collection</strong><span>เปลี่ยนภาพ สี อุณหภูมิ และบรรยากาศตามตำแหน่งจริงอัตโนมัติ</span>';

    const card = document.createElement('button');
    card.type = 'button';
    card.dataset.qaWeatherAdded = '1';
    card.dataset.qaThemeCollection = 'weather';
    card.dataset.qaCustomThemeCard = WKEY;
    card.className = 'w-card';
    card.setAttribute('aria-pressed', String(selected()));

    const current = data && selected()
      ? `${meta(data.id)[3]} ${Math.round(data.temp)}°C · ${data.loc} · ${activeThemeName()}`
      : selected() && state === 'requesting'
        ? 'กำลังขอสิทธิ์ Location…'
        : selected() && state === 'denied'
          ? 'Location ถูกปฏิเสธ · เปิด Site settings เพื่ออนุญาต'
          : 'ใช้ Browser Location · ระบบจะแสดง popup ขออนุญาตเมื่อเปิดใช้';

    card.innerHTML = `
      <span class="w-art" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="w-copy">
        <strong>Weather · สภาพอากาศจริง</strong>
        <small>${esc(current)}</small>
      </span>
      <em>${selected() ? '✓ กำลังใช้' : 'เปิดใช้'}</em>`;

    card.addEventListener('click', () => {
      selectWeather();
      setTabSelected('weather');
      picker();
      locate(true);
    });

    const list = document.createElement('div');
    list.dataset.qaWeatherAdded = '1';
    list.dataset.qaThemeCollection = 'weather';
    list.className = 'w-list';

    STATES.forEach((entry, index) => {
      const item = document.createElement('div');
      item.className = `w-item ${entry[0]}`;
      if (data?.id === entry[0] && selected()) item.dataset.current = '1';
      const stateName = data?.id === 'weather-night' && entry[0] === 'weather-night' && selected()
        ? activeThemeName()
        : entry[1];
      item.innerHTML = `${miniScene(entry[0], entry[3])}<span class="w-item-copy"><b><mark>${index + 1}</mark>${esc(stateName)}</b><small>${esc(entry[2])}</small></span>`;
      list.append(item);
    });

    panel.append(heading, card, list);

    if (selected() && modal.dataset.qaWeatherPickerInitialized !== '1') {
      modal.dataset.qaWeatherPickerInitialized = '1';
      setTabSelected('weather');
    }
  } finally {
    rendering = false;
  }
}

function renderSoon() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    picker();
    patchSidebar();
  });
}

function sync() {
  const on = selected();
  if (!on) {
    serial += 1;
    clearTimeout(timer);
    delete document.documentElement.dataset.qaWeatherCollection;
    delete document.documentElement.dataset.qaWeatherState;
    delete document.documentElement.dataset.qaWeatherNight;
    widget().hidden = true;
    atmosphere().hidden = true;
    restoreSidebar();
  } else {
    setWeatherDatasets(data);
    if (!data) {
      const cached = loadCache();
      if (cached) {
        data = cached;
        state = 'ready';
        setWeatherDatasets(data);
      }
    }
    paint();
  }
  renderSoon();
}

function hooks() {
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const collectionTab = target.closest('.qa-theme-collection-tabs button[role="tab"]');
    if (collectionTab && collectionTab.id !== 'qa-collection-tab-weather') {
      const id = collectionIdFromTab(collectionTab);
      if (id) setTimeout(() => setTabSelected(id), 0);
      return;
    }

    const modal = target.closest('section[role="dialog"][aria-labelledby="qa-theme-picker-title"]');
    if (!modal) return;
    const button = target.closest('button');
    if (!button || button.dataset.qaCustomThemeCard === WKEY || button.id === 'qa-collection-tab-weather') return;

    const panel = grid();
    if (panel && panel.contains(button)) setTimeout(sync, 0);
  }, true);

  const bodyObserver = new MutationObserver(() => {
    const panel = grid();
    if (panel && (!panel.querySelector('[data-qa-weather-added]') || !tabList()?.querySelector('#qa-collection-tab-weather'))) {
      renderSoon();
    }
    if (selected()) patchSidebar();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

async function restore() {
  if (!selected()) return;

  const cached = loadCache();
  if (cached) {
    data = cached;
    state = 'ready';
    setWeatherDatasets(data);
    paint();
  }

  try {
    if (navigator.permissions?.query) {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (!selected()) return;
      if (permission.state === 'granted') locate(false);
      else if (permission.state === 'denied') {
        state = 'denied';
        msg = 'Location ถูกปิดใน Browser · เปิด Site settings แล้วกด Weather อีกครั้ง';
        paint();
      } else if (!data) {
        state = 'idle';
        msg = 'กด Weather Collection เพื่ออนุญาต Location';
        paint();
      }
      permission.onchange = () => {
        if (permission.state === 'granted' && selected()) locate(false);
        else if (selected()) paint();
      };
      return;
    }
  } catch {}

  if (!data) {
    state = 'idle';
    msg = 'กด Weather Collection เพื่ออนุญาต Location';
    paint();
  }
}

function start() {
  hooks();
  widget();
  atmosphere();
  sync();
  restore();

  window.addEventListener('storage', (event) => {
    if (event.key === CKEY || event.key === null) {
      sync();
      if (selected() && state !== 'requesting') restore();
    }
  });

  window.addEventListener('focus', () => {
    if (selected() && state === 'ready') locate(false);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && selected() && state === 'ready') locate(false);
  });
}

start();
