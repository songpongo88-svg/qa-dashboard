import React from 'react';
import { WEEKDAY_IDS } from './weekdayCollection.mjs';

export const WEEKDAY_LABELS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
export const FESTIVAL_LABELS: Record<string, string> = {
  'festival-new-year': 'New Year', 'festival-valentine': 'Valentine’s Day',
  'festival-songkran': 'Songkran', 'festival-halloween': 'Halloween',
  'festival-loy-krathong': 'Loy Krathong', 'festival-christmas': 'Christmas',
};
const festivalColors: Record<string, string> = {
  'festival-new-year': '#7c3aed', 'festival-valentine': '#ec4899',
  'festival-songkran': '#0ea5e9', 'festival-halloween': '#f97316',
  'festival-loy-krathong': '#8b5cf6', 'festival-christmas': '#16a34a',
};

export default function ThemePreview({ themeId, option }: {
  themeId: string; option: { swatches: readonly string[]; patternImage?: string };
}) {
  const weekday = WEEKDAY_IDS.indexOf(themeId);
  const festivalColor = festivalColors[themeId];
  return <span aria-hidden="true" data-theme-preview={themeId} className="qa-active-theme-preview">
    {weekday >= 0 ? <span style={{
      backgroundImage: 'url("/weekday-scenes-v3.png")', backgroundSize: 'auto 700%',
      backgroundPosition: `78% ${weekday / 6 * 100}%`,
    }} /> : festivalColor ? <span style={{ background: `linear-gradient(135deg, #fff, ${festivalColor})`, borderLeft: `6px solid ${festivalColor}` }} />
      : option.patternImage ? <span style={{ backgroundImage: `url("${option.patternImage}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: option.swatches[2] }} />
        : <span className="qa-active-theme-swatches">{option.swatches.map((color, index) => <i key={`${color}-${index}`} style={{ backgroundColor: color, width: index === 1 ? 10 : 6 }} />)}</span>}
  </span>;
}
