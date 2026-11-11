import { useCallback, useEffect, useRef, useState } from 'react';
import { FarkleAudio, type FarkleAudioStatus } from '@/lib/farkle-audio';
import { GamePanel } from './GameChrome';
import '@/styles/card-game-music.css';

const KEY = 'clubhouse-card-music-v1';
function saved() {
  try { const value = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { enabled: typeof value.enabled === 'boolean' ? value.enabled : true, volume: typeof value.volume === 'number' && Number.isFinite(value.volume) ? Math.max(0,Math.min(1,value.volume)) : .4 }; }
  catch { return { enabled: true, volume: .4 }; }
}
export function useCardGameMusic() {
  const [settings,setSettings] = useState(saved), current = useRef(settings), engine = useRef<FarkleAudio | null>(null), active = useRef(true);
  const [status,setStatus] = useState<FarkleAudioStatus>('idle'), [open,setOpen] = useState(false);
  const options = (value: typeof settings) => ({ music:value.enabled,musicVolume:value.volume,effects:false,effectsVolume:0,muted:!value.enabled });
  const unlock = useCallback(() => {
    if (!current.current.enabled || current.current.volume===0) return;
    if (!engine.current) { engine.current = new FarkleAudio(options(current.current), value => { if(active.current)setStatus(value); }, 'yacht'); engine.current.setVisible(document.visibilityState!=='hidden'); }
    void engine.current.unlock();
  },[]);
  const update = useCallback((patch: Partial<typeof settings>) => {
    const next = {...current.current,...patch}; current.current=next;setSettings(next);
    try{localStorage.setItem(KEY,JSON.stringify(next));}catch{/* Session controls still work. */}
    engine.current?.setOptions(options(next)); unlock();
  },[unlock]);
  useEffect(()=>{
    active.current=true;
    const visible=()=>engine.current?.setVisible(document.visibilityState!=='hidden');
    const changed=(event:StorageEvent)=>{if(event.key===KEY){const next=saved();current.current=next;setSettings(next);engine.current?.setOptions(options(next));}};
    document.addEventListener('visibilitychange',visible);window.addEventListener('storage',changed);
    return()=>{active.current=false;document.removeEventListener('visibilitychange',visible);window.removeEventListener('storage',changed);engine.current?.dispose();engine.current=null;};
  },[]);
  return {settings,status,open,setOpen,unlock,update};
}
export function CardGameMusicButton({music}:{music:ReturnType<typeof useCardGameMusic>}) {
  return <button aria-label="Yacht rock music settings" title="Yacht rock music" onClick={()=>music.setOpen(true)}>♫ <span className="card-music-label">Music</span></button>;
}
export function CardGameMusicPanel({music}:{music:ReturnType<typeof useCardGameMusic>}) {
  if(!music.open)return null;
  return <GamePanel title="Yacht rock radio" close={()=>music.setOpen(false)}><section className="card-music-panel"><p className="card-music-kicker">GOLDEN HOUR AT THE CLUBHOUSE</p><h3>Smooth sailing. Good cards.</h3><p>An original yacht-rock-style instrumental: warm electric keys, guitar-like plucks, melodic bass, and a relaxed soft-rock backbeat.</p><button className="btn-gold" aria-label="Yacht rock music" aria-pressed={music.settings.enabled} onClick={()=>music.update({enabled:!music.settings.enabled})}>{music.settings.enabled?'Music on · tap to pause':'Music off · tap to play'}</button><label>Music volume <output>{Math.round(music.settings.volume*100)}%</output><input aria-label="Yacht rock volume" type="range" min="0" max="100" value={Math.round(music.settings.volume*100)} onChange={event=>music.update({volume:event.target.valueAsNumber/100})}/></label><p className="card-music-note" role="status">{music.status==='unavailable'?'Music is unavailable in this browser. You can continue playing.':music.status==='blocked'?'Tap the music button to start playback.':'Your music settings apply to Rummy+ and Spades. Game sound effects have their own controls. Music pauses when you switch tabs or leave the game.'}</p></section></GamePanel>;
}
