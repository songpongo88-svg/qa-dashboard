import React, { useEffect, useState } from 'react';
import { CharacterIcon } from '../characterThemes/Character';
import { characterIconAtlas } from '../characterThemes/icons.mjs';
import { FestivalIcon } from '../festivalThemes/Festival';
import { specialIconAtlas, specialIconStyle } from '../specialThemes/icons.mjs';

// Decorative icons keep the existing 36px slot. Labels retain the meaning.
const PROP_SLOTS = ['chart', 'document', 'shield', 'shell', 'wave', 'compass', 'rock', 'ember', 'mountain', 'leaf', 'cloud', 'drop', 'umbrella', 'sun', 'moon', 'star', 'wind', 'heart', 'flower', 'gear'];
export function LoginFeatureIcon({ theme, index }: { theme: { id: string; collection: string; characterVersion?: number; weatherScene?: string }; index: number }) {
  const useProps = ['special', 'weather', 'weekday'].includes(theme.collection);
  const atlas = theme.collection === 'special' ? specialIconAtlas(theme.id) : useProps ? '/login-themes/props.webp' : theme.collection === 'character' && theme.characterVersion === 2 ? characterIconAtlas(theme.id) : '';
  const [loadedAtlas, setLoadedAtlas] = useState('');
  const propsReady = loadedAtlas === atlas;
  useEffect(() => {
    if (!atlas) return;
    let active = true;
    const image = new Image();
    image.onload = () => { if (active) setLoadedAtlas(atlas); };
    image.src = atlas;
    return () => { active = false; image.onload = null; };
  }, [atlas]);
  if (theme.collection === 'character') return theme.characterVersion === 2 && propsReady
    ? <CharacterIcon themeId={theme.id} kind={(theme.id === 'doraemon-blue' ? ['history', 'library', 'view'] : ['overview', 'view', 'library'])[index]} />
    : <>{String(index + 1).padStart(2, '0')}</>;
  if (theme.collection === 'festival') return <FestivalIcon themeId={theme.id} kind={['dashboard', 'evaluate', 'document'][index]} />;
  if (theme.collection === 'special' && propsReady) return <span className="qa-login-prop qa-special-icon" data-special-icon-ready="true" style={specialIconStyle(theme.id, ['dashboard', 'evaluate', 'permissions'][index]) as React.CSSProperties} aria-hidden="true" />;
  const kind = theme.collection === 'special' ? (theme.id === 'special-coastal' ? ['shell', 'wave', 'compass'] : theme.id === 'special-volcanic' ? ['mountain', 'flower', 'cloud'] : ['mountain', 'leaf', 'cloud'])[index]
    : theme.collection === 'weather' ? (/night/.test(theme.weatherScene || '') ? ['moon', 'star', 'cloud'] : /rain|storm/.test(theme.weatherScene || '') ? ['drop', 'umbrella', 'cloud'] : /cloud|fog/.test(theme.weatherScene || '') ? ['cloud', 'wind', 'drop'] : ['sun', 'cloud', 'chart'])[index]
    : theme.collection === 'weekday' ? (index === 0 ? ({ 'weekday-monday': 'sun', 'weekday-tuesday': 'flower', 'weekday-wednesday': 'leaf', 'weekday-thursday': 'leaf', 'weekday-friday': 'drop', 'weekday-saturday': 'flower', 'weekday-sunday': 'heart' }[theme.id] || 'sun') : ['sun', 'chart', 'shield'][index]) : ['chart', 'document', 'shield'][index];
  const paths: Record<string, React.ReactNode> = {
    chart: <><path d="M5 25V16h5v9zm9 0V10h5v15zm9 0V4h5v21z" fill="currentColor" stroke="none" /><path d="M3 28h27" /></>,
    document: <><path d="M8 3h13l5 5v21H8z" /><path d="M20 3v7h6M12 15h10m-10 5h7m-7 4h5" /></>,
    shield: <><path d="m16 2 12 5v8c0 8-12 15-12 15S4 23 4 15V7z" /><path d="m10 16 4 4 8-9" /></>,
    shell: <><path d="M16 28 3 15C-1 2 13 0 16 7c4-7 17-5 13 8z" /><path d="M16 27V8M12 25 7 9m13 16 5-16" /></>,
    wave: <><path d="M3 22c6-2 6-15 15-15 7 0 10 9 3 11 2-9-8-7-7 1 2 5 10 6 16 1-4 10-21 12-27 2z" fill="currentColor" fillOpacity=".35" /><path d="M3 28h27" /></>,
    compass: <><circle cx="16" cy="16" r="13" /><path d="m21 10-3 9-8 3 3-9zM16 3v3m0 20v3M3 16h3m20 0h3" /></>,
    rock: <path d="m7 6 13-3 10 12-7 13-16-2-5-13zm0 0 9 10 4-13m-4 13 7 12M2 13l14 3 14-1" />,
    ember: <path d="M17 2c5 10 10 10 10 18a11 11 0 0 1-22 0c0-5 6-10 6-14 0 0 1 8 5 10 3-5 1-14 1-14z" fill="currentColor" fillOpacity=".35" />,
    mountain: <><path d="m2 27 12-23 7 13 4-8 6 18z" fill="currentColor" fillOpacity=".2" /><path d="m9 14 5 3 4-3M20 18l5 3" /></>,
    leaf: <><path d="M28 3C10 1-1 14 7 24c9 10 25-4 21-21z" fill="currentColor" fillOpacity=".25" /><path d="M4 29 23 9m-11 12-1-8m7 2 6 1" /></>,
    cloud: <path d="M7 25a7 7 0 0 1-1-14 10 10 0 0 1 19-1 8 8 0 0 1 0 15z" fill="currentColor" fillOpacity=".3" />,
    drop: <path d="M16 2C12 9 5 16 5 21a11 11 0 0 0 22 0C27 16 20 9 16 2z" fill="currentColor" fillOpacity=".35" />,
    umbrella: <><path d="M2 18a14 14 0 0 1 28 0c-5-3-7-3-10 0-3-3-5-3-8 0-3-3-6-3-10 0z" fill="currentColor" fillOpacity=".25" /><path d="M16 3v23c0 6 7 5 7 1M16 5c-5 3-6 9-5 13m5-13c5 3 6 9 5 13" /></>,
    sun: <><circle cx="16" cy="16" r="7" fill="currentColor" fillOpacity=".4" /><path d="M16 1v4m0 22v4M1 16h4m22 0h4M5 5l3 3m16 16 3 3M5 27l3-3M24 8l3-3" /></>,
    moon: <path d="M24 23A14 14 0 0 1 12 2a14 14 0 1 0 18 17z" fill="currentColor" fillOpacity=".4" />,
    star: <path d="m16 2 4 9 10 1-8 7 3 11-9-6-9 6 3-11-8-7 10-1z" fill="currentColor" fillOpacity=".4" />,
    wind: <path d="M3 11h19c8 0 7-10 1-8M3 17h24c7 0 5 11-1 8M3 23h11c7 0 6 9 0 7" />,
    heart: <path d="M16 28 4 16C-4 5 10-1 16 8 23-1 37 5 28 16z" fill="currentColor" fillOpacity=".4" />,
    flower: <><path d="M16 10C6-5-3 9 9 16-3 25 10 36 16 23c8 14 21 1 8-7 14-8 0-21-8-6z" fill="currentColor" fillOpacity=".3" /><circle cx="16" cy="16" r="4" /></>,
  };
  const slot = PROP_SLOTS.indexOf(kind);
  return <span className="qa-login-prop" data-login-prop={kind} data-login-prop-ready={useProps && propsReady ? 'true' : undefined} style={useProps && propsReady ? { backgroundImage: 'url("/login-themes/props.webp")', backgroundSize: '500% 400%', backgroundPosition: `${(slot % 5) * 25}% ${Math.floor(slot / 5) * 100 / 3}%` } : undefined} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg></span>;
}
