import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import ts from "typescript";
import * as XLSX from "xlsx";
import { JSDOM } from "jsdom";
import { analyticsCompareUiRedesignPatch } from "../build/analyticsCompareUiRedesignPatch.js";

const rootDir = new URL("../", import.meta.url).pathname;
const temp = await fs.mkdtemp(path.join(rootDir, ".yearly-summary-test-"));
const dom = new JSDOM('<div id="root"></div>', { url: "https://qa.test/", pretendToBeVisual: true });
for (const key of ["window", "document", "HTMLElement", "HTMLSelectElement", "Event", "CustomEvent", "MouseEvent", "MutationObserver", "sessionStorage", "localStorage"]) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = globalThis.__yearlySummaryFixture = { records: [], events: [], downloads: [], pdfs: [], assertions: [], alerts: [], blobs: new Map(), fail: false };
const agent = "Fixture Agent A";
const header = ["Agent Name", "Case ID", "Case Date", "Audit Date", "Month Key", "Month Label", "Final Score", "1 Score", "2 Score", "3 Score", "4 Score"];
const row = (id, date, score, month = date.slice(0, 7)) => [agent, id, date, "2026-07-02", month, "July 2026", score, 20, 20, 20, 20];
function workbook(rows) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([header, ...rows]), "Raw_Data");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}
const historical = workbook([row("JAN-AUTH", "2026-01-15", 94)]);
const raw = workbook([row("JAN-OTHER", "2026-01-16", 1), row("MAR-RAW", "2026-03-15", 80),
  row("JUNE-START", "2026-06-01", 80), row("JUNE-END", "2026-06-30", 100, "2026-07")]);
const emptyAppeal = workbook([]);
const record = (caseId, month, score, owner = agent) => ({ id: caseId, caseId, agentName: owner,
  targetDisplayName: owner, auditDate: `${month}-15`, auditTimestamp: "2026-07-03T03:00:00Z",
  submittedAt: "2026-07-03T03:00:00Z", finalScore: score, inquiry: "ข้อมูลทดสอบ", evidenceUrls: [],
  topics: [30, 20, 25, 25].map((max, index) => ({ code: String(index + 1), title: `Topic ${index + 1}`, score: max, max })) });
fixture.records = [record("JAN-WEB", "2026-01", 5), record("MAR-RAW", "2026-03", 99),
  record("MAR-NEW", "2026-03", 70), { ...record("JUNE-ZERO", "2026-06", 0), criticalError: true },
  record("JUNE-OTHER", "2026-06", 96, "Fixture Agent B"), { ...record("JUNE-TEST", "2026-06", 5), isTestCase: true }];
const topics = [20, 20, 20, 20].map((score, index) => ({ code: String(index + 1), label: `Topic ${index + 1}`, score, max: [30, 20, 25, 25][index], wantsAppeal: index === 0, appealReason: index === 0 ? "Review" : "ไม่อุทธรณ์หัวข้อนี้" }));
fixture.events = [
  { event_type: "appeal_request_submitted", case_id: "JUNE-START", target_agent: agent, created_at: "2026-07-03T03:00:00Z", details: { requestId: "june-appeal", agent, auditDate: "2026-06-01", finalScore: 80, topics } },
  { event_type: "appeal_request_reviewed", case_id: "JUNE-START", target_agent: agent, created_at: "2026-07-03T04:00:00Z", details: { requestId: "june-appeal", reviewId: "review-1", decision: "Approved", topics: [{ ...topics[0], decision: "Approved", revisedScore: 30, revisedComment: "Corrected" }] } },
];
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => new Response(String(url).includes("January-February") ? historical : /appeal|appleal/i.test(String(url)) ? emptyAppeal : /rawdata/i.test(String(url)) ? raw : null, { status: /xlsx/i.test(String(url)) ? 200 : 404 });
function replaceFunction(source, name, body) {
  const ast = ts.createSourceFile("fixture.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node?.body, name);
  return source.slice(0, node.body.pos) + " " + body + source.slice(node.body.end);
}
let root;
try {
  const bundlePath = path.join(temp, "reports.mjs");
  await build({ stdin: { contents: `export {loadCanonicalReportData} from './src/DashboardMockup'; export {loadCanonicalSignatureDocuments} from './src/SignatureCenterMockup'; export {buildYearlyTeamReport,buildYearlyTeamSummaryWorkbook,createYearlyTeamSummaryXlsx} from './src/yearlyTeamSummaryData'; export {default as Summary} from './src/SummaryMockup'; export {EvaluationActivityContext} from './src/EvaluationActivityContext'; export {getAppealScoreHold} from './src/pendingAppealScore'; import React,{act} from 'react';import {Simulate} from 'react-dom/test-utils';import {createRoot} from 'react-dom/client';export {React,act,Simulate,createRoot};`, resolveDir: rootDir, loader: "tsx" }, outfile: bundlePath,
    bundle: true, jsx: "automatic", platform: "node", format: "esm", packages: "external", loader: { ".css": "empty" }, define: { "import.meta.env": "{}" }, logLevel: "silent", plugins: [{ name: "report-fixtures", setup(builder) {
      builder.onResolve({ filter: /\?url$/ }, () => ({ path: "worker", namespace: "fixture-asset" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-asset" }, () => ({ contents: 'export default "/fixture-worker.mjs";', loader: "js" }));
      builder.onResolve({ filter: /^\.\/PageHero$/ }, () => ({ path: "hero", namespace: "fixture-hero" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-hero" }, () => ({ contents: "export default function Hero(){return null;}", loader: "js" }));
      builder.onLoad({ filter: /\/SummaryMockup\.tsx$/ }, async args => {
        const source=await fs.readFile(args.path,"utf8");
        const patch=analyticsCompareUiRedesignPatch();
        const transformed=patch.transform.call({error:message=>{throw new Error(message);}},source,args.path);
        return {loader:"tsx",contents:transformed?.code||source};
      });
      builder.onResolve({ filter: /^jspdf$/ }, args => args.namespace === "fixture-pdf" ? { path: "jspdf", external: true } : { path: "pdf", namespace: "fixture-pdf" });
      builder.onLoad({ filter: /.*/, namespace: "fixture-pdf" }, () => ({ loader: "js", contents: `import {jsPDF as RealPdf} from 'jspdf';export class jsPDF extends RealPdf{constructor(...args){super(...args);const f=globalThis.__yearlySummaryFixture;f.pdfs.push(this);this.save=fileName=>f.downloads.push({fileName,pdf:this});}}` }));
      builder.onLoad({ filter: /\/evaluationStore\.ts$/ }, async args => ({ loader: "ts", contents: replaceFunction(await fs.readFile(args.path, "utf8"), "fetchStoredEvaluations", `{ const f=globalThis.__yearlySummaryFixture;if(f.fail)throw Error('Source unavailable');if(!options.strict||!options.allMonths)throw Error('Incomplete report read');return f.records; }`) }));
      builder.onLoad({ filter: /\/appealStore\.ts$/ }, async args => ({ loader: "ts", contents: replaceFunction(await fs.readFile(args.path, "utf8"), "fetchAppealEvents", `{ return globalThis.__yearlySummaryFixture.events.filter(event=>!eventTypes||eventTypes.includes(event.event_type)); }`) }));
      builder.onLoad({ filter: /\/evaluationEditingStore\.ts$/ }, async args => ({ loader: "ts", contents: replaceFunction(await fs.readFile(args.path, "utf8"), "assertEvaluationScopeComplete", `{ globalThis.__yearlySummaryFixture.assertions.push({agents,months}); }`) }));
      builder.onLoad({ filter: /\/userRoleStore\.ts$/ }, async args => { let source = await fs.readFile(args.path, "utf8"); source = replaceFunction(source, "fetchStoredUserProfiles", "{ return []; }"); source = replaceFunction(source, "fetchStoredRolePermissions", "{ return []; }"); return { loader: "ts", contents: source }; });
    } }] });
  const { loadCanonicalReportData, loadCanonicalSignatureDocuments, buildYearlyTeamReport, buildYearlyTeamSummaryWorkbook, createYearlyTeamSummaryXlsx, Summary, EvaluationActivityContext, getAppealScoreHold, React, act, Simulate, createRoot } = await import(pathToFileURL(bundlePath));
  const source = await loadCanonicalReportData();
  const documents = await loadCanonicalSignatureDocuments();
  assert.deepEqual(source.cases.filter(item => item.monthKey === "2026-01").map(item => item.caseId), ["JAN-AUTH"]);
  assert.equal(documents.find(item => item.id === `2026-03::${agent}`).averageScore, 75, "retain raw scores and include new stored cases in a raw-data month");
  const june = documents.find(item => item.id === `2026-06::${agent}`);
  assert.equal(june.caseCount, 3, "whole month includes both boundaries and excludes Test Case");
  assert.equal(june.cases.find(item => item.caseId === "JUNE-ZERO").finalScore, 0, "zero score never falls back to a topic sum");
  assert.equal(june.cases.find(item => item.caseId === "JUNE-START").finalScore, 90, "resolved web appeal is included");
  assert.equal(june.averageScore, (90 + 100) / 3);
  const sourceCases = source.cases.filter(item => item.agent === agent);
  const yearly = buildYearlyTeamReport(sourceCases, "2026", { agentNames: [agent, "No Case Agent"] });
  assert.equal(yearly.months.length, 12);
  assert.deepEqual(yearly.months.map(item => item.label), ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
  assert.equal(yearly.caseCount, 6);
  assert.equal(yearly.averageScore, 434 / 6, "annual average uses actual cases, not an average of monthly averages");
  assert.equal(yearly.months[5].averageScore, june.averageScore);
  assert.equal(yearly.months[5].caseCount, june.caseCount);
  assert.equal(yearly.months[5].criticalCount, 1);
  assert.equal(yearly.months[11].averageScore, null, "an empty month has no fabricated score");
  assert.ok(!yearly.topAgents.some(item => item.agent === "No Case Agent"));
  assert.ok(!yearly.bottomAgents.some(item => item.agent === "No Case Agent"));
  assert.equal(yearly.agents.find(item => item.agent === "No Case Agent").averageScore, null);
  const uneven = buildYearlyTeamReport([record("ONE", "2026-01", 100), ...Array.from({length:9},(_,i)=>record("MANY"+i,"2026-06",80))].map(item=>({...item,agent:item.agentName,monthKey:item.auditDate.slice(0,7)})),"2026");
  assert.equal(uneven.averageScore, 82);
  const zero = buildYearlyTeamReport([{agent,caseId:"ZERO",monthKey:"2026-06",finalScore:0}],"2026");
  assert.equal(zero.averageScore, 0);assert.equal(zero.criticalCount, 0, "a numeric zero alone is not a Critical Error");
  const ties = buildYearlyTeamReport(["Alpha","Beta"].map((name,index)=>({agent:name,caseId:String(index),monthKey:"2026-06",finalScore:90})),"2026");
  assert.equal(ties.topAgents.length,2);assert.equal(ties.bottomAgents.length,2);
  console.log("PASS Yearly: all 12 months including June, actual-case weighted average, Critical flags, Test Case exclusion, valid zero, empty months and tied rankings");
  root = createRoot(document.getElementById("root"));
  const props = { currentUser: { username: "qa", displayName: "QA Reviewer", role: "Quality Assurance" }, externalSelectedAgent: agent, externalSelectedMonth: "2026-06", externalSelectedWeek: "W1", canViewAllAgents: true, canViewAllTeams: true, canExportAnalytics: true };
  const render = async (extra={},activity=null) => act(async () => root.render(activity ? React.createElement(EvaluationActivityContext.Provider,{value:activity},React.createElement(Summary,{...props,...extra})) : React.createElement(Summary,{...props,...extra})));
  const settle = async condition => { for (let i = 0; i < 160; i++) { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); if (condition()) return; } assert.fail("UI did not settle: " + document.body.textContent.slice(-800)); };
  const button = label => [...document.querySelectorAll("button")].find(item => item.textContent.trim().replace(/^⇩\s*/, "") === label || item.firstElementChild?.textContent.trim() === label);
  window.alert = message => fixture.alerts.push(String(message));
  const nativeCreateUrl = URL.createObjectURL, nativeRevokeUrl = URL.revokeObjectURL;
  URL.createObjectURL = blob => {const url="blob:yearly-"+fixture.blobs.size;fixture.blobs.set(url,blob);return url;};
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function(){fixture.downloads.push({fileName:this.download,blob:fixture.blobs.get(this.href)});};
  sessionStorage.setItem("qa_analytics_mode_v134", "monthly");
  await render();await settle(()=>button("Export"));
  await act(async()=>button("Export").click());
  assert.ok(!document.body.textContent.includes("Monthly Team Summary PDF"),"the mistaken monthly export menu is removed");
  await act(async()=>button("Export").click());
  await act(async()=>button("Yearly View").click());
  await settle(()=>document.querySelector('[data-yearly-report="2026"]'));
  assert.equal(document.querySelectorAll('[data-yearly-month]').length,12,"Yearly itself displays all months");
  const juneRow=document.querySelector('[data-yearly-month="2026-06"]');
  assert.deepEqual([...juneRow.children].map(cell=>cell.textContent),["June","3","63.33","1","2","0","0","1"]);
  assert.ok(document.querySelector('[data-yearly-metric="Team Cases"]').textContent.includes("6"));
  assert.ok(document.querySelector('[data-yearly-metric="Avg Score"]').textContent.includes("72.33"));
  assert.ok(document.body.textContent.includes("Top / Bottom Agent by Year"));
  await act(async()=>button("Export").click());await act(async()=>button("Excel").click());
  await settle(()=>fixture.downloads.length===1);
  assert.equal(fixture.downloads[0].fileName,"Yearly_Team_Summary.xlsx");
  assert.ok(fixture.assertions.length>=2);
  assert.ok(fixture.assertions.every(scope=>scope.months.length===12&&scope.months.includes("2026-01")&&scope.months.includes("2026-12")),"Yearly verifies all 12 months, even after a June/week selection");
  const bytes=new Uint8Array(await fixture.downloads[0].blob.arrayBuffer());
  const book=XLSX.read(bytes,{type:"array",cellStyles:true,cellNF:true});
  assert.deepEqual(book.SheetNames,["Yearly_Team_Summary"]);
  const sheet=book.Sheets.Yearly_Team_Summary;
  assert.equal(sheet.A1.v,"Yearly Team Summary");assert.equal(sheet.B6.v,2026);
  assert.equal(sheet.E6.v,6);assert.equal(sheet.E6.f,"SUM(B13:B24)");
  assert.equal(sheet.H6.v,434/6);assert.ok(sheet.H6.f.includes("SUMPRODUCT"));
  assert.equal(sheet.B8.v,1);assert.equal(sheet.A11.v,"Monthly Team Trend");
  assert.equal(sheet.B18.v,3);assert.equal(sheet.C18.v,190/3);assert.equal(sheet.C18.t,"n");
  assert.equal(sheet.A13.z,"mmmm");assert.equal(sheet.C18.z,"0.00");
  assert.equal(sheet.A27.v,"Top / Bottom Agent by Year");assert.equal(sheet.A32.v,"Seq");
  assert.ok(!XLSX.utils.sheet_to_csv(sheet).includes("Fixture Agent B"),"export preserves the selected Agent scope");
  const {default:JSZip}=await import("jszip");const zip=await JSZip.loadAsync(bytes);
  assert.ok(!Object.keys(zip.files).some(name=>name.includes("externalLinks")),"no old workbook dependencies are exported");
  for(const name of ["xl/styles.xml","xl/worksheets/sheet1.xml"]){const xml=await zip.file(name).async("string");const parsed=new dom.window.DOMParser().parseFromString(xml,"application/xml");assert.equal(parsed.querySelector("parsererror"),null,name+" is valid XML");}
  const xml=await zip.file("xl/worksheets/sheet1.xml").async("string");assert.ok(xml.includes('ySplit="12"'));assert.ok(xml.includes('s="3"'));
  await fs.mkdir(path.join(rootDir,"verification/yearly-fix"),{recursive:true});
  await fs.writeFile(path.join(rootDir,"verification/yearly-fix/Yearly_Team_Summary.xlsx"),bytes);
  console.log("PASS actual Yearly view and existing Export → Excel: template layout, 12 months, numeric scores, totals/formulas, styles, scope and no external links");
  fixture.fail=true;
  await assert.rejects(loadCanonicalReportData(),/Source unavailable/);
  await assert.rejects(loadCanonicalSignatureDocuments(),/Source unavailable/);
  await act(async()=>button("Export").click());await act(async()=>button("Excel").click());
  await settle(()=>fixture.alerts.some(message=>message.includes("Source unavailable")));
  assert.equal(fixture.downloads.length,1,"failed reads cannot export partial reports");
  fixture.fail=false;fixture.events=fixture.events.slice(0,1);
  await act(async()=>button("Excel").click());
  await settle(()=>fixture.alerts.some(message=>message.includes("Awaiting")));
  assert.equal(fixture.downloads.length,1,"a pending June appeal holds the annual export");
  const held = buildYearlyTeamReport((await loadCanonicalReportData()).cases,"2026");
  assert.ok(held.hold);assert.throws(()=>buildYearlyTeamSummaryWorkbook([held],{team:"All Teams",agent:"All Agents"}));
  console.log("PASS source failures and unfinished appeals block annual exports rather than publishing partial or unconfirmed scores");
  fixture.events=fixture.events.concat([{ event_type: "appeal_request_reviewed", case_id: "JUNE-START", target_agent: agent, created_at: "2026-07-03T04:00:00Z", details: { requestId: "june-appeal", reviewId: "review-1", decision: "Approved", topics: [{ ...topics[0], decision: "Approved", revisedScore: 30 }] } }]);
  const activity={ready:true,error:false,now:Date.now(),records:[{id:"edit",username:"a",displayName:agent,evaluatorUsername:"qa",evaluatorName:"QA",mode:"edit",monthKey:"2026-01",persistent:true,isTestCase:false,caseId:"JAN-AUTH"}]};
  await render({},activity);await settle(()=>document.querySelector('[data-yearly-report="2026"]'));
  assert.ok(document.querySelector('[data-yearly-month="2026-01"]').textContent.includes("Editing"));
  assert.ok(document.querySelector('[data-yearly-month="2026-06"]').textContent.includes("63.33"),"editing January does not hide a completed June row");
  await act(async()=>button("Export").click());await act(async()=>button("Excel").click());
  await settle(()=>fixture.alerts.some(message=>message.includes("Editing")));
  assert.equal(fixture.downloads.length,1);
  await render({roleScopedAgentNames:[agent],canViewAllAgents:false,canViewAllTeams:false});
  await settle(()=>document.querySelector('[data-yearly-report="2026"]'));
  assert.ok(![...document.querySelectorAll('[data-yearly-agent]')].some(row=>row.dataset.yearlyAgent==="Fixture Agent B"));
  console.log("PASS annual editing holds cover January–December; completed month rows remain readable and self-only Agent scope is preserved");
  await render({externalSelectedAgent:"all"});
  await settle(()=>document.querySelector('[data-yearly-metric="Team Cases"]')?.textContent.includes("7"));
  if (!button("Excel")) await act(async()=>button("Export").click());
  await act(async()=>button("Excel").click());
  await settle(()=>fixture.downloads.length===2);
  const allBytes=new Uint8Array(await fixture.downloads[1].blob.arrayBuffer());
  const allSheet=XLSX.read(allBytes,{type:"array"}).Sheets.Yearly_Team_Summary;
  assert.equal(allSheet.E6.v,7);assert.equal(allSheet.H6.v,530/7);
  assert.equal(allSheet.B18.v,4);assert.equal(allSheet.C18.v,286/4);
  assert.equal(allSheet.B29.v,"Fixture Agent B");assert.equal(allSheet.B30.v,agent);
  await fs.writeFile(path.join(rootDir,"verification/yearly-fix/Yearly_Team_Summary.xlsx"),allBytes);
  console.log("PASS All Agents annual export reconciles team totals, June totals and annual Top / Bottom with the same canonical cases");
  // The annual PDF uses the same Yearly report source, not the generic Summary PDF.
  dom.window.document.fonts = { check: () => true, load: async () => [] };
  await act(async()=>button("Export").click());
  await act(async()=>button("PDF").click());
  await settle(()=>fixture.downloads.some(item=>item.fileName==="QA_Yearly_All_Teams_All_Agents_2026.pdf"));
  const pdfOutput=fixture.downloads.find(item=>item.fileName==="QA_Yearly_All_Teams_All_Agents_2026.pdf");
  assert.ok(pdfOutput?.pdf, "Yearly PDF was generated");
  assert.ok(pdfOutput.pdf.getNumberOfPages()>=2,"Yearly PDF includes a separate paginated Agent summary");
  const pdfContent=pdfOutput.pdf.internal.pages.flat().join(" ");
  for(const label of ["YEARLY TEAM SUMMARY","MONTHLY TEAM TREND","June","December","AGENT SUMMARY","Fixture Agent B"]) {
    assert.ok(pdfContent.includes(label), "Yearly PDF missing "+label);
  }
  assert.ok(pdfOutput.pdf.output("arraybuffer").byteLength > 1000,"Yearly PDF has nonempty bytes");
  const exportedPdfCount=fixture.downloads.length;
  fixture.fail=true;
  await act(async()=>button("Export").click());
  await act(async()=>button("PDF").click());
  await settle(()=>fixture.alerts.filter(message=>message.includes("Source unavailable")).length>=2);
  assert.equal(fixture.downloads.length,exportedPdfCount,"Failed data read cannot generate Yearly PDF");
  fixture.fail=false;
  console.log("PASS Yearly PDF: same strict source as Excel, January-December including June, full Agent list, multi-page and failed-source hold");
  URL.createObjectURL=nativeCreateUrl;URL.revokeObjectURL=nativeRevokeUrl;

} finally {
  if (root) { const { act } = await import("react"); await act(async () => root.unmount()); }
  globalThis.fetch = originalFetch;
  dom.window.close();
  delete globalThis.__yearlySummaryFixture;
  await fs.rm(temp, { recursive: true, force: true });
}
