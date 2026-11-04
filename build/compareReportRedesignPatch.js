// Preserve the original report implementation. Limit changes to Compare layout,
// official embedded font, inline Tags and the explicitly removed narrative cards.
export function compareReportRedesignPatch(){return {name:'compare-report-redesign',enforce:'pre',transform(source,id){
 if(!id.replace(/\\/g,'/').split('?')[0].endsWith('/src/SummaryMockup.tsx'))return null;
 const start=source.indexOf('  async function generateSummaryReportPdf() {');const end=source.indexOf('  async function generateTeamPerformancePdf()',start);
 if(start<0||end<0||!source.includes('analyticsCompareViewActiveV29'))throw Error('Original Compare report not found');
 let s=source.slice(start,end);const replace=(a,b)=>{if(!s.includes(a))throw Error('Original Compare anchor missing: '+a.slice(0,80));s=s.replace(a,b);};
 replace('    const reportSummary = summarizeCases(comparisonPdfSummaryCasesV32);',`    const reportSummary = summarizeCases(comparisonPdfSummaryCasesV32);
    let comparisonTagData;try{comparisonTagData = isComparisonMode ? await loadComparisonTags(periodTopicReports) : {periods:[],catalog:[]};}catch(error){window.alert(error instanceof Error?error.message:'โหลดข้อมูล Tag ไม่สำเร็จ');return;}`);
 replace('orientation: "portrait",','orientation: isComparisonMode ? "landscape" : "portrait", putOnlyUsedFonts: true,');
 // Use the same embedded official font for Thai, English and chart labels.
 const drawStart=s.indexOf('      const text = safe(value);');const drawEnd=s.indexOf('\n    const wrapText =',drawStart);
 if(drawStart<0||drawEnd<0)throw Error('Original text renderer missing');
 s=s.slice(0,drawStart)+`      const previousColor = doc.getTextColor();
      if(options.color)doc.setTextColor(options.color);
      doc.text(safe(value),x,y,{align:options.align||'left'});
      if(options.color)doc.setTextColor(previousColor);
    };
`+s.slice(drawEnd);
 // Retain the original Agent Comparison table for a selected person as well.
 s=s.replaceAll('agentComparisonRows','comparisonPdfAgentRows');
 replace('    const generatedBy = String(',`    const comparisonPdfAgentRows = effectiveSelectedAgent === 'all' ? agentComparisonRows : [{agent:effectiveSelectedAgent,overallDelta:periodTopicReports.length>1?periodTopicReports.at(-1).summary.avgScore-periodTopicReports[0].summary.avgScore:null,values:periodTopicReports.map(p=>({period:p.label,score:p.summary.caseCount?p.summary.avgScore:null,caseCount:p.summary.caseCount}))}];
    const generatedBy = String(`);
 replace('effectiveSelectedAgent === "all" &&\n      comparisonPdfAgentRows.length','(effectiveSelectedAgent === "all" || isComparisonMode) &&\n      comparisonPdfAgentRows.length');
 replace('      "Overall result for the selected scope"','      isComparisonMode ? "ผลของช่วงล่าสุด: " + periodTopicReports.at(-1)?.label : "Overall result for the selected scope"');
 // Keep original sizes in single reports; make the original Compare type readable.
 replace('    const pageWidth = doc.internal.pageSize.getWidth();',`    const originalSetFontSize = doc.setFontSize.bind(doc);
    if(isComparisonMode)doc.setFontSize = (size:number) => originalSetFontSize(Math.max(10,size));
    const pageWidth = doc.internal.pageSize.getWidth();`);
 const factors=s.indexOf('    if (isComparisonMode) {\n      const managementScoreDriverReports');const detail=s.indexOf('    periodTopicReports.forEach',factors);
 if(factors<0||detail<0)throw Error('Original Score Factors block missing');s=s.slice(0,factors)+s.slice(detail);
 // Original per-period table columns, expanded proportionally to landscape.
 replace('const topicWidths = [112, 24, 20, 28];','const topicWidths = [contentWidth-72,24,20,28];');
 s=s.replaceAll('tableX + 112 +','tableX + topicWidths[0] +');
 replace('const summaryWidths = [76, 22, 28, 24, 20, 16];','const summaryWidths = [contentWidth-110,22,28,24,20,16];');
 replace('    periodTopicReports.forEach((report, reportIndex) => {\n      ensureSpace(90);','    periodTopicReports.forEach((report, reportIndex) => {\n      if(isComparisonMode)startNewPage();\n      ensureSpace(90);');
 // Keep each period\'s strengths, coaching, grade and review cards together.
 replace('const halfWidth = (contentWidth - 5) / 2;', 'const halfWidth = isComparisonMode ? (contentWidth-15)/4 : (contentWidth-5)/2;');
 replace('      y += 47;\n\n      if (y + 48 > contentBottom) {','      y += isComparisonMode ? 0 : 47;\n\n      if (!isComparisonMode && y + 48 > contentBottom) {');
 replace('const gradeBoxWidth = contentWidth * 0.58;', 'const gradeBoxWidth = isComparisonMode ? halfWidth : contentWidth*0.58;');
 replace('const statusBoxX = margin + gradeBoxWidth + 5;', 'const statusBoxX = isComparisonMode ? margin+(halfWidth+5)*3 : margin+gradeBoxWidth+5;');
 replace('const statusBoxWidth = contentWidth - gradeBoxWidth - 5;', 'const statusBoxWidth = isComparisonMode ? halfWidth : contentWidth-gradeBoxWidth-5;');
 const ga=s.indexOf('      doc.setFillColor(250, 248, 255);',s.indexOf('const gradeBoxWidth'));const gb=s.indexOf('      doc.setFillColor(240, 249, 255);',ga);
 if(ga<0||gb<0)throw Error('Grade card missing');s=s.slice(0,ga)+s.slice(ga,gb).replace(/\bmargin\b/g,'(isComparisonMode ? margin+(halfWidth+5)*2 : margin)')+s.slice(gb);
 // Review card chart fits its original companion card on the narrower grid.
 const ra=s.indexOf('      addDonutChart(',gb);const rb=s.indexOf('      y += 48;',ra);let review=s.slice(ra,rb);review=review.replace('y + 10,','y + 9,').replace('24,','isComparisonMode ? 16 : 24,').replaceAll('statusBoxX + 32','statusBoxX + (isComparisonMode ? 23 : 32)');s=s.slice(0,ra)+review+s.slice(rb);
 // Inline Tags directly beneath each existing Topic Comparison row.
 const ta=s.indexOf('    if (isComparisonMode && topicDifferenceGroups.length)');const tb=s.indexOf('    periodTopicReports.forEach',ta);let comparison=s.slice(ta,tb);
 comparison=comparison.replace('if (y + rowHeight > contentBottom)', 'if (y + rowHeight + 25 > contentBottom)');
 const rowEnd='          y += rowHeight;\n        });';if(!comparison.includes(rowEnd))throw Error('Topic row missing');
 comparison=comparison.replace(rowEnd,`          y += rowHeight;
          const tagReport=buildTopicTagRates(comparisonTagData.periods,String(topic.code),comparisonTagData.catalog);
          const indices=reports.map((r:any)=>comparisonTagData.periods.findIndex((p:any)=>p.label===r.label));
          const latest=indices[indices.length-1];
          const tags=[...tagReport.rows].sort((a,b)=>(b.values[latest]?.pct??-1)-(a.values[latest]?.pct??-1));
          const leader=tags[0]?.values[latest]?.pct??0;
          if(tags.length){doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(100,116,139);drawText('Tag (%) · เคสที่พบปัญหา',margin+3,y+4);y+=7;}
          for(const tag of tags){
            doc.setFont('helvetica','normal');doc.setFontSize(10);
            const tagLines=doc.splitTextToSize(tag.name,topicWidth-7);
            const h=Math.max(8,4+tagLines.length*3.6);
            if(y+h>contentBottom){startNewPage();drawSectionTitle('Topic Comparison / Tag (%) (continued)',topic.code+'. '+topic.label);drawTagPeriodHeader(reports,topicWidth);}
            const top=leader>0&&tag.values[latest]?.pct===leader;
            doc.setFillColor(top?246:255,top?242:255,top?255:255);doc.rect(margin,y,contentWidth,h,'F');
            doc.setFont('helvetica',top?'bold':'normal');doc.setFontSize(10);doc.setTextColor(top?91:100,top?33:116,top?182:139);
            tagLines.forEach((line:string,j:number)=>drawText(line,margin+3,y+4+j*3.6));
            indices.forEach((index:number,j:number)=>{const value=tag.values[index]?.pct;drawText(value==null?'—':value.toFixed(2)+'%',margin+topicWidth+periodWidth*(j+.5),y+4,{align:'center'});});
            y+=h;
          }
        });`);
 s=s.slice(0,ta)+comparison+s.slice(tb);
 // Repeated headers name every selected period, including all four weeks.
 replace('    drawPageHeader();\n    y = 43;',`    const drawTagPeriodHeader=(reports:any[],topicWidth:number)=>{
      const w=(contentWidth-topicWidth)/reports.length;
      doc.setFillColor(30,41,59);doc.rect(margin,y,contentWidth,13,'F');doc.setFont('helvetica','bold');doc.setFontSize(10);
      drawText('Tag (%) · '+ 'เคสที่พบปัญหา',margin+3,y+7,{color:'#ffffff'});
      reports.forEach((r:any,i:number)=>doc.splitTextToSize(r.label,w-5).forEach((l:string,j:number)=>drawText(l,margin+topicWidth+w*(i+.5),y+5+j*3.5,{color:'#ffffff',align:'center'})));y+=13;
    };
    drawPageHeader();
    y = 43;`);
 const duplicate=s.indexOf('      topicDifferenceGroups.forEach((group: any) => {',s.indexOf('Performance Comparison Analytics'));
 const summary=s.indexOf('    drawSectionTitle(\n      "Summary Table"',duplicate);
 if(duplicate<0||summary<0)throw Error('Original comparison summary not found');
 s=s.slice(0,duplicate)+'    }\n\n'+s.slice(summary);
 s=s.replace('PASS/FAIL follows each period Target; Difference is percentage-point change vs previous comparable period','PASS/FAIL: KPI ของช่วงนั้น | Diff: เทียบช่วงก่อนหน้า (จุดเปอร์เซ็นต์) | Tag: % ของเคสที่พบปัญหา รวมเคสไม่มี Tag ในฐาน ตั้งแต่ ต.ค. 2026');
 // All report text is vector TH Sarabun New; chart text uses the same loaded family.
 s=s.replaceAll('64px Arial','64px THSarabunNew').replaceAll('26px Arial','26px THSarabunNew');
 return {code:`import { loadComparisonTags } from './generateComparisonPdf';\nimport { buildTopicTagRates } from './analyticsTagRates';\n`+source.slice(0,start)+s+source.slice(end),map:null};
}};}
