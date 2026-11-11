import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_FARKLE_AUDIO, FARKLE_AUDIO_KEY, FarkleAudio, farkleAudioSupported, parseFarkleAudioSettings, type FarkleAudioSettings, type FarkleAudioStatus } from './farkle-audio';
import { FARKLE_ROLL_MS, type FarkleActivity } from './farkle';
export function useClassicFarkleAudio(scope: string, frame: FarkleActivity | null, mySeat: number) {
  const [settings, setSettings] = useState(() => { try { return parseFarkleAudioSettings(JSON.parse(localStorage.getItem(FARKLE_AUDIO_KEY) ?? 'null')); } catch { return { ...DEFAULT_FARKLE_AUDIO }; } });
  const [status, setStatus] = useState<FarkleAudioStatus>(() => farkleAudioSupported() ? 'idle' : 'unavailable');
  const engine = useRef<FarkleAudio | null>(null), preferences = useRef(settings), mounted = useRef(true), played = useRef('');
  const get = useCallback(() => { if (!engine.current) { engine.current = new FarkleAudio(preferences.current, next => { if (mounted.current) setStatus(next); }); engine.current.setVisible(document.visibilityState !== 'hidden'); } return engine.current; }, []);
  const unlock = useCallback(() => { void get().unlock(); }, [get]);
  const update = useCallback((patch: Partial<FarkleAudioSettings>) => { const next = parseFarkleAudioSettings({ ...preferences.current, ...patch }); preferences.current = next; setSettings(next); try { localStorage.setItem(FARKLE_AUDIO_KEY, JSON.stringify(next)); } catch { /* Optional preferences. */ } const audio = get(); audio.setOptions(next); void audio.unlock(); }, [get]);
  const testDice = useCallback(() => { const audio = get(); void audio.unlock().then(ok => { if (ok) audio.roll(Array(6).fill(false)); }); }, [get]);
  const keep = useCallback(() => engine.current?.hold(true), []), bank = useCallback((points: number) => engine.current?.score(points), []);
  useEffect(() => { engine.current?.stopEffects(); }, [scope]);
  useEffect(() => {
    if (!frame) return; const key = `${scope}:${frame.id}`; if (played.current === key) return; played.current = key;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (frame.kind === 'roll') { engine.current?.roll(frame.rolled.map(value => !value)); if (frame.bust) timer = setTimeout(() => engine.current?.farkle(), FARKLE_ROLL_MS); }
    else if (frame.seat !== mySeat && frame.kind === 'keep') engine.current?.hold(true);
    else if (frame.seat !== mySeat && frame.kind === 'bank') engine.current?.score(frame.points);
    return () => { if (timer) clearTimeout(timer); if (frame.kind === 'roll') engine.current?.stopRoll(); };
  }, [scope, frame?.id, mySeat]);
  useEffect(() => { mounted.current = true; const visibility = () => engine.current?.setVisible(document.visibilityState !== 'hidden'); document.addEventListener('visibilitychange', visibility); return () => { mounted.current = false; document.removeEventListener('visibilitychange', visibility); engine.current?.dispose(); engine.current = null; }; }, []);
  return { settings, status, update, unlock, testDice, keep, bank, silent: settings.muted || (!settings.music || settings.musicVolume === 0) && (!settings.effects || settings.effectsVolume === 0) };
}
