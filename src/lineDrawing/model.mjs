export const LINE_DRAWING_THEME_ID = 'line-drawing-ink-paper';
export const LINE_DRAWING_COLLECTION = 'line-drawing';
export const LINE_DRAWING_OWNER = 'songpon';
export const LINE_DRAWING_COLLECTION_VERSION = 2;
export const LINE_DRAWING_THEME = Object.freeze({
  id: LINE_DRAWING_THEME_ID, label: 'Ink & Paper', collection: LINE_DRAWING_COLLECTION,
  swatches: ['#202b55', '#111a3a', '#f7f3e9'],
  image: '/line-drawing/scene.svg',
  description: 'ลายปากกาบนกระดาษ',
});
export const LINE_DRAWING_COLOUR_THEME = Object.freeze({
  ...LINE_DRAWING_THEME,
  label: 'Ink & Paper 2.0',
  swatches: ['#315de9', '#24345b', '#f8faff'],
  image: '/line-drawing/colour-scene.svg',
  description: 'ลายเส้นคมชัด พร้อมสีฟ้า มินต์ เหลือง และพีช',
});
export const lineDrawingVersionFromProfile = profile => profile?.lineDrawingCollectionVersion === LINE_DRAWING_COLLECTION_VERSION ? 2 : 1;
export const lineDrawingThemeForVersion = version => version === 2 ? LINE_DRAWING_COLOUR_THEME : LINE_DRAWING_THEME;
export const isLineDrawingTheme = value => value === LINE_DRAWING_THEME_ID;
export const isLineDrawingOwner = value => typeof value === 'string' && value.trim().toLowerCase() === LINE_DRAWING_OWNER;
// Missing documents, cached flags and truthy strings never publish a collection.
export function normalizeLineDrawingRelease(value) {
  return { published: value?.published === true, updatedBy: typeof value?.updatedBy === 'string' ? value.updatedBy : '' };
}
export function canUseLineDrawing(username, release) {
  return Boolean(username) && (isLineDrawingOwner(username) || (release?.ready === true && release?.published === true));
}
