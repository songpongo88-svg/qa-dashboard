import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { unlockedMonthlyResultFixture } from './fixtures/unlocked-monthly-result.mjs';

// Exercise native editor events, the real watermark/upload pipeline, durable
// evaluation writes, and both PDF variants. Network/database boundaries are fixtures.
const temp = await mkdtemp(resolve('.assessment-inline-image-test-'));
const dom = new JSDOM('<div id="root"></div>', { url: 'https://qa.test/', pretendToBeVisual: true });
for (const key of ['window','document','Node','HTMLElement','DOMParser','Event','MouseEvent','CustomEvent','FileReader','File','Blob','localStorage']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const nativeURL = globalThis.URL;
globalThis.URL = class extends nativeURL { static createObjectURL() { return 'blob:fixture'; } static revokeObjectURL() {} };
globalThis.Image = class {
  naturalWidth = 800; naturalHeight = 500;
  async decode() {}
  set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
};
const pixels = await readFile(resolve('public/robinhood-logo.png'));
const watermarkCalls = [];
dom.window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect(){}, drawImage(){}, save(){}, restore(){}, translate(){}, rotate(){}, fillText(value){watermarkCalls.push(value);} });
dom.window.HTMLCanvasElement.prototype.toBlob = function(callback, type) { callback(new Blob([pixels], { type })); };
const docs = globalThis.__assessmentImageDocs = new Map();
const pdfEvents = globalThis.__assessmentPdfEvents = [];
let root;
const originalFetch = globalThis.fetch;
let failUpload = false, uploadGate = null, serial = 0;
const requests = [];
globalThis.fetch = async (url, init) => {
  if (init?.method === 'POST') {
    const body = JSON.parse(init.body); requests.push(body);
    if (uploadGate) await uploadGate;
    return { ok: !failUpload, status: failUpload ? 503 : 200, json: async () => failUpload ? {error:'Upload unavailable'} : {id:`inline_${++serial}`} };
  }
  return { ok:true, blob:async()=>new Blob([pixels], {type:'image/png'}) };
};
document.execCommand = (command, _ui, html) => {
  const range = window.getSelection().getRangeAt(0);
  range.deleteContents();
  const content = command === 'insertHTML' ? range.createContextualFragment(html) : document.createTextNode(html);
  const last = content.lastChild || content;
  range.insertNode(content); range.setStartAfter(last); range.collapse(true);
  window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
  return true;
};
try {
  const output = resolve(temp, 'app.mjs');
  await build({ stdin:{contents:`export * from './src/richText';export {uploadAppealImage,evidenceWatermarkLines} from './src/AppealEvidence';export {upsertStoredEvaluation,fetchStoredEvaluations} from './src/evaluationStore';export {generateOfficialCaseDetailPdf} from './src/caseDetailOfficialPdf';export {generateCasePdfWithAppealHistory} from './src/caseAppealPdfAddon';`,resolveDir:resolve('.'),loader:'tsx'},
    outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent',
    define:{'import.meta.env':JSON.stringify({VITE_FIREBASE_API_KEY:'fixture',VITE_FIREBASE_PROJECT_ID:'fixture',VITE_FIREBASE_APP_ID:'fixture'})},
    plugins:[unlockedMonthlyResultFixture({storage:true}),{name:'image-boundaries',setup(b){
      b.onResolve({filter:/^\.\/firebaseClient$/},()=>({path:'client',namespace:'fixture'}));
      b.onResolve({filter:/^firebase\/firestore$/},()=>({path:'firestore',namespace:'fixture'}));
      b.onResolve({filter:/^jspdf$/},()=>({path:'pdf',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='client'?'export const firebaseDb={};':args.path==='pdf'?`
        import {createRequire} from 'node:module';const {jsPDF:Base}=createRequire(import.meta.url)('jspdf');
        export class jsPDF extends Base{constructor(...args){super(...args);const text=this.text.bind(this),image=this.addImage.bind(this);this.text=(value,...rest)=>{globalThis.__assessmentPdfEvents.push({kind:'text',value:String(value),x:rest[0],y:rest[1],page:this.getCurrentPageInfo().pageNumber});return text(value,...rest)};this.addImage=(...args)=>{globalThis.__assessmentPdfEvents.push({kind:'image',x:args[2],y:args[3],width:args[4],height:args[5],page:this.getCurrentPageInfo().pageNumber});return image(...args)};}}
      `:`
        export const collection=(_db,name)=>({name}),doc=(_db,name,id)=>({name,id,path:name+'/'+id});
        export const query=(source,...constraints)=>({source,constraints}),where=(...args)=>args,orderBy=()=>({}),limit=()=>({}),documentId=()=> '__name__',getFirestore=()=>({}),startAfter=()=>({});
        const snap=ref=>({id:ref.id,exists:()=>globalThis.__assessmentImageDocs.has(ref.path),data:()=>structuredClone(globalThis.__assessmentImageDocs.get(ref.path))});
        export const getDoc=async ref=>snap(ref),getDocFromServer=getDoc;
        export const getDocs=async q=>({docs:[...globalThis.__assessmentImageDocs].filter(([path])=>path.startsWith((q.source||q).name+'/')).map(([path])=>snap({id:path.split('/').pop(),path}))}),getDocsFromServer=getDocs;
        export const setDoc=async(ref,row,options)=>globalThis.__assessmentImageDocs.set(ref.path,{...(options?.merge?globalThis.__assessmentImageDocs.get(ref.path):{}),...structuredClone(row)}),deleteDoc=async()=>{};
        export const serverTimestamp=()=>new Date().toISOString(),onSnapshot=()=>()=>{};
        export async function runTransaction(_db,callback){return callback({get:getDoc,set:setDoc,update:(ref,row)=>setDoc(ref,row,{merge:true})})}
        export const writeBatch=()=>({set:setDoc,commit:async()=>{}});
      `}));
    }}]});
  const app = await import(pathToFileURL(output).href);
  const { createRoot } = await import('react-dom/client');
  let value = 'ก่อนรูป\nหลังรูป', caseId = 'AA990501', busy = 0;
  const render = () => root.render(React.createElement(app.RichTextEditor,{value,preserveWhitespace:true,placeholder:'reason',editorLabel:'Assessment Reason',imageCaseId:caseId,
    onChange:next=>{value=next;render();},onImageBusyChange:next=>{busy+=next?1:-1;},
    onImagePaste:async file=>({...await app.uploadAppealImage(file,caseId,'1','qa'),caseId})}));
  root=createRoot(document.getElementById('root'));await act(async()=>render());
  const editor=()=>document.querySelector('[data-rich-text-editor]');
  const selectEnd=()=>{editor().focus();const range=document.createRange();range.setStart(editor().firstChild,editor().firstChild.textContent.length);range.collapse(true);window.getSelection().removeAllRanges();window.getSelection().addRange(range);};
  const paste=(data)=>{const event=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{items:[],files:[],getData:()=>'',...data}});editor().dispatchEvent(event);return event;};
  const file=new File(['image bytes'],'clipboard.png',{type:'image/png'});
  const fileData={items:[{kind:'file',type:'image/png',getAsFile:()=>file}]};
  let release;uploadGate=new Promise(resolve=>{release=resolve;});
  await act(async()=>{selectEnd();paste(fileData);await new Promise(r=>setTimeout(r,25));});
  assert.equal(busy,1);assert.equal(editor().getAttribute('contenteditable'),'false');assert.equal(editor().querySelector('img'),null);
  const pendingRequests=requests.length;await act(async()=>paste(fileData));assert.equal(requests.length,pendingRequests,'repeated paste does not race an upload');
  await act(async()=>{release();uploadGate=null;await new Promise(r=>setTimeout(r,25));});
  assert.equal(busy,0);assert.equal(editor().getAttribute('contenteditable'),'true');
  assert.equal(editor().querySelector('img').dataset.caseId,'AA990501');
  assert.equal(app.richTextToPlainText(value,true),'ก่อนรูป\nหลังรูป');
  const runs=app.parseRichTextRuns(value,true);assert.ok(runs.findIndex(run=>run.image)>0);assert.ok(runs.slice(runs.findIndex(run=>run.image)+1).some(run=>run.text.includes('หลังรูป')));
  assert.ok(watermarkCalls.includes('ใช้สำหรับเป็นหลักฐานประเมินเคส QA'));assert.ok(watermarkCalls.includes('Case ID: AA990501'));
  assert.deepEqual(app.evidenceWatermarkLines(caseId,'qa'),app.evidenceWatermarkLines(caseId,'appeal'));
  assert.equal(requests[0].contentType,'image/jpeg');assert.equal(requests[0].caseId,'qa-AA990501-1');
  assert.ok(app.richTextImages(value)[0].url.includes('watermark=qa-v2'));
  console.log('PASS actual Ctrl+V inserts a durable watermarked image between existing Thai text; pending uploads and duplicate pastes are guarded');

  const topic={code:'1',label:'Process',score:30,max:30,pct:100,comment:value};
  await app.upsertStoredEvaluation({id:'inline-evaluation',evaluationKey:'inline-evaluation',caseId,agentName:'Fixture Agent',auditDate:'2026-10-14',evaluationMonthKey:'2026-10',submittedAt:'2026-10-14T07:00:00Z',finalScore:100,topics:[topic],evidenceUrls:[]});
  const stored=[...docs.values()].find(row=>row.case_id===caseId);
  assert.equal(stored.topics[0].comment,value);
  const reloaded=(await app.fetchStoredEvaluations())[0];assert.equal(reloaded.topics[0].comment,value);
  await act(async()=>{root.unmount();root=createRoot(document.getElementById('root'));value=JSON.parse(JSON.stringify(stored)).topics[0].comment;render();});
  assert.equal(editor().querySelector('img').getAttribute('src'),app.richTextImages(value)[0].url);
  await act(async()=>root.render(React.createElement(app.RichTextContent,{value,preserveWhitespace:true})));
  assert.equal(document.querySelector('img').dataset.caseId,caseId);
  console.log('PASS actual evaluation persistence, JSON/Draft round trip, reopened editor and read-only Case Detail preserve the same image and text order');

  assert.equal(app.sanitizeRichTextHtml('<img src="javascript:alert(1)" onerror="alert(2)">'),'');
  assert.equal(app.sanitizeRichTextHtml('<img src="https://external.test/tracker.png">'),'');
  assert.ok(!app.sanitizeRichTextHtml(value.replace('<img ','<img onerror="alert(1)" ')).includes('onerror'));
  assert.ok(app.hasRichTextContent(app.richTextImageHtml(app.richTextImages(value)[0])));
  assert.ok(!app.hasRichTextContent('<img src="data:image/svg+xml,unsafe">'));
  const copiedImage=app.richTextImageHtml(app.richTextImages(value)[0]).replace('src="/api','src="https://qa.test/api');
  assert.equal(app.richTextImages(copiedImage)[0].url,app.richTextImages(value)[0].url,'absolute same-origin clipboard URLs normalize to durable relative URLs');
  console.log('PASS only durable case-stamped image URLs survive sanitization; scripts, external trackers and unsafe images are rejected');

  for(const pdfVariant of ['original','appeal']){
    pdfEvents.length=0;
    const caseItem={caseId,agent:'Fixture Agent',monthLabel:'October 2026',auditDate:'14/10/2026',auditTimestamp:'2026-10-14T07:00:00Z',finalScore:100,grade:'A',topics:[topic],reviewStatus:pdfVariant==='appeal'?'Revised':'Original',revisedTopics:[topic],displayRevisedTopicCodes:['1'],appealStatus:'Approved',appealReviewedTopics:[{...topic,decision:'Approved'}]};
    const result=await app.generateCasePdfWithAppealHistory({caseItem,pdfVariant,fallback:app.generateOfficialCaseDetailPdf});
    const imageIndex=pdfEvents.findIndex(event=>event.kind==='image');assert.ok(imageIndex>=0,`${pdfVariant} embeds the image`);
    const beforeIndex=pdfEvents.findIndex(event=>event.kind==='text'&&event.value.includes('ก่อนรูป'));
    const afterIndex=pdfEvents.findIndex(event=>event.kind==='text'&&event.value.includes('หลังรูป'));
    assert.ok(beforeIndex<imageIndex&&imageIndex<afterIndex,`${pdfVariant}: text/image/text retain reading order`);
    const image=pdfEvents[imageIndex];assert.ok(image.y>=12&&image.y+image.height<290,'whole image stays inside its page');
    const bytes=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsArrayBuffer(result.blob);});
    await writeFile(resolve(temp,`${pdfVariant}.pdf`),new Uint8Array(bytes));
  }
  console.log('PASS actual Main and Appeal PDFs embed images in the comment at the saved position, including a reviewed original comment');

  await act(async()=>{root.unmount();root=createRoot(document.getElementById('root'));value='ข้อความเดิม';render();});
  failUpload=true;await act(async()=>{selectEnd();paste(fileData);await new Promise(r=>setTimeout(r,25));});
  assert.equal(value,'ข้อความเดิม');assert.equal(editor().querySelector('img'),null);assert.ok(document.body.textContent.includes('Upload unavailable'));assert.equal(busy,0);
  failUpload=false;await act(async()=>{selectEnd();paste(fileData);await new Promise(r=>setTimeout(r,25));});assert.ok(editor().querySelector('img'));
  console.log('PASS failed uploads retain the original text and show an actionable error; retry succeeds without a broken saved image');
} finally {
  if(root)await act(async()=>root.unmount());globalThis.fetch=originalFetch;globalThis.URL=nativeURL;dom.window.close();await rm(temp,{recursive:true,force:true});
}
