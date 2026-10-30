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

export function AnalyticsTagTopicDetails({topicCode}:{topicCode:string}){
  const data=useContext(Context);
  if(!data)return null;
  const report=buildTopicTagRates(data.periods,String(topicCode),data.catalog);
  const compare=data.periods.length>1;
  if(data.status==='ready'&&!report.periods.some(period=>period.total))return null;
  return <details open={data.open} className="min-w-0 w-full max-w-full rounded-xl border border-violet-200 bg-white text-left" data-analytics-tag-topic={topicCode}>
    <summary onClick={event=>{event.preventDefault();data.toggle();}} aria-expanded={data.open} className="cursor-pointer rounded-xl px-3 py-2 text-sm font-semibold text-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500">ดู Tag (%)</summary>
    <div className="border-t border-violet-100 px-3 pb-3">
      {data.status!=='ready'?<div role="status" className="py-3 text-sm text-slate-500">{data.status==='loading'?'Loading Tags…':'Unable to load Tags. Refresh to retry.'}</div>:!report.rows.length?<div className="py-3 text-sm text-slate-500">No Tag Data</div>:<div className="max-w-full overflow-x-auto"><table className="w-full text-sm" aria-label={`Tag percentages for Topic ${topicCode}`}>
        <thead><tr className="border-b border-violet-100 text-xs text-slate-500"><th scope="col" className="whitespace-nowrap min-w-[160px] py-3 pr-3 text-left font-medium">Tag ที่พบปัญหา</th>{report.periods.map((period,index)=><th key={index} scope="col" className="whitespace-nowrap min-w-[85px] px-2 py-3 text-right font-medium">{compare?period.label:'พบในเคส (%)'}</th>)}</tr></thead>
        <tbody>{report.rows.map(row=><tr key={row.name} className="border-b border-slate-100 last:border-0"><td className="whitespace-nowrap py-3 pr-3 text-slate-700">{row.name}</td>{row.values.map((value,index)=>{
          const previous=index?row.values[index-1].pct:null;
          const tone=compare&&index&&previous!==null&&value.pct!==null?(value.pct<previous?'text-emerald-700':value.pct>previous?'text-rose-600':'text-slate-500'):'text-violet-700';
          return <td key={index} className={`whitespace-nowrap px-2 py-3 text-right text-base font-semibold tabular-nums ${tone}`}>{value.pct===null?'—':`${value.pct.toFixed(2)}%`}</td>;
        })}</tr>)}</tbody>
      </table></div>}
    </div>
  </details>;
}

export function AnalyticsTagTopicTableRow({topicCode,colSpan}:{topicCode:string;colSpan:number}){
  const data=useContext(Context);
  if(!data?.periods.some(period=>period.cases.some(tagCaseEligible)))return null;
  return <tr><td colSpan={colSpan} className="border-t border-violet-100 px-3 pb-3"><AnalyticsTagTopicDetails topicCode={topicCode}/></td></tr>;
}
