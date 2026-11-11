import { useId, type CSSProperties } from 'react';
import { courtRank } from '@/lib/crown-court';

const INKS = ['#24465e', '#255e59', '#96383c', '#71366a', '#254a85', '#855c16'];
export function CourtCrown({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 100 80" fill="none" aria-hidden="true"><path d="m20 53-8-30 23 17L50 12l15 28 23-17-8 30Z" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M21 62h58M27 69h46" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="m50 39 5 7-5 7-5-7Z" fill="currentColor"/>{[[12,20],[50,10],[88,20]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="3" fill="currentColor"/>)}</svg>;
}
export function PokerDieFace({ value, ghost = false, held = false }: { value: number; ghost?: boolean; held?: boolean }) {
  const id = useId(), ink = ghost ? '#8b888b' : INKS[value - 1] ?? INKS[5];
  return <svg viewBox="0 0 60 60" aria-hidden="true" data-poker-rank={courtRank(value)}>
    <defs><linearGradient id={id} x2=".8" y2="1"><stop stopColor="#fffdf2"/><stop offset=".5" stopColor={held ? '#ffe7a7' : '#f0e7ce'}/><stop offset="1" stopColor={held ? '#e4bd63' : '#d8c9a5'}/></linearGradient></defs>
    <rect x="1" y="1" width="58" height="58" rx="9" fill={ghost ? '#c6c0b4' : `url(#${id})`}/>
    <rect x="4" y="4" width="52" height="52" rx="6" fill="none" stroke={held ? '#946617' : '#9e8657'} strokeWidth=".7"/>
    <path d="M8 17V9h9M43 9h8v8M51 43v8h-8M17 51H9v-8" stroke={ink} strokeWidth=".8" opacity=".7" fill="none"/>
    <path d="m24 13-1-5 4 3 3-5 3 5 4-3-1 5Zm1 3h10" fill={ink} stroke={ink} strokeWidth=".6" strokeLinejoin="round"/>
    <text x="30" y="42" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize={value === 2 ? 27 : 31} fill={ink}>{ghost ? '♛' : courtRank(value)}</text>
    <path d="M18 47h8m8 0h8m-12-3 2 3-2 3-2-3Z" stroke={ink} fill={ink} strokeWidth=".6" opacity=".7"/>
  </svg>;
}
const orientations: Record<number, [number, number]> = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
export function PokerDie({ value, held, disabled, rolling, rollId, onHold, index }: { value: number; held: boolean; disabled: boolean; rolling: boolean; rollId: number; onHold: () => void; index: number }) {
  const [x, y] = orientations[value] ?? orientations[1]!, tumbling = rolling && !held;
  const style = { '--fd-x': `${x}deg`, '--fd-y': `${y}deg`, '--fd-roll-delay': `${index * 18}ms`, '--fd-die-body': held ? '#e4bd63' : '#d8c9a5' } as CSSProperties;
  return <button type="button" className="fd-die cc-die" style={style} data-held={held} data-rolling={tumbling} disabled={disabled} aria-pressed={held} aria-label={`Die ${index + 1}: ${value ? courtRank(value) : 'not rolled'}${held ? ', held' : ''}`} onClick={onHold}>
    <div className="fd-die-visual" aria-hidden="true"><div className="fd-die-cube" key={tumbling ? `roll-${rollId}` : 'settled'}>{[1, 2, 3, 4, 5, 6].map(face => <div key={face} className="fd-cube-face" data-face={face}><PokerDieFace value={face} ghost={!value} held={held}/></div>)}</div></div>
    <span className="fd-hold-label">{held ? '✓ HELD' : value ? 'HOLD' : 'READY'}</span>
  </button>;
}
