export function compareReportRedesignPatch(){return {name:'compare-report-redesign',enforce:'pre',transform(code,id){
 if(!id.replace(/\\/g,'/').split('?')[0].endsWith('/src/SummaryMockup.tsx'))return null;
 const anchor='  async function generateSummaryReportPdf() {';if(!code.includes(anchor)||!code.includes('analyticsCompareViewActiveV29'))throw Error('Compare PDF route not found');
 return {code:code.replace(anchor,anchor+`
    // compare-report-redesign-v1: preserve the existing verified scope and score holds.
    if (isComparisonMode || analyticsCompareViewActiveV29) {
      if (appealScoreHold) return;
      try {
        await assertEvaluationScopeComplete(currentEvaluationScope.agents, currentEvaluationScope.months);
        const { generateComparisonPdf } = await import('./generateComparisonPdf');
        await generateComparisonPdf({
          periods: periodTopicReports.map(p => ({...p, incentive:getTotalIncentiveForCases(p.cases)})),
          fileScope: {team:selectedTeam === 'all' ? 'All Teams' : selectedTeam,agent:effectiveSelectedAgent === 'all' ? 'All Agents' : effectiveSelectedAgent},
          analytics: comparisonChartAnalytics,
          watchlist: analysisMode === 'monthly' ? performanceStatusRows : [],
          supportingTrend: analysisMode === 'monthly' ? teamMonthlyAnalyticsRows : [],
          agents: effectiveSelectedAgent === 'all' ? agentComparisonRows : [{agent:effectiveSelectedAgent,values:periodTopicReports.map(p=>({period:p.label,score:p.summary.caseCount?p.summary.avgScore:null,caseCount:p.summary.caseCount}))}],
          scope: (selectedTeam === 'all' ? 'ทุกทีม' : selectedTeam) + ' / ' + (effectiveSelectedAgent === 'all' ? 'ทุกคน' : effectiveSelectedAgent),
          preparedBy: String(currentUser?.displayName || currentUser?.username || '-'),
          mode: reportModeName
        }, () => assertEvaluationScopeComplete(currentEvaluationScope.agents, currentEvaluationScope.months));
        setAnalyticsExportOpen(false);
      } catch(error) { window.alert(error instanceof Error ? error.message : 'สร้าง PDF Compare ไม่สำเร็จ กรุณาลองใหม่'); }
      return;
    }
`),map:null};
}};}
