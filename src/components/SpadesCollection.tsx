import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { notifyWallet, useClubhouse } from '@/lib/clubhouse';
import { CLASSIC_DECK, CLASSIC_VENUE, SPADES_DECKS, SPADES_VENUES, spadesDeck, spadesVenue } from '@/lib/spades-cosmetics';
import { SpadesCard } from './SpadesCard';

type Catalog = { id: string; name: string; price: number; currency: string };
const message = (cause: unknown) => cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'The collection could not be updated. Please retry.';
export function SpadesCollection() {
  const { user, wallet, ready, error: walletError } = useClubhouse();
  const [catalog, setCatalog] = useState<Catalog[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [previewTable, setPreviewTable] = useState(CLASSIC_VENUE.id), [previewDeck, setPreviewDeck] = useState(CLASSIC_DECK.id);
  const [confirm, setConfirm] = useState<Catalog | null>(null), [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), active = useRef(false), pending = useRef(false), account = useRef(user?.id);
  account.current = user?.id;
  const venue = spadesVenue(previewTable), deck = spadesDeck(previewDeck);
  const balance = wallet?.spades_points ?? 0;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setConfirm(null); setNotice(''); setError(''); }, [user?.id]);
  useEffect(() => { const node = dialog.current; if (confirm) node?.showModal(); return () => node?.close(); }, [confirm]);
  useEffect(() => {
    if (!supabase) return;
    let current = true;
    void supabase.from('store_catalog').select('id,name,price,currency').in('id', [...SPADES_VENUES, ...SPADES_DECKS].map(item => item.id)).then(({ data, error }) => {
      if (!current) return;
      if (error || !Array.isArray(data)) setError('Spades prices are unavailable. Please reconnect before collecting.');
      else setCatalog(data.filter(item => item.currency === 'spades_points' && Number.isSafeInteger(item.price) && item.price > 0));
    });
    return () => { current = false; };
  }, []);
  async function mutate(kind: 'buy' | 'equip', id: string, slot: 'spades_table' | 'spades_deck') {
    if (!supabase || !user || !wallet || pending.current) return;
    const buyer = user.id; pending.current = true; setBusy(true); setError('');
    try {
      const { data, error } = kind === 'buy' ? await supabase.rpc('purchase_store_item', { _item_id: id }) : await supabase.rpc('equip_store_item', { _slot: slot, _item_id: id });
      if (error) throw error;
      if (!data || data.item_id !== id || (kind === 'buy' && data.owned !== true) || (kind === 'equip' && data.slot !== slot)) throw new Error('Could not confirm this change. Refresh your wallet before trying again.');
      notifyWallet();
      if (!active.current || account.current !== buyer) return;
      setConfirm(null); setNotice(kind === 'buy' ? 'Design collected permanently. Choose Equip to use it at your next table.' : 'Equipped for your next table. The host shares their table and deck with every player.');
    } catch (cause) { if (active.current && account.current === buyer) setError(message(cause)); notifyWallet(); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  return <section aria-labelledby="collection-title" id="collection" className="space-y-6">
    <div><p className="spades-eyebrow">Make the table yours</p><h2 id="collection-title" className="font-display text-4xl text-gold">The Spades collection</h2><p className="mt-3 max-w-3xl text-muted-foreground">Four original venues, each with a matching table and room background, and four illustrated decks that change both card faces and backs. Preview every design here; collect them permanently with earned Spades points.</p></div>
    <div className="spades-preview-room" style={{ backgroundImage: venue.room }}><div className="spades-preview-table" style={{ backgroundColor: venue.felt, borderColor: venue.rail }}><div><p className="text-xs uppercase tracking-widest">Design preview</p><h3 className="font-display text-2xl">{venue.name}</h3><p className="text-sm">{deck.name}</p></div><div className="mt-5 flex flex-wrap justify-center gap-3">{['AS', 'QH', '7D'].map(card => <div className="spades-display-card" key={card}><SpadesCard card={card} deck={deck} /></div>)}<div className="spades-display-card"><SpadesCard deck={deck} back /></div></div></div></div>
    {!supabase ? <p className="chip inline-block">Collection preview · member services must be connected to purchase and save designs.</p> : !ready ? <p role="status">Loading your collection…</p> : !user ? <Link className="btn-ghost-gold" to="/auth">Sign in to start collecting</Link> : <p className="chip inline-block">Your balance: <strong>{balance}</strong> Spades points</p>}
    {(error || walletError) && <p role="alert" className="text-destructive">{error || walletError}</p>}{notice && <p role="status" className="text-gold">{notice}</p>}
    {(['table', 'deck'] as const).map(kind => <div key={kind}><h3 className="font-display text-2xl text-gold">{kind === 'table' ? 'Tables & matching backgrounds' : 'Original face & back deck skins'}</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{(kind === 'table' ? [CLASSIC_VENUE, ...SPADES_VENUES] : [CLASSIC_DECK, ...SPADES_DECKS]).map(item => {
      const owned = item.price === 0 || wallet?.owned.includes(item.id), entry = catalog.find(value => value.id === item.id), slot = kind === 'table' ? 'spades_table' : 'spades_deck';
      const equipped = (wallet?.equipped[slot] ?? (kind === 'table' ? CLASSIC_VENUE.id : CLASSIC_DECK.id)) === item.id;
      return <article className="spades-collection-item" key={item.id} aria-label={item.name}>
        {kind === 'table' ? <div className="spades-venue-swatch" style={{ backgroundImage: spadesVenue(item.id).room }}><div style={{ background: spadesVenue(item.id).felt, borderColor: spadesVenue(item.id).rail }}>♠</div></div> : <div className="flex justify-center gap-2 py-3"><div className="spades-mini-card"><SpadesCard deck={spadesDeck(item.id)} card="KS" /></div><div className="spades-mini-card"><SpadesCard deck={spadesDeck(item.id)} back /></div></div>}
        <h4 className="mt-3 font-display text-xl text-gold">{item.name}</h4><p className="mt-2 text-xs text-muted-foreground">{item.description}</p><p className="mt-3 text-sm font-bold">{item.price === 0 ? 'Included with every account' : `${entry?.price ?? item.price} Spades points`}</p>
        <button className="mt-3 text-sm text-gold underline" onClick={() => kind === 'table' ? setPreviewTable(item.id) : setPreviewDeck(item.id)}>Preview {item.name}</button>
        {user && wallet && <button className="btn-ghost-gold mt-3 w-full text-xs" disabled={busy || Boolean(owned && equipped) || (!owned && (!entry || balance < entry.price))} onClick={() => owned ? void mutate('equip', item.id, slot) : entry && setConfirm(entry)}>{owned ? equipped ? 'Equipped' : 'Equip' : 'Collect design'}</button>}
      </article>;
    })}</div></div>)}
    <p className="text-sm text-muted-foreground">Full-match wins earn 40 Easy, 70 Normal, 120 Hard, or 150 against four signed-in human players. In partnership matches, each eligible winning teammate earns the full reward. Mixed online tables are unranked.</p>
    {confirm && <dialog ref={dialog} aria-labelledby="collect-title" className="spades-dialog" onCancel={event => { if (busy) event.preventDefault(); else setConfirm(null); }}><h2 id="collect-title" className="font-display text-2xl text-gold">Collect {confirm.name}?</h2><p className="mt-4">Spend {confirm.price} Spades points for a permanent design. Your balance after purchase: {balance - confirm.price}.</p><div className="mt-5 flex flex-wrap gap-3"><button className="btn-gold" disabled={busy || balance < confirm.price} onClick={() => void mutate('buy', confirm.id, confirm.id.startsWith('spades-table-') ? 'spades_table' : 'spades_deck')}>{busy ? 'Collecting…' : 'Confirm collection'}</button><button className="btn-ghost-gold" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button></div>{error && <p role="alert" className="mt-3 text-destructive">{error}</p>}</dialog>}
  </section>;
}
