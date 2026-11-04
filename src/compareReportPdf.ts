import { jsPDF } from 'jspdf/dist/jspdf.es.min.js';
import { PDF_LOGO } from './pdfLogo';
import { buildTopicTagRates, type TagPeriod, type TagCatalogItem } from './analyticsTagRates';
type Topic={code:string;label:string;pct:number;max:number;avgScore?:number};
export type ComparePeriod=TagPeriod & {
 summary:{caseCount:number;avgScore:number;grade?:string;revisedCount?:number};topics:Topic[];policy?:{key?:string;label?:string};
 status?:string;incentive?:number;strongest?:Topic[];coaching?:Topic[];
 coverage?:{agentCount:number;averageCasesPerAgent:number;agentsMeetingTarget:number;target:number;selectedAgentCaseCount:number|null;selectedAgentStatus:string|null};
 gradeMix?:{grade:string;count:number;pct:number}[];reviewMix?:{original:number;revised:number};
};
export type CompareAgent={agent:string;values:{period:string;score:number|null;caseCount:number}[]};
export type ComparePdfInput={periods:ComparePeriod[];agents:CompareAgent[];catalog:TagCatalogItem[];scope:string;preparedBy:string;mode:string;fileScope?:{team:string;agent:string};generatedAt?:Date;
 analytics?:{scoreBuckets:{label:string;count:number}[];total:number};
 watchlist?:{agent:string;teamName:string;trend:{monthKey:string;avgScore:number|null}[];consecutiveBelowKpi:number;failedQaThreeMonths:boolean;actions:string[]}[];
 supportingTrend?:{label:string;caseCount:number;avgScore:number}[];
};
const titles:Record<string,string>={'Process & Policy Compliance':'ขั้นตอนการทำงานและนโยบาย','Answer Quality & Problem Analysis':'คุณภาพคำตอบและการวิเคราะห์ปัญหา','Case Handling & Follow-up':'การดูแลเคสและติดตามผล','Communication Skills':'ทักษะการสื่อสาร'};
const pct=(n:number|null|undefined)=>n==null?'—':n.toFixed(2)+'%';
const num=(n:number|null|undefined)=>n==null?'—':n.toFixed(2);
export function comparisonChange(current:number|null|undefined,previous:number|null|undefined){return current==null||previous==null?null:Number((current-previous).toFixed(2));}
export function createCompareReportPdf(input:ComparePdfInput,fonts:{regular:string;bold:string}){
 if(!input.periods.length)throw Error('ไม่มีช่วงเวลาสำหรับออกรายงาน');
 const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
 pdf.addFileToVFS('Kanit-Regular.ttf',fonts.regular);pdf.addFont('Kanit-Regular.ttf','Kanit','normal');pdf.addFileToVFS('Kanit-SemiBold.ttf',fonts.bold);pdf.addFont('Kanit-SemiBold.ttf','Kanit','bold');
 const W=297,H=210,M=13,CW=W-2*M,BOTTOM=192;
 const ink='#252c40',muted='#69758b',purple='#6d28d9',light='#f5f1fc',green='#087f64',red='#bd4059';
 let y=0,first=true,pageTitle='';
 const draw=(s:unknown,x:number,b:number,size=10,color=ink,bold=false,align:'left'|'right'|'center'='left')=>{pdf.setFont('Kanit',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(color);pdf.text(String(s??'—'),x,b,{align});};
 const lines=(s:string,width:number,size=9,bold=false)=>{pdf.setFont('Kanit',bold?'bold':'normal');pdf.setFontSize(size);return pdf.splitTextToSize(s,width) as string[];};
 const page=(title:string)=>{if(!first)pdf.addPage();first=false;pageTitle=title.replace(/(?: \(ต่อ\))+$/g,'');pdf.setFillColor(purple);pdf.rect(0,0,W,23,'F');pdf.addImage(PDF_LOGO,'PNG',M,5,11,11);draw('Robinhood QA | '+input.mode+' Comparison',M+15,10,10,'#ffffff',true);draw(title,M+15,18,15,'#ffffff',true);const ls=lines(input.scope,CW,9);ls.forEach((l,i)=>draw(l,M,30+i*4,9,muted));y=35+ls.length*4;};
 const section=(title:string)=>{if(y+15>BOTTOM)page(pageTitle+' (ต่อ)');draw(title,M,y+3,12,purple,true);y+=10;};
 const deltaText=(d:number|null)=>d==null?'—':d===0?'ไม่เปลี่ยนแปลง':`${d>0?'เพิ่มขึ้น':'ลดลง'} ${Math.abs(d).toFixed(2)} จุดเปอร์เซ็นต์`;
 const deltaColor=(d:number|null,errors=false)=>d==null||d===0?muted:(d>0)!==errors?green:red;
 type Cell={text:string;detail?:string;color?:string;bold?:boolean};
 const table=(headers:string[],widths:number[],rows:{cells:Cell[];highlight?:boolean}[])=>{
  const heading=()=>{const ls=headers.map((t,i)=>lines(t,widths[i]-6,9,true));const h=Math.max(10,...ls.map(a=>a.length*4+5));pdf.setFillColor(purple);pdf.rect(M,y,CW,h,'F');let x=M;ls.forEach((a,i)=>{a.forEach((l,j)=>draw(l,i?x+widths[i]/2:x+3,y+5+j*4,9,'#ffffff',true,i?'center':'left'));x+=widths[i];});y+=h;};
  if(y+26>BOTTOM)page(pageTitle+' (ต่อ)');heading();
  rows.forEach((r,ri)=>{const text=r.cells.map((c,i)=>lines(c.text,widths[i]-6,9,c.bold||r.highlight));const details=r.cells.map((c,i)=>c.detail?lines(c.detail,widths[i]-6,8):[]);const height=Math.max(13,...text.map((a,i)=>6+a.length*4.4+details[i].length*3.7));
   if(y+height>BOTTOM){page(pageTitle+' (ต่อ)');heading();}if(y+height>BOTTOM)throw Error('ข้อความยาวเกินหนึ่งหน้า กรุณาตรวจชื่อหัวข้อ');
   pdf.setFillColor(r.highlight?'#eee7fb':ri%2?'#f8fafc':'#ffffff');pdf.rect(M,y,CW,height,'F');let x=M;
   r.cells.forEach((c,i)=>{text[i].forEach((l,j)=>draw(l,i?x+widths[i]/2:x+3,y+5+j*4.4,9,c.color||(r.highlight?purple:ink),c.bold||r.highlight,i?'center':'left'));details[i].forEach((l,j)=>draw(l,i?x+widths[i]/2:x+3,y+5+text[i].length*4.4+j*3.7,8,c.color||muted,false,i?'center':'left'));x+=widths[i];});y+=height;
  });y+=5;
 };
 const card=(x:number,w:number,label:string,value:string,tone=purple)=>{pdf.setFillColor(light);pdf.roundedRect(x,y,w,23,2,2,'F');draw(label,x+4,y+7,9,muted);draw(value,x+4,y+18,15,tone,true);};
 const previous=(p:ComparePeriod)=>input.periods[input.periods.indexOf(p)-1];
 const key=(t:Topic)=>t.code+'|'+t.label+'|'+t.max;
 const th=(t:Topic)=>titles[t.label]||t.label;
 const name=(t:Topic)=>t.code+'. '+th(t);
 const tCell=(t:Topic):Cell=>({text:name(t),detail:titles[t.label]?t.label:undefined});
 const groups:ComparePeriod[][]=[];for(let i=0;i<input.periods.length;i+=3)groups.push(input.periods.slice(i,i+3));
 const values=(group:ComparePeriod[],firstWidth=85)=>[firstWidth,...group.map(()=>((CW-firstWidth)/group.length))];
 const scopeNote='เพิ่ม–ลดเทียบช่วงก่อนหน้าที่เลือก | หน่วย: จุดเปอร์เซ็นต์ | KPI 85%';
 // Restore the original information-rich summary and metric cards.
 page('ข้อมูลรายงานและภาพรวม');
 draw('จัดทำโดย '+input.preparedBy+' | '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(input.generatedAt||new Date()),M,y,9,muted);y+=8;
 const latest=input.periods.at(-1)!;section('สรุปช่วงล่าสุด: '+latest.label);const cw=(CW-12)/4;
 card(M,cw,'จำนวนเคส',String(latest.summary.caseCount)+' เคส');card(M+cw+4,cw,'คะแนนเฉลี่ย',latest.summary.caseCount?pct(latest.summary.avgScore):'—',latest.summary.avgScore>=85?green:red);card(M+(cw+4)*2,cw,'Grade',latest.summary.caseCount?latest.summary.grade||'—':'—');card(M+(cw+4)*3,cw,'Incentive',latest.incentive==null?'—':latest.incentive.toLocaleString('en-US')+' บาท');y+=31;
 section('สรุปทุกช่วงเวลาที่เลือก');
 table(['ช่วงเวลา','จำนวนเคส','คะแนนเฉลี่ย','เทียบช่วงก่อนหน้า','Grade','Revised','Incentive (บาท)'],[70,24,31,64,18,24,40],input.periods.map(p=>{const old=previous(p);const d=comparisonChange(p.summary.caseCount?p.summary.avgScore:null,old?.summary.caseCount?old.summary.avgScore:null);return {cells:[{text:p.label},{text:String(p.summary.caseCount)},{text:p.summary.caseCount?pct(p.summary.avgScore):'—',bold:true},{text:old?deltaText(d):'ช่วงแรกที่เลือก',color:deltaColor(d)},{text:p.summary.caseCount?p.summary.grade||'—':'—'},{text:String(p.summary.revisedCount??p.reviewMix?.revised??0)},{text:p.incentive==null?'—':p.incentive.toLocaleString('en-US')}]};}));
 for(const group of groups){page('คะแนนแต่ละหัวข้อ: เปรียบเทียบช่วงเวลา');draw(scopeNote,M,y,9,muted);y+=8;
  const topics=[...new Map(group.flatMap(p=>p.topics).map(t=>[key(t),t])).values()].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  table(['หัวข้อประเมิน',...group.map(p=>p.label)],values(group),topics.map(t=>({cells:[tCell(t),...group.map(p=>{const v=p.topics.find(v=>key(v)===key(t));const old=previous(p);const prev=old?.policy?.key===p.policy?.key?old?.topics.find(v=>key(v)===key(t)):undefined;const d=comparisonChange(v?.pct,prev?.pct);return {text:pct(v?.pct),detail:v?`${num(v.avgScore)} / ${num(v.max)} คะแนน${old?' | '+deltaText(d):''}`:'ไม่มีข้อมูลตามเกณฑ์นี้',color:deltaColor(d),bold:true};})]})));
 }
 // Each period retains coverage, raw/max topic scores, strengths, coaching, grades and reviews.
 for(const p of input.periods){page('รายละเอียดช่วงเวลา: '+p.label);const c=p.coverage;const count=c?.agentCount??new Set(p.cases.map(c=>c.agent)).size;
  const metrics:[string,string][]=[['จำนวนเคส',String(p.summary.caseCount)+' เคส'],['ผู้ถูกประเมิน',String(count)+' คน'],['เฉลี่ยเคสต่อคน',num(c?.averageCasesPerAgent??(count?p.summary.caseCount/count:0))],['สถานะ',c?.selectedAgentStatus||p.status||'—']];
  metrics.forEach(([l,v],i)=>card(M+i*(cw+4),cw,l,v));y+=29;
  if(input.mode==='Monthly'&&c){draw(`ครบเป้า ${c.target} เคส: ${c.agentsMeetingTarget} / ${c.agentCount} คน`,M,y,9,muted);y+=7;}
  section('คะแนนแต่ละหัวข้อ');table(['หัวข้อประเมิน','คะแนนเฉลี่ยที่ได้','คะแนนเต็ม','คะแนน (%)','เทียบ KPI 85%'],[113,38,32,36,52],p.topics.map(t=>({cells:[tCell(t),{text:num(t.avgScore)},{text:num(t.max)},{text:pct(t.pct),bold:true,color:t.pct>=85?green:red},{text:(t.pct>=85?'สูงกว่า KPI ':'ต่ำกว่า KPI ')+Math.abs(t.pct-85).toFixed(2)+' จุดเปอร์เซ็นต์',color:t.pct>=85?green:red}]})));
  const strong=p.strongest||[...p.topics].sort((a,b)=>b.pct-a.pct).slice(0,3);const focus=p.coaching||[...p.topics].sort((a,b)=>a.pct-b.pct).slice(0,3);
  const boxW=(CW-5)/2;
  const box=(title:string,items:Topic[],x:number,tone:string)=>{
   const prepared=items.map(t=>({label:name(t),value:pct(t.pct),ls:lines(name(t),boxW-30,9)}));const height=12+prepared.reduce((h,r)=>h+Math.max(7,r.ls.length*4+2),0);
   pdf.setFillColor(light);pdf.roundedRect(x,y,boxW,height,2,2,'F');draw(title,x+3,y+6,9,tone,true);let by=y+12;
   for(const r of prepared){r.ls.forEach((l,j)=>draw(l,x+3,by+j*4,9));draw(r.value,x+boxW-3,by,9,tone,true,'right');by+=Math.max(7,r.ls.length*4+2);}return height;
  };
  const estimated=Math.max(...[strong,focus].map(items=>12+items.reduce((h,t)=>h+Math.max(7,lines(name(t),boxW-30,9).length*4+2),0)));
  if(y+estimated>BOTTOM)page('รายละเอียดช่วงเวลา (ต่อ): '+p.label);
  y+=Math.max(box('หัวข้อที่ทำได้ดี',strong,M,green),box('หัวข้อที่ควร Coaching',focus,M+boxW+5,'#b77912'))+5;

 }
 for(const group of groups){page('สัดส่วน Grade และสถานะคะแนน');
  table(['Grade / สถานะ',...group.map(p=>p.label)],values(group),['A','B','C','D','F','G','Original','Revised'].map(label=>({cells:[{text:label},...group.map(p=>{const g=p.gradeMix?.find(g=>g.grade===label);const mix=p.reviewMix;const count=label==='Original'?mix?.original:label==='Revised'?mix?.revised:g?.count;return {text:count==null?'—':count+' เคส',detail:count==null?'':p.summary.caseCount?pct(100*count/p.summary.caseCount):'—'};})]})));
 }
 // Fixed catalog and appeal-aware Tags share the Dashboard denominator and October boundary.
 for(const group of groups){const topics=[...new Map(group.flatMap(p=>p.topics).map(t=>[t.code,t])).values()];if(!topics.length)continue;page('Tag (%) ที่พบปัญหา');draw('% ของเคสที่พบ Tag | รวมเคสไม่มี Tag ในฐานคำนวณ | ข้อมูลตั้งแต่ ต.ค. 2026',M,y,9,muted);y+=8;
  for(const t of topics.sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}))){const report=buildTopicTagRates(input.periods,t.code,input.catalog);const indices=group.map(p=>input.periods.indexOf(p));const last=indices.at(-1)!;const rows=[...report.rows].sort((a,b)=>(b.values[last].pct??-1)-(a.values[last].pct??-1));const top=rows[0]?.values[last].pct??0;
   if(y+40>BOTTOM)page('Tag (%) ที่พบปัญหา (ต่อ)');section(name(t));
   table([name(t)+' / Tag',...group.map(p=>p.label)],values(group,113),rows.length?rows.map(r=>({highlight:top>0&&r.values[last].pct===top,cells:[{text:r.name},...indices.map(i=>{const v=r.values[i];const d=comparisonChange(v.pct,r.values[i-1]?.pct);return {text:pct(v.pct),detail:i?deltaText(d):'',color:deltaColor(d,true)};})]})):[{cells:[{text:'ไม่มีข้อมูล Tag ของหัวข้อนี้'},...group.map(()=>({text:'—'}))]}]);
  }
 }
 for(const group of groups){page('คะแนนรายคน');draw('คะแนนเฉลี่ย (%) พร้อมจำนวนเคส และการเปลี่ยนแปลงเทียบช่วงก่อนหน้าที่เลือก',M,y,9,muted);y+=8;
  table(['ผู้ถูกประเมิน',...group.map(p=>p.label)],values(group,81),input.agents.map(a=>({cells:[{text:a.agent},...group.map(p=>{const v=a.values.find(v=>v.period===p.label);const old=a.values.find(v=>v.period===previous(p)?.label);const d=comparisonChange(v?.score,old?.score);return {text:pct(v?.score),detail:`${v?.caseCount||0} เคส${previous(p)?' | '+deltaText(d):''}`,color:deltaColor(d)};})]})));
 }
 // Original comparison charts remain as supporting detail, with explicitly selected periods.
 page('แนวโน้มคะแนนและการกระจายคะแนน');section('แนวโน้มคะแนนรวมตามช่วงเวลาที่เลือก');
 for(const group of groups){if(y+91>BOTTOM)page('แนวโน้มคะแนน (ต่อ)');const top=y+5,h=41,w=CW/group.length;
  for(const tick of [0,50,85,100]){const by=top+h*(1-tick/100);pdf.setDrawColor(tick===85?'#f6b45e':'#e5e7eb');pdf.line(M+12,by,W-M,by);draw(String(tick)+(tick===85?' KPI':''),M,by,7,muted);}
  group.forEach((p,i)=>{const x=M+i*w+w*.35;const bh=p.summary.caseCount?h*Math.max(0,Math.min(100,p.summary.avgScore))/100:0;pdf.setFillColor(purple);if(bh)pdf.rect(x,top+h-bh,w*.35,bh,'F');draw(p.summary.caseCount?pct(p.summary.avgScore):'—',x+w*.175,Math.max(top+3,top+h-bh-2),10,ink,true,'center');lines(p.label,w-10,9).forEach((l,j)=>draw(l,M+w*(i+.5),top+h+7+j*4,9,muted,false,'center'));});y=top+h+19;
 }

 if(input.analytics?.scoreBuckets.length){section('การกระจายคะแนนของเคสในช่วงเวลาที่เลือก');const total=input.analytics.total;table(['ช่วงคะแนน','จำนวนเคส','สัดส่วน (%)'],[113,68,90],input.analytics.scoreBuckets.map(b=>({cells:[{text:b.label},{text:String(b.count)},{text:total?pct(100*b.count/total):'—'}]})));}
 if(input.watchlist?.length){page('สถานะผลประเมินและการติดตาม Coaching');table(['ผู้ถูกประเมิน / ทีม','คะแนนย้อนหลัง 3 เดือน','ต่ำกว่า KPI ต่อเนื่อง','สถานะ / การติดตาม'],[77,82,40,72],input.watchlist.map(r=>({cells:[{text:r.agent,detail:r.teamName},{text:r.trend.map(t=>t.monthKey+': '+pct(t.avgScore)).join('\n')},{text:r.consecutiveBelowKpi+' เดือน'},{text:r.failedQaThreeMonths?'Fail QA':'Normal',detail:r.actions.join(' / ')||'Monitor',color:r.failedQaThreeMonths?red:green}]})));}
 if(input.supportingTrend?.length){page('ข้อมูลประกอบ: แนวโน้มย้อนหลัง 3 เดือน');table(['เดือน','จำนวนเคส','คะแนนเฉลี่ย'],[113,68,90],input.supportingTrend.map(r=>({cells:[{text:r.label},{text:String(r.caseCount)},{text:r.caseCount?pct(r.avgScore):'—'}]})));}
 const total=pdf.getNumberOfPages();for(let i=1;i<=total;i++){pdf.setPage(i);draw('Robinhood QA | '+input.mode+' Comparison | '+input.preparedBy,M,H-8,8,muted);draw('หน้า '+i+' / '+total,W-M,H-8,8,muted,false,'right');}
 pdf.setProperties({title:'QA '+input.mode+' Comparison',creator:'QA Dashboard'});return pdf;
}
