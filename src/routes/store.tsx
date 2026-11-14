import {PokerDiceCollection} from '@/components/PokerDiceCollection';
import {CarromCollection} from '@/components/CarromCollection';
import {CollectibleBoosterShop} from '@/components/CollectibleBoosterShop';
import {FragmentShop} from '@/components/FragmentShop';
import {BackgammonCollection} from '@/components/BackgammonCollection';
import '@/styles/backgammon.css';
import { DominoSkinCollection } from '@/components/DominoSkinCollection';
import { useEffect, useRef, useState } from 'react';
import { createFileRoute, Link, useLocation } from '@tanstack/react-router';
import { FarkleDiceCollection } from '@/components/FarkleDiceCollection';
import '@/styles/farkle-dice-store.css';
import { CustomProfileImage } from '@/components/CustomProfileImage';
import { HubNav } from '@/components/HubNav';
import { WalletCredits } from '@/components/WalletCredits';
import { FaithSkinStore } from '@/components/FaithSkinStore';
import { SpadesPartnershipUnlock } from '@/components/SpadesPartnershipUnlock';
import { SpadesCollection } from '@/components/SpadesCollection';
import { RummyCollection, useRummyAppearance } from '@/components/RummyCollection';
import { StorePurchaseControls } from '@/components/StorePurchaseControls';
import { RUMMY_DESIGNS } from '@/lib/rummy-cosmetics';
import { CLASSIC_DECK, CLASSIC_VENUE, SPADES_DECKS, SPADES_VENUES } from '@/lib/spades-cosmetics';
import { useClubhouse } from '@/lib/clubhouse';

const CATEGORIES = [
 {id:'boosters',label:'Card boosters',icon:'★'},
 {id:'fragments',label:'Fragments',icon:'◆'},
  {id:'carrom',label:'Carrom',icon:'◉'},
  {id:'backgammon',label:'Backgammon',icon:'◈'},
  { id:'tables', label:'Tables', icon:'♣' }, { id:'decks', label:'Decks', icon:'♠' },
  { id:'poker', label:'Poker dice', icon:'♛' }, { id:'dice', label:'Shared D6 dice', icon:'⚄' }, { id:'dominoes', label:'Dominoes', icon:'▥' }, { id:'faith', label:'Faith 3', icon:'✦' }, { id:'modes', label:'Game modes', icon:'🃏' },
  { id:'frames', label:'Frames', icon:'◇' },
  { id:'wallet', label:'Wallet', icon:'◉' },
] as const;
type Category = typeof CATEGORIES[number]['id'];
type CardGame = 'rummy' | 'spades';
export const Route = createFileRoute('/store')({
  validateSearch: (search: Record<string,unknown>): { category?: Category; game?: CardGame } => ({
    category: CATEGORIES.some(item => item.id === search.category) ? search.category as Category : undefined,
    game: search.game === 'spades' || search.game === 'rummy' ? search.game : undefined,
  }),
  head: () => ({ meta: [{ title: "Clubhouse Store — Cayea's Game Clubhouse" }] }), component: StorePage,
});
function legacyCategory(hash: string): Category {
  if (hash.includes('faith')) return 'faith';
  if (hash.includes('partnership') || hash.includes('joker') || hash.includes('farkle') || hash.includes('five-dice')) return 'modes';
  if (hash.includes('profile')) return 'frames';
  return 'tables';
}
function StorePage() {
  const { user, wallet, ready, error, applyWallet, reload } = useClubhouse(), collection = useRummyAppearance(user?.id ?? null, '');
  const search = Route.useSearch(), location = useLocation(), navigate = Route.useNavigate();
  const category = search.category ?? legacyCategory(location.hash), game = search.game ?? 'rummy';
  const [query, setQuery] = useState(''), [ownedOnly, setOwnedOnly] = useState(false), [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(() => window.matchMedia('(max-width: 640px)').matches ? 2 : 4);
  const browser = useRef<HTMLElement>(null);
  useEffect(() => { const media = window.matchMedia('(max-width: 640px)'), resize = () => { setPageSize(media.matches ? 2 : 4); setPage(0); }; media.addEventListener('change', resize); return () => media.removeEventListener('change', resize); }, []);
  useEffect(() => { setQuery(''); setOwnedOnly(false); setPage(0); }, [category, game, user?.id]);
  const cardCategory = category === 'tables' || category === 'decks', slot = category === 'decks' ? 'deck' : 'table';
  const allItems = game === 'rummy'
    ? RUMMY_DESIGNS.filter(item => item.slot === slot).map(item => ({ id:item.id, name:item.name, included:!item.purchaseOnly && item.wins === 0, owned:collection.data.owned.includes(item.id) }))
    : (slot === 'table' ? [CLASSIC_VENUE, ...SPADES_VENUES] : [CLASSIC_DECK, ...SPADES_DECKS]).map(item => ({ id:item.id, name:item.name, included:item.price === 0, owned:item.price === 0 || Boolean(wallet?.owned.includes(item.id)) }));
  const filtered = allItems.filter(item => item.name.toLowerCase().includes(query.trim().toLowerCase()) && (!ownedOnly || item.owned)).sort((a,b) => Number(b.included) - Number(a.included));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), currentPage = Math.min(page, pages - 1), shown = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  function choose(next: Category, nextGame = game) {
    void navigate({ search: { category:next, game:nextGame }, hash:'', resetScroll:false });
    browser.current?.scrollIntoView({ block:'start' });
  }
  function changePage(next: number) { setPage(next); browser.current?.scrollIntoView({ block:'start' }); }
  const title = CATEGORIES.find(item => item.id === category)!.label;
  return <><HubNav/><main className="store-shell"><header className="store-heading"><div><h1>Clubhouse Store</h1><p>Pick a category to find your next unlock.</p></div>{user && wallet && <button className="store-wallet-link" onClick={() => choose('wallet')}><span>Clubhouse Cash</span><strong>{wallet.points.toLocaleString()}</strong><span>Points &amp; conversion →</span></button>}</header>
    <nav className="store-categories" aria-label="Store categories">{CATEGORIES.map(item => <Link key={item.id} to="/store" search={{ category:item.id, game }} hash="" resetScroll={false} aria-current={category === item.id ? 'page' : undefined} onClick={() => browser.current?.scrollIntoView({ block:'start' })}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav>
    {error && <div role="alert" className="store-error"><p>Your Clubhouse Cash could not load, so purchases stay disabled. {error}</p><button type="button" className="btn-ghost-gold mt-2 text-xs" onClick={() => void reload()}>Try loading my wallet again</button></div>}
    <section ref={browser} id="store-browse" className="store-browse" aria-labelledby="store-category-title"><header className="store-category-heading"><h2 id="store-category-title">{cardCategory ? category === 'decks' ? 'Shared card decks' : `${game === 'rummy' ? 'Rummy+' : 'Spades'} ${title.toLowerCase()}` : title}</h2>{cardCategory && <div className="store-game-switch" role="group" aria-label="Card game">{(['rummy','spades'] as const).map(value => <button key={value} aria-pressed={game === value} onClick={() => choose(category,value)}>{value === 'rummy' ? 'Rummy+' : 'Spades'}</button>)}</div>}</header>
      {category==='poker'?<PokerDiceCollection store/>:category==='boosters'?<CollectibleBoosterShop/>:category==='fragments'?<FragmentShop/>:category==='carrom'?<CarromCollection key={user?.id??'guest'} store/>:category==='backgammon'?<BackgammonCollection store/>:cardCategory ? <><p className="store-price-note">{category === 'tables' ? 'Every paid table surface: 125 game points or 97 Cash. Default tables stay free.' : 'Each shared deck: 563 Rummy+ or Spades points, or 434 Cash. Buy once for all compatible 52-card games. Includes 52 cards + 2 jokers. Choose a game below to equip your deck.'}{user && wallet && <span>{game === 'rummy' ? wallet.rummy_points : wallet.spades_points} {game === 'rummy' ? 'Rummy+' : 'Spades'} points · {wallet.points} Cash</span>}</p>
        <div className="store-filters"><label><span className="sr-only">Search {title.toLowerCase()}</span><input type="search" aria-label={`Search ${title.toLowerCase()}`} placeholder={`Search ${title.toLowerCase()}…`} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }}/></label><label><input type="checkbox" checked={ownedOnly} onChange={event => { setOwnedOnly(event.target.checked); setPage(0); }}/> Owned only</label></div>
        <div className="store-pagination" aria-label="Product pages"><button className="btn-ghost-gold" aria-label="Previous products" disabled={currentPage === 0} onClick={() => changePage(currentPage-1)}>← Previous</button><p role="status">{filtered.length ? `${currentPage*pageSize+1}–${Math.min((currentPage+1)*pageSize,filtered.length)} of ${filtered.length}` : 'No matches'}</p><button className="btn-ghost-gold" aria-label="Next products" disabled={currentPage+1 >= pages} onClick={() => changePage(currentPage+1)}>Next →</button></div>
        <div className="store-product-panel" key={`${game}:${slot}`}>{shown.length ? game === 'rummy' ? <RummyCollection compact slots={[slot]} itemIds={shown.map(item=>item.id)} collection={collection}/> : <SpadesCollection compact kind={slot} itemIds={shown.map(item=>item.id)}/> : <p className="store-empty">No matching {title.toLowerCase()}.<button className="text-gold underline" onClick={() => { setQuery(''); setOwnedOnly(false); }}>Show every design</button></p>}</div>
        <Link to={game === 'rummy' ? '/games/rummy' : '/games/spades'} className="btn-ghost-gold store-play-link">Play {game === 'rummy' ? 'Rummy+' : 'Spades'} →</Link>
      </> : category === 'faith' ? <FaithSkinStore key={user?.id ?? 'guest'} userId={user?.id ?? null} wallet={wallet} ready={ready} onEquipped={applyWallet}/>
      : category === 'dominoes' ? <DominoSkinCollection key={user?.id??'guest'} userId={user?.id??null} wallet={wallet} onEquipped={applyWallet}/>
      : category === 'dice' ? <FarkleDiceCollection key={user?.id??'guest'} userId={user?.id??null} wallet={wallet} onEquipped={applyWallet}/>
      : category === 'frames' ? <CustomProfileImage/>
      : category === 'modes' ? <div className="store-modes"><section className="card-hub" id="rummy-jokers" aria-labelledby="joker-title"><div className="text-4xl" aria-hidden="true">🃏</div><h3 id="joker-title" className="mt-3 font-display text-2xl text-gold">Joker Mode</h3><p className="mt-3 text-muted-foreground">Permanently unlock wild jokers for Rummy+ computer, pass-and-play, and online tables you host.</p><StorePurchaseControls itemId="rummy-jokers" userId={user?.id ?? null} wallet={wallet}/></section><SpadesPartnershipUnlock/><section className="card-hub" id="farkle-party" aria-labelledby="farkle-party-title"><div className="text-4xl" aria-hidden="true">🎲</div><h3 id="farkle-party-title" className="mt-3 font-display text-2xl text-gold">Farkle · 3–4 players</h3><p className="mt-3 text-muted-foreground">Permanently unlock three- and four-player online Farkle tables for Classic and Fast Match. Every participant needs this unlock. Computer games and two-player online games are free.</p><StorePurchaseControls itemId="farkle-party" userId={user?.id ?? null} wallet={wallet}/><Link to="/games/farkle" className="mt-4 inline-block text-gold underline">Play Farkle →</Link></section><section className="card-hub" id="five-dice-party" aria-labelledby="dice-party-title"><div className="text-4xl" aria-hidden="true">🎲</div><h3 id="dice-party-title" className="mt-3 font-display text-2xl text-gold">Quintsee · 3–4 players</h3><p className="mt-3 text-muted-foreground">Permanently unlock online tables for three or four real players. Every participant needs this unlock. Two-player online matches and all computer difficulties stay free.</p><StorePurchaseControls itemId="five-dice-party" userId={user?.id ?? null} wallet={wallet}/><Link to="/games/quintsee" className="mt-4 inline-block text-gold underline">Play Quintsee →</Link></section></div>
      : user && wallet ? <WalletCredits key={user.id} userId={user.id} wallet={wallet}/> : <div className="card-hub"><p>Sign in to see your points and convert them to Clubhouse Cash.</p><Link className="btn-gold mt-3 inline-block" to="/auth">Sign in</Link></div>}
    </section></main></>;
}
