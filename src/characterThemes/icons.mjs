import { characterThemeFor } from './model.mjs';
import { CHARACTER_ATLAS_GEOMETRY } from './iconAtlasGeometry.mjs';

// Real 3D props, four columns by three rows. Each cell keeps the same purpose;
// the sculpted object and material are unique to its character collection.
export const CHARACTER_PROP_SLOTS = ['overview', 'view', 'history', 'library', 'edit', 'coaching', 'search', 'clock', 'people', 'theme', 'save', 'security'];
const aliases = {
  score: 'overview', chart: 'overview', dashboard: 'overview', grade: 'overview', compare: 'overview',
  cases: 'view', document: 'view', appeal: 'history', queue: 'history', target: 'history',
  export: 'library', upload: 'library', presentation: 'library', list: 'library',
  add: 'edit', signature: 'edit', check: 'save', refresh: 'history', reset: 'history',
  users: 'people', chat: 'people', phone: 'people', key: 'security',
};
export function characterPropFor(kind = 'theme') {
  return CHARACTER_PROP_SLOTS.includes(kind) ? kind : aliases[kind] || 'view';
}
export function characterIconAtlas(id) {
  return characterThemeFor(id) ? `/characters-v2/icons/${id}.webp` : '';
}
export function characterIconPosition(kind = 'theme', id) {
  const index = CHARACTER_PROP_SLOTS.indexOf(characterPropFor(kind));
  const frame = CHARACTER_ATLAS_GEOMETRY[id]?.[index];
  if (frame) return `${(frame[0] - frame[2] / 2) / (1536 - frame[2]) * 100}% ${(frame[1] - frame[2] / 2) / (1024 - frame[2]) * 100}%`;
  return `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 50}%`;
}
export function characterIconSize(id, kind = 'theme') {
  const frame = CHARACTER_ATLAS_GEOMETRY[id]?.[CHARACTER_PROP_SLOTS.indexOf(characterPropFor(kind))];
  return frame ? `${1536 / frame[2] * 100}% ${1024 / frame[2] * 100}%` : '400% 300%';
}
export function characterIconStyle(id, kind = 'theme') {
  return { '--character-prop-image': `url("${characterIconAtlas(id)}")`, '--character-prop-position': characterIconPosition(kind, id), '--character-prop-size': characterIconSize(id, kind) };
}
export function characterIconUrl(id, kind = 'theme') {
  const atlas = characterIconAtlas(id);
  return atlas ? `${atlas}#${characterPropFor(kind)}` : '';
}
