import { createContext, useContext, useId, type ReactNode } from 'react';
import { cardLabel } from '@/lib/hand-order';
import type { SpadesDeck } from '@/lib/spades-cosmetics';
import { DECK_ART_THEMES, DECK_ART_SHEETS, deckArtIndex, deckArtUrl, RUMMY_DECK } from '@/lib/card-decks';

export { RUMMY_DECK } from '@/lib/card-decks';
const CardDeckContext = createContext<SpadesDeck>(RUMMY_DECK);
export function CardDeckProvider({ deck, children }: { deck: SpadesDeck; children: ReactNode }) {
  return <CardDeckContext.Provider value={deck}>{children}</CardDeckContext.Provider>;
}
const pipLayouts: Record<number, [number, number][]> = {
  2: [[50, 46], [50, 94]], 3: [[50, 44], [50, 70], [50, 96]],
  4: [[35, 44], [65, 44], [35, 96], [65, 96]],
  5: [[35, 44], [65, 44], [50, 70], [35, 96], [65, 96]],
  6: [[35, 44], [65, 44], [35, 70], [65, 70], [35, 96], [65, 96]],
  7: [[35, 44], [65, 44], [50, 57], [35, 70], [65, 70], [35, 96], [65, 96]],
  8: [[35, 44], [65, 44], [50, 57], [35, 70], [65, 70], [50, 83], [35, 96], [65, 96]],
  9: [[35, 40], [65, 40], [35, 60], [65, 60], [50, 70], [35, 80], [65, 80], [35, 100], [65, 100]],
  10: [[35, 40], [65, 40], [50, 50], [35, 60], [65, 60], [35, 80], [65, 80], [50, 90], [35, 100], [65, 100]],
};
function SuitMark({ suit, x, y, size = 18, flip = false }: { suit: string; x: number; y: number; size?: number; flip?: boolean }) {
  return <g data-suit-mark={suit} transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 20})`} fill="currentColor"><g transform={flip ? 'rotate(180 10 10)' : undefined}>
    {suit === 'H' ? <path d="M10 19C7 16 0 11 0 6C0-1 8-1 10 4C12-1 20-1 20 6C20 11 13 16 10 19Z"/> : suit === 'D' ? <path d="M10 0L19 10L10 20L1 10Z"/> : suit === 'C' ? <><circle cx="10" cy="5" r="5"/><circle cx="5" cy="12" r="5"/><circle cx="15" cy="12" r="5"/><path d="M9 10H11L11 15L14 20H6L9 15Z"/></> : <path d="M10 0C7 5 0 8 1 13C2 18 7 18 9 14L8 17L6 20H14L12 17L11 14C13 18 18 18 19 13C20 8 13 5 10 0Z"/>}
  </g></g>;
}
/** One cached, original painted atlas per theme; every royal rank/suit is unique. */
function AtlasPanel({ deck, index, x = 0, y = 0, width = 100, height = 140 }: { deck: SpadesDeck; index: number; x?: number; y?: number; width?: number; height?: number }) {
  const sheet = DECK_ART_SHEETS[DECK_ART_THEMES[deck.motif]], column = index % 4, row = Math.floor(index / 4);
  const left = sheet.columns[column]! + 3, top = sheet.rows[row]! + 3;
  const panelWidth = sheet.columns[column + 1]! - left - 3, panelHeight = sheet.rows[row + 1]! - top - 3;
  return <svg x={x} y={y} width={width} height={height} viewBox={`${left} ${top} ${panelWidth} ${panelHeight}`} preserveAspectRatio={index < 4 || index >= 18 ? 'none' : 'xMidYMid slice'} overflow="hidden" aria-hidden="true" data-painted-panel={index}><image href={deckArtUrl(deck)} width={sheet.width} height={sheet.height}/></svg>;
}

export function CardArtwork({ card, deck: chosenDeck, back = false }: { card?: string; deck?: SpadesDeck; back?: boolean }) {
  const inheritedDeck = useContext(CardDeckContext), deck = chosenDeck ?? inheritedDeck;
  const id = `card-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const hidden = back || !card, joker = !hidden && card.startsWith('X');
  const rank = card?.[0] === 'T' ? '10' : card?.[0] ?? '', suit = card?.[1] ?? 'S';
  const ink = joker ? card === 'X2' ? deck.red : deck.ink : deck.suitColors?.[suit as 'S' | 'H' | 'D' | 'C'] ?? (['H', 'D'].includes(suit) ? deck.red : deck.ink);
  const art = deckArtIndex(card, hidden), pips = pipLayouts[Number(rank)];
  return <svg viewBox="0 0 100 140" role="img" aria-label={hidden ? `${deck.name} card back` : cardLabel(card!)} className="card-artwork spades-card-art" data-deck={deck.id} data-deck-theme={DECK_ART_THEMES[deck.motif]} data-artwork={`${DECK_ART_THEMES[deck.motif]}-${art}`} style={{ background: hidden ? deck.back : deck.paper, color: hidden ? deck.accent : ink }}>
    <defs><clipPath id={id}><rect x=".5" y=".5" width="99" height="139" rx="7"/></clipPath><linearGradient id={`${id}-gilt`} x2="1" y2="1"><stop stopColor={deck.accent}/><stop offset=".48" stopColor="#fff1c4"/><stop offset="1" stopColor={deck.accent}/></linearGradient></defs>
    <g clipPath={`url(#${id})`}>
      <rect width="100" height="140" fill={hidden ? deck.back : deck.paper}/>
      {hidden ? <AtlasPanel deck={deck} index={19}/> : <>
        {pips ? <><AtlasPanel deck={deck} index={18}/><g className="card-number-pips">{pips.map(([x, y], index) => <SuitMark key={index} suit={suit} x={x} y={y} size={Number(rank) >= 9 ? 15 : 18} flip={y > 70}/>)}</g></> : <>
          <AtlasPanel deck={deck} index={art}/>
          {joker && <><rect x="28" y="119" width="44" height="12" rx="2" fill={deck.paper} stroke={deck.accent} strokeWidth=".5"/><text x="50" y="127" textAnchor="middle" fontFamily="Georgia,serif" fontSize="6.5" letterSpacing="1.8" fill="currentColor">JOKER</text></>}
        </>}
        {[false, true].map(flipped => <g key={String(flipped)} transform={flipped ? 'rotate(180 50 70)' : undefined}>
          <rect x="5" y="5" width="22" height="36" rx="3" fill={deck.paper} opacity=".98" stroke={deck.accent} strokeWidth=".45"/>
          <text x={rank === '10' ? 9 : 10} y="23" fontFamily="Georgia,serif" fontWeight="bold" fontSize={joker ? 15 : rank === '10' ? 16 : 19} fill="currentColor">{joker ? 'Jk' : rank}</text>
          {joker ? <path d="M16 27L18 31L22 33L18 35L16 39L14 35L10 33L14 31Z" fill="currentColor"/> : <SuitMark suit={suit} x={16} y={33} size={12}/>}
        </g>)}
      </>}
      <rect x="2" y="2" width="96" height="136" rx="6" fill="none" stroke={hidden ? deck.accent : deck.plain ? '#8b929d' : '#a58c5c'} strokeWidth=".65" opacity=".8"/>
      <path opacity={deck.plain ? 0 : 1} d="M4 10V5H10M90 5H96V10M4 130V135H10M90 135H96V130" fill="none" stroke={`url(#${id}-gilt)`} strokeWidth=".8"/>
    </g>
  </svg>;
}
