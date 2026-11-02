import { useId } from 'react';
import type { Gem, GemSpecial } from '@/lib/gems-engine';
import { GEM_COLORS, type Booster } from '@/lib/gems-levels';

export const GEM_SPECIAL_NAMES: Record<GemSpecial, string> = { row: 'horizontal line', column: 'vertical line', burst: 'lotus burst', orb: 'wisdom orb', lantern: 'guiding lantern' };
const SHAPES = [
  'M50 7C76 17 90 37 83 62C77 84 59 92 50 94C30 88 15 72 16 51C16 30 34 13 50 7Z',
  'M50 21C25-1 5 23 14 45L50 91L86 45C95 23 75-1 50 21Z',
  'M50 4L88 34L91 60L50 96L9 60L12 34Z',
  'M29 9H71L94 50L71 91H29L6 50Z',
  'M50 5L65 22L86 16L83 41L98 54L76 66L72 89L50 79L28 89L24 66L2 54L17 41L14 16L35 22Z',
  'M50 5C60 27 85 44 85 64A35 32 0 0 1 15 64C15 44 40 27 50 5Z',
];
export function GemArtwork({ gem, color }: { gem?: Gem | null; color?: number }) {
  const id = useId().replace(/:/g, ''), type = gem?.color ?? color ?? 0, orb = gem?.special === 'orb';
  const palette = GEM_COLORS[Math.max(0, type)] ?? GEM_COLORS[0];
  return <svg className={`gem-art ${orb ? 'gem-orb-art' : ''}`} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs><linearGradient id={`${id}-gem`} x1="0" y1="0" x2=".65" y2="1"><stop stopColor="#fff" stopOpacity=".95"/><stop offset=".25" stopColor={palette.color}/><stop offset="1" stopColor={palette.shade}/></linearGradient><linearGradient id={`${id}-rainbow`} x1="0" y1="0" x2="1" y2="1">{GEM_COLORS.map((c, i) => <stop key={c.name} offset={i / 5} stopColor={c.color}/>)}</linearGradient><clipPath id={`${id}-cut`}><path d={SHAPES[Math.max(0, type)] ?? SHAPES[0]}/></clipPath></defs>
    {orb ? <><circle cx="50" cy="50" r="41" fill={`url(#${id}-rainbow)`} stroke="#fff5de" strokeWidth="3"/><circle cx="50" cy="50" r="30" fill="#3a285f" stroke="#fff5de" strokeWidth="1.5"/><path d="M50 19L57 41L80 50L57 58L50 81L42 58L20 50L42 41Z" fill="#fff0c5"/><circle cx="50" cy="50" r="10" fill="#fff"/><path d="M24 29Q40 10 68 24" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".7"/></> : <>
      <path d={SHAPES[Math.max(0, type)] ?? SHAPES[0]} fill={`url(#${id}-gem)`} stroke={palette.color} strokeWidth="2"/>
      <g clipPath={`url(#${id}-cut)`}><path d="M-5-5L50 32L105-5ZM-5 105L32 60L50 32Z" fill="#fff" opacity=".2"/><path d="M105 105L65 61L50 32L105-5Z" fill="#121032" opacity=".18"/><path d="M50 32L32 60L50 81L68 60Z" fill={palette.color} stroke="#ffffff70" strokeWidth="1"/><path d="M50 32L14 20M50 32L85 20M32 60L4 62M68 60L96 62M50 81V100" fill="none" stroke="#fff" strokeOpacity=".38" strokeWidth="1.5"/><path d="M28 26L39 19" stroke="white" strokeWidth="4" strokeLinecap="round" opacity=".8"/></g>
      {(gem?.special === 'row' || gem?.special === 'column') && <g transform={gem.special === 'column' ? 'rotate(90 50 50)' : undefined}><path d="M18 48H82" stroke={palette.shade} strokeWidth="19" strokeLinecap="round"/><path d="M18 46H82M22 55H78" stroke="#fff9de" strokeWidth="5" strokeLinecap="round"/><path d="M25 34L12 47L25 61M75 34L88 47L75 61" fill="none" stroke="#fff9de" strokeWidth="4" strokeLinejoin="round"/></g>}
      {gem?.special === 'burst' && <><circle cx="50" cy="51" r="23" fill={palette.shade} stroke="#fff2c8" strokeWidth="2"/><path d="M50 30Q65 44 50 65Q35 44 50 30ZM28 43Q49 40 50 65Q32 63 28 43ZM72 43Q51 40 50 65Q68 63 72 43Z" fill="#fff0c4"/><circle cx="50" cy="57" r="5" fill={palette.color}/></>}
      {gem?.special === 'lantern' && <><path d="M34 30H66L73 48L66 67H34L27 48Z" fill="#fff1cb" stroke={palette.shade} strokeWidth="3"/><path d="M42 28H58M42 69H58M50 69V81M44 81H56" stroke="#fff1cb" strokeWidth="4"/><path d="M50 37Q65 54 50 60Q36 54 50 37Z" fill={palette.shade}/></>}
    </>}
  </svg>;
}
export function GemCrate({ layers }: { layers: number }) {
  return <svg className="gem-art" viewBox="0 0 100 100" aria-hidden="true"><rect x="8" y="8" width="84" height="84" rx="13" fill="#805c42" stroke="#d3a577" strokeWidth="3"/><path d="M13 33H87M13 66H87M33 13V87M66 13V87" stroke="#412b32" strokeWidth="3"/><path d="M14 18L82 86M82 18L14 86" stroke="#ca9a6c" strokeWidth="13"/><path d="M14 14H86V86H14Z" fill="none" stroke="#e4bc89" strokeWidth="4"/>{Array.from({ length: layers }, (_, i) => <circle key={i} cx={50 + (i - (layers - 1) / 2) * 16} cy="50" r="5" fill="#fff1c2" stroke="#654432" strokeWidth="2"/>)}</svg>;
}
export function GemsBoosterIcon({ kind }: { kind: Booster }) {
  return <svg className="gems-booster-art" viewBox="0 0 48 48" aria-hidden="true" focusable="false">{kind === 'row' || kind === 'column' ? <><g transform="rotate(-33 24 24)"><path d="M21 19H27V40Q24 43 21 40Z" fill="#876344" stroke="#b79962" strokeWidth="1.5"/><path d="M19 19H29V24H19Z" fill="#c1a56e"/><path d="M12 8Q24 4 36 8V18Q24 22 12 18Z" fill="#dbc184" stroke="#8f784c" strokeWidth="1.5"/><path d="M15 9V17M33 9V17M18 9H29" stroke="#fff0bc" strokeWidth="1.5"/></g>{kind === 'row' ? <path d="M8 40H22M8 40L11 37M8 40L11 43M22 40L19 37M22 40L19 43" stroke="#8a7549" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/> : <path d="M38 28V43M38 28L35 31M38 28L41 31M38 43L35 40M38 43L41 40" stroke="#8a7549" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/>}</> : kind === 'burst' ? <g fill="#b8a06b" stroke="#e9d49d" strokeWidth="1"><path d="M24 6Q40 23 24 39Q8 23 24 6Z"/><path d="M7 17Q27 17 24 39Q5 36 7 17ZM41 17Q21 17 24 39Q43 36 41 17Z"/><path d="M3 28Q16 22 24 39Q9 43 3 28ZM45 28Q32 22 24 39Q39 43 45 28Z"/><circle cx="24" cy="34" r="4" fill="#f8e4b2"/></g> : <g fill="none" stroke="#a18a55" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 16Q23 2 38 15L40 20M40 20L32 18M40 20L42 12M40 33Q25 47 10 34L8 29M8 29L16 31M8 29L6 37M15 24H34"/><path d="M35 24L30 20M35 24L30 28"/></g>}</svg>;
}
export function GemsWheel() {
  return <svg className="gems-wheel" viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor"><circle cx="24" cy="24" r="17" strokeWidth="1.6"/><circle cx="24" cy="24" r="13.5" strokeWidth=".7"/><circle cx="24" cy="24" r="4" strokeWidth="1.5"/>{Array.from({ length: 8 }, (_, i) => <g key={i} transform={`rotate(${i * 45} 24 24)`}><path d="M24 4V20" strokeWidth="1.5"/><circle cx="24" cy="3.5" r="1.5" fill="currentColor" stroke="none"/></g>)}</svg>;
}
export function GemsSanctuary() {
  return <svg className="gems-sanctuary" viewBox="0 0 420 240" aria-hidden="true"><defs><radialGradient id="gem-sanctuary-glow"><stop stopColor="#f5c998" stopOpacity=".28"/><stop offset="1" stopColor="#f5c998" stopOpacity="0"/></radialGradient></defs><circle cx="224" cy="100" r="110" fill="url(#gem-sanctuary-glow)"/><circle cx="260" cy="62" r="31" fill="#e6c8a8" opacity=".85"/><path d="M0 205L77 81L145 165L215 97L310 186L365 105L420 196V240H0Z" fill="#606d76" opacity=".25"/><path d="M0 224L96 139L177 200L290 137L420 227V240H0Z" fill="#668d87" opacity=".22"/><g fill="#212a37" stroke="#bca382" strokeWidth="1.2"><path d="M183 224V152H266V224ZM196 152V116H253V152ZM205 116V91H242V116"/><path d="M164 157Q190 151 194 141H255Q265 153 287 157ZM182 122Q204 114 205 105H242Q246 115 266 122ZM194 96Q214 88 222 65Q231 87 251 96Z"/><path d="M217 224V188Q225 179 233 188V224" fill="#f3c18a" opacity=".8"/></g><path d="M90 229Q154 192 224 232Q282 202 350 232" fill="none" stroke="#d1b391" opacity=".3"/><g fill="#b1bb9f" opacity=".7"><path d="M94 208Q83 182 102 160Q119 186 94 208ZM332 214Q318 185 337 165Q352 190 332 214Z"/></g><g fill="#f4d4aa"><circle cx="126" cy="94" r="2"/><circle cx="315" cy="109" r="2"/><circle cx="171" cy="57" r="1.5"/><circle cx="288" cy="178" r="2"/><circle cx="75" cy="146" r="1.5"/></g></svg>;
}
