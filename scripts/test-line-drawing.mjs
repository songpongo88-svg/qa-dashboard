import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import * as model from '../src/lineDrawing/model.mjs';
import * as icons from '../src/lineDrawing/icons.mjs';
import * as specialIcons from '../src/specialThemes/icons.mjs';
const dom=new JSDOM('<div id="root"></div>',{url:'https://qa.test',pretendToBeVisual:true});
for(const k of ['window','document','MutationObserver','HTMLElement','SVGElement','Event','CustomEvent','localStorage'])globalThis[k]=dom.window[k];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const {createRoot}=await import('react-dom/client');
function load(file,deps={}){const src=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;const exports={};Function('require','exports',js)(name=>{if(name.endsWith('.css'))return{};if(name==='react')return React;if(name in deps)return deps[name];throw Error('Unexpected dependency '+name);},exports);return exports;}
assert.equal(model.canUseLineDrawing('Songpon',{ready:false,published:false}),true);
for(const user of ['',null,'other-qa','supervisor'])assert.equal(model.canUseLineDrawing(user,{ready:true,published:false}),false);
assert.equal(model.canUseLineDrawing('other',{ready:true,published:true}),true);
assert.equal(model.canUseLineDrawing('other',{ready:false,published:true}),false);
assert.equal(model.normalizeLineDrawingRelease({published:'true'}).published,false);
assert.equal(new Set(Object.values(icons.INK_PATHS)).size,Object.keys(icons.INK_PATHS).length);
let snapshotCallback,errorCallback,stored={published:false},writes=[],sessionValid=true,failWrite=false,pendingSession=null;
const firestore={doc:(_db,...parts)=>parts.join('/'),serverTimestamp:()=>'<server>',onSnapshot:(_ref,_options,next,error)=>{snapshotCallback=next;errorCallback=error;return()=>{snapshotCallback=null;};},setDoc:async(ref,value)=>{if(failWrite){failWrite=false;throw Error('offline');}writes.push({ref,value});stored=value;}};
const validateStoredUserSession=async(_session,username)=>{if(pendingSession)await pendingSession;return sessionValid?{valid:true,session:{username}}:{valid:false,reason:'expired'};};
const {useLineDrawingRelease}=load('src/lineDrawing/release.ts',{'firebase/firestore':firestore,'../firebaseClient':{firebaseDb:{}},'../sessionStore':{validateStoredUserSession},'./model.mjs':model});
const {LineDrawingCollection}=load('src/lineDrawing/LineDrawing.tsx',{'./icons.mjs':icons,'./model.mjs':model});
let latest,selections=[];let root=createRoot(document.getElementById('root'));
function Probe({actor}){latest=useLineDrawingRelease(actor);return React.createElement(LineDrawingCollection,{release:latest,selectedTheme:'pink',onSelect:id=>selections.push(id)});}
const flush=async()=>act(async()=>{await new Promise(r=>setTimeout(r,0));});
const render=async(actor)=>{await act(async()=>root.render(React.createElement(Probe,{actor})));await flush();};
const emit=async(value=stored,metadata={fromCache:false,hasPendingWrites:false})=>act(async()=>snapshotCallback({data:()=>value,metadata}));
const owner={username:'Songpon',sessionId:'owner-session',role:'Quality Assurance'};
try{
 await render({username:'other-qa',sessionId:'other-session',role:'Quality Assurance',displayName:'Songpon Phothong'});
 assert.equal(document.querySelector('[data-line-drawing-select]'),null);
 await emit({published:true},{fromCache:true,hasPendingWrites:false});assert.equal(latest.ready,false);assert.equal(latest.allowed,false);
 await emit(undefined);assert.equal(latest.ready,true);assert.equal(latest.allowed,false);
 await latest.setPublished(true);assert.deepEqual(writes,[],'same Role and copied display name do not control release');
 await render(owner);assert.ok(document.querySelector('[data-line-drawing-select]'));assert.equal(document.querySelector('[role="switch"]').getAttribute('aria-checked'),'false');
 await act(async()=>latest.setPublished(true));assert.equal(writes.length,1);assert.equal(stored.published,true);assert.equal(writes[0].ref,'qa_system_settings/line_drawing_release_v1');assert.deepEqual(selections,[],'publishing does not choose a theme for anyone');
 for(const role of ['Quality Assurance','Supervisor','Senior','Admin Live Chat','System Admin']){await render({username:'other-'+role,sessionId:'other',role});await emit();assert.equal(latest.allowed,true);assert.ok(document.querySelector('[data-line-drawing-select]'));assert.equal(document.querySelector('[role="switch"]'),null);}
 await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));await render({username:'other',sessionId:'other'});assert.equal(latest.allowed,false,'reload waits for authoritative state');await emit();assert.equal(latest.allowed,true,'persisted release survives remount');
 await render(owner);failWrite=true;await act(async()=>latest.setPublished(false));assert.equal(latest.published,true);assert.equal(stored.published,true);assert.match(latest.error,/บันทึกสถานะเผยแพร่ไม่สำเร็จ/);
 sessionValid=false;await act(async()=>latest.setPublished(false));assert.equal(stored.published,true,'expired owner session cannot change release');sessionValid=true;
 await act(async()=>latest.setPublished(false));assert.equal(stored.published,false);await render({username:'other',sessionId:'other'});await emit();assert.equal(latest.allowed,false);assert.equal(document.querySelector('[data-line-drawing-select]'),null);
 await render(owner);let resume;pendingSession=new Promise(r=>resume=r);let inFlight;await act(async()=>{inFlight=latest.setPublished(true);});await render({username:'another',sessionId:'new-session'});resume();await act(async()=>inFlight);pendingSession=null;assert.equal(stored.published,false,'switching account cancels an unvalidated owner write');
 await act(async()=>errorCallback(Error('offline')));assert.equal(latest.allowed,false,'errors fail closed');
 console.log('PASS private default, exact owner identity, every Role, authoritative snapshot, real switch, persisted refresh, failed writes, expired/stale sessions and public opt-in');
}finally{await act(async()=>root.unmount());}
const fixture=document.getElementById('root');fixture.innerHTML='<div class="qa-workspace-tabs-v36"><button role="tab" data-qa-nav-key="appeal-requests"><svg><path d="M0 0"/></svg>Appeal Review</button></div><button id="save"><svg><path d="M0 0"/></svg>Save</button><button id="reject"><svg><path/></svg>Reject</button><div class="rounded-xl border bg-white" id="card"><h2>Topic Detail</h2></div><div data-rich-text-toolbar><button>Save</button></div>';
const save=document.getElementById('save'),originalPath=save.querySelector('path');let saved=0;save.onclick=()=>saved++;
const {installLineDrawingRuntime}=load('src/lineDrawing/runtime.ts',{'./model.mjs':model,'./icons.mjs':icons,'../specialThemes/icons.mjs':specialIcons});
const element=document.documentElement;element.dataset.qaTheme=model.LINE_DRAWING_THEME_ID;element.dataset.qaLineDrawingAllowed='false';const stop=installLineDrawingRuntime();await flush();assert.equal(element.dataset.qaLineDrawingTheme,undefined,'forged local preference is not enough');
element.dataset.qaLineDrawingAllowed='true';await flush();assert.equal(element.dataset.qaLineDrawingTheme,model.LINE_DRAWING_THEME_ID);assert.equal(save.querySelector('svg').dataset.inkIconKind,'save');assert.equal(fixture.querySelector('[role="tab"] svg').dataset.inkIconKind,'review');assert.equal(document.getElementById('card').dataset.inkSurface,'card');assert.equal(save.querySelector('path'),originalPath);save.click();assert.equal(saved,1);assert.equal(document.getElementById('reject').querySelector('svg').dataset.inkIconKind,undefined,'semantic reject stays intact');
const late=document.createElement('button');late.innerHTML='<svg><path/></svg>Preview';fixture.append(late);await flush();assert.equal(late.querySelector('svg').dataset.inkIconKind,'preview');element.dataset.qaTheme='pink';await flush();assert.equal(fixture.querySelectorAll('[data-ink-icon-kind],[data-ink-surface]').length,0);assert.equal(save.querySelector('path'),originalPath);stop();
console.log('PASS unique vector icons, authorization gate, mounted-later tabs, original React children/handlers, semantic colors and full theme cleanup');
// Exercise the actual App Login markup, including its collection branches.
const appSource=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const appTree=ts.createSourceFile('App.tsx',appSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let loginMarkup;function findLogin(node){if(ts.isJsxElement(node)&&node.openingElement.attributes.properties.some(p=>p.name?.getText(appTree)==='data-login-flow-v4'))loginMarkup=node.getText(appTree);ts.forEachChild(node,findLogin);}findLogin(appTree);assert.ok(loginMarkup);
const passwordHelper=appTree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='PasswordVisibilityInput').getText(appTree);
const names='loginStep,loginTheme,username,loginUsernameStatus,loginError,password,loginSubmitting,temporaryLoginNotice,rememberLogin,verifiedLoginDisplayName,maintenanceState,DEFAULT_MAINTENANCE_STATE,buildMeta,automaticLoginRequestRef,setUsername,setLoginUsernameStatus,setLoginError,setForgotUsernameInput,setShowForgotPasswordModal,setPassword,setTemporaryLoginNotice,setRememberLogin,setLoginStep,setVerifiedLoginDisplayName';
const fixtureSource='const useState=React.useState;'+passwordHelper+';function SharedLoginFixture(context){const {'+names+'}=context;return '+loginMarkup+';}';
const fixtureJs=ts.transpileModule(fixtureSource,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const {InkLoginArtwork}=load('src/lineDrawing/InkLogin.tsx');
const SharedLoginFixture=Function('React','InkLoginArtwork','LoginFeatureIcon','loginThemeStyle','VersionPill',fixtureJs+';return SharedLoginFixture;')(React,InkLoginArtwork,()=>null,()=>({}),()=>null);
root=createRoot(fixture);
for(const collection of ['line-drawing','color','character','festival','weekday','weather','special']){
 const context={loginStep:'username',loginTheme:{id:collection,collection},username:'Songpon',loginUsernameStatus:'idle',loginError:'',password:'',loginSubmitting:false,temporaryLoginNotice:'',rememberLogin:false,verifiedLoginDisplayName:'',maintenanceState:{enabled:false},DEFAULT_MAINTENANCE_STATE:{message:''},buildMeta:{},automaticLoginRequestRef:{current:0}};
 for(const [setter,key]of Object.entries({setUsername:'username',setLoginUsernameStatus:'loginUsernameStatus',setLoginError:'loginError',setForgotUsernameInput:'forgotUsernameInput',setShowForgotPasswordModal:'showForgotPasswordModal',setPassword:'password',setTemporaryLoginNotice:'temporaryLoginNotice',setRememberLogin:'rememberLogin',setLoginStep:'loginStep',setVerifiedLoginDisplayName:'verifiedLoginDisplayName'}))context[setter]=value=>{context[key]=value;};
 const show=()=>act(async()=>root.render(React.createElement(SharedLoginFixture,context)));
 await show();assert.ok(document.querySelector('#qa-login-username'),collection+' starts with Username');assert.equal(document.querySelector('[aria-label="Login Password"]'),null,collection+' does not mount Password in Step 1');assert.match(document.querySelector('.qa-login-step').textContent,/Step 1 of 2/);
 context.loginUsernameStatus='invalid';context.loginError='ไม่พบ User นี้';await show();assert.equal(document.querySelector('[aria-label="Login Password"]'),null,collection+' invalid usernames stay in Step 1');
 context.loginStep='password';context.loginUsernameStatus='valid';context.loginError='';context.verifiedLoginDisplayName='Songpon';await show();assert.equal(document.querySelector('#qa-login-username'),null);assert.ok(document.querySelector('[aria-label="Login Password"]'));assert.match(document.querySelector('.qa-login-step').textContent,/Step 2 of 2/);
 await act(async()=>document.querySelector('[aria-label="Show password"]').click());assert.equal(document.querySelector('[aria-label="Login Password"]').type,'text');await act(async()=>document.querySelector('[aria-label="Hide password"]').click());assert.equal(document.querySelector('[aria-label="Login Password"]').type,'password');
 await act(async()=>document.querySelector('[type="checkbox"]').click());assert.equal(context.rememberLogin,true);
 const buttons=[...document.querySelectorAll('button')];assert.equal(buttons.some(b=>b.textContent.trim()==='Sign in'),false,'no collection-specific manual sign-in');
 await act(async()=>buttons.find(b=>b.textContent==='← Change Username').click());assert.equal(context.loginStep,'username');assert.equal(context.password,'');await show();assert.equal(document.querySelector('[aria-label="Login Password"]'),null);
 await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Forgot Password').click());assert.equal(context.showForgotPasswordModal,true);assert.equal(context.forgotUsernameInput,'Songpon');
}
await act(async()=>root.unmount());
console.log('PASS actual App Login for all 7 collections: Username-only first, invalid-account gate, Password second, visibility, remember, recovery and Change Username');
let passwordEffect;function findEffect(node){if(ts.isCallExpression(node)&&node.expression.getText(appTree)==='useEffect'&&node.arguments[0]?.getText(appTree).includes('const typedPassword = password.trim();'))passwordEffect=node.getText(appTree);ts.forEachChild(node,findEffect);}findEffect(appTree);assert.ok(passwordEffect);
const autoProbe=Function('React','return function AutoLoginProbe({context}){const useEffect=React.useEffect;const {currentUser,loginStep,showForgotPasswordModal,loginSubmitting,password,loginError,temporaryLoginNotice,automaticLoginRequestRef,setLoginSubmitting,setLoginError,handleLoginAsync,loginTheme}=context;'+passwordEffect+';return null;}')(React);
const realSetTimeout=window.setTimeout,realClearTimeout=window.clearTimeout;const timers=new Map();let timerId=0;window.setTimeout=(callback)=>{const id=++timerId;timers.set(id,callback);return id;};window.clearTimeout=id=>timers.delete(id);
root=createRoot(fixture);
try{
 for(const collection of ['line-drawing','color','character','festival','weekday','weather','special']){
  let attempts=0;const context={currentUser:null,loginStep:'username',showForgotPasswordModal:false,loginSubmitting:false,password:'fixture-only',loginError:'',temporaryLoginNotice:'',automaticLoginRequestRef:{current:0},loginTheme:{collection},setLoginSubmitting:v=>{context.loginSubmitting=v;},setLoginError:v=>{context.loginError=v;},handleLoginAsync:async()=>{attempts++;}};
  const show=()=>act(async()=>root.render(React.createElement(autoProbe,{context})));
  await show();assert.equal(timers.size,0,'no password attempt before account verification: '+collection);
  context.loginStep='password';context.password='test';await show();assert.equal(timers.size,0,'short passwords do not submit: '+collection);
  context.password='fixture-only';await show();assert.equal(timers.size,1,'the shared automatic password check is enabled: '+collection);
  await act(async()=>{const [id,callback]=timers.entries().next().value;timers.delete(id);await callback();});assert.equal(attempts,1,'automatic sign-in runs without a collection-specific button: '+collection);
  context.password='new-fixture';await show();assert.equal(timers.size,1);context.loginStep='username';await show();assert.equal(timers.size,0,'Change Username cancels a pending sign-in');
 }
}finally{await act(async()=>root.unmount());window.setTimeout=realSetTimeout;window.clearTimeout=realClearTimeout;}
console.log('PASS actual shared password effect for all 7 collections: account gate, password length, automatic sign-in and cancellation');
dom.window.close();
