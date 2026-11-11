import { DiceFinishArtwork } from './DiceFinishArtwork';
import { SpecialPipArtwork } from './SpecialPipArtwork';
import { createContext, useContext, useId, type CSSProperties } from 'react';
import { CLASSIC_D6_DICE, type D6DiceDesign } from '@/lib/d6-dice';
export const D6DiceTheme = createContext<D6DiceDesign>(CLASSIC_D6_DICE);

const pips: Record<number, [number, number][]> = {
  1: [[30, 30]], 2: [[15, 15], [45, 45]], 3: [[15, 15], [30, 30], [45, 45]],
  4: [[15, 15], [45, 15], [15, 45], [45, 45]], 5: [[15, 15], [45, 15], [30, 30], [15, 45], [45, 45]],
  6: [[15, 13], [45, 13], [15, 30], [45, 30], [15, 47], [45, 47]],
};
export function D6DieFace({ value, ghost = false, held = false, design }: { value: number; ghost?: boolean; held?: boolean; design?: D6DiceDesign }) {
  const inherited = useContext(D6DiceTheme), theme = design ?? inherited, id = useId();
  const classic = theme.id === CLASSIC_D6_DICE.id, base = ghost ? '#c9c5b7' : held && classic ? '#f6d47e' : theme.face;
  const ink = ghost ? '#969486' : theme.pip;
  const finish = 'collection' in theme ? theme : null;
  const lightInk = parseInt(ink.slice(1,3),16)+parseInt(ink.slice(3,5),16)+parseInt(ink.slice(5,7),16)>500;
  const pipSize = theme.symbol === 'starfish' ? 15 : 12;
  return <svg viewBox="0 0 60 60" aria-hidden="true" data-dice-design={theme.id}>
    <defs><linearGradient id={id} x2=".8" y2="1"><stop stopColor={ghost ? base : theme.light}/><stop offset=".32" stopColor={base}/><stop offset="1" stopColor={base}/></linearGradient></defs>
    <rect x="1" y="1" width="58" height="58" rx="10" fill={classic || ghost ? base : `url(#${id})`} />
    {finish && !ghost && <DiceFinishArtwork design={finish} id={id}/>}
    <rect x="4" y="4" width="52" height="52" rx="8" fill="none" stroke={held ? '#d5a83b' : theme.edge} strokeWidth=".8" />
    {(pips[value] ?? pips[1]!).map(([x, y], index) => theme.symbol === 'dot' || ghost ? <g key={index} data-pip-value={value}>{finish && !ghost && <circle cx={x} cy={y} r="6.3" fill={lightInk ? '#30283b' : '#fff1d2'} opacity=".95"/>}<circle cx={x} cy={y} r="5.2" fill={ink} stroke={finish && !ghost ? finish.accent : undefined} strokeWidth={finish ? 1 : 0}/></g> : <g key={index} transform={`translate(${x-pipSize/2} ${y-pipSize/2}) scale(${pipSize/24})`} data-pip={theme.symbol}>
      <SpecialPipArtwork symbol={theme.symbol} ink={ink}/>
    </g>)}
  </svg>;
}
const orientations: Record<number, [number, number]> = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
export function D6Die({ value, held, disabled, rolling, rollId, onHold, index, holdLabel, ariaLabel }: {
  value: number; held: boolean; disabled: boolean; rolling: boolean; rollId: number; onHold: () => void; index: number; holdLabel?: string; ariaLabel?: string;
}) {
  const theme = useContext(D6DiceTheme);
  const [x, y] = orientations[value] ?? orientations[1]!;
  const tumbling = rolling && !held;
  const style = { '--fd-x': `${x}deg`, '--fd-y': `${y}deg`, '--fd-roll-delay': `${index * 18}ms`, '--fd-die-body': !value ? '#c9c5b7' : held && theme.id === CLASSIC_D6_DICE.id ? '#f6d47e' : theme.face } as CSSProperties;
  return <button type="button" className="fd-die" style={style} data-held={held} data-rolling={tumbling} disabled={disabled} aria-pressed={held} aria-label={ariaLabel ?? `Die ${index + 1}: ${value || 'not rolled'}${held ? ', held' : ''}`} onClick={onHold}>
    <div className="fd-die-visual" aria-hidden="true">
      <div className="fd-die-cube" key={tumbling ? `roll-${rollId}` : 'settled'}>
        {[1, 2, 3, 4, 5, 6].map(face => <div key={face} className="fd-cube-face" data-face={face}><D6DieFace value={face} ghost={!value} held={held} /></div>)}
      </div>
    </div>
    <span className="fd-hold-label">{held && <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M3.5 5V3.5a2.5 2.5 0 0 1 5 0V5M2.5 5h7v6h-7Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>}{holdLabel ?? (held ? 'HELD' : value ? 'HOLD' : 'READY')}</span>
  </button>;
}
