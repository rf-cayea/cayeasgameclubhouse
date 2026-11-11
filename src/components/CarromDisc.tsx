import {DiceFinishArtwork} from './DiceFinishArtwork';
import {useId} from 'react';
import type {DiscKind} from '@/lib/carrom';
import {CLASSIC_CARROM_PUCKS,CLASSIC_CARROM_STRIKER} from '@/lib/carrom-sets';

type Props = {
  kind: DiscKind;
  radius: number;
  pucks?: typeof CLASSIC_CARROM_PUCKS;
  striker?: typeof CLASSIC_CARROM_STRIKER;
};
const engravings: Record<string,string> = {
  star: 'M0-13 4-4 13 0 4 4 0 13-4 4-13 0-4-4Z',
  diamond: 'M0-13 10 0 0 13-10 0Z M0-7 5 0 0 7-5 0Z',
  rings: 'M-11 0a11 11 0 1 0 22 0 11 11 0 1 0-22 0M-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0',
  flower: 'M0 0C-16-4-9-14 0 0C4-16 14-9 0 0C16 4 9 14 0 0C-4 16-14 9 0 0Z',
  compass: 'M0-14 3-3 14 0 3 3 0 14-3 3-14 0-3-3Z M-8-8 8 8M8-8-8 8',
};

export function CarromDisc({kind,radius,pucks=CLASSIC_CARROM_PUCKS,striker=CLASSIC_CARROM_STRIKER}:Props) {
  const id=useId();
  const [light,face,edge,ring]=kind==='striker'?[striker.light,striker.face,striker.edge,striker.accent]:
    kind==='white'?[pucks.light,pucks.white,pucks.rim,'#624832']:
    kind==='black'?[pucks.darkLight,pucks.dark,'#11191b','#fff3d5']:
    ['#ffba8c','#c33d42','#75182e','#ffe9b0'];
  const finish=kind==='white'||kind==='black'?pucks.finish:undefined;
  return <>
    <defs><radialGradient id={id} cx=".32" cy=".25"><stop stopColor={light}/><stop offset=".58" stopColor={face}/><stop offset="1" stopColor={edge}/></radialGradient></defs>
    <ellipse cy="4" rx={radius+1} ry={radius} fill="#161a1866"/>
    <circle r={radius} fill={`url(#${id})`} stroke={kind==='striker'?ring:edge} strokeWidth="2"/>
    {finish&&<>
      <defs><clipPath id={`${id}-puck`}><circle r={radius-2}/></clipPath></defs>
      <g clipPath={`url(#${id}-puck)`} opacity={kind==='white'?.25:.32}>
        <g transform={`translate(${-radius} ${-radius}) scale(${radius/30})`}>
          <DiceFinishArtwork design={finish} id={`${id}-finish`}/>
        </g>
      </g>
    </>}
    {(kind==='white'||kind==='black')&&pucks.accent&&<circle r={radius-2.5} fill="none" stroke={pucks.accent} strokeWidth="1.25"/>}
    <circle r={radius-5} fill="none" stroke={ring} strokeOpacity=".63" strokeWidth="1.5"/>
    {kind==='queen'&&<path d="m-9-3 5 3 4-7 4 7 5-3-2 10H-7Z" fill={ring}/>}
    {kind==='striker'&&<path d={engravings[striker.engraving]} fill="none" stroke={ring} strokeWidth="1.8" strokeLinejoin="round"/>}
  </>;
}
