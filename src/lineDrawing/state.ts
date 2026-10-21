import { useSyncExternalStore } from 'react';
import { LINE_DRAWING_THEME_ID } from './model.mjs';
const listeners = new Set<() => void>();
let observer: MutationObserver | undefined;
const snapshot=()=>typeof document!=='undefined'&&document.documentElement.dataset.qaLineDrawingTheme===LINE_DRAWING_THEME_ID;
function subscribe(listener:()=>void){listeners.add(listener);if(!observer){observer=new MutationObserver(()=>listeners.forEach(notify=>notify()));observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-qa-line-drawing-theme']});}return()=>{listeners.delete(listener);if(!listeners.size){observer?.disconnect();observer=undefined;}};}
export function useLineDrawingTheme(){return useSyncExternalStore(subscribe,snapshot,()=>false);}
