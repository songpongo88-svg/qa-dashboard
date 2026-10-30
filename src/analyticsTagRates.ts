import { canonicalAgentIdentityKey } from './lib/agentIdentity';
import { normalizeAppealIssueTags, applyAppealIssueTagReviews } from './appealReview';

export type TagCase = {caseId:string; agent:string; monthKey?:string; auditDateObj?:Date|null; topics:Array<{code:string;issueTags?:string[]}>; revisedTopics?:Array<{code:string;issueTags?:string[]}>|null; reviewStatus?:string};
export type TagPeriod = {label:string;cases:TagCase[]};
export type TagCatalogItem = {name:string;topicCode:string;active?:boolean};
const caseId=(value:unknown)=>String(value||'').replace(/\s+/g,'').toUpperCase();
export const tagCaseKey=(item:Pick<TagCase,'caseId'|'agent'>)=>caseId(item.caseId)+'::'+canonicalAgentIdentityKey(item.agent);
export function tagCaseEligible(item:TagCase){const month=item.monthKey || (item.auditDateObj instanceof Date && !Number.isNaN(item.auditDateObj.getTime()) ? `${item.auditDateObj.getFullYear()}-${String(item.auditDateObj.getMonth()+1).padStart(2,'0')}`:'');return /^\d{4}-\d{2}$/.test(month)&&month>='2026-10';}

// Join Tag metadata without changing any stored or displayed scores.
export function hydrateTagCases(cases:TagCase[], records:any[], requests:any[]):TagCase[]{
  const stored=new Map<string,any>();
  for(const record of records.slice().sort((a,b)=>Date.parse(a.updatedAt||a.submittedAt||'')-Date.parse(b.updatedAt||b.submittedAt||''))){
    if(record.deletedAt||record.isTestCase||record.noCaseForMonth)continue;
    stored.set(tagCaseKey({caseId:record.caseId,agent:record.agentName||record.targetDisplayName||''}),record);
  }
  return cases.map(item=>{
    const record=stored.get(tagCaseKey(item));
    const ownRequests=requests.filter(row=>canonicalAgentIdentityKey(row.agent)===canonicalAgentIdentityKey(item.agent));
    const latest=ownRequests.filter(row=>String(row.caseId||'').toUpperCase().split(/[,;\n]+|\s*\/\s*/).some((id:string)=>caseId(id)===caseId(item.caseId))).sort((a,b)=>Date.parse(a.submittedAt||a.reviewedAt||'')-Date.parse(b.submittedAt||b.reviewedAt||'')).at(-1);
    const topics=item.topics.map(topic=>{
      const saved=record?.topics?.find((row:any)=>String(row.code)===String(topic.code));
      const revised=latest?.status!=='Reset'&&item.reviewStatus==='Revised'?item.revisedTopics?.find(row=>String(row.code)===String(topic.code)):undefined;
      return {...topic,issueTags:normalizeAppealIssueTags(revised?.issueTags ?? saved?.issueTags ?? topic.issueTags)};
    });
    return applyAppealIssueTagReviews([{...item,caseId:caseId(item.caseId),topics}],ownRequests)[0];
  });
}

export function buildTopicTagRates(periods:TagPeriod[],topicCode:string,catalog:TagCatalogItem[]=[]){
  const names=new Map<string,string>();
  const normalize=(name:string)=>name.trim().replace(/\s+/g,' ').toLocaleLowerCase('th-TH');
  catalog.filter(tag=>String(tag.topicCode)===topicCode&&tag.active!==false).forEach(tag=>{if(tag.name.trim())names.set(normalize(tag.name),tag.name.trim());});
  const data=periods.map(period=>{
    const unique=new Map<string,TagCase>();
    for(const item of period.cases)if(tagCaseEligible(item)&&item.topics.some(topic=>String(topic.code)===topicCode))unique.set(tagCaseKey(item),item);
    const counts=new Map<string,number>();
    for(const item of unique.values()){
      const topic=item.topics.find(topic=>String(topic.code)===topicCode)!;
      for(const name of normalizeAppealIssueTags(topic.issueTags)){
        const key=normalize(name);if(!names.has(key))names.set(key,name);counts.set(key,(counts.get(key)||0)+1);
      }
    }
    return {label:period.label,total:unique.size,counts};
  });
  return {periods:data,rows:[...names].map(([key,name])=>({name,values:data.map(period=>({count:period.counts.get(key)||0,total:period.total,pct:period.total?100*(period.counts.get(key)||0)/period.total:null}))}))};
}
