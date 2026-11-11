import {supabase} from '@/integrations/supabase/client';
export class MatchRequestError extends Error { constructor(message:string,public status:number){super(message);} }
export async function matchRequest<T>(path:string,userId:string|null,body?:unknown,signal?:AbortSignal):Promise<T>{
 const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();const timer=setTimeout(cancel,15000);
 try{
  const headers:Record<string,string>={};
  if(supabase){const {data,error}=await supabase.auth.getSession();if(error)throw error;if((data.session?.user.id??null)!==userId)throw new Error('Your account changed. Reopen Match Making.');if(data.session)headers.Authorization=`Bearer ${data.session.access_token}`;}
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers,signal:controller.signal,...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw new MatchRequestError(data.error??'The table could not connect. Refresh and try again.',response.status);return data as T;
 }catch(error){if(controller.signal.aborted)throw new Error('Connection interrupted. Check your saved table before trying again.');throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
