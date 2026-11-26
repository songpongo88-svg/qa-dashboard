// Offline checks only: no browser, network, credentials or production data writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { evaluationAgentFocusPopupPatch } from "../build/evaluationAgentFocusPopupPatch.js";

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
function functions(file, names, dependencies = {}) {
  const code = names.map((name) => find(file, (node) => ts.isFunctionDeclaration(node) && node.name?.text === name).getText()
    .replace(/^export\s+(default\s+)?/, "")).join("\n");
  return run(`${code}\nexport { ${names.join(",")} };`, dependencies);
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
check("only an authorized Quality Assurance user receives all-Agent popup options", () => {
  const { isQualityAssuranceRole } = functions(dashboard,["isQualityAssuranceRole"]);
  for(const role of ["QA","Quality Assurance"," quality_assurance "]) assert.equal(isQualityAssuranceRole(role),true);
  for(const role of ["Admin Live Chat","Senior","Supervisor",""]) assert.equal(isQualityAssuranceRole(role),false);
  const canBrowse = (role,allowed) => value(dashboard,"qaCanBrowseMonthlyKpiAgents",{isQualityAssuranceRole,currentUser:{role},overviewCanSelectAgents:allowed});
  assert.equal(canBrowse("QA",true),true);
  assert.equal(canBrowse("QA",false),false);
  assert.equal(canBrowse("Supervisor",true),false);
  const authorizedSearchCases=[...rows(8,82.5),...rows(6,90,"Agent Two"),{...rows(1,100,"Agent Two")[0],caseId:"test",isTestCase:true}];
  const deps={...kpi,isMonthlyView:true,qaCanBrowseMonthlyKpiAgents:true,visibleAgentList:["Agent One","Agent Two","Agent Zero"],authorizedSearchCases,selectedMonthKey:"2026-08"};
  const options=value(dashboard,"qaMonthlyKpiAgentOptions",deps);
  assert.deepEqual(options.map((option)=>[option.agent,option.cases.length]),[["Agent One",8],["Agent Two",6],["Agent Zero",0]]);
  assert.deepEqual(value(dashboard,"qaMonthlyKpiAgentOptions",{...deps,qaCanBrowseMonthlyKpiAgents:false}),[]);
  assert.deepEqual(value(dashboard,"qaMonthlyKpiAgentOptions",{...deps,isMonthlyView:false}),[]);
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

check("retired KPI and evaluation notifications never render for any user or role", () => {
  const Monthly = run(moduleCode("MonthlyKpiNotice.tsx")).default;
  const Progress = run(moduleCode("QaEvaluationProgressNotice.tsx")).default;
  for (const role of ["Owner", "QA", "Admin Live Chat", "Senior", "Supervisor"]) {
    for (const n of [0,5,10]) {
      assert.equal(renderToStaticMarkup(React.createElement(Monthly,{cases:rows(n),agent:"Agent One",monthKey:"2026-08",monthLabel:"August 2026",viewer:role,canBrowseAgents:true,autoOpen:true})), "");
      assert.equal(renderToStaticMarkup(React.createElement(Progress,{currentUser:{username:role,role}})), "");
    }
  }
  assert.doesNotMatch(source(dashboard), /<MonthlyKpiNotice\\b/);
  const progressPatch=readFileSync(new URL("../build/qaEvaluationProgressPatch.js",import.meta.url),"utf8");
  assert.doesNotMatch(progressPatch, /<QaEvaluationProgressNotice\\b/);
  assert.match(progressPatch, /setQaEvaluationProgress/);
});
check("Agent selection keeps inline status and profile without a popup or timer", () => {
  const plugin=evaluationAgentFocusPopupPatch();
  const result=plugin.transform.call({error:message=>{throw Error(message);}},source("CreateEvaluationMockup.tsx"),"/src/CreateEvaluationMockup.tsx");
  assert.ok(result);
  assert.match(result.code,/Current Evaluation/);
  assert.match(result.code,/selectedAgentCaseCount/);
  assert.match(result.code,/setAgentName\\(event.target.value\\)/);
  assert.doesNotMatch(result.code,/agentFocusPopupOpen|agentFocusPopupTimerRef|evaluationAgentPopupIn|Close agent evaluation popup/);
  plugin.buildEnd.call({error:message=>{throw Error(message);}});
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
