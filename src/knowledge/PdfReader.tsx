import React, { useEffect, useMemo, useRef, useState } from 'react';
import { generateGuidePdfBundle } from './pdf';
import type { GuideChapter } from './guideModel';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';

const normalize = (text: string) => text.normalize('NFC').replace(/[\u200b-\u200d\ufeff]/g,'').toLocaleLowerCase();
export default function PdfReader({ chapter }: { chapter: GuideChapter }) {
  const [doc,setDoc] = useState<any>(null), [texts,setTexts] = useState<string[]>([]), [url,setUrl] = useState('');
  const [page,setPage] = useState(1), [zoom,setZoom] = useState(1), [width,setWidth] = useState(720), [query,setQuery] = useState(''), [search,setSearch] = useState('');
  const [error,setError] = useState(''), [loading,setLoading] = useState(true), [rendering,setRendering] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null), textLayer = useRef<HTMLDivElement>(null), area = useRef<HTMLDivElement>(null);
  const [size,setSize] = useState({ width: 700, height: 990 });
  useEffect(() => {
    let alive = true, objectUrl = '', task: any, loaded: any;
    setDoc(null); setUrl(''); setTexts([]); setPage(1); setSearch(''); setQuery(''); setError(''); setLoading(true);
    (async()=> {
      const bundle = await generateGuidePdfBundle([chapter]); if (!alive) return;
      const bytes = bundle.pdf.output('arraybuffer');
      objectUrl = URL.createObjectURL(new Blob([bytes],{ type:'application/pdf' }));
      const engine = await import('pdfjs-dist'); if (!alive) return;
      engine.GlobalWorkerOptions.workerSrc = workerUrl;
      task = engine.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }); loaded = await task.promise;
      if (!alive) { await loaded.destroy(); return; }
      setTexts(bundle.pageTexts); setUrl(objectUrl); setDoc(loaded); setLoading(false);
    })().catch(reason=> { if (alive) { setError(reason instanceof Error ? reason.message : 'เปิด PDF ไม่สำเร็จ'); setLoading(false); } });
    return ()=> { alive=false; if (objectUrl) URL.revokeObjectURL(objectUrl); if (task) void task.destroy(); };
  },[chapter]);
  useEffect(()=> {
    if (!area.current) return;
    const observer = new ResizeObserver(entries=>setWidth(Math.max(260,entries[0].contentRect.width-32)));
    observer.observe(area.current); return ()=>observer.disconnect();
  },[]);
  useEffect(()=> {
    if (!doc || !canvas.current || !textLayer.current) return;
    let alive = true, renderTask: any, layer: any; setRendering(true);
    (async()=> {
      const pdfPage = await doc.getPage(page); if (!alive) return;
      const viewport = pdfPage.getViewport({ scale: width/pdfPage.getViewport({scale:1}).width*zoom });
      const node = canvas.current!, textNode = textLayer.current!, ratio = Math.min(window.devicePixelRatio || 1,2);
      setSize({width:viewport.width,height:viewport.height});
      node.width=Math.ceil(viewport.width*ratio); node.height=Math.ceil(viewport.height*ratio);
      node.style.width=`${viewport.width}px`; node.style.height=`${viewport.height}px`;
      textNode.replaceChildren(); textNode.style.setProperty('--scale-factor',String(viewport.scale)); textNode.style.setProperty('--total-scale-factor',String(viewport.scale));
      renderTask = pdfPage.render({ canvas: node, canvasContext: node.getContext('2d'), viewport, transform:ratio===1?undefined:[ratio,0,0,ratio,0,0] });
      await renderTask.promise; if (!alive) return;
      const engine = await import('pdfjs-dist'); if (!alive) return;
      layer = new engine.TextLayer({ textContentSource: await pdfPage.getTextContent(), container: textNode, viewport });
      if (!alive) { layer.cancel(); return; } await layer.render();
    })().catch(reason=> { if (alive && reason?.name!=='RenderingCancelledException') setError('แสดงหน้านี้ไม่สำเร็จ กรุณาเปิดหัวข้ออีกครั้ง'); }).finally(()=> { if (alive) setRendering(false); });
    return ()=> { alive=false; renderTask?.cancel(); layer?.cancel(); };
  },[doc,page,zoom,width]);
  const matches = useMemo(()=>{ const words=normalize(search).trim().split(/\s+/).filter(Boolean); return words.length ? texts.map((text,index)=>({text,index})).filter(row=>words.every(word=>normalize(row.text).includes(word))) : []; },[texts,search]);
  return <section className="guide-pdf-reader" aria-label={`PDF ${chapter.title}`}>
    <div className="guide-pdf-toolbar"><div className="guide-pdf-pages"><button disabled={!doc || page<=1} onClick={()=>setPage(page-1)} aria-label="หน้าก่อนหน้า">‹</button><label>หน้า <select aria-label="หน้า PDF" value={page} disabled={!doc} onChange={event=>setPage(Number(event.target.value))}>{Array.from({length:doc?.numPages || 1},(_,index)=><option key={index} value={index+1}>{index+1}</option>)}</select> / {doc?.numPages || '—'}</label><button disabled={!doc || page>=doc.numPages} onClick={()=>setPage(page+1)} aria-label="หน้าถัดไป">›</button></div>
      <label>ขนาด <select aria-label="ขนาด PDF" value={zoom} onChange={event=>setZoom(Number(event.target.value))}><option value={1}>พอดีความกว้าง</option><option value={1.25}>125%</option><option value={1.5}>150%</option><option value={2}>200%</option></select></label>
      {url && <a className="knowledge-secondary" href={url} download={`QA_User_Guide_${chapter.id}.pdf`}>ดาวน์โหลดบทนี้</a>}
    </div>
    <form className="guide-pdf-search" onSubmit={event=>{event.preventDefault();setSearch(query);}}><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="ค้นหาข้อความใน PDF บทนี้" aria-label="ค้นหาใน PDF"/><button className="knowledge-secondary" disabled={!doc}>ค้นหาใน PDF</button></form>
    {search && <div className="guide-pdf-matches" role="status">{matches.length ? `พบใน ${matches.length} หน้า` : 'ไม่พบข้อความในบทนี้'} {matches.map(row=><button key={row.index} aria-current={page===row.index+1} onClick={()=>{setPage(row.index+1);area.current?.scrollTo({top:0,left:0});}}>หน้า {row.index+1}</button>)}<button onClick={()=>{setSearch('');setQuery('');}}>ล้างการค้นหา</button></div>}
    <div ref={area} className="guide-pdf-scroll" aria-busy={loading || rendering}>
      {loading&&<p role="status">กำลังเตรียม PDF สารบรรณ…</p>}{error&&<p className="knowledge-error" role="alert">{error}</p>}
      <div className="guide-pdf-page" style={{width:size.width,height:size.height,display:doc?'block':'none'}}><canvas ref={canvas} aria-label={`หน้า ${page} จาก ${doc?.numPages || 0}`} role="img"/><div ref={textLayer} className="textLayer"/></div>
    </div>
  </section>;
}
