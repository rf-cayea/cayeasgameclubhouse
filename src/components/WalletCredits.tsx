import { useEffect, useRef, useState } from 'react';
import { cashFor, GAME_POINTS, notifyWallet, type PointGame, type Wallet } from '@/lib/clubhouse';
import { supabase } from '@/integrations/supabase/client';

export function WalletCredits({ wallet, userId }: { wallet: Wallet; userId: string }) {
  const [game, setGame] = useState<PointGame>('rummy');
  const [amount, setAmount] = useState('10');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<{ id: string; game: PointGame; amount: number } | null>(null);
  const pending = useRef(false);
  const active = useRef(false);
  const quantity = Number(amount);
  const balance = wallet[GAME_POINTS[game].key] ?? 0;
  const valid = Number.isSafeInteger(quantity) && quantity > 0 && quantity % 10 === 0 && quantity <= balance;
  const retry = request.current?.game === game && request.current.amount === quantity;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { const node = dialog.current; if (confirm) node?.showModal(); return () => node?.close(); }, [confirm]);
  async function convert() {
    if (!supabase || (!valid && !retry) || pending.current) return;
    pending.current = true; setBusy(true); setError('');
    const job = request.current;
    if (!job || job.game !== game || job.amount !== quantity) request.current = { id: crypto.randomUUID(), game, amount: quantity };
    try {
      const { data, error: failure } = await supabase.rpc('convert_game_points', { _game: game, _amount: quantity, _request_id: request.current!.id });
      if (failure) throw failure;
      if (!data || data.amount !== quantity || data.cash !== cashFor(quantity) || typeof data.already_converted !== 'boolean') throw new Error('Conversion could not be confirmed. Refresh your wallet before retrying.');
      notifyWallet();
      if (!active.current) return;
      request.current = null; setConfirm(false); setNotice(`${data.cash} Clubhouse Cash added. Lifetime earnings are unchanged.`);
    } catch (cause) {
      if (active.current) setError(typeof cause === 'object' && cause !== null && 'message' in cause ? String(cause.message) : 'The conversion failed. Please retry.');
      notifyWallet();
    } finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <section className="card-hub mt-6" aria-labelledby="wallet-title" data-wallet-user={userId}>
    <h2 id="wallet-title" className="font-display text-2xl text-gold">Your reward wallet</h2>
    <dl className="mt-4 grid gap-3 sm:grid-cols-4"><div><dt className="text-sm text-muted-foreground">Rummy+ points</dt><dd className="text-2xl text-gold" data-testid="rummy-balance">{wallet.rummy_points}</dd></div><div><dt className="text-sm text-muted-foreground">Spades points</dt><dd className="text-2xl text-gold" data-testid="spades-balance">{wallet.spades_points ?? 0}</dd></div><div><dt className="text-sm text-muted-foreground">Faith 3 points</dt><dd className="text-2xl text-gold">{wallet.f3_points}</dd></div><div><dt className="text-sm text-muted-foreground">Clubhouse Cash</dt><dd className="text-2xl text-gold" data-testid="cash-balance">{wallet.points}</dd></div></dl>
    <p className="mt-4 text-sm text-muted-foreground">Lifetime earned: {wallet.lifetime_points} points. Verified Rummy+ and Spades match wins pay 40 Easy, 70 Normal, 120 Hard, or 150 for eligible signed-in online human games.</p>
    <h3 className="mt-6 font-display text-xl text-gold">Convert points to Clubhouse Cash</h3><p className="mt-2 text-sm text-muted-foreground">Every 10 game points become 7 Clubhouse Cash. Converted points leave that game’s balance, so they can no longer buy its game-specific items.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">Game<select aria-label="Conversion game" value={game} disabled={busy} onChange={event => { setGame(event.target.value as PointGame); setError(''); }} className="rummy-input mt-1">{Object.entries(GAME_POINTS).map(([key, item]) => <option key={key} value={key}>{item.name}</option>)}</select></label><label className="text-sm">Points to convert<input aria-label="Points to convert" type="number" min={10} step={10} max={balance} value={amount} disabled={busy} onChange={event => { setAmount(event.target.value); setError(''); }} className="rummy-input mt-1 w-40" /></label><button className="btn-ghost-gold" disabled={!valid || busy} onClick={() => { setError(''); setConfirm(true); }}>Convert to Cash</button></div>
    <p className="mt-2 text-sm text-muted-foreground">{valid ? `You’ll receive ${cashFor(quantity)} Clubhouse Cash.` : 'Choose a positive multiple of 10 within your available game points.'}</p>
    {notice && <p role="status" className="mt-3 text-gold">{notice}</p>}
    {confirm && <dialog ref={dialog} aria-labelledby="convert-title" onCancel={event => { if (busy) event.preventDefault(); else setConfirm(false); }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-background p-6 text-foreground backdrop:bg-black/70"><h2 id="convert-title" className="font-display text-2xl text-gold">Convert {quantity} points?</h2><p className="mt-3">Exchange {quantity} {GAME_POINTS[game].name} for {cashFor(quantity)} Clubhouse Cash.</p><p className="mt-2 text-sm text-muted-foreground">This cannot be reversed. {retry ? 'Retrying confirms your original conversion without charging twice.' : `It leaves ${balance - quantity} game points.`}</p>{error && <p role="alert" className="mt-3 text-destructive">{error}</p>}<div className="mt-5 flex gap-3"><button className="btn-gold" disabled={busy || (!valid && !retry)} onClick={() => void convert()}>{busy ? 'Converting…' : 'Confirm conversion'}</button><button className="btn-ghost-gold" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button></div></dialog>}
  </section>;
}
