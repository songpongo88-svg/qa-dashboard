// Offline checks only: no browser, network, credentials or production data writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
const parse = (file) => ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function run(code, dependencies = {}) {
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  return Function("exports", ...Object.keys(dependencies), `${js}\nreturn exports;`)({}, ...Object.values(dependencies));
}
function moduleCode(file) { return parse(file).statements.filter((s) => !ts.isImportDeclaration(s)).map((s) => s.getText()).join("\n"); }
function find(file, predicate) {
  let result;
  function visit(node) { if (!result && predicate(node)) result = node; if (!result) ts.forEachChild(node, visit); }
  visit(parse(file)); assert.ok(result, `Missing anchor in ${file}`); return result;
}
function value(file, name, dependencies) {
  const node = find(file, (n) => ts.isVariableDeclaration(n) && n.name.getText() === name);
  return run(`export const result = ${node.initializer.getText()};`, { useMemo: (fn) => fn(), ...dependencies }).result;
}
const identity = run(moduleCode("lib/agentIdentity.ts"));
const scope = run(moduleCode("lib/evaluationScope.ts"));
const kpi = run(moduleCode("lib/monthlyKpi.ts"), { ...identity, ...scope });
let checks = 0;
function check(label, fn) { fn(); checks++; console.log(`PASS ${label}`); }
const rows = (n, score = 85, agent = "Agent One", monthKey = "2026-08") => Array.from({ length: n }, (_, i) => ({ agent, monthKey, caseId: `${agent}-${i}`, finalScore: score }));
const calculate = (n, total) => kpi.calculateMonthlyKpi(Array(n).fill(n ? total / n : 0));

check("all seven monthly scenarios and 10-case completion gate", () => {
  for (const [n, total, state, required] of [[0,0,"empty",85], [8,660,"behind",95], [6,540,"ahead",77.5], [9,855,"secured",0], [8,640,"unreachable",105], [10,872,"passed",null], [10,839,"not-passed",null]]) {
    const result = calculate(n, total);
    assert.equal(result.state, state);
    assert.equal(result.requiredAverage === null ? null : Math.round(result.requiredAverage * 100) / 100, required);
    if (n < 10) assert.equal(result.status, "pending");
    const message = kpi.getMonthlyKpiMessage(result);
    assert.ok(message.label && message.value && message.text);
    if (n < 10) assert.doesNotMatch(message.status, /^(ผ่าน|ไม่ผ่าน) KPI/);
  }
  assert.equal(calculate(0,0).average, null);
  assert.equal(calculate(8,640).maxFinalAverage, 84);
});

check("minimum target rounds upwards, exact pass boundary and no zero division", () => {
  assert.equal(kpi.formatRequiredKpiScore(91.666666666), "91.67");
  assert.equal(kpi.formatRequiredKpiScore(77.5), "77.50");
  assert.equal(kpi.calculateMonthlyKpi([...Array(9).fill(85),84.999]).status, "not-passed");
  assert.equal(kpi.calculateMonthlyKpi(Array(10).fill(85)).status, "passed");
  assert.equal(calculate(8,650).requiredAverage, 100);
  assert.equal(calculate(8,649.999).state, "unreachable");
  const extra = kpi.calculateMonthlyKpi([...Array(10).fill(85),0]);
  assert.equal(extra.count, 11); assert.equal(extra.status, "not-passed");
  assert.equal(extra.requiredAverage, null); assert.equal(extra.remaining, 0);
});

check("full month, exact agent identity, real cases only and no duplicate appeal case", () => {
  const cases = [...rows(8,82.5), ...rows(2,100,"Agent Two"), ...rows(2,100,"Agent One","2026-07"),
    ...rows(1,100,"Agent One Extra"), { ...rows(1)[0],caseId:"test",isTestCase:true },
    { ...rows(1)[0],caseId:"raw-test",is_test_case:true },
    { ...rows(1)[0],caseId:"invalid",finalScore:NaN },
    { ...rows(1)[0],caseId:"too-big",finalScore:101 },
    { ...rows(1)[0],caseId:"too-small",finalScore:-1 }];
  const before = JSON.stringify(cases);
  const selected = kpi.selectMonthlyKpiCases(cases," agent  one ","2026-08");
  assert.equal(selected.length,8);
  assert.equal(kpi.calculateMonthlyKpi(selected.map((x)=>x.finalScore)).requiredAverage,95);
  assert.equal(JSON.stringify(cases),before);
  const revised = { ...selected[0],finalScore:90,previousScore:82.5,reviewStatus:"Revised" };
  const latest = kpi.selectMonthlyKpiCases([...selected,revised],"Agent One","2026-08");
  assert.equal(latest.length,8); assert.equal(latest[0].finalScore,90);
  for (const [agent,month] of [["all","2026-08"],["","2026-08"],["Agent","2026-08"],["Agent One","all"],["Agent One","2026-13"]]) {
    assert.deepEqual(kpi.selectMonthlyKpiCases(cases,agent,month),[]);
  }
});

check("notification snapshots change for a score edit, not sorting; separate viewer/month/agent", () => {
  const cases = rows(2,85);
  assert.equal(kpi.monthlyKpiSnapshot(cases),kpi.monthlyKpiSnapshot([...cases].reverse()));
  assert.notEqual(kpi.monthlyKpiSnapshot(cases),kpi.monthlyKpiSnapshot([{...cases[0],finalScore:80},{...cases[1],finalScore:90}]));
  const key = kpi.monthlyKpiNoticeKey("viewer","Agent One","2026-08");
  for (const args of [["other","Agent One","2026-08"],["viewer","Agent Two","2026-08"],["viewer","Agent One","2026-07"]]) assert.notEqual(key,kpi.monthlyKpiNoticeKey(...args));
});

const dashboard = "DashboardMockup.tsx";
const dedupeAgentNames = (names) => [...new Set(names)];
check("Dashboard popup consumes the authorized full month, ignoring weekly and search filters", () => {
  const deps = { ...kpi, authorizedSearchCases: rows(8,82.5), isMonthlyView:true, isAllAgentsView:false, effectiveSelectedAgent:"Agent One", selectedMonthKey:"2026-08", selectedWeek:"Week 3", dashboardCases:rows(1,100), caseExplorerCases:[], dateFrom:"2026-08-27" };
  const cases = value(dashboard,"monthlyKpiCases",deps);
  assert.equal(cases.length,8);
  assert.equal(value(dashboard,"monthlyKpiResult",{...deps,monthlyKpiCases:cases}).requiredAverage,95);
  assert.deepEqual(value(dashboard,"monthlyKpiCases",{...deps,authorizedSearchCases:[]}),[]);
  assert.deepEqual(value(dashboard,"monthlyKpiCases",{...deps,isAllAgentsView:true}),[]);
  assert.deepEqual(value(dashboard,"monthlyKpiCases",{...deps,isMonthlyView:false}),[]);
});

function dashboardState(cases, all=false, yearly=false, noCase=false, targets=[]) {
  const monthlyKpiResult = kpi.calculateMonthlyKpi(cases.map((item)=>item.finalScore));
  const deps = { ...kpi, dedupeAgentNames, CASE_TARGET:10, isMonthlyView:!yearly, isYearlyView:yearly, isAllAgentsView:all, monthlyKpiResult,
    visibleTargetAgents:targets, kpiPeriodCases:cases, selectedMonthKey:"2026-08", hasNoCaseMonthlyResult:noCase, kpiScoreTarget:85,
    kpiTargetAgentCount: Math.max(1,new Set(cases.map((c)=>c.agent)).size) };
  const monthlyKpiQuotaReady = value(dashboard,"monthlyKpiQuotaReady",deps);
  const kpiScopeSummary = value(dashboard,"kpiScopeSummary",{...deps,monthlyKpiQuotaReady});
  const label = value(dashboard,"kpiStatusLabel",{...deps,kpiScopeSummary});
  return {...deps,monthlyKpiQuotaReady,kpiScopeSummary,label};
}
check("KPI card remains neutral for 0–9 cases, even at 100 or a No Case record", () => {
  for(let n=0;n<10;n++) for(const score of [0,85,100]) {
    const result = dashboardState(rows(n,score),false,false,n===0);
    assert.equal(result.kpiScopeSummary.status,"in-progress"); assert.equal(result.label,"—"); assert.equal(result.kpiScopeSummary.passed,false);
  }
  assert.equal(dashboardState(rows(10,85)).label,"Passed");
  assert.equal(dashboardState(rows(10,84.999)).label,"Not Passed");
  assert.equal(dashboardState(rows(1,90),false,true).label,"Passed"); // existing Yearly policy unchanged
});
check("all-agent completion checks each person's quota, including known zero-case agents", () => {
  assert.equal(dashboardState([...rows(11,100),...rows(9,100,"Agent Two")],true).label,"—");
  assert.equal(dashboardState([...rows(10,85),...rows(10,85,"Agent Two")],true).label,"Passed");
  assert.equal(dashboardState(rows(10,85),true,false,false,["Agent One","Agent Two"]).label,"—");
});

const hooks = {useMemo:React.useMemo,useRef:React.useRef,useState:React.useState,useEffect:React.useEffect};
const Component = run(moduleCode("MonthlyKpiNotice.tsx"),{React,...hooks,...kpi}).default;
check("popup renders all scenarios with agent/month, safe labels and capped progress", () => {
  for(const [n,total] of [[0,0],[8,660],[6,540],[9,855],[8,640],[10,872],[10,839],[11,850]]) {
    const html = renderToStaticMarkup(React.createElement(Component,{cases:rows(n,n?total/n:0),agent:"Agent <One>",monthKey:"2026-08",monthLabel:"August 2026",viewer:"viewer"}));
    assert.match(html,/Agent &lt;One&gt;/); assert.match(html,/August 2026/);
    assert.match(html,/<dialog/); assert.match(html,/aria-labelledby="qmk-title"/);
    assert.match(html,new RegExp(`aria-valuenow="${Math.min(10,n)}"`));
    assert.doesNotMatch(html,/NaN|Infinity|ข้อมูลสมมติ/);
    assert.match(html,/ไม่รวม Test Case/); assert.match(html,/รับทราบ/);
  }
});
check("native modal has Escape/dismiss/reopen and hidden-workspace cleanup", () => {
  const code = source("MonthlyKpiNotice.tsx");
  assert.match(code,/onCancel=\{\(event\) => \{ event.preventDefault\(\); setOpen\(false\); \}\}/);
  assert.match(code,/dialog.showModal\(\)/); // native focus trap and focus restoration
  assert.match(code,/if \(dialog.open\) dialog.close\(\)/);
  assert.match(code,/onClick=\{\(\) => setOpen\(true\)\}/);
  assert.match(code,/attributeFilter: \["aria-hidden"\]/);
  assert.match(code,/observer.disconnect\(\)/);
  assert.match(code,/window.clearTimeout\(timer\)/);
});
check("automatic notices, dismissal, score refresh and retained-workspace visibility execute correctly", () => {
  const memory = new Map(), timers = new Map(), slots = [];
  let index = 0, dirty = false, pending = [], tree, observerCallback, hidden = false, timerId = 0;
  const workspace = { getAttribute: () => String(hidden) };
  const root = { closest: () => workspace };
  const dialog = { open:false, opens:0, showModal(){this.open=true;this.opens++;}, close(){this.open=false;} };
  const fakeHooks = {
    useMemo:(fn)=>fn(),
    useRef:(initial)=>{const id=index++;return slots[id] ||= {current:initial};},
    useState:(initial)=>{const id=index++;if(!slots[id])slots[id]={value:initial};return [slots[id].value,(next)=>{const v=typeof next==="function"?next(slots[id].value):next;if(v!==slots[id].value){slots[id].value=v;dirty=true;}}];},
    useEffect:(effect,deps)=>{const id=index++,old=slots[id];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){pending.push(()=>{old?.cleanup?.();slots[id]={deps,cleanup:effect()};});}}
  };
  const window = { sessionStorage:{getItem:(key)=>memory.get(key)||null,setItem:(key,v)=>memory.set(key,v)},setTimeout:(fn)=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:(id)=>timers.delete(id) };
  class Observer {constructor(fn){observerCallback=fn;} observe(){} disconnect(){observerCallback=null;}}
  const Popup = run(moduleCode("MonthlyKpiNotice.tsx"),{React,...fakeHooks,...kpi,window,MutationObserver:Observer}).default;
  let props={cases:rows(8,82.5),agent:"Agent One",monthKey:"2026-08",monthLabel:"August 2026",viewer:"viewer"};
  const visit=(node,fn)=>{if(!React.isValidElement(node))return;fn(node);React.Children.forEach(node.props.children,(child)=>visit(child,fn));};
  function flush(){let guard=0;do{dirty=false;index=0;pending=[];tree=Popup(props);visit(tree,(el)=>{if(el.ref)el.ref.current=el.type==="dialog"?dialog:root;});pending.forEach((fn)=>fn());assert.ok(++guard<10,"render loop");}while(dirty);}
  function tick(){for(const [id,fn] of [...timers]){timers.delete(id);fn();}flush();}
  function action(predicate,event){let clicked=false;visit(tree,(el)=>{if(!clicked&&predicate(el)){clicked=true;event(el.props);}});assert.ok(clicked);flush();}
  flush(); assert.equal(dialog.open,false); tick(); assert.equal(dialog.open,true); assert.equal(memory.size,1);
  action((el)=>el.type==="button"&&el.props.children==="รับทราบ",(p)=>p.onClick()); assert.equal(dialog.open,false);
  props={...props,cases:[...props.cases].reverse()};flush();tick();assert.equal(dialog.open,false);
  action((el)=>el.type==="button"&&el.props["aria-haspopup"]==="dialog",(p)=>p.onClick());assert.equal(dialog.open,true);
  action((el)=>el.type==="dialog",(p)=>p.onCancel({preventDefault(){}}));assert.equal(dialog.open,false);
  props={...props,cases:props.cases.map((c,i)=>i?c:{...c,finalScore:90})};flush();tick();assert.equal(dialog.open,true);
  hidden=true;observerCallback();flush();assert.equal(dialog.open,false);
  props={...props,cases:props.cases.map((c,i)=>i?c:{...c,finalScore:95})};flush();tick();assert.equal(dialog.open,false);
  hidden=false;observerCallback();flush();tick();assert.equal(dialog.open,true);
  for(const slot of slots)slot?.cleanup?.();assert.equal(dialog.open,false);assert.equal(timers.size,0);
});
check("monthly analytics status is also pending before ten without changing grade or incentive", () => {
  assert.match(source("SummaryMockup.tsx"),/const kpiPending = monthlyMode && caseCount < CASE_TARGET/);
  assert.match(source("SummaryMockup.tsx"),/รอครบ 10 เคส \(\$\{row.caseCount\}\/10\)/);
  const card = find(dashboard,(n)=>ts.isObjectLiteralExpression(n) && n.properties.some((p)=>p.name?.getText()==="label" && p.initializer?.getText()==='"KPI Status"'));
  for(const n of [0,9,10]) {
    const state=dashboardState(rows(n,90));
    const item=run(`export const card=${card.getText()};`,{...state,kpiStatusLabel:state.label}).card;
    if(n<10){assert.equal(item.value,"—");assert.match(item.note,/รอประเมินครบ 10 เคส/);assert.doesNotMatch(item.iconTone,/emerald|rose/);}
    else assert.equal(item.value,"Passed");
  }
});
console.log(`\n${checks} monthly KPI checks passed.`);
