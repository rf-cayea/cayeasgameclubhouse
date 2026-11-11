import { useCallback, useEffect, useRef, useState } from 'react';
import type { CrownCourtActivity } from './crown-court';
import type { CrownCourtRoomView } from './crown-court-protocol';
import { crownCourtActivityDuration, crownCourtActivityFrames } from './crown-court-activity';

/** Display committed moves at a readable pace. Never writes to or predicts the game state. */
export function useCrownCourtPresentation(room: CrownCourtRoomView | null) {
  const scope = room ? `${room.code}:${room.mySeat}` : '';
  const owner = useRef(''), seen = useRef(0), queue = useRef<CrownCourtActivity[]>([]);
  const current = useRef<CrownCourtActivity | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [frame, setFrame] = useState<CrownCourtActivity | null>(null);
  const skip = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; queue.current = []; current.current = null; setFrame(null);
  }, []);
  const advance = useCallback(function next() {
    const event = queue.current.shift() ?? null;
    current.current = event; setFrame(event);
    timer.current = event ? setTimeout(next, crownCourtActivityDuration(event)) : null;
  }, []);
  useEffect(() => {
    const state = room?.state, sequence = state?.actionSequence ?? state?.activity?.at(-1)?.id ?? 0;
    if (owner.current !== scope) {
      skip(); owner.current = scope; seen.current = sequence;
      return; // A resumed table opens at its latest state, without replaying old turns.
    }
    if (room?.status === 'abandoned' || !state) { skip(); seen.current = sequence; return; }
    const fresh = (state.activity ?? []).filter(event => event.id > seen.current);
    seen.current = Math.max(seen.current, sequence);
    const frames = crownCourtActivityFrames(fresh).filter(event => event.seat !== room.mySeat || event.kind === 'roll');
    queue.current.push(...frames);
    if (!current.current) advance();
  }, [scope, room?.state?.actionSequence, room?.status, advance, skip]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const fresh = owner.current === scope ? (room?.state?.activity ?? []).filter(event => event.id > seen.current && (event.seat !== room?.mySeat || event.kind === 'roll')) : [];
  const visible = owner.current === scope ? frame : null;
  return { frame: visible, busy: Boolean(visible || fresh.length), skip, opponent: Boolean(visible && visible.seat !== room?.mySeat) };
}
