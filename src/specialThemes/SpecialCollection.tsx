import React, { useEffect, useRef, useState } from 'react';
import { SPECIAL_THEMES, SPECIAL_UNLOCK_MS, SPECIAL_QUEST_DEADLINE } from './model.mjs';
import type { SpecialUsage } from './usage';
import './specialThemes.css';

type Theme = typeof SPECIAL_THEMES[number];
export function LockIcon({ unlocked = false }: { unlocked?: boolean }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="3" /><path d={unlocked ? 'M8 10V7a4 4 0 0 1 7.4-2' : 'M8 10V7a4 4 0 0 1 8 0v3'} /><path d="M12 14v3" /></svg>;
}
function ThemeSample({ theme }: { theme: Theme }) {
  return <div className="qa-special-sample" data-qa-special-preview={theme.id}>
    <div className="qa-special-sample-nav"><img src="/robinhood-logo.png" alt="Robinhood" width="28" height="28" /><strong>QA Dashboard</strong><span className="qa-special-primary">Dashboard</span><span>Case Detail</span></div>
    <div className="qa-special-sample-hero"><small>SPECIAL COLLECTION</small><h3>{theme.label}</h3><span>{theme.thai}</span></div>
    <div className="qa-special-sample-body">
      <div className="qa-special-sample-filters"><span>October 2026</span><span>All Teams</span><span>All Agents</span></div>
      <div className="qa-special-sample-metrics">{[['Average QA', ''], ['Cases Reviewed', ''], ['Passed', 'pass'], ['Not Passed', 'fail']].map(([label, status]) => <div key={label} className="qa-special-ui-card"><span>{label}</span><strong data-status={status}>—</strong></div>)}</div>
      <div className="qa-special-sample-charts">{['Quality Score Trend', 'Topic Performance'].map(label => <section key={label} className="qa-special-ui-card"><strong>{label}</strong><div className="qa-special-chart-placeholder" aria-hidden="true"><i /><i /><i /><i /><i /></div></section>)}</div>
      <div className="qa-special-ui-card qa-special-sample-table"><strong>Recent Cases</strong><table><thead><tr>{['Case ID', 'Agent', 'Score', 'KPI Status'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{[0, 1].map(row => <tr key={row}><td>—</td><td>—</td><td>—</td><td>—</td></tr>)}</tbody></table></div>
      <small className="qa-special-sample-note">ตัวอย่างหน้าตาธีม · ไม่มีข้อมูลเคสจริง</small>
    </div>
  </div>;
}
function ThemePreviewDialog({ theme, onClose }: { theme: Theme; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);
  return <dialog ref={dialog} className="qa-special-preview-dialog" aria-labelledby="qa-special-preview-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <header><div><strong id="qa-special-preview-title">{theme.label}</strong><span>ภาพพื้นหลัง การ์ด เมนู ปุ่ม และตารางของธีม</span></div><button type="button" autoFocus data-qa-custom-theme-card="special-preview" onClick={onClose} aria-label="ปิดภาพตัวอย่าง">ปิดตัวอย่าง</button></header>
    <ThemeSample theme={theme} />
  </dialog>;
}
export function SpecialCollection({ usage, selectedTheme, onSelect }: {
  usage: SpecialUsage; selectedTheme: string; onSelect: (id: string) => void;
}) {
  const [preview, setPreview] = useState<Theme | null>(null);
  const minutes = Math.floor(usage.activeMs / 60000);
  const remaining = Math.max(0, Math.ceil((SPECIAL_UNLOCK_MS - usage.activeMs) / 60000));
  const expired = usage.ready && usage.expired && !usage.unlocked;
  return <section data-qa-theme-collection="special" className="qa-special-collection">
    <div className="qa-special-collection-heading"><div><span className="qa-special-eyebrow">SPECIAL COLLECTION</span><h3>บรรยากาศพิเศษ สำหรับพื้นที่ทำงานของคุณ</h3><p>ภาพสมจริง พร้อมการ์ด เมนู ปุ่ม และตารางที่ออกแบบตามแต่ละธีม</p></div><LockIcon unlocked={usage.unlocked} /></div>
    <div className="qa-special-unlock-progress" data-qa-special-quest-state={!usage.ready ? 'loading' : usage.unlocked ? 'unlocked' : expired ? 'expired' : 'open'}>
      <p className="qa-special-quest-deadline"><strong>สิ้นสุดเควส</strong><time dateTime={SPECIAL_QUEST_DEADLINE}>31 ธันวาคม 2026 เวลา 23:59 น. (เวลาไทย)</time></p>
      <div><strong>{usage.unlocked ? 'ปลดล็อกครบทั้ง 3 ธีมแล้ว' : `ใช้งานสะสม ${minutes} / 180 นาที`}</strong><span role="status">{!usage.ready ? 'กำลังตรวจสิทธิ์และเวลาใช้งาน…' : usage.unlocked ? 'ใช้ธีมต่อได้หลังหมดเขต' : expired ? 'หมดเวลาปลดล็อก' : remaining ? `อีก ${remaining} นาทีปลดล็อกทั้งคอลเลกชัน` : 'ครบเวลาแล้ว · กำลังบันทึกเพื่อปลดล็อก…'}</span></div>
      <progress value={usage.activeMs} max={SPECIAL_UNLOCK_MS} aria-label="เวลาใช้งานสะสมสำหรับปลดล็อก Special Collection" />
      <p>สะสมแยกตามบัญชี ข้ามวันได้ · นับเฉพาะช่วงใช้งาน ไม่รวมเวลาซ่อนแท็บหรือไม่มีการใช้งานเกิน 5 นาที</p>
      <p>{expired ? 'สะสมไม่ครบภายในกำหนด จึงไม่สามารถปลดล็อกคอลเลกชันนี้ได้แล้ว' : 'สะสมครบ 180 นาทีภายในกำหนด รับสิทธิ์ใช้ทั้ง 3 ธีมต่อได้ หลังหมดเขตจะไม่เปิดรับผู้ปลดล็อกใหม่'}</p>
      {usage.syncPending && <p role="status">เก็บเวลาไว้ในอุปกรณ์แล้ว กำลังรอบันทึกเข้าบัญชี</p>}
    </div>
    <div className="qa-special-theme-grid">{SPECIAL_THEMES.map(theme => {
      const selected = selectedTheme === theme.id && usage.unlocked && document.documentElement.dataset.qaTheme === theme.id;
      return <article className="qa-special-theme-card" data-qa-special-preview={theme.id} data-selected={selected} key={theme.id}>
        <img src={theme.image} loading="lazy" alt={`บรรยากาศ${theme.thai}`} width="600" height="338" />
        <div><div className="qa-special-theme-card-title"><h4>{theme.label}</h4>{!usage.unlocked && <LockIcon />}</div><span>{theme.thai}</span><p>{theme.description}</p>
          <div className="qa-special-material-sample" aria-hidden="true"><i /><i /><i /><span /></div>
          <div className="qa-special-card-actions"><button type="button" data-qa-custom-theme-card="special-preview" onClick={() => setPreview(theme)}>ดูตัวอย่าง</button><button type="button" data-qa-special-apply={theme.id} disabled={!usage.ready || !usage.unlocked} aria-pressed={selected} onClick={() => { if (usage.ready && usage.unlocked) onSelect(theme.id); }}>{selected ? 'กำลังใช้งาน' : usage.unlocked ? 'ใช้ธีมนี้' : expired ? 'หมดเวลาปลดล็อก' : 'ปลดล็อกที่ 180 นาที'}</button></div>
        </div>
      </article>;
    })}</div>
    {preview && <ThemePreviewDialog theme={preview} onClose={() => setPreview(null)} />}
  </section>;
}
export function SpecialThemeHero({ theme, title, eyebrow, subtitle }: { theme: Theme; title: string; eyebrow: string; subtitle?: string }) {
  return <header data-unified-robinhood-hero-v156="true" className="qa-special-hero">
    <div className="qa-special-hero-brand"><img src="/robinhood-logo.png" alt="Robinhood" width="40" height="40" /><div><strong>Robinhood QA</strong><small>SPECIAL COLLECTION</small></div></div>
    <div className="qa-special-hero-content"><div><small>{eyebrow}</small><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="qa-special-hero-theme"><span>{theme.label}</span><small>{theme.thai}</small></div></div>
  </header>;
}
