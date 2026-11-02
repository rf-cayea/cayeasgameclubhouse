import { useId } from 'react';
import { cardLabel } from '@/lib/hand-order';
import type { SpadesDeck } from '@/lib/spades-cosmetics';

export const RUMMY_DECK: SpadesDeck = { id: 'rummy-standard', name: 'Clubhouse Heritage', price: 0, description: 'The Clubhouse’s signature ivory and midnight deck.', paper: '#fff9eb', ink: '#20383b', red: '#aa3347', back: '#152e40', accent: '#e8c98b', motif: 'classic' };
const suits: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const pipLayouts: Record<number, [number, number][]> = {
  2: [[50, 47], [50, 94]], 3: [[50, 47], [50, 70], [50, 94]],
  4: [[35, 47], [65, 47], [35, 94], [65, 94]],
  5: [[35, 47], [65, 47], [50, 70], [35, 94], [65, 94]],
  6: [[35, 47], [65, 47], [35, 70], [65, 70], [35, 94], [65, 94]],
  7: [[35, 47], [65, 47], [50, 58], [35, 70], [65, 70], [35, 94], [65, 94]],
  8: [[35, 47], [65, 47], [50, 58], [35, 70], [65, 70], [50, 82], [35, 94], [65, 94]],
  9: [[35, 43], [65, 43], [35, 61], [65, 61], [50, 70], [35, 80], [65, 80], [35, 98], [65, 98]],
  10: [[35, 43], [65, 43], [50, 52], [35, 61], [65, 61], [35, 80], [65, 80], [50, 90], [35, 98], [65, 98]],
};

function BackOrnament({ motif }: { motif: SpadesDeck['motif'] }) {
  if (motif === 'stars') return <g fill="none" stroke="currentColor"><circle cx="50" cy="70" r="29"/><circle cx="50" cy="70" r="22"/><path d="M50 32V108M12 70H88M23 43L77 97M23 97L77 43M50 46L57 63L74 70L57 77L50 94L43 77L26 70L43 63Z"/><g fill="currentColor"><circle cx="23" cy="43" r="2"/><circle cx="77" cy="97" r="2"/><circle cx="77" cy="43" r="2"/><circle cx="23" cy="97" r="2"/></g></g>;
  if (motif === 'leaves') return <g fill="none" stroke="currentColor"><ellipse cx="50" cy="70" rx="24" ry="39"/><path d="M50 109V31M50 48Q24 48 28 29Q47 29 50 48M50 64Q75 62 73 43Q52 44 50 64M50 82Q23 80 27 61Q47 62 50 82M50 100Q75 97 73 79Q53 79 50 100M36 34L50 48M65 48L50 64M34 66L50 82M65 84L50 100"/></g>;
  if (motif === 'deco') return <g fill="none" stroke="currentColor"><path d="M18 29L50 108L82 29M22 111L50 36L78 111M28 111L50 52L72 111M34 111L50 68L66 111M14 25H86V115H14Z"/><path d="M14 70H86M14 75H86" opacity=".5"/></g>;
  if (motif === 'crown') return <g fill="none" stroke="currentColor"><circle cx="50" cy="70" r="32"/><path d="M28 55L34 77H66L72 55L60 64L50 43L40 64ZM34 83H66M50 90L58 98L50 106L42 98Z"/>{Array.from({ length: 16 }, (_, i) => <path key={i} d="M50 24V30" transform={`rotate(${i * 22.5} 50 70)`} />)}</g>;
  return <g fill="none" stroke="currentColor"><path d="M50 29L80 70L50 111L20 70ZM50 37L74 70L50 103L26 70Z"/><path d="M16 18Q50 40 84 18M16 122Q50 100 84 122M16 34Q34 70 16 106M84 34Q66 70 84 106" opacity=".65"/><circle cx="50" cy="70" r="16"/><text x="50" y="78" textAnchor="middle" fontFamily="Georgia,serif" fontSize="23" fill="currentColor" stroke="none">C</text></g>;
}

function Court({ rank, suit, deck }: { rank: string; suit: string; deck: SpadesDeck }) {
  return <g>
    <path d="M29 33H71V107H29Z" fill="currentColor" opacity=".055"/>
    <path d="M29 33H71V107H29Z" fill="none" stroke="currentColor" strokeWidth=".7" opacity=".4"/>
    {[false, true].map(flipped => <g key={String(flipped)} transform={flipped ? 'rotate(180 50 70)' : undefined}>
      <path d="M31 71Q32 59 44 59H56Q68 59 69 71Z" fill="currentColor" opacity=".9"/>
      <path d="M39 62L50 73L61 62M35 66L42 73M65 66L58 73" fill="none" stroke={deck.accent} strokeWidth="1.5"/>
      <path d="M42 46Q50 39 58 46V54Q57 62 50 63Q43 61 42 54Z" fill={deck.paper} stroke="currentColor" strokeWidth="1.1"/>
      <path d="M45 51H48M53 51H56M50 52L49 55H52M47 58Q50 60 53 58" fill="none" stroke="currentColor" strokeWidth=".7"/>
      {rank === 'K' ? <><path d="M40 45L38 35L45 39L50 32L55 39L62 35L60 45Z" fill={deck.accent} stroke="currentColor" strokeWidth=".7"/><path d="M45 57L46 63L50 66L54 63L55 57" fill="currentColor" opacity=".75"/></> : rank === 'Q' ? <><path d="M40 45L41 36L46 40L50 34L54 40L59 36L60 45Z" fill={deck.accent} stroke="currentColor" strokeWidth=".7"/><path d="M42 46Q38 52 40 61M58 46Q62 52 60 61" fill="none" stroke="currentColor" strokeWidth="2"/></> : <><path d="M40 45Q42 33 53 36L61 42L57 46Z" fill="currentColor"/><path d="M52 37Q61 29 62 37L58 41" fill={deck.red}/></>}
      <text x="35" y="43" fontSize="10" fill="currentColor">{suit}</text>
    </g>)}
    <path d="M29 70H71" stroke={deck.accent} strokeWidth="2"/>
    {deck.motif === 'leaves' && <path d="M24 40Q16 70 24 100M76 40Q84 70 76 100" fill="none" stroke="currentColor" opacity=".5"/>}
  </g>;
}

/** Shared original vector deck. Back artwork contains no face-card information. */
export function CardArtwork({ card, deck = RUMMY_DECK, back = false }: { card?: string; deck?: SpadesDeck; back?: boolean }) {
  const id = `card-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const hidden = back || !card, joker = !hidden && card.startsWith('X');
  const rank = card?.[0] === 'T' ? '10' : card?.[0] ?? '';
  const suit = suits[card?.[1] ?? 'S'] ?? '✦';
  const ink = joker ? card === 'X2' ? deck.red : deck.ink : card && ['H', 'D'].includes(card[1]!) ? deck.red : deck.ink;
  const pips = pipLayouts[Number(rank)];
  return <svg viewBox="0 0 100 140" role="img" aria-label={hidden ? `${deck.name} card back` : cardLabel(card!)} className="card-artwork spades-card-art" style={{ background: hidden ? deck.back : deck.paper, color: hidden ? deck.accent : ink }}>
    <defs><linearGradient id={`${id}-light`} x2=".8" y2="1"><stop stopColor="#fff" stopOpacity=".27"/><stop offset=".55" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".055"/></linearGradient><pattern id={`${id}-pattern`} width="10" height="10" patternUnits="userSpaceOnUse"><path d="M5 1L9 5L5 9L1 5Z" fill="none" stroke="currentColor" strokeWidth=".4" opacity=".18"/></pattern></defs>
    <rect x=".8" y=".8" width="98.4" height="138.4" rx="8" fill={`url(#${id}-light)`}/><rect x="3" y="3" width="94" height="134" rx="6" fill="none" stroke="currentColor" strokeWidth=".6" opacity={hidden ? '.7' : '.22'}/>
    {hidden ? <><rect x="8" y="8" width="84" height="124" rx="3" fill={`url(#${id}-pattern)`}/><rect x="8" y="8" width="84" height="124" rx="3" fill="none" stroke="currentColor" strokeWidth=".7"/><BackOrnament motif={deck.motif}/><path d="M28 17H72M28 123H72" stroke="currentColor" strokeWidth=".6"/><text x="50" y="129" textAnchor="middle" fontSize="4" letterSpacing="2.2" fill="currentColor">CAYEA’S CLASSIC CARDS</text></> : joker ? <>
      <text x="12" y="23" fontSize="15" fill="currentColor">✦</text><text x="88" y="125" fontSize="15" textAnchor="end" fill="currentColor">✦</text><path d="M29 65Q20 26 38 41L49 30L60 41Q80 27 71 65Z" fill="currentColor" opacity=".9"/><path d="M35 58Q50 47 65 58V74Q62 91 50 93Q38 91 35 74Z" fill={deck.paper} stroke="currentColor"/><path d="M39 66Q44 61 47 66M53 66Q57 61 62 66M41 79Q50 88 60 79" fill="none" stroke="currentColor" strokeWidth="1.5"/><g fill={deck.accent} stroke="currentColor" strokeWidth=".7"><circle cx="28" cy="44" r="4"/><circle cx="49" cy="30" r="4"/><circle cx="72" cy="44" r="4"/></g><path d="M29 100L39 91L50 101L61 91L71 100L50 111Z" fill="currentColor"/><text x="50" y="122" textAnchor="middle" fontSize="9" letterSpacing="2" fill="currentColor">JOKER</text>
    </> : <>
      <g fill="currentColor" fontFamily="Georgia,serif" fontWeight="bold"><text x="10" y="23" fontSize="18">{rank}</text><text x="11" y="38" fontSize="15">{suit}</text><g transform="rotate(180 50 70)"><text x="10" y="23" fontSize="18">{rank}</text><text x="11" y="38" fontSize="15">{suit}</text></g></g>
      {['J', 'Q', 'K'].includes(rank) ? <Court rank={rank} suit={suit} deck={deck}/> : pips ? <g fill="currentColor" textAnchor="middle" fontSize={Number(rank) >= 9 ? 18 : 21}>{pips.map(([x, y], index) => <text key={index} x={x} y={y + 7} transform={y > 70 ? `rotate(180 ${x} ${y})` : undefined}>{suit}</text>)}</g> : <><path d="M50 38L75 73L50 104L25 73Z" fill="none" stroke="currentColor" opacity=".2"/><text x="50" y="91" textAnchor="middle" fontSize="49" fill="currentColor">{suit}</text><text x="50" y="116" textAnchor="middle" fontSize="4.2" letterSpacing="1.6" fill="currentColor">{deck.motif === 'classic' ? 'CAYEA’S CLUBHOUSE' : deck.name.toUpperCase()}</text></>}
      {deck.motif === 'deco' && <path d="M28 12H72L67 18H33ZM28 128H72L67 122H33Z" fill="none" stroke="currentColor" opacity=".4"/>}
      {deck.motif === 'stars' && <path d="M50 13V22M46 17H54M50 118V127M46 123H54" stroke="currentColor" opacity=".6"/>}
      {deck.motif === 'crown' && <path d="M35 16L40 22H60L65 16M35 124L40 118H60L65 124" fill="none" stroke="currentColor" opacity=".35"/>}
    </>}
  </svg>;
}
