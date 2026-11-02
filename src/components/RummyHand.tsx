import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor,
  closestCenter, pointerWithin, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Card } from '@/lib/rummy';
import { cardLabel, reorderHand } from '@/lib/hand-order';
import { CardArtwork } from './CardArtwork';
import { CardKeyboardSensor } from '@/lib/card-keyboard-sensor';

interface RummyHandProps {
  cards: Card[];
  onReorder: (cards: Card[]) => void;
  disabled?: boolean;
  selectedCards?: Card[];
  onToggleCard?: (card: Card) => void;
  renderCard?: (card: Card) => ReactNode;
  compact?: boolean;
}

const collisionDetection: CollisionDetection = args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);
function CardFace({ card }: { card: Card }) { return <CardArtwork card={card} />; }

const cardClasses = 'clubhouse-playing-card shrink-0';

function SortableCard({ card, index, count, selected, disabled, select, choose, selectable, renderCard }: {
  card: Card; index: number; count: number; selected: boolean; disabled: boolean; select: (card: Card) => void; choose: (card: Card) => void; selectable: boolean;
  renderCard?: (card: Card) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: card, disabled });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, touchAction: 'manipulation' };
  return <li data-card={card} className="shrink-0" aria-posinset={index + 1} aria-setsize={count}>
    <button ref={setNodeRef} type="button" {...attributes} {...listeners} disabled={disabled}
      aria-label={cardLabel(card)} aria-roledescription="sortable card" data-selected={selected} aria-pressed={selectable ? selected : attributes['aria-pressed']}
      className={`${cardClasses} cursor-grab select-none active:cursor-grabbing ${selected ? 'border-gold ring-2 ring-gold/50' : 'border-[#cbb984]'} ${isOver && !isDragging ? 'outline-2 outline-offset-4 outline-gold' : ''} ${isDragging ? 'opacity-35' : ''}`}
      style={style} onFocus={() => select(card)} onClick={() => choose(card)}>
      {renderCard ? renderCard(card) : <CardFace card={card} />}
    </button>
  </li>;
}

/** Reordering affects only the supplied hand, never another player or the deck. */
export function RummyHand({ cards, onReorder, disabled = false, selectedCards, onToggleCard, renderCard, compact = false }: RummyHandProps) {
  const instructionsId = useId();
  const [selected, setSelected] = useState<Card | null>(cards[0] ?? null);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [notice, setNotice] = useState('');
  const currentCards = useRef(cards);
  const currentReorder = useRef(onReorder);
  const currentDisabled = useRef(disabled);
  const startedWith = useRef<Card[] | null>(null);
  const announcedOrder = useRef<string | null>(null);
  currentCards.current = cards;
  currentReorder.current = onReorder;
  currentDisabled.current = disabled;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(CardKeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior: 'auto' }),
  );
  const selectedCard = selected && cards.includes(selected) ? selected : cards[0] ?? null;
  const selectedIndex = selectedCard ? cards.indexOf(selectedCard) : -1;

  useEffect(() => {
    const initial = startedWith.current;
    if (activeCard && (disabled || !initial || initial.join('|') !== cards.join('|'))) {
      startedWith.current = null;
      setActiveCard(null);
      setNotice('The hand changed. Pick up a card again to reorder it.');
    } else if (!activeCard) {
      // Undo and automatic sorting must not leave an old "moved to" message
      // describing a position that is no longer current.
      if (announcedOrder.current === cards.join('|')) announcedOrder.current = null;
      else setNotice('');
    }
  }, [cards, activeCard, disabled]);

  const announcements: Announcements = {
    onDragStart: ({ active }) => `${cardLabel(String(active.id))} picked up. Position ${currentCards.current.indexOf(String(active.id)) + 1} of ${currentCards.current.length}.`,
    onDragOver: ({ active, over }) => over
      ? `${cardLabel(String(active.id))} over position ${currentCards.current.indexOf(String(over.id)) + 1} of ${currentCards.current.length}.`
      : 'Outside the hand. Return to a card to choose its position.',
    onDragEnd: ({ active, over }) => over
      ? `${cardLabel(String(active.id))} dropped at position ${currentCards.current.indexOf(String(over.id)) + 1}.`
      : 'Reordering canceled. No cards moved.',
    onDragCancel: () => 'Reordering canceled. No cards moved.',
  };

  function begin({ active }: DragStartEvent) {
    const card = String(active.id);
    if (currentDisabled.current || !currentCards.current.includes(card)) return;
    startedWith.current = [...currentCards.current];
    setSelected(card);
    setActiveCard(card);
    setNotice('');
  }

  function finish({ active, over }: DragEndEvent) {
    const initial = startedWith.current;
    startedWith.current = null;
    setActiveCard(null);
    const hand = currentCards.current;
    if (currentDisabled.current || !initial || initial.join('|') !== hand.join('|') || !over) return;
    const from = hand.indexOf(String(active.id));
    const to = hand.indexOf(String(over.id));
    if (from < 0 || to < 0 || from === to) return;
    const reordered = reorderHand(hand, from, to);
    announcedOrder.current = reordered.join('|');
    currentReorder.current(reordered);
    setNotice(`${cardLabel(String(active.id))} moved to position ${to + 1} of ${hand.length}.`);
  }

  function moveSelected(offset: -1 | 1) {
    if (disabled || activeCard || !selectedCard || selectedIndex < 0 || selectedIndex + offset < 0 || selectedIndex + offset >= cards.length) return;
    const reordered = reorderHand(cards, selectedIndex, selectedIndex + offset);
    announcedOrder.current = reordered.join('|');
    onReorder(reordered);
    setNotice(`${cardLabel(selectedCard)} moved to position ${selectedIndex + offset + 1} of ${cards.length}.`);
  }

  return <section aria-label="Hand management" className="clubhouse-hand min-w-0">
    {compact && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-2">Drag, touch & keyboard help</summary><p>Hold a card briefly to drag on touch screens. Scroll the hand sideways to reach every card. Tap a card, then use Play selected card. With a keyboard, Space picks up a card, arrows move it, Space drops it, and Escape cancels.</p></details>}
    <p id={instructionsId} className={compact ? 'sr-only' : 'text-sm text-muted-foreground'}>Drag cards to reorder. On touch screens, hold a card briefly before dragging. With a keyboard, focus a card, press Space, move with Left or Right, then press Space to drop or Escape to cancel.</p>
    <DndContext sensors={sensors} collisionDetection={collisionDetection}
      accessibility={{ announcements, screenReaderInstructions: { draggable: 'To reorder a card, press Space to pick it up. Use Left or Right to move. Press Space to drop it, or Escape to cancel.' } }}
      onDragStart={begin} onDragEnd={finish} onDragCancel={() => { startedWith.current = null; setActiveCard(null); }}>
      <div className="hand-card-rail mt-3 max-w-full overflow-x-auto" aria-describedby={instructionsId}>
        <SortableContext items={cards} strategy={horizontalListSortingStrategy}>
          <ol aria-label="Your hand" className="flex w-max min-w-full gap-2 py-1">
            {cards.map((card, index) => <SortableCard key={card} card={card} index={index} count={cards.length} selected={selectedCards ? selectedCards.includes(card) : selectedCard === card} disabled={disabled} select={setSelected} selectable={Boolean(onToggleCard)} renderCard={renderCard} choose={card => { setSelected(card); onToggleCard?.(card); }} />)}
          </ol>
        </SortableContext>
      </div>
      {createPortal(<DragOverlay dropAnimation={null}>{activeCard && <div aria-hidden="true" className={`${cardClasses} border-gold shadow-xl`}>{renderCard ? renderCard(activeCard) : <CardFace card={activeCard} />}</div>}</DragOverlay>, document.body)}
    </DndContext>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <p className={compact ? 'w-full text-xs text-muted-foreground' : 'mr-auto text-sm text-muted-foreground'}>{selectedCard ? `Selected: ${cardLabel(selectedCard)} · ${selectedIndex + 1} of ${cards.length}` : 'Your hand is empty.'}</p>
      <button type="button" aria-label="Move selected card left" className="btn-ghost-gold text-sm" disabled={disabled || Boolean(activeCard) || selectedIndex <= 0} onClick={() => moveSelected(-1)}>{compact ? '← Move left' : 'Move selected card left'}</button>
      <button type="button" aria-label="Move selected card right" className="btn-ghost-gold text-sm" disabled={disabled || Boolean(activeCard) || selectedIndex < 0 || selectedIndex >= cards.length - 1} onClick={() => moveSelected(1)}>{compact ? 'Move right →' : 'Move selected card right'}</button>
    </div>
    {(!compact || notice) && <p role="status" aria-live="polite" className="mt-2 min-h-6 text-sm text-gold">{notice}</p>}
  </section>;
}
