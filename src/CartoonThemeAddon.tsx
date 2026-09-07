import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./cartoonTheme.css";

const CARTOON_THEME_ID = "cartoon";
const CARTOON_THEME_STORAGE_KEY = "qa-dashboard:cartoon-theme-addon-v1";
const NATIVE_THEME_STORAGE_KEY = "qa-dashboard:theme-v1";

const NATIVE_THEME_LABELS: Record<string, string> = {
  robinhood: "Robinhood Purple",
  pink: "Pink Blossom",
  yellow: "Sunshine Yellow",
  lilac: "Lilac Sky",
  ocean: "Ocean Blue",
  emerald: "Emerald Mint",
  midnight: "Midnight Violet",
  graphite: "Graphite Mono",
};

function readCartoonThemeEnabled() {
  try {
    return window.localStorage.getItem(CARTOON_THEME_STORAGE_KEY) === CARTOON_THEME_ID;
  } catch {
    return false;
  }
}

function readNativeThemeId() {
  try {
    const stored = String(window.localStorage.getItem(NATIVE_THEME_STORAGE_KEY) || "").trim();
    return Object.prototype.hasOwnProperty.call(NATIVE_THEME_LABELS, stored) ? stored : "robinhood";
  } catch {
    return "robinhood";
  }
}

function applyCartoonThemeDom() {
  const root = document.documentElement;
  root.dataset.qaTheme = CARTOON_THEME_ID;
  root.dataset.qaCartoonTheme = "true";
}

function restoreNativeThemeDom() {
  const root = document.documentElement;
  delete root.dataset.qaCartoonTheme;
  if (root.dataset.qaTheme === CARTOON_THEME_ID) {
    root.dataset.qaTheme = readNativeThemeId();
  }
}

function findThemePickerGrid() {
  const dialog = document.querySelector<HTMLElement>(
    'section[role="dialog"][aria-labelledby="qa-theme-picker-title"]'
  );
  if (!dialog) return null;

  const grid = Array.from(dialog.children).find(
    (child) => child instanceof HTMLElement && child.classList.contains("grid")
  );
  return grid instanceof HTMLElement ? grid : null;
}

function syncSidebarThemeLabel(enabled: boolean) {
  const button = document.querySelector<HTMLButtonElement>('button[aria-label^="Theme ปัจจุบัน"]');
  if (!button) return;

  const labels = Array.from(button.querySelectorAll<HTMLElement>(".qa-sidebar-label span"));
  const valueLabel = labels.length ? labels[labels.length - 1] : null;

  if (enabled) {
    if (button.dataset.qaCartoonThemeSidebar !== "true") {
      button.dataset.qaCartoonThemeSidebar = "true";
    }
    const nextAria = "Theme ปัจจุบัน Cartoon Pop. กดเพื่อเปลี่ยน Theme";
    if (button.getAttribute("aria-label") !== nextAria) button.setAttribute("aria-label", nextAria);
    if (valueLabel && valueLabel.textContent !== "Cartoon Pop") valueLabel.textContent = "Cartoon Pop";
    return;
  }

  delete button.dataset.qaCartoonThemeSidebar;
  const nativeTheme = readNativeThemeId();
  const nativeLabel = NATIVE_THEME_LABELS[nativeTheme] || NATIVE_THEME_LABELS.robinhood;
  const nextAria = `Theme ปัจจุบัน ${nativeLabel}. กดเพื่อเปลี่ยน Theme`;
  if (button.getAttribute("aria-label") !== nextAria) button.setAttribute("aria-label", nextAria);
  if (valueLabel && valueLabel.textContent !== nativeLabel) valueLabel.textContent = nativeLabel;
}

export default function CartoonThemeAddon() {
  const [enabled, setEnabled] = useState(readCartoonThemeEnabled);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  const selectCartoonTheme = useCallback(() => {
    try {
      window.localStorage.setItem(CARTOON_THEME_STORAGE_KEY, CARTOON_THEME_ID);
    } catch {
      // Theme still applies for the current browser session.
    }
    applyCartoonThemeDom();
    syncSidebarThemeLabel(true);
    setEnabled(true);
  }, []);

  useLayoutEffect(() => {
    if (enabled) {
      applyCartoonThemeDom();
      syncSidebarThemeLabel(true);
    } else {
      restoreNativeThemeDom();
      syncSidebarThemeLabel(false);
    }
  }, [enabled]);

  useEffect(() => {
    const refresh = () => {
      const nextHost = findThemePickerGrid();
      setPortalHost((current) => (current === nextHost ? current : nextHost));

      if (readCartoonThemeEnabled()) {
        if (document.documentElement.dataset.qaTheme !== CARTOON_THEME_ID) applyCartoonThemeDom();
        syncSidebarThemeLabel(true);
      }
    };

    refresh();

    const bodyObserver = new MutationObserver(refresh);
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    const themeObserver = new MutationObserver(() => {
      if (readCartoonThemeEnabled() && document.documentElement.dataset.qaTheme !== CARTOON_THEME_ID) {
        applyCartoonThemeDom();
        syncSidebarThemeLabel(true);
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-qa-theme"],
    });

    return () => {
      bodyObserver.disconnect();
      themeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleNativeThemeClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest(
        'section[role="dialog"][aria-labelledby="qa-theme-picker-title"] div.grid > button'
      );
      if (!button || button.hasAttribute("data-cartoon-theme-button")) return;
      if (!readCartoonThemeEnabled()) return;

      try {
        window.localStorage.removeItem(CARTOON_THEME_STORAGE_KEY);
      } catch {
        // Native theme selection still takes over in the current session.
      }
      setEnabled(false);
    };

    document.addEventListener("click", handleNativeThemeClick, true);
    return () => document.removeEventListener("click", handleNativeThemeClick, true);
  }, []);

  if (!portalHost) return null;

  return createPortal(
    <button
      type="button"
      data-cartoon-theme-button="true"
      aria-pressed={enabled}
      onClick={selectCartoonTheme}
      className={`qa-cartoon-theme-card${enabled ? " is-selected" : ""}`}
    >
      <span className="qa-cartoon-theme-preview" aria-hidden="true">
        <span className="qa-cartoon-doodle qa-cartoon-star">★</span>
        <span className="qa-cartoon-theme-swatches">
          <span />
          <span />
          <span />
        </span>
        <span className="qa-cartoon-doodle qa-cartoon-cloud">☁︎</span>
        <span className="qa-cartoon-doodle qa-cartoon-heart">♥</span>
      </span>

      <span className="qa-cartoon-theme-copy">
        <span className="qa-cartoon-theme-title">Cartoon Pop</span>
        <span className="qa-cartoon-theme-subtitle">
          {enabled ? "กำลังใช้งาน Theme นี้" : "ลายการ์ตูนพาสเทล · ดาว เมฆ หัวใจ"}
        </span>
      </span>

      <span className="qa-cartoon-theme-check" aria-hidden="true">
        {enabled ? "✓" : ""}
      </span>
    </button>,
    portalHost
  );
}
