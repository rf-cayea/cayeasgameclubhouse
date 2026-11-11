import { memo, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { GemCell } from '@/lib/gems-engine';
import { gemFallSegment, type GemsPlaybackFrame } from '@/lib/gems-presentation';
import { GemArtwork } from './GemsArtwork';

const PieceArtwork = memo(GemArtwork, (before, after) => before.gem?.id === after.gem?.id && before.gem?.color === after.gem?.color && before.gem?.special === after.gem?.special);

export function GemsPieces({ board, frame, selected, hint }: { board: GemCell[]; frame: GemsPlaybackFrame | null; selected: number | null; hint: number[] }) {
  const geometry = useRef<{ step: string | undefined; width: number; height: number; gap: number } | null>(null);
  const measure = (layer: HTMLElement) => {
    if (!geometry.current || geometry.current.step !== frame?.stepId) {
      const rect = layer.getBoundingClientRect(), gap = parseFloat(getComputedStyle(layer).getPropertyValue('--gem-gap')) || 0;
      geometry.current = { step: frame?.stepId, width: rect.width, height: rect.height, gap };
    }
    return geometry.current;
  };
  return <div className="gems-pieces" aria-hidden="true">{board.flatMap((cell, index) => cell.gem ? [
    <GemPiece key={cell.gem.id} cell={cell} index={index} board={board} frame={frame} selected={selected === index} hinted={hint.includes(index)} measure={measure}/>,
  ] : [])}</div>;
}

function GemPiece({ cell, index, board, frame, selected, hinted, measure }: { cell: GemCell; index: number; board: GemCell[]; frame: GemsPlaybackFrame | null; selected: boolean; hinted: boolean; measure: (layer: HTMLElement) => { width: number; height: number; gap: number } }) {
  const piece = useRef<HTMLDivElement>(null), previous = useRef(index), first = useRef(true);
  const segment = frame?.phase === 'fall' ? gemFallSegment(board, index) : { top: 0, bottom: 7 };
  const span = segment.bottom - segment.top + 1;
  useLayoutEffect(() => {
    const node = piece.current, wasFirst = first.current, oldIndex = previous.current;
    first.current = false; previous.current = index;
    if (!node || !frame || frame.reduced || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !['swap', 'fall', 'shuffle'].includes(frame.phase)) return;
    if (oldIndex === index && (!wasFirst || frame.phase !== 'fall')) return;
    const layer = node.closest('.gems-pieces') as HTMLElement | null;
    if (!layer || typeof node.animate !== 'function') return;
    const rect = measure(layer), gap = rect.gap, dx = (oldIndex % 8 - index % 8) * (rect.width + gap) / 8;
    let dy = (Math.floor(oldIndex / 8) - Math.floor(index / 8)) * (rect.height + gap) / 8;
    if (wasFirst && frame.phase === 'fall') {
      const priorIds = new Set(frame.from?.flatMap(cell => cell.gem ? [cell.gem.id] : []) ?? []);
      if (priorIds.has(cell.gem!.id)) return;
      const fresh = board.filter((other, i) => i % 8 === index % 8 && Math.floor(i / 8) >= segment.top && Math.floor(i / 8) <= segment.bottom && other.gem && !priorIds.has(other.gem.id)).length;
      dy = -fresh * (rect.height + gap) / 8;
    }
    if (!dx && !dy) return;
    const animation = node.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], {
      duration: frame.durationMs, easing: frame.phase === 'swap' ? 'cubic-bezier(.3,.05,.3,1)' : 'cubic-bezier(.18,.68,.32,1)',
    });
    return () => animation.cancel();
  }, [index, frame?.stepId]);
  return <div className="gems-gem-window" data-falling={frame?.phase === 'fall'} style={{ '--gem-col': index % 8, '--gem-top': segment.top, '--gem-span': span } as CSSProperties}>
    <div ref={piece} className="gems-moving-gem" data-gem-id={cell.gem!.id} data-cell-index={index} data-removing={frame?.removed.includes(index) ?? false} data-selected={selected} data-hint={hinted} style={{ '--gem-row': Math.floor(index / 8) - segment.top } as CSSProperties}>
      <span className="gems-gem-inner"><PieceArtwork gem={cell.gem}/></span>
      {cell.chain && <span className="gems-chain"/>}{cell.frost > 0 && <span className="gems-layer-dots">{'•'.repeat(cell.frost)}</span>}
    </div>
  </div>;
}
