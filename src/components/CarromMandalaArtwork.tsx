import {useId} from 'react';
/** A cropped original illustration, never tiled over neighbouring atlas cells. */
export function CarromMandalaArtwork({art,x,y,size,opacity=1}:{art:number;x:number;y:number;size:number;opacity?:number}) {
 const id=useId(),column=art%3,row=Math.floor(art/3);
 return <svg x={x} y={y} width={size} height={size} viewBox={`${column*512} ${row*512} 512 512`} overflow="hidden" pointerEvents="none" opacity={opacity} data-mandala-art={art}>
  <defs><clipPath id={id}><circle cx={column*512+256} cy={row*512+256} r="250"/></clipPath></defs>
  <image href="/carrom-art/mandala-atlas.avif" width="1536" height="1024" preserveAspectRatio="none" clipPath={`url(#${id})`}/>
 </svg>;
}
