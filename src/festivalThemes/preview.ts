import { festivalThemeFor } from './model.mjs';
import { festivalIconUrl, festivalIconVariables } from './icons.mjs';

function icon(id: string, kind: string) {
  return `<img class="qa-festival-icon" data-festival-icon="${kind}" src="${festivalIconUrl(id, kind)}" width="24" height="24" alt="" aria-hidden="true">`;
}
export function openFestivalPreview(id: string, opener: HTMLButtonElement) {
  const theme = festivalThemeFor(id);
  if (!theme || document.querySelector('.qa-festival-preview-overlay')) return;
  const overlay = document.createElement('div'); overlay.className = 'qa-festival-preview-overlay';
  const dialog = document.createElement('section'); dialog.className = 'qa-festival-preview-dialog';
  dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'qa-festival-preview-title');
  const header = document.createElement('header');
  const title = document.createElement('h2'); title.id = 'qa-festival-preview-title'; title.textContent = `${theme.label} · ตัวอย่างธีม`;
  const close = document.createElement('button'); close.type = 'button'; close.className = 'qa-festival-preview-close'; close.textContent = 'ปิดตัวอย่าง';
  header.append(title, close);
  const sample = document.createElement('div'); sample.className = 'qa-festival-sample'; sample.dataset.qaFestivalPreview = id;
  for (const [key, value] of Object.entries(festivalIconVariables(id))) sample.style.setProperty(key, value);
  const navigation = [['dashboard', 'QA Dashboard'], ['add', 'Evaluate'], ['target', 'QA Access Check'], ['appeal', 'Appeal Cases'], ['review', 'Appeal Review'], ['chat', 'Coaching'], ['list', 'Rubrics'], ['check', 'Training'], ['signature', 'Signatures']];
  // The template contains only trusted catalog constants, not case/user content.
  sample.innerHTML = `<aside class="qa-festival-sample-nav"><div class="qa-festival-sample-brand"><img src="/robinhood-logo.png" alt="Robinhood"><strong>QA Dashboard</strong></div>${navigation.map(([kind, label], index) => `<div data-active="${index === 0}">${icon(id, kind)}<span>${label}</span></div>`).join('')}</aside>
    <div class="qa-festival-sample-main"><header class="qa-festival-hero"><div class="qa-festival-hero-brand"><img src="/robinhood-logo.png" alt="Robinhood" width="32" height="32"><div><strong>Robinhood QA</strong><small>FESTIVAL COLLECTION</small></div></div><div class="qa-festival-hero-content"><div><small>${theme.label}</small><h1>QA Dashboard</h1><p>${theme.thai}</p></div></div></header>
    <div class="qa-festival-sample-body"><div class="qa-festival-sample-card"><strong>QA Dashboard</strong><div class="qa-festival-sample-actions">${['search', 'reset', 'export', 'compare'].map(action => `<button type="button" data-festival-action="${action}">${action[0].toUpperCase() + action.slice(1)}</button>`).join('')}</div><div class="qa-festival-sample-filters"><span>Monthly</span><span>All Teams</span><span>All Agents</span></div></div>
    <div class="qa-festival-sample-metrics">${[['score', 'Quality Score'], ['kpi', 'KPI Status'], ['cases', 'Cases Evaluated'], ['appealResult', 'Appeal Results'], ['grade', 'Overall Grade']].map(([kind, label]) => `<div class="qa-festival-sample-card">${icon(id, kind)}<small>${label}</small><strong>—</strong></div>`).join('')}</div>
    <div class="qa-festival-sample-card qa-festival-sample-table"><strong>Recent Cases</strong><table><thead><tr><th>Case ID</th><th>Agent</th><th>Score</th><th>KPI Status</th></tr></thead><tbody><tr><td>—</td><td>—</td><td>—</td><td data-status="pass">Passed</td></tr><tr><td>—</td><td>—</td><td>—</td><td data-status="fail">Not Passed</td></tr></tbody></table></div><small class="qa-festival-sample-note">ตัวอย่างหน้าตาธีม ไม่มีข้อมูลเคสจริง · เปิดใช้อัตโนมัติตามช่วงเทศกาล</small></div></div>`;
  dialog.append(header, sample); overlay.append(dialog);
  const picker = document.querySelector<HTMLElement>('section[aria-labelledby="qa-theme-picker-title"]');
  const previousInert = picker?.inert; const previousOverflow = document.body.style.overflow;
  if (picker) picker.inert = true;
  document.body.style.overflow = 'hidden';
  const remove = () => {
    overlay.remove(); document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = previousOverflow;
    if (picker) picker.inert = Boolean(previousInert);
    if (opener.isConnected) opener.focus();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); remove(); }
    if (event.key === 'Tab') {
      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if ((event.shiftKey && document.activeElement === first) || !dialog.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      event.stopImmediatePropagation();
    }
  };
  close.addEventListener('click', remove);
  overlay.addEventListener('click', event => { if (event.target === overlay) remove(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay); close.focus();
}
