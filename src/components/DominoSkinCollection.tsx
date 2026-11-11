import {D6_COLLECTIONS} from '@/lib/d6-collections';
import { NauticalBundleOffer } from './NauticalBundleOffer';
import { NAUTICAL_FINISHES } from '@/lib/nautical-sets';
import { Link } from '@tanstack/react-router';
import {useEffect,useRef,useState} from 'react';
import {CLASSIC_DOMINO_SKIN,DOMINO_SKINS,DOMINO_INCLUDED_SKINS,DOMINO_SKIN_SLOT,DOMINO_GUEST_SKIN_KEY,DOMINO_SKIN_CHANGED,equippedDominoSkin} from '@/lib/dominoes-skins';
import type {EconomyCommandResult,EconomyWallet} from '@/lib/economy-protocol';
import {economyRequest,notifyEconomy} from '@/lib/economy-api';
import {StorePurchaseControls} from './StorePurchaseControls';
import {DominoFace} from './DominoArtwork';
import '@/styles/dominoes-store.css';
function guestSkin(){try{return localStorage.getItem(DOMINO_GUEST_SKIN_KEY);}catch{return null;}}
export function useDominoSkin(userId:string|null,wallet:EconomyWallet|null){
 const [included,setIncluded]=useState(guestSkin);
 useEffect(()=>{const update=(event:Event)=>setIncluded(event instanceof CustomEvent&&DOMINO_INCLUDED_SKINS.some(s=>s.id===event.detail)?event.detail:guestSkin());window.addEventListener(DOMINO_SKIN_CHANGED,update);window.addEventListener('storage',update);return()=>{window.removeEventListener(DOMINO_SKIN_CHANGED,update);window.removeEventListener('storage',update);};},[]);
 function chooseGuest(itemId:string){if(!DOMINO_INCLUDED_SKINS.some(s=>s.id===itemId))return;try{localStorage.setItem(DOMINO_GUEST_SKIN_KEY,itemId);}catch{/* This visit still keeps the choice. */}setIncluded(itemId);window.dispatchEvent(new CustomEvent(DOMINO_SKIN_CHANGED,{detail:itemId}));}
 return {design:userId?equippedDominoSkin(wallet):DOMINO_INCLUDED_SKINS.find(s=>s.id===included)??CLASSIC_DOMINO_SKIN,chooseGuest};
}
export function DominoSkinCollection({userId,wallet,onEquipped,ownedOnly=false}:{userId:string|null;wallet:EconomyWallet|null;ownedOnly?:boolean;onEquipped?:(owner:string,wallet:EconomyWallet)=>void}){
 const {design:selected,chooseGuest}=useDominoSkin(userId,wallet),[filter,setFilter]=useState('all'),[page,setPage]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false),mounted=useRef(true),actor=useRef(userId);actor.current=userId;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const size=ownedOnly?2:6;
 const designs=[...DOMINO_INCLUDED_SKINS,...DOMINO_SKINS].filter(s=>!ownedOnly||s.price===0||wallet?.owned.includes(s.id)).filter(s=>filter==='all'||(filter==='nautical'?s.id.includes('-nautical-'):filter==='included'?s.price===0:filter==='colors'?s.price===150&&!s.collection:filter==='specials'?s.price===250&&!s.collection&&!s.id.includes('-nautical-'):s.collection===filter)),pages=Math.max(1,Math.ceil(designs.length/size)),current=Math.min(page,pages-1);
 async function equip(itemId:string){
  if(pending.current)return;
  if(!userId){chooseGuest(itemId);return;}
  const owner=userId;pending.current=true;setBusy(true);setError('');
  try{const result=await economyRequest<EconomyCommandResult>({operation:'equip',slot:DOMINO_SKIN_SLOT,itemId},owner);
   if(!result.ok||result.receipt.type!=='equip'||result.receipt.itemId!==itemId||result.wallet.equipped[DOMINO_SKIN_SLOT]!==itemId)throw new Error('The tile choice could not be confirmed. Try again.');
   if(mounted.current&&actor.current===owner)onEquipped?.(owner,result.wallet);notifyEconomy();
  }catch(cause){if(mounted.current&&actor.current===owner)setError(cause instanceof Error?cause.message:'Tiles could not be equipped.');}
  finally{pending.current=false;if(mounted.current&&actor.current===owner)setBusy(false);}
 }
 return <section className="dm-skin-collection" aria-label="Dominoes tile collection"><p>{ownedOnly?<>Equip your owned tiles and free standards here. <Link to="/store" search={{category:'dominoes'}} className="text-gold underline">Collect more tiles in the Store →</Link></>:<>Two Clubhouse Standard sets are included: ivory dots and colored numbers. Jewel colors cost 188 Dominoes points or 145 Cash; Onyx Skulls and Solar Ivory cost 313 points or 242 Cash. There are also 56 matching rainbow, dessert, fruit, fabric, animal, material and sports finishes. Buy once or collect three matching fragments from in-game reward crates, then equip for Draw, Block, and Muggins.</>}</p>{!ownedOnly&&filter==='nautical'&&<NauticalBundleOffer game="dominoes" userId={userId} wallet={wallet} onBrowse={()=>{setFilter('nautical');setPage(0);}}/>}<div className="dm-skin-filters" role="group" aria-label="Domino skin designs">{[['all','All tiles'],['included','Free standards'],['colors','Colors · 150'],['specials','Specials · 250'],['nautical','Nautical · 250'],...D6_COLLECTIONS].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>{setFilter(value);setPage(0);}}>{label}</button>)}</div><div className="dm-skin-pages"><button className="btn-ghost-gold" disabled={current===0} onClick={()=>setPage(current-1)}>Previous tiles</button><span role="status">{current+1} / {pages}</span><button className="btn-ghost-gold" disabled={current+1===pages} onClick={()=>setPage(current+1)}>Next tiles</button></div><div className="dm-skin-products">{designs.slice(current*size,current*size+size).map(skin=>{
  const owned=!skin.price||Boolean(wallet?.owned.includes(skin.id)),equipped=selected.id===skin.id;
  return <article className="card-hub" key={skin.id} aria-label={skin.name}><div className="dm-skin-samples" aria-label={`${skin.name} preview`}>{(['0-6','2-5','3-4'] as const).map(id=><DominoFace key={id} id={id} vertical design={skin}/>)}</div><h3>{skin.name}</h3><p>{skin.description??NAUTICAL_FINISHES.find(f=>skin.id===`domino-skin-nautical-${f.key}`)?.description??(skin.symbol==='number'?'Large colored numerals from 0 to 6 on warm ivory. Red, green, blue, orange, purple and teal help distinguish the values.':skin.symbol==='skull'?'Polished onyx with sculpted white skull pips, deep eye sockets, cheekbones and engraved teeth.':skin.symbol==='sun'?'Warm white tiles with golden sunburst pips.':skin.price?'Jewel-colored tiles with crisp ivory pips and beveled edges.':'Traditional ivory tiles with dark green pips.')}</p>{!ownedOnly&&skin.price?<StorePurchaseControls itemId={skin.id} userId={userId} wallet={wallet}/>:skin.price===0?<p className="text-gold">Included free</p>:null}{owned&&<button className="btn-gold" disabled={busy||equipped||Boolean(userId&&!wallet)} onClick={()=>void equip(skin.id)}>{equipped?'Equipped':'Equip tiles'}</button>}</article>;
 })}</div>{ownedOnly&&designs.length===0&&<p>No owned tiles in this category yet. Choose Free standards for your included sets.</p>}{error&&<p role="alert">{error}</p>}</section>;
}
