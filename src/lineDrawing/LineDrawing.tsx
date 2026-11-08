import React from 'react';
import { inkIconUrl } from './icons.mjs';
import { LINE_DRAWING_THEME_ID, lineDrawingThemeForVersion } from './model.mjs';
import type { LineDrawingRelease } from './release';
import type { LineDrawingCollectionState } from './account';
export function InkIcon({kind,className=''}:{kind:string;className?:string}){return <span aria-hidden="true" className={`qa-ink-icon ${className}`} data-ink-icon={kind} style={{'--ink-icon':inkIconUrl(kind)} as React.CSSProperties}/>;}
export function InkHero({title,eyebrow,subtitle,version=1}:{title:string;eyebrow:string;subtitle?:string;version?:1|2}){
  if(version===2)return <header data-unified-robinhood-hero-v156="true" data-ink-hero-version="2" className="qa-ink-hero qa-ink-colour-hero"><div className="qa-ink-colour-hero-copy"><div className="qa-ink-colour-brand"><img src="/line-drawing/colour-mark.svg" width="40" height="40" alt=""/><div><small>LINE DRAWING COLLECTION</small><strong>Ink &amp; Paper <span>2.0</span></strong></div></div><div className="qa-ink-hero-copy"><small>{eyebrow}</small><h1>{title}</h1>{subtitle?<p>{subtitle}</p>:null}</div></div><img className="qa-ink-colour-scene" src="/line-drawing/colour-scene.svg" width="250" height="152" alt=""/></header>;
  return <header data-unified-robinhood-hero-v156="true" className="qa-ink-hero"><div className="qa-ink-hero-brand"><img src="/line-drawing/house.svg" width="62" height="62" alt=""/><div><small>LINE DRAWING COLLECTION</small><strong>Ink &amp; Paper</strong></div></div><div className="qa-ink-hero-copy"><small>{eyebrow}</small><h1>{title}</h1>{subtitle?<p>{subtitle}</p>:null}</div><img className="qa-ink-hero-sun" src="/line-drawing/sun.svg" width="64" height="64" alt=""/></header>;
}
export function LineDrawingCollection({release,selectedTheme,onSelect,version,onUpgrade}:{release:LineDrawingRelease;selectedTheme:string;onSelect:(id:string)=>void;version?:LineDrawingCollectionState;onUpgrade?:()=>Promise<boolean>}){
  if(!release.allowed)return null;
  const edition=version?.version===2?2:1;
  const theme=lineDrawingThemeForVersion(edition);
  return <section data-qa-theme-collection="line-drawing" className="qa-ink-collection" data-line-drawing-collection-version={edition}>
    <div className="qa-ink-collection-intro"><InkIcon kind="themes"/><div><h3>LINE DRAWING COLLECTION</h3></div></div>
    {release.owner?<div className="qa-ink-release"><div><strong id="qa-ink-release-label">เผยแพร่ธีมให้ทุก Role</strong><p id="qa-ink-release-help">{release.published?'ทุก Role มองเห็นและเลือกใช้ธีมนี้ได้':'เห็นและเลือกใช้ได้เฉพาะบัญชีคุณ'}</p></div><button type="button" role="switch" aria-checked={release.published} aria-labelledby="qa-ink-release-label" aria-describedby="qa-ink-release-help" disabled={!release.ready||release.saving} onClick={()=>void release.setPublished(!release.published)} className="qa-ink-release-switch"><span/>{release.saving?'กำลังบันทึก':release.published?'เปิด':'ปิด'}</button></div>:null}
    {release.owner&&release.error?<p className="qa-ink-release-error" role="alert">{release.error}</p>:null}
    <div className="qa-ink-colour-update">
      <div className="qa-ink-colour-update-art"><div><small>THE COLOUR EDITION</small><h4>Ink &amp; Paper <span>2.0</span></h4><p>เส้นสายเรียบง่าย สีสันที่พอดี</p></div><img src="/line-drawing/colour-scene.svg" width="180" height="110" alt=""/></div>
      <div className="qa-ink-colour-update-body"><h4>เติมสีให้วันทำงานของคุณ</h4><p>พื้นหลังสว่างขึ้น ลายเส้นคมชัด พร้อมสีฟ้า มินต์ เหลือง และพีช<br/>การ์ด ปุ่ม แท็บ และหน้า Login ในบรรยากาศใหม่</p>
        <div className="qa-ink-colour-update-actions">{edition===1?<button type="button" data-line-drawing-upgrade disabled={!version?.ready||version.saving||!onUpgrade} onClick={async()=>{if(!release.allowed||!onUpgrade)return;if(await onUpgrade())onSelect(LINE_DRAWING_THEME_ID);}}>{version?.saving?'กำลังบันทึก…':'อัปเดตและใช้ธีมใหม่'}</button>:<span role="status" className="qa-ink-colour-updated">อัปเดตเป็นเวอร์ชัน 2.0 แล้ว ✓</span>}<span>{!version?.ready?'กำลังตรวจเวอร์ชันของบัญชี':edition===1?'เริ่มใช้เวอร์ชันใหม่เมื่อคุณกดอัปเดต':'อัปเดตเฉพาะบัญชีของคุณ'}</span></div>
        {version?.error?<p className="qa-ink-release-error" role="alert">{version.error}</p>:null}
      </div>
    </div>
    <button type="button" className="qa-ink-theme-card" data-line-drawing-select="true" aria-pressed={selectedTheme===LINE_DRAWING_THEME_ID} onClick={()=>{if(release.allowed)onSelect(LINE_DRAWING_THEME_ID);}}><span className="qa-ink-theme-art" aria-hidden="true"><img src={theme.image} alt=""/><span>{theme.label}</span></span><span className="qa-ink-theme-caption"><strong>{theme.label}</strong><b>{selectedTheme===LINE_DRAWING_THEME_ID?'✓ กำลังใช้งาน':'เลือกใช้ธีมนี้'}</b>{edition===1?<span>เวอร์ชันเดิม · ใช้งานต่อได้จนกว่าจะอัปเดต</span>:null}</span><InkIcon kind="evaluate"/></button>
  </section>;
}
