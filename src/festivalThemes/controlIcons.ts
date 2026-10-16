import { festivalThemeFor } from './model.mjs';
import { FESTIVAL_ACTIONS, festivalIconVariables } from './icons.mjs';

export function festivalActionFor(label: string) {
  const text = label.trim().replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
  if (/^(reset (?:this|all|task)|delete\b|ลบ|ยกเลิก|reject\b|ปฏิเสธ)/.test(text)) return '';
  if (/^(search\b|ค้นหา)/.test(text)) return 'search';
  if (/^(reset\b|ล้างคำค้น|ล้างตัวกรอง|รีเซ็ตตัวกรอง)/.test(text)) return 'reset';
  if (/^(export\b|download\b|ส่งออก|ดาวน์โหลด)/.test(text)) return 'export';
  if (/^(compare\b|edit comparison\b|เปรียบเทียบ)/.test(text)) return 'compare';
  if (/^(refresh\b|อัปเดตข้อมูล|โหลดข้อมูลใหม่)/.test(text)) return 'refresh';
  if (/^(save\b|บันทึก)/.test(text)) return 'save';
  return '';
}

// Decoration is CSS-only: no handlers, text, focus, permissions or React child
// nodes are replaced. An observer covers controls mounted by other workspaces.
export function installFestivalControlIcons() {
  let active = '', queued = false, disposed = false;
  const root = document.documentElement;
  const update = () => {
    queued = false;
    if (disposed) return;
    const theme = festivalThemeFor(root.dataset.qaTheme);
    if (active !== (theme?.id || '')) {
      active = theme?.id || '';
      document.querySelectorAll('[data-festival-action]').forEach(node => node.removeAttribute('data-festival-action'));
      for (const action of FESTIVAL_ACTIONS) root.style.removeProperty(`--festival-icon-${action}`);
      if (theme) for (const [key, value] of Object.entries(festivalIconVariables(theme.id))) root.style.setProperty(key, value);
    }
    if (!theme) return;
    document.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
      if (button.closest('.qa-global-sidebar-v39, [data-theme-picker-v1], .qa-festival-preview-overlay, [data-rich-text-image-preview]') || button.querySelector('img')) return;
      const label = button.textContent || '';
      const action = festivalActionFor(label);
      if (action) button.dataset.festivalAction = action;
      else button.removeAttribute('data-festival-action');
    });
  };
  const schedule = () => { if (!queued && !disposed) { queued = true; queueMicrotask(update); } };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  const themeObserver = new MutationObserver(schedule);
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-qa-theme'] });
  update();
  return () => {
    disposed = true;
    observer.disconnect(); themeObserver.disconnect();
    document.querySelectorAll('[data-festival-action]').forEach(node => node.removeAttribute('data-festival-action'));
    for (const action of FESTIVAL_ACTIONS) root.style.removeProperty(`--festival-icon-${action}`);
  };
}
