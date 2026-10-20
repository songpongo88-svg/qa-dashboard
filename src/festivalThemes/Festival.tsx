import React from 'react';
import { useFestivalTheme } from './store';
import { festivalIconUrl } from './icons.mjs';
import { useCharacterTheme } from '../characterThemes/store';
import { CharacterIcon } from '../characterThemes/Character';
import { useSpecialTheme } from '../specialThemes/state';
import { SpecialIcon } from '../specialThemes/SpecialIcon';
import { useWeekdayScene } from '../WeekdayScene';
import { WeekdayIcon } from '../weekdayThemes/WeekdayIcon';

export function FestivalIcon({ themeId, kind, className = '' }: { themeId: string; kind: string; className?: string }) {
  return <img data-festival-icon={kind} src={festivalIconUrl(themeId, kind)} alt="" aria-hidden="true" width="24" height="24" className={`qa-festival-icon ${className}`} />;
}
export function FestivalMetricIcon({ kind, fallback }: { kind: string; fallback: React.ReactNode }) {
  const theme = useFestivalTheme();
  const character = useCharacterTheme();
  const special = useSpecialTheme();
  const weekday = useWeekdayScene();
  const meaning = /quality|score/i.test(kind) ? 'score' : /kpi/i.test(kind) ? 'kpi' : /cases/i.test(kind) ? 'cases' : /appeal/i.test(kind) ? 'appealResult' : 'grade';
  if (character) return <CharacterIcon themeId={character.id} kind={meaning === 'appealResult' ? 'appeal' : meaning === 'kpi' ? 'grade' : meaning} />;
  if (special && !theme) return <SpecialIcon themeId={special.id} kind={meaning === 'score' ? 'dashboard' : meaning === 'kpi' ? 'pre-test' : meaning === 'cases' ? 'evaluate' : meaning === 'appealResult' ? 'appeal-review' : 'rubrics'} />;
  if (weekday && !theme) return <WeekdayIcon themeId={weekday.id} kind={meaning} />;
  return theme ? <FestivalIcon themeId={theme.id} kind={meaning} /> : <>{fallback}</>;
}
export function FestivalHero({ theme, title, eyebrow, subtitle }: {
  theme: NonNullable<ReturnType<typeof useFestivalTheme>>; title: string; eyebrow: string; subtitle?: string;
}) {
  return <header data-unified-robinhood-hero-v156="true" data-festival-hero={theme.id} className="qa-festival-hero">
    <div className="qa-festival-hero-brand"><img src="/robinhood-logo.png" alt="Robinhood" width="40" height="40" /><div><strong>Robinhood QA</strong><small>FESTIVAL COLLECTION</small></div></div>
    <div className="qa-festival-hero-content"><div><small>{eyebrow}</small><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div><div className="qa-festival-hero-badge"><FestivalIcon themeId={theme.id} kind="dashboard" /><div><strong>{theme.label}</strong><small>{theme.thai}</small></div></div></div>
  </header>;
}
