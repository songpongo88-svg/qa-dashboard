import { jsPDF } from 'jspdf';
import { registerTHSarabunNew } from './THSarabunNew-jsPDF';
import { PDF_LOGO } from './pdfLogo';
import { formatPdfDate, formatPdfDateTime } from './lib/pdfDates';
import type { StoredCoachingRecord } from './coachingStore';
import type { StoredEvaluation } from './evaluationStore';
import { belongsToAgent, coachingDeadline, coachingMonthLabel, coachingStatusLabel, manualCoachingSummary, type CoachingAccount } from './monthlyCoachingModel';

export function monthlyCoachingPdfFileName(month: string, username: string) {
  return `Coaching_${month}_${username.replace(/[^a-zA-Z0-9ก-๙._-]+/g, '_')}.pdf`;
}

export function renderMonthlyCoachingPdf(record: StoredCoachingRecord, account: CoachingAccount, rows: StoredEvaluation[]) {
  if (!belongsToAgent(account, record.agentId, record.agent)) throw new Error('Coaching PDF ไม่ตรงกับ Admin ที่เลือก');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  registerTHSarabunNew(pdf);
  const left = 16, width = 178, bottom = 278, lineHeight = 5;
  const name = account.displayName || account.agentName || account.username;
  let y = 0, currentSection = '';
  const font = (size = 15, bold = false) => {
    pdf.setFont('THSarabunNew', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);pdf.setTextColor(32, 42, 55);
  };
  const clean = (value: unknown) => String(value ?? '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]*>/g, '').replace(/\r\n?/g, '\n').trim();
  const header = () => {
    pdf.addImage(PDF_LOGO, 'PNG', left, 10, 12, 12, 'coaching-logo', 'FAST');
    font(23, true);pdf.text('Monthly Coaching', 33, 16);
    font(14);const subtitle = pdf.splitTextToSize(`${name} | ${coachingMonthLabel(record.monthKey)}`, 160) as string[];
    pdf.text(subtitle, 33, 24, { lineHeightFactor: 1.1 });
    y = 28 + subtitle.length * 5;
    pdf.setDrawColor(205, 189, 225);pdf.line(left, y, left + width, y);y += 8;
  };
  const sectionBand = (title: string) => {
    pdf.setFillColor(246, 239, 253);pdf.roundedRect(left, y, width, 8, 1.5, 1.5, 'F');
    font(16, true);pdf.setTextColor(102, 56, 149);pdf.text(title, left + 3, y + 5.5);y += 12;
  };
  const newPage = () => {
    pdf.addPage();header();
    if (currentSection) sectionBand(`${currentSection} (ต่อ)`);
  };
  const ensure = (height: number) => { if (y + height > bottom) newPage(); };
  const section = (title: string) => {
    currentSection = '';ensure(20);currentSection = title;sectionBand(title);
  };
  const field = (label: string, value: unknown) => {
    ensure(14);font(14, true);
    const labels = pdf.splitTextToSize(label, width) as string[];
    for (const line of labels) { ensure(lineHeight);font(14, true);pdf.text(line, left, y);y += lineHeight; }
    y += 1;
    const text = clean(value) || 'ยังไม่บันทึก';
    for (const paragraph of text.split('\n')) {
      font();const lines = paragraph ? pdf.splitTextToSize(paragraph, width) as string[] : [''];
      for (const line of lines) { ensure(lineHeight);font();if (line) pdf.text(line, left, y);y += lineHeight; }
    }
    y += 3;
  };
  header();
  section('ข้อมูล Admin และสถานะ Coaching');
  field('Admin', `${name} (${account.username})`);
  field('ทีม / ผู้ Coaching', `${record.team || account.teamName || '-'} / ${record.coachName || record.coachedBy || record.seniorName || '-'}`);
  field('สถานะ', coachingStatusLabel(record.status));
  const score = rows.length ? rows.reduce((sum, row) => sum + Number(row.finalScore || 0), 0) / rows.length : record.averageScore;
  field('ผลประเมินล่าสุด', `คะแนน ${score.toFixed(2)}% | ${rows.length || record.evaluatedCases} เคส | Critical Error ${rows.filter(row => row.criticalError).length} เคส`);
  if (record.monthKey >= '2026-09') field('กำหนดรอบนี้', `ผล Coaching, Action Plan และ QA Review ครบภายใน ${formatPdfDate(coachingDeadline(record.monthKey))} เวลา 23:59 น. (เวลาไทย)`);
  section('QA สรุปและแนะนำหัวข้อการ Coaching');
  field('สรุปจาก QA', manualCoachingSummary(record));
  field('หัวข้อที่แนะนำ', record.recommendedTopics?.map(topic => `- ${topic}`).join('\n'));
  section('นัดหมาย Coaching');
  const meeting = record.appointment;
  field('วันที่ / เวลา / ช่องทาง', meeting ? `${formatPdfDate(meeting.date)} | ${meeting.startTime || '-'} (${meeting.duration} นาที) | ${meeting.method === 'Other' ? meeting.other : meeting.method}` : 'ยังไม่มีข้อมูลนัดหมาย');
  field('ผู้เข้าร่วม', meeting?.participants?.join(', '));
  if (meeting?.agenda?.some(clean)) field('Agenda / แพลนที่จะคุย', meeting.agenda.filter(clean).map((text, index) => `${index + 1}. ${text}`).join('\n'));
  if (meeting?.note) field('หมายเหตุนัดหมาย', meeting.note);
  section('ผล Coaching และ Action Plan โดยผู้ Coaching');
  const actual = record.actualCoaching;
  field('วันที่ / เวลา Coaching จริง', actual?.date ? `${formatPdfDate(actual.date)} | ${actual.startTime || '-'} - ${actual.endTime || '-'}` : record.coachingDate ? formatPdfDate(record.coachingDate) : 'ยังรอผู้ Coaching บันทึกผล');
  if (actual?.topics?.length) field('หัวข้อที่คุยจริง', actual.topics.map(topic => `- ${topic}`).join('\n'));
  if (actual?.note) field('Coaching Note', actual.note);
  field('Final Coaching Note', actual?.finalNote || record.additionalNote);
  const actionLabels: Record<string, string> = { 'Not Started': 'ยังไม่เริ่ม', 'In Progress': 'กำลังดำเนินการ', Completed: 'เสร็จแล้ว', 'Not Achieved': 'ยังไม่สำเร็จ' };
  if (record.actions?.length) for (const [index, action] of record.actions.entries()) {
    field(`Action Plan ${index + 1} - ${action.topic}`, action.plan);
    if (action.issue) field('ปัญหาที่พบ', action.issue);
    field('ผู้รับผิดชอบ / กำหนดส่ง / สถานะ', `${action.owner} | ${formatPdfDate(action.dueDate)} | ${actionLabels[action.status] || action.status || '-'}`);
    if (action.expectedResult) field('ผลที่คาดหวัง', action.expectedResult);
    if (action.followUpNote) field('ผลติดตาม', action.followUpNote);
  } else field('Action Plan', actual?.noPlanReason || record.actionPlan || record.agreedActionPlan);
  section('QA Review');
  field('ข้อสรุป QA Review', record.qaReviewComment || 'ยังรอ QA ตรวจแผน');
  if (record.qaReviewedAt) field('ผู้ตรวจ / วันเวลา', `${record.qaReviewedBy || record.qaOwnerName || '-'} | ${formatPdfDateTime(record.qaReviewedAt)}`);
  if (record.attachments?.length) { section('ไฟล์ประกอบ');field('ไฟล์ที่แนบไว้กับ Coaching', record.attachments.map(attachment => `- ${attachment.name}`).join('\n')); }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);pdf.setDrawColor(221, 215, 228);pdf.line(left, 283, left + width, 283);
    font(11);pdf.setTextColor(107, 91, 122);
    pdf.text(`Robinhood QA | ${record.monthKey} | บันทึกล่าสุด ${formatPdfDateTime(record.updatedAt)}`, left, 289);
    pdf.text(`${page} / ${pages}`, left + width, 289, { align: 'right' });
  }
  pdf.setProperties({ title: `Coaching ${record.monthKey} - ${name}`, subject: record.id, author: record.qaOwnerName || 'Robinhood QA' });
  return pdf;
}
