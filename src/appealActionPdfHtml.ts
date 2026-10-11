import type { AppealAction, AppealActionReview, AppealActionSubmission, AppealActionTopic } from './appealActionHistory';
import { formatPdfDateTime } from './lib/pdfDates';
import { richTextToPlainText } from './richText';

const html = (value: unknown) => richTextToPlainText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;').replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
const field = (label: string, value: unknown) => `<div><strong>${label}: ${html(value || '-')}</strong></div>`;
const body = (label: string, value: unknown) => `<div><span style="color:#dc2626"><strong>${label}</strong><br>${html(value || '-')}</span></div>`;
const separator = '<div><br></div><div style="color:#94a3b8">- - - - - - - - - - - - - - -</div><div><br></div>';
const topicIn = (rows: AppealActionTopic[], code: string) => rows.find(topic => String(topic.code) === code);

export function topicAppealActions(actions: readonly AppealAction[], code: string) {
  return actions.filter(action => topicIn(action.topics, code) || action.submissions.some(row => topicIn(row.topics, code)) || action.reviews.some(row => topicIn(row.topics, code)))
    .slice().sort((a, b) => a.actionNumber - b.actionNumber);
}

export function latestTopicAppealReview(actions: readonly AppealAction[], code: string) {
  return actions.flatMap(action => action.reviews).filter(review => topicIn(review.topics, code))
    .slice().sort((a, b) => (Date.parse(a.reviewedAt) || 0) - (Date.parse(b.reviewedAt) || 0)).at(-1);
}

/** One chronological history inside the existing topic cell; never changes stored appeals. */
export function appealActionTopicPdfHtml(actions: readonly AppealAction[], code: string) {
  return topicAppealActions(actions, code).map(action => {
    const sections = [separator, `<div><strong>Appeal Reason · Action ${action.actionNumber}</strong></div>`];
    const submissions = action.submissions.length ? action.submissions : action.submittedAt ? [{ submittedAt: action.submittedAt, submittedBy: action.submittedBy, topics: action.topics }] : [];
    const events: Array<{ kind: 'submission' | 'review'; at: string; row: AppealActionSubmission | AppealActionReview }> = [
      ...submissions.filter(row => topicIn(row.topics, code)).map(row => ({ kind: 'submission' as const, at: row.submittedAt, row })),
      ...action.reviews.filter(row => topicIn(row.topics, code)).map(row => ({ kind: 'review' as const, at: row.reviewedAt, row })),
    ];
    events.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0) || (a.kind === b.kind ? 0 : a.kind === 'submission' ? -1 : 1));
    if (!events.length) sections.push(field('Status', action.status), field('Opened', formatPdfDateTime(action.openedAt, '-')));
    for (const event of events) {
      const topic = topicIn(event.row.topics, code)!;
      if (event.kind === 'submission') {
        const row = event.row as AppealActionSubmission;
        sections.push(field('Admin', row.submittedBy), field('Appeal Submit', formatPdfDateTime(row.submittedAt, '-')), body('Appeal Reason', topic.appealReason));
      } else {
        const row = event.row as AppealActionReview;
        const rejected = topic.decision === 'Rejected';
        const score = rejected ? topic.score : topic.revisedScore ?? topic.score;
        sections.push(separator, field('QA', row.reviewedBy), field('Appeal Result', formatPdfDateTime(row.reviewedAt, '-')),
          field('Decision', `${topic.decision || row.decision} · Score ${score} / ${topic.max}`),
          body(rejected ? 'Reject Reason' : 'Revised Comment', rejected ? topic.rejectReason : topic.revisedComment || topic.retainedComment || topic.comment));
      }
    }
    return sections.join('');
  }).join('');
}

export function appealActionPdfEvidence(actions: readonly AppealAction[]) {
  const images: Array<{ photo: NonNullable<AppealActionTopic['evidenceImages']>[number]; label: string }> = [];
  for (const action of actions) {
    const submissions = action.submissions.length ? action.submissions : action.submittedAt ? [{ topics: action.topics }] : [];
    for (const [index, row] of submissions.entries()) for (const topic of row.topics) {
      for (const [image, photo] of (topic.evidenceImages || []).entries()) images.push({ photo, label: `Action ${action.actionNumber} · Topic ${topic.code} · Appeal Evidence${submissions.length > 1 ? ` · Submission ${index + 1}` : ''} - Image ${image + 1}` });
    }
    for (const [index, review] of action.reviews.entries()) for (const topic of review.topics) {
      for (const [image, photo] of (topic.qaEvidenceImages || []).entries()) images.push({ photo, label: `Action ${action.actionNumber} · Topic ${topic.code} · QA Evidence${action.reviews.length > 1 ? ` · Review ${index + 1}` : ''} - Image ${image + 1}` });
    }
  }
  return images;
}
