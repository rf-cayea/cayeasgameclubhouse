import { useId } from 'react';
import { monasteryRestoration } from '@/lib/gems-levels';

/** Original layered illustration. Restored architecture is driven by cleared levels. */
export function MonasteryArtwork({ completed, compact = false }: { completed: number; compact?: boolean }) {
  const id = useId().replace(/:/g, ''), { stage, reopened } = monasteryRestoration(completed);
  const built = (n: number) => ({ className: 'monastery-piece', 'data-built': stage >= n });
  return <svg className={`monastery-art ${compact ? 'monastery-art-compact' : ''}`} viewBox="0 0 800 450" role="img" aria-label={reopened ? 'The restored Buddhist monastery, open with glowing halls, lanterns, gardens, a bridge, and a golden stupa' : `Buddhist monastery restoration, ${stage} of 10 projects complete`}>
    <defs>
      <linearGradient id={`${id}-sky`} x2="0" y2="1"><stop stopColor="#92b8ac"/><stop offset=".65" stopColor="#d0d4b8"/><stop offset="1" stopColor="#ece1bc"/></linearGradient>
      <linearGradient id={`${id}-pond`} x2=".6" y2="1"><stop stopColor="#6ea79a"/><stop offset="1" stopColor="#294f4c"/></linearGradient>
      <linearGradient id={`${id}-roof`} x2=".3" y2="1"><stop stopColor="#44695e"/><stop offset="1" stopColor="#1e3e39"/></linearGradient>
      <linearGradient id={`${id}-wall`} x2="0" y2="1"><stop stopColor="#e9cf9e"/><stop offset="1" stopColor="#a47c50"/></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#ffe7a5" stopOpacity=".8"/><stop offset="1" stopColor="#ffe7a5" stopOpacity="0"/></radialGradient>
      <pattern id={`${id}-tiles`} width="14" height="9" patternUnits="userSpaceOnUse"><path d="M0 0V9M0 8H14" stroke="#cfb877" strokeOpacity=".22" fill="none"/></pattern>
      <clipPath id={`${id}-clip`}><rect width="800" height="450" rx="18"/></clipPath>
    </defs>
    <g clipPath={`url(#${id}-clip)`}>
      <path fill={`url(#${id}-sky)`} d="M0 0H800V450H0Z"/>
      <circle cx="600" cy="87" r="46" fill="#fff3ca" opacity=".8"/>
      <g fill="#557e76" opacity=".2"><path d="M-40 257L82 72L170 176L278 48L412 208L530 72L681 240L764 101L850 246V450H-40Z"/><path d="M-40 267L108 151L205 228L346 112L453 247L583 159L698 253L805 173V450H-40Z"/></g>
      <path d="M-30 283Q125 226 259 273T527 268T830 265" fill="none" stroke="#e7e7cf" strokeWidth="19" opacity=".35"/>
      <path d="M0 333Q150 270 300 311Q495 262 800 319V450H0Z" fill="#587769"/>
      <path d="M0 379Q111 314 258 351Q407 300 586 335Q730 306 800 350V450H0Z" fill="#385a50"/>
      <path d="M238 355Q410 299 569 352L731 450H96Z" fill="#708475"/>
      <g {...built(1)}><path d="M289 331H528L604 402H211Z" fill="#b4af91"/><path d="M295 341H528M279 354H543M265 368H558M251 382H573M322 333L287 400M376 333L365 400M432 333L445 400M485 333L523 400" stroke="#787e6c" strokeWidth="1.5"/><path d="M342 405H473L500 450H308Z" fill="#c0b899"/><path d="M336 416H479M329 430H487" stroke="#818773" strokeWidth="2"/></g>
      <g {...built(6)}>
        <path d="M276 215H527V320H276Z" fill={`url(#${id}-wall)`} stroke="#826d4e" strokeWidth="2"/>
        <path d="M267 316H537V326H267Z" fill="#d8c198"/><path d="M260 325H545V332H260Z" fill="#819080"/>
        {[295, 335, 467, 507].map(x => <g key={x}><path d={`M${x} 222V316`} stroke="#704b36" strokeWidth="9"/><path d={`M${x - 2} 224V310`} stroke="#b48656" strokeWidth="2"/></g>)}
        {[313, 487].map(x => <g key={x}><rect x={x - 15} y="248" width="31" height="42" rx="14" fill="#314c40" stroke="#d7bd85" strokeWidth="3"/><path d={`M${x} 249V289M${x - 14} 268H${x + 14}`} stroke="#b79e70" strokeWidth="2"/></g>)}
        <path d="M368 316V258Q401 218 434 258V316Z" fill="#243f37" stroke="#c3a572" strokeWidth="4"/><path d="M401 242V315M372 272H430M372 297H430" stroke="#8a7252" strokeWidth="2"/>
      </g>
      <g {...built(7)}>
        <path d="M247 228Q278 215 294 189H510Q527 215 558 228Z" fill={`url(#${id}-roof)`} stroke="#ddc183" strokeWidth="3"/>
        <path d="M247 228Q278 215 294 189H510Q527 215 558 228Z" fill={`url(#${id}-tiles)`}/>
        <path d="M315 186V155H486V186" fill={`url(#${id}-wall)`} stroke="#816747" strokeWidth="2"/>
        <path d="M290 166Q322 153 343 122H459Q483 151 513 166Z" fill={`url(#${id}-roof)`} stroke="#e4c98c" strokeWidth="3"/>
        <path d="M290 166Q322 153 343 122H459Q483 151 513 166Z" fill={`url(#${id}-tiles)`}/>
        <path d="M352 132Q377 118 402 83Q426 117 451 132Z" fill="#36574b" stroke="#d9bd7e" strokeWidth="2"/>
        <path d="M401 85V64M393 72H410" stroke="#f4d796" strokeWidth="3"/><circle cx="401" cy="62" r="4" fill="#f0d39a"/>
        <g fill="#d6be8b"><path d="M244 226Q236 218 235 210L252 225ZM558 226Q565 218 566 210L550 225ZM288 163L278 148L300 161ZM513 163L524 148L503 161Z"/></g>
      </g>
      <g {...built(9)}><ellipse cx="401" cy="280" rx="60" ry="66" fill={`url(#${id}-glow)`}/><path d="M377 315V260Q401 233 425 260V315Z" fill="#efc16e" opacity=".8"/><path d="M401 244V315M378 271H424M378 294H424" stroke="#6e5e42" strokeWidth="2"/><circle cx="401" cy="275" r="10" fill="none" stroke="#fff0b8" strokeWidth="2"/><path d="M401 264V286M390 275H412M393 267L409 283M409 267L393 283" stroke="#fff0b8" strokeWidth="1"/></g>
      <g {...built(8)}><path d="M614 311H709V327H614Z" fill="#bda779"/><path d="M625 284H697V312H625Z" fill={`url(#${id}-wall)`}/><path d="M633 284Q627 253 661 230Q695 253 689 284Z" fill="#d6b86d" stroke="#f1dba2" strokeWidth="2"/><path d="M651 231L661 189L672 231Z" fill="#e5c77d"/>{[204, 213, 222].map(y => <path key={y} d={`M650 ${y}H673`} stroke="#ab8b4d" strokeWidth="3"/>)}<circle cx="661" cy="187" r="4" fill="#f7dfa0"/></g>
      <g {...built(5)}><path d="M119 282V334M212 282V334" stroke="#c5af83" strokeWidth="13"/><path d="M102 282Q126 269 135 252H196Q208 271 231 282Z" fill={`url(#${id}-roof)`} stroke="#d5be86" strokeWidth="3"/><path d="M118 292H213" stroke="#d1b47f" strokeWidth="7"/><path d="M135 298V330M196 298V330" stroke="#74543c" strokeWidth="4"/></g>
      <g {...built(2)}>
        {[{ x: 99, y: 317, s: 1 }, { x: 728, y: 316, s: 1.15 }, { x: 249, y: 315, s: .65 }].map(({ x, y, s }) => <g key={x} transform={`translate(${x} ${y}) scale(${s})`}><path d="M0 10L-6-39M-3-14L-28-44M-3-23L16-60" stroke="#624f3b" strokeWidth="7" fill="none"/><g fill="#426c50" stroke="#88a36d" strokeWidth="1"><ellipse cx="-14" cy="-50" rx="35" ry="27"/><ellipse cx="14" cy="-68" rx="27" ry="24"/><ellipse cx="-34" cy="-40" rx="26" ry="19"/><ellipse cx="20" cy="-39" rx="29" ry="22"/></g><path d="M-26-53L-6-42L11-61M-8-39V5" fill="none" stroke="#9a9f66" strokeWidth="2"/></g>)}
        <g fill="#88a47b">{[31, 66, 227, 571, 750, 778].map((x, i) => <ellipse key={x} cx={x} cy={344 + i % 2 * 15} rx="22" ry="10"/>)}</g>
      </g>
      <g {...built(4)}><path d="M0 392Q88 347 171 389Q222 426 274 450H0ZM524 451Q594 372 692 368Q756 361 800 391V450Z" fill={`url(#${id}-pond)`}/><path d="M543 419Q644 346 755 395" fill="none" stroke="#ac9b73" strokeWidth="17"/><path d="M542 412Q644 334 758 387" fill="none" stroke="#dbc89c" strokeWidth="4"/><path d="M559 411V392M594 390V371M632 380V360M671 377V357M710 382V363M742 390V373" stroke="#d2b98a" strokeWidth="4"/><g stroke="#acd0ad" strokeWidth="1" opacity=".5"><path d="M20 413H105M72 432H175M667 427H763M594 441H680"/></g></g>
      <g {...built(3)}>{[183, 244, 551, 600].map((x, i) => <g key={x} transform={`translate(${x} ${346 + i % 2 * 20})`}><path d="M0 4V-42" stroke="#736344" strokeWidth="3"/><ellipse cx="0" cy="-37" rx="23" ry="25" fill={`url(#${id}-glow)`}/><path d="M-7-48H7L12-36L7-23H-7L-12-36Z" fill="#f0cc81" stroke="#aa7c45" strokeWidth="2"/><path d="M-7-49H7M-5-21H5M0-21V-14" stroke="#694e34" strokeWidth="3"/></g>)}</g>
      <g {...built(1)}>{[{ x: 76, y: 397 }, { x: 156, y: 426 }, { x: 703, y: 414 }].map(({ x, y }) => <g key={x} transform={`translate(${x} ${y})`}><ellipse cy="5" rx="19" ry="5" fill="#92ad86"/><path d="M0 5Q-24-3-17-13Q-2-15 0 5ZM0 5Q24-3 17-13Q2-15 0 5ZM0 5Q-11-14 0-23Q11-14 0 5Z" fill="#dfb3ac" stroke="#f6d7ba" strokeWidth="1"/></g>)}</g>
      {stage < 6 && <g fill="#a0a48d" stroke="#4d6557" strokeWidth="2"><path d="M295 311V271L320 265L320 291L351 288V312ZM445 311V284L471 275L475 297L509 292V311Z"/><path d="M347 316L364 303L378 316ZM413 315L430 299L444 315Z"/></g>}
      <g {...built(10)}><path d="M342 268V315M461 268V315" stroke="#e2c285" strokeWidth="2"/><path d="M343 267H358V300L351 294L343 300ZM446 267H461V300L454 294L446 300Z" fill="#d9a667"/><path d="M160 298L149 332M174 298L185 332" stroke="#e4ce97" strokeWidth="2"/><g fill="#fff0b9">{[[276, 125], [543, 132], [205, 216], [611, 161], [340, 58], [463, 54]].map(([x, y]) => <path key={x} d={`M${x} ${y! - 4}L${x! + 2} ${y}L${x} ${y! + 4}L${x! - 2} ${y}Z`}/>)}</g></g>
      <path d="M0 440Q139 415 233 450M800 439Q744 413 711 450" fill="none" stroke="#213f36" strokeWidth="22"/>
    </g>
  </svg>;
}
