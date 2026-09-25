import type { CoachingAttachment } from './monthlyCoachingModel';
export function coachingAttachmentError(file: Pick<File, 'name' | 'size'>) {
  if (!/\.(pdf|docx|xlsx|png|jpe?g)$/i.test(file.name)) return 'รับไฟล์ PDF, DOCX, XLSX, PNG และ JPG';
  if (!file.size || file.size > 3 * 1024 * 1024) return 'กรุณาเลือกไฟล์ขนาดไม่เกิน 3 MB';
  return '';
}
export async function uploadCoachingAttachment(file: File, recordId: string, uploadedBy: string): Promise<CoachingAttachment> {
  const error = coachingAttachmentError(file); if (error) throw new Error(error);
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ')); reader.readAsDataURL(file);
  });
  const response = await fetch('/api/google-drive-upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream', caseId: recordId, dataBase64 }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.webViewLink) throw new Error(data.error || 'อัปโหลดไฟล์ไม่สำเร็จ');
  const url = new URL(data.webViewLink); if (url.protocol !== 'https:') throw new Error('ลิงก์ไฟล์ที่ได้รับไม่ถูกต้อง');
  return { name: file.name, url: url.href, path: String(data.id || url.href), uploadedBy, uploadedAt: new Date().toISOString() };
}
