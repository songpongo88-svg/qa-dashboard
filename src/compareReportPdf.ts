import { jsPDF } from 'jspdf/dist/jspdf.es.min.js';
import { PDF_LOGO } from './pdfLogo';
import { buildTopicTagRates, type TagPeriod, type TagCatalogItem } from './analyticsTagRates';
export type ComparePeriod=TagPeriod & {summary:{caseCount:number;avgScore:number};topics:{code:string;label:string;pct:number;max:number}[];policy?:{key?:string}};
export type CompareAgent={agent:string;values:{period:string;score:number|null;caseCount:number}[]};
export type ComparePdfInput={periods:ComparePeriod[];agents:CompareAgent[];catalog:TagCatalogItem[];scope:string;preparedBy:string;mode:string};
const titles:Record<string,string>={'Process & Policy Compliance':'ขั้นตอนการทำงานและนโยบาย','Answer Quality & Problem Analysis':'คุณภาพคำตอบและการวิเคราะห์ปัญหา','Case Handling & Follow-up':'การดูแลเคสและติดตามผล','Communication Skills':'ทักษะการสื่อสาร'};
const pct=(n:number|null|undefined)=>n==null?'—':n.toFixed(2)+'%';
export function comparisonChange(current:number|null|undefined,previous:number|null|undefined){return current==null||previous==null?null:Number((current-previous).toFixed(2));}
export function createCompareReportPdf(input:ComparePdfInput,fonts:{regular:string;bold:string}){
 if(!input.periods.length)throw Error('ไม่มีช่วงเวลาสำหรับออกรายงาน');
 const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});
 pdf.addFileToVFS('Kanit-Regular.ttf',fonts.regular);pdf.addFont('Kanit-Regular.ttf','Kanit','normal');pdf.addFileToVFS('Kanit-SemiBold.ttf',fonts.bold);pdf.addFont('Kanit-SemiBold.ttf','Kanit','bold');
 const W=210,H=297,M=15,CW=W-2*M,BOTTOM=277;let y=0,first=true;
 const ink='#292536',muted='#776b85',purple='#6236a0',light='#f4f0fa',green='#087f64',red='#bd4059';
 const draw=(s:unknown,x:number,baseline:number,size=10,color=ink,bold=false,align:'left'|'right'|'center'='left')=>{pdf.setFont('Kanit',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(color);pdf.text(String(s??'—'),x,baseline,{align});};
 const lines=(s:string,width:number,size=10)=>{pdf.setFont('Kanit','normal');pdf.setFontSize(size);return pdf.splitTextToSize(s,width) as string[];};
 const page=(title:string,sub:string)=>{if(!first)pdf.addPage();first=false;pdf.setFillColor(purple);pdf.rect(0,0,W,2,'F');pdf.addImage(PDF_LOGO,'PNG',M,9,8,8);draw('Robinhood / QUALITY ASSURANCE',M+11,14,10,purple,true);draw(title,M,29,19,ink,true);draw(sub,M,36,9,muted);y=44;};
 const section=(title:string)=>{draw(title,M,y+3,12,purple,true);y+=11;};
 const changeText=(delta:number|null)=>delta===null?'—':delta===0?'ไม่เปลี่ยนแปลง':`${delta>0?'เพิ่มขึ้น':'ลดลง'} ${Math.abs(delta).toFixed(2)} จุดเปอร์เซ็นต์`;
 const changeColor=(delta:number|null,errors=false)=>delta==null||delta===0?muted:(delta>0)!==errors?green:red;
 const periodLabel=(p:ComparePeriod)=>p.label;
 // Split wide comparisons into readable groups; each group repeats the topic/Tag/Agent column.
 const groups:ComparePeriod[][]=[];for(let i=0;i<input.periods.length;i+=3)groups.push(input.periods.slice(i,i+3));
 const header=(label:string,periods:ComparePeriod[],firstWidth:number)=>{const width=(CW-firstWidth)/periods.length;let height=11;const texts=periods.map(p=>lines(periodLabel(p),width-5,8));height=Math.max(height,...texts.map(l=>l.length*4+5));pdf.setFillColor(light);pdf.rect(M,y,CW,height,'F');draw(label,M+3,y+6,9,muted,true);texts.forEach((ls,i)=>ls.forEach((l,j)=>draw(l,M+firstWidth+width*(i+.5),y+5+j*4,8,muted,true,'center')));y+=height;return width;};
 let continueTable=()=>{};
 const row=(name:string,english:string|undefined,cells:{text:string;detail?:string;delta?:number|null}[],periods:ComparePeriod[],firstWidth:number,errors=false,top=false)=>{
  const width=(CW-firstWidth)/periods.length;const nameLines=lines(name,firstWidth-6,9);const enLines=english?lines(english,firstWidth-6,7):[];const detailLines=cells.map(c=>c.detail?lines(c.detail,width-5,7):[]);const height=Math.max(16,nameLines.length*4.7+enLines.length*3.5+6,...detailLines.map(ls=>10+ls.length*3.5));
  if(y+height>BOTTOM)continueTable();
  if(y+height>BOTTOM)throw Error('ข้อความในรายงานยาวเกินหนึ่งหน้า กรุณาตรวจชื่อหัวข้อ');
  if(top){pdf.setFillColor('#faf7fe');pdf.rect(M,y,CW,height,'F');}
  nameLines.forEach((l,i)=>draw(l,M+3,y+6+i*4.7,9,top?purple:ink,top));enLines.forEach((l,i)=>draw(l,M+3,y+6+nameLines.length*4.7+i*3.5,7,muted));
  cells.forEach((c,i)=>{const x=M+firstWidth+width*(i+1)-3;draw(c.text,x,y+6,10,top?purple:ink,top,'right');detailLines[i].forEach((l,j)=>draw(l,x,y+11+j*3.5,7,changeColor(c.delta??null,errors),false,'right'));});
  pdf.setDrawColor('#e9e3ef');pdf.setLineWidth(.15);pdf.line(M,y+height,M+CW,y+height);y+=height;
 };
 const topicKey=(t:ComparePeriod['topics'][number])=>t.code+'|'+t.label+'|'+t.max;
 const previousFor=(p:ComparePeriod)=>input.periods[input.periods.indexOf(p)-1];
 const tableNote=()=>{draw('เพิ่ม–ลดเทียบช่วงก่อนหน้าที่เลือกในรายงานนี้ | หน่วย: จุดเปอร์เซ็นต์',M,y+6,8,muted);y+=12;};
 for(const group of groups){
  page('ภาพรวมคะแนน',input.scope);header('ช่วงเวลาที่เลือก',group,68);
  row('คะแนนเฉลี่ยรวม',undefined,group.map(p=>({text:p.summary.caseCount?pct(p.summary.avgScore):'—',detail:previousFor(p)?changeText(comparisonChange(p.summary.caseCount?p.summary.avgScore:null,previousFor(p).summary.caseCount?previousFor(p).summary.avgScore:null)):'ช่วงแรกที่เลือก',delta:comparisonChange(p.summary.caseCount?p.summary.avgScore:null,previousFor(p)?.summary.caseCount?previousFor(p).summary.avgScore:null)})),group,68);
  row('จำนวนเคสที่ประเมิน',undefined,group.map(p=>({text:String(p.summary.caseCount)+' เคส'})),group,68);y+=7;section('คะแนนแต่ละหัวข้อ');header('หัวข้อประเมิน',group,68);
  const topics=[...new Map(group.flatMap(p=>p.topics).map(t=>[topicKey(t),t])).values()].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}));
  continueTable=()=>{page('คะแนนแต่ละหัวข้อ (ต่อ)',input.scope);header('หัวข้อประเมิน',group,68);};
  for(const topic of topics){if(y+30>BOTTOM){page('คะแนนแต่ละหัวข้อ (ต่อ)',input.scope);header('หัวข้อประเมิน',group,68);}const th=titles[topic.label]||topic.label;row(topic.code+'. '+th,titles[topic.label]?topic.label:undefined,group.map(p=>{const t=p.topics.find(t=>topicKey(t)===topicKey(topic));const prev=p.policy?.key===previousFor(p)?.policy?.key?previousFor(p)?.topics.find(t=>topicKey(t)===topicKey(topic)):undefined;const delta=comparisonChange(t?.pct,prev?.pct);return {text:pct(t?.pct),detail:previousFor(p)?changeText(delta):'',delta};}),group,68);}
  if(y+12>BOTTOM)continueTable();tableNote();
  const latest=group.at(-1)!;if(latest.topics.length&&y+45<BOTTOM){const sorted=[...latest.topics].sort((a,b)=>b.pct-a.pct);section('สรุปช่วงล่าสุด: '+latest.label);for(const [label,t] of [['หัวข้อที่ได้คะแนนสูงสุด',sorted[0]],['หัวข้อที่ได้คะแนนต่ำสุด',sorted.at(-1)]] as const){const txt=label+': '+(titles[t!.label]||t!.label)+' '+pct(t!.pct);for(const l of lines(txt,CW-5,10)){draw(l,M+2,y+3,10);y+=5;}y+=3;}}
 }
 for(const group of groups){
  const topicMap=new Map(group.flatMap(p=>p.topics).map(t=>[t.code,t]));
  if(!topicMap.size)continue;page('ข้อผิดพลาดที่พบ',input.scope);draw('% ของเคสที่พบ Tag | รวมเคสไม่มี Tag ในฐานคำนวณ',M,y,9,muted);y+=8;
  header('Tag ที่พบปัญหา',group,84);
  for(const topic of [...topicMap.values()].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}))){
   const report=buildTopicTagRates(input.periods,topic.code,input.catalog);const indices=group.map(p=>input.periods.indexOf(p));const latest=indices.at(-1)!;const rows=[...report.rows].sort((a,b)=>(b.values[latest].pct??-1)-(a.values[latest].pct??-1));
   const groupHeading=()=>{const label=topic.code+'. '+(titles[topic.label]||topic.label);const ls=lines(label,CW-6,10);pdf.setFillColor(light);pdf.rect(M,y,CW,ls.length*5+5,'F');ls.forEach((l,i)=>draw(l,M+3,y+5+i*5,10,purple,true));y+=ls.length*5+5;};
   continueTable=()=>{page('ข้อผิดพลาดที่พบ (ต่อ)',input.scope);header('Tag ที่พบปัญหา',group,84);groupHeading();};
   if(y+45>BOTTOM){page('ข้อผิดพลาดที่พบ (ต่อ)',input.scope);header('Tag ที่พบปัญหา',group,84);}groupHeading();
   if(!rows.length){draw('ไม่มีข้อมูล Tag ของหัวข้อนี้',M+3,y+7,9,muted);y+=16;}
   for(const r of rows){const maxLines=lines(r.name,78,9).length;const need=Math.max(22,maxLines*4.7+6);if(y+need>BOTTOM){page('ข้อผิดพลาดที่พบ (ต่อ)',input.scope);header('Tag ที่พบปัญหา',group,84);groupHeading();}
    const top=(r.values[latest].pct??0)>0&&r.values[latest].pct===rows[0]?.values[latest].pct;
    row(r.name,undefined,indices.map(i=>{const val=r.values[i].pct;const delta=comparisonChange(val,r.values[i-1]?.pct);return {text:pct(val),detail:i?changeText(delta):'',delta};}),group,84,true,top);
   }y+=6;
  }
 }
 for(const group of groups){page('คะแนนรายคน',input.scope);draw('คะแนนเฉลี่ย (%) และจำนวนเคส | เพิ่ม–ลดเทียบช่วงก่อนหน้าที่เลือก',M,y,9,muted);y+=8;header('ชื่อผู้ถูกประเมิน',group,67);
  continueTable=()=>{page('คะแนนรายคน (ต่อ)',input.scope);header('ชื่อผู้ถูกประเมิน',group,67);};
  for(const agent of input.agents){if(y+25>BOTTOM){page('คะแนนรายคน (ต่อ)',input.scope);header('ชื่อผู้ถูกประเมิน',group,67);}row(agent.agent,undefined,group.map(p=>{const v=agent.values.find(v=>v.period===p.label);const old=agent.values.find(v=>v.period===previousFor(p)?.label);const delta=comparisonChange(v?.score,old?.score);return {text:pct(v?.score),detail:`${v?.caseCount||0} เคส${previousFor(p)?' · '+changeText(delta):''}`,delta};}),group,67);}
 }
 const count=pdf.getNumberOfPages();for(let i=1;i<=count;i++){pdf.setPage(i);draw('Robinhood Quality Assurance · '+input.mode+' Comparison',M,H-11,8,muted);draw('หน้า '+i+' / '+count,W-M,H-11,8,muted,false,'right');draw('จัดทำโดย '+input.preparedBy,M,H-6,7,muted);}
 return pdf;
}
