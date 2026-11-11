import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_FARKLE_AUDIO, FARKLE_AUDIO_KEY, FarkleAudio, farkleAudioSupported, parseFarkleAudioSettings, type FarkleAudioSettings, type FarkleAudioStatus } from './farkle-audio';
import type { CrownCourtRoomView } from './crown-court-protocol';
import type { CrownCourtActivity } from './crown-court';

export function useCrownCourtAudio(room: CrownCourtRoomView | null, frame: CrownCourtActivity | null) {
  const [settings, setSettings] = useState<FarkleAudioSettings>(() => {
    try { return parseFarkleAudioSettings(JSON.parse(localStorage.getItem(FARKLE_AUDIO_KEY) ?? 'null')); } catch { return { ...DEFAULT_FARKLE_AUDIO }; }
  });
  const settingsRef = useRef(settings), engine = useRef<FarkleAudio | null>(null), mounted = useRef(true);
  const [status, setStatus] = useState<FarkleAudioStatus>(() => farkleAudioSupported() ? 'idle' : 'unavailable');
  const scope = room ? `${room.code}:${room.mySeat}` : '', seen = useRef({ scope: '', id: 0 }), played = useRef('');
  const getEngine = useCallback(() => {
    if (!engine.current) {
      engine.current = new FarkleAudio(settingsRef.current, next => { if (mounted.current) setStatus(next); });
      engine.current.setVisible(document.visibilityState !== 'hidden');
    }
    return engine.current;
  }, []);
  const unlock = useCallback(() => { void getEngine().unlock(); }, [getEngine]);
  const update = useCallback((patch: Partial<FarkleAudioSettings>) => {
    const next = parseFarkleAudioSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next; setSettings(next);
    try { localStorage.setItem(FARKLE_AUDIO_KEY, JSON.stringify(next)); } catch { /* Audio controls work without storage. */ }
    const audio = getEngine(); audio.setOptions(next); void audio.unlock();
  }, [getEngine]);
  const testDice = useCallback(() => { const audio = getEngine(); void audio.unlock().then(ready => { if (ready) audio.roll([false, false, false, false, false]); }); }, [getEngine]);
  const quintsee = useCallback(() => { engine.current?.quintsee(); }, []);
  useEffect(() => {
    mounted.current = true;
    const visibility = () => engine.current?.setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', visibility);
    return () => { mounted.current = false; document.removeEventListener('visibilitychange', visibility); engine.current?.dispose(); engine.current = null; };
  }, []);
  useEffect(() => {
    const sequence = room?.state?.actionSequence ?? 0;
    if (seen.current.scope !== scope) { seen.current = { scope, id: sequence }; engine.current?.stopEffects(); return; }
    const fresh = (room?.state?.activity ?? []).filter(event => event.id > seen.current.id && event.seat === room?.mySeat && event.kind !== 'roll');
    seen.current.id = sequence;
    for (const event of fresh) {
      if (event.kind === 'hold') engine.current?.hold(event.held.some(Boolean));
      else if (event.kind === 'score') engine.current?.score(event.score ?? 0);
    }
  }, [scope, room?.state?.actionSequence]);
  useEffect(() => {
    if (!frame) return;
    const key = `${scope}:${frame.id}`;
    if (played.current === key) return;
    played.current = key;
    if (frame.kind === 'roll') engine.current?.roll(frame.held);
    else if (frame.seat !== room?.mySeat && frame.kind === 'hold') engine.current?.hold(frame.held.some(Boolean));
    else if (frame.seat !== room?.mySeat && frame.kind === 'score') engine.current?.score(frame.score ?? 0);
    return () => { if (frame.kind === 'roll') engine.current?.stopRoll(); };
  }, [scope, frame?.id]);
  return { settings, status, update, unlock, testDice, quintsee, silent: settings.muted || (!settings.music || settings.musicVolume === 0) && (!settings.effects || settings.effectsVolume === 0) };
}
