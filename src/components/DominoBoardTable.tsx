import { useLayoutEffect,useMemo,useRef,useState } from 'react';
import type { DominoId } from '@/lib/dominoes';
import type { DominoRoomView } from '@/lib/dominoes-protocol';
import { layoutDominoes } from '@/lib/dominoes-layout';
import { DominoBoard } from './DominoArtwork';
import { DominoDropTargets } from './DominoDragTable';
export function DominoBoardTable({room,enabled,lastPlayed}:{room:DominoRoomView;enabled:boolean;lastPlayed?:DominoId}) {
 const element=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:400,height:400});
 useLayoutEffect(()=>{const node=element.current;if(!node)return;const observer=new ResizeObserver(()=>setSize({width:node.clientWidth,height:node.clientHeight}));observer.observe(node);setSize({width:node.clientWidth,height:node.clientHeight});return()=>observer.disconnect();},[]);
 const layout=useMemo(()=>layoutDominoes(room.board,size.width/Math.max(1,size.height)),[room.board,size.width,size.height]);
 return <div ref={element} className="dm-board-surface"><DominoBoard board={room.board} lastPlayed={lastPlayed} layout={layout}/><DominoDropTargets room={room} enabled={enabled} layout={layout} {...size}/></div>;
}
