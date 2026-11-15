import { useEffect, useState } from 'react';
import type { ChanceActivity, CrownChanceState } from './crown-chance';
import { chanceActivityDuration, CHANCE_ROLL_MS } from './crown-chance-playback';

export function useCrownChancePresentation(scope: string, state: CrownChanceState | null | undefined, mySeat?: number) {
  const [playback, setPlayback] = useState<{ scope: string; seen: number; frames: ChanceActivity[] }>({
    scope: '', seen: 0, frames: [],
  });
  const [landed, setLanded] = useState('');
  const latest = state?.activity?.at(-1)?.id ?? 0;
  useEffect(() => {
    const activity = state?.activity ?? [];
    setPlayback(previous => {
      if (previous.scope !== scope) return { scope, seen: latest, frames: [] };
      const fresh = activity.filter(event => event.id > previous.seen);
      return fresh.length ? { scope, seen: latest, frames: [...previous.frames, ...fresh] } : previous;
    });
  }, [scope, latest]);

  // Include newly arrived moves during this render, before the effect queues
  // them, so the completed server score never flashes ahead of the replay.
  const frame = playback.scope === scope ? playback.frames[0]
    ?? state?.activity?.find(event => event.id > playback.seen) : undefined;
  const rollKey = frame?.kind === 'roll' ? `${scope}:${frame.id}` : '';
  useEffect(() => {
    if (!rollKey) return;
    const timer = setTimeout(() => setLanded(rollKey), CHANCE_ROLL_MS);
    return () => clearTimeout(timer);
  }, [rollKey]);
  useEffect(() => {
    if (!frame) return;
    const opponent = mySeat !== undefined && frame.seat !== mySeat;
    const duration = chanceActivityDuration(frame, opponent);
    const timer = setTimeout(() => setPlayback(previous => previous.frames[0] === frame
      ? { ...previous, frames: previous.frames.slice(1) } : previous), duration);
    return () => clearTimeout(timer);
  }, [frame, mySeat]);
  return { frame, rolling: Boolean(rollKey && landed !== rollKey), busy: Boolean(frame || playback.scope === scope && latest > playback.seen) };
}
