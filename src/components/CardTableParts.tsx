import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { CardArtwork, RUMMY_DECK } from './CardArtwork';
import type { SpadesDeck } from '@/lib/spades-cosmetics';

export function TableCrest({ symbol = '♠', label = 'CAYEA’S CLUBHOUSE' }: { symbol?: string; label?: string }) {
  return <div className="table-crest" aria-hidden="true"><span className="table-crest-line"/><span className="table-crest-symbol">{symbol}</span><span className="table-crest-line"/><small>{label}</small></div>;
}
export function PlayerMedallion({ name, bot = false, seat = 0 }: { name: string; bot?: boolean; seat?: number }) {
  return <span aria-hidden="true" className="player-medallion" data-seat={seat % 4}>{bot ? <svg viewBox="0 0 24 24"><path d="M8 8V5L12 3L16 5V8M6 10L8 8H16L18 10V17H6ZM9 12V14M15 12V14M9 17L7 20H17L15 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> : name.trim().slice(0, 1).toUpperCase()}</span>;
}
export function CardGameHero({ title, description, symbol, active = false, deck = RUMMY_DECK, children }: { title: string; description: string; symbol: string; active?: boolean; deck?: SpadesDeck; children: ReactNode }) {
  return <div className="card-game-hero" data-active={active}>
    <div className="card-game-heading"><Link to="/" className="card-game-back">← Back to the hub</Link><p className="card-game-kicker"><span aria-hidden="true">{symbol}</span> Cayea’s Classic Cards</p><h1>{title}<span className="card-game-title-mark" aria-hidden="true">{symbol}</span></h1><p className="card-game-description">{description}</p></div>
    {!active && <div className="card-game-fan" aria-hidden="true"><div><CardArtwork card="QH" deck={deck}/></div><div><CardArtwork deck={deck} back/></div><div><CardArtwork card="AS" deck={deck}/></div><span className="card-game-fan-caption">A LITTLE PLAY. A LITTLE TRADITION.</span></div>}
    <div className="card-game-navigation">{children}</div>
  </div>;
}
