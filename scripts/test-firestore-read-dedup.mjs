import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// Verify that polling, a mounted dashboard and the Inbox share one bounded
// coaching read, while an explicit editor refresh bypasses the read cache.
const fixture = globalThis.__coachingReadFixture = {
  reads: 0,
  writes: 0,
  docs: new Map([["record-1", {
    id: "record-1", agent: "Agent A", monthKey: "2026-10",
    updatedAt: "2026-10-08T09:00:00Z", status: "Waiting Senior"
  }]])
};
const dir = await mkdtemp(resolve(".firestore-read-dedup-"));
try {
  const bundle = await build({
    stdin: {
      contents: 'export {fetchStoredCoachingRecords, upsertStoredCoachingRecord} from "./src/coachingStore.ts";',
      resolveDir: resolve("."), loader: "ts"
    },
    bundle: true, platform: "node", format: "esm", write: false,
    plugins: [{name: "mock-firestore", setup(b) {
      b.onResolve({filter: /^firebase\/firestore$/}, () => ({path: "db", namespace: "mock"}));
      b.onResolve({filter: /^\.\/firebaseClient$/}, () => ({path: "client", namespace: "mock"}));
      b.onLoad({filter: /.*/, namespace: "mock"}, args => ({
        loader: "js", contents: args.path === "client" ? "export const firebaseDb={};" : `
          export const collection=(_db,name)=>name, doc=(_db,name,id)=>name+"/"+id;
          export const serverTimestamp=()=>0;
          export async function getDocs(){
            globalThis.__coachingReadFixture.reads++;
            return {docs:[...globalThis.__coachingReadFixture.docs].map(([id,data])=>({id,data:()=>structuredClone(data)}))};
          }
          export async function setDoc(ref,data){
            const f=globalThis.__coachingReadFixture;f.writes++;f.docs.set(ref.split("/").at(-1),structuredClone(data));
          }
          export async function runTransaction(){throw new Error("not used in this read test");}
        `
      }));
    }}]
  });
  const file = resolve(dir, "coaching.mjs");
  await writeFile(file, bundle.outputFiles[0].text);
  const store = await import(pathToFileURL(file).href);
  const [a,b] = await Promise.all([store.fetchStoredCoachingRecords(),store.fetchStoredCoachingRecords()]);
  assert.equal(fixture.reads, 1, "simultaneous UI reads share one remote request");
  assert.deepEqual(a,b);
  assert.equal((await store.fetchStoredCoachingRecords())[0].status, "Waiting Senior");
  assert.equal(fixture.reads, 1, "short-term polling reuses the memory cache");
  fixture.docs.set("record-1", {...fixture.docs.get("record-1"),status:"QA Reviewed"});
  assert.equal((await store.fetchStoredCoachingRecords())[0].status, "Waiting Senior", "recent summaries remain cached");
  assert.equal((await store.fetchStoredCoachingRecords({allowCache:false}))[0].status,"QA Reviewed", "editor fresh read bypasses cache");
  assert.equal(fixture.reads,2);
  await store.upsertStoredCoachingRecord({...fixture.docs.get("record-1"),updatedAt:"2026-10-09T09:00:00Z"});
  assert.equal(fixture.writes,1);
  assert.equal((await store.fetchStoredCoachingRecords())[0].status,"QA Reviewed", "save updates local UI without new reads");
  assert.equal(fixture.reads,2);
  console.log("PASS Coaching concurrent requests, five-minute cache, strict refresh and save cache updates");
} finally {
  await rm(dir,{recursive:true,force:true});
  delete globalThis.__coachingReadFixture;
}
