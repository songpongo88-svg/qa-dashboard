import {fetchStoredEvaluationsForCases} from './evaluationStore';
import {fetchAppealEvents} from './appealStore';
import {buildAppealRequests} from './AppealRequestsMockup';
import {fetchEvaluationIssueTags} from './evaluationTagStore';
import {hydrateTagCases,tagCaseEligible,type TagPeriod} from './analyticsTagRates';
/** Load appeal-aware Tags for the existing report; never recalculate its scores. */
export async function loadComparisonTags(periods:TagPeriod[]){
 const ids=[...new Set(periods.flatMap(p=>p.cases).filter(tagCaseEligible).map(c=>c.caseId))];
 const [records,events,catalog]=await Promise.all([ids.length?fetchStoredEvaluationsForCases(ids):[],ids.length?fetchAppealEvents(['appeal_request_submitted','appeal_request_reviewed','appeal_request_reset','appeal_additional_round_opened','appeal_additional_round_cancelled','appeal_additional_round_expired','appeal_additional_evidence_submitted','appeal_submission_edit_started','appeal_submission_draft_saved','appeal_submission_resubmitted'],{limit:2000}):[],ids.length?fetchEvaluationIssueTags():[]]);
 const requests=buildAppealRequests(events as any);
 return {periods:periods.map(p=>({...p,cases:hydrateTagCases(p.cases,records,requests)})),catalog};
}
