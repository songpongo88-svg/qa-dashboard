import { WEEKDAY_COLLECTION_ID, isWeekdayPreference, getBangkokWeekdayTheme, resolveWeekdayPreference, millisecondsUntilBangkokMidnight } from "./weekdayCollection.mjs";
// Seasonal theme runtime v2
// Appearance-only behavior. It does not touch QA data, permissions, scoring, or workflow logic.

type CalendarDate = { year: number; month: number; day: number };
type ThemeCard = { id: string; label: string; emoji: string; color: string };
type Festival = ThemeCard & {
  dates: (year: number) => { start: CalendarDate; end: CalendarDate } | null;
};

const TIME_ZONE = "Asia/Bangkok";
const FESTIVAL_PADDING_DAYS = 7;
const CUSTOM_THEME_STORAGE_KEY = "qa-dashboard:custom-theme-v1";
const BASE_THEME_STORAGE_KEY = "qa-dashboard:theme-v1";

const loyKrathongDates: Record<number, CalendarDate> = {
  2025: { year: 2025, month: 11, day: 5 },
  2026: { year: 2026, month: 11, day: 24 },
  2027: { year: 2027, month: 11, day: 13 },
  2028: { year: 2028, month: 11, day: 1 },
  2029: { year: 2029, month: 11, day: 20 },
  2030: { year: 2030, month: 11, day: 9 },
  2031: { year: 2031, month: 11, day: 28 },
  2032: { year: 2032, month: 11, day: 17 },
  2033: { year: 2033, month: 11, day: 6 },
  2034: { year: 2034, month: 11, day: 25 },
  2035: { year: 2035, month: 11, day: 15 },
  2036: { year: 2036, month: 11, day: 3 },
  2037: { year: 2037, month: 11, day: 22 },
  2038: { year: 2038, month: 11, day: 11 },
  2039: { year: 2039, month: 10, day: 31 },
  2040: { year: 2040, month: 11, day: 18 },
  2041: { year: 2041, month: 11, day: 8 },
  2042: { year: 2042, month: 10, day: 28 },
  2043: { year: 2043, month: 11, day: 16 },
};

const festivals: Festival[] = [
  {
    id: "festival-new-year",
    label: "New Year",
    emoji: "🎆",
    color: "#7c3aed",
    dates: (year) => ({
      start: { year, month: 1, day: 1 },
      end: { year, month: 1, day: 1 },
    }),
  },
  {
    id: "festival-valentine",
    label: "Valentine’s Day",
    emoji: "💗",
    color: "#ec4899",
    dates: (year) => ({
      start: { year, month: 2, day: 14 },
      end: { year, month: 2, day: 14 },
    }),
  },
  {
    id: "festival-songkran",
    label: "Songkran",
    emoji: "💦",
    color: "#0ea5e9",
    dates: (year) => ({
      start: { year, month: 4, day: 13 },
      end: { year, month: 4, day: 15 },
    }),
  },
  {
    id: "festival-halloween",
    label: "Halloween",
    emoji: "🎃",
    color: "#f97316",
    dates: (year) => ({
      start: { year, month: 10, day: 31 },
      end: { year, month: 10, day: 31 },
    }),
  },
  {
    id: "festival-loy-krathong",
    label: "Loy Krathong",
    emoji: "🪷",
    color: "#8b5cf6",
    dates: (year) => {
      const date = loyKrathongDates[year];
      return date ? { start: date, end: date } : null;
    },
  },
  {
    id: "festival-christmas",
    label: "Christmas",
    emoji: "🎄",
    color: "#16a34a",
    dates: (year) => ({
      start: { year, month: 12, day: 25 },
      end: { year, month: 12, day: 25 },
    }),
  },
];

const weekdayThemes: ThemeCard[] = [
  { id: "weekday-monday", label: "สวัสดีวันจันทร์", emoji: "🌼", color: "#eab308" },
  { id: "weekday-tuesday", label: "สวัสดีวันอังคาร", emoji: "🌸", color: "#ec4899" },
  { id: "weekday-wednesday", label: "สวัสดีวันพุธ", emoji: "🍀", color: "#16a34a" },
  { id: "weekday-thursday", label: "สวัสดีวันพฤหัสบดี", emoji: "🧡", color: "#f97316" },
  { id: "weekday-friday", label: "สวัสดีวันศุกร์", emoji: "🌊", color: "#0ea5e9" },
  { id: "weekday-saturday", label: "สวัสดีวันเสาร์", emoji: "💜", color: "#7c3aed" },
  { id: "weekday-sunday", label: "สวัสดีวันอาทิตย์", emoji: "🌹", color: "#dc2626" },
];

function toEpochDay(value: CalendarDate) {
  return Math.floor(Date.UTC(value.year, value.month - 1, value.day) / 86400000);
}

function fromEpochDay(value: number): CalendarDate {
  const date = new Date(value * 86400000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getBangkokToday(): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const getPart = (name: string) => Number(parts.find((part) => part.type === name)?.value || 0);
  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
  };
}

function formatThaiDate(value: CalendarDate) {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day, 12));
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getFestivalWindow(festival: Festival, year: number) {
  const range = festival.dates(year);
  if (!range) return null;

  return {
    start: toEpochDay(range.start) - FESTIVAL_PADDING_DAYS,
    end: toEpochDay(range.end) + FESTIVAL_PADDING_DAYS,
    eventStart: toEpochDay(range.start),
    eventEnd: toEpochDay(range.end),
  };
}

function getActiveFestival() {
  const today = getBangkokToday();
  const todayEpoch = toEpochDay(today);
  const candidates: Array<{
    festival: Festival;
    distance: number;
    start: number;
  }> = [];

  for (const festival of festivals) {
    for (const year of [today.year - 1, today.year, today.year + 1]) {
      const window = getFestivalWindow(festival, year);
      if (!window || todayEpoch < window.start || todayEpoch > window.end) continue;

      const distance = todayEpoch < window.eventStart
        ? window.eventStart - todayEpoch
        : todayEpoch > window.eventEnd
          ? todayEpoch - window.eventEnd
          : 0;

      candidates.push({ festival, distance, start: window.start });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance || b.start - a.start);
  return candidates[0]?.festival || null;
}

function getFestivalAvailability(festival: Festival) {
  const today = getBangkokToday();
  const todayEpoch = toEpochDay(today);
  const windows = [today.year - 1, today.year, today.year + 1]
    .map((year) => getFestivalWindow(festival, year))
    .filter((window): window is NonNullable<ReturnType<typeof getFestivalWindow>> => Boolean(window));

  const current = windows.find((window) => todayEpoch >= window.start && todayEpoch <= window.end);
  if (current) return { active: true, ...current };

  const next = windows
    .filter((window) => window.start > todayEpoch)
    .sort((a, b) => a.start - b.start)[0];

  return next ? { active: false, ...next } : null;
}

// Undefined means read storage; a string retains the user's choice when storage is blocked.
let sessionCustomTheme: string | undefined;
function getCustomPreference() {
  if (sessionCustomTheme !== undefined) return sessionCustomTheme;
  try { return localStorage.getItem(CUSTOM_THEME_STORAGE_KEY) || ""; }
  catch { return ""; }
}
function getPreferredTheme() {
  const custom = getCustomPreference();
  if (isWeekdayPreference(custom)) {
    // Existing per-day choices migrate once to the automatic collection.
    if (custom !== WEEKDAY_COLLECTION_ID) {
      sessionCustomTheme = WEEKDAY_COLLECTION_ID;
      try { localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, WEEKDAY_COLLECTION_ID); } catch {}
    }
    return resolveWeekdayPreference(custom);
  }
  try { return localStorage.getItem(BASE_THEME_STORAGE_KEY) || "robinhood"; }
  catch { return document.documentElement.dataset.qaTheme || "robinhood"; }
}

let applyingTheme = false;
function applyEffectiveTheme() {
  if (applyingTheme) return;
  applyingTheme = true;

  try {
    const activeFestival = getActiveFestival();
    const effectiveTheme = activeFestival?.id || getPreferredTheme();

    if (document.documentElement.dataset.qaTheme !== effectiveTheme) {
      document.documentElement.dataset.qaTheme = effectiveTheme;
    }

    document.documentElement.dataset.qaFestivalOverride = activeFestival?.id || "";
    document.documentElement.dataset.qaWeekdayCollection = isWeekdayPreference(getCustomPreference()) ? "auto" : "";
    requestThemePickerRefresh();
  } finally {
    applyingTheme = false;
  }
}

function getThemePickerGrid() {
  const dialog = document.querySelector<HTMLElement>(
    'section[role="dialog"][aria-labelledby="qa-theme-picker-title"]'
  );
  if (!dialog) return null;

  return Array.from(dialog.querySelectorAll<HTMLElement>("div")).find((element) => {
    return typeof element.className === "string"
      && element.className.includes("grid")
      && element.className.includes("overflow-y-auto");
  }) || null;
}

function createHeading(text: string, collection: string) {
  const heading = document.createElement("div");
  heading.dataset.qaSeasonalAdded = "true";
  heading.textContent = text;
  heading.dataset.qaThemeCollection = collection;
  heading.style.cssText = [
    "grid-column:1/-1",
    "margin-top:10px",
    "font-size:12px",
    "font-weight:800",
    "letter-spacing:.12em",
    "text-transform:uppercase",
    "color:#64748b",
  ].join(";");
  return heading;
}

function createThemeCard(options: {
  theme: ThemeCard;
  subtitle: string;
  disabled?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const { theme } = options;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.qaSeasonalAdded = "true";
  button.dataset.qaCustomThemeCard = theme.id;
  button.dataset.qaThemeCollection = theme.id.startsWith("festival-") ? "festival" : "weekday";
  button.className = "qa-theme-preview-card";
  button.disabled = Boolean(options.disabled);
  button.setAttribute("aria-pressed", String(Boolean(options.selected)));
  button.style.cssText = [
    "position:relative",
    "display:flex",
    "align-items:center",
    "gap:12px",
    "min-height:86px",
    "padding:14px",
    "border-radius:20px",
    `border:2px solid ${options.selected ? theme.color : "#e2e8f0"}`,
    `background:${options.selected ? `${theme.color}12` : "#ffffff"}`,
    `box-shadow:${options.selected ? `0 10px 26px ${theme.color}22` : "0 6px 16px rgba(15,23,42,.04)"}`,
    `cursor:${options.disabled ? "not-allowed" : "pointer"}`,
    `opacity:${options.disabled ? ".62" : "1"}`,
    "text-align:left",
    "font-family:Kanit,sans-serif",
  ].join(";");

  const icon = document.createElement("span");
  icon.textContent = "";
  icon.className = "qa-theme-mini-preview";
  icon.setAttribute("aria-hidden", "true");
  icon.style.cssText = [
    "display:grid",
    "place-items:center",
    "width:46px",
    "height:46px",
    "border-radius:15px",
    `background:${theme.color}18`,
    "font-size:24px",
    "flex:0 0 auto",
  ].join(";");

  const content = document.createElement("span");
  content.style.cssText = "display:flex;min-width:0;flex-direction:column;gap:3px";

  const label = document.createElement("strong");
  label.textContent = theme.label;
  label.style.cssText = "font-size:14px;color:#0f172a;font-weight:700";

  const subtitle = document.createElement("span");
  subtitle.textContent = options.subtitle;
  subtitle.style.cssText = "font-size:11px;color:#64748b;font-weight:500;line-height:1.35";

  if (theme.id.startsWith("festival-")) {
    icon.style.cssText = "";
    icon.style.setProperty("--preview-accent", theme.color);
    const canvas = document.createElement("span");
    canvas.className = "qa-theme-mini-canvas";
    for (let i = 0; i < 4; i++) canvas.append(document.createElement("i"));
    icon.append(canvas);
  }
  content.style.flex = "1";
  content.append(label, subtitle);
  button.append(icon, content);

  if (options.selected || options.disabled) {
    const status = document.createElement("span");
    status.textContent = options.selected ? "✓" : "🔒";
    status.style.cssText = [
      "position:absolute",
      "right:12px",
      "top:10px",
      "font-size:12px",
      "font-weight:900",
      `color:${theme.color}`,
    ].join(";");
    button.append(status);
  }

  if (!options.disabled && options.onClick) {
    button.addEventListener("click", options.onClick);
  }

  return button;
}

let renderingPicker = false;
function renderExtraThemeCards() {
  if (renderingPicker) return;
  const grid = getThemePickerGrid();
  if (!grid) return;

  renderingPicker = true;
  try {
    grid.querySelectorAll("[data-qa-seasonal-added='true']").forEach((node) => node.remove());

    grid.append(createHeading("Festival Collection", "festival"));
    const activeFestivalId = getActiveFestival()?.id || "";

    for (const festival of festivals) {
      const availability = getFestivalAvailability(festival);
      const isOpen = Boolean(availability?.active);
      const subtitle = availability
        ? isOpen
          ? `เปิดอัตโนมัติ • ${formatThaiDate(fromEpochDay(availability.start))} – ${formatThaiDate(fromEpochDay(availability.end))}`
          : `Locked • เปิด ${formatThaiDate(fromEpochDay(availability.start))} – ${formatThaiDate(fromEpochDay(availability.end))}`
        : "Locked • รอปฏิทินเทศกาลปีถัดไป";

      grid.append(createThemeCard({
        theme: festival,
        subtitle,
        disabled: !isOpen,
        selected: activeFestivalId === festival.id,
      }));
    }

    grid.append(createHeading("เลือกครั้งเดียว · เปลี่ยนตามวันประเทศไทยอัตโนมัติ", "weekday"));

    const storedCustomTheme = getCustomPreference();
    const todayTheme = weekdayThemes.find((theme) => theme.id === getBangkokWeekdayTheme())!;
    const selected = isWeekdayPreference(storedCustomTheme);
    const collection = createThemeCard({
      theme: { id: WEEKDAY_COLLECTION_ID, label: "7 Days · ธีมประจำวันอัตโนมัติ", emoji: "", color: todayTheme.color },
      subtitle: selected && activeFestivalId
        ? "เลือกไว้แล้ว • จะกลับมาใช้อัตโนมัติเมื่อจบเทศกาล"
        : "จันทร์–อาทิตย์ • เปลี่ยนตามวันประเทศไทย • จำไว้ในเครื่องนี้",
      selected,
      onClick: () => {
        sessionCustomTheme = WEEKDAY_COLLECTION_ID;
        try { localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, WEEKDAY_COLLECTION_ID); } catch {}
        applyEffectiveTheme();
        renderExtraThemeCards();
      },
    });
    collection.style.gridColumn = "1 / -1";
    const preview = collection.firstElementChild as HTMLElement;
    preview.className = "qa-weekday-collection-preview";
    preview.style.cssText = "";
    preview.style.setProperty("--day-photo-position", String(weekdayThemes.indexOf(todayTheme) / 6 * 100) + "%");
    grid.append(collection);

    const days = document.createElement("div");
    days.dataset.qaSeasonalAdded = "true";
    days.className = "qa-weekday-image-list";
    days.dataset.qaThemeCollection = "weekday";
    days.setAttribute("aria-label", "ตัวอย่างทั้ง 7 วัน เปลี่ยนตามวันอัตโนมัติ");
    for (const theme of weekdayThemes) {
      const item = document.createElement("div");
      item.className = "qa-weekday-image-card";
      item.style.setProperty("--preview-color", theme.color);
      const photo = document.createElement("span");
      photo.className = "qa-weekday-image-thumbnail";
      photo.setAttribute("aria-hidden", "true");
      photo.style.backgroundPosition = "78% " + (weekdayThemes.indexOf(theme) / 6 * 100) + "%";
      const caption = document.createElement("span");
      caption.className = "qa-weekday-image-caption";
      const name = document.createElement("strong");
      name.textContent = theme.label.replace("สวัสดี", "");
      const note = document.createElement("span");
      note.textContent = "เปลี่ยนให้อัตโนมัติเมื่อถึงวันนี้";
      caption.append(name, note);
      item.append(photo, caption);
      if (theme.id === todayTheme.id) {
        item.dataset.today = "true";
        note.textContent = "วันนี้ · " + (selected && !activeFestivalId ? "กำลังใช้งาน" : "ธีมประจำวัน");
      }
      days.append(item);
    }
    grid.append(days);
  } finally {
    renderingPicker = false;
  }
}

let pickerRefreshSignature = "";
function requestThemePickerRefresh() {
  const grid = getThemePickerGrid();
  if (!grid) { pickerRefreshSignature = ""; return; }
  const signature = [getCustomPreference(), document.documentElement.dataset.qaTheme, toEpochDay(getBangkokToday())].join("|");
  if (signature !== pickerRefreshSignature || !grid.querySelector("[data-qa-seasonal-added='true']")) {
    pickerRefreshSignature = signature;
    requestAnimationFrame(renderExtraThemeCards);
  }
}

function installThemeHooks() {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const dialog = target?.closest?.(
      'section[role="dialog"][aria-labelledby="qa-theme-picker-title"]'
    );
    if (!dialog) return;

    const button = target?.closest?.("button") as HTMLButtonElement | null;
    if (!button || button.dataset.qaCustomThemeCard) return;

    const grid = getThemePickerGrid();
    if (grid && grid.contains(button)) {
      sessionCustomTheme = "";
      try {
        localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY);
      } catch {
        // Ignore storage errors.
      }
      setTimeout(applyEffectiveTheme, 0);
    }
  }, true);

  const pickerObserver = new MutationObserver(() => {
    const grid = getThemePickerGrid();
    if (grid && !grid.querySelector("[data-qa-seasonal-added='true']")) {
      renderExtraThemeCards();
    }
  });
  pickerObserver.observe(document.body, { childList: true, subtree: true });

  const themeAttributeObserver = new MutationObserver(() => {
    applyEffectiveTheme();
  });
  themeAttributeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-qa-theme"],
  });
}

function startSeasonalThemeRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  installThemeHooks();
  setTimeout(applyEffectiveTheme, 0);
  let midnightTimer: ReturnType<typeof setTimeout>;
  const scheduleMidnight = () => {
    clearTimeout(midnightTimer);
    midnightTimer = setTimeout(() => {
      applyEffectiveTheme();
      scheduleMidnight();
    }, millisecondsUntilBangkokMidnight() + 50);
  };
  scheduleMidnight();
  // A minute check also recovers from clock changes and suspended devices.
  setInterval(applyEffectiveTheme, 60 * 1000);
  window.addEventListener("storage", (event) => {
    if (event.key === CUSTOM_THEME_STORAGE_KEY || event.key === BASE_THEME_STORAGE_KEY || event.key === null) {
      sessionCustomTheme = undefined;
      applyEffectiveTheme();
    }
  });
  window.addEventListener("focus", applyEffectiveTheme);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) applyEffectiveTheme();
  });
}

startSeasonalThemeRuntime();

export {};
