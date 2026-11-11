import { useCallback, useEffect, useRef, useState } from 'react';
import { farkleActivityDuration, FARKLE_ROLL_MS, type FarkleActivity } from './farkle';
import type { FarkleRoomView } from './farkle-protocol';

/** Show committed rolls and computer decisions before advancing to the next turn. */
export function useFarklePresentation(room: FarkleRoomView | null) {
  const scope = room ? `${room.code}:${room.mySeat}` : '';
  const seat = useRef(room?.mySeat??0);seat.current=room?.mySeat??0;
  const owner = useRef(''), seen = useRef(0), queue = useRef<FarkleActivity[]>([]), current = useRef<FarkleActivity | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), [frame, setFrame] = useState<FarkleActivity | null>(null), [landed, setLanded] = useState('');
  const skip = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; queue.current = []; current.current = null; setFrame(null); }, []);
  const advance = useCallback(function next() { const event = queue.current.shift() ?? null; current.current = event; setFrame(event); timer.current = event ? setTimeout(next, farkleActivityDuration(event,event.seat!==seat.current)) : null; }, []);
  useEffect(() => {
    const sequence = room?.state?.actionSequence ?? 0;
    if (owner.current !== scope) { skip(); owner.current = scope; seen.current = sequence; return; }
    if (!room?.state || room.status === 'abandoned') { skip(); seen.current = sequence; return; }
    const fresh = room.state.activity.filter(event => event.id > seen.current);
    seen.current = Math.max(seen.current, sequence); queue.current.push(...fresh); if (!current.current) advance();
  }, [scope, room?.state?.actionSequence, room?.status, advance, skip]);
  const visible = owner.current === scope ? frame : null, key = visible ? `${scope}:${visible.id}` : '';
  useEffect(() => { if (!key || visible?.kind !== 'roll') return; const timeout = setTimeout(() => setLanded(key), FARKLE_ROLL_MS); return () => clearTimeout(timeout); }, [key]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const fresh = owner.current === scope && (room?.state?.activity ?? []).some(event => event.id > seen.current);
  return { frame: visible, busy: Boolean(visible || fresh), rolling: Boolean(visible?.kind === 'roll' && landed !== key), bust: Boolean(visible?.kind === 'roll' && visible.bust && landed === key), opponent: Boolean(visible && visible.seat !== room?.mySeat), skip };
}
