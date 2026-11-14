import { nauticalBundle } from '@/lib/nautical-sets';
import { isSharedDeck } from '@/lib/playing-decks';
import { isProfileFrameItem } from '@/lib/profile-image';
import { useEffect, useRef, useState, useId } from 'react';
import { Link } from '@tanstack/react-router';
import { ECONOMY_CATALOG, POINT_FIELDS, POINT_GAMES, type PointGame, type StorePayment, type EconomyWallet } from '@/lib/economy-protocol';
import { purchaseStoreItem } from '@/lib/store';
import { notifyEconomy } from '@/lib/economy-api';

const labels = { points: 'Clubhouse Cash', f3_points: 'Faith 3 points', gems_points: '3 Gems points', rummy_points: 'Rummy+ points', spades_points: 'Spades points', dice_points: 'Dice points', domino_points: 'Dominoes points' };
export function StorePurchaseControls({ itemId, userId, wallet, owned = false, preferredGame = 'rummy', onPurchased }: { itemId: string; userId: string | null; wallet: EconomyWallet | null; owned?: boolean; preferredGame?: 'rummy' | 'spades'; onPurchased?: () => void }) {
  const item = ECONOMY_CATALOG.find(item => item.id === itemId), id = useId();
  const [pointGame, setPointGame] = useState<PointGame>(preferredGame);
  const [payment, setPayment] = useState<StorePayment | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [purchasedBy, setPurchasedBy] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), active = useRef(false), actor = useRef(userId), pending = useRef(false), epoch = useRef(0);
  actor.current = userId;
  useEffect(() => { active.current = true; ++epoch.current; pending.current = false; setPayment(null); setError(''); setBusy(false); setPurchasedBy(null); return () => { active.current = false; ++epoch.current; }; }, [userId, itemId]);
  useEffect(() => { const node = dialog.current; if (payment) node?.showModal(); return () => node?.close(); }, [payment]);
  if (!item) return null;
  const sources: readonly PointGame[] = isProfileFrameItem(item.id) ? POINT_GAMES : isSharedDeck(item.id) ? ['rummy', 'spades'] : [];
  const collected = owned || Boolean(wallet?.owned.includes(itemId)) || Boolean(userId && purchasedBy === userId);
  const gameCurrency = sources.length ? POINT_FIELDS[pointGame] : item.currency;
  const currency = payment === 'cash' ? 'points' : gameCurrency, price = payment === 'cash' ? item.cashPrice : item.price;
  async function buy() {
    if (!item || !userId || !wallet || !payment || pending.current || collected) return;
    const buyer = userId, version = epoch.current;
    pending.current = true; setBusy(true); setError('');
    try {
      await purchaseStoreItem(itemId, buyer, payment, sources.length ? pointGame : undefined);
      notifyEconomy();
      if (!active.current || actor.current !== buyer || epoch.current !== version) return;
      setPurchasedBy(buyer); setPayment(null); onPurchased?.();
    } catch (cause) { if (active.current && actor.current === buyer && epoch.current === version) setError(cause instanceof Error ? cause.message : 'The purchase could not be confirmed. Refresh your wallet.'); notifyEconomy(); }
    finally { if (epoch.current === version) { pending.current = false; if (active.current) setBusy(false); } }
  }
  return <div className="store-purchase-controls" data-store-item={itemId}>
    <p className="mt-3 text-sm font-bold text-gold">{item.currency === 'points' ? `${item.cashPrice} Clubhouse Cash` : `${item.price} ${sources.length ? 'game points' : labels[item.currency]} or ${item.cashPrice} Clubhouse Cash`}</p>
    {sources.length > 0 && !collected && userId && <label className="mt-3 block text-sm">Use points from<select aria-label={isSharedDeck(item.id) ? 'Deck points source' : 'Profile image points source'} className="rummy-input mt-2" value={pointGame} disabled={busy || Boolean(payment)} onChange={event => setPointGame(event.target.value as PointGame)}>{sources.map(game => <option key={game} value={game}>{labels[POINT_FIELDS[game]]} · {wallet?.[POINT_FIELDS[game]] ?? 0}</option>)}</select></label>}
    {collected ? <p className="mt-2 text-sm" role="status">Owned permanently</p> : !userId ? <Link className="btn-ghost-gold mt-3" to="/auth">Sign in to collect</Link> : <div className="mt-3 flex flex-wrap gap-2">{item.currency !== 'points' && <button type="button" className="btn-ghost-gold text-xs" disabled={busy || !wallet || wallet[gameCurrency] < item.price} onClick={() => { setError(''); setPayment('game'); }}>Buy · {item.price} points</button>}<button type="button" className="btn-gold text-xs" disabled={busy || !wallet || wallet.points < item.cashPrice} onClick={() => { setError(''); setPayment('cash'); }}>Buy · {item.cashPrice} Cash</button></div>}
    {!collected && userId && wallet && sources.length === 0 && item.currency !== 'points' && wallet[gameCurrency] < item.price && <p className="mt-2 text-xs text-muted-foreground">You have {wallet[gameCurrency].toLocaleString()} {labels[gameCurrency]}; the points price is {item.price.toLocaleString()}. Pay the Clubhouse Cash price, or earn more points in game.</p>}
    {error && !payment && <p role="alert" className="mt-3 text-destructive">{error}</p>}
    {payment && <dialog ref={dialog} className="spades-dialog" aria-labelledby={id} onCancel={event => { if (busy) event.preventDefault(); else setPayment(null); }}><h2 id={id} className="font-display text-2xl text-gold">Collect {item.name}?</h2><p className="mt-4">Spend {price} {labels[currency]} for a permanent unlock.</p>{nauticalBundle(item.id) && <p className="mt-2 text-sm">Unlocks all four nautical sets for this game. Bundle price is fixed, including when you already own some of the sets.</p>}{isSharedDeck(item.id) && <p className="mt-2 text-sm">Buy once for all compatible 52-card games, including Rummy+ and Spades. Includes two joker faces; game rules decide when jokers are used.</p>}<p className="mt-2 text-sm">Balance after purchase: {(wallet?.[currency] ?? 0) - price} {labels[currency]}.</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" className="btn-gold" disabled={busy || !wallet || wallet[currency] < price} onClick={() => void buy()}>{busy ? 'Collecting…' : 'Confirm purchase'}</button><button type="button" className="btn-ghost-gold" disabled={busy} onClick={() => setPayment(null)}>Cancel</button></div>{error && <p role="alert" className="mt-3 text-destructive">{error}</p>}</dialog>}
  </div>;
}
