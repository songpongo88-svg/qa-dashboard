const QA_WEATHER_KEY = 'qa-dashboard:custom-theme-v1';
const QA_WEATHER_VALUE = 'weather-auto';
let weatherPickerView = false;
let observedPanel = null;
let panelObserver = null;

const weatherIsSelected = () => {
  try { return localStorage.getItem(QA_WEATHER_KEY) === QA_WEATHER_VALUE; }
  catch { return false; }
};

const getDialog = () => document.querySelector('section[role="dialog"][aria-labelledby="qa-theme-picker-title"]');
const getPanel = () => getDialog()?.querySelector('.qa-theme-collection-panel') || null;
const getTabs = () => getDialog()?.querySelector('.qa-theme-collection-tabs') || null;
const getWeatherTab = () => getTabs()?.querySelector('#qa-collection-tab-weather') || null;
const getWeatherPanel = () => document.getElementById('qa-weather-picker-panel');

function syncTabState() {
  const tabs = getTabs();
  if (!tabs || !weatherPickerView) return;
  tabs.querySelectorAll('[role="tab"]').forEach((tab) => {
    const on = tab.id === 'qa-collection-tab-weather';
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  });
}

function applyWeatherPickerView() {
  if (!weatherPickerView) return;
  const panel = getPanel();
  const weatherPanel = getWeatherPanel();
  const weatherTab = getWeatherTab();
  if (!panel || !weatherPanel || !weatherTab) return;

  if (panel.dataset.qaPickerCollection !== 'weather') {
    panel.dataset.qaPickerCollection = 'weather';
  }

  panel.querySelectorAll(':scope > *:not(#qa-weather-picker-panel)').forEach((node) => {
    node.style.display = 'none';
  });
  weatherPanel.style.display = 'grid';
  syncTabState();
  attachPanelObserver();
}

function restoreNativePickerView() {
  const panel = getPanel();
  if (!panel) return;
  panel.querySelectorAll(':scope > *:not(#qa-weather-picker-panel)').forEach((node) => {
    node.style.removeProperty('display');
  });
  const weatherPanel = getWeatherPanel();
  if (weatherPanel) weatherPanel.style.display = 'none';
}

function attachPanelObserver() {
  const panel = getPanel();
  if (!panel || panel === observedPanel) return;
  panelObserver?.disconnect();
  observedPanel = panel;
  panelObserver = new MutationObserver(() => {
    if (!weatherPickerView) return;
    if (panel.dataset.qaPickerCollection !== 'weather') {
      queueMicrotask(applyWeatherPickerView);
    }
  });
  panelObserver.observe(panel, {
    attributes: true,
    attributeFilter: ['data-qa-picker-collection'],
  });
}

function scheduleWeatherView() {
  window.setTimeout(applyWeatherPickerView, 40);
  window.setTimeout(applyWeatherPickerView, 120);
  window.setTimeout(applyWeatherPickerView, 240);
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const themeButton = target.closest('button[aria-label^="Theme ปัจจุบัน"],button[data-qa-weather-sidebar="true"]');
  if (themeButton) {
    weatherPickerView = weatherIsSelected();
    if (weatherPickerView) scheduleWeatherView();
    return;
  }

  const collectionTab = target.closest('.qa-theme-collection-tabs button');
  if (collectionTab) {
    if (collectionTab.id === 'qa-collection-tab-weather') {
      weatherPickerView = true;
      scheduleWeatherView();
    } else {
      weatherPickerView = false;
      window.setTimeout(() => {
        restoreNativePickerView();
        attachPanelObserver();
      }, 0);
    }
    return;
  }

  const closeButton = target.closest('section[role="dialog"][aria-labelledby="qa-theme-picker-title"] button');
  if (closeButton && (closeButton.getAttribute('aria-label') === 'Close' || closeButton.textContent?.trim() === '×')) {
    weatherPickerView = false;
  }
}, false);

window.addEventListener('storage', (event) => {
  if (event.key !== QA_WEATHER_KEY && event.key !== null) return;
  if (!getDialog()) return;
  weatherPickerView = weatherIsSelected();
  if (weatherPickerView) scheduleWeatherView();
  else restoreNativePickerView();
});

window.addEventListener('focus', () => {
  if (!getDialog()) return;
  if (weatherPickerView) scheduleWeatherView();
});
