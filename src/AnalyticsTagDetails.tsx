import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {fetchStoredEvaluationsForCases} from './evaluationStore';
import {fetchAppealEvents} from './appealStore';
import {buildAppealRequests} from './AppealRequestsMockup';
import {fetchEvaluationIssueTags} from './evaluationTagStore';
import {buildTopicTagRates,hydrateTagCases,tagCaseEligible,tagCaseKey,type TagPeriod,type TagCatalogItem} from './analyticsTagRates';

type Data={periods:TagPeriod[];catalog:TagCatalogItem[];status:'loading'|'ready'|'error';open:boolean;toggle:()=>void};
const Context=createContext<Data|null>(null);
const cache=new Map<string,{expires:number;promise:Promise<{records:any[];requests:any[];catalog:TagCatalogItem[]}>}>();
export function AnalyticsTagScope({periods,refreshKey,children}:{periods:TagPeriod[];refreshKey?:number;children:React.ReactNode}){
  const [enabled,setEnabled]=useState(false);
  const [open,setOpen]=useState(false);
  const toggle=()=>{setOpen(value=>!value);setEnabled(true);};
  const eligible=periods.flatMap(period=>period.cases).filter(tagCaseEligible);
  const identities=[...new Set(eligible.map(tagCaseKey))].sort().join('|');
  const key=String(refreshKey||0)+'::'+identities;
  const [loaded,setLoaded]=useState<{key:string;value?:{records:any[];requests:any[];catalog:TagCatalogItem[]};error?:boolean}|null>(null);
  useEffect(()=>{
    if(!identities||!enabled)return;
    let cancelled=false;
    let request=cache.get(key);
    if(!request||request.expires<Date.now()){
      const ids=[...new Set(eligible.map(item=>item.caseId))];
      const promise=Promise.all([fetchStoredEvaluationsForCases(ids),fetchAppealEvents(['appeal_request_submitted','appeal_request_reviewed','appeal_request_reset','appeal_additional_round_opened','appeal_additional_round_cancelled','appeal_additional_round_expired','appeal_additional_evidence_submitted','appeal_submission_edit_started','appeal_submission_draft_saved','appeal_submission_resubmitted'],{limit:2000}),fetchEvaluationIssueTags()])
        .then(([records,events,catalog])=>({records,requests:buildAppealRequests(events as any),catalog}));
      request={expires:Date.now()+60000,promise};cache.set(key,request);
      if(cache.size>12)cache.delete(cache.keys().next().value!);
      promise.catch(()=>{if(cache.get(key)?.promise===promise)cache.delete(key);});
    }
    void request.promise.then(value=>{if(!cancelled)setLoaded({key,value});}).catch(()=>{if(!cancelled)setLoaded({key,error:true});});
    return()=>{cancelled=true;};
  },[key,identities,enabled]);
  const value=useMemo<Data>(()=>{
    if(!identities)return {periods,catalog:[],status:'ready',open,toggle};
    if(!enabled||loaded?.key!==key)return {periods,catalog:[],status:'loading',open,toggle};
    if(!loaded.value)return {periods,catalog:[],status:'error',open,toggle};
    return {periods:periods.map(period=>({...period,cases:hydrateTagCases(period.cases,loaded.value!.records,loaded.value!.requests)})),catalog:loaded.value.catalog,status:'ready',open,toggle};
  },[periods,key,identities,loaded,enabled,open]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

type TagTopic={code:string;label?:string};
export function AnalyticsTagPanel({topics}:{topics:TagTopic[]}){
  const data=useContext(Context);
  const contentId=React.useId();
  if(!data||!data.periods.some(period=>period.cases.some(tagCaseEligible)))return null;
  const compare=data.periods.length>1;
  const groups=[...new Map(topics.map(topic=>[String(topic.code),topic])).values()]
    .sort((a,b)=>String(a.code).localeCompare(String(b.code),undefined,{numeric:true}))
    .map(topic=>{const report=buildTopicTagRates(data.periods,String(topic.code),data.catalog);return {topic,report:{...report,rows:[...report.rows].sort((a,b)=>(b.values.at(-1)?.pct ?? -1)-(a.values.at(-1)?.pct ?? -1))}};})
    .filter(group=>group.report.periods.some(period=>period.total));
  return <section className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-violet-200 bg-white text-left" data-analytics-tag-panel="true">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-100 px-5 py-4">
      <div><h3 className="text-base font-semibold text-slate-800">Tag ที่พบปัญหา</h3><div className="mt-1 text-xs text-slate-500">{compare?'สัดส่วนเคสที่พบ Tag · เปรียบเทียบรายช่วงเวลา':'สัดส่วนเคสที่พบ Tag · แยกตามหัวข้อประเมิน'}</div></div>
      <button type="button" onClick={data.toggle} aria-expanded={data.open} aria-controls={contentId} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"><span aria-hidden="true">{data.open?'▴':'▾'}</span>{data.open?'ซ่อน Tag ทั้งหมด':'แสดง Tag ทั้งหมด'}</button>
    </div>
    <div id={contentId} hidden={!data.open}>
      {data.status!=='ready'?<div role="status" className="px-5 py-5 text-sm text-slate-500">{data.status==='loading'?'Loading Tags…':'Unable to load Tags. Refresh to retry.'}</div>:!groups.some(group=>group.report.rows.length)?<div className="px-5 py-5 text-sm text-slate-500">No Tag Data</div>:<div className="max-w-full overflow-x-auto"><table className="w-full text-sm" aria-label="Tag percentages by topic">
        <thead className="bg-violet-50 text-xs text-slate-600"><tr><th scope="col" className="min-w-[200px] px-5 py-3 text-left font-semibold">หัวข้อประเมิน</th><th scope="col" className="whitespace-nowrap px-5 py-3 text-left font-semibold">Tag ที่พบปัญหา</th>{data.periods.map((period,index)=><th key={index} scope="col" className="whitespace-nowrap px-5 py-3 text-right font-semibold">{compare?period.label:'พบในเคส (%)'}</th>)}</tr></thead>
        {groups.filter(group=>group.report.rows.length).map(({topic,report})=><tbody key={topic.code} data-analytics-tag-topic={topic.code} className="border-t border-violet-200">{report.rows.map((row,rowIndex)=>{const latest=row.values.at(-1)?.pct;const top=latest!=null&&latest>0&&latest===report.rows[0]?.values.at(-1)?.pct;return <tr key={row.name} data-top-tag={top?"true":undefined} className="border-b border-slate-100 last:border-0">
          {rowIndex===0?<th scope="rowgroup" rowSpan={report.rows.length} className="w-[27%] min-w-[200px] bg-violet-50/50 px-5 py-4 text-left align-top font-medium text-slate-700"><span className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-sm font-semibold text-violet-700">{topic.code}</span><div>{topic.label||topic.code}</div></th>:null}
          <td className={`whitespace-nowrap px-5 py-3 ${top?"font-bold text-violet-700":"text-slate-700"}`}>{row.name}</td>{row.values.map((value,index)=>{
            const previous=index?row.values[index-1].pct:null;
            const tone=compare&&index&&previous!==null&&value.pct!==null?(value.pct<previous?'text-emerald-700':value.pct>previous?'text-rose-600':'text-slate-500'):'text-violet-700';
            return <td key={index} className={`whitespace-nowrap px-5 py-3 text-right text-base font-semibold tabular-nums ${top&&index===row.values.length-1?"font-bold text-violet-700":tone}`}>{value.pct===null?'—':`${value.pct.toFixed(2)}%`}</td>;
          })}</tr>;})}</tbody>)}
      </table></div>}
    </div>
  </section>;
}
