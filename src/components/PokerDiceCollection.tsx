import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useClubhouse } from '@/lib/clubhouse';
import { equipStoreItem } from '@/lib/store';
import { CLASSIC_POKER_DICE, POKER_DICE_SETS, POKER_DICE_SLOT, equippedPokerDice, type PokerDiceSet } from '@/lib/poker-dice-sets';
import { PokerDieFace } from './PokerDice';
import { StorePurchaseControls } from './StorePurchaseControls';
import '@/styles/poker-dice.css';

export function PokerSetArtwork({design}: {design:PokerDiceSet}) {
  return <div className="poker-master-art" role="img" aria-label={`${design.name} poker dice, ranks 9, 10, jack, queen, king and ace`}>
    {[5,4,3,2,1,6].map(value => <PokerDieFace key={value} value={value} design={design}/>)}
  </div>;
}

export function PokerDiceCollection({store = false}: {store?:boolean}) {
  const {user,wallet,applyWallet} = useClubhouse(), active = equippedPokerDice(wallet);
  const [error,setError] = useState(''), [busy,setBusy] = useState(false);
  async function equip(id:string) {
    if (!user || busy) return;
    setBusy(true); setError('');
    try { const result = await equipStoreItem(POKER_DICE_SLOT,id,user.id); applyWallet(user.id,result.wallet); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not equip this set.'); }
    finally { setBusy(false); }
  }
  const sets = [CLASSIC_POKER_DICE,...POKER_DICE_SETS].filter(set => store || !set.price || wallet?.owned.includes(set.id));
  return <section className="poker-collection">
    <p>Choose one poker dice set for Crown &amp; Court and Crown &amp; Chance. Every set rolls 9, 10, J, Q, K and A. The illustrated Ace suit is cosmetic.</p>
    {error && <p role="alert">{error}</p>}
    <div className="poker-collection-grid">{sets.map(set => {
      const owned = !set.price || Boolean(wallet?.owned.includes(set.id));
      return <article key={set.id}><PokerSetArtwork design={set}/><h3>{set.name}</h3>
        {owned ? <button className="btn-ghost-gold" disabled={!user || busy || active.id === set.id} onClick={() => void equip(set.id)}>{active.id === set.id ? 'Equipped in both games' : 'Equip in both games'}</button>
          : user ? <StorePurchaseControls itemId={set.id} userId={user.id} wallet={wallet}/> : <Link to="/auth" className="btn-ghost-gold">Sign in to collect</Link>}
      </article>;
    })}</div>
    {!store && <Link className="btn-gold" to="/store" search={{category:'poker'}}>Browse poker dice in the Store</Link>}
  </section>;
}
