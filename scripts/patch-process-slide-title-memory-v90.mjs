// Applied after all historical Process Library UI transforms in build:app.
// The source repo retains its original unpatched Process Library between builds.
import fs from "node:fs";

const file = "src/processLibrary.tsx";
let source = fs.readFileSync(file,"utf8");
const marker = "// process-slide-title-persistence-v90";
if (!source.includes(marker)) {
  if (!source.includes("// process-library-multi-file-v84")) {
    throw Error("Process title memory v90 requires multi-file Process Library v84");
  }
  function exactlyOne(from,to,label){
    const count=source.split(from).length-1;
    if(count!==1)throw Error("Process title memory v90 "+label+": "+count+" matches");
    source=source.replace(from,to);
  }
  function exactlyOnePattern(pattern,replacement,label){
    const hits=source.match(pattern);
    if(!hits)throw Error("Process title memory v90 missing "+label);
    source=source.replace(pattern,replacement);
  }
  exactlyOne(
    'import { RichTextContent } from "./richText";',
    'import { RichTextContent } from "./richText";\nimport { effectiveSlideTitle, slideTitleKey, slideTitleOverridePayload } from "./lib/processSlideTitleMemory.mjs";\n'+marker,
    "import"
  );

  // Prefer shared metadata overrides, but preserve titles already saved into
  // the old slideTitles array for backward compatibility.
  exactlyOne(
    'slideTitles: Array.from({ length: count }, (_, index) => titles[index] || "Slide " + (index + 1)),',
    'slideTitles: Array.from({ length: count }, (_, index) => effectiveSlideTitle(row, index + 1)),',
    "metadata resolution"
  );

  exactlyOne(
    '  const [selectedProcessIdV84, setSelectedProcessIdV84] = useState(BUILTIN_VERSION.id);',
    '  const [selectedProcessIdV84, setSelectedProcessIdV84] = useState(BUILTIN_VERSION.id);\n'
      +'  const titleDraftsV90 = useRef<Map<string,string>>(new Map());\n'
      +'  const [titleSaveStateV90,setTitleSaveStateV90] = useState<{key:string;status:"saving"|"saved"|"error"} | null>(null);',
    "draft and save state"
  );

  // Do not continuously copy stale case-local titles back over newly edited
  // global titles. Historical cases keep their own serialized Process Reference.
  function disableLegacyBackfill(startText,endText,label){
    const start=source.indexOf(startText),stop=start<0?-1:source.indexOf(endText,start);
    if(start<0 || stop<0 || source.indexOf(startText,start+1)>=0)
      throw Error("Process title memory v90 missing "+label);
    source=source.slice(0,start)+'  // Legacy title repair disabled: the per-slide metadata override is authoritative.\n'
      +source.slice(stop+endText.length);
  }
  disableLegacyBackfill(
    '  // Backfill custom titles already stored in the current case into the Process Version.',
    '  }, [historical, active.id, active.slideCount, active.slideTitles, parsedRefs]);',
    "legacy case backfill"
  );
  disableLegacyBackfill(
    '  // Repair titles from the submitted cases that originally introduced the custom names.',
    '  }, [historical, active.id]);',
    "hardcoded historical case repair"
  );

  exactlyOnePattern(
    /  const updateDisplayTitle = \(versionId: string, slideNumber: number, nextTitle: string\) => \{[\s\S]*?\n  \};/,
    [
      '  const updateDisplayTitle = (versionId: string, slideNumber: number, nextTitle: string) => {',
      '    titleDraftsV90.current.set(slideTitleKey(versionId,slideNumber),nextTitle);',
      '    writeRefs(parsedRefs.map((item) => item.versionId === versionId && item.slideNumber === slideNumber',
      '      ? { ...item, step: nextTitle, slideTitle: nextTitle.trim() || item.slideTitle } : item));',
      '  };'
    ].join('\n'),"edit handler"
  );

  exactlyOnePattern(
    /  const persistDisplayTitleV78 = \(versionId: string, slideNumber: number, nextTitle: string\) => \{[\s\S]*?\n  \};/,
    [
      '  const persistDisplayTitleV78 = async (versionId: string, slideNumber: number, nextTitle: string) => {',
      '    const key=slideTitleKey(versionId,slideNumber);',
      '    const cleanTitle=String(nextTitle || "").replace(/\\s+/g," ").trim().slice(0,240);',
      '    const target=processLibraryV84.find(row=>row.id===versionId) || (active.id===versionId ? active : null);',
      '    if(!cleanTitle || !versionId || !target)return;',
      '    const nextTitles=[...target.slideTitles];',
      '    nextTitles[slideNumber-1]=cleanTitle;',
      '    titleDraftsV90.current.set(key,cleanTitle);',
      '    setProcessLibraryV84(rows=>rows.map(row=>row.id===versionId ? {...row,slideTitles:nextTitles}:row));',
      '    setCurrent(row=>row.id===versionId ? {...row,slideTitles:nextTitles}:row);',
      '    setTitleSaveStateV90({key,status:"saving"});',
      '    const services=firebaseServices();',
      '    if(!services){setTitleSaveStateV90({key,status:"error"});return;}',
      '    try{',
      '      const batch=writeBatch(services.db);',
      '      // merge:true writes only slideTitleOverrides.<slide>, not the entire slideTitles array.',
      '      batch.set(doc(services.db,PROCESS_COLLECTION,versionId),',
      '        slideTitleOverridePayload(slideNumber,cleanTitle),{merge:true});',
      '      await batch.commit();',
      '      setTitleSaveStateV90(previous=>previous?.key===key?{key,status:"saved"}:previous);',
      '    }catch(error){',
      '      console.error("Save custom Process slide title failed",error);',
      '      setTitleSaveStateV90(previous=>previous?.key===key?{key,status:"error"}:previous);',
      '    }',
      '  };'
    ].join('\n'),"per-slide save handler"
  );

  // Re-select an already renamed slide using the per-file + slide override,
  // even if a save has not yet completed or the Firestore snapshot is delayed.
  exactlyOne(
    '    const fallbackTitle = active.slideTitles[Math.max(0, slideNumber - 1)] || ("Slide " + slideNumber);',
    '    const fallbackTitle = titleDraftsV90.current.get(slideTitleKey(active.id,slideNumber))'
     +' || active.slideTitles[Math.max(0, slideNumber - 1)] || ("Slide " + slideNumber);',
    "reselect name"
  );
  exactlyOne(
    '      const originalTitle = String(title || ("Slide " + slideNumber));',
    '      const originalTitle = String(titleDraftsV90.current.get(slideTitleKey(active.id,slideNumber)) || title || ("Slide " + slideNumber));',
    "picker name"
  );

  // The picker must show the authoritative version title, not a stale case-local Step.
  exactlyOne(
    '      const selectedRef = parsedRefs.find((item) => item.versionId === active.id && item.slideNumber === slideNumber);\n      const typedTitle = selectedRef?.step && selectedRef.step !== "ทั้งสไลด์"\n        ? String(selectedRef.step).trim()\n        : (selectedRef?.slideTitle ? String(selectedRef.slideTitle).trim() : "");\n      return { slideNumber, title: typedTitle || originalTitle, isCustom: Boolean(typedTitle) };',
    '      return { slideNumber, title: originalTitle, isCustom: Boolean(titleDraftsV90.current.get(slideTitleKey(active.id,slideNumber))) };',
    "picker authoritative title"
  );

  exactlyOne(
    'onBlur={(event) => persistDisplayTitleV78(meta.versionId, meta.slideNumber, event.currentTarget.value)} placeholder="พิมพ์ชื่อหัวข้อที่ต้องการแสดง..."',
    'onBlur={(event) => { void persistDisplayTitleV78(meta.versionId, meta.slideNumber, event.currentTarget.value); }}'
      +' onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} placeholder="พิมพ์ชื่อหัวข้อที่ต้องการแสดง..."',
    "commit on blur/Enter"
  );

  const feedbackAnchor=' placeholder="พิมพ์ชื่อหัวข้อที่ต้องการแสดง..."';
  if(source.split(feedbackAnchor).length!==2)throw Error("Process title memory v90 input feedback anchor missing");
  // Place the status after the full input closing tag, without changing the input value.
  const inputClose=/placeholder="พิมพ์ชื่อหัวข้อที่ต้องการแสดง\.\.\."[^>]*\/>/;
  exactlyOnePattern(inputClose,match=>match+'\n'
    +'                      {titleSaveStateV90?.key === slideTitleKey(meta.versionId,meta.slideNumber) ? ('
    +'<div role="status" className={"mt-1 text-[10px] font-semibold " + (titleSaveStateV90.status==="error"?"text-rose-600":"text-slate-500")}>'
    +'{titleSaveStateV90.status==="saving"?"กำลังบันทึกชื่อ...":titleSaveStateV90.status==="saved"?"บันทึกชื่อแล้ว":"บันทึกชื่อไม่สำเร็จ กรุณากด Enter หรือลองแก้อีกครั้ง"}'
    +'</div>) : null}',"save status"
  );

  fs.writeFileSync(file,source);
  console.log("Applied per-version per-slide durable Process title memory v90");
}else{
  console.log("Process title memory v90 already applied");
}
