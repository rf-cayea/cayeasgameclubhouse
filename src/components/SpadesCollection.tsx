import { StorePreviewDialog } from './StorePreviewDialog';
import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { equipStoreItem } from '@/lib/store';
import { notifyWallet, useClubhouse } from '@/lib/clubhouse';
import { CLASSIC_DECK, CLASSIC_VENUE, SPADES_DECKS, SPADES_VENUES, spadesDeck, spadesVenue } from '@/lib/spades-cosmetics';
import { SpadesCard } from './SpadesCard';
import { DeckShowcase } from './DeckShowcase';
import { StorePurchaseControls } from './StorePurchaseControls';
export function SpadesCollection({ decksOnly = false, kind, compact = false, itemIds, ownedOnly = false }: { decksOnly?: boolean; kind?: 'table' | 'deck'; compact?: boolean; ownedOnly?: boolean; itemIds?: readonly string[] }) {
  const { user, wallet, ready, applyWallet, error: walletError } = useClubhouse();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [previewTable, setPreviewTable] = useState(CLASSIC_VENUE.id), [previewDeck, setPreviewDeck] = useState(CLASSIC_DECK.id);
  const active = useRef(false), account = useRef(user?.id), pending = useRef(false);
  account.current = user?.id;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { setError(''); setNotice(''); }, [user?.id]);
  async function equip(id: string, slot: 'spades_table' | 'spades_deck') {
    if (!user || !wallet || pending.current) return;
    const buyer = user.id; pending.current = true; setBusy(true); setError('');
    try { const result = await equipStoreItem(slot, id, buyer); if (active.current && account.current === buyer) applyWallet(buyer, result.wallet); notifyWallet(); if (active.current && account.current === buyer) setNotice('Equipped for your next table. The host shares their table and deck with every player.'); }
    catch (cause) { if (active.current && account.current === buyer) setError(cause instanceof Error ? cause.message : 'Your collection could not update.'); notifyWallet(); }
    finally { pending.current = false; if (active.current) setBusy(false); }
  }
  const venue = spadesVenue(previewTable), deck = spadesDeck(previewDeck);
  return <section id={decksOnly ? 'spades-artist-decks' : 'collection'} aria-label="The Spades collection" className="space-y-6">{ownedOnly && <p>Equip your owned decks and tables for your next table. An active online table uses its host’s chosen artwork. <Link to="/store" search={{category:'decks'}} className="text-gold underline">Collect more artwork in the Store →</Link></p>}{!compact && <div><p className="spades-eyebrow">The artist collection</p><h2 className="font-display text-4xl text-gold">{decksOnly ? 'Artist decks for Spades' : 'The Spades collection'}</h2><p className="mt-3 text-muted-foreground">Painted court cards, illuminated aces, ornate backs, and full-screen table surfaces. All paid table surfaces cost 125 Spades points or 97 Cash each. Shared decks cost 563 Rummy+ or Spades points, or 434 Clubhouse Cash. Buy once for every compatible 52-card game. Each has two joker faces for games that use them; Spades uses 52 cards.</p></div>}
    {!compact && !decksOnly && <div className="spades-preview-room" ><div className="spades-preview-table" style={{ background: venue.surface, backgroundSize: venue.backgroundSize ?? 'cover', borderColor: venue.rail }}><h3 className="font-display text-2xl">{venue.name}</h3><DeckShowcase jokers deck={deck}/></div></div>}{!compact && decksOnly && <DeckShowcase jokers deck={deck}/>}
    {!compact && (!ready ? <p role="status">Loading your collection…</p> : !user ? <Link className="btn-ghost-gold" to="/auth">Sign in to collect</Link> : <p className="text-sm">Your balance: {wallet?.spades_points ?? 0} Spades points · {wallet?.points ?? 0} Clubhouse Cash</p>)}
    {(error || walletError) && <p role="alert" className="text-destructive">{error || walletError}</p>}{notice && <p role="status" className="text-gold">{notice}</p>}
    {(kind ? [kind] : decksOnly ? ['deck'] as const : ['table', 'deck'] as const).map(kind => <div key={kind}>{!compact && <h3 className="font-display text-2xl text-gold">{kind === 'table' ? 'Table surfaces' : 'Artist face & back decks'}</h3>}<div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{(kind === 'table' ? [CLASSIC_VENUE, ...SPADES_VENUES] : [CLASSIC_DECK, ...SPADES_DECKS]).filter(item => !ownedOnly || item.price === 0 || wallet?.owned.includes(item.id)).filter(item => !itemIds || itemIds.includes(item.id)).sort((a,b) => itemIds ? itemIds.indexOf(a.id)-itemIds.indexOf(b.id) : 0).map(item => {
      const owned = item.price === 0 || Boolean(wallet?.owned.includes(item.id)), slot = kind === 'table' ? 'spades_table' : 'spades_deck';
      const equipped = (wallet?.equipped[slot] ?? (kind === 'table' ? CLASSIC_VENUE.id : CLASSIC_DECK.id)) === item.id;
      return <article key={item.id} className="spades-collection-item" aria-label={item.name}>{kind === 'table' ? <div className="spades-venue-swatch" ><div style={{ background: spadesVenue(item.id).surface, backgroundSize: spadesVenue(item.id).backgroundSize ?? 'cover', borderColor: spadesVenue(item.id).rail }}>♠</div></div> : <div className="flex justify-center gap-2 py-3"><div className="spades-mini-card"><SpadesCard deck={spadesDeck(item.id)} card="KS"/></div><div className="spades-mini-card"><SpadesCard deck={spadesDeck(item.id)} back/></div></div>}<h4 className="mt-3 font-display text-xl text-gold">{item.name}</h4><p className="mt-2 text-xs text-muted-foreground">{item.description}</p><button className="mt-3 text-sm text-gold underline" onClick={() => { if (kind === 'table') setPreviewTable(item.id); else setPreviewDeck(item.id); if (compact) setPreviewOpen(true); }}>Preview {item.name}</button>{item.price === 0 ? <p className="mt-3 text-sm">Included with every account</p> : !ownedOnly && <StorePurchaseControls preferredGame="spades" itemId={item.id} userId={user?.id ?? null} wallet={wallet} owned={owned}/>} {owned && user && wallet && <button className="btn-ghost-gold mt-3 w-full text-xs" disabled={busy || equipped} onClick={() => void equip(item.id, slot)}>{equipped ? 'Equipped' : 'Equip'}</button>}</article>;
    })}</div></div>)}
  {previewOpen && <StorePreviewDialog title={`${kind === 'table' ? venue.name : deck.name} preview`} close={() => setPreviewOpen(false)}>{kind === 'table' && <div className="store-table-preview" style={{ background: venue.surface, backgroundSize: venue.backgroundSize ?? 'cover', borderColor: venue.rail }}>{venue.name}</div>}<DeckShowcase jokers deck={deck} closeLabel="Back to preview"/></StorePreviewDialog>}</section>;
}
