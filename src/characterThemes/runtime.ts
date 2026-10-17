import { characterThemeFor, characterThemeVariables } from './model.mjs';
import { characterIconUrl } from './icons.mjs';
import { festivalActionFor } from '../festivalThemes/controlIcons';

export function characterActionFor(label: string) {
  const plainLabel = label.trim().replace(/^[^\p{L}\p{N}]+/u, '');
  if (/^(delete|reject|sign out|logout|ลบ|ปฏิเสธ|ออกจากระบบ|reset (this|all|task))/i.test(plainLabel)) return '';
  const action = festivalActionFor(label); if (action) return action;
  if (/coaching|โค้ช/i.test(label)) return 'coaching';
  if (/appeal|อุทธรณ์|อุธรณ์|review/i.test(label)) return 'appeal';
  if (/signature|เซ็น|ลงนาม/i.test(label)) return 'signature';
  if (/profile|users|team|chat|บุคคล/i.test(label)) return 'users';
  if (/schedule|activity|history|เวลา|ตาราง/i.test(label)) return 'clock';
  if (/dashboard|summary|analytics|ภาพรวม|สรุป/i.test(label)) return 'score';
  if (/evaluation|process|library|training|test|queue|report|presentation/i.test(label)) return 'cases';
  if (/theme|ธีม/i.test(label)) return 'theme';
  return '';
}
export function installCharacterThemeRuntime() {
  const root = document.documentElement;
  let active = '', queued = false, disposed = false;
  const clearControls = () => document.querySelectorAll<HTMLElement>('[data-character-action]').forEach(node => {
    delete node.dataset.characterAction; delete node.dataset.characterIconLayout; node.style.removeProperty('--character-control-icon');
  });
  const update = () => {
    queued = false; if (disposed) return;
    const theme = root.dataset.qaCharacterVersion === '2' && root.dataset.qaWeatherCollection !== 'auto' ? characterThemeFor(root.dataset.qaTheme) : null;
    if (active !== (theme?.id || '')) {
      active = theme?.id || ''; clearControls();
      if (theme) {
        root.dataset.qaCharacterTheme = theme.id;
        for (const [key, value] of Object.entries(characterThemeVariables(theme))) root.style.setProperty(key, value as string);
      } else {
        delete root.dataset.qaCharacterTheme;
        for (const key of ['accent', 'deep', 'pale', 'line', 'ink', 'art']) root.style.removeProperty('--character-' + key);
      }
    }
    if (!theme) return;
    document.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      if (button.closest('[data-theme-picker-v1], .qa-character-preview-dialog, .qa-festival-preview-overlay, [data-rich-text-image-preview], [contenteditable]') || button.querySelector('img')) return;
      const action = characterActionFor(button.getAttribute('aria-label') || button.textContent || '');
      if (!action) {
        delete button.dataset.characterAction; delete button.dataset.characterIconLayout; button.style.removeProperty('--character-control-icon');
        return;
      }
      if (button.dataset.characterAction === action) return;
      button.dataset.characterAction = action;
      button.dataset.characterIconLayout = button.querySelector(':scope > svg') ? 'replace' : 'prepend';
      button.style.setProperty('--character-control-icon', `url("${characterIconUrl(theme.id, action)}")`);
    });
  };
  const schedule = () => { if (!queued && !disposed) { queued = true; queueMicrotask(update); } };
  const attributes = new MutationObserver(schedule);
  attributes.observe(root, { attributes: true, attributeFilter: ['data-qa-theme', 'data-qa-character-version', 'data-qa-weather-collection'] });
  const controls = new MutationObserver(schedule);
  controls.observe(document.body, { childList: true, characterData: true, subtree: true });
  update();
  return () => { disposed = true; attributes.disconnect(); controls.disconnect(); clearControls(); delete root.dataset.qaCharacterTheme; for (const key of ['accent', 'deep', 'pale', 'line', 'ink', 'art']) root.style.removeProperty('--character-' + key); };
}
