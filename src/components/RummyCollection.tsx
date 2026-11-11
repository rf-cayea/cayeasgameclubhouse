import { StorePreviewDialog } from './StorePreviewDialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useClubhouse } from '@/lib/clubhouse';
import { StorePurchaseControls } from './StorePurchaseControls';
import { gameRequest } from '@/lib/rummy-network';
import { RUMMY_DESIGNS, rummyAppearanceView, type RummyAppearanceSlot, type RummyAppearanceView } from '@/lib/rummy-cosmetics';
import { rummyDeck } from '@/lib/card-decks';
import { CardArtwork } from './CardArtwork';
import { DeckShowcase } from './DeckShowcase';

export function useRummyAppearance(userId: string | null, finishedMatch: string) {
  const [data, setData] = useState(() => rummyAppearanceView(false, 0)), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState<string[]>([]), observed = useRef<RummyAppearanceView | null>(null);
  const epoch = useRef(0), pending = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) return;
    const version = ++epoch.current;
    try {
      const next = await gameRequest<RummyAppearanceView>('/api/rummy/appearance');
      if (version === epoch.current) {
        const previous = observed.current;
        if (previous?.member && next.member && next.wins > previous.wins) setUnlocked(RUMMY_DESIGNS.filter(item => item.slot !== 'background' && next.owned.includes(item.id) && !previous.owned.includes(item.id)).map(item => item.name));
        observed.current = next; setData(next); setError('');
      }
    }
    catch (cause) { if (version === epoch.current) setError(cause instanceof Error ? cause.message : 'Your collection could not load.'); }
  }, []);
  useEffect(() => {
    setData(rummyAppearanceView(false, 0)); setError(''); setBusy(false); setUnlocked([]); observed.current = null; pending.current = false;
    void refresh();
    const focused = () => void refresh(); window.addEventListener('focus', focused); window.addEventListener('clubhouse-wallet', focused);
    return () => { ++epoch.current; window.removeEventListener('focus', focused); window.removeEventListener('clubhouse-wallet', focused); };
  }, [userId, refresh]);
  useEffect(() => { if (finishedMatch) void refresh(); }, [finishedMatch, refresh]);
  async function equip(slot: RummyAppearanceSlot, id: string) {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError(''); const version = ++epoch.current;
    try {
      const next = await gameRequest<RummyAppearanceView>('/api/rummy/appearance', { ...data.equipped, [slot]: id });
      if (version === epoch.current) { observed.current = next; setData(next); }
      return version === epoch.current;
    } catch (cause) { if (version === epoch.current) setError(cause instanceof Error ? cause.message : 'The design could not be equipped.'); return false; }
    finally { if (version === epoch.current) { pending.current = false; setBusy(false); } }
  }
  return { data, error, busy, refresh, equip, unlocked, dismissUnlocks: () => setUnlocked([]) };
}
export function RummyCollection({ collection, onEquip, slots = ['deck', 'table'], compact = false, itemIds, ownedOnly = false }: { collection: ReturnType<typeof useRummyAppearance>; onEquip?: (slot: RummyAppearanceSlot) => void; slots?: RummyAppearanceSlot[]; compact?: boolean; ownedOnly?: boolean; itemIds?: readonly string[] }) {
  const { user, wallet } = useClubhouse();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState(collection.data.equipped.deck);
  useEffect(() => { setPreview(collection.data.equipped.deck); }, [collection.data.equipped.deck]);
  const visible = RUMMY_DESIGNS.filter(item => slots.includes(item.slot)), next = visible.find(item => !item.purchaseOnly && item.wins > collection.data.wins);
  return <section className="rummy-collection" aria-label="Rummy+ earned artwork">{ownedOnly && <p>Equip your owned decks and tables here. <Link to="/store" search={{category:'decks'}} className="text-gold underline">Collect more artwork in the Store →</Link></p>}{!compact && <><p className="text-sm">Win full Rummy+ matches to earn points and table rewards. Paid tables cost 125 points or 97 Cash. Shared decks cost 563 Rummy+ or Spades points, or 434 Cash: buy once for all compatible 52-card games. Each has 52 cards and two jokers; Joker Mode is needed to play with wild jokers.</p><p className="rummy-collection-progress" role="status">{collection.data.member ? `${collection.data.wins} verified match ${collection.data.wins === 1 ? 'win' : 'wins'} · ${next ? `Next: ${next.name} at ${next.wins} wins` : `All ${visible.filter(item => !item.purchaseOnly && item.wins > 0).length} rewards collected`}` : <><Link to="/auth" className="underline text-gold">Sign in before starting</Link> to earn designs. Guest, hand practice and pass-and-play games do not count.</>}</p><progress aria-label="Rummy+ artwork rewards progress" value={Math.min(10, collection.data.wins)} max={10}/></>}{!compact && slots.includes('deck') && <DeckShowcase deck={rummyDeck(preview)} jokers/>}{slots.map(slot => <div key={slot}>{!compact && <h3>{slot === 'background' ? 'Room backgrounds' : slot === 'deck' ? 'Artist face & back decks' : 'Table surfaces'}</h3>}<div className="rummy-design-grid">{RUMMY_DESIGNS.filter(item => item.slot === slot && (!ownedOnly || collection.data.owned.includes(item.id)) && (!itemIds || itemIds.includes(item.id))).sort((a,b) => itemIds ? itemIds.indexOf(a.id)-itemIds.indexOf(b.id) : 0).map(item => {
    const owned = collection.data.owned.includes(item.id), equipped = collection.data.equipped[slot] === item.id;
    return <article key={item.id} className="rummy-design" data-locked={!owned} aria-label={item.name}>{slot === 'deck' ? <div className="artist-deck-thumbnail"><div><CardArtwork card="KS" deck={rummyDeck(item.id)}/></div><div><CardArtwork deck={rummyDeck(item.id)} back/></div></div> : <div className="rummy-surface-swatch" role="img" aria-label={item.name} style={{ background: item.surface ?? `url("${item.image}") center / cover`, backgroundSize: item.backgroundSize ?? 'cover' }}/>}<div><h4>{item.name}</h4><p>{item.purchaseOnly ? slot === 'deck' ? 'Shared deck · 52 cards + 2 jokers · buy once' : 'Permanent table surface · 125 points' : item.wins === 0 ? 'Included for everyone' : `Earn at ${item.wins} verified match ${item.wins === 1 ? 'win' : 'wins'}`}</p>{!ownedOnly && (item.wins > 0 || item.purchaseOnly) && <StorePurchaseControls itemId={item.id} userId={user?.id ?? null} wallet={wallet} owned={owned} onPurchased={() => void collection.refresh()}/>}
{slot === 'deck' && <button className="artist-preview-button" onClick={() => { setPreview(item.id); if (compact) setPreviewOpen(true); }}>Preview {item.name}</button>}{(!compact || owned) && <button className={equipped ? 'btn-gold' : 'btn-ghost-gold'} disabled={!owned || equipped || collection.busy} onClick={async () => { if (await collection.equip(slot, item.id)) onEquip?.(slot); }}>{equipped ? 'Equipped' : owned ? 'Use design' : item.purchaseOnly ? 'Collect to equip' : `Locked · ${item.wins} wins`}</button>}</div></article>;
  })}</div></div>)}{previewOpen && <StorePreviewDialog title={`${rummyDeck(preview).name} preview`} close={() => setPreviewOpen(false)}><DeckShowcase deck={rummyDeck(preview)} jokers closeLabel="Back to preview"/></StorePreviewDialog>}{collection.error && <p role="alert" className="mt-4 text-destructive">{collection.error}<button className="ml-2 underline" onClick={() => void collection.refresh()}>Try again</button></p>}</section>;
}
