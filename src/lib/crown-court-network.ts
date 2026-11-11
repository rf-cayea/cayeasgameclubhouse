import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { notifyWallet } from './clubhouse';
import type { CrownCourtCommand, CrownCourtRoomView } from './crown-court-protocol';

type DiceInput = CrownCourtCommand extends infer C ? C extends { requestId: string } ? Omit<C, 'requestId'> : never : never;
class DiceNetworkError extends Error { constructor(message: string, readonly status = 0) { super(message); } }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Your table could not connect.';
const validCode = (value: unknown): value is string => typeof value === 'string' && /^[A-F0-9]{8}$/.test(value);
const getSaved = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const save = (key: string, value: string | null) => { try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key,value); } catch { /* Optional session continuity. */ } };

export function useCrownCourtRoom(userId: string | null, ready: boolean) {
  const scope = `clubhouse-crown-court:${userId ?? 'guest'}`;
  const [room,setRoom] = useState<CrownCourtRoomView|null>(null),[code,setCode] = useState<string|null>(null);
  const [pending,setPending] = useState(false),[healthy,setHealthy] = useState(false),[live,setLive] = useState(false),[error,setError] = useState('');
  const [uncertain,setUncertain] = useState<CrownCourtCommand|null>(null),[initialized,setInitialized] = useState(false);
  const dataScope=useRef(scope),mounted=useRef(false),epoch=useRef(0),actor=useRef(scope),currentCode=useRef<string|null>(null),busy=useRef(false),readBusy=useRef(false);
  const controllers=useRef(new Set<AbortController>()),uncertainRef=useRef<CrownCourtCommand|null>(null),credits=useRef(new Set<string>());
  actor.current=scope;uncertainRef.current=uncertain;

  const request=useCallback(async<T,>(path:string,body:unknown|undefined,signal?:AbortSignal):Promise<T>=>{
    const owner=userId,ownerScope=scope,controller=new AbortController();controllers.current.add(controller);
    const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
    const timeout=setTimeout(cancel,15000);
    try{
      const headers:Record<string,string>={};
      if(supabase){const{data,error}=await supabase.auth.getSession();if(error)throw error;
        if((data.session?.user.id??null)!==owner)throw new DiceNetworkError('Your account changed. Reopen your table.',401);
        if(data.session)headers.Authorization=`Bearer ${data.session.access_token}`;}
      if(actor.current!==ownerScope||controller.signal.aborted)throw new DiceNetworkError('Your account changed. Reopen your table.',401);
      if(body!==undefined)headers['Content-Type']='application/json';
      let response:Response;try{response=await fetch(path,{method:body===undefined?'GET':'POST',headers,credentials:'same-origin',signal:controller.signal,...(body===undefined?{}:{body:JSON.stringify(body)})});}
      catch{throw new DiceNetworkError('Connection interrupted. Check the table or retry the same action before playing again.');}
      let data:unknown;try{data=await response.json();}catch{throw new DiceNetworkError('The server reply could not be confirmed. Retry the same action.');}
      if(!response.ok)throw new DiceNetworkError(data&&typeof data==='object'&&'error'in data?String(data.error):'This action could not be completed.',response.status);
      return data as T;
    }finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);controllers.current.delete(controller);}
  },[scope,userId]);
  const accept=useCallback((next:CrownCourtRoomView)=>{
    if(!next||!validCode(next.code)||!Number.isSafeInteger(next.revision))throw new DiceNetworkError('The table reply could not be verified.');
    setRoom(previous=>previous?.code===next.code&&(previous.revision>next.revision||previous.revision===next.revision&&previous.reward?.status==='credited'&&next.reward?.status!=='credited')?previous:next);
    setHealthy(true);
    if(next.reward?.status==='credited'&&next.reward.source&&!credits.current.has(next.reward.source)){credits.current.add(next.reward.source);notifyWallet();}
  },[]);
  const refresh=useCallback(async()=>{
    if(!ready||!currentCode.current||readBusy.current)return;
    const version=epoch.current,selected=currentCode.current;readBusy.current=true;
    try{const next=await request<CrownCourtRoomView>(`/api/crown-court/room/${selected}`,undefined);
      if(!mounted.current||version!==epoch.current||selected!==currentCode.current)return;accept(next);if(!uncertainRef.current)setError('');}
    catch(cause){if(mounted.current&&version===epoch.current){setHealthy(false);setError(errorText(cause));
      if(cause instanceof DiceNetworkError&&[401,403,404].includes(cause.status)&&!uncertainRef.current){save(scope+':room',null);currentCode.current=null;setCode(null);setRoom(null);}}}
    finally{if(version===epoch.current)readBusy.current=false;}
  },[accept,ready,request,scope]);

  useEffect(()=>{
    mounted.current=true;dataScope.current=scope;++epoch.current;busy.current=false;readBusy.current=false;
    for(const c of controllers.current)c.abort();controllers.current.clear();credits.current.clear();
    setRoom(null);setPending(false);setHealthy(false);setLive(false);setError('');setInitialized(false);
    if(!ready){currentCode.current=null;setCode(null);setUncertain(null);return;}
    const saved=getSaved(scope+':room'),selected=validCode(saved)?saved:null;currentCode.current=selected;setCode(selected);
    let retry:CrownCourtCommand|null=null;
    try{const stored=JSON.parse(getSaved(scope+':uncertain')??'null');if(stored&&typeof stored==='object'&&typeof stored.requestId==='string'&&['create','join','ready','start','move','leave'].includes(stored.operation))retry=stored;}catch{/* No recoverable request. */}
    setUncertain(retry);uncertainRef.current=retry;setInitialized(true);
    return()=>{mounted.current=false;++epoch.current;for(const c of controllers.current)c.abort();controllers.current.clear();};
  },[ready,scope]);
  useEffect(()=>{if(initialized&&code)void refresh();},[initialized,code,refresh]);
  useEffect(()=>{
    if(!ready||!code||!initialized)return;
    let active=true;const controller=new AbortController(),version=epoch.current;
    const focused=()=>void refresh(),poll=setInterval(focused,2500);window.addEventListener('focus',focused);
    async function stream(){
      while(active){
        try{
          const headers:Record<string,string>={};if(supabase){const{data,error}=await supabase.auth.getSession();if(error||(data.session?.user.id??null)!==userId)throw new Error('Account changed.');if(data.session)headers.Authorization=`Bearer ${data.session.access_token}`;}
          const response=await fetch(`/api/crown-court/room/${code}/events`,{headers,credentials:'same-origin',signal:controller.signal});
          if(!response.ok||!response.body||!response.headers.get('content-type')?.startsWith('text/event-stream'))throw new Error('Stream not available.');
          if(!active||epoch.current!==version)break;setLive(true);
          const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
          while(active){const part=await reader.read();if(part.done)break;buffer=(buffer+decoder.decode(part.value,{stream:true})).replace(/\r\n/g,'\n');if(buffer.length>65536)throw new Error('Invalid stream.');let end:number;while((end=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(frame.split('\n').some(line=>line.startsWith('data:')))void refresh();}}
          await reader.cancel();
        }catch{/* Polling keeps the same authoritative table available. */}
        if(active&&epoch.current===version){setLive(false);await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,1800);controller.signal.addEventListener('abort',done,{once:true});if(controller.signal.aborted)done();});}
      }
    }
    void stream();return()=>{active=false;controller.abort();clearInterval(poll);window.removeEventListener('focus',focused);};
  },[code,initialized,ready,refresh,userId]);

  const execute=useCallback(async(input:CrownCourtCommand,retry=false)=>{
    if(!ready||!initialized||busy.current||uncertainRef.current&&!retry)return false;
    const version=epoch.current,ownerScope=scope;busy.current=true;setPending(true);setError('');
    // Save before sending: a reload after a committed roll must retry this ID.
    save(ownerScope+':uncertain',JSON.stringify(input));
    try{
      const result=await request<{view:CrownCourtRoomView;changed:boolean}>('/api/crown-court',input);
      if(!mounted.current||version!==epoch.current||ownerScope!==actor.current)return false;
      save(ownerScope+':uncertain',null);setUncertain(null);uncertainRef.current=null;
      if(input.operation==='leave'){save(ownerScope+':room',null);currentCode.current=null;setCode(null);setRoom(null);setHealthy(false);setLive(false);}
      else{accept(result.view);currentCode.current=result.view.code;save(ownerScope+':room',result.view.code);setCode(result.view.code);}
      return true;
    }catch(cause){
      if(mounted.current&&version===epoch.current&&ownerScope===actor.current){setError(errorText(cause));
        if(!(cause instanceof DiceNetworkError)||cause.status===0||cause.status>=500){save(ownerScope+':uncertain',JSON.stringify(input));setUncertain(input);uncertainRef.current=input;setHealthy(false);}
        else{save(ownerScope+':uncertain',null);setUncertain(null);uncertainRef.current=null;}
        void refresh();}
      return false;
    }finally{if(version===epoch.current){busy.current=false;if(mounted.current)setPending(false);}}
  },[accept,initialized,ready,refresh,request,scope]);
  const command=useCallback((input:DiceInput)=>execute({...input,requestId:crypto.randomUUID()} as CrownCourtCommand),[execute]);
  const retry=useCallback(()=>uncertainRef.current?execute(uncertainRef.current,true):Promise.resolve(false),[execute]);
  const visible=ready&&dataScope.current===scope;
  return{room:visible?room:null,code:visible?code:null,pending:visible&&pending,healthy:visible&&healthy,live:visible&&live,error:visible?error:'',initialized:visible&&initialized,uncertain:visible?uncertain:null,command,retry,refresh};
}
