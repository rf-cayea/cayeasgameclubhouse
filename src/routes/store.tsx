import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HubNav } from '@/components/HubNav';
import { notifyWallet, useClubhouse } from '@/lib/clubhouse';
import { JOKER_MODE, loadJokerMode, purchaseJokerMode, type StoreItem } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';
import { WalletCredits } from '@/components/WalletCredits';
import { SpadesPartnershipUnlock } from '@/components/SpadesPartnershipUnlock';

export const Route = createFileRoute('/store')({
  head: () => ({ meta: [{ title: "Store — Cayea's Game Clubhouse" }] }),
  component: StorePage,
});

function message(cause: unknown) {
  return typeof cause === 'object' && cause !== null && 'message' in cause ? String(cause.message) : 'The store request failed. Please try again.';
}

function StorePage() {
  const { user, wallet, ready, error: walletError } = useClubhouse();
  const [item, setItem] = useState<StoreItem>(JOKER_MODE);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [purchasedBy, setPurchasedBy] = useState<string | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  const request = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const currentBuyer = useRef(user?.id);
  currentBuyer.current = user?.id;
  const balance = wallet?.rummy_points ?? 0;
  const owned = Boolean(wallet?.owned.includes(item.id) || (user && purchasedBy === user.id));

  const load = useCallback(async () => {
    const version = ++request.current;
    setCatalogReady(false);
    setCatalogError('');
    if (!supabase) return;
    try {
      const result = await loadJokerMode();
      if (mounted.current && version === request.current) { setItem(result); setCatalogReady(true); }
    } catch (cause) {
      if (mounted.current && version === request.current) setCatalogError(message(cause));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; ++request.current; };
  }, [load]);
  useEffect(() => { if (confirm) dialog.current?.showModal(); }, [confirm]);
  useEffect(() => { setConfirm(false); setNotice(''); setError(''); }, [user?.id]);

  async function buy() {
    if (!user || !wallet || owned || pending.current || !catalogReady || balance < item.price) return;
    const buyer = user.id;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await purchaseJokerMode();
      notifyWallet();
      if (!mounted.current || currentBuyer.current !== buyer) return;
      setPurchasedBy(buyer);
      setNotice(result.already_owned ? 'You already own Joker Mode. No points were charged.' : 'Joker Mode unlocked! It is yours permanently.');
      setConfirm(false);
    } catch (cause) {
      if (mounted.current && currentBuyer.current === buyer) setError(message(cause));
      notifyWallet();
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <><HubNav /><main className="mx-auto max-w-3xl px-4 py-10">
    <h1 className="font-display text-4xl text-gold">Clubhouse Store</h1>
    <p className="mt-3 text-muted-foreground">Earn your rewards by playing. Points purchases only.</p>
    {!supabase && <p role="status" className="card-hub mt-6">The store is not connected yet. Joker Mode costs 800 Rummy+ points; checkout will be available when member services are connected.</p>}
    {walletError && <p role="alert" className="mt-4 text-destructive">Could not load your wallet: {walletError}</p>}
    {catalogError && <div role="alert" className="card-hub mt-4"><p>Could not load store prices: {catalogError}</p><button className="mt-2 text-gold underline" onClick={() => void load()}>Retry catalog</button></div>}
    {user && wallet && <WalletCredits key={user.id} userId={user.id} wallet={wallet} />}
    <SpadesPartnershipUnlock />
    <section className="card-hub mt-6"><h2 className="font-display text-2xl text-gold">♠ The Spades collection</h2><p className="mt-3 text-muted-foreground">Collect four original table and background sets plus four card decks with matching face and back artwork. Permanent unlocks start at 350 Spades points.</p><Link to="/games/spades" hash="collection" className="btn-ghost-gold mt-4">Explore Spades designs</Link></section>
    <section className="card-hub mt-6" aria-labelledby="joker-title">
      <div className="text-4xl" aria-hidden="true">🃏</div>
      <h2 id="joker-title" className="mt-3 font-display text-2xl text-gold">Joker Mode</h2>
      <p className="mt-2 text-muted-foreground">Add wild jokers to Rummy+. A permanent unlock earned with Rummy+ points.</p>
      <p className="mt-3 text-2xl font-bold text-gold">{item.price.toLocaleString()} Rummy+ points</p>
      <p className="mt-2 text-sm text-muted-foreground">The table host can enable wild jokers for computer, pass-and-play, and online games after unlocking this item.</p>
      {user && wallet && <p className="mt-4">Your balance: {balance.toLocaleString()} Rummy+ points</p>}
      {!ready ? <p className="mt-4" role="status">Loading your membership…</p> : !user ? <Link to="/auth" className="btn-ghost-gold mt-4">Sign in to unlock rewards</Link> : <>
        <button className="btn-gold mt-4" disabled={busy || owned || !wallet || !catalogReady || balance < item.price}
          onClick={() => { setError(''); setConfirm(true); }}>{owned ? 'Joker Mode owned' : `Unlock Joker Mode · ${item.price.toLocaleString()} points`}</button>
        {!owned && wallet && balance < item.price && <p className="mt-2 text-sm text-muted-foreground">Earn {(item.price - balance).toLocaleString()} more Rummy+ points to unlock.</p>}
      </>}
      {notice && <p role="status" className="mt-4 text-gold">{notice}</p>}
      {error && !confirm && <p role="alert" className="mt-4 text-destructive">{error}</p>}
    </section>
    <section className="card-hub mt-6"><h2 className="font-display text-xl text-gold">Real-money purchases · Coming later</h2><p className="mt-2 text-sm text-muted-foreground">Real-money checkout is on hold. You can unlock Joker Mode with Rummy+ points.</p></section>
    {confirm && <dialog ref={dialog} aria-labelledby="purchase-title" onCancel={(event) => { if (busy) event.preventDefault(); else setConfirm(false); }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-background p-6 text-foreground backdrop:bg-black/70">
      <h2 id="purchase-title" className="font-display text-2xl text-gold">Unlock Joker Mode?</h2>
      <p className="mt-3">Spend {item.price.toLocaleString()} Rummy+ points for a permanent unlock.</p>
      <p className="mt-2 text-sm text-muted-foreground">Your balance after purchase: {(balance - item.price).toLocaleString()} Rummy+ points.</p>
      <div className="mt-5 flex flex-wrap gap-3"><button className="btn-gold" disabled={busy || !user || !wallet || balance < item.price} onClick={() => void buy()}>{busy ? 'Unlocking…' : 'Confirm unlock'}</button><button className="btn-ghost-gold" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button></div>
      {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
    </dialog>}
  </main></>;
}
