import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_FARKLE_AUDIO, FARKLE_AUDIO_KEY, FarkleAudio, farkleAudioSupported, parseFarkleAudioSettings, type FarkleAudioSettings, type FarkleAudioStatus } from './farkle-audio';
import { FARKLE_ROLL_MS, type FarkleActivity } from './farkle';
export function useClassicFarkleAudio(scope: string, frame: Pick<FarkleActivity, 'id' | 'seat' | 'kind' | 'rolled' | 'bust' | 'points' | 'hot'> | null, mySeat: number | null, { bustDelay = FARKLE_ROLL_MS, effectsOnly = false } = {}) {
  const key = effectsOnly ? 'clubhouse-crown-chance-sound' : FARKLE_AUDIO_KEY;
  const [settings, setSettings] = useState(() => {
    let saved = { ...DEFAULT_FARKLE_AUDIO };
    try { saved = parseFarkleAudioSettings(JSON.parse(localStorage.getItem(key) ?? 'null')); } catch { /* Use default preferences. */ }
    return effectsOnly ? { ...saved, music: false } : saved;
  });
  const [status, setStatus] = useState<FarkleAudioStatus>(() => farkleAudioSupported() ? 'idle' : 'unavailable');
  const engine = useRef<FarkleAudio | null>(null), preferences = useRef(settings), mounted = useRef(true), played = useRef('');
  const get = useCallback(() => { if (!engine.current) { engine.current = new FarkleAudio(preferences.current, next => { if (mounted.current) setStatus(next); }); engine.current.setVisible(document.visibilityState !== 'hidden'); } return engine.current; }, []);
  const unlock = useCallback(() => { void get().unlock(); }, [get]);
  const update = useCallback((patch: Partial<FarkleAudioSettings>) => { const next = parseFarkleAudioSettings({ ...preferences.current, ...patch, ...(effectsOnly && { music: false }) }); preferences.current = next; setSettings(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Optional preferences. */ } const audio = get(); audio.setOptions(next); void audio.unlock(); }, [get, key, effectsOnly]);
  const testDice = useCallback(() => { const audio = get(); void audio.unlock().then(ok => { if (ok) audio.roll(Array(6).fill(false)); }); }, [get]);
  const keep = useCallback(() => engine.current?.hold(true), []), bank = useCallback((points: number) => engine.current?.score(points), []);
  useEffect(() => { played.current = ''; engine.current?.stopEffects(); }, [scope]);
  useEffect(() => {
    if (!frame) return; const key = `${scope}:${frame.id}`; if (played.current === key) return; played.current = key;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (frame.kind === 'roll') { engine.current?.roll(frame.rolled.map(value => !value)); if (frame.bust) { if (bustDelay) timer = setTimeout(() => engine.current?.farkle(), bustDelay); else engine.current?.farkle(); } }
    else if (frame.hot) engine.current?.fanfare();
    else if (frame.seat !== mySeat && frame.kind === 'keep') engine.current?.hold(true);
    else if (frame.seat !== mySeat && frame.kind === 'bank') engine.current?.score(frame.points);
    return () => { if (timer) clearTimeout(timer); if (frame.kind === 'roll') engine.current?.stopRoll(); };
  }, [scope, frame?.id, mySeat, bustDelay]);
  useEffect(() => { mounted.current = true; const visibility = () => engine.current?.setVisible(document.visibilityState !== 'hidden'); document.addEventListener('visibilitychange', visibility); return () => { mounted.current = false; document.removeEventListener('visibilitychange', visibility); engine.current?.dispose(); engine.current = null; }; }, []);
  return { settings, status, update, unlock, testDice, keep, bank, silent: settings.muted || (!settings.music || settings.musicVolume === 0) && (!settings.effects || settings.effectsVolume === 0) };
}
