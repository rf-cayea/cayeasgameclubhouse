import { DiceFinishArtwork } from './DiceFinishArtwork';
import { createContext,useContext,useId } from 'react';
import { CLASSIC_DOMINO_SKIN,DOMINO_NUMBER_COLORS,type DominoSkin } from '@/lib/dominoes-skins';
import { SpecialPipArtwork } from './SpecialPipArtwork';
export const DominoSkinTheme=createContext<DominoSkin>(CLASSIC_DOMINO_SKIN);
import { layoutDominoes,type DominoLayout } from '@/lib/dominoes-layout';
import { dominoPips, type DominoId, type PlacedDomino } from '@/lib/dominoes';
const dots:Record<number,[number,number][]>={0:[],1:[[24,24]],2:[[12,12],[36,36]],3:[[12,12],[24,24],[36,36]],4:[[12,12],[36,12],[12,36],[36,36]],5:[[12,12],[36,12],[24,24],[12,36],[36,36]],6:[[12,10],[36,10],[12,24],[36,24],[12,38],[36,38]]};
export function DominoFace({id,vertical=false,flip=false,design}:{id:DominoId;vertical?:boolean;flip?:boolean;design?:DominoSkin}) {
  const inherited=useContext(DominoSkinTheme),theme=design??inherited,gradient=useId();const pipSize=theme.symbol==='starfish'?13:11.4;const[a,b]=dominoPips(id);
  return <svg viewBox={vertical?'0 0 52 104':'0 0 104 52'} aria-hidden="true" data-domino-face={id} data-domino-skin={theme.id} data-first-pips={flip?b:a} data-second-pips={flip?a:b}>
    <defs><linearGradient id={gradient} x2=".6" y2="1"><stop stopColor={theme.light}/><stop offset=".6" stopColor={theme.face}/><stop offset="1" stopColor={theme.shade??theme.edge}/></linearGradient></defs>
    <g data-domino-orientation={vertical?'vertical':'horizontal'} transform={vertical?undefined:'translate(0 52) rotate(-90)'}><g data-domino-print="fixed" transform={flip?'translate(52 104) rotate(180)':undefined}>
    <rect x="1" y="1" width="50" height="102" rx="7" fill={`url(#${gradient})`} stroke={theme.edge} strokeWidth="1.5"/><rect x="4" y="4" width="44" height="96" rx="4" fill="none" stroke={theme.light} strokeWidth=".7"/>
    <path d="M6 52h40" stroke={theme.edge}/>
    {[a,b].map((value,half)=><g key={half} transform={`translate(2 ${half*52+2})`} data-domino-value={value}>
      {theme.collection&&theme.motif&&theme.accent&&<g transform="scale(.8)"><DiceFinishArtwork id={`${gradient}-${half}`} design={{...theme,collection:theme.collection,motif:theme.motif,accent:theme.accent,symbol:'dot',description:theme.description??''}}/></g>}
      {theme.symbol==='number'?<><text x="24" y="26" textAnchor="middle" dominantBaseline="central" fill={DOMINO_NUMBER_COLORS[value]} fontFamily="Arial,system-ui,sans-serif" fontSize="36" fontWeight="800" data-domino-numeral={value}>{value}</text>{value===6&&<path d="M16 43h16" stroke={DOMINO_NUMBER_COLORS[value]} strokeWidth="1.5"/>}</>:dots[value]!.map(([x,y],i)=>theme.symbol==='dot'?<g key={i}>{theme.collection&&<circle cx={x} cy={y} r="5.7" fill={parseInt(theme.pip.slice(1,3),16)+parseInt(theme.pip.slice(3,5),16)+parseInt(theme.pip.slice(5,7),16)>500?'#30283b':'#fff1d2'}/>}<circle cx={x} cy={y+.5} r="4.8" fill={theme.edge}/><circle cx={x} cy={y} r="4.3" fill={theme.pip}/><circle cx={x-1} cy={y-1} r="1.25" fill={theme.light} opacity=".4"/></g>:<g key={i} data-domino-symbol={theme.symbol === 'number' ? 'sun' : theme.symbol} transform={`translate(${x-pipSize/2} ${y-pipSize/2}) scale(${pipSize/24})`}><SpecialPipArtwork symbol={theme.symbol === 'number' ? 'sun' : theme.symbol} ink={theme.pip}/></g>)}
    </g>)}
    </g></g>
  </svg>;
}
export function DominoBoard({board,lastPlayed,layout=layoutDominoes(board)}:{board:PlacedDomino[];lastPlayed?:DominoId;layout?:DominoLayout}) {
  return <svg className="dm-board" viewBox={`${layout.x} ${layout.y} ${layout.width} ${layout.height}`} role="img" aria-label={board.length?`Connected domino table, ${board.length} tiles. ${layout.ends.map(end=>`${end.end} end ${end.pips}`).join(', ')}.`:'Empty domino table'}>
    {layout.tiles.map(({tile,x,y,angle})=><g key={tile.id} data-domino-tile={tile.id} data-physical-angle={angle%360} data-double={tile.a===tile.b} data-spinner={Boolean(tile.spinner)} transform={`translate(${x} ${y}) rotate(${angle})`} className={tile.id===lastPlayed?'dm-board-last':''}>
      <svg x="-50" y="-25" width="100" height="50"><DominoFace id={tile.id} flip={tile.a!==dominoPips(tile.id)[0]}/></svg>
    </g>)}
    {layout.ends.map(end=><g key={end.end} className="dm-end-marker" transform={`translate(${end.x} ${end.y})`}><circle r="22" fill="#153b2d" stroke="#d3be7a" strokeWidth="2" strokeDasharray="3 3"/><text textAnchor="middle" y="6" fill="#f4df9e" fontSize="19">{end.pips}</text><text textAnchor="middle" y="37" fill="#bcd0ae" fontSize="12">{end.end==='up'?'UP':end.end==='down'?'DOWN':end.end.toUpperCase()}</text></g>)}
    {!board.length&&<><text y="-5" textAnchor="middle" fill="#e3ce97" fontFamily="Georgia,serif" fontSize="21">Play the highlighted opening tile.</text><text y="22" textAnchor="middle" fill="#98b79e" fontSize="12">Drag the highlighted tile onto the table.</text></>}
  </svg>;
}
