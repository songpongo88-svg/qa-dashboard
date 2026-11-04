import {reportPdfFilename} from './reportPdfFilename';
import {createCompareReportPdf,type ComparePdfInput} from './compareReportPdf';
import {fetchStoredEvaluationsForCases} from './evaluationStore';
import {fetchAppealEvents} from './appealStore';
import {buildAppealRequests} from './AppealRequestsMockup';
import {fetchEvaluationIssueTags} from './evaluationTagStore';
import {hydrateTagCases,tagCaseEligible} from './analyticsTagRates';
const font=async(path:string)=>{const r=await fetch(path);if(!r.ok)throw Error('โหลดฟอนต์รายงานไม่สำเร็จ');const bytes=new Uint8Array(await r.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
export async function generateComparisonPdf(input:Omit<ComparePdfInput,'catalog'>,verify:()=>Promise<void>){
 const ids=[...new Set(input.periods.flatMap(p=>p.cases).filter(tagCaseEligible).map(c=>c.caseId))];
 const [regular,bold,records,events,catalog]=await Promise.all([font('/fonts/Kanit-Regular.ttf'),font('/fonts/Kanit-SemiBold.ttf'),ids.length?fetchStoredEvaluationsForCases(ids):Promise.resolve([]),ids.length?fetchAppealEvents(['appeal_request_submitted','appeal_request_reviewed','appeal_request_reset','appeal_additional_round_opened','appeal_additional_round_cancelled','appeal_additional_round_expired','appeal_additional_evidence_submitted','appeal_submission_edit_started','appeal_submission_draft_saved','appeal_submission_resubmitted'],{limit:2000}):Promise.resolve([]),ids.length?fetchEvaluationIssueTags():Promise.resolve([])]);
 const requests=buildAppealRequests(events as any);const periods=input.periods.map(p=>({...p,cases:hydrateTagCases(p.cases,records,requests)}));
 const pdf=createCompareReportPdf({...input,periods,catalog},{regular,bold});await verify();
 pdf.save(reportPdfFilename(input.mode,periods.map(p=>p.label),input.fileScope||{team:'All Teams',agent:'All Agents'},true));
}
