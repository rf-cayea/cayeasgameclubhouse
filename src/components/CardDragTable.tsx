import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, closestCenter, pointerWithin,
  useDndContext, useDroppable, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CardKeyboardSensor } from '@/lib/card-keyboard-sensor';
import { cardLabel } from '@/lib/hand-order';
import { dragSelection } from '@/lib/card-drag';
import type { Card } from '@/lib/rummy';
import { CardArtwork } from './CardArtwork';

const TableContext = createContext<{ cards: Card[] } | null>(null);
export const useCardDragTable = () => useContext(TableContext);
type Accepts = (card: Card, cards: Card[]) => boolean;

// A pointer must actually enter a table target. Empty space never means "play".
// In a fitted fan, the rightmost overlapping card owns its exposed rank corner.
const cardCollision: CollisionDetection = args => {
  const hand = args.droppableContainers.filter(item => item.data.current?.sortable);
  if (!args.pointerCoordinates) return closestCenter({ ...args, droppableContainers: hand });
  const targets = args.droppableContainers.filter(item => item.data.current?.cardTarget);
  const targetHits = pointerWithin({ ...args, droppableContainers: targets });
  if (targetHits.length) return targetHits;
  const { x, y } = args.pointerCoordinates;
  const hits = hand.map(container => ({ container, rect: args.droppableRects.get(container.id) }))
    .filter(item => item.rect && x >= item.rect.left && x <= item.rect.right && y >= item.rect.top && y <= item.rect.bottom)
    .sort((a, b) => b.rect!.left - a.rect!.left);
  const hit = hits[0];
  return hit ? [{ id: hit.container.id, data: { droppableContainer: hit.container, value: 1 } }] : [];
};

export function CardDragTable({ children, cards, selected = [], dragKey, fit = false, renderCard,
  onDrop, onRejected,
}: {
  children: ReactNode; cards: Card[]; selected?: Card[]; dragKey: string; fit?: boolean;
  renderCard?: (card: Card) => ReactNode;
  onDrop?: (target: string, card: Card, cards: Card[]) => Promise<boolean> | boolean;
  onRejected?: (message: string) => void;
}) {
  const [active, setActive] = useState<Card | null>(null), [batch, setBatch] = useState<Card[]>([]);
  const started = useRef<{ key: string; cards: Card[] } | null>(null), sending = useRef(false);
  const current = useRef({ cards, selected, dragKey, onDrop, onRejected });
  current.current = { cards, selected, dragKey, onDrop, onRejected };
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(CardKeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior: 'auto' }),
  );
  useEffect(() => {
    if (!active) return;
    document.body.classList.add('card-table-dragging');
    return () => document.body.classList.remove('card-table-dragging');
  }, [active]);
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${cardLabel(String(active.id))} picked up. Position ${(active.data.current?.sortable?.index ?? 0) + 1} of ${current.current.cards.length}.`,
    onDragOver: ({ active, over }) => over?.data.current?.cardTarget
      ? `${cardLabel(String(active.id))} over ${over.data.current.label}.`
      : over ? `${cardLabel(String(active.id))} over position ${(over.data.current?.sortable?.index ?? 0) + 1} of ${current.current.cards.length}.`
      : 'Outside the hand. Use a highlighted target or return to the hand.',
    onDragEnd: ({ active, over }) => over?.data.current?.cardTarget
      ? `Released over ${over.data.current.label}.`
      : over ? `${cardLabel(String(active.id))} dropped at position ${(over.data.current?.sortable?.index ?? 0) + 1} of ${current.current.cards.length}.`
      : 'Reordering canceled. No cards moved.',
    onDragCancel: () => 'Reordering canceled. No cards moved.',
  };
  async function finish({ active, over }: DragEndEvent) {
    const start = started.current;
    started.current = null; setActive(null); setBatch([]);
    if (!over?.data.current?.cardTarget) return;
    const card = String(active.id), latest = current.current;
    if (!start || start.key !== latest.dragKey || sending.current || !latest.cards.includes(card) ||
      start.cards.some(value => !latest.cards.includes(value))) {
      latest.onRejected?.('The table changed. Pick up the card again.'); return;
    }
    const accepts = over.data.current.accepts as Accepts;
    if (!accepts(card, start.cards)) { latest.onRejected?.('That move is not available. Use a highlighted drop target.'); return; }
    sending.current = true;
    try { await latest.onDrop?.(String(over.id), card, start.cards); }
    catch { latest.onRejected?.('The move could not be completed. Check the connection and try again.'); }
    finally { sending.current = false; }
  }
  return <TableContext.Provider value={{ cards: batch }}><DndContext sensors={sensors} collisionDetection={cardCollision} autoScroll={!fit}
    accessibility={{ announcements, screenReaderInstructions: { draggable: 'Press Space to pick up a card. Use Left or Right to rearrange, Space to drop, or Escape to cancel. Table moves also have buttons.' } }}
    onDragStart={({ active }) => {
      const currentBatch = dragSelection(String(active.id), current.current.selected, current.current.cards);
      started.current = { key: current.current.dragKey, cards: currentBatch };
      setActive(String(active.id)); setBatch(currentBatch);
    }} onDragEnd={event => { void finish(event); }} onDragCancel={() => { started.current = null; setActive(null); setBatch([]); }}>
    {children}
    {createPortal(<DragOverlay dropAnimation={null} className="card-drag-overlay">{active && <div className="card-drag-art" aria-hidden="true">{renderCard ? renderCard(active) : <CardArtwork card={active}/>}{batch.length > 1 && <span className="card-drag-count">{batch.length} selected</span>}</div>}</DragOverlay>, document.body)}
  </DndContext></TableContext.Provider>;
}

export function CardDropZone({ id, label, children, className = '', accepts }: {
  id: string; label: string; children: ReactNode; className?: string; accepts: Accepts;
}) {
  const table = useCardDragTable(), { active } = useDndContext();
  const { setNodeRef, isOver } = useDroppable({ id, data: { cardTarget: true, label, accepts } });
  const card = active ? String(active.id) : null;
  const allowed = card !== null && accepts(card, table?.cards ?? [card]);
  return <div ref={setNodeRef} className={`card-drop-zone ${className}`} data-card-drop={id} data-drag-state={card ? allowed ? isOver ? 'over' : 'ready' : isOver ? 'blocked' : 'inactive' : undefined}>
    {children}<span className="card-drop-label" aria-hidden="true">{isOver && !allowed ? 'Cannot play here' : label}</span>
  </div>;
}
