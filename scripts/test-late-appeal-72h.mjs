import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";

const output=path.join(fs.mkdtempSync(path.join(os.tmpdir(),"qa-late-appeal-")),"late.mjs");
await build({
  entryPoints:["src/AppealOverrideMockup.tsx"],
  outfile:output,bundle:true,platform:"node",format:"esm",
  packages:"external",logLevel:"silent",
  plugins:[{
    name:"test-only-mocks",
    setup(api){
      api.onResolve({filter:/^(\.\/PageHero|\.\/appealStore|\.\/staticFileCache)$/},args=>{
        if (!args.importer.endsWith("AppealOverrideMockup.tsx"))return;
        return {path:args.path,namespace:"late-appeal-test"};
      });
      api.onLoad({filter:/.*/,namespace:"late-appeal-test"},args=>({
        contents:args.path.endsWith("PageHero")?"export default function PageHero(){return null;}":
          args.path.endsWith("appealStore")?"export async function fetchAppealEvents(){return [];}export async function writeAppealEvent(){}":
          "export async function fetchCachedStaticResponse(){return {ok:false};}",
        loader:"js"
      }));
    }
  }]
});
const {buildAppealCaseOverrides}=await import(pathToFileURL(output).href);
const {lateAppealExpiresAt,isLateAppealOpen,lateAppealTimeRemaining}=await import(
  pathToFileURL(output).href
).then(()=>import(pathToFileURL(output).href)).catch(()=>({}));

const grant="2026-11-11T09:05:44.000Z";
const expires="2026-11-14T09:05:44.000Z";
const logs=[{
 event_type:"appeal_case_override_added",case_id:"AA331002",
 target_agent:"Sunijtra Siritip",created_at:grant,
 details:{caseId:"AA331002",addedAt:grant,targetAgent:"Sunijtra Siritip"}
}];
const items=buildAppealCaseOverrides(logs);
assert.equal(items.length,1);
assert.equal(items[0].expiresAt,expires,"historical Late Appeal grants receive an exact 72h deadline");
assert.equal(items[0].targetAgent,"Sunijtra Siritip");
assert.deepEqual(buildAppealCaseOverrides([...logs,{
 event_type:"appeal_case_override_removed",case_id:"AA331002",
 created_at:"2026-11-12T02:00:00Z",details:{caseId:"AA331002"}
}]),[],"revocation must cancel the active grant");
assert.deepEqual(buildAppealCaseOverrides([...logs,{
 event_type:"appeal_case_override_removed",case_id:"AA331002",
 created_at:"2026-11-12T02:00:00Z",details:{caseId:"AA331002"}
}, {...logs[0],created_at:"2026-11-12T03:00:00Z",details:{...logs[0].details,addedAt:"2026-11-12T03:00:00Z"}}]).map(item=>item.expiresAt),
["2026-11-15T03:00:00.000Z"],"a separately authorized new grant gets its own window");

const source=fs.readFileSync("src/lateAppealPolicy.ts","utf8");
assert.ok(source.includes("72 * 60 * 60 * 1000"));
const dashboard=fs.readFileSync("src/DashboardMockup.tsx","utf8");
assert.ok(dashboard.includes('data-late-appeal-access="true"'));
assert.ok(dashboard.includes("isOwnAppealCase && !readOnly && !monthlyResult.locked"));
assert.ok(dashboard.includes("freshOverrides = await fetchAppealEvents"),"must recheck grant before writing appeal");
assert.ok(dashboard.includes("isSameCanonicalAgent(item.targetAgent,caseItem.agent)"),"grants must be agent scoped");
assert.ok(dashboard.includes('data-selected-late-appeal="active"'),"selected case must show live grant");
console.log("PASS Late Appeal: historical 72h grant, revocation, owner-only CTA, fresh permission check and selected status");
