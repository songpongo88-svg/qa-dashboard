import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const temporary = await mkdtemp(resolve(".report-history-test-"));
const dom = new JSDOM("", { url: "https://qa.test/" });
const keys = ["window", "document", "localStorage", "sessionStorage", "CustomEvent", "Event", "__reportHistoryFixture"];
const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const key of keys.slice(0, -1)) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const fixture = { rows: [], queries: [], failAt: 0, repeatFirstPage: false, writes: 0, serverReads: 0, serverUnavailable: false, pageDelay: 0, elapsed: 0 };
const originalNow = Date.now;
Date.now = () => originalNow() + fixture.elapsed;
Object.defineProperty(globalThis, "__reportHistoryFixture", { configurable: true, value: fixture });
const firestore = `
  const f = globalThis.__reportHistoryFixture;
  export const getFirestore=()=>({}), collection=(_db,name)=>({name}), doc=(_db,name,id)=>({name,id});
  export const query=(source,...constraints)=>({source,constraints}), orderBy=(field,direction)=>({field,direction}),
    limit=count=>({count}), startAfter=cursor=>({cursor}), where=()=>({}), documentId=()=>"__name__";
  const noWrite=()=>{f.writes++;throw new Error("Reporting must not write data");};
  export const setDoc=noWrite,deleteDoc=noWrite,runTransaction=noWrite,serverTimestamp=()=>"server",deleteField=()=>({});
  export const getDoc=async()=>({exists:()=>false}),getDocFromServer=getDoc;
  export async function getDocsFromServer(ref){f.serverReads++;if(f.serverUnavailable)throw new Error('server unavailable');return getDocs(ref)}
  export const onSnapshot=()=>()=>{};
  export async function getDocs(ref) {
    f.queries.push(ref);
    if(f.failAt===f.queries.length)throw new Error("page unavailable");
    const count=ref.constraints.find(item=>item.count)?.count;
    const cursor=ref.constraints.find(item=>item.cursor)?.cursor;
    const order=ref.constraints.find(item=>item.field);
    const candidates=f.rows.filter(row=>!order||order.field==='__name__'||row[order.field]!==undefined);
    const start=cursor&&!f.repeatFirstPage?candidates.findIndex(item=>item.id===cursor.id)+1:0;
    const rows=candidates.slice(start,start+count);
    f.elapsed+=f.pageDelay;
    return {docs:rows.map(row=>({id:row.id,data:()=>structuredClone(row)}))};
  }
`;
try {
  const outfile = resolve(temporary, "store.mjs");
  await build({
    stdin: { contents: "export {fetchStoredEvaluations,invalidateStoredEvaluationCache,readCachedEvaluationsForDisplay} from './src/evaluationStore';", resolveDir: process.cwd(), loader: "ts" },
    outfile, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "silent",
    define: { "import.meta.env": JSON.stringify({ VITE_FIREBASE_API_KEY: "fixture", VITE_FIREBASE_PROJECT_ID: "fixture", VITE_FIREBASE_APP_ID: "fixture" }) },
    plugins: [{ name: "report-history-backend", setup(builder) {
      builder.onResolve({ filter: /^firebase\// }, (args) => ({ path: args.path, namespace: "fixture" }));
      builder.onResolve({ filter: /\/firebaseClient$/ }, () => ({ path: "client", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ loader: "js", contents:
        path === "firebase/firestore" ? firestore : path === "firebase/app" ? "export const initializeApp=()=>({}),getApps=()=>[];" :
          path === "firebase/storage" ? "export const getStorage=()=>({}),ref=()=>({}),getDownloadURL=()=>{},uploadBytes=()=>{},uploadBytesResumable=()=>{};" :
            "export const firebaseDb={},firebaseApp={};" }));
    } }],
  });
  const api = await import(pathToFileURL(outfile).href);
  const row = (id, month = "2026-10", extra = {}) => ({
    id, case_id: id, agent_name: "Fixture Agent", target_username: "fixture-agent", target_display_name: "Fixture Agent",
    audit_date: month + "-15", audit_timestamp: month + "-15T02:00:00Z", submitted_at: month + "-16T02:00:00Z",
    evaluation_month_key: month, final_score: 84, grade: "B", topics: [{ code: "1", title: "Process", score: 30, max: 30 }], ...extra,
  });
  const recent = Array.from({ length: 1105 }, (_, index) => row("AA98" + String(index).padStart(4, "0")));
  const legacyJuly=row('AA990006','2026-07',{final_score:88,created_at:'2026-07-16T02:00:00Z'});
  const legacyAugust=row('AA990007','2026-08',{final_score:91,created_at:'2026-08-16T02:00:00Z'});
  delete legacyJuly.submitted_at;delete legacyAugust.submitted_at;
  fixture.rows = [...recent,
    row("AA990001", "2026-06", { final_score: 78 }),
    row("AA990002", "2026-06", { final_score: 90 }),
    row("AA990003", "2026-06", { is_test_case: true }),
    row("AA990004", "2026-06", { deleted_at: "2026-10-17T02:00:00Z" }),
    row("june-no-case", "2026-06", { case_id: "", evaluation_type: "no_case_month", final_score: 0 }),
    legacyJuly,legacyAugust,
  ];
  assert.equal((await api.fetchStoredEvaluations(300, { strict: true })).length, 300);
  assert.equal((await api.fetchStoredEvaluations(1000, { strict: true })).some(item => item.caseId === "AA990001"), false,
    "a larger fixed limit still loses historical months");
  fixture.queries = [];
  const all = await api.fetchStoredEvaluations(300, { strict: true, allMonths: true });
  assert.ok(all.some(item => item.caseId === "AA990001"));
  assert.ok(all.some(item => item.caseId === "AA990002"));
  assert.ok(all.some(item=>item.caseId==='AA990006'&&item.finalScore===88), 'historical July records without submitted_at must remain visible');
  assert.ok(all.some(item=>item.caseId==='AA990007'&&item.finalScore===91), 'historical August records without submitted_at must remain visible');
  assert.equal(fixture.serverReads,4,'a complete historical read must verify every page with the server');
  assert.equal(all.find(item => item.caseId === "AA990001").finalScore, 78);
  assert.equal(all.find(item => item.caseId === "AA990002").finalScore, 90);
  assert.ok(all.some(item => item.evaluationType === "no_case_month" && item.evaluationMonthKey === "2026-06"));
  assert.equal(all.some(item => item.caseId === "AA990004"), false, "deleted cases stay excluded");
  assert.ok(all.some(item => item.isTestCase), "the store retains test records for authorized Case Detail callers");
  assert.equal(fixture.queries.length, 4);
  assert.ok(fixture.queries.every(ref => ref.constraints.some(item => item.count === 300)), "each backend query is bounded");
  const real = all.filter(item => !item.isTestCase && item.evaluationType !== "no_case_month");
  assert.equal(real.filter(item => item.evaluationMonthKey === "2026-06").length, 2);
  await api.fetchStoredEvaluations(1000, { strict: true, allMonths: true });
  assert.equal(fixture.queries.length, 4, "Dashboard, Summary and Signatures share the complete read");
  api.invalidateStoredEvaluationCache();
  await api.fetchStoredEvaluations(300, { strict: true });
  const retainedHistory = JSON.parse(window.localStorage.getItem("qa-dashboard:create-evaluation:remote-cache:v2"));
  assert.ok(retainedHistory.some(item => item.caseId === "AA990001" && item.finalScore === 78),
    "a recent-results read must not replace the saved all-month history");
  assert.equal(retainedHistory.filter(item => item.evaluationMonthKey === "2026-06").length, 4,
    "limited reads preserve historical cases, test records and no-case months");
  const historyKey="qa-dashboard:create-evaluation:history:v2";
  window.localStorage.setItem(historyKey,JSON.stringify([row("AA990005","2026-07",{final_score:86}),row("AA990001","2026-06",{final_score:12})]));
  const display=api.readCachedEvaluationsForDisplay();
  assert.ok(display.some(item=>item.caseId==="AA990005"&&item.finalScore===86),"saved local history remains available when the latest-results cache lacks that month");
  assert.equal(display.find(item=>item.caseId==="AA990001").finalScore,78,"an older local copy cannot replace the centrally saved score");
  assert.equal(display.some(item=>item.isTestCase),false);
  window.localStorage.removeItem(historyKey);
  const originalRows=fixture.rows;
  fixture.rows=[row("AA990001","2026-06",{deleted_at:"2026-11-06T04:00:00Z"}),...recent];
  api.invalidateStoredEvaluationCache();await api.fetchStoredEvaluations(300,{strict:true});
  const afterDeletion=JSON.parse(window.localStorage.getItem("qa-dashboard:create-evaluation:remote-cache:v2"));
  assert.equal(afterDeletion.some(item=>item.caseId==="AA990001"),false,"a server deletion still removes its stale saved copy during a limited read");
  assert.ok(afterDeletion.some(item=>item.caseId==="AA990002"&&item.finalScore===90),"deleting one case cannot discard the rest of the historical month");
  fixture.rows=originalRows;
  console.log("PASS historical June retained beyond 300/1000 cases, stable scores, no-case months, deleted/test handling and shared bounded pagination");

  api.invalidateStoredEvaluationCache(); fixture.queries = []; fixture.failAt = 2;
  await assert.rejects(api.fetchStoredEvaluations(300, { strict: true, allMonths: true }), /page unavailable/);
  fixture.failAt = 0; fixture.queries = [];
  assert.ok((await api.fetchStoredEvaluations(300, { strict: true, allMonths: true })).some(item => item.caseId === "AA990001"),
    "failed partial reads are evicted and can retry completely");
  console.log("PASS a failed middle page cannot become a partial monthly report or poison retries");

  api.invalidateStoredEvaluationCache(); fixture.queries = []; fixture.repeatFirstPage = true;
  await assert.rejects(api.fetchStoredEvaluations(300, { strict: true, allMonths: true }), /หน้าถัดไป/);
  assert.equal(fixture.queries.length, 2, "a non-advancing cursor stops instead of looping");
  fixture.repeatFirstPage = false;
  api.invalidateStoredEvaluationCache();fixture.queries=[];fixture.pageDelay=8_000;
  const slowHistory=await api.fetchStoredEvaluations(300,{strict:true,allMonths:true});
  assert.ok(slowHistory.some(item=>item.caseId==='AA990007'),'a complete history taking over 20 seconds still finishes all pages');
  fixture.pageDelay=0;fixture.elapsed=0;
  const completeBackup=window.localStorage.getItem('qa-dashboard:create-evaluation:remote-cache:v2');
  api.invalidateStoredEvaluationCache();fixture.serverUnavailable=true;
  await assert.rejects(api.fetchStoredEvaluations(300,{strict:true,allMonths:true}),/server unavailable/,'an offline SDK cache cannot count as a complete server scan');
  assert.equal(window.localStorage.getItem('qa-dashboard:create-evaluation:remote-cache:v2'),completeBackup,'an unavailable server cannot replace complete history with a cached subset');
  fixture.serverUnavailable=false;
  console.log('PASS legacy timestamp coverage, server-only complete pages, slow multi-page history and no cached subset overwrite');
  api.invalidateStoredEvaluationCache(); fixture.queries = []; fixture.rows = [];
  assert.deepEqual(await api.fetchStoredEvaluations(300, { strict: true, allMonths: true }), []);
  assert.equal(fixture.queries.length, 1);
  assert.equal(fixture.writes, 0);
  console.log("PASS non-advancing cursor, truly empty history and read-only reporting");
} finally {
  Date.now=originalNow;
  dom.window.close();
  for (const [key, descriptor] of previous) descriptor
    ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  await rm(temporary, { recursive: true, force: true });
}
