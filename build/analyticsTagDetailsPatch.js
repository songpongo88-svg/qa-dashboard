export function analyticsTagDetailsPatch(){
  return {name:'analytics-tag-details',enforce:'pre',transform(code,id){
    if(!id.replace(/\\/g,'/').split('?')[0].endsWith('/src/SummaryMockup.tsx'))return null;
    if(code.includes('// analytics-tag-details-v1'))return null;
    let next=code;
    const start=next.indexOf('function AnalyticsTopicDetail(');
    const end=next.indexOf('\nfunction MonthlyGradeIncentiveCriteriaV144',start);
    if(start<0||end<0)throw new Error('Tag details: topic score section not found');
    let block=next.slice(start,end);
    const anchor='              </div>\n            </div>\n          );\n        })}';
    if(!block.includes(anchor))throw new Error('Tag details: topic card footer not found');
    block=block.replace(anchor,'              </div>\n              <div className="mt-4 w-full text-left"><AnalyticsTagTopicDetails topicCode={topic.code} /></div>\n            </div>\n          );\n        })}');
    next=next.slice(0,start)+block+next.slice(end);
    let overview=0,compare=0;
    next=next.replace(/<AnalyticsTopicDetail\s+topics=\{topicSummary\}([\s\S]*?)\/>/g,(match)=>{overview++;return '<AnalyticsTagScope periods={[{label: effectivePeriodLabels.join(" · "), cases: filteredCases}]} refreshKey={dataRefreshKey}>'+match+'</AnalyticsTagScope>';});
    next=next.replace(/<AnalyticsCompareDashboardV2\b([\s\S]*?)\/>/g,(match)=>{compare++;return '<AnalyticsTagScope periods={periodTopicReports} refreshKey={dataRefreshKey}>'+match+'</AnalyticsTagScope>';});
    if(!overview||!compare)throw new Error('Tag details: overview/Compare scope not found');
    return {code:'import { AnalyticsTagScope, AnalyticsTagTopicDetails, AnalyticsTagTopicTableRow } from "./AnalyticsTagDetails";\n// analytics-tag-details-v1\n'+next,map:null};
  }};
}
