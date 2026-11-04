/** Consistent PDF names: QA_<mode>_<Comparison?>_<team>_<agent>_<periods>.pdf. */
export function reportPdfFilename(mode:string,periods:readonly string[],scope:{team:string;agent:string},comparison=periods.length>1){
 const part=(s:string,fallback:string)=>s.trim().replace(/[^a-zA-Z0-9ก-๙._-]+/g,'_').replace(/^_+|_+$/g,'')||fallback;
 return ['QA',part(mode,'Report'),...(comparison?['Comparison']:[]),part(scope.team,'All_Teams'),part(scope.agent,'All_Agents'),periods.map(p=>part(p.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g,'$1-$2-$3').replace(/\s+[-–—]\s+/g,'_to_'),'Selected_Period')).join(comparison?'_vs_':'_')].join('_')+'.pdf';
}
