import { useEffect, useState } from 'react';
import type { ChanceActivity, CrownChanceState } from './crown-chance';

export function useCrownChancePresentation(scope: string, state: CrownChanceState | null | undefined, mySeat?: number) {
  const [playback, setPlayback] = useState<{ scope: string; seen: number; frames: ChanceActivity[] }>({
    scope: '', seen: 0, frames: [],
  });
  const latest = state?.activity?.at(-1)?.id ?? 0;
  useEffect(() => {
    const activity = state?.activity ?? [];
    setPlayback(previous => {
      if (previous.scope !== scope) return { scope, seen: latest, frames: [] };
      const fresh = activity.filter(event => event.id > previous.seen);
      return fresh.length ? { scope, seen: latest, frames: [...previous.frames, ...fresh] } : previous;
    });
  }, [scope, latest]);

  const frame = playback.scope === scope ? playback.frames[0] : undefined;
  useEffect(() => {
    if (!frame) return;
    const opponent = mySeat !== undefined && frame.seat !== mySeat;
    const duration = frame.kind === 'roll' ? frame.lost !== undefined ? opponent ? 2400 : 1400 : opponent ? 2050 : 480
      : frame.kind === 'claim' ? frame.hot ? 1250 : opponent ? 620 : 230 : opponent ? 760 : 300;
    const timer = setTimeout(() => setPlayback(previous => previous.frames[0] === frame
      ? { ...previous, frames: previous.frames.slice(1) } : previous), duration);
    return () => clearTimeout(timer);
  }, [frame, mySeat]);
  return { frame, busy: Boolean(frame || playback.scope === scope && latest > playback.seen) };
}
