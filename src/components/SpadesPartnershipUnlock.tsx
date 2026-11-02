import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { notifyWallet, useClubhouse, type Wallet } from '@/lib/clubhouse';
import { ownsSpadesPartnerships, SPADES_PARTNERSHIPS } from '@/lib/spades-perks';
import { loadSpadesPartnerships, purchaseSpadesPartnerships } from '@/lib/store';
import { supabase } from '@/integrations/supabase/client';

const message = (cause: unknown) => cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'The unlock failed. Please try again.';
export function SpadesPartnershipUnlock() {
  const { user, wallet, ready } = useClubhouse();
  return <PartnershipPurchase key={user?.id ?? 'signed-out'} userId={user?.id ?? null} wallet={wallet} ready={ready} />;
}
function PartnershipPurchase({ userId, wallet, ready }: { userId: string | null; wallet: Wallet | null; ready: boolean }) {
  const [catalogReady, setCatalogReady] = useState(false), [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [purchased, setPurchased] = useState(false);
  const active = useRef(false), pending = useRef(false), dialog = useRef<HTMLDialogElement>(null), version = useRef(0);
  const balance = wallet?.spades_points ?? 0, owned = ownsSpadesPartnerships(wallet?.owned) || purchased;
  const load = useCallback(async () => {
    const current = ++version.current; setCatalogReady(false); setCatalogError('');
    if (!supabase) return;
    try { await loadSpadesPartnerships(); if (active.current && current === version.current) setCatalogReady(true); }
    catch (cause) { if (active.current && current === version.current) setCatalogError(message(cause)); }
  }, []);
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; ++version.current; }; }, [load]);
  useEffect(() => { const node = dialog.current; if (confirm) node?.showModal(); return () => node?.close(); }, [confirm]);
  async function buy() {
    if (!userId || !wallet || owned || pending.current || !catalogReady || balance < SPADES_PARTNERSHIPS.price) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await purchaseSpadesPartnerships(); notifyWallet();
      if (!active.current) return;
      setPurchased(true); setConfirm(false); setNotice(result.already_owned ? 'You already own Spades Partnerships. No points were charged.' : 'Spades Partnerships unlocked permanently. You can now host and join 2v2 tables.');
    } catch (cause) { if (active.current) setError(message(cause)); notifyWallet(); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <section id="spades-partnerships" className="card-hub mt-6 scroll-mt-6" aria-labelledby="partnership-title">
    <div className="text-4xl" aria-hidden="true">♠</div><h2 id="partnership-title" className="mt-3 font-display text-2xl text-gold">Spades Partnerships · 2 vs 2</h2>
    <p className="mt-3 text-muted-foreground">Unlock partnership Spades against computers and at private online tables. A permanent, one-time purchase for your account. Every human player needs their own unlock to host or join a 2v2 table.</p>
    <p className="mt-3 text-2xl font-bold text-gold">800 Spades points</p><p className="mt-2 text-sm text-muted-foreground">Earn points in solo Spades, then unlock team play here.</p>
    {!supabase && <p role="status" className="mt-4 text-sm text-muted-foreground">Connect member services to purchase this unlock.</p>}
    {userId && wallet && <p className="mt-4">Your balance: {balance.toLocaleString()} Spades points</p>}
    {catalogError && <p role="alert" className="mt-4 text-destructive">Could not load the partnership price: {catalogError} <button className="underline" onClick={() => void load()}>Retry partnership price</button></p>}
    {!ready ? <p role="status" className="mt-4">Loading your membership…</p> : !userId ? <Link to="/auth" className="btn-ghost-gold mt-4">Sign in to unlock partnerships</Link> : <>
      <button className="btn-gold mt-4" disabled={busy || owned || !wallet || !catalogReady || balance < 800} onClick={() => { setError(''); setConfirm(true); }}>{owned ? 'Spades Partnerships owned' : 'Unlock Spades Partnerships · 800 points'}</button>
      {owned && <Link to="/games/spades" hash="partnerships" className="btn-ghost-gold ml-3 mt-4">Play partnership Spades</Link>}
      {!owned && wallet && balance < 800 && <p className="mt-2 text-sm text-muted-foreground">Earn {(800 - balance).toLocaleString()} more Spades {800 - balance === 1 ? 'point' : 'points'} to unlock.</p>}
    </>}
    {notice && <p role="status" className="mt-4 text-gold">{notice}</p>}{error && !confirm && <p role="alert" className="mt-4 text-destructive">{error}</p>}
    {confirm && <dialog ref={dialog} className="spades-dialog" aria-labelledby="partnership-confirm-title" onCancel={event => { if (busy) event.preventDefault(); else setConfirm(false); }}><h2 id="partnership-confirm-title" className="font-display text-2xl text-gold">Unlock Spades Partnerships?</h2><p className="mt-4">Spend 800 Spades points for permanent access to 2v2 Spades. Your balance after purchase: {(balance - 800).toLocaleString()} Spades points.</p><div className="mt-5 flex flex-wrap gap-3"><button className="btn-gold" disabled={busy || balance < 800} onClick={() => void buy()}>{busy ? 'Unlocking partnerships…' : 'Confirm partnership unlock'}</button><button className="btn-ghost-gold" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button></div>{error && <p role="alert" className="mt-3 text-destructive">{error}</p>}</dialog>}
  </section>;
}
