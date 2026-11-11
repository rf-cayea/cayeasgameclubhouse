import { useId, type CSSProperties } from 'react';
import type { GemEffect, GemsFrame, GemSpecial } from '@/lib/gems-engine';
import { GEM_COMBINATIONS, type GemCombination } from '@/lib/gems-combos';
import { GEM_COLORS } from '@/lib/gems-levels';

const point = (i: number) => ({ x: (i % 8) * 100 + 50, y: Math.floor(i / 8) * 100 + 50 });
const star = 'M0-9L2.5-2.5L9 0L2.5 2.5L0 9L-2.5 2.5L-9 0L-2.5-2.5Z';
const curve = (a: number, b: number, bend = 100) => {
  const from = point(a), to = point(b);
  return `M${from.x} ${from.y}Q${(from.x + to.x) / 2} ${Math.max(18, (from.y + to.y) / 2 - bend)} ${to.x} ${to.y}`;
};
const vars = (value: Record<string, string | number>) => value as CSSProperties;

export { gemsFrameDuration } from '@/lib/gems-presentation';

function Particles({ seed, count, color, distance = 110 }: { seed: number; count: number; color: string; distance?: number }) {
  return <g color={color}>{Array.from({ length: count }, (_, i) => {
    const angle = (i * 360 / count + seed * 37) * Math.PI / 180;
    return <path key={i} className="gem-fx-particle" d={star} fill="currentColor" style={vars({ '--fx-dx': `${Math.cos(angle) * distance}px`, '--fx-dy': `${Math.sin(angle) * distance}px`, '--fx-turn': `${i % 2 ? 100 : -90}deg` })}/>;
  })}</g>;
}

function Beam({ origin, column = false, hammer = false }: { origin: number; column?: boolean; hammer?: boolean }) {
  const { x, y } = point(origin);
  const paths = column ? [`M${x} ${y}V0`, `M${x} ${y}V800`] : [`M${x} ${y}H0`, `M${x} ${y}H800`];
  return <g className={`gem-fx-beam ${hammer ? 'gem-fx-beam-hammer' : ''}`} color={hammer ? '#ffd478' : column ? '#8cf5ff' : '#ffe89d'}>
    {paths.map(d => <g key={d}><path className="gem-fx-beam-glow" d={d} pathLength="1"/><path className="gem-fx-beam-core" d={d} pathLength="1"/></g>)}
    <g transform={`translate(${x} ${y})`}><circle className="gem-fx-ring" r="48"/><path className="gem-fx-source-star" d={star} fill="#fff8da"/></g>
  </g>;
}

function Lotus({ blessing, large, halo }: { blessing?: boolean; large?: boolean; halo: string }) {
  const radius = large ? 190 : 140;
  return <g color={blessing ? '#a8ffe2' : '#ffcf93'}>
    <circle className="gem-fx-aura" r={radius} fill={`url(#${halo})`}/>
    <circle className="gem-fx-ring" r={radius * .75}/>
    <g className="gem-fx-lotus">{Array.from({ length: blessing ? 12 : 8 }, (_, n) => <g key={n} transform={`rotate(${n * (blessing ? 30 : 45)})`}><path d={`M0 0C-${radius * .38} -${radius * .38} -${radius * .2} -${radius * .82} 0 -${radius}C${radius * .2} -${radius * .82} ${radius * .38} -${radius * .38} 0 0Z`} fill={blessing ? '#81edc180' : '#ff93b98c'} stroke="currentColor" strokeWidth="4"/></g>)}</g>
    <g className="gem-fx-lotus-heart"><circle r="24" fill="#fff8d9"/><path d={star} fill={blessing ? '#4bba9b' : '#eb8b7d'}/></g>
  </g>;
}

function Hammer() {
  return <g className="gem-fx-hammer">
    <path d="M1 0L45 72" stroke="#392d22" strokeWidth="17" strokeLinecap="round"/><path d="M1 0L45 72" stroke="#b8894a" strokeWidth="12" strokeLinecap="round"/><path d="M7 7L45 66" stroke="#ffe0a0" strokeWidth="2"/>
    <rect x="-41" y="-20" width="82" height="39" rx="8" fill="#be9149" stroke="#ffe8b2" strokeWidth="4"/><path d="M-29-17V15M29-17V15M-24-10H24" fill="none" stroke="#fff3ca" strokeWidth="3"/><path d={star} fill="#fff4c6"/>
  </g>;
}

function Lantern() {
  return <g className="gem-fx-lantern-glyph">
    <ellipse ry="35" rx="28" fill="#ffd57533"/><path d="M-17-15Q0-26 17-15L21 6L13 21H-13L-21 6Z" fill="#ffe6a2" stroke="#fff7d7" strokeWidth="2"/><path d="M-18-17H18M-13 22H13M0 22V36M-6 36H6" stroke="#e5b44f" strokeWidth="4"/><path d="M0-10Q12 4 0 13Q-12 4 0-10Z" fill="#f3ac45"/><path d="M0-4Q6 5 0 8Q-6 5 0-4Z" fill="#fffbe4"/>
  </g>;
}

function FreshBreeze({ reduced, duration }: { reduced: boolean; duration: number }) {
  return <g data-effect-wind="true" color="#b2ffe2">{[0, 1, 2, 3].map(n => {
    const y = 140 + n * 170, path = `M-70 ${y + 80}C180 ${y - 150} 390 ${y + 190} 860 ${y - 50}`;
    return <g key={n}><path className="gem-fx-wind" d={path} pathLength="1" fill="none" stroke="currentColor" strokeWidth={n % 2 ? 3 : 6}/><g className="gem-fx-leaf"><path d="M-20 0Q-4-25 23 0Q-4 19-20 0Z" fill="#b9f2c5" stroke="#fff1be" strokeWidth="2"/><path d="M-20 0H20" stroke="#3d886b"/>{!reduced && <animateMotion path={path} dur={`${duration}ms`} begin="0s" fill="freeze" rotate="auto"/>}</g></g>;
  })}</g>;
}

function FusionGlyph({ special }: { special: GemSpecial }) {
  return <g><circle r="34" fill="#163a32" fillOpacity=".9" stroke="currentColor" strokeWidth="3"/>
    {(special === 'row' || special === 'column') && <g transform={special === 'column' ? 'rotate(90)' : undefined}><path d="M-23-5H23M-23 5H23M-15-13L-28 0L-15 13M15-13L28 0L15 13" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>}
    {special === 'burst' && <g>{[0, 60, 120].map(angle => <ellipse key={angle} rx="9" ry="25" fill="none" stroke="currentColor" strokeWidth="3" transform={`rotate(${angle})`}/>)}<circle r="6" fill="#fff6d6"/></g>}
    {special === 'orb' && <><circle r="23" stroke="currentColor" strokeWidth="5" strokeDasharray="18 4" fill="none"/><path d="M0-22L6-6L22 0L6 6L0 22L-6 6L-22 0L-6-6Z" fill="#fff6da"/></>}
    {special === 'lantern' && <g transform="scale(.65)"><Lantern/></g>}
  </g>;
}

function Fusion({ combo }: { combo: GemCombination }) {
  const one = point(combo.a), two = point(combo.b), center = { x: (one.x + two.x) / 2, y: (one.y + two.y) / 2 }, theme = GEM_COMBINATIONS[combo.kind];
  return <g data-combo-kind={combo.kind} color={theme.color}>
    <path className="gem-fx-fusion-link" d={`M${one.x} ${one.y}L${two.x} ${two.y}`} stroke="currentColor" strokeWidth="12" strokeLinecap="round"/>
    {[one, two].map((at, n) => <g key={n} transform={`translate(${at.x} ${at.y})`}><g className="gem-fx-fusion-glyph" style={vars({ '--fusion-dx': `${center.x - at.x}px`, '--fusion-dy': `${center.y - at.y}px` })}><FusionGlyph special={combo.specials[n]!}/></g></g>)}
    <g transform={`translate(${center.x} ${center.y})`}><g className="gem-fx-fusion-sigil"><circle r="71" fill="#173c3220" stroke="currentColor" strokeWidth="4"/><circle r="89" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="8 13"/>{Array.from({ length: 8 }, (_, n) => <path key={n} d="M0-72L8-92L0-110L-8-92Z" fill="currentColor" transform={`rotate(${n * 45})`}/>)}<path d="M0-48L12-12L48 0L12 12L0 48L-12 12L-48 0L-12-12Z" fill="#fff7d6"/></g></g>
    <g className="gem-fx-fusion-title"><rect x="95" y="16" width="610" height="83" rx="22" fill="#14382f" fillOpacity=".94" stroke="currentColor" strokeWidth="2"/><text x="400" y="52" textAnchor="middle" fill="#fff4d6" fontFamily="Georgia,serif" fontSize="31">{theme.title}</text><text x="400" y="80" textAnchor="middle" fill="currentColor" fontFamily="sans-serif" fontSize="19" letterSpacing="1.5">COMBINED ABILITIES · 2-LAYER POWER</text></g>
  </g>;
}

/** The actual impact stays painted for the whole phase. Moving flourishes may
 * fade, be skipped by a browser, or be disabled without hiding the ability. */
function ActivationMark({ effect, links, rainbow }: { effect: GemEffect; links: number; rainbow: string }) {
  const at = point(effect.origin), column = effect.kind === 'column' || effect.kind === 'hammer-column';
  const line = effect.kind === 'row' || effect.kind === 'column' || effect.kind.startsWith('hammer');
  const lotus = effect.kind === 'burst' || effect.kind === 'blessing';
  const color = column ? '#a0f6ff' : effect.kind === 'orb' ? '#e7c9ff' : effect.kind === 'blessing' ? '#adffe1' : '#ffe3a0';
  const beam = column ? `M${at.x} 0V800` : `M0 ${at.y}H800`;
  return <g className="gem-fx-steady-impact" data-activation-mark={effect.kind} color={color} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    {line && <><path className="gem-fx-static-glow" d={beam}/><path d={beam} stroke="#fff8de" strokeWidth="6"/></>}
    {lotus && <g transform={`translate(${at.x} ${at.y})`}>
      {Array.from({ length: effect.kind === 'blessing' ? 12 : 8 }, (_, n) => <path key={n} d="M0 0C-43-38-30-99 0-122C30-99 43-38 0 0Z" transform={`rotate(${n * (effect.kind === 'blessing' ? 30 : 45)})`} fill={effect.kind === 'blessing' ? '#67e2be24' : '#ff94bf24'} strokeWidth="4"/>)}
      <circle r="22" fill="#fff2c9" strokeWidth="3"/>
    </g>}
    {(effect.kind === 'orb' || effect.kind === 'lantern') && <>
      {effect.targets.filter(target => target !== effect.origin).slice(0, links).map((target, n) => {
        const end = point(target), path = curve(effect.origin, target, effect.kind === 'lantern' ? 120 : 55 + n % 3 * 25);
        return <g key={target}><path d={path} stroke={effect.kind === 'orb' ? `url(#${rainbow})` : color} strokeWidth="5"/><circle cx={end.x} cy={end.y} r="31" stroke="#fff7df" strokeWidth="3"/></g>;
      })}
      <g transform={`translate(${at.x} ${at.y})`}>{effect.kind === 'lantern' ? <Lantern/> : <><circle r="43" strokeWidth="6"/><path d="M0-30L8-8L30 0L8 8L0 30L-8 8L-30 0L-8-8Z" fill="#fff4d8" strokeWidth="2"/></>}</g>
    </>}
    {(line || effect.kind === 'bloom') && <g transform={`translate(${at.x} ${at.y})`}><circle r={line ? 34 : 43} strokeWidth="3"/><path d={star} fill="#fff9e3" strokeWidth="2"/></g>}
    {effect.kind === 'shuffle' && [0, 1, 2, 3].map(n => <path key={n} d={`M-70 ${220 + n * 170}C180 ${-10 + n * 170} 390 ${330 + n * 170} 860 ${90 + n * 170}`} stroke="#bcffe2" strokeWidth="5" strokeDasharray="30 9"/>)}
  </g>;
}

/** A decorative SVG layer uses the engine's real activation origins and targets.
 * Particle/link budgets stay fixed even when an orb ignites a large chain. */
export function GemsEffects({ frame, duration = 600, reduced = false }: { frame: GemsFrame | null; duration?: number; reduced?: boolean }) {
  const id = `gem-fx-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!frame || (!frame.cells.length && !frame.effects?.length)) return null;
  const effects = (frame.effects ?? []).slice(0, 16), perEffect = Math.max(3, Math.min(12, Math.floor(48 / Math.max(1, effects.length))));
  const linkBudget = Math.max(3, Math.floor(64 / Math.max(1, effects.length)));
  return <svg data-reduced={reduced} data-effect-renderer="persistent-impact" className="gems-fx" viewBox="0 0 800 800" aria-hidden="true" focusable="false" style={vars({ '--gem-fx-duration': `${duration}ms`, '--fx-span': `${duration}ms` })} data-cascade={frame.cascade ?? 1}>
    <defs>
      <radialGradient id={`${id}-halo`}><stop stopColor="#fff9ce" stopOpacity=".8"/><stop offset=".25" stopColor="#ffdc82" stopOpacity=".3"/><stop offset="1" stopColor="#ffe9b5" stopOpacity="0"/></radialGradient>
      <linearGradient id={`${id}-rainbow`} x2="1" y2="1"><stop stopColor="#9ff5ff"/><stop offset=".4" stopColor="#e0b8ff"/><stop offset=".7" stopColor="#ffe5a2"/><stop offset="1" stopColor="#93f1cf"/></linearGradient>
    </defs>
    {effects.map((effect, index) => {
      const { x, y } = point(effect.origin), color = effect.color !== undefined && effect.color >= 0 ? GEM_COLORS[effect.color]?.color ?? '#ffe2a3' : '#ffe2a3';
      const delivered = effect.kind !== 'lantern' && effects.some(other => other.kind === 'lantern' && other.targets.includes(effect.origin));
      const delay = (frame.combo ? duration * .22 : 0) + (delivered ? duration * .35 : 0);
      return <g key={`${effect.kind}-${effect.origin}-${index}`} data-effect-kind={effect.kind} data-origin={effect.origin} style={vars({ '--fx-span': `${duration - delay}ms`, '--fx-delay': `${delay}ms` })}>
        <ActivationMark effect={effect} links={linkBudget} rainbow={`${id}-rainbow`}/>
        {effect.kind === 'shuffle' && <FreshBreeze reduced={reduced} duration={duration}/>}
        {(effect.kind === 'row' || effect.kind === 'column' || effect.kind.startsWith('hammer')) && <Beam origin={effect.origin} column={effect.kind === 'column' || effect.kind === 'hammer-column'} hammer={effect.kind.startsWith('hammer')}/>}
        <g transform={`translate(${x} ${y})`}>
          {(effect.kind === 'burst' || effect.kind === 'blessing') && <Lotus blessing={effect.kind === 'blessing'} large={effect.power === 2} halo={`${id}-halo`}/>}
          {effect.kind.startsWith('hammer') && <><path className="gem-fx-impact" d="M-66-26L-35-14L-49 20L-12 11L-8 51L15 17L52 39L39 2L72-13L34-23" fill="none" stroke="#fff5c4" strokeWidth="5"/><Hammer/></>}
          {effect.kind === 'orb' && <><circle className="gem-fx-aura" r={effect.power === 2 ? 420 : 150} fill={`url(#${id}-halo)`}/><circle className="gem-fx-orbit" r="49" fill="none" stroke={`url(#${id}-rainbow)`} strokeWidth="10" strokeDasharray="92 16"/><circle className="gem-fx-ring" r="65" stroke="#e6caff"/><path className="gem-fx-source-star" d="M0-32L8-8L32 0L8 8L0 32L-8 8L-32 0L-8-8Z" fill="#fff9e5"/></>}
          {effect.kind === 'bloom' && <><circle className="gem-fx-forge" r="50" stroke="#ffecac" strokeWidth="3" strokeDasharray="8 8" fill="none"/><circle className="gem-fx-ring" r="42" stroke="#fff1bd"/></>}
          {effect.kind !== 'shuffle' && <Particles seed={index + effect.origin} count={perEffect} color={effect.kind === 'orb' ? '#e6caff' : color} distance={effect.kind === 'bloom' ? 75 : 120}/>}
        </g>
        {(effect.kind === 'orb' || effect.kind === 'lantern') && effect.targets.filter(target => target !== effect.origin).slice(0, linkBudget).map((target, n) => {
          const at = point(target), path = curve(effect.origin, target, effect.kind === 'lantern' ? 120 : 55 + n % 3 * 25);
          return <g key={target} data-effect-target={target}>
            <path className={`gem-fx-trail ${effect.kind === 'orb' ? 'gem-fx-energy' : ''}`} d={path} pathLength="1" fill="none" stroke={effect.kind === 'orb' ? `url(#${id}-rainbow)` : '#ffe9a8'}/>
            <g transform={`translate(${at.x} ${at.y})`}><circle className="gem-fx-target-ring" r="29" fill="none" stroke={effect.kind === 'orb' ? '#eacbff' : '#ffe9a8'}/></g>
            {effect.kind === 'lantern' && !reduced && <g className="gem-fx-lantern-flight"><Lantern/><animateMotion path={path} dur={`${duration * .72}ms`} begin="0s" fill="freeze"/></g>}
          </g>;
        })}
      </g>;
    })}
    <g className="gem-fx-hit-particles" style={vars({ '--fx-span': `${duration * (frame.combo ? .6 : .74)}ms`, '--fx-delay': `${duration * (frame.combo ? .35 : .15)}ms` })}>{frame.cells.slice(0, 24).map((target, n) => {
      const at = point(target), cell = frame.board[target]!, obstacle = cell.crate || cell.frost || cell.chain;
      const color = cell.crate ? '#c7995a' : cell.frost ? '#c5f8ff' : cell.chain ? '#e2eadb' : GEM_COLORS[Math.max(0, cell.gem?.color ?? 0)]?.color ?? '#fff1be';
      return <g key={target} transform={`translate(${at.x} ${at.y})`} data-hit-material={cell.crate ? 'wood' : cell.frost ? 'ice' : cell.chain ? 'chain' : 'gem'}>{Array.from({ length: obstacle ? 4 : 2 }, (_, i) => {
        const angle = (n * 53 + i * 360 / (obstacle ? 4 : 2)) * Math.PI / 180;
        const style = vars({ '--fx-dx': `${Math.cos(angle) * 62}px`, '--fx-dy': `${Math.sin(angle) * 62 + 20}px`, '--fx-turn': `${i * 60 + 45}deg` });
        return cell.crate ? <rect key={i} className="gem-fx-particle" x="-9" y="-5" width="18" height="10" rx="2" fill={color} stroke="#ffe4b1" style={style}/> : cell.chain ? <rect key={i} className="gem-fx-particle" x="-5" y="-8" width="10" height="16" rx="5" fill="none" stroke={color} strokeWidth="3" style={style}/> : <path key={i} className="gem-fx-particle" d={cell.frost ? 'M0-10L7 0L0 10L-7 0Z' : star} fill={color} stroke="#fffbe7" strokeWidth="1" style={style}/>;
      })}</g>;
    })}</g>
    {frame.combo && <Fusion combo={frame.combo}/>}
  </svg>;
}
