import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CHARACTER_THEMES, characterThemeFor, characterThemeVariables } from './model.mjs';
import { upgradeCharacterCollection, type CharacterCollectionState } from './account';
import { CharacterHero, CharacterIcon } from './Character';
type Theme = typeof CHARACTER_THEMES[number];
function CharacterSample({ theme }: { theme: Theme }) {
  return <div data-qa-character-preview={theme.id} className="qa-character-ui qa-character-sample" style={characterThemeVariables(theme) as React.CSSProperties}>
    <aside className="qa-character-sample-sidebar"><strong>Robinhood QA</strong>{[['overview', 'QA Dashboard'], ['edit', 'Evaluate'], ['view', 'Case Detail'], ['history', 'Appeal Review'], ['coaching', 'Coaching'], ['edit', 'Signatures'], ['library', 'Process Library']].map(([kind, label], index) => <span key={label} data-selected={index === 0}><CharacterIcon themeId={theme.id} kind={kind} />{label}</span>)}</aside>
    <main><CharacterHero theme={theme} eyebrow="DESIGN PREVIEW" title="QA Dashboard" subtitle="ภาพตัวอย่าง UI · ไม่มีข้อมูลเคสจริง" />
      <div className="qa-character-sample-content">
        <div className="qa-character-sample-filters"><span>Month</span><span>All Teams</span><span>All Agents</span></div>
        <div className="qa-character-sample-metrics">{[['Average QA', 'score', ''], ['Reviewed', 'cases', ''], ['Passed', 'save', 'passed'], ['Not Passed', 'appeal', 'failed']].map(([label, kind, status]) => <section key={label} className="qa-character-card" data-status={status}><span>{label}</span><CharacterIcon themeId={theme.id} kind={kind} /><strong>—</strong></section>)}</div>
        <section className="qa-character-card qa-character-sample-chart"><h3>Quality Score Trend</h3><div aria-hidden="true">{[40, 65, 48, 78, 58, 88, 72].map((height, i) => <i key={i} style={{ height: height + '%' }} />)}</div><small>พื้นที่แสดงกราฟตัวอย่าง</small></section>
        <section className="qa-character-card qa-character-sample-table"><h3>Recent Cases</h3><div><table><thead><tr>{['Case ID', 'Agent', 'Score', 'KPI Status'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{[0, 1].map(row => <tr key={row}><td>—</td><td>—</td><td>—</td><td>—</td></tr>)}</tbody></table></div></section>
        <div className="qa-character-sample-actions">{[['view', 'เปิดรายละเอียด'], ['history', 'ประวัติ'], ['export', 'ดาวน์โหลด PDF']].map(([kind, label]) => <span key={kind} className="qa-character-primary"><CharacterIcon themeId={theme.id} kind={kind} />{label}</span>)}</div>
      </div>
    </main>
  </div>;
}
function CharacterPreview({ initialTheme, onClose }: { initialTheme: Theme; onClose: () => void }) {
  const [theme, setTheme] = useState(initialTheme);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { if (element?.open) element.close(); }; }, []);
  const close = () => { dialog.current?.close(); onClose(); };
  return <dialog ref={dialog} className="qa-character-preview-dialog" aria-labelledby="qa-character-preview-title"
    onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
    onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
      if (event.currentTarget !== event.target) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }}>
    <header><div><strong id="qa-character-preview-title">Character Collection V2 · ดูตัวอย่าง</strong></div><button type="button" onClick={close} autoFocus aria-label="ปิดตัวอย่าง Character V2">ปิดตัวอย่าง</button></header>
    <nav aria-label="เลือกธีมสำหรับดูตัวอย่าง">{CHARACTER_THEMES.map(item => <button key={item.id} type="button" aria-pressed={item.id === theme.id} onClick={() => setTheme(item)}>{item.label}</button>)}</nav>
    <CharacterSample theme={theme} />
  </dialog>;
}
export function CharacterCollection({ version, selectedTheme, onSelect }: { version: CharacterCollectionState; selectedTheme: string; onSelect: (id: string) => void }) {
  const [preview, setPreview] = useState<Theme | null>(null);
  return <section data-qa-theme-collection="character" className="qa-character-collection" data-character-collection-version={version.version}>
    <div className="qa-character-update-panel">
      <div><span className="qa-character-update-eyebrow">CHARACTER COLLECTION · V2</span><h3>{version.version === 2 ? 'คาแรกเตอร์ 3D สำหรับพื้นที่ทำงานของคุณ' : 'ดีไซน์ 3D พร้อมให้อัปเดตเมื่อคุณพร้อม'}</h3><span className="qa-character-version-status" role="status">{!version.ready ? 'กำลังตรวจเวอร์ชันของบัญชี' : `กำลังใช้งาน V${version.version}`}</span></div>
      <div className="qa-character-update-actions"><button type="button" onClick={() => setPreview(characterThemeFor(selectedTheme) || CHARACTER_THEMES[0])}>ดูตัวอย่าง V2</button>{version.version === 1 ? <button type="button" disabled={!version.ready || version.saving} onClick={() => { void upgradeCharacterCollection(); }}>{version.saving ? 'กำลังบันทึก…' : 'อัปเดต Collection'}</button> : <span className="qa-character-update-complete">อัปเดตแล้ว ✓</span>}<small>อัปเดตเฉพาะบัญชีของคุณ</small></div>
      {version.error ? <p className="qa-character-update-error" role="alert">{version.error}</p> : null}
    </div>
    {version.version === 2 ? <div className="qa-character-v2-grid">{CHARACTER_THEMES.map(theme => <article key={theme.id} data-character-card={theme.id} data-selected={selectedTheme === theme.id} style={characterThemeVariables(theme) as React.CSSProperties}>
      <div className="qa-character-v2-card-art"><img src={theme.art} width="1536" height="1024" alt={`${theme.label} 3D สามท่าทาง`} loading="lazy" /></div>
      <div className="qa-character-v2-card-content"><h4><CharacterIcon themeId={theme.id} kind="theme" />{theme.label}<small>V2</small></h4><p>{theme.description}</p><div className="qa-character-card-actions"><button type="button" onClick={() => setPreview(theme)}>ดูตัวอย่าง</button><button type="button" aria-pressed={selectedTheme === theme.id} onClick={() => onSelect(theme.id)}>{selectedTheme === theme.id ? 'กำลังใช้งาน ✓' : 'ใช้ธีมนี้'}</button></div></div>
    </article>)}</div> : null}
    {preview ? createPortal(<CharacterPreview initialTheme={preview} onClose={() => setPreview(null)} />, document.body) : null}
  </section>;
}
