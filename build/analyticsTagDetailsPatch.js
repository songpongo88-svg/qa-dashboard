export function analyticsTagDetailsPatch(){
  return {name:'analytics-tag-details',enforce:'pre',transform(code,id){
    if(!id.replace(/\\/g,'/').split('?')[0].endsWith('/src/SummaryMockup.tsx'))return null;
    if(code.includes('// analytics-tag-details-v1'))return null;
    let next=code;
    let overview=0,compare=0;
    next=next.replace(/<AnalyticsTopicDetail\s+topics=\{topicSummary\}([\s\S]*?)\/>/g,(match)=>{overview++;return '<AnalyticsTagScope periods={[{label: effectivePeriodLabels.join(" · "), cases: filteredCases}]} refreshKey={dataRefreshKey}>'+match+'<AnalyticsTagPanel topics={topicSummary} /></AnalyticsTagScope>';});
    next=next.replace(/<AnalyticsCompareDashboardV2\b([\s\S]*?)\/>/g,(match)=>{compare++;return '<AnalyticsTagScope periods={periodTopicReports} refreshKey={dataRefreshKey}>'+match+'</AnalyticsTagScope>';});
    if(!overview||!compare)throw new Error('Tag details: overview/Compare scope not found');
    return {code:'import { AnalyticsTagScope, AnalyticsTagPanel } from "./AnalyticsTagDetails";\n// analytics-tag-details-v1\n'+next,map:null};
  }};
}
