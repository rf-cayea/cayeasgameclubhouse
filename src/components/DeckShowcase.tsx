import { PLAYING_CARDS, PLAYING_CARDS_WITH_JOKERS } from '@/lib/playing-decks';
import { useState, type CSSProperties } from 'react';
import type { SpadesDeck } from '@/lib/spades-cosmetics';
import { CardArtwork } from './CardArtwork';
import { GamePanel } from './GameChrome';

export function DeckShowcase({ deck, jokers = false, closeLabel }: { deck: SpadesDeck; jokers?: boolean; closeLabel?: string }) {
  const [inspect, setInspect] = useState(false);
  const cards = jokers ? PLAYING_CARDS_WITH_JOKERS : PLAYING_CARDS;
  return <div className="artist-deck-showcase" style={{ '--artist-back': deck.back, '--artist-accent': deck.accent } as CSSProperties} aria-label={`${deck.name} artwork preview`}>
    <div className="artist-deck-caption"><div><p>THE ARTIST COLLECTION</p><h3>{deck.name}</h3><span>{deck.plain ? 'Traditional courts · clean faces · two jokers' : 'Painted courts · illustrated aces · original back'}</span></div><button className="btn-ghost-gold" onClick={() => setInspect(true)}>See every face</button></div>
    <div className="artist-deck-fan">{['AS', 'QH', 'KC'].map(card => <div key={card}><CardArtwork card={card} deck={deck}/></div>)}<div><CardArtwork deck={deck} back/></div></div>
    {inspect && <GamePanel title={`${deck.name} · ${cards.length} illustrated faces`} close={() => setInspect(false)} closeLabel={closeLabel}><p className="mb-4 text-sm">Every rank and suit uses this artwork in the game. Corner indices stay clear when cards overlap.{jokers ? ' Joker artwork is included in this preview; Joker Mode is required to deal them in Rummy+.' : ''}</p><div className="artist-deck-contact-sheet">{cards.map(card => <div key={card}><CardArtwork card={card} deck={deck}/></div>)}<div><CardArtwork deck={deck} back/></div></div></GamePanel>}
  </div>;
}
