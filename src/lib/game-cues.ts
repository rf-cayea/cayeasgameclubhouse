import { useEffect, useRef, useSyncExternalStore } from 'react';

const sounds = {
  card: [260, 185], tile: [660, 350], checker: [340, 215], dice: [230, 370, 285, 180],
  gem: [523, 784], match: [440, 660, 880], win: [523, 659, 784, 1047], miss: [320, 220],
} as const;
export type GameCue = keyof typeof sounds;
const preference = 'clubhouse-table-effects';
let context: AudioContext | undefined;
const listeners = new Set<() => void>();

function enabled() {
  try { return localStorage.getItem(preference) !== 'off'; } catch { return true; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => { listeners.delete(listener); window.removeEventListener('storage', listener); };
}

function unlock() {
  if (!enabled() || document.hidden || typeof AudioContext === 'undefined') return;
  try {
    context ??= new AudioContext();
    if (context.state !== 'running') void context.resume().catch(() => {});
  } catch { /* Playing the game does not require audio. */ }
}

export function playGameCue(cue: GameCue) {
  if (!enabled() || document.hidden || context?.state !== 'running') return;
  const audio = context;
  const bright = cue === 'gem' || cue === 'match' || cue === 'win';
  sounds[cue].forEach((frequency, index) => {
    const start = audio.currentTime + index * (bright ? .065 : .027);
    const oscillator = audio.createOscillator(), volume = audio.createGain();
    oscillator.type = bright ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, start);
    if (!bright) oscillator.frequency.exponentialRampToValueAtTime(frequency * .55, start + .04);
    volume.gain.setValueAtTime(.001, start);
    volume.gain.exponentialRampToValueAtTime(bright ? .085 : .12, start + .008);
    volume.gain.exponentialRampToValueAtTime(.001, start + (bright ? .22 : .07));
    oscillator.connect(volume).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + .23);
    oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
  });
}

export function useGameCue(scope: string | undefined, event: string | number | undefined, cue?: GameCue) {
  const previous = useRef<{ scope?: string; event?: string | number }>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = { scope, event };
    if (before && scope === before.scope && event !== undefined && event !== before.event && cue) playGameCue(cue);
  }, [scope, event, cue]);
}

export function useGameEffects() {
  const active = useSyncExternalStore(subscribe, enabled, () => true);
  useEffect(() => {
    if (!active) return;
    document.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('keydown', unlock, { capture: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true });
      document.removeEventListener('keydown', unlock, { capture: true });
    };
  }, [active]);
  return { active, toggle: () => {
    try { localStorage.setItem(preference, active ? 'off' : 'on'); } catch { return; }
    listeners.forEach(listener => listener());
    if (!active) unlock();
  } };
}
