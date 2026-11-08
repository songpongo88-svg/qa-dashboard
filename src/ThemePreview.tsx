import React from 'react';
import { resolveThemePreview } from './themePreview.mjs';

export const WEEKDAY_LABELS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
export const FESTIVAL_LABELS: Record<string, string> = {
  'festival-new-year': 'New Year', 'festival-valentine': 'Valentine’s Day',
  'festival-songkran': 'Songkran', 'festival-halloween': 'Halloween',
  'festival-loy-krathong': 'Loy Krathong', 'festival-christmas': 'Christmas',
};
export default function ThemePreview({ themeId, option, characterVersion = 1, lineDrawingVersion = 1 }: {
  themeId: string; option: { id?: string; swatches: readonly string[]; patternImage?: string; sceneImage?: string };
  characterVersion?: number;
  lineDrawingVersion?: number;
}) {
  const preview = resolveThemePreview(themeId, option, { characterVersion, lineDrawingVersion });
  return <span aria-hidden="true" data-theme-preview={themeId} className="qa-active-theme-preview">
    {preview.image ? <span key={`${themeId}:${preview.image}`} style={{ backgroundImage: `url("${preview.image}")`, backgroundSize: 'cover', backgroundPosition: preview.position }} />
      : <span key={`${themeId}:swatches`} className="qa-active-theme-swatches">{preview.swatches.map((color, index) => <i key={`${color}-${index}`} style={{ backgroundColor: color, width: index === 1 ? 10 : 6 }} />)}</span>}
  </span>;
}
