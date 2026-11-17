import * as XLSX from "xlsx";
import type { CanonicalReportCase } from "./DashboardMockup";
import { getCaseDetailTopicTitle } from "./lib/rubricVersions";

// Snapshot report: every displayed comparison is derived from the same
// selected, appeal-verified canonical cases used by the other Report Center sheets.
type WeekData = { label: string; cases: CanonicalReportCase[] };
const agentOf = (c: CanonicalReportCase) => String(c.agent || c.sourceAgentName || "").trim();
const scoreOf = (c: CanonicalReportCase) => Number(c.finalScore);
const topicOf = (c: CanonicalReportCase) =>
  c.reviewStatus === "Revised" && c.revisedTopics?.length ? c.revisedTopics : c.topics || [];
const round = (n: number) => Math.round(n * 100) / 100;
const average = (items: CanonicalReportCase[]) =>
  items.length ? round(items.reduce((total, c) => total + scoreOf(c), 0) / items.length) : null;
const distinctAgents = (items: CanonicalReportCase[]) => new Set(items.map(agentOf).filter(Boolean)).size;
const difference = (first: number | null, last: number | null) =>
  first === null || last === null ? null : round(last - first);
const sheet = (rows: (string | number | null)[][], widths: number[]) => {
  const result = XLSX.utils.aoa_to_sheet(rows);
  result["!cols"] = widths.map(wch => ({ wch }));
  result["!rows"] = [{ hpt: 32 }];
  if(rows.length > 1) result["!autofilter"] = {ref:result["!ref"] || "A1:A1"};
  return result;
};
const sumTopics = (cases: CanonicalReportCase[]) => {
  const map = new Map<string, {score: number; max: number; count: number}>();
  cases.forEach(c => topicOf(c).forEach(t => {
    const code = String(t.code || "").trim(), score = Number(t.score), max = Number(t.max);
    if(!code || !Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return;
    const prev = map.get(code) || {score:0,max:0,count:0};
    prev.score += score; prev.max += max; prev.count++;
    map.set(code,prev);
  }));
  return new Map([...map].map(([code,t])=>[code, round(100*t.score/t.max)]));
};
const countTags = (cases: CanonicalReportCase[]) => {
  const map = new Map<string,number>();
  cases.forEach(c => {
    const unique = new Set<string>();
    topicOf(c).forEach(t => {
      (t.issueTags || []).forEach(tag => {const key=String(tag||"").trim();if(key)unique.add(key);});
      (t.deductions || []).forEach(tag => {
        const d = tag as unknown as string | Record<string,unknown>;
        const key = (typeof d === "string" ? d : String(d.tag || d.name || d.label || "")).trim();
        if(key)unique.add(key);
      });
    });
    unique.forEach(key => map.set(key,(map.get(key)||0)+1));
  });
  return map;
};
const merged = (a:string,b:string) => ({s:XLSX.utils.decode_cell(a),e:XLSX.utils.decode_cell(b)});
const set = (ws:XLSX.WorkSheet,addr:string,value:string|number|null) => {
  if(value !== null) XLSX.utils.sheet_add_aoa(ws,[[value]],{origin:addr});
};
const setDelta = (ws:XLSX.WorkSheet,addr:string,value:number|null,first:string,last:string) => {
  if(value === null) {set(ws,addr,"—");return;}
  ws[addr]={t:"n",v:value,f:`ROUND(${last}-${first},2)`};
};

export function addWeeklyCompareViews(
  book: XLSX.WorkBook,
  cases: CanonicalReportCase[],
  selectedWeeks: string[],
  scope: string,
  generatedBy: string,
  generatedAt: string,
) {
  const weeks = [...new Set(selectedWeeks.map(x => String(x).trim()).filter(Boolean))];
  if(weeks.length < 2) return;
  const data:WeekData[] = weeks.map(label => ({label,cases:cases.filter(c=>String(c.weekLabel||"").trim()===label)}));
  const averages = data.map(w=>average(w.cases));
  const base = averages[0], latest = averages[averages.length-1];
  const agentNames = [...new Set(cases.map(agentOf).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"th"));
  const codes = [...new Set(cases.flatMap(c=>topicOf(c).map(t=>String(t.code||"").trim()).filter(Boolean)))].sort((a,b)=>a.localeCompare(b));
  const topicByWeek = data.map(w=>sumTopics(w.cases));
  const tagByWeek = data.map(w=>countTags(w.cases));
  const tagNames = [...new Set(tagByWeek.flatMap(m=>[...m.keys()]))]
    .sort((a,b)=>tagByWeek.reduce((v,m)=>v+(m.get(b)||0)-(m.get(a)||0),0)||a.localeCompare(b));
  const nameOf = (code:string) => getCaseDetailTopicTitle(code,"Topic "+code,String(cases[0]?.monthKey||""))
    .replace(/\s*\([^)]*\)/g,"").trim();

  const weeklySummary:(string|number|null)[][] = [
    ["Week","Cases","Average Score","Change vs Previous (pp)","Active Agents","Revised Cases","Cases ≥85 (%)"],
    ...data.map((w,i)=>[
      w.label, w.cases.length, averages[i], i===0?null:difference(averages[i-1],averages[i]),
      distinctAgents(w.cases),
      w.cases.filter(c=>c.reviewStatus==="Revised").length,
      w.cases.length?round(w.cases.filter(c=>scoreOf(c)>=85).length*100/w.cases.length):null
    ]),
  ];
  const summarySheet = sheet(weeklySummary,[30,12,20,26,17,17,19]);
  data.forEach((_,i)=>{
    if(i===0 || averages[i]===null || averages[i-1]===null) return;
    const row=i+2;
    setDelta(summarySheet,"D"+row, difference(averages[i-1],averages[i]),"C"+(row-1),"C"+row);
  });
  XLSX.utils.book_append_sheet(book,summarySheet,"Weekly Summary");

  const agentRows:(string|number|null)[][] = [[
    "Agent",...weeks.flatMap((_,i)=>[`W${i+1} Score`,`W${i+1} Cases`]),"First → Last Δ (pp)"
  ]];
  agentNames.forEach(agent => {
    const averagesByWeek = data.map(w=>average(w.cases.filter(c=>agentOf(c)===agent)));
    const counts = data.map(w=>w.cases.filter(c=>agentOf(c)===agent).length);
    agentRows.push([agent,...averagesByWeek.flatMap((v,i)=>[v,counts[i]]),difference(averagesByWeek[0],averagesByWeek.at(-1)??null)]);
  });
  const agentSheet=sheet(agentRows,[36,...weeks.flatMap(()=>[17,14]),22]);
  agentNames.forEach((agent,i)=>{
    const first=agentRows[i+1][1] as number|null, last=agentRows[i+1][1+(weeks.length-1)*2] as number|null;
    const lastCol=XLSX.utils.encode_col(1+(weeks.length-1)*2);
    const deltaCol=XLSX.utils.encode_col(1+2*weeks.length);
    if(first!==null && last!==null) setDelta(agentSheet,deltaCol+(i+2),difference(first,last),"B"+(i+2),lastCol+(i+2));
  });
  XLSX.utils.book_append_sheet(book,agentSheet,"Agent Comparison");

  const topicRows:(string|number|null)[][]=[[
    "QA Topic",...weeks.map((_,i)=>`W${i+1} Average (%)`),"First → Last Δ (pp)"
  ]];
  codes.forEach(code=>{
    const points=topicByWeek.map(m=>m.get(code)??null);
    topicRows.push([nameOf(code),...points,difference(points[0],points.at(-1)??null)]);
  });
  const topicSheet=sheet(topicRows,[51,...weeks.map(()=>21),22]);
  codes.forEach((_,i)=>{
    const row=i+2,first=topicRows[i+1][1] as number|null,last=topicRows[i+1][weeks.length] as number|null;
    if(first!==null&&last!==null)setDelta(topicSheet,XLSX.utils.encode_col(weeks.length+1)+row,difference(first,last),"B"+row,XLSX.utils.encode_col(weeks.length)+row);
  });
  XLSX.utils.book_append_sheet(book,topicSheet,"Topic Comparison");

  const tagRows:(string|number|null)[][]=[[
    "Deduction Tag",...weeks.flatMap((_,i)=>[`W${i+1} Cases`,`W${i+1} Share (%)`]),"First → Last Δ (pp)"
  ]];
  tagNames.forEach(tag=>{
    const values = data.map((w,i)=>({count:tagByWeek[i].get(tag)||0,share:w.cases.length?round(100*(tagByWeek[i].get(tag)||0)/w.cases.length):null}));
    tagRows.push([tag,...values.flatMap(v=>[v.count,v.share]),difference(values[0].share,values.at(-1)?.share??null)]);
  });
  const tagSheet=sheet(tagRows,[51,...weeks.flatMap(()=>[14,21]),23]);
  tagNames.forEach((_,i)=>{
    const row=i+2,first=tagRows[i+1][2] as number|null,last=tagRows[i+1][2*weeks.length] as number|null;
    if(first!==null&&last!==null) setDelta(tagSheet,XLSX.utils.encode_col(2*weeks.length+1)+row,difference(first,last),"C"+row,XLSX.utils.encode_col(2*weeks.length)+row);
  });
  XLSX.utils.book_append_sheet(book,tagSheet,"Tag Comparison");

  // Primary, branded side-by-side page. Never replace the independent raw-data sheets.
  const dash=XLSX.utils.aoa_to_sheet([[]]);
  set(dash,"E2","QA WEEKLY COMPARISON");
  set(dash,"M2","QA / "+weeks.length+" SELECTED WEEKS");
  set(dash,"E4",weeks.map((_,i)=>"W"+(i+1)).join("  VS  ")+"  •  Weekly performance");
  set(dash,"E5",scope.toUpperCase().replace(/_/g," ")+"   •   KPI TARGET 85%");
  set(dash,"M4","PREPARED BY · "+generatedBy);
  set(dash,"M5","GENERATED · "+generatedAt+" ICT");
  set(dash,"B8","BASE WEEK AVERAGE");set(dash,"B9",base ?? "—");set(dash,"B12",weeks[0]);
  set(dash,"F8","LATEST WEEK AVERAGE");set(dash,"F9",latest ?? "—");set(dash,"F12",weeks[weeks.length-1]);
  set(dash,"J8","CHANGE (pp)");set(dash,"J9",difference(base,latest) ?? "—");set(dash,"J12","Latest minus base");
  set(dash,"N8","WEEKS SELECTED");set(dash,"N9",weeks.length);set(dash,"N12",cases.length+" total evaluated cases");
  set(dash,"B15","01  •  WEEK-BY-WEEK PERFORMANCE");set(dash,"K15","02  •  TOPIC COMPARISON");
  set(dash,"B17","SELECTED WEEK");set(dash,"F17","CASES");set(dash,"G17","AVERAGE");set(dash,"H17","Δ (pp)");set(dash,"I17","AGENTS");
  const positions=[19,21,23,25];
  data.slice(0,4).forEach((w,i)=>{
    const row=positions[i];
    set(dash,"B"+row,w.label);
    set(dash,"F"+row,w.cases.length);
    set(dash,"G"+row,averages[i]??"—");
    set(dash,"H"+row,i===0?"BASE":difference(averages[i-1],averages[i])??"—");
    set(dash,"I"+row,distinctAgents(w.cases));
  });
  set(dash,"K17","QA TOPIC");set(dash,"O17","BASE %");set(dash,"P17","LATEST %");
  codes.slice(0,4).forEach((code,i)=>{
    const row=18+i*2;
    set(dash,"K"+row,nameOf(code));set(dash,"O"+row,topicByWeek[0].get(code)??"—");
    set(dash,"P"+row,topicByWeek[topicByWeek.length-1].get(code)??"—");
  });
  set(dash,"B45","03  •  AGENT COMPARISON BY WEEK");
  set(dash,"B47","AGENT");
  const headers=["F47","H47","K47","N47"];
  data.slice(0,4).forEach((_,i)=>set(dash,headers[i],"W"+(i+1)));
  if(data.length<4)set(dash,headers[data.length],"Δ (pp)");
  agentNames.slice(0,12).forEach((agent,i)=>{
    const row=48+i;set(dash,"B"+row,agent);
    const points=data.map(w=>average(w.cases.filter(c=>agentOf(c)===agent)));
    data.slice(0,4).forEach((_,j)=>set(dash,["F","H","K","N"][j]+row,points[j]??"—"));
    if(data.length<4)set(dash,["F","H","K","N"][data.length]+row,difference(points[0],points.at(-1)??null)??"—");
  });
  set(dash,"B63","SOURCE  •  QA Dashboard / verified canonical case records");
  set(dash,"B66","Δ in percentage points; blank week/agent scores are not treated as zero. Details in Weekly / Agent / Topic / Tag Comparison.");
  dash["!merges"]=[
    merged("E2","L3"),merged("M2","P3"),merged("E4","L4"),merged("M4","P4"),merged("E5","L5"),merged("M5","P5"),
    ...[["B","D"],["F","H"],["J","L"],["N","P"]].flatMap(([a,b])=>[
      merged(a+"8",b+"8"),merged(a+"9",b+"10"),merged(a+"12",b+"12")
    ]),
    merged("B15","I15"),merged("K15","P15"),
    ...positions.map(row=>merged("B"+row,"E"+row)),
    ...[18,20,22,24].map(row=>merged("K"+row,"N"+row)),
    merged("B45","P45"),merged("B47","E47"),
    ...Array.from({length:12},(_,i)=>{
      const row=i+48;return [
        merged("B"+row,"E"+row),merged("F"+row,"G"+row),
        merged("H"+row,"J"+row),merged("K"+row,"M"+row),merged("N"+row,"P"+row)
      ];
    }).flat(),
    merged("B63","P63"),merged("B66","P66"),
  ];
  dash["!cols"]=Array.from({length:16},(_,i)=>({wch:i===0?3:i===1?25:i===9?3:15}));
  dash["!rows"]=Array.from({length:66},(_,i)=>({hpt:i===1||i===2?28:i===3||i===4?25:i===5?10:i===6?13:i===14||i===44?32:i===16||i===46?30:i===8||i===9?26:23}));
  book.Sheets["Compare Dashboard"]=dash;
  // Weekly Compare is a comparison report, not a second copy of the
  // aggregate Monthly dashboard. Keep only the seven distinct, actionable tabs.
  const useful = ["Compare Dashboard","Weekly Summary","Agent Comparison","Topic Comparison",
    "Tag Comparison","Case Detail","Comment Detail"];
  const redundant = ["Dashboard","Performance Summary","Agent Performance","Topic Performance","Tag Analysis"];
  redundant.forEach(name=>{delete book.Sheets[name];});
  book.SheetNames=useful.filter(name=>Boolean(book.Sheets[name]));
}
