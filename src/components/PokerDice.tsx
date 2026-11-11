import { useId, type CSSProperties } from 'react';
import { CLASSIC_POKER_DICE, POKER_SUITS, type PokerDiceSet } from '@/lib/poker-dice-sets';
import { deckArtIndex } from '@/lib/card-decks';
import { AtlasPanel } from './CardArtwork';
import { courtRank } from '@/lib/crown-court';

const COURT_INK: Record<number, string> = {3:'#214789',4:'#216442',5:'#9b2832'};
export function CourtCrown({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 100 80" fill="none" aria-hidden="true"><path d="m20 53-8-30 23 17L50 12l15 28 23-17-8 30Z" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M21 62h58M27 69h46" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="m50 39 5 7-5 7-5-7Z" fill="currentColor"/>{[[12,20],[50,10],[88,20]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="3" fill="currentColor"/>)}</svg>;
}
export function PokerDieFace({ value, ghost = false, held = false, design = CLASSIC_POKER_DICE }: { value: number; ghost?: boolean; held?: boolean; design?: PokerDiceSet }) {
  const id = useId(), rank = courtRank(value), court = value >= 3 && value <= 5;
  const suit = value === 1 ? 'S' : value === 2 ? 'D' : design.suit;
  const ink = ghost ? '#756a57' : court ? COURT_INK[value]! : suit === 'H' || suit === 'D' ? '#a52135' : '#192740';
  const channels = [1, 3, 5].map(offset => Number.parseInt(ink.slice(offset, offset + 2), 16) / 255);
  const engraving = channels.map(channel => `${.2126*(1-channel)} ${.7152*(1-channel)} ${.0722*(1-channel)} 0 ${channel}`).join(' ');
  const pips = [[19,17],[41,17],[19,26],[41,26],[19,36],[41,36],[19,45],[41,45],...(value===1?[[30,31]]:[[30,21],[30,41]])];
  return <svg viewBox="0 0 60 60" aria-hidden="true" data-poker-rank={rank} data-poker-design={design.id}>
    <defs><linearGradient id={id} x2=".8" y2="1"><stop stopColor="#fffdf2"/><stop offset=".34" stopColor={held ? '#ffe7a7' : design.paper}/><stop offset="1" stopColor={held ? '#e4bd63' : design.edge}/></linearGradient><filter id={`${id}-engraving`} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={`${engraving} 0 0 0 1 0`}/></filter></defs>
    <rect x="1" y="1" width="58" height="58" rx="9" fill={ghost ? '#e0d6bc' : `url(#${id})`}/>
    <rect x="4" y="4" width="52" height="52" rx="6" fill="none" stroke={held ? '#946617' : ink} strokeOpacity=".4"/>
    {ghost ? <text x="30" y="40" textAnchor="middle" fontSize="28" fill={ink}>♛</text> : <>
      {court ? <g filter={design.style === 'card' ? undefined : `url(#${id}-engraving)`}><AtlasPanel deck={design.deck} index={deckArtIndex(`${rank}${suit}`, false)} x={13} y={7} width={34} height={46}/></g>
        : value === 6 ? <g fill={ink}>
          {design.style === 'card' && <g opacity=".30"><AtlasPanel deck={design.deck} index={deckArtIndex(`A${suit}`,false)} x={13} y={8} width={34} height={44}/></g>}
          <text x="30" y="46" textAnchor="middle" fontSize="38">{POKER_SUITS[suit]}</text>
        </g>
        : <g fill={ink} fontSize="12" textAnchor="middle" dominantBaseline="central">{pips.map(([x,y]) => <text key={`${x}:${y}`} x={x} y={y}>{POKER_SUITS[suit]}</text>)}</g>}
      <g fill={ink} fontFamily="Georgia, serif" fontWeight="700" fontSize="10"><text x="7" y="14">{rank}</text><text x="53" y="53" textAnchor="end">{rank}</text></g>
    </>}
  </svg>;
}
const orientations: Record<number, [number, number]> = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
export function PokerDie({ value, held, disabled, rolling, rollId, onHold, index, design = CLASSIC_POKER_DICE }: { value: number; held: boolean; disabled: boolean; rolling: boolean; rollId: number; onHold: () => void; index: number; design?: PokerDiceSet }) {
  const [x, y] = orientations[value] ?? orientations[1]!, tumbling = rolling && !held;
  const style = { '--fd-x': `${x}deg`, '--fd-y': `${y}deg`, '--fd-roll-delay': `${index * 18}ms`, '--fd-die-body': held ? '#e4bd63' : design.edge } as CSSProperties;
  return <button type="button" className="fd-die cc-die" style={style} data-held={held} data-rolling={tumbling} disabled={disabled} aria-pressed={held} aria-label={`Die ${index + 1}: ${value ? courtRank(value) : 'not rolled'}${held ? ', held' : ''}`} onClick={onHold}>
    <div className="fd-die-visual" aria-hidden="true"><div className="fd-die-cube" key={tumbling ? `roll-${rollId}` : 'settled'}>{[1, 2, 3, 4, 5, 6].map(face => <div key={face} className="fd-cube-face" data-face={face}><PokerDieFace value={face} ghost={!value} held={held} design={design}/></div>)}</div></div>
    <span className="fd-hold-label">{held ? '✓ HELD' : value ? 'HOLD' : 'READY'}</span>
  </button>;
}
