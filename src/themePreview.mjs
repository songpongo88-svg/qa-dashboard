import { weekdayThemeFor } from './weekdayThemes/model.mjs';
import { festivalThemeFor } from './festivalThemes/model.mjs';
import { characterThemeFor } from './characterThemes/model.mjs';
import { specialThemeFor } from './specialThemes/model.mjs';
import { isLineDrawingTheme, lineDrawingThemeForVersion } from './lineDrawing/model.mjs';

// The rendered theme owns its preview. The saved base option can belong to a
// different collection when 7 Days, Weather or a Festival overrides that option.
export function resolveThemePreview(themeId, option, { characterVersion = 1, lineDrawingVersion = 1 } = {}) {
  const line = isLineDrawingTheme(themeId) ? lineDrawingThemeForVersion(lineDrawingVersion) : null;
  const character = characterThemeFor(themeId);
  const weekday = weekdayThemeFor(themeId);
  const festival = festivalThemeFor(themeId);
  const special = specialThemeFor(themeId);
  const ownedOption = option?.id === themeId ? option : null;
  const image = line?.image
    || (character ? characterVersion === 2 ? character.art : `/theme-${character.id}.png` : '')
    || weekday?.image || festival?.image || special?.image
    || ownedOption?.sceneImage || ownedOption?.patternImage || '';
  return {
    image,
    swatches: line?.swatches || ownedOption?.swatches || ['#7027a9', '#4c1d78', '#d946a8'],
    position: weekday || festival ? '70% center' : 'center',
  };
}
