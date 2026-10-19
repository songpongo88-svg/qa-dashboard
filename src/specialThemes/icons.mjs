import { specialThemeFor } from './model.mjs';
import { SPECIAL_ATLAS_SIZE, SPECIAL_ICON_FRAMES } from './iconGeometry.mjs';

// The approved 32 action sprites occupy a six-by-six transparent atlas.
export const SPECIAL_ICON_KINDS = ['dashboard', 'evaluate', 'appeal-cases', 'appeal-review', 'late-appeal', 'coaching', 'pre-test', 'rubrics', 'training', 'slides', 'signatures', 'guide', 'schedule', 'calls', 'chat', 'inbox', 'login-log', 'password-reset', 'users', 'permissions', 'terms', 'settings', 'password', 'logout', 'profile', 'search', 'preview', 'save', 'export', 'upload', 'edit', 'delete'];
const aliases = { chart: 'dashboard', overview: 'dashboard', score: 'dashboard', compare: 'dashboard', cases: 'appeal-cases', document: 'appeal-cases', view: 'preview', image: 'preview', pdf: 'export', download: 'export', library: 'guide', process: 'slides', check: 'pre-test', signature: 'signatures', grade: 'rubrics', clock: 'schedule', people: 'users', theme: 'dashboard' };
export const specialIconKind = kind => SPECIAL_ICON_KINDS.includes(kind) ? kind : aliases[kind] || 'dashboard';
export function specialIconAtlas(themeId) {
  if (!specialThemeFor(themeId)) return '';
  const name = { 'special-coastal': 'coastal', 'special-volcanic': 'fuji', 'special-misty': 'misty' }[themeId];
  return `/special-themes/icons/${name}.webp`;
}
export function specialIconPosition(kind, themeId) {
  const index = SPECIAL_ICON_KINDS.indexOf(specialIconKind(kind));
  const frame = SPECIAL_ICON_FRAMES[themeId]?.[index];
  if (frame) return `${(frame[0] - frame[2] / 2) / (SPECIAL_ATLAS_SIZE - frame[2]) * 100}% ${(frame[1] - frame[2] / 2) / (SPECIAL_ATLAS_SIZE - frame[2]) * 100}%`;
  return `${index % 6 * 20}% ${Math.floor(index / 6) * 20}%`;
}
export function specialIconSize(kind, themeId) {
  const frame = SPECIAL_ICON_FRAMES[themeId]?.[SPECIAL_ICON_KINDS.indexOf(specialIconKind(kind))];
  return frame ? `${SPECIAL_ATLAS_SIZE / frame[2] * 100}% ${SPECIAL_ATLAS_SIZE / frame[2] * 100}%` : '600% 600%';
}
export function specialIconStyle(themeId, kind) {
  return { '--special-icon-atlas': `url("${specialIconAtlas(themeId)}")`, '--special-control-position': specialIconPosition(kind, themeId), '--special-control-size': specialIconSize(kind, themeId) };
}
const navigation = { dashboard: 'dashboard', 'case-detail': 'appeal-cases', 'create-evaluation': 'evaluate', appeal: 'appeal-cases', 'appeal-requests': 'appeal-review', 'appeal-override': 'late-appeal', coaching: 'coaching', 'pre-test': 'pre-test', rubric: 'rubrics', 'training-attendance': 'training', 'presentation-builder': 'slides', 'signature-center': 'signatures', 'user-guide': 'guide', 'process-library': 'slides', schedule: 'schedule', 'call-history': 'calls', 'team-chat': 'chat', 'task-inbox': 'inbox', 'usage-log': 'login-log', 'reset-password': 'password-reset', 'admin-users': 'users', 'admin-roles': 'permissions', 'terms-management': 'terms', 'system-setup': 'settings', 'change-password': 'password', logout: 'logout', profile: 'profile', 'qa-access-check': 'permissions' };
export const specialNavigationIcon = key => String(key || '').startsWith('case:') ? 'appeal-cases' : navigation[key] || '';
export function specialHeadingIcon(label = '') {
  const text = label.trim();
  // Only known UI headings: never decorate case text, agent names or comments.
  if (!/^(?:qa dashboard|performance (?:overview|summary|& topic detail)|quality score(?: trend)?|topic performance|monthly grade & incentive criteria|grade distribution|topic detail|case description|process ที่ใช้เทียบ|case information|case detail|information|evaluation|evidence attachment|appeal review|coaching|signatures?|signature center|profile|user guide|รายละเอียดผลการประเมินและหัวข้อ|รายละเอียดตามหัวข้อ)(?:\s*\([^)]*\))?$/i.test(text)) return '';
  return specialActionFor(text);
}
export function specialActionFor(label = '') {
  const text = label.trim().replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
  // Preserve dangerous actions, status badges and structural controls.
  if (/^(delete|reject|approve|cancel|close|ลบ|ปฏิเสธ|อนุมัติ|ยกเลิก|ปิด|reset (this|all|task)|passed|not passed|pending|expand|collapse)\b/u.test(text) || /^(ลบ|ปฏิเสธ|อนุมัติ|ยกเลิก|ปิด|เปิดเมนู|ย่อเมนู)/u.test(text)) return '';
  if (/password reset|reset password|รีเซ็ตรหัส/.test(text)) return 'password-reset';
  if (/roles|permissions|access|สิทธิ์/.test(text)) return 'permissions';
  if (/password|รหัสผ่าน/.test(text)) return 'password';
  if (/sign out|logout|ออกจากระบบ/.test(text)) return 'logout';
  if (/search|ค้นหา/.test(text)) return 'search';
  if (/export|download|\bpdf\b|ดาวน์โหลด|ส่งออก/.test(text)) return 'export';
  if (/upload|อัปโหลด|แนบไฟล์/.test(text)) return 'upload';
  if (/preview|view image|ดูภาพ|ดูสไลด์|ดูตัวอย่าง/.test(text)) return 'preview';
  if (/signatures?|ลงนาม|เซ็น/.test(text)) return 'signatures';
  if (/late appeal|อุทธรณ์หลัง|อุธรณ์หลัง/.test(text)) return 'late-appeal';
  if (/appeal review|review summary|ผลพิจารณา/.test(text)) return 'appeal-review';
  if (/appeal|อุทธรณ์|อุธรณ์/.test(text)) return 'appeal-cases';
  if (/coaching|โค้ช/.test(text)) return 'coaching';
  if (/pre-test|แบบทดสอบ/.test(text)) return 'pre-test';
  if (/training|อบรม/.test(text)) return 'training';
  if (/rubric|topic detail|เกณฑ์|รายหัวข้อ|grade/.test(text)) return 'rubrics';
  if (/kpi status/.test(text)) return 'pre-test';
  if (/process|qa slides|presentation|สไลด์/.test(text)) return 'slides';
  if (/guide|คู่มือ/.test(text)) return 'guide';
  if (/case description|รายละเอียดเคส/.test(text)) return 'edit';
  if (/evaluate|evaluation|ประเมิน/.test(text)) return 'evaluate';
  if (/save|submit|บันทึก|ส่งผล|ส่งคำขอ/.test(text)) return 'save';
  if (/edit|แก้ไข/.test(text)) return 'edit';
  if (/profile|โปรไฟล์/.test(text)) return 'profile';
  if (/users|agents|team|บุคคล/.test(text)) return 'users';
  if (/inbox|กล่องงาน/.test(text)) return 'inbox';
  if (/login log|history|ประวัติ/.test(text)) return 'login-log';
  if (/schedule|calendar|\bsch\b|ตารางงาน/.test(text)) return 'schedule';
  if (/calls|โทร/.test(text)) return 'calls';
  if (/chat|สนทนา/.test(text)) return 'chat';
  if (/reset|refresh|reload|รีเฟรช|ล้างตัวกรอง/.test(text)) return 'late-appeal';
  if (/dashboard|performance|quality|compare|trend|คะแนน|ภาพรวม|เปรียบเทียบ/.test(text)) return 'dashboard';
  if (/case|information|รายละเอียด|ข้อมูลเคส/.test(text)) return 'appeal-cases';
  return '';
}
