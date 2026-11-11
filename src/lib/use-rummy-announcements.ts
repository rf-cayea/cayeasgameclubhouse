import { useCallback, useEffect, useRef, useState } from 'react';
import { FarkleAudio } from './farkle-audio';
import { rummyAnnouncement } from './rummy-announcements';
import type { RoomView } from './rummy-protocol';

export function useRummySound() {
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem('clubhouse-rummy-sound-v1') !== 'off'; } catch { return true; } });
  const preference = useRef(enabled), engine = useRef<FarkleAudio | null>(null), timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const options = (on: boolean) => ({ music: false, effects: on, musicVolume: 0, effectsVolume: .7, muted: !on });
  const clear = useCallback(() => { for (const timer of timers.current) clearTimeout(timer); timers.current.clear(); engine.current?.stopEffects(); }, []);
  const unlock = useCallback(() => {
    if (!preference.current) return;
    if (!engine.current) { engine.current = new FarkleAudio(options(true)); engine.current.setVisible(document.visibilityState !== 'hidden'); }
    void engine.current.unlock();
  }, []);
  const toggle = useCallback(() => {
    const next = !preference.current; preference.current = next; setEnabled(next);
    try { localStorage.setItem('clubhouse-rummy-sound-v1', next ? 'on' : 'off'); } catch { /* Session controls remain available. */ }
    engine.current?.setOptions(options(next));
    if (next) unlock(); else clear();
  }, [clear, unlock]);
  const play = useCallback((kind: 'knock' | 'gin' | 'out') => {
    if (!preference.current || document.visibilityState === 'hidden') return;
    if (kind !== 'knock') { engine.current?.fanfare(); return; }
    engine.current?.hold(false);
    const timer = setTimeout(() => { timers.current.delete(timer); engine.current?.hold(false); }, 165);
    timers.current.add(timer);
  }, []);
  useEffect(() => {
    const visibility = () => { if (document.visibilityState === 'hidden') clear(); engine.current?.setVisible(document.visibilityState !== 'hidden'); };
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); clear(); engine.current?.dispose(); engine.current = null; };
  }, [clear]);
  return { enabled, unlock, toggle, play };
}

export function useRummyAnnouncement(room: RoomView, sound: ReturnType<typeof useRummySound>) {
  const call = rummyAnnouncement(room), seen = useRef(call?.key ?? '');
  const [shown, setShown] = useState<ReturnType<typeof rummyAnnouncement>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; setShown(null); }, []);
  const fresh = Boolean(call && call.key !== seen.current);
  useEffect(() => {
    if (!call) { dismiss(); return; }
    if (call.key === seen.current) return;
    seen.current = call.key; setShown(call); sound.play(call.kind);
    timer.current = setTimeout(() => { timer.current = null; setShown(null); }, 3000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [call?.key, dismiss, sound.play]);
  return { call: shown ?? (fresh ? call : null), busy: Boolean(shown || fresh), dismiss };
}
