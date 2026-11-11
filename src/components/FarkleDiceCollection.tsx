import { D6_COLLECTIONS } from '@/lib/d6-collections';
import { NauticalBundleOffer } from './NauticalBundleOffer';
import { NAUTICAL_FINISHES } from '@/lib/nautical-sets';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { CLASSIC_FARKLE_DICE, FARKLE_DICE_SETS, FARKLE_DICE_SLOT, equippedFarkleDice } from '@/lib/farkle-dice';
import { economyRequest, notifyEconomy } from '@/lib/economy-api';
import type { EconomyCommandResult, EconomyWallet } from '@/lib/economy-protocol';
import { DieFace } from './FarkleDice';
import { StorePurchaseControls } from './StorePurchaseControls';

export function FarkleDiceCollection({ userId, wallet, onEquipped, ownedOnly = false }: { userId: string | null; wallet: EconomyWallet | null; ownedOnly?: boolean; onEquipped?: (owner: string, wallet: EconomyWallet) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [filter, setFilter] = useState('all'), [page, setPage] = useState(0);
  const active = useRef(false), pending = useRef(false), actor = useRef(userId); actor.current = userId;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const selected = equippedFarkleDice(wallet);
  const pageSize=ownedOnly?2:6;
  const designs = [CLASSIC_FARKLE_DICE, ...FARKLE_DICE_SETS].filter(item => !ownedOnly || item.price === 0 || wallet?.owned.includes(item.id)).filter(item => filter === 'all' || (filter === 'nautical' ? item.id.includes('-nautical-') : filter === 'colors' ? item.price === 150 : filter === 'specials' ? !('collection' in item) && item.price === 250 && !item.id.includes('-nautical-') : 'collection' in item && item.collection===filter));
  const pages = Math.max(1, Math.ceil(designs.length / pageSize)), current = Math.max(0, Math.min(page, pages - 1));
  async function equip(itemId: string) {
    if (!userId || pending.current) return;
    const owner = userId; pending.current = true; setBusy(true); setError('');
    try {
      const result = await economyRequest<EconomyCommandResult>({ operation: 'equip', slot: FARKLE_DICE_SLOT, itemId }, owner);
      if (active.current && actor.current === owner) onEquipped?.(owner, result.wallet);
      notifyEconomy();
    } catch (cause) { if (active.current && actor.current === owner) setError(cause instanceof Error ? cause.message : 'The dice could not be equipped. Try again.'); }
    finally { pending.current = false; if (active.current && actor.current === owner) setBusy(false); }
  }
  return <section className="fd-dice-collection" aria-label="Shared D6 dice collection"><p>{ownedOnly ? <>Equip your shared six-sided dice here. <Link to="/store" search={{category:'dice'}} className="text-gold underline">Collect more dice in the Store →</Link></> : <>Shared six-sided pip dice for Quintsee and Farkle. Buy once, then use your finish in every compatible six-sided dice game. Rainbow and jewel colors cost 188 Dice points; decorated collections cost 250. Each purchase is a complete permanent unlock; crates offer a free fragment path.</>}</p><p className="fd-dice-crate-link">All collectible sets can also be unlocked with three matching fragments from Quintsee and Farkle reward crates. <Link to="/rewards" hash="dice-crates" className="text-gold underline">View crates &amp; fragments →</Link></p>{!ownedOnly && filter==='nautical' && <NauticalBundleOffer game="dice" userId={userId} wallet={wallet} onBrowse={()=>{setFilter('nautical');setPage(0);}}/>}<label className="fd-dice-category">Browse a collection<select aria-label="Dice collection" value={filter} onChange={event=>{setFilter(event.target.value);setPage(0);}}><option value="all">All dice · {1+FARKLE_DICE_SETS.length} designs</option><option value="colors">All colors · 188 points</option>{D6_COLLECTIONS.map(([key,label])=><option key={key} value={key}>{label} · {key==='rainbow'?150:250} points</option>)}<option value="specials">Skulls &amp; sunbursts · 313 points</option><option value="nautical">Nautical · 313 points</option></select></label><div className="fd-dice-filter" role="group" aria-label="Dice designs">{[['all','All dice'],['colors','Colors · 150'],['specials','Specials · 250'],['nautical','Nautical · 250']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>{setFilter(value);setPage(0);}}>{label}</button>)}</div><div className="fd-dice-pager"><button className="btn-ghost-gold" disabled={current===0} onClick={()=>setPage(current-1)}>Previous dice</button><span>{current+1} / {pages}</span><button className="btn-ghost-gold" disabled={current+1===pages} onClick={()=>setPage(current+1)}>Next dice</button></div><div className="fd-dice-products">{designs.slice(current*pageSize,current*pageSize+pageSize).map(design => {
    const owned = design.price === 0 || Boolean(wallet?.owned.includes(design.id)), equipped = selected.id === design.id;
    return <article className="card-hub" key={design.id} aria-label={design.name}>
      <div className="fd-dice-samples" aria-label={`${design.name} preview`}>{[1, 3, 6].map(value => <DieFace key={value} value={value} design={design}/>)}</div>
      <h3>{design.name}</h3>{'collection' in design && <span className="fd-dice-collection-tag">{D6_COLLECTIONS.find(([key])=>key===design.collection)?.[1]}</span>}<p>{'description' in design ? design.description : NAUTICAL_FINISHES.find(f=>design.id===`farkle-dice-nautical-${f.key}`)?.description ?? (design.symbol === 'skull' ? 'Polished onyx with sculpted ivory-white skulls, shaded eye sockets, cheekbones, and individual teeth.' : design.symbol === 'sun' ? 'Warm white dice with twelve-ray golden sunbursts in traditional pip positions.' : design.price ? 'Jewel-colored dice with crisp ivory pips.' : 'Your included ivory dice with traditional dots.')}</p>
      {!ownedOnly && design.price > 0 && <StorePurchaseControls itemId={design.id} userId={userId} wallet={wallet}/>}
      {design.price === 0 && <p className="text-gold">Included free</p>}
      {owned && <button className="btn-gold" disabled={busy || equipped || !userId} onClick={() => void equip(design.id)}>{equipped ? 'Equipped' : 'Equip dice'}</button>}
    </article>;
  })}</div>{ownedOnly && designs.length === 0 && <p>No owned dice in this category yet. Choose All dice to use your included set.</p>}{error && <p role="alert">{error}</p>}</section>;
}
