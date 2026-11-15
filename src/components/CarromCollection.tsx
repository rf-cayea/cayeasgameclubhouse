import {CARROM_MANDALAS,CARROM_MANDALA_BUNDLES} from '@/lib/carrom-mandalas';
import {D6_COLLECTIONS} from '@/lib/d6-collections';
import {useState} from 'react';
import {Link} from '@tanstack/react-router';
import {useClubhouse} from '@/lib/clubhouse';
import {economyRequest,notifyEconomy} from '@/lib/economy-api';
import type {EconomyCommandResult} from '@/lib/economy-protocol';
import {
  CARROM_BOARD_SLOT,CARROM_PUCK_SLOT,CARROM_STRIKER_SLOT,CARROM_BOARDS,CARROM_PUCKS,CARROM_STRIKERS,
  CLASSIC_CARROM_BOARD,CLASSIC_CARROM_PUCKS,CLASSIC_CARROM_STRIKER,equippedCarrom,
} from '@/lib/carrom-sets';
import {CarromBoard} from './CarromBoard';
import {CarromDisc} from './CarromDisc';
import {StorePurchaseControls} from './StorePurchaseControls';
import '@/styles/carrom-collection.css';

const groups=[
  {label:'Boards',slot:CARROM_BOARD_SLOT,items:[CLASSIC_CARROM_BOARD,...CARROM_BOARDS]},
  {label:'Puck sets',slot:CARROM_PUCK_SLOT,items:[CLASSIC_CARROM_PUCKS,...CARROM_PUCKS]},
  {label:'Strikers',slot:CARROM_STRIKER_SLOT,items:[CLASSIC_CARROM_STRIKER,...CARROM_STRIKERS]},
] as const;
const noop=()=>{};
const sampleShot={x:500,angle:-Math.PI/2,power:.55};

export function CarromItemArtwork({id}:{id:string}){
  const board=groups[0].items.find(item=>item.id===id);
  if(board)return <div className="carrom-item-board"><CarromBoard preview boardDesign={board}
    balls={[]} shot={sampleShot} seat={0} replay={null} canShoot={false}
    onShot={noop} onAim={noop} onAnimation={noop} onReplayComplete={noop} onSound={noop}/></div>;
  const pucks=groups[1].items.find(item=>item.id===id);
  if(pucks)return <svg className="carrom-item-discs" viewBox="0 0 140 76" aria-hidden="true">
    <g transform="translate(29 39)"><CarromDisc kind="white" radius={21} pucks={pucks}/></g>
    <g transform="translate(111 39)"><CarromDisc kind="black" radius={21} pucks={pucks}/></g>
    <g transform="translate(70 39)"><CarromDisc kind="queen" radius={21} pucks={pucks}/></g>
  </svg>;
  const striker=groups[2].items.find(item=>item.id===id);
  return striker?<svg className="carrom-item-discs" viewBox="0 0 140 76" aria-hidden="true">
    <g transform="translate(70 37)"><CarromDisc kind="striker" radius={27} striker={striker}/></g>
  </svg>:null;
}

export function CarromCollection({store=false}:{store?:boolean}){
  const {user,wallet,applyWallet}=useClubhouse();
  const [tab,setTab]=useState(0),[mandalas,setMandalas]=useState(false),[page,setPage]=useState(0),[finish,setFinish]=useState('all'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const group=groups[tab]!;
  const items=group.items.filter(item=>store||item.price===0||wallet?.owned.includes(item.id))
    .filter(item=>!mandalas||('mandala' in item&&item.mandala!==undefined))
    .filter(item=>mandalas||group.slot!==CARROM_PUCK_SLOT||finish==='all'||('collection' in item ? item.collection??'classic' : 'classic')===finish);
  const pages=Math.max(1,Math.ceil(items.length/4)),current=Math.min(page,pages-1);
  const equipped=equippedCarrom(wallet);
  const equippedId=[equipped.boardDesign.id,equipped.puckDesign.id,equipped.strikerDesign.id][tab];
  async function equip(itemId:string){
    if(!user||busy)return;
    const owner=user.id;
    setBusy(true);setError('');
    try {
      const result=await economyRequest<EconomyCommandResult>({operation:'equip',slot:group.slot,itemId},owner);
      applyWallet(owner,result.wallet);notifyEconomy();
    } catch(cause){
      setError(cause instanceof Error?cause.message:'Could not equip this design.');
    } finally{setBusy(false);}
  }
  return <section className="carrom-collection">
    <p>{store?'Collect designs with Dice points, Clubhouse Cash, or three matching fragments from Carrom crates.':'Equip any board, puck set and striker you own.'} Your choices apply to Carrom and Disc Pool on your screen.</p>
    {store&&<p className="carrom-mandala-intro">New: six artisan mandala collections. Choose Mandala collection for matching boards, pucks, strikers and discounted bundles.</p>}
    <div className="dice-crate-category-tabs" role="group" aria-label="Carrom collection">
      {groups.map(({label},index)=><button key={label} aria-pressed={tab===index} onClick={()=>{setTab(index);setPage(0);}}>{label}</button>)}
    </div>
    <div className="dice-crate-category-tabs" role="group" aria-label="Design collection">
      <button aria-pressed={!mandalas} onClick={()=>{setMandalas(false);setPage(0);}}>All designs</button>
      <button aria-pressed={mandalas} onClick={()=>{setMandalas(true);setFinish('all');setPage(0);}}>Mandala collection · 6 themes</button>
    </div>
    {store&&mandalas&&<MandalaBundles userId={user?.id??null} wallet={wallet}/>}
    {group.slot===CARROM_PUCK_SLOT&&!mandalas&&<label>Puck theme <select className="rummy-input" value={finish}
      onChange={event=>{setFinish(event.target.value);setPage(0);}}>
      <option value="all">All themes</option>
      <option value="classic">Classic, jewels &amp; specials</option>
      <option value="nautical">Nautical</option>
      <option value="mandala">Mandala</option>
      {D6_COLLECTIONS.map(([id,label])=><option key={id} value={id}>{label}</option>)}
    </select></label>}
    {pages>1&&<div className="dice-fragment-pages">
      <button disabled={current===0} onClick={()=>setPage(current-1)}>Previous designs</button>
      <span>{current+1} / {pages}</span>
      <button disabled={current+1===pages} onClick={()=>setPage(current+1)}>Next designs</button>
    </div>}
    <div className="carrom-collection-grid">{items.slice(current*4,current*4+4).map(item=>{
      const owned=item.price===0||wallet?.owned.includes(item.id);
      return <article key={item.id}>
        <CarromItemArtwork id={item.id}/>
        <h3>{item.name}</h3>
        {'mandala' in item&&item.mandala!==undefined&&<p className="carrom-mandala-description">{CARROM_MANDALAS.find(theme=>theme.art===item.mandala)?.description} Three matching fragments complete this piece.</p>}
        {item.price===0?<p>Included</p>:store&&<StorePurchaseControls itemId={item.id} userId={user?.id??null} wallet={wallet}/>}
        {user&&owned&&<button className="btn-ghost-gold" disabled={busy||equippedId===item.id}
          onClick={()=>void equip(item.id)}>{equippedId===item.id?'Equipped':'Equip'}</button>}
      </article>;
    })}</div>
    {!items.length&&<p>No owned {group.label.toLowerCase()} in this collection yet. Collect pieces from the Store or assemble three matching Carrom crate fragments.</p>}
    {error&&<p role="alert">{error}</p>}
    <div className="carrom-collection-links">
      {store?<Link to="/games/carrom">Play Carrom →</Link>:<Link to="/store" search={{category:'carrom'}}>Shop Carrom designs →</Link>}
      <Link to="/rewards" search={{game:'carrom'}} hash="dice-crates">Carrom rewards →</Link>
    </div>
  </section>;
}

function MandalaBundles({userId,wallet}:{userId:string|null;wallet:import('@/lib/economy-protocol').EconomyWallet|null}){
 const [selection,setSelection]=useState(CARROM_MANDALA_BUNDLES[0]!.id);
 const bundle=CARROM_MANDALA_BUNDLES.find(item=>item.id===selection)!;
 return <section className="carrom-mandala-bundle" aria-label="Mandala bundles">
  <div><h3>Matching collections</h3><p>One board, puck set and striker per theme. Save 20% on a matching trio, or collect all six themes for a larger discount.</p>
   <label>Choose a bundle<select className="rummy-input" value={selection} onChange={event=>setSelection(event.target.value)}>
    {CARROM_MANDALA_BUNDLES.map(item=><option key={item.id} value={item.id}>{item.name} · {item.items.length} pieces</option>)}
   </select></label>
   <p className="carrom-mandala-description">Bundle prices are fixed if you own some pieces. Individual pieces and their fragments are available separately.</p>
   <StorePurchaseControls key={bundle.id} itemId={bundle.id} userId={userId} wallet={wallet}/>
  </div>
  <div className="carrom-mandala-bundle-preview" aria-label={`${bundle.name} preview`}>
   {bundle.items.slice(0,bundle.items.length===18?18:3).map(id=><CarromItemArtwork key={id} id={id}/>)}
  </div>
 </section>;
}
