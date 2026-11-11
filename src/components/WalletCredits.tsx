import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { cashFor, GAME_POINTS, type PointGame, type Wallet } from '@/lib/clubhouse';
import { EconomyRequestError, economyRequest, notifyEconomy } from '@/lib/economy-api';
import { CONVERSION_RATE, type EconomyCommandResult } from '@/lib/economy-protocol';

type Conversion = { id: string; game: PointGame; amount: number; cash?: number };
const pendingKey = (userId: string) => `clubhouse-pending-conversion:${userId}`;
function savedConversion(userId: string): Conversion | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(pendingKey(userId)) ?? 'null') as Conversion | null;
    return value && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value.id) && Object.prototype.hasOwnProperty.call(GAME_POINTS, value.game) && Number.isSafeInteger(value.amount) && value.amount > 0 && (value.cash === undefined || Number.isSafeInteger(value.cash)) ? value : null;
  } catch { return null; }
}

export function WalletCredits({ wallet, userId }: { wallet: Wallet; userId: string }) {
  const [game, setGame] = useState<PointGame>('rummy'), [amount, setAmount] = useState(String(CONVERSION_RATE.points));
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [awaiting, setAwaiting] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), request = useRef<Conversion | null>(null), pending = useRef(false), active = useRef(false), epoch = useRef(0), actor = useRef(userId);
  actor.current = userId;
  const quantity = Number(amount), balance = wallet[GAME_POINTS[game].key] ?? 0;
  const valid = Number.isSafeInteger(quantity) && quantity > 0 && quantity % CONVERSION_RATE.points === 0 && quantity <= balance;
  const maximum = Math.floor(balance / CONVERSION_RATE.points) * CONVERSION_RATE.points;
  const retry = request.current?.game === game && request.current.amount === quantity;
  useEffect(() => {
    active.current = true; ++epoch.current; pending.current = false; setBusy(false); setConfirm(false); setError(''); setNotice('');
    const saved = savedConversion(userId); request.current = saved; setAwaiting(Boolean(saved));
    if (saved) { setGame(saved.game); setAmount(String(saved.amount)); setNotice('A previous conversion needs confirmation. Retry it to check the original receipt without spending twice.'); }
    return () => { active.current = false; ++epoch.current; };
  }, [userId]);
  useEffect(() => { const node = dialog.current; if (confirm) node?.showModal(); return () => node?.close(); }, [confirm]);
  function clearJob(owner: string) { request.current = null; setAwaiting(false); try { sessionStorage.removeItem(pendingKey(owner)); } catch { /* An in-memory receipt still prevents double clicks. */ } }
  async function convert() {
    if ((!valid && !retry) || pending.current) return;
    const owner = userId, version = epoch.current;
    pending.current = true; setBusy(true); setError('');
    if (!request.current || request.current.game !== game || request.current.amount !== quantity) request.current = { id: crypto.randomUUID(), game, amount: quantity, cash: cashFor(quantity) };
    const job = request.current;
    setAwaiting(true);
    try { sessionStorage.setItem(pendingKey(owner), JSON.stringify(job)); } catch { /* Retry remains available while this page is open. */ }
    try {
      const result = await economyRequest<EconomyCommandResult>({ operation: 'convert', game: job.game, amount: job.amount, requestId: job.id }, owner);
      const receipt = result.receipt;
      if (result.ok !== true || receipt?.type !== 'conversion' || receipt.amount !== job.amount || (!Number.isSafeInteger(receipt.cash) || Number(receipt.cash) <= 0 || (job.cash !== undefined && receipt.cash !== job.cash)) || typeof receipt.alreadyApplied !== 'boolean') throw new Error('Conversion could not be confirmed. Refresh your wallet before retrying.');
      notifyEconomy();
      if (!active.current || actor.current !== owner || epoch.current !== version) return;
      clearJob(owner); setConfirm(false); setNotice(`${receipt.cash} Clubhouse Cash ${receipt.alreadyApplied ? 'was already added; no extra points were spent' : 'added'}. Lifetime earnings are unchanged.`);
    } catch (cause) {
      if (active.current && actor.current === owner && epoch.current === version) {
        // A definite rejected command made no change. Network errors retain the
        // original request ID so a retry can find an already-committed receipt.
        if (cause instanceof EconomyRequestError && cause.status >= 400 && cause.status < 500) clearJob(owner);
        setError(cause instanceof Error ? cause.message : 'The conversion failed. Please retry.');
      }
      notifyEconomy();
    } finally { if (epoch.current === version) { pending.current = false; if (active.current) setBusy(false); } }
  }
  return <section className="card-hub mt-6" aria-labelledby="wallet-title" data-wallet-user={userId}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="wallet-title" className="font-display text-2xl text-gold">Your reward wallet</h2><Link to="/rewards" className="text-gold underline">Achievements & rewards</Link></div>
    <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{Object.entries(GAME_POINTS).map(([key, item]) => <div key={key}><dt className="text-sm text-muted-foreground">{item.name}</dt><dd className="text-2xl text-gold" data-testid={key === 'faith-3' ? 'faith-balance' : key === '3-gems' ? 'gems-balance' : `${key}-balance`}>{(wallet[item.key] ?? 0).toLocaleString()}</dd></div>)}<div><dt className="text-sm text-muted-foreground">Clubhouse Cash</dt><dd className="text-2xl text-gold" data-testid="cash-balance">{wallet.points.toLocaleString()}</dd></div></dl>
    <p className="mt-4 text-sm text-muted-foreground">Lifetime earned: {wallet.lifetime_points.toLocaleString()} points. First clears in Faith 3 and 3 Gems, verified card-match wins, and achievement milestones build your rewards.</p>
    <h3 className="mt-6 font-display text-xl text-gold">Convert points to Clubhouse Cash</h3><p className="mt-2 text-sm text-muted-foreground">1 Clubhouse Cash is worth 1.3 game points — 30% more. Exchange 13 game points for 10 Clubhouse Cash. Converted points leave that game’s balance. Clubhouse Cash buys Clubhouse items and cannot be withdrawn as money.</p>
    <p id="conversion-available" role="status" aria-live="polite" className="mt-4 text-sm text-muted-foreground">Available {GAME_POINTS[game].name}: <strong className="text-gold" data-testid="conversion-available-balance">{balance.toLocaleString()}</strong>. {maximum > 0 ? `You can convert up to ${maximum.toLocaleString()} points for ${cashFor(maximum).toLocaleString()} Clubhouse Cash.` : `You need at least ${CONVERSION_RATE.points} points to convert.`}</p>
    <div className="mt-3 flex flex-wrap items-end gap-3"><label className="min-w-0 text-sm">Game<select aria-label="Conversion game" value={game} disabled={busy || awaiting} onChange={event => { setGame(event.target.value as PointGame); setError(''); }} className="rummy-input mt-1 max-w-full">{Object.entries(GAME_POINTS).map(([key, item]) => <option key={key} value={key}>{item.name} — {(wallet[item.key] ?? 0).toLocaleString()} available</option>)}</select></label><label className="text-sm">Points to convert<input aria-label="Points to convert" aria-describedby="conversion-available" type="number" min={CONVERSION_RATE.points} step={CONVERSION_RATE.points} max={awaiting ? undefined : balance} value={amount} disabled={busy || awaiting} onChange={event => { setAmount(event.target.value); setError(''); }} className="rummy-input mt-1 w-40" /></label><button className="btn-ghost-gold" disabled={busy || awaiting || maximum === 0} onClick={() => { setAmount(String(maximum)); setError(''); }}>Use max points</button><button className="btn-ghost-gold" disabled={(!valid && !retry) || busy} onClick={() => { setError(''); setConfirm(true); }}>{retry ? 'Confirm pending conversion' : 'Convert to Cash'}</button></div>
    <p className="mt-2 text-sm text-muted-foreground">{retry ? `Confirm your original ${quantity}-point exchange without spending twice.` : valid ? `You’ll receive ${cashFor(quantity)} Clubhouse Cash.` : 'Choose a positive multiple of 13 within your available game points.'}</p>
    {notice && <p role="status" className="mt-3 text-gold">{notice}</p>}{error && !confirm && <p role="alert" className="mt-3 text-destructive">{error}</p>}
    {confirm && <dialog ref={dialog} aria-labelledby="convert-title" onCancel={event => { if (busy) event.preventDefault(); else setConfirm(false); }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-background p-6 text-foreground backdrop:bg-black/70"><h2 id="convert-title" className="font-display text-2xl text-gold">Convert {quantity} points?</h2><p className="mt-3">Exchange {quantity} {GAME_POINTS[game].name} for {request.current?.cash ?? (retry ? 'the saved amount of' : cashFor(quantity))} Clubhouse Cash.</p><p className="mt-2 text-sm text-muted-foreground">This cannot be reversed. {retry ? 'Retrying confirms your original conversion without charging twice.' : `It leaves ${balance - quantity} game points.`}</p>{error && <p role="alert" className="mt-3 text-destructive">{error}</p>}<div className="mt-5 flex gap-3"><button className="btn-gold" disabled={busy || (!valid && !retry)} onClick={() => void convert()}>{busy ? 'Converting…' : 'Confirm conversion'}</button><button className="btn-ghost-gold" disabled={busy} onClick={() => setConfirm(false)}>Cancel</button></div></dialog>}
  </section>;
}
