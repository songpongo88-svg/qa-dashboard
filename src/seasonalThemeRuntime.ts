// qa-seasonal-theme-runtime-v1
// Adds weekday themes and date-aware festival overrides without changing dashboard business logic.

type Ymd = { year: number; month: number; day: number };
type FestivalDefinition = {
  id: string;
  label: string;
  emoji: string;
  color: string;
  getRange: (year: number) => { start: Ymd; end: Ymd } | null;
};
type WeekdayTheme = { id: string; label: string; emoji: string; color: string };

const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const CUSTOM_THEME_KEY = "qa-dashboard:custom-theme-v1";
const BASE_THEME_KEY = "qa-dashboard:theme-v1";
const WINDOW_DAYS = 7;

const LOY_KRATHONG_DATES: Record<number, Ymd> = {
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

const FESTIVALS: FestivalDefinition[] = [
  {
    id: "festival-new-year",
    label: "New Year",
    emoji: "🎆",
    color: "#7c3aed",
    getRange: (year) => ({ start: { year, month: 1, day: 1 }, end: { year, month: 1, day: 1 } }),
  },
  {
    id: "festival-valentine",
    label: "Valentine’s Day",
    emoji: "💗",
    color: "#ec4899",
    getRange: (year) => ({ start: { year, month: 2, day: 14 }, end: { year, month: 2, day: 14 } }),
  },
  {
    id: "festival-songkran",
    label: "Songkran",
    emoji: "💦",
    color: "#0ea5e9",
    getRange: (year) => ({ start: { year, month: 4, day: 13 }, end: { year, month: 4, day: 15 } }),
  },
  {
    id: "festival-halloween",
    label: "Halloween",
    emoji: "🎃",
    color: "#f97316",
    getRange: (year) => ({ start: { year, month: 10, day: 31 }, end: { year, month: 10, day: 31 } }),
  },
  {
    id: "festival-loy-krathong",
    label: "Loy Krathong",
    emoji: "🪷",
    color: "#8b5cf6",
    getRange: (year) => {
      const date = LOY_KRATHONG_DATES[year];
      return date ? { start: date, end: date } : null;
    },
  },
  {
    id: "festival-christmas",
    label: "Christmas",
    emoji: "🎄",
    color: "#16a34a",
    getRange: (year) => ({ start: { year, month: 12, day: 25 }, end: { year, month: 12, day: 25 } }),
  },
];

const WEEKDAY_THEMES: WeekdayTheme[] = [
  { id: "weekday-monday", label: "สวัสดีวันจันทร์", emoji: "🌼", color: "#eab308" },
  { id: "weekday-tuesday", label: "สวัสดีวันอังคาร", emoji: "🌸", color: "#ec4899" },
  { id: "weekday-wednesday", label: "สวัสดีวันพุธ", emoji: "🍀", color: "#16a34a" },
  { id: "weekday-thursday", label: "สวัสดีวันพฤหัสบดี", emoji: "🧡", color: "#f97316" },
  { id: "weekday-friday", label: "สวัสดีวันศุกร์", emoji: "🌊", color: "#0ea5e9" },
  { id: "weekday-saturday", label: "สวัสดีวันเสาร์", emoji: "💜", color: "#7c3aed" },
  { id: "weekday-sunday", label: "สวัสดีวันอาทิตย์", emoji: "🌹", color: "#dc2626" },
];

function toEpochDay(value: Ymd) {
  return Math.floor(Date.UTC(value.year, value.month - 1, value.day) / 86400000);
}

function fromEpochDay(epochDay: number): Ymd {
  const date = new Date(epochDay * 86400000);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function bangkokToday(): Ymd {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const read = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function formatThaiDate(value: Ymd) {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day, 12));
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function festivalWindow(festival: FestivalDefinition, eventYear: number) {
  const range = festival.getRange(eventYear);
  if (!range) return null;
  const start = toEpochDay(range.start) - WINDOW_DAYS;
  const end = toEpochDay(range.end) + WINDOW_DAYS;
  return { start, end, eventStart: toEpochDay(range.start), eventEnd: toEpochDay(range.end) };
}

function getFestivalState(today = bangkokToday()) {
  const todayDay = toEpochDay(today);
  const candidates: Array<{ festival: FestivalDefinition; start: number; end: number; distance: number }> = [];

  for (const festival of FESTIVALS) {
    for (const year of [today.year - 1, today.year, today.year + 1]) {
      const window = festivalWindow(festival, year);
      if (!window || todayDay < window.start || todayDay > window.end) continue;
      const distance = todayDay < window.eventStart
        ? window.eventStart - todayDay
        : todayDay > window.eventEnd
          ? todayDay - window.eventEnd
          : 0;
      candidates.push({ festival, start: window.start, end: window.end, distance });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance || b.start - a.start);
  return candidates[0] || null;
}

function getFestivalAvailability(festival: FestivalDefinition, today = bangkokToday()) {
  const todayDay = toEpochDay(today);
  const options = [today.year - 1, today.year, today.year + 1]
    .map((year) => ({ year, window: festivalWindow(festival, year) }))
    .filter((item): item is { year: number; window: NonNullable<ReturnType<typeof festivalWindow>> } => Boolean(item.window));

  const active = options.find(({ window }) => todayDay >= window.start && todayDay <= window.end);
  if (active) return { active: true, ...active.window };

  const future = options
    .filter(({ window }) => window.start > todayDay)
    .sort((a, b) => a.window.start - b.window.start)[0];
  return future ? { active: false, ...future.window } : null;
}

function readPreferredTheme() {
  try {
    const custom = localStorage.getItem(CUSTOM_THEME_KEY) || "";
    if (WEEKDAY_THEMES.some((theme) => theme.id === custom)) return custom;
    return localStorage.getItem(BASE_THEME_KEY) || "robinhood";
  } catch {
    return "robinhood";
  }
}

let applyingTheme = false;
function applyEffectiveTheme() {
  if (applyingTheme) return;
  applyingTheme = true;
  try {
    const festival = getFestivalState();
    const nextTheme = festival?.festival.id || readPreferredTheme();
    if (document.documentElement.dataset.qaTheme !== nextTheme) {
      document.documentElement.dataset.qaTheme = nextTheme;
    }
    document.documentElement.dataset.qaFestivalOverride = festival?.festival.id || "";
    syncPickerState();
  } finally {
    applyingTheme = false;
  }
}

function createSectionTitle(text: string) {
  const title = document.createElement("div");
  title.dataset.qaSeasonalThemeHeading = text;
  title.textContent = text;
  title.style.gridColumn = "1 / -1";
  title.style.marginTop = "10px";
  title.style.fontSize = "12px";
  title.style.fontWeight = "800";
  title.style.letterSpacing = ".12em";
  title.style.textTransform = "uppercase";
  title.style.color = "#64748b";
  return title;
}

function makeThemeCard(options: {
  id: string;
  label: string;
  emoji: string;
  color: string;
  subtitle: string;
  disabled?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.qaCustomThemeCard = options.id;
  button.disabled = Boolean(options.disabled);
  button.style.cssText = [
    "position:relative",
    "display:flex",
    "align-items:center",
    "gap:12px",
    "min-height:86px",
    "padding:14px",
    "border-radius:20px",
    `border:2px solid ${options.selected ? options.color : "#e2e8f0"}`,
    `background:${options.selected ? `${options.color}12` : "#ffffff"}`,
    `box-shadow:${options.selected ? `0 10px 26px ${options.color}22` : "0 6px 16px rgba(15,23,42,.04)"}`,
    `cursor:${options.disabled ? "not-allowed" : "pointer"}`,
    `opacity:${options.disabled ? ".62" : "1"}`,
    "text-align:left",
    "font-family:Kanit, sans-serif",
  ].join(";");

  const icon = document.createElement("span");
  icon.textContent = options.emoji;
  icon.style.cssText = `display:grid;place-items:center;width:46px;height:46px;border-radius:15px;background:${options.color}18;font-size:24px;flex:0 0 auto`;

  const copy = document.createElement("span");
  copy.style.cssText = "display:flex;min-width:0;flex-direction:column;gap:3px";
  const label = document.createElement("strong");
  label.textContent = options.label;
  label.style.cssText = "font-size:14px;color:#0f172a;font-weight:700";
  const subtitle = document.createElement("span");
  subtitle.textContent = options.subtitle;
  subtitle.style.cssText = "font-size:11px;color:#64748b;font-weight:500;line-height:1.35";
  copy.append(label, subtitle);
  button.append(icon, copy);

  if (options.selected) {
    const check = document.createElement("span");
    check.textContent = "✓";
    check.style.cssText = `position:absolute;right:12px;top:10px;color:${options.color};font-weight:900`;
    button.append(check);
  } else if (options.disabled) {
    const lock = document.createElement("span");
    lock.textContent = "🔒";
    lock.style.cssText = "position:absolute;right:12px;top:10px;font-size:12px";
    button.append(lock);
  }

  if (options.onClick && !options.disabled) button.addEventListener("click", options.onClick);
  return button;
}

function findThemeGrid() {
  const dialog = document.querySelector<HTMLElement>('section[role="dialog"][aria-labelledby="qa-theme-picker-title"]');
  if (!dialog) return null;
  return Array.from(dialog.querySelectorAll<HTMLElement>("div")).find((node) => {
    const className = node.className || "";
    return typeof className === "string" && className.includes("grid") && className.includes("overflow-y-auto");
  }) || null;
}

function renderSeasonalPicker() {
  const grid = findThemeGrid();
  if (!grid) return;
  grid.querySelectorAll("[data-qa-seasonal-added='true']").forEach((node) => node.remove());

  const festivalHeading = createSectionTitle("Festival Collection");
  festivalHeading.dataset.qaSeasonalAdded = "true";
  grid.appendChild(festivalHeading);

  const activeFestival = getFestivalState()?.festival.id || "";
  FESTIVALS.forEach((festival) => {
    const availability = getFestivalAvailability(festival);
    const isAvailable = Boolean(availability?.active);
    const selected = activeFestival === festival.id;
    const subtitle = availability
      ? isAvailable
        ? `เปิดอัตโนมัติ • ${formatThaiDate(fromEpochDay(availability.start))} – ${formatThaiDate(fromEpochDay(availability.end))}`
        : `Locked • เปิด ${formatThaiDate(fromEpochDay(availability.start))} – ${formatThaiDate(fromEpochDay(availability.end))}`
      : "Locked • รอปฏิทินเทศกาลปีถัดไป";
    const card = makeThemeCard({
      id: festival.id,
      label: festival.label,
      emoji: festival.emoji,
      color: festival.color,
      subtitle,
      disabled: !isAvailable,
      selected,
    });
    card.dataset.qaSeasonalAdded = "true";
    grid.appendChild(card);
  });

  const weekdayHeading = createSectionTitle("Day of the Week Collection");
  weekdayHeading.dataset.qaSeasonalAdded = "true";
  grid.appendChild(weekdayHeading);

  const storedCustom = (() => {
    try { return localStorage.getItem(CUSTOM_THEME_KEY) || ""; } catch { return ""; }
  })();
  WEEKDAY_THEMES.forEach((theme) => {
    const card = makeThemeCard({
      id: theme.id,
      label: theme.label,
      emoji: theme.emoji,
      color: theme.color,
      subtitle: "เลือกใช้เป็น Theme ประจำเครื่องนี้",
      selected: !activeFestival && storedCustom === theme.id,
      onClick: () => {
        try { localStorage.setItem(CUSTOM_THEME_KEY, theme.id); } catch { /* no-op */ }
        applyEffectiveTheme();
        renderSeasonalPicker();
      },
    });
    card.dataset.qaSeasonalAdded = "true";
    grid.appendChild(card);
  });
}

function syncPickerState() {
  if (!findThemeGrid()) return;
  window.requestAnimationFrame(renderSeasonalPicker);
}

function installThemePickerHooks() {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const dialog = target?.closest?.('section[role="dialog"][aria-labelledby="qa-theme-picker-title"]');
    if (!dialog) return;
    const button = target?.closest?.("button") as HTMLButtonElement | null;
    if (!button || button.dataset.qaCustomThemeCard) return;
    const grid = findThemeGrid();
    if (grid && grid.contains(button)) {
      try { localStorage.removeItem(CUSTOM_THEME_KEY); } catch { /* no-op */ }
      window.setTimeout(applyEffectiveTheme, 0);
    }
  }, true);

  const observer = new MutationObserver(() => {
    if (findThemeGrid()) renderSeasonalPicker();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const themeObserver = new MutationObserver(() => applyEffectiveTheme());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-qa-theme"] });
}

function initSeasonalThemes() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  installThemePickerHooks();
  window.setTimeout(applyEffectiveTheme, 0);
  window.setInterval(applyEffectiveTheme, 60 * 1000);
  window.addEventListener("focus", applyEffectiveTheme);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) applyEffectiveTheme();
  });
}

initSeasonalThemes();

export {};
