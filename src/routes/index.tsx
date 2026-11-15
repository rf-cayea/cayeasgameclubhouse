import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { HubNav } from '@/components/HubNav';
import { GAMES, useClubhouse } from '@/lib/clubhouse';
import { GAME_LIBRARY, LIBRARY_FILTERS, filterGames, gamePath, readGameList, writeGameList, type LibraryFilter } from '@/lib/game-library';
import { ClubhouseLogo } from '@/components/ClubhouseLogo';

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Cayea’s Game Clubhouse — Your next great game starts here' }, { name: 'description', content: 'Free card, dice, board and puzzle games by Card Guru III Games. Play solo or with friends, earn rewards and build your collection.' }] }),
  component: Hub,
});

function Hub() {
  const { user, wallet, error } = useClubhouse();
  const [filter, setFilter] = useState<LibraryFilter>('All games');
  const [query, setQuery] = useState('');
  const [favorites, setFavorites] = useState(() => readGameList('clubhouse-favorites-v1'));
  const [recent] = useState(() => readGameList('clubhouse-recent-v1'));
  const shown = filterGames(GAMES, filter, query, favorites);
  const last = recent[0] && GAME_LIBRARY[recent[0]];
  function favorite(slug: string) {
    setFavorites(current => { const next = current.includes(slug) ? current.filter(x => x !== slug) : [...current, slug]; writeGameList('clubhouse-favorites-v1', next); return next; });
  }
  return <><HubNav /><main className="gaming-home">
    {error && <p className="library-alert" role="alert">{error}</p>}
    <section className="club-hero" aria-labelledby="club-hero-title">
      <div className="hero-copy"><div className="gaming-eyebrow"><span className="status-dot" /> CARD GURU III GAMES PRESENTS</div>
        <h1 id="club-hero-title">Your clubhouse.<br />Your games.<br /><span>Your next great play.</span></h1>
        <p>Pull up a seat. Chase a new high score. Find your people. A whole world of cards, dice and discovery is right here.</p>
        <div className="hero-actions"><a href="#game-library" className="neon-button">Explore the games <span aria-hidden="true">→</span></a><Link to="/matchmaking" className="secondary-button">Find a table <span aria-hidden="true">→</span></Link></div>
        <div className="hero-meta"><span><i /> Free to play</span><span>Solo &amp; multiplayer</span><span>One shared account</span></div>
      </div>
      <div className="hero-company-art"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><ClubhouseLogo className="hero-guru"/><div className="hero-art-caption"><span className="status-dot"/> THE HOME OF YOUR NEXT FAVORITE</div></div>
      <div className="hero-bottom"><span>CONCEPTS &amp; VIBE CODING BY <strong>RICHARD CAYEA</strong></span><a href="/about#credits">Meet the makers <span aria-hidden="true">→</span></a></div>
    </section>
    <section className="club-quicklinks" aria-label="Your clubhouse">
      <a href={last ? gamePath(recent[0]) : '#game-library'}><span className="quick-icon">▷</span><span><small>{last ? 'RECENTLY OPENED' : 'READY WHEN YOU ARE'}</small><strong>{last ? last.label : 'Find your next game'}</strong></span><span aria-hidden="true">→</span></a>
      <Link to="/rewards"><span className="quick-icon">✧</span><span><small>{user ? 'YOUR CLUBHOUSE CASH' : 'PLAY. EARN. MAKE IT YOURS.'}</small><strong>{user && wallet ? `${wallet.points.toLocaleString()} Cash` : 'Rewards worth playing for'}</strong></span><span aria-hidden="true">→</span></Link>
      <Link to="/collectibles"><span className="quick-icon">▱</span><span><small>HARVEST &amp; HEARTH</small><strong>Build your card collection</strong></span><span aria-hidden="true">→</span></Link>
    </section>
    <section id="game-library" className="game-library" aria-labelledby="library-title">
      <header className="library-heading"><div><p className="gaming-eyebrow">PICK YOUR NEXT ADVENTURE</p><h2 id="library-title">The game room<span>.</span></h2></div><label className="library-search"><span aria-hidden="true">⌕</span><span className="sr-only">Search games</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your next favorite…" /></label></header>
      <div className="library-toolbar"><div className="library-filters" role="group" aria-label="Filter games">{LIBRARY_FILTERS.map(item => <button key={item} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item === 'Favorites' ? `♡ Favorites${favorites.length ? ` (${favorites.length})` : ''}` : item}</button>)}</div><span className="library-count" role="status">{shown.length} {shown.length === 1 ? 'game' : 'games'}</span></div>
      <div className="neon-game-grid">{shown.map(g => { const info = GAME_LIBRARY[g.slug]; return <article key={g.slug} className={`neon-game-card game-${info.color}`}>
        <a className={`game-card-art art-${info.art}`} href={gamePath(g.slug)} aria-label={`Play ${info.label}`}><div className="game-art-grid"/><div className="game-art-object" aria-hidden="true"><span>{info.symbol}</span><span>{info.art === 'cards' ? 'A' : info.art === 'poker' ? 'K' : info.symbol}</span><span>{info.art === 'cards' ? info.symbol : info.art === 'dice' ? '⚂' : info.symbol}</span></div><span className="game-category">{info.category}</span>{['crown-chance','crown-court'].includes(g.slug) && <span className="original-tag">CLUBHOUSE ORIGINAL</span>}</a>
        <button className="game-favorite" aria-pressed={favorites.includes(g.slug)} aria-label={`${favorites.includes(g.slug) ? 'Remove' : 'Add'} ${info.label} ${favorites.includes(g.slug) ? 'from' : 'to'} favorites`} onClick={() => favorite(g.slug)}>{favorites.includes(g.slug) ? '♥' : '♡'}</button>
        <div className="game-card-copy"><p className="game-mode"><span className="status-dot"/>{info.mode}</p><h3><a href={gamePath(g.slug)}>{info.label}</a></h3><p className="game-description">{g.tagline}</p><a href={gamePath(g.slug)} className="game-play-link">Play now <span aria-hidden="true">→</span></a></div>
      </article>; })}</div>
      {!shown.length && <div className="library-empty"><h3>{filter === 'Favorites' && !favorites.length ? 'Make room for your favorites.' : 'No games found.'}</h3><p>{filter === 'Favorites' && !favorites.length ? 'Tap the heart on any game to keep it close. Favorites are saved on this device.' : 'Try another search or explore the full game room.'}</p><button className="secondary-button" onClick={() => { setFilter('All games'); setQuery(''); }}>Show all games</button></div>}
      <p className="library-device-note">Favorites and recently opened games stay on this device. Sign in to keep verified game progress, rewards and collections with your shared account.</p>
    </section>
    <section className="club-feature-row" aria-label="More from the clubhouse"><div className="collectible-feature"><div><p className="gaming-eyebrow">MORE THAN A WIN</p><h2>Play it.<br/>Earn it. Own your style.</h2><p>Turn game points into Clubhouse Cash. Unlock decks, dice and table designs. Every collection tells your story.</p><Link to="/store" className="secondary-button">Explore the store →</Link></div><div className="feature-card-stack" aria-hidden="true"><img src="/collectible-art/hh-93.webp" alt="" loading="lazy"/><img src="/collectible-art/hh-65.webp" alt="" loading="lazy"/></div></div><div className="friends-feature"><span className="friends-symbol" aria-hidden="true">♧</span><p className="gaming-eyebrow">GOOD GAMES. GREAT COMPANY.</p><h2>Bring a friend.<br/>Make a rival.</h2><p>Find a table, share an invitation and make your next match a little more personal.</p><Link to="/friends" className="secondary-button">Your friends &amp; invitations →</Link></div></section>
    <section className="clubhouse-support"><div><p className="gaming-eyebrow">FREE TO PLAY. MADE WITH PERSONALITY.</p><h2>Welcome to Richard’s corner of the gaming world.</h2><p>Original ideas by Richard Cayea. Built with AI-assisted coding and art. Presented by Cayea Digital’s Card Guru III Games.</p></div><Link to="/about" className="secondary-button">About &amp; player guide →</Link></section>
  </main></>;
}
