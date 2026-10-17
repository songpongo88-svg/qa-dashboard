import React from 'react';
import { CHARACTER_THEMES } from './model.mjs';
import { characterIconUrl } from './icons.mjs';
import './character.css';

type Theme = typeof CHARACTER_THEMES[number];
export function CharacterIcon({ themeId, kind, className = '' }: { themeId: string; kind: string; className?: string }) {
  return <img className={`qa-character-icon ${className}`} src={characterIconUrl(themeId, kind)} width="28" height="28" alt="" aria-hidden="true" />;
}
export function CharacterHero({ theme, title, eyebrow, subtitle }: { theme: Theme; title: string; eyebrow: string; subtitle?: string }) {
  return <header data-unified-robinhood-hero-v156="true" data-character-hero={theme.id} className="qa-character-hero">
    <div className="qa-character-hero-copy">
      <div className="qa-character-hero-brand"><img src="/robinhood-logo.png" alt="Robinhood" width="34" height="34" /><span>Robinhood QA <small>CHARACTER COLLECTION · V2</small></span></div>
      <span className="qa-character-eyebrow">{eyebrow}</span><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}
      <span className="qa-character-theme-name"><CharacterIcon themeId={theme.id} kind="theme" />{theme.label}</span>
    </div>
    <img className="qa-character-hero-art" src={theme.art} alt="" aria-hidden="true" width="1536" height="1024" decoding="async" />
  </header>;
}
