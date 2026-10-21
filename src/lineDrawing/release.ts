import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { firebaseDb } from '../firebaseClient';
import { validateStoredUserSession } from '../sessionStore';
import { canUseLineDrawing, isLineDrawingOwner, normalizeLineDrawingRelease } from './model.mjs';
type Actor={username:string;sessionId?:string};
export type LineDrawingRelease={published:boolean;ready:boolean;saving:boolean;error:string;owner:boolean;allowed:boolean;setPublished:(value:boolean)=>Promise<void>};
export function useLineDrawingRelease(actor:Actor|null):LineDrawingRelease{
  const [state,setState]=useState({published:false,ready:false,saving:false,error:''});
  const actorRef=useRef(actor);actorRef.current=actor;
  const savingRef=useRef(false);
  useEffect(()=>{
    let active=true;
    const unsubscribe=onSnapshot(doc(firebaseDb,'qa_system_settings','line_drawing_release_v1'),{includeMetadataChanges:true},snapshot=>{
      // A local/cache value is not a confirmed release to other accounts.
      if(!active||snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
      const release=normalizeLineDrawingRelease(snapshot.data());
      setState(current=>({...current,published:release.published,ready:true,error:''}));
    },()=>{if(active)setState(current=>({...current,published:false,ready:false,error:'ตรวจสถานะเผยแพร่ไม่สำเร็จ กรุณาเชื่อมต่อแล้วลองใหม่'}));});
    return()=>{active=false;unsubscribe();};
  },[]);
  const setPublished=async(value:boolean)=>{
    const requestActor=actorRef.current;
    if(!isLineDrawingOwner(requestActor?.username)||!requestActor?.sessionId||!state.ready||savingRef.current)return;
    savingRef.current=true;setState(current=>({...current,saving:true,error:''}));
    try{
      const session=await validateStoredUserSession(requestActor.sessionId,requestActor.username);
      if(!session.valid||!isLineDrawingOwner(session.session.username)||actorRef.current?.sessionId!==requestActor.sessionId)throw new Error('session');
      await setDoc(doc(firebaseDb,'qa_system_settings','line_drawing_release_v1'),{schemaVersion:1,published:value===true,updatedBy:requestActor.username,updatedAt:serverTimestamp()},{merge:true});
      if(actorRef.current?.sessionId===requestActor.sessionId)setState(current=>({...current,published:value===true,saving:false,error:''}));
    }catch{setState(current=>({...current,saving:false,error:'บันทึกสถานะเผยแพร่ไม่สำเร็จ กรุณาลองใหม่ สถานะเดิมยังคงอยู่'}));}
    finally{savingRef.current=false;}
  };
  const owner=isLineDrawingOwner(actor?.username);
  return {...state,owner,allowed:canUseLineDrawing(actor?.username,state),setPublished};
}
