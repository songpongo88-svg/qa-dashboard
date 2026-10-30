import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { OCTOBER_FOCUS_TABLE_ROWS } from './lib/rubricFocusRows';

const normalize=(value:string)=>value.trim().replace(/\s+/g,'').toLocaleLowerCase('th-TH');
export function findTagRubric(topicCode:string,name:string){
  return OCTOBER_FOCUS_TABLE_ROWS.find(row=>row.categoryCode===topicCode&&normalize(row.focusItem.split('(')[0])===normalize(name));
}
export default function TagRubricHint({topicCode,name}:{topicCode:string;name:string}){
  const row=findTagRubric(topicCode,name);
  const id=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const popup=useRef<HTMLDivElement>(null);
  const timer=useRef<ReturnType<typeof setTimeout>>();
  const focused=useRef(false);
  const [open,setOpen]=useState(false);
  const [pinned,setPinned]=useState(false);
  const [position,setPosition]=useState({left:12,top:12,width:440});
  const show=()=>{clearTimeout(timer.current);setOpen(true);};
  const leave=()=>{if(!pinned&&!focused.current)timer.current=setTimeout(()=>setOpen(false),180);};
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
      const width=Math.max(0,Math.min(480,window.innerWidth-24));
      const height=popup.current?.offsetHeight||240;
      setPosition({width,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:rect.bottom+8+height<=window.innerHeight-12?rect.bottom+8:Math.max(12,rect.top-height-8)});
    };
    const dismiss=(event:Event)=>{if(trigger.current?.contains(event.target as Node)||popup.current?.contains(event.target as Node))return;setPinned(false);setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setPinned(false);setOpen(false);}};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
    return()=>{clearTimeout(timer.current);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[open]);
  return <>
    <button ref={trigger} type="button" className="text-left no-underline" style={{font:'inherit',color:'inherit'}} aria-describedby={open?id:undefined} aria-expanded={open}
      onMouseEnter={show} onMouseLeave={leave} onFocus={()=>{focused.current=true;show();}} onBlur={()=>{focused.current=false;leave();}}
      onClick={()=>{clearTimeout(timer.current);setPinned(!pinned);setOpen(!pinned);}}>{name}</button>
    {open?createPortal(<div ref={popup} id={id} role="tooltip" onMouseEnter={show} onMouseLeave={leave}
      className="fixed z-[250] overflow-y-auto rounded-xl border p-4 text-sm leading-6 shadow-xl"
      style={{...position,maxHeight:'calc(100dvh - 24px)',whiteSpace:'normal',overflowWrap:'anywhere',background:'var(--qa-theme-50, #faf5ff)',borderColor:'var(--qa-theme-200, #e9d5ff)',color:'var(--qa-theme-950, #3b0764)'}}>
      <div className="font-semibold">{row?`${row.focusNo} · ${row.focusItem}`:name}</div>
      {row?<><p className="mt-3"><strong>วิธีประเมิน: </strong>{row.reviewGuide}</p><p className="mt-2"><strong>ตัวอย่างข้อผิดพลาดที่ควรหักคะแนน: </strong>{row.examples}</p></>:<p className="mt-2">ยังไม่มีคำอธิบายใน Rubrics สำหรับ Tag นี้</p>}
    </div>,document.body):null}
  </>;
}
