import React, { useEffect, useState } from 'react';
import { weekdayIconAtlas, weekdayIconStyle } from './icons.mjs';

export function WeekdayIcon({ themeId, kind, className = '' }: { themeId: string; kind: string; className?: string }) {
  const atlas = weekdayIconAtlas(themeId);
  const [loaded, setLoaded] = useState('');
  useEffect(() => {
    let mounted = true;
    const image = new window.Image();
    image.onload = () => { if (mounted) setLoaded(atlas); };
    image.src = atlas;
    return () => { mounted = false; image.onload = null; };
  }, [atlas]);
  return <span className={`qa-weekday-icon ${className}`} data-weekday-icon-ready={loaded === atlas ? 'true' : undefined} style={weekdayIconStyle(themeId, kind) as React.CSSProperties} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6" /></svg></span>;
}
