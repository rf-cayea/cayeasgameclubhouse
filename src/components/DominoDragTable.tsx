import { dominoDropEnd } from '@/lib/dominoes-drop';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, DragOverlay, PointerSensor, MeasuringStrategy, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection } from '@dnd-kit/core';
import type { DominoLayout } from '@/lib/dominoes-layout';
import { dominoLabel, type DominoEnd, type DominoId, type DominoMove } from '@/lib/dominoes';
import type { DominoRoomView } from '@/lib/dominoes-protocol';
import { DominoFace } from './DominoArtwork';

const DragTile = createContext<DominoId|null>(null);
const dominoCollision:CollisionDetection=({pointerCoordinates,droppableContainers,droppableRects})=>{
 if(!pointerCoordinates)return [];
 const ends=droppableContainers.flatMap(item=>{
  const rect=droppableRects.get(item.id);return item.data.current?.dominoEnd&&rect?[{end:item.id as DominoEnd,rect}]:[];
 });
 const board=droppableContainers.find(item=>item.data.current?.dominoBoard),end=dominoDropEnd(pointerCoordinates,board?droppableRects.get(board.id):undefined,ends);
 return end?[{id:end}]:[];
};

export function DominoDragTable({room,enabled,dragKey,onMove,onNotice,children}:{room:DominoRoomView|null;enabled:boolean;dragKey:string;onMove:(move:DominoMove)=>Promise<void>;onNotice:(message:string)=>void;children:ReactNode}) {
  const [tile,setTile]=useState<DominoId|null>(null),started=useRef<string|null>(null),sending=useRef(false);
  const latest=useRef({room,enabled,dragKey,onMove,onNotice});latest.current={room,enabled,dragKey,onMove,onNotice};
  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}));
  return <DragTile.Provider value={tile}><DndContext sensors={sensors} collisionDetection={dominoCollision} autoScroll={false} measuring={{droppable:{strategy:MeasuringStrategy.Always}}}
    accessibility={{screenReaderInstructions:{draggable:'Drag a playable domino to a matching board end. You can also tap a tile and use the Play left or Play right buttons.'},announcements:{
      onDragStart:({active})=>`${dominoLabel(active.id as DominoId)} picked up. Drag to a matching board end.`,
      onDragOver:({over})=>over?`Over ${over.id} board end.`:'Outside the board. Release to cancel.',
      onDragEnd:({over})=>over?`Released over the ${over.id} board end.`:'Drag canceled. Your tile stays in your hand.',
      onDragCancel:()=> 'Drag canceled. Your tile stays in your hand.',
    }}}
    onDragStart={({active})=>{started.current=latest.current.dragKey;setTile(active.id as DominoId);}}
    onDragCancel={()=>{started.current=null;setTile(null);}}
    onDragEnd={({active,over})=>{
      const key=started.current;started.current=null;setTile(null);
      const current=latest.current,view=current.room,id=active.id as DominoId,end=over?.id;
      if(!over)return;
      if(key!==current.dragKey||!current.enabled||sending.current||!view?.hand.includes(id)) {current.onNotice('The table changed. Pick up your tile again.');return;}
      if((end!=='left'&&end!=='right'&&end!=='up'&&end!=='down')||!view.legal.some(option=>option.tile===id&&option.end===end)){current.onNotice('That end does not match. Use a highlighted board end.');return;}
      sending.current=true;void current.onMove({t:'play',tile:id,end}).finally(()=>{sending.current=false;});
    }}>
    {children}
    {createPortal(<DragOverlay dropAnimation={null}>{tile&&<div className="dm-drag-ghost"><DominoFace id={tile}/></div>}</DragOverlay>,document.body)}
  </DndContext></DragTile.Provider>;
}
export function DominoHandTile({tile,playable,enabled,selected,onSelect}:{tile:DominoId;playable:boolean;enabled:boolean;selected:boolean;onSelect:()=>void}) {
  const {setNodeRef,listeners,attributes,isDragging}=useDraggable({id:tile,disabled:!enabled||!playable});
  return <button ref={setNodeRef} {...attributes} {...listeners} aria-label={`${dominoLabel(tile)} domino${playable?', playable':''}`} aria-pressed={selected} data-tile={tile} data-playable={playable} data-selected={selected} data-dragging={isDragging} disabled={!enabled||!playable} onClick={onSelect}><DominoFace id={tile} vertical/></button>;
}
export function DominoDropTargets({room,enabled,layout,width,height}:{room:DominoRoomView;enabled:boolean;layout:DominoLayout;width:number;height:number}) {
  const {setNodeRef}=useDroppable({id:'domino-board',disabled:!enabled,data:{dominoBoard:true}});
  const scale=Math.min(width/layout.width,height/layout.height),offsetX=(width-layout.width*scale)/2,offsetY=(height-layout.height*scale)/2;
  const ends=room.board.length?layout.ends:[{end:'right' as const,x:0,y:0,pips:0}];
  return <div ref={setNodeRef} className="dm-drop-targets" data-empty={!room.board.length}>{ends.map(end=><DominoDropEnd key={end.end} end={end.end} pips={end.pips} room={room} enabled={enabled} x={offsetX+(end.x-layout.x)*scale} y={offsetY+(end.y-layout.y)*scale}/>)}</div>;
}
function DominoDropEnd({end,pips,room,enabled,x,y}:{end:DominoEnd;pips:number;room:DominoRoomView;enabled:boolean;x:number;y:number}) {
  const tile=useContext(DragTile),option=room.legal.find(o=>o.tile===tile&&o.end===end),{setNodeRef,isOver}=useDroppable({id:end,disabled:!enabled,data:{dominoEnd:true}});
  return <div ref={setNodeRef} className="dm-drop-end" style={{left:x-(room.board.length?28:70),top:y-(room.board.length?28:45)}} data-domino-drop={end} data-active={Boolean(tile&&enabled)} data-allowed={Boolean(option)} data-over={isOver} aria-hidden="true"><span>{!option?'No match':room.board.length?`${end} ${pips}`:'Open here'}{option?.points?` +${option.points}`:''}</span></div>;
}
