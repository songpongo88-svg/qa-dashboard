const navigation = {
  dashboard: 'overview', 'case-detail': 'view', 'create-evaluation': 'edit', 'qa-access-check': 'security',
  appeal: 'view', 'appeal-requests': 'history', 'appeal-override': 'clock', coaching: 'coaching',
  'pre-test': 'coaching', rubric: 'library', 'training-attendance': 'coaching',
  'presentation-builder': 'library', 'signature-center': 'edit', 'user-guide': 'library', 'process-library': 'library',
  schedule: 'clock', 'call-history': 'people', 'team-chat': 'people', 'task-inbox': 'view',
  'usage-log': 'history', 'reset-password': 'security', 'admin-users': 'people', 'admin-roles': 'security',
  'terms-management': 'save', 'system-setup': 'security', 'change-password': 'security', terms: 'people',
};
export const characterNavigationAction = key => navigation[key] || '';
export function characterActionFor(label = '') {
  const value = label.trim().replace(/^[^\p{L}\p{N}]+/u, '');
  // Danger, status, expansion and rich-text controls retain their meaning.
  if (/^(delete|reject|approve|cancel|close|sign out|logout|ลบ|ปฏิเสธ|อนุมัติ|ยกเลิก|ปิด|ออกจากระบบ|reset (this|all|task))/i.test(value)) return '';
  if (/^(expand|collapse|เปิดเมนู|ย่อเมนู)|^(passed|not passed|pending)\b/i.test(value)) return '';
  if (/search|ค้นหา/i.test(value)) return 'search';
  if (/download|export|ดาวน์โหลด|ส่งออก/i.test(value)) return 'export';
  if (/upload|อัปโหลด|แนบไฟล์/i.test(value)) return 'upload';
  if (/\bview\b|\bdetails?\b|เปิดรายละเอียด|ดูรายละเอียด|ดูเอกสาร/i.test(value)) return 'view';
  if (/refresh|reload|reset|history|activity|ประวัติ|รีเฟรช|ล้างตัวกรอง/i.test(value)) return 'history';
  if (/password|permission|access|roles|รหัสผ่าน|สิทธิ์/i.test(value)) return 'security';
  if (/coaching|training|pre-test|โค้ช|อบรม|แบบทดสอบ/i.test(value)) return 'coaching';
  if (/signature|เซ็น|ลงนาม|evaluate|evaluation|edit|แก้ไข|ประเมิน/i.test(value)) return 'edit';
  if (/save|submit|บันทึก|ส่งผล|ส่งคำขอ/i.test(value)) return 'save';
  if (/appeal|อุทธรณ์|อุธรณ์|review/i.test(value)) return 'history';
  if (/profile|users|team|chat|calls|บุคคล|โปรไฟล์/i.test(value)) return 'people';
  if (/schedule|calendar|เวลา|ตาราง|\bSCH\b/i.test(value)) return 'clock';
  if (/dashboard|summary|analytics|compare|quality|topic performance|ภาพรวม|สรุป|คุณภาพ|คะแนน/i.test(value)) return 'overview';
  if (/process|library|rubric|report|presentation|คู่มือ|คลัง/i.test(value)) return 'library';
  if (/\bcases?\b|เคส/i.test(value)) return 'view';
  if (/theme|ธีม/i.test(value)) return 'theme';
  if (/^(add|new|เพิ่ม|สร้าง)/i.test(value)) return 'edit';
  return '';
}
