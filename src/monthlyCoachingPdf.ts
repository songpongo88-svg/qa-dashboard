import { renderFinalSignedPdf } from './finalSignedPdfRenderer';
import type { StoredCoachingRecord } from './coachingStore';
import type { StoredEvaluation } from './evaluationStore';
import { belongsToAgent, coachingMonthLabel, type CoachingAccount } from './monthlyCoachingModel';

export { monthlyCoachingPdfFileName } from './monthlyCoachingModel';

export async function renderMonthlyCoachingPdf(record: StoredCoachingRecord, account: CoachingAccount, rows: StoredEvaluation[]) {
  if (!belongsToAgent(account, record.agentId, record.agent)) throw new Error('Coaching PDF ไม่ตรงกับ Admin ที่เลือก');
  const name = account.displayName || account.agentName || account.username;
  const { pdf, coachingFirstPage } = await renderFinalSignedPdf({
    document: {
      monthKey: record.monthKey, monthLabel: coachingMonthLabel(record.monthKey), agentName: name,
      teamName: record.team || account.teamName, caseCount: rows.length,
      averageScore: record.averageScore, grade: record.grade,
      cases: rows.map(row => ({ caseId: row.caseId, auditDate: row.auditDate, finalScore: row.finalScore, grade: row.grade, topics: row.topics })),
    },
    entries: [], incentive: {}, documentRef: record.id,
    roleSignerNames: { QA: record.qaOwnerName || '', Supervisor: '', Senior: record.coachName || record.seniorName || '', Agent: name },
    coachingRecordOverride: record,
  });
  if (!coachingFirstPage) throw new Error('ไม่พบหน้า Monthly Coaching ของ User และเดือนนี้');
  for (let page = 1; page < coachingFirstPage; page++) pdf.deletePage(1);
  pdf.setPage(1);
  pdf.setProperties({ title: `Monthly Coaching ${record.monthKey} - ${name}`, subject: record.id, author: record.qaOwnerName || 'Robinhood QA' });
  return pdf;
}
