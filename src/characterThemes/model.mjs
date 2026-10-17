export const CHARACTER_COLLECTION_VERSION = 2;
export const CHARACTER_THEMES = [
  { id: 'kitty-pink', label: 'Hello Kitty', motif: 'bow', accent: '#b72f66', deep: '#851f49', pale: '#fff2f7', line: '#f2c6d8', ink: '#492438', art: '/characters-v2/kitty-pink.webp', description: 'โบว์ซาติน · ทักทาย จดบันทึก และขี้เล่น' },
  { id: 'doraemon-blue', label: 'Doraemon', motif: 'bell', accent: '#0877b8', deep: '#07578c', pale: '#edf8ff', line: '#b9e0f8', ink: '#153e57', art: '/characters-v2/doraemon-blue.webp', description: 'กระดิ่งและกระเป๋า · สดใส ตั้งใจทำงาน และดีใจ' },
  { id: 'honey-bear', label: 'Honey Bear', motif: 'honey', accent: '#9a5e12', deep: '#58381f', pale: '#fff8e9', line: '#ecd5a6', ink: '#503722', art: '/characters-v2/honey-bear.webp', description: 'ขนนุ่มและน้ำผึ้ง · อบอุ่น จดบันทึก และร่าเริง' },
  { id: 'bunny-melody', label: 'My Melody', motif: 'flower', accent: '#bf3e70', deep: '#8c3155', pale: '#fff3f5', line: '#f0c6d3', ink: '#54313f', art: '/characters-v2/bunny-melody.webp', description: 'ดอกไม้และหมวกผ้านุ่ม · อ่อนโยน ตั้งใจ และขี้เล่น' },
  { id: 'froggy-green', label: 'Keroppi', motif: 'leaf', accent: '#20734c', deep: '#165137', pale: '#edf9f0', line: '#bcddc6', ink: '#214936', art: '/characters-v2/froggy-green.webp', description: 'ใบบัวและสายน้ำ · ทักทาย จดบันทึก และกระโดดดีใจ' },
  { id: 'starry-cat', label: 'Kuromi', motif: 'moon', accent: '#7451b5', deep: '#302544', pale: '#f5f1ff', line: '#d7c9ee', ink: '#3e3157', art: '/characters-v2/starry-cat.webp', description: 'พระจันทร์และดาว · เจ้าเล่ห์ ตั้งใจ และอารมณ์ดี' },
];
export const characterThemeFor = id => CHARACTER_THEMES.find(theme => theme.id === id) || null;
export const characterVersionFromProfile = profile => profile?.characterCollectionVersion === CHARACTER_COLLECTION_VERSION ? 2 : 1;

export function characterThemeVariables(theme) {
  return { '--character-accent': theme.accent, '--character-deep': theme.deep, '--character-pale': theme.pale,
    '--character-line': theme.line, '--character-ink': theme.ink, '--character-art': `url("${theme.art}")` };
}
