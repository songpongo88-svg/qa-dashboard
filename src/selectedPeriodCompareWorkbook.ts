import * as XLSX from "xlsx";
import type { CanonicalReportCase } from "./DashboardMockup";
import { getCaseDetailTopicTitle } from "./lib/rubricVersions";
import { richTextToPlainText } from "./richText";

// Each selected comparison period is preserved exactly as the Dashboard filters
// supplied it. No "W1"/"W2" placeholders or unselected time periods.
type Unit = "week" | "month";
type Topic = NonNullable<CanonicalReportCase["topics"]>[number];
type Period = { label: string; cases: CanonicalReportCase[] };
const score = (c: CanonicalReportCase) => Number(c.finalScore);
const agent = (c: CanonicalReportCase) => String(c.agent || c.sourceAgentName || "").trim();
const topics = (c: CanonicalReportCase): Topic[] =>
  c.reviewStatus === "Revised" && c.revisedTopics?.length ? c.revisedTopics : c.topics || [];
const round2 = (n:number) => Math.round(n*100)/100;
const avg = (rows:CanonicalReportCase[]) => rows.length ? round2(rows.reduce((n,c)=>n+score(c),0)/rows.length) : null;
const delta = (a:number|null,b:number|null) => a===null||b===null ? null : round2(b-a);
const topicName=(code:string,rows:CanonicalReportCase[]) =>
  getCaseDetailTopicTitle(code,"Topic "+code, String(rows[0]?.monthKey||"")).replace(/\s*\([^)]*\)/g,"").trim();
const dedupeTags=(c:CanonicalReportCase) => {
  const tags=new Set<string>();
  topics(c).forEach(t => {
    (t.issueTags||[]).forEach(tag=>{if(String(tag||"").trim())tags.add(String(tag).trim());});
    (t.deductions||[]).forEach(raw=>{
      const d=raw as unknown as string | Record<string,unknown>;
      const tag=(typeof d==="string"?d:String(d.tag||d.name||d.label||"")).trim();
      if(tag)tags.add(tag);
    });
  });
  return tags;
};
const topicAverage=(items:CanonicalReportCase[],code:string) => {
  let total=0,max=0;
  items.forEach(c=>topics(c).filter(t=>String(t.code||"").trim()===code).forEach(t=>{
    if(Number.isFinite(Number(t.score))&&Number(t.max)>0){
      total+=Number(t.score);max+=Number(t.max);
    }
  }));
  return max>0?round2(total*100/max):null;
};
const tagCount=(items:CanonicalReportCase[],tag:string) => items.filter(c=>dedupeTags(c).has(tag)).length;
const merge=(left:string,right:string)=>({s:XLSX.utils.decode_cell(left),e:XLSX.utils.decode_cell(right)});
const write=(ws:XLSX.WorkSheet,address:string,value:string|number|null)=>{
  if(value!==null)XLSX.utils.sheet_add_aoa(ws,[[value]],{origin:address});
};
const asText=(value:unknown)=>{
  const text=richTextToPlainText(value||"");
  if(text.length>32767)throw new Error("ข้อความเคสยาวเกินข้อจำกัดของ Excel (32,767 ตัวอักษรต่อเซลล์) กรุณาตรวจสอบข้อมูลก่อนส่งออก");
  return text;
};
const aligned = (c:CanonicalReportCase,unit:Unit) =>
  unit==="week"?String(c.weekLabel||"").trim():String(c.monthKey||"").trim();

export function buildSelectedPeriodComparisonWorkbook(
  source:CanonicalReportCase[], selected:string[], scope:string,
  generatedBy:string,generatedAt:string,unit:Unit="week"
):XLSX.WorkBook {
  const labels=[...new Set(selected.map(s=>String(s||"").trim()).filter(Boolean))];
  if(labels.length<2||labels.length>4)throw new Error("กรุณาเลือกช่วงเปรียบเทียบ 2–4 ช่วง");
  const chosen=new Set(labels);
  const cases=source.filter(c=>chosen.has(aligned(c,unit)));
  const periods:Period[]=labels.map(label=>({label,cases:cases.filter(c=>aligned(c,unit)===label)}));
  if(!cases.length)throw new Error("ไม่พบเคสที่ตรงกับช่วงวันที่เลือก");
  const book=XLSX.utils.book_new();
  const sheet=XLSX.utils.aoa_to_sheet([[]]);
  const merges:ReturnType<typeof merge>[]=[];
  const rowSizes=new Map<number,number>();
  const at=(address:string,value:string|number|null)=>write(sheet,address,value);
  const range=(l:string,r:string)=>merges.push(merge(l,r));
  const header=(r:number,title:string)=>{
    at("B"+r,title);
    range("B"+r,"P"+r);
    rowSizes.set(r,37);
  };
  const columns=["F","H","J","L"];
  const mergeColumns=(r:number)=>{
    range("B"+r,"E"+r);
    for(const [left,right] of [["F","G"],["H","I"],["J","K"],["L","M"],["N","P"]])
      range(left+r,right+r);
  };
  const comparableAvg=periods.map(p=>avg(p.cases));
  const n=periods.length;
  at("E2","QA "+(unit==="week"?"WEEKLY":"MONTHLY")+" COMPARISON");
  at("M2",String(n)+" SELECTED PERIODS");
  at("E4",labels.join("  |  "));
  at("E5",scope.replace(/_/g," ")+" · KPI TARGET 85%");
  at("M4","PREPARED BY · "+generatedBy);
  at("M5","GENERATED · "+generatedAt+" ICT");
  range("E2","L3");range("M2","P3");range("E4","L4");
  range("E5","L5");range("M4","P4");range("M5","P5");
  [["B","D"],["F","H"],["J","L"],["N","P"]].forEach(([l,r],i)=>{
    const p=periods[i],value=p?comparableAvg[i]:i===n?delta(comparableAvg[0],comparableAvg[n-1]):null;
    at(l+"8",p?p.label:"CHANGE / KPI");
    at(l+"9",value===null?"—":value);
    at(l+"12",p?p.cases.length+" cases":i===n?"First → Last (pp)":"KPI 85%");
    range(l+"8",r+"8");range(l+"9",r+"10");range(l+"12",r+"12");
  });
  header(15,"01  •  WEEKLY PERFORMANCE / คะแนนและจำนวนเคสรายช่วง");
  at("B17","SELECTED PERIOD");at("F17","CASES");at("H17","AVERAGE QA");
  at("J17","Δ vs PREVIOUS");at("L17","AGENTS");at("N17","KPI TARGET");
  mergeColumns(17);rowSizes.set(17,40);
  periods.forEach((p,i)=>{
    const r=18+i;
    at("B"+r,p.label);at("F"+r,p.cases.length);at("H"+r,comparableAvg[i]);
    at("J"+r,i===0?"BASE":delta(comparableAvg[i-1],comparableAvg[i])??"—");
    at("L"+r,new Set(p.cases.map(agent).filter(Boolean)).size);
    at("N"+r,comparableAvg[i]===null?"NO CASES":comparableAvg[i]!>=85?"≥85":"<85");
    mergeColumns(r);rowSizes.set(r,36);
  });
  at("B22","Δ = ช่วงที่เลือกถัดไป − ช่วงก่อนหน้า (คะแนน) · ไม่ถือว่าไม่มีเคสเป็น 0 คะแนน");
  range("B22","P22");
  header(25,"02  •  WEEKLY TREND / กราฟเปรียบเทียบคะแนนเฉลี่ยและจำนวนเคส");
  // Rows 28–44 remain free for the two embedded, native Excel charts.
  header(45,"03  •  TOPIC PERFORMANCE / เปรียบเทียบคะแนนตามหัวข้อการประเมิน");
  at("B47","QA TOPIC");columns.forEach((c,i)=>at(c+"47",labels[i]||""));
  at("N47","Δ FIRST → LAST");mergeColumns(47);rowSizes.set(47,49);
  const codes=[...new Set(cases.flatMap(c=>topics(c).map(t=>String(t.code||"").trim()).filter(Boolean)))];
  const shownCodes=["1","2","3","4"].filter(code=>codes.includes(code));
  // Additional historical rubric topics are retained, never silently dropped.
  const otherCodes=codes.filter(code=>!shownCodes.includes(code)).sort((a,b)=>a.localeCompare(b,"th",{numeric:true}));
  const allCodes=[...shownCodes,...otherCodes];
  const topicChanges:{label:string;change:number}[]=[];
  allCodes.forEach((code,index)=>{
    const r=48+index,pts=periods.map(p=>topicAverage(p.cases,code));
    const change=delta(pts[0],pts[n-1]);
    at("B"+r,code+". "+topicName(code,cases));
    columns.forEach((col,i)=>at(col+r,i<n?(pts[i]??"—"):""));
    at("N"+r,change===null?"—":change);
    if(change!==null)topicChanges.push({label:topicName(code,cases),change});
    mergeColumns(r);rowSizes.set(r,43);
  });
  const agents=[...new Set(cases.map(agent).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"th"));
  const agentSection=Math.max(59,48+allCodes.length+6);
  header(agentSection,"04  •  AGENT PERFORMANCE / คะแนนและจำนวนเคสของ Agent");
  const agentHeader=agentSection+2;
  at("B"+agentHeader,"AGENT NAME");columns.forEach((c,i)=>at(c+agentHeader,labels[i]||""));
  at("N"+agentHeader,"Δ FIRST → LAST");mergeColumns(agentHeader);rowSizes.set(agentHeader,48);
  agents.forEach((name,index)=>{
    const r=agentHeader+1+index;
    const byPeriod=periods.map(p=>p.cases.filter(c=>agent(c)===name));
    const pts=byPeriod.map(avg);
    at("B"+r,name);
    columns.forEach((col,i)=>{
      at(col+r,i<n?(pts[i]===null?"—":pts[i]!.toFixed(2))+"\n"+(byPeriod[i]?.length||0)+" cases":"");
    });
    at("N"+r,delta(pts[0],pts[n-1])??"—");
    mergeColumns(r);rowSizes.set(r,52);
  });
  const allTags=[...new Set(cases.flatMap(c=>[...dedupeTags(c)]))];
  const tags=allTags.sort((a,b)=>cases.reduce((sum,c)=>sum+(dedupeTags(c).has(b)?1:0)-(dedupeTags(c).has(a)?1:0),0)||a.localeCompare(b,"th"));
  const tagSection=agentHeader+agents.length+6;
  header(tagSection,"05  •  TAG PERFORMANCE / จำนวนเคสและสัดส่วนที่ถูกหักคะแนน");
  const tagHeader=tagSection+2;
  at("B"+tagHeader,"DEDUCTION TAG");columns.forEach((c,i)=>at(c+tagHeader,labels[i]||""));
  at("N"+tagHeader,"Δ CASES");mergeColumns(tagHeader);rowSizes.set(tagHeader,48);
  const tagChanges:{label:string;change:number}[]=[];
  tags.forEach((tag,index)=>{
    const r=tagHeader+1+index,counts=periods.map(p=>tagCount(p.cases,tag));
    at("B"+r,tag);
    columns.forEach((col,i)=>{
      at(col+r,i<n?counts[i]+"\n("+ (periods[i].cases.length?round2(counts[i]*100/periods[i].cases.length).toFixed(2):"—")+"%)":"");
    });
    const change=counts[n-1]-counts[0];at("N"+r,change);
    if(change>0)tagChanges.push({label:tag,change});
    mergeColumns(r);rowSizes.set(r,55);
  });
  const findings=tagHeader+tags.length+6;
  header(findings,"06  •  KEY FINDINGS / สรุปผลที่ควรติดตาม");
  const highest=periods.map((p,i)=>({label:p.label,score:comparableAvg[i]})).filter((p):p is {label:string;score:number}=>p.score!==null).sort((a,b)=>b.score-a.score);
  const topDrop=topicChanges.sort((a,b)=>a.change-b.change)[0];
  const topTag=tagChanges.sort((a,b)=>b.change-a.change)[0];
  const notes=[
    "ช่วงคะแนนสูงสุด: "+(highest[0]?highest[0].label+" · "+highest[0].score.toFixed(2):"ไม่มีข้อมูล"),
    "ช่วงคะแนนต่ำสุด: "+(highest.at(-1)?highest.at(-1)!.label+" · "+highest.at(-1)!.score.toFixed(2):"ไม่มีข้อมูล"),
    "ผลต่างแรก → ล่าสุด: "+(delta(comparableAvg[0],comparableAvg[n-1])?.toFixed(2)??"—")+" คะแนน",
    "Topic ที่คะแนนลดลงมากสุด: "+(topDrop&&topDrop.change<0?topDrop.label+" ("+topDrop.change.toFixed(2)+" pp)":"ไม่พบ Topic ที่คะแนนลดลง"),
    "Tag ที่เพิ่มขึ้นมากสุด: "+(topTag?topTag.label+" (+"+topTag.change+" เคส)":"ไม่พบ Tag ที่เพิ่มขึ้น"),
    "หมายเหตุ: จำนวนเคสแต่ละช่วงอาจไม่เท่ากัน · QA KPI ประเมินตามเกณฑ์รายเดือน",
  ];
  notes.forEach((note,i)=>{
    const r=findings+2+i;at("B"+r,note);range("B"+r,"P"+r);rowSizes.set(r,31);
  });
  at("B"+(findings+10),"SOURCE · QA Dashboard / Canonical Evaluation Records · Exported "+generatedAt);
  range("B"+(findings+10),"P"+(findings+10));
  sheet["!merges"]=merges;
  sheet["!cols"]=Array.from({length:16},(_,i)=>({wch:i===0?3:i===1?35:[5,7,9,11,13].includes(i)?31:12}));
  sheet["!rows"]=Array.from({length:findings+11},(_,i)=>({hpt:rowSizes.get(i+1)??(i>=1&&i<=4?34:22)}));
  sheet["!pageSetup"]={orientation:"landscape",fitToWidth:1};
  sheet["!margins"]={left:0.25,right:0.25,top:0.3,bottom:0.3,header:0.12,footer:0.12};
  XLSX.utils.book_append_sheet(book,sheet,"Compare Overview");

  // One case = exactly one physical Excel row. Topic commentary remains fully
  // available in the original cell / formula bar; no hidden continuation sheets.
  const baseHeaders=[
    "Case ID","Week","Agent","Final Score","Grade","Case Date","Audit Date","Team",
    "Intent TH","Intent EN","Case Description","Previous Score","Review Status","Appeal Status","Month",
  ];
  const groupNumbers=["1","2","3","4"];
  const topicHeaders=groupNumbers.flatMap(code=>[code+" Score",code+" Max",code+" Tag",code+" Comment"]);
  const headers=[...baseHeaders,...topicHeaders];
  const detail=XLSX.utils.aoa_to_sheet([[],headers]);
  write(detail,"A1","CASE INFORMATION / ข้อมูลเคส");
  groupNumbers.forEach((code,index)=>{
    const first=XLSX.utils.encode_col(baseHeaders.length+index*4);
    const name=topicName(code,cases);
    write(detail,first+"1","TOPIC "+code+" · "+name);
  });
  const groups=[merge("A1","O1"),...groupNumbers.map((_,i)=>merge(
    XLSX.utils.encode_col(baseHeaders.length+i*4)+"1",
    XLSX.utils.encode_col(baseHeaders.length+i*4+3)+"1",
  ))];
  detail["!merges"]=groups;
  cases.forEach((c,index)=>{
    const byCode=new Map(topics(c).map(t=>[String(t.code||"").trim(),t]));
    const cellValues:(string|number)[]=[
      String(c.caseId||""),String(c.weekLabel||""),agent(c),score(c),String(c.grade||""),
      String(c.caseDate||""),String(c.auditDate||""),String(c.teamName||""),
      String(c.inquiryTh||""),String(c.inquiryEn||""),asText(c.caseDescription||""),
      c.previousScore??"",String(c.reviewStatus||""),String(c.appealStatus||""),String(c.monthKey||""),
    ];
    groupNumbers.forEach(code=>{
      const t=byCode.get(code);
      const tags=t?(t.issueTags||[]).map(String).filter(Boolean).join(", "):"";
      cellValues.push(t?.score??"",t?.max??"",tags,asText(t?.comment||""));
    });
    XLSX.utils.sheet_add_aoa(detail,[cellValues],{origin:{r:index+2,c:0}});
  });
  detail["!cols"]=headers.map((h,i)=>({wch:
    i===0?18:i===1?30:i===2?32:i===8?39:i===9?33:i===10?69:
    h.endsWith(" Comment")?78:h.endsWith(" Tag")?44:
    h.endsWith(" Score")||h.endsWith(" Max")?13:
    i===3?17:i===5||i===6?19:22
  }));
  detail["!rows"]=[{hpt:38},{hpt:35},...cases.map(()=>({hpt:48}))];
  detail["!autofilter"]={ref:"A2:AE"+(cases.length+2)};
  detail["!pageSetup"]={orientation:"landscape",fitToWidth:1};
  XLSX.utils.book_append_sheet(book,detail,"Case Detail");
  return book;
}
