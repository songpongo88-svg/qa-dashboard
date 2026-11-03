import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import ts from "typescript";
import * as XLSX from "xlsx";
import { JSDOM } from "jsdom";

const rootDir = new URL("../", import.meta.url).pathname;
const temp = await fs.mkdtemp(path.join(rootDir, ".monthly-summary-test-"));
const dom = new JSDOM('<div id="root"></div>', { url: "https://qa.test/", pretendToBeVisual: true });
for (const key of ["window", "document", "HTMLElement", "HTMLSelectElement", "Event", "CustomEvent", "MouseEvent", "MutationObserver", "sessionStorage", "localStorage"]) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = globalThis.__monthlySummaryFixture = { records: [], events: [], downloads: [], pdfs: [], assertions: [], fail: false };
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
  record("MAR-NEW", "2026-03", 70), record("JUNE-ZERO", "2026-06", 0),
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
  await build({ stdin: { contents: `export {loadCanonicalReportData} from './src/DashboardMockup'; export {loadCanonicalSignatureDocuments} from './src/SignatureCenterMockup'; export {createMonthlyTeamSummaryPdf} from './src/monthlyTeamSummaryPdf'; export {default as Summary} from './src/SummaryMockup'; export {EvaluationActivityContext} from './src/EvaluationActivityContext'; export {getAppealScoreHold} from './src/pendingAppealScore'; import React,{act} from 'react';import {Simulate} from 'react-dom/test-utils';import {createRoot} from 'react-dom/client';export {React,act,Simulate,createRoot};`, resolveDir: rootDir, loader: "tsx" }, outfile: bundlePath,
    bundle: true, jsx: "automatic", platform: "node", format: "esm", packages: "external", loader: { ".css": "empty" }, define: { "import.meta.env": "{}" }, logLevel: "silent", plugins: [{ name: "report-fixtures", setup(builder) {
      builder.onResolve({ filter: /\?url$/ }, () => ({ path: "worker", namespace: "fixture-asset" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-asset" }, () => ({ contents: 'export default "/fixture-worker.mjs";', loader: "js" }));
      builder.onResolve({ filter: /^\.\/PageHero$/ }, () => ({ path: "hero", namespace: "fixture-hero" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture-hero" }, () => ({ contents: "export default function Hero(){return null;}", loader: "js" }));
      builder.onResolve({ filter: /^jspdf$/ }, args => args.namespace === "fixture-pdf" ? { path: "jspdf", external: true } : { path: "pdf", namespace: "fixture-pdf" });
      builder.onLoad({ filter: /.*/, namespace: "fixture-pdf" }, () => ({ loader: "js", contents: `import {jsPDF as RealPdf} from 'jspdf';export class jsPDF extends RealPdf{constructor(...args){super(...args);const f=globalThis.__monthlySummaryFixture;f.pdfs.push(this);this.save=fileName=>f.downloads.push({fileName,pdf:this});}}` }));
      builder.onLoad({ filter: /\/evaluationStore\.ts$/ }, async args => ({ loader: "ts", contents: replaceFunction(await fs.readFile(args.path, "utf8"), "fetchStoredEvaluations", `{ const f=globalThis.__monthlySummaryFixture;if(f.fail)throw Error('Source unavailable');if(!options.strict||!options.allMonths)throw Error('Incomplete report read');return f.records; }`) }));
      builder.onLoad({ filter: /\/appealStore\.ts$/ }, async args => ({ loader: "ts", contents: replaceFunction(await fs.readFile(args.path, "utf8"), "fetchAppealEvents", `{ return globalThis.__monthlySummaryFixture.events.filter(event=>!eventTypes||eventTypes.includes(event.event_type)); }`) }));
      builder.onLoad({ filter: /\/evaluationEditingStore\.ts$/ }, async args => ({ loader: "ts", contents: replaceFunction(await fs.readFile(args.path, "utf8"), "assertEvaluationScopeComplete", `{ globalThis.__monthlySummaryFixture.assertions.push({agents,months}); }`) }));
      builder.onLoad({ filter: /\/userRoleStore\.ts$/ }, async args => { let source = await fs.readFile(args.path, "utf8"); source = replaceFunction(source, "fetchStoredUserProfiles", "{ return []; }"); source = replaceFunction(source, "fetchStoredRolePermissions", "{ return []; }"); return { loader: "ts", contents: source }; });
    } }] });
  const { loadCanonicalReportData, loadCanonicalSignatureDocuments, createMonthlyTeamSummaryPdf, Summary, EvaluationActivityContext, getAppealScoreHold, React, act, Simulate, createRoot } = await import(pathToFileURL(bundlePath));
  const source = await loadCanonicalReportData();
  const documents = await loadCanonicalSignatureDocuments();
  assert.deepEqual(source.cases.filter(item => item.monthKey === "2026-01").map(item => item.caseId), ["JAN-AUTH"]);
  assert.equal(documents.find(item => item.id === `2026-03::${agent}`).averageScore, 75, "retain raw scores and include new stored cases in a raw-data month");
  const june = documents.find(item => item.id === `2026-06::${agent}`);
  assert.equal(june.caseCount, 3, "whole month includes both boundaries and excludes Test Case");
  assert.equal(june.cases.find(item => item.caseId === "JUNE-ZERO").finalScore, 0, "zero score never falls back to a topic sum");
  assert.equal(june.cases.find(item => item.caseId === "JUNE-START").finalScore, 90, "resolved web appeal is included");
  assert.equal(june.averageScore, (90 + 100) / 3);
  const monthly = createMonthlyTeamSummaryPdf({ cases: source.cases.filter(item => !item.isTestCase && item.agent === agent), monthKey: "2026-06", agentLabel: agent, teamLabel: "All Teams", generatedBy: "QA Reviewer" });
  assert.equal(monthly.summary.averageScore, june.averageScore);
  assert.equal(monthly.summary.caseCount, june.caseCount);
  assert.equal(monthly.summary.grade, june.grade);
  await fs.mkdir(path.join(rootDir, "verification/report-fix"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "verification/report-fix/Monthly_Team_Summary_2026-06.pdf"), new Uint8Array(monthly.pdf.output("arraybuffer")));
  const team = createMonthlyTeamSummaryPdf({ cases: Array.from({ length: 70 }, (_, index) => ({ agent: `ทดสอบชื่อผู้ประเมินรายเดือน ${index + 1}`, monthKey: "2026-06", finalScore: 90 })), monthKey: "2026-06", agentLabel: "All Agents", teamLabel: "All Teams", generatedBy: "ผู้ตรวจสอบคุณภาพ" });
  assert.ok(team.pdf.getNumberOfPages() >= 3, "long team tables paginate");
  await fs.writeFile(path.join(rootDir, "verification/report-fix/Monthly_Team_Summary_team.pdf"), new Uint8Array(team.pdf.output("arraybuffer")));
  console.log("PASS Dashboard / Signatures / monthly PDF parity: January authority, Case Date month, raw-month additions, resolved appeals, Test Case exclusion and explicit zero");
  root = createRoot(document.getElementById("root"));
  sessionStorage.setItem("qa_analytics_mode_v134", "weekly");
  await act(async () => root.render(React.createElement(Summary, { currentUser: { username: "qa", displayName: "QA Reviewer", role: "Quality Assurance" }, externalSelectedAgent: agent, externalSelectedMonth: "2026-06", externalSelectedWeek: "W1", canViewAllAgents: true, canViewAllTeams: true, canExportAnalytics: true })));
  const settle = async condition => { for (let i = 0; i < 100; i++) { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); if (condition()) return; } assert.fail("UI did not settle: " + document.body.textContent.slice(-700)); };
  const button = label => [...document.querySelectorAll("button")].find(item => item.textContent.trim() === label);
  await settle(() => button("Export"));
  await act(async () => button("Export").click());
  const monthlyButton = [...document.querySelectorAll("button")].find(item => item.textContent.includes("Monthly Team Summary PDF"));
  assert.ok(monthlyButton, "monthly summary reachable from Export");
  await act(async () => monthlyButton.click());
  const select = document.querySelector('[role="dialog"] select');
  assert.ok([...select.options].some(option => option.value === "2026-06"), "June is available");
  await act(async () => { select.value = "2026-06"; Simulate.change(select); });
  await act(async () => button("Generate Monthly PDF").click());
  await settle(() => fixture.downloads.length === 1);
  assert.equal(fixture.downloads[0].fileName, "Monthly_Team_Summary_2026-06.pdf");
  assert.ok(fixture.assertions.every(scope => scope.months.length === 1 && scope.months[0] === "2026-06"));
  assert.equal(fixture.downloads[0].pdf.getNumberOfPages(), 1);
  console.log("PASS real Export menu selects June and downloads the full month despite a weekly view; export verifies the selected month scope twice");
  fixture.fail = true;
  await assert.rejects(loadCanonicalReportData(), /Source unavailable/);
  await assert.rejects(loadCanonicalSignatureDocuments(), /Source unavailable/);
  await act(async () => button("Export").click());
  await act(async () => [...document.querySelectorAll("button")].find(item => item.textContent.includes("Monthly Team Summary PDF")).click());
  await act(async () => button("Generate Monthly PDF").click());
  await settle(() => document.querySelector('[role="alert"]'));
  assert.ok(document.querySelector('[role="alert"]').textContent.includes("Source unavailable"));
  assert.equal(fixture.downloads.length, 1, "failed reads do not download a partial report");
  fixture.fail = false;
  fixture.events = fixture.events.slice(0, 1);
  assert.ok(getAppealScoreHold((await loadCanonicalReportData()).cases.filter(item => item.agent === agent && item.monthKey === "2026-06")), "unfinished appeal remains held");
  await act(async () => button("Generate Monthly PDF").click());
  assert.equal(fixture.downloads.length, 1, "pending appeal does not publish a final monthly report");
  console.log("PASS failed source reads reject instead of producing partial scores; pending appeals retain the final-score hold");
} finally {
  if (root) { const { act } = await import("react"); await act(async () => root.unmount()); }
  globalThis.fetch = originalFetch;
  dom.window.close();
  delete globalThis.__monthlySummaryFixture;
  await fs.rm(temp, { recursive: true, force: true });
}
