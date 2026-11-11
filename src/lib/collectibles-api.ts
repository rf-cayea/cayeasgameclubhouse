import {useEffect,useRef,useState} from 'react';
import {matchRequest,MatchRequestError} from './matchmaking-api';
import {notifyEconomy,useEconomyResource} from './economy-api';
import {useClubhouse} from './clubhouse';
import type {AlbumView,CardReceipt,CollectibleCommand} from './collectibles';
import type {EconomyWallet} from './economy-protocol';
export const useAlbum=(owner:string|null)=>useEconomyResource<AlbumView>('/api/collectibles',owner);
export function useCollectibleActions(){const{user,applyWallet}=useClubhouse(),id=user?.id??null,key=`cayea-collectible-pending:${id??'guest'}`,owner=useRef(id),mounted=useRef(true),flight=useRef(false);owner.current=id;const[busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<CardReceipt|null>(null),[pending,setPending]=useState<CollectibleCommand|null>(()=>{try{return JSON.parse(sessionStorage.getItem(key)??'null');}catch{return null;}});useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 function save(command:CollectibleCommand|null){try{if(command)sessionStorage.setItem(key,JSON.stringify(command));else sessionStorage.removeItem(key);}catch{}setPending(command);}
 async function execute(command:CollectibleCommand,retry=false){if(!id||flight.current)return null;if(pending&&!retry){setError('Retry the pending action before starting another.');return null;}const actor=id;flight.current=true;setBusy(true);setError('');save(command);try{const result=await matchRequest<{wallet:EconomyWallet;album:AlbumView;receipt:CardReceipt}>('/api/collectibles',actor,command);if(mounted.current&&owner.current===actor){applyWallet(actor,result.wallet);setReceipt(result.receipt);save(null);}notifyEconomy();return result;}catch(e){if(mounted.current&&owner.current===actor){setError(e instanceof Error?e.message:'The action could not be confirmed. Retry it.');if(e instanceof MatchRequestError&&[400,401,403,404,409].includes(e.status))save(null);}notifyEconomy();return null;}finally{flight.current=false;if(mounted.current&&owner.current===actor)setBusy(false);}}
 return{busy,error,receipt,pending,run:(c:CollectibleCommand)=>execute(c),retry:()=>pending?execute(pending,true):Promise.resolve(null)};
}
