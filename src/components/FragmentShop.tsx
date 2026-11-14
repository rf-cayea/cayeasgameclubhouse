import { useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useClubhouseAccount, useEconomy } from '@/lib/clubhouse-account';
import { economyRequest, notifyEconomy, EconomyRequestError } from '@/lib/economy-api';
import { DICE_FRAGMENTS_REQUIRED } from '@/lib/dice-crates';
import { REWARD_CRATE_POOLS, REWARD_CRATE_META, type RewardCrateCollection } from '@/lib/reward-crates';
import { ECONOMY_CATALOG, fragmentPrice, type EconomyCommand, type EconomyCommandResult, type StorePayment } from '@/lib/economy-protocol';
import { CrateItemArtwork } from './DiceCrateRewards';

type FragmentOrder = Extract<EconomyCommand, { operation: 'buy_fragments' }>;
const PAGE_SIZE = 6;

function savedOrder(key: string): FragmentOrder | null {
  try {
    const order = JSON.parse(sessionStorage.getItem(key) ?? 'null') as FragmentOrder | null;
    return order?.operation === 'buy_fragments' && order.count === 1 && typeof order.itemId === 'string' &&
      typeof order.requestId === 'string' && typeof order.expectedPrice === 'number' &&
      (order.payment === 'game' || order.payment === 'cash') ? order : null;
  } catch { return null; }
}

export function FragmentShop() {
  const { user } = useClubhouseAccount();
  return <FragmentMember key={user?.id ?? 'guest'} userId={user?.id ?? null}/>;
}

function FragmentMember({ userId }: { userId: string | null }) {
  const rewards = useEconomy(userId);
  const wallet = rewards.data?.wallet;
  const [kind, setKind] = useState<RewardCrateCollection>('dice');
  const [page, setPage] = useState(0);
  const [payment, setPayment] = useState<StorePayment>('game');
  const [cardGame, setCardGame] = useState<'rummy' | 'spades'>('rummy');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const orderKey = `clubhouse-fragment-order:${userId}`;
  const [pending, setPending] = useState(() => userId ? savedOrder(orderKey) : null);
  const inFlight = useRef(false);
  const items = REWARD_CRATE_POOLS[kind];
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const fragments = rewards.data?.rewardCrates?.[kind]?.fragments ?? {};

  function remember(order: FragmentOrder | null) {
    setPending(order);
    try {
      if (order) sessionStorage.setItem(orderKey, JSON.stringify(order));
      else sessionStorage.removeItem(orderKey);
    } catch { /* The purchase can still be retried on this screen. */ }
  }

  async function buy(order: FragmentOrder) {
    if (!userId || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    remember(order);
    try {
      const result = await economyRequest<EconomyCommandResult>(order, userId);
      const { receipt } = result;
      if (result.ok !== true || receipt?.type !== 'purchase' || receipt.itemId !== order.itemId ||
        receipt.amount !== order.expectedPrice || !result.wallet || !result.rewardCrates) {
        throw new Error('The fragment purchase could not be confirmed. Retry the same purchase.');
      }
      rewards.apply(userId, result);
      notifyEconomy();
      remember(null);
      setNotice(result.wallet.owned.includes(order.itemId) ? 'Third fragment collected. Set unlocked.' : 'One fragment collected.');
    } catch (cause) {
      if (cause instanceof EconomyRequestError && [400, 403, 404, 409].includes(cause.status)) {
        remember(null);
        void rewards.refresh();
      }
      setError(cause instanceof Error ? cause.message : 'The fragment purchase could not be confirmed. Retry the same purchase.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <section className="dice-crates">
    <p>Buy one fragment at a time. Each costs about one-third of the item’s Store price. Whole-point and Cash rounding is spread across the three fragments. Collect three matching fragments to unlock the item.</p>
    <div className="dice-crate-category-tabs" role="group" aria-label="Fragment collections">
      {(Object.keys(REWARD_CRATE_POOLS) as RewardCrateCollection[]).map(collection =>
        <button key={collection} aria-pressed={kind === collection} disabled={busy || Boolean(pending)} onClick={() => { setKind(collection); setPage(0); }}>
          {REWARD_CRATE_META[collection].name}
        </button>)}
    </div>
    <div className="dice-fragment-filters">
      <label>Pay with<select value={payment} disabled={busy || Boolean(pending)} onChange={event => setPayment(event.target.value as StorePayment)}>
        <option value="game">Game points</option><option value="cash">Clubhouse Cash</option>
      </select></label>
      {kind === 'cards' && payment === 'game' && <label>Game balance<select value={cardGame} disabled={busy || Boolean(pending)}
        onChange={event => setCardGame(event.target.value as 'rummy' | 'spades')}>
        <option value="rummy">Rummy+</option><option value="spades">Spades</option>
      </select></label>}
    </div>
    {userId && !wallet && !rewards.error && <p role="status">Loading your fragment collection and balance…</p>}
    {rewards.error && <p role="alert">{rewards.error} <button onClick={() => void rewards.refresh()}>Retry loading your balance</button></p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {pending && !busy && <button className="btn-gold" onClick={() => void buy(pending)}>Retry fragment purchase</button>}
    <div className="dice-fragment-pages">
      <button disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Previous sets</button>
      <span>{page + 1}/{pages}</span>
      <button disabled={busy || page + 1 === pages} onClick={() => setPage(page + 1)}>Next sets</button>
    </div>
    <div className="dice-fragment-grid">{items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(design => {
      const item = ECONOMY_CATALOG.find(entry => entry.id === design.id);
      if (!item) return null;
      const collected = Math.min(DICE_FRAGMENTS_REQUIRED, fragments[item.id] ?? 0);
      const owned = Boolean(wallet?.owned.includes(item.id) || collected === DICE_FRAGMENTS_REQUIRED);
      const price = owned ? 0 : fragmentPrice(item, payment, collected);
      const currency = payment === 'cash' ? 'points' : kind === 'cards' && cardGame === 'spades' ? 'spades_points' : item.currency;
      const affordable = Boolean(wallet && wallet[currency] >= price);
      const label = payment === 'cash' ? 'Cash' : 'points';
      return <article key={item.id} aria-label={`${design.name} fragments`}>
        <CrateItemArtwork kind={kind} id={item.id}/>
        <h4>{design.name}</h4>
        <span>{owned ? 'Owned permanently' : `${collected}/${DICE_FRAGMENTS_REQUIRED} fragments`}</span>
        {!owned && <p>{price} {label} per fragment</p>}
        {!owned && (userId
          ? <><button disabled={busy || Boolean(pending) || !affordable} onClick={() => void buy({
            operation: 'buy_fragments', itemId: item.id, count: 1, payment, expectedPrice: price, requestId: crypto.randomUUID(),
            ...(kind === 'cards' && payment === 'game' ? { game: cardGame } : {}),
          })}>Buy 1 fragment · {price} {label}</button>
          {wallet && !affordable && <p>Not enough {label}.</p>}</>
          : <Link to="/auth">Sign in to collect</Link>)}
      </article>;
    })}</div>
  </section>;
}
