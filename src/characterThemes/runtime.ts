import { characterThemeFor, characterThemeVariables } from './model.mjs';
import { characterIconAtlas, characterIconPosition, characterIconSize, characterPropFor } from './icons.mjs';
import { characterActionFor, characterNavigationAction } from './actions.mjs';
export { characterActionFor } from './actions.mjs';

const excluded = '[data-theme-picker-v1],.qa-character-preview-dialog,.qa-festival-preview-overlay,[data-rich-text-image-preview],[data-rich-text-toolbar],[contenteditable],.ql-toolbar,[data-pdf-preview]';
const rootVariables = ['accent', 'deep', 'pale', 'line', 'ink', 'art', 'icon-atlas', 'card-motif', 'download-arrow', 'upload-arrow'];

export function installCharacterThemeRuntime() {
  const root = document.documentElement;
  let active = '', queued = false, disposed = false;
  let atlasProbe: HTMLImageElement | null = null;
  const painted = new Map<SVGElement, string>();
  const clearIcon = (icon: SVGElement) => {
    delete icon.dataset.characterProp;
    delete icon.dataset.characterRuntimeIcon;
    delete icon.dataset.characterIconKind;
    icon.style.removeProperty('--character-prop-position');
    icon.style.removeProperty('--character-prop-size');
    painted.delete(icon);
  };
  const clearControls = () => {
    painted.forEach((_action, icon) => clearIcon(icon));
    document.querySelectorAll<HTMLElement>('[data-character-action]').forEach(node => {
      delete node.dataset.characterAction;
      delete node.dataset.characterIconLayout;
      node.style.removeProperty('--character-control-icon');
    });
    document.querySelectorAll<HTMLElement>('[data-character-surface]').forEach(node => delete node.dataset.characterSurface);
  };
  const paint = (icon: SVGElement, action: string, keep: Set<SVGElement>) => {
    keep.add(icon);
    if (painted.get(icon) === action) return;
    icon.dataset.characterProp = characterPropFor(action);
    icon.dataset.characterRuntimeIcon = 'true';
    icon.dataset.characterIconKind = action;
    icon.style.setProperty('--character-prop-position', characterIconPosition(action, active));
    icon.style.setProperty('--character-prop-size', characterIconSize(active, action));
    painted.set(icon, action);
  };
  const update = () => {
    queued = false;
    if (disposed) return;
    const theme = root.dataset.qaCharacterVersion === '2' && root.dataset.qaWeatherCollection !== 'auto' ? characterThemeFor(root.dataset.qaTheme) : null;
    if (active !== (theme?.id || '')) {
      active = theme?.id || '';
      clearControls();
      delete root.dataset.qaCharacterIconsReady;
      if (atlasProbe) { atlasProbe.onload = null; atlasProbe.onerror = null; }
      if (theme) {
        root.dataset.qaCharacterTheme = theme.id;
        for (const [key, value] of Object.entries(characterThemeVariables(theme))) root.style.setProperty(key, value as string);
        const id = theme.id;
        atlasProbe = new window.Image();
        atlasProbe.onload = () => { if (!disposed && active === id) root.dataset.qaCharacterIconsReady = id; };
        atlasProbe.src = characterIconAtlas(id);
        if (atlasProbe.complete && atlasProbe.naturalWidth) root.dataset.qaCharacterIconsReady = id;
      } else {
        delete root.dataset.qaCharacterTheme;
        rootVariables.forEach(key => root.style.removeProperty('--character-' + key));
      }
    }
    if (!theme) return;
    const keep = new Set<SVGElement>();
    document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('button,a[role="button"]').forEach(button => {
      if (button.closest(excluded) || button.matches('.qa-sidebar-section-label,[aria-expanded],[role="tab"]') || button.querySelector('img,.qa-character-icon')) {
        delete button.dataset.characterAction;
        return;
      }
      const action = button.dataset.qaNavKey
        ? characterNavigationAction(button.dataset.qaNavKey)
        : characterActionFor(button.getAttribute('aria-label') || button.textContent || '');
      // Paint an EXISTING leading icon. Never insert an icon, move a label,
      // add button padding, or replace a trailing chevron/lock/status indicator.
      const icon = button.querySelector<SVGElement>(':scope > svg:first-child,:scope > :is(span,div):first-child > svg:first-child');
      if (!action || !icon || icon.classList.contains('ml-auto')) {
        delete button.dataset.characterAction;
        return;
      }
      button.dataset.characterAction = action;
      paint(icon, action, keep);
    });
    document.querySelectorAll<SVGElement>('[data-dashboard-metric] > svg,h2 > svg:first-child,h3 > svg:first-child').forEach(icon => {
      if (icon.closest(excluded + ',.qa-global-sidebar-v39')) return;
      const label = icon.parentElement?.textContent || '';
      if (/passed|failed|pending|อนุมัติ|ปฏิเสธ/i.test(label)) return;
      const action = characterActionFor(label);
      if (action) paint(icon, action, keep);
    });
    painted.forEach((_action, icon) => { if (!keep.has(icon)) clearIcon(icon); });
    document.querySelectorAll<HTMLElement>('[data-dashboard-metric],[data-qa-theme-surface-v1] :is(section,article,div)[class]').forEach(card => {
      if (card.closest(excluded + ',.qa-global-sidebar-v39')) { delete card.dataset.characterSurface; return; }
      const classes = [...card.classList];
      const isCard = card.hasAttribute('data-dashboard-metric') || (classes.some(name => /^bg-white(?:\/\d+)?$/.test(name)) && classes.some(name => /^rounded(?:-|$)/.test(name)) && classes.some(name => /^border(?:-|$)/.test(name)));
      if (isCard) card.dataset.characterSurface = 'card';
      else delete card.dataset.characterSurface;
    });
  };
  const schedule = () => { if (!queued && !disposed) { queued = true; queueMicrotask(update); } };
  const attributes = new MutationObserver(schedule);
  attributes.observe(root, { attributes: true, attributeFilter: ['data-qa-theme', 'data-qa-character-version', 'data-qa-weather-collection'] });
  const controls = new MutationObserver(schedule);
  controls.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'data-qa-nav-key', 'class'] });
  update();
  return () => {
    disposed = true;
    attributes.disconnect();
    controls.disconnect();
    clearControls();
    if (atlasProbe) { atlasProbe.onload = null; atlasProbe.onerror = null; }
    delete root.dataset.qaCharacterTheme;
    delete root.dataset.qaCharacterIconsReady;
    rootVariables.forEach(key => root.style.removeProperty('--character-' + key));
  };
}
