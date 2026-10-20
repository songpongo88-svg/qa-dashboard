import { weekdayThemeFor } from './model.mjs';
import { weekdayActionFor, weekdayHeadingIcon, weekdayIconAtlas, weekdayIconPosition, weekdayIconSize, weekdayNavigationIcon } from './icons.mjs';
import './redesign.css';

const excluded = '[data-theme-picker-v1],.qa-special-preview-dialog,.qa-character-preview-dialog,.qa-festival-preview-overlay,[data-rich-text-image-preview],[data-rich-text-toolbar],[contenteditable],.ql-toolbar,[data-pdf-preview],.qa-themed-login,.qa-weekday-scene,.qa-weekday-side-rail';
const markerKeys = ['weekdayAction', 'weekdayIconKind', 'weekdayIconMode', 'weekdaySurface', 'weekdayHeading'] as const;

// Paint decoration only: never replace React children, handlers, text or account state.
export function installWeekdayThemeRuntime() {
  const root = document.documentElement;
  let active = '', queued = false, disposed = false;
  let probe: HTMLImageElement | null = null;
  const decorated = new Set<HTMLElement | SVGElement>();
  const clear = (element: HTMLElement | SVGElement) => {
    for (const key of markerKeys) delete element.dataset[key];
    element.style.removeProperty('--weekday-control-position');
    element.style.removeProperty('--weekday-control-size');
  };
  const reset = () => { decorated.forEach(clear); decorated.clear(); };
  const update = () => {
    queued = false;
    if (disposed) return;
    const theme = weekdayThemeFor(root.dataset.qaTheme);
    if (theme) root.dataset.qaWeekdayTheme = theme.id; else delete root.dataset.qaWeekdayTheme;
    if (active !== (theme?.id || '')) {
      active = theme?.id || '';
      reset();
      delete root.dataset.qaWeekdayIconsReady;
      if (probe) { probe.onload = null; probe.onerror = null; }
      if (theme) {
        root.style.setProperty('--weekday-icon-atlas', `url("${weekdayIconAtlas(theme.id)}")`);
        const id = theme.id;
        probe = new window.Image();
        probe.onload = () => { if (!disposed && active === id) root.dataset.qaWeekdayIconsReady = id; };
        probe.src = weekdayIconAtlas(id);
        if (probe.complete && probe.naturalWidth) root.dataset.qaWeekdayIconsReady = id;
      } else root.style.removeProperty('--weekday-icon-atlas');
    }
    if (!theme) return;
    const keep = new Set<HTMLElement | SVGElement>();
    const expected = new Map<HTMLElement | SVGElement, Set<string>>();
    const mark = (element: HTMLElement | SVGElement, key: typeof markerKeys[number], value: string) => {
      keep.add(element);
      if (!expected.has(element)) expected.set(element, new Set());
      expected.get(element)!.add(key);
      if (element.dataset[key] !== value) element.dataset[key] = value;
    };
    const icon = (element: HTMLElement | SVGElement, kind: string, mode: string) => {
      mark(element, 'weekdayIconKind', kind);
      mark(element, 'weekdayIconMode', mode);
      const position = weekdayIconPosition(kind, active);
      if (element.style.getPropertyValue('--weekday-control-position') !== position) element.style.setProperty('--weekday-control-position', position);
      const size = weekdayIconSize(kind, active);
      if (element.style.getPropertyValue('--weekday-control-size') !== size) element.style.setProperty('--weekday-control-size', size);
    };
    document.querySelectorAll<HTMLElement>('button,a[role="button"],a[data-case-header-action]').forEach(button => {
      if (button.closest(excluded) || button.matches('.qa-sidebar-section-label') || button.querySelector('img,.qa-weekday-icon,.qa-character-icon,.qa-special-icon')) return;
      const kind = button.dataset.qaNavKey ? weekdayNavigationIcon(button.dataset.qaNavKey) : weekdayActionFor(button.getAttribute('aria-label') || button.textContent || '');
      if (!kind) return;
      const existing = button.querySelector<SVGElement>(':scope > svg:first-child,:scope > :is(span,div):first-child > svg:first-child');
      if (existing && !existing.classList.contains('ml-auto')) icon(existing, kind, 'replace');
      else if (!button.querySelector('svg') && /^[\p{L}\p{N}]/u.test((button.textContent || '').trim()) && (button.textContent || '').trim().length < 55 && !button.matches('[aria-expanded],[aria-haspopup],.h-5,.w-5,.h-6,.w-6')) icon(button, kind, 'prefix');
      mark(button, 'weekdayAction', kind);
    });
    document.querySelectorAll<SVGElement>('[data-dashboard-metric] svg').forEach(element => {
      if (element.closest(excluded)) return;
      const label = element.closest('[data-dashboard-metric]')?.textContent || '';
      const kind = weekdayActionFor(label);
      if (kind) icon(element, kind, 'replace');
    });
    document.querySelectorAll<SVGElement>('.mc-title > svg,.mc-search > svg,.mc-upload > svg').forEach(element => {
      icon(element, element.closest('.mc-title') ? 'coaching' : element.closest('.mc-search') ? 'search' : 'upload', 'replace');
    });
    document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,div[class*="font-"],span[class*="font-"]').forEach(title => {
      if (title.closest(excluded + ',.qa-global-sidebar-v39,table,button,a,[role="tablist"]') || title.childElementCount || (title.textContent || '').length > 85) return;
      if (!/^H[1-4]$/.test(title.tagName) && ![...title.classList].some(c => /^text-(?:base|lg|xl|2xl|\[(?:1[4-9]|2\d)px\])$/.test(c))) return;
      const kind = weekdayHeadingIcon(title.textContent || '');
      if (!kind) return;
      mark(title, 'weekdayHeading', kind);
      icon(title, kind, 'prefix');
    });
    document.querySelectorAll<HTMLElement>('#root :is(section,article,div)[class],[data-process-picker-portal] :is(section,article,div)[class]').forEach(card => {
      if (card.closest(excluded + ',.qa-global-sidebar-v39,[role="tablist"],button,table')) return;
      const classes = [...card.classList];
      const rounded = classes.some(c => /^rounded(?:-|$)/.test(c));
      const neutral = classes.some(c => /^bg-white(?:\/\d+)?$/.test(c)) || classes.some(c => /^(from-white|from-violet-50|from-fuchsia-50)/.test(c));
      if (card.matches('[data-case-information-unified],[data-qa-dashboard-control-center-v163],[data-dashboard-metric]') || (rounded && neutral && classes.some(c => /^border(?:-|$)/.test(c)))) mark(card, 'weekdaySurface', 'card');
      else if (classes.includes('border-b') && (neutral || classes.some(c => /^bg-gradient-/.test(c))) && card.querySelector('[data-weekday-heading]')) mark(card, 'weekdaySurface', 'header');
    });
    decorated.forEach(element => {
      if (!keep.has(element)) { clear(element); return; }
      for (const key of markerKeys) if (!expected.get(element)?.has(key)) delete element.dataset[key];
      if (!expected.get(element)?.has('weekdayIconKind')) { element.style.removeProperty('--weekday-control-position'); element.style.removeProperty('--weekday-control-size'); }
    });
    decorated.clear(); keep.forEach(element => decorated.add(element));
  };
  const schedule = () => { if (!queued && !disposed) { queued = true; queueMicrotask(update); } };
  const themeObserver = new MutationObserver(schedule);
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-qa-theme'] });
  const contentObserver = new MutationObserver(schedule);
  contentObserver.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'data-qa-nav-key', 'class'] });
  update();
  return () => {
    disposed = true; themeObserver.disconnect(); contentObserver.disconnect(); reset();
    if (probe) { probe.onload = null; probe.onerror = null; }
    delete root.dataset.qaWeekdayIconsReady; delete root.dataset.qaWeekdayTheme; root.style.removeProperty('--weekday-icon-atlas');
  };
}
