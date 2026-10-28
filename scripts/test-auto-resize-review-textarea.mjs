import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
const temp=await mkdtemp(resolve('.review-textarea-test-'));
const dom=new JSDOM('<div id="root"></div>',{url:'https://qa.test/'});
const keys=['window','document','navigator','HTMLElement','HTMLTextAreaElement','Event','ResizeObserver','IS_REACT_ACT_ENVIRONMENT'];
const previous=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
let measuredHeight=440,observerCallback,disconnected=false;
for(const key of keys.slice(0,6))Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{configurable:true,value:true});
Object.defineProperty(globalThis,'ResizeObserver',{configurable:true,value:class{constructor(callback){observerCallback=callback}observe(){}disconnect(){disconnected=true}}});
Object.defineProperty(dom.window.HTMLTextAreaElement.prototype,'scrollHeight',{get:()=>measuredHeight});
let root;
try{
  const output=resolve(temp,'textarea.mjs');
  await build({entryPoints:['src/AutoResizeReviewTextarea.tsx'],outfile:output,bundle:true,packages:'external',platform:'node',format:'esm'});
  const {default:Textarea}=await import(pathToFileURL(output));
  const {createRoot}=await import('react-dom/client');root=createRoot(document.getElementById('root'));
  const render=async value=>act(async()=>root.render(React.createElement(Textarea,{value,onChange:()=>{},style:{border:'1px solid'}})));
  await render(Array(100).fill('Saved appeal explanation').join('\n'));
  const field=document.querySelector('textarea');
  assert.equal(field.style.height,'442px','existing saved content fits immediately on mount');
  measuredHeight=140;await render('Shortened explanation');assert.equal(field.style.height,'142px','value changes can shrink the field');
  measuredHeight=540;await act(async()=>field.dispatchEvent(new Event('input',{bubbles:true})));assert.equal(field.style.height,'542px');
  measuredHeight=640;window.dispatchEvent(new Event('resize'));assert.equal(field.style.height,'642px');
  measuredHeight=740;observerCallback([{contentRect:{width:420}}]);assert.equal(field.style.height,'742px');
  measuredHeight=840;observerCallback([{contentRect:{width:420}}]);assert.equal(field.style.height,'742px','height-only observer changes do not cause a loop');
  await act(async()=>root.unmount());root=null;assert.ok(disconnected);
  console.log('PASS saved appeal text fits on mount, value/input updates, viewport and container resizing, shrink and observer cleanup');
}finally{
  if(root)await act(async()=>root.unmount());
  dom.window.close();for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];
  await rm(temp,{recursive:true,force:true});
}
