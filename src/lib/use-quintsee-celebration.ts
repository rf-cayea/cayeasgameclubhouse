import { useEffect, useRef, useState } from 'react';
import type { FiveDiceActivity } from './five-dice';
import { FIVE_DICE_ROLL_MS, isQuintseeRoll } from './five-dice-activity';

/** Follow visible committed playback, including bots and online opponents. */
export function useQuintseeCelebration(scope: string, frame: FiveDiceActivity | null, play: () => void) {
  const key = scope && isQuintseeRoll(frame) ? `${scope}:${frame!.id}` : '';
  const [active, setActive] = useState('');
  const played = useRef('');
  useEffect(() => {
    if (!key || played.current === key) return;
    const timer = setTimeout(() => {
      // Skipped/resumed turns are not replayed, and background tabs stay quiet.
      if (document.visibilityState === 'hidden') return;
      played.current = key;
      setActive(key);
      play();
    }, FIVE_DICE_ROLL_MS);
    return () => clearTimeout(timer);
  }, [key, play]);
  return Boolean(key && active === key);
}
