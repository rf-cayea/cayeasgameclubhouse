import { useId } from 'react';
import type { useFarkleAudio } from '@/lib/use-farkle-audio';

export function FarkleAudioIcon({ muted }: { muted: boolean }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4Z" />{muted ? <path d="m17 9 5 6m0-6-5 6" /> : <><path d="M17 8a6 6 0 0 1 0 8" /><path d="M20 5a10 10 0 0 1 0 14" /></>}</svg>;
}
export function FarkleSoundControls({ audio, gameName = 'Quintsee' }: { audio: Pick<ReturnType<typeof useFarkleAudio>, 'settings' | 'status' | 'update' | 'unlock' | 'testDice' | 'silent'>; gameName?: string }) {
  const id = useId(), settings = audio.settings, unavailable = audio.status === 'unavailable';
  return <section className="fd-audio-controls" aria-label={`${gameName} audio controls`}>
    <p>An original, relaxed lounge theme for your table, with dice clattering softly as they roll.</p>
    <div className="fd-audio-channel">
      <button className="fd-audio-toggle" disabled={unavailable} aria-label="Background music" aria-pressed={settings.music} onClick={() => audio.update({ music: !settings.music })}><strong>Background music</strong><span>{settings.music ? 'On' : 'Off'}</span></button>
      <div className="fd-audio-volume"><label htmlFor={`${id}-music`}>Music volume</label><output htmlFor={`${id}-music`}>{Math.round(settings.musicVolume * 100)}%</output><input id={`${id}-music`} type="range" min="0" max="100" step="1" value={Math.round(settings.musicVolume * 100)} disabled={unavailable || !settings.music} onChange={event => audio.update({ musicVolume: event.target.valueAsNumber / 100 })} /></div>
    </div>
    <div className="fd-audio-channel">
      <button className="fd-audio-toggle" disabled={unavailable} aria-label="Dice sound effects" aria-pressed={settings.effects} onClick={() => audio.update({ effects: !settings.effects })}><strong>Dice sounds</strong><span>{settings.effects ? 'On' : 'Off'}</span></button>
      <div className="fd-audio-volume"><label htmlFor={`${id}-dice`}>Dice volume</label><output htmlFor={`${id}-dice`}>{Math.round(settings.effectsVolume * 100)}%</output><input id={`${id}-dice`} type="range" min="0" max="100" step="1" value={Math.round(settings.effectsVolume * 100)} disabled={unavailable || !settings.effects} onChange={event => audio.update({ effectsVolume: event.target.valueAsNumber / 100 })} /></div>
    </div>
    <div className="fd-audio-actions"><button className="btn-ghost-gold" disabled={unavailable} onClick={() => audio.update({ muted: !settings.muted })}>{settings.muted ? 'Unmute all' : 'Mute all'}</button><button className="btn-ghost-gold" disabled={unavailable || settings.muted || !settings.effects || settings.effectsVolume === 0} onClick={audio.testDice}>Test dice sound</button>{(audio.status === 'idle' || audio.status === 'blocked') && !audio.silent && <button className="btn-gold" onClick={audio.unlock}>Enable audio</button>}</div>
    <p className="fd-audio-status" role="status">{unavailable ? 'Audio is unavailable in this browser. You can keep playing normally.' : settings.muted ? 'All audio is muted.' : audio.status === 'idle' ? 'Audio starts when you tap Start or Roll. You can also enable it here.' : audio.status === 'blocked' ? 'Tap Enable audio or a game action to start listening.' : `Music pauses when you switch tabs or leave ${gameName}.`}</p>
  </section>;
}
