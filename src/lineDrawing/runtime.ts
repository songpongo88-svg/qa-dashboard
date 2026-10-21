import { isLineDrawingTheme, LINE_DRAWING_THEME_ID } from './model.mjs';
import { inkIconUrl, inkKind, inkNavigationKind } from './icons.mjs';
import { specialActionFor, specialHeadingIcon } from '../specialThemes/icons.mjs';
import './ink.css';
const excluded='[data-theme-picker-v1],.qa-special-preview-dialog,.qa-character-preview-dialog,.qa-festival-preview-overlay,[data-rich-text-toolbar],[contenteditable],.ql-toolbar,[data-pdf-preview],[data-rich-text-image-preview],.qa-themed-login';
const markers=['inkSurface','inkIconMode','inkIconKind','inkHeading'] as const;
// Decoration only. React keeps every original child, event handler and tab position.
export function installLineDrawingRuntime(){
  const root=document.documentElement;
  let disposed=false,queued=false;
  const decorated=new Set<HTMLElement|SVGElement>();
  const clear=(node:HTMLElement|SVGElement)=>{markers.forEach(key=>delete node.dataset[key]);node.style.removeProperty('--ink-icon');};
  const reset=()=>{decorated.forEach(clear);decorated.clear();};
  const update=()=>{
    queued=false;if(disposed)return;
    const active=isLineDrawingTheme(root.dataset.qaTheme)&&root.dataset.qaLineDrawingAllowed==='true'&&!root.dataset.qaFestivalOverride&&root.dataset.qaWeatherCollection!=='auto';
    if(!active){if(root.dataset.qaLineDrawingTheme)delete root.dataset.qaLineDrawingTheme;reset();return;}
    if(root.dataset.qaLineDrawingTheme!==LINE_DRAWING_THEME_ID)root.dataset.qaLineDrawingTheme=LINE_DRAWING_THEME_ID;
    const keep=new Set<HTMLElement|SVGElement>();
    const mark=(node:HTMLElement|SVGElement,key:typeof markers[number],value:string)=>{keep.add(node);if(node.dataset[key]!==value)node.dataset[key]=value;};
    const icon=(node:HTMLElement|SVGElement,kind:string,mode:string)=>{const k=inkKind(kind);mark(node,'inkIconKind',k);mark(node,'inkIconMode',mode);const url=inkIconUrl(k);if(node.style.getPropertyValue('--ink-icon')!==url)node.style.setProperty('--ink-icon',url);};
    document.querySelectorAll<HTMLElement>('button,a[role="button"],a[data-case-header-action]').forEach(button=>{
      if(button.closest(excluded)||button.querySelector('.qa-ink-icon,img')||button.matches('.qa-sidebar-section-label'))return;
      const kind=button.dataset.qaNavKey?inkNavigationKind(button.dataset.qaNavKey):specialActionFor(button.getAttribute('aria-label')||button.textContent||'');
      if(!kind)return;
      const svg=button.querySelector<SVGElement>(':scope > svg:first-child,:scope > :is(span,div):first-child > svg:first-child');
      if(svg&&!svg.classList.contains('ml-auto'))icon(svg,kind,'replace');
    });
    document.querySelectorAll<SVGElement>('[data-dashboard-metric] svg,.mc-title > svg,.mc-search > svg,.mc-upload > svg,h2 > svg:first-child,h3 > svg:first-child').forEach(svg=>{
      if(svg.closest(excluded))return;const label=svg.parentElement?.textContent||'';const kind=specialActionFor(label);if(kind)icon(svg,kind,'replace');
    });
    document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,div[class*="font-"],span[class*="font-"]').forEach(title=>{
      if(title.closest(excluded+',.qa-global-sidebar-v39,table,button,a,[role="tablist"],.qa-ink-hero')||title.childElementCount||(title.textContent||'').length>85)return;
      if(!/^H[1-4]$/.test(title.tagName)&&![...title.classList].some(c=>/^text-(?:base|lg|xl|2xl|\[(?:1[4-9]|2\d)px\])$/.test(c)))return;
      const kind=specialHeadingIcon(title.textContent||'');if(kind){mark(title,'inkHeading',inkKind(kind));icon(title,kind,'prefix');}
    });
    document.querySelectorAll<HTMLElement>('#root :is(section,article,div)[class],[data-process-picker-portal] :is(section,article,div)[class]').forEach(card=>{
      if(card.closest(excluded+',.qa-global-sidebar-v39,button,table,[role="tablist"]'))return;
      const classes=[...card.classList];
      const neutral=classes.some(c=>/^(bg-white(?:\/\d+)?|from-white|from-violet-50|from-fuchsia-50)$/.test(c));
      const rounded=classes.some(c=>/^rounded(?:-|$)/.test(c));
      if(card.matches('[data-dashboard-metric],[data-case-information-unified],[data-qa-dashboard-control-center-v163]')||(rounded&&neutral&&classes.some(c=>/^border(?:-|$)/.test(c))))mark(card,'inkSurface','card');
      else if(neutral&&classes.includes('border-b'))mark(card,'inkSurface','header');
    });
    decorated.forEach(node=>{if(!keep.has(node))clear(node);});decorated.clear();keep.forEach(node=>decorated.add(node));
  };
  const schedule=()=>{if(!queued&&!disposed){queued=true;queueMicrotask(update);}};
  const attributes=new MutationObserver(schedule);attributes.observe(root,{attributes:true,attributeFilter:['data-qa-theme','data-qa-line-drawing-allowed','data-qa-festival-override','data-qa-weather-collection']});
  const content=new MutationObserver(schedule);content.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','aria-label','data-qa-nav-key']});
  update();return()=>{disposed=true;attributes.disconnect();content.disconnect();reset();delete root.dataset.qaLineDrawingTheme;};
}
