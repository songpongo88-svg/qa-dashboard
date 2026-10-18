export const CHARACTER_COLLECTION_VERSION = 2;
export const CHARACTER_THEMES = [
  { id: 'kitty-pink', label: 'Hello Kitty', motif: 'bow', accent: '#b72f66', deep: '#851f49', pale: '#fff2f7', line: '#f2c6d8', ink: '#492438', art: '/characters-v2/kitty-pink.webp', description: 'โบว์ซาติน · จดหมาย สมุดบันทึก และแอปเปิล' },
  { id: 'doraemon-blue', label: 'Doraemon', motif: 'bell', accent: '#0877b8', deep: '#07578c', pale: '#edf8ff', line: '#b9e0f8', ink: '#153e57', art: '/characters-v2/doraemon-blue.webp', description: 'ของวิเศษ · ประตูไปไหนก็ได้ ไทม์แมชชีน และกระเป๋าสี่มิติ' },
  { id: 'honey-bear', label: 'Honey Bear', motif: 'honey', accent: '#9a5e12', deep: '#58381f', pale: '#fff8e9', line: '#ecd5a6', ink: '#503722', art: '/characters-v2/honey-bear.webp', description: 'น้ำผึ้งและไม้ · โถน้ำผึ้ง รังผึ้ง และสมุดบันทึก' },
  { id: 'bunny-melody', label: 'My Melody', motif: 'flower', accent: '#bf3e70', deep: '#8c3155', pale: '#fff3f5', line: '#f0c6d3', ink: '#54313f', art: '/characters-v2/bunny-melody.webp', description: 'ดอกไม้และผ้านุ่ม · จดหมาย สมุดดอกไม้ และตะกร้า' },
  { id: 'froggy-green', label: 'Keroppi', motif: 'leaf', accent: '#20734c', deep: '#165137', pale: '#edf9f0', line: '#bcddc6', ink: '#214936', art: '/characters-v2/froggy-green.webp', description: 'ใบบัวและสายน้ำ · จดหมายใบไม้ สมุดบันทึก และบ่อน้ำ' },
  { id: 'starry-cat', label: 'Kuromi', motif: 'moon', accent: '#7451b5', deep: '#302544', pale: '#f5f1ff', line: '#d7c9ee', ink: '#3e3157', art: '/characters-v2/starry-cat.webp', description: 'พระจันทร์และดาว · สมุดดาว จดหมายกะโหลก และกล่องเอกสาร' },
];
export const characterThemeFor = id => CHARACTER_THEMES.find(theme => theme.id === id) || null;
export const characterVersionFromProfile = profile => profile?.characterCollectionVersion === CHARACTER_COLLECTION_VERSION ? 2 : 1;

const cardMotifs = {
  bow: '<path d="M20 25C3 3 3 47 23 33c8 14 24 0 10-8 14-16-14-24-10-1z"/><circle cx="23" cy="28" r="5"/>',
  bell: '<path d="M14 32v-9a10 10 0 0 1 20 0v9l3 4H11zM20 40h8"/><circle cx="24" cy="27" r="3"/>',
  honey: '<path d="m16 9 9 5v10l-9 5-9-5V14zm18 10 9 5v10l-9 5-9-5V24zM16 29v10l9 5 9-5"/>',
  flower: '<path d="M24 18C7 0 2 22 16 25 0 34 19 47 24 32c11 16 26 0 10-7 17-9-2-27-10-7z"/><circle cx="25" cy="25" r="4"/>',
  leaf: '<path d="M40 8C12 1 0 32 19 39c19 10 28-15 21-31zM15 37l18-22M7 43c10 6 25 6 35-2"/>',
  moon: '<path d="M30 7C4 3 0 39 25 41c9 0 15-6 17-12C23 38 13 16 30 7zM39 6l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>',
};
export function characterThemeVariables(theme) {
  const motif = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g fill="none" stroke="${theme.accent}" stroke-width="1.5" opacity=".09" stroke-linecap="round" stroke-linejoin="round">${cardMotifs[theme.motif]}</g></svg>`;
  const arrow = rotate => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path transform="rotate(${rotate} 12 12)" d="M8 2h8v10h5l-9 10-9-10h5z" fill="${theme.accent}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`)}")`;
  return { '--character-accent': theme.accent, '--character-deep': theme.deep, '--character-pale': theme.pale,
    '--character-line': theme.line, '--character-ink': theme.ink, '--character-art': `url("${theme.art}")`,
    '--character-icon-atlas': `url("/characters-v2/icons/${theme.id}.webp")`,
    '--character-card-motif': `url("data:image/svg+xml,${encodeURIComponent(motif)}")`,
    '--character-download-arrow': arrow(0), '--character-upload-arrow': arrow(180) };
}
