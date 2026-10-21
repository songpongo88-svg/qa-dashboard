import React from 'react';
import { inkIconUrl } from './icons.mjs';
import { LINE_DRAWING_THEME, LINE_DRAWING_THEME_ID } from './model.mjs';
import type { LineDrawingRelease } from './release';
export function InkIcon({kind,className=''}:{kind:string;className?:string}){return <span aria-hidden="true" className={`qa-ink-icon ${className}`} data-ink-icon={kind} style={{'--ink-icon':inkIconUrl(kind)} as React.CSSProperties}/>;}
export function InkHero({title,eyebrow,subtitle}:{title:string;eyebrow:string;subtitle?:string}){
  return <header data-unified-robinhood-hero-v156="true" className="qa-ink-hero"><div className="qa-ink-hero-brand"><img src="/line-drawing/house.svg" width="62" height="62" alt=""/><div><small>LINE DRAWING COLLECTION</small><strong>Ink &amp; Paper</strong></div></div><div className="qa-ink-hero-copy"><small>{eyebrow}</small><h1>{title}</h1>{subtitle?<p>{subtitle}</p>:null}</div><img className="qa-ink-hero-sun" src="/line-drawing/sun.svg" width="64" height="64" alt=""/></header>;
}
export function LineDrawingCollection({release,selectedTheme,onSelect}:{release:LineDrawingRelease;selectedTheme:string;onSelect:(id:string)=>void}){
  if(!release.allowed)return null;
  return <section data-qa-theme-collection="line-drawing" className="qa-ink-collection">
    <div className="qa-ink-collection-intro"><InkIcon kind="themes"/><div><h3>LINE DRAWING COLLECTION</h3></div></div>
    {release.owner?<div className="qa-ink-release"><div><strong id="qa-ink-release-label">เผยแพร่ธีมให้ทุก Role</strong><p id="qa-ink-release-help">{release.published?'ทุก Role มองเห็นและเลือกใช้ธีมนี้ได้':'เห็นและเลือกใช้ได้เฉพาะบัญชีคุณ'}</p></div><button type="button" role="switch" aria-checked={release.published} aria-labelledby="qa-ink-release-label" aria-describedby="qa-ink-release-help" disabled={!release.ready||release.saving} onClick={()=>void release.setPublished(!release.published)} className="qa-ink-release-switch"><span/>{release.saving?'กำลังบันทึก':release.published?'เปิด':'ปิด'}</button></div>:null}
    {release.owner&&release.error?<p className="qa-ink-release-error" role="alert">{release.error}</p>:null}
    <button type="button" className="qa-ink-theme-card" data-line-drawing-select="true" aria-pressed={selectedTheme===LINE_DRAWING_THEME_ID} onClick={()=>{if(release.allowed)onSelect(LINE_DRAWING_THEME_ID);}}><span className="qa-ink-theme-art" aria-hidden="true"><img src={LINE_DRAWING_THEME.image} alt=""/><span>Ink &amp; Paper</span></span><span className="qa-ink-theme-caption"><strong>Ink &amp; Paper</strong><b>{selectedTheme===LINE_DRAWING_THEME_ID?'✓ กำลังใช้งาน':'เลือกใช้ธีมนี้'}</b></span><InkIcon kind="evaluate"/></button>
  </section>;
}
